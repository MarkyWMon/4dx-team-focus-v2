
import { TeamMember, Commitment, LoginLog, Ticket, ChangeRequest, CategoryInsight, LeadMeasureLog, CommitmentStatus, WIGSession, AISuggestion, CommitmentTemplate, WIGConfig, BrandingConfig, DEFAULT_BRANDING } from '../types';
import { db, auth } from './firebase';
import { GamificationService } from './gamification';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  getCountFromServer,
  writeBatch
} from 'firebase/firestore';

const STORAGE_KEYS = {
  MEMBERS: '4dx_members',
  COMMITMENTS: '4dx_commitments',
  WIG_SESSIONS: '4dx_wig_sessions',
  WIG_CONFIG: '4dx_wig_config',
  TEMPLATES: '4dx_templates',
  BRANDING: '4dx_branding',
  SURVEYS: '4dx_surveys',
};

const saveLocal = <T>(key: string, data: T): void => {
  try {
    const json = JSON.stringify(data);
    // Basic obfuscation to prevent plain-text reading in DevTools
    const obfuscated = btoa(encodeURIComponent(json));
    localStorage.setItem(key, obfuscated);
  } catch (e) { }
};

const loadLocal = <T>(key: string, defaultVal: T): T => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultVal;

    // Fallback for existing plain-text data
    if (item.startsWith('[') || item.startsWith('{')) {
      return JSON.parse(item);
    }

    const deobfuscated = decodeURIComponent(atob(item));
    return JSON.parse(deobfuscated);
  } catch (e) { return defaultVal; }
};

