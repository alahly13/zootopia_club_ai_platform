/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import * as React from 'react';
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, BrowserRouter, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './themes/ThemeProvider';
import { NotificationProvider } from './notifications/NotificationContext';
import { ToastProvider } from './notifications/ToastProvider';
import { LanguageProvider } from './contexts/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import { MainLayout } from './components/MainLayout';
import { AuthScopedDocumentBoundary } from './components/AuthScopedDocumentBoundary';
import { Dashboard } from './features/assessment-tool';
import { AppStartupRecovery } from './components/AppStartupRecovery';
import Login from './auth/Login';
import EmailVerification from './auth/EmailVerification';
import { AccountStatus } from './auth/AccountStatus';
import { WelcomePopup } from './components/WelcomePopup';
import { LazyWorkspaceRouteBoundary } from './components/LazyWorkspaceRouteBoundary';
import { useStatus } from './hooks/useStatus';
import { useLanguage } from './contexts/LanguageContext';
import toast from 'react-hot-toast';
import { logger } from './utils/logger';
import { DocumentProvider } from './contexts/DocumentContext';
import type { User } from './utils';
import { SidebarProvider } from './components/SidebarContext';
import { auth } from './firebase';
import { getPaymentSessionId } from './utils/validators';
import { cancelScheduledTask, scheduleNonCriticalTask } from './utils/browserTasks';
import { useRouteScrollReset } from './hooks/useRouteScrollReset';
import {
  PopupOrchestratorProvider,
  usePopupBlocker,
  usePopupOrchestrator,
} from './contexts/PopupOrchestratorContext';
import {
  CREDIT_REQUEST_FLOW_ID,
  POPUP_FLOW_PRIORITY,
  REQUIRED_ACCOUNT_COMPLETION_FLOW_ID,
  WELCOME_AUTO_FLOW_ID,
  WELCOME_MANUAL_FLOW_ID,
  isWelcomeFlowId,
} from './constants/popupFlows';
import { isFacultyFastAccessUser, isFastAccessProfileCompletionPending } from './constants/fastAccessPolicy';
import { FastAccessProfileCompletionModal } from './auth/FastAccessProfileCompletionModal';
import {
  workspaceRoutes,
  PRIMARY_WORKSPACE_ROUTE_IDS,
  SECONDARY_WORKSPACE_ROUTE_IDS,
  ADMIN_WORKSPACE_ROUTE_IDS,
  preloadWorkspaceRoutes,
} from './routing/workspaceRoutes';

/**
 * IMPORTANT ARCHITECTURE RULE
 * ------------------------------------------------------------------
 * DocumentProvider must remain mounted at the application shell level,
 * outside any single tool route or analysis panel route/state.
 *
 * Reason:
 * - Uploaded files are global app resources, not local analysis-panel resources.
 * - Closing / hiding the analysis side panel must NOT clear uploaded documents.
 * - Replacing / removing an uploaded file must happen only through explicit
 *   document actions in the document system itself.
 * - All tools must be able to access the same uploaded document context.
 *
 * DO NOT move DocumentProvider inside Dashboard, MainLayout, analysis drawer,
 * or any individual tool page.
 */

const CreditRequestModal = React.lazy(() => import('./components/CreditRequestModal'));

const renderLazyRoute = (
  routeId: string,
  routeLabel: string,
  element: React.ReactNode,
  fullscreen = false
) => (
  <LazyWorkspaceRouteBoundary routeId={routeId} routeLabel={routeLabel} fullscreen={fullscreen}>
    {element}
  </LazyWorkspaceRouteBoundary>
);

