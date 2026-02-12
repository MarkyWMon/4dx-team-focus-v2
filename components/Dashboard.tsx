import React, { useMemo, useState } from 'react';
import { StorageService } from '../services/storage';
import { TeamMember, AppView, WIGConfig, WIG_SETTINGS, Commitment, SurveyResult } from '../types';
import { getPreviousWeekId } from '../utils';
import UserStats from './UserStats';

interface DashboardProps {
  currentUser: TeamMember;
  members: TeamMember[];
  wigConfig: WIGConfig | null;
  commitments?: Commitment[];
  surveys?: SurveyResult[];
  onNavigate: (view: AppView) => void;
}

const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  members,
  wigConfig,
  commitments = [],
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
  const currentWeekId = getWeekIdLocal();

  // Filter commitments to current week only for scorecard calculations
  const currentWeekCommitments = commitments.filter(c => c.weekId === currentWeekId);

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SECTION A: THE WIG (Lag Measure) */}
        <section className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-xl font-bold text-brand-navy tracking-tight uppercase">
                WIG: {wigConfig?.title || "Strategy Goal"} ({(wigConfig?.currentScore || 0.7) * 100}% to {(wigConfig?.targetScore || 0.8) * 100}%)
              </h2>
              <p className="text-slate-600 text-xs font-semibold uppercase tracking-widest mt-1">Lag Measure: {wigConfig?.description || "Monthly Performance Score"}</p>
            </div>
            <div className="text-right">
              {/* Automated Score from Surveys */}
              <div className="flex flex-col items-end">
                <span className="text-3xl font-black text-brand-navy tracking-tighter">{currentScore}%</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-full mt-1">Live Survey Data</span>
              </div>
            </div>
          </div>

          <div className="relative h-12 bg-slate-100 rounded-full overflow-hidden border-4 border-white shadow-inner">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-brand-red to-brand-green transition-all duration-1000"
              style={{ width: `${currentScore}%` }}
            ></div>
            {/* Target marker */}
            <div className="absolute top-0 h-full w-1 bg-white shadow-lg" style={{ left: `${wigConfig?.targetValue || 80}%` }}>
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-brand-navy text-white px-2 py-1 rounded text-[10px] font-black uppercase">Target: {wigConfig?.targetValue || 80}%</div>
            </div>
          </div>
          <div className="flex justify-between mt-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
            <span>Current: {currentScore}%</span>
            <span>Gap to Close: {Math.max(0, (wigConfig?.targetValue || 80) - currentScore)}%</span>
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
            <div key={measure.id} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col group relative">
              <div className="mb-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-base font-bold text-brand-navy uppercase tracking-tight">{measure.name}</h3>
                  {measure.definition && (
                    <div className="relative group/info">
                      <button className="h-5 w-5 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 hover:bg-brand-navy hover:text-white transition-all text-[10px] font-black">
                        ?
                      </button>
                      <div className="absolute right-0 top-full mt-2 w-64 p-4 bg-slate-900 text-white rounded-2xl shadow-2xl opacity-0 group-hover/info:opacity-100 transition-opacity z-50 pointer-events-none text-xs font-normal leading-relaxed">
                        <div className="text-[10px] font-black text-brand-red uppercase tracking-widest mb-2">Operational Definition</div>
                        {measure.definition}
                      </div>
                    </div>
                  )}
                </div>
                {/* Team Target Formula */}
                <div className="bg-slate-50 rounded-xl p-3 mb-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Team Target This Week</p>
                  <p className="text-lg font-black text-brand-navy">{teamTarget} <span className="text-slate-400 text-sm font-normal">({numActive} members × {measure.target} {measure.unit})</span></p>
                </div>
                {/* Progress indicator */}
                <div className={`text-center py-2 px-4 rounded-xl font-bold text-sm ${isWinning ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-red/10 text-brand-red'}`}>
                  {isWinning ? '✓ ON TRACK' : `${Math.round(percent)}% — Need ${teamTarget - actual} more`}
                </div>
              </div>
              <div className="h-32 flex items-end gap-6 mt-auto">
                <div className="flex-1 flex flex-col items-center h-full justify-end">
                  <div
                    className={`w-full rounded-t-2xl transition-all duration-700 shadow-lg ${isWinning ? 'bg-brand-green' : 'bg-brand-red'}`}
                    style={{ height: `${percent}%` }}
                  ></div>
                  <span className="mt-3 text-[10px] font-black text-slate-600 uppercase whitespace-nowrap">Actual: {actual}</span>
                </div>
                <div className="flex-1 flex flex-col items-center h-full justify-end">
                  <div className="w-full h-full bg-slate-50/50 rounded-t-2xl border-2 border-dashed border-slate-200 relative overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center opacity-30">
                      <span className="text-xl font-black text-slate-400">{teamTarget}</span>
                    </div>
                  </div>
                  <span className="mt-3 text-[10px] font-black text-slate-400 uppercase whitespace-nowrap">Target: {teamTarget}</span>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* SECTION B.5: WEEKLY PROGRESS (Progress Over Time) */}
      <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-base font-bold text-brand-navy uppercase tracking-tight">Weekly Progress</h3>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Team Performance Streak</p>
          </div>
        </div>
        <div className="flex items-center gap-4 overflow-x-auto py-2">
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
              <div key={week.weekId} className="flex flex-col items-center min-w-[60px]">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-white text-lg shadow-lg ${week.total === 0 ? 'bg-slate-200' : week.isWin ? 'bg-brand-green' : 'bg-brand-red'
                  }`}>
                  {week.total === 0 ? '—' : week.isWin ? '✓' : '✗'}
                </div>
                <span className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight">
                  {idx === weeks.length - 1 ? 'This Week' : `W-${weeks.length - 1 - idx}`}
                </span>
                {week.total > 0 && (
                  <span className="text-[10px] font-semibold text-slate-500">{week.completed}/{week.total}</span>
                )}
              </div>
            ));
          })()}
        </div>
        <p className="text-slate-400 text-xs mt-4 text-center">Green = 80%+ commitments completed</p>
      </section>
      {/* SECTION C: THE PLAYER ROSTER (Accountability Grid - Read-Only Scores) */}
      <section className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-8 border-b border-slate-50">
          <h3 className="text-base font-bold text-brand-navy uppercase tracking-tight leading-none">Player Roster</h3>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Weekly Accountability Grid (Auto-Updated)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest font-display">
                <th className="px-8 py-4">Name</th>
                <th className="px-8 py-4">Streak</th>
                <th className="px-8 py-4">Score</th>
                {leadMeasures.map(measure => (
                  <th key={measure.id} className="px-8 py-4">{measure.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {members.filter(m => m && m.name).map(member => (
                <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center font-semibold text-brand-navy text-xs border border-slate-200 shadow-sm uppercase">
                        {member.avatar || (member.name ? member.name.substring(0, 2) : '??')}
                      </div>
                      <span className="font-semibold text-slate-900 text-sm tracking-tight">{member.name || 'Unknown'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-1">
                      <span className={`font-black ${member.streak > 0 ? 'text-orange-500' : 'text-slate-300'}`}>
                        {member.streak || 0}
                      </span>
                      {member.streak > 0 && <span className="text-xs">🔥</span>}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="font-black text-slate-700">{(member.score || 0).toLocaleString()}</span>
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
                      <td key={measure.id} className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <span className={`text-lg font-black ${isOnTrack ? 'text-brand-green' : 'text-slate-700'}`}>
                            {currentCount}
                          </span>
                          <span className="text-slate-400 text-[10px] font-bold">/ {target}</span>
                          {isOnTrack && (
                            <span className="text-brand-green text-xs">✓</span>
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
