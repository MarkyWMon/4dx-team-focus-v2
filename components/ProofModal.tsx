import React, { useRef, useState } from 'react';
import { Commitment, CommitmentStatus, TeamMember, LeadMeasureDefinition } from '../types';
import { StorageService } from '../services/storage';
import { AIService } from '../services/ai';

const JUNK_NOTES = new Set(['n/a', 'na', 'done', 'complete', 'completed', 'finished', 'yes', 'ok', 'okay', 'x', '-', '.', 'did it', 'all done']);

// Offline fallback when the AI note check is unreachable — closing must never
// hard-fail on connectivity.
const heuristicNoteOk = (note: string, description: string): boolean => {
  const t = note.trim().toLowerCase();
  if (t.length < 15) return false;
  if (JUNK_NOTES.has(t)) return false;
  if (t === description.trim().toLowerCase()) return false;
  return true;
};

interface ProofModalProps {
  commitment: Commitment;
  presetStatus?: CommitmentStatus;
  leadMeasures: LeadMeasureDefinition[];
  currentUser: TeamMember;
  onClose: () => void;
}

/**
 * The single close-out flow for a commitment, shared by Home and Commitments.
 * Saves through StorageService.applyCommitmentStatusChange so the audit trail
 * and gamification points always apply, and keeps leadMeasureProgress in sync.
 */
const ProofModal: React.FC<ProofModalProps> = ({ commitment, presetStatus, leadMeasures, currentUser, onClose }) => {
  const [status, setStatus] = useState<CommitmentStatus>(presetStatus || commitment.status);
  const [note, setNote] = useState(commitment.completionNote || '');
  const [photo, setPhoto] = useState<string | null>(commitment.completionPhoto || null);
  const [error, setError] = useState<string | null>(null);
  const [leadMeasure, setLeadMeasure] = useState<{ id: string; name: string } | null>(
    commitment.leadMeasureId && commitment.leadMeasureName
      ? { id: commitment.leadMeasureId, name: commitment.leadMeasureName }
      : null
  );
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPhoto(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;

    const effectiveLeadMeasureId = leadMeasure?.id || commitment.leadMeasureId;
    const isClosing = status === 'completed' || status === 'partial';

    // Closing requires evidence: a meaningful note or a photo.
    if (isClosing && !note.trim() && !photo) {
      setError('Add a note describing what you did, or attach a photo, before closing this commitment.');
      return;
    }
    if (status === 'completed' && !effectiveLeadMeasureId && leadMeasures.length > 0) {
      setError('Select a Lead Measure before marking as completed — it drives the scoreboard.');
      return;
    }

    setIsSaving(true);
    try {
      // Quality gate: photo counts as evidence on its own; a note-only close is
      // assessed by the AI (heuristic fallback when it's unreachable).
      let proofQuality: Commitment['proofQuality'] = undefined;
      if (isClosing) {
        if (photo) {
          proofQuality = 'photo';
        } else {
          const verdict = await AIService.assessProofNote(commitment.description, note.trim());
          if (verdict) {
            if (!verdict.acceptable) {
              setError(verdict.reason || 'Say what you actually did: where, what you found, what you changed.');
              setIsSaving(false);
              return;
            }
            proofQuality = 'ai_verified';
          } else {
            if (!heuristicNoteOk(note, commitment.description)) {
              setError('Say what you actually did: where, what you found, what you changed.');
              setIsSaving(false);
              return;
            }
            proofQuality = 'heuristic';
          }
        }
      }

      const previousStatus = commitment.status;

      const updates: Partial<Commitment> = {
        completionNote: note,
        completionPhoto: photo || (null as any),
      };
      if (proofQuality) {
        updates.proofQuality = proofQuality;
      }
      if (leadMeasure?.id) {
        updates.leadMeasureId = leadMeasure.id;
        updates.leadMeasureName = leadMeasure.name;
        updates.alignedByAI = false; // Manual assignment
      }

      await StorageService.applyCommitmentStatusChange(commitment.id, status, updates);

      // Keep the per-member lead measure scorecard in sync.
      if (effectiveLeadMeasureId && status !== previousStatus) {
        const currentProgress = currentUser.leadMeasureProgress?.[effectiveLeadMeasureId] || 0;
        if (status === 'completed' && previousStatus !== 'completed') {
          await StorageService.updateMemberMetrics(currentUser.id, {
            leadMeasureProgress: { ...currentUser.leadMeasureProgress, [effectiveLeadMeasureId]: currentProgress + 1 },
          });
        } else if (previousStatus === 'completed' && status !== 'completed') {
          await StorageService.updateMemberMetrics(currentUser.id, {
            leadMeasureProgress: { ...currentUser.leadMeasureProgress, [effectiveLeadMeasureId]: Math.max(0, currentProgress - 1) },
          });
        }
      }

      onClose();
    } catch (e) {
      setError('Something went wrong while saving. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl animate-fade-in overflow-hidden border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Close out commitment</h3>
            <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">{commitment.description}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-2">Status</label>
            <div className="grid grid-cols-3 gap-2">
              {(['incomplete', 'partial', 'completed'] as CommitmentStatus[]).map(s => (
                <button
                  key={s}
                  disabled={isSaving}
                  onClick={() => setStatus(s)}
                  className={`py-2 rounded-lg text-xs font-semibold capitalize transition-all border ${status === s
                    ? (s === 'completed' ? 'bg-brand-green border-brand-green text-white' : s === 'partial' ? 'bg-brand-orange border-brand-orange text-white' : 'bg-brand-red border-brand-red text-white')
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {leadMeasures.length > 0 && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-2">
                Lead measure {leadMeasure ? '✓' : '(required to complete)'}
              </label>
              <div className="flex flex-wrap gap-2">
                {leadMeasures.map(m => (
                  <button
                    key={m.id}
                    disabled={isSaving}
                    onClick={() => setLeadMeasure({ id: m.id, name: m.name })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${leadMeasure?.id === m.id
                      ? 'bg-brand-navy border-brand-navy text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-brand-navy'}`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-2">
              What did you actually do? {(status === 'completed' || status === 'partial') && <span className="text-brand-red">(required)</span>}
            </label>
            <textarea
              className={`w-full p-3 bg-slate-50 border rounded-lg text-sm focus:ring-2 focus:ring-brand-navy/20 outline-none transition-all resize-none min-h-[90px] ${error ? 'border-brand-red' : 'border-slate-200'}`}
              placeholder="e.g. Walked B-block labs, found two loose network points, logged tickets for both"
              disabled={isSaving}
              value={note}
              onChange={e => { setNote(e.target.value); if (error) setError(null); }}
            />
            {error && <p className="text-brand-red text-xs font-medium mt-1.5">{error}</p>}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-2">Photo evidence (optional)</label>
            <div
              onClick={() => !isSaving && fileInputRef.current?.click()}
              className="cursor-pointer group relative h-28 bg-slate-50 border border-dashed border-slate-300 rounded-lg flex items-center justify-center overflow-hidden transition-all hover:border-brand-navy"
            >
              {photo ? (
                <>
                  <img src={photo} alt="Proof" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-semibold">
                    Change photo
                  </div>
                </>
              ) : (
                <div className="text-center text-slate-400">
                  <svg className="w-6 h-6 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <p className="text-[11px] font-medium">Add a photo</p>
                </div>
              )}
              <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoUpload} className="hidden" />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} disabled={isSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="flex-[2] py-2.5 rounded-lg bg-brand-navy text-white text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50">
            {isSaving ? 'Checking note…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProofModal;
