import React, { useState, useMemo } from 'react';
import { TeamMember, Commitment, WIGConfig, CommitmentThemeReport } from '../types';
import { StorageService } from '../services/storage';
import { AIService } from '../services/ai';
import { getWeekId, getPreviousWeekId, formatWeekDisplay } from '../utils';

// --- Integrity heuristic thresholds (sensible defaults — tune as needed) ---
const INSTANT_CLOSE_MS = 15 * 60 * 1000;      // completed within 15 min of being set
const BATCH_WINDOW_MS = 5 * 60 * 1000;        // 3+ commitments created inside a 5-min window
const BATCH_MIN_COUNT = 3;

type PeriodKey = 'this' | '4w' | '12w' | 'all';
const PERIODS: { key: PeriodKey; label: string; weeks: number | null }[] = [
  { key: 'this', label: 'This week', weeks: 1 },
  { key: '4w', label: 'Last 4 weeks', weeks: 4 },
  { key: '12w', label: 'Last 12 weeks', weeks: 12 },
  { key: 'all', label: 'All time', weeks: null },
];

const recentWeekIds = (weeks: number): Set<string> => {
  const ids = new Set<string>();
  let w = getWeekId();
  for (let i = 0; i < weeks; i++) {
    ids.add(w);
    w = getPreviousWeekId(w);
  }
  return ids;
};

const fmtDateTime = (ts?: number) =>
  ts ? new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtDuration = (ms?: number) => {
  if (ms == null) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
};

type Flag = 'instant' | 'buzzer' | 'batch' | 'healthy';

interface AnalysedCommitment extends Commitment {
  timeToCloseMs?: number;
  flags: Flag[];
}

interface MemberRow {
  member: TeamMember;
  commitments: AnalysedCommitment[];
  set: number;
  completed: number;
  partial: number;
  incomplete: number;
  completionRate: number;
  avgTimeToCloseMs?: number;
  lastMinuteCount: number;
}

