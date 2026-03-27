import * as React from 'react';
import { useState } from 'react';
import { useAuth } from './AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../themes/ThemeProvider';
import { useStatus } from '../hooks/useStatus';
import { StatusIndicator } from '../components/status/StatusIndicator';
import { StatusCard } from '../components/status/StatusCard';
import { motion, AnimatePresence } from 'motion/react';
import { NATIONALITIES } from '../constants/nationalities';
import { COUNTRIES } from '../constants/countries';
import { Shield, GraduationCap, Lock, User as UserIcon, LogIn, Mail, Phone, Calendar, BookOpen, Building, Globe, Sparkles, ArrowRight, Eye, EyeOff, Loader2, KeyRound, ArrowLeft, CheckCircle2, XCircle, ChevronRight, ChevronLeft, Moon, Sun, Languages, Heart, Atom } from 'lucide-react';
import Flag from 'react-world-flags';
import { COPYRIGHT, cn } from '../utils';
import { LoginLogo } from '../components/LoginLogo';
import { CountrySelect } from '../components/CountrySelect';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { auth, createFastAccessAuth, googleProvider } from '../firebase';
import { ConfirmationResult, RecaptchaVerifier, signInWithCustomToken, signInWithPhoneNumber, signInWithPopup } from 'firebase/auth';
import toast from 'react-hot-toast';
import ScienceMouse from '../components/ScienceMouse';
import ScienceBackground from '../components/ScienceBackground';
import {
  buildFastAccessPhone,
  checkFacultyScienceFastAccessStatus,
  loginFacultyScienceFastAccess,
  registerFacultyScienceFastAccess,
} from '../services/fastAccessService';
import { AuthSecondaryActionsPanel } from './AuthSecondaryActionsPanel';

const FAST_ACCESS_BATCH_YEAR_MIN = 2013;
const FAST_ACCESS_BATCH_YEAR_MAX = 2031;
const FAST_ACCESS_ALLOWED_BATCH_PREFIXES = new Set(
  Array.from(
    { length: FAST_ACCESS_BATCH_YEAR_MAX - FAST_ACCESS_BATCH_YEAR_MIN + 1 },
    (_, index) => String(FAST_ACCESS_BATCH_YEAR_MIN + index).slice(-2)
  )
);

function deriveFastAccessAcademicYearFromCode(universityCode: string): string | null {
  const normalizedCode = universityCode.replace(/\D/g, '');
  if (!/^\d{7}$/.test(normalizedCode)) {
    return null;
  }

  const prefix = normalizedCode.slice(0, 2);
  if (!FAST_ACCESS_ALLOWED_BATCH_PREFIXES.has(prefix)) {
    return null;
  }

  const batchYear = Number.parseInt(`20${prefix}`, 10);
  if (
    !Number.isInteger(batchYear) ||
    batchYear < FAST_ACCESS_BATCH_YEAR_MIN ||
    batchYear > FAST_ACCESS_BATCH_YEAR_MAX
  ) {
    return null;
  }

  return String(batchYear);
}

