import { createTraceId, logDiagnostic, normalizeError } from './diagnostics.js';
import {
  RedisBackedStoreRegistry,
  buildNamespacedRedisKey,
  deleteRedisKey,
  getRedisJson,
  setRedisJson,
} from './cache/redisBackedStore.js';

export type PlatformAuthType = 'normal' | 'fast_access' | 'admin';

export type AuthSessionLifecycleState =
  | 'authenticated'
  | 'expired'
  | 'invalid'
  | 'logging_out';

export type AuthSessionVerificationStatus =
  | 'verified'
  | 'not_applicable'
  | 'expired'
  | 'mode_mismatch';

export type AuthSessionErrorCode =
  | 'SESSION_INVALIDATED'
  | 'SESSION_MISSING'
  | 'SESSION_EXPIRED'
  | 'SESSION_MAX_LIFETIME_EXCEEDED'
  | 'AUTH_MODE_MISMATCH';

type AuthSessionRehydrationStatus = AuthSessionSnapshot['rehydrationStatus'];
type AuthSessionReEntryStatus = AuthSessionSnapshot['reEntryStatus'];

export interface AuthSessionSnapshot {
  schemaVersion: string;
  sessionId: string;
  traceId: string;
  uid: string;
  email: string | null;
  role: 'Admin' | 'User';
  adminLevel: string | null;
  authType: PlatformAuthType;
  sessionState: AuthSessionLifecycleState;
  sessionSource: 'login' | 'restore' | 'refresh' | 'middleware_auto_recover' | 'logout';
  modeMismatch: boolean;
  sessionFingerprint: string;
  loginMethod: string;
  issuedAt: string;
  refreshedAt: string;
  expiresAt: string;
  lastActivityAt: string;
  authProviders: string[];
  accountScope: string | null;
  isTemporaryAccess: boolean;
  cacheNamespace: string;
  sessionNamespace: string;
  documentRuntimeNamespace: string;
  rehydrationStatus: 'fresh' | 'restored' | 'refreshed';
  cacheHydrationStatus: 'hydrated' | 'cleared';
  restoreFailureReason: string | null;
  logoutReason: string | null;
  reEntryStatus: 'fresh' | 'restored' | 'session_replaced' | 'mode_switched';
  adminVerificationStatus: AuthSessionVerificationStatus;
  fastAccessVerificationStatus: AuthSessionVerificationStatus;
  accountCompletenessStatus:
    | 'complete'
    | 'partial'
    | 'temporary_onboarding_pending'
    | 'temporary_onboarding_complete'
    | 'temporary_expired';
  lastValidatedAt: string;
  tokenIssuedAtSec: number;
  tokenAuthTimeSec: number;
}

type AuthSessionInvalidationRecord = {
  invalidatedAt: string;
  invalidatedAtSec: number;
  logoutReason: string;
};

type AuthSessionBootstrapInput = {
  decodedToken: {
    uid: string;
    email?: string | null;
    iat?: number;
    auth_time?: number;
    firebase?: {
      sign_in_provider?: string;
    };
  } & Record<string, unknown>;
  userData: Record<string, unknown>;
  role: 'Admin' | 'User';
  adminLevel?: string | null;
  authType: PlatformAuthType;
  expectedAuthType?: PlatformAuthType | null;
  source: AuthSessionSnapshot['sessionSource'];
};

type AuthSessionValidationInput = AuthSessionBootstrapInput & {
  autoRecover?: boolean;
};

type AuthSessionValidationResult =
  | {
      ok: true;
      session: AuthSessionSnapshot;
    }
  | {
      ok: false;
      statusCode: number;
      error: string;
      code: string;
      session?: AuthSessionSnapshot | null;
    };

export class AuthSessionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: AuthSessionErrorCode,
    public readonly session: AuthSessionSnapshot | null = null
  ) {
    super(message);
    this.name = 'AuthSessionError';
  }
}

