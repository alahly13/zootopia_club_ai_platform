import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

const FULL_ACCOUNT_SCOPE = 'full_account';
const FACULTY_FAST_ACCESS_SCOPE = 'faculty_science_fast_access';
const FACULTY_FAST_ACCESS_TYPE = 'FacultyOfScienceFastAccess';

const DEFAULT_USER_PERMISSIONS = {
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
};

const DEFAULT_USER_LIMITS = {
  aiRequestsPerDay: 10,
  quizGenerationsPerDay: 5,
  uploadsPerDay: 5,
};

const buildDefaultUsage = () => ({
  aiRequestsToday: 0,
  quizGenerationsToday: 0,
  uploadsToday: 0,
  lastResetDate: new Date().toISOString().split('T')[0],
});

const ALLOWED_USER_STATUSES = new Set([
  'Active',
  'Suspended',
  'Blocked',
  'PendingEmailVerification',
  'PendingAdminApproval',
  'Rejected',
]);

const ALLOWED_USER_ROLES = new Set(['Admin', 'User']);

export type AccountLinkageStatus = 'linked' | 'auth_only' | 'firestore_only' | 'inconsistent';
export type FirestoreProfileCompleteness = 'missing' | 'partial' | 'complete';
export type AdminManagementMode = 'full' | 'view_only' | 'specialized_fast_access';

export interface AdminAccountProviderDetail {
  providerId: string;
  uid?: string;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
}

export interface AdminAccountLinkage {
  authSource: 'firebase-auth' | 'firestore-only';
  authRecordExists: boolean;
  firestoreRecordExists: boolean;
  firestoreProfileCompleteness: FirestoreProfileCompleteness;
  linkageStatus: AccountLinkageStatus;
  adminManagementMode: AdminManagementMode;
  issues: string[];
  providerIds: string[];
  providerDetails: AdminAccountProviderDetail[];
  emailVerified: boolean;
  authDisabled: boolean;
  authCreationTime?: string;
  authLastSignInTime?: string;
  customClaims?: Record<string, unknown>;
  claimRole?: string;
  claimAdminLevel?: string;
  firestoreRole?: string;
  firestoreStatus?: string;
  firestoreDocumentPath?: string;
  hasTemporaryAccessProfile: boolean;
  temporaryAccessProfilePath?: string;
  isFirestoreOrphan: boolean;
}

export interface AdminDirectoryUserRecord {
  id: string;
  uid: string;
  name: string;
  email: string;
  username: string;
  usernameLower?: string;
  phoneNumber?: string;
  picture?: string;
  role: 'Admin' | 'User';
  adminLevel?: string;
  plan?: string;
  status: 'Active' | 'Suspended' | 'Blocked' | 'PendingEmailVerification' | 'PendingAdminApproval' | 'Rejected';
  firstLoginDate: string;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
  authProviders: string[];
  permissions: typeof DEFAULT_USER_PERMISSIONS;
  limits: typeof DEFAULT_USER_LIMITS;
  usage: ReturnType<typeof buildDefaultUsage>;
  settings?: Record<string, unknown>;
  adminSettings?: Record<string, unknown>;
  adminNotes?: string;
  credits: number;
  totalUploads: number;
  totalAIRequests: number;
  totalQuizzes: number;
  isVerified: boolean;
  unlockedPages?: string[];
  unlockedModels?: string[];
  unlockedProjects?: string[];
  isTemporaryAccess?: boolean;
  temporaryAccessType?: 'FacultyOfScienceFastAccess';
  temporaryAccessExpiresAt?: string;
  accountScope?: 'full_account' | 'faculty_science_fast_access';
  fastAccessCredits?: number;
  fastAccessCreditsUpdatedAt?: string;
  fastAccessMetadata?: Record<string, unknown>;
  statusMessage?: string;
  statusContext?: Record<string, unknown>;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  accountLinkage: AdminAccountLinkage;
}

export interface AdminAccountDirectorySummary {
  totalAccounts: number;
  linkedAccounts: number;
  authOnlyAccounts: number;
  firestoreOnlyAccounts: number;
  accountsWithIssues: number;
  adminAccounts: number;
  temporaryFastAccessAccounts: number;
  blockedOrDisabledAccounts: number;
  missingFirestoreProfiles: number;
  orphanFirestoreProfiles: number;
  archivedFastAccessDeletedCount: number;
}