const PaymentVerifier = () => {
  const { user, logActivity } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const verifiedSessionsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    const verifySession = async () => {
      const params = new URLSearchParams(location.search);
      const currentPath = location.pathname.toLowerCase();
      if (currentPath.startsWith('/billing') || currentPath.startsWith('/donation')) {
        return;
      }

      const sessionId = getPaymentSessionId(params);

      if (sessionId && user) {
        if (verifiedSessionsRef.current.has(sessionId)) {
          return;
        }

        verifiedSessionsRef.current.add(sessionId);

        try {
          const idToken = await auth.currentUser?.getIdToken();
          const response = await fetch('/api/billing/verify-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
            },
            body: JSON.stringify({ sessionId }),
          });

          if (!response.ok) {
            throw new Error(`Verification request failed with status ${response.status}`);
          }

          const data = await response.json();

          if (data.success && data.data) {
            const paymentData = data.data;
            const paymentState = String(data.paymentState || paymentData.status || '').toLowerCase();

            if (paymentState === 'success') {
              if (paymentData.mode === 'subscription') {
                toast.success(t('subscriptionSuccess', { plan: paymentData.planId }));
                logActivity('subscription_updated', `Upgraded to ${paymentData.planId} plan`);
              } else if (paymentData.mode === 'payment') {
                toast.success(
                  t('donationSuccess', { amount: (paymentData.amount / 100).toFixed(2) })
                );
                logActivity(
                  'donation_made',
                  `Donated $${(paymentData.amount / 100).toFixed(2)}`
                );
              }

              // Clean the URL after successful verification
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } else {
            logger.warn('Payment verification returned non-success payload', { sessionId, data });
          }
        } catch (error) {
          verifiedSessionsRef.current.delete(sessionId);
          logger.error('Session verification failed:', error);
        }
      }
    };

    verifySession();
  }, [user, location.search, logActivity, t]);

  return null;
};

const SHARED_ASSESSMENT_ENTRY_PATH = '/generate';
const ADMIN_ONLY_PATH_PREFIXES = [
  '/admin',
  '/communication-center',
  '/admin-settings',
] as const;

function resolveRequestedPath(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('from' in state)) {
    return null;
  }

  const from = (state as {
    from?: { pathname?: unknown; search?: unknown; hash?: unknown };
  }).from;

  if (!from || typeof from !== 'object') {
    return null;
  }

  const pathname = typeof from.pathname === 'string' ? from.pathname : '';
  if (!pathname.startsWith('/')) {
    return null;
  }

  const search = typeof from.search === 'string' ? from.search : '';
  const hash = typeof from.hash === 'string' ? from.hash : '';

  return `${pathname}${search}${hash}`;
}

function resolvePostAuthPath(input: {
  isAdmin: boolean;
  authMode: 'normal' | 'fast_access' | 'admin' | null;
  user: User | null;
  state: unknown;
}): string {
  const requestedPath = resolveRequestedPath(input.state);

  /**
   * ROUTING CONTRACT
   * ------------------------------------------------------------------
   * The shared Assessment / Quiz Generator is the stable authenticated
   * entry surface for both admins and normal users. Admin authority stays
   * intact through dedicated admin routes and backend checks, not by forcing
   * `/admin` as the default landing page for every restored session.
   *
  * Preserve explicit deep links when they are safe:
  * - returning to a previously requested in-app route is allowed
  * - admin-only routes still require admin identity
  * - invalid or ambiguous login redirects collapse to the shared generator
  */
  if (!requestedPath || requestedPath === '/' || requestedPath === '/login') {
    if (input.authMode === 'admin') {
      return '/admin';
    }

    if (
      isFacultyFastAccessUser(input.user) &&
      (
        isFastAccessProfileCompletionPending(input.user) ||
        (input.user?.fastAccessCredits ?? 0) <= 0
      )
    ) {
      return '/account';
    }

    return SHARED_ASSESSMENT_ENTRY_PATH;
  }

  const isAdminOnlyPath = ADMIN_ONLY_PATH_PREFIXES.some(
    (pathPrefix) => requestedPath === pathPrefix || requestedPath.startsWith(`${pathPrefix}/`)
  );

  if (isAdminOnlyPath && !input.isAdmin) {
    return SHARED_ASSESSMENT_ENTRY_PATH;
  }

  return requestedPath;
}

