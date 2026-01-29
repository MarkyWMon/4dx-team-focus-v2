import React, { useMemo } from 'react';
import { Commitment, TeamMember } from '../types';
import { formatDateShort } from '../utils';

interface ActivityFeedProps {
    commitments: Commitment[];
    members: TeamMember[];
}

const ActivityFeed: React.FC<ActivityFeedProps> = ({ commitments, members }) => {

    const activities = useMemo(() => {
        // Filter for completed items or new creations, sort by most recent timestamp
        const completedItems = commitments
            .filter(c => c.status === 'completed' && c.completedAt)
            .map(c => ({
                id: c.id,
                type: 'completed' as const,
                commitment: c,
                timestamp: c.completedAt || 0,
                member: members.find(m => m.id === c.memberId)
            }));

        // We can also track "created" but for now let's focus on wins (completions)
        // to keep the feed high-energy.

        return completedItems
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 15);
    }, [commitments, members]);

    const getTimeAgo = (timestamp: number) => {
        const min = 60 * 1000;
        const hour = min * 60;
        const day = hour * 24;
        const diff = Date.now() - timestamp;

        if (diff < min) return 'Just now';
        if (diff < hour) return `${Math.floor(diff / min)}m ago`;
        if (diff < day) return `${Math.floor(diff / hour)}h ago`;
        return formatDateShort(timestamp);
    };

    return (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-50 bg-slate-50/50">
                <h3 className="text-sm font-black text-brand-navy uppercase tracking-tighter">Live Activity Feed</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Real-time Execution Stream</p>
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-4 max-h-[400px]">
                {activities.length === 0 ? (
                    <div className="text-center py-12 text-slate-300">
                        <p className="text-xs font-bold uppercase tracking-widest">No recent activity</p>
                    </div>
                ) : (
                    activities.map(activity => (
                        <div key={activity.id} className="flex gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors group animate-fade-in relative">
                            <div className="mt-1 relative">
                                <div className="h-8 w-8 bg-brand-navy rounded-xl flex items-center justify-center text-[10px] font-black text-white shadow-md">
                                    {activity.member?.avatar}
                                </div>
                                <div className="absolute -bottom-1 -right-1 bg-brand-green text-white rounded-full p-0.5 border-2 border-white">
                                    <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>
                                </div>
                            </div>

                            <div className="flex-grow min-w-0">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-tight font-display">{activity.member?.name}</span>
                                    <span className="text-[9px] font-bold text-slate-400">{getTimeAgo(activity.timestamp)}</span>
                                </div>
                                <p className="text-xs text-slate-600 font-medium leading-normal line-clamp-2">
                                    {activity.commitment.description}
                                </p>
                                {(activity.commitment.completionNote || activity.commitment.completionPhoto) && (
                                    <div className="mt-2 flex items-center gap-2">
                                        {activity.commitment.completionPhoto && (
                                            <div className="h-8 w-8 rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
                                                <img src={activity.commitment.completionPhoto} className="w-full h-full object-cover" alt="Proof" />
                                            </div>
                                        )}
                                        {activity.commitment.completionNote && (
                                            <p className="text-[10px] text-slate-500 italic truncate max-w-[150px]">"{activity.commitment.completionNote}"</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Live Updates Active</p>
            </div>
        </div>
    );
};

export default ActivityFeed;
