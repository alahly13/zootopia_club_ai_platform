import * as React from 'react';
import { BadgeCheck, CircleAlert, FileText, LoaderCircle } from 'lucide-react';
import { useDocument } from '../contexts/DocumentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../utils';
import { formatFileSize, formatFileType } from './UploadedFileSummaryCard';

type CompactDocumentInfoBarTone = 'success' | 'warning' | 'error' | 'neutral';

interface CompactDocumentInfoBarProps {
  statusLabel?: string;
  statusTone?: CompactDocumentInfoBarTone;
  actions?: React.ReactNode;
  className?: string;
}

const STATUS_TONE_STYLES: Record<CompactDocumentInfoBarTone, string> = {
  success:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning:
    'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  error: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
  neutral: 'border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
};

/**
 * Lightweight metadata bar for document-aware tools.
 *
 * This intentionally avoids the heavier summary-card layout so pages that
 * already have their own controls can keep the uploaded-file context visible
 * without spending a large amount of vertical space.
 */
const CompactDocumentInfoBar: React.FC<CompactDocumentInfoBarProps> = ({
  statusLabel,
  statusTone = 'success',
  actions,
  className,
}) => {
  const { t } = useLanguage();
  const { hasDocument, fileName, fileSizeBytes, fileMimeType } = useDocument();

  if (!hasDocument) {
    return null;
  }

  const resolvedFileName = fileName || t('uploadUI.defaultDocumentName');
  const fileType = formatFileType(resolvedFileName, fileMimeType);
  const fileSize = formatFileSize(fileSizeBytes);
  const StatusIcon =
    statusTone === 'error'
      ? CircleAlert
      : statusTone === 'warning'
        ? LoaderCircle
        : BadgeCheck;

  return (
    <div
      className={cn(
        'rounded-[1.6rem] border border-zinc-200/80 bg-white/92 px-4 py-3 shadow-sm shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/60 sm:px-5',
        className
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
            <FileText size={18} />
          </div>

          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
              {t('uploadUI.documentAttached', { defaultValue: 'Document attached' })}
            </p>
            <p
              className="truncate text-sm font-black text-zinc-900 dark:text-white sm:text-[15px]"
              title={resolvedFileName}
            >
              {resolvedFileName}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {t('uploadUI.fileTypeLabel', { defaultValue: 'File type' })}: {fileType}
          </span>
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            {t('uploadUI.fileSizeLabel', { defaultValue: 'File size' })}: {fileSize}
          </span>

          {statusLabel ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em]',
                STATUS_TONE_STYLES[statusTone]
              )}
            >
              <StatusIcon size={12} className={statusTone === 'warning' ? 'animate-spin' : undefined} />
              <span>{statusLabel}</span>
            </span>
          ) : null}

          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
};

export default CompactDocumentInfoBar;
