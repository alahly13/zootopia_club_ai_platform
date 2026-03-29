import * as React from 'react';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  User,
  UserRole,
  Activity,
  UserRequest,
  UserStatus,
  UserPermissions,
  UserLimits,
  UserUsage,
  UserSettings,
  AdminSettings,
  ErrorCategory,
} from '../utils';
import { AIModel } from '../constants/aiModels';
import { logger } from '../utils/logger';
import { useNotification } from '../hooks/useNotification';
import { auth } from '../firebase';
import { withTimeout } from '../utils/async';
import {
  onAuthStateChanged,
  User as FirebaseUser,
  signOut,
} from 'firebase/auth';

import { useModelManagement } from './hooks/useModelManagement';
import { useApiKeys } from './hooks/useApiKeys';
import { useUsageManagement } from './hooks/useUsageManagement';
import { useRequestManagement } from './hooks/useRequestManagement';
import { useUserManagement } from './hooks/useUserManagement';
import { useAuthActions } from './hooks/useAuthActions';
import { useAuthError } from './hooks/useAuthError';
import { useActivityManagement } from './hooks/useActivityManagement';
import { useAuthListeners } from './hooks/useAuthListeners';
import { isUserAdmin } from './accessControl';
import { clearWelcomeSessionFlags } from '../constants/welcomeFlow';
import { aiCache } from '../ai/services/cacheService';
import { runtimeTimeouts } from '../config/runtime';
import { safeLocalStorageRemoveItem } from '../utils/browserStorage';
import {
  AuthSessionState,
  AuthSessionType,
  createUnauthenticatedAuthSessionState,
} from './session/types';
import {
  buildAuthSessionScopeKey,
  resolveAuthSessionTypeFromUser,
} from './session/authMode';
import {
  bootstrapPlatformAuthSession,
  isAuthSessionApiError,
  logoutPlatformAuthSession,
  refreshPlatformAuthSession,
} from './session/sessionApi';
import {
  clearAllStoredAuthSessions,
  clearLegacyAuthSessionKeys,
  clearSiblingAuthSessionManagers,
  getAuthSessionManager,
} from './session';
import {
  clearStoredAuthSessionMode,
  readStoredAuthSessionMode,
  writeStoredAuthSessionMode,
} from './session/storage';

/**
 * IMPORTANT ARCHITECTURE RULES
 * ------------------------------------------------------------------
 * 1. AuthContext is the orchestration shell for auth-related hooks.
 * 2. Business logic should remain inside dedicated hooks whenever possible.
 * 3. Do not reintroduce a giant monolithic "god object" implementation here.
 * 4. Preserve all public context contracts unless absolutely necessary.
 * 5. Build incrementally on top of this structure.
 */

type AuthBootstrapState =
  | 'bootstrapping'
  | 'restoring'
  | 'validating'
  | 'hydrating_profile'
  | 'authenticated'
  | 'unauthenticated'
  | 'expired'
  | 'invalid'
  | 'failed'
  | 'logging_out';

type AuthBootstrapIssue = {
  title: string;
  message: string;
  detail?: string;
  reason: string;
  phase: AuthBootstrapState;
};

type RefreshFailureDisposition =
  | {
      action: 'invalidate';
      classification: 'verified_expired' | 'verified_invalid' | 'verified_unauthorized';
      sessionState: AuthSessionState['sessionState'];
      logoutReason: string | null;
      code: string | null;
      status: number | null;
    }
  | {
      action: 'preserve';
      classification: 'transient_or_unverified';
      code: string | null;
      status: number | null;
    };

function resolveRefreshFailureDisposition(error: unknown): RefreshFailureDisposition {
  if (!isAuthSessionApiError(error)) {
    return {
      action: 'preserve',
      classification: 'transient_or_unverified',
      code: null,
      status: null,
    };
  }

  const code = error.code || null;
  const status = Number.isFinite(error.status) ? error.status : null;

  if (code === 'SESSION_EXPIRED' || code === 'SESSION_MAX_LIFETIME_EXCEEDED') {
    return {
      action: 'invalidate',
      classification: 'verified_expired',
      sessionState: 'expired',
      logoutReason: 'session_expired',
      code,
      status,
    };
  }

  if (
    code === 'SESSION_INVALIDATED' ||
    code === 'AUTH_MODE_MISMATCH' ||
    code === 'SESSION_MISSING'
  ) {
    return {
      action: 'invalidate',
      classification: 'verified_invalid',
      sessionState: 'invalid',
      logoutReason: null,
      code,
      status,
    };
  }

  if (status === 401 || status === 403) {
    return {
      action: 'invalidate',
      classification: 'verified_unauthorized',
      sessionState: 'invalid',
      logoutReason: null,
      code,
      status,
    };
  }

  return {
    action: 'preserve',
    classification: 'transient_or_unverified',
    code,
    status,
  };
}

interface AuthContextType {
  user: User | null;
  authMode: AuthSessionType | null;
  authSession: AuthSessionState;
  sessionScopeKey: string | null;
  activities: Activity[];
  allUsers: User[];
  userRequests: UserRequest[];

  models: AIModel[];
  // Legacy account-level preference only. Live tool execution must use
  // `useToolScopedModelSelection` inside the tool surface itself.
  selectedModelId: string;

  platformApiKey: string;
  qwenApiKey: string;
  qwenRegion: string;
  qwenBaseUrl: string;

  login: (firebaseUser: FirebaseUser) => Promise<void>;
  loginWithIdentifier: (identifier: string, password: string) => Promise<void>;
  register: (email: string, password: string, userData: Partial<User>) => Promise<void>;
  adminLogin: (username: string, password: string) => Promise<boolean>;
  checkUsernameAvailability: (username: string) => Promise<boolean>;
  logout: () => Promise<void>;

