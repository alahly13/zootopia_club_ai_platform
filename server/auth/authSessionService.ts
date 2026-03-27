import crypto from 'crypto';
import {
  buildRedisNamespacedKey,
  REDIS_NAMESPACE_PREFIXES,
} from '../cache/namespaces.js';
import {
  deleteKey,
  getJson,
  getSharedRedisAdapter,
  setJson,
  SharedRedisAdapter,
} from '../cache/sharedRedis.js';
import { logDiagnostic, normalizeError } from '../diagnostics.js';
import {
  AUTH_SESSION_INVALIDATION_TTL_SEC,
  AUTH_SESSION_TOUCH_WINDOW_MS,
  AuthSessionDocumentContext,
  AuthSessionLoginMethod,
  AuthSessionMode,
  AuthSessionRecord,
  AuthSessionSource,
  ParsedAuthSessionCookie,
  resolveAuthSessionTtlSec,
} from './sessionTypes.js';

type AuthSessionValidationSuccess = {
  ok: true;
  record: AuthSessionRecord;
};

type AuthSessionValidationFailure = {
  ok: false;
  code: string;
  httpStatus: number;
  message: string;
};

export type AuthSessionValidationResult =
  | AuthSessionValidationSuccess
  | AuthSessionValidationFailure;

type AuthSessionAdapterResolver = () => Promise<SharedRedisAdapter>;

export class AuthSessionService {
  constructor(
    private readonly resolveAdapter: AuthSessionAdapterResolver = getSharedRedisAdapter
  ) {}

  private buildSessionKey(mode: AuthSessionMode, sessionId: string): string {
    return buildRedisNamespacedKey(
      REDIS_NAMESPACE_PREFIXES.auth,
      'sessions',
      mode,
      sessionId
    );
  }

  private buildInvalidationKey(mode: AuthSessionMode, sessionId: string): string {
    return buildRedisNamespacedKey(
      REDIS_NAMESPACE_PREFIXES.auth,
      'invalidations',
      mode,
      sessionId
    );
  }

  private async persistSession(
    adapter: SharedRedisAdapter,
    record: AuthSessionRecord
  ): Promise<void> {
    const ttlSec = resolveAuthSessionTtlSec({
      mode: record.mode,
      temporaryAccessExpiresAt: record.temporaryAccessExpiresAt,
    });

    await setJson(adapter, this.buildSessionKey(record.mode, record.sessionId), record, ttlSec);
  }

  private toIsoExpiry(params: {
    mode: AuthSessionMode;
    temporaryAccessExpiresAt?: string | null;
  }): string {
    const ttlSec = resolveAuthSessionTtlSec(params);
    return new Date(Date.now() + ttlSec * 1000).toISOString();
  }

  private shouldTouchSession(record: AuthSessionRecord): boolean {
    const lastActivityMs = new Date(record.lastActivityAt).getTime();
    if (!Number.isFinite(lastActivityMs)) {
      return true;
    }

    return Date.now() - lastActivityMs >= AUTH_SESSION_TOUCH_WINDOW_MS;
  }

  private async readSession(
    adapter: SharedRedisAdapter,
    cookie: ParsedAuthSessionCookie | null
  ): Promise<AuthSessionRecord | null> {
    if (!cookie) {
      return null;
    }

    return getJson<AuthSessionRecord>(
      adapter,
      this.buildSessionKey(cookie.mode, cookie.sessionId)
    );
  }

  private async invalidateSession(
    adapter: SharedRedisAdapter,
    cookie: ParsedAuthSessionCookie | null,
    reason: string
  ): Promise<void> {
    if (!cookie) {
      return;
    }

    await setJson(
      adapter,
      this.buildInvalidationKey(cookie.mode, cookie.sessionId),
      {
        sessionId: cookie.sessionId,
        mode: cookie.mode,
        invalidatedAt: new Date().toISOString(),
        reason,
      },
      AUTH_SESSION_INVALIDATION_TTL_SEC
    );
    await deleteKey(adapter, this.buildSessionKey(cookie.mode, cookie.sessionId));
  }

