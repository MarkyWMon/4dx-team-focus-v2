import { TeamMember, Commitment, Achievement } from '../types';

export const SCORING = {
    COMMITMENT_COMPLETE: 50,
    WEEKLY_PERFECTION: 100, // Bonus for 100% completion in a week
    STREAK_MILESTONE: 250,  // Bonus every 5 streak weeks
};

export const ACHIEVEMENTS: Omit<Achievement, 'unlockedAt'>[] = [
    {
        id: 'first-step',
        title: 'First Step',
        description: 'Completed your first 4DX commitment.',
        icon: '🚀'
    },
    {
        id: 'consistency-king',
        title: 'Consistency King',
        description: 'Maintained a 3-week streak.',
        icon: '👑'
    },
    {
        id: 'strategy-master',
        title: 'Strategy Master',
        description: 'Earned over 1000 points.',
        icon: '🧙‍♂️'
    }
];

export const GamificationService = {
    /**
     * Calculates points earned for a commitment status change.
     */
    calculatePointsForAction: (prevStatus: string, newStatus: string): number => {
        if (newStatus === 'completed' && prevStatus !== 'completed') {
            return SCORING.COMMITMENT_COMPLETE;
        }
        if (prevStatus === 'completed' && newStatus !== 'completed') {
            return -SCORING.COMMITMENT_COMPLETE;
        }
        return 0;
    },

    /**
     * Checks for and awards new achievements based on user state.
     */
    checkAchievements: (user: TeamMember): Achievement[] => {
        const newAchievements: Achievement[] = [];
        const existingIds = new Set(user.achievements.map(a => a.id));

        // First Step
        if (!existingIds.has('first-step') && user.score >= SCORING.COMMITMENT_COMPLETE) {
            newAchievements.push({ ...ACHIEVEMENTS.find(a => a.id === 'first-step')!, unlockedAt: Date.now() });
        }

        // Consistency King
        if (!existingIds.has('consistency-king') && user.streak >= 3) {
            newAchievements.push({ ...ACHIEVEMENTS.find(a => a.id === 'consistency-king')!, unlockedAt: Date.now() });
        }

        // Strategy Master
        if (!existingIds.has('strategy-master') && user.score >= 1000) {
            newAchievements.push({ ...ACHIEVEMENTS.find(a => a.id === 'strategy-master')!, unlockedAt: Date.now() });
        }

        return newAchievements;
    },

    /**
     * Logic to update streaks when a user moves to a new week.
     * This should be called when the user's current view matches a new week.
     */
    processWeeklyTransition: async (user: TeamMember, lastWeekId: string, currentWeekId: string, commitments: Commitment[]): Promise<Partial<TeamMember> | null> => {
        // If we've already processed this week transition, skip
        if (user.lastActiveWeekId === lastWeekId) return null;

        const lastWeekCommitments = commitments.filter(c => c.memberId === user.id && c.weekId === lastWeekId);

        if (lastWeekCommitments.length === 0) {
            // Optional: Decide if no commitments for a week breaks a streak
            return { lastActiveWeekId: lastWeekId };
        }

        const allCompleted = lastWeekCommitments.every(c => c.status === 'completed');

        let newStreak = user.streak;
        let newScore = user.score;

        if (allCompleted) {
            newStreak += 1;
            newScore += SCORING.WEEKLY_PERFECTION;
            if (newStreak % 5 === 0) newScore += SCORING.STREAK_MILESTONE;
        } else {
            newStreak = 0; // Streak broken
        }

        const updates: Partial<TeamMember> = {
            streak: newStreak,
            longestStreak: Math.max(newStreak, user.longestStreak),
            score: newScore,
            lastActiveWeekId: lastWeekId
        };

        return updates;
    }
};
