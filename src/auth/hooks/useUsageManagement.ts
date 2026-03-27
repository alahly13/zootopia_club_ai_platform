import { useCallback } from 'react';
import { User, UserUsage } from '../../utils';
import { logger } from '../../utils/logger';
import { isFacultyFastAccessUser } from '../../constants/fastAccessPolicy';
import toast from 'react-hot-toast';
import { isUserAdmin } from '../accessControl';

export function useUsageManagement(user: User | null, updateUser: (userId: string, updates: Partial<User>) => Promise<void>) {
  const checkLimit = useCallback((type: keyof Omit<UserUsage, 'lastResetDate'>): boolean => {
    if (!user) return false;
    if (isUserAdmin(user)) return true;

    const limitKey = type === 'aiRequestsToday' ? 'aiRequestsPerDay'
      : type === 'quizGenerationsToday' ? 'quizGenerationsPerDay'
      : 'uploadsPerDay';

    const currentUsage = user.usage?.[type] || 0;
    const currentLimit = user.limits?.[limitKey] || 0;

    if (currentUsage >= currentLimit) {
      toast.error(`Daily limit reached for ${type.replace('Today', '')}. Please try again tomorrow.`);
      return false;
    }
    return true;
  }, [user]);

  const deductCredits = useCallback(async (amount: number = 1): Promise<boolean> => {
    if (!user) return false;
    if (isUserAdmin(user)) return true;

    /**
     * ARCHITECTURE SAFETY NOTE:
     * Credit deduction authority now lives in backend success paths so we can
     * guarantee idempotency and avoid charging failed/partial operations.
     * Keep this method as a compatibility no-op while callers are migrated.
     */
    if (amount < 0) {
      logger.warn('deductCredits called with a negative amount; ignoring client-side deduction request');
    }

    if (isFacultyFastAccessUser(user)) {
      return true;
    }

    return true;
  }, [user]);

  const incrementUsage = useCallback(async (type: keyof Omit<UserUsage, 'lastResetDate'>) => {
    if (!user) return;
    try {
      const currentUsage = user.usage?.[type] || 0;
      await updateUser(user.id, {
        usage: {
          ...user.usage,
          [type]: currentUsage + 1
        }
      });
    } catch (error) {
      logger.error(`Failed to increment usage for ${type}`, error);
    }
  }, [user, updateUser]);

  return {
    checkLimit,
    deductCredits,
    incrementUsage
  };
}
