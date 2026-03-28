import test from 'node:test';
import assert from 'node:assert/strict';
import type admin from 'firebase-admin';
import {
  buildAdminDirectoryUserRecord,
  resolveAdminLoginIdentity,
} from '../server/adminAccountDirectoryService.ts';

function buildProviderInfo(overrides: Partial<admin.auth.UserInfo> = {}): admin.auth.UserInfo {
  return {
    providerId: 'password',
    uid: 'provider-user',
    email: 'linked@example.com',
    displayName: 'Linked User',
    phoneNumber: '',
    photoURL: '',
    toJSON: () => ({}),
    ...overrides,
  } as admin.auth.UserInfo;
}

function buildAuthUser(overrides: Partial<admin.auth.UserRecord> = {}): admin.auth.UserRecord {
  return {
    uid: 'auth-user-1',
    email: 'linked@example.com',
    emailVerified: true,
    disabled: false,
    displayName: 'Linked User',
    phoneNumber: '',
    photoURL: '',
    providerData: [
      buildProviderInfo({
        providerId: 'google.com',
        uid: 'google-linked-user',
        email: 'linked@example.com',
        displayName: 'Linked User',
        phoneNumber: '',
        photoURL: '',
      }),
      buildProviderInfo({
        providerId: 'password',
        uid: 'linked@example.com',
        email: 'linked@example.com',
        displayName: 'Linked User',
        phoneNumber: '',
        photoURL: '',
      }),
    ],
    customClaims: {
      role: 'Admin',
      adminLevel: 'secondary',
    },
    metadata: {
      creationTime: '2026-03-01T00:00:00.000Z',
      lastSignInTime: '2026-03-24T10:00:00.000Z',
      lastRefreshTime: undefined,
      toJSON: () => ({}),
    },
    ...overrides,
  } as admin.auth.UserRecord;
}

test('linked auth + firestore accounts expose merged provider and sync metadata', () => {
  const record = buildAdminDirectoryUserRecord({
    uid: 'linked-user',
    authUser: buildAuthUser({ uid: 'linked-user' }),
    firestoreUser: {
      name: 'Linked User',
      email: 'linked@example.com',
      username: 'linked-user',
      role: 'Admin',
      status: 'Active',
      permissions: { uploadFiles: true },
      limits: { aiRequestsPerDay: 10, quizGenerationsPerDay: 5, uploadsPerDay: 5 },
      usage: { aiRequestsToday: 1, quizGenerationsToday: 0, uploadsToday: 0, lastResetDate: '2026-03-24' },
      authProviders: ['google.com', 'password'],
      createdAt: '2026-03-01T00:00:00.000Z',
      lastLogin: '2026-03-24T10:00:00.000Z',
    },
  });

  assert.ok(record);
  assert.equal(record?.role, 'Admin');
  assert.deepEqual(record?.authProviders, ['google.com', 'password']);
  assert.equal(record?.accountLinkage.linkageStatus, 'linked');
  assert.equal(record?.accountLinkage.adminManagementMode, 'full');
  assert.equal(record?.accountLinkage.emailVerified, true);
  assert.equal(record?.accountLinkage.issues.length, 0);
});

test('auth-only accounts stay visible and become view-only until firestore linkage exists', () => {
  const record = buildAdminDirectoryUserRecord({
    uid: 'phone-user',
    authUser: buildAuthUser({
      uid: 'phone-user',
      email: undefined,
      displayName: '',
      phoneNumber: '+201234567890',
      providerData: [
        buildProviderInfo({
          providerId: 'phone',
          uid: '+201234567890',
          email: '',
          displayName: '',
          phoneNumber: '+201234567890',
          photoURL: '',
        }),
      ],
      customClaims: {},
    }),
  });

  assert.ok(record);
  assert.equal(record?.phoneNumber, '+201234567890');
  assert.equal(record?.accountLinkage.linkageStatus, 'auth_only');
  assert.equal(record?.accountLinkage.adminManagementMode, 'view_only');
  assert.ok(record?.accountLinkage.issues.includes('missing-firestore-profile'));
});

test('firestore-only orphan profiles stay detectable for admin repair visibility', () => {
  const record = buildAdminDirectoryUserRecord({
    uid: 'orphan-user',
    firestoreUser: {
      name: 'Orphan User',
      email: 'orphan@example.com',
      username: 'orphan-user',
      role: 'User',
      status: 'Active',
      authProviders: ['password'],
      createdAt: '2026-03-02T00:00:00.000Z',
      lastLogin: '2026-03-20T00:00:00.000Z',
    },
  });

  assert.ok(record);
  assert.equal(record?.accountLinkage.linkageStatus, 'firestore_only');
  assert.equal(record?.accountLinkage.isFirestoreOrphan, true);
  assert.equal(record?.accountLinkage.adminManagementMode, 'view_only');
  assert.ok(record?.accountLinkage.issues.includes('missing-auth-identity'));
});

