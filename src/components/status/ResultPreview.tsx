import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ArrowUpRight,
  Download,
  Eye,
  FileImage,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Printer,
  Share2,
  Sparkles,
  TableProperties,
  X,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import { HeaderLogo } from '../HeaderLogo';
import { WhatsAppFooter } from '../WhatsAppFooter';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../themes/ThemeProvider';
import { usePopupBlocker } from '../../contexts/PopupOrchestratorContext';
import { POPUP_FLOW_PRIORITY, RESULT_PREVIEW_FLOW_ID } from '../../constants/popupFlows';
import { QR_CODE_DATA_URL } from '../../utils/branding';
import { getDocumentBackgroundStyle } from '../../utils/documentBackgrounds';
import { COPYRIGHT, cn } from '../../utils';
import {
  ExportThemeMode,
  exportTextToPDF,
  exportToPDF,
  type ExportMetadataItem,
} from '../../utils/exporters';
import { buildDownloadFileName, downloadUrlToFile } from '../../utils/fileDownloads';
import {
  exportPreviewToDocx,
  exportPreviewToImage,
  exportPreviewToMarkdown,
  exportPreviewToPdf,
} from '../../services/resultExportService';
import { ResultPreviewContent } from './ResultPreviewContent';
import {
  getMediaMarkdownExport,
  getPreviewAssetUrl,
  normalizeResultPreview,
  ResultPreviewType,
} from './resultPreviewModel';
import { openDetachedResultPreview } from './resultPreviewStorage';

interface ResultPreviewBaseProps {
  title: string;
  data: unknown;
  type: ResultPreviewType;
  topicImage?: string | null;
  sourceTool?: string | null;
  createdAt?: unknown;
  previewThemeMode?: ExportThemeMode;
  /**
   * Kept for backward compatibility with existing callers.
   * The shared viewer now renders from serializable `data` so detached preview,
   * history replay, and export flows all stay aligned.
   */
  content?: React.ReactNode;
}

interface ResultPreviewProps extends ResultPreviewBaseProps {
  isOpen: boolean;
  onClose: () => void;
  onPreviewThemeModeChange?: (mode: ExportThemeMode) => void;
}

interface ResultPreviewShellProps extends ResultPreviewBaseProps {
  mode?: 'dialog' | 'page';
  onClose: () => void;
  onPreviewThemeModeChange?: (mode: ExportThemeMode) => void;
}

const typeIconMap: Record<ResultPreviewType, React.ReactNode> = {
  quiz: <TableProperties size={20} />,
  infographic: <FileImage size={20} />,
  text: <FileText size={20} />,
  image: <ImageIcon size={20} />,
  video: <FileVideo size={20} />,
};

const typeToneMap: Record<ResultPreviewType, string> = {
  quiz: 'text-emerald-500 bg-emerald-500/10',
  infographic: 'text-cyan-500 bg-cyan-500/10',
  text: 'text-violet-500 bg-violet-500/10',
  image: 'text-amber-500 bg-amber-500/10',
  video: 'text-rose-500 bg-rose-500/10',
};

