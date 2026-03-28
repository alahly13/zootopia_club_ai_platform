import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasSessionExceededMaximumLifetime,
  resolveRemainingSessionLifetimeSec,
  resolveSessionFingerprint,
  resolveSessionTtlSec,
} from '../server/authSessionService.ts';

const NOW_MS = Date.parse('2026-03-27T12:00:00.000Z');

test('remaining auth lifetime is capped to the hard 3-hour maximum', () => {
  const authTimeSec = Math.floor((NOW_MS - 60 * 60 * 1000) / 1000);

  assert.equal(
    resolveRemainingSessionLifetimeSec({ auth_time: authTimeSec, iat: authTimeSec }, NOW_MS),
    7_200
  );
});

test('fast-access TTL respects the earlier temporary-access expiry window', () => {
  const nowMs = Date.now();
  const authTimeSec = Math.floor((nowMs - 10 * 60 * 1000) / 1000);

  const ttlSec = resolveSessionTtlSec(
    'fast_access',
    {
      temporaryAccessExpiresAt: new Date(nowMs + 30 * 60 * 1000).toISOString(),
    },
    { auth_time: authTimeSec, iat: authTimeSec }
  );

  assert.ok(ttlSec >= 1_799 && ttlSec <= 1_800);
});

test('session fingerprint stays stable across Firebase token refreshes within the same login', () => {
  const authTimeSec = Math.floor((NOW_MS - 15 * 60 * 1000) / 1000);
  const baseInput = {
    decodedToken: {
      uid: 'user-1',
      auth_time: authTimeSec,
      iat: authTimeSec,
      firebase: {
        sign_in_provider: 'password',
      },
    },
    userData: {
      accountScope: 'full_account',
    },
    role: 'User',
    adminLevel: null,
    authType: 'normal',
    expectedAuthType: 'normal',
    source: 'restore',
  } as const;

  const refreshedInput = {
    ...baseInput,
    decodedToken: {
      ...baseInput.decodedToken,
      iat: authTimeSec + 3_600,
    },
  } as const;

  assert.equal(
    resolveSessionFingerprint(baseInput as any),
    resolveSessionFingerprint(refreshedInput as any)
  );
});

test('hard maximum lifetime expiry is detected after three hours', () => {
  const authTimeSec = Math.floor((NOW_MS - (3 * 60 * 60 + 1) * 1000) / 1000);

  assert.equal(
    hasSessionExceededMaximumLifetime({ auth_time: authTimeSec, iat: authTimeSec }, NOW_MS),
    true
  );
});
