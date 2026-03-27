import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { motion } from 'motion/react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { RouteLoader } from '../components/RouteLoader';
import { useLoadLifecycle } from '../hooks/useLoadLifecycle';
import { 
  User as UserIcon, 
  Settings as SettingsIcon, 
  Bell, 
  Shield, 
  Globe, 
  Moon, 
  Sun, 
  Monitor,
  Save,
  Clock,
  LogOut,
  ChevronRight,
  Database,
  Cpu
} from 'lucide-react';
import { cn } from '../utils';
import { INITIAL_MODELS } from '../utils/aiModels';
import { MODEL_UNLOCK_PRICE_EGP, resolveModelAccess } from '../ai/modelAccess';

const Settings: React.FC = () => {
  const {
    user,
    updateUserSettings,
    logout,
    activities,
    checkUsernameAvailability,
    updateUserProfile,
    updatePassword,
    linkAccount,
    isProfileHydrating,
    isAdmin,
    retryAuthBootstrap,
  } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences' | 'notifications' | 'history'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const {
    reason: profileLoadReason,
    message: profileLoadMessage,
    elapsedSeconds: profileLoadElapsedSeconds,
    isWorking: isProfileLoading,
    setPhase: setProfileLoadPhase,
  } = useLoadLifecycle();
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    username: user?.username || '',
    phoneNumber: user?.phoneNumber || '',
    institution: user?.institution || '',
    country: user?.country || '',
  });

  React.useEffect(() => {
    if (!user) {
      return;
    }

    setProfileData({
      name: user.name || '',
      username: user.username || '',
      phoneNumber: user.phoneNumber || '',
      institution: user.institution || '',
      country: user.country || '',
    });
  }, [user]);

  React.useEffect(() => {
    if (user) {
      setProfileLoadPhase({
        phase: 'ready',
        reason: 'Settings ready',
        message: 'Settings profile is ready.',
      });
      return;
    }

    if (isProfileHydrating) {
      setProfileLoadPhase({
        phase: 'preparing',
        reason: 'Restoring your settings profile',
        message: 'Waiting for your account profile before loading settings.',
      });
      return;
    }

    setProfileLoadPhase({
      phase: 'failed',
      reason: 'Settings unavailable',
      message: 'We could not resolve your account profile for settings.',
    });
  }, [isProfileHydrating, setProfileLoadPhase, user]);

  if (!user) {
    return (
      <div className="min-h-[420px] py-8">
        {isProfileLoading ? (
          <RouteLoader
            label="Loading Settings"
            detail={profileLoadMessage || 'Restoring your account profile for settings.'}
            reason={profileLoadReason || 'profile restore'}
            elapsedSeconds={profileLoadElapsedSeconds}
          />
        ) : (
          <div className="space-y-4">
            <ErrorDisplay
              type="warning"
              title="Settings"
              message={profileLoadMessage || 'Settings could not load right now.'}
              details={profileLoadReason || 'profile restore'}
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  void retryAuthBootstrap();
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500"
              >
                <Save size={16} />
                Retry Settings Load
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleUpdateProfile = async () => {
    setIsSaving(true);
    try {
      await updateUserProfile(profileData);
    } catch (error) {
      // Error handled in AuthContext
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = async (settings: any) => {
    setIsSaving(true);
    await updateUserSettings(settings);
    setIsSaving(false);
  };

  const tabs = [
    { id: 'profile', label: t('profile'), icon: UserIcon },
    { id: 'security', label: t('security'), icon: Shield },
    { id: 'preferences', label: t('preferences'), icon: SettingsIcon },
    { id: 'notifications', label: t('notifications'), icon: Bell },
    { id: 'history', label: t('activityHistory'), icon: Clock },
  ];

  const preferredModelCards = React.useMemo(() => {
    return INITIAL_MODELS.map((model) => {
      const access = resolveModelAccess({
        modelId: model.id,
        toolId: 'chat',
        unlockedModels: user.unlockedModels,
        isAdmin,
        isTemporaryAccess: user.isTemporaryAccess === true || user.accountScope === 'faculty_science_fast_access',
      });

      return {
        model,
        access,
      };
    });
  }, [isAdmin, user.accountScope, user.isTemporaryAccess, user.unlockedModels]);

  return (
    <div className="bg-zinc-50/50 pb-16">
      <div className="max-w-6xl mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 space-y-2">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-100 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-xl">
                  {user.name[0]}
                </div>
                <div>
                  <h2 className="font-bold text-zinc-900">{user.name}</h2>
                  <p className="text-xs text-zinc-500">{isAdmin ? t('administrator') : t('student')}</p>
                </div>
              </div>
              <button 
                onClick={logout}
                className="w-full flex items-center gap-2 text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors text-sm font-bold"
              >
                <LogOut size={16} />
                {t('signOut')}
              </button>
            </div>

            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-bold text-sm transition-all",
                  activeTab === tab.id 
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" 
                    : "text-zinc-500 hover:bg-white hover:text-zinc-900"
                )}
              >
                <tab.icon size={18} />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-[2.5rem] shadow-sm border border-zinc-100 overflow-hidden"
            >
              {activeTab === 'profile' && (
                <div className="p-8 sm:p-12">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black text-zinc-900">{t('profileInformation')}</h3>
                    <button
                      onClick={handleUpdateProfile}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                    >
                      {isSaving ? t('saving') : (
                        <>
                          <Save size={18} />
                          {t('saveChanges')}
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ms-1">{t('fullName')}</label>
                      <input 
                        type="text"
                        value={profileData.name}
                        onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                        className="w-full p-4 bg-zinc-50 rounded-2xl border border-zinc-100 font-bold text-zinc-900 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ms-1">{t('username')}</label>
                      <input 
                        type="text"
                        value={profileData.username}
                        onChange={(e) => setProfileData({ ...profileData, username: e.target.value })}
                        className="w-full p-4 bg-zinc-50 rounded-2xl border border-zinc-100 font-bold text-zinc-900 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ms-1">{t('phoneNumber')}</label>
                      <input 
                        type="text"
                        value={profileData.phoneNumber}
                        onChange={(e) => setProfileData({ ...profileData, phoneNumber: e.target.value })}
                        placeholder="+1234567890"
                        className="w-full p-4 bg-zinc-50 rounded-2xl border border-zinc-100 font-bold text-zinc-900 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ms-1">{t('institution')}</label>
                      <input 
                        type="text"
                        value={profileData.institution}
                        onChange={(e) => setProfileData({ ...profileData, institution: e.target.value })}
                        className="w-full p-4 bg-zinc-50 rounded-2xl border border-zinc-100 font-bold text-zinc-900 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ms-1">{t('country')}</label>
                      <input 
                        type="text"
                        value={profileData.country}
                        onChange={(e) => setProfileData({ ...profileData, country: e.target.value })}
                        className="w-full p-4 bg-zinc-50 rounded-2xl border border-zinc-100 font-bold text-zinc-900 focus:outline-none focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ms-1">{t('emailAddress')}</label>
                      <div className="p-4 bg-zinc-100 rounded-2xl border border-zinc-100 font-bold text-zinc-500 cursor-not-allowed">
                        {user.email}
                      </div>
                    </div>
                  </div>

                  <div className="mt-12 p-8 bg-emerald-50 rounded-[2rem] border border-emerald-100">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white">
                        <Shield size={24} />
                      </div>
                      <div>
                        <h4 className="font-black text-emerald-900">{t('accountSecurity')}</h4>
                        <p className="text-sm text-emerald-700 font-medium">{t('googleAuthProtected')}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <div className="px-4 py-2 bg-white rounded-xl text-xs font-bold text-emerald-600 border border-emerald-100">
                        {t('verifiedStudent')}
                      </div>
                      <div className="px-4 py-2 bg-white rounded-xl text-xs font-bold text-emerald-600 border border-emerald-100">
                        {t('activeSession')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="p-8 sm:p-12">
                  <h3 className="text-2xl font-black text-zinc-900 mb-8">{t('accountSecurity')}</h3>
                  
                  <div className="space-y-10">
                    {/* Username Update */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-zinc-900 font-black text-sm uppercase tracking-widest">
                        <UserIcon size={16} className="text-emerald-600" />
                        {t('updateUsername')}
                      </div>
                      <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100">
                        <div className="flex flex-col sm:flex-row gap-4">
                          <input 
                            type="text" 
                            placeholder={t('newUsername')} 
                            className="flex-1 bg-white border-2 border-zinc-100 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                            id="new-username-input"
                          />
                          <button 
                            className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                            onClick={async () => {
                              const input = document.getElementById('new-username-input') as HTMLInputElement;
                                  if (input && input.value) {
                                    try {
                                      const isAvailable = await checkUsernameAvailability(input.value);
                                      if (!isAvailable) {
                                        toast.error(t('usernameTaken'));
                                        return;
                                      }
                                  await updateUserProfile({ username: input.value, usernameLower: input.value.toLowerCase() });
                                  input.value = '';
                                } catch (error) {
                                  console.error(error);
                                }
                              }
                            }}
                          >
                            {t('update')}
                          </button>
                        </div>
                        <p className="text-xs text-zinc-500 mt-3">{t('usernameHint')}</p>
                      </div>
                    </div>

                    {/* Password Update */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-zinc-900 font-black text-sm uppercase tracking-widest">
                        <Shield size={16} className="text-emerald-600" />
                        {t('updatePassword')}
                      </div>
                      <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100 space-y-4">
                        <input 
                          type="password" 
                          placeholder={t('newPassword')} 
                          className="w-full bg-white border-2 border-zinc-100 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                          id="new-password-input"
                        />
                        <input 
                          type="password" 
                          placeholder={t('confirmNewPassword')} 
                          className="w-full bg-white border-2 border-zinc-100 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                          id="confirm-password-input"
                        />
                        <button 
                          className="w-full px-6 py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 transition-colors"
                          onClick={async () => {
                            const passInput = document.getElementById('new-password-input') as HTMLInputElement;
                            const confirmInput = document.getElementById('confirm-password-input') as HTMLInputElement;
                            if (passInput && confirmInput && passInput.value) {
                              if (passInput.value !== confirmInput.value) {
                                toast.error(t('passwordsDoNotMatch'));
                                return;
                              }
                              if (passInput.value.length < 8) {
                                toast.error(t('passwordTooShort'));
                                return;
                              }
                              try {
                                await updatePassword(passInput.value);
                                passInput.value = '';
                                confirmInput.value = '';
                              } catch (error) {
                                console.error(error);
                              }
                            }
                          }}
                        >
                          {t('updatePassword')}
                        </button>
                      </div>
                    </div>

                    {/* Account Linking */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-zinc-900 font-black text-sm uppercase tracking-widest">
                        <Globe size={16} className="text-emerald-600" />
                        {user.authProviders?.includes('password') ? t('emailPasswordLinked') : t('linkEmailPassword')}
                      </div>
                      <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-100">
                        {user.authProviders?.includes('password') ? (
                          <div className="flex items-center gap-3 text-emerald-600 font-bold">
                            <Shield size={20} />
                            <span>{t('accountAlreadyLinked')}</span>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-zinc-600 mb-4 font-medium">{t('linkHint')}</p>
                            <div className="space-y-4">
                              <input 
                                type="password" 
                                placeholder={t('setAPassword')} 
                                className="w-full bg-white border-2 border-zinc-100 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                                id="link-password-input"
                              />
                              <input 
                                type="password" 
                                placeholder={t('confirmPassword')} 
                                className="w-full bg-white border-2 border-zinc-100 rounded-xl py-3 px-4 focus:outline-none focus:border-emerald-500 transition-all font-medium"
                                id="link-password-confirm-input"
                              />
                              <button 
                                className="w-full px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors"
                                onClick={async () => {
                                  const input = document.getElementById('link-password-input') as HTMLInputElement;
                                  const confirmInput = document.getElementById('link-password-confirm-input') as HTMLInputElement;
                                  if (input && confirmInput && input.value) {
                                    if (input.value !== confirmInput.value) {
                                      toast.error(t('passwordsDoNotMatch'));
                                      return;
                                    }
                                    if (input.value.length < 8) {
                                      toast.error(t('passwordTooShort'));
                                      return;
                                    }
                                    try {
                                      await linkAccount(user.email, input.value);
                                      input.value = '';
                                      confirmInput.value = '';
                                    } catch (error) {
                                      console.error(error);
                                    }
                                  }
                                }}
                              >
                                {t('linkAccount')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'preferences' && (
                <div className="p-8 sm:p-12">
                  <h3 className="text-2xl font-black text-zinc-900 mb-8">{t('appPreferences')}</h3>
                  
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-zinc-900 font-black text-sm uppercase tracking-widest">
                        <Moon size={16} className="text-emerald-600" />
                        {t('appearanceTheme')}
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {['light', 'dark', 'system'].map((theme) => (
                          <button
                            key={theme}
                            onClick={() => handleSaveSettings({ theme })}
                            className={cn(
                              "p-4 rounded-2xl border-2 transition-all font-bold text-sm capitalize",
                              user.settings?.theme === theme 
                                ? "border-emerald-600 bg-emerald-50 text-emerald-600" 
                                : "border-zinc-100 bg-zinc-50 text-zinc-500 hover:border-zinc-200"
                            )}
                          >
                            {t(theme)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-zinc-900 font-black text-sm uppercase tracking-widest">
                        <Cpu size={16} className="text-emerald-600" />
                        {t('preferredAIModel')}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {preferredModelCards.map(({ model, access }) => (
                          <button
                            key={model.id}
                            onClick={() => {
                              if (!access.allowed) {
                                toast.error(`This model is locked. Unlock it via admin approval, a valid code, or secure payment of ${MODEL_UNLOCK_PRICE_EGP} EGP.`);
                                return;
                              }
                              handleSaveSettings({ preferredModelId: model.id });
                            }}
                            className={cn(
                              "flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-start",
                              user.settings?.preferredModelId === model.id 
                                ? "border-emerald-600 bg-emerald-50" 
                                : access.allowed
                                  ? "border-zinc-100 bg-zinc-50 hover:border-zinc-200"
                                  : "border-zinc-100 bg-zinc-50/60 opacity-70"
                            )}
                          >
                            <div className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center",
                              user.settings?.preferredModelId === model.id ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-500"
                            )}>
                              <Database size={20} />
                            </div>
                            <div>
                              <div className={cn("font-bold text-sm", user.settings?.preferredModelId === model.id ? "text-emerald-900" : "text-zinc-700")}>
                                {model.name}
                              </div>
                              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">
                                {model.provider}
                                {!access.allowed ? ' • Locked' : access.reasonCode === 'entitled' ? ' • Unlocked' : ' • Included'}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-zinc-900 font-black text-sm uppercase tracking-widest">
                        <Globe size={16} className="text-emerald-600" />
                        {t('interfaceLanguage')}
                      </div>
                      <select 
                        value={user.settings?.language || 'English'}
                        onChange={(e) => handleSaveSettings({ language: e.target.value })}
                        className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl p-4 font-bold text-zinc-700 focus:outline-none focus:border-emerald-500"
                      >
                        <option>English</option>
                        <option>Arabic</option>
                        <option>French</option>
                        <option>German</option>
                        <option>Spanish</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'notifications' && (
                <div className="p-8 sm:p-12">
                  <h3 className="text-2xl font-black text-zinc-900 mb-8">{t('notificationSettings')}</h3>
                  <div className="space-y-4">
                    {[
                      { id: 'email', label: t('emailNotifications'), desc: t('emailNotificationsDesc') },
                      { id: 'browser', label: t('browserNotifications'), desc: t('browserNotificationsDesc') },
                      { id: 'system', label: t('systemAlerts'), desc: t('systemAlertsDesc') }
                    ].map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-6 bg-zinc-50 rounded-3xl border border-zinc-100">
                        <div>
                          <h4 className="font-bold text-zinc-900">{item.label}</h4>
                          <p className="text-xs text-zinc-500 font-medium">{item.desc}</p>
                        </div>
                        <button
                          onClick={() => handleSaveSettings({ 
                            notifications: { 
                              ...user.settings?.notifications, 
                              [item.id]: !user.settings?.notifications?.[item.id as keyof typeof user.settings.notifications] 
                            } 
                          })}
                          className={cn(
                            "w-12 h-6 rounded-full transition-all relative",
                            user.settings?.notifications?.[item.id as keyof typeof user.settings.notifications] ? "bg-emerald-600" : "bg-zinc-300"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                            user.settings?.notifications?.[item.id as keyof typeof user.settings.notifications] ? "start-7" : "start-1"
                          )} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="p-8 sm:p-12">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black text-zinc-900">{t('activityHistory')}</h3>
                    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      {t('last50Actions')}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {activities.length > 0 ? (
                      activities.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-4 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group hover:border-emerald-200 transition-colors">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            activity.status === 'failure' ? "bg-red-100 text-red-600" : 
                            activity.status === 'warning' ? "bg-amber-100 text-amber-600" : 
                            "bg-emerald-100 text-emerald-600"
                          )}>
                            <Clock size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-bold text-zinc-900 text-sm truncate">{activity.description}</h4>
                              <span className="text-[10px] font-bold text-zinc-400 whitespace-nowrap ms-2">
                                {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-tighter text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                                {activity.type.replace('_', ' ')}
                              </span>
                              <span className="text-[10px] font-medium text-zinc-400">
                                {new Date(activity.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-400">
                          <Clock size={32} />
                        </div>
                        <p className="text-zinc-500 font-bold">{t('noActivityRecorded')}</p>
                      </div>
                    )}
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

export default Settings;
