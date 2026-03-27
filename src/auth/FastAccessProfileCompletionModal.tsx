import * as React from 'react';
import { ArrowRight, Loader2, Sparkles, User as UserIcon, Building2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { auth } from '../firebase';
import { useAuth } from './AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { completeFacultyScienceFastAccessProfile } from '../services/fastAccessService';
import { isFacultyFastAccessUser, isFastAccessProfileCompletionPending } from '../constants/fastAccessPolicy';
import { POPUP_FLOW_PRIORITY, REQUIRED_ACCOUNT_COMPLETION_FLOW_ID } from '../constants/popupFlows';
import { cn } from '../utils';

function deriveCopy(isArabic: boolean) {
  if (isArabic) {
    return {
      eyebrow: 'Faculty Fast Access',
      title: 'أكمل الوصول السريع',
      subtitle: 'أدخل الاسم الكامل والكود الجامعي لتفعيل 3 أرصدة البداية.',
      fullNameLabel: 'الاسم الكامل',
      fullNamePlaceholder: 'اسمك الكامل',
      universityCodeLabel: 'الكود الجامعي',
      universityCodePlaceholder: '7 أرقام',
      submit: 'تفعيل الوصول',
      helper: 'نحتاج هذين الحقلين فقط لتفعيل استخدامك الأول.',
      fullNameRequired: 'الاسم الكامل مطلوب.',
      universityCodeRequired: 'الكود الجامعي مطلوب.',
      universityCodeInvalid: 'الكود الجامعي يجب أن يتكون من 7 أرقام.',
      success: 'تم تفعيل وصولك السريع وإضافة 3 أرصدة.',
      authError: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
    };
  }

  return {
    eyebrow: 'Faculty Fast Access',
    title: 'Complete your Fast Access',
    subtitle: 'Add your full name and university code to activate your 3 starter credits.',
    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Your full name',
    universityCodeLabel: 'University code',
    universityCodePlaceholder: '7 digits',
    submit: 'Activate Access',
    helper: 'Required to continue with Faculty Fast Access.',
    fullNameRequired: 'Full name is required.',
    universityCodeRequired: 'University code is required.',
    universityCodeInvalid: 'University code must be exactly 7 digits.',
    success: 'Fast Access activated. Your 3 credits are ready.',
    authError: 'Your session expired. Please sign in again.',
  };
}

export const FastAccessProfileCompletionModal: React.FC = () => {
  const { user, notify } = useAuth();
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const copy = React.useMemo(() => deriveCopy(isArabic), [isArabic]);
  const isOpen = isFacultyFastAccessUser(user) && isFastAccessProfileCompletionPending(user);

  const [fullName, setFullName] = React.useState('');
  const [universityCode, setUniversityCode] = React.useState('');
  const [errors, setErrors] = React.useState<{ fullName?: string; universityCode?: string }>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFullName((user?.name || '').trim() === 'CU Science Student' ? '' : (user?.name || ''));
    setUniversityCode(user?.universityCode || '');
    setErrors({});
  }, [isOpen, user?.name, user?.universityCode]);

  const handleSubmit = async () => {
    const nextErrors: { fullName?: string; universityCode?: string } = {};
    const normalizedFullName = fullName.trim();
    const normalizedUniversityCode = universityCode.replace(/\D/g, '').slice(0, 7);

    if (!normalizedFullName) {
      nextErrors.fullName = copy.fullNameRequired;
    }

    if (!normalizedUniversityCode) {
      nextErrors.universityCode = copy.universityCodeRequired;
    } else if (!/^\d{7}$/.test(normalizedUniversityCode)) {
      nextErrors.universityCode = copy.universityCodeInvalid;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error(copy.authError);
      }

      await completeFacultyScienceFastAccessProfile(token, {
        profile: {
          fullName: normalizedFullName,
          universityCode: normalizedUniversityCode,
        },
      });

      notify.success(copy.success);
    } catch (error: any) {
      notify.error(error?.message || copy.authError);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => undefined}
      flowId={REQUIRED_ACCOUNT_COMPLETION_FLOW_ID}
      flowPriority={POPUP_FLOW_PRIORITY.requiredAction}
      canPreempt
      hideCloseButton
      closeOnBackdropClick={false}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300">
            <Sparkles size={12} />
            {copy.eyebrow}
          </div>
          <div>
            <h3 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {copy.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {copy.subtitle}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              {copy.fullNameLabel}
            </label>
            <div className="relative">
              <UserIcon className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
              <input
                type="text"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value.slice(0, 120));
                  setErrors((current) => ({ ...current, fullName: undefined }));
                }}
                className={cn(
                  'w-full rounded-2xl border bg-white py-3.5 ps-12 pe-4 text-sm font-medium text-zinc-900 outline-none transition-all focus:border-emerald-500 dark:bg-zinc-950/70 dark:text-zinc-100',
                  errors.fullName ? 'border-red-300 dark:border-red-700' : 'border-zinc-200 dark:border-zinc-800'
                )}
                placeholder={copy.fullNamePlaceholder}
              />
            </div>
            {errors.fullName ? (
              <p className="text-[10px] font-bold text-red-500">{errors.fullName}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              {copy.universityCodeLabel}
            </label>
            <div className="relative">
              <Building2 className="absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={18} />
              <input
                type="text"
                value={universityCode}
                onChange={(event) => {
                  setUniversityCode(event.target.value.replace(/\D/g, '').slice(0, 7));
                  setErrors((current) => ({ ...current, universityCode: undefined }));
                }}
                className={cn(
                  'w-full rounded-2xl border bg-white py-3.5 ps-12 pe-4 text-sm font-medium text-zinc-900 outline-none transition-all focus:border-emerald-500 dark:bg-zinc-950/70 dark:text-zinc-100',
                  errors.universityCode ? 'border-red-300 dark:border-red-700' : 'border-zinc-200 dark:border-zinc-800'
                )}
                placeholder={copy.universityCodePlaceholder}
                inputMode="numeric"
              />
            </div>
            {errors.universityCode ? (
              <p className="text-[10px] font-bold text-red-500">{errors.universityCode}</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
          {copy.helper}
        </div>

        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} className={cn(isArabic && 'rotate-180')} />}
          {copy.submit}
        </button>
      </div>
    </Modal>
  );
};
