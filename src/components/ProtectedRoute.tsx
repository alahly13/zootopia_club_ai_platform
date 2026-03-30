import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isPrimaryAdminUser } from '../auth/accessControl';
import { FastAccessLockedState } from './FastAccessLockedState';
import {
  isFacultyFastAccessUser,
  isFastAccessPathAllowed,
  isFastAccessProfileCompletionPending,
} from '../constants/fastAccessPolicy';
import { AppStartupRecovery } from './AppStartupRecovery';
import { logger } from '../utils/logger';

const FAST_ACCESS_ENTITLEMENT_PATH_TO_PAGE_ID: Record<string, string> = {
  '/': 'generate',
  '/home': 'generate',
  // `/generate` must remain entitlement-equivalent to `/home` because both
  // routes are part of the same upload-to-assessment workspace family.
  '/generate': 'generate',
  // `/analysis` is the full-page view of the same shared document workflow.
  // Keep its entitlement aligned with the upload/generator surface instead of
  // treating it as a broader temporary-access area.
  '/analysis': 'generate',
  '/infographic': 'infographic',
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  adminOnly?: boolean;
  primaryAdminOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  adminOnly = false,
  primaryAdminOnly = false
}) => {
  const {
    user,
    isAuthenticated,
    isAuthReady,
    isAdmin,
    authMode,
    authBootstrapState,
    authBootstrapIssue,
    retryAuthBootstrap,
    clearStalledAuthSession,
  } = useAuth();
  const location = useLocation();
  const isPrimaryAdmin = isPrimaryAdminUser(user);
  const authProviders = Array.isArray(user?.authProviders) ? user.authProviders : [];
  const lastGateLogKeyRef = React.useRef<string | null>(null);

  const logGateDecision = React.useCallback(
    (gate: string, extra: Record<string, unknown> = {}) => {
      const payload = {
        area: 'routing',
        event: 'protected-route-gate',
        route: location.pathname,
        gate,
        mode: authMode || 'none',
        admin: isAdmin,
        authReady: isAuthReady,
        startupPhase: authBootstrapState,
        ...extra,
      };
      const logKey = JSON.stringify(payload);
      if (lastGateLogKeyRef.current === logKey) {
        return;
      }

      lastGateLogKeyRef.current = logKey;

      if (gate === 'allow') {
        logger.info('Protected route gate allowed', payload);
        return;
      }

      logger.warn('Protected route gate redirected or blocked', payload);
    },
    [authBootstrapState, authMode, isAdmin, isAuthReady, location.pathname]
  );

  /**
   * ARCHITECTURE GUARD (Route Protection)
   * ------------------------------------------------------------------
   * Frontend route guards are UX constraints, not security boundaries.
   * Keep these checks aligned with backend authorization rules:
   * - adminOnly => requires resolved admin identity
   * - primaryAdminOnly => requires admin identity + primary level
   *
   * Never rely on hidden links/components as access control.
   */
  if (!isAuthReady) {
    logGateDecision('waiting_for_bootstrap');
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authBootstrapIssue) {
    logGateDecision('startup_recovery', {
      reason: authBootstrapIssue.reason,
      phase: authBootstrapIssue.phase,
    });
    return (
      <AppStartupRecovery
        title={authBootstrapIssue.title}
        message={authBootstrapIssue.message}
        detail={authBootstrapIssue.detail}
        onRetry={retryAuthBootstrap}
        onClearSession={clearStalledAuthSession}
      />
    );
  }

  if (!isAuthenticated) {
    logGateDecision('redirect_login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && (!isAdmin || authMode !== 'admin')) {
    logGateDecision('redirect_not_admin');
    return <Navigate to="/" replace />;
  }

  if (primaryAdminOnly && (!isPrimaryAdmin || authMode !== 'admin')) {
    logGateDecision('redirect_not_primary_admin');
    return <Navigate to="/" replace />;
  }

  if (user && !user.isVerified && !isAdmin && !authProviders.includes('google.com')) {
    logGateDecision('redirect_verify_email');
    return <Navigate to="/verify-email" replace />;
  }

  if (user && !isAdmin) {
    if (user.status === 'PendingEmailVerification') {
      logGateDecision('redirect_pending_email_verification');
      return <Navigate to="/verify-email" replace />;
    }
    if (user.status === 'PendingAdminApproval') {
      logGateDecision('redirect_pending_admin_approval');
      return <Navigate to="/waiting-approval" replace />;
    }
    if (user.status === 'Rejected') {
      logGateDecision('redirect_rejected');
      return <Navigate to="/account-rejected" replace />;
    }
    if (user.status === 'Suspended') {
      logGateDecision('redirect_suspended');
      return <Navigate to="/account-suspended" replace />;
    }
    if (user.status === 'Blocked') {
      logGateDecision('redirect_blocked');
      return <Navigate to="/account-blocked" replace />;
    }
  }

  /**
   * ARCHITECTURE SAFETY NOTE (Temporary Access Isolation)
   * ------------------------------------------------------------------
   * Temporary Faculty fast-access users must remain restricted to a very
   * narrow route surface. Do not weaken this check by relying only on hidden
   * nav links; direct URL navigation must also be blocked here.
   */
  if (isFacultyFastAccessUser(user) && !isFastAccessPathAllowed(location.pathname)) {
    logGateDecision('fast_access_locked_path');
    return <FastAccessLockedState pageLabel={location.pathname.replace('/', '') || 'this area'} />;
  }

  const requiredEntitlementPageId = FAST_ACCESS_ENTITLEMENT_PATH_TO_PAGE_ID[location.pathname];
  if (
    isFacultyFastAccessUser(user) &&
    requiredEntitlementPageId &&
    !user?.unlockedPages?.includes(requiredEntitlementPageId)
  ) {
    logGateDecision('fast_access_missing_entitlement', {
      requiredPage: requiredEntitlementPageId,
    });
    return <Navigate to="/account" replace />;
  }

  /**
   * ARCHITECTURE GUARD (Zero-Credit Conversion Flow)
   * ------------------------------------------------------------------
   * Once temporary fast-access credits reach zero, route experience must
   * converge on conversion completion instead of letting users roam tool pages.
   * Keep `/account` open as the explicit upgrade/conversion path.
   */
  if (
    isFacultyFastAccessUser(user) &&
    !isFastAccessProfileCompletionPending(user) &&
    (user?.fastAccessCredits ?? 0) <= 0 &&
    location.pathname !== '/account'
  ) {
    logGateDecision('fast_access_zero_credit_lock');
    return <FastAccessLockedState pageLabel={location.pathname.replace('/', '') || 'this area'} />;
  }

  logGateDecision('allow');
  return <>{children}</>;
};
