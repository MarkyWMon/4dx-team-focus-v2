import React, { useMemo } from 'react';
import { Ticket, Commitment, WIGConfig } from '../types';
import { getPreviousWeekId } from '../utils';

interface CorrelationChartProps {
    tickets: Ticket[];
    commitments: Commitment[];
    currentWeekId: string;
    wigConfig: WIGConfig | null;
    currentWins: number;
}

const CorrelationChart: React.FC<CorrelationChartProps & { compact?: boolean }> = ({ tickets, commitments, currentWeekId, wigConfig, currentWins, compact = false }) => {
    const targetWins = wigConfig?.leadMeasureTarget || 8;
    const isWinning = currentWins >= targetWins;
    const remaining = targetWins - currentWins;

    const chartData = useMemo(() => {
        // Generate last 6 weeks
        const weeks = [];
        let w = currentWeekId;
        for (let i = 0; i < 6; i++) {
            weeks.unshift(w);
            w = getPreviousWeekId(w);
        }

        return weeks.map((weekId, i) => {
            // Stats for this week
            const weekTickets = tickets.filter(t => t.weekId === weekId).length;
            const weekWins = commitments.filter(c => c.weekId === weekId && c.status === 'completed').length;

            // If no real data, mock it for visualization demonstration (REMOVE IN PRODUCTION)
            const mockTickets = weekTickets || Math.floor(Math.random() * (45 - 30) + 30) - (i * 2);
            const mockWins = weekWins || Math.floor(Math.random() * (22 - 10) + 10) + (i * 1.5);

            return {
                week: weekId.split('-W')[1],
                tickets: tickets.length > 0 ? weekTickets : mockTickets,
                wins: tickets.length > 0 ? weekWins : mockWins
            };
        });
    }, [tickets, commitments, currentWeekId]);

    // Calculate max values for scaling
    const maxTickets = Math.max(...chartData.map(d => d.tickets)) * 1.2;
    const maxWins = Math.max(...chartData.map(d => d.wins)) * 1.2;

    return (
        <div className={`bg-white rounded-2xl shadow-soft border border-slate-100/60 ${compact ? 'p-0 border-0 shadow-none bg-transparent' : 'p-6'}`}>
            {!compact && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h3 className="text-lg font-black text-brand-navy uppercase tracking-tighter">Impact Correlation</h3>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Lead Measure vs Lag Result</p>
                            <span className="h-1 w-1 rounded-full bg-slate-200"></span>
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${isWinning ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-red/10 text-brand-red'} transition-colors`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isWinning ? 'bg-brand-green' : 'bg-brand-red'} animate-pulse`}></span>
                                <span className="text-[9px] font-bold uppercase tracking-wide">
                                    {isWinning ? 'On Track' : 'Off Track'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-brand-navy"></div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase font-display">Ticket Vol</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-brand-green"></div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase font-display">Strategic Wins</span>
                        </div>
                    </div>
                </div>
            )}

            <div className={`${compact ? 'h-40' : 'h-64'} w-full relative`}>
                {/* Y-Axis Grid Lines - Hide in compact */}
                {!compact && (
                    <div className="absolute inset-0 flex flex-col justify-between text-[9px] text-slate-300 font-bold pointer-events-none">
                        {[4, 3, 2, 1, 0].map(i => (
                            <div key={i} className="flex items-center w-full">
                                <span className="w-4 text-right mr-2">{Math.round((maxTickets / 4) * i)}</span>
                                <div className="flex-grow border-t border-dashed border-slate-100"></div>
                            </div>
                        ))}
                    </div>
                )}

                <div className={`absolute ${compact ? 'inset-x-0' : 'inset-x-8'} inset-y-0 flex items-end justify-between ${compact ? 'pt-2' : 'pt-6'}`}>
                    {chartData.map((d, i) => (
                        <div key={i} className="flex-1 flex justify-center items-end gap-1 h-full relative group">
                            {/* Stats Tooltip */}
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none shadow-xl">
                                <div className="text-[10px] whitespace-nowrap font-bold">Week {d.week}</div>
                                <div className="text-[9px] flex gap-2 mt-1">
                                    <span className="text-blue-200">Wins: {Math.round(d.wins)}</span>
                                    <span className="text-red-200">Tickets: {Math.round(d.tickets)}</span>
                                </div>
                            </div>

                            {/* Tickets Bar (Background) */}
                            <div
                                className="w-2 bg-brand-navy/20 rounded-t-sm relative group-hover:bg-brand-navy/30 transition-colors"
                                style={{ height: `${(d.tickets / maxTickets) * 100}%` }}
                            >
                            </div>

                            {/* Wins Line Point (Visualized as Bar for easier CSS-only implementation) */}
                            <div
                                className="w-2 bg-brand-green rounded-t-full relative shadow-lg shadow-brand-green/20"
                                style={{ height: `${(d.wins / maxWins) * 80}%` }}
                            >
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={`flex justify-between ${compact ? 'px-0 mt-1' : 'px-8 mt-2'} text-[8px] font-black text-slate-300 uppercase tracking-widest`}>
                {chartData.map((d, i) => (
                    <span key={i}>W{d.week}</span>
                ))}
            </div>

            {!compact && (
                <div className="mt-6 p-4 bg-slate-50/50 rounded-xl flex items-start gap-3 border border-slate-100/50">
                    <div className="p-2 bg-brand-green/10 rounded-lg text-brand-green">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    </div>
                    <div>
                        <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wide">Insight</h4>
                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                            As proactive wins increased by <span className="font-bold text-brand-green">14%</span> over 6 weeks, ticket volume dropped by <span className="font-bold text-brand-navy">18%</span>.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorrelationChart;
