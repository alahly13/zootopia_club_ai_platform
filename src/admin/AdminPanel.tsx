import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity, 
  Users, 
  Cpu, 
  Database, 
  CheckCircle2, 
  Search,
  User as UserIcon,
  Trash2,
  ShieldAlert,
  Zap,
  MessageSquare,
  MessagesSquare,
  Edit,
  X,
  Key,
  Eye,
  Loader2,
  TrendingUp,
  BarChart3,
  Clock,
  LayoutDashboard,
  Settings,
  CreditCard,
  History,
  Sparkles
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn, User, UserRequest } from '../utils';
import { AIModel } from '../utils/aiModels';
import toast from 'react-hot-toast';
import { useAuth } from '../auth/AuthContext';
import AdminUserProfile from './AdminUserProfile';
import { useStatus } from '../hooks/useStatus';
import { StatusIndicator } from '../components/status/StatusIndicator';
import { StatusCard } from '../components/status/StatusCard';
import { AdminModal } from './components/AdminModal';
import { GiftCodeManager } from './components/GiftCodeManager';
import { CommunicationCenter } from './components/CommunicationCenter';
import { MonitoringView } from './components/MonitoringView';
import { ChatCenter } from './components/ChatCenter';
import { RefundsView } from './components/RefundsView';
import { DonationsView } from './components/DonationsView';
import { CodeManagementPage } from './pages/CodeManagementPage';
import { FastAccessCreditAuditView } from './components/FastAccessCreditAuditView';
import { StandardCreditAuditView } from './components/StandardCreditAuditView';
import { FastAccessAccountsManager } from './components/FastAccessAccountsManager';
import { ToolEntitlementsManager } from './components/ToolEntitlementsManager';
import { ModelEntitlementsManager } from './components/ModelEntitlementsManager';
import StoredResultsExplorer from './components/StoredResultsExplorer';
import {
  fetchProviderSecuritySummary,
  type ProviderSecuritySummaryResponse,
} from './services/providerSecuritySummaryService';

import { NotificationProvider, useNotifications } from '../notifications/NotificationContext';
import { Footer } from '../components/Footer';
import { logger } from '../utils/logger';
import { isUserAdmin, normalizeAdminLevel } from '../auth/accessControl';

