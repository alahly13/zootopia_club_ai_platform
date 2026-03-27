import { useState, useCallback } from 'react';
import { ErrorCategory } from '../../utils';
import { logger } from '../../utils/logger';
import { auth } from '../../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface AppError {
  type: 'error' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  details?: string;
  uiType: 'alert' | 'modal';
}

export function useAuthError(notify: any, isAdmin: boolean) {
  const [appError, setAppError] = useState<AppError | null>(null);

  const clearError = useCallback(() => setAppError(null), []);

  const handleError = useCallback((error: any, category: ErrorCategory, context?: string, uiType: 'toast' | 'alert' | 'modal' = 'toast') => {
    logger.error(`[${category.toUpperCase()}] ${context || ''}:`, error);
    
    const message = error instanceof Error ? error.message : String(error);
    const title = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
    const type = (category === 'validation' || category === 'auth/session' || category === 'network') ? 'warning' : 'error';

    if (uiType === 'toast') {
      if (type === 'warning') notify.warning(message);
      else notify.error(message);
    } else {
      setAppError({
        type,
        title,
        message,
        details: isAdmin ? message : undefined,
        uiType: uiType === 'modal' ? 'modal' : 'alert'
      });
    }
  }, [notify, isAdmin]);

  const handleFirestoreError = useCallback((error: unknown, operationType: OperationType, path: string | null, silent = false) => {
    const message = error instanceof Error ? error.message : String(error);
    const errInfo = {
      error: message,
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    }
    logger.error('Firestore Error: ', JSON.stringify(errInfo));
    
    if (silent) {
      throw new Error(JSON.stringify(errInfo));
    }

    if (message.includes('permission-denied') || message.includes('insufficient permissions')) {
      setAppError({
        type: 'error',
        title: 'Access Denied',
        message: 'You do not have permission to perform this action. This may be due to security rules on the "zootopiaclub" database.',
        details: JSON.stringify(errInfo, null, 2),
        uiType: 'alert'
      });
    } else if (message.includes('quota-exceeded')) {
      setAppError({
        type: 'warning',
        title: 'Quota Exceeded',
        message: 'Daily system quota for the "zootopiaclub" database has been reached.',
        details: message,
        uiType: 'alert'
      });
    } else if (message.includes('unavailable') || message.includes('failed-precondition')) {
      logger.warn('Firestore connection issue (zootopiaclub):', message);
    } else {
      setAppError({
        type: 'error',
        title: 'System Error',
        message: 'An unexpected error occurred while communicating with the "zootopiaclub" database.',
        details: message,
        uiType: 'alert'
      });
    }

    throw new Error(JSON.stringify(errInfo));
  }, []);

  return {
    appError,
    setAppError,
    clearError,
    handleError,
    handleFirestoreError
  };
}