  async bootstrapSession(input: {
    uid: string;
    mode: AuthSessionMode;
    role: 'Admin' | 'User';
    adminLevel?: string | null;
    accountScope?: string | null;
    isTemporaryAccess: boolean;
    sessionSource: AuthSessionSource;
    loginMethod: AuthSessionLoginMethod;
    email?: string | null;
    authProviders?: string[];
    temporaryAccessExpiresAt?: string | null;
    profileCompletionStage?: string | null;
    previousCookie?: ParsedAuthSessionCookie | null;
  }): Promise<AuthSessionRecord> {
    const adapter = await this.resolveAdapter();

    if (input.previousCookie) {
      await this.invalidateSession(
        adapter,
        input.previousCookie,
        `session_replaced_by_${input.mode}`
      );
    }

    const nowIso = new Date().toISOString();
    const record: AuthSessionRecord = {
      sessionId: crypto.randomUUID(),
      uid: input.uid,
      mode: input.mode,
      role: input.role,
      adminLevel: input.adminLevel || null,
      accountScope: input.accountScope || null,
      isTemporaryAccess: input.isTemporaryAccess,
      status: 'authenticated',
      sessionSource: input.sessionSource,
      loginMethod: input.loginMethod,
      issuedAt: nowIso,
      refreshedAt: nowIso,
      expiresAt: this.toIsoExpiry({
        mode: input.mode,
        temporaryAccessExpiresAt: input.temporaryAccessExpiresAt,
      }),
      lastActivityAt: nowIso,
      lastRoute: null,
      email: input.email || null,
      authProviders: input.authProviders || [],
      temporaryAccessExpiresAt: input.temporaryAccessExpiresAt || null,
      profileCompletionStage: input.profileCompletionStage || null,
      documentContext: null,
      restoreFailureReason: null,
      logoutReason: null,
    };

    await this.persistSession(adapter, record);

    logDiagnostic('info', 'auth.session.bootstrap_success', {
      area: 'auth',
      userId: input.uid,
      stage: 'bootstrap',
      status: 'success',
      details: {
        mode: input.mode,
        sessionId: record.sessionId,
        sessionSource: input.sessionSource,
        loginMethod: input.loginMethod,
        namespace: this.buildSessionKey(record.mode, record.sessionId),
      },
    });

    return record;
  }

  async refreshSession(input: {
    cookie: ParsedAuthSessionCookie | null;
    uid: string;
    role: 'Admin' | 'User';
    adminLevel?: string | null;
    accountScope?: string | null;
    isTemporaryAccess: boolean;
    route?: string;
    temporaryAccessExpiresAt?: string | null;
    profileCompletionStage?: string | null;
  }): Promise<AuthSessionValidationResult> {
    const adapter = await this.resolveAdapter();
    const current = await this.readSession(adapter, input.cookie);

    if (!input.cookie || !current) {
      return {
        ok: false,
        code: 'AUTH_SESSION_MISSING',
        httpStatus: 401,
        message: 'Session refresh could not find an active auth session.',
      };
    }

    const validation = await this.validateSession({
      cookie: input.cookie,
      uid: input.uid,
      role: input.role,
      adminLevel: input.adminLevel,
      accountScope: input.accountScope,
      isTemporaryAccess: input.isTemporaryAccess,
      allowedModes: [input.cookie.mode],
      route: input.route,
    });

    if (!validation.ok) {
      return validation;
    }

    const next: AuthSessionRecord = {
      ...validation.record,
      adminLevel: input.adminLevel || validation.record.adminLevel || null,
      accountScope: input.accountScope || validation.record.accountScope || null,
      status: 'authenticated',
      sessionSource: 'refresh',
      refreshedAt: new Date().toISOString(),
      expiresAt: this.toIsoExpiry({
        mode: validation.record.mode,
        temporaryAccessExpiresAt:
          input.temporaryAccessExpiresAt || validation.record.temporaryAccessExpiresAt,
      }),
      lastActivityAt: new Date().toISOString(),
      lastRoute: input.route || validation.record.lastRoute || null,
      temporaryAccessExpiresAt:
        input.temporaryAccessExpiresAt || validation.record.temporaryAccessExpiresAt || null,
      profileCompletionStage:
        input.profileCompletionStage || validation.record.profileCompletionStage || null,
      restoreFailureReason: null,
      logoutReason: null,
    };

    await this.persistSession(adapter, next);

    logDiagnostic('info', 'auth.session.refresh_success', {
      area: 'auth',
      userId: input.uid,
      stage: 'refresh',
      status: 'success',
      details: {
        mode: next.mode,
        sessionId: next.sessionId,
      },
    });

    return {
      ok: true,
      record: next,
    };
  }

