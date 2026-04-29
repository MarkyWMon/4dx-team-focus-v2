import React, { useState, useEffect, useRef } from 'react';
import { AppView, TeamMember, Commitment, LeadMeasure, Ticket, WIGConfig, CommitmentTemplate, BrandingConfig, DEFAULT_BRANDING, Achievement } from './types';
import { StorageService } from './services/storage';
import { WHDService } from './services/whd';
import { AIService } from './services/ai';
import { GamificationService } from './services/gamification';
import { getWeekId, getPreviousWeekId, getNextWeekId, setWigDayOfWeek } from './utils';
import { auth, onAuthStateChanged, signOut, getRedirectResult } from './services/firebase';
import Dashboard from './components/Dashboard';
import MyCommitments from './components/MyCommitments';
import TeamManagement from './components/TeamManagement';
import CommitmentHistory from './components/CommitmentHistory';
import Login from './components/Login';
import WIGSessionView from './components/WIGSession';
import SurveyUpload from './components/SurveyUpload';
import SurveyAnalytics from './components/SurveyAnalytics';
import ProfileDropdown from './components/ProfileDropdown';
import AchievementToast from './components/AchievementToast';
import ManagerDashboard from './components/ManagerDashboard';
import { COMMITMENT_TEMPLATES } from './data/commitmentTemplates';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const hasSeeded = useRef(false);
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]); // SurveyResult[]
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

    return () => {
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
      console.log(`📊 Surveys updated: ${surveys.length} total | Range: ${minDate} to ${maxDate} | Filter Start: ${surveyStartDate ? new Date(surveyStartDate).toLocaleDateString() : 'None'}`);
    }
  }, [surveys, surveyStartDate]);

  // Automatic ticket sync & AI Pre-generation for managers/admins
  useEffect(() => {
    if (!currentUser || !['ADMIN', 'MANAGER'].includes(currentUser.role)) return;

    WHDService.fetchAndSync()
      .then(async (syncedTickets) => {
        console.log(`✓ Synced ${syncedTickets.length} tickets from SolarWinds proxy`);

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
          console.log("⚡ Auto-generating Daily Inspirations in background...");
          // Pass dynamic lead measures and templates for contextual alignment
          AIService.generateCommitmentSuggestions(
            validTickets,
            wigConfig?.leadMeasures || [],
            templates || []
          )
            .then(suggestions => {
              if (suggestions.length > 0) {
                StorageService.saveDailyInspirations(dateKey, suggestions);
                console.log("✓ Daily Inspirations cached successfully");
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
          console.log(`✓ Loaded ${cachedTickets.length} tickets from local cache after sync failure`);
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

  return (
    <div className="min-h-screen flex bg-slate-50 overflow-hidden">
      {/* Sidebar - Cemdash Inspired */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-100 transition-transform duration-300 transform ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="h-full flex flex-col p-6">
          {/* Logo / Brand */}
          <div className="mb-10 cursor-pointer group flex items-center gap-3" onClick={() => setView(AppView.DASHBOARD)}>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="h-8 w-auto object-contain" />
            ) : (
              <div className="bg-brand-red h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-cem group-hover:bg-brand-navy transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
            )}
            <div className="flex flex-col">
              <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">
                {branding.logoUrl ? '' : 'BHASVIC'}
              </h1>
              <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-0.5">Focus Platform</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex-grow space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-2">Main Menu</p>
            {[
              { id: AppView.DASHBOARD, label: 'Dashboard', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
              { id: AppView.MY_COMMITMENTS, label: 'Commitments', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
              { id: AppView.WIG_SESSION, label: 'WIG Session', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
              { id: AppView.SURVEYS, label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
              ...(isManagement ? [{ id: AppView.TEAM_MANAGEMENT, label: 'Team Portal', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }] : [])
            ].map(item => (
              <button
                key={item.id}
                onClick={() => { setView(item.id as AppView); setIsMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs tracking-tight transition-all ${view === item.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100'}`}
                style={view === item.id ? { backgroundColor: branding.primaryColor } : {}}
              >
                <svg className="w-5 h-5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} /></svg>
                {item.label}
              </button>
            ))}
          </nav>

          {/* User Profile / Bottom */}
          <div className="mt-auto pt-6 border-t border-slate-100">
            {currentUser && (
              <div className="flex items-center gap-3 px-2">
                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-slate-500 text-xs border border-slate-200">
                  {currentUser.avatar || currentUser.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-grow overflow-hidden">
                  <p className="text-xs font-black text-slate-900 truncate tracking-tight leading-none mb-1">{currentUser.name}</p>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{currentUser.role}</p>
                </div>
                <ProfileDropdown currentUser={currentUser} onLogout={handleLogout} />
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-grow md:ml-64 min-h-screen flex flex-col">
        {/* Mobile Header */}
        <header className="md:hidden h-16 bg-white border-b border-slate-100 flex justify-between items-center px-6 sticky top-0 z-40">
          <h1 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter">BHASVIC</h1>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-600">
            {isMobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
            )}
          </button>
        </header>

        {/* Dynamic View Header (Inspired by Cemdash Dashboard Title Row) */}
        <header className="h-20 flex items-center justify-between px-8 bg-white/50 backdrop-blur-sm border-b border-slate-100/50 sticky top-0 z-30">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase italic">{view.replace('_', ' ')}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">BHASVIC Strategy Lab</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Action Buttons inspired by Cemdash top right */}
            <div className="hidden sm:flex items-center gap-2">
              <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors bg-white rounded-lg border border-slate-100"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg></button>
              <div className="h-8 w-px bg-slate-100 mx-2"></div>
              <button onClick={handleExport} className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-md flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export CSV
              </button>
            </div>
          </div>
        </header>

        <main className="p-8 flex-grow">
          {view === AppView.DASHBOARD && currentUser && (
            <Dashboard
              currentUser={currentUser}
              members={members}
              wigConfig={wigConfig}
              commitments={commitments}
              tickets={tickets}
              surveys={surveys}
              surveyStartDate={surveyStartDate}
              onNavigate={setView}
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
              onAdd={(desc, leadMeasureId, leadMeasureName) => StorageService.addCommitment(currentUser.id, selectedWeekId, desc, leadMeasureId, leadMeasureName)}
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

          {view === AppView.TEAM_MANAGEMENT && currentUser && isManagement && (
            <TeamManagement
              members={members}
              currentUser={currentUser}
              leadMeasures={leadMeasures}
              surveys={[]}
              commitments={commitments}
              templates={templates}
              onAddMember={async (name, email, role) => await StorageService.inviteMember(name, email, role)}
              onRemoveMember={(id) => StorageService.removeMember(id)}
              onRefreshTickets={() => { }}
              onUpdateMeasure={() => { }}
              onDeleteMeasure={() => { }}
              wigConfig={wigConfig}
              onUpdateWIGConfig={(config) => StorageService.updateWIGConfig(config)}
              branding={branding}
              onUpdateBranding={(config) => StorageService.updateBranding(config)}
            />
          )}
        </main>

        <footer className="py-8 text-center border-t border-slate-100 bg-white">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest opacity-60">BHASVIC IT Support Strategy Framework &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
