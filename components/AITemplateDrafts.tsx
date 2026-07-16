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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] shadow-xl overflow-hidden flex flex-col border border-slate-200">
                <div className="px-4 py-3 bg-white border-b border-slate-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                            <span aria-hidden>🤖</span> AI template drafts
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Review and add these recurring protocols to your team's library</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto p-4 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeDrafts.map((draft, idx) => (
                            <div key={idx} className="ui-card flex flex-col gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="h-9 w-9 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center text-lg shrink-0">
                                        {draft.icon}
                                    </div>
                                    <div className="flex-grow">
                                        <input
                                            className="w-full text-sm font-semibold text-slate-900 bg-transparent border-none outline-none focus:ring-0 p-0"
                                            value={draft.title}
                                            onChange={(e) => handleUpdate(idx, { title: e.target.value })}
                                        />
                                        <div className="flex gap-2 items-center mt-1">
                                            <select
                                                className="text-[10px] font-semibold bg-slate-100 text-slate-600 rounded-lg px-1.5 py-0.5 border-none outline-none cursor-pointer"
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
                                            <span className="text-[10px] text-slate-400 ui-metric">Est. {draft.estimatedMinutes}m</span>
                                        </div>
                                    </div>
                                </div>

                                <textarea
                                    className="w-full text-sm text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100 focus:border-brand-navy focus:bg-white transition-colors outline-none resize-none h-24"
                                    value={draft.description}
                                    onChange={(e) => handleUpdate(idx, { description: e.target.value })}
                                />

                                <div className="px-3 py-2 rounded-lg border border-slate-100 bg-slate-50">
                                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Strategic impact</div>
                                    <p className="text-xs text-slate-700">{draft.potentialImpact}</p>
                                </div>

                                <button
                                    onClick={() => handleSave(idx)}
                                    disabled={savingIds.includes(idx)}
                                    className="w-full py-2 bg-brand-navy text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                                >
                                    {savingIds.includes(idx) ? (
                                        <div className="h-3 w-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    ) : (
                                        <>Add to library →</>
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-200 bg-white text-center">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AITemplateDrafts;
