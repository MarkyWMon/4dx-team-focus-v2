
export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF';
export type CommitmentStatus = 'completed' | 'partial' | 'incomplete';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string;
  avatar: string;
  lastLogin?: number; // Timestamp
  weeklyCommitment: string;
  // Dynamic metrics: map of leadMeasureId -> currentCount
  leadMeasureProgress: Record<string, number>;

  // Gamification v2
  score: number;
  streak: number;
  longestStreak: number;
  achievements: Achievement[];
  lastActiveWeekId?: string;

  // Legacy fields (optional migration)
  walksCompleted?: number;
  valueActionsCompleted?: number;
}

export const WIG_SETTINGS = {
  walksTargetPerPerson: 2,
  valueActionsTargetPerPerson: 1,
};

export interface LoginLog {
  id: string;
  userId: string;
  userName: string;
  timestamp: number;
}

export interface ChangeRequest {
  id: string;
  measureId: string;
  measureName: string;
  requestedBy: string; // User Name
  previousValue: string;
  newValue: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Commitment {
  id: string;
  memberId: string;
  weekId: string; // Format: "YYYY-MM-DD" (Monday)
  description: string;
  status: CommitmentStatus;
  createdAt: number;
  completionNote?: string;
  completionPhoto?: string; // Base64 string
  leadMeasureId?: string; // Linked Lead Measure (auto-set by AI or template)
  leadMeasureName?: string; // Human-readable name for display
  alignedByAI?: boolean; // True if AI validated the alignment
}

export interface LeadMeasure {
  id: string;
  name: string;
  value: string;
  changeDescription: string;
  status: 'good' | 'warning' | 'danger';
  lastUpdated?: number;
}

export interface LeadMeasureLog {
  id: string;
  measureId: string;
  value: number;
  timestamp: number;
  weekId: string;
}

export interface Ticket {
  id: string;
  category: string;
  summary: string;
  assignee: string;
  requestor: string;
  createdAt: number;
  weekId: string;
  status?: string;
  priority?: string;
}

export interface SurveyResult {
  id: string; // Ticket No
  ticketNo: string;
  date: number; // Timestamp
  client: string;
  location: string;
  tech: string;
  problemType: string;
  q1: number; // Resolution
  q2: number; // Professionalism
  q3: number; // Speed
  average: number;
  weekId: string; // Derived from date for grouping
}

export interface CategoryInsight {
  id: string;
  weekId: string;
  category: string;
  summary: string;
}

export interface StrategicInsight {
  id: string;
  generatedAt: number;
  monthId: string;
  trends: string[];
}

export interface TicketExample {
  id: string;
  summary: string;
  date?: string;
}

export interface TicketStat {
  label: string;
  count: number;
  previousCount?: number;
  themeSummary?: string;
  examples: TicketExample[];
}

export interface WeeklyNote {
  weekId: string;
  text: string;
  updatedAt: number;
}

export interface AISuggestion {
  id: string;
  commitment: string;
  rationale: string;
  leadMeasureId?: string; // ID of the linked lead measure
  leadMeasureName?: string; // Human name of the linked lead measure
  isExiting?: boolean;
}

export interface CommitmentCheckResult {
  isEffective: boolean;
  score: number; // 0 to 10
  feedback: string;
  suggestedAlternative?: string;
  isRedundant?: boolean; // Detects if it's the same as last week
  isOverlapping?: boolean; // Detects if a colleague is already doing it
  overlapWarning?: string; // Detailed message about who else is doing it
  linkedLeadMeasureId?: string; // AI-detected Lead Measure alignment
  linkedLeadMeasureName?: string; // Human-readable name
  isAligned?: boolean; // True if commitment aligns with a Lead Measure
}

export interface ImportPreferences {
  idIndex: number;
  dateIndex: number;
  categoryIndex: number;
  descIndex: number;
  assigneeIndex: number;
  requestorIndex: number;
}

export enum AppView {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  MY_COMMITMENTS = 'MY_COMMITMENTS',
  HISTORY = 'HISTORY',
  TEAM_MANAGEMENT = 'TEAM_MANAGEMENT',
  ADMIN_CONSOLE = 'ADMIN_CONSOLE',
  WIG_SESSION = 'WIG_SESSION'
}

export interface WIGSessionStep {
  id: number;
  title: string;
  durationMinutes: number;
  completed: boolean;
  prompt: string;
}

export interface WIGSession {
  id: string;
  weekId: string;
  scheduledDate: number; // Timestamp
  status: 'scheduled' | 'in_progress' | 'completed';
  currentStep: number;
  attendees: string[]; // Member IDs
  notes: string;
  obstacles: string;
  startedAt?: number;
  completedAt?: number;
}

export type CommitmentCategory = 'floor_walk' | 'preventive_maintenance' | 'documentation' | 'training' | 'infrastructure' | 'other';

export interface CommitmentTemplate {
  id: string;
  title: string;
  description: string;
  category: CommitmentCategory;
  icon: string;
  estimatedMinutes: number;
  potentialImpact: string;
  suggestedFrequency: 'weekly' | 'biweekly' | 'monthly';
}

export interface LeadMeasureDefinition {
  id: string;
  name: string;
  target: number;
  unit: string; // e.g., "Walks", "Actions", "Updates"
  definition?: string; // Optional operational definition for clarity
  color?: string; // e.g., "brand-green", "brand-navy"
}

export interface WIGConfig {
  id: string;
  title: string;
  description: string;
  metricType: 'percentage' | 'number' | 'currency';
  currentValue: number;
  targetValue: number;
  currentScore: number; // e.g. 0.7 for 70%
  targetScore: number;  // e.g. 0.8 for 80%
  leadMeasures: LeadMeasureDefinition[];
  startDate: number;
  endDate: number;
  // Legacy fields (optional migration)
  leadMeasureTarget?: number;
  leadMeasureName?: string;
  walksTargetPerPerson?: number;
  valueActionsTargetPerPerson?: number;
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor: string;
  successColor: string;
  warningColor: string;
  titleFont: string;
  bodyFont: string;
  logoUrl?: string;
  updatedAt: number;
}

export const DEFAULT_BRANDING: BrandingConfig = {
  primaryColor: '#E30613', // brand-red
  secondaryColor: '#003057', // brand-navy
  successColor: '#82BC00', // brand-green
  warningColor: '#F37A1F', // brand-orange
  titleFont: 'Poppins',
  bodyFont: 'Roboto',
  logoUrl: '',
  updatedAt: Date.now()
};