  async validateSession(input: {
    cookie: ParsedAuthSessionCookie | null;
    uid: string;
    role: 'Admin' | 'User';
    adminLevel?: string | null;
    accountScope?: string | null;
    isTemporaryAccess: boolean;
    allowedModes: AuthSessionMode[];
    route?: string;
  }): Promise<AuthSessionValidationResult> {
    const adapter = await this.resolveAdapter();

    if (!input.cookie) {
      return {
        ok: false,
        code: 'AUTH_SESSION_MISSING',
        httpStatus: 401,
        message: 'Authenticated session is missing.',
      };
    }

    const current = await this.readSession(adapter, input.cookie);
    if (!current) {
      return {
        ok: false,
        code: 'AUTH_SESSION_EXPIRED',
        httpStatus: 401,
        message: 'Authenticated session expired or was not found.',
      };
    }

    if (current.uid !== input.uid) {
      await this.invalidateSession(adapter, input.cookie, 'uid_mismatch');
      return {
        ok: false,
        code: 'AUTH_SESSION_UID_MISMATCH',
        httpStatus: 401,
        message: 'Authenticated session does not match the active identity.',
      };
    }

    if (!input.allowedModes.includes(current.mode)) {
      await this.invalidateSession(adapter, input.cookie, 'mode_mismatch');
      return {
        ok: false,
        code: 'AUTH_MODE_MISMATCH',
        httpStatus: 409,
        message: 'Authenticated session mode is not allowed for this route.',
      };
    }

    if (current.mode === 'admin' && input.role !== 'Admin') {
      await this.invalidateSession(adapter, input.cookie, 'admin_identity_missing');
      return {
        ok: false,
        code: 'AUTH_ADMIN_SESSION_INVALID',
        httpStatus: 403,
        message: 'Admin session is no longer valid for this identity.',
      };
    }

    if (current.mode === 'fast_access' && !input.isTemporaryAccess) {
      await this.invalidateSession(adapter, input.cookie, 'temporary_access_removed');
      return {
        ok: false,
        code: 'AUTH_FAST_ACCESS_SESSION_INVALID',
        httpStatus: 409,
        message: 'Fast-access session is no longer valid for this account.',
      };
    }

    if (current.mode === 'normal' && input.isTemporaryAccess) {
      await this.invalidateSession(adapter, input.cookie, 'normal_session_on_temporary_account');
      return {
        ok: false,
        code: 'AUTH_NORMAL_SESSION_INVALID',
        httpStatus: 409,
        message: 'Normal-account session is not valid for a temporary account.',
      };
    }

    if (!this.shouldTouchSession(current) && !input.route) {
      return {
        ok: true,
        record: current,
      };
    }

    const next: AuthSessionRecord = {
      ...current,
      adminLevel: input.adminLevel || current.adminLevel || null,
      accountScope: input.accountScope || current.accountScope || null,
      refreshedAt: new Date().toISOString(),
      expiresAt: this.toIsoExpiry({
        mode: current.mode,
        temporaryAccessExpiresAt: current.temporaryAccessExpiresAt,
      }),
      lastActivityAt: new Date().toISOString(),
      lastRoute: input.route || current.lastRoute || null,
      logoutReason: null,
      restoreFailureReason: null,
    };

    await this.persistSession(adapter, next);

    return {
      ok: true,
      record: next,
    };
  }

