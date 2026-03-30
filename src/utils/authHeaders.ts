import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth } from '../firebase';
import { logger } from './logger';

const AUTH_HEADER_HYDRATION_WAIT_MS = 2_500;

const waitForHydratedFirebaseUser = async (timeoutMs: number): Promise<User | null> => {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe?.();
      resolve(auth.currentUser || null);
    }, timeoutMs);

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe?.();
        resolve(user || auth.currentUser || null);
      },
      () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe?.();
        resolve(auth.currentUser || null);
      }
    );
  });
};

export async function resolveAuthenticatedRequestContext(options?: {
  baseHeaders?: Record<string, string>;
  waitForHydrationMs?: number;
  forceRefresh?: boolean;
}): Promise<{ currentUser: User; headers: Record<string, string> }> {
  const baseHeaders = options?.baseHeaders || {};
  const waitForHydrationMs = options?.waitForHydrationMs ?? AUTH_HEADER_HYDRATION_WAIT_MS;
  const initialCurrentUser = auth.currentUser;
  const currentUser = initialCurrentUser || (await waitForHydratedFirebaseUser(waitForHydrationMs));

  logger.debug('Resolving authenticated request context', {
    area: 'auth',
    event: 'auth-request-context-requested',
    currentUserId: currentUser?.uid || null,
    hadCachedCurrentUser: Boolean(initialCurrentUser),
    waitedForHydration: !initialCurrentUser,
    waitForHydrationMs,
    forceRefresh: Boolean(options?.forceRefresh),
  });

  if (!currentUser) {
    logger.warn('Authenticated request context missing current user', {
      area: 'auth',
      event: 'auth-request-context-missing-user',
      waitForHydrationMs,
    });
    throw new Error('Missing authenticated session token.');
  }

  try {
    let token = await currentUser.getIdToken(Boolean(options?.forceRefresh));
    if (!token && !options?.forceRefresh) {
      token = await currentUser.getIdToken(true);
    }

    if (!token) {
      throw new Error('Missing authenticated session token.');
    }

    logger.debug('Resolved authenticated request context', {
      area: 'auth',
      event: 'auth-request-context-resolved',
      currentUserId: currentUser.uid,
      tokenSource: options?.forceRefresh ? 'firebase_current_user_forced_refresh' : 'firebase_current_user_cached_or_refreshed',
      waitedForHydration: !initialCurrentUser,
    });

    return {
      currentUser,
      headers: {
        ...baseHeaders,
        Authorization: `Bearer ${token}`,
      },
    };
  } catch (error) {
    if (!(error instanceof Error && error.message === 'Missing authenticated session token.')) {
      logger.warn('Authenticated request context errored', {
        area: 'auth',
        event: 'auth-request-context-error',
        currentUserId: currentUser.uid,
        error,
      });
    }
    throw error;
  }
}

export async function getBearerAuthHeaders(
  baseHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const requestContext = await resolveAuthenticatedRequestContext({ baseHeaders });
  return requestContext.headers;
}
