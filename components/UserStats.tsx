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
        <div className="ui-card animate-fade-in">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Focus profile</p>
                    <h3 className="text-sm font-semibold text-slate-900 mt-0.5">{member.name}</h3>
                </div>
                <div className="h-8 w-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
                    <Trophy className="h-4 w-4 text-brand-orange" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Flame className={`h-3.5 w-3.5 ${currentStreak > 0 ? 'text-orange-500 fill-orange-500' : 'text-slate-300'}`} />
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Streak</span>
                    </div>
                    <p className="ui-metric text-lg font-semibold text-slate-900">{currentStreak} <span className="text-[10px] text-slate-400 font-medium">weeks</span></p>
                </div>

                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Target className="h-3.5 w-3.5 text-brand-navy" />
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Score</span>
                    </div>
                    <p className="ui-metric text-lg font-semibold text-slate-900">{score.toLocaleString()} <span className="text-[10px] text-slate-400 font-medium">pts</span></p>
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Achievements</span>
                    <span className="text-[10px] text-slate-400 ui-metric">{achievements.length} unlocked</span>
                </div>

                {achievements.length === 0 ? (
                    <div className="py-3 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <p className="text-xs text-slate-400">Earn badges by completing goals</p>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {achievements.map((achievement) => (
                            <div
                                key={achievement.id}
                                className="group relative h-9 w-9 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 hover:border-brand-navy transition-colors cursor-help"
                                title={`${achievement.title}: ${achievement.description}`}
                            >
                                <span className="text-base">{achievement.icon}</span>
                                <div className="absolute bottom-full mb-2 hidden group-hover:block w-36 bg-slate-900 text-white text-[10px] p-2 rounded-lg z-50 shadow-sm">
                                    <p className="font-semibold mb-0.5">{achievement.title}</p>
                                    <p className="opacity-70 leading-tight">{achievement.description}</p>
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