export interface AdminAccountDirectoryResult {
  accounts: AdminDirectoryUserRecord[];
  summary: AdminAccountDirectorySummary;
}

export interface ListAdminAccountDirectoryOptions {
  db: Firestore;
  auth: admin.auth.Auth;
  usersCollection: string;
  fastAccessAccountsCollection: string;
  fastAccessDeletionAuditsCollection?: string;
  includeDeleted?: boolean;
}

interface NormalizeAccountRecordInput {
  uid: string;
  authUser?: admin.auth.UserRecord | null;
  firestoreUser?: Record<string, unknown> | null;
  fastAccessProfile?: Record<string, unknown> | null;
  includeDeleted?: boolean;
}

const normalizeString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  const normalized = normalizeString(value);
  return normalized || undefined;
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
};

const normalizeNonNegativeNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, numeric);
};

const sanitizeClaims = (claims: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!claims) return undefined;

  const safeEntries = Object.entries(claims).flatMap(([key, value]) => {
    if (value === null || value === undefined) {
      return [];
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return [[key, value] as const];
    }
    if (Array.isArray(value)) {
      const safeArray = value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item)).slice(0, 20);
      return [[key, safeArray] as const];
    }
    return [];
  });

  return safeEntries.length > 0 ? Object.fromEntries(safeEntries) : undefined;
};

const getProviderDetails = (authUser?: admin.auth.UserRecord | null): AdminAccountProviderDetail[] => {
  if (!authUser?.providerData?.length) return [];

  return authUser.providerData
    .map((provider) => ({
      providerId: normalizeString(provider.providerId),
      uid: normalizeOptionalString(provider.uid),
      email: normalizeOptionalString(provider.email),
      phoneNumber: normalizeOptionalString(provider.phoneNumber),
      displayName: normalizeOptionalString(provider.displayName),
    }))
    .filter((provider) => provider.providerId);
};

const getProviderIds = (authUser?: admin.auth.UserRecord | null, firestoreUser?: Record<string, unknown> | null): string[] => {
  const authProviders = getProviderDetails(authUser).map((provider) => provider.providerId);
  if (authProviders.length > 0) {
    return Array.from(new Set(authProviders));
  }

  return Array.from(new Set(normalizeStringArray(firestoreUser?.authProviders)));
};

const normalizeRole = (firestoreRole: unknown, claimRole: unknown): 'Admin' | 'User' => {
  const normalizedFirestoreRole = normalizeString(firestoreRole);
  const normalizedClaimRole = normalizeString(claimRole);

  if (normalizedFirestoreRole === 'Admin' || normalizedClaimRole === 'Admin') {
    return 'Admin';
  }

  return 'User';
};

const normalizeStatus = (firestoreStatus: unknown, authDisabled: boolean): AdminDirectoryUserRecord['status'] => {
  const normalizedStatus = normalizeString(firestoreStatus);
  if (ALLOWED_USER_STATUSES.has(normalizedStatus)) {
    return normalizedStatus as AdminDirectoryUserRecord['status'];
  }

  if (authDisabled) {
    return 'Blocked';
  }

  return 'Active';
};

const getProfileCompleteness = (firestoreUser?: Record<string, unknown> | null): FirestoreProfileCompleteness => {
  if (!firestoreUser) return 'missing';

  const requiredFields = [
    normalizeString(firestoreUser.name || firestoreUser.displayName),
    normalizeString(firestoreUser.email),
    normalizeString(firestoreUser.role),
    normalizeString(firestoreUser.status),
  ];

  const hasPermissions = typeof firestoreUser.permissions === 'object' && firestoreUser.permissions !== null;
  const hasLimits = typeof firestoreUser.limits === 'object' && firestoreUser.limits !== null;
  const hasUsage = typeof firestoreUser.usage === 'object' && firestoreUser.usage !== null;

  const presentCount =
    requiredFields.filter(Boolean).length +
    Number(hasPermissions) +
    Number(hasLimits) +
    Number(hasUsage);

  if (presentCount >= 7) return 'complete';
  return 'partial';
};

