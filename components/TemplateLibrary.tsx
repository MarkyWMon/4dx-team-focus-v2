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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-navy/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-50 rounded-[2.5rem] w-full max-w-4xl h-[80vh] shadow-2xl overflow-hidden flex flex-col border-4 border-white">

                {/* Header */}
                <div className="bg-white px-8 py-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-black text-brand-navy uppercase tracking-tighter font-display flex items-center gap-3">
                            <span className="text-2xl">⚡</span> Proactive Power Plays
                        </h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select a high-leverage move for this week</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Filters */}
                <div className="px-8 py-4 bg-white border-b border-slate-100 flex flex-col md:flex-row gap-4 shrink-0 overflow-x-auto">
                    <div className="relative flex-grow max-w-md">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-brand-navy/10 outline-none"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilter(cat)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === cat ? 'bg-brand-navy text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                            >
                                {cat === 'all' ? 'All Types' : getTemplateCategoryLabel(cat)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-grow overflow-y-auto p-8 bg-slate-50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredTemplates.map(template => (
                            <div
                                key={template.id}
                                onClick={() => onSelect(template)}
                                className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:scale-[1.02] hover:border-brand-navy transition-all cursor-pointer group flex flex-col h-full"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="h-12 w-12 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl shadow-inner group-hover:bg-brand-red group-hover:text-white transition-colors">
                                        {template.icon}
                                    </div>
                                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getCategoryColor(template.category)}`}>
                                        {getTemplateCategoryLabel(template.category)}
                                    </span>
                                </div>

                                <h3 className="font-bold text-slate-900 leading-tight mb-2 group-hover:text-brand-navy">{template.title}</h3>
                                <p className="text-xs text-slate-500 mb-6 flex-grow">{template.description}</p>

                                <div className="space-y-3 pt-4 border-t border-slate-50">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{template.estimatedMinutes} mins</span>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <svg className="w-3 h-3 text-brand-green mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        <span className="text-[10px] font-bold text-brand-green leading-tight">{template.potentialImpact}</span>
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
