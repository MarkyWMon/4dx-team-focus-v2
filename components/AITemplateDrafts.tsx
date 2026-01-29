import React, { useState } from 'react';
import { CommitmentTemplate, CommitmentCategory } from '../types';
import { getTemplateCategoryLabel } from '../data/commitmentTemplates';

interface AITemplateDraftsProps {
    drafts: Omit<CommitmentTemplate, 'id'>[];
    onSave: (template: Omit<CommitmentTemplate, 'id'>) => Promise<void>;
    onClose: () => void;
}

const AITemplateDrafts: React.FC<AITemplateDraftsProps> = ({ drafts, onSave, onClose }) => {
    const [activeDrafts, setActiveDrafts] = useState<Omit<CommitmentTemplate, 'id'>[]>(drafts);
    const [savingIds, setSavingIds] = useState<number[]>([]);

    const handleUpdate = (index: number, updates: Partial<Omit<CommitmentTemplate, 'id'>>) => {
        const next = [...activeDrafts];
        next[index] = { ...next[index], ...updates };
        setActiveDrafts(next);
    };

    const handleSave = async (index: number) => {
        setSavingIds(prev => [...prev, index]);
        try {
            await onSave(activeDrafts[index]);
            setActiveDrafts(prev => prev.filter((_, i) => i !== index));
        } finally {
            setSavingIds(prev => prev.filter(id => id !== index));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy bg-opacity-90 backdrop-blur-md">
            <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col border-4 border-white">
                <div className="p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="h-10 w-10 bg-brand-navy text-white rounded-xl flex items-center justify-center text-xl">🤖</span>
                            <h3 className="text-2xl font-black text-brand-navy uppercase tracking-tighter">AI Strategy Playbook Drafts</h3>
                        </div>
                        <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-widest pl-13 text-center">Review and add these recurring protocols to your team's library</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-300 hover:text-brand-red transition-colors">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto p-8 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {activeDrafts.map((draft, idx) => (
                            <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4 hover:shadow-xl transition-all group">
                                <div className="flex items-start gap-4">
                                    <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-transform">
                                        {draft.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <input
                                            className="w-full text-lg font-black text-brand-navy uppercase tracking-tight bg-transparent border-none outline-none focus:ring-0 p-0"
                                            value={draft.title}
                                            onChange={(e) => handleUpdate(idx, { title: e.target.value })}
                                        />
                                        <div className="flex gap-2 items-center mt-1">
                                            <select
                                                className="text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 border-none outline-none cursor-pointer"
                                                value={draft.category}
                                                onChange={(e) => handleUpdate(idx, { category: e.target.value as CommitmentCategory })}
                                            >
                                                <option value="floor_walk">Floor Walk</option>
                                                <option value="preventive_maintenance">Preventive Maintenance</option>
                                                <option value="documentation">Documentation</option>
                                                <option value="training">Training</option>
                                                <option value="infrastructure">Infrastructure</option>
                                                <option value="other">Other</option>
                                            </select>
                                            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Est. {draft.estimatedMinutes}m</span>
                                        </div>
                                    </div>
                                </div>

                                <textarea
                                    className="w-full text-sm font-medium text-slate-600 bg-slate-50/50 rounded-xl p-4 border border-transparent focus:border-slate-100 focus:bg-white transition-all outline-none resize-none h-24"
                                    value={draft.description}
                                    onChange={(e) => handleUpdate(idx, { description: e.target.value })}
                                />

                                <div className="bg-brand-navy/5 p-4 rounded-2xl border border-brand-navy/5">
                                    <div className="text-[8px] font-black text-brand-navy uppercase tracking-widest mb-1 opacity-50">Strategic Impact</div>
                                    <p className="text-[10px] italic font-bold text-brand-navy">{draft.potentialImpact}</p>
                                </div>

                                <button
                                    onClick={() => handleSave(idx)}
                                    disabled={savingIds.includes(idx)}
                                    className="w-full py-3 bg-brand-navy text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2"
                                >
                                    {savingIds.includes(idx) ? (
                                        <div className="h-3 w-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <>Add to Library <span className="text-brand-red">→</span></>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 bg-white text-center">
                    <button
                        onClick={onClose}
                        className="px-12 py-4 text-slate-400 font-bold uppercase tracking-widest text-xs hover:text-slate-900 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AITemplateDrafts;
