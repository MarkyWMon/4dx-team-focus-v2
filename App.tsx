import React, { useState, useEffect, useRef } from 'react';
import { AppView, TeamMember, Commitment, LeadMeasure, Ticket, WIGConfig, CommitmentTemplate, BrandingConfig, DEFAULT_BRANDING } from './types';
import { StorageService } from './services/storage';
import { WHDService } from './services/whd';
import { AIService } from './services/ai';
import { getWeekId, getPreviousWeekId, getNextWeekId } from './utils';
import { auth, onAuthStateChanged, signOut, getRedirectResult } from './services/firebase';
import Dashboard from './components/Dashboard';
import MyCommitments from './components/MyCommitments';
import TeamManagement from './components/TeamManagement';
import CommitmentHistory from './components/CommitmentHistory';
import Login from './components/Login';
import WIGSessionView from './components/WIGSession';
import ProfileDropdown from './components/ProfileDropdown';
import { COMMITMENT_TEMPLATES } from './data/commitmentTemplates';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const hasSeeded = useRef(false);
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [templates, setTemplates] = useState<CommitmentTemplate[]>([]);
  const [selectedWeekId, setSelectedWeekId] = useState<string>(getWeekId());
  const [wigConfig, setWIGConfig] = useState<WIGConfig | null>(null);
  const [branding, setBranding] = useState<BrandingConfig>(DEFAULT_BRANDING);

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

  // Check for redirect result on mount
  useEffect(() => {
    console.log("App mounted. Checking for Auth Redirect result...");
    getRedirectResult(auth).then((result) => {
      if (result) {
        console.log("Redirect success! User:", result.user.email);
      } else {
        console.log("No redirect result found in URL.");
      }
    }).catch((e) => {
      console.error("Redirect result error:", e);
      setAccessError(`Auth Redirect Failed: ${e.message}`);
    });
  }, []);

  useEffect(() => {
    console.log("Setting up onAuthStateChanged listener...");
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("Auth State Changed. User:", firebaseUser?.email, "UID:", firebaseUser?.uid);

      if (!firebaseUser) {
        console.log("No user found in session.");
        setCurrentUser(null);
        setIsAuthorized(false);
        setAuthLoading(false);
        setView(AppView.LOGIN);
        return;
      }

      try {
        const email = firebaseUser.email?.toLowerCase();
        console.log("Handshaking for:", email);
        if (!email) throw new Error("SSO Identity missing email field.");

        console.log("Fetching member record for UID:", firebaseUser.uid);
        let sessionMember = await StorageService.getMemberById(firebaseUser.uid);

        if (sessionMember) {
          console.log("Member found by UID:", sessionMember.name);
        } else {
          console.log("No member found by UID. Checking by email:", email);
          const bestEmailRecord = await StorageService.getMemberByEmail(email);

          if (bestEmailRecord) {
            console.log("Found existing record by email. Linking UID...");
            sessionMember = await StorageService.linkAndProvision(
              firebaseUser.uid,
              bestEmailRecord.name || firebaseUser.displayName || email.split('@')[0],
              email,
              bestEmailRecord.role
            );
          }
        }

        if (!sessionMember) {
          console.log("New User: Checking for Admin existence to allow bootstrap...");
          try {
            const adminExists = await StorageService.isAdminExists();
            console.log("Admin exists in DB:", adminExists);
            if (!adminExists) {
              console.log("Bootstrap: No Admin found. Provisioning this user as ADMIN.");
              sessionMember = await StorageService.linkAndProvision(
                firebaseUser.uid,
                firebaseUser.displayName || email.split('@')[0],
                email,
                'ADMIN'
              );
            }
          } catch (error: any) {
            console.error("Bootstrap check failed:", error.message);
          }
        }

        if (sessionMember) {
          console.log("Authorization Successful for:", sessionMember.name);
          setCurrentUser(sessionMember);
          setIsAuthorized(true);
          await StorageService.logLogin(firebaseUser.uid, sessionMember.name);
          if (view === AppView.LOGIN) {
            console.log("Transitioning to DASHBOARD");
            setView(AppView.DASHBOARD);
          }
        } else {
          console.log("Authorization Denied for:", email);
          setAccessError(`Access Denied: ${email} is not authorized on this roster.`);
        }
      } catch (e: any) {
        console.error("Critical Auth Error:", e);
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
      if (me) setCurrentUser(me);
    });
    const unsubCommitments = StorageService.subscribeToCommitments((updatedCommitments) => {
      setCommitments(updatedCommitments);
    });
    const unsubWIG = StorageService.subscribeToWIGConfig((config) => {
      setWIGConfig(config);
    });
    const unsubTickets = StorageService.subscribeToTickets((updatedTickets) => {
      setTickets(updatedTickets);
    });
    const unsubTemplates = StorageService.subscribeToTemplates((updatedTemplates) => {
      setTemplates(updatedTemplates);
    });
    const unsubBranding = StorageService.subscribeToBranding((config) => {
      if (config) setBranding(config);
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
      unsubBranding();
    };
  }, [isAuthorized]);

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
        console.warn('Ticket sync failed:', err.message);
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
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="bg-white border-b-2 border-brand-red sticky top-0 z-30 px-4 shadow-sm">
        <div className="max-w-7xl mx-auto h-20 flex justify-between items-center">
          <div className="flex items-center gap-10">
            <div className="cursor-pointer group flex items-center gap-4" onClick={() => setView(AppView.DASHBOARD)}>
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="Logo" className="h-12 w-auto object-contain transition-transform group-hover:scale-105" />
              ) : (
                <div className="bg-brand-red h-10 w-10 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg group-hover:bg-brand-navy transition-colors">B</div>
              )}
              <div className="flex flex-col">
                <h1 className="text-xl font-black text-slate-900 tracking-tighter uppercase leading-none italic group-hover:text-brand-red transition-colors">BHASVIC</h1>
                <p className="text-[8px] font-black text-brand-red uppercase tracking-[0.2em] mt-1.5 font-display">4DX Strategy Platform</p>
              </div>
            </div>
            <div className="hidden md:flex gap-8">
              {[
                { id: AppView.DASHBOARD, label: 'WIG Scoreboard' },
                { id: AppView.MY_COMMITMENTS, label: 'My Commitments' },
                { id: AppView.WIG_SESSION, label: 'WIG Session' },
                { id: AppView.HISTORY, label: 'Performance Audit' },
                ...(isManagement ? [{ id: AppView.TEAM_MANAGEMENT, label: 'Team Portal' }] : [])
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id as AppView)}
                  className={`text-[10px] font-black uppercase tracking-widest pb-1.5 border-b-2 transition-all font-display ${view === tab.id ? 'border-brand-red text-slate-900' : 'border-transparent text-slate-300 hover:text-slate-500'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right hidden sm:block">
              <div className="flex items-center gap-3 justify-end">
                <div className="flex flex-col items-end">
                  <p className="text-xs font-black text-slate-900 uppercase tracking-tight leading-none">{currentUser?.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[7px] font-black px-1.5 py-0.5 rounded border ${currentUser?.role === 'ADMIN' ? 'border-brand-red bg-red-50 text-brand-red' : 'border-slate-200 text-slate-400'}`}>
                      {currentUser?.role}
                    </span>
                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">WIG Pilot</span>
                  </div>
                </div>
                {currentUser && (
                  <ProfileDropdown currentUser={currentUser} onLogout={handleLogout} />
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl w-full mx-auto p-4 py-10 flex-grow">
        {view === AppView.DASHBOARD && currentUser && (
          <Dashboard
            currentUser={currentUser}
            members={members}
            wigConfig={wigConfig}
            commitments={commitments}
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
        {view === AppView.TEAM_MANAGEMENT && currentUser && isManagement && (
          <TeamManagement
            members={members}
            currentUser={currentUser}
            leadMeasures={leadMeasures}
            surveys={[]}
            templates={templates}
            onAddMember={(name, email, role) => StorageService.inviteMember(name, email, role)}
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

      <footer className="py-12 text-center border-t border-slate-100 bg-white">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest opacity-60">BHASVIC IT Support Strategy Framework &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
};

export default App;