  async getCurrentSession(input: {
    cookie: ParsedAuthSessionCookie | null;
    uid: string;
    role: 'Admin' | 'User';
    adminLevel?: string | null;
    accountScope?: string | null;
    isTemporaryAccess: boolean;
  }): Promise<AuthSessionValidationResult> {
    return this.validateSession({
      cookie: input.cookie,
      uid: input.uid,
      role: input.role,
      adminLevel: input.adminLevel,
      accountScope: input.accountScope,
      isTemporaryAccess: input.isTemporaryAccess,
      allowedModes:
        input.role === 'Admin'
          ? ['normal', 'admin']
          : input.isTemporaryAccess
            ? ['fast_access']
            : ['normal'],
    });
  }

  async logoutSession(input: {
    cookie: ParsedAuthSessionCookie | null;
    reason: string;
    userId?: string | null;
  }): Promise<void> {
    const adapter = await this.resolveAdapter();

    if (!input.cookie) {
      return;
    }

    const current = await this.readSession(adapter, input.cookie);
    if (current) {
      await setJson(
        adapter,
        this.buildInvalidationKey(current.mode, current.sessionId),
        {
          sessionId: current.sessionId,
          mode: current.mode,
          uid: current.uid,
          invalidatedAt: new Date().toISOString(),
          reason: input.reason,
        },
        AUTH_SESSION_INVALIDATION_TTL_SEC
      );
    }

    await deleteKey(adapter, this.buildSessionKey(input.cookie.mode, input.cookie.sessionId));

    logDiagnostic('info', 'auth.session.logout_success', {
      area: 'auth',
      userId: input.userId || current?.uid || undefined,
      stage: 'logout',
      status: 'success',
      details: {
        mode: input.cookie.mode,
        sessionId: input.cookie.sessionId,
        reason: input.reason,
      },
    });
  }

  async recordDocumentContext(
    session: AuthSessionRecord,
    documentContext: AuthSessionDocumentContext
  ): Promise<AuthSessionRecord> {
    const adapter = await this.resolveAdapter();
    const next: AuthSessionRecord = {
      ...session,
      documentContext,
      refreshedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      expiresAt: this.toIsoExpiry({
        mode: session.mode,
        temporaryAccessExpiresAt: session.temporaryAccessExpiresAt,
      }),
    };

    await this.persistSession(adapter, next);
    return next;
  }

  async clearDocumentContextIfMatches(
    session: AuthSessionRecord,
    documentId: string
  ): Promise<AuthSessionRecord> {
    if (session.documentContext?.documentId !== documentId) {
      return session;
    }

    return this.recordDocumentContext(session, {
      documentId: null,
      artifactId: null,
      workspaceScope: null,
      ownerRole: null,
      processingPathway: null,
    });
  }

  toClientSnapshot(record: AuthSessionRecord) {
    return {
      sessionId: record.sessionId,
      uid: record.uid,
      mode: record.mode,
      role: record.role,
      adminLevel: record.adminLevel || null,
      accountScope: record.accountScope || null,
      isTemporaryAccess: record.isTemporaryAccess,
      status: record.status,
      sessionSource: record.sessionSource,
      loginMethod: record.loginMethod,
      issuedAt: record.issuedAt,
      refreshedAt: record.refreshedAt,
      expiresAt: record.expiresAt,
      lastActivityAt: record.lastActivityAt,
      lastRoute: record.lastRoute || null,
      temporaryAccessExpiresAt: record.temporaryAccessExpiresAt || null,
      profileCompletionStage: record.profileCompletionStage || null,
      documentContext: record.documentContext || null,
      restoreFailureReason: record.restoreFailureReason || null,
      logoutReason: record.logoutReason || null,
    };
  }

  logSessionFailure(event: string, error: unknown, context: Record<string, unknown>): void {
    logDiagnostic('error', event, {
      area: 'auth',
      status: 'failed',
      details: {
        ...context,
        ...normalizeError(error),
      },
    });
  }
}