const buildIssues = (params: {
  authUser?: admin.auth.UserRecord | null;
  firestoreUser?: Record<string, unknown> | null;
  fastAccessProfile?: Record<string, unknown> | null;
  providerIds: string[];
  firestoreProfileCompleteness: FirestoreProfileCompleteness;
  normalizedRole: 'Admin' | 'User';
  normalizedStatus: AdminDirectoryUserRecord['status'];
  includeDeleted?: boolean;
}): string[] => {
  const {
    authUser,
    firestoreUser,
    fastAccessProfile,
    providerIds,
    firestoreProfileCompleteness,
    normalizedRole,
    normalizedStatus,
  } = params;

  const issues = new Set<string>();
  const firestoreProviders = normalizeStringArray(firestoreUser?.authProviders);
  const firestoreRole = normalizeString(firestoreUser?.role);
  const claimRole = normalizeString(authUser?.customClaims?.role);
  const firestoreScope = normalizeString(firestoreUser?.accountScope);
  const firestoreIsTemporary = firestoreUser?.isTemporaryAccess === true;

  if (authUser && !firestoreUser) {
    issues.add('missing-firestore-profile');
  }

  if (!authUser && firestoreUser) {
    issues.add('missing-auth-identity');
  }

  if (firestoreProfileCompleteness === 'partial') {
    issues.add('partial-firestore-profile');
  }

  if (firestoreRole && ALLOWED_USER_ROLES.has(firestoreRole) && firestoreRole !== normalizedRole) {
    issues.add('role-mismatch-between-auth-and-firestore');
  }

  if (claimRole && ALLOWED_USER_ROLES.has(claimRole) && claimRole !== normalizedRole) {
    issues.add('custom-claims-role-mismatch');
  }

  if (authUser && firestoreUser && authUser.disabled && !['Blocked', 'Suspended'].includes(normalizedStatus)) {
    issues.add('auth-disabled-status-mismatch');
  }

  if (authUser && firestoreUser) {
    const missingProvidersInFirestore = providerIds.filter((providerId) => !firestoreProviders.includes(providerId));
    if (missingProvidersInFirestore.length > 0) {
      issues.add('provider-mismatch');
    }
  }

  if (fastAccessProfile && firestoreScope !== FACULTY_FAST_ACCESS_SCOPE) {
    issues.add('fast-access-scope-mismatch');
  }

  if (firestoreIsTemporary && firestoreScope && firestoreScope !== FACULTY_FAST_ACCESS_SCOPE) {
    issues.add('temporary-scope-inconsistency');
  }

  if (firestoreUser?.isDeleted === true && authUser) {
    issues.add('firestore-marked-deleted-while-auth-still-exists');
  }

  return Array.from(issues);
};

const buildDisplayName = (params: {
  uid: string;
  authUser?: admin.auth.UserRecord | null;
  firestoreUser?: Record<string, unknown> | null;
}): string => {
  const { uid, authUser, firestoreUser } = params;
  const firestoreName = normalizeOptionalString(firestoreUser?.name || firestoreUser?.displayName);
  if (firestoreName) return firestoreName;

  const authName = normalizeOptionalString(authUser?.displayName);
  if (authName) return authName;

  const email = normalizeOptionalString(firestoreUser?.email) || normalizeOptionalString(authUser?.email);
  if (email) return email.split('@')[0];

  const phoneNumber = normalizeOptionalString(firestoreUser?.phoneNumber) || normalizeOptionalString(authUser?.phoneNumber);
  if (phoneNumber) return phoneNumber;

  return `User ${uid.slice(0, 8)}`;
};

const buildLinkageStatus = (
  authExists: boolean,
  firestoreExists: boolean,
  issues: string[]
): AccountLinkageStatus => {
  if (authExists && firestoreExists && issues.length === 0) return 'linked';
  if (authExists && !firestoreExists) return 'auth_only';
  if (!authExists && firestoreExists) return 'firestore_only';
  return 'inconsistent';
};

const buildAdminManagementMode = (params: {
  linkageStatus: AccountLinkageStatus;
  accountScope: string;
  isTemporaryAccess: boolean;
}): AdminManagementMode => {
  if (params.isTemporaryAccess || params.accountScope === FACULTY_FAST_ACCESS_SCOPE) {
    return 'specialized_fast_access';
  }

  if (params.linkageStatus !== 'linked') {
    return 'view_only';
  }

  return 'full';
};