  logActivity: (type: Activity['type'], description: string) => void;

  isAuthenticated: boolean;
  isAdmin: boolean;
  isAuthReady: boolean;
  isProfileHydrating: boolean;
  authBootstrapState: AuthBootstrapState;
  authBootstrapIssue: AuthBootstrapIssue | null;
  retryAuthBootstrap: () => Promise<void>;
  clearStalledAuthSession: () => Promise<void>;

  updateUser: (userId: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  createUser: (userData: Partial<User>, password?: string) => Promise<void>;

  submitRequest: (
    type: UserRequest['type'],
    message: string,
    requestedAmount?: number,
    targetId?: string
  ) => void;

  updateRequest: (
    requestId: string,
    status: UserRequest['status'],
    adminResponse?: string,
    approvedAmount?: number
  ) => void;

  checkLimit: (type: keyof UserUsage) => boolean;
  deductCredits: (amount?: number) => Promise<boolean>;
  incrementUsage: (type: keyof UserUsage) => void;

  updateModel: (modelId: string, updates: Partial<AIModel>) => void;
  addModel: (model: AIModel) => void;
  deleteModel: (modelId: string) => void;
  selectModel: (modelId: string) => void;
  getModelConfig: (modelId: string) => AIModel | undefined;
  getActiveModel: () => AIModel | undefined;
  validateModel: (modelId: string) => Promise<{ isValid: boolean; error?: string }>;

  setPlatformApiKey: (key: string) => void;
  setQwenApiKey: (key: string) => void;
  setQwenRegion: (region: string) => void;
  setQwenBaseUrl: (url: string) => void;

  refreshModels: () => Promise<void>;
  validateQwenModels: () => Promise<void>;
  testQwenConnection: () => Promise<{ success: boolean; message: string }>;
  testGoogleConnection: () => Promise<{ success: boolean; message: string }>;

  appError: {
    type: 'error' | 'warning' | 'info' | 'success';
    title: string;
    message: string;
    details?: string;
    uiType: 'alert' | 'modal';
  } | null;

  clearError: () => void;
  handleError: (
    error: any,
    category: ErrorCategory,
    context?: string,
    uiType?: 'toast' | 'alert' | 'modal'
  ) => void;

  notify: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
    loading: (message: string) => string;
    dismiss: (toastId?: string) => void;
  };

  forgotPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  linkAccount: (email: string, password: string) => Promise<void>;
  sendVerificationEmail: (firebaseUser: FirebaseUser) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  checkEmailVerificationStatus: () => Promise<void>;

  updateUserProfile: (userData: Partial<User>) => Promise<void>;
  updateUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
  updateAdminSettings: (settings: Partial<AdminSettings>) => Promise<void>;

  approveUser: (user: User) => Promise<void>;
  rejectUser: (user: User, reason?: string) => Promise<void>;
  suspendUser: (user: User, reason?: string) => Promise<void>;
  blockUser: (user: User, reason?: string) => Promise<void>;
  reactivateUser: (user: User) => Promise<void>;
  updateUserCredits: (userId: string, credits: number) => Promise<void>;
}

const INITIAL_AUTH_RESOLUTION_TIMEOUT_MS = runtimeTimeouts.authInitialResolutionMs;
const AUTH_PROFILE_SYNC_TIMEOUT_MS = runtimeTimeouts.authProfileSyncMs;
const AUTH_SESSION_REENTRY_REFRESH_INTERVAL_MS = 5 * 60_000;

