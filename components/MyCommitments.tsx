
import React, { useState, useEffect, useRef } from 'react';
import { TeamMember, Commitment, Ticket, AISuggestion, CommitmentCheckResult, CommitmentStatus, CommitmentTemplate, WIGConfig } from '../types';
import { formatWeekDisplay, isPastWeek, formatDateShort, getPreviousWeekId } from '../utils';
import { AIService } from '../services/ai';
import { StorageService } from '../services/storage';
import TemplateLibrary from './TemplateLibrary';
import ProofModal from './ProofModal';

interface MyCommitmentsProps {
  currentUser: TeamMember;
  realCurrentWeekId: string;
  selectedWeekId: string;
  commitments: Commitment[];
  allCommitments?: Commitment[]; // All team commitments for overlap check
  tickets?: Ticket[];
  cachedSuggestions?: AISuggestion[];
  templates?: CommitmentTemplate[];
  wigConfig?: WIGConfig | null; // For lead measures
  members?: TeamMember[]; // For auto-scoring updates
  // A draft handed over from the Home composer — auto-submitted on arrival.
  initialDraft?: string;
  onDraftConsumed?: () => void;
  onAdd: (desc: string, leadMeasureId?: string, leadMeasureName?: string, alignedByAI?: boolean) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Commitment>) => void;
  onDelete: (id: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
}

