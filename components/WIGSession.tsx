import React, { useState, useEffect, useRef } from 'react';
import { TeamMember, WIGSession, WIGSessionStep, Commitment } from '../types';
import { StorageService } from '../services/storage';
import { getPreviousWeekId } from '../utils';

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
    const timerRef = useRef<number | null>(null);

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
            const id = await StorageService.createWIGSession(currentWeekId);
            await StorageService.updateWIGSession(id, {
                status: 'in_progress',
                startedAt: Date.now(),
                currentStep: 1
            });
        }
    };

    const handleNextStep = async () => {
        if (!session) return;
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
    console.log('Render: isReviewing=', isReviewing, ' reviewStep=', reviewStep, ' sessionStep=', session?.currentStep, ' currentStepId=', currentStepId);

    const currentAgendaItem = session ? AGENDA_STEPS.find(s => s.id === currentStepId) : null;

    if (loading) return <div className="p-12 text-center text-slate-400">Loading WIG Session...</div>;

    // -- PRE-SESSION VIEW --
    if (!session || (session.status === 'scheduled' && !isReviewing)) {
        return (
            <div className="max-w-4xl mx-auto p-6 animate-fade-in">
                <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-100 relative">
                    <div className="bg-brand-navy p-12 text-center relative overflow-hidden">
                        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                        <h1 className="text-4xl font-black text-white font-display uppercase tracking-tight mb-4 relative z-10">Weekly WIG Session</h1>
                        <p className="text-blue-200 font-medium text-lg max-w-xl mx-auto relative z-10">
                            It's time to recalibrate. 20 minutes to focus on the one thing that matters most.
                        </p>
                    </div>

                    <div className="p-12">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-8 text-center">Run of Show</h3>
                        <div className="space-y-6 max-w-2xl mx-auto">
                            {AGENDA_STEPS.map((step, idx) => (
                                <div key={step.id} className="flex items-center gap-6 p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center font-black text-slate-400 text-sm">
                                        {step.id}
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="font-bold text-slate-900 uppercase tracking-tight">{step.title}</h4>
                                        <p className="text-xs text-slate-500 mt-1">{step.prompt}</p>
                                    </div>
                                    <div className="text-xs font-black text-brand-red bg-red-50 px-3 py-1 rounded-full">
                                        {step.durationMinutes}m
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-12 text-center">
                            <button
                                onClick={handleStartSession}
                                className="bg-brand-red text-white font-black text-lg px-12 py-5 rounded-2xl shadow-xl hover:bg-brand-darkRed hover:scale-105 transition-all active:scale-95 uppercase tracking-widest"
                            >
                                Start Session
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // -- IN PROGRESS OR REVIEW VIEW --
    if ((session.status === 'in_progress' || isReviewing) && currentAgendaItem) {
        return (
            <div className="max-w-6xl mx-auto p-4 h-[calc(100vh-100px)] flex flex-col">
                {/* Header / Timer */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex justify-between items-center mb-6">
                    <div>
                        {isReviewing && <span className="inline-block bg-yellow-100 text-yellow-800 text-[10px] font-black px-2 py-1 rounded mb-1 uppercase tracking-widest">👀 Review Mode (Read Only)</span>}
                        <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Current Focus</span>
                        <h2 className="text-2xl font-black text-brand-navy font-display uppercase tracking-tight">{currentAgendaItem.title}</h2>
                    </div>

                    <div className={`font-mono text-4xl font-black tabular-nums tracking-tighter ${timeLeft < 60 ? 'text-brand-red animate-pulse' : 'text-slate-900'}`}>
                        {formatTime(timeLeft)}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-grow overflow-hidden">
                    {/* Guidelines */}
                    <div className="lg:col-span-1 bg-brand-navy rounded-3xl p-8 text-white flex flex-col justify-between">
                        <div>
                            <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6 text-2xl">💡</div>
                            <h3 className="text-xl font-bold mb-4 font-display">Coach's Prompt</h3>
                            <p className="text-blue-100 text-lg leading-relaxed font-light opacity-90">
                                {currentAgendaItem.prompt}
                            </p>
                        </div>

                        <div className="mt-8 space-y-4">
                            <div className="text-[10px] font-black uppercase tracking-widest opacity-50">Up Next</div>
                            {AGENDA_STEPS.filter(s => s.id > currentStepId).slice(0, 2).map(s => (
                                <div key={s.id} className="opacity-50 text-sm font-bold">{s.id}. {s.title}</div>
                            ))}
                        </div>
                    </div>

                    {/* Interactive Area */}
                    <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-slate-100 shadow-sm flex flex-col">
                        <div className="flex-grow overflow-y-auto pr-2">
                            {currentStepId === 1 && (
                                <div className="text-center py-12">
                                    <div className="text-6xl mb-4">📊</div>
                                    <p className="text-slate-500 font-bold">Project the Scoreboard on the main screen now.</p>
                                    <p className="text-sm text-slate-400 mt-2">Does everyone know the score?</p>
                                </div>
                            )}

                            {currentStepId === 2 && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end mb-4">
                                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Commitment Audit (Last Week)</h4>
                                        <div className="text-[10px] font-bold text-brand-red uppercase bg-red-50 px-2 py-1 rounded">Target: 80% Success Rate</div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        {members.map(m => {
                                            const memberCommits = prevCommitments.filter(c => c.memberId === m.id);
                                            return (
                                                <div key={m.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-100 flex flex-col gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center text-xs font-black shadow-sm">{m.avatar}</div>
                                                        <div>
                                                            <span className="font-black text-slate-900 uppercase text-xs tracking-tight">{m.name}</span>
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{memberCommits.length} Commitments Made</p>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        {memberCommits.length === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic font-medium">No commitments found for last week.</p>
                                                        ) : (
                                                            memberCommits.map(c => (
                                                                <div key={c.id} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-100 shadow-sm transition-all hover:border-brand-navy">
                                                                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${c.status === 'completed' ? 'bg-brand-green border-brand-green text-white' : c.status === 'partial' ? 'bg-brand-orange border-brand-orange text-white' : 'border-slate-200 text-slate-200'}`}>
                                                                        {c.status === 'completed' && <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                                                                    </div>
                                                                    <div className="flex-grow">
                                                                        <p className="text-xs font-bold text-slate-800 leading-tight">{c.description}</p>
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
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {(currentStepId === 3 || currentStepId === 5) && (
                                <div>
                                    <textarea
                                        className="w-full h-64 p-6 bg-slate-50 rounded-2xl border-2 border-slate-100 focus:ring-4 focus:ring-brand-navy/10 outline-none text-lg resize-none"
                                        placeholder={currentStepId === 3 ? "Record key wins or learnings here..." : "List any obstacles preventing execution..."}
                                        value={currentStepId === 3 ? session.notes : session.obstacles}
                                        disabled={isReviewing}
                                        onChange={(e) => !isReviewing && StorageService.updateWIGSession(session.id, { [currentStepId === 3 ? 'notes' : 'obstacles']: e.target.value })}
                                    />
                                </div>
                            )}

                            {currentStepId === 4 && (
                                <div className="text-center py-12">
                                    <div className="text-6xl mb-4">⚡</div>
                                    <p className="text-slate-500 font-bold">Everyone open "My Commitments" and log next week's plan.</p>
                                    <p className="text-sm text-slate-400 mt-2">Ensure high leverage & specificity.</p>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 text-slate-400 font-bold hover:text-slate-600 uppercase tracking-widest text-xs"
                            >
                                Exit
                            </button>
                            {isReviewing ? (
                                <button
                                    onClick={() => {
                                        console.log('Review Step Click. Current:', reviewStep);
                                        if (reviewStep < 5) {
                                            setReviewStep(prev => prev + 1);
                                        } else {
                                            setIsReviewing(false);
                                        }
                                    }}
                                    className="px-8 py-4 bg-yellow-100 text-yellow-900 font-black rounded-xl hover:bg-yellow-200 transition-all shadow-lg uppercase tracking-widest text-xs flex items-center gap-2"
                                >
                                    {reviewStep === 5 ? 'Finish Review' : 'Next Step'} <span className="text-yellow-700">→</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleNextStep}
                                    className="px-8 py-4 bg-brand-navy text-white font-black rounded-xl hover:bg-black transition-all shadow-lg uppercase tracking-widest text-xs flex items-center gap-2"
                                >
                                    {session.currentStep === 5 ? 'Finish Session' : 'Next Step'} <span className="text-brand-red">→</span>
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
        <div className="max-w-2xl mx-auto p-12 text-center animate-fade-in">
            <div className="bg-white rounded-[3rem] p-12 shadow-2xl border-4 border-slate-50">
                <div className="h-24 w-24 bg-green-100 text-brand-green rounded-full flex items-center justify-center text-5xl mb-8 mx-auto shadow-inner">
                    🎉
                </div>
                <h2 className="text-3xl font-black text-brand-navy font-display uppercase tracking-tight mb-4">Session Complete!</h2>
                <p className="text-slate-500 font-medium mb-12">Great accountability today. Let's execute on those commitments.</p>

                <div className="flex flex-col gap-4">
                    <button onClick={onClose} className="bg-slate-900 text-white px-10 py-4 rounded-xl font-black uppercase tracking-widest hover:scale-105 transition-transform w-full">
                        Return to Dashboard
                    </button>

                    <button
                        onClick={() => { setIsReviewing(true); setReviewStep(1); }}
                        className="bg-white border-2 border-slate-100 text-slate-600 px-10 py-3 rounded-xl font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors w-full flex items-center justify-center gap-2"
                    >
                        <span>👀</span> Review Session (Read Only)
                    </button>


                    {['ADMIN', 'MANAGER'].includes(currentUser.role) && (
                        <button
                            onClick={handleResetSession}
                            disabled={isResetting}
                            className="bg-transparent text-slate-400 px-10 py-2 rounded-xl font-bold uppercase tracking-widest text-xs hover:text-red-500 transition-colors"
                        >
                            {isResetting ? 'Resetting...' : 'Reset Session (Manager Only)'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WIGSessionView;
