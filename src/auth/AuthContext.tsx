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
import { safeLocalStorageRemoveItem } from '../utils/browserStorage';

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
  logout: () => void;

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
  const clearSessionState = useCallback(() => {
    setUser(null);
    setActivities([]);
    setUserRequests([]);
    setAllUsers([]);
    setPendingFirebaseSession(null);

    const keysToClear = [
      'zootopia_admin_session',
      'zootopia_models',
      'zootopia_selected_model',
      'zootopia_qwen_api_key',
      'zootopia_qwen_region',
      'zootopia_qwen_base_url',
      'zootopia_platform_api_key',
      'zootopia_session_expiry',
    ];

    keysToClear.forEach((key) => safeLocalStorageRemoveItem(key));
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
    login,
    loginWithIdentifier,
    register,
    adminLogin,
    logout,
    forgotPassword,
    updatePassword,
    linkAccount,
    sendVerificationEmail,
    resendVerificationEmail,
    checkEmailVerificationStatus,
    syncUserWithFirestore,
  } = useAuthActions(
    setUser,
    logActivity,
    updateUser,
    checkUsernameAvailability,
    clearSessionState,
    notify
  );

  const syncUserWithFirestoreRef = React.useRef(syncUserWithFirestore);

  useEffect(() => {
    syncUserWithFirestoreRef.current = syncUserWithFirestore;
  }, [syncUserWithFirestore]);

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
      await syncUserWithFirestore(auth.currentUser);
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
    syncUserWithFirestore,
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
  }, [clearAuthResolutionTimeout, clearProfileSyncTimeout, clearSessionState]);

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

        void syncUserWithFirestoreRef.current(firebaseUser).catch((error) => {
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

  /**
   * Context value is memoized to reduce downstream re-renders.
   * This is especially important because the provider sits high in the tree.
   */
  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
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
