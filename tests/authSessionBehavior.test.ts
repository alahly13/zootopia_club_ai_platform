import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthSessionService,
  type AuthSessionInvalidationRecord,
  type AuthSessionPersistence,
  type AuthSessionSnapshot,
  type PlatformAuthType,
} from '../server/authSessionService.ts';

class MemoryAuthSessionPersistence implements AuthSessionPersistence {
  private readonly currentSessions = new Map<string, AuthSessionSnapshot>();
  private readonly invalidations = new Map<string, AuthSessionInvalidationRecord>();
  private readonly history = new Map<string, AuthSessionSnapshot>();

  private buildKey(authType: PlatformAuthType, uid: string): string {
    return `${authType}:${uid}`;
  }

  async persistSession(session: AuthSessionSnapshot, _ttlSec: number): Promise<void> {
    this.currentSessions.set(this.buildKey(session.authType, session.uid), session);
    this.history.set(`${session.authType}:${session.uid}:${session.sessionId}`, session);
  }

  async persistHistoricalSession(session: AuthSessionSnapshot, _ttlSec: number): Promise<void> {
    this.history.set(`${session.authType}:${session.uid}:${session.sessionId}`, session);
  }

  async readCurrentSession(authType: PlatformAuthType, uid: string): Promise<AuthSessionSnapshot | null> {
    return this.currentSessions.get(this.buildKey(authType, uid)) || null;
  }

  async deleteCurrentSession(authType: PlatformAuthType, uid: string): Promise<void> {
    this.currentSessions.delete(this.buildKey(authType, uid));
  }

  async readInvalidationRecord(
    authType: PlatformAuthType,
    uid: string
  ): Promise<AuthSessionInvalidationRecord | null> {
    return this.invalidations.get(this.buildKey(authType, uid)) || null;
  }

  async persistInvalidationRecord(
    authType: PlatformAuthType,
    uid: string,
    logoutReason: string,
    ttlSec: number
  ): Promise<AuthSessionInvalidationRecord> {
    const invalidatedAt = new Date().toISOString();
    const record: AuthSessionInvalidationRecord = {
      invalidatedAt,
      invalidatedAtSec: Math.floor(Date.now() / 1000),
      logoutReason,
    };

    this.invalidations.set(this.buildKey(authType, uid), record);
    return record;
  }
}

function createBootstrapInput(overrides: Partial<Record<string, unknown>> = {}) {
  const authTimeSec = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);

  return {
    decodedToken: {
      uid: 'user-1',
      email: 'user@example.com',
      auth_time: authTimeSec,
      iat: authTimeSec,
      firebase: {
        sign_in_provider: 'password',
      },
    },
    userData: {
      name: 'User One',
      email: 'user@example.com',
      username: 'userone',
      accountScope: 'full_account',
      authProviders: ['password'],
    },
    role: 'User' as const,
    adminLevel: null,
    authType: 'normal' as const,
    expectedAuthType: 'normal' as const,
    source: 'restore' as const,
    ...overrides,
  };
}

test('validateSession accepts a Firestore-backed current session for the same auth lane', async () => {
  const persistence = new MemoryAuthSessionPersistence();
  const service = new AuthSessionService(persistence);

  const session = await service.bootstrapSession(createBootstrapInput({ source: 'login' }) as any);
  const validation = await service.validateSession(
    createBootstrapInput({ source: 'restore', autoRecover: false }) as any
  );

  assert.equal(session.authType, 'normal');
  assert.equal(session.sessionState, 'authenticated');
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.equal(validation.session.uid, 'user-1');
    assert.equal(validation.session.authType, 'normal');
  }
});

test('bootstrapping a different auth lane invalidates the sibling session', async () => {
  const persistence = new MemoryAuthSessionPersistence();
  const service = new AuthSessionService(persistence);

  await service.bootstrapSession(createBootstrapInput({ source: 'login' }) as any);
  await service.bootstrapSession(
    createBootstrapInput({
      role: 'Admin',
      adminLevel: 'primary',
      authType: 'admin',
      expectedAuthType: 'admin',
      source: 'login',
      userData: {
        name: 'Admin User',
        email: 'admin@example.com',
        username: 'adminuser',
        role: 'Admin',
        accountScope: 'full_account',
        authProviders: ['password'],
      },
    }) as any
  );

  const validation = await service.validateSession(
    createBootstrapInput({ source: 'restore', autoRecover: false }) as any
  );

  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.code, 'SESSION_INVALIDATED');
  }
});

test('logout invalidates the current session and preserves the logging_out lifecycle state', async () => {
  const persistence = new MemoryAuthSessionPersistence();
  const service = new AuthSessionService(persistence);

  await service.bootstrapSession(createBootstrapInput({ source: 'login' }) as any);
  const invalidated = await service.logoutSession(
    createBootstrapInput({ source: 'logout' as const, reason: 'logout' }) as any
  );
  const validation = await service.validateSession(
    createBootstrapInput({ source: 'restore', autoRecover: false }) as any
  );

  assert.equal(invalidated?.sessionState, 'logging_out');
  assert.equal(validation.ok, false);
  if (!validation.ok) {
    assert.equal(validation.code, 'SESSION_INVALIDATED');
  }
});