const AUTH_SESSION_SCHEMA_VERSION = '2026-03-auth-session-v1';
const AUTH_SESSION_REDIS_URL = process.env.REDIS_URL?.trim() || '';
const AUTH_SESSION_REDIS_KEY_PREFIX =
  process.env.AUTH_SESSION_REDIS_KEY_PREFIX?.trim() || 'zootopia:auth';
const AUTH_SESSION_MAX_LIFETIME_SEC = Number.parseInt(
  process.env.AUTH_SESSION_MAX_LIFETIME_SEC || '10800',
  10
);
export const AUTH_SESSION_HARD_MAX_LIFETIME_SEC = AUTH_SESSION_MAX_LIFETIME_SEC;
const resolveConfiguredSessionTtlSec = (envValue: string | undefined): number => {
  const parsed = Number.parseInt(envValue || '', 10);
  const candidate = Number.isFinite(parsed) && parsed > 0
    ? parsed
    : AUTH_SESSION_MAX_LIFETIME_SEC;

  return Math.max(1, Math.min(candidate, AUTH_SESSION_MAX_LIFETIME_SEC));
};
const AUTH_SESSION_NORMAL_TTL_SEC = Number.parseInt(
  String(resolveConfiguredSessionTtlSec(process.env.AUTH_SESSION_NORMAL_TTL_SEC)),
  10
);
const AUTH_SESSION_FAST_ACCESS_TTL_SEC = Number.parseInt(
  String(resolveConfiguredSessionTtlSec(process.env.AUTH_SESSION_FAST_ACCESS_TTL_SEC)),
  10
);
const AUTH_SESSION_ADMIN_TTL_SEC = Number.parseInt(
  String(resolveConfiguredSessionTtlSec(process.env.AUTH_SESSION_ADMIN_TTL_SEC)),
  10
);
const AUTH_SESSION_INVALIDATION_TTL_SEC = Number.parseInt(
  process.env.AUTH_SESSION_INVALIDATION_TTL_SEC || '86400',
  10
);
const AUTH_SESSION_MEMORY_FALLBACK_ENABLED =
  process.env.AUTH_SESSION_MEMORY_FALLBACK_ENABLED !== 'false' &&
  process.env.NODE_ENV !== 'production';
const ACTIVITY_TOUCH_INTERVAL_MS = 60_000;

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function normalizeAuthProviders(userData: Record<string, unknown>): string[] {
  if (!Array.isArray(userData.authProviders)) {
    return [];
  }

  return Array.from(
    new Set(
      userData.authProviders
        .map((provider) => normalizeOptionalString(provider))
        .filter((provider): provider is string => Boolean(provider))
    )
  );
}

function resolveTokenAuthTimeSec(
  decodedToken: Pick<AuthSessionBootstrapInput['decodedToken'], 'auth_time' | 'iat'>,
  nowMs: number = Date.now()
): number {
  const authTimeSec = Number(decodedToken.auth_time || decodedToken.iat || 0);
  if (Number.isFinite(authTimeSec) && authTimeSec > 0) {
    return authTimeSec;
  }

  return Math.floor(nowMs / 1000);
}

export function resolveRemainingSessionLifetimeSec(
  decodedToken: Pick<AuthSessionBootstrapInput['decodedToken'], 'auth_time' | 'iat'>,
  nowMs: number = Date.now()
): number {
  const authTimeSec = resolveTokenAuthTimeSec(decodedToken, nowMs);
  const elapsedSec = Math.max(0, Math.floor(nowMs / 1000) - authTimeSec);
  return Math.max(0, AUTH_SESSION_MAX_LIFETIME_SEC - elapsedSec);
}

export function hasSessionExceededMaximumLifetime(
  decodedToken: Pick<AuthSessionBootstrapInput['decodedToken'], 'auth_time' | 'iat'>,
  nowMs: number = Date.now()
): boolean {
  return resolveRemainingSessionLifetimeSec(decodedToken, nowMs) <= 0;
}

