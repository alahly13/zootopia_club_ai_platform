import * as React from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { useDocument } from '../contexts/DocumentContext';
import { cn } from '../utils';
import { useLanguage } from '../contexts/LanguageContext';
import UploadedFileSummaryCard from './UploadedFileSummaryCard';

interface DocumentSummaryPanelProps {
  title?: string;
  statusLabel?: string;
  showActions?: boolean;
  onUploadAnother?: () => void;
  onRemove?: () => void;
  className?: string;
}

/**
 * Shared document-summary presenter for every document-aware surface.
 *
 * The visibility toggle is intentionally shared through DocumentContext so the
 * uploaded-file card behaves consistently across dashboard, analysis, chat,
 * study, and infographic flows without each page inventing its own collapse
 * state for the same uploaded file.
 */
const DocumentSummaryPanel: React.FC<DocumentSummaryPanelProps> = ({
  title,
  statusLabel,
  showActions = false,
  onUploadAnother,
  onRemove,
  className,
}) => {
  const { t } = useLanguage();
  const {
    hasDocument,
    fileName,
    fileSizeBytes,
    fileMimeType,
    uploadedAt,
    isDocumentSummaryVisible,
    toggleDocumentSummaryVisible,
  } = useDocument();

  if (!hasDocument) {
    return null;
  }

  if (!isDocumentSummaryVisible) {
    return (
      <div
        className={cn(
          'rounded-[1.35rem] border border-zinc-200/80 bg-white/90 px-3 py-2.5 shadow-sm shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/50',
          className
        )}
      >
        {/*
          Collapsed mode intentionally shrinks to a filename-only bar so the
          dashboard can preserve vertical room for the primary assessment flow.
        */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <FileText size={16} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-zinc-900 dark:text-white" title={fileName}>
                {fileName || t('uploadUI.defaultDocumentName')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleDocumentSummaryVisible}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <ChevronDown size={14} />
            <span>{t('expand')}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <UploadedFileSummaryCard
      fileName={fileName || t('uploadUI.defaultDocumentName')}
      fileSizeBytes={fileSizeBytes}
      mimeType={fileMimeType}
      uploadedAt={uploadedAt}
      title={title}
      statusLabel={statusLabel}
      showActions={showActions}
      onUploadAnother={onUploadAnother}
      onRemove={onRemove}
      onToggleVisibility={toggleDocumentSummaryVisible}
      className={className}
    />
  );
};

export default DocumentSummaryPanel;
