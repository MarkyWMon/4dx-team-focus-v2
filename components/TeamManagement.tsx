
import React, { useState, useEffect } from 'react';
import { TeamMember, WIGConfig, CommitmentTemplate, CommitmentCategory, LeadMeasureDefinition, BrandingConfig, DEFAULT_BRANDING, Commitment } from '../types';
import { StorageService } from '../services/storage';
import { getTemplateCategoryLabel, getCategoryColor } from '../data/commitmentTemplates';
import { AIService } from '../services/ai';
import AITemplateDrafts from './AITemplateDrafts';
import MemberDetailModal from './MemberDetailModal';

interface TeamManagementProps {
  members: TeamMember[];
  currentUser: TeamMember;
  commitments: Commitment[];
  onAddMember: (name: string, email: string, role: 'ADMIN' | 'MANAGER' | 'STAFF') => void;
  onRemoveMember: (id: string) => void;
  wigConfig: WIGConfig | null;
  onUpdateWIGConfig: (config: WIGConfig) => void;
  templates: CommitmentTemplate[];
  branding: BrandingConfig;
  onUpdateBranding: (config: BrandingConfig) => void;
}

  const TeamManagement: React.FC<TeamManagementProps> = ({
  members,
  currentUser,
  commitments,
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
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
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
  const [wigDayOfWeek, setWigDayOfWeekState] = useState<number>(wigConfig?.wigDayOfWeek ?? 1);
  const [isWigSaved, setIsWigSaved] = useState(false);

  // AI Architect State
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [aiDrafts, setAiDrafts] = useState<Omit<CommitmentTemplate, 'id'>[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);

  const [isBrandingSaved, setIsBrandingSaved] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<{ merged: number; commitmentsMoved: number } | null>(null);

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
      className={`w-4 h-4 transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
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
      setWigDayOfWeekState(wigConfig.wigDayOfWeek ?? 1);
    }
  }, [wigConfig]);





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
      onUpdateBranding({ ...DEFAULT_BRANDING, updatedAt: Date.now() });
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
      wigDayOfWeek,
      currentScore: (wigConfig?.currentScore || 0),
      targetScore: (wigConfig?.targetScore || 0),
      startDate: wigConfig?.startDate || Date.now(),
      endDate: wigConfig?.endDate || Date.now()
    });
    setIsWigSaved(true);
    setTimeout(() => setIsWigSaved(false), 2000);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName || !inviteEmail || isInviting) return;

    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    try {
      await onAddMember(inviteName, inviteEmail.toLowerCase().trim(), inviteRole);
      setInviteName('');
      setInviteEmail('');
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (err: any) {
      console.error("Invite Error:", err);
      setInviteError(err.message || "Failed to authorize access. Check permissions.");
    } finally {
      setIsInviting(false);
    }
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
    <div className="space-y-3 animate-fade-in max-w-5xl mx-auto pb-20">
      {/* Team Members Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div
          className="px-4 py-3 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('roster')}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">Team members</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {expanded.roster ? 'Manage team access and roles' : `${members.length} members`}
            </p>
          </div>
          <div className="text-slate-400 group-hover:text-brand-navy transition-colors">
            <Chevron isOpen={expanded.roster} />
          </div>
        </div>

        {expanded.roster && (
          <div className="px-4 pb-4 animate-fade-in">
            <form onSubmit={handleInvite} className="space-y-2 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <input
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-brand-navy transition-colors"
                  placeholder="Staff name"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  disabled={isInviting}
                />
                <input
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-brand-navy transition-colors"
                  placeholder="BHASVIC email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  disabled={isInviting}
                />
                <select
                  className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-brand-navy"
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as any)}
                  disabled={isInviting}
                >
                  <option value="STAFF">Team Member</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Administrator</option>
                </select>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="bg-brand-navy text-white font-semibold text-sm rounded-lg hover:opacity-90 transition-all px-4 py-2 disabled:opacity-40 flex items-center justify-center"
                >
                  {isInviting ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Authorising...
                    </span>
                  ) : "Authorise access"}
                </button>
              </div>

              {inviteError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold animate-shake">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {inviteError}
                </div>
              )}

              {inviteSuccess && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 text-green-700 rounded-lg text-xs font-semibold animate-fade-in">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Staff member added successfully!
                </div>
              )}
            </form>

            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={async () => {
                  if (!confirm('This will merge duplicate member records in Firestore, reassign any commitments to the canonical record, and delete orphans. Continue?')) return;
                  setIsMerging(true);
                  setMergeResult(null);
                  try {
                    const result = await StorageService.mergeAndCleanupMembers();
                    setMergeResult(result);
                  } catch (e: any) {
                    setInviteError('Merge failed: ' + e.message);
                  } finally {
                    setIsMerging(false);
                  }
                }}
                disabled={isMerging}
                className="text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {isMerging ? (
                  <>
                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Merging...
                  </>
                ) : '🔄 Merge duplicates'}
              </button>
              {mergeResult && (
                <span className="text-xs font-semibold text-brand-green animate-fade-in">
                  ✓ Merged {mergeResult.merged} duplicates, moved {mergeResult.commitmentsMoved} commitments
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {members.sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-brand-navy transition-colors group">
                  <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => setSelectedMember(m)}>
                    <div className="h-8 w-8 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-semibold text-xs group-hover:bg-brand-navy group-hover:text-white transition-colors shrink-0">
                      {m.avatar}
                    </div>
                    <div className="overflow-hidden">
                      <p className="text-sm font-semibold text-slate-900 leading-none truncate">{m.name}</p>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mt-1">{m.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setSelectedMember(m)} className="p-1.5 text-slate-400 hover:text-brand-navy transition-colors" title="View details">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </button>
                    <button onClick={() => { if (confirm(`Revoke access for ${m.name}?`)) onRemoveMember(m.id); }} className="p-1.5 text-slate-400 hover:text-brand-red transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>


      {/* Annual WIG Configuration Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div
          className="px-4 py-3 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('wig')}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">WIG configuration</h2>
            <p className="text-xs text-slate-500 mt-0.5">Goal setting & lag/lead definitions</p>
          </div>
          <div className="flex items-center gap-4">
            {isWigSaved && <span className="text-brand-green font-semibold text-xs animate-pulse">Configuration saved</span>}
            <div className="text-slate-400 group-hover:text-brand-navy transition-colors">
              <Chevron isOpen={expanded.wig} />
            </div>
          </div>
        </div>

        {expanded.wig && (
          <div className="px-4 pb-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="md:col-span-2 lg:col-span-1">
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">WIG title</label>
                <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" value={wigTitle} onChange={(e) => setWigTitle(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Target value</label>
                <input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none ui-metric" value={wigTarget} onChange={(e) => setWigTarget(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Current value</label>
                <input type="number" step="0.01" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none ui-metric" value={wigCurrent} onChange={(e) => setWigCurrent(Number(e.target.value))} />
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl border border-slate-100 bg-slate-50">
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">WIG meeting day</label>
              <p className="text-xs text-slate-500 mb-2">Each "WIG week" runs from this day to the day before. Commitments and scoring align to this cycle.</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 1, label: 'Mon' },
                  { v: 2, label: 'Tue' },
                  { v: 3, label: 'Wed' },
                  { v: 4, label: 'Thu' },
                  { v: 5, label: 'Fri' },
                  { v: 6, label: 'Sat' },
                  { v: 0, label: 'Sun' },
                ].map(d => (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => setWigDayOfWeekState(d.v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${wigDayOfWeek === d.v
                      ? 'bg-brand-navy text-white border-brand-navy'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-brand-navy'
                      }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-semibold text-slate-900">Weekly lead measures</h4>
                <button onClick={() => setLeadMeasures([...leadMeasures, { id: `lead-${Date.now()}`, name: 'New Measure', target: 1, unit: 'Actions' }])} className="text-sm font-semibold text-white bg-brand-navy px-3 py-2 rounded-lg hover:opacity-90 transition-all">
                  + Add measure
                </button>
              </div>
              <div className="space-y-2">
                {leadMeasures.map((measure, index) => (
                  <div key={measure.id} className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col gap-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="md:col-span-1">
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Name</label>
                        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" value={measure.name} onChange={(e) => { const next = [...leadMeasures]; next[index].name = e.target.value; setLeadMeasures(next); }} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Target</label>
                        <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none ui-metric" value={measure.target} onChange={(e) => { const next = [...leadMeasures]; next[index].target = Number(e.target.value); setLeadMeasures(next); }} />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-grow">
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Unit</label>
                          <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" value={measure.unit} onChange={(e) => { const next = [...leadMeasures]; next[index].unit = e.target.value; setLeadMeasures(next); }} />
                        </div>
                        <button onClick={() => setLeadMeasures(leadMeasures.filter((_, i) => i !== index))} className="p-2 text-slate-400 hover:text-brand-red transition-colors hover:bg-slate-100 rounded-lg">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 text-right pt-3 border-t border-slate-100">
              <button onClick={handleSaveWIG} className="bg-brand-navy text-white px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-all">
                Store WIG configuration
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Strategy Library Section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div
          className="px-4 py-3 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('library')}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">Strategy library</h2>
            <p className="text-xs text-slate-500 mt-0.5">High-leverage action templates</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex ui-chip bg-slate-100 text-slate-500 ui-metric">
              {templates.length} templates active
            </span>
            <div className="text-slate-400 group-hover:text-brand-navy transition-colors">
              <Chevron isOpen={expanded.library} />
            </div>
          </div>
        </div>

        {expanded.library && (
          <div className="px-4 pb-4 animate-fade-in">
            <div className="flex justify-end gap-2 mb-4">
              <button
                onClick={handleGenerateAIDrafts}
                disabled={isGeneratingDrafts}
                className="text-slate-600 hover:bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg font-semibold text-sm transition-colors flex items-center gap-2 disabled:opacity-40"
              >
                {isGeneratingDrafts ? 'Designing...' : '🤖 AI architect'}
              </button>
              <button
                onClick={() => { setEditingTemplate({}); setShowTemplateModal(true); }}
                className="bg-brand-navy text-white px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-all"
              >
                + Create template
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map(t => (
                <div key={t.id} className="ui-card hover:shadow-sm transition-shadow group flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <div className="h-9 w-9 bg-slate-50 rounded-lg flex items-center justify-center text-lg border border-slate-100">
                      {t.icon}
                    </div>
                    <span className={`ui-chip border ${getCategoryColor(t.category)}`}>
                      {getTemplateCategoryLabel(t.category)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 leading-tight mb-1">{t.title}</h3>
                  <p className="text-xs text-slate-500 mb-3 flex-grow leading-relaxed">{t.description}</p>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-auto">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-brand-green"></div>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Protocol</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingTemplate(t); setShowTemplateModal(true); }} className="p-1.5 text-slate-400 hover:text-brand-navy hover:bg-slate-100 transition-colors rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button onClick={() => { if (confirm('Delete template?')) StorageService.deleteTemplate(t.id); }} className="p-1.5 text-slate-400 hover:text-brand-red hover:bg-slate-100 transition-colors rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div
          className="px-4 py-3 flex justify-between items-center cursor-pointer group hover:bg-slate-50 transition-colors"
          onClick={() => toggleSection('branding')}
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">Corporate branding</h2>
            <p className="text-xs text-slate-500 mt-0.5">Interface personalisation & typography</p>
          </div>
          <div className="flex items-center gap-4">
            {isBrandingSaved && <span className="text-brand-green font-semibold text-xs animate-pulse">Brand updated</span>}
            <div className="text-slate-400 group-hover:text-brand-navy transition-colors">
              <Chevron isOpen={expanded.branding} />
            </div>
          </div>
        </div>

        {expanded.branding && (
          <div className="px-4 pb-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Visual palette</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Primary action</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent shrink-0" />
                      <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-grow min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Secondary accent</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent shrink-0" />
                      <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="flex-grow min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Success/score</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={successColor} onChange={e => setSuccessColor(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent shrink-0" />
                      <input type="text" value={successColor} onChange={e => setSuccessColor(e.target.value)} className="flex-grow min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Warning/lag</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={warningColor} onChange={e => setWarningColor(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer border-0 p-0 overflow-hidden bg-transparent shrink-0" />
                      <input type="text" value={warningColor} onChange={e => setWarningColor(e.target.value)} className="flex-grow min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Google typography & logo</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Title font</label>
                    <input type="text" value={titleFont} onChange={e => setTitleFont(e.target.value)} placeholder="e.g. Poppins" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Body font</label>
                    <input type="text" value={bodyFont} onChange={e => setBodyFont(e.target.value)} placeholder="e.g. Roboto" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Logo URL (transparent PNG recommended)</label>
                  <input type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                </div>
                <p className="text-xs text-slate-400">The system will auto-import the best weights for your choices.</p>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center pt-3 border-t border-slate-100">
              <button onClick={handleRestoreBranding} className="text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors px-4 py-2 rounded-lg border border-slate-200">Restore original defaults</button>
              <button onClick={handleSaveBranding} className="bg-brand-navy text-white px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-all">
                Apply & push branding
              </button>
            </div>
          </div>
        )}
      </div>

      {showTemplateModal && editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg shadow-xl p-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-slate-900 mb-4">{editingTemplate.id ? 'Refine template' : 'Architect new move'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Draft title</label>
                <input value={editingTemplate.title || ''} onChange={e => setEditingTemplate({ ...editingTemplate, title: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Action description</label>
                <textarea value={editingTemplate.description || ''} onChange={e => setEditingTemplate({ ...editingTemplate, description: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none h-28 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Category</label>
                  <select value={editingTemplate.category || 'other'} onChange={e => setEditingTemplate({ ...editingTemplate, category: e.target.value as any })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none">
                    {['floor_walk', 'preventive_maintenance', 'documentation', 'training', 'infrastructure', 'other'].map(c => (
                      <option key={c} value={c}>{getTemplateCategoryLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Icon</label>
                  <input value={editingTemplate.icon || ''} onChange={e => setEditingTemplate({ ...editingTemplate, icon: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white focus:border-brand-navy outline-none" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setShowTemplateModal(false)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={() => { if (editingTemplate.id) { StorageService.updateTemplate(editingTemplate.id, editingTemplate); } else { StorageService.addTemplate(editingTemplate as any); } setShowTemplateModal(false); }} className="flex-[2] py-2 rounded-lg text-sm font-semibold text-white bg-brand-navy hover:opacity-90 transition-all">
                {editingTemplate.id ? 'Update strategy' : 'Author move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDrafts && (
        <AITemplateDrafts drafts={aiDrafts} onSave={async (tmpl) => { await StorageService.addTemplate(tmpl); }} onClose={() => setShowDrafts(false)} />
      )}

      {selectedMember && (
        <MemberDetailModal
          member={selectedMember}
          commitments={commitments}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
};

export default TeamManagement;