export function resolveSessionTtlSec(
  authType: PlatformAuthType,
  userData: Record<string, unknown>,
  decodedToken: Pick<AuthSessionBootstrapInput['decodedToken'], 'auth_time' | 'iat'>
): number {
  const baseTtlSec =
    authType === 'admin'
      ? AUTH_SESSION_ADMIN_TTL_SEC
      : authType === 'fast_access'
        ? AUTH_SESSION_FAST_ACCESS_TTL_SEC
        : AUTH_SESSION_NORMAL_TTL_SEC;
  const hardLifetimeRemainingSec = resolveRemainingSessionLifetimeSec(decodedToken);

  if (authType !== 'fast_access') {
    return Math.max(1, Math.min(baseTtlSec, hardLifetimeRemainingSec));
  }

  const temporaryAccessExpiresAt = normalizeOptionalString(userData.temporaryAccessExpiresAt);
  if (!temporaryAccessExpiresAt) {
    return Math.max(1, Math.min(baseTtlSec, hardLifetimeRemainingSec));
  }

  const expiresAtMs = new Date(temporaryAccessExpiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return Math.max(1, Math.min(baseTtlSec, hardLifetimeRemainingSec));
  }

  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs <= 0) {
    return 1;
  }

  return Math.max(
    1,
    Math.min(baseTtlSec, Math.floor(remainingMs / 1000), hardLifetimeRemainingSec)
  );
}

function resolveAccountCompletenessStatus(
  authType: PlatformAuthType,
  userData: Record<string, unknown>
): AuthSessionSnapshot['accountCompletenessStatus'] {
  if (authType === 'fast_access') {
    const expiresAt = normalizeOptionalString(userData.temporaryAccessExpiresAt);
    if (expiresAt) {
      const expiresAtMs = new Date(expiresAt).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        return 'temporary_expired';
      }
    }

    const profileCompletionStage = String(
      userData.fastAccessMetadata &&
        typeof userData.fastAccessMetadata === 'object' &&
        userData.fastAccessMetadata !== null
        ? (userData.fastAccessMetadata as Record<string, unknown>).profileCompletionStage || ''
        : ''
    )
      .trim()
      .toLowerCase();

    return profileCompletionStage === 'temporary_onboarding_complete'
      ? 'temporary_onboarding_complete'
      : 'temporary_onboarding_pending';
  }

  const isComplete =
    Boolean(normalizeOptionalString(userData.name)) &&
    Boolean(normalizeOptionalString(userData.email)) &&
    Boolean(normalizeOptionalString(userData.username));

  return isComplete ? 'complete' : 'partial';
}

function resolveVerificationStatuses(
  authType: PlatformAuthType,
  userData: Record<string, unknown>,
  modeMismatch: boolean
): {
  adminVerificationStatus: AuthSessionVerificationStatus;
  fastAccessVerificationStatus: AuthSessionVerificationStatus;
} {
  if (modeMismatch) {
    return {
      adminVerificationStatus: 'mode_mismatch' as const,
      fastAccessVerificationStatus: 'mode_mismatch' as const,
    };
  }

  const temporaryAccessExpiresAt = normalizeOptionalString(userData.temporaryAccessExpiresAt);
  const hasExpiredFastAccess =
    authType === 'fast_access' &&
    temporaryAccessExpiresAt !== null &&
    Number.isFinite(new Date(temporaryAccessExpiresAt).getTime()) &&
    new Date(temporaryAccessExpiresAt).getTime() <= Date.now();

  return {
    adminVerificationStatus:
      authType === 'admin'
        ? 'verified'
        : 'not_applicable',
    fastAccessVerificationStatus:
      authType === 'fast_access'
        ? hasExpiredFastAccess
          ? 'expired'
          : 'verified'
        : 'not_applicable',
  };
}

function resolveRehydrationStatus(
  source: AuthSessionBootstrapInput['source']
): AuthSessionRehydrationStatus {
  if (source === 'refresh') {
    return 'refreshed';
  }

  if (source === 'restore') {
    return 'restored';
  }

  return 'fresh';
}