export function buildAdminDirectoryUserRecord(input: NormalizeAccountRecordInput): AdminDirectoryUserRecord | null {
  const { uid, authUser, firestoreUser, fastAccessProfile } = input;
  const authExists = Boolean(authUser);
  const firestoreExists = Boolean(firestoreUser);

  if (!authExists && !firestoreExists) {
    return null;
  }

  if (!authExists && firestoreUser?.isDeleted === true && !input.includeDeleted) {
    return null;
  }

  const safeClaims = sanitizeClaims(authUser?.customClaims as Record<string, unknown> | undefined);
  const providerDetails = getProviderDetails(authUser);
  const providerIds = getProviderIds(authUser, firestoreUser);
  const firestoreProfileCompleteness = getProfileCompleteness(firestoreUser);
  const normalizedRole = normalizeRole(firestoreUser?.role, safeClaims?.role);
  const normalizedStatus = normalizeStatus(firestoreUser?.status, Boolean(authUser?.disabled));
  const accountScope =
    normalizeOptionalString(firestoreUser?.accountScope) ||
    normalizeOptionalString(fastAccessProfile?.accountScope) ||
    (fastAccessProfile ? FACULTY_FAST_ACCESS_SCOPE : FULL_ACCOUNT_SCOPE);
  const isTemporaryAccess =
    firestoreUser?.isTemporaryAccess === true ||
    fastAccessProfile !== null && fastAccessProfile !== undefined ||
    accountScope === FACULTY_FAST_ACCESS_SCOPE;
  const issues = buildIssues({
    authUser,
    firestoreUser,
    fastAccessProfile,
    providerIds,
    firestoreProfileCompleteness,
    normalizedRole,
    normalizedStatus,
    includeDeleted: input.includeDeleted,
  });
  const linkageStatus = buildLinkageStatus(authExists, firestoreExists, issues);
  const adminManagementMode = buildAdminManagementMode({
    linkageStatus,
    accountScope,
    isTemporaryAccess,
  });

  const createdAt =
    normalizeOptionalString(firestoreUser?.createdAt) ||
    normalizeOptionalString(authUser?.metadata.creationTime) ||
    new Date().toISOString();
  const firstLoginDate =
    normalizeOptionalString(firestoreUser?.firstLoginDate) ||
    normalizeOptionalString(authUser?.metadata.creationTime) ||
    createdAt;
  const lastLogin =
    normalizeOptionalString(firestoreUser?.lastLogin) ||
    normalizeOptionalString(authUser?.metadata.lastSignInTime) ||
    createdAt;
  const updatedAt =
    normalizeOptionalString(firestoreUser?.updatedAt) ||
    lastLogin ||
    createdAt;
  const email =
    normalizeOptionalString(firestoreUser?.email) ||
    normalizeOptionalString(authUser?.email) ||
    '';
  const username =
    normalizeOptionalString(firestoreUser?.username) ||
    (email ? email.split('@')[0] : uid.slice(0, 8));
  const picture =
    normalizeOptionalString(firestoreUser?.picture || firestoreUser?.photoURL) ||
    normalizeOptionalString(authUser?.photoURL);

  return {
    id: uid,
    uid,
    name: buildDisplayName({ uid, authUser, firestoreUser }),
    email,
    username,
    usernameLower: normalizeOptionalString(firestoreUser?.usernameLower) || username.toLowerCase(),
    phoneNumber:
      normalizeOptionalString(firestoreUser?.phoneNumber) ||
      normalizeOptionalString(authUser?.phoneNumber),
    picture,
    role: normalizedRole,
    adminLevel:
      normalizeOptionalString(firestoreUser?.adminLevel) ||
      normalizeOptionalString(safeClaims?.adminLevel),
    plan: normalizeOptionalString(firestoreUser?.plan) || (normalizedRole === 'Admin' ? 'enterprise' : 'free'),
    status: normalizedStatus,
    firstLoginDate,
    lastLogin,
    createdAt,
    updatedAt,
    authProviders: providerIds,
    permissions:
      (typeof firestoreUser?.permissions === 'object' && firestoreUser.permissions !== null
        ? (firestoreUser.permissions as typeof DEFAULT_USER_PERMISSIONS)
        : DEFAULT_USER_PERMISSIONS),
    limits:
      (typeof firestoreUser?.limits === 'object' && firestoreUser.limits !== null
        ? (firestoreUser.limits as typeof DEFAULT_USER_LIMITS)
        : DEFAULT_USER_LIMITS),
    usage:
      (typeof firestoreUser?.usage === 'object' && firestoreUser.usage !== null
        ? ({
            ...buildDefaultUsage(),
            ...(firestoreUser.usage as Record<string, unknown>),
          } as ReturnType<typeof buildDefaultUsage>)
        : buildDefaultUsage()),
    settings:
      (typeof firestoreUser?.settings === 'object' && firestoreUser.settings !== null
        ? (firestoreUser.settings as Record<string, unknown>)
        : undefined),
    adminSettings:
      (typeof firestoreUser?.adminSettings === 'object' && firestoreUser.adminSettings !== null
        ? (firestoreUser.adminSettings as Record<string, unknown>)
        : undefined),
    adminNotes: normalizeOptionalString(firestoreUser?.adminNotes),
    credits: normalizeNonNegativeNumber(firestoreUser?.credits, normalizedRole === 'Admin' ? 9999 : 0),
    totalUploads: normalizeNonNegativeNumber(firestoreUser?.totalUploads),
    totalAIRequests: normalizeNonNegativeNumber(firestoreUser?.totalAIRequests),
    totalQuizzes: normalizeNonNegativeNumber(firestoreUser?.totalQuizzes),
    isVerified: Boolean(firestoreUser?.isVerified ?? authUser?.emailVerified ?? false),
    unlockedPages: normalizeStringArray(firestoreUser?.unlockedPages),
    unlockedModels: normalizeStringArray(firestoreUser?.unlockedModels),
    unlockedProjects: normalizeStringArray(firestoreUser?.unlockedProjects),
    isTemporaryAccess,
    temporaryAccessType:
      (normalizeOptionalString(firestoreUser?.temporaryAccessType) ||
        normalizeOptionalString(fastAccessProfile?.temporaryAccessType)) as 'FacultyOfScienceFastAccess' | undefined,
    temporaryAccessExpiresAt:
      normalizeOptionalString(firestoreUser?.temporaryAccessExpiresAt) ||
      normalizeOptionalString(fastAccessProfile?.expiresAt),
    accountScope: accountScope as 'full_account' | 'faculty_science_fast_access',
    fastAccessCredits: normalizeNonNegativeNumber(
      firestoreUser?.fastAccessCredits ?? fastAccessProfile?.fastAccessCredits,
      0
    ),
    fastAccessCreditsUpdatedAt:
      normalizeOptionalString(firestoreUser?.fastAccessCreditsUpdatedAt) ||
      normalizeOptionalString(fastAccessProfile?.updatedAt),
    fastAccessMetadata:
      (typeof firestoreUser?.fastAccessMetadata === 'object' && firestoreUser.fastAccessMetadata !== null
        ? (firestoreUser.fastAccessMetadata as Record<string, unknown>)
        : undefined),
    statusMessage: normalizeOptionalString(firestoreUser?.statusMessage),
    statusContext:
      (typeof firestoreUser?.statusContext === 'object' && firestoreUser.statusContext !== null
        ? (firestoreUser.statusContext as Record<string, unknown>)
        : undefined),
    isDeleted: firestoreUser?.isDeleted === true,
    deletedAt: normalizeOptionalString(firestoreUser?.deletedAt),
    deletedBy: normalizeOptionalString(firestoreUser?.deletedBy),
    accountLinkage: {
      authSource: authExists ? 'firebase-auth' : 'firestore-only',
      authRecordExists: authExists,
      firestoreRecordExists: firestoreExists,
      firestoreProfileCompleteness,
      linkageStatus,
      adminManagementMode,
      issues,
      providerIds,
      providerDetails,
      emailVerified: Boolean(authUser?.emailVerified ?? false),
      authDisabled: Boolean(authUser?.disabled ?? false),
      authCreationTime: normalizeOptionalString(authUser?.metadata.creationTime),
      authLastSignInTime: normalizeOptionalString(authUser?.metadata.lastSignInTime),
      customClaims: safeClaims,
      claimRole: normalizeOptionalString(safeClaims?.role),
      claimAdminLevel: normalizeOptionalString(safeClaims?.adminLevel),
      firestoreRole: normalizeOptionalString(firestoreUser?.role),
      firestoreStatus: normalizeOptionalString(firestoreUser?.status),
      firestoreDocumentPath: firestoreExists ? `users/${uid}` : undefined,
      hasTemporaryAccessProfile: Boolean(fastAccessProfile),
      temporaryAccessProfilePath: fastAccessProfile ? `faculty_fast_access_accounts/${uid}` : undefined,
      isFirestoreOrphan: !authExists && firestoreExists,
    },
  };
}

