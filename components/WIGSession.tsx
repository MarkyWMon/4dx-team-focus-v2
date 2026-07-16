import React, { useState, useEffect, useRef } from 'react';
import { TeamMember, WIGSession, WIGSessionStep, Commitment, MemberReview } from '../types';
import { StorageService } from '../services/storage';
import { AIService } from '../services/ai';
import { getPreviousWeekId, WIN_THRESHOLD } from '../utils';

interface WIGSessionProps {
    currentUser: TeamMember;
    members: TeamMember[];
    currentWeekId: string;
    onClose: () => void;
}

const AGENDA_STEPS: WIGSessionStep[] = [
    { id: 1, title: "Review Scoreboard", durationMinutes: 5, completed: false, prompt: "Are we winning? What's the current WIG score? Review the Lag and Lead measures." },
    { id: 2, title: "Account for Commitments", durationMinutes: 10, completed: false, prompt: "Review last week's commitments. Did we do what we said we would do? (80% rule)" },
    { id: 3, title: "Learn from Success/Failure", durationMinutes: 5, completed: false, prompt: "What worked? What got in the way? Share quick wins and blocked paths." },
    { id: 4, title: "Plan New Commitments", durationMinutes: 15, completed: false, prompt: "What are the 1-3 most important things I can do this week to impact the lead measure?" },
    { id: 5, title: "Clear the Path", durationMinutes: 5, completed: false, prompt: "What obstacles need to be removed? Who needs help?" }
];

