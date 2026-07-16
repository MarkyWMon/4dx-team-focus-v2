import React, { useMemo, useState } from 'react';
import { AppView, Commitment, SurveyResult, TeamMember, WIGConfig, WIGSession, CommitmentStatus } from '../types';
import { getWeekId, getPreviousWeekId, getWigDayOfWeek, formatDateShort, WIN_THRESHOLD } from '../utils';
import { Nudge } from '../services/obligations';
import ProofModal from './ProofModal';

interface HomeProps {
  currentUser: TeamMember;
  members: TeamMember[];
  commitments: Commitment[];
  surveys: SurveyResult[];
  surveyStartDate: number | null;
  wigConfig: WIGConfig | null;
  sessions: WIGSession[];
  nudges: Nudge[];
  onNavigate: (view: AppView) => void;
  onComposerSubmit: (text: string) => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SCORE_BADGES = [
  { threshold: 50, title: 'First Step' },
  { threshold: 1000, title: 'Strategy Master' },
];

const NUDGE_STYLES: Record<string, string> = {
  urgent: 'bg-red-50 border-red-200 text-red-800',
  warn: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-sky-50 border-sky-200 text-sky-800',
};

const Home: React.FC<HomeProps> = ({
  currentUser,
  members,
  commitments,
  surveys,
  surveyStartDate,
  wigConfig,
  sessions,
  nudges,
  onNavigate,
  onComposerSubmit,
}) => {
  const [composerText, setComposerText] = useState('');
  const [proofTarget, setProofTarget] = useState<{ commitment: Commitment; preset?: CommitmentStatus } | null>(null);

  const currentWeekId = getWeekId();
  const leadMeasures = wigConfig?.leadMeasures || [];
  const wigDayName = DAY_NAMES[getWigDayOfWeek()] || 'Monday';
  const weekCommitments = useMemo(() => commitments.filter(c => c.weekId === currentWeekId), [commitments, currentWeekId]);
  const myWeek = useMemo(() => weekCommitments.filter(c => c.memberId === currentUser.id), [weekCommitments, currentUser.id]);
  const myDone = myWeek.filter(c => c.status === 'completed').length;
  const isFull = myWeek.length >= 3;

  // WIG lag score — same derivation as the old dashboard (survey averages → %).
  const currentScore = useMemo(() => {
    const filtered = surveyStartDate ? surveys.filter(s => s.date >= surveyStartDate) : surveys;
    if (filtered.length === 0) return wigConfig?.currentValue || 70;
    return Math.round((filtered.reduce((sum, s) => sum + s.average, 0) / filtered.length) * 10);
  }, [surveys, surveyStartDate, wigConfig]);
  const target = wigConfig?.targetValue || 80;
  const isWinning = currentScore >= target;

  const lastWeekScore = useMemo(() => {
    const prevWeekId = getPreviousWeekId(currentWeekId);
    const prev = surveys.filter(s => s.weekId === prevWeekId);
    if (prev.length === 0) return null;
    return Math.round((prev.reduce((sum, s) => sum + s.average, 0) / prev.length) * 10);
  }, [surveys, currentWeekId]);

  // Personal 5-week form, oldest → newest, current week last as "live".
  const myForm = useMemo(() => {
    const cells: Array<'win' | 'loss' | 'empty' | 'live'> = [];
    let weekId = currentWeekId;
    for (let i = 0; i < 5; i++) {
      const week = commitments.filter(c => c.memberId === currentUser.id && c.weekId === weekId);
      if (i === 0) cells.push('live');
      else if (week.length === 0) cells.push('empty');
      else cells.push(week.filter(c => c.status === 'completed').length / week.length >= WIN_THRESHOLD ? 'win' : 'loss');
      weekId = getPreviousWeekId(weekId);
    }
    return cells.reverse();
  }, [commitments, currentUser.id, currentWeekId]);

  const nextBadge = SCORE_BADGES.find(b => (currentUser.score || 0) < b.threshold);

  // Team momentum, 6 weeks oldest → newest.
  const momentum = useMemo(() => {
    const weeks: Array<{ weekId: string; state: 'win' | 'miss' | 'live' | 'empty' }> = [];
    let weekId = currentWeekId;
    for (let i = 0; i < 6; i++) {
      const week = commitments.filter(c => c.weekId === weekId);
      const completed = week.filter(c => c.status === 'completed').length;
      let state: 'win' | 'miss' | 'live' | 'empty' = 'empty';
      if (week.length === 0) state = 'empty';
      else if (i === 0) state = 'live';
      else state = completed / week.length >= WIN_THRESHOLD ? 'win' : 'miss';
      weeks.push({ weekId, state });
      weekId = getPreviousWeekId(weekId);
    }
    return weeks.reverse();
  }, [commitments, currentWeekId]);

  // Weekly leaderboard by completion rate (resets each week).
  const leaderboard = useMemo(() => {
    return members
      .filter(m => m && m.name)
      .map(m => {
        const mine = weekCommitments.filter(c => c.memberId === m.id);
        const completed = mine.filter(c => c.status === 'completed').length;
        return { member: m, total: mine.length, completed, rate: mine.length > 0 ? completed / mine.length : 0 };
      })
      .filter(r => r.total > 0)
      .sort((a, b) => b.rate - a.rate || b.completed - a.completed)
      .slice(0, 8);
  }, [members, weekCommitments]);

  // WIG session discipline.
  const wigDiscipline = useMemo(() => {
    const completed = sessions
      .filter(s => s.status === 'completed')
      .sort((a, b) => (b.completedAt || b.scheduledDate) - (a.completedAt || a.scheduledDate));
    const last = completed[0] || null;
    const doneThisWeek = completed.some(s => s.weekId === currentWeekId);
    const completedWeekIds = new Set(completed.map(s => s.weekId));
    let streak = 0;
    let weekId = doneThisWeek ? currentWeekId : getPreviousWeekId(currentWeekId);
    while (completedWeekIds.has(weekId) && streak < 260) {
      streak++;
      weekId = getPreviousWeekId(weekId);
    }
    return { last, total: completed.length, doneThisWeek, streak };
  }, [sessions, currentWeekId]);

  const topNudge = nudges[0];

  const handleComposer = (e: React.FormEvent) => {
    e.preventDefault();
    const text = composerText.trim();
    if (!text || isFull) return;
    setComposerText('');
    onComposerSubmit(text);
  };

  const numActive = members.filter(m => m.id).length;

  const formStyles: Record<string, string> = {
    win: 'bg-brand-green text-white',
    loss: 'bg-brand-red text-white',
    live: 'bg-slate-200 text-slate-500',
    empty: 'bg-slate-100 text-slate-300',
    miss: 'bg-brand-red text-white',
  };
  const formMarks: Record<string, string> = { win: '✓', loss: '✗', miss: '✗', live: '·', empty: '—' };

  return (
    <div className="max-w-4xl mx-auto space-y-3 pb-24 md:pb-12">

      {proofTarget && (
        <ProofModal
          commitment={proofTarget.commitment}
          presetStatus={proofTarget.preset}
          leadMeasures={leadMeasures}
          currentUser={currentUser}
          onClose={() => setProofTarget(null)}
        />
      )}

      {/* Nudge banner */}
      {topNudge && (
        <div className={`flex items-center gap-3 border rounded-xl px-4 py-2.5 text-sm font-medium ${NUDGE_STYLES[topNudge.severity]}`}>
          <span aria-hidden>⚠</span>
          <span className="flex-grow">{topNudge.message}</span>
          <button
            onClick={() => onNavigate(topNudge.view)}
            className="shrink-0 text-xs font-semibold bg-white/70 hover:bg-white border border-current/20 rounded-lg px-3 py-1 transition-colors"
          >
            {topNudge.actionLabel}
          </button>
        </div>
      )}

      {/* My Week */}
      <section className="ui-card">
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-900">My week</h2>
          <span className="text-xs text-slate-500 ml-auto ui-metric">
            {myWeek.length === 0
              ? 'No commitments yet'
              : `${myDone} of ${myWeek.length} done${myWeek.length > 0 && myDone / myWeek.length >= WIN_THRESHOLD ? ' · winning week' : ''}`}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {myWeek.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2">
              <button
                onClick={() => setProofTarget({ commitment: c, preset: c.status === 'incomplete' ? 'completed' : c.status })}
                className={`w-5 h-5 rounded-md border flex items-center justify-center text-[10px] shrink-0 transition-all ${c.status === 'completed'
                  ? 'bg-brand-green border-brand-green text-white'
                  : c.status === 'partial'
                    ? 'bg-brand-orange border-brand-orange text-white'
                    : 'bg-white border-slate-300 hover:border-brand-navy'}`}
                aria-label="Update status"
              >
                {c.status === 'completed' ? '✓' : c.status === 'partial' ? '◐' : ''}
              </button>
              <span className={`text-sm flex-grow ${c.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                {c.description}
              </span>
              {c.leadMeasureName && (
                <span className="ui-chip bg-slate-100 text-slate-500 hidden sm:inline-flex">{c.leadMeasureName}</span>
              )}
              {c.status !== 'completed' && (
                <span className="ui-chip bg-amber-50 text-amber-700">Due {wigDayName.slice(0, 3)}</span>
              )}
            </div>
          ))}
        </div>

        {!isFull ? (
          <form onSubmit={handleComposer} className="flex gap-2 mt-2">
            <input
              value={composerText}
              onChange={e => setComposerText(e.target.value)}
              placeholder="Add a commitment for this week…"
              className="flex-grow border border-dashed border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!composerText.trim()}
              className="bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
            >
              + Add
            </button>
          </form>
        ) : (
          <p className="text-xs text-slate-400 mt-2">Week is fully committed (3 of 3) — finish these before adding more.</p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">Form
            <span className="flex gap-1">
              {myForm.map((f, i) => (
                <span key={i} className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold ${formStyles[f]}`}>{formMarks[f]}</span>
              ))}
            </span>
          </span>
          <span>Streak <b className="text-slate-800 ui-metric">🔥 {currentUser.streak || 0}</b></span>
          <span>Points <b className="text-slate-800 ui-metric">{(currentUser.score || 0).toLocaleString()}</b></span>
          {nextBadge && (
            <span>Next badge in <b className="text-slate-800 ui-metric">{(nextBadge.threshold - (currentUser.score || 0)).toLocaleString()} pts</b></span>
          )}
        </div>
      </section>

