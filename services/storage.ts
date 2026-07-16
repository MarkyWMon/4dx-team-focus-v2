
import { TeamMember, Commitment, LoginLog, Ticket, ChangeRequest, CategoryInsight, LeadMeasureLog, CommitmentStatus, WIGSession, AISuggestion, CommitmentTemplate, WIGConfig, BrandingConfig, DEFAULT_BRANDING, Achievement, ActivityEvent, SurveyResult } from '../types';
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

// Provisioning lock to prevent concurrent user creation
let isProvisioning = false;

/**
 * Deduplicates an array of TeamMembers by email.
 * For each unique email, keeps the "best" record:
 *  1. Real Firebase UID over pending-* IDs
 *  2. Higher role priority (ADMIN > MANAGER > STAFF)
 * Gamification data (score, streak, etc.) is merged by taking the maximum values.
 */
const deduplicateMembers = (members: TeamMember[]): TeamMember[] => {
  const emailMap = new Map<string, TeamMember>();
  const roleOrder: Record<string, number> = { 'ADMIN': 0, 'MANAGER': 1, 'STAFF': 2 };

  for (const m of members) {
    const key = (m.email || '').toLowerCase().trim();
    if (!key) continue; // skip records without email

    const existing = emailMap.get(key);
    if (!existing) {
      emailMap.set(key, { ...m });
      continue;
    }

    const mIsPending = m.id.startsWith('pending-');
    const eIsPending = existing.id.startsWith('pending-');

    // Decide which record is canonical
    let canonical = existing;
    let other = m;
    let replace = false;

    if (mIsPending && !eIsPending) {
      // Keep existing (real UID) — don't replace
    } else if (!mIsPending && eIsPending) {
      // Prefer this one (real UID over pending)
      replace = true;
    } else {
      // Both real or both pending — prefer higher role
      if ((roleOrder[m.role] ?? 99) < (roleOrder[existing.role] ?? 99)) {
        replace = true;
      }
    }

    if (replace) {
      canonical = m;
      other = existing;
    }

    // Merge gamification data — take the maximum values
    const merged = { ...canonical };
    merged.score = Math.max(canonical.score || 0, other.score || 0);
    merged.streak = Math.max(canonical.streak || 0, other.streak || 0);
    merged.longestStreak = Math.max(canonical.longestStreak || 0, other.longestStreak || 0);
    
    // Merge achievements (union)
    const achieveMap = new Map<string, Achievement>();
    [...(canonical.achievements || []), ...(other.achievements || [])].forEach(a => achieveMap.set(a.id, a));
    merged.achievements = Array.from(achieveMap.values());

    emailMap.set(key, merged);
  }

  return Array.from(emailMap.values());
};

const STORAGE_KEYS = {
  MEMBERS: '4dx_members',
  COMMITMENTS: '4dx_commitments',
  WIG_SESSIONS: '4dx_wig_sessions',
  WIG_CONFIG: '4dx_wig_config',
  TEMPLATES: '4dx_templates',
  BRANDING: '4dx_branding',
  SURVEYS: '4dx_surveys',
  SURVEY_CONFIG: '4dx_survey_config',
  TICKETS: '4dx_tickets',
  WEEKLY_SUMMARY: '4dx_weekly_summary',
};

// Internal listeners for local state updates (fallback when Firestore fails)
const surveyConfigListeners: ((config: { startDate: number } | null) => void)[] = [];

const saveLocal = <T>(key: string, data: T): void => {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(key, json);
  } catch (e) { }
};

