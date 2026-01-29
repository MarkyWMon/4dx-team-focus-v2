
import React, { useState, useEffect, useRef } from 'react';
import { TeamMember, Commitment, Ticket, AISuggestion, CommitmentCheckResult, CommitmentStatus, CommitmentTemplate, WIGConfig } from '../types';
import { formatWeekDisplay, isPastWeek, formatDateShort, getPreviousWeekId } from '../utils';
import { AIService } from '../services/ai';
import { StorageService } from '../services/storage';
import TemplateLibrary from './TemplateLibrary';

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
  onAdd: (desc: string, leadMeasureId?: string, leadMeasureName?: string) => void;
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
  const [isSaving, setIsSaving] = useState(false);
  const [checkResult, setCheckResult] = useState<CommitmentCheckResult | null>(null);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Template Library State
  const [showTemplates, setShowTemplates] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Proof Modal State
  const [proofModalId, setProofModalId] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [proofStatus, setProofStatus] = useState<CommitmentStatus>('completed');
  const [proofLeadMeasure, setProofLeadMeasure] = useState<{ id: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validation Modal State (for custom commitments)
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingCommitment, setPendingCommitment] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const leadMeasures = wigConfig?.leadMeasures || [];

  // Handle custom commitment submission with AI validation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommitment.trim() || isFull) return;

    // Start validation process
    setPendingCommitment(newCommitment.trim());
    setNewCommitment('');
    setShowValidationModal(true);
    setIsValidating(true);
    setCheckResult(null);

    try {
      // Get teammate commitments for overlap check
      const teammateCommitments = allCommitments
        .filter(c => c.memberId !== currentUser.id)
        .map(c => c.description);
      const prevWeekId = getPreviousWeekId(selectedWeekId);
      const history = StorageService.getCommitments()
        .filter(c => c.memberId === currentUser.id && c.weekId === prevWeekId)
        .map(c => c.description);

      // Call upgraded AI check with lead measures
      const result = await AIService.checkCommitment(
        newCommitment.trim(),
        { colleagues: teammateCommitments, history },
        leadMeasures
      );

      setCheckResult(result);

      // If aligned, auto-submit
      if (result?.isAligned && result.linkedLeadMeasureId) {
        onAdd(newCommitment.trim(), result.linkedLeadMeasureId, result.linkedLeadMeasureName || undefined);
        setShowValidationModal(false);
        setPendingCommitment('');
      }
      // If not aligned, keep modal open for user to see feedback
    } catch (e) {
      console.error("Validation error:", e);
      // On error, allow submission without alignment (graceful degradation)
      onAdd(newCommitment.trim());
      setShowValidationModal(false);
      setPendingCommitment('');
    } finally {
      setIsValidating(false);
    }
  };

  // Templates already have built-in alignment - skip validation
  const handleTemplateSelect = (template: CommitmentTemplate) => {
    // Map template category to a lead measure if possible
    const matchedMeasure = leadMeasures.find(m =>
      m.name.toLowerCase().includes(template.category.replace('_', ' '))
    );
    onAdd(template.description, matchedMeasure?.id, matchedMeasure?.name);
    setShowTemplates(false);
  };

  const isFull = commitments.length >= 3;
  const isPast = isPastWeek(selectedWeekId, realCurrentWeekId);
  const isCurrent = selectedWeekId === realCurrentWeekId;
  const canAdd = !isPast && !isFull;

  useEffect(() => {
    if (cachedSuggestions && cachedSuggestions.length > 0 && suggestions.length === 0) {
      setSuggestions(cachedSuggestions);
    }
  }, [cachedSuggestions]);

  const handleGenerateSuggestions = async () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
      return;
    }

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
          console.log("⚡ Loaded strategic suggestions from daily cache");
          setSuggestions(cached);
          setShowSuggestions(true);
        } else {
          console.log("🔄 Cached suggestions are stale. Re-generating for better alignment...");
          const results = await AIService.generateCommitmentSuggestions(
            tickets || [],
            StorageService.getWIGConfig()?.leadMeasures || [],
            templates || []
          );
          if (results.length > 0) {
            setSuggestions(results);
            setShowSuggestions(true);
            await StorageService.saveDailyInspirations(dateKey, results);
          }
        }
      } else {
        // 2. If not found, generate via AI (SLOW)
        console.log("🤖 Generating fresh suggestions via AI...");
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
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  // Debounced Auto-Check
  useEffect(() => {
    // specific check to avoid checking empty or very short strings
    if (!newCommitment || newCommitment.length < 10) {
      setCheckResult(null);
      return;
    }

    // Don't check if we are already checking
    if (isChecking) return;

    const timer = setTimeout(() => {
      handleCheckCommitment();
    }, 2000); // 2 second delay to wait for typing to pause

    return () => clearTimeout(timer);
  }, [newCommitment]);

  const handleCheckCommitment = async () => {
    if (!newCommitment.trim() || newCommitment.length < 10) return;

    // Validate we haven't already checked this exact text (simple cache)
    // Note: robust implementations might use a proper cache map

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
      console.error(e);
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
      onAdd(item.commitment, item.leadMeasureId, item.leadMeasureName);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    }, 400);
  };

  const openProofModal = (commitment: Commitment) => {
    setProofModalId(commitment.id);
    setProofNote(commitment.completionNote || '');
    setProofPhoto(commitment.completionPhoto || null);
    setProofStatus(commitment.status);
    // Pre-select the lead measure if commitment already has one
    if (commitment.leadMeasureId && commitment.leadMeasureName) {
      setProofLeadMeasure({ id: commitment.leadMeasureId, name: commitment.leadMeasureName });
    } else {
      setProofLeadMeasure(null);
    }
    setIsSaving(false);
  };

  const handleSaveProof = async () => {
    if (!proofModalId || isSaving) return;

    // Determine which lead measure to use
    const commitment = commitments.find(c => c.id === proofModalId);
    const effectiveLeadMeasureId = proofLeadMeasure?.id || commitment?.leadMeasureId;
    const effectiveLeadMeasureName = proofLeadMeasure?.name || commitment?.leadMeasureName;

    // DEBUG: Log the scoring conditions
    console.log('📊 SAVE PROOF DEBUG:', {
      proofModalId,
      proofStatus,
      previousStatus: commitment?.status,
      effectiveLeadMeasureId,
      proofLeadMeasure,
      commitmentLeadMeasureId: commitment?.leadMeasureId,
      leadMeasuresCount: leadMeasures.length,
      currentUserProgress: currentUser.leadMeasureProgress
    });

    // REQUIRE lead measure selection for scoring when completing
    if (proofStatus === 'completed' && !effectiveLeadMeasureId && leadMeasures.length > 0) {
      alert('Please select a Lead Measure before marking as completed. This enables auto-scoring on the Dashboard.');
      return;
    }

    setIsSaving(true);
    try {
      const previousStatus = commitment?.status;

      // Update commitment with status, notes, photo, AND lead measure if newly selected
      const updates: Partial<Commitment> = {
        status: proofStatus,
        completionNote: proofNote,
        completionPhoto: proofPhoto || null as any
      };

      // If user selected a lead measure (especially for legacy commitments), save it
      if (proofLeadMeasure?.id) {
        updates.leadMeasureId = proofLeadMeasure.id;
        updates.leadMeasureName = proofLeadMeasure.name;
        updates.alignedByAI = false; // Manual assignment
      }

      await onUpdate(proofModalId, updates);
      console.log('✅ Commitment updated:', updates);

      // AUTO-SCORING: Update lead measure scorecard when status changes
      if (effectiveLeadMeasureId && proofStatus !== previousStatus) {
        const currentProgress = currentUser.leadMeasureProgress?.[effectiveLeadMeasureId] || 0;
        console.log('📈 Auto-scoring:', { effectiveLeadMeasureId, currentProgress, proofStatus, previousStatus });

        // Increment if newly completed, decrement if un-completed
        if (proofStatus === 'completed' && previousStatus !== 'completed') {
          const newProgress = currentProgress + 1;
          console.log('⬆️ Incrementing score to:', newProgress);
          await StorageService.updateMemberMetrics(currentUser.id, {
            leadMeasureProgress: { ...currentUser.leadMeasureProgress, [effectiveLeadMeasureId]: newProgress }
          });
          console.log('✅ Score updated in Firebase');
        } else if (previousStatus === 'completed' && proofStatus !== 'completed') {
          const newProgress = Math.max(0, currentProgress - 1);
          console.log('⬇️ Decrementing score to:', newProgress);
          await StorageService.updateMemberMetrics(currentUser.id, {
            leadMeasureProgress: { ...currentUser.leadMeasureProgress, [effectiveLeadMeasureId]: newProgress }
          });
        }
      } else {
        console.log('⚠️ Auto-scoring SKIPPED:', { effectiveLeadMeasureId, statusChanged: proofStatus !== previousStatus });
      }

      setProofModalId(null);
      setProofLeadMeasure(null);
    } catch (e) {
      console.error("Proof update failed", e);
      alert("Encountered an error while saving. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
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
                {isValidating ? '🔍 Analysing Alignment...' : checkResult?.isAligned ? '✅ Aligned!' : '⚠️ Alignment Required'}
              </h3>
              <p className="text-slate-500 text-xs mt-1">"{pendingCommitment}"</p>
            </div>

            <div className="p-6 space-y-4">
              {isValidating ? (
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

                  {/* Suggested Alternative */}
                  {!checkResult.isAligned && checkResult.suggestedAlternative && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-blue-700 text-[10px] uppercase font-bold tracking-widest mb-2">💡 Suggested Alternative</p>
                      <p className="text-blue-900 text-sm font-medium mb-3">{checkResult.suggestedAlternative}</p>
                      <p className="text-blue-600 text-xs mb-2">Select which Lead Measure this applies to:</p>
                      <div className="flex flex-wrap gap-2">
                        {leadMeasures.map(m => (
                          <button
                            key={m.id}
                            onClick={() => {
                              // Use the suggested alternative with the selected lead measure
                              onAdd(checkResult.suggestedAlternative!, m.id, m.name);
                              setShowValidationModal(false);
                              setPendingCommitment('');
                              setCheckResult(null);
                            }}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual Lead Measure Selection (if not aligned) */}
                  {!checkResult.isAligned && leadMeasures.length > 0 && (
                    <div className="border-t border-slate-100 pt-4">
                      <p className="text-slate-600 text-xs font-semibold mb-3">Or select a Lead Measure manually:</p>
                      <div className="flex flex-wrap gap-2">
                        {leadMeasures.map(m => (
                          <button
                            key={m.id}
                            onClick={() => {
                              onAdd(pendingCommitment, m.id, m.name);
                              setShowValidationModal(false);
                              setPendingCommitment('');
                              setCheckResult(null);
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-brand-navy hover:text-white rounded-lg text-xs font-semibold transition-colors"
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-500 text-sm">No validation result available.</p>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowValidationModal(false);
                  setPendingCommitment('');
                  setCheckResult(null);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Modal */}
      {proofModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy bg-opacity-95 backdrop-blur-md">
          <div className="bg-white rounded-[2.5rem] w-full max-w-xl shadow-2xl animate-fade-in overflow-hidden border-4 border-white">
            <div className="p-8 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-brand-navy uppercase tracking-tight">Commitment Detail</h3>
                <p className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest mt-1">Impact verification</p>
              </div>
              <button onClick={() => setProofModalId(null)} className="text-slate-300 hover:text-brand-red transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-600 tracking-widest mb-3">Status of Progress</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['incomplete', 'partial', 'completed'] as CommitmentStatus[]).map(s => (
                    <button
                      key={s}
                      disabled={isSaving}
                      onClick={() => setProofStatus(s)}
                      className={`py-3 rounded-xl font-bold uppercase text-[10px] transition-all border-2 ${proofStatus === s ? (s === 'completed' ? 'bg-brand-green border-brand-green text-white shadow-lg' : s === 'partial' ? 'bg-brand-orange border-brand-orange text-white shadow-lg' : 'bg-brand-red border-brand-red text-white shadow-lg') : 'bg-white border-slate-100 text-slate-600'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lead Measure Selector - for scoring */}
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-600 tracking-widest mb-3">
                  Lead Measure {proofLeadMeasure ? '✓' : '(Required for scoring)'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {leadMeasures.map(m => (
                    <button
                      key={m.id}
                      disabled={isSaving}
                      onClick={() => setProofLeadMeasure({ id: m.id, name: m.name })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border-2 ${proofLeadMeasure?.id === m.id
                        ? 'bg-brand-navy border-brand-navy text-white shadow-lg'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-brand-navy'
                        }`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
                {!proofLeadMeasure && (
                  <p className="text-amber-600 text-xs mt-2">Select a Lead Measure to enable auto-scoring when you complete this commitment.</p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-600 tracking-widest mb-3">Execution Note</label>
                <textarea
                  className="w-full p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:ring-8 focus:ring-brand-navy/5 outline-none transition-all resize-none min-h-[120px]"
                  placeholder="What was the result? (e.g. 'Documentation updated')"
                  disabled={isSaving}
                  value={proofNote}
                  onChange={e => setProofNote(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-600 tracking-widest mb-3">Impact Photo</label>
                <div
                  onClick={() => !isSaving && fileInputRef.current?.click()}
                  className="cursor-pointer group relative h-48 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center overflow-hidden transition-all hover:border-brand-navy"
                >
                  {proofPhoto ? (
                    <>
                      <img src={proofPhoto} alt="Proof" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold uppercase tracking-widest">
                        Change Photo
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <svg className="w-12 h-12 text-slate-300 mb-2 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Evidence Upload</p>
                    </div>
                  )}
                  <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
                </div>
              </div>
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
              <button onClick={() => setProofModalId(null)} className="flex-1 py-5 rounded-2xl font-bold uppercase text-xs text-slate-600 hover:bg-slate-100 transition-all tracking-widest">Cancel</button>
              <button onClick={handleSaveProof} disabled={isSaving} className="flex-[2] py-5 rounded-2xl bg-brand-navy text-white font-bold uppercase text-xs shadow-xl hover:bg-black transition-all tracking-widest disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Update Commitment'}
              </button>
            </div>
          </div>
        </div>
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
                {suggestions.map((s) => (
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
                ))}
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
                      onChange={(e) => { setNewCommitment(e.target.value); setCheckResult(null); }}
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
                    onClick={(e) => { e.stopPropagation(); onToggle(commitment.id); }}
                    disabled={isEditing}
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