const AdminPanel: React.FC = () => {
  const { t } = useTranslation();
  const { 
    activities, 
    allUsers, 
    userRequests, 
    updateUser, 
    createUser,
    updateRequest, 
    logActivity, 
    models, 
    updateModel,
    addModel,
    deleteModel,
    refreshModels,
    validateQwenModels,
    testQwenConnection,
    testGoogleConnection,
    handleError: authHandleError,
    user: currentUser,
    isAdmin,
    deleteUser,
    blockUser,
    reactivateUser
  } = useAuth();
  const { addNotification } = useNotifications();
  const [activeView, setActiveView] = useState<'stats' | 'users' | 'requests' | 'logs' | 'models' | 'credits' | 'monitoring' | 'chat' | 'refunds' | 'donations' | 'communication' | 'codes' | 'tool-entitlements' | 'model-entitlements' | 'credit-audit' | 'fast-access-audit' | 'fast-access-accounts' | 'stored-results'>('stats');
  const [providerSecuritySummary, setProviderSecuritySummary] = useState<ProviderSecuritySummaryResponse['summary'] | null>(null);
  const [isLoadingProviderSecuritySummary, setIsLoadingProviderSecuritySummary] = useState(false);
  const [providerSecuritySummaryError, setProviderSecuritySummaryError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userScopeFilter, setUserScopeFilter] = useState<'all' | 'temporary-fast-access' | 'full-account'>('all');
  const [accountHealthFilter, setAccountHealthFilter] = useState<'all' | 'admins' | 'blocked' | 'link-issues'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: keyof User, direction: 'asc' | 'desc' } | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [modifyingRequest, setModifyingRequest] = useState<{id: string, amount: number, note: string} | null>(null);
  const [processingRequest, setProcessingRequest] = useState<{id: string, action: 'Approve' | 'Reject', note: string} | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    username: '',
    role: 'User' as User['role']
  });
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [modelToDelete, setModelToDelete] = useState<AIModel | null>(null);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [newModel, setNewModel] = useState<Partial<AIModel>>({
    provider: 'Qwen',
    category: 'Balanced',
    status: 'Ready',
    isEnabled: true,
    supportsText: true,
    supportsFiles: true,
    supportsDocumentAnalysis: true,
    supportsQuizGeneration: true,
    supportsGenerateContent: true,
    supportsLongContext: true,
    isFreeFriendly: true,
    isPreview: false,
    priority: 20
  });
  const { status, message: statusMessage, error, setStatus, setError, isLoading, isError, reset } = useStatus();
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const currentAdminLevel = normalizeAdminLevel(currentUser?.adminLevel);
  const canAccessModerationViews =
    currentAdminLevel === 'primary' || currentAdminLevel === 'secondary';

  React.useEffect(() => {
    if (activeView !== 'models' || currentAdminLevel !== 'primary') {
      return;
    }

    let isCancelled = false;
    setIsLoadingProviderSecuritySummary(true);
    setProviderSecuritySummaryError(null);

    void fetchProviderSecuritySummary()
      .then((summary) => {
        if (!isCancelled) {
          setProviderSecuritySummary(summary);
        }
      })
      .catch((error) => {
        logger.warn('Failed to load provider security summary.', {
          area: 'admin-models',
          event: 'load-provider-security-summary-failed',
          error,
        });

        if (!isCancelled) {
          setProviderSecuritySummary(null);
          setProviderSecuritySummaryError('Unable to load server-side provider runtime details right now.');
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingProviderSecuritySummary(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [activeView, currentAdminLevel]);

  const formatProviderBadge = React.useCallback((providerId: string) => {
    const normalized = String(providerId || '').trim().toLowerCase();

    if (normalized === 'google.com') return 'Google';
    if (normalized === 'password') return 'Email';
    if (normalized === 'phone') return 'Phone';
    if (normalized === 'phone.com') return 'Phone';
    if (!normalized) return 'Unknown';

    return normalized.replace(/\.com$/i, '').replace(/[-_]+/g, ' ');
  }, []);

  const getAccountLinkageLabel = React.useCallback((targetUser: User) => {
    const linkageStatus = targetUser.accountLinkage?.linkageStatus || 'linked';
    if (linkageStatus === 'auth_only') return 'Auth Only';
    if (linkageStatus === 'firestore_only') return 'Firestore Only';
    if (linkageStatus === 'inconsistent') return 'Needs Review';
    return 'Linked';
  }, []);

  const getAccountLinkageTone = React.useCallback((targetUser: User) => {
    const linkageStatus = targetUser.accountLinkage?.linkageStatus || 'linked';
    if (linkageStatus === 'linked') {
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    }
    if (linkageStatus === 'auth_only') {
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    }
    if (linkageStatus === 'firestore_only') {
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-300';
    }
    return 'bg-red-500/10 text-red-600 dark:text-red-400';
  }, []);

  const isGenericAdminViewOnly = React.useCallback((targetUser: User | null | undefined) => {
    return targetUser?.accountLinkage?.adminManagementMode === 'view_only';
  }, []);

  const SidebarItem = ({ id, label, icon: Icon, badge }: { id: typeof activeView, label: string, icon: any, badge?: number }) => (
    <button
      onClick={() => setActiveView(id)}
      className={cn(
        "w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group relative",
        activeView === id 
          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
          : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-900 dark:hover:text-zinc-300"
      )}
    >
      <div className="flex items-center gap-3 relative z-10">
        <Icon size={18} className={cn("transition-transform duration-300 group-hover:scale-110", activeView === id ? "text-white" : "text-zinc-400 group-hover:text-emerald-500")} />
        <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-black relative z-10",
          activeView === id ? "bg-white text-emerald-600" : "bg-red-500 text-white"
        )}>
          {badge}
        </span>
      )}
      {activeView === id && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 bg-emerald-500 rounded-2xl z-0"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
    </button>
  );

  // Chart Data Preparation
  const activityByDay = activities.reduce((acc: any[], activity) => {
    const date = new Date(activity.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ date, count: 1 });
    }
    return acc;
  }, []).slice(-7);

  const userGrowth = allUsers.reduce((acc: any[], user) => {
    const date = new Date(user.firstLoginDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ date, count: 1 });
    }
    return acc;
  }, []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);

  // Real Stats
  const totalUsers = allUsers.length;
  const activeUsersToday = allUsers.filter(u => new Date(u.lastLogin).toDateString() === new Date().toDateString()).length;
  const suspendedUsers = allUsers.filter(u => u.status === 'Suspended' || u.status === 'Blocked').length;
  const totalUploads = allUsers.reduce((sum, u) => sum + u.totalUploads, 0);
  const totalAIRequests = allUsers.reduce((sum, u) => sum + u.totalAIRequests, 0);
  const pendingRequests = userRequests.filter(r => r.status === 'Pending').length;
  
  const stats = [
    { label: t('total-users'), value: totalUsers.toString(), icon: Users, color: 'text-blue-500', trend: `${activeUsersToday} ${t('active-today')}` },
    { label: t('total-uploads'), value: totalUploads.toString(), icon: Database, color: 'text-emerald-500', trend: t('all-time') },
    { label: t('ai-requests'), value: totalAIRequests.toString(), icon: Cpu, color: 'text-purple-500', trend: t('all-time') },
    { label: t('pending-requests'), value: pendingRequests.toString(), icon: MessageSquare, color: 'text-amber-500', trend: t('needs-action') },
  ];

  const filteredUsers = allUsers.filter((u) => {
    /**
     * ARCHITECTURE GUARD (Temporary Scope Separation)
     * ------------------------------------------------------------------
     * Faculty temporary accounts are intentionally a separate lifecycle type.
     * Keep explicit filtering and avoid collapsing this scope into full-user
     * assumptions during future admin refactors.
     */
    const queryMatches =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());

    if (!queryMatches) return false;

    const isTemporaryFastAccess =
      u.isTemporaryAccess === true || u.accountScope === 'faculty_science_fast_access';

    const scopeMatches =
      userScopeFilter === 'all'
        ? true
        : userScopeFilter === 'temporary-fast-access'
          ? isTemporaryFastAccess
          : !isTemporaryFastAccess;

    if (!scopeMatches) {
      return false;
    }

    const healthMatches =
      accountHealthFilter === 'all'
        ? true
        : accountHealthFilter === 'admins'
          ? isUserAdmin(u)
          : accountHealthFilter === 'blocked'
            ? u.status === 'Suspended' || u.status === 'Blocked'
            : Boolean(u.accountLinkage?.issues?.length);

    if (!healthMatches) {
      return false;
    }

    return true;
  });

  const adminAccountsCount = allUsers.filter((targetUser) => isUserAdmin(targetUser)).length;
  const linkageIssueCount = allUsers.filter((targetUser) => (targetUser.accountLinkage?.issues?.length || 0) > 0).length;

  const isFacultyFastAccessManagedUser = React.useCallback((targetUser: User | null | undefined) => {
    return !!targetUser && (
      targetUser.isTemporaryAccess === true ||
      targetUser.accountScope === 'faculty_science_fast_access' ||
      targetUser.temporaryAccessType === 'FacultyOfScienceFastAccess'
    );
  }, []);

  const redirectToFastAccessManager = React.useCallback((targetUser: User, actionLabel: string) => {
    /**
     * ROUTING GUARD (Admin Separation)
     * ------------------------------------------------------------------
     * Temporary Faculty accounts must be managed from the dedicated fast-access
     * workspace, not the generic full-user editor. This keeps lifecycle rules,
     * delete semantics, and fast-access credit logic from drifting apart.
     */
    setSelectedUser(null);
    setUserToDelete(null);
    setIsDeleteModalOpen(false);
    setActiveView('fast-access-accounts');
    toast(`Use Faculty Fast Access manager to ${actionLabel} ${targetUser.name || 'this account'}.`);
  }, []);

  const sortedUsers = React.useMemo(() => {
    let sortableUsers = [...filteredUsers];
    if (sortConfig !== null) {
      sortableUsers.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (aValue === undefined || bValue === undefined) return 0;
        
        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableUsers;
  }, [filteredUsers, sortConfig]);

  const handleSort = (key: keyof User) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSaveUser = (userId: string, updates: Partial<User>) => {
    updateUser(userId, updates);
    logActivity('chat', t('user-profile-updated-msg', { userId }));
    addNotification({
      title: t('user-updated-title'),
      message: t('user-profile-updated-msg', { userId }),
      type: 'admin',
      priority: 'low'
    });
  };

  const handleApproveRequest = async (req: UserRequest, note: string = 'Approved by admin') => {
    setStatus('processing', t('approving-request'));
    try {
      await updateRequest(req.id, 'Approved', note);
      logActivity('admin_action', t('approved-by-admin'));
      setStatus('success', t('request-approved'));
      addNotification({
        title: t('request-approved-title'),
        message: t('credit-request-approved-msg', { userName: req.userName }),
        type: 'admin',
        priority: 'medium'
      });
      setProcessingRequest(null);
      setTimeout(() => reset(), 2000);
    } catch (err: any) {
      setError(err, () => handleApproveRequest(req, note));
    }
  };

  const handleRejectRequest = async (req: UserRequest, note: string = 'Rejected by admin') => {
    setStatus('processing', t('rejecting-request'));
    try {
      await updateRequest(req.id, 'Rejected', note);
      logActivity('admin_action', t('rejected-by-admin'));
      setStatus('success', t('request-rejected'));
      addNotification({
        title: t('request-rejected-title'),
        message: t('credit-request-rejected-msg', { userName: req.userName }),
        type: 'admin',
        priority: 'medium'
      });
      setProcessingRequest(null);
      setTimeout(() => reset(), 2000);
    } catch (err: any) {
      setError(err, () => handleRejectRequest(req, note));
    }
  };

  const handleModifyRequest = async (id: string, amount: number, note: string) => {
    setStatus('processing', t('modifying-request'));
    try {
      await updateRequest(id, 'Modified', note || `Approved with modified amount: ${amount}`, amount);
      logActivity('admin_action', t('approved-with-modified-amount', { amount }));
      setStatus('success', t('request-modified-approved'));
      addNotification({
        title: t('request-modified-title'),
        message: t('request-modified-msg', { id, amount }),
        type: 'admin',
        priority: 'medium'
      });
      setModifyingRequest(null);
      setTimeout(() => reset(), 2000);
    } catch (err: any) {
      setError(err, () => handleModifyRequest(id, amount, note));
    }
  };

  return (
    <>
    <div className="flex flex-col lg:flex-row gap-8 min-h-[80vh]">
      {/* Sidebar Navigation */}
      <div className="lg:w-64 shrink-0 space-y-6">
        <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 rounded-[2.5rem] p-4 shadow-sm">
          <div className="space-y-2">
            <SidebarItem id="stats" label={t('overview')} icon={LayoutDashboard} />
            <SidebarItem id="users" label={t('directory')} icon={Users} />
            <SidebarItem id="monitoring" label={t('monitoring')} icon={Activity} />
            <SidebarItem id="refunds" label={t('refunds')} icon={CreditCard} />
            <SidebarItem id="donations" label="Donations" icon={CreditCard} />
            <SidebarItem id="stored-results" label="Stored Results" icon={Database} />
            <SidebarItem id="chat" label={t('chat-center')} icon={MessagesSquare} />
            <SidebarItem id="communication" label={t('communication-center')} icon={Sparkles} />
            <SidebarItem id="codes" label="Code Management" icon={Key} />
            <SidebarItem id="tool-entitlements" label="Tool Entitlements" icon={ShieldAlert} />
            <SidebarItem id="model-entitlements" label="Model Entitlements" icon={ShieldAlert} />
            <SidebarItem id="credit-audit" label="Credit Audit" icon={Clock} />
            <SidebarItem id="fast-access-audit" label="Fast-Access Audit" icon={Clock} />
            <SidebarItem id="fast-access-accounts" label="Fast-Access Accounts" icon={Users} />
            {canAccessModerationViews && (
              <>
                <SidebarItem id="requests" label={t('requests')} icon={MessageSquare} badge={pendingRequests} />
                <SidebarItem id="logs" label={t('audit-logs')} icon={History} />
              </>
            )}
            {currentAdminLevel === 'primary' && (
              <>
                <SidebarItem id="credits" label={t('credits')} icon={CreditCard} />
                <SidebarItem id="models" label={t('ai-models')} icon={Cpu} />
              </>
            )}
          </div>
        </div>

        {/* Admin Profile Quick View */}
        <div className="bg-gradient-to-br from-zinc-900 to-black p-6 rounded-[2.5rem] shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-1000" />
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-black">
                {currentUser?.name.charAt(0)}
              </div>
              <div>
                <p className="text-xs font-black text-white uppercase tracking-widest truncate max-w-[120px]">{currentUser?.name}</p>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('admin-level-label', { level: currentAdminLevel || currentUser?.adminLevel })}</p>
              </div>
            </div>
            <div className="pt-4 border-t border-white/10">
              <div className="flex items-center justify-between text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                <span>{t('system-health')}</span>
                <span className="text-emerald-500">{t('optimal')}</span>
              </div>
              <div className="mt-2 w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <div className="w-full h-full bg-emerald-500" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-8">
        {/* Header with Search & Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter capitalize">
              {activeView === 'stats' ? t('dashboard-overview') : t(activeView)}
            </h2>
            <StatusIndicator status={status} message={statusMessage} />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72 group">
              <Search className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" size={16} />
              <input 
                type="text" 
                placeholder={t('search-directory')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl ps-11 pe-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 transition-all shadow-sm"
              />
            </div>
            {activeView === 'users' && (
              <button 
                onClick={() => setIsCreatingUser(true)}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black rounded-2xl transition-all shadow-xl shadow-emerald-500/20 active:scale-95 cursor-pointer uppercase tracking-wider"
              >
                <Users size={16} />
                <span className="hidden sm:inline">{t('new-user')}</span>
              </button>
            )}
          </div>
        </div>

        {isError && (
          <StatusCard 
            status={status}
            title={t('admin-action-error')}
            message={error?.message}
            onRetry={error?.retryAction}
            onDismiss={reset}
          />
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeView === 'stats' && (
              <div className="space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {stats.map((stat, i) => (
                    <div key={i} className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 p-6 rounded-[2rem] relative overflow-hidden group shadow-sm">
                      <div className="absolute top-0 end-0 w-24 h-24 bg-emerald-500/5 rounded-full -me-12 -mt-12 group-hover:bg-emerald-500/10 transition-all" />
                      <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className={cn("p-3 rounded-2xl bg-white dark:bg-zinc-800 shadow-lg", stat.color)}>
                          <stat.icon size={24} />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full">{stat.trend}</span>
                      </div>
                      <p className="text-zinc-500 dark:text-zinc-400 text-xs font-black uppercase tracking-widest relative z-10">{stat.label}</p>
                      <p className="text-3xl font-black text-zinc-900 dark:text-white mt-1 relative z-10 tracking-tighter tabular-nums">{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Activity Chart */}
                  <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-widest">{t('system-activity')}</h3>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">{t('last-7-days')}</p>
                      </div>
                      <Activity className="text-emerald-500" size={20} />
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activityByDay}>
                          <defs>
                            <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#27272a' : '#f4f4f5'} />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#71717a' : '#a1a1aa' }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#71717a' : '#a1a1aa' }}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: isDark ? '#18181b' : '#ffffff', 
                              border: 'none', 
                              borderRadius: '16px',
                              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          />
                          <Area type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorActivity)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* User Growth Chart */}
                  <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-widest">{t('user-acquisition')}</h3>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">{t('new-registrations')}</p>
                      </div>
                      <Users className="text-blue-500" size={20} />
                    </div>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={userGrowth}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#27272a' : '#f4f4f5'} />
                          <XAxis 
                            dataKey="date" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#71717a' : '#a1a1aa' }}
                            dy={10}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fontWeight: 700, fill: isDark ? '#71717a' : '#a1a1aa' }}
                          />
                          <Tooltip 
                            cursor={{ fill: isDark ? '#27272a' : '#f4f4f5', radius: 8 }}
                            contentStyle={{ 
                              backgroundColor: isDark ? '#18181b' : '#ffffff', 
                              border: 'none', 
                              borderRadius: '16px',
                              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}
                          />
                          <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={30}>
                            {userGrowth.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === userGrowth.length - 1 ? '#3b82f6' : '#3b82f680'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* System Health Section */}
                <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 p-8 rounded-[2.5rem] shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-widest">{t('system-health')}</h3>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">{t('real-time-status')}</p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('all-systems-operational')}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">
                        <span>{t('api-response-time')}</span>
                        <span className="text-emerald-500">24ms</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full w-[15%]" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">
                        <span>{t('database-load')}</span>
                        <span className="text-blue-500">12%</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full w-[12%]" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">
                        <span>{t('ai-model-availability')}</span>
                        <span className="text-purple-500">100%</span>
                      </div>
                      <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full w-full" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeView === 'monitoring' && <MonitoringView />}
            {activeView === 'refunds' && <RefundsView />}
            {activeView === 'donations' && <DonationsView />}
            {activeView === 'chat' && <ChatCenter />}
            {activeView === 'communication' && <CommunicationCenter />}
            {activeView === 'codes' && <CodeManagementPage />}
            {activeView === 'tool-entitlements' && <ToolEntitlementsManager />}
            {activeView === 'model-entitlements' && <ModelEntitlementsManager />}
            {activeView === 'credit-audit' && <StandardCreditAuditView />}
            {activeView === 'fast-access-audit' && <FastAccessCreditAuditView />}
            {activeView === 'fast-access-accounts' && <FastAccessAccountsManager canHardDelete={currentAdminLevel === 'primary'} />}
            {activeView === 'stored-results' && <StoredResultsExplorer />}

      {activeView === 'users' && (
        <div className="space-y-4">
          <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 rounded-3xl p-4 shadow-sm">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Directory</p>
                  <p className="mt-2 text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{allUsers.length}</p>
                  <p className="mt-1 text-xs text-zinc-500">Firebase Auth + Firestore</p>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Admins</p>
                  <p className="mt-2 text-2xl font-black text-purple-600 dark:text-purple-400 tabular-nums">{adminAccountsCount}</p>
                  <p className="mt-1 text-xs text-zinc-500">Reserved and claims-backed</p>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Fast Access</p>
                  <p className="mt-2 text-2xl font-black text-amber-600 dark:text-amber-300 tabular-nums">{allUsers.filter((targetUser) => targetUser.isTemporaryAccess === true || targetUser.accountScope === 'faculty_science_fast_access').length}</p>
                  <p className="mt-1 text-xs text-zinc-500">Temporary account scope</p>
                </div>
                <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/40 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Link Issues</p>
                  <p className="mt-2 text-2xl font-black text-red-600 dark:text-red-400 tabular-nums">{linkageIssueCount}</p>
                  <p className="mt-1 text-xs text-zinc-500">Missing or inconsistent linkage</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAccountHealthFilter('all')}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    accountHealthFilter === 'all'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-700 dark:text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  )}
                >
                  All Health States
                </button>
                <button
                  type="button"
                  onClick={() => setAccountHealthFilter('admins')}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    accountHealthFilter === 'admins'
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  )}
                >
                  Admins
                </button>
                <button
                  type="button"
                  onClick={() => setAccountHealthFilter('blocked')}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    accountHealthFilter === 'blocked'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                  )}
                >
                  Blocked Or Suspended
                </button>
                <button
                  type="button"
                  onClick={() => setAccountHealthFilter('link-issues')}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    accountHealthFilter === 'link-issues'
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  )}
                >
                  Link Issues
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUserScopeFilter('all')}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    userScopeFilter === 'all'
                      ? 'bg-zinc-900 text-white dark:bg-emerald-500 dark:text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                  )}
                >
                  All Accounts
                </button>
                <button
                  type="button"
                  onClick={() => setUserScopeFilter('temporary-fast-access')}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    userScopeFilter === 'temporary-fast-access'
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                  )}
                >
                  Temporary Fast Access
                </button>
                <button
                  type="button"
                  onClick={() => setUserScopeFilter('full-account')}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                    userScopeFilter === 'full-account'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  )}
                >
                  Full Accounts
                </button>
              </div>
            </div>
          </div>

        <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm overflow-x-auto custom-scrollbar">
          <table className="w-full text-start min-w-[980px]">
            <thead>
              <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-emerald-500" onClick={() => handleSort('name')}>{t('user')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-emerald-500" onClick={() => handleSort('role')}>{t('role')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-emerald-500" onClick={() => handleSort('status')}>{t('status')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('usage-today')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Sync</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('providers')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-emerald-500" onClick={() => handleSort('lastLogin')}>{t('last-login')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-end">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {sortedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold">
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{user.name}</p>
                        <p className="text-xs text-zinc-500">{user.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {(user.isTemporaryAccess || user.accountScope === 'faculty_science_fast_access') && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                              Faculty Fast Access
                            </span>
                          )}
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider',
                            getAccountLinkageTone(user)
                          )}>
                            {getAccountLinkageLabel(user)}
                          </span>
                          {isGenericAdminViewOnly(user) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300">
                              View Only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                      isUserAdmin(user) ? "bg-purple-500/10 text-purple-500" : "bg-blue-500/10 text-blue-500"
                    )}>
                      {t(user.role)}
                    </span>
                    {(user.isTemporaryAccess || user.accountScope === 'faculty_science_fast_access') && (
                      <span className="ms-2 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600">
                        Temp
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full", 
                        user.status === 'Active' ? "bg-emerald-500" : 
                        user.status === 'Suspended' ? "bg-amber-500" :
                        user.status === 'Blocked' ? "bg-red-500" : "bg-blue-500"
                      )} />
                      <div className="space-y-1">
                        <span className="block text-xs text-zinc-700 dark:text-zinc-300">{t(user.status)}</span>
                        <span className="block text-[10px] text-zinc-400 uppercase tracking-widest">
                          {user.accountLinkage?.authDisabled ? 'Auth disabled' : (user.accountLinkage?.emailVerified ? 'Email verified' : 'Verification pending')}
                        </span>
                      </div>
                    </div>
                  </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-zinc-500 space-y-1">
                        <p>{t('credits')}: <span className="font-bold text-emerald-500">{isUserAdmin(user) ? '\u221E' : ((user.isTemporaryAccess || user.accountScope === 'faculty_science_fast_access') ? (user.fastAccessCredits ?? 0) : (user.credits || 0))}</span></p>
                        <p>AI: {user.usage.aiRequestsToday}/{user.limits.aiRequestsPerDay}</p>
                        <p className="uppercase tracking-widest text-[10px]">
                          Firestore: {user.accountLinkage?.firestoreProfileCompleteness || 'unknown'}
                        </p>
                      </div>
                    </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span className={cn(
                        'inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider',
                        getAccountLinkageTone(user)
                      )}>
                        {getAccountLinkageLabel(user)}
                      </span>
                      {(user.accountLinkage?.issues?.length || 0) > 0 && (
                        <p className="text-[10px] text-red-500 dark:text-red-400">
                          {user.accountLinkage?.issues?.length} issue{(user.accountLinkage?.issues?.length || 0) === 1 ? '' : 's'}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {user.authProviders?.map((providerId) => (
                        <span key={providerId} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500 dark:text-zinc-300 font-bold uppercase tracking-wider">
                          {formatProviderBadge(providerId)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-zinc-500">
                    <div className="space-y-1">
                      <p>{new Date(user.lastLogin).toLocaleDateString()}</p>
                      <p className="text-[10px] uppercase tracking-widest">
                        {user.accountLinkage?.authSource === 'firestore-only' ? 'Firestore only' : 'Firebase Auth'}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-end">
                      <div className="flex justify-end gap-2">
                        {isFacultyFastAccessManagedUser(user) ? (
                          <button
                            onClick={() => redirectToFastAccessManager(user, 'manage')}
                            className="px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest transition-all"
                            title="Manage in Faculty Fast Access manager"
                          >
                            Faculty Manager
                          </button>
                        ) : isGenericAdminViewOnly(user) ? (
                          <>
                            <button
                              onClick={() => setSelectedUser(user)}
                              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-all"
                              title={t('view')}
                            >
                              <Eye size={16} />
                            </button>
                            <span className="inline-flex items-center px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300 text-[10px] font-black uppercase tracking-widest">
                              Repair View
                            </span>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => setSelectedUser(user)}
                              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 transition-all"
                              title={t('view')}
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              onClick={() => setSelectedUser(user)}
                              className="p-2 hover:bg-emerald-500/10 rounded-lg text-emerald-600 transition-all"
                              title={t('edit')}
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                if (user.status === 'Blocked') {
                                  reactivateUser(user);
                                } else {
                                  blockUser(user, 'Blocked from quick actions');
                                }
                              }}
                              className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-600 transition-all"
                              title={user.status === 'Blocked' ? t('unblock') : t('block')}
                            >
                              <ShieldAlert size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                setUserToDelete(user);
                                setIsDeleteModalOpen(true);
                              }}
                              className="p-2 hover:bg-red-500/10 rounded-lg text-red-600 transition-all"
                              title={t('delete')}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-zinc-500 text-sm italic">
                    {t('no-users-found')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {activeView === 'requests' && canAccessModerationViews && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t('pending-requests')}</p>
              <p className="text-3xl font-black text-amber-500 tabular-nums">
                {userRequests.filter(r => r.status === 'Pending').length}
              </p>
            </div>
            <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t('approved-today')}</p>
              <p className="text-3xl font-black text-emerald-500 tabular-nums">
                {userRequests.filter(r => r.status === 'Approved' && new Date(r.createdAt).toDateString() === new Date().toDateString()).length}
              </p>
            </div>
            <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t('total-processed')}</p>
              <p className="text-3xl font-black text-zinc-900 dark:text-white tabular-nums">
                {userRequests.filter(r => r.status !== 'Pending').length}
              </p>
            </div>
          </div>

          <div className="bg-white/78 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200/90 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm overflow-x-auto custom-scrollbar">
            <table className="w-full text-start min-w-[800px]">
              <thead>
                <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('user')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('type')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('message')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('status')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('date')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-end">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {userRequests.map((req) => {
                  const reqUser = allUsers.find(u => u.id === req.userId);
                  return (
                    <tr key={req.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 font-bold">
                            {reqUser?.name.charAt(0) || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white">{reqUser?.name || t('unknown-user')}</p>
                            <p className="text-xs text-zinc-500">{reqUser?.email || req.userId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {req.type}
                        </span>
                        {req.targetPage && (
                          <p className="text-[10px] text-zinc-500 mt-1 capitalize">{req.targetPage}</p>
                        )}
                        {req.targetModel && (
                          <p className="text-[10px] text-zinc-500 mt-1 capitalize">{req.targetModel}</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 max-w-xs truncate" title={req.message}>
                          {req.message}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                          req.status === 'Pending' ? "bg-amber-500/10 text-amber-600" :
                          req.status === 'Approved' ? "bg-emerald-500/10 text-emerald-600" :
                          req.status === 'Modified' ? "bg-blue-500/10 text-blue-600" :
                          "bg-red-500/10 text-red-600"
                        )}>
                          {t(req.status)}
                          {req.approvedAmount !== undefined && ` (+${req.approvedAmount})`}
                        </span>
                        {req.unlockCode && (
                          <div className="mt-2 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                            <span className="font-bold">Code:</span> {req.unlockCode}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-zinc-500">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-end">
                        {req.status === 'Pending' ? (
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setProcessingRequest({ id: req.id, action: 'Approve', note: '' })}
                              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-90 rounded-lg text-emerald-600 transition-all cursor-pointer"
                              title={t('approve')}
                            >
                              <CheckCircle2 size={16} />
                            </button>
                            {req.type !== 'Page Access' && req.type !== 'Model Access' && (
                              <button 
                                onClick={() => setModifyingRequest({ id: req.id, amount: req.requestedAmount || 3, note: '' })}
                                className="p-2 bg-blue-500/10 hover:bg-blue-500/20 active:scale-90 rounded-lg text-blue-600 transition-all cursor-pointer"
                                title={t('modify-approve')}
                              >
                                <Edit size={16} />
                              </button>
                            )}
                            <button 
                              onClick={() => setProcessingRequest({ id: req.id, action: 'Reject', note: '' })}
                              className="p-2 bg-red-500/10 hover:bg-red-500/20 active:scale-90 rounded-lg text-red-600 transition-all cursor-pointer"
                              title={t('reject')}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest italic">{t('processed')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {userRequests.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 text-sm italic">
                      {t('no-user-requests-found')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeView === 'credits' && currentAdminLevel === 'primary' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t('total-credits-in-system')}</p>
              <p className="text-3xl font-black text-zinc-900 dark:text-white tabular-nums">
                {allUsers.reduce((acc, u) => acc + (u.credits || 0), 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t('average-credits-per-user')}</p>
              <p className="text-3xl font-black text-zinc-900 dark:text-white tabular-nums">
                {Math.round(allUsers.reduce((acc, u) => acc + (u.credits || 0), 0) / (allUsers.length || 1)).toLocaleString()}
              </p>
            </div>
            <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{t('active-ai-requests-today')}</p>
              <p className="text-3xl font-black text-emerald-500 tabular-nums">
                {allUsers.reduce((acc, u) => acc + u.usage.aiRequestsToday, 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm overflow-x-auto custom-scrollbar">
            <table className="w-full text-start min-w-[600px]">
              <thead>
                <tr className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('user')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('current-credits')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('total-ai-usage')}</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-end">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-500 font-bold">
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white">{user.name}</p>
                          <p className="text-xs text-zinc-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                          <Zap size={14} />
                        </div>
                        <span className="text-sm font-black text-zinc-900 dark:text-white tabular-nums">{isUserAdmin(user) ? '\u221E' : (user.credits || 0)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{user.totalAIRequests.toLocaleString()} {t('requests')}</span>
                        <div className="w-24 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-purple-500 rounded-full" 
                            style={{ width: `${Math.min(100, (user.totalAIRequests / 1000) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-end">
                      {isFacultyFastAccessManagedUser(user) ? (
                        <button
                          onClick={() => redirectToFastAccessManager(user, 'adjust fast-access settings for')}
                          className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
                        >
                          Faculty Manager
                        </button>
                      ) : (
                        <button 
                          onClick={() => setSelectedUser(user)}
                          className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer"
                        >
                          {t('adjust-credits')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminModal
        isOpen={!!processingRequest}
        onClose={() => setProcessingRequest(null)}
        title={`${t(processingRequest?.action?.toLowerCase() || '')} ${t('requests')}`}
        maxWidth="max-w-sm"
        className="p-6"
      >
        {processingRequest && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('admin-note')}</label>
              <textarea 
                value={processingRequest.note}
                onChange={(e) => setProcessingRequest({...processingRequest, note: e.target.value})}
                placeholder={`${t('reason-for')} ${t(processingRequest.action.toLowerCase())}...`}
                className="w-full h-24 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setProcessingRequest(null)}
                className="flex-1 py-2 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={() => {
                  const req = userRequests.find(r => r.id === processingRequest.id);
                  if (req) {
                    if (processingRequest.action === 'Approve') handleApproveRequest(req, processingRequest.note);
                    else handleRejectRequest(req, processingRequest.note);
                  }
                }}
                className={cn(
                  "flex-1 py-2 text-white text-sm font-bold rounded-xl transition-all shadow-lg",
                  processingRequest.action === 'Approve' ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20" : "bg-red-600 hover:bg-red-500 shadow-red-900/20"
                )}
              >
                {t('confirm')} {t(processingRequest.action.toLowerCase())}
              </button>
            </div>
          </div>
        )}
      </AdminModal>

      <AdminModal
        isOpen={!!modifyingRequest}
        onClose={() => setModifyingRequest(null)}
        title={t('modify-approve-request')}
        maxWidth="max-w-sm"
        className="p-6"
      >
        {modifyingRequest && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('approved-amount')}</label>
              <input 
                type="number" 
                value={modifyingRequest.amount}
                onChange={(e) => setModifyingRequest({...modifyingRequest, amount: parseInt(e.target.value) || 0})}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">{t('admin-note')}</label>
              <textarea 
                value={modifyingRequest.note}
                onChange={(e) => setModifyingRequest({...modifyingRequest, note: e.target.value})}
                placeholder={t('reason-for-modification')}
                className="w-full h-24 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setModifyingRequest(null)}
                className="flex-1 py-2 text-sm font-bold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
              >
                {t('cancel')}
              </button>
              <button 
                onClick={() => handleModifyRequest(modifyingRequest.id, modifyingRequest.amount, modifyingRequest.note)}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        )}
      </AdminModal>
      {activeView === 'logs' && canAccessModerationViews && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto custom-scrollbar">
              {['all', 'upload', 'quiz_gen', 'login', 'system'].map((type) => (
                <button
                  key={type}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                    type === 'all' ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-white/40 dark:bg-zinc-900/40 text-zinc-500 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                  )}
                >
                  {t(type)}
                </button>
              ))}
            </div>
            <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
              {t('showing-last-100-events')}
            </div>
          </div>

          <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-[700px] overflow-y-auto custom-scrollbar">
              {activities.length > 0 ? activities.map(log => (
                <div key={log.id} className="p-6 flex items-center gap-6 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors group">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                    log.type === 'upload' ? "bg-emerald-500/10 text-emerald-500" :
                    log.type === 'quiz_gen' ? "bg-purple-500/10 text-purple-500" : 
                    log.type === 'login' ? "bg-blue-500/10 text-blue-500" :
                    "bg-amber-500/10 text-amber-500"
                  )}>
                    {log.type === 'upload' ? <Database size={20} /> :
                     log.type === 'quiz_gen' ? <Zap size={20} /> : 
                     log.type === 'login' ? <UserIcon size={20} /> :
                     <Activity size={20} />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-zinc-900 dark:text-white font-bold truncate">{log.description}</p>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest",
                        log.type === 'upload' ? "bg-emerald-500/10 text-emerald-500" :
                        log.type === 'quiz_gen' ? "bg-purple-500/10 text-purple-500" : 
                        log.type === 'login' ? "bg-blue-500/10 text-blue-500" :
                        "bg-amber-500/10 text-amber-500"
                      )}>
                        {log.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                      <span className="flex items-center gap-1.5"><UserIcon size={12} /> {log.userId.slice(0, 8)}...</span>
                      <span className="flex items-center gap-1.5"><Clock size={12} /> {new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                  <div className="text-end shrink-0 hidden sm:block">
                    <p className="text-xs text-zinc-400 font-medium">{new Date(log.timestamp).toLocaleDateString()}</p>
                  </div>
                </div>
              )) : (
                <div className="p-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto text-zinc-400">
                    <Activity size={32} />
                  </div>
                  <p className="text-zinc-500 text-sm italic font-medium">{t('no-system-activity')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeView === 'models' && currentAdminLevel === 'primary' && (
        <div className="space-y-8">
          {/* Server-Managed Provider Runtime Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-6 shadow-sm">
              <div className="flex flex-col items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <ShieldAlert className="text-blue-500" size={20} />
                    {t('geminiRuntime', { defaultValue: 'Gemini Runtime' })}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {t('geminiRuntimeHint', {
                      defaultValue: 'Credentials are resolved server-side from environment configuration and never stored in the browser.',
                    })}
                  </p>
                </div>

                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('configured', { defaultValue: 'Configured' })}
                    </p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                      {isLoadingProviderSecuritySummary
                        ? t('loadingRuntime', { defaultValue: 'Loading runtime...' })
                        : providerSecuritySummary?.providers.google.configured
                          ? t('yes', { defaultValue: 'Yes' })
                          : t('no', { defaultValue: 'No' })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('executionMode', { defaultValue: 'Execution mode' })}
                    </p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.providers.google.executionMode || 'Server-managed'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60 sm:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('endpoint', { defaultValue: 'Endpoint' })}
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.providers.google.endpoint || 'https://generativelanguage.googleapis.com'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('envKey', { defaultValue: 'Env key' })}
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.providers.google.envKeyName || 'GEMINI_API_KEY'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('clientSecrets', { defaultValue: 'Client secrets' })}
                    </p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.clientSecretsAllowed
                        ? t('enabled', { defaultValue: 'Enabled' })
                        : t('disabled', { defaultValue: 'Disabled' })}
                    </p>
                  </div>
                </div>

                {providerSecuritySummaryError && (
                  <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                    {providerSecuritySummaryError}
                  </div>
                )}

                <button 
                  onClick={async () => {
                    setStatus('processing', t('testing-google-connection'));
                    try {
                      const result = await testGoogleConnection();
                      if (result.success) {
                        setStatus('success', result.message);
                        toast.success(result.message);
                      } else {
                        throw new Error(result.message);
                      }
                      setTimeout(() => reset(), 3000);
                    } catch (err: any) {
                      setError(err, () => {});
                    }
                  }}
                  disabled={isLoading}
                  className="w-full mt-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading && statusMessage?.includes('Google') ? <Loader2 className="animate-spin" size={14} /> : <Activity size={14} />}
                  {t('test-connection')}
                </button>
              </div>
            </div>

            <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-[2rem] p-6 shadow-sm">
              <div className="flex flex-col gap-6">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Key className="text-purple-500" size={20} />
                    {t('qwenDashScopeRuntime', { defaultValue: 'Alibaba Model Studio Runtime' })}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {t('alibabaCloudConfig', {
                      defaultValue: 'DashScope credentials, region, and base URL are resolved on the server and validated against the configured region.',
                    })}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('configured', { defaultValue: 'Configured' })}
                    </p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                      {isLoadingProviderSecuritySummary
                        ? t('loadingRuntime', { defaultValue: 'Loading runtime...' })
                        : providerSecuritySummary?.providers.alibabaModelStudio.configured
                          ? t('yes', { defaultValue: 'Yes' })
                          : t('no', { defaultValue: 'No' })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('region', { defaultValue: 'Region' })}
                    </p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.providers.alibabaModelStudio.region || 'us-virginia'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60 sm:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('baseUrl', { defaultValue: 'Base URL' })}
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.providers.alibabaModelStudio.baseUrl || 'https://dashscope-us.aliyuncs.com/compatible-mode/v1'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60 sm:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('endpoint', { defaultValue: 'Endpoint' })}
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.providers.alibabaModelStudio.endpoint || 'https://dashscope-us.aliyuncs.com/compatible-mode/v1'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('envKey', { defaultValue: 'Env key' })}
                    </p>
                    <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.providers.alibabaModelStudio.envKeyName || 'DASHSCOPE_API_KEY'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white/70 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('assetDelivery', { defaultValue: 'Asset delivery' })}
                    </p>
                    <p className="mt-1 text-sm font-bold text-zinc-900 dark:text-white">
                      {providerSecuritySummary?.assetDeliveryMode || 'authenticated-proxy'}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={async () => {
                    setStatus('processing', t('testing-qwen-connection'));
                    try {
                      const result = await testQwenConnection();
                      if (result.success) {
                        setStatus('success', result.message);
                        toast.success(result.message);
                      } else {
                        throw new Error(result.message);
                      }
                      setTimeout(() => reset(), 3000);
                    } catch (err: any) {
                      setError(err, () => {});
                    }
                  }}
                  disabled={isLoading}
                  className="w-full py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading && statusMessage?.includes('Qwen') ? <Loader2 className="animate-spin" size={14} /> : <Activity size={14} />}
                  {t('test-connection')}
                </button>
              </div>
            </div>
          </div>

          {/* Management Actions Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <GiftCodeManager />
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[2rem] p-6 flex flex-col items-center text-center space-y-4 hover:bg-emerald-500/10 transition-all group">
              <div className="p-4 bg-emerald-500/20 rounded-2xl text-emerald-600 group-hover:scale-110 transition-transform">
                <Zap size={32} />
              </div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white">{t('sync-google-models')}</h4>
                <p className="text-xs text-zinc-500 mt-1">{t('sync-google-desc')}</p>
              </div>
              <button 
                onClick={async () => {
                  setStatus('processing', t('syncing-google-models'));
                  try {
                    await refreshModels();
                    setStatus('success', t('models-synced-successfully'));
                    setTimeout(() => reset(), 3000);
                  } catch (err: any) {
                    setError(err, refreshModels);
                  }
                }}
                disabled={isLoading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                {isLoading && statusMessage?.includes('Syncing') ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />}
                {t('sync-now')}
              </button>
            </div>

            <div className="bg-purple-500/5 border border-purple-500/20 rounded-[2rem] p-6 flex flex-col items-center text-center space-y-4 hover:bg-purple-500/10 transition-all group">
              <div className="p-4 bg-purple-500/20 rounded-2xl text-purple-600 group-hover:scale-110 transition-transform">
                <Cpu size={32} />
              </div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-white">Model Access Governance</h4>
                <p className="text-xs text-zinc-500 mt-1">Registry metadata stays read-only here. Use the entitlement console for grants, revocations, code audits, and payment-backed unlock tracing.</p>
              </div>
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => setActiveView('model-entitlements')}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                >
                  <ShieldAlert size={14} />
                  Manage Access
                </button>
                <button 
                  onClick={async () => {
                    setStatus('processing', t('validating-qwen-models'));
                    try {
                      await validateQwenModels();
                      setStatus('success', 'Registry-backed model view refreshed');
                      setTimeout(() => reset(), 3000);
                    } catch (err: any) {
                      setError(err, validateQwenModels);
                    }
                  }}
                  disabled={isLoading}
                  className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading && statusMessage?.includes('Validating') ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  {t('validate')}
                </button>
              </div>
            </div>
          </div>

          {/* Models List */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 px-4">
              <h3 className="text-sm font-black text-zinc-400 uppercase tracking-[0.2em]">{t('all-models-priority')}</h3>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {models
                .sort((a, b) => a.priority - b.priority)
                .map((model) => (
                  <div key={model.id} className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm hover:border-emerald-500/30 transition-all">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              model.category === 'Free-Friendly' ? "bg-emerald-500/10 text-emerald-500" :
                              model.category === 'Balanced' ? "bg-blue-500/10 text-blue-500" :
                              model.category === 'Advanced' ? "bg-purple-500/10 text-purple-500" :
                              "bg-amber-500/10 text-amber-500"
                            )}>
                              <Cpu size={20} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-zinc-900 dark:text-white">{model.name}</h3>
                                {model.badge && (
                                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase rounded-full">
                                    {model.badge}
                                  </span>
                                )}
                                <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-[8px] font-bold uppercase rounded-full">
                                  {t('priority-label')}: {model.priority}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-500">{model.provider} • {model.modelId}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest",
                                model.isEnabled ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                              )}
                            >
                              {model.isEnabled ? 'Registry Enabled' : 'Registry Disabled'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.supportsText ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('text')}</div>
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.supportsFiles ? "bg-blue-500/10 text-blue-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('files')}</div>
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.supportsLongContext ? "bg-purple-500/10 text-purple-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('long-context')}</div>
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.supportsThinking ? "bg-indigo-500/10 text-indigo-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('thinking')}</div>
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.supportsSearch ? "bg-cyan-500/10 text-cyan-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('search')}</div>
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.supportsImageGeneration ? "bg-pink-500/10 text-pink-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('image')}</div>
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.supportsVideoGeneration ? "bg-orange-500/10 text-orange-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('video')}</div>
                          <div className={cn("px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-center", model.isFallback ? "bg-amber-500/10 text-amber-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400")}>{t('fallback')}</div>
                        </div>

                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed italic">"{model.helperText}"</p>
                      </div>

                      <div className="w-full md:w-64 space-y-4 border-t md:border-t-0 md:border-s border-zinc-200 dark:border-zinc-800 pt-4 md:pt-0 md:ps-6 flex flex-col justify-between">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('category')}</span>
                            <span className="text-[10px] font-bold text-zinc-900 dark:text-white">{t(model.category)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('status')}</span>
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider",
                              model.status === 'Ready' ? "bg-emerald-500/10 text-emerald-500" :
                              model.status === 'Quota Exceeded' ? "bg-red-500/10 text-red-500" :
                              "bg-amber-500/10 text-amber-500"
                            )}>
                              {t(model.status)}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setActiveView('model-entitlements')}
                            className="flex-1 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                          >
                            <ShieldAlert size={12} />
                            Entitlements
                          </button>
                          <button 
                            onClick={async () => {
                              toast.loading(`${t('testing')} ${model.name}...`, { id: 'test-model' });
                              try {
                                await refreshModels(); // This should ideally test the specific model
                                toast.success(`${model.name} ${t('is-operational')}`, { id: 'test-model' });
                              } catch (err) {
                                authHandleError(new Error(`${model.name} ${t('failed-connectivity-test')}`), 'admin_permission', 'test-model');
                              }
                            }}
                            className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl text-zinc-500 transition-all active:scale-95 cursor-pointer"
                            title={t('test-connectivity')}
                          >
                            <Activity size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

          </motion.div>
        </AnimatePresence>

    <AdminModal
      isOpen={isAddingModel}
        onClose={() => setIsAddingModel(false)}
        title={t('add-new-qwen-model')}
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('model-id-helper')}</label>
            <input 
              type="text"
              value={newModel.modelId || ''}
              onChange={(e) => setNewModel({...newModel, modelId: e.target.value, id: e.target.value})}
              placeholder={t('enter-official-model-id')}
              className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('display-name')}</label>
            <input 
              type="text"
              value={newModel.name || ''}
              onChange={(e) => setNewModel({...newModel, name: e.target.value})}
              placeholder={t('display-name-placeholder')}
              className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('helper-text')}</label>
            <input 
              type="text"
              value={newModel.helperText || ''}
              onChange={(e) => setNewModel({...newModel, helperText: e.target.value})}
              placeholder={t('helper-text-placeholder')}
              className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('category')}</label>
              <select 
                value={newModel.category}
                onChange={(e) => setNewModel({...newModel, category: e.target.value as any})}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="Free-Friendly">{t('Free-Friendly')}</option>
                <option value="Balanced">{t('Balanced')}</option>
                <option value="Advanced">{t('Advanced')}</option>
                <option value="Experimental">{t('Experimental')}</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('priority')}</label>
              <input 
                type="number"
                value={newModel.priority}
                onChange={(e) => setNewModel({...newModel, priority: parseInt(e.target.value) || 0})}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <button 
            onClick={() => {
              if (!newModel.modelId || !newModel.name) {
                authHandleError(new Error(t('model-id-name-required')), 'admin_permission', 'model-validation');
                return;
              }
              addModel(newModel as AIModel);
              setIsAddingModel(false);
              setNewModel({
                provider: 'Qwen',
                category: 'Balanced',
                status: 'Ready',
                isEnabled: true,
                supportsText: true,
                supportsFiles: true,
                supportsDocumentAnalysis: true,
                supportsQuizGeneration: true,
                supportsGenerateContent: true,
                supportsLongContext: true,
                supportsThinking: false,
                supportsSearch: false,
                isFreeFriendly: true,
                isPreview: false,
                priority: 20
              });
              toast.success(t('new-qwen-model-added'));
            }}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-purple-900/20 active:scale-95 cursor-pointer"
          >
            {t('create-model')}
          </button>
        </div>
      </AdminModal>

      <AdminModal
        isOpen={!!editingModel}
        onClose={() => setEditingModel(null)}
        title={`${t('edit-model')}: ${editingModel?.name || ''}`}
      >
        {editingModel && (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('display-name')}</label>
              <input 
                type="text"
                value={editingModel.name}
                onChange={(e) => setEditingModel({...editingModel, name: e.target.value})}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('helper-text')}</label>
              <input 
                type="text"
                value={editingModel.helperText}
                onChange={(e) => setEditingModel({...editingModel, helperText: e.target.value})}
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('category')}</label>
                <select 
                  value={editingModel.category}
                  onChange={(e) => setEditingModel({...editingModel, category: e.target.value as any})}
                  className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="Free-Friendly">{t('Free-Friendly')}</option>
                  <option value="Balanced">{t('Balanced')}</option>
                  <option value="Advanced">{t('Advanced')}</option>
                  <option value="Experimental">{t('Experimental')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('priority')}</label>
                <input 
                  type="number"
                  value={editingModel.priority}
                  onChange={(e) => setEditingModel({...editingModel, priority: parseInt(e.target.value) || 0})}
                  className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('capabilities')}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'supportsText', label: t('text') },
                  { key: 'supportsFiles', label: t('files') },
                  { key: 'supportsLongContext', label: t('long-context') },
                  { key: 'supportsThinking', label: t('thinking') },
                  { key: 'supportsSearch', label: t('search') },
                  { key: 'supportsImageGeneration', label: t('image-gen') },
                  { key: 'supportsVideoGeneration', label: t('video-gen') },
                  { key: 'isFallback', label: t('fallback') }
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input 
                      type="checkbox" 
                      checked={!!(editingModel as any)[key]} 
                      onChange={(e) => setEditingModel({...editingModel, [key]: e.target.checked})}
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-3">
                <Zap size={18} className={editingModel.isEnabled ? "text-amber-500" : "text-zinc-400"} />
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">{t('active-status')}</p>
                  <p className="text-xs text-zinc-500">{t('enable-disable-model')}</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingModel({...editingModel, isEnabled: !editingModel.isEnabled})}
                className={cn(
                  "w-12 h-6 rounded-full transition-all relative",
                  editingModel.isEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                  editingModel.isEnabled ? "start-7" : "start-1"
                )} />
              </button>
            </div>

            <div className="flex gap-3 pt-4">
              <button 
                onClick={() => setModelToDelete(editingModel)}
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 size={18} />
                {t('delete')}
              </button>
              <button 
                onClick={() => {
                  if (!editingModel.name) {
                    authHandleError(new Error(t('name-required')), 'admin_permission', 'model-validation');
                    return;
                  }
                  updateModel(editingModel.id, editingModel);
                  setEditingModel(null);
                  toast.success(t('model-updated-successfully'));
                }}
                className="flex-[2] bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold py-4 rounded-2xl transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                {t('save-changes')}
              </button>
            </div>
          </div>
        )}
      </AdminModal>

      <AdminModal
        isOpen={isCreatingUser}
        onClose={() => setIsCreatingUser(false)}
        title={t('create-new-user')}
        maxWidth="max-w-md"
        className="p-0"
      >
        <div className="space-y-0">
          <div className="p-8 space-y-6">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">{t('full-name')}</label>
              <input 
                type="text" 
                value={newUserForm.name}
                onChange={e => setNewUserForm({...newUserForm, name: e.target.value})}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                placeholder={t('full-name-placeholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">{t('email-address')}</label>
              <input 
                type="email" 
                value={newUserForm.email}
                onChange={e => setNewUserForm({...newUserForm, email: e.target.value})}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                placeholder={t('email-placeholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">{t('username')}</label>
              <input 
                type="text" 
                value={newUserForm.username}
                onChange={e => setNewUserForm({...newUserForm, username: e.target.value})}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                placeholder={t('username-placeholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">{t('password')}</label>
              <input 
                type="password" 
                value={newUserForm.password}
                onChange={e => setNewUserForm({...newUserForm, password: e.target.value})}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
                placeholder={t('password-placeholder')}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2 px-1">{t('initial-role')}</label>
              <select 
                value={newUserForm.role}
                onChange={e => setNewUserForm({...newUserForm, role: e.target.value as User['role']})}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all"
              >
                <option value="User">{t('User')}</option>
                <option value="Admin">{t('Admin')}</option>
              </select>
            </div>
          </div>
          <div className="p-8 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
            <button 
              onClick={() => setIsCreatingUser(false)}
              className="px-8 py-3 rounded-2xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all cursor-pointer active:scale-95"
            >
              {t('cancel')}
            </button>
            <button 
              onClick={async () => {
                if (!newUserForm.name || !newUserForm.email || !newUserForm.password || !newUserForm.username) {
                  authHandleError(new Error(t('fill-all-fields')), 'admin_permission', 'form-validation');
                  return;
                }
                await createUser({
                  name: newUserForm.name,
                  email: newUserForm.email,
                  username: newUserForm.username,
                  role: newUserForm.role
                }, newUserForm.password);
                setIsCreatingUser(false);
                setNewUserForm({ name: '', email: '', password: '', username: '', role: 'User' });
              }}
              className="px-8 py-3 rounded-2xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer active:scale-95"
            >
              {t('create-user')}
            </button>
          </div>
        </div>
      </AdminModal>

      <AnimatePresence>
        {selectedUser && currentUser && !isFacultyFastAccessManagedUser(selectedUser) && (
          <AdminUserProfile 
            user={selectedUser} 
            currentUser={currentUser}
            onClose={() => setSelectedUser(null)}
            onSave={(userId, updates) => {
              updateUser(userId, updates);
              setSelectedUser(null);
            }}
          />
        )}
      </AnimatePresence>

      <AdminModal
        isOpen={!!modelToDelete}
        onClose={() => setModelToDelete(null)}
        title={t('delete-model')}
        maxWidth="max-w-md"
      >
        <div className="space-y-6">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('delete-model-confirm')} <span className="font-bold text-zinc-900 dark:text-white">{modelToDelete?.name}</span>? {t('action-cannot-undone')}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setModelToDelete(null)}
              className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors font-medium"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => {
                if (modelToDelete) {
                  deleteModel(modelToDelete.id);
                  toast.success(t('model-deleted'));
                  setModelToDelete(null);
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors font-bold shadow-lg shadow-red-900/20"
            >
              {t('delete-model')}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        isOpen={!!userToDelete}
        onClose={() => {
          setUserToDelete(null);
          setIsDeleteModalOpen(false);
        }}
        title={t('delete-user')}
        maxWidth="max-w-md"
      >
        <div className="space-y-6">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('delete-user-confirm')} <span className="font-bold text-zinc-900 dark:text-white">{userToDelete?.email}</span>? {t('action-cannot-undone')}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setUserToDelete(null);
                setIsDeleteModalOpen(false);
              }}
              className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors font-medium"
            >
              {t('cancel')}
            </button>
            <button
              onClick={async () => {
                if (userToDelete) {
                  await deleteUser(userToDelete.id);
                  toast.success(t('user-deleted'));
                  setUserToDelete(null);
                  setIsDeleteModalOpen(false);
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors font-bold shadow-lg shadow-red-900/20"
            >
              {t('delete-user')}
            </button>
          </div>
        </div>
      </AdminModal>

      <div className="text-center py-8 text-zinc-500 dark:text-zinc-600 text-xs font-medium">
        {t('copyright-text')}
      </div>
      </div>
    </div>
    </>
  );
};

export default AdminPanel;