const loadLocal = <T>(key: string, defaultVal: T): T => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultVal;

    // Fast path: if it looks like JSON, parse it directly
    if (item.startsWith('[') || item.startsWith('{') || item.startsWith('"')) {
      return JSON.parse(item);
    }

    // Backwards compatibility for previously obfuscated data
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
      return false;
    }
  },

  getMemberById: async (uid: string): Promise<TeamMember | null> => {
    try {
      const snap = await getDoc(doc(db, "members", uid));
      if (!snap.exists()) return null;
      return { ...snap.data(), id: snap.id } as TeamMember;
    } catch (e) {
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
      return null;
    }
  },

  subscribeToMembers: (callback: (members: TeamMember[]) => void) => {
    // 1. Load local cache immediately (deduplicated)
    const cached = deduplicateMembers(loadLocal<TeamMember[]>(STORAGE_KEYS.MEMBERS, []));
    if (cached.length > 0) callback(cached);

    return onSnapshot(collection(db, "members"),
      (snapshot) => {
        const rawMembers = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as TeamMember));
        const members = deduplicateMembers(rawMembers);
        saveLocal(STORAGE_KEYS.MEMBERS, members);
        callback(members);
      },
      (error) => console.error("Member Listener Error:", error)
    );
  },

  subscribeToCommitments: (callback: (commitments: Commitment[]) => void) => {
    // 1. Load local cache immediately
    const cached = loadLocal<Commitment[]>(STORAGE_KEYS.COMMITMENTS, []);
    if (cached.length > 0) callback(cached);

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
    // 1. Load local cache
    const cached = loadLocal<WIGSession[]>(STORAGE_KEYS.WIG_SESSIONS, []);
    if (cached.length > 0) callback(cached);

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
      score: 0,
      streak: 0,
      longestStreak: 0,
      achievements: [],
    };
    await setDoc(doc(db, "members", id), newMember);
  },

  linkAndProvision: async (uid: string, name: string, email: string, role: string): Promise<TeamMember> => {
    // Guard against concurrent provisioning
    if (isProvisioning) {
      // Wait until provisioning is done (poll every 200ms, max 5s)
      await new Promise<void>((resolve) => {
        let elapsed = 0;
        const interval = setInterval(() => {
          if (!isProvisioning || elapsed > 5000) {
            clearInterval(interval);
            resolve();
          }
          elapsed += 200;
        }, 200);
      });
    }

    isProvisioning = true;

    try {
      if (!uid || !email) throw new Error("Cannot provision: UID or Email missing.");

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) throw new Error("Invalid email format.");

      // Role validation (use local variable to avoid parameter mutation)
      const validRoles = ['ADMIN', 'MANAGER', 'STAFF'];
      const effectiveRole = validRoles.includes(role) ? role : 'STAFF';
      if (!validRoles.includes(role)) {
      }

      // Check if user already exists with this UID
      const existingById = await getDoc(doc(db, "members", uid));
      if (existingById.exists()) {
        const existingMember = { ...existingById.data(), id: uid } as TeamMember;
        // Still clean up any orphaned records
        await StorageService.cleanupDuplicateMembers(uid, email.toLowerCase().trim());
        return existingMember;
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

      // Check for existing record by email to preserve role/score data
      const existingByEmail = await StorageService.getMemberByEmail(email.toLowerCase().trim());

      const member: TeamMember = {
        id: uid,
        name: sanitizedName,
        email: email.toLowerCase().trim(),
        role: (existingByEmail?.role || effectiveRole) as any,
        jobTitle: effectiveRole === 'ADMIN' ? "System Administrator" : "IT Professional",
        avatar: avatar,
        weeklyCommitment: '',
        leadMeasureProgress: {},
        // Preserve gamification data if migrating from a pending record
        score: existingByEmail?.score || 0,
        streak: existingByEmail?.streak || 0,
        longestStreak: existingByEmail?.longestStreak || 0,
        achievements: existingByEmail?.achievements || [],
      };

      await setDoc(doc(db, "members", uid), member);

      // Clean up orphaned records (pending-* docs, duplicates with same email but different ID)
      await StorageService.cleanupDuplicateMembers(uid, email.toLowerCase().trim());

      return member;
    } catch (e: any) {
      throw e;
    } finally {
      isProvisioning = false;
    }
  },

  /**
   * Removes duplicate member records with the same email but a different ID.
   * This cleans up orphaned pending-* documents and prevents the "3 or 4 versions" bug.
   */
  cleanupDuplicateMembers: async (keepId: string, email: string): Promise<void> => {
    try {
      const q = query(collection(db, "members"), where("email", "==", email));
      const snap = await getDocs(q);

      if (snap.size <= 1) return; // No duplicates

      const deletions: Promise<void>[] = [];
      snap.docs.forEach(d => {
        if (d.id !== keepId) {
          deletions.push(deleteDoc(doc(db, "members", d.id)));
        }
      });

      await Promise.all(deletions);
    } catch (e) {
      // Non-fatal — don't throw
    }
  },



  addCommitment: async (
    memberId: string,
    weekId: string,
    description: string,
    leadMeasureId?: string,
    leadMeasureName?: string,
    alignedByAI: boolean = false
  ): Promise<void> => {
    if (!memberId) throw new Error("No memberId provided for commitment.");
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const now = Date.now();
    const newCommitment: Commitment = {
      id, memberId, weekId, description,
      status: 'incomplete', createdAt: now,
      statusHistory: [{ status: 'incomplete', at: now }],
      leadMeasureId: leadMeasureId || undefined,
      leadMeasureName: leadMeasureName || undefined,
      // Only true when the AI actually validated the alignment — a manually
      // or keyword-assigned measure is NOT AI alignment.
      alignedByAI,
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
    const snap = await getDoc(doc(db, "commitments", id));
    if (!snap.exists()) return;
    const data = snap.data() as Commitment;
    let nextStatus: CommitmentStatus = 'completed';
    if (data.status === 'completed') nextStatus = 'partial';
    else if (data.status === 'partial') nextStatus = 'incomplete';
    await StorageService.applyCommitmentStatusChange(id, nextStatus);
  },

  /**
   * The single path for EVERY commitment status change (checkbox toggle and
   * Proof Modal alike). Appends the transition to the audit trail, captures the
   * FIRST completion time, and awards/removes gamification points — so no
   * route can close a commitment without scoring it.
   */
  applyCommitmentStatusChange: async (
    id: string,
    nextStatus: CommitmentStatus,
    extraUpdates: Partial<Commitment> = {}
  ): Promise<void> => {
    const ref = doc(db, "commitments", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Commitment;
    const prevStatus = data.status;

    const now = Date.now();
    const statusUpdate: Partial<Commitment> & { updatedAt: number } = {
      ...extraUpdates,
      status: nextStatus,
      updatedAt: now,
    };
    if (nextStatus !== prevStatus) {
      statusUpdate.statusHistory = [...(data.statusHistory || []), { status: nextStatus, at: now }];
    }
    if (nextStatus === 'completed' && !data.completedAt) {
      statusUpdate.completedAt = now;
    }
    await setDoc(ref, statusUpdate, { merge: true });

    // Scoring: only when crossing the completed boundary in either direction.
    if ((prevStatus !== 'completed' && nextStatus === 'completed') || (prevStatus === 'completed' && nextStatus !== 'completed')) {
      // Query to check if user has ANY other completed commitments this week.
      // Note: This is a simplified check. In a production environment with high
      // concurrency, we might want to store 'commitmentsCompletedThisWeek' on the user object.
      const commitmentsRef = collection(db, "commitments");
      const q = query(
        commitmentsRef,
        where("memberId", "==", data.memberId),
        where("weekId", "==", data.weekId),
        where("status", "==", "completed")
      );
      const querySnapshot = await getDocs(q);
      const completedCount = querySnapshot.size;

      // The setDoc above already landed, so: just completed + count of 1 means
      // it was the first of the week; just un-completed + count of 0 means it
      // WAS the first (reversal).
      const isFirst = (nextStatus === 'completed' && completedCount === 1) ||
        (nextStatus !== 'completed' && completedCount === 0);

      const points = GamificationService.calculatePointsForAction(prevStatus, nextStatus, isFirst);
      if (points !== 0) {
        await StorageService.updateUserScore(data.memberId, points);
      }
    }
  },

  updateUserScore: async (uid: string, points: number): Promise<void> => {
    try {
      const ref = doc(db, "members", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const member = snap.data() as TeamMember;
        // Floor at zero — un-completing can't drive a score negative.
        const newScore = Math.max(0, (member.score || 0) + points);

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

        const updates: Partial<TeamMember> = { score: newScore };
        if (changed) updates.achievements = newAchievements;

        await setDoc(ref, updates, { merge: true });
      }
    } catch (e) {
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
    await setDoc(doc(db, "members", memberId), updates, { merge: true });
  },

  removeMember: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "members", id));
  },

  /**
   * One-time admin cleanup: Finds ALL duplicate members by email,
   * merges gamification data, reassigns commitments, and deletes orphans.
   * Returns a summary of what was done.
   */
  mergeAndCleanupMembers: async (): Promise<{ merged: number, commitmentsMoved: number }> => {
    let merged = 0;
    let commitmentsMoved = 0;

    try {
      // 1. Get ALL member records
      const snap = await getDocs(collection(db, "members"));
      const allMembers = snap.docs.map(d => ({ ...d.data(), id: d.id } as TeamMember));

      // 2. Group by email
      const emailGroups = new Map<string, TeamMember[]>();
      for (const m of allMembers) {
        const key = (m.email || '').toLowerCase().trim();
        if (!key) continue;
        const group = emailGroups.get(key) || [];
        group.push(m);
        emailGroups.set(key, group);
      }

      const roleOrder: Record<string, number> = { 'ADMIN': 0, 'MANAGER': 1, 'STAFF': 2 };

      for (const [email, group] of emailGroups) {
        if (group.length <= 1) continue; // No duplicates

        // Sort: real UIDs first, then by role priority
        group.sort((a, b) => {
          const aPending = a.id.startsWith('pending-') ? 1 : 0;
          const bPending = b.id.startsWith('pending-') ? 1 : 0;
          if (aPending !== bPending) return aPending - bPending;
          return (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
        });

        const canonical = group[0];
        const orphans = group.slice(1);

        // 3. Merge gamification data into canonical
        const mergedData: Partial<TeamMember> = {
          score: Math.max(...group.map(m => m.score || 0)),
          streak: Math.max(...group.map(m => m.streak || 0)),
          longestStreak: Math.max(...group.map(m => m.longestStreak || 0)),
        };

        // Merge achievements
        const achieveMap = new Map<string, Achievement>();
        group.forEach(m => (m.achievements || []).forEach(a => achieveMap.set(a.id, a)));
        mergedData.achievements = Array.from(achieveMap.values());

        await setDoc(doc(db, "members", canonical.id), mergedData, { merge: true });

        // 4. Reassign commitments from orphan IDs to canonical ID
        for (const orphan of orphans) {
          const cQ = query(collection(db, "commitments"), where("memberId", "==", orphan.id));
          const cSnap = await getDocs(cQ);
          const batch = writeBatch(db);
          cSnap.docs.forEach(d => {
            batch.update(d.ref, { memberId: canonical.id });
          });
          if (cSnap.size > 0) {
            await batch.commit();
            commitmentsMoved += cSnap.size;
          }

          // 5. Delete the orphan member record
          await deleteDoc(doc(db, "members", orphan.id));
          merged++;
        }
      }
    } catch (e) {
      throw e;
    }

    return { merged, commitmentsMoved };
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

  updateWIGConfig: async (config: Partial<WIGConfig>): Promise<void> => {
    await setDoc(doc(db, "settings", "wig_config"), config, { merge: true });
  },

  getWIGConfig: () => loadLocal<WIGConfig | null>(STORAGE_KEYS.WIG_CONFIG, null),

  saveTickets: async (tickets: Ticket[]): Promise<void> => {
    // 1. Save locally first (instant UI update)
    saveLocal(STORAGE_KEYS.TICKETS, tickets);
    saveLocal(STORAGE_KEYS.TICKETS + '_lastSync', Date.now());

    // 2. Save to Firestore in chunks (Batch Limit is 500)
    const chunkSize = 400; // Safe limit
    for (let i = 0; i < tickets.length; i += chunkSize) {
      const chunk = tickets.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach(ticket => {
        const ref = doc(db, "tickets", ticket.id);
        batch.set(ref, ticket);
      });
      try {
        await batch.commit();
      } catch (e) {
      }
    }
  },

  subscribeToTickets: (callback: (tickets: Ticket[]) => void) => {
    // 1. Load local cache immediately
    const cached = loadLocal<Ticket[]>(STORAGE_KEYS.TICKETS, []);
    if (cached.length > 0) callback(cached);

    // 2. Subscribe to Firestore
    return onSnapshot(collection(db, "tickets"),
      (snapshot) => {
        const tickets = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Ticket));
        // 3. Update local cache
        saveLocal(STORAGE_KEYS.TICKETS, tickets);
        callback(tickets);
      },
      (error) => console.error("Ticket Listener Error:", error)
    );
  },

  getTickets: (): Ticket[] => loadLocal<Ticket[]>(STORAGE_KEYS.TICKETS, []),
  getTicketLastSync: (): number | null => loadLocal<number | null>(STORAGE_KEYS.TICKETS + '_lastSync', null),
  getCategoryInsights: (): CategoryInsight[] => [],
  resolveChangeRequest: async (id: string, action: 'approve' | 'reject'): Promise<void> => { },
  getLeadMeasureLogs: (measureId: string): LeadMeasureLog[] => [],
  getProxyBaseUrl: (): string => 'https://whd-proxy-1014267640430.us-west1.run.app',
  getProxyUrl: (): string => `${StorageService.getProxyBaseUrl()}/?list=recent`,

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
        const batch = writeBatch(db);
        defaultTemplates.forEach(tmpl => {
          const ref = doc(db, "commitment_templates", tmpl.id);
          batch.set(ref, tmpl);
        });
        await batch.commit();
      }
    } catch (e) {
    }
  },

  checkAndSeedWIGConfig: async () => {
    try {
      const ref = doc(db, "settings", "wig_config");
      const snapshot = await getDoc(ref);

      if (!snapshot.exists()) {
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
      }
    } catch (e) {
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
        await setDoc(ref, defaultBranding);
      }
    } catch (e) {
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

      try {
        await batch.commit();
      } catch (e: any) {
        throw new Error(`Firebase Error during batch save: ${e.message}`);
      }
    }
  },

  clearAllSurveys: async (): Promise<void> => {
    try {
      const snapshot = await getDocs(collection(db, "surveys"));
      const docs = snapshot.docs;

      // Chunk into batches of 500 (Firestore batch limit)
      const chunkSize = 500;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      saveLocal(STORAGE_KEYS.SURVEYS, []);
    } catch (e) {
      throw e;
    }
  },

  getSurveys: async (): Promise<SurveyResult[]> => {
    try {
      const snapshot = await getDocs(collection(db, "surveys"));
      return snapshot.docs.map(d => d.data() as SurveyResult);
    } catch (e) {
      return [];
    }
  },

  subscribeToSurveys: (callback: (surveys: SurveyResult[]) => void) => {
    // 1. Load local cache
    const cached = loadLocal<SurveyResult[]>(STORAGE_KEYS.SURVEYS, []);
    if (cached.length > 0) callback(cached);

    return onSnapshot(collection(db, "surveys"),
      (snapshot) => {
        const surveys = snapshot.docs.map(d => d.data() as SurveyResult);
        saveLocal(STORAGE_KEYS.SURVEYS, surveys);
        callback(surveys);
      },
      (error) => console.error("Survey Listener Error:", error)
    );
  },

  // --- Survey Config (Date Filter) ---
  saveSurveyConfig: async (config: { startDate: number }): Promise<void> => {
    // Always save locally first
    saveLocal(STORAGE_KEYS.SURVEY_CONFIG, config);

    // Notify local listeners immediately
    surveyConfigListeners.forEach(listener => listener(config));

    try {
      await setDoc(doc(db, "settings", "survey_config"), config, { merge: true });
    } catch (e) {
      // Do not throw, allowing the app to continue working locally
    }
  },

  subscribeToSurveyConfig: (callback: (config: { startDate: number } | null) => void) => {
    // 1. Register local listener
    surveyConfigListeners.push(callback);

    // 2. Immediate local load
    const initialLocalConfig = loadLocal<{ startDate: number } | null>(STORAGE_KEYS.SURVEY_CONFIG, null);
    if (initialLocalConfig) {
      callback(initialLocalConfig);
    }

    // 3. Subscribe to Firestore updates
    const unsubFirestore = onSnapshot(doc(db, "settings", "survey_config"),
      (snapshot) => {
        if (snapshot.exists()) {
          const config = snapshot.data() as { startDate: number };
          saveLocal(STORAGE_KEYS.SURVEY_CONFIG, config);
          callback(config);
        } else {
          // Check CURRENT local storage to avoid overwriting with null if we have local data
          // (Stale closure fix)
          const currentLocal = loadLocal<{ startDate: number } | null>(STORAGE_KEYS.SURVEY_CONFIG, null);
          if (!currentLocal) callback(null);
        }
      },
      (error) => {
      }
    );

    // Return combined unsubscribe
    return () => {
      unsubFirestore();
      const index = surveyConfigListeners.indexOf(callback);
      if (index > -1) {
        surveyConfigListeners.splice(index, 1);
      }
    };
  },

  // --- Team Insights (AI Summary) ---
  saveWeeklySummary: async (weekId: string, summary: string): Promise<void> => {
    // 1. Save locally
    const key = `${STORAGE_KEYS.WEEKLY_SUMMARY}_${weekId}`;
    saveLocal(key, summary);

    try {
      await setDoc(doc(db, "insights", `summary-${weekId}`), {
        weekId,
        summary,
        generatedAt: Date.now()
      });
    } catch (e) {
    }
  },

  getWeeklySummary: async (weekId: string): Promise<string | null> => {
    // 1. Try local first
    const key = `${STORAGE_KEYS.WEEKLY_SUMMARY}_${weekId}`;
    const local = loadLocal<string | null>(key, null);
    if (local) return local;

    try {
      const snap = await getDoc(doc(db, "insights", `summary-${weekId}`));
      if (snap.exists()) {
        const summary = snap.data().summary;
        saveLocal(key, summary); // Cache it
        return summary;
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  // --- Commitment Theme Insights (AI thematic analysis, manager dashboard) ---
  saveCommitmentThemes: async (periodKey: string, payload: any): Promise<void> => {
    try {
      await setDoc(doc(db, "insights", `themes-${periodKey}`), {
        periodKey,
        payload,
        generatedAt: Date.now(),
      });
    } catch (e) {
    }
  },

  getCommitmentThemes: async (periodKey: string): Promise<{ payload: any; generatedAt: number } | null> => {
    try {
      const snap = await getDoc(doc(db, "insights", `themes-${periodKey}`));
      if (snap.exists()) {
        const data = snap.data();
        return { payload: data.payload, generatedAt: data.generatedAt };
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  getActivityStream: async (memberId: string): Promise<ActivityEvent[]> => {
    const events: ActivityEvent[] = [];

    try {
      // Fetch login events
      const loginSnap = await getDocs(
        query(collection(db, "audit_logs"), where("userId", "==", memberId))
      );
      loginSnap.docs.forEach(d => {
        const data = d.data();
        events.push({ type: 'login', timestamp: data.timestamp, description: 'Signed in' });
      });
    } catch (e) {
    }

    try {
      // Fetch commitments for this member
      const commitSnap = await getDocs(
        query(collection(db, "commitments"), where("memberId", "==", memberId))
      );
      commitSnap.docs.forEach(d => {
        const c = d.data() as Commitment & { updatedAt?: number };
        // "Set commitment" event at createdAt
        events.push({
          type: 'commitment_set',
          timestamp: c.createdAt,
          description: c.description,
          weekId: c.weekId,
        });
        // "Status change" event when completed/partial
        if (c.status !== 'incomplete' && c.updatedAt) {
          events.push({
            type: c.status === 'completed' ? 'commitment_completed' : 'commitment_partial',
            timestamp: c.updatedAt,
            description: c.description,
            weekId: c.weekId,
          });
        }
      });
    } catch (e) {
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  },
};