function isStoredAuthSessionStillRestorable(session: AuthSessionState | null): session is AuthSessionState {
  if (!session) {
    return false;
  }

  if (!session.expiresAt) {
    return true;
  }

  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return true;
  }

  return expiresAtMs > Date.now();
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Core auth/session state
   */
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authBootstrapState, setAuthBootstrapState] = useState<AuthContextType['authBootstrapState']>('bootstrapping');
  const [authBootstrapIssue, setAuthBootstrapIssue] = useState<AuthContextType['authBootstrapIssue']>(null);
  const [pendingFirebaseSession, setPendingFirebaseSession] = useState<{
    uid: string;
    email: string | null;
  } | null>(null);
  const [authSession, setAuthSession] = useState<AuthSessionState>(() => {
    const storedAuthMode = readStoredAuthSessionMode();
    const storedSession = storedAuthMode ? getAuthSessionManager(storedAuthMode).load() : null;

    if (!isStoredAuthSessionStillRestorable(storedSession)) {
      if (storedAuthMode) {
        getAuthSessionManager(storedAuthMode).clear();
        clearStoredAuthSessionMode();
      }

      return createUnauthenticatedAuthSessionState({
        sessionState: 'restoring',
        restoreFailureReason: null,
      });
    }

    return {
      ...createUnauthenticatedAuthSessionState({
        sessionState: 'restoring',
        restoreFailureReason: null,
      }),
      ...storedSession,
      sessionState: 'restoring',
      restoreFailureReason: null,
      logoutReason: null,
      sessionScopeKey:
        storedSession.sessionScopeKey ||
        buildAuthSessionScopeKey({
          authType: storedSession.authType,
          uid: storedSession.uid,
          email: storedSession.email,
        }),
    };
  });

  /**
   * Shared admin/user data feeds
   */
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [userRequests, setUserRequests] = useState<UserRequest[]>([]);

  /**
   * ARCHITECTURE GUARD (Role Resolution)
   * ------------------------------------------------------------------
   * `isAdmin` must stay strict-but-compatible:
   * - strict enough to avoid accidental privilege grants,
   * - compatible with legacy role casing and reserved admin identities.
   *
   * Backend authorization remains authoritative. This frontend state is
   * for UX/routing only and must stay aligned with backend checks.
   */
  const isAdmin =
    isUserAdmin(user) ||
    (authSession.sessionState === 'authenticated' && authSession.role === 'Admin');
  const isAuthenticated = Boolean(user?.id) && authSession.sessionState === 'authenticated';
  const isProfileHydrating = !!pendingFirebaseSession && !user;
  const authMode = authSession.authType;
  const sessionScopeKey =
    authSession.sessionScopeKey ||
    buildAuthSessionScopeKey({
      authType: resolveAuthSessionTypeFromUser(user),
      uid: user?.id || pendingFirebaseSession?.uid || null,
      email: user?.email || pendingFirebaseSession?.email || null,
    });

  /**
   * Unified notification surface for hooks and consumers.
   */
  const { success, error, warning, info, loading, dismiss } = useNotification();

  const notify = useMemo(
    () => ({
      success,
      error,
      warning,
      info,
      loading,
      dismiss,
    }),
    [success, error, warning, info, loading, dismiss]
  );

  /**
   * Centralized error handling.
   * Keep auth-facing UX consistent across all hook consumers.
   */
  const {
    appError,
    clearError,
    handleError,
    handleFirestoreError,
  } = useAuthError(notify, isAdmin);

  /**
   * Activity logging should remain stable and user-aware.
   */
  const { logActivity } = useActivityManagement(user);

  /**
   * Provider/API key state
   */
  const {
    platformApiKey,
    setPlatformApiKey,
    qwenApiKey,
    setQwenApiKey,
    qwenRegion,
    setQwenRegion,
    qwenBaseUrl,
    setQwenBaseUrl,
  } = useApiKeys();

  /**
   * User management hook bundle
   */
  const {
    updateUser,
    deleteUser,
    createUser,
    updateUserProfile,
    checkUsernameAvailability,
    updateUserSettings,
    updateAdminSettings,
    approveUser,
    rejectUser,
    suspendUser,
    blockUser,
    reactivateUser,
    updateUserCredits,
  } = useUserManagement(user, logActivity, handleFirestoreError);

  /**
   * AI model management hook bundle
   */
  const {
    models,
    setModels,
    selectedModelId,
    updateModel,
    addModel,
    deleteModel,
    selectModel,
    getModelConfig,
    getActiveModel,
    validateModel,
    validateQwenModels,
    testQwenConnection,
    testGoogleConnection,
    refreshModels,
  } = useModelManagement(
    user,
    updateUserSettings,
    platformApiKey,
    qwenApiKey,
    qwenBaseUrl
  );

  /**
   * Usage / credits controls
   */
  const { checkLimit, deductCredits, incrementUsage } = useUsageManagement(user, updateUser);

  /**
   * Requests / moderation / approvals
   */
  const { submitRequest, updateRequest } = useRequestManagement(
    user,
    userRequests,
    logActivity,
    handleError
  );

  /**
   * Live Firestore listeners.
   * This is intentionally mounted once per auth/user lifecycle.
   */
  useAuthListeners(
    user,
    isAdmin,
    setUser,
    setAllUsers,
    setActivities,
    setUserRequests,
    handleFirestoreError,
    handleError
  );

  const authListenerResolvedRef = React.useRef(false);
  const authResolutionTimeoutRef = React.useRef<number | null>(null);
  const bootstrapPromiseRef = React.useRef<Promise<AuthSessionState | null> | null>(null);
  const bootstrapUidRef = React.useRef<string | null>(null);
  const bootstrapGenerationRef = React.useRef(0);

  const clearAuthResolutionTimeout = useCallback(() => {
    if (authResolutionTimeoutRef.current !== null) {
      window.clearTimeout(authResolutionTimeoutRef.current);
      authResolutionTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearLegacyAuthSessionKeys();
  }, []);

  const resolveAuthModeMismatchMessage = useCallback(
    (expectedAuthType: AuthSessionType, actualAuthType: AuthSessionType | null) => {
      if (expectedAuthType === 'admin') {
        return 'This account is not authorized for the admin control center.';
      }

      if (expectedAuthType === 'normal' && actualAuthType === 'admin') {
        return 'Admin accounts must sign in through the dedicated admin login page.';
      }

      if (expectedAuthType === 'normal' && actualAuthType === 'fast_access') {
        return 'Temporary Faculty accounts must use the dedicated Fast Access login flow.';
      }

      if (expectedAuthType === 'fast_access') {
        return 'This session must stay on the Faculty Fast Access lane.';
      }

      return 'Authentication mode mismatch detected. Please sign in again.';
    },
    []
  );

  const resolveTtlRemainingMs = useCallback((expiresAt: string | null) => {
    if (!expiresAt) {
      return null;
    }

    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      return null;
    }

    return Math.max(0, expiresAtMs - Date.now());
  }, []);

  const applyServerAuthSession = useCallback(
    (
      serverSession: AuthSessionState | {
        authType: AuthSessionType;
        uid: string;
        email: string | null;
        sessionState: AuthSessionState['sessionState'];
        sessionSource: AuthSessionState['sessionSource'];
        sessionId: string | null;
        traceId: string | null;
        role: AuthSessionState['role'];
        adminLevel: string | null;
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
        rehydrationStatus: AuthSessionState['rehydrationStatus'];
        cacheHydrationStatus: AuthSessionState['cacheHydrationStatus'];
        restoreFailureReason: string | null;
        logoutReason: string | null;
        reEntryStatus: AuthSessionState['reEntryStatus'];
        adminVerificationStatus: AuthSessionState['adminVerificationStatus'];
        fastAccessVerificationStatus: AuthSessionState['fastAccessVerificationStatus'];
        accountCompletenessStatus: AuthSessionState['accountCompletenessStatus'];
        lastValidatedAt: string | null;
        tokenIssuedAtSec: number | null;
        tokenAuthTimeSec: number | null;
      }
    ) => {
      const sessionScopeKey = buildAuthSessionScopeKey({
        authType: serverSession.authType,
        uid: serverSession.uid,
        email: serverSession.email,
      });

      const nextSession: AuthSessionState = {
        ...createUnauthenticatedAuthSessionState(),
        ...serverSession,
        authType: serverSession.authType,
        sessionState: serverSession.sessionState,
        sessionScopeKey,
      };

      getAuthSessionManager(serverSession.authType).persist(nextSession);
      writeStoredAuthSessionMode(serverSession.authType);
      clearSiblingAuthSessionManagers(serverSession.authType);
      setAuthSession(nextSession);

      logger.info('Auth session established', {
        area: 'auth',
        event: 'auth-session-established',
        mode: nextSession.authType,
        lifecycle: nextSession.sessionState,
        scope: sessionScopeKey,
        rehydration: nextSession.rehydrationStatus,
        ttlRemainingMs: resolveTtlRemainingMs(nextSession.expiresAt),
      });

      return nextSession;
    },
    [resolveTtlRemainingMs]
  );

  const markAuthBootstrapIssue = useCallback(
    (issue: AuthBootstrapIssue) => {
      logger.error('Auth bootstrap entered recovery mode', {
        area: 'auth',
        event: 'auth-bootstrap-recoverable-error',
        title: issue.title,
        message: issue.message,
        detail: issue.detail,
        reason: issue.reason,
        phase: issue.phase,
        currentUserId: auth.currentUser?.uid || null,
      });

      setAuthBootstrapState('failed');
      setAuthBootstrapIssue(issue);
      setIsAuthReady(true);
    },
    []
  );

  /**
   * Session cleanup must stay explicit and reusable.
   * IMPORTANT:
   * - Clears all auth-scoped in-memory state
   * - Clears local persisted session data
   * - Does NOT touch unrelated global app state
   */
  const clearSessionState = useCallback((options: {
    sessionState?: AuthSessionState['sessionState'];
    logoutReason?: string | null;
    restoreFailureReason?: string | null;
  } = {}) => {
    bootstrapGenerationRef.current += 1;
    setUser(null);
    setActivities([]);
    setUserRequests([]);
    setAllUsers([]);
    setPendingFirebaseSession(null);
    bootstrapPromiseRef.current = null;
    bootstrapUidRef.current = null;
    setAuthSession(
      createUnauthenticatedAuthSessionState({
        sessionState: options.sessionState || 'unauthenticated',
        logoutReason: options.logoutReason || null,
        restoreFailureReason: options.restoreFailureReason || null,
      })
    );

    const keysToClear = [
      'zootopia_models',
      'zootopia_selected_model',
      'zootopia_qwen_api_key',
      'zootopia_qwen_region',
      'zootopia_qwen_base_url',
      'zootopia_platform_api_key',
    ];

    keysToClear.forEach((key) => safeLocalStorageRemoveItem(key));
    clearAllStoredAuthSessions();
    aiCache.clear();
    // Welcome popup/audio are auth-entry UX, so they should reset when the
    // authenticated session ends and a later secure login starts fresh.
    clearWelcomeSessionFlags();
    logger.info('Session state cleared', {
      area: 'auth',
      event: 'auth-session-cleared',
      nextState: options.sessionState || 'unauthenticated',
      logoutReason: options.logoutReason || null,
      restoreFailureReason: options.restoreFailureReason || null,
    });
  }, []);

  /**
   * Auth action bundle.
   * This hook owns login/register/logout/sync primitives.
   */
  const {
    login: rawLogin,
    loginWithIdentifier: rawLoginWithIdentifier,
    register: rawRegister,
    adminLogin: rawAdminLogin,
    forgotPassword: rawForgotPassword,
    updatePassword: rawUpdatePassword,
    linkAccount: rawLinkAccount,
    sendVerificationEmail: rawSendVerificationEmail,
    resendVerificationEmail: rawResendVerificationEmail,
    checkEmailVerificationStatus: rawCheckEmailVerificationStatus,
    syncUserWithFirestore: rawSyncUserWithFirestore,
  } = useAuthActions(
    logActivity,
    updateUser,
    checkUsernameAvailability,
    clearSessionState,
    notify
  );

  const establishAuthSession = useCallback(
    async (
      expectedAuthType: AuthSessionType | null | undefined,
      source: 'login' | 'restore' | 'refresh'
    ) => {
      logger.info('Backend auth bootstrap started', {
        area: 'auth',
        event: 'auth-backend-bootstrap-started',
        source,
        expectedMode: expectedAuthType || 'auto',
        currentUserId: auth.currentUser?.uid || null,
      });

      const response =
        source === 'refresh'
          ? await refreshPlatformAuthSession(expectedAuthType, 'refresh')
          : await bootstrapPlatformAuthSession(
              expectedAuthType,
              source === 'login' ? 'login' : 'restore'
            );

      const nextSession = applyServerAuthSession({
        ...response.session,
        sessionSource: source === 'login' ? 'login' : response.session.sessionSource,
      });

      if (source === 'login' && expectedAuthType && nextSession.authType !== expectedAuthType) {
        const mismatchMessage = resolveAuthModeMismatchMessage(expectedAuthType, nextSession.authType);
        try {
          await signOut(auth);
        } catch (error) {
          logger.warn('Failed to sign out after auth-mode mismatch', {
            area: 'auth',
            event: 'auth-session-mode-mismatch-signout-failed',
            expectedAuthType,
            actualAuthType: nextSession.authType,
            error,
          });
        }

        clearSessionState({
          sessionState: 'invalid',
          restoreFailureReason: mismatchMessage,
        });
        throw new Error(mismatchMessage);
      }

      if (source !== 'login' && expectedAuthType && nextSession.authType !== expectedAuthType) {
        logger.warn('Stored auth mode hint differed from restored session', {
          area: 'auth',
          event: 'auth-session-mode-restored-different',
          expectedAuthType,
          actualAuthType: nextSession.authType,
        });
      }

      logger.info('Backend auth bootstrap completed', {
        area: 'auth',
        event: 'auth-backend-bootstrap-completed',
        source,
        mode: nextSession.authType,
        lifecycle: nextSession.sessionState,
        ttlRemainingMs: resolveTtlRemainingMs(nextSession.expiresAt),
      });

      return nextSession;
    },
    [applyServerAuthSession, clearSessionState, resolveAuthModeMismatchMessage, resolveTtlRemainingMs]
  );

  const buildBootstrapIssue = useCallback(
    (phase: AuthBootstrapState, error: unknown): AuthBootstrapIssue => {
      const detail = error instanceof Error ? error.message : String(error);
      const apiCode = isAuthSessionApiError(error) ? error.code || 'AUTH_SESSION_FAILURE' : null;

      if (phase === 'hydrating_profile') {
        return {
          title: 'Session restore is still incomplete',
          message:
            'Your session was validated, but the workspace profile did not finish restoring cleanly.',
          detail,
          reason: apiCode || 'PROFILE_SYNC_FAILED',
          phase,
        };
      }

      return {
        title: 'Startup is taking longer than expected',
        message:
          'The platform could not finish validating your session cleanly, so startup paused instead of entering a broken intermediate state.',
        detail,
        reason: apiCode || 'AUTH_BOOTSTRAP_FAILED',
        phase,
      };
    },
    []
  );

  const runAuthoritativeBootstrap = useCallback(
    async (
      firebaseUser: FirebaseUser,
      expectedAuthType: AuthSessionType | null | undefined,
      source: 'login' | 'restore'
    ) => {
      const bootstrapGeneration = bootstrapGenerationRef.current;

      if (bootstrapPromiseRef.current && bootstrapUidRef.current === firebaseUser.uid) {
        return bootstrapPromiseRef.current;
      }

      const bootstrapPromise = (async () => {
        let phase: AuthBootstrapState = source === 'restore' ? 'restoring' : 'validating';

        setPendingFirebaseSession({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? null,
        });
        setAuthBootstrapIssue(null);
        setAuthBootstrapState(phase);
        setIsAuthReady(false);

        logger.info('Authoritative auth bootstrap started', {
          area: 'auth',
          event: 'auth-bootstrap-started',
          source,
          expectedMode: expectedAuthType || 'auto',
          currentUserId: firebaseUser.uid,
        });

        try {
          phase = 'validating';
          setAuthBootstrapState(phase);

          logger.info('Workspace profile sync started', {
            area: 'auth',
            event: 'auth-profile-sync-started',
            source,
            currentUserId: firebaseUser.uid,
          });

          /**
           * Authoritative startup waits on both the backend session and the
           * Firestore-backed profile. Running them together avoids making route
           * readiness depend on whichever branch happened to update first.
           */
          const [nextSession, synchronizedUser] = await Promise.all([
            establishAuthSession(expectedAuthType, source).catch((error) => {
              phase = 'validating';
              throw error;
            }),
            withTimeout(
              rawSyncUserWithFirestore(firebaseUser),
              AUTH_PROFILE_SYNC_TIMEOUT_MS,
              'Workspace profile synchronization timed out.'
            ).catch((error) => {
              phase = 'hydrating_profile';
              throw error;
            }),
          ]);

          if (bootstrapGenerationRef.current !== bootstrapGeneration) {
            return null;
          }

          phase = 'hydrating_profile';
          setAuthBootstrapState(phase);

          setUser(synchronizedUser);
          setPendingFirebaseSession(null);
          setAuthBootstrapIssue(null);
          setAuthBootstrapState('authenticated');
          setIsAuthReady(true);

          logger.info('Authoritative auth bootstrap completed', {
            area: 'auth',
            event: 'auth-bootstrap-completed',
            source,
            mode: nextSession.authType,
            lifecycle: nextSession.sessionState,
            ttlRemainingMs: resolveTtlRemainingMs(nextSession.expiresAt),
            currentUserId: firebaseUser.uid,
          });

          return nextSession;
        } catch (error) {
          if (bootstrapGenerationRef.current !== bootstrapGeneration) {
            return null;
          }

          logger.error('Authoritative auth bootstrap failed', {
            area: 'auth',
            event: 'auth-bootstrap-failed',
            source,
            phase,
            expectedMode: expectedAuthType || 'auto',
            currentUserId: firebaseUser.uid,
            error,
          });

          if (isAuthSessionApiError(error)) {
            const isExpired =
              error.code === 'SESSION_EXPIRED' ||
              error.code === 'SESSION_MAX_LIFETIME_EXCEEDED';
            const isInvalid =
              error.code === 'SESSION_INVALIDATED' ||
              error.code === 'AUTH_MODE_MISMATCH' ||
              error.code === 'SESSION_MISSING';

            if (isExpired || isInvalid) {
              try {
                await signOut(auth);
              } catch {
                // Best-effort sign-out only.
              }

              clearSessionState({
                sessionState: isExpired ? 'expired' : 'invalid',
                logoutReason: isExpired ? 'session_expired' : null,
                restoreFailureReason: error.message,
              });
              setAuthBootstrapIssue(null);
              setAuthBootstrapState(isExpired ? 'expired' : 'invalid');
              setIsAuthReady(true);
              throw error;
            }
          }

          markAuthBootstrapIssue(buildBootstrapIssue(phase, error));
          throw error;
        }
      })();

      bootstrapPromiseRef.current = bootstrapPromise;
      bootstrapUidRef.current = firebaseUser.uid;

      try {
        return await bootstrapPromise;
      } finally {
        if (bootstrapPromiseRef.current === bootstrapPromise) {
          bootstrapPromiseRef.current = null;
          bootstrapUidRef.current = null;
        }
      }
    },
    [
      buildBootstrapIssue,
      clearSessionState,
      establishAuthSession,
      markAuthBootstrapIssue,
      rawSyncUserWithFirestore,
      resolveTtlRemainingMs,
    ]
  );

  const login = useCallback(async (firebaseUser: FirebaseUser) => {
    writeStoredAuthSessionMode('normal');

    try {
      await rawLogin(firebaseUser);
      await runAuthoritativeBootstrap(firebaseUser, 'normal', 'login');
    } catch (error) {
      clearStoredAuthSessionMode();
      throw error;
    }
  }, [rawLogin, runAuthoritativeBootstrap]);

  const loginWithIdentifier = useCallback(async (identifier: string, password: string) => {
    writeStoredAuthSessionMode('normal');

    try {
      const firebaseUser = await rawLoginWithIdentifier(identifier, password);
      await runAuthoritativeBootstrap(firebaseUser, 'normal', 'login');
    } catch (error) {
      clearStoredAuthSessionMode();
      throw error;
    }
  }, [rawLoginWithIdentifier, runAuthoritativeBootstrap]);

  const register = useCallback(async (email: string, password: string, userData: Partial<User>) => {
    await rawRegister(email, password, userData);
  }, [rawRegister]);

  const adminLogin = useCallback(async (identifier: string, password: string) => {
    writeStoredAuthSessionMode('admin');

    try {
      const firebaseUser = await rawAdminLogin(identifier, password);
      await runAuthoritativeBootstrap(firebaseUser, 'admin', 'login');
      return true;
    } catch (error) {
      clearStoredAuthSessionMode();
      throw error;
    }
  }, [rawAdminLogin, runAuthoritativeBootstrap]);

  const forgotPassword = useCallback(async (email: string) => {
    await rawForgotPassword(email);
  }, [rawForgotPassword]);

  const updatePassword = useCallback(async (password: string) => {
    await rawUpdatePassword(password);
  }, [rawUpdatePassword]);

  const linkAccount = useCallback(async (email: string, password: string) => {
    await rawLinkAccount(email, password);
  }, [rawLinkAccount]);

  const sendVerificationEmail = useCallback(async (firebaseUser: FirebaseUser) => {
    await rawSendVerificationEmail(firebaseUser);
  }, [rawSendVerificationEmail]);

  const resendVerificationEmail = useCallback(async () => {
    await rawResendVerificationEmail();
  }, [rawResendVerificationEmail]);

  const checkEmailVerificationStatus = useCallback(async () => {
    await rawCheckEmailVerificationStatus();
  }, [rawCheckEmailVerificationStatus]);

  const logout = useCallback(
    async () => {
      const reason = 'logout';
      const activeAuthType =
        authSession.authType ||
        resolveAuthSessionTypeFromUser(user) ||
        readStoredAuthSessionMode();

      setAuthSession((current) => ({
        ...current,
        sessionState: 'logging_out',
        logoutReason: reason,
      }));
      setAuthBootstrapState('logging_out');

      try {
        if (auth.currentUser) {
          await logActivity('logout', 'User logged out', 'success', undefined, auth.currentUser.uid);
        }

        if (activeAuthType && auth.currentUser) {
          try {
            await logoutPlatformAuthSession(activeAuthType, reason);
          } catch (error) {
            logger.warn('Session invalidation request failed during logout', {
              area: 'auth',
              event: 'auth-session-logout-invalidation-failed',
              authType: activeAuthType,
              error,
            });
          }
        }

        await signOut(auth);
        clearSessionState({
          logoutReason: reason,
        });
        setAuthBootstrapState('unauthenticated');
        setIsAuthReady(true);
        notify.success('Logged out successfully');
      } catch (error) {
        logger.error('Logout error', { error, reason });
        clearSessionState({
          sessionState: 'invalid',
          logoutReason: reason,
          restoreFailureReason: error instanceof Error ? error.message : String(error),
        });
        setAuthBootstrapState('invalid');
        setIsAuthReady(true);
        notify.error('Logout failed');
      }
    },
    [authSession.authType, clearSessionState, logActivity, notify, user]
  );

  const refreshActiveAuthSession = useCallback(
    async (source: 'refresh' | 'restore' = 'refresh') => {
      const expectedAuthType =
        authSession.authType ||
        resolveAuthSessionTypeFromUser(user) ||
        readStoredAuthSessionMode();

      if (!auth.currentUser || !expectedAuthType) {
        return null;
      }

      try {
        return await establishAuthSession(expectedAuthType, source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const disposition = resolveRefreshFailureDisposition(error);
        logger.warn('Session refresh failed', {
          area: 'auth',
          event: 'auth-session-refresh-failed',
          expectedAuthType,
          source,
          disposition: disposition.classification,
          code: disposition.code,
          status: disposition.status,
          timeoutBudgetMs: runtimeTimeouts.authSessionApiMs,
          error,
        });

        if (disposition.action === 'invalidate') {
          try {
            await signOut(auth);
          } catch {
            // Best-effort sign-out only.
          }

          clearSessionState({
            sessionState: disposition.sessionState,
            logoutReason: disposition.logoutReason,
            restoreFailureReason: message,
          });
          setAuthBootstrapState(disposition.sessionState === 'expired' ? 'expired' : 'invalid');
          setIsAuthReady(true);

          logger.warn('Session refresh invalidated the active session', {
            area: 'auth',
            event: 'auth-session-refresh-invalidated',
            expectedAuthType,
            source,
            disposition: disposition.classification,
            code: disposition.code,
            status: disposition.status,
          });
        } else {
          setAuthSession((current) => ({
            ...current,
            restoreFailureReason: message,
          }));

          logger.info('Transient session refresh failure preserved active session', {
            area: 'auth',
            event: 'auth-session-refresh-preserved',
            expectedAuthType,
            source,
            disposition: disposition.classification,
            code: disposition.code,
            status: disposition.status,
            restoreFailureReason: message,
          });
        }

        throw error;
      }
    },
    [authSession.authType, clearSessionState, establishAuthSession, user]
  );

  const retryAuthBootstrap = useCallback(async () => {
    logger.info('Retrying auth bootstrap', {
      area: 'auth',
      event: 'auth-bootstrap-retry',
      currentUserId: auth.currentUser?.uid || null,
    });

    setAuthBootstrapIssue(null);

    if (!auth.currentUser) {
      clearAuthResolutionTimeout();
      authListenerResolvedRef.current = true;
      clearSessionState();
      setAuthBootstrapState('unauthenticated');
      setIsAuthReady(true);
      return;
    }

    try {
      await runAuthoritativeBootstrap(auth.currentUser, readStoredAuthSessionMode(), 'restore');
    } catch {
      // The authoritative bootstrap path already committed the final state.
    }
  }, [clearAuthResolutionTimeout, clearSessionState, runAuthoritativeBootstrap]);

  const clearStalledAuthSession = useCallback(async () => {
    logger.warn('Clearing stalled auth session', {
      area: 'auth',
      event: 'auth-bootstrap-clear-stalled-session',
      currentUserId: auth.currentUser?.uid || null,
    });

    clearAuthResolutionTimeout();

    try {
      if (auth.currentUser && authSession.authType) {
        await logoutPlatformAuthSession(authSession.authType, 'stalled_session_reset').catch(() => undefined);
      }

      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (error) {
      logger.error('Failed to sign out during stalled-session recovery', {
        area: 'auth',
        event: 'auth-bootstrap-signout-failed',
        error,
      });
    } finally {
      authListenerResolvedRef.current = true;
      setAuthBootstrapIssue(null);
      clearSessionState();
      setAuthBootstrapState('unauthenticated');
      setIsAuthReady(true);
    }
  }, [authSession.authType, clearAuthResolutionTimeout, clearSessionState]);

  /**
   * Auth bootstrap listener
   * ---------------------------------------------------------
   * 2026 best practice:
   * - Firebase hydration must resolve before we guess auth state
   * - backend session validation is authoritative for restore/login readiness
   * - profile hydration is part of the same bounded bootstrap transaction
   */
  useEffect(() => {
    let isMounted = true;

    authListenerResolvedRef.current = false;
    setAuthBootstrapState('bootstrapping');
    setAuthBootstrapIssue(null);
    setIsAuthReady(false);
    clearAuthResolutionTimeout();

    logger.info('Startup bootstrap begin', {
      area: 'auth',
      event: 'auth-startup-begin',
      storedMode: readStoredAuthSessionMode() || 'none',
    });

    authResolutionTimeoutRef.current = window.setTimeout(() => {
      if (!isMounted || authListenerResolvedRef.current) {
        return;
      }

      markAuthBootstrapIssue({
        title: 'Startup is taking longer than expected',
        message:
          'Firebase auth hydration did not resolve in time, so startup paused instead of guessing the session state.',
        detail:
          'Retry startup or reload the page. If this keeps happening, reset the session so stale browser state cannot keep the platform in limbo.',
        reason: 'FIREBASE_HYDRATION_TIMEOUT',
        phase: 'bootstrapping',
      });
    }, INITIAL_AUTH_RESOLUTION_TIMEOUT_MS);

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMounted) {
        return;
      }

      authListenerResolvedRef.current = true;
      clearAuthResolutionTimeout();
      setAuthBootstrapIssue(null);

      if (firebaseUser) {
        logger.info('Firebase auth hydration resolved', {
          area: 'auth',
          event: 'auth-firebase-hydration-resolved',
          currentUserId: firebaseUser.uid,
          storedMode: readStoredAuthSessionMode() || 'none',
        });

        void runAuthoritativeBootstrap(firebaseUser, readStoredAuthSessionMode(), 'restore').catch(() => undefined);
        return;
      }

      logger.info('No Firebase session found during startup', {
        area: 'auth',
        event: 'auth-bootstrap-no-session',
      });

      clearSessionState();
      setAuthBootstrapState('unauthenticated');
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      clearAuthResolutionTimeout();
      unsubscribeAuth();
    };
  }, [clearAuthResolutionTimeout, clearSessionState, markAuthBootstrapIssue, runAuthoritativeBootstrap]);

  useEffect(() => {
    if (authSession.sessionState !== 'authenticated' || !authSession.expiresAt) {
      return;
    }

    const expiresAtMs = new Date(authSession.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      return;
    }

    const expireCurrentSession = async () => {
      logger.warn('Active auth session reached its hard expiry', {
        area: 'auth',
        event: 'auth-session-hard-expired',
        mode: authSession.authType,
        expiresAt: authSession.expiresAt,
        currentUserId: auth.currentUser?.uid || null,
      });

      try {
        if (auth.currentUser && authSession.authType) {
          await logoutPlatformAuthSession(authSession.authType, 'session_expired').catch(() => undefined);
        }

        if (auth.currentUser) {
          await signOut(auth);
        }
      } finally {
        clearSessionState({
          sessionState: 'expired',
          logoutReason: 'session_expired',
          restoreFailureReason: 'Session expired. Please sign in again.',
        });
        setAuthBootstrapState('expired');
        setIsAuthReady(true);
        notify.warning('Your 3-hour session expired. Please sign in again.');
      }
    };

    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      void expireCurrentSession();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void expireCurrentSession();
    }, remainingMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    authSession.authType,
    authSession.expiresAt,
    authSession.sessionState,
    clearSessionState,
    notify,
  ]);

  useEffect(() => {
    if (!user?.id || !auth.currentUser || authSession.sessionState !== 'authenticated') {
      return;
    }

    let lastRefreshAt = 0;

    const maybeRefreshSession = (trigger: 'focus' | 'visibilitychange') => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return;
      }

      if (Date.now() - lastRefreshAt < AUTH_SESSION_REENTRY_REFRESH_INTERVAL_MS) {
        return;
      }

      lastRefreshAt = Date.now();
      logger.info('Session refresh triggered from browser re-entry', {
        area: 'auth',
        event: 'auth-session-reentry-refresh-triggered',
        trigger,
        currentUserId: user.id,
        authType: authSession.authType,
        sessionState: authSession.sessionState,
        timeoutBudgetMs: runtimeTimeouts.authSessionApiMs,
      });
      void refreshActiveAuthSession('refresh').catch(() => undefined);
    };

    const handleWindowFocus = () => maybeRefreshSession('focus');
    const handleVisibilityChange = () => maybeRefreshSession('visibilitychange');

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authSession.authType, authSession.sessionState, refreshActiveAuthSession, user?.id]);

  /**
   * Context value is memoized to reduce downstream re-renders.
   * This is especially important because the provider sits high in the tree.
   */
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      authMode,
      authSession,
      sessionScopeKey,
      activities,
      allUsers,
      userRequests,

      models,
      selectedModelId,

      platformApiKey,
      qwenApiKey,
      qwenRegion,
      qwenBaseUrl,

      login,
      loginWithIdentifier,
      register,
      adminLogin,
      checkUsernameAvailability,
      logout,

      logActivity,

      isAuthenticated,
      isAdmin,
      isAuthReady,
      isProfileHydrating,
      authBootstrapState,
      authBootstrapIssue,
      retryAuthBootstrap,
      clearStalledAuthSession,

      updateUser,
      deleteUser,
      createUser,

      submitRequest,
      updateRequest,

      checkLimit,
      deductCredits,
      incrementUsage,

      updateModel,
      addModel,
      deleteModel,
      selectModel,
      getModelConfig,
      getActiveModel,
      validateModel,

      setPlatformApiKey,
      setQwenApiKey,
      setQwenRegion,
      setQwenBaseUrl,

      refreshModels,
      validateQwenModels,
      testQwenConnection,
      testGoogleConnection,

      appError,
      clearError,
      handleError,
      notify,

      forgotPassword,
      updatePassword,
      linkAccount,
      sendVerificationEmail,
      resendVerificationEmail,
      checkEmailVerificationStatus,

      updateUserProfile,
      updateUserSettings,
      updateAdminSettings,

      approveUser,
      rejectUser,
      suspendUser,
      blockUser,
      reactivateUser,
      updateUserCredits,
    }),
    [
      user,
      authMode,
      authSession,
      sessionScopeKey,
      activities,
      allUsers,
      userRequests,
      models,
      selectedModelId,
      platformApiKey,
      qwenApiKey,
      qwenRegion,
      qwenBaseUrl,
      login,
      loginWithIdentifier,
      register,
      adminLogin,
      checkUsernameAvailability,
      logout,
      logActivity,
      isAuthenticated,
      isAdmin,
      isAuthReady,
      isProfileHydrating,
      authBootstrapState,
      authBootstrapIssue,
      retryAuthBootstrap,
      clearStalledAuthSession,
      updateUser,
      deleteUser,
      createUser,
      submitRequest,
      updateRequest,
      checkLimit,
      deductCredits,
      incrementUsage,
      updateModel,
      addModel,
      deleteModel,
      selectModel,
      getModelConfig,
      getActiveModel,
      validateModel,
      setPlatformApiKey,
      setQwenApiKey,
      setQwenRegion,
      setQwenBaseUrl,
      refreshModels,
      validateQwenModels,
      testQwenConnection,
      testGoogleConnection,
      appError,
      clearError,
      handleError,
      notify,
      forgotPassword,
      updatePassword,
      linkAccount,
      sendVerificationEmail,
      resendVerificationEmail,
      checkEmailVerificationStatus,
      updateUserProfile,
      updateUserSettings,
      updateAdminSettings,
      approveUser,
      rejectUser,
      suspendUser,
      blockUser,
      reactivateUser,
      updateUserCredits,
    ]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
