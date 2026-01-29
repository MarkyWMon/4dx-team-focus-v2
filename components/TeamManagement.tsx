
import React, { useState, useEffect } from 'react';
import { TeamMember, LeadMeasure, WIGConfig, CommitmentTemplate, CommitmentCategory, LeadMeasureDefinition, BrandingConfig, DEFAULT_BRANDING } from '../types';
import { StorageService } from '../services/storage';
import { getTemplateCategoryLabel, getCategoryColor } from '../data/commitmentTemplates';
import { AIService } from '../services/ai';
import AITemplateDrafts from './AITemplateDrafts';

interface TeamManagementProps {
  members: TeamMember[];
  currentUser: TeamMember;
  leadMeasures: LeadMeasure[];
  surveys: any[];
  onAddMember: (name: string, email: string, role: 'ADMIN' | 'MANAGER' | 'STAFF') => void;
  onRemoveMember: (id: string) => void;
  onRefreshTickets: () => void;
  onAddMeasure: any;
  onUpdateMeasure: any;
  onDeleteMeasure: any;
  wigConfig: WIGConfig | null;
  onUpdateWIGConfig: (config: WIGConfig) => void;
  templates: CommitmentTemplate[];
  branding: BrandingConfig;
  onUpdateBranding: (config: BrandingConfig) => void;
}

