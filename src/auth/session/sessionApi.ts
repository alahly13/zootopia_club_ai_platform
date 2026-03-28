import { auth } from '../../firebase';
import type { ApiResponse } from '../../types/api';
import type { AuthSessionType, ServerAuthSessionState } from './types';

type SessionEnvelope = {
  session: ServerAuthSessionState;
};

type SessionErrorPayload = ApiResponse<SessionEnvelope> & {
  code?: string;
  sessionState?: string | null;
  details?: unknown;
};

const AUTH_SESSION_API_TIMEOUT_MS = 12_000;

export class AuthSessionApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
    public readonly sessionState: string | null,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AuthSessionApiError';
  }
}

export function isAuthSessionApiError(error: unknown): error is AuthSessionApiError {
  return error instanceof AuthSessionApiError;
}

async function getAuthSessionHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Missing authenticated session token.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseAuthSessionResponse(
  response: Response,
  fallbackError: string
): Promise<SessionEnvelope> {
  const payload = (await response.json().catch(() => null)) as SessionErrorPayload | null;

  if (!response.ok || !payload?.success || !payload.data?.session) {
    throw new AuthSessionApiError(
      String(payload?.error || fallbackError),
      response.status,
      typeof payload?.code === 'string' ? payload.code : null,
      typeof payload?.sessionState === 'string' ? payload.sessionState : null,
      payload?.details
    );
  }

  return payload.data;
}

async function fetchAuthSession(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMessage: string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_SESSION_API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new AuthSessionApiError(timeoutMessage, 504, 'AUTH_SESSION_TIMEOUT', 'invalid');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function postAuthSession(
  endpoint: '/api/auth/session/bootstrap' | '/api/auth/session/refresh',
  expectedAuthType?: AuthSessionType | null,
  source?: 'login' | 'restore' | 'refresh'
): Promise<SessionEnvelope> {
  const headers = await getAuthSessionHeaders();
  const response = await fetchAuthSession(
    endpoint,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        expectedAuthType: expectedAuthType || undefined,
        source: source || undefined,
      }),
    },
    endpoint === '/api/auth/session/refresh'
      ? 'Session refresh timed out.'
      : 'Session bootstrap timed out.'
  );

  return parseAuthSessionResponse(
    response,
    endpoint === '/api/auth/session/refresh'
      ? 'Failed to refresh session.'
      : 'Failed to bootstrap session.'
  );
}

export async function bootstrapPlatformAuthSession(
  expectedAuthType?: AuthSessionType | null,
  source?: 'login' | 'restore'
): Promise<SessionEnvelope> {
  return postAuthSession('/api/auth/session/bootstrap', expectedAuthType, source);
}

export async function refreshPlatformAuthSession(
  expectedAuthType?: AuthSessionType | null,
  source?: 'refresh'
): Promise<SessionEnvelope> {
  return postAuthSession('/api/auth/session/refresh', expectedAuthType, source);
}

export async function logoutPlatformAuthSession(
  authType: AuthSessionType,
  reason: string
): Promise<void> {
  const headers = await getAuthSessionHeaders();
  const response = await fetchAuthSession(
    '/api/auth/session/logout',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        authType,
        reason,
      }),
    },
    'Session logout timed out.'
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as SessionErrorPayload | null;
    throw new AuthSessionApiError(
      String(payload?.error || 'Failed to invalidate active session.'),
      response.status,
      typeof payload?.code === 'string' ? payload.code : null,
      typeof payload?.sessionState === 'string' ? payload.sessionState : null,
      payload?.details
    );
  }
}
