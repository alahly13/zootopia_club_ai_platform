import * as React from 'react';
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileStack, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { cn } from '../utils';
import { logger } from '../utils/logger';
import { useAuth } from '../auth/AuthContext';
import { useStatus } from '../hooks/useStatus';
import { StatusIndicator } from '../components/status/StatusIndicator';
import { StatusCard } from '../components/status/StatusCard';
import { LoadingOverlay } from '../components/status/LoadingOverlay';
import { useLanguage } from '../contexts/LanguageContext';
import { ProgressTracker } from '../components/status/ProgressTracker';
import { Stage } from '../types/status';
import { DOCUMENT_UPLOAD_ACCEPT } from './documentFilePolicy';

interface FileUploaderProps {
  onFileSelect: (file: File) => Promise<void> | void;
  isLoading?: boolean;
  stages?: Stage[];
  elapsedTime?: number;
}

/**
 * Upload entry surface only.
 *
 * The uploaded-file summary intentionally lives outside this component so the
 * same presentation can be reused across Dashboard, assessment, and other
 * document-aware tool pages without duplicating local uploader state.
 */
const FileUploader: React.FC<FileUploaderProps> = ({
  onFileSelect,
  isLoading: externalLoading,
  stages,
  elapsedTime = 0,
}) => {
  const { notify } = useAuth();
  const { t } = useLanguage();
  const { status, message, error, setError, isLoading, isError, reset } = useStatus();
  const isBusy = externalLoading || isLoading;

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length < 1) {
      return;
    }

    const selectedFile = acceptedFiles[0];
    logger.info('File dropped', { fileName: selectedFile.name });
    reset();
    await Promise.resolve(onFileSelect(selectedFile));
  }, [onFileSelect, reset]);

  const onDropRejected = useCallback(() => {
    const translatedError = new Error(t('uploadUI.errorDropRejected'));
    setError(translatedError);
    notify.error(translatedError.message);
  }, [notify, setError, t]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    onDropRejected,
    multiple: false,
    disabled: externalLoading || isLoading,
    accept: DOCUMENT_UPLOAD_ACCEPT,
  });

  const headline = externalLoading
    ? t('uploadUI.uploadHeroUploadingTitle', { defaultValue: 'Preparing your file' })
    : isDragActive
      ? t('uploadUI.uploadHeroDraggingTitle', { defaultValue: 'Drop the file to start' })
      : t('uploadUI.uploadHeroIdleTitle', { defaultValue: 'اسحب ملف المحاضرة أو ارفعه الآن' });

  const description = externalLoading
    ? t('uploadUI.uploadHeroUploadingHint', {
        defaultValue: 'We are extracting the lecture content so the next actions can unlock smoothly.',
      })
    : isDragActive
      ? t('uploadUI.uploadHeroDraggingHint', {
          defaultValue: 'Release the file here and we will prepare it for summarization and question generation.',
        })
      : t('uploadUI.uploadHeroIdleHint', {
          defaultValue: 'ابدأ برفع ملف المحاضرة، ثم اختر هل تريد تلخيصها أو توليد أسئلتك مباشرة.',
        });

  const supportedFormatBadges = ['PDF', 'DOCX', 'XLSX', 'TXT', 'CSV', 'PNG/JPG'];

  return (
    <div className="relative space-y-6">
      {!externalLoading ? (
        <div className="mb-2 flex items-center">
          <StatusIndicator status={status} message={message} />
        </div>
      ) : null}

      {isError ? (
        <StatusCard
          status={status}
          title={t('uploadUI.issueTitle')}
          message={error?.message}
          onDismiss={reset}
        />
      ) : null}

      <div
        {...getRootProps()}
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center gap-5 overflow-hidden rounded-[2.4rem] border-2 border-dashed px-6 py-8 transition-all active:scale-[0.99] sm:px-8 sm:py-10',
          isDragActive
            ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.15)]'
            : 'border-zinc-200 bg-white/92 shadow-[0_18px_50px_rgba(15,23,42,0.08)] hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-950/72 dark:hover:border-zinc-700'
        )}
      >
        <LoadingOverlay isVisible={isLoading} message={message} />
        <input {...getInputProps()} />
        <p className="sr-only" aria-live="polite">
          {headline}
        </p>

        {externalLoading ? (
          <div className="w-full max-w-3xl space-y-5">
            <div className="mx-auto max-w-2xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                <Sparkles size={14} />
                <span>{headline}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-base">
                {description}
              </p>
            </div>
            <ProgressTracker
              stages={stages || []}
              isVisible
              elapsedTime={elapsedTime}
              title={t('uploadUI.pipelineTitle')}
            />
          </div>
        ) : (
          <>
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_60%)] opacity-80" />

            <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-zinc-100 text-zinc-500 shadow-inner dark:bg-zinc-900 dark:text-zinc-300">
              {isDragActive ? <FileStack size={34} /> : <Upload size={34} />}
            </div>

            <div className="relative z-10 max-w-2xl space-y-3 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <ShieldCheck size={13} />
                <span>
                  {t('uploadUI.uploadFormatsSummary', {
                    defaultValue: 'Secure upload for lectures, sheets, and study documents',
                  })}
                </span>
              </div>

              <p className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
                {headline}
              </p>
              <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-base">
                {description}
              </p>
            </div>

            <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
              {supportedFormatBadges.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white/80 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-300"
                >
                  {badge}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                open();
              }}
              className="relative z-10 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500"
              disabled={isBusy}
            >
              <Upload size={16} />
              <span>{t('uploadUI.uploadNew')}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FileUploader;
