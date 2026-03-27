export type AuthSessionType = 'normal' | 'fast_access' | 'admin';

export type ServerAuthSessionLifecycleState =
  | 'authenticated'
  | 'expired'
  | 'invalid'
  | 'logging_out';

export type ClientAuthSessionLifecycleState =
  | ServerAuthSessionLifecycleState
  | 'unauthenticated'
  | 'restoring';

export type AuthSessionVerificationStatus =
  | 'verified'
  | 'not_applicable'
  | 'expired'
  | 'mode_mismatch';

export type AuthSessionRehydrationStatus = 'fresh' | 'restored' | 'refreshed' | 'none';

export type AuthSessionReEntryStatus =
  | 'fresh'
  | 'restored'
  | 'session_replaced'
  | 'mode_switched'
  | 'none';

export interface AuthSessionState {
  schemaVersion: string;
  sessionId: string | null;
  traceId: string | null;
  uid: string | null;
  email: string | null;
  role: 'Admin' | 'User' | null;
  adminLevel: string | null;
  authType: AuthSessionType | null;
  sessionState: ClientAuthSessionLifecycleState;
  sessionSource: 'login' | 'restore' | 'refresh' | 'middleware_auto_recover' | 'logout' | 'none';
  modeMismatch: boolean;
  sessionFingerprint: string | null;
  loginMethod: string | null;
  issuedAt: string | null;
  refreshedAt: string | null;
  expiresAt: string | null;
  lastActivityAt: string | null;
  authProviders: string[];
  accountScope: string | null;
  isTemporaryAccess: boolean;
  cacheNamespace: string | null;
  sessionNamespace: string | null;
  documentRuntimeNamespace: string | null;
  rehydrationStatus: AuthSessionRehydrationStatus;
  cacheHydrationStatus: 'hydrated' | 'cleared' | 'none';
  restoreFailureReason: string | null;
  logoutReason: string | null;
  reEntryStatus: AuthSessionReEntryStatus;
  adminVerificationStatus: AuthSessionVerificationStatus;
  fastAccessVerificationStatus: AuthSessionVerificationStatus;
  accountCompletenessStatus:
    | 'complete'
    | 'partial'
    | 'temporary_onboarding_pending'
    | 'temporary_onboarding_complete'
    | 'temporary_expired'
    | 'unknown';
  lastValidatedAt: string | null;
  tokenIssuedAtSec: number | null;
  tokenAuthTimeSec: number | null;
  sessionScopeKey: string | null;
}

export type ServerAuthSessionState = Omit<AuthSessionState, 'sessionState' | 'rehydrationStatus' | 'reEntryStatus' | 'sessionScopeKey'> & {
  sessionState: ServerAuthSessionLifecycleState;
  rehydrationStatus: Exclude<AuthSessionRehydrationStatus, 'none'>;
  reEntryStatus: Exclude<AuthSessionReEntryStatus, 'none'>;
};

export function createUnauthenticatedAuthSessionState(
  overrides: Partial<AuthSessionState> = {}
): AuthSessionState {
  return {
    schemaVersion: '2026-03-auth-session-v1',
    sessionId: null,
    traceId: null,
    uid: null,
    email: null,
    role: null,
    adminLevel: null,
    authType: null,
    sessionState: 'unauthenticated',
    sessionSource: 'none',
    modeMismatch: false,
    sessionFingerprint: null,
    loginMethod: null,
    issuedAt: null,
    refreshedAt: null,
    expiresAt: null,
    lastActivityAt: null,
    authProviders: [],
    accountScope: null,
    isTemporaryAccess: false,
    cacheNamespace: null,
    sessionNamespace: null,
    documentRuntimeNamespace: null,
    rehydrationStatus: 'none',
    cacheHydrationStatus: 'none',
    restoreFailureReason: null,
    logoutReason: null,
    reEntryStatus: 'none',
    adminVerificationStatus: 'not_applicable',
    fastAccessVerificationStatus: 'not_applicable',
    accountCompletenessStatus: 'unknown',
    lastValidatedAt: null,
    tokenIssuedAtSec: null,
    tokenAuthTimeSec: null,
    sessionScopeKey: null,
    ...overrides,
  };
}
