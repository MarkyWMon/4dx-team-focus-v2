import { AppView, Commitment, TeamMember, WIGSession } from '../types';
import { getWigDayOfWeek, getPreviousWeekId } from '../utils';

export type NudgeSeverity = 'info' | 'warn' | 'urgent';

export interface Nudge {
  id: string;
  severity: NudgeSeverity;
  message: string;
  actionLabel: string;
  view: AppView;
}

const SEVERITY_ORDER: Record<NudgeSeverity, number> = { urgent: 0, warn: 1, info: 2 };

/**
 * Computes the user's outstanding 4DX obligations from data already on the
 * client. Pure and cheap — recomputed on every render pass. Phase B extends
 * this with day-of-week escalation and dismissal logging.
 */
export function computeNudges(params: {
  currentUser: TeamMember;
  commitments: Commitment[];
  sessions: WIGSession[];
  currentWeekId: string;
  isManager: boolean;
}): Nudge[] {
  const { currentUser, commitments, sessions, currentWeekId, isManager } = params;
  const nudges: Nudge[] = [];

  const myWeek = commitments.filter(c => c.memberId === currentUser.id && c.weekId === currentWeekId);
  const open = myWeek.filter(c => c.status !== 'completed');

  // Days elapsed since the WIG week started (0 = WIG day itself). Escalation
  // ladder: banner from day 2, blocking interstitial from day 3.
  const daysIntoWeek = ((new Date().getDay() - getWigDayOfWeek()) + 7) % 7;
  const wigDayTomorrow = daysIntoWeek === 6;

  if (myWeek.length === 0) {
    nudges.push({
      id: 'no-commitments',
      severity: daysIntoWeek >= 2 ? 'urgent' : 'warn',
      message: "You haven't set any commitments this week yet.",
      actionLabel: 'Set commitments',
      view: AppView.MY_COMMITMENTS,
    });
  } else if (open.length > 0) {
    nudges.push({
      id: 'open-commitments',
      severity: wigDayTomorrow ? 'warn' : 'info',
      message: wigDayTomorrow
        ? `${open.length} commitment${open.length === 1 ? '' : 's'} due before tomorrow's WIG session.`
        : `${open.length} commitment${open.length === 1 ? '' : 's'} still open this week.`,
      actionLabel: 'Review',
      view: AppView.MY_COMMITMENTS,
    });
  }

  // Unmet commitments from last week must be carried forward or written off —
  // they never just disappear.
  const prevWeekId = getPreviousWeekId(currentWeekId);
  const unresolved = commitments.filter(c =>
    c.memberId === currentUser.id
    && c.weekId === prevWeekId
    && c.status !== 'completed'
    && !c.rolloverResolution
  );
  if (unresolved.length > 0) {
    nudges.push({
      id: 'rollover-pending',
      severity: 'warn',
      message: `${unresolved.length} unfinished commitment${unresolved.length === 1 ? '' : 's'} from last week need${unresolved.length === 1 ? 's' : ''} carrying over or writing off.`,
      actionLabel: 'Resolve',
      view: AppView.DASHBOARD,
    });
  }

  if (isManager) {
    const sessionThisWeek = sessions.some(s => s.weekId === currentWeekId && s.status === 'completed');
    if (!sessionThisWeek) {
      nudges.push({
        id: 'no-wig-session',
        severity: 'warn',
        message: "This week's WIG session hasn't been completed yet.",
        actionLabel: 'Run session',
        view: AppView.WIG_SESSION,
      });
    }
  }

  return nudges.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
