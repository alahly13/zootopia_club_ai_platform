import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Bell,
  Moon,
  Sun,
  Zap,
  Menu,
  Shield,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react';

import Sidebar from './Sidebar';
import { HeaderLogo } from './HeaderLogo';
import { StatusIndicator } from './status/StatusIndicator';
import { LanguageSwitch } from './LanguageSwitch';
import { NotificationDropdown } from './NotificationDropdown';
import { Footer } from './Footer';
import { ScrollToTop } from './ScrollToTop';

import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../themes/ThemeProvider';
import { useNotifications } from '../notifications/NotificationContext';
import { cn } from '../utils';
import { cleanupExpiredResultsForUser } from '../services/resultService';
import { cleanupExpiredGeneratedAssetsForUser } from '../services/generatedAssetService';
import {
  FACULTY_FAST_ACCESS_CONVERSION_PROMPT,
  isFacultyFastAccessUser,
  isFastAccessProfileCompletionPending,
} from '../constants/fastAccessPolicy';
import { logger } from '../utils/logger';
import {
  hasWelcomePopupBeenHandledInThisSession,
  isWelcomeEntryPath,
  resolveWelcomeContextKey,
  shouldAutoShowWelcome,
} from '../constants/welcomeFlow';
import { cancelScheduledTask, scheduleNonCriticalTask } from '../utils/browserTasks';
import { preloadWorkspaceRoute } from '../routing/workspaceRoutes';
import { useRouteScrollReset } from '../hooks/useRouteScrollReset';
import { usePopupOrchestrator } from '../contexts/PopupOrchestratorContext';
import {
  NOTIFICATION_DROPDOWN_FLOW_ID,
  POPUP_FLOW_PRIORITY,
  WELCOME_AUTO_FLOW_ID,
  WELCOME_MANUAL_FLOW_ID,
} from '../constants/popupFlows';
import { getPaymentSessionId } from '../utils/validators';

/**
 * User account dropdown.
 * Keeps account actions isolated from the main header logic.
 */
