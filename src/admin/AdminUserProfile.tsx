import React, { useState } from 'react';
import { User, UserStatus, UserPermissions, UserLimits } from '../utils';
import { X, Save, Shield, Activity, Database, Zap, Clock, AlertCircle, Mail, User as UserIcon, CheckCircle2, FileText, Info, Ban, UserCheck, UserX } from 'lucide-react';
import { cn } from '../utils';
import toast from 'react-hot-toast';
import { AdminModal } from './components/AdminModal';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { isPrimaryAdminUser, isUserAdmin } from '../auth/accessControl';

interface Props {
  user: User;
  currentUser: User;
  onClose: () => void;
  onSave: (userId: string, updates: Partial<User>) => void;
}

const AdminUserProfile: React.FC<Props> = ({ user, currentUser, onClose, onSave }) => {
  const { t } = useTranslation();
  const { approveUser, rejectUser, suspendUser, blockUser, reactivateUser } = useAuth();
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [role, setRole] = useState<User['role']>(user.role);
  const [permissions, setPermissions] = useState<UserPermissions>(user.permissions);
  const [limits, setLimits] = useState<UserLimits>(user.limits);
  const [credits, setCredits] = useState(user.credits || 0);
  const [adminNotes, setAdminNotes] = useState(user.adminNotes || '');
  const isReadOnlyAccount = user.accountLinkage?.adminManagementMode === 'view_only';
  const linkageIssues = user.accountLinkage?.issues || [];

  const isOwner = user.email === 'alahlyeagle13@gmail.com';
  const canModifyRole = isPrimaryAdminUser(currentUser) && !isOwner;

  const [moderationAction, setModerationAction] = useState<'approve' | 'reject' | 'suspend' | 'block' | 'reactivate' | null>(null);
  const [moderationReason, setModerationReason] = useState('');

  const handleSave = () => {
    if (isReadOnlyAccount) {
      toast.error('This account is view-only until Firebase Auth and Firestore linkage is repaired.');
      return;
    }
    if (isOwner) {
      toast.error(t('owner-modify-error'));
      return;
    }
    if (role !== user.role && !canModifyRole) {
      toast.error(t('role-modify-error'));
      return;
    }
    onSave(user.id, {
      status,
      role,
      permissions,
      limits,
      credits,
      adminNotes
    });
    toast.success(t('user-profile-updated'));
    onClose();
  };

  const confirmModerationAction = async () => {
    if (!moderationAction) return;
    if (isReadOnlyAccount) {
      toast.error('Repair the account linkage before using generic moderation actions.');
      return;
    }
    try {
      switch (moderationAction) {
        case 'approve': await approveUser(user); setStatus('Active'); break;
        case 'reject': await rejectUser(user, moderationReason); setStatus('Rejected'); break;
        case 'suspend': await suspendUser(user, moderationReason); setStatus('Suspended'); break;
        case 'block': await blockUser(user, moderationReason); setStatus('Blocked'); break;
        case 'reactivate': await reactivateUser(user); setStatus('Active'); break;
      }
      setModerationAction(null);
      setModerationReason('');
    } catch (error) {
      toast.error(t('moderation-action-failed'));
    }
  };

  const handleModerationAction = (action: 'approve' | 'reject' | 'suspend' | 'block' | 'reactivate') => {
    if (isReadOnlyAccount) {
      toast.error('Repair the account linkage before using generic moderation actions.');
      return;
    }
    if (['reject', 'suspend', 'block'].includes(action)) {
      setModerationAction(action);
    } else {
      setModerationAction(action);
      // For approve and reactivate, we can confirm immediately or still show a modal.
      // Let's just set the action and the modal will handle it.
    }
  };

  return (
    <AdminModal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-7xl"
      showHeader={false}
      className="p-0 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950"
    >
      {/* Premium Header with Dynamic Backdrop */}
      <div className="relative shrink-0 overflow-hidden">
        {/* Animated Background Gradients */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full animate-pulse delay-700" />
        </div>
        
        <div className="relative p-8 sm:p-12 border-b border-zinc-200 dark:border-zinc-800/50 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-3xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
            <div className="flex flex-col sm:flex-row items-center sm:items-start lg:items-center gap-8 text-center sm:text-left">
              <div className="relative group">
                <div className="w-32 h-32 bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-800 rounded-[2.5rem] flex items-center justify-center text-white font-black text-5xl shadow-2xl shadow-emerald-500/40 group-hover:scale-105 transition-all duration-700 ring-8 ring-white dark:ring-zinc-900 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {user.name.charAt(0)}
                </div>
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={cn(
                    "absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl border-4 border-white dark:border-zinc-900 shadow-xl flex items-center justify-center z-10",
                    status === 'Active' ? "bg-emerald-500" : 
                    status === 'Suspended' ? "bg-amber-500" : "bg-red-500"
                  )}
                >
                  {status === 'Active' && <CheckCircle2 size={18} className="text-white" />}
                  {status === 'Suspended' && <AlertCircle size={18} className="text-white" />}
                  {status === 'Blocked' && <Shield size={18} className="text-white" />}
                </motion.div>
              </div>
              
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <h2 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter">
                    {user.name}
                  </h2>
                  <div className="flex gap-2">
                    <span className={cn(
                      "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] border shadow-sm backdrop-blur-md",
                      isUserAdmin(user) 
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" 
                        : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                    )}>
                      {t(user.role)}
                    </span>
                    {isOwner && (
                      <span className="px-4 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-sm backdrop-blur-md">
                        {t('system-owner')}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-y-3 gap-x-8 text-xs text-zinc-500 font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-2.5 hover:text-emerald-500 transition-colors cursor-default group">
                    <Mail size={16} className="text-zinc-400 group-hover:text-emerald-500 transition-colors" /> {user.email}
                  </span>
                  <span className="flex items-center gap-2.5 hover:text-emerald-500 transition-colors cursor-default group">
                    <Database size={16} className="text-zinc-400 group-hover:text-emerald-500 transition-colors" /> {t('id')}: {user.id.slice(0, 12)}
                  </span>
                  <span className="flex items-center gap-2.5 hover:text-emerald-500 transition-colors cursor-default group">
                    <Clock size={16} className="text-zinc-400 group-hover:text-emerald-500 transition-colors" /> {t('joined')} {new Date(user.firstLoginDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-center lg:justify-end gap-6">
              <div className="hidden sm:flex flex-col items-end gap-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('last-active')}</p>
                <p className="text-sm font-black text-zinc-900 dark:text-white">{new Date(user.lastLogin).toLocaleDateString()}</p>
              </div>
              <button 
                onClick={onClose}
                className="p-5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-[2rem] transition-all text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer active:scale-90 group border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 shadow-sm"
              >
                <X size={32} className="group-hover:rotate-90 transition-transform duration-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bento-Grid Style Dashboard Content */}
      <div className="flex-1 overflow-y-auto p-8 sm:p-12 custom-scrollbar space-y-12">
        <div className={cn(
          "rounded-[2.5rem] border p-8 shadow-sm",
          isReadOnlyAccount
            ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40"
            : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
        )}>
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Identity Sync</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest",
                  user.accountLinkage?.linkageStatus === 'linked'
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : user.accountLinkage?.linkageStatus === 'auth_only'
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : user.accountLinkage?.linkageStatus === 'firestore_only'
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-red-500/10 text-red-600 dark:text-red-400"
                )}>
                  {user.accountLinkage?.linkageStatus || 'linked'}
                </span>
                <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  {user.accountLinkage?.authSource === 'firestore-only' ? 'Firestore Only' : 'Firebase Auth'}
                </span>
                {isReadOnlyAccount && (
                  <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-700 dark:text-amber-300">
                    View Only
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(user.accountLinkage?.providerIds || []).map((providerId) => (
                  <span key={providerId} className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300">
                    {providerId}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Firestore Profile</p>
                <p className="mt-2 text-sm font-black text-zinc-900 dark:text-white">{user.accountLinkage?.firestoreProfileCompleteness || 'unknown'}</p>
              </div>
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Auth State</p>
                <p className="mt-2 text-sm font-black text-zinc-900 dark:text-white">
                  {user.accountLinkage?.authDisabled ? 'Disabled' : 'Active'}
                </p>
              </div>
            </div>
          </div>

          {linkageIssues.length > 0 && (
            <div className="mt-6 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500">Detected Issues</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {linkageIssues.map((issue) => (
                  <span key={issue} className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-600 dark:text-red-400">
                    {issue}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Top Row: Quick Stats & Credits */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          {/* Performance Metrics (8 cols) */}
          <div className="xl:col-span-8 bg-white dark:bg-zinc-900 p-10 rounded-[3rem] border border-zinc-200 dark:border-zinc-800 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Activity size={120} className="text-emerald-500" />
            </div>
            
            <div className="relative z-10 space-y-10">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-4">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  {t('usage-analytics')}
                </h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                  { label: t('total-uploads'), value: user.totalUploads, color: 'text-blue-500', bg: 'bg-blue-500/5', icon: Database },
                  { label: t('ai-requests'), value: user.totalAIRequests, color: 'text-purple-500', bg: 'bg-purple-500/5', icon: Zap },
                  { label: t('quiz-assets'), value: user.totalQuizzes, color: 'text-amber-500', bg: 'bg-amber-500/5', icon: FileText }
                ].map((stat, i) => (
                  <div key={i} className={cn("p-8 rounded-[2rem] border border-zinc-100 dark:border-zinc-800/50 flex flex-col gap-4 group/card hover:border-zinc-300 dark:hover:border-zinc-700 transition-all shadow-sm", stat.bg)}>
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg", stat.bg.replace('/5', '/20'))}>
                      <stat.icon size={20} className={stat.color} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{stat.label}</p>
                      <p className={cn("text-3xl font-black tabular-nums tracking-tighter", stat.color)}>{stat.value.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Credit Wallet (4 cols) */}
          <div className="xl:col-span-4 bg-zinc-900 dark:bg-zinc-950 p-10 rounded-[3rem] shadow-2xl shadow-zinc-900/20 space-y-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-1000" />
            
            <div className="relative z-10 space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-4">
                  <Zap size={18} className="text-emerald-500" />
                  {t('ai-wallet')}
                </h3>
              </div>
              
              <div className="flex items-baseline gap-3">
                <span className="text-6xl font-black text-white tracking-tighter tabular-nums">{isUserAdmin(user) ? '\u221E' : (user.credits || 0)}</span>
                <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">{t('credits')}</span>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">{t('adjust-balance')}</label>
                  <div className="flex gap-3">
                    <input 
                      type="number" 
                      value={credits}
                      onChange={e => setCredits(parseInt(e.target.value) || 0)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-lg font-black text-white focus:outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all placeholder:text-white/10"
                      placeholder="0"
                    />
                    <button 
                      onClick={() => setCredits(c => c + 100)}
                      className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black cursor-pointer transition-all active:scale-95 shadow-xl shadow-emerald-900/40 uppercase tracking-widest"
                    >
                      +100
                    </button>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {[10, 50, 500].map(val => (
                    <button 
                      key={val}
                      onClick={() => setCredits(c => c + val)}
                      className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest"
                    >
                      +{val}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Section: Configuration & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left: Core Access & Quotas (7 cols) */}
          <div className="lg:col-span-7 space-y-10">
            {/* Access & Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Role Control */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 rounded-[3rem] shadow-sm space-y-8">
                <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-4">
                  <Shield size={18} className="text-purple-500" />
                  {t('permission-tier')}
                </h3>
                <div className="flex flex-col gap-3">
                  {(['User', 'Admin'] as User['role'][]).map(r => (
                    <button
                      key={r}
                      disabled={isOwner || !canModifyRole}
                      onClick={() => setRole(r)}
                      className={cn(
                        "w-full px-6 py-5 rounded-2xl text-xs font-black transition-all cursor-pointer border flex items-center justify-between uppercase tracking-widest group",
                        role === r 
                          ? "bg-purple-600 text-white border-purple-700 shadow-xl shadow-purple-500/20" 
                          : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:border-purple-500/30 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                        (isOwner || !canModifyRole) && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        {r === 'Admin' ? <Shield size={16} /> : <UserIcon size={16} />}
                        {t(r)}
                      </div>
                      {role === r && <CheckCircle2 size={16} className="text-white/60" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Control */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 rounded-[3rem] shadow-sm space-y-8">
                <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-4">
                  <Activity size={18} className="text-emerald-500" />
                  {t('account-state')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {(['Active', 'Suspended', 'Blocked', 'Pending', 'Rejected'] as UserStatus[]).map(s => (
                    <button
                      key={s}
                      disabled={isOwner}
                      onClick={() => setStatus(s)}
                      className={cn(
                        "px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border",
                        status === s 
                          ? s === 'Active' ? "bg-emerald-600 text-white border-emerald-700 shadow-lg shadow-emerald-500/20" 
                            : s === 'Suspended' ? "bg-amber-500 text-white border-amber-600 shadow-lg shadow-amber-500/20"
                            : s === 'Blocked' ? "bg-red-600 text-white border-red-700 shadow-lg shadow-red-500/20"
                            : s === 'Rejected' ? "bg-zinc-600 text-white border-zinc-700 shadow-lg shadow-zinc-500/20"
                            : "bg-blue-600 text-white border-blue-700 shadow-lg shadow-blue-500/20"
                          : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800",
                        isOwner && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {t(s)}
                    </button>
                  ))}
                </div>
                
                {/* Moderation Actions */}
                <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{t('moderation-actions')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => handleModerationAction('approve')} disabled={isReadOnlyAccount} className={cn("flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", isReadOnlyAccount ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed" : "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200")}>
                      <UserCheck size={14} /> {t('approve')}
                    </button>
                    <button onClick={() => handleModerationAction('reject')} disabled={isReadOnlyAccount} className={cn("flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", isReadOnlyAccount ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 hover:bg-zinc-200")}>
                      <UserX size={14} /> {t('reject')}
                    </button>
                    <button onClick={() => handleModerationAction('suspend')} disabled={isReadOnlyAccount} className={cn("flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", isReadOnlyAccount ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed" : "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200")}>
                      <Clock size={14} /> {t('suspend')}
                    </button>
                    <button onClick={() => handleModerationAction('block')} disabled={isReadOnlyAccount} className={cn("flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", isReadOnlyAccount ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed" : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-200")}>
                      <Ban size={14} /> {t('block')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quota Management */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 rounded-[3rem] shadow-sm space-y-10">
              <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-4">
                <Database size={18} className="text-blue-500" />
                {t('resource-quotas')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
                {[
                  { label: t('ai-requests-per-day'), key: 'aiRequestsPerDay', used: user.usage.aiRequestsToday, icon: <Zap size={18} className="text-emerald-500" /> },
                  { label: t('quiz-generations-per-day'), key: 'quizGenerationsPerDay', used: user.usage.quizGenerationsToday, icon: <FileText size={18} className="text-amber-500" /> },
                  { label: t('uploads-per-day'), key: 'uploadsPerDay', used: user.usage.uploadsToday, icon: <Database size={18} className="text-blue-500" /> }
                ].map((limit) => (
                  <div key={limit.key} className="space-y-4 group">
                    <label className="flex items-center gap-3 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      {limit.icon}
                      {limit.label}
                    </label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={(limits as any)[limit.key]}
                        onChange={e => setLimits({...limits, [limit.key]: parseInt(e.target.value) || 0})}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-6 py-5 text-lg font-black text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all tabular-nums shadow-inner"
                      />
                    </div>
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{t('consumed')}</span>
                      <span className="text-xs font-black text-zinc-900 dark:text-white tabular-nums">{limit.used} / {(limits as any)[limit.key]}</span>
                    </div>
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (limit.used / (limits as any)[limit.key]) * 100)}%` }}
                        className={cn(
                          "h-full rounded-full",
                          (limit.used / (limits as any)[limit.key]) > 0.9 ? "bg-red-500" : "bg-emerald-500"
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Feature Access & Notes (5 cols) */}
          <div className="lg:col-span-5 space-y-10">
            {/* Feature Access Grid */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 rounded-[3rem] shadow-sm space-y-10">
              <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-4">
                <Shield size={18} className="text-emerald-500" />
                {t('feature-permissions')}
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(permissions).map(([key, value]) => (
                  <label key={key} className="group flex items-center justify-between p-6 rounded-[2rem] border border-zinc-100 dark:border-zinc-800 hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] cursor-pointer transition-all">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        value ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                      )}>
                        <CheckCircle2 size={18} />
                      </div>
                      <span className="text-xs font-black text-zinc-700 dark:text-zinc-300 capitalize tracking-tight">
                        {t(key.replace(/([A-Z])/g, ' $1').trim().toLowerCase().replace(/\s+/g, '-'))}
                      </span>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={value}
                        onChange={e => setPermissions({...permissions, [key]: e.target.checked})}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-8 bg-zinc-200 dark:bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-600 shadow-inner"></div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Admin Intelligence Section */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-10 rounded-[3rem] shadow-sm space-y-8">
              <h3 className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em] flex items-center gap-4">
                <AlertCircle size={18} className="text-amber-500" />
                {t('admin-intelligence')}
              </h3>
              <div className="space-y-6">
                <textarea 
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder={t('admin-intelligence-desc')}
                  className="w-full h-48 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-[2.5rem] p-8 text-sm font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-emerald-500/5 focus:border-emerald-500 resize-none transition-all placeholder:text-zinc-400 leading-relaxed shadow-inner"
                />
                <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                  <Info size={16} className="text-amber-500 shrink-0" />
                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest leading-tight">
                    {t('notes-visible-admins')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* High-Contrast Action Bar */}
      <div className="p-10 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row justify-between items-center gap-8 shrink-0 shadow-[0_-20px_60px_rgba(0,0,0,0.04)] z-20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-600">
            <Shield size={24} />
          </div>
          <div>
            <p className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-widest">{t('admin-authorization')}</p>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{t('changes-logged-audit')}</p>
          </div>
        </div>
        
        <div className="flex gap-4 w-full sm:w-auto">
          <button 
            onClick={onClose}
            className="flex-1 sm:flex-none px-12 py-5 rounded-2xl text-xs font-black text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all cursor-pointer active:scale-95 uppercase tracking-[0.2em] border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700"
          >
            {t('discard')}
          </button>
          <button 
            onClick={handleSave}
            disabled={isReadOnlyAccount}
            className={cn(
              "flex-1 sm:flex-none px-12 py-5 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-4 uppercase tracking-[0.2em] group",
              isReadOnlyAccount
                ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-not-allowed"
                : "text-white bg-emerald-600 hover:bg-emerald-500 shadow-2xl shadow-emerald-600/40 cursor-pointer active:scale-95"
            )}
          >
            <Save size={20} className="group-hover:scale-110 transition-transform" />
            {isReadOnlyAccount ? 'View Only' : t('commit-changes')}
          </button>
        </div>
      </div>
      {/* Moderation Modal */}
      <AnimatePresence>
        {moderationAction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-zinc-800"
            >
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-2 capitalize">
                {moderationAction} User
              </h3>
              <p className="text-sm text-zinc-500 mb-4">
                Are you sure you want to {moderationAction} {user.name}?
              </p>
              
              {['reject', 'suspend', 'block'].includes(moderationAction) && (
                <div className="mb-6">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
                    Reason (Optional)
                  </label>
                  <textarea
                    value={moderationReason}
                    onChange={(e) => setModerationReason(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none h-24"
                    placeholder="Enter reason for this action..."
                  />
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setModerationAction(null);
                    setModerationReason('');
                  }}
                  className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModerationAction}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </AdminModal>
  );
};

export default AdminUserProfile;
