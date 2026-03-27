import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  User,
  Mail,
  Shield,
  Key,
  Camera,
  Save,
  LogOut,
  Phone,
  CalendarDays,
  GraduationCap,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { Modal } from '../components/Modal';
import { RouteLoader } from '../components/RouteLoader';
import { CountrySelect } from '../components/CountrySelect';
import { COUNTRIES } from '../constants/countries';
import { cn } from '../utils';
import { storage, auth } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { convertFacultyFastAccessToFullAccount } from '../services/fastAccessService';
import { FACULTY_FAST_ACCESS_CONVERSION_PROMPT } from '../constants/fastAccessPolicy';
import { useLoadLifecycle } from '../hooks/useLoadLifecycle';
import { ACCOUNT_DELETE_FLOW_ID, POPUP_FLOW_PRIORITY } from '../constants/popupFlows';

const FULL_ACCOUNT_ACADEMIC_LEVEL_OPTIONS = [
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4',
  'Master',
  'PhD',
] as const;

const Account = () => {
  const {
    user,
    logout,
    notify,
    updateUserProfile,
    isAdmin,
    isProfileHydrating,
    retryAuthBootstrap,
  } = useAuth();
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isConvertingAccount, setIsConvertingAccount] = useState(false);
  const {
    reason: accountLoadReason,
    message: accountLoadMessage,
    elapsedSeconds: accountLoadElapsedSeconds,
    isWorking: isAccountLoading,
    setPhase: setAccountLoadPhase,
  } = useLoadLifecycle();
  const [editData, setEditData] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    avatarUrl: user?.avatarUrl || ''
  });
  const [conversionData, setConversionData] = useState({
    fullName: user?.name || '',
    email: user?.email?.includes('@fast-access.local') ? '' : (user?.email || ''),
    username: user?.username || '',
    password: '',
    confirmPassword: '',
    country: user?.country || 'Egypt',
    nationality: user?.nationality || 'Egypt',
    dateOfBirth: user?.dateOfBirth || '',
    gender: user?.gender || '',
    department: user?.department || 'Faculty of Science',
    academicYear: user?.academicYear || '',
    migrationPolicyAccepted: false,
  });

  React.useEffect(() => {
    if (!user) {
      return;
    }

    setEditData({
      name: user.name || '',
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || '',
    });
    setConversionData((current) => ({
      ...current,
      fullName: user.name || '',
      email: user.email?.includes('@fast-access.local') ? '' : (user.email || ''),
      username: user.username || '',
      country: user.country || 'Egypt',
      nationality: user.nationality || 'Egypt',
      dateOfBirth: user.dateOfBirth || '',
      gender: user.gender || '',
      department: user.department || 'Faculty of Science',
      academicYear: user.academicYear || '',
    }));
  }, [user]);

  React.useEffect(() => {
    if (user) {
      setAccountLoadPhase({
        phase: 'ready',
        reason: 'Account ready',
        message: 'Account profile is ready.',
      });
      return;
    }

    if (isProfileHydrating) {
      setAccountLoadPhase({
        phase: 'preparing',
        reason: 'Restoring your account profile',
        message: 'Waiting for your account profile before loading account settings.',
      });
      return;
    }

    setAccountLoadPhase({
      phase: 'failed',
      reason: 'Account unavailable',
      message: 'We could not resolve your account profile.',
    });
  }, [isProfileHydrating, setAccountLoadPhase, user]);

  if (!user) {
    return (
      <div className="min-h-[420px] py-8">
        {isAccountLoading ? (
          <RouteLoader
            label="Loading Account"
            detail={accountLoadMessage || 'Restoring your account profile.'}
            reason={accountLoadReason || 'profile restore'}
            elapsedSeconds={accountLoadElapsedSeconds}
          />
        ) : (
          <div className="space-y-4">
            <ErrorDisplay
              type="warning"
              title="Account"
              message={accountLoadMessage || 'Account could not load right now.'}
              details={accountLoadReason || 'profile restore'}
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
                Retry Account Load
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      const avatarRef = ref(storage, `avatars/${user.id}/${file.name}`);
      await uploadBytes(avatarRef, file);
      const url = await getDownloadURL(avatarRef);
      setEditData(prev => ({ ...prev, avatarUrl: url }));
      notify.success(t('avatarUpdated'));
    } catch (error) {
      notify.error(t('failedToUploadAvatar'));
    }
  };

  const handleSaveProfile = async () => {
    try {
      await updateUserProfile({
        name: editData.name,
        bio: editData.bio,
        avatarUrl: editData.avatarUrl
      });
      setIsEditing(false);
    } catch (error) {
      // Error handled by AuthContext
    }
  };

  const isEnglishOnly = (text: string) => /^[\x00-\x7F]*$/.test(text);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error(t('failed-to-send-deletion-request'));
      }

      const response = await fetch('/api/notifications/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user?.id,
          subject: t('account-deletion-request'),
          message: t('user-requested-account-deletion', { name: user?.name, email: user?.email })
        })
      });

      if (!response.ok) throw new Error(t('failed-to-send-deletion-request'));
      
      notify.success(t('account-deletion-request-sent'));
      setShowDeleteModal(false);
      setTimeout(() => {
        logout();
      }, 2000);
    } catch (error) {
      notify.error(t('failed-to-process-request'));
      setIsDeleting(false);
    }
  };

  const isTemporaryFacultyFastAccess =
    user?.isTemporaryAccess === true || user?.accountScope === 'faculty_science_fast_access';
  const hasExhaustedFastAccessCredits = isTemporaryFacultyFastAccess && (user?.fastAccessCredits ?? 0) <= 0;

  const handleConvertToFullAccount = async () => {
    if (!user) return;

    const normalizedEmail = conversionData.email.trim();
    const normalizedUsername = conversionData.username.trim();

    if (!conversionData.fullName.trim()) {
      notify.error('Full name is required.');
      return;
    }

    if (!isEnglishOnly(conversionData.fullName)) {
      notify.error('Full name must use English characters only.');
      return;
    }

    if (!normalizedEmail || !normalizedUsername) {
      notify.error('Email and username are required.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      notify.error('Enter a valid email address.');
      return;
    }

    if (!/^[A-Za-z0-9._-]{3,32}$/.test(normalizedUsername)) {
      notify.error('Username must be 3-32 characters and use only letters, numbers, dot, underscore, or dash.');
      return;
    }

    if (
      !conversionData.country ||
      !conversionData.nationality ||
      !conversionData.dateOfBirth ||
      !conversionData.gender ||
      !conversionData.department.trim() ||
      !conversionData.academicYear
    ) {
      notify.error('Complete all required account fields before upgrading.');
      return;
    }

    if (!isEnglishOnly(conversionData.department)) {
      notify.error('Department must use English characters only.');
      return;
    }

    if (!FULL_ACCOUNT_ACADEMIC_LEVEL_OPTIONS.includes(conversionData.academicYear as (typeof FULL_ACCOUNT_ACADEMIC_LEVEL_OPTIONS)[number])) {
      notify.error('Select a valid academic level.');
      return;
    }

    if (!conversionData.migrationPolicyAccepted) {
      notify.error('Please accept the migration policy before conversion.');
      return;
    }

    // Mirror backend upgrade policy locally so users get immediate feedback
    // before the same temporary account is converted into a full account.
    if (!/^(?=.*[a-zA-Z])(?=.*\d).{8,}$/.test(conversionData.password)) {
      notify.error('Password must be at least 8 characters and include letters and numbers.');
      return;
    }

    if (conversionData.password !== conversionData.confirmPassword) {
      notify.error('Passwords do not match.');
      return;
    }

    setIsConvertingAccount(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Authentication token is missing.');

      await convertFacultyFastAccessToFullAccount(token, {
        fullName: conversionData.fullName,
        email: normalizedEmail,
        username: normalizedUsername,
        password: conversionData.password,
        country: conversionData.country,
        nationality: conversionData.nationality,
        dateOfBirth: conversionData.dateOfBirth,
        gender: conversionData.gender as 'male' | 'female' | 'other' | 'prefer_not_to_say',
        department: conversionData.department,
        academicYear: conversionData.academicYear,
        migrationPolicyAccepted: conversionData.migrationPolicyAccepted,
      });

      notify.success('Conversion submitted. Please sign in again and verify your email.');
      await logout();
    } catch (error: any) {
      notify.error(error?.message || 'Failed to convert account.');
    } finally {
      setIsConvertingAccount(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-12">
      <div className="text-center space-y-4">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white"
        >
          {t('accountSettings')}
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg text-zinc-500 max-w-2xl mx-auto"
        >
          {t('accountSettingsDesc')}
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Sidebar Navigation */}
        <div className="md:col-span-1 space-y-2">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold transition-colors">
            <User className="w-5 h-5" /> {t('profile')}
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 font-medium transition-colors">
            <Shield className="w-5 h-5" /> {t('security')}
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 font-medium transition-colors">
            <Key className="w-5 h-5" /> {t('apiKeys')}
          </button>
          <div className="pt-4 mt-4 border-t border-zinc-200 dark:border-zinc-800">
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" /> {t('signOut')}
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="md:col-span-2 space-y-8">
          {isTemporaryFacultyFastAccess && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="p-8 rounded-3xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/70 dark:bg-amber-900/20 space-y-6"
            >
              <div>
                <h2 className="text-2xl font-bold text-amber-800 dark:text-amber-200">
                  {hasExhaustedFastAccessCredits ? 'Complete Your Account' : 'Faculty Fast Access Account'}
                </h2>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  This temporary Cairo University Faculty of Science identity stays attached to the same phone, credits, history, and ownership. When you are ready, complete the remaining full-account details on this same profile instead of starting over.
                </p>
              </div>

              {hasExhaustedFastAccessCredits && (
                <div className="rounded-2xl border border-emerald-300/70 dark:border-emerald-700/60 bg-emerald-50/80 dark:bg-emerald-900/20 p-4 sm:p-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300 mb-2">
                    Ready To Continue
                  </p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
                    {FACULTY_FAST_ACCESS_CONVERSION_PROMPT}
                  </p>
                  <div className="inline-flex items-center mt-3 px-2.5 py-1 rounded-full bg-white/70 dark:bg-zinc-900/60 border border-emerald-300/60 dark:border-emerald-700/60 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                    Same Account Upgrade
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/60 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    <Phone size={14} />
                    Phone Identity
                  </div>
                  <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">{user.phoneNumber || 'Verified via OTP'}</p>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    <Sparkles size={14} />
                    Free Credits
                  </div>
                  <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">{user.fastAccessCredits ?? 0} remaining</p>
                </div>
                <div className="rounded-2xl border border-white/60 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                    <Key size={14} />
                    University Code
                  </div>
                  <p className="mt-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">{user.universityCode || 'Stored on Fast Access profile'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Full Name</label>
                  <input
                    type="text"
                    value={conversionData.fullName}
                    onChange={(e) => setConversionData(prev => ({ ...prev, fullName: e.target.value }))}
                    className={cn(
                      'w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 bg-white/80 dark:bg-zinc-950/70 text-zinc-900 dark:text-white',
                      conversionData.fullName && !isEnglishOnly(conversionData.fullName)
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-zinc-200 dark:border-zinc-800'
                    )}
                    placeholder="Student Name in English"
                  />
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Use English characters for the completed full account.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Email</label>
                  <input
                    type="email"
                    value={conversionData.email}
                    onChange={(e) => setConversionData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white/80 dark:bg-zinc-950/70 outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                    placeholder="student@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Username</label>
                  <input
                    type="text"
                    value={conversionData.username}
                    onChange={(e) => setConversionData(prev => ({ ...prev, username: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white/80 dark:bg-zinc-950/70 outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                    placeholder="username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Department</label>
                  <div className="relative">
                    <BookOpen className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={conversionData.department}
                      onChange={(e) => setConversionData(prev => ({ ...prev, department: e.target.value }))}
                      className={cn(
                        'w-full rounded-xl border px-4 py-3 ps-11 outline-none focus:ring-2 focus:ring-emerald-500 bg-white/80 dark:bg-zinc-950/70 text-zinc-900 dark:text-white',
                        conversionData.department && !isEnglishOnly(conversionData.department)
                          ? 'border-red-300 dark:border-red-700'
                          : 'border-zinc-200 dark:border-zinc-800'
                      )}
                      placeholder="Faculty of Science"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Country</label>
                  <CountrySelect
                    value={conversionData.country}
                    onChange={(value) => setConversionData(prev => ({ ...prev, country: value }))}
                    countries={COUNTRIES}
                    placeholder="Select country"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Nationality</label>
                  <CountrySelect
                    value={conversionData.nationality}
                    onChange={(value) => setConversionData(prev => ({ ...prev, nationality: value }))}
                    countries={COUNTRIES}
                    type="nationality"
                    placeholder="Select nationality"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Date of Birth</label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="date"
                      value={conversionData.dateOfBirth}
                      onChange={(e) => setConversionData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                      className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 ps-11 bg-white/80 dark:bg-zinc-950/70 outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Academic Level</label>
                  <div className="relative">
                    <GraduationCap className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <select
                      value={conversionData.academicYear}
                      onChange={(e) => setConversionData(prev => ({ ...prev, academicYear: e.target.value }))}
                      className="w-full appearance-none rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 ps-11 bg-white/80 dark:bg-zinc-950/70 outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                    >
                      <option value="">Select academic level</option>
                      {FULL_ACCOUNT_ACADEMIC_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Gender</label>
                  <select
                    value={conversionData.gender}
                    onChange={(e) => setConversionData(prev => ({ ...prev, gender: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white/80 dark:bg-zinc-950/70 outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Password</label>
                  <input
                    type="password"
                    value={conversionData.password}
                    onChange={(e) => setConversionData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white/80 dark:bg-zinc-950/70 outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Confirm Password</label>
                  <input
                    type="password"
                    value={conversionData.confirmPassword}
                    onChange={(e) => setConversionData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white/80 dark:bg-zinc-950/70 outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                    placeholder="Repeat password"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={conversionData.migrationPolicyAccepted}
                  onChange={(e) => setConversionData(prev => ({ ...prev, migrationPolicyAccepted: e.target.checked }))}
                  className="mt-1"
                />
                <span>
                  I understand this upgrade keeps the same account identity, carries my existing Fast Access history forward, and moves this profile into the standard full-account verification and security policy.
                </span>
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleConvertToFullAccount}
                  disabled={isConvertingAccount}
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConvertingAccount ? t('processing') : 'Complete My Account'}
                </button>
              </div>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('profileInformation')}</h2>
              <button 
                onClick={() => setIsEditing(!isEditing)}
                className="text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {isEditing ? t('cancel') : t('editProfile')}
              </button>
            </div>

            <div className="flex items-center gap-6 mb-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden border-4 border-white dark:border-zinc-950 shadow-lg">
                  {editData.avatarUrl || user?.picture ? (
                    <img src={editData.avatarUrl || user?.picture!} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-400">
                      <User className="w-10 h-10" />
                    </div>
                  )}
                </div>
                {isEditing && (
                  <label className="absolute bottom-0 end-0 p-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-full shadow-lg hover:scale-110 transition-transform cursor-pointer">
                    <Camera className="w-4 h-4" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                  </label>
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">{user?.name || t('student')}</h3>
                <p className="text-zinc-500">{user?.email}</p>
                <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400">
                  {isAdmin ? t('administrator') : t('student')}
                </div>
              </div>
            </div>

            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('fullName')}</label>
                  <input 
                    type="text" 
                    value={editData.name}
                    onChange={(e) => setEditData({...editData, name: e.target.value})}
                    disabled={!isEditing}
                    className={cn(
                      "w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-zinc-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all",
                      editData.name.length > 0 && !isEnglishOnly(editData.name) ? "border-red-200 focus:border-red-500" : "border-zinc-200 dark:border-zinc-800"
                    )}
                  />
                  {isEditing && editData.name.length > 0 && !isEnglishOnly(editData.name) && (
                    <p className="text-[10px] text-red-500 font-bold">{t('nameEnglishOnly')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('emailAddress')}</label>
                  <div className="relative">
                    <Mail className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input 
                      type="email" 
                      defaultValue={user?.email || ''}
                      disabled
                      className="w-full ps-12 pe-4 py-3 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 cursor-not-allowed"
                    />
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{t('emailCannotBeChanged')}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{t('bioStudyFocus')}</label>
                <textarea 
                  rows={3}
                  value={editData.bio}
                  onChange={(e) => setEditData({...editData, bio: e.target.value})}
                  placeholder={t('bioPlaceholder')}
                  disabled={!isEditing}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-zinc-900 dark:text-white resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                ></textarea>
              </div>

              {isEditing && (
                <div className="flex justify-end pt-4">
                  <button 
                    onClick={handleSaveProfile}
                    disabled={!isEnglishOnly(editData.name) || editData.name.trim().length === 0}
                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" /> {t('saveChanges')}
                  </button>
                </div>
              )}
            </form>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="p-8 rounded-3xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10"
          >
            <h2 className="text-xl font-bold text-rose-600 dark:text-rose-400 mb-2">{t('dangerZone')}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
              {t('deleteAccountDesc')}
            </p>
            <button 
              onClick={() => setShowDeleteModal(true)}
              disabled={isDeleting}
              className="px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-rose-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? t('processing') : t('deleteAccount')}
            </button>
          </motion.div>
        </div>
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('deleteAccountConfirm')}
        flowId={ACCOUNT_DELETE_FLOW_ID}
        flowPriority={POPUP_FLOW_PRIORITY.criticalBlocking}
      >
        <div className="space-y-6">
          <p className="text-zinc-600 dark:text-zinc-400">
            {t('deleteAccountWarning')}
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors font-medium"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-colors font-bold shadow-lg shadow-rose-900/20 disabled:opacity-50"
            >
              {isDeleting ? t('deleting') : t('yesDeleteAccount')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Account;
