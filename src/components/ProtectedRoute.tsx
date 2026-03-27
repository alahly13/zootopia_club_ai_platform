import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { isPrimaryAdminUser } from '../auth/accessControl';
import { FastAccessLockedState } from './FastAccessLockedState';
import { isFacultyFastAccessUser, isFastAccessPathAllowed } from '../constants/fastAccessPolicy';
import { AppStartupRecovery } from './AppStartupRecovery';

const FAST_ACCESS_ENTITLEMENT_PATH_TO_PAGE_ID: Record<string, string> = {
  '/': 'generate',
  // `/generate` must remain entitlement-equivalent to `/` because both routes
  // intentionally represent the same Assessment entry surface.
  '/generate': 'generate',
  // `/analysis` is the full-page view of the same shared upload/analysis
  // workflow. Keep its entitlement aligned with the generator entry instead of
  // treating it as a broader temporary-access surface.
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
    authBootstrapIssue,
    retryAuthBootstrap,
    clearStalledAuthSession,
  } = useAuth();
  const location = useLocation();
  const isPrimaryAdmin = isPrimaryAdminUser(user);
  const authProviders = Array.isArray(user?.authProviders) ? user.authProviders : [];

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authBootstrapIssue) {
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
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  if (primaryAdminOnly && !isPrimaryAdmin) {
    return <Navigate to="/" replace />;
  }

  if (user && !user.isVerified && !isAdmin && !authProviders.includes('google.com')) {
    return <Navigate to="/verify-email" replace />;
  }

  if (user && !isAdmin) {
    if (user.status === 'PendingEmailVerification') {
      return <Navigate to="/verify-email" replace />;
    }
    if (user.status === 'PendingAdminApproval') {
      return <Navigate to="/waiting-approval" replace />;
    }
    if (user.status === 'Rejected') {
      return <Navigate to="/account-rejected" replace />;
    }
    if (user.status === 'Suspended') {
      return <Navigate to="/account-suspended" replace />;
    }
    if (user.status === 'Blocked') {
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
    return <FastAccessLockedState pageLabel={location.pathname.replace('/', '') || 'this area'} />;
  }

  const requiredEntitlementPageId = FAST_ACCESS_ENTITLEMENT_PATH_TO_PAGE_ID[location.pathname];
  if (
    isFacultyFastAccessUser(user) &&
    requiredEntitlementPageId &&
    !user?.unlockedPages?.includes(requiredEntitlementPageId)
  ) {
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
    (user?.fastAccessCredits ?? 0) <= 0 &&
    location.pathname !== '/account'
  ) {
    return <FastAccessLockedState pageLabel={location.pathname.replace('/', '') || 'this area'} />;
  }

  return <>{children}</>;
};
