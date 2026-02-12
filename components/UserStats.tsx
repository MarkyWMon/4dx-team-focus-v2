import React from 'react';
import { TeamMember } from '../types';
import { Trophy, Flame, Target, Star } from 'lucide-react';

interface UserStatsProps {
    member: TeamMember;
}

const UserStats: React.FC<UserStatsProps> = ({ member }) => {
    const currentStreak = member.streak || 0;
    const score = member.score || 0;
    const achievements = member.achievements || [];

    return (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 animate-fade-in">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Your Focus Profile</h3>
                    <p className="text-xl font-display font-black text-slate-900">{member.name}</p>
                </div>
                <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                    <Trophy className="h-6 w-6 text-brand-orange" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                        <Flame className={`h-4 w-4 ${currentStreak > 0 ? 'text-orange-500 fill-orange-500' : 'text-slate-300'}`} />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Streak</span>
                    </div>
                    <p className="text-2xl font-black text-slate-900 font-display">{currentStreak} <span className="text-[10px] text-slate-400 uppercase">Weeks</span></p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                        <Target className="h-4 w-4 text-brand-navy" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Score</span>
                    </div>
                    <p className="text-2xl font-black text-slate-900 font-display">{score.toLocaleString()} <span className="text-[10px] text-slate-400 uppercase">Pts</span></p>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Achievements</span>
                    <span className="text-[10px] font-bold text-slate-400">{achievements.length} Unlocked</span>
                </div>

                {achievements.length === 0 ? (
                    <div className="py-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Complete commitments to earn badges</p>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {achievements.map((achievement) => (
                            <div
                                key={achievement.id}
                                className="group relative h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 hover:border-brand-navy transition-all cursor-help"
                                title={`${achievement.title}: ${achievement.description}`}
                            >
                                <span className="text-lg">{achievement.icon}</span>
                                <div className="absolute bottom-full mb-2 hidden group-hover:block w-32 bg-slate-900 text-white text-[8px] p-2 rounded-lg z-50">
                                    <p className="font-black uppercase mb-1">{achievement.title}</p>
                                    <p className="opacity-70 font-bold leading-tight">{achievement.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserStats;
