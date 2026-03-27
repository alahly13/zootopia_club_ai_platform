import * as React from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  History, 
  Image as ImageIcon, 
  Images,
  MessageSquare, 
  Settings, 
  BookOpen, 
  BarChart3,
  ShieldCheck,
  Zap,
  Video,
  Mic,
  BrainCircuit,
  HelpCircle,
  Rocket,
  X,
  PanelLeftOpen,
  PanelLeftClose,
  CreditCard,
  Heart,
  Phone,
  Crown,
  User,
  Info,
  Sparkles,
  Lock,
  Mail
} from 'lucide-react';
import { cn, COPYRIGHT } from '../utils';
import { useAuth } from '../auth/AuthContext';
import { normalizeAdminLevel } from '../auth/accessControl';
import { useLanguage } from '../contexts/LanguageContext';
import { isFacultyFastAccessUser, isFastAccessMenuItemAllowed } from '../constants/fastAccessPolicy';
import { Logo } from './Logo';
import { motion } from 'motion/react';
import { BrandedSeal } from './BrandedSeal';
import { SidebarToggle } from './SidebarToggle';
import { Modal } from './Modal';
import { auth } from '../firebase';
import { mapToolUnlockRedeemError } from '../services/toolUnlockErrorMap';
import { preloadWorkspaceRoute } from '../routing/workspaceRoutes';
import { POPUP_FLOW_PRIORITY, TOOL_UNLOCK_FLOW_ID } from '../constants/popupFlows';

const TOOL_UNLOCK_PRICE_EGP = 200;

const UNLOCKABLE_ROUTE_TO_TOOL_ID: Record<string, 'quiz' | 'analyze' | 'infographic'> = {
  generate: 'quiz',
  infographic: 'infographic',
};

const UNLOCKABLE_ROUTE_LABEL: Record<string, string> = {
  generate: 'Assessment Generator',
  infographic: 'Infographic Generator',
};

