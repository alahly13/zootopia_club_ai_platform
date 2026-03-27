import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../../utils/browserStorage';
import type { AuthSessionState, AuthSessionType } from './types';

const AUTH_SESSION_CURRENT_MODE_KEY = 'zootopia_auth_session_mode_v2';
const AUTH_SESSION_STORAGE_PREFIX = 'zootopia_auth_session_v2';
const LEGACY_AUTH_SESSION_KEYS = [
  'zootopia_admin_session',
  'zootopia_session_expiry',
] as const;

function buildSessionStorageKey(authType: AuthSessionType) {
  return `${AUTH_SESSION_STORAGE_PREFIX}:${authType}`;
}

function safeParseSession(raw: string | null): AuthSessionState | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSessionState;
  } catch {
    return null;
  }
}

export function clearLegacyAuthSessionKeys(): void {
  LEGACY_AUTH_SESSION_KEYS.forEach((key) => safeLocalStorageRemoveItem(key));
}

export function readStoredAuthSessionMode(): AuthSessionType | null {
  const raw = safeLocalStorageGetItem(AUTH_SESSION_CURRENT_MODE_KEY);
  if (raw === 'normal' || raw === 'fast_access' || raw === 'admin') {
    return raw;
  }

  return null;
}

export function writeStoredAuthSessionMode(authType: AuthSessionType): void {
  safeLocalStorageSetItem(AUTH_SESSION_CURRENT_MODE_KEY, authType);
}

export function clearStoredAuthSessionMode(): void {
  safeLocalStorageRemoveItem(AUTH_SESSION_CURRENT_MODE_KEY);
}

export function readStoredAuthSession(authType: AuthSessionType): AuthSessionState | null {
  return safeParseSession(safeLocalStorageGetItem(buildSessionStorageKey(authType)));
}

export function writeStoredAuthSession(authType: AuthSessionType, session: AuthSessionState): void {
  safeLocalStorageSetItem(buildSessionStorageKey(authType), JSON.stringify(session));
}

export function clearStoredAuthSession(authType: AuthSessionType): void {
  safeLocalStorageRemoveItem(buildSessionStorageKey(authType));
}

export function clearAllStoredAuthSessions(): void {
  clearStoredAuthSession('normal');
  clearStoredAuthSession('fast_access');
  clearStoredAuthSession('admin');
  clearStoredAuthSessionMode();
  clearLegacyAuthSessionKeys();
}
