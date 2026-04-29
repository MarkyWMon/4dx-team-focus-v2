import React, { useMemo, useState, useEffect } from 'react';
import { TeamMember, Commitment, ActivityEvent } from '../types';
import { getWeekId } from '../utils';
import { StorageService } from '../services/storage';

interface MemberDetailModalProps {
  member: TeamMember;
  commitments: Commitment[];
  onClose: () => void;
}

const MemberDetailModal: React.FC<MemberDetailModalProps> = ({ member, commitments, onClose }) => {
  const currentWeekId = getWeekId();
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview');
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // All commitments for this member
  const memberCommitments = useMemo(() =>
    commitments.filter(c => c.memberId === member.id),
    [commitments, member.id]
  );

  // Current week commitments
  const currentWeekCommitments = useMemo(() =>
    memberCommitments.filter(c => c.weekId === currentWeekId),
    [memberCommitments, currentWeekId]
  );

  // Historical commitments (previous weeks)
  const historicalCommitments = useMemo(() =>
    memberCommitments.filter(c => c.weekId !== currentWeekId),
    [memberCommitments, currentWeekId]
  );

  // Group historical by week
  const historicalByWeek = useMemo(() => {
    const groups: Record<string, Commitment[]> = {};
    historicalCommitments.forEach(c => {
      if (!groups[c.weekId]) groups[c.weekId] = [];
      groups[c.weekId].push(c);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 8);
  }, [historicalCommitments]);

  // Stats
  const stats = useMemo(() => {
    const total = memberCommitments.length;
    const completed = memberCommitments.filter(c => c.status === 'completed').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const currentTotal = currentWeekCommitments.length;
    const currentCompleted = currentWeekCommitments.filter(c => c.status === 'completed').length;
    return { total, completed, completionRate, currentTotal, currentCompleted };
  }, [memberCommitments, currentWeekCommitments]);

  // Fetch activity when tab selected
  useEffect(() => {
    if (activeTab === 'activity' && activityEvents.length === 0 && !activityLoading) {
      setActivityLoading(true);
      StorageService.getActivityStream(member.id)
        .then(events => setActivityEvents(events))
        .finally(() => setActivityLoading(false));
    }
  }, [activeTab, member.id]);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700">Completed</span>;
      case 'partial':
        return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700">Partial</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-slate-100 text-slate-500">Incomplete</span>;
    }
  };

  const activityIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'login':
        return (
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
        );
      case 'commitment_set':
        return (
          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        );
      case 'commitment_completed':
        return (
          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'commitment_partial':
        return (
          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  const activityLabel = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'login': return 'Signed in';
      case 'commitment_set': return 'Set commitment';
      case 'commitment_completed': return 'Completed commitment';
      case 'commitment_partial': return 'Marked partial';
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-brand-navy text-white rounded-xl flex items-center justify-center font-bold text-sm shadow-md">
                {member.avatar}
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">{member.name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] font-bold text-brand-red uppercase tracking-wide">{member.role}</span>
                  <span className="text-slate-200">|</span>
                  <span className="text-[10px] text-slate-500 font-medium">{member.email}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-slate-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${activeTab === 'overview' ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-200'}`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${activeTab === 'activity' ? 'bg-brand-navy text-white' : 'text-slate-500 hover:bg-slate-200'}`}
            >
              Activity
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick Stats Row */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <div className="text-2xl font-black text-slate-900">{member.score || 0}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Score</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <div className="text-2xl font-black text-slate-900">{member.streak || 0}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Streak</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <div className="text-2xl font-black text-slate-900">{stats.completionRate}%</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Completion</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                  <div className="text-2xl font-black text-slate-900">{stats.total}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">All Time</div>
                </div>
              </div>

              {/* Last Login */}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="font-medium">Last login:</span>
                <span className="font-bold text-slate-700">
                  {member.lastLogin ? new Date(member.lastLogin).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never'}
                </span>
              </div>

              {/* Current Week Commitments */}
              <div>
                <h4 className="text-xs font-black text-brand-navy uppercase tracking-widest mb-3">
                  This Week ({currentWeekId}) — {stats.currentCompleted}/{stats.currentTotal} completed
                </h4>
                {currentWeekCommitments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No commitments set this week.</p>
                ) : (
                  <div className="space-y-2">
                    {currentWeekCommitments.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="flex-1 mr-3">
                          <p className="text-sm text-slate-700 font-medium leading-snug">{c.description}</p>
                          {c.leadMeasureName && (
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1 inline-block">{c.leadMeasureName}</span>
                          )}
                        </div>
                        {statusBadge(c.status)}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Historical Commitments */}
              {historicalByWeek.length > 0 && (
                <div>
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Previous Weeks</h4>
                  <div className="space-y-3">
                    {historicalByWeek.map(([weekId, weekCommitments]) => {
                      const weekCompleted = weekCommitments.filter(c => c.status === 'completed').length;
                      return (
                        <div key={weekId} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{weekId}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              weekCompleted === weekCommitments.length ? 'bg-emerald-100 text-emerald-700' :
                              weekCompleted > 0 ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {weekCompleted}/{weekCommitments.length} completed
                            </span>
                          </div>
                          <div className="space-y-1">
                            {weekCommitments.map(c => (
                              <div key={c.id} className="flex items-center justify-between py-1">
                                <span className="text-xs text-slate-600 font-medium truncate mr-2">{c.description}</span>
                                {statusBadge(c.status)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {memberCommitments.length === 0 && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">📋</div>
                  <p className="text-sm text-slate-400 font-medium">No commitments recorded for this team member.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div>
              {activityLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-brand-navy border-t-transparent rounded-full animate-spin" />
                </div>
              ) : activityEvents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-sm text-slate-400 font-medium">No activity recorded yet.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-100" />
                  <div className="space-y-4">
                    {activityEvents.map((event, i) => (
                      <div key={i} className="flex gap-4 items-start relative">
                        {activityIcon(event.type)}
                        <div className="flex-1 min-w-0 pt-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-700">{activityLabel(event.type)}</span>
                            {event.weekId && (
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{event.weekId}</span>
                            )}
                          </div>
                          {event.type !== 'login' && (
                            <p className="text-xs text-slate-500 mt-0.5 leading-snug line-clamp-2">{event.description}</p>
                          )}
                          <p className="text-[10px] text-slate-400 mt-1">{formatTime(event.timestamp)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberDetailModal;