const WIGSessionView: React.FC<WIGSessionProps> = ({ currentUser, members, currentWeekId, onClose }) => {
    const [session, setSession] = useState<WIGSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isResetting, setIsResetting] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [reviewStep, setReviewStep] = useState(1);
    const [prevCommitments, setPrevCommitments] = useState<Commitment[]>([]);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [queriedIds, setQueriedIds] = useState<Record<string, string[]>>({});
    const [savingReviewFor, setSavingReviewFor] = useState<string | null>(null);
    const timerRef = useRef<number | null>(null);

    const isManager = ['ADMIN', 'MANAGER'].includes(currentUser.role);

    // --- Step 2 accountability actions (manager only) ---
    const handleConfirmCommitment = async (c: Commitment) => {
        if (!isManager || !session) return;
        await StorageService.updateCommitment(c.id, {
            verifiedBy: currentUser.name,
            verifiedAt: Date.now(),
            verifiedInSessionId: session.id,
        });
    };

    const handleQueryCommitment = async (c: Commitment, memberId: string) => {
        if (!isManager || !session) return;
        if (!confirm('Reopen this commitment as queried? It goes back to "partial" and the member is nudged to address it.')) return;
        await StorageService.applyCommitmentStatusChange(c.id, 'partial');
        setQueriedIds(prev => ({ ...prev, [memberId]: [...(prev[memberId] || []), c.id] }));
    };

    const handleSaveReview = async (member: TeamMember) => {
        if (!isManager || !session) return;
        const existing = (session.memberReviews || []).find(r => r.memberId === member.id);
        const note = (reviewNotes[member.id] ?? existing?.note ?? '').trim();
        if (note.length < 10) {
            alert('Write a short note about what was discussed with this member (at least 10 characters).');
            return;
        }
        setSavingReviewFor(member.id);
        try {
            const memberCommits = prevCommitments.filter(c => c.memberId === member.id);
            const review: MemberReview = {
                memberId: member.id,
                note,
                confirmedIds: memberCommits.filter(c => c.verifiedBy).map(c => c.id),
                queriedIds: queriedIds[member.id] || existing?.queriedIds || [],
            };
            const others = (session.memberReviews || []).filter(r => r.memberId !== member.id);
            await StorageService.updateWIGSession(session.id, { memberReviews: [...others, review] });

            // Advisory AI cross-check: does the note match what the member
            // actually committed to and reported?
            const warning = await AIService.crossCheckReviewNote(
                member.name,
                note,
                memberCommits.map(c => ({ description: c.description, completionNote: c.completionNote }))
            );
            if (warning) {
                await StorageService.updateWIGSession(session.id, { memberReviews: [...others, { ...review, aiFlag: warning }] });
            }
        } finally {
            setSavingReviewFor(null);
        }
    };

    useEffect(() => {
        const unsubscribe = StorageService.subscribeToWIGSessions((sessions) => {
            const active = sessions.find(s => s.weekId === currentWeekId);
            if (active) {
                setSession(active);
            }
            setLoading(false);
        });

        // 2. Load previous week's commitments for accountability
        const prevWeekId = getPreviousWeekId(currentWeekId);
        const unsubCommitments = StorageService.subscribeToCommitments((all) => {
            setPrevCommitments(all.filter(c => c.weekId === prevWeekId));
        });

        return () => {
            unsubscribe();
            unsubCommitments();
        };
    }, [currentWeekId]);

    useEffect(() => {
        if (session?.status === 'in_progress' && session.currentStep) {
            const step = AGENDA_STEPS.find(s => s.id === session.currentStep);
            if (step) {
                // Reset timer when step changes (in a real app, might want to persist timer state)
                setTimeLeft(step.durationMinutes * 60);
            }
        }
    }, [session?.currentStep, session?.status]);

    useEffect(() => {
        if (session?.status === 'in_progress' && timeLeft > 0) {
            const interval = setInterval(() => {
                setTimeLeft(prev => prev - 1);
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [timeLeft, session?.status]);

    const handleStartSession = async () => {
        if (session) {
            await StorageService.updateWIGSession(session.id, {
                status: 'in_progress',
                startedAt: Date.now(),
                currentStep: 1
            });
        } else {
            const id = await StorageService.createWIGSession(currentWeekId, currentUser.name);
            await StorageService.updateWIGSession(id, {
                status: 'in_progress',
                startedAt: Date.now(),
                currentStep: 1
            });
        }
    };

    const handleNextStep = async () => {
        if (!session) return;

        // Step 2 gate: every completed commitment must be confirmed or queried,
        // and every member with commitments needs a saved accountability note.
        if (session.currentStep === 2) {
            const problems: string[] = [];
            members.forEach(m => {
                const mine = prevCommitments.filter(c => c.memberId === m.id);
                if (mine.length === 0) return;
                const unverified = mine.filter(c => c.status === 'completed' && !c.verifiedBy);
                if (unverified.length > 0) {
                    problems.push(`${m.name}: ${unverified.length} completed commitment${unverified.length === 1 ? '' : 's'} not yet confirmed or queried`);
                }
                const review = (session.memberReviews || []).find(r => r.memberId === m.id);
                if (!review || review.note.trim().length < 10) {
                    problems.push(`${m.name}: no accountability note saved`);
                }
            });
            if (problems.length > 0) {
                alert('Step 2 is not complete yet:\n\n' + problems.join('\n'));
                return;
            }
        }

        if (session.currentStep < AGENDA_STEPS.length) {
            await StorageService.updateWIGSession(session.id, { currentStep: session.currentStep + 1 });
        } else {
            await StorageService.updateWIGSession(session.id, {
                status: 'completed',
                completedAt: Date.now()
            });
        }
    };

    const handleResetSession = async () => {
        if (!session || !['ADMIN', 'MANAGER'].includes(currentUser.role)) return;
        if (!confirm("Are you sure you want to reset this session? All progress will be lost.")) return;

        setIsResetting(true);
        try {
            await StorageService.deleteWIGSession(session.id);
            setSession(null);
        } catch (e) {
            console.error("Error resetting session:", e);
        } finally {
            setIsResetting(false);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const currentStepId = isReviewing ? reviewStep : session?.currentStep;


    const currentAgendaItem = session ? AGENDA_STEPS.find(s => s.id === currentStepId) : null;

    if (loading) return <div className="py-10 text-center text-sm text-slate-400">Loading WIG session…</div>;

    // -- PRE-SESSION VIEW --
    if (!session || (session.status === 'scheduled' && !isReviewing)) {
        return (
            <div className="max-w-3xl mx-auto animate-fade-in space-y-3">
                <div className="ui-card">
                    <h1 className="text-base font-semibold text-slate-900">Weekly WIG session</h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        It's time to recalibrate. 20 minutes to focus on the one thing that matters most.
                    </p>
                </div>

                <div className="ui-card">
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Run of show</h3>
                    <div className="divide-y divide-slate-100">
                        {AGENDA_STEPS.map((step, idx) => (
                            <div key={step.id} className="flex items-center gap-3 py-2.5">
                                <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center font-semibold text-slate-500 text-xs ui-metric shrink-0">
                                    {step.id}
                                </div>
                                <div className="flex-grow">
                                    <h4 className="text-sm font-semibold text-slate-900">{step.title}</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">{step.prompt}</p>
                                </div>
                                <span className="ui-chip bg-slate-100 text-slate-600 ui-metric shrink-0">
                                    {step.durationMinutes}m
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
                        <button
                            onClick={handleStartSession}
                            className="bg-brand-navy text-white text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-all"
                        >
                            Start session
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // -- IN PROGRESS OR REVIEW VIEW --
    if ((session.status === 'in_progress' || isReviewing) && currentAgendaItem) {
        return (
            <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col">
                {/* Header / Timer */}
                <div className="ui-card !py-3 flex justify-between items-center mb-3">
                    <div>
                        {isReviewing && <span className="ui-chip bg-yellow-50 border border-yellow-200 text-yellow-800 mb-1">Review mode (read only)</span>}
                        <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Current focus</span>
                        <h2 className="text-base font-semibold text-slate-900">{currentAgendaItem.title}</h2>
                    </div>

                    <div className={`font-mono text-2xl font-semibold ui-metric ${timeLeft < 60 ? 'text-brand-red animate-pulse' : 'text-slate-900'}`}>
                        {formatTime(timeLeft)}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 flex-grow overflow-hidden">
                    {/* Guidelines */}
                    <div className="lg:col-span-1 ui-card flex flex-col justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900 mb-2">💡 Coach's prompt</h3>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                {currentAgendaItem.prompt}
                            </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Up next</div>
                            {AGENDA_STEPS.filter(s => s.id > currentStepId).slice(0, 2).map(s => (
                                <div key={s.id} className="text-xs text-slate-400 font-medium">{s.id}. {s.title}</div>
                            ))}
                        </div>
                    </div>

                    {/* Interactive Area */}
                    <div className="lg:col-span-2 ui-card flex flex-col">
                        <div className="flex-grow overflow-y-auto pr-2">
                            {currentStepId === 1 && (
                                <div className="text-center py-10">
                                    <div className="text-4xl mb-3">📊</div>
                                    <p className="text-sm text-slate-600 font-semibold">Project the scoreboard on the main screen now.</p>
                                    <p className="text-xs text-slate-400 mt-1">Does everyone know the score?</p>
                                </div>
                            )}

                            {currentStepId === 2 && (
                                <div className="space-y-3">
                                    <div className="flex justify-between items-end mb-2">
                                        <h4 className="text-sm font-semibold text-slate-900">Commitment audit (last week)</h4>
                                        {(() => {
                                            const total = prevCommitments.length;
                                            const done = prevCommitments.filter(c => c.status === 'completed').length;
                                            const winning = total > 0 && done / total >= WIN_THRESHOLD;
                                            return (
                                                <div className={`ui-chip ui-metric ${winning ? 'text-brand-green bg-green-50' : 'text-brand-red bg-red-50'}`}>
                                                    {total === 0
                                                        ? 'No commitments to audit'
                                                        : `Team ${Math.round((done / total) * 100)}% · Target ${WIN_THRESHOLD * 100}%`}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {members.map(m => {
                                            const memberCommits = prevCommitments.filter(c => c.memberId === m.id);
                                            return (
                                                <div key={m.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex flex-col gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-[10px] font-bold uppercase">{m.avatar}</div>
                                                        <div>
                                                            <span className="text-sm font-semibold text-slate-900">{m.name}</span>
                                                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide ui-metric">{memberCommits.length} commitments made</p>
                                                        </div>
                                                        {memberCommits.length > 0 && (() => {
                                                            const done = memberCommits.filter(c => c.status === 'completed').length;
                                                            const rate = done / memberCommits.length;
                                                            const won = rate >= WIN_THRESHOLD;
                                                            return (
                                                                <div className={`ml-auto ui-chip ui-metric ${won ? 'bg-brand-green/10 text-brand-green' : 'bg-red-50 text-brand-red'}`}>
                                                                    {done}/{memberCommits.length} · {Math.round(rate * 100)}%
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>

                                                    <div className="space-y-2">
                                                        {memberCommits.length === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic font-medium">No commitments found for last week.</p>
                                                        ) : (
                                                            memberCommits.map(c => (
                                                                <div key={c.id} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-100 transition-all hover:border-brand-navy">
                                                                    <div className={`mt-0.5 h-4 w-4 rounded-full border flex-shrink-0 flex items-center justify-center ${c.status === 'completed' ? 'bg-brand-green border-brand-green text-white' : c.status === 'partial' ? 'bg-brand-orange border-brand-orange text-white' : 'border-slate-200 text-slate-200'}`}>
                                                                        {c.status === 'completed' && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                                                                    </div>
                                                                    <div className="flex-grow">
                                                                        <p className="text-xs font-semibold text-slate-800 leading-tight">{c.description}</p>
                                                                        {(c.completionNote || c.completionPhoto) && (
                                                                            <div className="mt-2 flex gap-3 items-center">
                                                                                {c.completionPhoto && (
                                                                                    <div className="h-12 w-16 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
                                                                                        <img src={c.completionPhoto} className="h-full w-full object-cover" alt="Proof" />
                                                                                    </div>
                                                                                )}
                                                                                {c.completionNote && <p className="text-[10px] text-slate-500 italic flex-grow">"{c.completionNote}"</p>}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {c.status === 'completed' && (
                                                                        c.verifiedBy ? (
                                                                            <span className="ui-chip bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0" title={`Verified by ${c.verifiedBy}`}>Verified ✓</span>
                                                                        ) : isManager && !isReviewing ? (
                                                                            <span className="flex gap-1 shrink-0">
                                                                                <button onClick={() => handleConfirmCommitment(c)} className="ui-chip bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Confirm</button>
                                                                                <button onClick={() => handleQueryCommitment(c, m.id)} className="ui-chip bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors">Query</button>
                                                                            </span>
                                                                        ) : (
                                                                            <span className="ui-chip bg-slate-100 text-slate-400 shrink-0">Unverified</span>
                                                                        )
                                                                    )}
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>

                                                    {memberCommits.length > 0 && (() => {
                                                        const review = (session.memberReviews || []).find(r => r.memberId === m.id);
                                                        return (
                                                            <div className="pt-1">
                                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Accountability note</span>
                                                                    {review && review.note.trim().length >= 10 && <span className="ui-chip bg-emerald-50 text-emerald-700">Saved ✓</span>}
                                                                    {review?.aiFlag && <span className="ui-chip bg-amber-50 text-amber-700">⚠ {review.aiFlag}</span>}
                                                                </div>
                                                                {isManager && !isReviewing ? (
                                                                    <div className="flex gap-2">
                                                                        <input
                                                                            value={reviewNotes[m.id] ?? review?.note ?? ''}
                                                                            onChange={e => setReviewNotes(prev => ({ ...prev, [m.id]: e.target.value }))}
                                                                            placeholder="What did they say? What was agreed for next week?"
                                                                            className="flex-grow border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white focus:border-brand-navy outline-none transition-colors"
                                                                        />
                                                                        <button
                                                                            onClick={() => handleSaveReview(m)}
                                                                            disabled={savingReviewFor === m.id}
                                                                            className="px-3 py-2 rounded-lg bg-brand-navy text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all shrink-0"
                                                                        >
                                                                            {savingReviewFor === m.id ? 'Checking…' : 'Save note'}
                                                                        </button>
                                                                    </div>
                                                                ) : review?.note ? (
                                                                    <p className="text-xs text-slate-600 italic">"{review.note}"</p>
                                                                ) : (
                                                                    <p className="text-[10px] text-slate-400 italic">No note yet.</p>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {(currentStepId === 3 || currentStepId === 5) && (
                                <div>
                                    <textarea
                                        className="w-full h-64 p-3 bg-slate-50 rounded-lg border border-slate-200 focus:bg-white focus:border-brand-navy outline-none text-sm resize-none transition-colors"
                                        placeholder={currentStepId === 3 ? "Record key wins or learnings here..." : "List any obstacles preventing execution..."}
                                        value={currentStepId === 3 ? session.notes : session.obstacles}
                                        disabled={isReviewing}
                                        onChange={(e) => !isReviewing && StorageService.updateWIGSession(session.id, { [currentStepId === 3 ? 'notes' : 'obstacles']: e.target.value })}
                                    />
                                </div>
                            )}

                            {currentStepId === 4 && (
                                <div className="text-center py-10">
                                    <div className="text-4xl mb-3">⚡</div>
                                    <p className="text-sm text-slate-600 font-semibold">Everyone open "My Commitments" and log next week's plan.</p>
                                    <p className="text-xs text-slate-400 mt-1">Ensure high leverage & specificity.</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                            <button
                                onClick={onClose}
                                className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Exit
                            </button>
                            {isReviewing ? (
                                <button
                                    onClick={() => {

                                        if (reviewStep < 5) {
                                            setReviewStep(prev => prev + 1);
                                        } else {
                                            setIsReviewing(false);
                                        }
                                    }}
                                    className="px-4 py-2 bg-yellow-100 text-yellow-900 text-sm font-semibold rounded-lg hover:bg-yellow-200 transition-all flex items-center gap-2"
                                >
                                    {reviewStep === 5 ? 'Finish review' : 'Next step'} <span aria-hidden>→</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleNextStep}
                                    className="px-4 py-2 bg-brand-navy text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2"
                                >
                                    {session.currentStep === 5 ? 'Finish session' : 'Next step'} <span aria-hidden>→</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // -- COMPLETED VIEW --
    return (
        <div className="max-w-md mx-auto text-center animate-fade-in">
            <div className="ui-card">
                <div className="h-12 w-12 bg-green-100 text-brand-green rounded-full flex items-center justify-center text-2xl mb-3 mx-auto">
                    🎉
                </div>
                <h2 className="text-base font-semibold text-slate-900 mb-1">Session complete</h2>
                <p className="text-xs text-slate-500 mb-4">Great accountability today. Let's execute on those commitments.</p>

                <div className="flex flex-col gap-2">
                    <button onClick={onClose} className="bg-brand-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-all w-full">
                        Return to dashboard
                    </button>

                    <button
                        onClick={() => { setIsReviewing(true); setReviewStep(1); }}
                        className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors w-full"
                    >
                        Review session (read only)
                    </button>


                    {['ADMIN', 'MANAGER'].includes(currentUser.role) && (
                        <button
                            onClick={handleResetSession}
                            disabled={isResetting}
                            className="text-slate-400 px-4 py-2 rounded-lg text-xs font-semibold hover:text-brand-red transition-colors"
                        >
                            {isResetting ? 'Resetting…' : 'Reset session (manager only)'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WIGSessionView;
