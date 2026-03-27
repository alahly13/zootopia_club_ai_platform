import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { motion } from 'motion/react';
import { 
  Shield, 
  Settings as SettingsIcon, 
  Bell, 
  Database, 
  Lock, 
  Eye, 
  EyeOff,
  Save,
  Trash2,
  RefreshCw,
  Server,
  Activity as ActivityIcon,
  ChevronRight,
  Layout,
  Terminal,
  Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../utils';
import { useStatus } from '../hooks/useStatus';
import { StatusIndicator } from '../components/status/StatusIndicator';
import { StatusCard } from '../components/status/StatusCard';

const AdminSettings: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateAdminSettings, logout, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'panel' | 'system'>('general');
  const { status, message: statusMessage, error, setStatus, setError, isLoading, isError, reset } = useStatus();

  if (!user || !isAdmin) return null;

  const handleSaveSettings = async (settings: any) => {
    setStatus('processing', t('saving-settings'));
    try {
      await updateAdminSettings(settings);
      setStatus('success', t('settings-saved'));
      setTimeout(() => reset(), 3000);
    } catch (err: any) {
      console.error(err);
      setError(err, () => handleSaveSettings(settings));
    }
  };

  const tabs = [
    { id: 'general', label: t('general'), icon: SettingsIcon },
    { id: 'security', label: t('security'), icon: Shield },
    { id: 'panel', label: t('panel-layout'), icon: Layout },
    { id: 'system', label: t('system-logs'), icon: Terminal },
  ];

  return (
    <div className="bg-zinc-900 pb-16 text-zinc-100">
      <div className="max-w-6xl mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 space-y-2">
            <div className="bg-zinc-800/50 rounded-3xl p-6 border border-zinc-800 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold text-xl">
                  {user.name[0]}
                </div>
                <div>
                  <h2 className="font-bold text-white">{user.name}</h2>
                  <p className="text-xs text-emerald-500 font-bold uppercase tracking-tighter">{t('system-admin')}</p>
                </div>
              </div>
            </div>

            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all",
                  activeTab === tab.id 
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40" 
                    : "text-zinc-500 hover:bg-zinc-800 hover:text-white"
                )}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between px-6">
              <StatusIndicator status={status} message={statusMessage} />
              {isLoading && <Loader2 className="animate-spin text-emerald-500" size={20} />}
            </div>

            {isError && (
              <StatusCard 
                status={status}
                title={t('update-error')}
                message={error?.message}
                onRetry={error?.retryAction}
                onDismiss={reset}
              />
            )}

            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-zinc-800/30 backdrop-blur-xl rounded-[2.5rem] border border-zinc-800 overflow-hidden"
            >
              {activeTab === 'general' && (
                <div className="p-8 sm:p-12">
                  <h3 className="text-2xl font-black text-white mb-8">{t('general-admin-settings')}</h3>
                  
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ms-1">{t('admin-display-name')}</label>
                      <input
                        type="text"
                        value={user.adminSettings?.displayAdminName || ''}
                        onChange={(e) => handleSaveSettings({ displayAdminName: e.target.value })}
                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 font-bold text-white focus:outline-none focus:border-emerald-500 transition-all"
                        placeholder={t('system-admin')}
                      />
                    </div>

                    <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800">
                      <div>
                        <h4 className="font-bold text-white">{t('admin-notifications')}</h4>
                        <p className="text-xs text-zinc-500 font-medium">{t('admin-notifications-desc')}</p>
                      </div>
                      <button
                        onClick={() => handleSaveSettings({ notificationsEnabled: !user.adminSettings?.notificationsEnabled })}
                        className={cn(
                          "w-12 h-6 rounded-full transition-all relative",
                          user.adminSettings?.notificationsEnabled ? "bg-emerald-600" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          user.adminSettings?.notificationsEnabled ? "start-7" : "start-1"
                        )} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-3xl border border-zinc-800">
                      <div>
                        <h4 className="font-bold text-white">{t('auto-approve-requests')}</h4>
                        <p className="text-xs text-zinc-500 font-medium">{t('auto-approve-requests-desc')}</p>
                      </div>
                      <button
                        onClick={() => handleSaveSettings({ autoApproveRequests: !user.adminSettings?.autoApproveRequests })}
                        className={cn(
                          "w-12 h-6 rounded-full transition-all relative",
                          user.adminSettings?.autoApproveRequests ? "bg-emerald-600" : "bg-zinc-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          user.adminSettings?.autoApproveRequests ? "start-7" : "start-1"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="p-8 sm:p-12">
                  <h3 className="text-2xl font-black text-white mb-8">{t('security-configuration')}</h3>
                  
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ms-1">{t('system-security-level')}</label>
                      <div className="grid grid-cols-3 gap-4">
                        {['Standard', 'High', 'Strict'].map((level) => (
                          <button
                            key={level}
                            onClick={() => handleSaveSettings({ securityLevel: level })}
                            className={cn(
                              "p-4 rounded-2xl border-2 transition-all font-bold text-sm",
                              user.adminSettings?.securityLevel === level 
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" 
                                : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700"
                            )}
                          >
                            {t(level.toLowerCase())}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-6 bg-amber-500/10 rounded-3xl border border-amber-500/20">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white">
                          <Lock size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-amber-500">{t('owner-account-protection')}</h4>
                          <p className="text-xs text-amber-500/70 font-medium">{t('owner-protection-desc')}</p>
                        </div>
                      </div>
                      <p className="text-xs text-amber-500/60 leading-relaxed">
                        {t('owner-protection-warning')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'panel' && (
                <div className="p-8 sm:p-12">
                  <h3 className="text-2xl font-black text-white mb-8">{t('panel-customization')}</h3>
                  
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ms-1">{t('admin-theme')}</label>
                      <div className="grid grid-cols-3 gap-4">
                        {['classic', 'modern', 'glass'].map((theme) => (
                          <button
                            key={theme}
                            onClick={() => handleSaveSettings({ panelTheme: theme })}
                            className={cn(
                              "p-4 rounded-2xl border-2 transition-all font-bold text-sm capitalize",
                              user.adminSettings?.panelTheme === theme 
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" 
                                : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700"
                            )}
                          >
                            {t(theme)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'system' && (
                <div className="p-8 sm:p-12">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black text-white">{t('system-logs')}</h3>
                    <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold transition-colors">
                      <RefreshCw size={14} />
                      {t('refresh')}
                    </button>
                  </div>

                  <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-800/50">
                      <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-emerald-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{t('live-output')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-500 uppercase">{t('connected')}</span>
                      </div>
                    </div>
                    <div className="p-6 font-mono text-xs space-y-2 max-h-[400px] overflow-y-auto">
                      <div className="text-zinc-500">[2026-03-13 01:25:54] <span className="text-emerald-500">INFO</span> {t('system-initialized')}</div>
                      <div className="text-zinc-500">[2026-03-13 01:26:10] <span className="text-emerald-500">INFO</span> {t('firebase-auth-active')}</div>
                      <div className="text-zinc-500">[2026-03-13 01:27:01] <span className="text-amber-500">WARN</span> {t('high-memory-usage')}</div>
                      <div className="text-zinc-500">[2026-03-13 01:27:33] <span className="text-emerald-500">INFO</span> {t('admin-settings-updated')} elmahdy</div>
                      <div className="text-zinc-500">[2026-03-13 01:28:15] <span className="text-emerald-500">INFO</span> {t('new-user-request-submitted')}: {t('increase-limit')}</div>
                      <div className="text-zinc-400 animate-pulse">_</div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