const resolveUnlockedRoutesFromUser = (user: any): Set<string> => {
  const result = new Set<string>();
  const unlockedPages = Array.isArray(user?.unlockedPages) ? user.unlockedPages : [];
  unlockedPages.forEach((pageId: string) => {
    if (typeof pageId === 'string' && pageId.trim()) {
      result.add(pageId.trim());
    }
  });
  return result;
};

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenWelcomePopup?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onClose, isCollapsed = false, onToggleCollapse, onOpenWelcomePopup }) => {
  const { user, isAdmin, notify } = useAuth();
  const { t } = useLanguage();
  const isFastAccessUser = isFacultyFastAccessUser(user);
  const normalizedAdminLevel = normalizeAdminLevel(user?.adminLevel);
  const remainingFastAccessCredits = user?.fastAccessCredits ?? 0;
  const [unlockModalRouteId, setUnlockModalRouteId] = React.useState<string | null>(null);
  const [unlockCode, setUnlockCode] = React.useState('');
  const [isRedeeming, setIsRedeeming] = React.useState(false);
  const [isStartingCheckout, setIsStartingCheckout] = React.useState(false);
  const [locallyUnlockedRoutes, setLocallyUnlockedRoutes] = React.useState<string[]>([]);
  
  const menuItems = [
    // Keep the top of the sidebar aligned with the product hierarchy:
    // assessment first, analysis second, then the next-most-core creation tools.
    { id: 'generate', label: t('uploadUI.assessmentSidebarLabel', { defaultValue: 'Quiz / Assessment Generation' }), icon: FileText },
    { id: 'analysis', label: t('uploadUI.analysisWorkspaceTitle', { defaultValue: 'Analysis Workspace' }), icon: BrainCircuit },
    { id: 'infographic', label: t('infographic'), icon: BarChart3 },
    { id: 'image-editor', label: t('imageEditor', { defaultValue: 'Image Editor' }), icon: Sparkles },
    { id: 'images', label: t('imageGenerator'), icon: ImageIcon },
    { id: 'videos', label: t('videoGenerator'), icon: Video },
    { id: 'chat', label: t('aiChatbot'), icon: MessageSquare },
    { id: 'inbox', label: t('inbox', 'Inbox'), icon: Mail },
    { id: 'live', label: t('liveVoice'), icon: Mic },
    { id: 'tools', label: t('studyTools'), icon: BookOpen },
    { id: 'history', label: t('activityHistory'), icon: History },
    { id: 'library', label: t('resultsLibrary', { defaultValue: 'Results Library' }), icon: Images },
    { id: 'support', label: t('supportRequests'), icon: HelpCircle },
    { id: 'plans', label: t('plansPricing'), icon: Zap },
    { id: 'premium-hub', label: t('premium-hub'), icon: Crown },
    { id: 'internal-chat', label: 'Chat with Admin', icon: MessageSquare, locked: true },
    { id: 'secrets', label: 'Secrets', icon: Lock, locked: true },
    { id: 'donation', label: t('donation'), icon: Heart },
    { id: 'contact', label: t('contact'), icon: Phone },
    { id: 'billing', label: t('billing'), icon: CreditCard },
    { id: 'account', label: t('account'), icon: User },
    { id: 'admin', label: t('adminPanel'), icon: ShieldCheck, adminOnly: true },
    { id: 'communication-center', label: 'Communication Center', icon: MessageSquare, adminOnly: true },
    { id: 'admin-settings', label: t('adminSettings'), icon: Settings, adminOnly: true, primaryAdminOnly: true },
    { id: 'settings', label: t('userSettings'), icon: Settings },
    { id: 'projects', label: t('projects'), icon: Rocket },
    { id: 'about', label: t('about', 'About'), icon: Info },
    { id: 'welcome', label: t('welcome', 'Welcome'), icon: Sparkles, onClick: onOpenWelcomePopup },
  ];

  const filteredItems = menuItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.primaryAdminOnly && normalizedAdminLevel !== 'primary') return false;
    return true;
  });

  const unlockedRouteSet = React.useMemo(() => {
    const fromUser = resolveUnlockedRoutesFromUser(user);
    locallyUnlockedRoutes.forEach((routeId) => fromUser.add(routeId));
    return fromUser;
  }, [user, locallyUnlockedRoutes]);

  const getItemLockState = React.useCallback((itemId: string) => {
    const isUnlockEligible = isFastAccessUser && !!UNLOCKABLE_ROUTE_TO_TOOL_ID[itemId];
    const isEntitlementLocked = isUnlockEligible && !unlockedRouteSet.has(itemId);
    const isHardFastAccessLocked = isFastAccessUser && !isFastAccessMenuItemAllowed(itemId) && !isUnlockEligible;

    return {
      isUnlockEligible,
      isEntitlementLocked,
      isHardFastAccessLocked,
      isLocked: isEntitlementLocked || isHardFastAccessLocked,
    };
  }, [isFastAccessUser, unlockedRouteSet]);

  const handleRedeemUnlockCode = React.useCallback(async () => {
    if (!unlockModalRouteId || !unlockCode.trim()) return;

    const toolId = UNLOCKABLE_ROUTE_TO_TOOL_ID[unlockModalRouteId];
    if (!toolId) {
      notify.error('This tool is not eligible for unlock codes.');
      return;
    }

    setIsRedeeming(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Missing authentication token. Please sign in again.');

      const response = await fetch('/api/unlocks/redeem-tool-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          codeValue: unlockCode.trim(),
          toolId,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Unable to redeem this code.');
      }

      setLocallyUnlockedRoutes((prev) => Array.from(new Set([...prev, unlockModalRouteId])));
      notify.success('Tool unlocked successfully.');
      setUnlockCode('');
      setUnlockModalRouteId(null);
      setActiveTab(unlockModalRouteId);
      if (onClose) onClose();
    } catch (error: any) {
      notify.error(mapToolUnlockRedeemError(String(error?.message || '')));
    } finally {
      setIsRedeeming(false);
    }
  }, [unlockModalRouteId, unlockCode, notify, setActiveTab, onClose]);

  const handleStartUnlockCheckout = React.useCallback(async () => {
    if (!unlockModalRouteId) return;

    const toolId = UNLOCKABLE_ROUTE_TO_TOOL_ID[unlockModalRouteId];
    if (!toolId) {
      notify.error('This tool is not eligible for paid unlock.');
      return;
    }

    setIsStartingCheckout(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Missing authentication token. Please sign in again.');

      const successUrl = `${window.location.origin}/billing?success=true&unlockTool=${encodeURIComponent(toolId)}`;
      const cancelUrl = `${window.location.origin}/billing?cancelled=true&unlockTool=${encodeURIComponent(toolId)}`;

      const response = await fetch('/api/billing/create-tool-unlock-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ toolId, successUrl, cancelUrl }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || 'Failed to start payment checkout.');
      }

      window.location.href = data.checkoutUrl;
    } catch (error: any) {
      notify.error(error?.message || 'Failed to start payment checkout.');
    } finally {
      setIsStartingCheckout(false);
    }
  }, [unlockModalRouteId, notify]);

  return (
    <div className={cn(
      "bg-zinc-50 dark:bg-zinc-950 border-e border-zinc-200 dark:border-zinc-800 flex flex-col h-full text-zinc-600 dark:text-zinc-400 transition-all duration-300 ease-in-out z-50",
      isCollapsed ? "w-20" : "w-64"
    )}>
      <div className={cn(
        "p-6 flex items-center justify-between gap-3 border-b border-zinc-200/50 dark:border-zinc-800/50",
        isCollapsed && "px-4 justify-center"
      )}>
        {!isCollapsed && <Logo textColor="text-zinc-900 dark:text-white" />}
        {isCollapsed && <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-emerald-500/20">Z</div>}
        
        <SidebarToggle isCollapsed={isCollapsed} onToggle={onToggleCollapse || (() => {})} />
        
        {onClose && (
          <button onClick={onClose} className="md:hidden p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-zinc-500 cursor-pointer transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto custom-scrollbar">
        {filteredItems.map((item) => (
          (() => {
            const lockState = getItemLockState(item.id);
            const isLockedForFastAccess = lockState.isLocked;
            const resolvedLabel = isFastAccessUser && item.id === 'account' ? 'Upgrade Access' : item.label;
            return (
          <button
            key={item.id}
            onMouseEnter={() => {
              void preloadWorkspaceRoute(item.id);
            }}
            onFocus={() => {
              void preloadWorkspaceRoute(item.id);
            }}
            onClick={() => {
              void preloadWorkspaceRoute(item.id);
              if (lockState.isEntitlementLocked) {
                setUnlockCode('');
                setUnlockModalRouteId(item.id);
                return;
              }
              if (lockState.isHardFastAccessLocked) return;
              if (item.id === 'welcome') {
                if (onOpenWelcomePopup) onOpenWelcomePopup();
              } else {
                setActiveTab(item.id);
              }
            }}
            title={isCollapsed ? resolvedLabel : undefined}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group cursor-pointer active:scale-95 relative",
              isCollapsed && "justify-center px-0",
              isLockedForFastAccess && "opacity-90",
              activeTab === item.id 
                ? "bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 shadow-sm" 
                : "hover:bg-zinc-200 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200"
            )}
            disabled={lockState.isHardFastAccessLocked}
          >
            <item.icon size={18} className={cn(
              "transition-colors shrink-0",
              isLockedForFastAccess ? "text-zinc-400 dark:text-zinc-600" : "",
              activeTab === item.id ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500 group-hover:text-zinc-800 dark:group-hover:text-zinc-200"
            )} />
            {!isCollapsed && <span className={cn(
              "text-xs font-bold flex-1 text-start truncate uppercase tracking-widest",
              isLockedForFastAccess ? "text-zinc-400 dark:text-zinc-600" : "",
              activeTab === item.id ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-600 dark:text-zinc-400"
            )}>{resolvedLabel}</span>}

            {!isCollapsed && isLockedForFastAccess && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-[9px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <Lock size={10} />
                {lockState.isEntitlementLocked ? 'Unlock' : 'Full'}
              </span>
            )}
            
            {!isCollapsed && item.id === 'admin' && normalizedAdminLevel && (
              <span className={cn(
                "text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md tracking-widest",
                normalizedAdminLevel === 'primary' ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                normalizedAdminLevel === 'secondary' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              )}>
                {t(normalizedAdminLevel)}
              </span>
            )}

            {activeTab === item.id && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-s-0 w-1 h-6 bg-emerald-500 rounded-e-full" 
              />
            )}
          </button>
            );
          })()
        ))}
      </nav>

      <div className={cn("p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/30", isCollapsed && "px-2")}>
        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-3 shadow-sm",
          isCollapsed && "p-2 justify-center"
        )}>
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Zap size={14} className="text-emerald-500" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-zinc-900 dark:text-white truncate uppercase tracking-widest">
                {isAdmin ? t('adminAccess') : user?.plan === 'pro' ? t('proAccess') : user?.plan === 'basic' ? t('basicTier') : t('freeTier')}
              </p>
              <p className="text-[10px] text-zinc-500 truncate font-medium">
                {isAdmin
                  ? t('unlimitedAi')
                  : user?.plan === 'pro'
                    ? t('unlimitedAi')
                    : isFastAccessUser
                      ? `${remainingFastAccessCredits} Faculty credits`
                      : `${user?.credits || 0} ${t('credits')}`}
              </p>
            </div>
          )}
        </div>
        
        {!isCollapsed && (
          <div className="mt-4 px-2 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{t('systemOnline')}</span>
              </div>
              <span className="text-[9px] font-bold text-zinc-400">v2.4.0</span>
            </div>
            <BrandedSeal />
          </div>
        )}
      </div>

      <Modal
        isOpen={!!unlockModalRouteId}
        onClose={() => {
          if (isRedeeming || isStartingCheckout) return;
          setUnlockModalRouteId(null);
          setUnlockCode('');
        }}
        title={`Unlock ${UNLOCKABLE_ROUTE_LABEL[unlockModalRouteId || ''] || 'Tool'}`}
        isSidebarCollapsed={isCollapsed}
        flowId={
          unlockModalRouteId
            ? `${TOOL_UNLOCK_FLOW_ID}:${unlockModalRouteId}`
            : TOOL_UNLOCK_FLOW_ID
        }
        flowPriority={POPUP_FLOW_PRIORITY.criticalBlocking}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/10 p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Eligible Unlock</p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1">
              Use an admin-issued unlock code or complete a secure payment of {TOOL_UNLOCK_PRICE_EGP} EGP.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-black uppercase tracking-widest text-zinc-500">Admin Unlock Code</label>
            <input
              type="text"
              value={unlockCode}
              onChange={(event) => setUnlockCode(event.target.value.toUpperCase())}
              placeholder="Enter code"
              className="w-full px-3 py-2.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              onClick={handleRedeemUnlockCode}
              disabled={isRedeeming || !unlockCode.trim()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors disabled:opacity-60"
            >
              {isRedeeming ? 'Redeeming...' : 'Unlock With Code'}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-400 uppercase tracking-widest">
            <span className="h-px bg-zinc-200 dark:bg-zinc-700 flex-1" />
            Or
            <span className="h-px bg-zinc-200 dark:bg-zinc-700 flex-1" />
          </div>

          <button
            onClick={handleStartUnlockCheckout}
            disabled={isStartingCheckout}
            className="w-full py-2.5 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-60"
          >
            {isStartingCheckout ? 'Redirecting...' : `Pay ${TOOL_UNLOCK_PRICE_EGP} EGP`}
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Sidebar;