const FLAG_META: Record<Flag, { label: string; cls: string; dot: string }> = {
  instant: { label: 'Instant close', cls: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  buzzer: { label: 'Buzzer-beater', cls: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  batch: { label: 'Batch dump', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  healthy: { label: 'Healthy', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

interface Props {
  members: TeamMember[];
  commitments: Commitment[];
  wigConfig: WIGConfig | null;
}

const CommitmentAnalytics: React.FC<Props> = ({ members, commitments, wigConfig }) => {
  const [period, setPeriod] = useState<PeriodKey>('4w');
  const [sortKey, setSortKey] = useState<'name' | 'set' | 'completed' | 'rate' | 'lastMinute'>('set');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // AI themes state
  const [themes, setThemes] = useState<CommitmentThemeReport | null>(null);
  const [themesAt, setThemesAt] = useState<number | null>(null);
  const [themesLoading, setThemesLoading] = useState(false);
  const [themesError, setThemesError] = useState<string | null>(null);

  const wigDay = wigConfig?.wigDayOfWeek ?? 1; // 0=Sun..6=Sat; review/deadline day

  const periodCfg = PERIODS.find(p => p.key === period)!;

  // Commitments inside the selected period.
  const scoped = useMemo(() => {
    if (periodCfg.weeks == null) return commitments;
    const ids = recentWeekIds(periodCfg.weeks);
    return commitments.filter(c => ids.has(c.weekId));
  }, [commitments, periodCfg.weeks]);

  // Per-member analysis with integrity flags.
  const rows: MemberRow[] = useMemo(() => {
    const staff = members.filter(m => m.role !== 'ADMIN' || true); // include everyone who set commitments
    const byMember = new Map<string, AnalysedCommitment[]>();

    for (const c of scoped) {
      // Detect batch dumps: cluster a member's commitments by createdAt proximity.
      const arr = byMember.get(c.memberId) || [];
      arr.push({ ...c, flags: [] });
      byMember.set(c.memberId, arr);
    }

    const result: MemberRow[] = [];
    for (const member of staff) {
      const list = (byMember.get(member.id) || []).sort((a, b) => b.createdAt - a.createdAt);
      if (list.length === 0 && !members.some(m => m.id === member.id)) continue;

      // Batch-dump detection: sort by createdAt, sliding window.
      const byCreated = [...list].sort((a, b) => a.createdAt - b.createdAt);
      for (let i = 0; i < byCreated.length; i++) {
        let count = 1;
        for (let j = i + 1; j < byCreated.length; j++) {
          if (byCreated[j].createdAt - byCreated[i].createdAt <= BATCH_WINDOW_MS) count++;
          else break;
        }
        if (count >= BATCH_MIN_COUNT) {
          for (let k = i; k < i + count; k++) {
            if (!byCreated[k].flags.includes('batch')) byCreated[k].flags.push('batch');
          }
        }
      }

      // Per-commitment flags.
      for (const c of list) {
        if (c.completedAt && c.completedAt >= c.createdAt) {
          c.timeToCloseMs = c.completedAt - c.createdAt;
          if (c.timeToCloseMs < INSTANT_CLOSE_MS) c.flags.push('instant');
        }
        const createdDay = new Date(c.createdAt).getDay();
        const closedDay = c.completedAt ? new Date(c.completedAt).getDay() : -1;
        if (createdDay === wigDay || closedDay === wigDay) c.flags.push('buzzer');
        if (c.flags.length === 0 && c.status === 'completed' && c.timeToCloseMs && c.timeToCloseMs >= INSTANT_CLOSE_MS) {
          c.flags.push('healthy');
        }
      }

      const set = list.length;
      const completed = list.filter(c => c.status === 'completed').length;
      const partial = list.filter(c => c.status === 'partial').length;
      const incomplete = list.filter(c => c.status === 'incomplete').length;
      const closeTimes = list.map(c => c.timeToCloseMs).filter((n): n is number => n != null);
      const avgTimeToCloseMs = closeTimes.length ? closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length : undefined;
      const lastMinuteCount = list.filter(c => c.flags.includes('instant') || c.flags.includes('buzzer')).length;

      // Only include members who actually have commitments in this period.
      if (set === 0) continue;

      result.push({
        member, commitments: list, set, completed, partial, incomplete,
        completionRate: set ? completed / set : 0,
        avgTimeToCloseMs, lastMinuteCount,
      });
    }
    return result;
  }, [scoped, members, wigDay]);

  const sortedRows = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => {
      switch (sortKey) {
        case 'name': return a.member.name.localeCompare(b.member.name);
        case 'completed': return b.completed - a.completed;
        case 'rate': return b.completionRate - a.completionRate;
        case 'lastMinute': return b.lastMinuteCount - a.lastMinuteCount;
        default: return b.set - a.set;
      }
    });
    return r;
  }, [rows, sortKey]);

  // Headline KPIs.
  const kpis = useMemo(() => {
    const totalSet = scoped.length;
    const totalClosed = scoped.filter(c => c.status === 'completed').length;
    const activeMembers = rows.length;
    const closeTimes = rows.flatMap(r => r.commitments.map(c => c.timeToCloseMs)).filter((n): n is number => n != null);
    const avgClose = closeTimes.length ? closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length : undefined;
    const buzzer = rows.flatMap(r => r.commitments).filter(c => c.flags.includes('buzzer') || c.flags.includes('instant')).length;
    return {
      totalSet,
      totalClosed,
      completionRate: totalSet ? Math.round((totalClosed / totalSet) * 100) : 0,
      avgPerMember: activeMembers ? (totalSet / activeMembers).toFixed(1) : '0',
      avgClose,
      buzzerRate: totalSet ? Math.round((buzzer / totalSet) * 100) : 0,
    };
  }, [scoped, rows]);

  const selected = sortedRows.find(r => r.member.id === selectedId) || null;

  // Chronological list of weeks for trend charts. A single week isn't a "trend",
  // so "This week" is widened to an 8-week context window; "All time" spans from
  // the earliest recorded commitment (capped for a readable chart width).
  const trendWeekList = useMemo(() => {
    let count: number;
    if (period === 'this') count = 8;
    else if (period === '4w') count = 4;
    else if (period === '12w') count = 12;
    else {
      if (commitments.length === 0) count = 8;
      else {
        const earliest = commitments.reduce((min, c) => (c.weekId < min ? c.weekId : min), commitments[0].weekId);
        let w = getWeekId();
        let n = 1;
        while (w > earliest && n < 26) { w = getPreviousWeekId(w); n++; }
        count = Math.max(n, 4);
      }
    }
    const list: string[] = [];
    let w = getWeekId();
    for (let i = 0; i < count; i++) { list.unshift(w); w = getPreviousWeekId(w); }
    return list;
  }, [period, commitments]);

  // Team-wide set-vs-completed counts per week.
  const teamSeries = useMemo(() =>
    trendWeekList.map(weekId => {
      const inWeek = commitments.filter(c => c.weekId === weekId);
      return { weekId, set: inWeek.length, completed: inWeek.filter(c => c.status === 'completed').length };
    }), [trendWeekList, commitments]);

  const memberSeries = (memberId: string) =>
    trendWeekList.map(weekId => {
      const inWeek = commitments.filter(c => c.weekId === weekId && c.memberId === memberId);
      return { weekId, set: inWeek.length, completed: inWeek.filter(c => c.status === 'completed').length };
    });

  // Per-member breakdown for the selected period: share of commitments set.
  const breakdown = useMemo(() => {
    const totalSet = rows.reduce((s, r) => s + r.set, 0) || 1;
    return [...rows]
      .sort((a, b) => b.set - a.set)
      .map(r => ({ member: r.member, set: r.set, completed: r.completed, share: r.set / totalSet }));
  }, [rows]);

  const periodKey = `${period}-${getWeekId()}`;

  const loadThemes = async (forceRefresh: boolean) => {
    setThemesError(null);
    setThemesLoading(true);
    try {
      if (!forceRefresh) {
        const cached = await StorageService.getCommitmentThemes(periodKey);
        if (cached?.payload) {
          setThemes(cached.payload as CommitmentThemeReport);
          setThemesAt(cached.generatedAt);
          setThemesLoading(false);
          return;
        }
      }
      const byMember = rows.map(r => ({
        memberName: r.member.name,
        descriptions: r.commitments.map(c => c.description),
      }));
      const report = await AIService.summarizeCommitmentThemes(byMember);
      if (!report) {
        setThemesError('No summary available (AI key may be unset, or no commitments in range).');
        setThemesLoading(false);
        return;
      }
      setThemes(report);
      const now = Date.now();
      setThemesAt(now);
      await StorageService.saveCommitmentThemes(periodKey, report);
    } catch (e: any) {
      setThemesError('Unable to generate theme summary right now.');
    } finally {
      setThemesLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header + period selector */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-brand-navy uppercase tracking-tight">Commitment Analytics</h2>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Manager view · who is committing to what, and when</p>
        </div>
        <div className="flex gap-1 bg-white rounded-xl border border-slate-100 p-1 shadow-sm">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${period === p.key ? 'bg-slate-900 text-white shadow' : 'text-slate-400 hover:text-slate-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Kpi label="Set" value={String(kpis.totalSet)} />
        <Kpi label="Closed" value={String(kpis.totalClosed)} />
        <Kpi label="Completion" value={`${kpis.completionRate}%`} />
        <Kpi label="Avg / member" value={kpis.avgPerMember} />
        <Kpi label="Avg time to close" value={fmtDuration(kpis.avgClose)} />
        <Kpi label="Last-minute rate" value={`${kpis.buzzerRate}%`} accent={kpis.buzzerRate >= 40} />
      </div>

      {/* Team trends + who-is-setting breakdown */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Team trend · set vs closed per week</h3>
            <Legend />
          </div>
          <TrendBars data={teamSeries} height="h-44" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Who is setting commitments</h3>
          <div className="space-y-3">
            {breakdown.map(b => (
              <div key={b.member.id}>
                <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                  <span className="text-slate-700 truncate">{b.member.name}</span>
                  <span className="text-slate-400">{b.set} set · {b.completed} done · {Math.round(b.share * 100)}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative">
                  <div className="h-full bg-slate-300 rounded-full absolute inset-y-0 left-0" style={{ width: `${b.share * 100}%` }} />
                  <div className="h-full bg-emerald-500 rounded-full absolute inset-y-0 left-0" style={{ width: `${(b.set ? (b.completed / b.set) : 0) * b.share * 100}%` }} />
                </div>
              </div>
            ))}
            {breakdown.length === 0 && (
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest py-6 text-center">No commitments in this period</p>
            )}
          </div>
        </div>
      </div>

      {/* Per-member table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">By team member</h3>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sortedRows.length} active</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <Th onClick={() => setSortKey('name')} active={sortKey === 'name'}>Member</Th>
                <Th onClick={() => setSortKey('set')} active={sortKey === 'set'} right>Set</Th>
                <Th onClick={() => setSortKey('completed')} active={sortKey === 'completed'} right>Done</Th>
                <Th right>Partial</Th>
                <Th right>Open</Th>
                <Th onClick={() => setSortKey('rate')} active={sortKey === 'rate'} right>Rate</Th>
                <Th right>Avg close</Th>
                <Th onClick={() => setSortKey('lastMinute')} active={sortKey === 'lastMinute'} right>Last-minute</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map(r => (
                <tr key={r.member.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center font-black text-slate-500 text-[10px] border border-slate-200">
                        {r.member.avatar || r.member.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-slate-800 text-xs leading-none">{r.member.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{r.member.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-black text-slate-800">{r.set}</td>
                  <td className="px-3 py-3 text-right font-bold text-emerald-600">{r.completed}</td>
                  <td className="px-3 py-3 text-right font-bold text-amber-500">{r.partial}</td>
                  <td className="px-3 py-3 text-right font-bold text-slate-400">{r.incomplete}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-black ${r.completionRate >= 0.7 ? 'text-emerald-600' : r.completionRate >= 0.4 ? 'text-amber-500' : 'text-red-500'}`}>
                      {Math.round(r.completionRate * 100)}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-slate-500">{fmtDuration(r.avgTimeToCloseMs)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`font-black ${r.lastMinuteCount > 0 ? 'text-orange-600' : 'text-slate-300'}`}>{r.lastMinuteCount}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedId(r.member.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-slate-700"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 && (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-400 text-xs font-bold uppercase tracking-widest">No commitments in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI theme summary */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">What kinds of work is the team choosing?</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1">
              AI-summarised themes {themesAt ? `· generated ${fmtDateTime(themesAt)}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadThemes(false)}
              disabled={themesLoading}
              className="px-3 py-2 rounded-lg bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-50"
            >
              {themesLoading ? 'Working…' : themes ? 'Reload' : 'Generate'}
            </button>
            {themes && (
              <button
                onClick={() => loadThemes(true)}
                disabled={themesLoading}
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50"
              >
                Refresh AI
              </button>
            )}
          </div>
        </div>

        {themesError && <p className="text-xs text-amber-600 font-bold">{themesError}</p>}
        {!themes && !themesError && !themesLoading && (
          <p className="text-xs text-slate-400 font-bold">Generate an AI summary of the categories of work each member is committing to.</p>
        )}

        {themes && (
          <div className="space-y-5">
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">{themes.overall}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {themes.perMember.map((m, i) => (
                <div key={i} className="border border-slate-100 rounded-xl p-4">
                  <p className="font-black text-slate-800 text-xs uppercase tracking-tight">{m.memberName}</p>
                  <div className="flex flex-wrap gap-1.5 my-2">
                    {m.themes.map((t, j) => (
                      <span key={j} className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase tracking-widest border border-indigo-100">{t}</span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{m.summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Drill-in modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 backdrop-blur-sm p-4 sm:p-8 overflow-y-auto" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">{selected.member.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {selected.set} set · {selected.completed} done · {Math.round(selected.completionRate * 100)}% · {selected.lastMinuteCount} last-minute
                </p>
              </div>
              <button onClick={() => setSelectedId(null)} className="p-2 text-slate-400 hover:text-slate-900">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              {/* Per-member trend over time */}
              <div className="border border-slate-100 rounded-xl p-4 mb-2">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Trend · set vs closed per week</h4>
                  <Legend />
                </div>
                <TrendBars data={memberSeries(selected.member.id)} height="h-32" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 leading-relaxed">
                Flags are signals for a conversation, not verdicts. Older commitments created before timing was tracked show “—” for close time.
              </p>
              {selected.commitments.map(c => (
                <div key={c.id} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-slate-800 flex-grow">{c.description}</p>
                    <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                      c.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      c.status === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-50 text-slate-500 border-slate-200'}`}>{c.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>Set: <span className="text-slate-600">{fmtDateTime(c.createdAt)}</span></span>
                    <span>Closed: <span className="text-slate-600">{fmtDateTime(c.completedAt)}</span></span>
                    <span>Open for: <span className="text-slate-600">{fmtDuration(c.timeToCloseMs)}</span></span>
                    {c.leadMeasureName && <span>LM: <span className="text-slate-600">{c.leadMeasureName}</span></span>}
                    <span>{formatWeekDisplay(c.weekId)}</span>
                  </div>
                  {c.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {c.flags.map(f => (
                        <span key={f} className={`inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${FLAG_META[f].cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${FLAG_META[f].dot}`} />{FLAG_META[f].label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Legend: React.FC = () => (
  <div className="flex items-center gap-3">
    <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400"><span className="h-2 w-2 rounded-sm bg-slate-300" />Set</span>
    <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Closed</span>
  </div>
);

// Grouped set-vs-closed bars across weeks. Pure CSS, matching the app's chart style.
const TrendBars: React.FC<{ data: { weekId: string; set: number; completed: number }[]; height?: string }> = ({ data, height = 'h-40' }) => {
  const max = Math.max(...data.map(d => d.set), 1) * 1.15;
  return (
    <div>
      <div className={`${height} w-full flex items-end justify-between gap-1`}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div className="absolute -top-11 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none shadow-xl whitespace-nowrap">
              <div className="text-[10px] font-bold">{formatWeekDisplay(d.weekId)}</div>
              <div className="text-[9px] flex gap-2 mt-0.5"><span className="text-slate-300">Set {d.set}</span><span className="text-emerald-300">Closed {d.completed}</span></div>
            </div>
            <div className="w-full flex items-end justify-center gap-0.5 h-full">
              <div className="w-2.5 bg-slate-300 rounded-t-sm transition-all group-hover:bg-slate-400" style={{ height: `${(d.set / max) * 100}%` }} />
              <div className="w-2.5 bg-emerald-500 rounded-t-sm transition-all" style={{ height: `${(d.completed / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-1.5 gap-1">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center text-[8px] font-black text-slate-300 uppercase tracking-widest">W{d.weekId.split('-W')[1]}</span>
        ))}
      </div>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className={`rounded-2xl border p-4 ${accent ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-100'} shadow-sm`}>
    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <p className={`text-2xl font-black tracking-tighter mt-1 ${accent ? 'text-orange-600' : 'text-slate-900'}`}>{value}</p>
  </div>
);

const Th: React.FC<{ children?: React.ReactNode; onClick?: () => void; active?: boolean; right?: boolean }> = ({ children, onClick, active, right }) => (
  <th
    onClick={onClick}
    className={`px-3 py-3 ${right ? 'text-right' : 'text-left'} ${onClick ? 'cursor-pointer hover:text-slate-700' : ''} ${active ? 'text-slate-900' : ''} ${!right ? 'pl-6' : ''}`}
  >
    {children}{active ? ' ↓' : ''}
  </th>
);

export default CommitmentAnalytics;
