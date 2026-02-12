import React, { useMemo, useState } from 'react';
import { StorageService } from '../services/storage';
import { TeamMember, AppView, WIGConfig, WIG_SETTINGS, Commitment, SurveyResult, Ticket } from '../types';
import { getPreviousWeekId, getWeekId } from '../utils';
import UserStats from './UserStats';
import CorrelationChart from './CorrelationChart';

interface DashboardProps {
  currentUser: TeamMember;
  members: TeamMember[];
  wigConfig: WIGConfig | null;
  commitments?: Commitment[];
  tickets?: Ticket[];
  surveys?: SurveyResult[];
  onNavigate: (view: AppView) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  members,
  wigConfig,
  commitments = [],
  tickets = [],
  surveys = [],
  onNavigate,
}) => {
  // Calculate WIG Score from Survey Data
  const currentScore = useMemo(() => {
    if (!surveys || surveys.length === 0) return wigConfig?.currentValue || 70;

    // Calculate average of all surveys (rolling average logic can be added here if needed)
    // For now, use overall average
    const total = surveys.reduce((sum, s) => sum + s.average, 0);
    const avg = total / surveys.length; // Out of 10
    return Math.round(avg * 10); // Convert to Percentage (0-100)
  }, [surveys, wigConfig]);

  const activeMembers = members.filter(m => m.id); // Valid members have an ID
  const numActive = activeMembers.length;

  const leadMeasures = wigConfig?.leadMeasures || [];

  // Get current week ID for filtering
  const currentWeekId = getWeekId();

  // Filter commitments to current week only for scorecard calculations
  const currentWeekCommitments = commitments.filter(c => c.weekId === currentWeekId);

  // Check for Missing Survey Data (Manager Only)
  const isManager = currentUser.role === 'MANAGER' || currentUser.role === 'ADMIN';
  const hasSurveyDataForWeek = useMemo(() => {
    if (!surveys || surveys.length === 0) return false;
    return surveys.some(s => s.weekId === currentWeekId);
  }, [surveys, currentWeekId]);

  const handleUpdateScore = async () => {
    if (wigConfig) {
      await StorageService.updateWIGConfig({ ...wigConfig, currentValue: tempScore });
    }
    setEditingScore(false);
  };

  const handleUpdateMember = async (id: string, updates: Partial<TeamMember>) => {
    await StorageService.updateMemberMetrics(id, updates);
  };

  return (
    <div className="space-y-10 animate-fade-in">

      {/* Missing Survey Data Reminder (Managers Only) */}
      {isManager && !hasSurveyDataForWeek && (
        <div className="bg-brand-orange/10 border border-brand-orange/20 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-orange/20 flex items-center justify-center text-brand-orange shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Survey Data Missing</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">No TSV uploaded for {currentWeekId}. The WIG Scoreboard relies on this data.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate(AppView.SURVEYS)}
            className="w-full sm:w-auto px-5 py-2.5 bg-brand-navy text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Upload Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SECTION A: THE WIG (Lag Measure) - SLIM MODERN */}
        <section className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-soft border border-slate-100/60 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-red to-brand-navy opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="flex justify-between items-end mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-red/10 text-brand-red uppercase tracking-wider">Lag Measure</span>
                <span className="text-[10px] text-slate-400 font-medium">{wigConfig?.description || "Monthly Performance Score"}</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {wigConfig?.title || "Strategy Goal"}
              </h2>
            </div>
            <div className="text-right">
              {/* Automated Score from Surveys - Slim */}
              <div className="flex flex-col items-end">
                <span className="text-4xl font-bold text-slate-900 tracking-tighter leading-none">{currentScore}<span className="text-lg text-slate-400 align-top">%</span></span>
                <span className="text-[10px] font-semibold text-brand-navy uppercase tracking-wide mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse"></span>
                  Live Data
                </span>
              </div>
            </div>
          </div>

          <div className="relative pt-6 pb-2">
            {/* Slim Progress Bar Container */}
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative">
              {/* Actual Progress */}
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-brand-red to-brand-navy shadow-[0_0_15px_rgba(227,6,19,0.4)] transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${currentScore}%` }}
              ></div>
            </div>

            {/* Target Marker - Slim */}
            <div
              className="absolute top-1 bottom-0 w-0.5 bg-slate-800 z-10 opacity-20"
              style={{ left: `${wigConfig?.targetValue || 80}%`, top: '1.5rem', height: '0.75rem' }}
            ></div>

            <div className="flex justify-between mt-3 text-xs font-medium text-slate-500">
              <span>0%</span>
              <span className="absolute -translate-x-1/2 font-bold text-slate-900" style={{ left: `${wigConfig?.targetValue || 80}%` }}>Target {wigConfig?.targetValue || 80}%</span>
              <span>100%</span>
            </div>
          </div>
        </section>

        {/* SECTION A.5: USER STATS (Gamification v2) */}
        <section>
          <UserStats member={currentUser} />
        </section>
      </div>

      {/* SECTION B: THE SCOREBOARD (Lead Measures with Team Targets) */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {leadMeasures.map((measure, measureIndex) => {
          const teamTarget = numActive * measure.target; // TEAM TARGET = Members × Individual Target

          // CALCULATE ACTUAL: 
          // Match by ID OR by name (some commitments incorrectly store name in leadMeasureId)
          const byLeadMeasure = currentWeekCommitments.filter(c =>
            c.status === 'completed' && (
              c.leadMeasureId === measure.id ||
              c.leadMeasureId === measure.name ||
              c.leadMeasureName === measure.name
            )
          ).length;

          const totalCompleted = currentWeekCommitments.filter(c => c.status === 'completed').length;
          const hasAnyWithLeadMeasure = currentWeekCommitments.some(c => c.leadMeasureId || c.leadMeasureName);

          // If commitments have leadMeasureId, use that count; otherwise distribute total evenly
          const actual = hasAnyWithLeadMeasure
            ? byLeadMeasure
            : (measureIndex === 0 ? totalCompleted : 0);

          const percent = Math.min(100, (actual / (teamTarget || 1)) * 100);
          const isWinning = actual >= teamTarget;

          return (
            <div key={measure.id} className="bg-white rounded-2xl p-6 shadow-soft border border-slate-100/60 flex flex-col group hover:shadow-lg transition-all duration-300">
              <div className="mb-4">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{measure.name}</h3>
                  {measure.definition && (
                    <div className="relative group/info">
                      <button className="text-slate-300 hover:text-brand-navy transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                      <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-slate-800 text-white rounded-xl shadow-xl opacity-0 group-hover/info:opacity-100 transition-opacity z-50 pointer-events-none text-xs leading-relaxed">
                        {measure.definition}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-bold text-slate-900">{actual}</span>
                  <span className="text-xs text-slate-400 font-medium">/ {teamTarget} target</span>
                </div>

                {/* Slim Progress Bar */}
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${isWinning ? 'bg-brand-green' : 'bg-brand-red'}`}
                    style={{ width: `${percent}%` }}
                  ></div>
                </div>

                <div className={`text-xs font-bold ${isWinning ? 'text-brand-green' : 'text-brand-red'} flex items-center gap-1.5`}>
                  {isWinning ? (
                    <><span>✓</span> On Track</>
                  ) : (
                    <><span>⚠</span> {teamTarget - actual} needed</>
                  )}
                </div>

              </div>
            </div>
          );
        })}
      </section>

      {/* SECTION B.4: TEAM VELOCITY & IMPACT (Correlation Chart) */}
      <section>
        <CorrelationChart
          tickets={tickets}
          commitments={commitments}
          currentWeekId={currentWeekId}
          wigConfig={wigConfig}
          currentWins={currentScore}
        />
      </section>

      {/* SECTION B.5: WEEKLY PROGRESS (Progress Over Time) - SLIM MODERN */}
      <section className="bg-white rounded-2xl p-6 shadow-soft border border-slate-100/60">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Weekly Momentum</h3>
          </div>
          <div className="flex gap-4 text-[10px] font-medium text-slate-400">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-green"></span>Win</div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand-red"></span>Miss</div>
          </div>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {/* Calculate weekly results from commitments */}
          {(() => {
            // Import getWeekId to generate proper week format
            const getWeekIdLocal = (date: Date = new Date()): string => {
              const target = new Date(date.valueOf());
              const dayNr = (date.getDay() + 6) % 7;
              target.setDate(target.getDate() - dayNr + 3);
              const firstThursday = target.valueOf();
              target.setMonth(0, 1);
              if (target.getDay() !== 4) {
                target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
              }
              const weekNo = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
              return `${target.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
            };

            // Generate last 6 weeks starting from current week
            const weeks: Array<{ weekId: string, completed: number, total: number, isWin: boolean }> = [];
            let weekId = getWeekIdLocal(); // Use proper week format like "2026-W05"

            for (let i = 0; i < 6; i++) {
              const weekCommitments = commitments.filter(c => c.weekId === weekId);
              const completed = weekCommitments.filter(c => c.status === 'completed').length;
              const total = weekCommitments.length;
              const isWin = total > 0 && completed >= total * 0.8; // 80% completion = win
              weeks.push({ weekId, completed, total, isWin });
              weekId = getPreviousWeekId(weekId);
            }

            return weeks.reverse().map((week, idx) => (
              <div key={week.weekId} className="flex flex-col items-center flex-1">
                <div className={`w-full h-1.5 rounded-full mb-2 ${week.total === 0 ? 'bg-slate-100' : week.isWin ? 'bg-brand-green' : 'bg-brand-red'}`}></div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs border transition-all ${week.total === 0 ? 'bg-slate-50 border-slate-100 text-slate-300' : week.isWin ? 'bg-brand-green/10 border-brand-green/20 text-brand-green' : 'bg-brand-red/10 border-brand-red/20 text-brand-red'
                  }`}>
                  {week.total === 0 ? '—' : week.isWin ? '✓' : '✗'}
                </div>
                <span className="text-[9px] font-semibold text-slate-400 mt-1 uppercase tracking-tight">
                  {idx === weeks.length - 1 ? 'Now' : `W${week.weekId.split('-W')[1]}`}
                </span>

              </div>
            ));
          })()}
        </div>
      </section>
      {/* SECTION C: THE PLAYER ROSTER (Accountability Grid - Read-Only Scores) */}
      <section className="bg-white rounded-2xl shadow-soft border border-slate-100/60 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Player Roster</h3>
            <p className="text-slate-400 text-[10px] font-medium uppercase tracking-wider mt-0.5">Accountability Grid</p>
          </div>
          <div className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-lg">
            Verified Weekly
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-[10px] font-bold uppercase text-slate-400 tracking-wider border-b border-slate-100">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Streak</th>
                <th className="px-6 py-3 font-medium">Score</th>
                {leadMeasures.map(measure => (
                  <th key={measure.id} className="px-6 py-3 font-medium">{measure.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.filter(m => m && m.name).map(member => (
                <tr key={member.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-slate-600 text-[10px] border border-slate-200 group-hover:border-brand-navy/30 group-hover:text-brand-navy transition-all uppercase">
                        {member.avatar || (member.name ? member.name.substring(0, 2) : '??')}
                      </div>
                      <span className="font-semibold text-slate-700 text-sm tracking-tight group-hover:text-slate-900">{member.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${member.streak > 0 ? 'text-orange-500' : 'text-slate-300'}`}>
                        {member.streak || 0}
                      </span>
                      {member.streak > 0 && <span className="text-[10px]">🔥</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-bold text-slate-600">{(member.score || 0).toLocaleString()}</span>
                  </td>
                  {leadMeasures.map((measure, measureIndex) => {
                    // Count this member's completed commitments
                    // Match by ID OR by name (some commitments store name in leadMeasureId)
                    const byLeadMeasure = currentWeekCommitments.filter(c =>
                      c.memberId === member.id &&
                      c.status === 'completed' &&
                      (c.leadMeasureId === measure.id ||
                        c.leadMeasureId === measure.name ||
                        c.leadMeasureName === measure.name)
                    ).length;

                    const memberTotalCompleted = currentWeekCommitments.filter(c =>
                      c.memberId === member.id && c.status === 'completed'
                    ).length;

                    const hasAnyWithLeadMeasure = currentWeekCommitments.some(c => c.leadMeasureId || c.leadMeasureName);

                    // Fall back to total if no leadMeasureId assigned
                    const currentCount = hasAnyWithLeadMeasure
                      ? byLeadMeasure
                      : (measureIndex === 0 ? memberTotalCompleted : 0);

                    const target = measure.target || 1;
                    const isOnTrack = currentCount >= target;
                    return (
                      <td key={measure.id} className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${isOnTrack ? 'text-brand-green' : 'text-slate-400'}`}>
                            {currentCount}
                          </span>
                          <span className="text-slate-300 text-[10px] font-medium">/ {target}</span>
                          {isOnTrack && (
                            <span className="bg-brand-green/10 text-brand-green text-[9px] px-1.5 py-0.5 rounded font-bold">OK</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