const MyCommitments: React.FC<MyCommitmentsProps> = ({
  currentUser,
  realCurrentWeekId,
  selectedWeekId,
  commitments,
  allCommitments = [],
  tickets,
  cachedSuggestions,
  templates = [],
  wigConfig,
  members = [],
  initialDraft,
  onDraftConsumed,
  onAdd,
  onToggle,
  onUpdate,
  onDelete,
  onPrevWeek,
  onNextWeek
}) => {
  const [newCommitment, setNewCommitment] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CommitmentCheckResult | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  // Template Library State
  const [showTemplates, setShowTemplates] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Proof Modal (shared component) — holds the commitment being closed out
  const [proofTarget, setProofTarget] = useState<{ commitment: Commitment; preset?: CommitmentStatus } | null>(null);
  const lastCheckedTextRef = useRef<string>('');

  // Validation Modal State (for custom commitments)
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFromTemplate, setIsFromTemplate] = useState(false);
  const [templateSuggestedMeasureId, setTemplateSuggestedMeasureId] = useState<string | null>(null);

  const leadMeasures = wigConfig?.leadMeasures || [];

  // Handle custom commitment submission with AI validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommitment.trim() || isFull) return;
    await submitCommitment(newCommitment);
  };

  // Shared entry point for the form above and the Home-page composer handoff.
  const submitCommitment = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || isFull) return;

    // Detect if pasted/typed text matches a known template description.
    // Templates are pre-vetted, so skip AI and route straight to lead-measure picker.
    const matchingTemplate = (templates as CommitmentTemplate[]).find(
      (t: CommitmentTemplate) => t.description.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (matchingTemplate) {
      setNewCommitment('');
      openTemplatePicker(matchingTemplate);
      return;
    }

    // Start validation process
    setPendingCommitment(trimmed);
    setNewCommitment('');
    setShowValidationModal(true);
    setIsValidating(true);
    setCheckResult(null);
    setValidationError(null);
    setIsFromTemplate(false);
    setTemplateSuggestedMeasureId(null);

    try {
      // Get teammate commitments for overlap check
      const teammateCommitments = allCommitments
        .filter(c => c.memberId !== currentUser.id)
        .map(c => c.description);
      const prevWeekId = getPreviousWeekId(selectedWeekId);
      const history = StorageService.getCommitments()
        .filter(c => c.memberId === currentUser.id && c.weekId === prevWeekId)
        .map(c => c.description);

      const result = await AIService.checkCommitment(
        trimmed,
        { colleagues: teammateCommitments, history },
        leadMeasures
      );

      setCheckResult(result);

      if (!result) {
        setValidationError('Unable to validate alignment right now. You can add this commitment without AI validation or select a Lead Measure manually.');
      }

      // If aligned, auto-submit. Clear the check result too, so stale feedback
      // (which references a suggested alternative) doesn't linger under the form.
      if (result?.isAligned && result.linkedLeadMeasureId) {
        safeOnAdd(trimmed, result.linkedLeadMeasureId, result.linkedLeadMeasureName || undefined, true);
        setShowValidationModal(false);
        setPendingCommitment('');
        setCheckResult(null);
      }
      // If not aligned, keep modal open for user to see feedback
    } catch (e) {
      // On error, allow submission without alignment (graceful degradation)
      safeOnAdd(trimmed);
      setShowValidationModal(false);
      setPendingCommitment('');
    } finally {
      setIsValidating(false);
    }
  };

  // Map a template category to candidate keywords used to find the right Lead Measure.
  // Each category lists keywords likely to appear in a measure's name or definition.
  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    floor_walk: ['visibility', 'visible', 'walk', 'presence', 'floor', 'tour', 'rounds', 'sweep'],
    preventive_maintenance: ['value', 'maintenance', 'preventive', 'proactive', 'prevention', 'reliability'],
    documentation: ['value', 'documentation', 'docs', 'knowledge', 'guide', 'self-service'],
    training: ['value', 'training', 'enablement', 'capability', 'coach', 'micro'],
    infrastructure: ['value', 'infrastructure', 'systems', 'platform'],
  };

  const pickMeasureForTemplate = (template: CommitmentTemplate) => {
    const measures = leadMeasures as { id: string; name: string; definition?: string }[];
    if (measures.length === 0) return null;

    const keywords = CATEGORY_KEYWORDS[template.category] || [];
    const categoryWords = template.category.replace(/_/g, ' ').toLowerCase();

    const matches = (m: { name: string; definition?: string }) => {
      const haystack = `${m.name} ${m.definition || ''}`.toLowerCase();
      if (haystack.includes(categoryWords)) return true;
      return keywords.some(k => haystack.includes(k));
    };

    // Prefer a keyword match that still has capacity.
    const matched = measures.find(m => matches(m) && !isMeasureAtCapacity(m.id));
    if (matched) return matched;

    // Otherwise, any measure with capacity.
    const anyAvailable = measures.find(m => !isMeasureAtCapacity(m.id));
    if (anyAvailable) return anyAvailable;

    // All measures full — return the keyword match (caller will show capacity alert).
    return measures.find(matches) || measures[0];
  };

  // Templates are pre-vetted — auto-assign the best matching Lead Measure.
  const handleTemplateSelect = (template: CommitmentTemplate) => {
    const chosen = pickMeasureForTemplate(template);
    safeOnAdd(template.description, chosen?.id, chosen?.name);
    setShowTemplates(false);
  };

  // Open picker modal (used when pasted text matches a template but we want explicit confirmation).
  const openTemplatePicker = (template: CommitmentTemplate) => {
    const chosen = pickMeasureForTemplate(template);
    if (chosen && !isMeasureAtCapacity(chosen.id)) {
      // Auto-assign without prompting.
      safeOnAdd(template.description, chosen.id, chosen.name);
      setShowTemplates(false);
      return;
    }
    // Fallback: show picker only when no measure is available.
    setPendingCommitment(template.description);
    setIsFromTemplate(true);
    setTemplateSuggestedMeasureId(chosen?.id || null);
    setCheckResult(null);
    setValidationError(null);
    setIsValidating(false);
    setShowTemplates(false);
    setShowValidationModal(true);
  };

  const isFull = commitments.length >= 3;
  const isPast = isPastWeek(selectedWeekId, realCurrentWeekId);
  const isCurrent = selectedWeekId === realCurrentWeekId;
  const canAdd = !isPast && !isFull;

  // Calculate commitment counts per lead measure for enforcement
  const measureCommitmentCounts = leadMeasures.map(measure => {
    const count = commitments.filter(c =>
      c.leadMeasureId === measure.id ||
      c.leadMeasureId === measure.name ||
      c.leadMeasureName === measure.name
    ).length;
    return {
      ...measure,
      currentCount: count,
      isFull: count >= measure.target,
      isOver: count > measure.target,
      isUnder: count < measure.target,
      remaining: Math.max(0, measure.target - count),
      excess: Math.max(0, count - measure.target)
    };
  });

  // Total target is sum of all lead measure targets
  const totalTarget = leadMeasures.reduce((sum, m) => sum + m.target, 0);
  const totalCommitted = commitments.length;
  const allMeasuresMet = measureCommitmentCounts.every(m => m.currentCount >= m.target);

  // Warning states
  const overCommittedMeasures = measureCommitmentCounts.filter(m => m.isOver);
  const underCommittedMeasures = measureCommitmentCounts.filter(m => m.isUnder);
  const hasImbalance = overCommittedMeasures.length > 0 || (totalCommitted >= totalTarget && underCommittedMeasures.length > 0);
  const isSlotsFilledButImbalanced = totalCommitted >= totalTarget && underCommittedMeasures.length > 0;

  // Helper to check if a measure is at capacity
  const isMeasureAtCapacity = (measureIdOrName?: string): boolean => {
    if (!measureIdOrName) return false;
    const measure = measureCommitmentCounts.find(m =>
      m.id === measureIdOrName || m.name === measureIdOrName
    );
    return measure ? measure.currentCount >= measure.target : false;
  };

  // Wrapper to enforce capacity before adding. alignedByAI is true ONLY when
  // the AI itself validated/produced the measure link — manual and keyword
  // assignments must pass false (the default).
  const safeOnAdd = (desc: string, leadMeasureId?: string, leadMeasureName?: string, alignedByAI: boolean = false): boolean => {
    const measureKey = leadMeasureId || leadMeasureName;
    if (measureKey && isMeasureAtCapacity(measureKey)) {
      const measureName = measureCommitmentCounts.find(m => m.id === measureKey || m.name === measureKey)?.name || measureKey;
      alert(`Cannot add: "${measureName}" is already at capacity (${measureCommitmentCounts.find(m => m.id === measureKey || m.name === measureKey)?.target || 0
        } commitments). Please choose a different Lead Measure.`);
      return false;
    }
    onAdd(desc, leadMeasureId, leadMeasureName, alignedByAI);
    return true;
  };


  useEffect(() => {
    if (cachedSuggestions && cachedSuggestions.length > 0 && suggestions.length === 0) {
      setSuggestions(cachedSuggestions);
    }
  }, [cachedSuggestions]);

  // Home-page composer handoff: auto-submit the draft through the same
  // validated pipeline as the form. Ref guard prevents StrictMode double-fire.
  const draftConsumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialDraft) {
      draftConsumedRef.current = null;
      return;
    }
    if (draftConsumedRef.current === initialDraft) return;
    draftConsumedRef.current = initialDraft;
    onDraftConsumed?.();
    if (!isPast) {
      submitCommitment(initialDraft);
    }
  }, [initialDraft]);

  const handleGenerateSuggestions = async () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
      return;
    }

    setSuggestionError(null);
    setIsGenerating(true);

    // Create a date key for the cache (e.g., "2024-01-20")
    // This allows one generation per day for the whole team
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    try {
      // 1. Try to get from Shared Cache first (FAST)
      const cached = await StorageService.getDailyInspirations(dateKey);

      if (cached && cached.length > 0) {
        // Validation: If cached results are from an old version (missing leadMeasureName), force refresh
        const isUpToDate = cached.some(s => s.leadMeasureName);
        if (isUpToDate) {
          setSuggestions(cached);
          setShowSuggestions(true);
        } else {
          const results = await AIService.generateCommitmentSuggestions(
            tickets || [],
            StorageService.getWIGConfig()?.leadMeasures || [],
            templates || []
          );
          if (results.length > 0) {
            setSuggestions(results);
            setShowSuggestions(true);
            await StorageService.saveDailyInspirations(dateKey, results);
          } else {
            setSuggestionError('No suggestions available yet. AI may be unavailable or not configured.');
            setShowSuggestions(true);
          }
        }
      } else {
        // 2. If not found, generate via AI (SLOW)
        const results = await AIService.generateCommitmentSuggestions(
          tickets || [],
          StorageService.getWIGConfig()?.leadMeasures || [],
          templates || []
        );

        if (results.length > 0) {
          setSuggestions(results);
          setShowSuggestions(true);
          // 3. Save to cache for others
          await StorageService.saveDailyInspirations(dateKey, results);
        } else {
          setSuggestionError('No suggestions available yet. AI may be unavailable or not configured.');
          setShowSuggestions(true);
        }
      }
    } catch (e) {
      setSuggestionError('Unable to generate suggestions at the moment. Please try again later.');
      setShowSuggestions(true);
    } finally {
      setIsGenerating(false);
    }
  };


  const handleCheckCommitment = async () => {
    if (!newCommitment.trim() || newCommitment.length < 10) return;
    const trimmed = newCommitment.trim();
    lastCheckedTextRef.current = trimmed;

    // Templates are pre-vetted — short-circuit the AI check with a positive result.
    const matchingTemplate = (templates as CommitmentTemplate[]).find(
      (t: CommitmentTemplate) => t.description.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (matchingTemplate) {
      setCheckResult({
        isEffective: true,
        isAligned: true,
        score: 10,
        feedback: 'This is a pre-vetted Power Play template — click Add to assign it to a Lead Measure.',
        isRedundant: false,
        isOverlapping: false,
      });
      return;
    }

    setIsChecking(true);
    // Keep old result while checking? Or clear? 
    // Clearing feels 'snappier' regarding 'new check started' status
    // But keeping it might prevents layout jump. 
    // Let's keep it until new result arrives, but maybe show a loader.

    try {
      const allTeamCommitments = StorageService.getCommitments(selectedWeekId);
      const teammateCommitments = allTeamCommitments
        .filter(c => c.memberId !== currentUser.id)
        .map(c => c.description);
      const prevWeekId = getPreviousWeekId(selectedWeekId);
      const history = StorageService.getCommitments()
        .filter(c => c.memberId === currentUser.id && c.weekId === prevWeekId)
        .map(c => c.description);

      const result = await AIService.checkCommitment(newCommitment, {
        colleagues: teammateCommitments,
        history
      });

      // key check: Ensure the text hasn't changed since we started!
      // In a real hook we'd use a ref tracking the latest text
      // For now, if the user typed more, the debounce would have cancelled *this* effect run? 
      // No, handleCheckCommitment is async and detached from the effect cleanup once called.
      // So we should verify newCommitment matches? 
      // Actually, React state `newCommitment` in closure might be stale?
      // Yes, `handleCheckCommitment` closes over `newCommitment`. 
      // So it checks the text *at the moment the timeout fired*.
      // We should check if the result is still relevant.
      // But we can't easily check `newCommitment` (current state) inside this closure without a Ref.
      // Let's trust that the user wants feedback on what they wrote 2 seconds ago, 
      // and if they kept writing, a NEW check will fire and overwrite this one.

      setCheckResult(result);
    } catch (e) {
    } finally {
      setIsChecking(false);
    }
  };

  const addSuggestion = (id: string) => {
    if (isFull) return;
    const item = suggestions.find(s => s.id === id);
    if (!item) return;
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, isExiting: true } : s));
    setTimeout(() => {
      // AI suggestions come with lead measure data - pass it through
      safeOnAdd(item.commitment, item.leadMeasureId, item.leadMeasureName, true);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    }, 400);
  };

  const openProofModal = (commitment: Commitment, presetStatus?: CommitmentStatus) => {
    setProofTarget({ commitment, preset: presetStatus });
  };

  const renderRichDescription = (text: string, isWhite = false) => {
    if (!text) return null;
    const parts = text.split(/(\[.*?\])/g);
    return parts.map((part, i) => {
      if (part.startsWith('[') && part.endsWith(']')) {
        const name = part.slice(1, -1);
        return (
          <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-tight mx-0.5 border ${isWhite ? 'bg-white/10 border-white/20 text-white' : 'bg-brand-navy/5 border-brand-navy/10 text-brand-navy'}`}>
            <span className="mr-1 opacity-50">⚡</span>
            {name}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const getStatusStyles = (c: Commitment) => {
    switch (c.status) {
      case 'completed':
        return { container: 'bg-green-50 border-brand-green', btn: 'bg-brand-green border-brand-green text-white', text: 'text-gray-500 line-through' };
      case 'partial':
        return { container: 'bg-orange-50 border-brand-orange', btn: 'bg-brand-orange border-brand-orange text-white', text: 'text-gray-800' };
      case 'incomplete':
      default:
        if (isPast) return { container: 'bg-red-50 border-brand-red', btn: 'bg-white border-brand-red text-brand-red', text: 'text-brand-red font-medium' };
        return { container: 'bg-white border-gray-200 shadow-sm', btn: 'bg-white border-gray-300', text: 'text-gray-900' };
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">

      {/* Template Library Modal */}
      {showTemplates && (
        <TemplateLibrary
          onSelect={handleTemplateSelect}
          onClose={() => setShowTemplates(false)}
          templates={templates}
        />
      )}

      {/* AI Validation Modal - Enforces Lead Measure Alignment */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy bg-opacity-95 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-fade-in overflow-hidden border-4 border-white">
            <div className="p-6 bg-slate-50 border-b border-slate-100">
              <h3 className="text-lg font-bold text-brand-navy uppercase tracking-tight">
                {isFromTemplate ? '⚡ Pick a Lead Measure' : isValidating ? '🔍 Analysing Alignment...' : checkResult?.isAligned ? '✅ Aligned!' : '⚠️ Alignment Required'}
              </h3>
              <p className="text-slate-500 text-xs mt-1">"{pendingCommitment}"</p>
            </div>

            <div className="p-6 space-y-4">
              {isFromTemplate ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-blue-800 text-sm font-medium">
                      This is a pre-vetted template. Choose which Lead Measure it should count toward.
                    </p>
                  </div>
                  {leadMeasures.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {(leadMeasures as Array<{ id: string; name: string }>).map((m: { id: string; name: string }) => {
                        const measureData = measureCommitmentCounts.find((mc: { id: string; name: string; currentCount: number; target: number }) => mc.id === m.id || mc.name === m.name);
                        const isAtCapacity = measureData ? measureData.currentCount >= measureData.target : false;
                        const isSuggested = templateSuggestedMeasureId === m.id;
                        return (
                          <button
                            key={m.id}
                            disabled={isAtCapacity}
                            onClick={() => {
                              const added = safeOnAdd(pendingCommitment, m.id, m.name);
                              if (added) {
                                setShowValidationModal(false);
                                setPendingCommitment('');
                                setCheckResult(null);
                                setIsFromTemplate(false);
                                setTemplateSuggestedMeasureId(null);
                              }
                            }}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors border-2 ${isAtCapacity
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-200'
                              : isSuggested
                                ? 'bg-brand-navy text-white border-brand-navy shadow-lg'
                                : 'bg-slate-100 hover:bg-brand-navy hover:text-white border-slate-100'
                              }`}
                          >
                            {isSuggested && '⚡ '}{m.name} {isAtCapacity && '(Full)'}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {leadMeasures.length === 0 && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          safeOnAdd(pendingCommitment);
                          setShowValidationModal(false);
                          setPendingCommitment('');
                          setIsFromTemplate(false);
                          setTemplateSuggestedMeasureId(null);
                        }}
                        className="px-4 py-2 bg-brand-navy text-white text-xs font-bold rounded-lg hover:bg-black transition-colors"
                      >
                        Add Commitment
                      </button>
                    </div>
                  )}
                </>
              ) : isValidating ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-brand-navy/20 border-t-brand-navy"></div>
                </div>
              ) : checkResult ? (
                <>
                  {/* Alignment Status */}
                  {checkResult.isAligned ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-green-800 text-sm font-medium">
                        ✓ Linked to: <strong>{checkResult.linkedLeadMeasureName}</strong>
                      </p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-amber-800 text-sm font-medium mb-2">
                        This commitment doesn't clearly align with any of your team's Lead Measures.
                      </p>
                      <p className="text-amber-700 text-xs">
                        {checkResult.feedback}
                      </p>
                    </div>
                  )}

                  {/* Suggested Alternative (also shown when "aligned" but the AI named no measure, so the user isn't stuck) */}
                  {checkResult.suggestedAlternative && (!checkResult.isAligned || !checkResult.linkedLeadMeasureId) && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-blue-700 text-[10px] uppercase font-bold tracking-widest mb-2">💡 Suggested Alternative</p>
                      <p className="text-blue-900 text-sm font-medium mb-3">{checkResult.suggestedAlternative}</p>
                      <p className="text-blue-600 text-xs mb-2">Select which Lead Measure this applies to:</p>
                      <div className="flex flex-wrap gap-2">
                        {leadMeasures.map(m => {
                          const measureData = measureCommitmentCounts.find(mc => mc.id === m.id || mc.name === m.name);
                          const isAtCapacity = measureData ? measureData.currentCount >= measureData.target : false;
                          return (
                            <button
                              key={m.id}
                              disabled={isAtCapacity}
                              onClick={() => {
                                safeOnAdd(checkResult.suggestedAlternative!, m.id, m.name, m.id === checkResult.linkedLeadMeasureId);
                                setShowValidationModal(false);
                                setPendingCommitment('');
                                setCheckResult(null);
                              }}
                              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${isAtCapacity
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                            >
                              {m.name} {isAtCapacity && '(Full)'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Manual Lead Measure Selection (whenever no measure got linked) */}
                  {(!checkResult.isAligned || !checkResult.linkedLeadMeasureId) && leadMeasures.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-slate-600 text-xs font-semibold mb-3">Or select a Lead Measure manually:</p>
                      <div className="flex flex-wrap gap-2">
                        {leadMeasures.map(m => {
                          const measureData = measureCommitmentCounts.find(mc => mc.id === m.id || mc.name === m.name);
                          const isAtCapacity = measureData ? measureData.currentCount >= measureData.target : false;
                          return (
                            <button
                              key={m.id}
                              disabled={isAtCapacity}
                              onClick={() => {
                                safeOnAdd(pendingCommitment, m.id, m.name);
                                setShowValidationModal(false);
                                setPendingCommitment('');
                                setCheckResult(null);
                              }}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${isAtCapacity
                                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                  : 'bg-slate-100 hover:bg-brand-navy hover:text-white'
                                }`}
                            >
                              {m.name} {isAtCapacity && '(Full)'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-amber-800 text-sm font-medium">
                      {validationError || 'No validation result available right now.'}
                    </p>
                  </div>
                  {leadMeasures.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-slate-600 text-xs font-semibold mb-3">Select a Lead Measure manually:</p>
                      <div className="flex flex-wrap gap-2">
                        {leadMeasures.map(m => {
                          const measureData = measureCommitmentCounts.find(mc => mc.id === m.id || mc.name === m.name);
                          const isAtCapacity = measureData ? measureData.currentCount >= measureData.target : false;
                          return (
                            <button
                              key={m.id}
                              disabled={isAtCapacity}
                              onClick={() => {
                                safeOnAdd(pendingCommitment, m.id, m.name);
                                setShowValidationModal(false);
                                setPendingCommitment('');
                                setCheckResult(null);
                              }}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${isAtCapacity
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-brand-navy hover:text-white'
                                }`}
                            >
                              {m.name} {isAtCapacity && '(Full)'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        safeOnAdd(pendingCommitment);
                        setShowValidationModal(false);
                        setPendingCommitment('');
                        setCheckResult(null);
                      }}
                      className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors"
                    >
                      Add without validation
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowValidationModal(false);
                  setPendingCommitment('');
                  setCheckResult(null);
                  setIsFromTemplate(false);
                  setTemplateSuggestedMeasureId(null);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Modal (shared component) */}
      {proofTarget && (
        <ProofModal
          commitment={proofTarget.commitment}
          presetStatus={proofTarget.preset}
          leadMeasures={leadMeasures}
          currentUser={currentUser}
          onClose={() => setProofTarget(null)}
        />
      )}

      {/* Week Navigation Header */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <button onClick={onPrevWeek} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
        </button>
        <div className="text-center">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide font-display">
            {isPast ? <span className="text-brand-red">Past Week</span> : isCurrent ? <span className="text-brand-green">Current Week</span> : <span className="text-brand-navy">Future Planning</span>}
          </h2>
          <h1 className="text-lg font-bold text-gray-900 font-display">{formatWeekDisplay(selectedWeekId)}</h1>
        </div>
        <button onClick={onNextWeek} className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
        </button>
      </div>

      <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
        <div className="p-6 bg-brand-navy text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 transform translate-x-1/4 -translate-y-1/4">
            <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"></path></svg>
          </div>
          <h2 className="text-xl font-bold font-display relative z-10">My Weekly Commitments</h2>
          <p className="text-blue-100 mt-1 font-light relative z-10">
            Select high-leverage actions to impact our WIG.
          </p>

          {/* Lead Measure Requirements Guide */}
          {leadMeasures.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 relative z-10">
              {measureCommitmentCounts.map(measure => (
                <div
                  key={measure.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${measure.isOver
                    ? 'bg-amber-500/20 border border-amber-400/40 text-amber-200'
                    : measure.isFull
                      ? 'bg-green-500/20 border border-green-400/40 text-green-200'
                      : 'bg-white/10 border border-white/20 text-white'
                    }`}
                >
                  <span className="uppercase tracking-wider">{measure.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${measure.isOver
                    ? 'bg-amber-400 text-amber-900'
                    : measure.isFull
                      ? 'bg-green-400 text-green-900'
                      : 'bg-white/20 text-white'
                    }`}>
                    {measure.currentCount}/{measure.target}
                  </span>
                  {measure.isOver && (
                    <svg className="w-3.5 h-3.5 text-amber-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  )}
                  {measure.isFull && !measure.isOver && (
                    <svg className="w-3.5 h-3.5 text-green-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              ))}
              {allMeasuresMet && (
                <div className="flex items-center gap-1 px-3 py-1.5 bg-green-500/30 border border-green-400/50 rounded-lg text-green-200 text-xs font-bold">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  All targets met!
                </div>
              )}
              {/* Warning for imbalanced commitments */}
              {hasImbalance && (
                <div className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/30 border border-amber-400/50 rounded-lg text-amber-200 text-xs font-bold">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {overCommittedMeasures.length > 0 && (
                    <span>Too many: {overCommittedMeasures.map(m => m.name).join(', ')}</span>
                  )}
                  {overCommittedMeasures.length > 0 && underCommittedMeasures.length > 0 && <span className="mx-1">|</span>}
                  {isSlotsFilledButImbalanced && underCommittedMeasures.length > 0 && (
                    <span>Need more: {underCommittedMeasures.map(m => m.name).join(', ')}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>


        <div className="p-6">
          {showSuggestions && (
            <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-5 animate-fade-in shadow-inner">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-bold text-brand-navy flex items-center font-display">
                  <svg className="w-5 h-5 mr-2 text-brand-orange" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" /></svg>
                  Suggested Commitments
                </h3>
                <button onClick={() => setShowSuggestions(false)} className="text-xs text-gray-500 hover:text-gray-800 bg-white px-2 py-1 rounded border">Close</button>
              </div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {suggestions.length === 0 ? (
                  <div className="bg-white border border-blue-100 rounded-lg p-4 text-sm text-slate-600">
                    {suggestionError || 'No suggestions available yet.'}
                  </div>
                ) : (
                  suggestions.map((s) => (
                    <div key={s.id} className={`bg-white p-3 rounded-lg border border-blue-100 shadow-sm transition-all duration-300 ${s.isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                      <div className="flex gap-2 items-center">
                        <div className="flex-grow">
                          <div className="flex items-center gap-2 mb-1">
                            {s.leadMeasureName && (
                              <span className="text-[8px] font-black uppercase text-brand-navy bg-slate-100 px-1.5 py-0.5 rounded tracking-widest border border-slate-200">
                                {s.leadMeasureName}
                              </span>
                            )}
                            <p className="text-sm font-bold text-gray-800 leading-snug">
                              {renderRichDescription(s.commitment)}
                            </p>
                          </div>
                        </div>
                        <button onClick={() => addSuggestion(s.id)} disabled={isFull} className="px-3 py-1 bg-brand-navy text-white text-xs font-bold rounded hover:bg-opacity-90 disabled:opacity-50">Add</button>
                      </div>
                      <p className="text-[11px] text-gray-500 italic mt-1">{s.rationale}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 text-center border-t border-blue-100 pt-2">
                <p className="text-[10px] text-gray-400 italic">
                  🤖 These suggestions are AI-generated based on recent ticket trends. Please review and edit them to ensure they are safe and accurate before committing.
                </p>
              </div>
            </div>
          )}

          {!isPast && (
            <div className="mb-8">
              <div className="flex justify-between items-end mb-2">
                <label className="text-sm font-bold text-gray-700 font-display">Craft Your Commitment</label>
                <div className="flex gap-2">
                  <button onClick={() => setShowTemplates(true)} disabled={isFull} className="text-xs font-bold text-brand-navy hover:text-brand-red transition-colors flex items-center disabled:opacity-50">
                    <span className="text-lg mr-1">⚡</span> Browse Templates
                  </button>
                  <button onClick={handleGenerateSuggestions} disabled={isGenerating} className="text-xs font-bold text-brand-orange hover:text-brand-red transition-colors flex items-center disabled:opacity-50">
                    <svg className={`w-3 h-3 mr-1 ${isGenerating ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    {isGenerating ? 'Generating...' : 'Inspire Me'}
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="relative">
                <div className="flex space-x-2">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      value={newCommitment}
                      onChange={(e) => { setNewCommitment(e.target.value); setCheckResult(null); if (!e.target.value) lastCheckedTextRef.current = ''; }}
                      placeholder={isFull ? "Max commitments reached" : "I commit to..."}
                      disabled={!canAdd}
                      className="w-full rounded-xl border-gray-200 shadow-sm focus:ring-brand-navy focus:border-brand-navy border p-4 pr-24 disabled:bg-gray-50 text-gray-900 transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleCheckCommitment}
                      disabled={!newCommitment.trim() || isChecking}
                      className="absolute right-2 top-2 bottom-2 px-3 text-[10px] font-bold uppercase tracking-wider text-brand-navy hover:text-brand-red border-l border-gray-100 transition-colors disabled:opacity-30"
                    >
                      {isChecking ? 'Checking...' : 'Check Strategy'}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={!canAdd || !newCommitment.trim() || isChecking}
                    className="px-8 py-4 bg-brand-red text-white font-bold rounded-xl hover:bg-brand-darkRed disabled:bg-gray-300 transition-all font-display"
                  >
                    Add
                  </button>
                </div>
              </form>

              {checkResult && (
                <div className={`mt-4 p-5 rounded-2xl border-2 animate-fade-in ${checkResult.isEffective && !checkResult.isRedundant && !checkResult.isOverlapping ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-full ${checkResult.isEffective && !checkResult.isRedundant && !checkResult.isOverlapping ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                    </div>
                    <div className="flex-grow">
                      <h4 className={`text-sm font-bold uppercase tracking-wider font-display ${checkResult.isEffective ? 'text-green-800' : 'text-amber-800'}`}>Coach Feedback</h4>
                      <p className="text-sm text-gray-700 leading-relaxed mt-2">{checkResult.feedback}</p>
                      {checkResult.suggestedAlternative && (
                        <div className="mt-3 p-3 bg-white/70 border border-blue-200 rounded-xl">
                          <p className="text-blue-700 text-[10px] uppercase font-bold tracking-widest mb-1">💡 Suggested Alternative</p>
                          <p className="text-sm text-blue-900 font-medium">{checkResult.suggestedAlternative}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCommitment(checkResult.suggestedAlternative!);
                              setCheckResult(null);
                            }}
                            className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                          >
                            Use this wording
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            {commitments.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-2xl">
                <p className="text-gray-600 italic font-display uppercase text-xs tracking-widest">No active commitments</p>
              </div>
            )}
            {commitments.map(commitment => {
              const styles = getStatusStyles(commitment);
              const isEditing = editingId === commitment.id;

              return (
                <div key={commitment.id} className={`flex items-center p-5 rounded-2xl border transition-all animate-fade-in ${styles.container}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Closing must go through the proof modal so commentary is captured.
                      // Un-completing (reopening) can stay a direct, note-free toggle.
                      if (commitment.status === 'completed') {
                        onToggle(commitment.id);
                      } else {
                        openProofModal(commitment, 'completed');
                      }
                    }}
                    disabled={isEditing || isPast}
                    className={`flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all mr-5 focus:outline-none ${styles.btn}`}
                  >
                    {commitment.status === 'completed' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                    {commitment.status === 'partial' && <div className="w-3 h-3 bg-white rounded-full"></div>}
                  </button>

                  <div className="flex-grow" onClick={() => !isEditing && openProofModal(commitment)}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full p-2 border-b-2 border-brand-navy focus:outline-none bg-transparent font-medium"
                        autoFocus
                      />
                    ) : (
                      <>
                        <p className={`text-base font-semibold leading-relaxed ${styles.text} cursor-pointer hover:text-brand-navy text-brand-navy`}>
                          {renderRichDescription(commitment.description)}
                        </p>
                        <div className="flex items-center mt-1 space-x-4">
                          <span className="text-[10px] text-gray-600 font-semibold uppercase">SET: {formatDateShort(commitment.createdAt)}</span>
                          {(commitment.completionNote || commitment.completionPhoto) && (
                            <span className="text-[10px] text-brand-green font-semibold uppercase flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                              Proof Logged
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center ml-4 space-x-2">
                    {isEditing ? (
                      <button onClick={() => { onUpdate(commitment.id, { description: editValue.trim() }); setEditingId(null); }} className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg></button>
                    ) : (
                      <>
                        {!isPast && (
                          <button onClick={() => { setEditingId(commitment.id); setEditValue(commitment.description); }} className="p-2 text-gray-400 hover:text-brand-navy hover:bg-gray-100 rounded-lg transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                        )}
                        <button onClick={() => onDelete(commitment.id)} className="p-2 text-gray-400 hover:text-brand-red hover:bg-red-50 rounded-lg transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyCommitments;