function resolveReEntryStatus(params: {
  source: AuthSessionBootstrapInput['source'];
  expectedAuthType?: PlatformAuthType | null;
  authType: PlatformAuthType;
  hadExistingSession: boolean;
}): AuthSessionReEntryStatus {
  if (params.expectedAuthType && params.expectedAuthType !== params.authType) {
    return 'mode_switched';
  }

  if (params.source === 'restore') {
    return 'restored';
  }

  if (params.hadExistingSession) {
    return 'session_replaced';
  }

  return 'fresh';
}

function resolveLoginMethod(input: AuthSessionBootstrapInput): string {
  const provider = String(input.decodedToken.firebase?.sign_in_provider || '').trim().toLowerCase();

  if (input.authType === 'admin') {
    return provider === 'password' ? 'admin_email_password' : provider || 'admin_session';
  }

  if (input.authType === 'fast_access') {
    return 'fast_access_phone_otp';
  }

  if (provider === 'google.com') {
    return 'google_oauth';
  }

  if (provider === 'password') {
    return 'email_password';
  }

  return provider || 'firebase_session';
}

export function resolveSessionFingerprint(input: AuthSessionBootstrapInput): string {
  const provider = String(input.decodedToken.firebase?.sign_in_provider || '').trim().toLowerCase() || 'unknown';
  const authTimeSec = resolveTokenAuthTimeSec(input.decodedToken);
  const scope = normalizeOptionalString(input.userData.accountScope) || 'full_account';
  return `${input.authType}:${input.decodedToken.uid}:${provider}:${scope}:${authTimeSec}`;
}

function buildAuthSessionNamespace(authType: PlatformAuthType, uid: string): string {
  return buildNamespacedRedisKey(AUTH_SESSION_REDIS_KEY_PREFIX, authType, 'users', uid);
}

function buildAuthSessionKeySet(authType: PlatformAuthType, uid: string, sessionId?: string) {
  const namespace = buildAuthSessionNamespace(authType, uid);

  return {
    namespace,
    current: buildNamespacedRedisKey(namespace, 'current'),
    invalidation: buildNamespacedRedisKey(namespace, 'invalidation'),
    session: sessionId ? buildNamespacedRedisKey(namespace, 'sessions', sessionId) : null,
  };
}

function createBaseSnapshot(input: AuthSessionBootstrapInput & {
  traceId: string;
  sessionId: string;
  sessionFingerprint: string;
  ttlSec: number;
  rehydrationStatus: AuthSessionSnapshot['rehydrationStatus'];
  reEntryStatus: AuthSessionSnapshot['reEntryStatus'];
  cacheHydrationStatus: AuthSessionSnapshot['cacheHydrationStatus'];
}): AuthSessionSnapshot {
  const nowIso = new Date().toISOString();
  const sessionNamespace = buildAuthSessionNamespace(input.authType, input.decodedToken.uid);
  const expiresAt = new Date(Date.now() + input.ttlSec * 1000).toISOString();
  const modeMismatch = Boolean(input.expectedAuthType && input.expectedAuthType !== input.authType);
  const verificationStatuses = resolveVerificationStatuses(input.authType, input.userData, modeMismatch);

  return {
    schemaVersion: AUTH_SESSION_SCHEMA_VERSION,
    sessionId: input.sessionId,
    traceId: input.traceId,
    uid: input.decodedToken.uid,
    email: normalizeOptionalString(input.decodedToken.email),
    role: input.role,
    adminLevel: normalizeOptionalString(input.adminLevel),
    authType: input.authType,
    sessionState: 'authenticated',
    sessionSource: input.source,
    modeMismatch,
    sessionFingerprint: input.sessionFingerprint,
    loginMethod: resolveLoginMethod(input),
    issuedAt: nowIso,
    refreshedAt: nowIso,
    expiresAt,
    lastActivityAt: nowIso,
    authProviders: normalizeAuthProviders(input.userData),
    accountScope: normalizeOptionalString(input.userData.accountScope),
    isTemporaryAccess:
      input.userData.isTemporaryAccess === true ||
      normalizeOptionalString(input.userData.accountScope) === 'faculty_science_fast_access',
    cacheNamespace: buildNamespacedRedisKey(sessionNamespace, 'cache'),
    sessionNamespace,
    documentRuntimeNamespace: buildNamespacedRedisKey('document-runtime', input.authType, input.decodedToken.uid),
    rehydrationStatus: input.rehydrationStatus,
    cacheHydrationStatus: input.cacheHydrationStatus,
    restoreFailureReason: null,
    logoutReason: null,
    reEntryStatus: input.reEntryStatus,
    adminVerificationStatus: verificationStatuses.adminVerificationStatus,
    fastAccessVerificationStatus: verificationStatuses.fastAccessVerificationStatus,
    accountCompletenessStatus: resolveAccountCompletenessStatus(input.authType, input.userData),
    lastValidatedAt: nowIso,
    tokenIssuedAtSec: Number(input.decodedToken.iat || 0),
    tokenAuthTimeSec: resolveTokenAuthTimeSec(input.decodedToken),
  };
}

