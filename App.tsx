import React, { useState, useEffect, useRef } from 'react';
import { AppView, TeamMember, Commitment, LeadMeasure, Ticket, WIGConfig, CommitmentTemplate, BrandingConfig, DEFAULT_BRANDING, Achievement, SurveyResult, WIGSession } from './types';
import { computeNudges } from './services/obligations';
import Home from './components/Home';
import { StorageService } from './services/storage';
import { WHDService } from './services/whd';
import { AIService } from './services/ai';
import { GamificationService } from './services/gamification';
import { getWeekId, getPreviousWeekId, getNextWeekId, setWigDayOfWeek } from './utils';
import { auth, onAuthStateChanged, signOut, getRedirectResult } from './services/firebase';
import MyCommitments from './components/MyCommitments';
import TeamManagement from './components/TeamManagement';
import CommitmentHistory from './components/CommitmentHistory';
import Login from './components/Login';
import WIGSessionView from './components/WIGSession';
import SurveyUpload from './components/SurveyUpload';
import SurveyAnalytics from './components/SurveyAnalytics';
import CommitmentAnalytics from './components/CommitmentAnalytics';
import ProfileDropdown from './components/ProfileDropdown';
import AchievementToast from './components/AchievementToast';
import { COMMITMENT_TEMPLATES } from './data/commitmentTemplates';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const hasSeeded = useRef(false);
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [surveys, setSurveys] = useState<SurveyResult[]>([]);
  const [templates, setTemplates] = useState<CommitmentTemplate[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>(getWeekId());
  const [wigConfig, setWIGConfig] = useState<WIGConfig | null>(null);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);
  const [surveyStartDate, setSurveyStartDate] = useState<number | null>(null);
  const [activeAchievement, setActiveAchievement] = useState<Achievement | null>(null);
  const seenAchievements = useRef<Set<string>>(new Set());

  // Single, high-leverage Lead Measure focusing purely on Proactive Strategy
  const [leadMeasures] = useState<LeadMeasure[]>([
    {
      id: 'wig-lead-1',
      name: 'Proactive Strategic Wins',
      value: '18',
      changeDescription: 'Target: 20+ per week',
      status: 'good'
    }
  ]);

  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<WIGSession[]>([]);
  const [composerDraft, setComposerDraft] = useState<string | null>(null);
  const [showBell, setShowBell] = useState(false);

  // Check for redirect result on mount
  useEffect(() => {
    getRedirectResult(auth).catch((e) => {
      console.error("Auth Redirect Error:", e.message);
      setAccessError(`Auth Redirect Failed: ${e.message}`);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setIsAuthorized(false);
        setAuthLoading(false);
        setView(AppView.LOGIN);
        return;
      }

      try {
        const email = firebaseUser.email?.toLowerCase();
        if (!email) throw new Error("SSO Identity missing email field.");

        // Only college accounts may use the app. Firestore rules enforce this
        // server-side; this check just gives a clear message and signs out.
        const allowedDomain = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || 'bhasvic.ac.uk').toLowerCase();
        if (!email.endsWith(`@${allowedDomain}`)) {
          setAccessError(`Access Denied: only ${allowedDomain} accounts can use this system.`);
          setIsAuthorized(false);
          setAuthLoading(false);
          await signOut(auth);
          return;
        }

        let sessionMember = await StorageService.getMemberById(firebaseUser.uid);

        if (!sessionMember) {
          const bestEmailRecord = await StorageService.getMemberByEmail(email);

          if (bestEmailRecord) {
            sessionMember = await StorageService.linkAndProvision(
              firebaseUser.uid,
              bestEmailRecord.name || firebaseUser.displayName || email.split('@')[0],
              email,
              bestEmailRecord.role
            );
          }
        }

        if (!sessionMember) {
          sessionMember = await StorageService.linkAndProvision(
            firebaseUser.uid,
            firebaseUser.displayName || email.split('@')[0],
            email,
            'STAFF'
          );
        }

        if (sessionMember) {
          setCurrentUser(sessionMember);
          setIsAuthorized(true);
          await StorageService.logLogin(firebaseUser.uid, sessionMember.name);
          if (view === AppView.LOGIN) {
            setView(AppView.DASHBOARD);
          }
        } else {
          setAccessError(`Access Denied: ${email} is not authorized on this roster.`);
        }
      } catch (e: any) {
        console.error("Auth System Error:", e.message);
        setAccessError(`Handshake Failed: ${e.message}`);
      } finally {
        setAuthLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthorized || !auth.currentUser) return;
    const unsubMembers = StorageService.subscribeToMembers((updatedMembers) => {
      setMembers(updatedMembers);
      const me = updatedMembers.find(m => m.id === auth.currentUser?.uid);
      if (me) {
        // Detect new achievements
        if (me.achievements) {
          me.achievements.forEach(a => {
            if (!seenAchievements.current.has(a.id)) {
              seenAchievements.current.add(a.id);
              setActiveAchievement(a);
            }
          });
        }
        setCurrentUser(me);
      }
    });
    const unsubCommitments = StorageService.subscribeToCommitments((updatedCommitments) => {
      setCommitments(updatedCommitments);
    });
    const unsubWIG = StorageService.subscribeToWIGConfig((config) => {
      setWIGConfig(config);
      setWigDayOfWeek(config?.wigDayOfWeek);
    });
    const unsubTickets = StorageService.subscribeToTickets((updatedTickets) => {
      setTickets(updatedTickets);
    });

    const unsubTemplates = StorageService.subscribeToTemplates((updatedTemplates) => {
      setTemplates(updatedTemplates);
    });
    const unsubSurveys = StorageService.subscribeToSurveys((updatedSurveys) => {
      setSurveys(updatedSurveys);
    });
    const unsubBranding = StorageService.subscribeToBranding((config) => {
      if (config) setBranding(config);
    });
    const unsubSurveyConfig = StorageService.subscribeToSurveyConfig((config) => {
      if (config) {
        setSurveyStartDate(config.startDate);
      }
    });

    // Seed templates, WIG config, and Branding (Once per session)
    if (!hasSeeded.current) {
      StorageService.checkAndSeedTemplates(COMMITMENT_TEMPLATES);
      StorageService.checkAndSeedWIGConfig();
      StorageService.checkAndSeedBranding(DEFAULT_BRANDING);
      hasSeeded.current = true;
    }

    const unsubSessions = StorageService.subscribeToWIGSessions(setSessions);

    return () => {
      unsubSessions();
      unsubMembers();
      unsubCommitments();
      unsubWIG();
      unsubTickets();
      unsubTemplates();
      unsubSurveys();
      unsubBranding();
      unsubSurveyConfig();
    };
  }, [isAuthorized]);

  // --- GAMIFICATION 2.0: Weekly Transition Check ---
  useEffect(() => {
    const checkTransition = async () => {
      if (!currentUser || commitments.length === 0) return;

      const currentActualWeek = getWeekId();
      const lastWeekId = getPreviousWeekId(currentActualWeek);

      // If we haven't processed last week yet, do it now
      if (currentUser.lastActiveWeekId !== lastWeekId) {
        const updates = await GamificationService.processWeeklyTransition(
          currentUser,
          lastWeekId,
          currentActualWeek,
          commitments
        );

        if (updates) {
          await StorageService.updateMember(currentUser.id, updates);
        }
      }
    };

    if (isAuthorized && currentUser) {
      checkTransition();
    }
  }, [isAuthorized, currentUser?.id, commitments.length]);

  // --- DIAGNOSTICS: Survey Data Monitoring ---
  useEffect(() => {
    if (surveys.length > 0) {
      const dates = surveys.map(s => s.date).filter(d => !isNaN(d));
      const minDate = dates.length > 0 ? new Date(Math.min(...dates)).toLocaleDateString() : 'None';
      const maxDate = dates.length > 0 ? new Date(Math.max(...dates)).toLocaleDateString() : 'None';

    }
  }, [surveys, surveyStartDate]);

  // Automatic ticket sync & AI Pre-generation for managers/admins
  useEffect(() => {
    if (!currentUser || !['ADMIN', 'MANAGER'].includes(currentUser.role)) return;

    WHDService.fetchAndSync()
      .then(async (syncedTickets) => {


        let validTickets = syncedTickets;
        if (syncedTickets.length > 0) {
          await StorageService.saveTickets(syncedTickets);
        } else {
          // If sync returned 0, try to read what we have in storage to generate from
          validTickets = StorageService.getTickets();
        }

        // --- Background AI Generation ---
        // Check if we have daily inspirations for today. If not, generate them now (silently).
        const today = new Date();
        const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const existing = await StorageService.getDailyInspirations(dateKey);
        if (!existing && validTickets.length > 0) {

          // Pass dynamic lead measures and templates for contextual alignment
          AIService.generateCommitmentSuggestions(
            validTickets,
            wigConfig?.leadMeasures || [],
            templates || []
          )
            .then(suggestions => {
              if (suggestions.length > 0) {
                StorageService.saveDailyInspirations(dateKey, suggestions);

              }
            })
            .catch(err => console.error("Background AI Gen failed:", err));
        }
      })
      .catch((err) => {
        console.warn('Ticket sync failed, falling back to local storage:', err.message);
        // Fallback to local storage on error
        const cachedTickets = StorageService.getTickets();
        if (cachedTickets.length > 0) {

          // We don't need to manually set state here because subscribeToTickets 
          // will have already fired with the cached data (if we didn't wipe it).
          // However, if sync failed, we should ensure the UI knows we have something.
        }
      });
  }, [currentUser]);

  // Apply branding styles
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--primary-color', branding.primaryColor);
    root.style.setProperty('--secondary-color', branding.secondaryColor);
    root.style.setProperty('--success-color', branding.successColor || '#82BC00');
    root.style.setProperty('--warning-color', branding.warningColor || '#F37A1F');
    root.style.setProperty('--title-font', branding.titleFont);
    root.style.setProperty('--body-font', branding.bodyFont);

    // Update Google Fonts link
    const fontLink = document.getElementById('dynamic-fonts') as HTMLLinkElement;
    if (fontLink) {
      const fonts = [branding.titleFont, branding.bodyFont].filter(f => f !== 'sans-serif');
      const fontQuery = fonts.map(f => `family=${f.replace(/\s+/g, '+')}:wght@300;400;500;600;700;800;900`).join('&');
      fontLink.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`;
    }
  }, [branding]);

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setIsAuthorized(false);
    setView(AppView.LOGIN);
  };

  const handleExport = () => {
    let csv = '';
    let filename = 'export.csv';

    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const toCSV = (headers: string[], rows: any[][]) =>
      [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');

    if (view === AppView.SURVEYS) {
      filename = `survey-results-${new Date().toISOString().split('T')[0]}.csv`;
      csv = toCSV(
        ['Date', 'Ticket No', 'Tech', 'Client', 'Location', 'Problem Type', 'Q1 (Resolution)', 'Q2 (Professionalism)', 'Q3 (Speed)', 'Average'],
        surveys.map(s => [
          new Date(s.date).toLocaleDateString('en-GB'),
          s.ticketNo, s.tech, s.client, s.location, s.problemType,
          s.q1, s.q2, s.q3, Number(s.average).toFixed(1)
        ])
      );
    } else if (view === AppView.MY_COMMITMENTS || view === AppView.HISTORY) {
      filename = `commitments-${new Date().toISOString().split('T')[0]}.csv`;
      csv = toCSV(
        ['Week', 'Member', 'Commitment', 'Status', 'Lead Measure'],
        commitments.map(c => [
          c.weekId,
          members.find(m => m.id === c.memberId)?.name ?? c.memberId,
          c.description, c.status, c.leadMeasureName ?? ''
        ])
      );
    } else if (view === AppView.TEAM_MANAGEMENT) {
      filename = `team-members-${new Date().toISOString().split('T')[0]}.csv`;
      csv = toCSV(
        ['Name', 'Email', 'Role', 'Job Title'],
        members.map(m => [m.name, m.email, m.role, m.jobTitle])
      );
    } else {
      // Dashboard — export recent tickets
      filename = `tickets-${new Date().toISOString().split('T')[0]}.csv`;
      csv = toCSV(
        ['Date', 'Ticket ID', 'Summary', 'Category', 'Assignee', 'Requestor', 'Status'],
        tickets.map(t => [
          new Date(t.createdAt).toLocaleDateString('en-GB'),
          t.id, t.summary, t.category, t.assignee, t.requestor, t.status ?? ''
        ])
      );
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-brand-red rounded-2xl mb-4 shadow-xl"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Synchronising Strategy...</p>
        </div>
      </div>
    );
  }

  if (view === AppView.LOGIN || !isAuthorized) {
    return (
      <div className="relative min-h-screen">
        <Login
          onLoginSuccess={() => { }}
          accessError={accessError}
        />
      </div>
    );
  }

  const isManagement = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

  const navItems: Array<{ id: AppView; label: string; short: string; icon: string }> = [
    { id: AppView.DASHBOARD, label: 'Home', short: 'Home', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3m10-11v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: AppView.MY_COMMITMENTS, label: 'Commitments', short: 'Commit', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: AppView.WIG_SESSION, label: 'WIG Session', short: 'WIG', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: AppView.SURVEYS, label: 'Analytics', short: 'Stats', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    ...(isManagement ? [
      { id: AppView.COMMITMENT_ANALYTICS, label: 'Insights', short: 'Insights', icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
      { id: AppView.TEAM_MANAGEMENT, label: 'Team', short: 'Team', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    ] : []),
  ];

  const nudges = currentUser
    ? computeNudges({ currentUser, commitments, sessions, currentWeekId: getWeekId(), isManager: isManagement })
    : [];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--ui-bg)' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-1">
          <button onClick={() => setView(AppView.DASHBOARD)} className="flex items-center gap-2 mr-2 shrink-0">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="h-7 w-auto object-contain" />
            ) : (
              <span className="h-7 w-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: 'var(--primary-color)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </span>
            )}
            <span className="hidden sm:block text-sm font-bold text-slate-900 tracking-tight">BHASVIC 4DX</span>
          </button>

          <nav className="hidden md:flex items-center gap-0.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === item.id ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button onClick={handleExport} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export
            </button>

            {/* Nudge inbox */}
            <div className="relative">
              <button onClick={() => setShowBell(v => !v)} className="relative p-2 text-slate-500 hover:text-slate-900 transition-colors" aria-label="Notifications">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {nudges.length > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-brand-red text-white text-[9px] font-bold flex items-center justify-center ui-metric">{nudges.length}</span>
                )}
              </button>
              {showBell && (
                <div className="absolute right-0 top-10 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-50">
                  {nudges.length === 0 ? (
                    <p className="text-xs text-slate-400 p-3">You're all caught up.</p>
                  ) : (
                    nudges.map(n => (
                      <button key={n.id} onClick={() => { setView(n.view); setShowBell(false); }} className="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                        <p className="text-xs font-medium text-slate-700">{n.message}</p>
                        <p className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--secondary-color)' }}>{n.actionLabel} →</p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {currentUser && (
              <div className="flex items-center gap-2 pl-1.5 border-l border-slate-200">
                <span className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-[10px] uppercase">
                  {currentUser.avatar || currentUser.name.substring(0, 2)}
                </span>
                <ProfileDropdown currentUser={currentUser} onLogout={handleLogout} />
              </div>
            )}
          </div>
        </div>
      </header>

        <main className="flex-grow w-full max-w-6xl mx-auto px-4 py-5 pb-24 md:pb-8">
          {view === AppView.DASHBOARD && currentUser && (
            <Home
              currentUser={currentUser}
              members={members}
              commitments={commitments}
              surveys={surveys}
              surveyStartDate={surveyStartDate}
              wigConfig={wigConfig}
              sessions={sessions}
              nudges={nudges}
              onNavigate={setView}
              onComposerSubmit={(text) => {
                setComposerDraft(text);
                setSelectedWeekId(getWeekId());
                setView(AppView.MY_COMMITMENTS);
              }}
            />
          )}
          {view === AppView.MY_COMMITMENTS && currentUser && (
            <MyCommitments
              currentUser={currentUser}
              realCurrentWeekId={getWeekId()}
              selectedWeekId={selectedWeekId}
              commitments={commitments.filter(c => c.weekId === selectedWeekId && c.memberId === currentUser.id)}
              allCommitments={commitments.filter(c => c.weekId === selectedWeekId)}
              tickets={tickets}
              templates={templates}
              wigConfig={wigConfig}
              members={members}
              initialDraft={composerDraft || undefined}
              onDraftConsumed={() => setComposerDraft(null)}
              onAdd={(desc, leadMeasureId, leadMeasureName, alignedByAI) => StorageService.addCommitment(currentUser.id, selectedWeekId, desc, leadMeasureId, leadMeasureName, alignedByAI)}
              onToggle={(id) => StorageService.cycleCommitmentStatus(id)}
              onUpdate={(id, up) => StorageService.updateCommitment(id, up)}
              onDelete={(id) => StorageService.deleteCommitment(id)}
              onPrevWeek={() => setSelectedWeekId(prev => getPreviousWeekId(prev))}
              onNextWeek={() => setSelectedWeekId(prev => getNextWeekId(prev))}
            />
          )}
          {view === AppView.WIG_SESSION && currentUser && (
            <WIGSessionView
              currentUser={currentUser}
              members={members}
              currentWeekId={getWeekId()}
              onClose={() => setView(AppView.DASHBOARD)}
            />
          )}
          {view === AppView.HISTORY && currentUser && <CommitmentHistory currentUser={currentUser} members={members} />}
          {view === AppView.SURVEYS && currentUser && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black text-brand-navy uppercase tracking-tight">Satisfaction Analytics</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Helpdesk Survey Insights</p>
                </div>
              </div>
              <SurveyUpload onUploadComplete={() => { }} />
              <SurveyAnalytics
                surveys={surveys}
                startDate={surveyStartDate}
                onDateChange={(date) => StorageService.saveSurveyConfig({ startDate: date })}
              />
            </div>
          )}

          {view === AppView.COMMITMENT_ANALYTICS && currentUser && isManagement && (
            <CommitmentAnalytics
              members={members}
              commitments={commitments}
              wigConfig={wigConfig}
            />
          )}

          {view === AppView.TEAM_MANAGEMENT && currentUser && isManagement && (
            <TeamManagement
              members={members}
              currentUser={currentUser}
              commitments={commitments}
              templates={templates}
              onAddMember={async (name, email, role) => await StorageService.inviteMember(name, email, role)}
              onRemoveMember={(id) => StorageService.removeMember(id)}
              wigConfig={wigConfig}
              onUpdateWIGConfig={(config) => StorageService.updateWIGConfig(config)}
              branding={branding}
              onUpdateBranding={(config) => StorageService.updateBranding(config)}
            />
          )}
        </main>

        <footer className="hidden md:block py-6 text-center">
          <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">BHASVIC IT Support Strategy Framework &copy; {new Date().getFullYear()}</p>
        </footer>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[9px] font-bold transition-colors ${view === item.id ? '' : 'text-slate-400'}`}
              style={view === item.id ? { color: 'var(--secondary-color)' } : {}}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} /></svg>
              {item.short}
            </button>
          ))}
        </nav>

        {/* Achievement Toast */}
        {activeAchievement && (
          <AchievementToast
            achievement={activeAchievement}
            onClose={() => setActiveAchievement(null)}
          />
        )}
    </div>
  );
};

export default App;
