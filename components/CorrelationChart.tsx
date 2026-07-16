import React, { useMemo } from 'react';
import { Ticket, Commitment, WIGConfig } from '../types';
import { getPreviousWeekId } from '../utils';

interface CorrelationChartProps {
    tickets: Ticket[];
    commitments: Commitment[];
    currentWeekId: string;
    wigConfig: WIGConfig | null;
    currentWins: number;
    lastTicketSync?: number | null;
}

const CorrelationChart: React.FC<CorrelationChartProps & { compact?: boolean }> = ({ tickets, commitments, currentWeekId, wigConfig, currentWins, lastTicketSync, compact = false }) => {
    // Calculate current week ticket count for the header metric
    const currentWeekTicketCount = useMemo(() => {
        return tickets.filter(t => t.weekId === currentWeekId).length;
    }, [tickets, currentWeekId]);

    // Calculate total tickets (all time) for display
    const totalTicketCount = tickets.length;

    // "isWinning" should compare commitment wins against a target, not WIG score %
    const completedThisWeek = commitments.filter(c => c.weekId === currentWeekId && c.status === 'completed').length;
    const targetWins = wigConfig?.leadMeasureTarget || 8;
    const isWinning = completedThisWeek >= targetWins;
    const remaining = Math.max(0, targetWins - completedThisWeek);

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

            // Production logic: Show real data (0 if none)

            const hasData = tickets.length > 0 || commitments.length > 0;

            return {
                week: weekId.split('-W')[1],
                tickets: weekTickets, // Now heavily relies on real data
                wins: weekWins
            };
        });
    }, [tickets, commitments, currentWeekId]);

    // Calculate max values for scaling (guard against 0/NaN)
    const rawMaxTickets = Math.max(...chartData.map(d => d.tickets), 1);
    const rawMaxWins = Math.max(...chartData.map(d => d.wins), 1);
    const maxTickets = rawMaxTickets * 1.2;
    const maxWins = rawMaxWins * 1.2;

    // Dynamic insight calculation
    const insight = useMemo(() => {
        const firstWeek = chartData[0];
        const lastWeek = chartData[chartData.length - 1];

        if (!firstWeek || !lastWeek) return { text: 'Not enough data yet to generate insights.', hasChange: false };

        const ticketChange = firstWeek.tickets > 0
            ? ((lastWeek.tickets - firstWeek.tickets) / firstWeek.tickets * 100)
            : 0;
        const winsChange = firstWeek.wins > 0
            ? ((lastWeek.wins - firstWeek.wins) / firstWeek.wins * 100)
            : lastWeek.wins > 0 ? 100 : 0;

        const totalWins = chartData.reduce((s, d) => s + d.wins, 0);
        const totalTickets = chartData.reduce((s, d) => s + d.tickets, 0);

        if (totalWins === 0 && totalTickets === 0) {
            return { text: 'No ticket or commitment data recorded yet. Start logging to see impact trends.', hasChange: false };
        }

        if (totalWins === 0) {
            return { text: `${totalTickets} tickets logged over 6 weeks with no strategic wins recorded yet. Start completing commitments to see the correlation.`, hasChange: false };
        }

        // Determine correlation direction
        const isInverse = ticketChange < 0 && winsChange > 0; // Wins up, tickets down = good
        const isConcerning = ticketChange > 0 && winsChange <= 0; // Tickets up, wins flat/down = bad

        let text = '';
        if (isInverse) {
            text = `As strategic wins ${winsChange > 0 ? 'increased' : 'changed'} by ${Math.abs(Math.round(winsChange))}%, reactive ticket volume ${ticketChange < 0 ? 'decreased' : 'increased'} by ${Math.abs(Math.round(ticketChange))}% — a strong leading indicator.`;
        } else if (isConcerning) {
            text = `Ticket volume rose ${Math.abs(Math.round(ticketChange))}% while strategic wins ${winsChange === 0 ? 'stayed flat' : 'declined'}. Increasing proactive commitments could help reduce reactive load.`;
        } else {
            text = `${totalWins} strategic wins and ${totalTickets} tickets across 6 weeks. Consistent commitment completion drives long-term ticket reduction.`;
        }

        return { text, ticketChange, winsChange, hasChange: true, isInverse, isConcerning };
    }, [chartData]);

    // Calculate previous week ticket count for trend
    const prevWeekTicketCount = useMemo(() => {
        const prevWeekId = getPreviousWeekId(currentWeekId);
        return tickets.filter(t => t.weekId === prevWeekId).length;
    }, [tickets, currentWeekId]);

    const ticketTrend = prevWeekTicketCount > 0
        ? Math.round(((currentWeekTicketCount - prevWeekTicketCount) / prevWeekTicketCount) * 100)
        : currentWeekTicketCount > 0 ? 100 : 0;

    return (
        <div className={compact ? '' : 'ui-card'}>
            {!compact && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">Impact correlation</h3>
                        <div className="flex items-center gap-3 mt-1">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Lead measure vs lag result</p>
                            <span className="h-1 w-1 rounded-full bg-slate-200"></span>
                            <div className={`ui-chip ${isWinning ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-red/10 text-brand-red'} transition-colors`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${isWinning ? 'bg-brand-green' : 'bg-brand-red'} animate-pulse`}></span>
                                {isWinning ? 'On track' : 'Off track'}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand-navy"></div>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Ticket vol</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-brand-green"></div>
                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Strategic wins</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Helpdesk Ticket Metrics Card */}
            {!compact && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">This week</p>
                        <p className="text-lg font-extrabold text-slate-900 ui-metric mt-0.5">{currentWeekTicketCount}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">helpdesk tickets</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Trend</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-lg font-extrabold text-slate-900 ui-metric">{ticketTrend > 0 ? '+' : ''}{ticketTrend}%</span>
                            {ticketTrend !== 0 && (
                                <svg className={`w-4 h-4 ${ticketTrend > 0 ? 'text-rose-500' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d={ticketTrend > 0 ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
                                </svg>
                            )}
                        </div>
                        <p className="text-[9px] text-slate-400 mt-0.5">vs last week</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Total volume</p>
                        <p className="text-lg font-extrabold text-slate-900 ui-metric mt-0.5">{totalTicketCount}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">all-time tickets</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Last refreshed</p>
                        {lastTicketSync ? (
                            <>
                                <p className="text-sm font-semibold text-slate-900 ui-metric mt-0.5">
                                    {new Date(lastTicketSync).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </p>
                                <p className="text-[9px] text-slate-400 mt-0.5">
                                    {new Date(lastTicketSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </>
                        ) : (
                            <div className="mt-0.5">
                                <p className="text-xs font-semibold text-amber-600">⚠ No sync</p>
                                <p className="text-[9px] text-amber-500 mt-0.5">not yet refreshed</p>
                            </div>
                        )}
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
                            <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-none shadow-sm">
                                <div className="text-[10px] whitespace-nowrap font-semibold ui-metric">Week {d.week}</div>
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
                                className="w-2 bg-brand-green rounded-t-full relative"
                                style={{ height: `${(d.wins / maxWins) * 100}%` }}
                            >
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className={`flex justify-between ${compact ? 'px-0 mt-1' : 'px-8 mt-2'} text-[9px] font-semibold text-slate-400 uppercase tracking-wide ui-metric`}>
                {chartData.map((d, i) => (
                    <span key={i}>W{d.week}</span>
                ))}
            </div>

            {!compact && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg flex items-start gap-3 border border-slate-100">
                    <div className="p-1.5 bg-brand-green/10 rounded-lg text-brand-green">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    </div>
                    <div>
                        <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Insight</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {insight.text}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CorrelationChart;
