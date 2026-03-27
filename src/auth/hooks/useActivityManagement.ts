import { useCallback } from 'react';
import { Activity, User } from '../../utils';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { logger } from '../../utils/logger';

export function useActivityManagement(user: User | null) {
  const logActivity = useCallback(async (
    type: Activity['type'], 
    description: string, 
    status: Activity['status'] = 'success', 
    metadata?: any,
    explicitUserId?: string
  ) => {
    const userId = explicitUserId || user?.id;
    if (!userId) return;
    try {
      const activity: Activity = {
        id: `act-${Date.now()}`,
        userId,
        type,
        description,
        timestamp: new Date().toISOString(),
        status,
        metadata
      };
      await setDoc(doc(db, 'activities', activity.id), activity);
    } catch (error) {
      logger.error('Failed to log activity', { error });
    }
  }, [user?.id]);

  return { logActivity };
}