async function listAllAuthUsers(auth: admin.auth.Auth): Promise<admin.auth.UserRecord[]> {
  const authUsers: admin.auth.UserRecord[] = [];
  let nextPageToken: string | undefined;

  do {
    const batch = await auth.listUsers(1000, nextPageToken);
    authUsers.push(...batch.users);
    nextPageToken = batch.pageToken;
  } while (nextPageToken);

  return authUsers;
}

const countFastAccessDeletionAudits = async (
  db: Firestore,
  collectionName?: string
): Promise<number> => {
  if (!collectionName) return 0;
  const snapshot = await db.collection(collectionName).get();
  return snapshot.size;
};

export async function listAdminAccountDirectory(
  options: ListAdminAccountDirectoryOptions
): Promise<AdminAccountDirectoryResult> {
  const {
    db,
    auth,
    usersCollection,
    fastAccessAccountsCollection,
    fastAccessDeletionAuditsCollection,
    includeDeleted = false,
  } = options;

  const [authUsers, firestoreUsersSnapshot, fastAccessProfilesSnapshot, archivedFastAccessDeletedCount] = await Promise.all([
    listAllAuthUsers(auth),
    db.collection(usersCollection).get(),
    db.collection(fastAccessAccountsCollection).get(),
    countFastAccessDeletionAudits(db, fastAccessDeletionAuditsCollection),
  ]);

  const authByUid = new Map(authUsers.map((record) => [record.uid, record]));
  const firestoreByUid = new Map(
    firestoreUsersSnapshot.docs.map((docSnap) => [docSnap.id, (docSnap.data() || {}) as Record<string, unknown>])
  );
  const fastAccessByUid = new Map(
    fastAccessProfilesSnapshot.docs.map((docSnap) => [docSnap.id, (docSnap.data() || {}) as Record<string, unknown>])
  );

  const candidateUserIds = new Set<string>([
    ...Array.from(authByUid.keys()),
    ...Array.from(firestoreByUid.keys()),
  ]);

  const accounts = Array.from(candidateUserIds)
    .map((uid) =>
      buildAdminDirectoryUserRecord({
        uid,
        authUser: authByUid.get(uid),
        firestoreUser: firestoreByUid.get(uid),
        fastAccessProfile: fastAccessByUid.get(uid),
        includeDeleted,
      })
    )
    .filter((account): account is AdminDirectoryUserRecord => Boolean(account))
    .sort((left, right) => {
      const rightSortKey = right.accountLinkage.authLastSignInTime || right.lastLogin || right.createdAt;
      const leftSortKey = left.accountLinkage.authLastSignInTime || left.lastLogin || left.createdAt;
      return String(rightSortKey).localeCompare(String(leftSortKey));
    });

  const summary: AdminAccountDirectorySummary = {
    totalAccounts: accounts.length,
    linkedAccounts: accounts.filter((account) => account.accountLinkage.linkageStatus === 'linked').length,
    authOnlyAccounts: accounts.filter((account) => account.accountLinkage.linkageStatus === 'auth_only').length,
    firestoreOnlyAccounts: accounts.filter((account) => account.accountLinkage.linkageStatus === 'firestore_only').length,
    accountsWithIssues: accounts.filter((account) => account.accountLinkage.issues.length > 0).length,
    adminAccounts: accounts.filter((account) => account.role === 'Admin').length,
    temporaryFastAccessAccounts: accounts.filter(
      (account) => account.isTemporaryAccess === true || account.accountScope === FACULTY_FAST_ACCESS_SCOPE
    ).length,
    blockedOrDisabledAccounts: accounts.filter(
      (account) => account.status === 'Blocked' || account.status === 'Suspended' || account.accountLinkage.authDisabled
    ).length,
    missingFirestoreProfiles: accounts.filter((account) => account.accountLinkage.firestoreRecordExists === false).length,
    orphanFirestoreProfiles: accounts.filter((account) => account.accountLinkage.isFirestoreOrphan).length,
    archivedFastAccessDeletedCount,
  };

  return { accounts, summary };
}