const registry = new RedisBackedStoreRegistry({
  area: 'auth-session',
  redisUrl: AUTH_SESSION_REDIS_URL,
  allowMemoryFallback: AUTH_SESSION_MEMORY_FALLBACK_ENABLED,
  fallbackReason: 'Redis is optional for local auth-session development but required for durable production isolation.',
});

export class AuthSessionService {
  /**
   * Hard session expiry is anchored to Firebase `auth_time`, not to silent ID
   * token refreshes. Reloads and background refreshes must not extend a session
   * beyond the 3-hour maximum lifetime.
   */
  private async ensureMaximumLifetimeNotExceeded(
    input: AuthSessionBootstrapInput,
    phase: 'bootstrap' | 'validate'
  ): Promise<void> {
    const remainingLifetimeSec = resolveRemainingSessionLifetimeSec(input.decodedToken);
    if (remainingLifetimeSec > 0) {
      return;
    }

    const expiredSession = await this.invalidateCurrentSession(
      input.authType,
      input.decodedToken.uid,
      'session_max_lifetime_exceeded'
    );

    logDiagnostic('warn', 'auth.session.max_lifetime_exceeded', {
      area: 'auth',
      userId: input.decodedToken.uid,
      stage: phase,
      status: 'expired',
      details: {
        authType: input.authType,
        authTimeSec: resolveTokenAuthTimeSec(input.decodedToken),
        maxLifetimeSec: AUTH_SESSION_MAX_LIFETIME_SEC,
      },
    });

    throw new AuthSessionError(
      'Session expired. Please sign in again.',
      401,
      'SESSION_MAX_LIFETIME_EXCEEDED',
      expiredSession
    );
  }