const UserDropdown = () => {
  const { user, logout, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 p-1 pe-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-2xl transition-all active:scale-95 cursor-pointer group"
        aria-label={t('account')}
      >
        <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
          {user.name?.charAt(0)?.toUpperCase() || 'U'}
        </div>

        <div className="hidden md:block text-start min-w-0">
          <p className="text-[10px] font-black text-zinc-900 dark:text-white uppercase tracking-wider leading-none mb-0.5 truncate">
            {user.name}
          </p>
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-none">
            {isAdmin ? t('Admin') : t(user.plan === 'pro' ? 'proUser' : 'freeUser')}
          </p>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="absolute top-full end-0 mt-2 w-56 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl shadow-black/10 overflow-hidden z-50"
          >
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
              <p className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-widest truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
            </div>

            <div className="p-2">
              {isAdmin && (
                <button
                  onClick={() => {
                    navigate('/admin');
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  <Shield size={14} />
                  {t('adminDashboard')}
                </button>
              )}

              <button
                onClick={() => {
                  navigate('/settings');
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              >
                <SettingsIcon size={14} />
                {t('settings')}
              </button>

              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
              >
                <LogOut size={14} />
                {t('logout')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

type MainLayoutProps = {
  status: any;
  statusMessage: string;
  setIsCreditModalOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
};

/**
 * Shared credits badge component to avoid duplicated UI logic.
 */
const CreditsBadge: React.FC<{
  user: any;
  isAdminUser: boolean;
  t: (key: string) => string;
  onOpenCredits: () => void;
  className?: string;
}> = ({ user, isAdminUser, t, onOpenCredits, className }) => {
  const isFastAccessUser = isFacultyFastAccessUser(user);
  const isProUser = user?.plan === 'pro';
  const isUnlimited = isAdminUser || isProUser;
  const remainingCredits = isFastAccessUser ? (user?.fastAccessCredits ?? 0) : (user?.credits || 0);

  return (
    <div
      onClick={() => !isUnlimited && !isFastAccessUser && onOpenCredits()}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all group shrink-0 z-10',
        isUnlimited
          ? 'bg-emerald-500/10 border border-emerald-500/20 cursor-default'
          : 'bg-amber-500/10 border border-amber-500/20',
        !isUnlimited && !isFastAccessUser && 'cursor-pointer hover:bg-amber-500/20 active:scale-95',
        !isUnlimited && isFastAccessUser && 'cursor-default',
        className
      )}
      title={
        isAdminUser || isProUser ? t('unlimitedCredits') : isFastAccessUser ? 'Faculty fast-access credits' : t('yourCredits')
      }
    >
      <Zap
        size={14}
        className={isUnlimited ? 'text-emerald-500' : 'text-amber-500'}
      />
      <span
        className={cn(
          'text-[10px] sm:text-xs font-black uppercase tracking-wider',
          isUnlimited
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-amber-600 dark:text-amber-400'
        )}
      >
        {isAdminUser ? '∞' : isProUser ? t('pro') : remainingCredits}
      </span>
    </div>
  );
};

export const MainLayout: React.FC<MainLayoutProps> = ({
  status,
  statusMessage,
  setIsCreditModalOpen,
  isSidebarCollapsed,
  setIsSidebarCollapsed,
}) => {
  const { user, bgImage, isAdmin } = useAuth() as any;
  const { t } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const { unreadCount } = useNotifications();

  const navigate = useNavigate();
  const location = useLocation();
  const { activeFlowId, cancelFlow, requestFlow } = usePopupOrchestrator();
  const isFastAccessUser = isFacultyFastAccessUser(user);
  const isFastAccessProfilePending = isFastAccessProfileCompletionPending(user);
  const remainingFastAccessCredits = user?.fastAccessCredits ?? 0;
  const welcomeContextKey = useMemo(() => resolveWelcomeContextKey(user), [user]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const welcomeEntryHandledRef = useRef(false);
  const initialEntryNormalizedRef = useRef(false);

  useRouteScrollReset(scrollContainerRef);

  /**
   * Route-derived active tab keeps sidebar and page title in sync.
   */
  const activeTab = useMemo(() => {
    return location.pathname.split('/')[1] || 'home';
  }, [location.pathname]);

  const pageTitle = useMemo(() => {
    if (activeTab === 'home') {
      return t('uploadUI.uploadFirstCompactTitle', { defaultValue: 'Home Upload Workspace' });
    }
    if (activeTab === 'analysis') {
      return t('uploadUI.analysisWorkspaceTitle', { defaultValue: 'Analysis Workspace' });
    }
    if (activeTab === 'library') {
      return t('resultsLibrary', { defaultValue: 'Results Library' });
    }
    if (activeTab === 'image-editor') {
      return t('imageEditor', { defaultValue: 'Image Editor' });
    }
    return t(activeTab);
  }, [activeTab, t]);

  const contentWidthClass =
    activeTab === 'home' || activeTab === 'analysis' || activeTab === 'generate'
      ? 'max-w-7xl'
      : 'max-w-5xl';
  const initialShellEntryPath =
    isFastAccessUser && (isFastAccessProfilePending || remainingFastAccessCredits <= 0)
      ? '/account'
      : '/home';
  const hasPaymentSessionInUrl = useMemo(
    () => Boolean(getPaymentSessionId(new URLSearchParams(location.search))),
    [location.search]
  );

  const handleSidebarNavigation = (tab: string) => {
    void preloadWorkspaceRoute(tab);
    navigate(tab === 'generate' ? '/generate' : `/${tab}`);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    if (hasPaymentSessionInUrl) {
      return;
    }

    if (initialEntryNormalizedRef.current) {
      return;
    }

    /**
     * ENTRY ROUTING CONTRACT
     * ------------------------------------------------------------------
     * Fresh authenticated shell entry must always normalize to the standalone
     * upload-first home surface instead of restoring the last open workspace
     * route or hash.
     *
     * Keep this one-shot per shell mount so later in-app navigation behaves
     * normally. Payment callback URLs are allowed to finish first.
     */
    initialEntryNormalizedRef.current = true;

    if (
      location.pathname === initialShellEntryPath &&
      !location.search &&
      !location.hash
    ) {
      return;
    }

    navigate(initialShellEntryPath, { replace: true });
  }, [
    hasPaymentSessionInUrl,
    initialShellEntryPath,
    location.hash,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    /**
     * Defer retention cleanup until the browser is idle so authenticated entry
     * feels instant and the first paint is not competing with non-critical
     * Firestore/Storage maintenance work.
     */
    const scheduledHandle = scheduleNonCriticalTask(() => {
      void Promise.all([
        cleanupExpiredResultsForUser(user.id, user.plan).catch((error) => {
          logger.warn('Background result retention cleanup failed', {
            area: 'layout',
            event: 'results-retention-cleanup-failed',
            userId: user.id,
            error,
          });
        }),
        cleanupExpiredGeneratedAssetsForUser(user.id).catch((error) => {
          logger.warn('Background generated-asset retention cleanup failed', {
            area: 'layout',
            event: 'generated-asset-retention-cleanup-failed',
            userId: user.id,
            error,
          });
        }),
      ]);
    }, 2500);

    return () => {
      cancelScheduledTask(scheduledHandle);
    };
  }, [user?.id, user?.plan]);

  useEffect(() => {
    if (!user?.id || !isWelcomeEntryPath(location.pathname)) {
      welcomeEntryHandledRef.current = false;
      cancelFlow(WELCOME_AUTO_FLOW_ID);
      return;
    }

    if (
      welcomeEntryHandledRef.current ||
      hasWelcomePopupBeenHandledInThisSession(welcomeContextKey) ||
      !shouldAutoShowWelcome(welcomeContextKey)
    ) {
      return;
    }

    /**
     * Unified welcome orchestration belongs here because MainLayout only renders
     * after ProtectedRoute has resolved authentication, account type, and the
     * allowed landing route. Keep role-specific auth systems separate, but reuse
     * this single entry trigger once they converge on the authenticated shell.
     */
    welcomeEntryHandledRef.current = true;
    const timeoutId = window.setTimeout(() => {
      requestFlow({
        id: WELCOME_AUTO_FLOW_ID,
        priority: POPUP_FLOW_PRIORITY.welcome,
      });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cancelFlow, location.pathname, requestFlow, user?.id, welcomeContextKey]);

  useEffect(() => {
    if (activeFlowId && activeFlowId !== NOTIFICATION_DROPDOWN_FLOW_ID) {
      setIsNotificationOpen(false);
    }
  }, [activeFlowId]);

  return (
    <div
      className={cn(
        'flex h-screen overflow-hidden transition-all duration-700 relative',
        isDarkMode ? 'bg-pattern-dark text-zinc-100' : 'bg-pattern-light text-zinc-900'
      )}
    >
      {/* Background Image Layer */}
      {bgImage && (
        <div
          className="fixed inset-0 z-0 opacity-[0.05] pointer-events-none transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: isDarkMode ? 'grayscale(1) invert(1)' : 'grayscale(1)',
          }}
        />
      )}

      {/* Global visual overlay */}
      <div className="bg-overlay" />

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 start-0 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
          isSidebarCollapsed ? 'md:w-20' : 'md:w-64'
        )}
      >
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleSidebarNavigation}
          onClose={() => setIsMobileMenuOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenWelcomePopup={() => {
            cancelFlow(WELCOME_AUTO_FLOW_ID);
            requestFlow({
              id: WELCOME_MANUAL_FLOW_ID,
              priority: POPUP_FLOW_PRIORITY.welcome,
            });
          }}
        />
      </div>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden z-10 relative">
        {/* Top spiritual / branding strip */}
        <div className="w-full py-1 text-center bg-white/75 dark:bg-zinc-950/20 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/30 shrink-0">
          <p className="text-[10px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400 tracking-wider">
            {t('basmala')}
          </p>
        </div>

        {/* Header */}
        <header className="h-20 border-b border-zinc-200/90 dark:border-zinc-800 flex items-center justify-between px-4 sm:px-6 shrink-0 bg-white/80 dark:bg-zinc-950/60 backdrop-blur-xl z-20 gap-x-2 sm:gap-x-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button
              className="md:hidden p-2 -ms-2 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl shrink-0 transition-colors"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label={t('openMenu')}
            >
              <Menu size={20} />
            </button>

            <div className="flex items-center gap-3 min-w-0">
              <HeaderLogo iconClassName="w-8 h-8 sm:w-10 sm:h-10" shortTextOnMobile />
              <div className="hidden lg:block h-6 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1" />
              <div className="hidden sm:block truncate">
                <StatusIndicator status={status} message={statusMessage} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Search */}
            <div className="relative hidden xl:block">
              <Search
                className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400"
                size={16}
              />
              <input
                type="text"
                placeholder={t('searchTools')}
                className="bg-white/80 dark:bg-zinc-900/50 border border-zinc-300 dark:border-zinc-800 rounded-xl ps-10 pe-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all w-48 xl:w-64 backdrop-blur-sm"
              />
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Desktop credits */}
              <CreditsBadge
                user={user}
                isAdminUser={isAdmin}
                t={t}
                onOpenCredits={() => setIsCreditModalOpen(true)}
                className="hidden sm:flex"
              />

              <div className="shrink-0 hidden sm:block">
                <LanguageSwitch />
              </div>

              <button
                onClick={toggleTheme}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 rounded-xl text-zinc-500 transition-all cursor-pointer"
                aria-label={t('toggleTheme')}
              >
                {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>

              <div className="relative">
                <button
                  onClick={() => setIsNotificationOpen((prev) => !prev)}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 active:scale-95 rounded-xl text-zinc-500 transition-all relative cursor-pointer"
                  aria-label={t('notifications')}
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute top-2.5 end-2.5 w-1.5 h-1.5 bg-emerald-500 rounded-full border border-white dark:border-zinc-950" />
                  )}
                </button>

                <NotificationDropdown
                  isOpen={isNotificationOpen}
                  onClose={() => setIsNotificationOpen(false)}
                />
              </div>

              <div className="h-8 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1 hidden md:block" />

              <UserDropdown />
            </div>
          </div>
        </header>

        {/* Mobile credits row */}
        <div className="sm:hidden w-full px-4 py-2 border-b border-zinc-200/90 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/60 backdrop-blur-xl flex justify-center">
          <CreditsBadge
            user={user}
            isAdminUser={isAdmin}
            t={t}
            onOpenCredits={() => setIsCreditModalOpen(true)}
          />
        </div>

        {/* Page title bar */}
        <div className="px-6 py-4 border-b border-zinc-200/90 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/40 backdrop-blur-xl shrink-0">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white tracking-widest uppercase">
            {pageTitle}
          </h2>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Low credits banner */}
          {user && (
            (isFastAccessUser && !isFastAccessProfilePending && remainingFastAccessCredits <= 0) ||
            (!isFastAccessUser && user.credits <= 0 && !isAdmin && user.plan !== 'pro')
          ) && (
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 sm:px-6 py-3.5 sm:py-4 flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center sm:justify-between animate-in slide-in-from-top duration-500 shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 mt-0.5 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-600 shrink-0">
                  <Zap size={16} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                    {isFastAccessUser ? 'Faculty Credits Reached Zero' : t('exhaustedCredits')}
                  </p>
                  <p className="text-xs sm:text-sm text-amber-800/90 dark:text-amber-200/90 leading-relaxed max-w-3xl">
                    {isFastAccessUser
                      ? FACULTY_FAST_ACCESS_CONVERSION_PROMPT
                      : t('exhaustedCredits')}
                  </p>
                  {isFastAccessUser && (
                    <div className="inline-flex items-center mt-1 px-2.5 py-1 rounded-full bg-white/70 dark:bg-zinc-900/60 border border-amber-300/60 dark:border-amber-700/60 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
                      Continue In Under 1 Minute
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => {
                  if (isFastAccessUser) {
                    navigate('/account');
                    return;
                  }
                  setIsCreditModalOpen(true);
                }}
                className="self-start sm:self-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-900/20"
              >
                {isFastAccessUser ? 'Complete Full Registration' : t('requestCredits')}
              </button>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden relative min-h-0">
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar min-h-0"
            >
              <div className={`${contentWidthClass} mx-auto space-y-8`}>
                <Outlet />
              </div>

              <Footer className="mt-8 sm:mt-10" />
              <ScrollToTop scrollContainerRef={scrollContainerRef} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
