import React, { useMemo, useState, useEffect } from 'react';
import { SurveyResult, TeamMember } from '../types';
import { StorageService } from '../services/storage';
import { getWeekId } from '../utils';

interface SurveyAnalyticsProps {
    surveys: SurveyResult[];
}

const SurveyAnalytics: React.FC<SurveyAnalyticsProps> = ({ surveys }) => {
    const [timeframe, setTimeframe] = useState<'all' | 'month' | 'quarter'>('all');

    // --- Metrics Calculation ---
    const metrics = useMemo(() => {
        if (surveys.length === 0) return null;

        // Filters (TODO: Implement actual date filtering if needed)
        const filtered = surveys;
        const count = filtered.length;

        const avg = (filtered.reduce((sum, s) => sum + s.average, 0) / count).toFixed(1);
        const q1Avg = (filtered.reduce((sum, s) => sum + s.q1, 0) / count).toFixed(1);
        const q2Avg = (filtered.reduce((sum, s) => sum + s.q2, 0) / count).toFixed(1);
        const q3Avg = (filtered.reduce((sum, s) => sum + s.q3, 0) / count).toFixed(1);

        const percent = (Number(avg) * 10).toFixed(0);

        return { count, avg, percent, q1Avg, q2Avg, q3Avg };
    }, [surveys]);

    // --- Tech League Table ---
    const techPerformance = useMemo(() => {
        const techs: Record<string, { count: number; total: number; q1: number; q2: number; q3: number }> = {};

        surveys.forEach(s => {
            const name = s.tech || "Unknown";
            if (!techs[name]) techs[name] = { count: 0, total: 0, q1: 0, q2: 0, q3: 0 };
            techs[name].count++;
            techs[name].total += s.average;
            techs[name].q1 += s.q1;
            techs[name].q2 += s.q2;
            techs[name].q3 += s.q3;
        });

        return Object.entries(techs)
            .map(([name, data]) => ({
                name,
                count: data.count,
                avg: (data.total / data.count).toFixed(1),
                percent: ((data.total / data.count) * 10).toFixed(0),
                q1: (data.q1 / data.count).toFixed(1),
                q2: (data.q2 / data.count).toFixed(1),
                q3: (data.q3 / data.count).toFixed(1),
            }))
            .sort((a, b) => Number(b.avg) - Number(a.avg));
    }, [surveys]);

    // --- Weekly Trend ---
    const weeklyTrend = useMemo(() => {
        const weeks: Record<string, { total: number; count: number }> = {};

        // Sort surveys by date
        const sorted = [...surveys].sort((a, b) => a.date - b.date);

        sorted.forEach(s => {
            // Simple week grouping - assuming weekId is YYYY-MM-DD of Monday
            // Only keep last 12 active weeks for clarity
            if (!weeks[s.weekId]) weeks[s.weekId] = { total: 0, count: 0 };
            weeks[s.weekId].total += s.average;
            weeks[s.weekId].count++;
        });

        return Object.entries(weeks)
            .map(([weekId, data]) => ({
                weekId,
                avg: data.total / data.count
            }))
            .sort((a, b) => a.weekId.localeCompare(b.weekId))
            .slice(-12); // Last 12 weeks
    }, [surveys]);


    if (!metrics) return (
        <div className="flex flex-col items-center justify-center p-10 bg-slate-50 text-slate-400 rounded-3xl border border-dashed border-slate-200">
            <p className="font-black uppercase tracking-widest text-xs">No Data Available</p>
            <p className="text-[10px] mt-2">Upload TSV files to see analytics</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in">

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-brand-navy text-white p-6 rounded-2xl shadow-lg relative overflow-hidden group">
                    <div className="absolute -right-4 -top-4 opacity-10 transform rotate-12 group-hover:scale-110 transition-transform">
                        <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    </div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60">Overall Satisfaction</h4>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-4xl font-black tracking-tighter">{metrics.avg}</span>
                        <span className="text-sm font-bold opacity-80">/ 10</span>
                    </div>
                    <div className="mt-4 text-xs font-black bg-white/10 inline-block px-2 py-1 rounded">{metrics.percent}%</div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resolution (Q1)</h4>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-800">{metrics.q1Avg}</span>
                        <span className="text-[10px] font-bold text-slate-300">/ 10</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div className="bg-brand-green h-full rounded-full" style={{ width: `${Number(metrics.q1Avg) * 10}%` }}></div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Professionalism (Q2)</h4>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-800">{metrics.q2Avg}</span>
                        <span className="text-[10px] font-bold text-slate-300">/ 10</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div className="bg-brand-navy h-full rounded-full" style={{ width: `${Number(metrics.q2Avg) * 10}%` }}></div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Speed (Q3)</h4>
                    <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-800">{metrics.q3Avg}</span>
                        <span className="text-[10px] font-bold text-slate-300">/ 10</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div className="bg-brand-orange h-full rounded-full" style={{ width: `${Number(metrics.q3Avg) * 10}%` }}></div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Trend Chart (CSS-only simple chart) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="text-lg font-black text-brand-navy uppercase tracking-tight mb-6">Satisfaction Trend (Last 12 Weeks)</h3>
                    <div className="h-64 flex items-end gap-2">
                        {weeklyTrend.map((week, idx) => (
                            <div key={week.weekId} className="flex-1 flex flex-col items-center group relative">
                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-black px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                                    {week.weekId}: {week.avg.toFixed(2)}
                                </div>
                                {/* Bar */}
                                <div
                                    className="w-full bg-brand-red/10 rounded-t-sm relative transition-all group-hover:bg-brand-red/20"
                                    style={{ height: `${(week.avg / 10) * 100}%` }}
                                >
                                    <div
                                        className="absolute top-0 w-full bg-brand-red h-1 rounded-t-sm"
                                    ></div>
                                </div>
                                <span className="text-[8px] font-bold text-slate-300 mt-2 rotate-45 origin-left translate-x-2">{week.weekId.substring(5)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tech League Table */}
                <div className="bg-white p-0 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-50">
                        <h3 className="text-lg font-black text-brand-navy uppercase tracking-tight">Tech Performance</h3>
                    </div>
                    <div className="overflow-y-auto max-h-[400px]">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-white z-10 shadow-sm">
                                <tr className="text-[8px] font-black uppercase text-slate-400 tracking-widest">
                                    <th className="px-6 py-3">Tech</th>
                                    <th className="px-6 py-3 text-right">Surveys</th>
                                    <th className="px-6 py-3 text-right">Avg Rating</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {techPerformance.map((tech, idx) => (
                                    <tr key={tech.name} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-yellow-100 text-yellow-600' :
                                                        idx === 1 ? 'bg-slate-100 text-slate-600' :
                                                            idx === 2 ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-300'
                                                    }`}>
                                                    {idx + 1}
                                                </div>
                                                <span className="text-xs font-bold text-slate-700">{tech.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs text-slate-500 font-mono">{tech.count}</td>
                                        <td className="px-6 py-4 text-right">
                                            <span className={`text-xs font-black px-2 py-1 rounded ${Number(tech.avg) >= 9 ? 'bg-green-50 text-brand-green' :
                                                    Number(tech.avg) >= 8 ? 'bg-blue-50 text-brand-navy' :
                                                        'bg-red-50 text-brand-red'
                                                }`}>
                                                {tech.avg}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SurveyAnalytics;