  private async invalidateSiblingSessions(
    authType: PlatformAuthType,
    uid: string,
    reason: string
  ): Promise<void> {
    const adapter = await registry.getAdapter();
    const nowIso = new Date().toISOString();
    const nowSec = Math.floor(Date.now() / 1000);
    const siblingAuthTypes = (['normal', 'fast_access', 'admin'] as PlatformAuthType[]).filter(
      (candidate) => candidate !== authType
    );

    for (const siblingAuthType of siblingAuthTypes) {
      const siblingKeys = buildAuthSessionKeySet(siblingAuthType, uid);

      await setRedisJson(
        adapter,
        siblingKeys.invalidation,
        {
          invalidatedAt: nowIso,
          invalidatedAtSec: nowSec,
          logoutReason: reason,
        } satisfies AuthSessionInvalidationRecord,
        AUTH_SESSION_INVALIDATION_TTL_SEC
      );

      const currentSiblingSession = await getRedisJson<AuthSessionSnapshot>(adapter, siblingKeys.current);
      if (!currentSiblingSession) {
        continue;
      }

      const invalidatedSiblingSession: AuthSessionSnapshot = {
        ...currentSiblingSession,
        sessionState: 'invalid',
        logoutReason: reason,
        restoreFailureReason: 'session_replaced_by_different_auth_mode',
        reEntryStatus: 'mode_switched',
        cacheHydrationStatus: 'cleared',
        refreshedAt: nowIso,
        lastValidatedAt: nowIso,
      };

      if (siblingKeys.session) {
        await setRedisJson(
          adapter,
          siblingKeys.session,
          invalidatedSiblingSession,
          AUTH_SESSION_INVALIDATION_TTL_SEC
        );
      }

      await deleteRedisKey(adapter, siblingKeys.current);

      logDiagnostic('info', 'auth.session.sibling_invalidated', {
        area: 'auth',
        userId: uid,
        status: invalidatedSiblingSession.sessionState,
        details: {
          previousAuthType: siblingAuthType,
          nextAuthType: authType,
          reason,
        },
      });
    }
  }

  private async persistSession(session: AuthSessionSnapshot, ttlSec: number): Promise<void> {
    const adapter = await registry.getAdapter();
    const keys = buildAuthSessionKeySet(session.authType, session.uid, session.sessionId);

    await setRedisJson(adapter, keys.current, session, ttlSec);

    if (keys.session) {
      await setRedisJson(adapter, keys.session, session, ttlSec);
    }
  }

  private async readCurrentSession(authType: PlatformAuthType, uid: string): Promise<AuthSessionSnapshot | null> {
    const adapter = await registry.getAdapter();
    const keys = buildAuthSessionKeySet(authType, uid);
    return getRedisJson<AuthSessionSnapshot>(adapter, keys.current);
  }

  private async readInvalidationRecord(
    authType: PlatformAuthType,
    uid: string
  ): Promise<AuthSessionInvalidationRecord | null> {
    const adapter = await registry.getAdapter();
    const keys = buildAuthSessionKeySet(authType, uid);
    return getRedisJson<AuthSessionInvalidationRecord>(adapter, keys.invalidation);
  }

  private async persistInvalidationRecord(
    authType: PlatformAuthType,
    uid: string,
    logoutReason: string
  ): Promise<void> {
    const adapter = await registry.getAdapter();
    const keys = buildAuthSessionKeySet(authType, uid);
    const invalidationRecord: AuthSessionInvalidationRecord = {
      invalidatedAt: new Date().toISOString(),
      invalidatedAtSec: Math.floor(Date.now() / 1000),
      logoutReason,
    };

    await setRedisJson(adapter, keys.invalidation, invalidationRecord, AUTH_SESSION_INVALIDATION_TTL_SEC);
  }

  private isSessionExpired(session: AuthSessionSnapshot): boolean {
    const expiresAtMs = new Date(session.expiresAt).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
  }

  private async invalidateCurrentSession(
    authType: PlatformAuthType,
    uid: string,
    reason: string
  ): Promise<AuthSessionSnapshot | null> {
    const adapter = await registry.getAdapter();
    const current = await this.readCurrentSession(authType, uid);

    await this.persistInvalidationRecord(authType, uid, reason);

    if (!current) {
      return null;
    }

    const invalidated: AuthSessionSnapshot = {
      ...current,
      sessionState:
        reason === 'logout'
          ? 'logging_out'
          : reason.includes('expired')
            ? 'expired'
            : 'invalid',
      logoutReason: reason,
      refreshedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
    };

    const keys = buildAuthSessionKeySet(authType, uid, current.sessionId);
    if (keys.session) {
      await setRedisJson(adapter, keys.session, invalidated, AUTH_SESSION_INVALIDATION_TTL_SEC);
    }
    await deleteRedisKey(adapter, keys.current);
    return invalidated;
  }