function getAssetExtension(assetUrl: string | null, type: ResultPreviewType) {
  if (!assetUrl) {
    return type === 'video' ? 'mp4' : 'png';
  }

  const match = assetUrl.match(/\.([a-z0-9]{2,5})(?:[\?#]|$)/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }

  return type === 'video' ? 'mp4' : 'png';
}

async function downloadAsset(assetUrl: string, fileName: string) {
  return downloadUrlToFile({
    url: assetUrl,
    fileName,
    context: {
      area: 'result-preview',
      event: 'download-preview-asset',
    },
  });
}

const PREVIEW_THEME_STORAGE_PREFIX = 'zootopia_preview_theme:';

function createPreviewThemeStorageKey(sourceTool?: string | null, type?: ResultPreviewType): string {
  const seed = (sourceTool || type || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-');

  return `${PREVIEW_THEME_STORAGE_PREFIX}${seed}`;
}

function readStoredPreviewThemeMode(storageKey: string, fallbackMode: ExportThemeMode): ExportThemeMode {
  if (typeof window === 'undefined') {
    return fallbackMode;
  }

  const stored = window.localStorage.getItem(storageKey);
  return stored === 'dark' || stored === 'light' ? stored : fallbackMode;
}

function persistPreviewThemeMode(storageKey: string, mode: ExportThemeMode) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, mode);
}

export function resolvePreferredPreviewThemeMode(input: {
  sourceTool?: string | null;
  type: ResultPreviewType;
  previewThemeMode?: ExportThemeMode;
  fallbackMode?: ExportThemeMode;
}): ExportThemeMode {
  if (input.previewThemeMode) {
    return input.previewThemeMode;
  }

  const storageKey = createPreviewThemeStorageKey(input.sourceTool, input.type);
  return readStoredPreviewThemeMode(storageKey, input.fallbackMode ?? 'light');
}

export function useResultPreviewThemeMode(input: {
  sourceTool?: string | null;
  type: ResultPreviewType;
  fallbackMode?: ExportThemeMode;
}) {
  const { isDarkMode } = useTheme();
  const previewThemeStorageKey = useMemo(
    () => createPreviewThemeStorageKey(input.sourceTool, input.type),
    [input.sourceTool, input.type]
  );
  const fallbackMode = input.fallbackMode ?? (isDarkMode ? 'dark' : 'light');
  const [previewThemeMode, setPreviewThemeModeState] = useState<ExportThemeMode>(() =>
    readStoredPreviewThemeMode(previewThemeStorageKey, fallbackMode)
  );

  React.useEffect(() => {
    // Preview mode and export mode share the same persisted key so page-level
    // result theming, modal preview, detached preview, and download stay synced.
    setPreviewThemeModeState(readStoredPreviewThemeMode(previewThemeStorageKey, fallbackMode));
  }, [fallbackMode, previewThemeStorageKey]);

  const setPreviewThemeMode = React.useCallback(
    (modeValue: ExportThemeMode) => {
      persistPreviewThemeMode(previewThemeStorageKey, modeValue);
      setPreviewThemeModeState(modeValue);
    },
    [previewThemeStorageKey]
  );

  return [previewThemeMode, setPreviewThemeMode] as const;
}

export const ResultPreviewShell: React.FC<ResultPreviewShellProps> = ({
  title,
  data,
  type,
  topicImage,
  sourceTool,
  createdAt,
  previewThemeMode,
  onClose,
  onPreviewThemeModeChange,
  mode = 'dialog',
}) => {
  const { t } = useLanguage();
  const { isDarkMode } = useTheme();
  const exportRef = useRef<HTMLDivElement>(null);
  const [activeExportAction, setActiveExportAction] = useState<
    'pdf' | 'docx' | 'markdown' | 'asset' | 'image' | null
  >(null);
  const previewThemeStorageKey = useMemo(
    () => createPreviewThemeStorageKey(sourceTool, type),
    [sourceTool, type]
  );
  const [localPreviewThemeMode, setLocalPreviewThemeMode] = useState<ExportThemeMode>(() =>
    readStoredPreviewThemeMode(previewThemeStorageKey, isDarkMode ? 'dark' : 'light')
  );

  const effectivePreviewThemeMode = previewThemeMode ?? localPreviewThemeMode;
  // Keep the file-background treatment centralized at the shared preview shell so
  // modal preview, detached preview, print, and snapshot exports stay visually aligned.
  const previewDocumentBackgroundStyle = useMemo(
    () =>
      getDocumentBackgroundStyle(effectivePreviewThemeMode, {
        overlayOpacity: effectivePreviewThemeMode === 'dark' ? 0.8 : 0.88,
      }),
    [effectivePreviewThemeMode]
  );
  const exportDocumentBackgroundStyle = useMemo(
    () =>
      getDocumentBackgroundStyle(effectivePreviewThemeMode, {
        overlayOpacity: effectivePreviewThemeMode === 'dark' ? 0.84 : 0.92,
      }),
    [effectivePreviewThemeMode]
  );

  React.useEffect(() => {
    if (previewThemeMode) return;
    setLocalPreviewThemeMode(readStoredPreviewThemeMode(previewThemeStorageKey, isDarkMode ? 'dark' : 'light'));
  }, [isDarkMode, previewThemeMode, previewThemeStorageKey]);

  const setPreviewThemeMode = React.useCallback(
    (modeValue: ExportThemeMode) => {
      if (onPreviewThemeModeChange) {
        onPreviewThemeModeChange(modeValue);
        return;
      }
      persistPreviewThemeMode(previewThemeStorageKey, modeValue);
      setLocalPreviewThemeMode(modeValue);
    },
    [onPreviewThemeModeChange, previewThemeStorageKey]
  );

  const preview = useMemo(
    () =>
      normalizeResultPreview({
        title,
        type,
        data,
        topicImage,
        sourceTool,
        createdAt,
      }),
    [createdAt, data, sourceTool, title, topicImage, type]
  );

  const assetUrl = getPreviewAssetUrl(preview);
  const markdownExport = getMediaMarkdownExport(preview);
  const assetExtension = assetUrl ? getAssetExtension(assetUrl, preview.type) : null;
  const canExportDocx = type === 'quiz' && Boolean(preview.quiz);
  const canExportMarkdown = Boolean(markdownExport && preview.type !== 'image' && preview.type !== 'video');
  const canExportImage = preview.type === 'infographic';
  const canQuickAssetDownload = Boolean(assetUrl);

  const runExportAction = React.useCallback(
    async (input: {
      action: 'pdf' | 'docx' | 'markdown' | 'asset' | 'image';
      loadingMessage: string;
      successMessage: string;
      failureMessage: string;
      task: () => Promise<boolean>;
    }) => {
      if (activeExportAction) {
        return false;
      }

      setActiveExportAction(input.action);
      const toastId = toast.loading(input.loadingMessage);

      try {
        const didSucceed = await input.task();
        if (!didSucceed) {
          toast.error(input.failureMessage, { id: toastId });
          return false;
        }

        toast.success(input.successMessage, { id: toastId });
        return true;
      } catch {
        toast.error(input.failureMessage, { id: toastId });
        return false;
      } finally {
        setActiveExportAction((current) => (current === input.action ? null : current));
      }
    },
    [activeExportAction]
  );

  const handleExportPDF = async () => {
    await runExportAction({
      action: 'pdf',
      loadingMessage: t('preparingHighResExport', { defaultValue: 'Preparing high-resolution export...' }),
      successMessage: t('exportSuccessful', { defaultValue: 'Export completed successfully.' }),
      failureMessage: t('exportFailed', { defaultValue: 'Export failed.' }),
      task: () =>
        exportPreviewToPdf({
          preview,
          themeMode: effectivePreviewThemeMode,
          exportElement: exportRef.current,
          sourceTool,
        }),
    });
  };

  const handlePrint = async () => {
    if (!exportRef.current) return;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!printWindow) {
      toast.error(t('printWindowBlocked', { defaultValue: 'Unable to open the print window.' }));
      return;
    }

    const toastId = toast.loading(t('preparingPrintLayout', { defaultValue: 'Preparing print layout...' }));

    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: effectivePreviewThemeMode === 'dark' ? '#0a0f1d' : '#ffffff',
        windowWidth: 1440,
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const background = effectivePreviewThemeMode === 'dark' ? '#0a0f1d' : '#ffffff';
      const color = effectivePreviewThemeMode === 'dark' ? '#f4f4f5' : '#18181b';

      // Architecture-sensitive: print reuses the same themed export canvas so printed
      // output matches the selected preview mode instead of falling back to generic HTML.
      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>${preview.title}</title>
            <meta charset="utf-8" />
            <style>
              @page { margin: 16mm; }
              body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: ${background}; color: ${color}; }
              img { display: block; width: 100%; height: auto; }
              * { box-sizing: border-box; }
            </style>
          </head>
          <body>
            <img src="${imgData}" alt="${preview.title.replace(/"/g, '&quot;')}" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      toast.success(t('printReady', { defaultValue: 'Print layout is ready.' }), { id: toastId });
      setTimeout(() => printWindow.print(), 250);
    } catch (error) {
      console.error('Preview print preparation failed', error);
      printWindow.close();
      toast.error(t('printPreparationFailed', { defaultValue: 'Unable to prepare the print layout.' }), { id: toastId });
    }
  };

  const handleExportDocx = async () => {
    await runExportAction({
      action: 'docx',
      loadingMessage: t('preparingWordExport', { defaultValue: 'Preparing Word export...' }),
      successMessage: t('exportSuccessful', { defaultValue: 'Export completed successfully.' }),
      failureMessage: t('exportFailed', { defaultValue: 'Export failed.' }),
      task: () =>
        exportPreviewToDocx({
          preview,
          themeMode: effectivePreviewThemeMode,
          sourceTool,
        }),
    });
  };

  const handleExportMarkdown = async () => {
    await runExportAction({
      action: 'markdown',
      loadingMessage: t('preparingMarkdownExport', { defaultValue: 'Preparing Markdown export...' }),
      successMessage: t('exportSuccessful', { defaultValue: 'Export completed successfully.' }),
      failureMessage: t('exportFailed', { defaultValue: 'Export failed.' }),
      task: () =>
        exportPreviewToMarkdown({
          preview,
          themeMode: effectivePreviewThemeMode,
          sourceTool,
        }),
    });
  };

  const handleDownloadAsset = async () => {
    if (!assetUrl) return;

    await runExportAction({
      action: 'asset',
      loadingMessage: t('preparingDownload', { defaultValue: 'Preparing download...' }),
      successMessage: t('downloadReady', { defaultValue: 'Download started successfully.' }),
      failureMessage: t('downloadFailed', { defaultValue: 'Download failed.' }),
      task: () =>
        downloadAsset(
          assetUrl,
          buildDownloadFileName(preview.downloadFileStem, getAssetExtension(assetUrl, preview.type))
        ),
    });
  };

  const handleExportImage = async () => {
    await runExportAction({
      action: 'image',
      loadingMessage: t('preparingImageExport', { defaultValue: 'Preparing image export...' }),
      successMessage: t('downloadReady', { defaultValue: 'Download started successfully.' }),
      failureMessage: t('exportFailed', { defaultValue: 'Export failed.' }),
      task: () =>
        exportPreviewToImage({
          preview,
          themeMode: effectivePreviewThemeMode,
          exportElement: exportRef.current,
          sourceTool,
          format: 'png',
        }),
    });
  };

  const handleOpenDetached = () => {
    openDetachedResultPreview({
      title,
      type,
      data,
      topicImage,
      sourceTool,
      createdAt: typeof createdAt === 'string' ? createdAt : new Date().toISOString(),
      previewThemeMode: effectivePreviewThemeMode,
    });
  };

  const surface = (
    <div
      className={cn(
        'flex flex-col overflow-hidden border shadow-2xl backdrop-blur-xl',
        effectivePreviewThemeMode === 'dark'
          ? 'border-zinc-800 bg-zinc-950/95 shadow-zinc-950/40'
          : 'border-zinc-200/80 bg-white/95 shadow-zinc-950/10',
        mode === 'dialog'
          ? 'h-full max-h-[92vh] w-full max-w-[1480px] rounded-[2rem]'
          : 'min-h-[calc(100vh-3rem)] rounded-[2rem]'
      )}
    >
      <div className={cn(
        'border-b px-5 py-5 sm:px-6 lg:px-8',
        effectivePreviewThemeMode === 'dark'
          ? 'border-zinc-800 bg-zinc-950/80'
          : 'border-zinc-200/80 bg-white/80'
      )}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', typeToneMap[preview.type])}>
              {typeIconMap[preview.type]}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                  {t('premiumPreview', { defaultValue: 'Premium Preview' })}
                </span>
                <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  {preview.typeLabel}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
                    effectivePreviewThemeMode === 'dark'
                      ? 'border-zinc-700 bg-zinc-900 text-zinc-200'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-600'
                  )}
                >
                  <CheckCircle2 size={12} />
                  {effectivePreviewThemeMode === 'dark'
                    ? t('dark', { defaultValue: 'Dark' })
                    : t('light', { defaultValue: 'Light' })}
                </span>
              </div>
              <h2 className={cn(
                'mt-3 text-2xl font-black tracking-tight sm:text-3xl',
                effectivePreviewThemeMode === 'dark' ? 'text-white' : 'text-zinc-900'
              )} dir="auto">
                {preview.title}
              </h2>
              <p className={cn(
                'mt-2 max-w-3xl text-sm leading-relaxed',
                effectivePreviewThemeMode === 'dark' ? 'text-zinc-300' : 'text-zinc-600'
              )} dir="auto">
                {preview.summary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start">
            {mode === 'dialog' ? (
              <button
                onClick={handleOpenDetached}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ArrowUpRight size={16} />
                <span>{t('openSeparately', { defaultValue: 'Open Separately' })}</span>
              </button>
            ) : null}
            <button
              onClick={onClose}
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-500 transition-all hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className={cn(
        'flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8',
        effectivePreviewThemeMode === 'dark'
          ? 'bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900'
          : 'bg-gradient-to-b from-zinc-50 via-zinc-50 to-white'
      )}>
        <div className="mx-auto grid max-w-[1420px] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className={cn(
              'overflow-hidden rounded-[2rem] border shadow-sm',
              effectivePreviewThemeMode === 'dark' ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white'
            )} style={previewDocumentBackgroundStyle}>
              <div className={cn(
                'border-b px-5 py-4 sm:px-6',
                effectivePreviewThemeMode === 'dark' ? 'border-zinc-800' : 'border-zinc-200'
              )}>
                <div className={cn(
                  'flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em]',
                  effectivePreviewThemeMode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'
                )}>
                  <Eye size={16} className="text-emerald-500" />
                  <span>{t('preview', { defaultValue: 'Preview' })}</span>
                </div>
              </div>
              <div className="p-5 sm:p-6 lg:p-8">
                <ResultPreviewContent preview={preview} exportThemeMode={effectivePreviewThemeMode} />
              </div>
            </div>
          </div>

          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className={cn(
              'rounded-[1.75rem] border p-5 shadow-sm',
              effectivePreviewThemeMode === 'dark' ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white'
            )}>
              <div className={cn(
                'flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em]',
                effectivePreviewThemeMode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'
              )}>
                <Sparkles size={16} className="text-emerald-500" />
                <span>{t('viewerStatus', { defaultValue: 'Viewer Status' })}</span>
              </div>
              <p className={cn(
                'mt-4 text-sm leading-relaxed',
                effectivePreviewThemeMode === 'dark' ? 'text-zinc-300' : 'text-zinc-600'
              )}>
                {preview.hasStructuredContent
                  ? t('viewerReadyCopy', {
                      defaultValue:
                        'This preview is using the shared type-aware viewer, so detached pages and exports stay aligned with the main result surface.',
                    })
                  : t('viewerFallbackCopy', {
                      defaultValue:
                        'This result is being shown in fallback mode because its stored payload is incomplete or from an older format.',
                    })}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPreviewThemeMode('light')}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all',
                    effectivePreviewThemeMode === 'light'
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  )}
                >
                  {t('light', { defaultValue: 'Light' })}
                </button>
                <button
                  onClick={() => setPreviewThemeMode('dark')}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all',
                    effectivePreviewThemeMode === 'dark'
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  )}
                >
                  {t('dark', { defaultValue: 'Dark' })}
                </button>
              </div>
            </div>

            <div className={cn(
              'rounded-[1.75rem] border p-5 shadow-sm',
              effectivePreviewThemeMode === 'dark' ? 'border-zinc-800 bg-zinc-950' : 'border-zinc-200 bg-white'
            )}>
              <div className={cn(
                'flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em]',
                effectivePreviewThemeMode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'
              )}>
                <FileText size={16} className="text-emerald-500" />
                <span>{t('details', { defaultValue: 'Details' })}</span>
              </div>
              <div className="mt-4 space-y-3">
                {preview.metadata.length > 0 ? (
                  preview.metadata.map((item) => (
                    <div
                      key={`${item.label}-${item.value}`}
                      className={cn(
                        'rounded-2xl border px-4 py-3',
                        effectivePreviewThemeMode === 'dark'
                          ? 'border-zinc-800 bg-zinc-900'
                          : 'border-zinc-200 bg-zinc-50'
                      )}
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
                        {item.label}
                      </p>
                      <p className={cn(
                        'mt-1 text-sm font-semibold',
                        effectivePreviewThemeMode === 'dark' ? 'text-zinc-100' : 'text-zinc-800'
                      )} dir="auto">
                        {item.value}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t('noMetadataAvailable', { defaultValue: 'No additional metadata available for this result.' })}
                  </p>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className={cn(
        'border-t px-5 py-4 sm:px-6 lg:px-8',
        effectivePreviewThemeMode === 'dark'
          ? 'border-zinc-800 bg-zinc-950/90'
          : 'border-zinc-200 bg-white/90'
      )}>
        <div className="mx-auto flex max-w-[1420px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Printer size={16} />
              <span>{t('print', { defaultValue: 'Print' })}</span>
            </button>

            {canExportMarkdown ? (
              <button
                onClick={handleExportMarkdown}
                disabled={Boolean(activeExportAction)}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {activeExportAction === 'markdown' ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                <span>
                  {activeExportAction === 'markdown'
                    ? t('exporting', { defaultValue: 'Exporting' })
                    : t('markdown', { defaultValue: 'Markdown' })}
                </span>
              </button>
            ) : null}

            {canQuickAssetDownload ? (
              <button
                onClick={handleDownloadAsset}
                disabled={Boolean(activeExportAction)}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-600 transition-all hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {activeExportAction === 'asset' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span>
                  {activeExportAction === 'asset'
                    ? t('preparing', { defaultValue: 'Preparing' })
                    : preview.type === 'image'
                      ? t('downloadImageFile', {
                          defaultValue: `Download ${(assetExtension || 'png').toUpperCase()}`,
                        })
                      : preview.type === 'video'
                        ? t('downloadVideoFile', {
                            defaultValue: `Download ${(assetExtension || 'mp4').toUpperCase()}`,
                          })
                        : t('downloadAsset', { defaultValue: 'Download Asset' })}
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canExportImage ? (
              <button
                onClick={handleExportImage}
                disabled={Boolean(activeExportAction)}
                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-cyan-600 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-cyan-300"
              >
                {activeExportAction === 'image' ? <Loader2 size={16} className="animate-spin" /> : <FileImage size={16} />}
                <span>
                  {activeExportAction === 'image'
                    ? t('exporting', { defaultValue: 'Exporting' })
                    : t('downloadPng', { defaultValue: 'Download PNG' })}
                </span>
              </button>
            ) : null}

            {canExportDocx ? (
              <button
                onClick={handleExportDocx}
                disabled={Boolean(activeExportAction)}
                className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-sky-600 transition-all hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-300"
              >
                {activeExportAction === 'docx' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                <span>
                  {activeExportAction === 'docx'
                    ? t('exporting', { defaultValue: 'Exporting' })
                    : t('wordExport', { defaultValue: 'Word Export' })}
                </span>
              </button>
            ) : null}

            <button
              onClick={handleExportPDF}
              disabled={Boolean(activeExportAction)}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {activeExportAction === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              <span>
                {activeExportAction === 'pdf'
                  ? t('exporting', { defaultValue: 'Exporting' })
                  : t('downloadPDF', { defaultValue: 'Download PDF' })}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="fixed left-[-10000px] top-[-10000px]">
        <div
          ref={exportRef}
          className={cn(
            'w-[1180px] p-12',
            effectivePreviewThemeMode === 'dark' ? 'bg-[#0a0f1d] text-zinc-100' : 'bg-white text-zinc-900'
          )}
          style={exportDocumentBackgroundStyle}
        >
          <div className="flex items-center justify-between border-b-4 border-emerald-500 pb-8">
            <div className="flex items-center gap-4">
              <HeaderLogo iconClassName="w-10 h-10" />
              <div>
                <h1 className={cn(
                  'text-4xl font-black tracking-tight',
                  effectivePreviewThemeMode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'
                )}>
                  ZOOTOPIA<span className="text-emerald-600">CLUB</span>
                </h1>
                <p className="mt-1 text-sm font-bold uppercase tracking-[0.24em] text-emerald-600">
                  {preview.typeLabel} Preview
                </p>
              </div>
            </div>

            <div className="text-right">
              <img src={QR_CODE_DATA_URL} alt="QR Code" className="ms-auto h-14 w-14 rounded-xl border border-zinc-200 bg-white p-1" />
              <p className="mt-3 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">
                {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="mt-10">
            <div className={cn(
              'mb-8 rounded-[2rem] border p-6',
              effectivePreviewThemeMode === 'dark' ? 'border-zinc-700 bg-zinc-900/70' : 'border-zinc-200 bg-zinc-50'
            )}>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-zinc-400">
                Export Summary
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight">{preview.title}</h2>
              <p className={cn(
                'mt-3 max-w-4xl text-base leading-relaxed',
                effectivePreviewThemeMode === 'dark' ? 'text-zinc-300' : 'text-zinc-600'
              )}>{preview.summary}</p>
            </div>

            <ResultPreviewContent preview={preview} exportThemeMode={effectivePreviewThemeMode} />
          </div>

          <div className="mt-12 flex items-center justify-between border-t border-zinc-200 pt-6 text-xs text-zinc-500">
            <div className="flex items-center gap-3">
              <Sparkles size={16} className="text-emerald-500" />
              <span className="font-black uppercase tracking-[0.2em]">{COPYRIGHT}</span>
            </div>
            <div className="text-right">
              <p className="font-black uppercase tracking-[0.2em] text-emerald-600">
                Verified by Zootopia Club
              </p>
              <div className="mt-2">
                <WhatsAppFooter />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return surface;
};

export const ResultPreview: React.FC<ResultPreviewProps> = ({
  isOpen,
  onClose,
  onPreviewThemeModeChange,
  ...rest
}) => {
  const { isDarkMode } = useTheme();
  const isControlledMode = typeof rest.previewThemeMode === 'string';
  const previewThemeStorageKey = useMemo(
    () => createPreviewThemeStorageKey(rest.sourceTool, rest.type),
    [rest.sourceTool, rest.type]
  );
  const [localPreviewThemeMode, setLocalPreviewThemeMode] = useState<ExportThemeMode>(() =>
    readStoredPreviewThemeMode(previewThemeStorageKey, isDarkMode ? 'dark' : 'light')
  );
  const previewThemeMode = isControlledMode
    ? (rest.previewThemeMode as ExportThemeMode)
    : localPreviewThemeMode;

  usePopupBlocker({
    id: `${RESULT_PREVIEW_FLOW_ID}:${rest.sourceTool || rest.type}`,
    isActive: isOpen,
    priority: POPUP_FLOW_PRIORITY.criticalBlocking,
  });

  React.useEffect(() => {
    if (!isOpen) return;
    if (isControlledMode) return;
    setLocalPreviewThemeMode(readStoredPreviewThemeMode(previewThemeStorageKey, isDarkMode ? 'dark' : 'light'));
  }, [isControlledMode, isOpen, isDarkMode, previewThemeStorageKey]);

  const handlePreviewThemeModeChange = React.useCallback(
    (modeValue: ExportThemeMode) => {
      if (!isControlledMode) {
        // Preview mode is intentionally tool-scoped instead of app-global so a
        // user can keep, for example, image previews dark while study notes stay light.
        persistPreviewThemeMode(previewThemeStorageKey, modeValue);
        setLocalPreviewThemeMode(modeValue);
      }

      onPreviewThemeModeChange?.(modeValue);
    },
    [isControlledMode, onPreviewThemeModeChange, previewThemeStorageKey]
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="preview-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6"
        >
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-950/75 backdrop-blur-md"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 18 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 h-full max-h-[92vh] w-full max-w-[1480px]"
          >
            <ResultPreviewShell
              {...rest}
              onClose={onClose}
              previewThemeMode={previewThemeMode}
              onPreviewThemeModeChange={handlePreviewThemeModeChange}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
};

export function quickDownloadResultPreview(input: ResultPreviewBaseProps) {
  const preview = normalizeResultPreview(input);
  const themeMode = resolvePreferredPreviewThemeMode({
    sourceTool: input.sourceTool,
    type: input.type,
    previewThemeMode: input.previewThemeMode,
  });

  if (preview.type === 'quiz' && preview.quiz) {
    exportToPDF(preview.quiz, preview.topicImage, {
      themeMode,
      summary: preview.summary,
      metadata: preview.metadata as ExportMetadataItem[],
    });
    return true;
  }

  if (preview.type === 'text') {
    exportTextToPDF(preview.title, preview.plainTextExport, {
      themeMode,
      summary: preview.summary,
      metadata: preview.metadata as ExportMetadataItem[],
    });
    return true;
  }

  const assetUrl = getPreviewAssetUrl(preview);
  if (assetUrl) {
    void downloadAsset(
      assetUrl,
      buildDownloadFileName(preview.downloadFileStem, getAssetExtension(assetUrl, preview.type))
    );
    return true;
  }

  return false;
}
