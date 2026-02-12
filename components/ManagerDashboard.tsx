import React, { useState } from 'react';
import { TeamMember, Commitment } from '../types';
import { getWeekId } from '../utils';
import { Shield, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface ManagerDashboardProps {
    currentUser: TeamMember;
    members: TeamMember[];
    commitments: Commitment[];
}

const ManagerDashboard: React.FC<ManagerDashboardProps> = ({ currentUser, members, commitments }) => {
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

    // Filter members (In a real app, strict hierarchy check here. For now, show all staff if you are manager)
    const myTeam = members.filter(m => m.id !== currentUser.id && m.role !== 'ADMIN');

    // Calculate Say/Do Ratio for a member
    const getReliability = (memberId: string) => {
        const memberCommitments = commitments.filter(c => c.memberId === memberId);
        const total = memberCommitments.length;
        if (total === 0) return 0;
        const completed = memberCommitments.filter(c => c.status === 'completed').length;
        return Math.round((completed / total) * 100);
    };

    const renderMemberDetail = () => {
        const member = members.find(m => m.id === selectedMemberId);
        if (!member) return null;

        const history = commitments
            .filter(c => c.memberId === member.id)
            .sort((a, b) => b.weekId.localeCompare(a.weekId));

        return (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 animate-fade-in">
                <button
                    onClick={() => setSelectedMemberId(null)}
                    className="mb-6 text-[10px] font-black uppercase text-slate-400 hover:text-brand-navy flex items-center gap-1"
                >
                    ← Back to Team
                </button>

                <div className="flex items-center gap-4 mb-8">
                    <div className="h-16 w-16 bg-slate-100 rounded-2xl flex items-center justify-center font-bold text-xl text-slate-400">
                        {member.avatar || member.name.substring(0, 2)}
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-brand-navy">{member.name}</h2>
                        <div className="flex items-center gap-4 mt-2">
                            <span className="text-xs font-semibold px-2 py-1 bg-slate-100 rounded text-slate-600 uppercase tracking-wider">
                                Reliability: {getReliability(member.id)}%
                            </span>
                            <span className="text-xs font-semibold px-2 py-1 bg-orange-50 text-orange-600 rounded uppercase tracking-wider">
                                Streak: {member.streak} Weeks
                            </span>
                        </div>
                    </div>
                </div>

                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-4 mb-4 uppercase tracking-wide">Commitment Evidence & History</h3>

                <div className="space-y-4">
                    {history.length === 0 ? (
                        <p className="text-slate-400 text-sm italic">No commitments recorded yet.</p>
                    ) : (
                        history.map(c => (
                            <div key={c.id} className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors bg-slate-50/50">
                                <div className={`mt-1 h-5 w-5 rounded-full flex items-center justify-center ${c.status === 'completed' ? 'bg-brand-green/10 text-brand-green' : 'bg-slate-200 text-slate-400'}`}>
                                    {c.status === 'completed' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <p className="text-sm font-medium text-slate-900 line-clamp-2">{c.description}</p>
                                        <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-100 whitespace-nowrap ml-4">
                                            {c.weekId}
                                        </span>
                                    </div>
                                    {/* Placeholder for future Evidence Uploads */}
                                    {c.status === 'completed' && (
                                        <div className="mt-3 text-xs text-slate-500 bg-white p-3 rounded-lg border border-dashed border-slate-200">
                                            <span className="font-bold uppercase text-[9px] text-slate-300 mr-2">Evidence:</span>
                                            Self-verified completion.
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    if (selectedMemberId) return renderMemberDetail();

    return (
        <div className="animate-fade-in space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-brand-navy uppercase tracking-tight">Manager Dashboard</h2>
                    <p className="text-slate-600 text-xs font-semibold uppercase tracking-widest mt-1">Team Accountability Review</p>
                </div>
                <div className="h-10 w-10 bg-brand-navy rounded-xl flex items-center justify-center text-white">
                    <Shield size={20} />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {myTeam.map(member => {
                    const reliability = getReliability(member.id);
                    const isHighPerformer = reliability >= 80;

                    return (
                        <div
                            key={member.id}
                            onClick={() => setSelectedMemberId(member.id)}
                            className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:border-brand-navy/20 transition-all cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="h-12 w-12 bg-slate-100 rounded-2xl flex items-center justify-center font-bold text-slate-500 group-hover:bg-brand-navy group-hover:text-white transition-colors">
                                    {member.avatar || member.name.substring(0, 1)}
                                </div>
                                <div className={`px-2 py-1 rounded text-[10px] font-black uppercase ${isHighPerformer ? 'bg-brand-green/10 text-brand-green' : 'bg-orange-50 text-orange-600'}`}>
                                    {reliability}% Say/Do
                                </div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 mb-1">{member.name}</h3>
                            <p className="text-xs text-slate-500 font-medium mb-6">{member.jobTitle}</p>

                            <div className="flex items-center justify-between border-t border-slate-50 pt-4">
                                <div className="text-xs text-slate-400">
                                    <span className="font-bold text-slate-900">{member.streak}</span> Wk Streak
                                </div>
                                <ChevronRight size={16} className="text-slate-300 group-hover:text-brand-navy translation-transform group-hover:translate-x-1" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ManagerDashboard;
