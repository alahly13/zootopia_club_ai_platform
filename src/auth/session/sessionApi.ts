import { auth } from '../../firebase';
import type { ApiResponse } from '../../types/api';
import type { AuthSessionType, ServerAuthSessionState } from './types';

type SessionEnvelope = {
  session: ServerAuthSessionState;
};

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
  const payload = (await response.json().catch(() => null)) as ApiResponse<SessionEnvelope> | null;

  if (!response.ok || !payload?.success || !payload.data?.session) {
    throw new Error(String(payload?.error || fallbackError));
  }

  return payload.data;
}

async function postAuthSession(
  endpoint: '/api/auth/session/bootstrap' | '/api/auth/session/refresh',
  expectedAuthType?: AuthSessionType | null,
  source?: 'login' | 'restore' | 'refresh'
): Promise<SessionEnvelope> {
  const headers = await getAuthSessionHeaders();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      expectedAuthType: expectedAuthType || undefined,
      source: source || undefined,
    }),
  });

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
  const response = await fetch('/api/auth/session/logout', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      authType,
      reason,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiResponse | null;
    throw new Error(String(payload?.error || 'Failed to invalidate active session.'));
  }
}
