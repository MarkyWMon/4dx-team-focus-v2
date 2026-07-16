import React, { useState } from 'react';
import { getCategoryColor, getTemplateCategoryLabel } from '../data/commitmentTemplates';
import { CommitmentCategory, CommitmentTemplate } from '../types';

interface TemplateLibraryProps {
    onSelect: (template: CommitmentTemplate) => void;
    onClose: () => void;
    templates: CommitmentTemplate[];
}

const TemplateLibrary: React.FC<TemplateLibraryProps> = ({ onSelect, onClose, templates }) => {
    const [filter, setFilter] = useState<CommitmentCategory | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const categories: (CommitmentCategory | 'all')[] = ['all', 'floor_walk', 'preventive_maintenance', 'documentation', 'training'];

    const filteredTemplates = templates.filter(t => {
        const matchesCategory = filter === 'all' || t.category === filter;
        const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.description.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl w-full max-w-4xl h-[80vh] shadow-xl overflow-hidden flex flex-col border border-slate-200">

                {/* Header */}
                <div className="bg-white px-4 py-3 border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                            <span aria-hidden>⚡</span> Template library
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">Select a high-leverage move for this week</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Filters */}
                <div className="px-4 py-3 bg-white border-b border-slate-200 flex flex-col md:flex-row gap-3 shrink-0 overflow-x-auto">
                    <div className="relative flex-grow max-w-md">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:border-brand-navy outline-none transition-colors"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilter(cat)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${filter === cat ? 'bg-brand-navy text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                                {cat === 'all' ? 'All types' : getTemplateCategoryLabel(cat)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-grow overflow-y-auto p-4 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filteredTemplates.map(template => (
                            <div
                                key={template.id}
                                onClick={() => onSelect(template)}
                                className="bg-white p-4 rounded-xl border border-slate-200 hover:border-brand-navy hover:shadow-sm transition-all cursor-pointer group flex flex-col h-full"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="h-9 w-9 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center text-lg">
                                        {template.icon}
                                    </div>
                                    <span className={`ui-chip border ${getCategoryColor(template.category)}`}>
                                        {getTemplateCategoryLabel(template.category)}
                                    </span>
                                </div>

                                <h3 className="text-sm font-semibold text-slate-900 leading-tight mb-1 group-hover:text-brand-navy">{template.title}</h3>
                                <p className="text-xs text-slate-500 mb-3 flex-grow">{template.description}</p>

                                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                                    <div className="flex items-center gap-1.5">
                                        <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide ui-metric">{template.estimatedMinutes} mins</span>
                                    </div>
                                    <div className="flex items-start gap-1.5">
                                        <svg className="w-3 h-3 text-brand-green mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        <span className="text-[10px] font-medium text-brand-green leading-tight">{template.potentialImpact}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TemplateLibrary;
