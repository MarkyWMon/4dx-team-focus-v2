
import React, { useState, useMemo, useEffect } from 'react';
import { TeamMember, Commitment } from '../types';
import { StorageService } from '../services/storage';
import { formatWeekDisplay, formatDateShort } from '../utils';

interface CommitmentHistoryProps {
  currentUser: TeamMember;
  members: TeamMember[];
  initialTargetMemberId?: string | null;
}

const CommitmentHistory: React.FC<CommitmentHistoryProps> = ({
  currentUser,
  members,
  initialTargetMemberId
}) => {
  const [targetMemberId, setTargetMemberId] = useState<string>(initialTargetMemberId || currentUser.id);

  useEffect(() => {
    if (initialTargetMemberId) {
      setTargetMemberId(initialTargetMemberId);
    }
  }, [initialTargetMemberId]);

  const isManager = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  const targetMember = members.find(m => m.id === targetMemberId) || currentUser;

  const historyData = useMemo(() => {
    const all = StorageService.getCommitments();
    const userCommits = all.filter(c => c.memberId === targetMemberId);
    const grouped = userCommits.reduce((acc, c) => {
      if (!acc[c.weekId]) acc[c.weekId] = [];
      acc[c.weekId].push(c);
      return acc;
    }, {} as Record<string, Commitment[]>);
    const sortedWeeks = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const completed = userCommits.filter(c => c.status === 'completed').length;
    const partial = userCommits.filter(c => c.status === 'partial').length;
    const total = userCommits.length;
    const rate = total === 0 ? 0 : Math.round(((completed + partial * 0.5) / total) * 100);
    return { weeks: sortedWeeks, grouped, stats: { total, completed, partial, rate } };
  }, [targetMemberId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-brand-green';
      case 'partial': return 'bg-brand-orange';
      case 'incomplete': return 'bg-brand-red';
      default: return 'bg-slate-300';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-3 pb-12 animate-fade-in">

      {/* Target selector & header */}
      <div className="ui-card flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-brand-navy rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {targetMember.avatar}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {targetMember.id === currentUser.id ? 'My execution history' : `${targetMember.name}'s history`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Performance since first commitment
            </p>
          </div>
        </div>

        {isManager && (
          <div className="w-full md:w-64">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Focus on</label>
            <select
              value={targetMemberId}
              onChange={(e) => setTargetMemberId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-navy transition-colors"
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="ui-card !p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Completion rate</p>
          <p className="ui-metric text-xl font-semibold text-brand-navy mt-0.5">{historyData.stats.rate}%</p>
        </div>
        <div className="ui-card !p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Total set</p>
          <p className="ui-metric text-xl font-semibold text-slate-900 mt-0.5">{historyData.stats.total}</p>
        </div>
        <div className="ui-card !p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Completed</p>
          <p className="ui-metric text-xl font-semibold text-emerald-600 mt-0.5">{historyData.stats.completed}</p>
        </div>
        <div className="ui-card !p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Partial</p>
          <p className="ui-metric text-xl font-semibold text-amber-600 mt-0.5">{historyData.stats.partial}</p>
        </div>
      </div>

      <div className="space-y-4 relative py-2">
        <div className="absolute left-[7px] top-0 bottom-0 w-px bg-slate-200 -z-10"></div>

        {historyData.weeks.length === 0 ? (
          <div className="ui-card text-center border-dashed">
            <p className="text-xs text-slate-400">No execution records found</p>
          </div>
        ) : (
          historyData.weeks.map((weekId) => (
            <div key={weekId} className="relative pl-8">
              <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full border-2 border-white bg-brand-navy z-10"></div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {formatWeekDisplay(weekId)}
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  {historyData.grouped[weekId].map(c => (
                    <div key={c.id} className="ui-card relative">
                      <div className={`absolute top-4 right-4 w-2.5 h-2.5 rounded-full ${getStatusColor(c.status)}`}></div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900 leading-snug pr-6">{c.description}</p>
                          <div className="flex gap-3 items-center mt-2">
                            <span className="text-[10px] text-slate-500">
                              Logged {formatDateShort(c.createdAt)}
                            </span>
                            <span className={`ui-chip text-white ${getStatusColor(c.status)}`}>
                              {c.status}
                            </span>
                          </div>

                          {c.completionNote && (
                            <div className="mt-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Completion note</p>
                              <p className="text-sm text-slate-700 leading-relaxed">"{c.completionNote}"</p>
                            </div>
                          )}
                        </div>

                        {c.completionPhoto && (
                          <div className="relative">
                            <img src={c.completionPhoto} alt="Proof" className="w-full h-48 object-cover rounded-lg border border-slate-200" />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CommitmentHistory;
