import React, { useEffect, useState } from 'react';
import { formatWeekDisplay } from '../utils';

interface WinningIndicatorProps {
    currentWins: number;
    targetWins: number;
    previousWins: number;
    label?: string;
}

const WinningIndicator: React.FC<WinningIndicatorProps> = ({
    currentWins,
    targetWins,
    previousWins,
    label = "Proactive Strategic Wins"
}) => {
    const [animate, setAnimate] = useState(false);

    const isWinning = currentWins >= targetWins;
    const percentage = Math.min((currentWins / targetWins) * 100, 100);
    const remaining = Math.max(targetWins - currentWins, 0);

    // Determine status color/mood
    const getStatusColor = () => {
        if (isWinning) return 'bg-brand-green text-white';
        // Only return Red if definitely not winning (below target)
        return 'bg-brand-red text-white';
    };

    useEffect(() => {
        setAnimate(true);
        const timer = setTimeout(() => setAnimate(false), 1000);
        return () => clearTimeout(timer);
    }, [currentWins]);

    return (
        <div className={`relative overflow-hidden rounded-[2.5rem] shadow-xl transition-all duration-500 transform hover:scale-[1.01] ${getStatusColor()}`}>
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] animate-pulse-slow"></div>

            <div className="relative z-10 p-6 flex flex-col md:flex-row items-center justify-between gap-4">

                {/* Status Message */}
                <div className="text-center md:text-left">
                    <div className="inline-flex items-center gap-2 mb-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                        <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-90">Live Scoreboard</span>
                    </div>

                    <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tighter font-display leading-none mb-1">
                        {isWinning ? 'On Track' : 'Off Track'}
                    </h2>

                    {isWinning ? (
                        <p className="text-sm font-medium opacity-90 max-w-xs">
                            Incredible work! The team has exceeded the weekly strategic target.
                        </p>
                    ) : (
                        <p className="text-sm font-medium opacity-90 max-w-xs">
                            We need <span className="font-black border-b-2 border-white/30">{remaining} more</span> {label.toLowerCase()} to hit our weekly goal.
                        </p>
                    )}
                </div>

                {/* Metrics Visualization */}
                <div className="flex items-center gap-8 bg-black/10 p-6 rounded-3xl backdrop-blur-sm">
                    <div className="text-center">
                        <span className="block text-[10px] uppercase tracking-widest opacity-60 font-bold">Current</span>
                        <span className={`block text-5xl font-black tabular-nums tracking-tighter ${animate ? 'scale-110' : ''} transition-transform duration-300`}>
                            {currentWins}
                        </span>
                    </div>

                    <div className="h-12 w-px bg-white/20"></div>

                    <div className="text-center opacity-60">
                        <span className="block text-[10px] uppercase tracking-widest font-bold">Target</span>
                        <span className="block text-3xl font-black tabular-nums">{targetWins}</span>
                    </div>

                    {/* Progress Circle (Simple SVG) */}
                    <div className="relative h-16 w-16">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path
                                className="text-black/10"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                            <path
                                className="text-white transition-all duration-1000 ease-out"
                                strokeDasharray={`${percentage}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black">
                            {Math.round(percentage)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Bar Trend */}
            <div className="bg-black/10 px-8 py-3 flex justify-between items-center text-xs font-bold uppercase tracking-widest backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <span>Trend:</span>
                    {currentWins > previousWins ? (
                        <span className="flex items-center text-green-300">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            Up from last week
                        </span>
                    ) : currentWins < previousWins ? (
                        <span className="flex items-center text-red-200 opacity-80">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
                            Down from last week
                        </span>
                    ) : (
                        <span className="opacity-60">Stable</span>
                    )}
                </div>
                <div>
                    Week {formatWeekDisplay(new Date().toISOString().slice(0, 10))}
                </div>
            </div>
        </div>
    );
};

export default WinningIndicator;
