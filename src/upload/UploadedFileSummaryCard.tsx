import * as React from 'react';
import { BadgeCheck, ChevronUp, FileText, RefreshCcw, Trash2 } from 'lucide-react';
import { cn } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';

interface UploadedFileSummaryCardProps {
  fileName: string;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  uploadedAt?: string | null;
  title?: string;
  statusLabel?: string;
  showActions?: boolean;
  onUploadAnother?: () => void;
  onRemove?: () => void;
  onToggleVisibility?: () => void;
  className?: string;
}

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel': 'XLS',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WEBP',
};

export function formatFileSize(fileSizeBytes?: number | null): string {
  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = fileSizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatFileType(fileName: string, mimeType?: string | null): string {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType && MIME_LABELS[normalizedMimeType]) {
    return MIME_LABELS[normalizedMimeType];
  }

  const extension = fileName.split('.').pop()?.trim().toUpperCase();
  return extension || '--';
}

function formatUploadTime(uploadedAt?: string | null): string | null {
  if (!uploadedAt) {
    return null;
  }

  const date = new Date(uploadedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Shared uploaded-file summary shell for document-aware tool surfaces.
 *
 * Keep this component presentation-only:
 * - document ownership stays in DocumentContext
 * - upload/remove orchestration stays in the page that owns the flow
 * - selectors and tool UIs consume canonical metadata from the shared document state
 */
const UploadedFileSummaryCard: React.FC<UploadedFileSummaryCardProps> = ({
  fileName,
  fileSizeBytes,
  mimeType,
  uploadedAt,
  title,
  statusLabel,
  showActions = false,
  onUploadAnother,
  onRemove,
  onToggleVisibility,
  className,
}) => {
  const { t } = useLanguage();
  const uploadedTimeLabel = formatUploadTime(uploadedAt);
  const detailItems = [
    { label: t('uploadUI.fileTypeLabel', { defaultValue: 'File type' }), value: formatFileType(fileName, mimeType) },
    { label: t('uploadUI.fileSizeLabel', { defaultValue: 'File size' }), value: formatFileSize(fileSizeBytes) },
    ...(uploadedTimeLabel
      ? [{ label: t('uploadUI.uploadTimeLabel', { defaultValue: 'Uploaded' }), value: uploadedTimeLabel }]
      : []),
  ] as const;

  return (
    <div
      className={cn(
        'rounded-[1.75rem] border border-zinc-200/80 bg-white/92 p-4 shadow-lg shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/90 dark:bg-zinc-950/60 sm:p-5',
        className
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 ring-1 ring-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
              <FileText size={22} />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-400">
                  {title || t('uploadUI.documentAttached', { defaultValue: 'Document attached' })}
                </p>
                {statusLabel ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck size={12} />
                    {statusLabel}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-sm font-black text-zinc-900 dark:text-white sm:text-base" title={fileName}>
                {fileName}
              </p>
            </div>
          </div>

          {onToggleVisibility ? (
            <button
              type="button"
              onClick={onToggleVisibility}
              className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <ChevronUp size={14} />
              <span>{t('collapse')}</span>
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {detailItems.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-zinc-200/80 bg-zinc-50/90 px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/60"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                {item.label}
              </p>
              <p className="mt-1 truncate text-sm font-bold text-zinc-900 dark:text-white" title={item.value}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {showActions ? (
          <div className="flex flex-col gap-3 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80 sm:flex-row">
            <button
              type="button"
              onClick={onUploadAnother}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500"
            >
              <RefreshCcw size={16} />
              <span>{t('uploadUI.uploadAnother', { defaultValue: 'Upload another file' })}</span>
            </button>

            <button
              type="button"
              onClick={onRemove}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Trash2 size={16} />
              <span>{t('uploadUI.removeFile', { defaultValue: 'Remove file' })}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default UploadedFileSummaryCard;