      {/* Win / lose banner */}
      <section
        className={`rounded-xl px-4 py-3 flex items-center gap-4 text-white ${isWinning
          ? 'bg-gradient-to-r from-emerald-900 to-emerald-700'
          : 'bg-gradient-to-r from-rose-900 to-rose-700'}`}
      >
        <div className="flex-grow">
          <div className="text-sm font-extrabold tracking-wide">
            {isWinning ? '▲ WE ARE WINNING' : '▼ WE ARE BEHIND'}
          </div>
          <div className="text-[11px] opacity-80">Customer satisfaction vs {target}% WIG target</div>
        </div>
        <div className="text-right ui-metric">
          <div className="text-2xl font-extrabold leading-none">{currentScore}%</div>
          <div className="text-[11px] opacity-80">
            target {target}%{lastWeekScore !== null ? ` · last wk ${lastWeekScore}%` : ''}
          </div>
        </div>
      </section>

      {/* Lead measure strip */}
      {leadMeasures.length > 0 && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {leadMeasures.map(measure => {
            const teamTarget = numActive * measure.target;
            const actual = weekCommitments.filter(c =>
              c.status === 'completed' && (
                c.leadMeasureId === measure.id ||
                c.leadMeasureId === measure.name ||
                c.leadMeasureName === measure.name
              )
            ).length;
            const met = actual >= teamTarget;
            const pct = Math.min(100, (actual / (teamTarget || 1)) * 100);
            return (
              <div key={measure.id} className="ui-card !p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{measure.name}</div>
                <div className="ui-metric text-lg font-extrabold text-slate-900 my-0.5">
                  {actual} <span className="text-xs font-medium text-slate-400">/ {teamTarget}</span>
                </div>
                <div className="ui-bar"><i style={{ width: `${pct}%`, backgroundColor: met ? 'var(--success-color)' : pct >= 50 ? 'var(--warning-color)' : 'var(--primary-color)' }} /></div>
                <div className={`text-[10px] font-semibold mt-1.5 ${met ? 'text-emerald-600' : 'text-amber-700'}`}>
                  {met ? 'Target met ✓' : `${teamTarget - actual} needed by ${wigDayName.slice(0, 3)}`}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* WIG session discipline */}
      <section className="ui-card !py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span aria-hidden>📋</span>
        {wigDiscipline.last ? (
          <>
            <span>Last WIG session <b className="text-slate-800">{formatDateShort(wigDiscipline.last.completedAt || wigDiscipline.last.scheduledDate)}</b>
              {wigDiscipline.last.runBy ? <> · run by <b className="text-slate-800">{wigDiscipline.last.runBy}</b></> : null}
            </span>
            <span className="ui-chip bg-slate-100 text-slate-600 ui-metric">{wigDiscipline.total} session{wigDiscipline.total === 1 ? '' : 's'} · {wigDiscipline.streak}-week run streak</span>
          </>
        ) : (
          <span>No WIG sessions recorded yet.</span>
        )}
        <button
          onClick={() => onNavigate(AppView.WIG_SESSION)}
          className={`ml-auto ui-chip border transition-colors ${wigDiscipline.doneThisWeek
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'}`}
        >
          {wigDiscipline.doneThisWeek ? 'This week: done ✓' : 'This week: not yet run'}
        </button>
      </section>

      {/* Team momentum */}
      <section className="ui-card">
        <div className="flex items-baseline mb-2">
          <h2 className="text-sm font-semibold text-slate-900">Team momentum</h2>
          <span className="text-[10px] text-slate-400 ml-auto">win = ≥{WIN_THRESHOLD * 100}% completed</span>
        </div>
        <div className="flex gap-2">
          {momentum.map((w, idx) => (
            <div key={w.weekId} className="flex flex-col items-center flex-1 gap-1">
              <div className={`w-full h-7 rounded-md flex items-center justify-center text-xs font-bold ${formStyles[w.state] || formStyles.empty}`}>
                {formMarks[w.state] || '—'}
              </div>
              <span className="text-[9px] font-medium text-slate-400 ui-metric">
                {idx === momentum.length - 1 ? 'Now' : `W${w.weekId.split('-W')[1]}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly leaderboard */}
      <section className="ui-card">
        <div className="flex items-baseline mb-1">
          <h2 className="text-sm font-semibold text-slate-900">This week's leaderboard</h2>
          <span className="text-[10px] text-slate-400 ml-auto">by completion rate · resets weekly</span>
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No commitments set this week yet — be the first.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {leaderboard.map((row, i) => (
              <div key={row.member.id} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-4 text-slate-400 font-bold ui-metric text-xs">{i + 1}</span>
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold flex items-center justify-center uppercase shrink-0">
                  {row.member.avatar || row.member.name.substring(0, 2)}
                </span>
                <span className={`font-medium truncate ${row.member.id === currentUser.id ? 'text-brand-navy' : 'text-slate-700'}`}>
                  {row.member.name}{row.member.streak > 0 ? ' 🔥' : ''}
                </span>
                <span className="ui-bar flex-grow max-w-[30%] ml-auto"><i style={{ width: `${row.rate * 100}%`, backgroundColor: 'var(--secondary-color)' }} /></span>
                <span className="text-xs text-slate-500 ui-metric w-16 text-right shrink-0">{row.completed}/{row.total} · {Math.round(row.rate * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