  async bootstrapSession(input: AuthSessionBootstrapInput): Promise<AuthSessionSnapshot> {
    const traceId = createTraceId('auth-session');
    await this.ensureMaximumLifetimeNotExceeded(input, 'bootstrap');

    const ttlSec = resolveSessionTtlSec(input.authType, input.userData, input.decodedToken);
    const remainingLifetimeSec = resolveRemainingSessionLifetimeSec(input.decodedToken);
    const sessionFingerprint = resolveSessionFingerprint(input);
    const existing = await this.readCurrentSession(input.authType, input.decodedToken.uid);
    const rehydrationStatus = resolveRehydrationStatus(input.source);
    const reEntryStatus = resolveReEntryStatus({
      source: input.source,
      expectedAuthType: input.expectedAuthType,
      authType: input.authType,
      hadExistingSession: Boolean(existing),
    });

    await this.invalidateSiblingSessions(
      input.authType,
      input.decodedToken.uid,
      `session_replaced_by_${input.authType}`
    );

    const session: AuthSessionSnapshot =
      existing && existing.sessionFingerprint === sessionFingerprint && !this.isSessionExpired(existing)
        ? {
            ...existing,
            traceId,
            sessionSource: input.source,
            sessionState: 'authenticated' as const,
            refreshedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            lastValidatedAt: new Date().toISOString(),
            rehydrationStatus,
            reEntryStatus,
            cacheHydrationStatus: existing.cacheHydrationStatus || 'hydrated',
            modeMismatch: Boolean(input.expectedAuthType && input.expectedAuthType !== input.authType),
            restoreFailureReason: null,
            logoutReason: null,
            adminVerificationStatus: resolveVerificationStatuses(
              input.authType,
              input.userData,
              Boolean(input.expectedAuthType && input.expectedAuthType !== input.authType)
            ).adminVerificationStatus,
            fastAccessVerificationStatus: resolveVerificationStatuses(
              input.authType,
              input.userData,
              Boolean(input.expectedAuthType && input.expectedAuthType !== input.authType)
            ).fastAccessVerificationStatus,
            accountCompletenessStatus: resolveAccountCompletenessStatus(input.authType, input.userData),
          }
        : createBaseSnapshot({
            ...input,
            traceId,
            sessionId: existing?.sessionId && existing.sessionFingerprint === sessionFingerprint
              ? existing.sessionId
              : createTraceId(`sess-${input.authType}`),
            sessionFingerprint,
            ttlSec,
            rehydrationStatus,
            reEntryStatus,
            cacheHydrationStatus: existing ? 'hydrated' : 'cleared',
          });

    const persistedSession: AuthSessionSnapshot = {
      ...session,
      expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(),
    };

    await this.persistSession(persistedSession, ttlSec);

    logDiagnostic('info', 'auth.session.bootstrap', {
      area: 'auth',
      userId: persistedSession.uid,
      status: persistedSession.sessionState,
      details: {
        authType: persistedSession.authType,
        modeMismatch: persistedSession.modeMismatch,
        sessionSource: persistedSession.sessionSource,
        cacheNamespace: persistedSession.cacheNamespace,
        ttlSec,
        remainingLifetimeSec,
        expiresAt: persistedSession.expiresAt,
      },
    });

    return persistedSession;
  }

  async refreshSession(input: AuthSessionBootstrapInput): Promise<AuthSessionSnapshot> {
    return this.bootstrapSession({
      ...input,
      source: 'refresh',
    });
  }

