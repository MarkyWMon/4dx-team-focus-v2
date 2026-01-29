
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
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-fade-in">

      {/* Target Selector & Header */}
      <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 bg-brand-navy rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-2xl">
            {targetMember.avatar}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 font-display uppercase tracking-tight leading-none">
              {targetMember.id === currentUser.id ? 'My Execution History' : `${targetMember.name}'s History`}
            </h2>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-3">
              Performance audit since first commitment
            </p>
          </div>
        </div>

        {isManager && (
          <div className="w-full md:w-64">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 ml-1">Focus On:</label>
            <select
              value={targetMemberId}
              onChange={(e) => setTargetMemberId(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-sm text-slate-900 outline-none focus:ring-4 focus:ring-brand-red/5 transition-all"
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-50 text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Completion Rate</p>
          <p className="text-3xl font-black text-brand-navy">{historyData.stats.rate}%</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-50 text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Set</p>
          <p className="text-3xl font-black text-slate-900">{historyData.stats.total}</p>
        </div>
        <div className="bg-green-50 p-6 rounded-3xl border border-green-100 text-center">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-2">Completed</p>
          <p className="text-3xl font-black text-green-700">{historyData.stats.completed}</p>
        </div>
        <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 text-center">
          <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-2">Partial</p>
          <p className="text-3xl font-black text-orange-700">{historyData.stats.partial}</p>
        </div>
      </div>

      <div className="space-y-12 relative py-8">
        <div className="absolute left-8 top-0 bottom-0 w-1 bg-slate-100 -z-10 rounded-full"></div>

        {historyData.weeks.length === 0 ? (
          <div className="bg-white p-12 rounded-[2.5rem] text-center border-2 border-dashed border-slate-100">
            <p className="text-slate-300 font-bold uppercase tracking-[0.3em] text-xs">No execution records found</p>
          </div>
        ) : (
          historyData.weeks.map((weekId) => (
            <div key={weekId} className="relative pl-24 group">
              <div className="absolute left-[26px] top-4 w-4 h-4 rounded-full border-4 border-white bg-brand-red group-hover:scale-150 transition-all z-10 shadow-lg"></div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-black text-slate-900 font-display uppercase tracking-tight">
                    {formatWeekDisplay(weekId)}
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {historyData.grouped[weekId].map(c => (
                    <div key={c.id} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-xl transition-all border-l-8 border-l-slate-100 relative group/card">
                      <div className={`absolute top-8 right-8 w-4 h-4 rounded-full ${getStatusColor(c.status)} shadow-sm`}></div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div>
                          <p className="text-lg font-black text-slate-900 leading-snug mb-2 uppercase tracking-tight">{c.description}</p>
                          <div className="flex gap-4 items-center mt-4">
                            <div>
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Logged On</p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase">{formatDateShort(c.createdAt)}</p>
                            </div>
                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md text-white ${getStatusColor(c.status)}`}>
                              {c.status}
                            </span>
                          </div>

                          {c.completionNote && (
                            <div className="mt-6 p-6 bg-slate-50 rounded-2xl border-2 border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Completion Note</p>
                              <p className="text-sm font-bold text-slate-700 leading-relaxed italic">"{c.completionNote}"</p>
                            </div>
                          )}
                        </div>

                        {c.completionPhoto && (
                          <div className="relative group/photo">
                            <img src={c.completionPhoto} alt="Proof" className="w-full h-64 object-cover rounded-2xl shadow-lg border-4 border-white group-hover:scale-[1.02] transition-transform" />
                            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-black/10"></div>
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