const LoginRouteGuard: React.FC = () => {
  const {
    user,
    authMode,
    isAuthenticated,
    isAuthReady,
    isAdmin,
    authBootstrapState,
    authBootstrapIssue,
    retryAuthBootstrap,
    clearStalledAuthSession,
  } = useAuth();
  const location = useLocation();
  const lastRouteGuardLogRef = React.useRef<string | null>(null);

  const logRouteGuardDecision = React.useCallback(
    (gate: string, extra: Record<string, unknown> = {}) => {
      const payload = {
        area: 'routing',
        event: 'login-route-gate',
        route: location.pathname,
        gate,
        mode: authMode || 'none',
        admin: isAdmin,
        authReady: isAuthReady,
        startupPhase: authBootstrapState,
        ...extra,
      };
      const logKey = JSON.stringify(payload);
      if (lastRouteGuardLogRef.current === logKey) {
        return;
      }

      lastRouteGuardLogRef.current = logKey;

      if (gate === 'render_login') {
        logger.info('Login route guard rendered login screen', payload);
        return;
      }

      logger.warn('Login route guard redirected or blocked', payload);
    },
    [authBootstrapState, authMode, isAdmin, isAuthReady, location.pathname]
  );

  /**
   * SECURITY-SENSITIVE ROUTING NOTE
   * ------------------------------------------------------------------
   * Authenticated sessions must never remain on `/login` because it causes
   * role-based landing ambiguity (especially after refresh/session restore).
   *
   * Keep this post-auth redirect deterministic:
   * - preserve a safe requested in-app path when available
   * - otherwise land on the shared Assessment generator entry page
   */
  if (!isAuthReady) {
    logRouteGuardDecision('waiting_for_bootstrap');
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (authBootstrapIssue) {
    logRouteGuardDecision('startup_recovery', {
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

  if (isAuthenticated) {
    const nextPath = resolvePostAuthPath({ isAdmin, authMode, user, state: location.state });
    logRouteGuardDecision('redirect_authenticated', {
      destination: nextPath,
    });
    return <Navigate to={nextPath} replace />;
  }

  logRouteGuardDecision('render_login');
  return <Login />;
};

const RoleAwareHome: React.FC = () => {
  /**
   * WORKFLOW-CRITICAL ROUTING NOTE
   * ------------------------------------------------------------------
   * `/` remains a compatibility alias because many legacy flows still navigate
   * there after auth or account-state transitions. Normalize that alias onto
   * the explicit generator route so refreshes, direct opens, and session
   * restores all converge on one stable Assessment entry page.
   */
  return <Navigate to={SHARED_ASSESSMENT_ENTRY_PATH} replace />;
};

const MainApp = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAuthReady, isAdmin } = useAuth();
  const { status, message: statusMessage } = useStatus();
  const { activeFlowId, cancelFlow, isFlowActive, requestFlow } = usePopupOrchestrator();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useRouteScrollReset();

  const isPendingFastAccessProfileCompletion = isFastAccessProfileCompletionPending(user);
  const requiresAccountCompletion =
    isFacultyFastAccessUser(user) &&
    (
      isPendingFastAccessProfileCompletion ||
      (user?.fastAccessCredits ?? 0) <= 0
    );

  usePopupBlocker({
    id: REQUIRED_ACCOUNT_COMPLETION_FLOW_ID,
    isActive: requiresAccountCompletion,
    priority: POPUP_FLOW_PRIORITY.requiredAction,
    canPreempt: true,
  });

  const setCreditModalVisibility = React.useCallback(
    (open: boolean) => {
      if (open) {
        requestFlow({
          id: CREDIT_REQUEST_FLOW_ID,
          priority: POPUP_FLOW_PRIORITY.secondarySupport,
        });
        return;
      }

      cancelFlow(CREDIT_REQUEST_FLOW_ID);
    },
    [cancelFlow, requestFlow]
  );

  const closeWelcomeFlow = React.useCallback(() => {
    cancelFlow(WELCOME_AUTO_FLOW_ID);
    cancelFlow(WELCOME_MANUAL_FLOW_ID);
  }, [cancelFlow]);

  const isCreditModalOpen = isFlowActive(CREDIT_REQUEST_FLOW_ID);
  const isWelcomeModalOpen = isWelcomeFlowId(activeFlowId);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }

    cancelFlow(CREDIT_REQUEST_FLOW_ID);
    cancelFlow(WELCOME_AUTO_FLOW_ID);
    cancelFlow(WELCOME_MANUAL_FLOW_ID);
  }, [cancelFlow, isAuthenticated]);

  /**
   * These UI states must remain independent from document existence.
   * Sidebar collapse, modal visibility, and route changes must never
   * implicitly clear uploaded files from DocumentProvider.
   */
  useEffect(() => {
    /**
     * Boot diagnostics handshake:
     * once the provider stack, router, and first React shell commit succeed,
     * the low-level startup guard in `main.tsx` can safely stand down.
     */
    window.dispatchEvent(new CustomEvent('zootopia:app-shell-ready'));
  }, []);

  useEffect(() => {
    if (!isAuthReady || !isAuthenticated) {
      return;
    }

    /**
     * Warm the main tool workspaces after the authenticated shell paints.
     * This keeps initial entry light like a lazy route setup, but avoids making
     * users wait on a cold dynamic import the moment they open a primary tool.
     */
    const primaryPreloadHandle = scheduleNonCriticalTask(() => {
      void preloadWorkspaceRoutes(PRIMARY_WORKSPACE_ROUTE_IDS).catch((error) => {
        logger.warn('Primary workspace preload failed', {
          area: 'routing',
          event: 'workspace-route-preload-failed',
          routeGroup: 'primary',
          error,
        });
      });
    }, 900);

    /**
     * Secondary workspace routes are smaller account/support pages that users
     * still expect to feel instant. Warming them after the first shell paint
     * removes the cold-import "Loading Workspace" penalty without making the
     * generator entry path heavier.
     */
    const secondaryPreloadHandle = scheduleNonCriticalTask(() => {
      void preloadWorkspaceRoutes(SECONDARY_WORKSPACE_ROUTE_IDS).catch((error) => {
        logger.warn('Secondary workspace preload failed', {
          area: 'routing',
          event: 'workspace-route-preload-failed',
          routeGroup: 'secondary',
          error,
        });
      });
    }, 2200);

    const adminPreloadHandle =
      isAdmin
        ? scheduleNonCriticalTask(() => {
            void preloadWorkspaceRoutes(ADMIN_WORKSPACE_ROUTE_IDS).catch((error) => {
              logger.warn('Admin workspace preload failed', {
                area: 'routing',
                event: 'workspace-route-preload-failed',
                routeGroup: 'admin',
                error,
              });
            });
          }, 3200)
        : null;

    return () => {
      cancelScheduledTask(primaryPreloadHandle);
      cancelScheduledTask(secondaryPreloadHandle);
      if (adminPreloadHandle) {
        cancelScheduledTask(adminPreloadHandle);
      }
    };
  }, [isAdmin, isAuthenticated, isAuthReady]);

  return (
    <SidebarProvider
      isSidebarCollapsed={isSidebarCollapsed}
      setIsSidebarCollapsed={setIsSidebarCollapsed}
    >
      <DocumentProvider>
        <AuthScopedDocumentBoundary />
        <PaymentVerifier />

        <Routes>
          <Route path="/login" element={<LoginRouteGuard />} />
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/waiting-approval" element={<AccountStatus status="PendingAdminApproval" />} />
          <Route path="/account-rejected" element={<AccountStatus status="Rejected" />} />
          <Route path="/account-suspended" element={<AccountStatus status="Suspended" />} />
          <Route path="/account-blocked" element={<AccountStatus status="Blocked" />} />
          <Route
            path="/preview/:previewId"
            element={
              <ProtectedRoute>
                {renderLazyRoute(
                  workspaceRoutes.detachedPreview.routeId,
                  workspaceRoutes.detachedPreview.label,
                  <workspaceRoutes.detachedPreview.Component />,
                  true
                )}
              </ProtectedRoute>
            }
          />

          <Route
            element={
              <ProtectedRoute>
                <MainLayout
                  status={status}
                  statusMessage={statusMessage}
                  setIsCreditModalOpen={setCreditModalVisibility}
                  isSidebarCollapsed={isSidebarCollapsed}
                  setIsSidebarCollapsed={setIsSidebarCollapsed}
                />
              </ProtectedRoute>
            }
          >
            <Route index element={<RoleAwareHome />} />
            <Route path="generate" element={<Dashboard />} />
            <Route
              path="analysis"
              element={renderLazyRoute(
                workspaceRoutes.analysis.routeId,
                workspaceRoutes.analysis.label,
                <workspaceRoutes.analysis.Component />
              )}
            />
            <Route
              path="about"
              element={renderLazyRoute(
                workspaceRoutes.about.routeId,
                workspaceRoutes.about.label,
                <workspaceRoutes.about.Component />
              )}
            />
            <Route
              path="inbox"
              element={renderLazyRoute(
                workspaceRoutes.inbox.routeId,
                workspaceRoutes.inbox.label,
                <workspaceRoutes.inbox.Component />
              )}
            />
            <Route
              path="projects"
              element={renderLazyRoute(
                workspaceRoutes.projects.routeId,
                workspaceRoutes.projects.label,
                <workspaceRoutes.projects.Component />
              )}
            />
            <Route
              path="images"
              element={renderLazyRoute(
                workspaceRoutes.imageGenerator.routeId,
                workspaceRoutes.imageGenerator.label,
                <workspaceRoutes.imageGenerator.Component />
              )}
            />
            <Route
              path="image-editor"
              element={renderLazyRoute(
                workspaceRoutes.imageEditor.routeId,
                workspaceRoutes.imageEditor.label,
                <workspaceRoutes.imageEditor.Component />
              )}
            />
            <Route
              path="image-editor/:assetId"
              element={renderLazyRoute(
                workspaceRoutes.imageEditor.routeId,
                workspaceRoutes.imageEditor.label,
                <workspaceRoutes.imageEditor.Component />
              )}
            />
            <Route
              path="videos"
              element={renderLazyRoute(
                workspaceRoutes.videoGenerator.routeId,
                workspaceRoutes.videoGenerator.label,
                <workspaceRoutes.videoGenerator.Component />
              )}
            />
            <Route
              path="infographic"
              element={renderLazyRoute(
                workspaceRoutes.infographicGenerator.routeId,
                workspaceRoutes.infographicGenerator.label,
                <workspaceRoutes.infographicGenerator.Component />
              )}
            />
            <Route
              path="library"
              element={renderLazyRoute(
                workspaceRoutes.resultsLibrary.routeId,
                workspaceRoutes.resultsLibrary.label,
                <workspaceRoutes.resultsLibrary.Component />
              )}
            />
            <Route
              path="history"
              element={renderLazyRoute(
                workspaceRoutes.userHistory.routeId,
                workspaceRoutes.userHistory.label,
                <workspaceRoutes.userHistory.Component />
              )}
            />
            <Route
              path="chat"
              element={renderLazyRoute(
                workspaceRoutes.chatbot.routeId,
                workspaceRoutes.chatbot.label,
                <workspaceRoutes.chatbot.Component />
              )}
            />
            <Route
              path="live"
              element={renderLazyRoute(
                workspaceRoutes.liveVoice.routeId,
                workspaceRoutes.liveVoice.label,
                <workspaceRoutes.liveVoice.Component />
              )}
            />
            <Route
              path="tools"
              element={renderLazyRoute(
                workspaceRoutes.studyTools.routeId,
                workspaceRoutes.studyTools.label,
                <workspaceRoutes.studyTools.Component />
              )}
            />
            <Route
              path="support"
              element={renderLazyRoute(
                workspaceRoutes.support.routeId,
                workspaceRoutes.support.label,
                <workspaceRoutes.support.Component />
              )}
            />
            <Route
              path="settings"
              element={renderLazyRoute(
                workspaceRoutes.settings.routeId,
                workspaceRoutes.settings.label,
                <workspaceRoutes.settings.Component />
              )}
            />
            <Route
              path="plans"
              element={renderLazyRoute(
                workspaceRoutes.pricing.routeId,
                workspaceRoutes.pricing.label,
                <workspaceRoutes.pricing.Component />
              )}
            />
            <Route
              path="donation"
              element={renderLazyRoute(
                workspaceRoutes.donation.routeId,
                workspaceRoutes.donation.label,
                <workspaceRoutes.donation.Component />
              )}
            />
            <Route
              path="contact"
              element={renderLazyRoute(
                workspaceRoutes.contact.routeId,
                workspaceRoutes.contact.label,
                <workspaceRoutes.contact.Component />
              )}
            />
            <Route
              path="premium-hub"
              element={renderLazyRoute(
                workspaceRoutes.premiumHub.routeId,
                workspaceRoutes.premiumHub.label,
                <workspaceRoutes.premiumHub.Component />
              )}
            />
            <Route
              path="billing"
              element={renderLazyRoute(
                workspaceRoutes.billing.routeId,
                workspaceRoutes.billing.label,
                <workspaceRoutes.billing.Component />
              )}
            />
            <Route
              path="account"
              element={renderLazyRoute(
                workspaceRoutes.account.routeId,
                workspaceRoutes.account.label,
                <workspaceRoutes.account.Component />
              )}
            />

            {/* Admin Routes */}
            <Route
              path="admin"
              element={
                <ProtectedRoute adminOnly>
                  {renderLazyRoute(
                    workspaceRoutes.adminPanel.routeId,
                    workspaceRoutes.adminPanel.label,
                    <workspaceRoutes.adminPanel.Component />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="communication-center"
              element={
                <ProtectedRoute adminOnly>
                  {renderLazyRoute(
                    workspaceRoutes.communicationCenter.routeId,
                    workspaceRoutes.communicationCenter.label,
                    <workspaceRoutes.communicationCenter.Component />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="admin-settings"
              element={
                <ProtectedRoute primaryAdminOnly>
                  {renderLazyRoute(
                    workspaceRoutes.adminSettings.routeId,
                    workspaceRoutes.adminSettings.label,
                    <workspaceRoutes.adminSettings.Component />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="internal-chat"
              element={
                <ProtectedRoute>
                  {renderLazyRoute(
                    workspaceRoutes.adminChat.routeId,
                    workspaceRoutes.adminChat.label,
                    <workspaceRoutes.adminChat.Component />
                  )}
                </ProtectedRoute>
              }
            />
            <Route
              path="secrets"
              element={
                <ProtectedRoute>
                  {renderLazyRoute(
                    workspaceRoutes.secretCodeRedemption.routeId,
                    workspaceRoutes.secretCodeRedemption.label,
                    <workspaceRoutes.secretCodeRedemption.Component />
                  )}
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <React.Suspense fallback={null}>
          {isCreditModalOpen ? (
            <CreditRequestModal
              isOpen={isCreditModalOpen}
              onClose={() => setIsCreditModalOpen(false)}
            />
          ) : null}
        </React.Suspense>

        <WelcomePopup
          isOpen={isWelcomeModalOpen}
          onClose={closeWelcomeFlow}
          onSupport={() => navigate('/donation')}
          isSidebarCollapsed={isSidebarCollapsed}
        />
        <FastAccessProfileCompletionModal />
      </DocumentProvider>
    </SidebarProvider>
  );
};

export default function App() {
  return (
    <ErrorBoundary
      fallback={
        <AppStartupRecovery
          title="Platform startup failed"
          message="The application hit an unexpected boot error before the workspace could finish loading."
          detail="Reload the page to retry startup. If the problem persists, the provider stack now surfaces this state instead of failing as a blank screen."
          tone="error"
        />
      }
    >
      <BrowserRouter>
        <AuthProvider>
          <PopupOrchestratorProvider>
            <NotificationProvider>
              <ThemeProvider>
                <LanguageProvider>
                  <ToastProvider />
                  <ErrorBoundary>
                    <MainApp />
                  </ErrorBoundary>
                </LanguageProvider>
              </ThemeProvider>
            </NotificationProvider>
          </PopupOrchestratorProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
