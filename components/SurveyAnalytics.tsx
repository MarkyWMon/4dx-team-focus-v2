import React, { useMemo, useState, useEffect } from 'react';
import { SurveyResult } from '../types';

interface SurveyAnalyticsProps {
    surveys: SurveyResult[];
    startDate: number | null;
    onDateChange: (date: number) => void;
}

const SurveyAnalytics: React.FC<SurveyAnalyticsProps> = ({ surveys, startDate, onDateChange }) => {
    // Local state for the date picker input (string format YYYY-MM-DD)
    const [localDate, setLocalDate] = useState<string>(startDate ? new Date(startDate).toISOString().split('T')[0] : '');

    // Sync local date when prop changes (external update)
    useEffect(() => {
        if (startDate) {
            setLocalDate(new Date(startDate).toISOString().split('T')[0]);
        } else {
            setLocalDate('');
        }
    }, [startDate]);

    const handleSaveDate = () => {
        if (localDate) {
            const timestamp = new Date(localDate).getTime();
            onDateChange(timestamp);
        } else {
            // Handle clear
            onDateChange(0);
        }
    };


    // --- Metrics Calculation ---
    const metrics = useMemo(() => {
        if (surveys.length === 0) return null;

        // Filter by Start Date
        const startTimestamp = startDate || 0;
        const filtered = surveys.filter(s => s.date >= startTimestamp);
        const count = filtered.length;

        if (count === 0) return null;

        const avg = (filtered.reduce((sum, s) => sum + s.average, 0) / count).toFixed(1);
        const q1Avg = (filtered.reduce((sum, s) => sum + s.q1, 0) / count).toFixed(1);
        const q2Avg = (filtered.reduce((sum, s) => sum + s.q2, 0) / count).toFixed(1);
        const q3Avg = (filtered.reduce((sum, s) => sum + s.q3, 0) / count).toFixed(1);

        const percent = (Number(avg) * 10).toFixed(0);

        return { count, avg, percent, q1Avg, q2Avg, q3Avg };
    }, [surveys, startDate]);

    // --- Tech League Table ---
    const techPerformance = useMemo(() => {
        const techs: Record<string, { count: number; total: number; q1: number; q2: number; q3: number }> = {};

        const startTimestamp = startDate || 0;

        // Filter out non-real / placeholder tech accounts (e.g. "Test Tech", "Tech 1", "Tech 2", "Tech1").
        const isPlaceholderTech = (name: string) => {
            const n = name.trim().toLowerCase();
            if (!n || n === 'unknown') return true;
            if (n.includes('test')) return true;
            // "tech" optionally followed by whitespace and digits — covers "tech 1", "tech1", "tech 23"
            if (/^tech\s*\d+$/.test(n)) return true;
            return false;
        };

        surveys.filter(s => s.date >= startTimestamp).forEach(s => {
            const name = s.tech || "Unknown";
            // Skip entries where tech looks like a ticket number (legacy bad data from parsing)
            if (/^\d+$/.test(name)) return;
            if (isPlaceholderTech(name)) return;
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
    }, [surveys, startDate]);

    // --- Last Upload Indicator ---
    const lastUploadInfo = useMemo(() => {
        if (surveys.length === 0) return null;
        const dates = surveys.map(s => s.date).filter(d => d && !isNaN(d));
        if (dates.length === 0) return null;
        const maxDate = Math.max(...dates);
        const now = Date.now();
        const diffMs = now - maxDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        let freshness: 'fresh' | 'stale' | 'old' = 'fresh';
        let freshnessLabel = 'Today';
        if (diffDays === 0) { freshness = 'fresh'; freshnessLabel = 'Today'; }
        else if (diffDays === 1) { freshness = 'fresh'; freshnessLabel = 'Yesterday'; }
        else if (diffDays <= 7) { freshness = 'fresh'; freshnessLabel = `${diffDays} days ago`; }
        else if (diffDays <= 30) { freshness = 'stale'; freshnessLabel = `${diffDays} days ago`; }
        else { freshness = 'old'; freshnessLabel = `${Math.floor(diffDays / 30)} month(s) ago`; }

        return { date: maxDate, freshness, freshnessLabel, diffDays };
    }, [surveys]);

    // --- Weekly Trend ---
    const weeklyTrend = useMemo(() => {
        const weeks: Record<string, { total: number; count: number }> = {};

        const startTimestamp = startDate || 0;
        const sorted = surveys.filter(s => s.date >= startTimestamp).sort((a, b) => a.date - b.date);

        sorted.forEach(s => {
            // Compute ISO week ID (YYYY-WNN) from the survey date
            const d = new Date(s.date);
            const jan1 = new Date(d.getFullYear(), 0, 1);
            const daysSinceJan1 = Math.floor((d.getTime() - jan1.getTime()) / (1000 * 60 * 60 * 24));
            const weekNum = Math.ceil((daysSinceJan1 + jan1.getDay() + 1) / 7);
            const computedWeekId = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

            if (!weeks[computedWeekId]) weeks[computedWeekId] = { total: 0, count: 0 };
            weeks[computedWeekId].total += s.average;
            weeks[computedWeekId].count++;
        });

        return Object.entries(weeks)
            .map(([weekId, data]) => ({
                weekId,
                avg: data.total / data.count
            }))
            .sort((a, b) => a.weekId.localeCompare(b.weekId))
            .slice(-12); // Last 12 weeks
    }, [surveys, startDate]);


    if (!metrics) return (
        <div className="flex flex-col items-center justify-center p-4 bg-slate-50 text-slate-400 rounded-xl border border-dashed border-slate-200">
            <div className="flex justify-between items-center w-full mb-4">
                <div></div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Start date</label>
                        <input
                            type="date"
                            value={localDate}
                            onChange={(e) => setLocalDate(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-navy transition-colors"
                        />
                    </div>
                    <button
                        onClick={handleSaveDate}
                        className="bg-brand-navy text-white rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 transition-all"
                    >
                        Apply filter
                    </button>
                    {startDate && (
                        <button
                            onClick={() => { setLocalDate(''); onDateChange(0); }}
                            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>
            <p className="text-sm font-semibold text-slate-500">No data available for this period</p>
            <p className="text-xs mt-1">Try adjusting the date filter or upload TSV files</p>
        </div>
    );

    return (
        <div className="space-y-3 animate-fade-in">

            <div className="ui-card flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h2 className="text-base font-semibold text-slate-900">Satisfaction analytics</h2>
                    <p className="text-xs text-slate-500">Helpdesk survey insights</p>
                    {lastUploadInfo && (
                        <div className={`mt-1.5 ui-chip ${
                            lastUploadInfo.freshness === 'fresh' ? 'bg-green-50 text-green-700' :
                            lastUploadInfo.freshness === 'stale' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-600'
                        }`}>
                            <span className={`w-2 h-2 rounded-full ${
                                lastUploadInfo.freshness === 'fresh' ? 'bg-green-400 animate-pulse' :
                                lastUploadInfo.freshness === 'stale' ? 'bg-amber-400' :
                                'bg-red-400'
                            }`}></span>
                            Last upload: {lastUploadInfo.freshnessLabel}
                            <span className="text-slate-300">•</span>
                            <span className="font-medium ui-metric">{new Date(lastUploadInfo.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Start date</label>
                        <input
                            type="date"
                            value={localDate}
                            onChange={(e) => setLocalDate(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-brand-navy transition-colors"
                        />
                    </div>
                    <button
                        onClick={handleSaveDate}
                        disabled={localDate === (startDate ? new Date(startDate).toISOString().split('T')[0] : '')}
                        className="bg-brand-navy text-white rounded-lg px-3 py-2 text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Save timeframe
                    </button>
                    {startDate && (
                        <button
                            onClick={() => { setLocalDate(''); onDateChange(0); }}
                            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="ui-card !p-3">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Overall satisfaction</h4>
                    <div className="ui-metric text-lg font-extrabold text-slate-900 my-0.5">
                        {metrics.avg} <span className="text-xs font-medium text-slate-400">/ 10</span>
                    </div>
                    <div className="ui-bar"><i style={{ width: `${metrics.percent}%`, backgroundColor: 'var(--secondary-color)' }} /></div>
                    <div className="text-[10px] font-semibold text-slate-500 mt-1.5 ui-metric">{metrics.percent}% · {metrics.count} surveys</div>
                </div>

                <div className="ui-card !p-3">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Resolution (Q1)</h4>
                    <div className="ui-metric text-lg font-extrabold text-slate-900 my-0.5">
                        {metrics.q1Avg} <span className="text-xs font-medium text-slate-400">/ 10</span>
                    </div>
                    <div className="ui-bar"><i style={{ width: `${Number(metrics.q1Avg) * 10}%`, backgroundColor: 'var(--secondary-color)' }} /></div>
                </div>

                <div className="ui-card !p-3">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Professionalism (Q2)</h4>
                    <div className="ui-metric text-lg font-extrabold text-slate-900 my-0.5">
                        {metrics.q2Avg} <span className="text-xs font-medium text-slate-400">/ 10</span>
                    </div>
                    <div className="ui-bar"><i style={{ width: `${Number(metrics.q2Avg) * 10}%`, backgroundColor: 'var(--secondary-color)' }} /></div>
                </div>

                <div className="ui-card !p-3">
                    <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Speed (Q3)</h4>
                    <div className="ui-metric text-lg font-extrabold text-slate-900 my-0.5">
                        {metrics.q3Avg} <span className="text-xs font-medium text-slate-400">/ 10</span>
                    </div>
                    <div className="ui-bar"><i style={{ width: `${Number(metrics.q3Avg) * 10}%`, backgroundColor: 'var(--secondary-color)' }} /></div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

                {/* Trend Chart (CSS-only simple chart) */}
                <div className="lg:col-span-2 ui-card">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Satisfaction trend (last 12 weeks)</h3>
                    <div className="relative h-56">
                        {/* Bar area */}
                        <div className="absolute inset-x-0 top-0 bottom-8 flex gap-1">
                            {weeklyTrend.map((week, idx) => (
                                <div key={week.weekId} className="flex-1 h-full relative group">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-semibold px-2 py-1 rounded-md shadow-sm whitespace-nowrap z-10 ui-metric">
                                        {week.weekId}: {week.avg.toFixed(2)}
                                    </div>
                                    {/* Bar anchored to bottom */}
                                    <div
                                        className="absolute bottom-0 inset-x-0 bg-brand-navy/10 rounded-t-sm transition-all group-hover:bg-brand-navy/20"
                                        style={{ height: `${(week.avg / 10) * 100}%` }}
                                    >
                                        <div className="absolute top-0 w-full bg-brand-navy h-1 rounded-t-sm"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* X-axis labels */}
                        <div className="absolute inset-x-0 bottom-0 h-8 flex gap-1">
                            {weeklyTrend.map((week) => (
                                <div key={week.weekId} className="flex-1 flex items-start justify-center pt-1">
                                    <span className="text-[8px] font-medium text-slate-400 rotate-45 origin-left translate-x-1 ui-metric">{week.weekId.substring(5)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Tech League Table */}
                <div className="ui-card !p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-900">Tech performance</h3>
                    </div>
                    <div className="overflow-y-auto max-h-[400px]">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-white z-10 border-b border-slate-100">
                                <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                    <th className="px-4 py-2">Tech</th>
                                    <th className="px-4 py-2 text-right">Surveys</th>
                                    <th className="px-4 py-2 text-right">Avg rating</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {techPerformance.map((tech, idx) => (
                                    <tr key={tech.name} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold ui-metric ${idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                                                    idx === 1 ? 'bg-slate-100 text-slate-600' :
                                                        idx === 2 ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-400'
                                                    }`}>
                                                    {idx + 1}
                                                </div>
                                                <span className="text-xs font-medium text-slate-700">{tech.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-xs text-slate-500 ui-metric">{tech.count}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className={`ui-chip ui-metric ${Number(tech.avg) >= 9 ? 'bg-green-50 text-brand-green' :
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
