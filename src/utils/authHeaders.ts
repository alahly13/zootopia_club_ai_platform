import { auth } from '../firebase';
import { logger } from './logger';

export async function getBearerAuthHeaders(
  baseHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;

  logger.debug('Resolving bearer auth headers', {
    area: 'auth',
    event: 'auth-bearer-header-requested',
    currentUserId: currentUser?.uid || null,
    hasCurrentUser: Boolean(currentUser),
    tokenSource: 'firebase_current_user_cached_token',
    forceRefresh: false,
  });

  try {
    const token = await currentUser?.getIdToken();
    if (!token) {
      logger.warn('Bearer auth header resolution failed due to missing token', {
        area: 'auth',
        event: 'auth-bearer-header-missing-token',
        currentUserId: currentUser?.uid || null,
        hasCurrentUser: Boolean(currentUser),
      });
      throw new Error('Missing authenticated session token.');
    }

    logger.debug('Resolved bearer auth headers', {
      area: 'auth',
      event: 'auth-bearer-header-resolved',
      currentUserId: currentUser?.uid || null,
      tokenSource: 'firebase_current_user_cached_token',
      forceRefresh: false,
    });

    return {
      ...baseHeaders,
      Authorization: `Bearer ${token}`,
    };
  } catch (error) {
    if (!(error instanceof Error && error.message === 'Missing authenticated session token.')) {
      logger.warn('Bearer auth header resolution errored', {
        area: 'auth',
        event: 'auth-bearer-header-error',
        currentUserId: currentUser?.uid || null,
        error,
      });
    }
    throw error;
  }
}