const Login: React.FC = () => {
  const { adminLogin, loginWithIdentifier, register, isAuthReady, notify, checkUsernameAvailability, forgotPassword } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const [mode, setMode] = useState<'login' | 'register' | 'admin' | 'forgot-password' | 'science-fast-access'>('login');
  const [regStep, setRegStep] = useState(1);
  const { status, message: statusMessage, error, setStatus, setError, isLoading, isError, reset } = useStatus();
  const [showPassword, setShowPassword] = useState(false);
  const [isSecondaryActionsOpen, setIsSecondaryActionsOpen] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle');
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'medium' | 'strong'>('weak');
  const isArabic = language === 'ar';
  const secondaryActionsTitle = isArabic ? 'خيارات دخول إضافية' : 'More access options';
  const secondaryActionsHint = isArabic
    ? 'أنشئ حسابًا كاملًا أو انتقل إلى مدخل المسؤول المحمي.'
    : 'Create a full account or switch to the protected administrator entrance.';
  const facultyScienceBadge = isArabic ? 'كلية العلوم' : 'Faculty of Science';
  const fastAccessAudience = isArabic
    ? 'وصول يبدأ بالهاتف ومصمم لطلاب كلية العلوم بجامعة القاهرة.'
    : 'Phone-first access built for Cairo University science students.';

  // Admin State
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Login State
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register State
  const [regData, setRegData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    universityCode: '',
    department: '',
    academicYear: '',
    phoneCountryCode: '+20',
    phoneNumber: '',
    dateOfBirth: '',
    gender: '',
    institution: '',
    country: 'Egypt',
    nationality: '',
  });

  /**
   * Must remain isolated from full-account auth:
   * - This lane is temporary, phone-OTP only, and faculty-scoped.
   * - It cannot reuse full registration/login contracts.
   * - Backend remains authoritative for account creation and verification.
   */
  const [fastAccessData, setFastAccessData] = useState({
    phoneCountryCode: '+20',
    phoneNumber: '',
    otpCode: '',
    fullName: '',
    universityCode: '',
  });
  const [fastAccessIntent, setFastAccessIntent] = useState<'login' | 'register' | null>(null);
  const [otpConfirmation, setOtpConfirmation] = useState<ConfirmationResult | null>(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [fastAccessStep, setFastAccessStep] = useState<'choice' | 'phone' | 'profile'>('choice');
  const [verifiedFastAccessToken, setVerifiedFastAccessToken] = useState('');
  const [fastAccessNotice, setFastAccessNotice] = useState<{
    tone: 'info' | 'warning' | 'success';
    title: string;
    message: string;
    actionLabel?: string;
    action?: 'login_now' | 'continue_registration' | 'full_login';
  } | null>(null);
  const [fastAccessValidation, setFastAccessValidation] = useState<{
    phoneNumber?: string;
    otpCode?: string;
    fullName?: string;
    universityCode?: string;
  }>({});
  const recaptchaVerifierRef = React.useRef<RecaptchaVerifier | null>(null);
  const fastAccessAuthRef = React.useRef(createFastAccessAuth());

  /**
   * FLOW-SAFETY NOTE
   * ------------------------------------------------------------------
   * 1. The user explicitly chooses login or registration first.
   * 2. OTP verifies phone ownership.
   * 3. The backend authoritatively decides whether that phone may log in,
   *    needs registration, or belongs to a full account.
   * 4. Registration collects only name + university code after OTP.
   */
  const validateFastAccessStudentStep = () => {
    const nextErrors: {
      fullName?: string;
      universityCode?: string;
    } = {};

    const normalizedName = fastAccessData.fullName.trim();
    const normalizedCode = fastAccessData.universityCode.replace(/\D/g, '');
    const derivedAcademicYear = deriveFastAccessAcademicYearFromCode(normalizedCode);

    if (!normalizedName) {
      nextErrors.fullName = t('fastAccess.errorNameRequired');
    }

    if (!normalizedCode) {
      nextErrors.universityCode = t('fastAccess.errorCodeRequired');
    } else if (!/^\d{7}$/.test(normalizedCode)) {
      nextErrors.universityCode = t('fastAccess.errorCodeSevenDigits');
    } else if (!derivedAcademicYear) {
      nextErrors.universityCode = t('fastAccess.errorYearRange', {
        min: FAST_ACCESS_BATCH_YEAR_MIN,
        max: FAST_ACCESS_BATCH_YEAR_MAX,
      });
    }

    setFastAccessValidation((prev) => ({
      ...prev,
      fullName: nextErrors.fullName,
      universityCode: nextErrors.universityCode,
    }));

    return {
      isValid: Object.keys(nextErrors).length === 0,
      profile: {
        fullName: normalizedName,
        universityCode: normalizedCode,
        department: 'Faculty of Science',
        academicYear: derivedAcademicYear || undefined,
      },
    };
  };

  const fastAccessCopy = {
    entryTitle: isArabic ? 'اختر طريقة الدخول السريع' : 'Choose your Fast Access path',
    entryHint: isArabic
      ? 'هل لديك حساب دخول سريع بالفعل أم تريد إنشاء واحد جديد برقم الهاتف؟'
      : 'Start with the right phone flow for this number so we can keep the same temporary account safely.',
    loginTitle: isArabic ? 'تسجيل الدخول بالهاتف' : 'Login with phone',
    loginHint: isArabic
      ? 'للطلاب العائدين الذين لديهم حساب دخول سريع بالفعل.'
      : 'For returning Fast Access students who already used this temporary account before.',
    registerTitle: isArabic ? 'إنشاء حساب بالهاتف' : 'Register with phone',
    registerHint: isArabic
      ? 'لإنشاء حساب دخول سريع جديد والحصول على 3 رصيد مجاني.'
      : 'For first-time phone access. After OTP we only ask for your name and 7-digit university code.',
    phoneStageTitle: isArabic ? 'تحقق من رقم الهاتف' : 'Verify your phone number',
    phoneStageHint: isArabic
      ? 'أرسل رمز التحقق ثم أدخله للمتابعة.'
      : 'Request the OTP, enter the 6-digit code, and we will route you to the correct path.',
    profileStageTitle: isArabic ? 'أكمل التسجيل السريع' : 'Complete your temporary registration',
    profileStageHint: isArabic
      ? 'بعد التحقق من الهاتف نطلب فقط الاسم وكود الجامعة.'
      : 'This initial registration stays minimal: name plus a valid 7-digit university code only.',
    pathSwitcher: isArabic ? 'تغيير المسار' : 'Change path',
    backToChoice: isArabic ? 'العودة لاختيار المسار' : 'Back to path choice',
    continueRegistration: isArabic ? 'اكمل التسجيل' : 'Continue registration',
    loginNow: isArabic ? 'سجّل الدخول الآن' : 'Login now',
    backToFullLogin: isArabic ? 'العودة لتسجيل الدخول الكامل' : 'Back to full login',
    completeAccessLabel: isArabic ? 'إكمال الوصول' : 'Complete Access',
    codeRuleHint: isArabic
      ? 'يجب أن يتكون كود الجامعة من 7 أرقام ويبدأ بسنة دفعة صحيحة من 13 إلى 31.'
      : 'University code must be exactly 7 digits and begin with a valid batch prefix from 13 to 31.',
    nameFlexHint: isArabic
      ? 'يمكنك استخدام الاسم بالعربية أو الإنجليزية هنا. استكمال الحساب لاحقًا يتطلب الإنجليزية.'
      : 'Name may be Arabic or English here. Later full-account completion uses stricter English-only rules.',
    statusCheckingPath: isArabic ? 'جارٍ تحديد المسار المناسب...' : 'Checking which phone path is allowed...',
    statusLoggingIn: isArabic ? 'جارٍ تسجيل دخولك...' : 'Signing you into Fast Access...',
    statusRegistrationReady: isArabic ? 'تم التحقق من الهاتف. أكمل التسجيل.' : 'Phone verified. Finish your registration.',
    statusUseFullLogin: isArabic ? 'هذا الرقم مرتبط بحساب كامل.' : 'This phone belongs to a full account.',
    statusPhoneRegistered: isArabic ? 'هذا الرقم مسجل بالفعل.' : 'This phone is already registered.',
    statusPhoneNotFound: isArabic ? 'لا يوجد حساب سريع لهذا الرقم حتى الآن.' : 'No Fast Access account was found for this phone yet.',
    toastRegistrationReady: isArabic ? 'تم التحقق من الهاتف. أكمل التسجيل السريع.' : 'Phone verified. Complete your Fast Access registration.',
    toastLoginGranted: isArabic ? 'تم تسجيل الدخول بنجاح عبر الدخول السريع.' : 'Fast Access login successful.',
    toastSwitchToRegister: isArabic ? 'لم نعثر على حساب لهذا الرقم. يمكنك إكمال التسجيل الآن.' : 'No account was found for this number. You can finish registration now.',
    toastAlreadyRegistered: isArabic ? 'هذا الرقم مسجل بالفعل. استخدم تسجيل الدخول بالهاتف.' : 'This phone is already registered. Use phone login instead.',
    useFullLoginTitle: isArabic ? 'هذا الرقم مرتبط بحساب كامل' : 'This phone already belongs to a full account',
    useFullLoginMessage: isArabic
      ? 'لأسباب أمنية لن ننشئ حساب دخول سريع جديد لهذا الرقم. تابع من شاشة تسجيل الدخول الأساسية.'
      : 'For security, we will not create a temporary Fast Access account on top of an existing full account. Continue from the regular login screen.',
    switchToRegisterTitle: isArabic ? 'لم نعثر على حساب سريع لهذا الرقم' : 'No Fast Access account was found for this number',
    switchToRegisterMessage: isArabic
      ? 'لقد تحققنا من الهاتف بالفعل. يمكنك إكمال التسجيل السريع الآن دون إعادة طلب رمز جديد.'
      : 'We already verified this phone. You can continue directly into registration without requesting another OTP.',
    switchToLoginTitle: isArabic ? 'هذا الرقم مسجل بالفعل' : 'This phone is already registered',
    switchToLoginMessage: isArabic
      ? 'لن ننشئ حسابًا مكررًا. يمكنك المتابعة مباشرة إلى تسجيل الدخول بهذا الرقم المتحقق.'
      : 'We will not create a duplicate temporary account. Continue directly to phone login with this verified number.',
  } as const;

  const isEnglishOnly = (text: string) => /^[\x00-\xFF]*$/.test(text);

  const isStep1Valid = () => {
    return (
      regData.username.length >= 3 &&
      isEnglishOnly(regData.username) &&
      usernameStatus === 'available' &&
      regData.email.includes('@') &&
      isEnglishOnly(regData.email) &&
      regData.password.length >= 8 &&
      regData.password === regData.confirmPassword
    );
  };

  const isStep2Valid = () => {
    return (
      regData.name.trim().length > 0 &&
      isEnglishOnly(regData.name) &&
      regData.country !== '' &&
      regData.nationality !== '' &&
      regData.phoneNumber.length > 0 &&
      regData.dateOfBirth !== '' &&
      regData.gender !== ''
    );
  };

  const isStep3Valid = () => {
    return (
      /^\d{7,8}$/.test(regData.universityCode) &&
      (regData.department === '' || isEnglishOnly(regData.department)) &&
      regData.academicYear !== ''
    );
  };

  const isCurrentStepValid = () => {
    if (regStep === 1) return isStep1Valid();
    if (regStep === 2) return isStep2Valid();
    if (regStep === 3) return isStep3Valid();
    return false;
  };

  const handleGoogleLogin = async () => {
    setStatus('processing', 'Signing in with Google...');
    try {
      await signInWithPopup(auth, googleProvider);
      setStatus('success', 'Signed in successfully');
    } catch (err: any) {
      setError(err, handleGoogleLogin);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier || !loginPassword) {
      notify.error('Please enter email/username and password');
      return;
    }
    setStatus('processing', 'Signing in...');
    try {
      await loginWithIdentifier(loginIdentifier, loginPassword);
      setStatus('success', 'Signed in successfully');
    } catch (err: any) {
      setError(err, () => handleEmailLogin(e));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (regStep < 3) {
      if (isCurrentStepValid()) {
        setRegStep(prev => prev + 1);
      }
      return;
    }

    if (!isStep3Valid()) return;

    // Final Validation
    if (regData.password !== regData.confirmPassword) {
      notify.error(t('passwordsMismatch'));
      setRegStep(1);
      return;
    }
    if (regData.password.length < 8) {
      notify.error(t('passwordTooShort'));
      setRegStep(1);
      return;
    }
    if (!/^\d{7,8}$/.test(regData.universityCode)) {
      notify.error(t('invalidUniversityCode'));
      setRegStep(3);
      return;
    }
    if (usernameStatus === 'taken') {
      notify.error(t('usernameTaken'));
      setRegStep(1);
      return;
    }
    
    setStatus('processing', 'Creating your account...');
    try {
      const fullPhoneNumber = `${regData.phoneCountryCode}${regData.phoneNumber}`;
      await register(regData.email, regData.password, {
        ...regData,
        phoneNumber: fullPhoneNumber
      });
      setStatus('success', 'Registration successful!');
      notify.success('Registration successful!');
    } catch (err: any) {
      setError(err, () => handleRegister(e));
    }
  };

  const validatePassword = (password: string) => {
    if (password.length < 8) return 'weak';
    if (/[A-Z]/.test(password) && /[0-9]/.test(password) && /[!@#$%^&*]/.test(password)) return 'strong';
    return 'medium';
  };

  const handleUsernameChange = (username: string) => {
    setRegData({...regData, username});
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    setTimeout(async () => {
      try {
        const isAvailable = await checkUsernameAvailability(username);
        setUsernameStatus(isAvailable ? 'available' : 'taken');
      } catch (error) {
        setUsernameStatus('error');
      }
    }, 500);
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('processing', 'Authenticating admin...');
    try {
      const success = await adminLogin(adminUsername, adminPassword);
      if (success) {
        setStatus('success', 'Admin authenticated');
      } else {
        throw new Error('Invalid admin credentials');
      }
    } catch (err: any) {
      setError(err, () => handleAdminLogin(e));
    }
  };

  const resetFastAccessFlow = () => {
    setFastAccessData({
      phoneCountryCode: '+20',
      phoneNumber: '',
      otpCode: '',
      fullName: '',
      universityCode: '',
    });
    setFastAccessIntent(null);
    setOtpConfirmation(null);
    setIsOtpSent(false);
    setFastAccessStep('choice');
    setVerifiedFastAccessToken('');
    setFastAccessNotice(null);
    setFastAccessValidation({});
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  };

  React.useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
      }
      fastAccessAuthRef.current.signOut().catch(() => undefined);
    };
  }, []);

  React.useEffect(() => {
    if (mode !== 'login' && isSecondaryActionsOpen) {
      setIsSecondaryActionsOpen(false);
    }
  }, [isSecondaryActionsOpen, mode]);

  const ensureRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current;
    }

    const container = document.getElementById('faculty-science-recaptcha');
    if (!container) {
      throw new Error('Security check container is missing. Please refresh and try again.');
    }

    const verifier = new RecaptchaVerifier(fastAccessAuthRef.current, container, {
      size: 'invisible',
      callback: () => undefined,
    });

    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const openFastAccessPath = (intent: 'login' | 'register') => {
    setFastAccessIntent(intent);
    setFastAccessStep('phone');
    setFastAccessNotice(null);
    setVerifiedFastAccessToken('');
    setFastAccessValidation({});
    setFastAccessData((prev) => ({
      ...prev,
      otpCode: '',
      fullName: '',
      universityCode: '',
    }));
    reset();
  };

  const completeFastAccessLogin = async (idToken: string) => {
    setFastAccessNotice(null);
    setStatus('processing', fastAccessCopy.statusLoggingIn);
    const verification = await loginFacultyScienceFastAccess(idToken);
    await signInWithCustomToken(auth, verification.customToken);
    setStatus('success', fastAccessCopy.toastLoginGranted);
    notify.success(fastAccessCopy.toastLoginGranted);
  };

  const handleFastAccessNoticeAction = async () => {
    if (!fastAccessNotice?.action) {
      return;
    }

    if (fastAccessNotice.action === 'login_now') {
      if (!verifiedFastAccessToken) {
        notify.error(t('fastAccess.errorSessionExpired'));
        setFastAccessStep('phone');
        return;
      }

      try {
        await completeFastAccessLogin(verifiedFastAccessToken);
      } catch (err: any) {
        setError(err, handleFastAccessNoticeAction);
      }
      return;
    }

    if (fastAccessNotice.action === 'continue_registration') {
      setFastAccessIntent('register');
      setFastAccessStep('profile');
      setFastAccessNotice(null);
      setStatus('success', fastAccessCopy.statusRegistrationReady);
      return;
    }

    setMode('login');
    resetFastAccessFlow();
    reset();
  };

  const handleSendFastAccessOtp = async () => {
    if (!fastAccessIntent) {
      setFastAccessNotice({
        tone: 'warning',
        title: fastAccessCopy.entryTitle,
        message: fastAccessCopy.entryHint,
      });
      return;
    }

    try {
      const fullPhoneNumber = buildFastAccessPhone(
        fastAccessData.phoneCountryCode,
        fastAccessData.phoneNumber
      );

      setFastAccessNotice(null);
      setVerifiedFastAccessToken('');
      setFastAccessValidation((prev) => ({ ...prev, phoneNumber: undefined }));
      setStatus('processing', t('fastAccess.statusSendingOtp'));
      const verifier = ensureRecaptcha();
      const confirmation = await signInWithPhoneNumber(
        fastAccessAuthRef.current,
        fullPhoneNumber,
        verifier
      );

      setOtpConfirmation(confirmation);
      setIsOtpSent(true);
      setStatus('success', t('fastAccess.statusOtpSent'));
      notify.success(t('fastAccess.toastOtpSent'));
    } catch (err: any) {
      const message = String(err?.message || '');
      if (message.toLowerCase().includes('phone')) {
        setFastAccessValidation((prev) => ({ ...prev, phoneNumber: t('fastAccess.errorPhoneInvalid') }));
      }
      setError(err, handleSendFastAccessOtp);
    }
  };

  const handleVerifyFastAccessOtp = async () => {
    if (!otpConfirmation) {
      setFastAccessValidation((prev) => ({ ...prev, otpCode: t('fastAccess.errorRequestOtpFirst') }));
      notify.error(t('fastAccess.errorRequestOtpFirst'));
      return;
    }

    const otpCode = fastAccessData.otpCode.replace(/\D/g, '');
    if (!/^\d{6}$/.test(otpCode)) {
      setFastAccessValidation((prev) => ({ ...prev, otpCode: t('fastAccess.errorOtpSixDigits') }));
      notify.error(t('fastAccess.errorOtpSixDigits'));
      return;
    }

    try {
      setFastAccessValidation((prev) => ({ ...prev, otpCode: undefined }));
      setFastAccessNotice(null);
      setStatus('processing', t('fastAccess.statusVerifyingOtp'));
      const credentialResult = await otpConfirmation.confirm(otpCode);
      const idToken = await credentialResult.user.getIdToken(true);
      setVerifiedFastAccessToken(idToken);
      await fastAccessAuthRef.current.signOut();

      if (!fastAccessIntent) {
        throw new Error('Choose a Fast Access path before verifying OTP.');
      }

      setStatus('processing', fastAccessCopy.statusCheckingPath);
      const phoneStatus = await checkFacultyScienceFastAccessStatus({
        idToken,
        intent: fastAccessIntent,
      });

      if (phoneStatus.accountState === 'full_account_exists') {
        setStatus('success', fastAccessCopy.statusUseFullLogin);
        setFastAccessNotice({
          tone: 'warning',
          title: fastAccessCopy.useFullLoginTitle,
          message: fastAccessCopy.useFullLoginMessage,
          action: 'full_login',
          actionLabel: fastAccessCopy.backToFullLogin,
        });
        notify.warning(fastAccessCopy.statusUseFullLogin);
        return;
      }

      if (fastAccessIntent === 'login') {
        if (phoneStatus.accountState === 'fast_access_exists') {
          await completeFastAccessLogin(idToken);
          return;
        }

        setFastAccessIntent('register');
        setFastAccessStep('profile');
        setStatus('success', fastAccessCopy.statusPhoneNotFound);
        setFastAccessNotice({
          tone: 'info',
          title: fastAccessCopy.switchToRegisterTitle,
          message: fastAccessCopy.switchToRegisterMessage,
        });
        notify.warning(fastAccessCopy.toastSwitchToRegister);
        return;
      }

      if (phoneStatus.accountState === 'fast_access_exists') {
        setStatus('success', fastAccessCopy.statusPhoneRegistered);
        setFastAccessNotice({
          tone: 'warning',
          title: fastAccessCopy.switchToLoginTitle,
          message: fastAccessCopy.switchToLoginMessage,
          action: 'login_now',
          actionLabel: fastAccessCopy.loginNow,
        });
        notify.warning(fastAccessCopy.toastAlreadyRegistered);
        return;
      }

      setFastAccessStep('profile');
      setStatus('success', fastAccessCopy.statusRegistrationReady);
      notify.success(fastAccessCopy.toastRegistrationReady);
    } catch (err: any) {
      setError(err, handleVerifyFastAccessOtp);
    }
  };

  const handleCompleteFastAccessProfile = async () => {
    if (!verifiedFastAccessToken) {
      setFastAccessValidation((prev) => ({ ...prev, otpCode: t('fastAccess.errorSessionExpired') }));
      notify.error(t('fastAccess.errorSessionExpired'));
      setFastAccessStep('phone');
      return;
    }

    const validation = validateFastAccessStudentStep();
    if (!validation.isValid) {
      notify.error(t('fastAccess.errorFixFields'));
      return;
    }

    try {
      setStatus('processing', t('fastAccess.statusFinalizing'));
      const verification = await registerFacultyScienceFastAccess({
        idToken: verifiedFastAccessToken,
        profile: validation.profile,
      });

      // Main app session remains on the primary auth instance.
      // The OTP auth instance is only used to prove phone possession.
      await signInWithCustomToken(auth, verification.customToken);

      setStatus('success', t('fastAccess.statusGranted'));
      notify.success(t('fastAccess.toastGranted'));
    } catch (err: any) {
      setError(err, handleCompleteFastAccessProfile);
    }
  };

  const renderFastAccessValidationMessage = (message?: string) => (
    <p
      className={cn(
        'min-h-[1rem] text-[10px] font-bold ms-1 transition-opacity',
        message ? 'text-red-500 opacity-100' : 'text-transparent opacity-0'
      )}
      aria-live="polite"
    >
      {message || '.'}
    </p>
  );

  const renderFastAccessNotice = () => {
    if (!fastAccessNotice) {
      return null;
    }

    const toneClass =
      fastAccessNotice.tone === 'warning'
        ? 'border-amber-200 bg-amber-50/85 text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100'
        : fastAccessNotice.tone === 'success'
          ? 'border-emerald-200 bg-emerald-50/85 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-100'
          : 'border-sky-200 bg-sky-50/85 text-sky-900 dark:border-sky-700/60 dark:bg-sky-900/20 dark:text-sky-100';

    return (
      <div className={cn('rounded-2xl border p-4 space-y-3', toneClass)}>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-80">
            {fastAccessNotice.title}
          </p>
          <p className="mt-2 text-sm leading-relaxed opacity-90">
            {fastAccessNotice.message}
          </p>
        </div>
        {fastAccessNotice.action && fastAccessNotice.actionLabel && (
          <button
            type="button"
            onClick={() => {
              void handleFastAccessNoticeAction();
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-black/80 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-black dark:bg-white/90 dark:text-zinc-900 dark:hover:bg-white"
          >
            {fastAccessNotice.actionLabel}
          </button>
        )}
      </div>
    );
  };

  const renderFastAccessChoiceStep = () => (
    <motion.div
      key="fast-access-choice"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-4"
    >
      <div>
        <h3 className="text-sm font-black tracking-wide text-zinc-800 dark:text-zinc-100">{fastAccessCopy.entryTitle}</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{fastAccessCopy.entryHint}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => openFastAccessPath('login')}
          className="rounded-[1.6rem] border border-zinc-200/80 bg-white/90 p-4 text-start transition hover:border-emerald-300 hover:bg-emerald-50/70 dark:border-zinc-700/60 dark:bg-zinc-900/45 dark:hover:border-emerald-600/60 dark:hover:bg-emerald-900/20"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200/40 bg-emerald-100/80 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/40 dark:text-emerald-300">
              <LogIn size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{fastAccessCopy.loginTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{fastAccessCopy.loginHint}</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => openFastAccessPath('register')}
          className="rounded-[1.6rem] border border-zinc-200/80 bg-white/90 p-4 text-start transition hover:border-emerald-300 hover:bg-emerald-50/70 dark:border-zinc-700/60 dark:bg-zinc-900/45 dark:hover:border-emerald-600/60 dark:hover:bg-emerald-900/20"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200/40 bg-emerald-100/80 text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-900/40 dark:text-emerald-300">
              <Sparkles size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-zinc-900 dark:text-zinc-100">{fastAccessCopy.registerTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{fastAccessCopy.registerHint}</p>
            </div>
          </div>
        </button>
      </div>

      {renderFastAccessNotice()}
    </motion.div>
  );

  const renderFastAccessPhoneStep = () => (
    <motion.div
      key="fast-access-phone"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black tracking-wide text-zinc-800 dark:text-zinc-100">{fastAccessCopy.phoneStageTitle}</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{fastAccessCopy.phoneStageHint}</p>
        </div>
        <button
          type="button"
          onClick={() => setFastAccessStep('choice')}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300"
        >
          <ArrowLeft size={14} className={cn(language === 'ar' && 'rotate-180')} />
          {fastAccessCopy.pathSwitcher}
        </button>
      </div>

      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300">
        {fastAccessIntent === 'login' ? <LogIn size={12} /> : <Sparkles size={12} />}
        {fastAccessIntent === 'login' ? fastAccessCopy.loginTitle : fastAccessCopy.registerTitle}
      </div>

      {renderFastAccessNotice()}

      <div className="space-y-1.5">
        <label className={cn('text-[11px] font-bold text-zinc-500 dark:text-zinc-400 ms-1', !isArabic && 'uppercase tracking-[0.14em]')}>{t('fastAccess.phoneLabel')}</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
          <CountrySelect
            value={fastAccessData.phoneCountryCode}
            onChange={(val) => setFastAccessData(prev => ({ ...prev, phoneCountryCode: val }))}
            countries={COUNTRIES}
            type="phone"
          />
          <div className="relative">
            <Phone className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
            <input
              type="tel"
              value={fastAccessData.phoneNumber}
              onChange={(e) => {
                setFastAccessData(prev => ({ ...prev, phoneNumber: e.target.value.replace(/\D/g, '') }));
                setFastAccessValidation(prev => ({ ...prev, phoneNumber: undefined }));
              }}
              className="w-full rounded-2xl border-2 border-zinc-100 bg-white py-3.5 ps-12 pe-4 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/60 dark:text-zinc-100"
              placeholder={t('fastAccess.phonePlaceholder')}
              required
            />
          </div>
        </div>
        {renderFastAccessValidationMessage(fastAccessValidation.phoneNumber)}
      </div>

      <div className="space-y-1.5">
        <label className={cn('text-[11px] font-bold text-zinc-500 dark:text-zinc-400 ms-1', !isArabic && 'uppercase tracking-[0.14em]')}>{t('fastAccess.otpLabel')}</label>
        <div className="relative">
          <KeyRound className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
          <input
            type="text"
            value={fastAccessData.otpCode}
            onChange={(e) => {
              setFastAccessData(prev => ({ ...prev, otpCode: e.target.value.replace(/\D/g, '').slice(0, 6) }));
              setFastAccessValidation(prev => ({ ...prev, otpCode: undefined }));
            }}
            className="w-full rounded-2xl border-2 border-zinc-100 bg-white py-3.5 ps-12 pe-4 text-sm font-medium tracking-[0.3em] text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/60 dark:text-zinc-100"
            placeholder="000000"
            inputMode="numeric"
            disabled={!isOtpSent}
          />
        </div>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 ms-1">{t('fastAccess.otpHint')}</p>
        {renderFastAccessValidationMessage(fastAccessValidation.otpCode)}
      </div>

      <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleSendFastAccessOtp}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Phone size={18} />}
          {isOtpSent ? t('fastAccess.resendOtp') : t('fastAccess.sendOtp')}
        </button>
        <button
          type="button"
          onClick={handleVerifyFastAccessOtp}
          disabled={!isOtpSent || isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-3.5 font-bold text-white transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {t('fastAccess.verifyOtp')}
        </button>
      </div>

      <div id="faculty-science-recaptcha" className="min-h-1" />
    </motion.div>
  );

  const renderFastAccessProfileStep = () => (
    <motion.div
      key="fast-access-profile"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black tracking-wide text-zinc-800 dark:text-zinc-100">{fastAccessCopy.profileStageTitle}</h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{fastAccessCopy.profileStageHint}</p>
          <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{t('fastAccess.requiredLegend')}</p>
        </div>
        <button
          type="button"
          onClick={() => setFastAccessStep('choice')}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300"
        >
          <ArrowLeft size={14} className={cn(language === 'ar' && 'rotate-180')} />
          {fastAccessCopy.backToChoice}
        </button>
      </div>

      {renderFastAccessNotice()}

      <div className="space-y-1.5">
        <label className={cn('text-[11px] font-bold text-zinc-500 dark:text-zinc-400 ms-1', !isArabic && 'uppercase tracking-[0.14em]')}>{t('fastAccess.fullNameLabel')}</label>
        <div className="relative">
          <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
          <input
            type="text"
            value={fastAccessData.fullName}
            onChange={(e) => {
              setFastAccessData(prev => ({ ...prev, fullName: e.target.value.slice(0, 120) }));
              setFastAccessValidation(prev => ({ ...prev, fullName: undefined }));
            }}
            className="w-full rounded-2xl border-2 border-zinc-100 bg-white py-3.5 ps-12 pe-4 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/60 dark:text-zinc-100"
            placeholder={t('fastAccess.fullNamePlaceholder')}
            required
          />
        </div>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 ms-1">{fastAccessCopy.nameFlexHint}</p>
        {renderFastAccessValidationMessage(fastAccessValidation.fullName)}
      </div>

      <div className="space-y-1.5">
        <label className={cn('text-[11px] font-bold text-zinc-500 dark:text-zinc-400 ms-1', !isArabic && 'uppercase tracking-[0.14em]')}>{t('fastAccess.studentCodeLabel')}</label>
        <div className="relative">
          <Building className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
          <input
            type="text"
            value={fastAccessData.universityCode}
            onChange={(e) => {
              setFastAccessData(prev => ({ ...prev, universityCode: e.target.value.replace(/\D/g, '').slice(0, 7) }));
              setFastAccessValidation(prev => ({ ...prev, universityCode: undefined }));
            }}
            className="w-full rounded-2xl border-2 border-zinc-100 bg-white py-3.5 ps-12 pe-4 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/60 dark:text-zinc-100"
            placeholder={t('fastAccess.studentCodePlaceholder')}
            inputMode="numeric"
            required
          />
        </div>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 ms-1">{fastAccessCopy.codeRuleHint}</p>
        {renderFastAccessValidationMessage(fastAccessValidation.universityCode)}
      </div>

      <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleCompleteFastAccessProfile}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} className={cn(language === 'ar' && 'rotate-180')} />}
          {fastAccessCopy.continueRegistration}
        </button>
        <button
          type="button"
          onClick={() => setFastAccessStep('choice')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 py-3.5 font-bold text-zinc-600 transition-all hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <ArrowLeft size={18} className={cn(language === 'ar' && 'rotate-180')} />
          {fastAccessCopy.backToChoice}
        </button>
      </div>
    </motion.div>
  );

  const renderFastAccessStepContent = () => {
    if (fastAccessStep === 'choice') {
      return renderFastAccessChoiceStep();
    }

    if (fastAccessStep === 'phone') {
      return renderFastAccessPhoneStep();
    }

    return renderFastAccessProfileStep();
  };

  if (!isAuthReady) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", isDarkMode ? "bg-pattern-dark" : "bg-pattern-light")}>
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className={cn("relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-3 py-4 sm:px-4 sm:py-6 md:px-6", isDarkMode ? "bg-pattern-dark" : "bg-pattern-light")}>
      <div className="absolute top-4 w-full px-4 text-center z-20 sm:top-5">
        <div className="flex flex-col items-center gap-1 opacity-40 hover:opacity-100 transition-opacity duration-700">
          <p className="text-zinc-500 dark:text-zinc-400 font-arabic text-lg tracking-widest">{t('basmala')}</p>
          <p className="text-zinc-400 dark:text-zinc-500 font-serif italic text-[10px] uppercase tracking-[0.2em]">
            In the name of Allah, the Most Gracious, the Most Merciful
          </p>
        </div>
      </div>
      <ScienceBackground />
      {/* Background Elements */}
      <div className="absolute top-0 start-0 w-full h-full opacity-[0.03] pointer-events-none">
        <div className="absolute top-10 start-10 w-64 h-64 bg-emerald-600 rounded-full blur-3xl" />
        <div className="absolute bottom-10 end-10 w-96 h-96 bg-emerald-600 rounded-full blur-3xl" />
      </div>

      <div className="absolute start-4 top-4 z-20 hidden lg:block">
        <ScienceMouse />
      </div>

      <div className="absolute end-4 top-4 z-20 flex items-center gap-2 sm:gap-3">
        <LanguageSwitch />
        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full bg-white/95 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-300 dark:border-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors shadow-sm"
          title={!isDarkMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {!isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "z-10 w-full transition-all duration-500",
          mode === 'register'
            ? "max-w-6xl"
            : mode === 'science-fast-access'
              ? "max-w-2xl"
              : "max-w-lg"
        )}
      >
        <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-white/88 shadow-2xl shadow-black/20 backdrop-blur-2xl dark:bg-zinc-950/72 dark:shadow-black/50 sm:rounded-[2.25rem]">
          
          <div className={cn("flex flex-col", mode === 'register' ? "lg:flex-row" : "")}>
            
            {/* Encouragement Block for Registration */}
            {mode === 'register' && (
              <div className="relative flex flex-col justify-between overflow-hidden bg-emerald-700 p-6 text-white lg:w-[38%] lg:p-8 dark:bg-emerald-950">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.16),_transparent_34%),linear-gradient(180deg,rgba(6,95,70,0.35),rgba(2,6,23,0.3))]" />
                <div className="absolute top-0 end-0 w-56 h-56 bg-white/10 rounded-full blur-3xl -me-20 -mt-20" />
                <div className="absolute bottom-0 start-0 w-56 h-56 bg-black/10 rounded-full blur-3xl -ms-20 -mb-20" />
                
                <div className="relative z-10">
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-50/90 backdrop-blur-sm">
                    <Atom size={14} />
                    Faculty of Science
                  </div>
                  <div className="w-11 h-11 bg-white/16 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-sm border border-white/20">
                    <Sparkles className="text-white" size={22} />
                  </div>
                  <h2 className="text-3xl font-black mb-3 leading-tight tracking-tight lg:text-[2.4rem]">
                    {t('welcomeTitle')}
                  </h2>
                  <p className="max-w-sm text-sm leading-relaxed font-medium text-emerald-50/90 sm:text-base dark:text-emerald-200/90">
                    {t('welcomeSubtitle')}
                  </p>
                </div>
                
                <div className="relative z-10 mt-8">
                  <div className="mb-6 flex items-center gap-4">
                    <div className="flex -space-x-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="w-10 h-10 rounded-full border-2 border-emerald-600 dark:border-emerald-900 bg-emerald-100 dark:bg-emerald-800 flex items-center justify-center overflow-hidden">
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}&backgroundColor=b6e3f4`} alt="Avatar" className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                    <div className="text-sm font-medium text-emerald-100 dark:text-emerald-300">
                      {t('joinStudents')}
                    </div>
                  </div>

                  <p className="mb-3 text-sm text-emerald-200 dark:text-emerald-400">{t('alreadyHaveAccount')}</p>
                  <button 
                    onClick={() => setMode('login')}
                    className="flex items-center gap-2 text-white font-bold hover:gap-3 transition-all group"
                  >{t('signIn')}<ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </div>
            )}

            <div className={cn("p-5 sm:p-6 lg:p-7", mode === 'register' ? "lg:w-[62%]" : "w-full")}>
              <div className="mb-6 flex items-center justify-between">
                {mode !== 'login' && (
                  <button 
                    onClick={() => {
                      setMode('login');
                      reset();
                    }}
                    className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-emerald-600 dark:bg-zinc-800 dark:text-zinc-500"
                    title={t('backToLogin')}
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                <div className="flex flex-1 flex-col items-center gap-1.5 px-2">
                  <LoginLogo compact />
                  <StatusIndicator status={status} message={statusMessage} />
                </div>
                {mode !== 'login' && <div className="w-10" />} {/* Spacer for centering */}
              </div>

              <div className="space-y-5">
                {isError && (
                  <StatusCard 
                    status={status}
                    title="Authentication Error"
                    message={error?.message}
                    onRetry={error?.retryAction}
                    onDismiss={reset}
                  />
                )}
                <AnimatePresence mode="wait">
                  {mode === 'login' && (
                    <motion.div
                      key="login"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="space-y-6"
                    >
                      <form onSubmit={handleEmailLogin} className="space-y-3.5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('emailOrUsername')}</label>
                          <div className="relative">
                            <Mail className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                            <input
                              type="text"
                              value={loginIdentifier}
                              onChange={(e) => setLoginIdentifier(e.target.value)}
                              className="w-full rounded-2xl border-2 border-zinc-100 bg-zinc-50 py-3.5 ps-12 pe-4 font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                              placeholder={t('emailOrUsernamePlaceholder')}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">Password</label>
                          <div className="relative">
                            <Lock className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                            <input
                              type={showPassword ? "text" : "password"}
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                              className="w-full rounded-2xl border-2 border-zinc-100 bg-zinc-50 py-3.5 ps-12 pe-12 font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                              placeholder={t('passwordPlaceholder')}
                              required
                            />
                            <button 
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute end-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:text-zinc-300"
                            >
                              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setMode('forgot-password')}
                            className="text-emerald-600 hover:text-emerald-700 font-bold text-xs transition-colors"
                          >{t('forgotPassword')}</button>
                        </div>

                        <button
                          type="submit"
                          disabled={isLoading}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                        >
                          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
                          {t('signIn')}
                        </button>
                      </form>

                      <div className="pt-2 flex flex-col gap-3">
                        <motion.button
                          type="button"
                          onClick={() => {
                            reset();
                            resetFastAccessFlow();
                            setMode('science-fast-access');
                          }}
                          whileHover={{ y: -1 }}
                          transition={{ duration: 0.2 }}
                          className="group relative w-full overflow-hidden rounded-[1.75rem] border border-emerald-300/35 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(2,6,23,0.22))] px-4 py-3 text-start backdrop-blur-md transition"
                        >
                          <div className="absolute inset-y-0 end-0 w-24 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.18),_transparent_70%)]" />
                          <div className="relative flex items-center gap-3">
                            <motion.div
                              animate={{ y: [0, -4, 0], scale: [1, 1.03, 1] }}
                              transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200/30 bg-black/20 text-emerald-100"
                            >
                              <Atom size={18} />
                            </motion.div>
                            <div className="min-w-0">
                              <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100/90">
                                {facultyScienceBadge}
                              </span>
                              <span className="mt-1 block text-sm font-bold text-white">{t('fastAccess.title')}</span>
                              <span className="mt-1 block text-[11px] font-medium leading-relaxed text-emerald-100/80">
                                {fastAccessAudience}
                              </span>
                            </div>
                          </div>
                        </motion.button>

                        <AuthSecondaryActionsPanel
                          title={secondaryActionsTitle}
                          description={secondaryActionsHint}
                          isOpen={isSecondaryActionsOpen}
                          onToggle={() => setIsSecondaryActionsOpen((current) => !current)}
                        >
                          <button
                            type="button"
                            onClick={() => setMode('register')}
                            className="flex w-full items-center justify-between rounded-2xl border border-emerald-200/25 bg-white/6 px-4 py-3 text-sm font-bold text-white/90 transition hover:bg-white/10"
                          >
                            <span>{t('createAccount')}</span>
                            <ArrowRight size={16} className={cn(language === 'ar' && 'rotate-180')} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode('admin')}
                            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm font-bold text-white/75 transition hover:bg-white/8"
                          >
                            <span className="inline-flex items-center gap-2">
                              <Shield size={14} />
                              {t('adminLogin')}
                            </span>
                            <ArrowRight size={16} className={cn(language === 'ar' && 'rotate-180')} />
                          </button>
                        </AuthSecondaryActionsPanel>
                      </div>
                    </motion.div>
                  )}

                  {mode === 'register' && (
                    <motion.div
                      key="register"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="text-center mb-3">
                        <h2 className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{t('studentRegistration')}</h2>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm">{t('step')} {regStep} {t('of')} 3: {
                          regStep === 1 ? t('accountSecurity') : 
                          regStep === 2 ? t('personalDetails') : 
                          t('academicInfo')
                        }</p>
                        
                        {/* Progress Bar */}
                        <div className="flex gap-2 mt-4 max-w-[200px] mx-auto">
                          {[1, 2, 3].map(step => (
                            <div 
                              key={step}
                              className={cn(
                                "h-1.5 flex-1 rounded-full transition-all duration-500",
                                step <= regStep ? "bg-emerald-600" : "bg-zinc-100 dark:bg-zinc-800"
                              )}
                            />
                          ))}
                        </div>
                      </div>

                      <form onSubmit={handleRegister} className="space-y-5">
                        <AnimatePresence mode="wait">
                          {regStep === 1 && (
                            <motion.div
                              key="step1"
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              className="space-y-4"
                            >
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('username')}</label>
                                <div className="relative">
                                  <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                  <input
                                    type="text"
                                    value={regData.username}
                                    onChange={(e) => handleUsernameChange(e.target.value)}
                                    className={cn(
                                      "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 ps-12 pe-10 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500",
                                      usernameStatus === 'available' && isEnglishOnly(regData.username) ? "border-emerald-200 focus:border-emerald-500" : 
                                      usernameStatus === 'taken' || usernameStatus === 'error' || (regData.username.length > 0 && !isEnglishOnly(regData.username)) ? "border-red-200 focus:border-red-500" : "border-zinc-100 dark:border-zinc-800 focus:border-emerald-500"
                                    )}
                                    placeholder={t('usernamePlaceholder')}
                                    required
                                  />
                                  <div className="absolute end-4 top-1/2 -translate-y-1/2">
                                    {usernameStatus === 'checking' && <Loader2 className="animate-spin text-zinc-400 dark:text-zinc-500" size={16} />}
                                    {usernameStatus === 'available' && isEnglishOnly(regData.username) && <CheckCircle2 className="text-emerald-500" size={16} />}
                                    {(usernameStatus === 'taken' || usernameStatus === 'error' || (regData.username.length > 0 && !isEnglishOnly(regData.username))) && <XCircle className="text-red-500" size={16} />}
                                  </div>
                                </div>
                                {usernameStatus === 'taken' && <p className="text-[10px] text-red-500 font-bold ms-1">{t('usernameTaken')}</p>}
                                {regData.username.length > 0 && !isEnglishOnly(regData.username) && <p className="text-[10px] text-red-500 font-bold ms-1">{t('usernameEnglishOnly')}</p>}
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('email')}</label>
                                <div className="relative">
                                  <Mail className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                  <input
                                    type="email"
                                    value={regData.email}
                                    onChange={(e) => setRegData({...regData, email: e.target.value})}
                                    className={cn(
                                      "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500",
                                      regData.email.length > 0 && !isEnglishOnly(regData.email) ? "border-red-200 focus:border-red-500" : "border-zinc-100 dark:border-zinc-700/50 focus:border-emerald-500"
                                    )}
                                    placeholder={t('emailPlaceholder')}
                                    required
                                  />
                                </div>
                                {regData.email.length > 0 && !isEnglishOnly(regData.email) && <p className="text-[10px] text-red-500 font-bold ms-1">{t('emailEnglishOnly')}</p>}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('password')}</label>
                                  <div className="relative">
                                    <Lock className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                    <input
                                      type={showPassword ? "text" : "password"}
                                      value={regData.password}
                                      onChange={(e) => {
                                        setRegData({...regData, password: e.target.value});
                                        setPasswordStrength(validatePassword(e.target.value));
                                      }}
                                      className={cn(
                                        "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 ps-12 pe-10 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500",
                                        regData.password.length > 0 && regData.password.length < 8 ? "border-red-200 focus:border-red-500" : "border-zinc-100 dark:border-zinc-700/50 focus:border-emerald-500"
                                      )}
                                      placeholder={t('min8Chars')}
                                      required
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => setShowPassword(!showPassword)}
                                      className="absolute end-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:text-zinc-300"
                                    >
                                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                  </div>
                                  {regData.password.length > 0 && regData.password.length < 8 && <p className="text-[10px] text-red-500 font-bold ms-1">{t('passwordTooShort')}</p>}
                                  <div className="flex gap-1 mt-1 px-1">
                                    <div className={cn("h-1 flex-1 rounded-full transition-all", passwordStrength === 'weak' ? "bg-red-400" : passwordStrength === 'medium' ? "bg-amber-400" : "bg-emerald-400")} />
                                    <div className={cn("h-1 flex-1 rounded-full transition-all", passwordStrength === 'medium' ? "bg-amber-400" : passwordStrength === 'strong' ? "bg-emerald-400" : "bg-zinc-100 dark:bg-zinc-800")} />
                                    <div className={cn("h-1 flex-1 rounded-full transition-all", passwordStrength === 'strong' ? "bg-emerald-400" : "bg-zinc-100 dark:bg-zinc-800")} />
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('confirmPassword')}</label>
                                  <div className="relative">
                                    <Lock className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                    <input
                                      type={showPassword ? "text" : "password"}
                                      value={regData.confirmPassword}
                                      onChange={(e) => setRegData({...regData, confirmPassword: e.target.value})}
                                      className={cn(
                                        "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500",
                                        regData.confirmPassword && regData.password === regData.confirmPassword ? "border-emerald-200 focus:border-emerald-500" : 
                                        regData.confirmPassword && regData.password !== regData.confirmPassword ? "border-red-200 focus:border-red-500" : "border-zinc-100 dark:border-zinc-800 focus:border-emerald-500"
                                      )}
                                      placeholder={t('repeatPassword')}
                                      required
                                    />
                                  </div>
                                  {regData.confirmPassword && regData.password !== regData.confirmPassword && <p className="text-[10px] text-red-500 font-bold ms-1">{t('passwordsMismatch')}</p>}
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {regStep === 2 && (
                            <motion.div
                              key="step2"
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              className="space-y-4"
                            >
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('fullName')}</label>
                                <div className="relative">
                                  <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                  <input
                                    type="text"
                                    value={regData.name}
                                    onChange={(e) => setRegData({...regData, name: e.target.value})}
                                    className={cn(
                                      "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500",
                                      regData.name.length > 0 && !isEnglishOnly(regData.name) ? "border-red-200 focus:border-red-500" : "border-zinc-100 dark:border-zinc-700/50 focus:border-emerald-500"
                                    )}
                                    placeholder={t('fullNamePlaceholder')}
                                    required
                                  />
                                </div>
                                {regData.name.length > 0 && !isEnglishOnly(regData.name) && <p className="text-[10px] text-red-500 font-bold ms-1">{t('nameEnglishOnly')}</p>}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('country')}</label>
                                  <CountrySelect
                                    value={regData.country}
                                    onChange={(val) => setRegData({...regData, country: val})}
                                    countries={COUNTRIES}
                                    placeholder={t('selectCountry')}
                                    required
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('nationality')}</label>
                                  <CountrySelect
                                    value={regData.nationality}
                                    onChange={(val) => setRegData({...regData, nationality: val})}
                                    countries={COUNTRIES}
                                    type="nationality"
                                    placeholder={t('selectNationality')}
                                    required
                                  />
                                </div>
                              </div>

                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('phoneNumber')}</label>
                                  <div className="flex gap-2">
                                    <div className="w-32">
                                      <CountrySelect
                                        value={regData.phoneCountryCode}
                                        onChange={(val) => setRegData({...regData, phoneCountryCode: val})}
                                        countries={COUNTRIES}
                                        type="phone"
                                      />
                                    </div>
                                    <div className="relative flex-1">
                                      <Phone className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                      <input
                                        type="tel"
                                        value={regData.phoneNumber}
                                        onChange={(e) => setRegData({...regData, phoneNumber: e.target.value.replace(/\D/g, '')})}
                                        className="w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 border-zinc-100 dark:border-zinc-700/50 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none focus:border-emerald-500 transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100"
                                        placeholder={t('numberOnly')}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('dateOfBirth')}</label>
                                    <div className="relative">
                                      <Calendar className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                      <input
                                        type="date"
                                        value={regData.dateOfBirth}
                                        onChange={(e) => setRegData({...regData, dateOfBirth: e.target.value})}
                                        className="w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 border-zinc-100 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none focus:border-emerald-500 transition-all font-medium text-sm"
                                        required
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('gender')}</label>
                                    <div className="relative">
                                      <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                      <select
                                        value={regData.gender}
                                        onChange={(e) => setRegData({...regData, gender: e.target.value})}
                                        className="w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 border-zinc-100 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none focus:border-emerald-500 transition-all font-medium text-sm appearance-none"
                                        required
                                      >
                                        <option value="" disabled>{t('selectGender')}</option>
                                        <option value="male">{t('male')}</option>
                                        <option value="female">{t('female')}</option>
                                        <option value="other">{t('other')}</option>
                                        <option value="prefer_not_to_say">{t('preferNotToSay')}</option>
                                      </select>
                                      <ChevronRight className="absolute end-4 top-1/2 -translate-y-1/2 text-zinc-300 rotate-90 pointer-events-none" size={16} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {regStep === 3 && (
                            <motion.div
                              key="step3"
                              initial={{ opacity: 0, x: 10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              className="space-y-4"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('universityCode')}</label>
                                  <div className="relative">
                                    <Building className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                    <input
                                      type="text"
                                      value={regData.universityCode}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                                        setRegData({...regData, universityCode: val});
                                      }}
                                      className={cn(
                                        "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500",
                                        regData.universityCode.length > 0 && (regData.universityCode.length < 7 || regData.universityCode.length > 8) ? "border-red-200 focus:border-red-500" : "border-zinc-100 dark:border-zinc-700/50 focus:border-emerald-500"
                                      )}
                                      placeholder={t('max8Digits')}
                                      required
                                    />
                                  </div>
                                  {regData.universityCode.length > 0 && (regData.universityCode.length < 7 || regData.universityCode.length > 8) && <p className="text-[10px] text-red-500 font-bold ms-1">{t('invalidUniversityCode')}</p>}
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('department')}</label>
                                  <div className="relative">
                                    <BookOpen className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                    <input
                                      type="text"
                                      value={regData.department}
                                      onChange={(e) => setRegData({...regData, department: e.target.value})}
                                      className={cn(
                                        "w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none transition-all font-medium text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500",
                                        regData.department.length > 0 && !isEnglishOnly(regData.department) ? "border-red-200 focus:border-red-500" : "border-zinc-100 dark:border-zinc-700/50 focus:border-emerald-500"
                                      )}
                                      placeholder={t('departmentPlaceholder')}
                                    />
                                  </div>
                                  {regData.department.length > 0 && !isEnglishOnly(regData.department) && <p className="text-[10px] text-red-500 font-bold ms-1">{t('deptEnglishOnly')}</p>}
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('academicLevel')}</label>
                                <div className="relative">
                                  <GraduationCap className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                                  <select
                                    value={regData.academicYear}
                                    onChange={(e) => setRegData({...regData, academicYear: e.target.value})}
                                    className="w-full bg-zinc-50 dark:bg-zinc-800/50 border-2 border-zinc-100 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 rounded-2xl py-3.5 ps-12 pe-4 focus:outline-none focus:border-emerald-500 transition-all font-medium text-sm appearance-none"
                                  >
                                    <option value="">Select Level</option>
                                    <option value="Level 1">Level 1 (Freshman)</option>
                                    <option value="Level 2">Level 2 (Sophomore)</option>
                                    <option value="Level 3">Level 3 (Junior)</option>
                                    <option value="Level 4">Level 4 (Senior)</option>
                                    <option value="Master">Master's Degree</option>
                                    <option value="PhD">PhD Candidate</option>
                                  </select>
                                  <ChevronRight className="absolute end-4 top-1/2 -translate-y-1/2 text-zinc-300 rotate-90 pointer-events-none" size={16} />
                                </div>
                              </div>
                              
                              <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3.5">
                                <Shield className="text-emerald-600 shrink-0" size={20} />
                                <p className="text-[10px] text-emerald-800 leading-relaxed">{t('terms')}</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="flex gap-3 pt-2">
                          {regStep > 1 && (
                            <button
                              type="button"
                              onClick={() => setRegStep(prev => prev - 1)}
                              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-100 py-3.5 font-bold text-zinc-600 transition-all hover:bg-zinc-200 active:scale-[0.98] dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                            >
                              <ChevronLeft size={18} />{t('back')}</button>
                          )}
                          <button
                            type="submit"
                            disabled={isLoading || !isCurrentStepValid()}
                            className="flex flex-[2] items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                          >
                            {isLoading ? <Loader2 className="animate-spin" size={18} /> : regStep === 3 ? <Sparkles size={18} /> : <ChevronRight size={18} />}
                            {regStep === 3 ? t('completeRegistration') : t('continue')}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  )}

                  {mode === 'forgot-password' && (
                    <motion.div
                      key="forgot-password"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-5"
                    >
                      <div className="text-center">
                        <h2 className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{t('resetPassword')}</h2>
                        <p className="text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 text-sm mt-2">{t('enterEmailToReset')}</p>
                      </div>

                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        setStatus('processing', 'Sending reset link...');
                        try {
                          await forgotPassword(loginIdentifier);
                          setStatus('success', 'Reset link sent to your email');
                          setTimeout(() => {
                            setMode('login');
                            reset();
                          }, 3000);
                        } catch (err: any) {
                          setError(err, () => {});
                        }
                      }} className="space-y-3.5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('email')}</label>
                          <div className="relative">
                            <Mail className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                            <input
                              type="email"
                              value={loginIdentifier}
                              onChange={(e) => setLoginIdentifier(e.target.value)}
                              className="w-full rounded-2xl border-2 border-zinc-100 bg-zinc-50 py-3.5 ps-12 pe-4 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                              placeholder={t('emailPlaceholder')}
                              required
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isLoading}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
                        >
                          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} />}
                          {t('sendResetLink')}
                        </button>

                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 py-3.5 font-bold text-zinc-600 transition-all hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          <ArrowLeft size={18} />
                          {t('backToLogin')}
                        </button>
                      </form>
                    </motion.div>
                  )}

                  {mode === 'science-fast-access' && (
                    <motion.div
                      key="science-fast-access"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-5"
                    >
                      <div className="relative overflow-hidden rounded-[1.9rem] border border-emerald-300/30 bg-[linear-gradient(140deg,rgba(16,185,129,0.16),rgba(2,6,23,0.55))] p-4 text-start shadow-lg shadow-black/10 sm:p-5">
                        <div className="absolute end-0 top-0 h-28 w-28 bg-[radial-gradient(circle,_rgba(255,255,255,0.16),_transparent_70%)]" />
                        <div className="relative flex items-start gap-4">
                          <motion.div
                            animate={{ y: [0, -4, 0], scale: [1, 1.03, 1] }}
                            transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
                            className="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-200/30 bg-black/20 text-emerald-100 shadow-lg shadow-emerald-950/20"
                          >
                            <Atom size={20} />
                          </motion.div>
                          <div className="min-w-0">
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-50/90">
                              <GraduationCap size={12} />
                              {facultyScienceBadge}
                            </div>
                            <h2 className="mt-3 text-[1.55rem] font-black leading-tight text-white sm:text-[1.7rem]">
                              {t('fastAccess.title')}
                            </h2>
                            <p className="mt-2 max-w-xl text-sm leading-relaxed text-emerald-50/82">
                              {t('fastAccess.subtitle')}
                            </p>
                            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/70">
                              {fastAccessAudience}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 dark:bg-amber-900/20 dark:border-amber-700/50">
                        <p className="text-[11px] leading-relaxed font-semibold text-amber-800 dark:text-amber-200">
                          {t('fastAccess.securityNote')}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-zinc-200/80 bg-white/60 p-2 dark:border-zinc-700/60 dark:bg-zinc-800/40">
                        <div
                          className={cn(
                            'rounded-xl border px-3 py-2 text-center transition',
                            fastAccessStep === 'choice'
                              ? 'border-emerald-600 bg-emerald-600 text-white shadow'
                              : 'border-transparent bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          )}
                        >
                          <p className={cn('text-[10px] font-black', !isArabic && 'uppercase tracking-wider')}>{t('step')} 1</p>
                          <p className="mt-0.5 text-xs font-semibold">{fastAccessCopy.entryTitle}</p>
                        </div>
                        <div
                          className={cn(
                            'rounded-xl border px-3 py-2 text-center transition',
                            fastAccessStep === 'phone'
                              ? 'border-emerald-600 bg-emerald-600 text-white shadow'
                              : 'border-transparent bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          )}
                        >
                          <p className={cn('text-[10px] font-black', !isArabic && 'uppercase tracking-wider')}>{t('step')} 2</p>
                          <p className="mt-0.5 text-xs font-semibold">{t('fastAccess.stepPhoneOtp')}</p>
                        </div>
                        <div
                          className={cn(
                            'rounded-xl border px-3 py-2 text-center transition',
                            fastAccessStep === 'profile'
                              ? 'border-emerald-600 bg-emerald-600 text-white shadow'
                              : 'border-transparent bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                          )}
                        >
                          <p className={cn('text-[10px] font-black', !isArabic && 'uppercase tracking-wider')}>{t('step')} 3</p>
                          <p className="mt-0.5 text-xs font-semibold">
                            {fastAccessIntent === 'login'
                              ? fastAccessCopy.loginTitle
                              : fastAccessIntent === 'register'
                                ? fastAccessCopy.registerTitle
                                : fastAccessCopy.completeAccessLabel}
                          </p>
                        </div>
                      </div>

                      <div className="min-h-[26rem] rounded-2xl border border-zinc-200/80 bg-zinc-50/65 p-4 dark:border-zinc-700/60 dark:bg-zinc-900/30 sm:p-5">
                        <AnimatePresence mode="wait">{renderFastAccessStepContent()}</AnimatePresence>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          resetFastAccessFlow();
                          reset();
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 py-3.5 font-bold text-zinc-600 transition-all hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <ArrowLeft size={18} />
                        {t('backToLogin')}
                      </button>
                    </motion.div>
                  )}

                  {mode === 'admin' && (
                    <motion.div
                      key="admin"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-5"
                    >
                      <div className="text-center">
                        <h2 className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{t('adminAccess')}</h2>
                        <p className="text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 text-sm mt-2">{t('authorizedPersonnel')}</p>
                      </div>

                      <form onSubmit={handleAdminLogin} className="space-y-3.5">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">{t('usernameOrEmail')}</label>
                          <div className="relative">
                            <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                            <input
                              type="text"
                              value={adminUsername}
                              onChange={(e) => setAdminUsername(e.target.value)}
                              className="w-full rounded-2xl border-2 border-zinc-100 bg-zinc-50 py-3.5 ps-12 pe-4 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                              placeholder={t('adminIdPlaceholder')}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 ms-1">Password</label>
                          <div className="relative">
                            <Lock className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
                            <input
                              type={showPassword ? "text" : "password"}
                              value={adminPassword}
                              onChange={(e) => setAdminPassword(e.target.value)}
                              className="w-full rounded-2xl border-2 border-zinc-100 bg-zinc-50 py-3.5 ps-12 pe-10 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-emerald-500 dark:border-zinc-700/50 dark:bg-zinc-800/50 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                              placeholder={t('passwordPlaceholder')}
                              required
                            />
                            <button 
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute end-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:text-zinc-300"
                            >
                              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isLoading}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 py-3.5 font-bold text-white shadow-lg shadow-zinc-900/20 transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
                        >
                          {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Shield size={18} />}
                          {t('adminLoginTitle')}
                        </button>

                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-100 py-3.5 font-bold text-zinc-600 transition-all hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        >
                          <ArrowLeft size={18} />
                          {t('backToLogin')}
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Support & Donate Section - Removed to clean up login page layout
              <div className="mt-12 pt-8 border-t border-zinc-100 dark:border-zinc-800/50">
                <div className="bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex-1 text-center sm:text-start">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-1">
                      {t('supportTitle')}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 dark:text-zinc-400 dark:text-zinc-500 max-w-sm">
                      {t('supportText')}
                    </p>
                  </div>
                  <button className="shrink-0 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/20 font-bold py-2.5 px-5 rounded-xl transition-all flex items-center gap-2 text-sm">
                    <Heart size={16} className="fill-emerald-700 dark:fill-emerald-400" />
                    {t('donateBtn')}
                  </button>
                </div>
              </div>
              */}
            </div>
          </div>

          <div className="border-t border-zinc-100 bg-zinc-50/40 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex items-center justify-center gap-4 text-zinc-400 dark:text-zinc-500 sm:gap-6">
              <div className="flex items-center gap-2">
                <Shield size={14} />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Secure SSL</span>
              </div>
              <div className="flex items-center gap-2">
                <GraduationCap size={14} />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Academic ID</span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-8 text-[10px] text-center text-zinc-400 dark:text-zinc-500 font-medium leading-relaxed whitespace-pre-line">
          {COPYRIGHT}
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
