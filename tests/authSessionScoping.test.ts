import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthSessionScopeKey, resolveAuthSessionTypeFromUser } from '../src/auth/session/authMode.ts';
import { buildToolModelStorageKey } from '../src/ai/toolModelSelection.ts';
import type { User } from '../src/utils.ts';

const createUser = (overrides: Partial<User>): User => ({
  id: 'user-1',
  name: 'User One',
  email: 'user@example.com',
  username: 'userone',
  picture: null,
  role: 'User',
  plan: 'free',
  status: 'Active',
  firstLoginDate: new Date().toISOString(),
  lastLogin: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  authProviders: ['password'],
  permissions: {
    uploadFiles: true,
    generateQuestions: true,
    generateImages: true,
    generateVideos: true,
    generateInfographics: true,
    useChatbot: true,
    useLiveVoice: true,
    useStudyTools: true,
    exportFiles: true,
    viewAdvancedVisuals: false,
    accessPremiumTools: false,
  },
  limits: {
    aiRequestsPerDay: 10,
    quizGenerationsPerDay: 10,
    uploadsPerDay: 10,
  },
  usage: {
    aiRequestsToday: 0,
    quizGenerationsToday: 0,
    uploadsToday: 0,
    lastResetDate: new Date().toISOString().slice(0, 10),
  },
  settings: {
    theme: 'system',
    preferredModelId: '',
    language: 'English',
    quizDefaults: {
      questionCount: 10,
      difficulty: 'Intermediate',
      type: 'MCQ',
    },
    notifications: {
      email: true,
      browser: true,
      system: true,
    },
    exportFormat: 'PDF',
  },
  credits: 5,
  totalUploads: 0,
  totalAIRequests: 0,
  totalQuizzes: 0,
  isVerified: true,
  universityCode: '',
  department: '',
  academicYear: '',
  phoneNumber: '',
  dateOfBirth: '',
  gender: '',
  institution: '',
  country: '',
  nationality: '',
  ...overrides,
});

test('auth session scope keys stay isolated across normal, fast-access, and admin identities', () => {
  assert.equal(
    buildAuthSessionScopeKey({ authType: 'normal', uid: 'user-1', email: 'user@example.com' }),
    'normal:user-1'
  );
  assert.equal(
    buildAuthSessionScopeKey({ authType: 'fast_access', uid: 'user-1', email: 'user@example.com' }),
    'fast_access:user-1'
  );
  assert.equal(
    buildAuthSessionScopeKey({ authType: 'admin', uid: 'user-1', email: 'user@example.com' }),
    'admin:user-1'
  );
});

test('resolveAuthSessionTypeFromUser prefers fast-access and admin markers deterministically', () => {
  assert.equal(
    resolveAuthSessionTypeFromUser(
      createUser({
        isTemporaryAccess: true,
        accountScope: 'faculty_science_fast_access',
      })
    ),
    'fast_access'
  );

  assert.equal(
    resolveAuthSessionTypeFromUser(
      createUser({
        role: 'Admin',
        adminLevel: 'primary',
      })
    ),
    'admin'
  );

  assert.equal(resolveAuthSessionTypeFromUser(createUser({})), 'normal');
});

test('tool model persistence keys inherit the auth-session scope key', () => {
  assert.equal(
    buildToolModelStorageKey('normal:user-1', 'chat'),
    'zootopia_tool_model:normal:user-1:chat'
  );
  assert.notEqual(
    buildToolModelStorageKey('normal:user-1', 'chat'),
    buildToolModelStorageKey('admin:user-1', 'chat')
  );
});