const TeamManagement: React.FC<TeamManagementProps> = ({
  members,
  currentUser,
  onAddMember,
  onRemoveMember,
  wigConfig,
  onUpdateWIGConfig,
  templates,
  branding,
  onUpdateBranding
}) => {
  const [editingTemplate, setEditingTemplate] = useState<Partial<CommitmentTemplate> | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MANAGER' | 'STAFF'>('STAFF');

  // WIG Config State
  const [wigTitle, setWigTitle] = useState(wigConfig?.title || 'Customer Happiness');
  const [wigTarget, setWigTarget] = useState(wigConfig?.targetValue || 4.8);
  const [wigCurrent, setWigCurrent] = useState(wigConfig?.currentValue || 4.88);
  const [wigDescription, setWigDescription] = useState(wigConfig?.description || 'Survey Score > 4.8');
  const [wigType, setWigType] = useState<'number' | 'percentage'>(wigConfig?.metricType as any || 'number');
  const [leadMeasures, setLeadMeasures] = useState<LeadMeasureDefinition[]>(wigConfig?.leadMeasures || []);
  const [isWigSaved, setIsWigSaved] = useState(false);

  // AI Architect State
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [aiDrafts, setAiDrafts] = useState<Omit<CommitmentTemplate, 'id'>[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  const [isBrandingSaved, setIsBrandingSaved] = useState(false);

  // Branding State
  const [primaryColor, setPrimaryColor] = useState(branding?.primaryColor || '');
  const [secondaryColor, setSecondaryColor] = useState(branding?.secondaryColor || '');
  const [successColor, setSuccessColor] = useState(branding?.successColor || '');
  const [warningColor, setWarningColor] = useState(branding?.warningColor || '');
  const [titleFont, setTitleFont] = useState(branding?.titleFont || '');
  const [bodyFont, setBodyFont] = useState(branding?.bodyFont || '');
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl || '');
  // Collapsible Sections State
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    roster: true,
    wig: false,
    library: false,
    branding: false
  });

  const toggleSection = (section: string) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const Chevron = ({ isOpen }: { isOpen: boolean }) => (
    <svg
      className={`w-5 h-5 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
    </svg>
  );

  useEffect(() => {
    if (branding) {
      setPrimaryColor(branding.primaryColor);
      setSecondaryColor(branding.secondaryColor);
      setSuccessColor(branding.successColor || '#82BC00');
      setWarningColor(branding.warningColor || '#F37A1F');
      setTitleFont(branding.titleFont);
      setBodyFont(branding.bodyFont);
      setLogoUrl(branding.logoUrl || '');
    }
  }, [branding]);

  useEffect(() => {
    if (wigConfig) {
      setWigTitle(wigConfig.title);
      setWigTarget(wigConfig.targetValue);
      setWigCurrent(wigConfig.currentValue);
      setWigDescription(wigConfig.description);
      setWigType(wigConfig.metricType as any || 'number');
      setLeadMeasures(wigConfig.leadMeasures || []);
    }
  }, [wigConfig]);

  useEffect(() => {
    setPrimaryColor(branding.primaryColor);
    setSecondaryColor(branding.secondaryColor);
    setSuccessColor(branding.successColor || '#82BC00');
    setWarningColor(branding.warningColor || '#F37A1F');
    setTitleFont(branding.titleFont);
    setBodyFont(branding.bodyFont);
    setLogoUrl(branding.logoUrl || '');
  }, [branding]);



  const handleSaveBranding = () => {
    onUpdateBranding({
      primaryColor,
      secondaryColor,
      successColor,
      warningColor,
      titleFont,
      bodyFont,
      logoUrl,
      updatedAt: Date.now()
    });
    setIsBrandingSaved(true);
    setTimeout(() => setIsBrandingSaved(false), 2000);
  };

  const handleRestoreBranding = () => {
    if (confirm("Restore branding to Bhasvic defaults?")) {
      const { DEFAULT_BRANDING } = import('../types');
      // Note: import() in sync handler is tricky, but we have it in scope via props/parent usually.
      // Since it's a small object, I'll just use the known defaults or pass it in.
      onUpdateBranding({
        primaryColor: '#E30613',
        secondaryColor: '#003057',
        successColor: '#82BC00',
        warningColor: '#F37A1F',
        titleFont: 'Poppins',
        bodyFont: 'Roboto',
        logoUrl: '',
        updatedAt: Date.now()
      });
    }
  };

  const handleSaveWIG = () => {
    onUpdateWIGConfig({
      id: 'wig-annual-1',
      title: wigTitle,
      description: wigDescription,
      metricType: wigType,
      currentValue: Number(wigCurrent),
      targetValue: Number(wigTarget),
      leadMeasures,
      currentScore: (wigConfig?.currentScore || 0),
      targetScore: (wigConfig?.targetScore || 0),
      startDate: wigConfig?.startDate || Date.now(),
      endDate: wigConfig?.endDate || Date.now()
    });
    setIsWigSaved(true);
    setTimeout(() => setIsWigSaved(false), 2000);
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName || !inviteEmail) return;
    onAddMember(inviteName, inviteEmail.toLowerCase().trim(), inviteRole);
    setInviteName('');
    setInviteEmail('');
  };

  const handleGenerateAIDrafts = async () => {
    if (!wigConfig) return;
    setIsGeneratingDrafts(true);
    try {
      const categories: CommitmentCategory[] = ['floor_walk', 'preventive_maintenance', 'documentation', 'training', 'infrastructure', 'other'];
      const drafts = await AIService.generateTemplateDrafts(wigConfig, categories);
      if (drafts.length === 0) {
        alert("The AI Strategy Architect couldn't generate drafts right now. Check your API key and WIG configuration.");
        return;
      }
      setAiDrafts(drafts);
      setShowDrafts(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingDrafts(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-20">
      {/* Team Members Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div
          className="p-8 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('roster')}
        >
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-display">Team Members</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              {expanded.roster ? 'Manage team access and roles' : `${members.length} Members`}
            </p>
          </div>
          <div className="text-slate-300 group-hover:text-brand-navy transition-colors">
            <Chevron isOpen={expanded.roster} />
          </div>
        </div>

        {expanded.roster && (
          <div className="p-6 pt-0 animate-fade-in">
            <form onSubmit={handleInvite} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
              <input
                className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-4 focus:ring-brand-navy/5 transition-all"
                placeholder="Staff Name"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
              />
              <input
                className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-4 focus:ring-brand-navy/5 transition-all"
                placeholder="BHASVIC Email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
              />
              <select
                className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none"
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as any)}
              >
                <option value="STAFF">Team Member</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Administrator</option>
              </select>
              <button type="submit" className="bg-brand-navy text-white font-semibold text-sm rounded-lg hover:bg-black transition-all shadow-md active:scale-95 px-4 py-2.5">
                Authorise Access
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                <div key={m.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-all group border-l-4 border-l-slate-100 hover:border-l-brand-navy">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="h-9 w-9 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center font-semibold text-xs shadow-sm group-hover:bg-brand-navy group-hover:text-white transition-colors">
                      {m.avatar}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-semibold text-slate-900 leading-none truncate">{m.name}</p>
                      <p className="text-[10px] font-semibold text-brand-red uppercase mt-1 tracking-wide">{m.role}</p>
                    </div>
                  </div>
                  <button onClick={() => { if (confirm(`Revoke access for ${m.name}?`)) onRemoveMember(m.id); }} className="p-1.5 text-slate-300 hover:text-brand-red transition-all">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* Annual WIG Configuration Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div
          className="p-8 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('wig')}
        >
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-display">WIG Configuration</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Goal setting & lag/lead definitions</p>
          </div>
          <div className="flex items-center gap-6">
            {isWigSaved && <span className="text-brand-green font-black uppercase text-[10px] animate-pulse">Configuration Saved</span>}
            <div className="text-slate-300 group-hover:text-brand-navy transition-colors">
              <Chevron isOpen={expanded.wig} />
            </div>
          </div>
        </div>

        {expanded.wig && (
          <div className="p-8 pt-0 animate-fade-in">
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="md:col-span-2 lg:col-span-1">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 font-display">WIG Title</label>
                  <input className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-brand-navy" value={wigTitle} onChange={(e) => setWigTitle(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 font-display">Target Value</label>
                  <input type="number" step="0.01" className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-brand-navy" value={wigTarget} onChange={(e) => setWigTarget(Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 font-display">Current Value</label>
                  <input type="number" step="0.01" className="w-full p-4 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-brand-navy" value={wigCurrent} onChange={(e) => setWigCurrent(Number(e.target.value))} />
                </div>
              </div>

              <div className="mt-12">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-sm font-black text-brand-navy uppercase tracking-widest font-display">Weekly Lead Measures</h4>
                  <button onClick={() => setLeadMeasures([...leadMeasures, { id: `lead-${Date.now()}`, name: 'New Measure', target: 1, unit: 'Actions' }])} className="text-[10px] font-black text-white bg-brand-navy px-4 py-2 rounded-xl uppercase tracking-widest hover:bg-black transition-colors shadow-sm">
                    + Add Measure
                  </button>
                </div>
                <div className="space-y-4">
                  {leadMeasures.map((measure, index) => (
                    <div key={measure.id} className="bg-white p-6 rounded-2xl border border-slate-100 flex flex-col gap-4 shadow-sm">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-1">
                          <label className="block text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Name</label>
                          <input className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs outline-none" value={measure.name} onChange={(e) => { const next = [...leadMeasures]; next[index].name = e.target.value; setLeadMeasures(next); }} />
                        </div>
                        <div>
                          <label className="block text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Target</label>
                          <input type="number" className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs outline-none" value={measure.target} onChange={(e) => { const next = [...leadMeasures]; next[index].target = Number(e.target.value); setLeadMeasures(next); }} />
                        </div>
                        <div className="flex items-end gap-2">
                          <div className="flex-grow">
                            <label className="block text-[8px] font-black uppercase text-slate-400 tracking-widest mb-1">Unit</label>
                            <input className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-xs outline-none" value={measure.unit} onChange={(e) => { const next = [...leadMeasures]; next[index].unit = e.target.value; setLeadMeasures(next); }} />
                          </div>
                          <button onClick={() => setLeadMeasures(leadMeasures.filter((_, i) => i !== index))} className="p-3 text-slate-300 hover:text-brand-red transition-colors bg-slate-50 rounded-xl">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-12 text-right pt-8 border-t border-slate-200">
                <button onClick={handleSaveWIG} className="bg-brand-navy text-white px-10 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all shadow-xl font-display">
                  Store WIG Configuration
                </button>
              </div>
            </div>
          </div>
        )}
      </div>


      {/* Strategy Library Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div
          className="p-8 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('library')}
        >
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-display">Strategy Library</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">High-leverage action templates</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg text-[8px] font-black text-slate-400 uppercase tracking-widest">
              {templates.length} Templates Active
            </div>
            <div className="text-slate-300 group-hover:text-brand-navy transition-colors">
              <Chevron isOpen={expanded.library} />
            </div>
          </div>
        </div>

        {expanded.library && (
          <div className="p-8 pt-0 animate-fade-in">
            <div className="flex justify-end gap-4 mb-8">
              <button
                onClick={handleGenerateAIDrafts}
                disabled={isGeneratingDrafts}
                className="bg-brand-navy/5 text-brand-navy px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-brand-navy hover:text-white transition-all border border-brand-navy/10 flex items-center gap-2 disabled:opacity-50"
              >
                {isGeneratingDrafts ? 'Designing...' : '🤖 AI Architect'}
              </button>
              <button
                onClick={() => { setEditingTemplate({}); setShowTemplateModal(true); }}
                className="bg-brand-navy text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-black transition-all shadow-lg"
              >
                + Create Template
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {templates.map(t => (
                <div key={t.id} className="p-6 bg-white border border-slate-100 rounded-[2rem] hover:shadow-2xl transition-all group flex flex-col h-full hover:-translate-y-1 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center text-xl border border-slate-100">
                      {t.icon}
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getCategoryColor(t.category)}`}>
                      {getTemplateCategoryLabel(t.category)}
                    </span>
                  </div>
                  <h3 className="font-black text-slate-900 leading-tight mb-2 uppercase text-sm font-display tracking-tight">{t.title}</h3>
                  <p className="text-xs text-slate-500 mb-8 flex-grow leading-relaxed">{t.description}</p>
                  <div className="flex items-center justify-between pt-6 border-t border-slate-50 mt-auto">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-brand-green"></div>
                      <span className="text-[9px] font-bold text-slate-400 tracking-widest uppercase">Protocol</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setEditingTemplate(t); setShowTemplateModal(true); }} className="p-2 text-slate-400 hover:text-brand-navy transition-colors bg-slate-100 rounded-lg border border-slate-200">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button onClick={() => { if (confirm('Delete template?')) StorageService.deleteTemplate(t.id); }} className="p-2 text-slate-400 hover:text-brand-red transition-colors bg-slate-100 rounded-lg border border-slate-200">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Corporate Branding Section */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div
          className="p-8 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('branding')}
        >
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase font-display">Corporate Branding</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Interface personalisation & typography</p>
          </div>
          <div className="flex items-center gap-6">
            {isBrandingSaved && <span className="text-brand-green font-black uppercase text-[10px] animate-pulse">Brand Updated</span>}
            <div className="text-slate-300 group-hover:text-brand-navy transition-colors">
              <Chevron isOpen={expanded.branding} />
            </div>
          </div>
        </div>

        {expanded.branding && (
          <div className="p-8 pt-0 animate-fade-in">
            <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Visual Palette</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2 font-display">Primary Action</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent" />
                        <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-grow p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-mono uppercase" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2 font-display">Secondary Accent</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent" />
                        <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="flex-grow p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-mono uppercase" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 mt-4">
                    <div>
                      <label className="block text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2 font-display">Success/Score</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={successColor} onChange={e => setSuccessColor(e.target.value)} className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent" />
                        <input type="text" value={successColor} onChange={e => setSuccessColor(e.target.value)} className="flex-grow p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-mono uppercase" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2 font-display">Warning/Lag</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={warningColor} onChange={e => setWarningColor(e.target.value)} className="h-10 w-10 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent" />
                        <input type="text" value={warningColor} onChange={e => setWarningColor(e.target.value)} className="flex-grow p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-mono uppercase" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Google Typography & Logo</h4>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2 font-display">Title Font</label>
                      <input type="text" value={titleFont} onChange={e => setTitleFont(e.target.value)} placeholder="e.g. Poppins" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-bold font-display" />
                    </div>
                    <div>
                      <label className="block text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2 font-display">Body Font</label>
                      <input type="text" value={bodyFont} onChange={e => setBodyFont(e.target.value)} placeholder="e.g. Roboto" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs font-medium" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[8px] font-black uppercase text-slate-500 tracking-widest mb-2 font-display">Logo URL (Transparent PNG recommended)</label>
                    <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-[10px] font-medium" />
                  </div>
                  <p className="text-[8px] text-slate-400 italic font-bold">The system will auto-import the best weights for your choices.</p>
                </div>
              </div>

              <div className="mt-10 flex justify-between items-center pt-8 border-t border-slate-200">
                <button onClick={handleRestoreBranding} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-brand-red transition-colors bg-white px-6 py-2 rounded-xl border border-slate-200 shadow-sm">Restore Original Defaults</button>
                <button onClick={handleSaveBranding} className="bg-brand-navy text-white px-10 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all shadow-lg font-display">
                  Apply & Push Branding
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showTemplateModal && editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/90 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl p-10 max-h-[90vh] overflow-y-auto border-4 border-white">
            <h3 className="text-2xl font-black text-brand-navy uppercase tracking-tighter mb-8 font-display">{editingTemplate.id ? 'Refine Template' : 'Architect New Move'}</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 font-display">Draft Title</label>
                <input value={editingTemplate.title || ''} onChange={e => setEditingTemplate({ ...editingTemplate, title: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm font-bold focus:border-brand-navy outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 font-display">Action Description</label>
                <textarea value={editingTemplate.description || ''} onChange={e => setEditingTemplate({ ...editingTemplate, description: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm font-medium focus:border-brand-navy outline-none h-32 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 font-display">Category</label>
                  <select value={editingTemplate.category || 'other'} onChange={e => setEditingTemplate({ ...editingTemplate, category: e.target.value as any })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-xs font-black focus:border-brand-navy outline-none">
                    {['floor_walk', 'preventive_maintenance', 'documentation', 'training', 'infrastructure', 'other'].map(c => (
                      <option key={c} value={c}>{getTemplateCategoryLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 font-display">Icon</label>
                  <input value={editingTemplate.icon || ''} onChange={e => setEditingTemplate({ ...editingTemplate, icon: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-[1.25rem] text-sm font-bold focus:border-brand-navy outline-none" />
                </div>
              </div>
            </div>
            <div className="mt-10 flex gap-4">
              <button onClick={() => setShowTemplateModal(false)} className="flex-1 py-4 rounded-[1.25rem] text-[10px] font-black uppercase text-slate-400 bg-slate-100 hover:bg-slate-200 transition-colors tracking-widest">Cancel</button>
              <button onClick={() => { if (editingTemplate.id) { StorageService.updateTemplate(editingTemplate.id, editingTemplate); } else { StorageService.addTemplate(editingTemplate as any); } setShowTemplateModal(false); }} className="flex-[2] py-4 rounded-[1.25rem] text-[10px] font-black uppercase text-white bg-brand-navy hover:bg-black transition-colors tracking-widest shadow-xl">
                {editingTemplate.id ? 'Update Strategy' : 'Author Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDrafts && (
        <AITemplateDrafts drafts={aiDrafts} onSave={async (tmpl) => { await StorageService.addTemplate(tmpl); }} onClose={() => setShowDrafts(false)} />
      )}
    </div>
  );
};

export default TeamManagement;
