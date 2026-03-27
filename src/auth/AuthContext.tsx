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
  authBootstrapState: 'restoring' | 'syncing_profile' | 'ready' | 'recoverable_error';
  authBootstrapIssue: {
    title: string;
    message: string;
    detail?: string;
  } | null;
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

const INITIAL_AUTH_RESOLUTION_TIMEOUT_MS = 8_000;
const AUTH_PROFILE_SYNC_TIMEOUT_MS = 10_000;
const AUTH_SESSION_REENTRY_REFRESH_INTERVAL_MS = 5 * 60_000;

const AuthContext = createContext<AuthContextType | undefined>(undefined);
AuthContext.displayName = 'AuthContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Core auth/session state
   */
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authBootstrapState, setAuthBootstrapState] = useState<AuthContextType['authBootstrapState']>('restoring');
  const [authBootstrapIssue, setAuthBootstrapIssue] = useState<AuthContextType['authBootstrapIssue']>(null);
  const [pendingFirebaseSession, setPendingFirebaseSession] = useState<{
    uid: string;
    email: string | null;
  } | null>(null);
  const [authSession, setAuthSession] = useState<AuthSessionState>(() => {
    const storedAuthMode = readStoredAuthSessionMode();
    const storedSession = storedAuthMode ? getAuthSessionManager(storedAuthMode).load() : null;

    if (!storedSession) {
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
  const isAdmin = isUserAdmin(user);
  const isAuthenticated = !!user || !!pendingFirebaseSession;
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
  const profileSyncTimeoutRef = React.useRef<number | null>(null);

  const clearAuthResolutionTimeout = useCallback(() => {
    if (authResolutionTimeoutRef.current !== null) {
      window.clearTimeout(authResolutionTimeoutRef.current);
      authResolutionTimeoutRef.current = null;
    }
  }, []);

  const clearProfileSyncTimeout = useCallback(() => {
    if (profileSyncTimeoutRef.current !== null) {
      window.clearTimeout(profileSyncTimeoutRef.current);
      profileSyncTimeoutRef.current = null;
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
        authType: nextSession.authType,
        sessionState: nextSession.sessionState,
        sessionScopeKey,
        rehydrationStatus: nextSession.rehydrationStatus,
      });

      return nextSession;
    },
    []
  );

  const markAuthBootstrapIssue = useCallback(
    (title: string, message: string, detail?: string) => {
      logger.error('Auth bootstrap entered recovery mode', {
        area: 'auth',
        event: 'auth-bootstrap-recoverable-error',
        title,
        message,
        detail,
        currentUserId: auth.currentUser?.uid || null,
      });

      setAuthBootstrapState('recoverable_error');
      setAuthBootstrapIssue({
        title,
        message,
        detail,
      });
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
    setUser(null);
    setActivities([]);
    setUserRequests([]);
    setAllUsers([]);
    setPendingFirebaseSession(null);
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
    logger.info('Session state cleared');
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
    setUser,
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

      return nextSession;
    },
    [applyServerAuthSession, clearSessionState, resolveAuthModeMismatchMessage]
  );

  const syncUserAndSession = useCallback(
    async (
      firebaseUser: FirebaseUser,
      expectedAuthType: AuthSessionType | null | undefined,
      source: 'login' | 'restore'
    ) => {
      await rawSyncUserWithFirestore(firebaseUser);
      await establishAuthSession(expectedAuthType, source);
    },
    [establishAuthSession, rawSyncUserWithFirestore]
  );

  const syncUserAndSessionRef = React.useRef(syncUserAndSession);

  useEffect(() => {
    syncUserAndSessionRef.current = syncUserAndSession;
  }, [syncUserAndSession]);

  const login = useCallback(async (firebaseUser: FirebaseUser) => {
    writeStoredAuthSessionMode('normal');

    try {
      await rawLogin(firebaseUser);
      await establishAuthSession('normal', 'login');
    } catch (error) {
      clearStoredAuthSessionMode();
      throw error;
    }
  }, [establishAuthSession, rawLogin]);

  const loginWithIdentifier = useCallback(async (identifier: string, password: string) => {
    writeStoredAuthSessionMode('normal');

    try {
      await rawLoginWithIdentifier(identifier, password);
      await establishAuthSession('normal', 'login');
    } catch (error) {
      clearStoredAuthSessionMode();
      throw error;
    }
  }, [establishAuthSession, rawLoginWithIdentifier]);

  const register = useCallback(async (email: string, password: string, userData: Partial<User>) => {
    await rawRegister(email, password, userData);
  }, [rawRegister]);

  const adminLogin = useCallback(async (identifier: string, password: string) => {
    writeStoredAuthSessionMode('admin');

    try {
      const success = await rawAdminLogin(identifier, password);
      if (!success) {
        clearStoredAuthSessionMode();
        return false;
      }

      await establishAuthSession('admin', 'login');
      return true;
    } catch (error) {
      clearStoredAuthSessionMode();
      throw error;
    }
  }, [establishAuthSession, rawAdminLogin]);

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
        notify.success('Logged out successfully');
      } catch (error) {
        logger.error('Logout error', { error, reason });
        clearSessionState({
          sessionState: 'invalid',
          logoutReason: reason,
          restoreFailureReason: error instanceof Error ? error.message : String(error),
        });
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
        logger.warn('Session refresh failed', {
          area: 'auth',
          event: 'auth-session-refresh-failed',
          expectedAuthType,
          error,
        });

        if (/session|sign in|authentication/i.test(message)) {
          try {
            await signOut(auth);
          } catch {
            // Best-effort sign-out only.
          }

          clearSessionState({
            sessionState: 'invalid',
            restoreFailureReason: message,
          });
        } else {
          setAuthSession((current) => ({
            ...current,
            restoreFailureReason: message,
          }));
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
      clearProfileSyncTimeout();
      clearAuthResolutionTimeout();
      authListenerResolvedRef.current = true;
      clearSessionState();
      setAuthBootstrapState('ready');
      setIsAuthReady(true);
      return;
    }

    setPendingFirebaseSession({
      uid: auth.currentUser.uid,
      email: auth.currentUser.email ?? null,
    });
    setAuthBootstrapState('syncing_profile');
    setIsAuthReady(true);
    clearProfileSyncTimeout();
    profileSyncTimeoutRef.current = window.setTimeout(() => {
      markAuthBootstrapIssue(
        'Session restore is still incomplete',
        'We restored your Firebase session, but your workspace profile did not finish loading in time.',
        'Retry startup or reset the session if the problem keeps happening.'
      );
    }, AUTH_PROFILE_SYNC_TIMEOUT_MS);

    try {
      await syncUserAndSession(auth.currentUser, readStoredAuthSessionMode(), 'restore');
    } catch (error) {
      markAuthBootstrapIssue(
        'Session restore failed',
        'We could not finish restoring your workspace session.',
        error instanceof Error ? error.message : String(error)
      );
    }
  }, [
    clearAuthResolutionTimeout,
    clearProfileSyncTimeout,
    clearSessionState,
    markAuthBootstrapIssue,
    syncUserAndSession,
  ]);

  const clearStalledAuthSession = useCallback(async () => {
    logger.warn('Clearing stalled auth session', {
      area: 'auth',
      event: 'auth-bootstrap-clear-stalled-session',
      currentUserId: auth.currentUser?.uid || null,
    });

    clearAuthResolutionTimeout();
    clearProfileSyncTimeout();

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
      setAuthBootstrapState('ready');
      setIsAuthReady(true);
    }
  }, [authSession.authType, clearAuthResolutionTimeout, clearProfileSyncTimeout, clearSessionState]);

  /**
   * Auth bootstrap listener
   * ---------------------------------------------------------
   * 2026 best practice:
   * - resolve the base Firebase session quickly so routing does not stall
   * - keep profile sync observable and separately time-bounded
   * - never let remote sync work trap the whole app on a blank startup shell
   */
  useEffect(() => {
    let isMounted = true;

    authListenerResolvedRef.current = false;
    setAuthBootstrapState('restoring');
    setAuthBootstrapIssue(null);
    clearAuthResolutionTimeout();
    clearProfileSyncTimeout();

    authResolutionTimeoutRef.current = window.setTimeout(() => {
      if (!isMounted || authListenerResolvedRef.current) {
        return;
      }

      markAuthBootstrapIssue(
        'Startup is taking longer than expected',
        'We could not confirm your session in time, so the platform paused startup instead of staying on a blank screen.',
        'Retry startup or reload the page. If this keeps happening, resetting the session usually restores normal entry.'
      );
    }, INITIAL_AUTH_RESOLUTION_TIMEOUT_MS);

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (!isMounted) {
        return;
      }

      authListenerResolvedRef.current = true;
      clearAuthResolutionTimeout();
      setAuthBootstrapIssue(null);

      if (firebaseUser) {
        logger.info('Firebase session restored, starting profile sync', {
          area: 'auth',
          event: 'auth-bootstrap-session-restored',
          userId: firebaseUser.uid,
        });

        /**
         * Keep the authenticated shell renderable as soon as Firebase resolves
         * the session. Firestore/profile hydration is important, but it must no
         * longer hold the entire app hostage behind the initial startup gate.
         */
        setPendingFirebaseSession({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? null,
        });
        setAuthBootstrapState('syncing_profile');
        setIsAuthReady(true);

        clearProfileSyncTimeout();
        profileSyncTimeoutRef.current = window.setTimeout(() => {
          if (!isMounted) {
            return;
          }

          markAuthBootstrapIssue(
            'Session restore is still incomplete',
            'Your Firebase session came back, but your workspace profile did not finish restoring.',
            'You can retry startup or reset the session without losing the rest of the app shell.'
          );
        }, AUTH_PROFILE_SYNC_TIMEOUT_MS);

        void syncUserAndSessionRef.current(firebaseUser, readStoredAuthSessionMode(), 'restore').catch((error) => {
          if (!isMounted) {
            return;
          }

          logger.error('Auth profile sync failed during bootstrap', {
            area: 'auth',
            event: 'auth-bootstrap-profile-sync-failed',
            userId: firebaseUser.uid,
            error,
          });
          markAuthBootstrapIssue(
            'Session restore failed',
            'We restored your Firebase session but could not finish loading your workspace profile.',
            error instanceof Error ? error.message : String(error)
          );
        });

        return;
      }

      logger.info('No Firebase session found during startup', {
        area: 'auth',
        event: 'auth-bootstrap-no-session',
      });

      clearProfileSyncTimeout();
      clearSessionState();
      setAuthBootstrapState('ready');
      setIsAuthReady(true);
    });

    return () => {
      isMounted = false;
      clearAuthResolutionTimeout();
      clearProfileSyncTimeout();
      unsubscribeAuth();
    };
  }, [
    clearAuthResolutionTimeout,
    clearProfileSyncTimeout,
    clearSessionState,
    markAuthBootstrapIssue,
    syncUserAndSessionRef,
  ]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    logger.info('Workspace profile sync completed', {
      area: 'auth',
      event: 'auth-bootstrap-profile-sync-completed',
      userId: user.id,
    });

    clearProfileSyncTimeout();
    setPendingFirebaseSession(null);
    setAuthBootstrapIssue(null);
    setAuthBootstrapState('ready');
    setIsAuthReady(true);
  }, [clearProfileSyncTimeout, user?.id]);

  useEffect(() => {
    if (!user?.id || !auth.currentUser || authSession.sessionState !== 'authenticated') {
      return;
    }

    let lastRefreshAt = 0;

    const maybeRefreshSession = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') {
        return;
      }

      if (Date.now() - lastRefreshAt < AUTH_SESSION_REENTRY_REFRESH_INTERVAL_MS) {
        return;
      }

      lastRefreshAt = Date.now();
      void refreshActiveAuthSession('refresh').catch(() => undefined);
    };

    window.addEventListener('focus', maybeRefreshSession);
    document.addEventListener('visibilitychange', maybeRefreshSession);

    return () => {
      window.removeEventListener('focus', maybeRefreshSession);
      document.removeEventListener('visibilitychange', maybeRefreshSession);
    };
  }, [authSession.sessionState, refreshActiveAuthSession, user?.id]);

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