  async validateSession(input: AuthSessionValidationInput): Promise<AuthSessionValidationResult> {
    try {
      await this.ensureMaximumLifetimeNotExceeded(input, 'validate');
    } catch (error) {
      if (error instanceof AuthSessionError) {
        return {
          ok: false,
          statusCode: error.statusCode,
          error: error.message,
          code: error.code,
          session: error.session,
        };
      }

      throw error;
    }

    const invalidation = await this.readInvalidationRecord(input.authType, input.decodedToken.uid);
    const tokenIssuedAtSec = Number(input.decodedToken.iat || 0);

    if (invalidation && tokenIssuedAtSec <= invalidation.invalidatedAtSec) {
      const session = await this.invalidateCurrentSession(
        input.authType,
        input.decodedToken.uid,
        invalidation.logoutReason || 'stale_session_invalidated'
      );

      return {
        ok: false,
        statusCode: 401,
        error: 'Session is no longer active. Please sign in again.',
        code: 'SESSION_INVALIDATED',
        session,
      };
    }

    const current = await this.readCurrentSession(input.authType, input.decodedToken.uid);
    if (!current) {
      if (!input.autoRecover) {
        return {
          ok: false,
          statusCode: 401,
          error: 'Session could not be restored. Please sign in again.',
          code: 'SESSION_MISSING',
        };
      }

      return {
        ok: true,
        session: await this.bootstrapSession({
          ...input,
          source: 'middleware_auto_recover',
        }),
      };
    }

    if (this.isSessionExpired(current)) {
      const session = await this.invalidateCurrentSession(
        input.authType,
        input.decodedToken.uid,
        'session_expired'
      );

      return {
        ok: false,
        statusCode: 401,
        error: 'Session expired. Please sign in again.',
        code: 'SESSION_EXPIRED',
        session,
      };
    }

    if (current.modeMismatch) {
      return {
        ok: false,
        statusCode: 403,
        error: 'Authentication mode mismatch detected.',
        code: 'AUTH_MODE_MISMATCH',
        session: current,
      };
    }

    const lastActivityAtMs = new Date(current.lastActivityAt).getTime();
    const shouldTouchActivity =
      !Number.isFinite(lastActivityAtMs) ||
      Date.now() - lastActivityAtMs >= ACTIVITY_TOUCH_INTERVAL_MS;

    if (shouldTouchActivity) {
      const ttlSec = resolveSessionTtlSec(input.authType, input.userData, input.decodedToken);
      const touched: AuthSessionSnapshot = {
        ...current,
        lastActivityAt: new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
        refreshedAt:
          input.source === 'refresh'
            ? new Date().toISOString()
            : current.refreshedAt,
      };
      await this.persistSession(touched, ttlSec);
      return {
        ok: true,
        session: touched,
      };
    }

    return {
      ok: true,
      session: {
        ...current,
        lastValidatedAt: new Date().toISOString(),
      },
    };
  }

  async logoutSession(input: AuthSessionBootstrapInput & { reason: string }): Promise<AuthSessionSnapshot | null> {
    const invalidated = await this.invalidateCurrentSession(
      input.authType,
      input.decodedToken.uid,
      input.reason
    );

    logDiagnostic('info', 'auth.session.logout', {
      area: 'auth',
      userId: input.decodedToken.uid,
      status: invalidated?.sessionState || 'logging_out',
      details: {
        authType: input.authType,
        reason: input.reason,
      },
    });

    return invalidated;
  }
}

export function resolvePlatformAuthType(params: {
  decodedToken: Record<string, unknown>;
  userData: Record<string, unknown>;
  isAdmin: boolean;
}): PlatformAuthType {
  const accountScope = normalizeOptionalString(params.userData.accountScope) || normalizeOptionalString(params.decodedToken.accountScope);
  const temporaryAccessType =
    normalizeOptionalString(params.userData.temporaryAccessType) ||
    normalizeOptionalString(params.decodedToken.temporaryAccessType);
  const isTemporaryAccess =
    params.userData.isTemporaryAccess === true ||
    params.decodedToken.isTemporaryAccess === true ||
    accountScope === 'faculty_science_fast_access' ||
    temporaryAccessType === 'FacultyOfScienceFastAccess';

  if (isTemporaryAccess) {
    return 'fast_access';
  }

  if (params.isAdmin) {
    return 'admin';
  }

  return 'normal';
}

export const authSessionService = new AuthSessionService();