test('temporary fast-access scope mismatches are surfaced and routed away from generic admin actions', () => {
  const record = buildAdminDirectoryUserRecord({
    uid: 'fast-access-user',
    authUser: buildAuthUser({
      uid: 'fast-access-user',
      customClaims: {},
      email: 'temp-fast@example.com',
      providerData: [
        buildProviderInfo({
          providerId: 'phone',
          uid: '+201111111111',
          email: '',
          displayName: 'Fast Access Student',
          phoneNumber: '+201111111111',
          photoURL: '',
        }),
      ],
    }),
    firestoreUser: {
      name: 'Fast Access Student',
      email: 'temp-fast@example.com',
      role: 'User',
      status: 'Active',
      accountScope: 'full_account',
      isTemporaryAccess: true,
      authProviders: ['phone'],
    },
    fastAccessProfile: {
      accountScope: 'faculty_science_fast_access',
      temporaryAccessType: 'FacultyOfScienceFastAccess',
    },
  });

  assert.ok(record);
  assert.equal(record?.accountScope, 'full_account');
  assert.equal(record?.accountLinkage.adminManagementMode, 'specialized_fast_access');
  assert.ok(record?.accountLinkage.issues.includes('fast-access-scope-mismatch'));
});

test('admin login identity resolves reserved username local-part to canonical admin email', async () => {
  const auth = {
    getUserByEmail: async (email: string) =>
      ({
        uid: 'admin-uid',
        email,
        disabled: false,
      }) as admin.auth.UserRecord,
  } as admin.auth.Auth;

  const db = {
    collection: (collectionName: string) => {
      assert.equal(collectionName, 'users');
      return {
        where: () => ({
          limit: () => ({
            get: async () => ({
              docs: [],
            }),
          }),
        }),
        doc: (uid: string) => {
          assert.equal(uid, 'admin-uid');
          return {
            get: async () => ({
              exists: true,
              data: () => ({
                username: 'elmahdy',
                status: 'Active',
              }),
            }),
          };
        },
      };
    },
  } as any;

  const resolution = await resolveAdminLoginIdentity({
    db,
    auth,
    usersCollection: 'users',
    identifier: 'elmahdy',
    authorizedAdminEmails: ['elmahdy@admin.com'],
  });

  assert.equal(resolution.ok, true);
  if (!resolution.ok) {
    throw new Error('Expected successful admin resolution.');
  }
  assert.equal(resolution.value.email, 'elmahdy@admin.com');
  assert.equal(resolution.value.identifierType, 'username');
  assert.equal(resolution.value.resolutionSource, 'email_local_part');
});

test('admin login identity rejects ambiguous reserved admin username matches', async () => {
  const auth = {} as admin.auth.Auth;
  const db = {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => ({
            docs: [],
          }),
        }),
      }),
    }),
  } as any;

  const resolution = await resolveAdminLoginIdentity({
    db,
    auth,
    usersCollection: 'users',
    identifier: 'admin',
    authorizedAdminEmails: ['admin@example.com', 'admin@another.com'],
  });

  assert.equal(resolution.ok, false);
  if (resolution.ok) {
    throw new Error('Expected ambiguous admin resolution failure.');
  }
  assert.equal(resolution.code, 'ADMIN_ACCOUNT_AMBIGUOUS');
  assert.equal(resolution.status, 409);
});

test('admin login identity rejects suspended admin accounts before password auth', async () => {
  const auth = {
    getUserByEmail: async (email: string) =>
      ({
        uid: 'suspended-admin',
        email,
        disabled: false,
      }) as admin.auth.UserRecord,
  } as admin.auth.Auth;

  const db = {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => ({
            docs: [
              {
                data: () => ({
                  email: 'admin@example.com',
                }),
              },
            ],
          }),
        }),
      }),
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({
            status: 'Suspended',
            username: 'admin-user',
          }),
        }),
      }),
    }),
  } as any;

  const resolution = await resolveAdminLoginIdentity({
    db,
    auth,
    usersCollection: 'users',
    identifier: 'admin-user',
    authorizedAdminEmails: ['admin@example.com'],
  });

  assert.equal(resolution.ok, false);
  if (resolution.ok) {
    throw new Error('Expected inactive admin resolution failure.');
  }
  assert.equal(resolution.code, 'ADMIN_ACCOUNT_INACTIVE');
  assert.equal(resolution.status, 403);
});