export const StorageService = {
  isAdminExists: async (): Promise<boolean> => {
    try {
      const q = query(collection(db, "members"), where("role", "==", "ADMIN"), limit(1));
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (e: any) {
      console.warn("Could not verify Admin existence (CORS/Permissions).");
      return false;
    }
  },

  getMemberById: async (uid: string): Promise<TeamMember | null> => {
    try {
      const snap = await getDoc(doc(db, "members", uid));
      if (!snap.exists()) return null;
      return { ...snap.data(), id: snap.id } as TeamMember;
    } catch (e) {
      console.error("Error fetching member by ID:", e);
      return null;
    }
  },

  /**
   * Finds the best record for an email. 
   * If multiple records exist, it prioritizes roles: ADMIN > MANAGER > STAFF
   */
  getMemberByEmail: async (email: string): Promise<TeamMember | null> => {
    try {
      const q = query(collection(db, "members"), where("email", "==", email.toLowerCase().trim()));
      const snap = await getDocs(q);
      if (snap.empty) return null;

      const records = snap.docs.map(d => ({ ...d.data(), id: d.id } as TeamMember));

      // Sort by role priority: ADMIN (0) > MANAGER (1) > STAFF (2)
      const roleOrder = { 'ADMIN': 0, 'MANAGER': 1, 'STAFF': 2 };
      records.sort((a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99));

      return records[0];
    } catch (e) {
      console.error("Error fetching member by email:", e);
      return null;
    }
  },

  subscribeToMembers: (callback: (members: TeamMember[]) => void) => {
    return onSnapshot(collection(db, "members"),
      (snapshot) => {
        const members = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as TeamMember));
        console.log('📥 Members subscription received update:', members.map(m => ({ id: m.id, name: m.name, leadMeasureProgress: m.leadMeasureProgress })));
        saveLocal(STORAGE_KEYS.MEMBERS, members);
        callback(members);
      },
      (error) => console.error("Member Listener Error:", error)
    );
  },

  subscribeToCommitments: (callback: (commitments: Commitment[]) => void) => {
    return onSnapshot(collection(db, "commitments"),
      (snapshot) => {
        const commitments = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Commitment));
        saveLocal(STORAGE_KEYS.COMMITMENTS, commitments);
        callback(commitments);
      },
      (error) => console.error("Commitment Listener Error:", error)
    );
  },

  subscribeToWIGSessions: (callback: (sessions: WIGSession[]) => void) => {
    return onSnapshot(collection(db, "wig_sessions"),
      (snapshot) => {
        const sessions = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as WIGSession));
        saveLocal(STORAGE_KEYS.WIG_SESSIONS, sessions);
        callback(sessions);
      },
      (error) => console.error("WIG Session Listener Error:", error)
    );
  },

  getMembers: (): TeamMember[] => loadLocal<TeamMember[]>(STORAGE_KEYS.MEMBERS, []),

  inviteMember: async (name: string, email: string, role: 'ADMIN' | 'MANAGER' | 'STAFF'): Promise<void> => {
    const id = `pending-${Date.now()}`;
    const newMember: TeamMember = {
      id, name, email: email.toLowerCase().trim(), role,
      jobTitle: "Team Member",
      avatar: (name || "??").split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
      weeklyCommitment: '',
      leadMeasureProgress: {},
    };
    await setDoc(doc(db, "members", id), newMember);
  },

  linkAndProvision: async (uid: string, name: string, email: string, role: string): Promise<TeamMember> => {
    console.log(`Provisioning user ${email} with role ${role}...`);
    if (!uid || !email) throw new Error("Cannot provision: UID or Email missing.");

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) throw new Error("Invalid email format.");

    // Role validation
    const validRoles = ['ADMIN', 'MANAGER', 'STAFF'];
    if (!validRoles.includes(role)) {
      console.warn(`Invalid role ${role} requested, defaulting to STAFF.`);
      role = 'STAFF';
    }

    // Basic sanitization
    const sanitizedName = (name || email.split('@')[0] || 'User').replace(/[<>]/g, '').trim();

    const avatar = sanitizedName
      .split(/[\s.@]/)
      .filter(Boolean)
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const member: TeamMember = {
      id: uid,
      name: sanitizedName,
      email: email.toLowerCase().trim(),
      role: role as any,
      jobTitle: role === 'ADMIN' ? "System Administrator" : "IT Professional",
      avatar: avatar,
      weeklyCommitment: '',
      leadMeasureProgress: {},
      // Gamification v2 Initial Defaults
      score: 0,
      streak: 0,
      longestStreak: 0,
      achievements: [],
    };

    try {
      await setDoc(doc(db, "members", uid), member);
      console.log("Successfully provisioned member in Firestore.");
      return member;
    } catch (e: any) {
      console.error("Failed to provision member:", e.message);
      throw e;
    }
  },



  addCommitment: async (
    memberId: string,
    weekId: string,
    description: string,
    leadMeasureId?: string,
    leadMeasureName?: string
  ): Promise<void> => {
    if (!memberId) throw new Error("No memberId provided for commitment.");
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newCommitment: Commitment = {
      id, memberId, weekId, description,
      status: 'incomplete', createdAt: Date.now(),
      leadMeasureId: leadMeasureId || undefined,
      leadMeasureName: leadMeasureName || undefined,
      alignedByAI: !!leadMeasureId, // True if we have a linked measure
    };
    await setDoc(doc(db, "commitments", id), newCommitment);
  },

  updateMember: async (id: string, updates: Partial<TeamMember>): Promise<void> => {
    await setDoc(doc(db, "members", id), updates, { merge: true });
  },

  updateCommitment: async (id: string, updates: Partial<Commitment>): Promise<void> => {
    await setDoc(doc(db, "commitments", id), updates, { merge: true });
  },

  cycleCommitmentStatus: async (id: string): Promise<void> => {
    const ref = doc(db, "commitments", id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Commitment;
      const prevStatus = data.status;
      let nextStatus: CommitmentStatus = 'completed';
      if (data.status === 'completed') nextStatus = 'partial';
      else if (data.status === 'partial') nextStatus = 'incomplete';

      // Update Commitment Status
      await setDoc(ref, { status: nextStatus }, { merge: true });

      // Scoring: Calculate points based on whether this is the first completion of the week
      if ((prevStatus !== 'completed' && nextStatus === 'completed') || (prevStatus === 'completed' && nextStatus !== 'completed')) {
        // Query to check if user has ANY other completed commitments this week
        // Note: This is a simplified check. In a production environment with high concurrency, 
        // we might want to store 'commitmentsCompletedThisWeek' on the user object.
        const commitmentsRef = collection(db, "commitments");
        const q = query(
          commitmentsRef,
          where("memberId", "==", data.memberId),
          where("weekId", "==", data.weekId),
          where("status", "==", "completed")
        );
        const querySnapshot = await getDocs(q);
        const completedCount = querySnapshot.size;

        // If nextStatus is completed, and count is 1 (the one we just updated), then it's the first.
        // If nextStatus is NOT completed, and count was 0 (before this update it was 1), then it WAS the first.
        // Simplified Logic: 
        // If we just completed it, did we have 0 before? (Now we have 1) -> First
        // If we just un-completed it, do we now have 0? -> Was First (Reversal)

        // However, since we already awaited the setDoc update above:
        // If nextStatus === 'completed' and completedCount === 1, it is the first.
        const isFirst = (nextStatus === 'completed' && completedCount === 1) ||
          (nextStatus !== 'completed' && completedCount === 0);

        const points = GamificationService.calculatePointsForAction(prevStatus, nextStatus, isFirst);
        if (points !== 0) {
          await StorageService.updateUserScore(data.memberId, points);
        }
      }
    }
  },

  updateUserScore: async (uid: string, points: number): Promise<void> => {
    try {
      const ref = doc(db, "members", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const member = snap.data() as TeamMember;
        const newScore = (member.score || 0) + points;

        // Check achievements
        const achievements = GamificationService.checkAchievements({ ...member, score: newScore });
        const newAchievements = [...(member.achievements || [])];
        let changed = false;

        achievements.forEach(a => {
          if (!newAchievements.find(ea => ea.id === a.id)) {
            newAchievements.push(a);
            changed = true;
          }
        });

        const updates: any = { score: newScore };
        if (changed) updates.achievements = newAchievements;

        await setDoc(ref, updates, { merge: true });
      }
    } catch (e) {
      console.error("Failed to update user score:", e);
    }
  },

  deleteCommitment: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "commitments", id));
  },

  createWIGSession: async (weekId: string): Promise<string> => {
    const id = `wig-${weekId}-${Date.now()}`;
    const newSession: WIGSession = {
      id,
      weekId,
      scheduledDate: Date.now(),
      status: 'scheduled',
      currentStep: 1,
      attendees: [],
      notes: '',
      obstacles: ''
    };
    await setDoc(doc(db, "wig_sessions", id), newSession);
    return id;
  },

  updateWIGSession: async (id: string, updates: Partial<WIGSession>): Promise<void> => {
    await setDoc(doc(db, "wig_sessions", id), updates, { merge: true });
  },

  deleteWIGSession: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "wig_sessions", id));
  },

  getWIGSessions: (): WIGSession[] => loadLocal<WIGSession[]>(STORAGE_KEYS.WIG_SESSIONS, []),

  logLogin: async (userId: string, userName: string) => {
    if (!userId) return;
    const logId = Date.now().toString();
    await setDoc(doc(db, "audit_logs", logId), {
      id: logId,
      userId,
      userName: userName || 'User',
      timestamp: Date.now()
    });
    await setDoc(doc(db, "members", userId), { lastLogin: Date.now() }, { merge: true });
  },

  updateMemberMetrics: async (memberId: string, updates: Partial<TeamMember>) => {
    console.log('🔄 updateMemberMetrics called:', { memberId, updates });
    await setDoc(doc(db, "members", memberId), updates, { merge: true });
    console.log('✅ Firebase member document updated');
  },

  removeMember: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "members", id));
  },

  subscribeToWIGConfig: (callback: (config: any) => void) => {
    return onSnapshot(doc(db, "settings", "wig_config"),
      (snapshot) => {
        if (snapshot.exists()) {
          const config = snapshot.data();
          saveLocal(STORAGE_KEYS.WIG_CONFIG, config);
          callback(config);
        } else {
          // Initialize default if doesn't exist
          const defaultRef = doc(db, "settings", "wig_config");
          // We can't use await here easily, but we can set it and let the next snapshot pick it up
          // Or just return null/default
          callback(null);
        }
      },
      (error) => console.error("WIG Config Listener Error:", error)
    );
  },

  updateWIGConfig: async (config: any): Promise<void> => {
    await setDoc(doc(db, "settings", "wig_config"), config, { merge: true });
  },

  getWIGConfig: () => loadLocal<any>(STORAGE_KEYS.WIG_CONFIG, null),

  saveTickets: async (tickets: Ticket[]): Promise<void> => {
    const batch = writeBatch(db);
    tickets.forEach(ticket => {
      const ref = doc(db, "tickets", ticket.id);
      batch.set(ref, ticket);
    });
    await batch.commit();
  },

  subscribeToTickets: (callback: (tickets: Ticket[]) => void) => {
    return onSnapshot(collection(db, "tickets"),
      (snapshot) => {
        const tickets = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Ticket));
        callback(tickets);
      },
      (error) => console.error("Ticket Listener Error:", error)
    );
  },

  getLoginLogs: (): LoginLog[] => [],
  getChangeRequests: (): ChangeRequest[] => [],
  getTickets: (): Ticket[] => [],
  getCategoryInsights: (): CategoryInsight[] => [],
  resolveChangeRequest: async (id: string, action: 'approve' | 'reject'): Promise<void> => { },
  getLeadMeasureLogs: (measureId: string): LeadMeasureLog[] => [],
  getProxyUrl: (): string => 'https://whd-proxy-1014267640430.us-west1.run.app/?list=recent',

  /**
   * Checks if daily inspirations exist for today in Firestore.
   */
  getDailyInspirations: async (dateId: string): Promise<AISuggestion[] | null> => {
    try {
      const docRef = doc(db, 'daily_inspirations', dateId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        return data.suggestions as AISuggestion[];
      }
      return null;
    } catch (e) {
      console.error("Error fetching daily inspirations:", e);
      return null;
    }
  },

  /**
   * Saves generated inspirations to Firestore for today.
   */
  saveDailyInspirations: async (dateId: string, suggestions: AISuggestion[]): Promise<void> => {
    try {
      const docRef = doc(db, 'daily_inspirations', dateId);
      await setDoc(docRef, {
        suggestions,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error("Error saving daily inspirations:", e);
    }
  },
  getCommitments: (weekId?: string): Commitment[] => {
    const all = loadLocal<Commitment[]>(STORAGE_KEYS.COMMITMENTS, []);
    return weekId ? all.filter(c => c.weekId === weekId) : all;
  },

  // --- Template Management ---

  subscribeToTemplates: (callback: (templates: CommitmentTemplate[]) => void) => {
    return onSnapshot(collection(db, "commitment_templates"),
      (snapshot) => {
        const templates = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as CommitmentTemplate));
        saveLocal(STORAGE_KEYS.TEMPLATES, templates);
        callback(templates);
      },
      (error) => console.error("Template Listener Error:", error)
    );
  },

  getTemplates: (): CommitmentTemplate[] => loadLocal<CommitmentTemplate[]>(STORAGE_KEYS.TEMPLATES, []),

  addTemplate: async (template: Omit<CommitmentTemplate, 'id'>): Promise<void> => {
    const id = `tmpl-${Date.now()}`;
    await setDoc(doc(db, "commitment_templates", id), { ...template, id });
  },

  updateTemplate: async (id: string, updates: Partial<CommitmentTemplate>): Promise<void> => {
    await setDoc(doc(db, "commitment_templates", id), updates, { merge: true });
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "commitment_templates", id));
  },

  checkAndSeedTemplates: async (defaultTemplates: CommitmentTemplate[]) => {
    try {
      const coll = collection(db, "commitment_templates");
      const q = query(coll, limit(1));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.log("Seeding templates...");
        const batch = writeBatch(db);
        defaultTemplates.forEach(tmpl => {
          const ref = doc(db, "commitment_templates", tmpl.id);
          batch.set(ref, tmpl);
        });
        await batch.commit();
        console.log("Templates seeded.");
      }
    } catch (e) {
      console.error("Error seeding templates:", e);
    }
  },

  checkAndSeedWIGConfig: async () => {
    try {
      const ref = doc(db, "settings", "wig_config");
      const snapshot = await getDoc(ref);

      if (!snapshot.exists()) {
        console.log("Seeding WIG config...");
        const now = Date.now();
        const endOfYear = new Date(new Date().getFullYear(), 11, 31).getTime();

        const defaultConfig: WIGConfig = {
          id: 'wig_config',
          title: 'Infrastructure Excellence',
          description: 'Maximise team proactive impact through high-value actions.',
          metricType: 'percentage',
          currentValue: 70,
          targetValue: 80,
          currentScore: 0.7,
          targetScore: 0.8,
          leadMeasures: [
            { id: 'lead-walks', name: 'Proactive Floor Walks', target: 2, unit: 'Walks', color: 'brand-green' },
            { id: 'lead-value', name: 'Value-Add Actions', target: 1, unit: 'Actions', color: 'brand-navy' }
          ],
          startDate: now,
          endDate: endOfYear,
        };
        await setDoc(ref, defaultConfig);
        console.log("WIG config seeded.");
      }
    } catch (e) {
      console.error("Error seeding WIG config:", e);
    }
  },

  subscribeToBranding: (callback: (config: BrandingConfig) => void) => {
    return onSnapshot(doc(db, "settings", "branding"),
      (snapshot) => {
        if (snapshot.exists()) {
          const config = snapshot.data() as BrandingConfig;
          saveLocal(STORAGE_KEYS.BRANDING, config);
          callback(config);
        } else {
          callback(null as any);
        }
      },
      (error) => console.error("Branding Listener Error:", error)
    );
  },

  updateBranding: async (config: BrandingConfig): Promise<void> => {
    await setDoc(doc(db, "settings", "branding"), config, { merge: true });
  },

  getBranding: () => loadLocal<BrandingConfig>(STORAGE_KEYS.BRANDING, null as any),

  checkAndSeedBranding: async (defaultBranding: BrandingConfig) => {
    try {
      const ref = doc(db, "settings", "branding");
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        console.log("Seeding branding...");
        await setDoc(ref, defaultBranding);
        console.log("Branding seeded.");
      }
    } catch (e) {
      console.error("Error seeding branding:", e);
    }
  },

  // --- Survey Management ---

  saveSurveys: async (surveys: SurveyResult[]): Promise<void> => {
    // Process in chunks of 500 (Firestore batch limit)
    const chunkSize = 500;
    for (let i = 0; i < surveys.length; i += chunkSize) {
      const chunk = surveys.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      chunk.forEach(survey => {
        const ref = doc(db, "surveys", survey.id); // ID is Ticket No
        batch.set(ref, survey);
      });

      await batch.commit();
    }
  },

  getSurveys: async (): Promise<SurveyResult[]> => {
    try {
      const snapshot = await getDocs(collection(db, "surveys"));
      return snapshot.docs.map(d => d.data() as SurveyResult);
    } catch (e) {
      console.error("Error getting surveys:", e);
      return [];
    }
  },

  subscribeToSurveys: (callback: (surveys: SurveyResult[]) => void) => {
    return onSnapshot(collection(db, "surveys"),
      (snapshot) => {
        const surveys = snapshot.docs.map(d => d.data() as SurveyResult);
        saveLocal(STORAGE_KEYS.SURVEYS, surveys);
        callback(surveys);
      },
      (error) => console.error("Survey Listener Error:", error)
    );
  },

  // --- Team Insights (AI Summary) ---
  saveWeeklySummary: async (weekId: string, summary: string): Promise<void> => {
    try {
      await setDoc(doc(db, "insights", `summary-${weekId}`), {
        weekId,
        summary,
        generatedAt: Date.now()
      });
    } catch (e) {
      console.error("Error saving summary:", e);
    }
  },

  getWeeklySummary: async (weekId: string): Promise<string | null> => {
    try {
      const snap = await getDoc(doc(db, "insights", `summary-${weekId}`));
      if (snap.exists()) {
        return snap.data().summary;
      }
      return null;
    } catch (e) {
      console.error("Error fetching summary:", e);
      return null;
    }
  }
};
