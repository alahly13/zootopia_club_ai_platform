import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  PencilLine,
  RefreshCcw,
  Sparkles,
  Video,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  downloadGeneratedAsset,
  formatAssetExpirationLabel,
  formatGeneratedAssetTimestamp,
  getGeneratedAssetPreviewData,
  getGeneratedAssetPreviewType,
  getGeneratedAssetLibraryBucket,
  listUserGeneratedAssets,
  openGeneratedAsset,
} from '../services/generatedAssetService';
import {
  buildGeneratedAssetUserMetadataRows,
} from '../services/generatedAssetMetadata';
import { GeneratedAsset } from '../types/generatedAsset';
import { GeneratedAssetImage } from '../components/assets/GeneratedAssetImage';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { RouteLoader } from '../components/RouteLoader';
import { ResultPreview, useResultPreviewThemeMode } from '../components/status/ResultPreview';
import { useGeneratedAssetObjectUrl } from '../hooks/useGeneratedAssetObjectUrl';
import { useLoadLifecycle } from '../hooks/useLoadLifecycle';
import { cn } from '../utils';
import { logger } from '../utils/logger';
import { withTimeout } from '../utils/async';

const RESULTS_LIBRARY_LOAD_TIMEOUT_MS = 15_000;

type AssetFilterId = 'all' | 'image' | 'edited-image' | 'document' | 'media';
type AssetSortId = 'newest' | 'oldest' | 'expires-soon';

const humanizeToolId = (toolId: string) =>
  toolId
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const ResultsLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, notify, isProfileHydrating } = useAuth();
  const { t } = useLanguage();
  const [assets, setAssets] = React.useState<GeneratedAsset[]>([]);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [activeFilter, setActiveFilter] = React.useState<AssetFilterId>('all');
  const [activeToolFilter, setActiveToolFilter] = React.useState<string>('all');
  const [sortOrder, setSortOrder] = React.useState<AssetSortId>('newest');
  const [previewAsset, setPreviewAsset] = React.useState<GeneratedAsset | null>(null);
  const [previewThemeMode, setPreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool: 'results-library',
    type: 'image',
  });
  const {
    reason: libraryLoadReason,
    message: libraryLoadMessage,
    elapsedSeconds: libraryLoadElapsedSeconds,
    isWorking: isLibraryLoading,
    isFailed: isLibraryLoadFailed,
    setPhase: setLibraryLoadPhase,
  } = useLoadLifecycle();

  const loadAssets = React.useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    // Protected routes can render while the Firebase session is known but the
    // Firestore profile is still hydrating. Keep that state visible instead of
    // pretending a library fetch has started when no user scope exists yet.
    if (!user?.id) {
      if (isProfileHydrating) {
        setLibraryLoadPhase({
          phase: 'preparing',
          reason: 'Restoring your workspace profile',
          message: 'Waiting for your account profile before loading saved results.',
        });
      } else {
        setLibraryLoadPhase({
          phase: 'failed',
          reason: 'Results library unavailable',
          message: 'We could not resolve your account profile for the results library.',
        });
      }
      return;
    }

    if (mode === 'initial') {
      setLibraryLoadPhase({
        phase: 'loading',
        reason: 'Loading saved results',
        message: 'Fetching your persisted generated assets.',
      });
    } else {
      setIsRefreshing(true);
    }

    try {
      const items = await withTimeout(
        listUserGeneratedAssets(user.id),
        RESULTS_LIBRARY_LOAD_TIMEOUT_MS,
        'Results library loading timed out.'
      );
      setAssets(items);
      setLibraryLoadPhase({
        phase: 'ready',
        reason: 'Results library ready',
        message: 'Saved generated assets are ready.',
        preserveElapsed: true,
      });
    } catch (error) {
      logger.error('Failed to load generated asset library.', {
        area: 'results-library',
        event: 'load-generated-assets-failed',
        userId: user.id,
        error,
      });
      if (mode === 'initial') {
        setLibraryLoadPhase({
          phase: 'failed',
          reason: 'Results library failed to load',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to load your results library.',
          preserveElapsed: true,
        });
      }
      notify.error(
        error instanceof Error ? error.message : 'Failed to load your results library.'
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [isProfileHydrating, notify, setLibraryLoadPhase, user?.id]);

  React.useEffect(() => {
    if (user?.id) {
      void loadAssets('initial');
      return;
    }

    if (isProfileHydrating) {
      setLibraryLoadPhase({
        phase: 'preparing',
        reason: 'Restoring your workspace profile',
        message: 'Waiting for your account profile before loading saved results.',
      });
      return;
    }

    setLibraryLoadPhase({
      phase: 'failed',
      reason: 'Results library unavailable',
      message: 'We could not resolve your account profile for the results library.',
    });
  }, [isProfileHydrating, loadAssets, setLibraryLoadPhase, user?.id]);

  const filteredAssets = React.useMemo(() => {
    const typeFiltered = (() => {
      switch (activeFilter) {
        case 'image':
          return assets.filter((asset) => getGeneratedAssetLibraryBucket(asset) === 'image');
        case 'edited-image':
          return assets.filter((asset) => getGeneratedAssetLibraryBucket(asset) === 'edited-image');
        case 'document':
          return assets.filter((asset) => getGeneratedAssetLibraryBucket(asset) === 'document');
        case 'media':
          return assets.filter((asset) => getGeneratedAssetLibraryBucket(asset) === 'media');
        default:
          return assets;
      }
    })();

    const toolFiltered =
      activeToolFilter === 'all'
        ? typeFiltered
        : typeFiltered.filter(
            (asset) =>
              asset.toolId === activeToolFilter || asset.sourceToolId === activeToolFilter
          );

    const sortedAssets = [...toolFiltered];
    sortedAssets.sort((left, right) => {
      if (sortOrder === 'oldest') {
        return left.createdAt.toMillis() - right.createdAt.toMillis();
      }

      if (sortOrder === 'expires-soon') {
        return left.expiresAt.toMillis() - right.expiresAt.toMillis();
      }

      return right.createdAt.toMillis() - left.createdAt.toMillis();
    });

    return sortedAssets;
  }, [activeFilter, activeToolFilter, assets, sortOrder]);

  const toolFilters = React.useMemo(() => {
    const toolIds = Array.from(
      new Set(
        assets
          .flatMap((asset) => [asset.toolId, asset.sourceToolId])
          .filter((toolId): toolId is string => typeof toolId === 'string' && toolId.trim().length > 0)
      )
    ).sort((left, right) => left.localeCompare(right));

    return [
      { id: 'all', label: t('allTools', { defaultValue: 'All tools' }) },
      ...toolIds.map((toolId) => ({
        id: toolId,
        label: humanizeToolId(toolId),
      })),
    ];
  }, [assets, t]);

  React.useEffect(() => {
    if (!toolFilters.some((tool) => tool.id === activeToolFilter)) {
      setActiveToolFilter('all');
    }
  }, [activeToolFilter, toolFilters]);

  const sortOptions: Array<{ id: AssetSortId; label: string }> = [
    { id: 'newest', label: t('newestFirst', { defaultValue: 'Newest first' }) },
    { id: 'oldest', label: t('oldestFirst', { defaultValue: 'Oldest first' }) },
    { id: 'expires-soon', label: t('expiresSoon', { defaultValue: 'Expires soon' }) },
  ];

  const previewType = previewAsset ? getGeneratedAssetPreviewType(previewAsset) : null;
  const { objectUrl: previewAssetObjectUrl } = useGeneratedAssetObjectUrl(previewAsset);

  const openAsset = React.useCallback((asset: GeneratedAsset) => {
    void openGeneratedAsset(asset).catch((error) => {
      logger.error('Failed to open generated asset.', {
        area: 'results-library',
        event: 'open-generated-asset-failed',
        assetId: asset.id,
        resultTitle: asset.title,
        error,
      });
      notify.error('Failed to open this asset.');
    });
  }, [notify]);

  const handleDownloadAsset = React.useCallback(async (asset: GeneratedAsset) => {
    try {
      await downloadGeneratedAsset(asset);
    } catch (error) {
      logger.error('Failed to download generated asset.', {
        area: 'results-library',
        event: 'download-generated-asset-failed',
        assetId: asset.id,
        resultTitle: asset.title,
        error,
      });
      notify.error('Failed to download this asset.');
    }
  }, [notify]);

  const getAssetPlaceholder = React.useCallback((asset: GeneratedAsset) => {
    if (asset.assetType === 'video') {
      return <Video size={34} />;
    }

    if (asset.assetType === 'pdf' || asset.assetType === 'docx' || asset.assetType === 'markdown' || asset.assetType === 'json') {
      return <FileText size={34} />;
    }

    return <FolderOpen size={34} />;
  }, []);

  const filters: Array<{ id: AssetFilterId; label: string }> = [
    { id: 'all', label: t('allAssets', { defaultValue: 'All' }) },
    { id: 'image', label: t('images', { defaultValue: 'Images' }) },
    { id: 'edited-image', label: t('editedImages', { defaultValue: 'Edited' }) },
    { id: 'document', label: t('documents', { defaultValue: 'Documents' }) },
    { id: 'media', label: t('mediaAssets', { defaultValue: 'Media' }) },
  ];

  const getPrimaryMetadataRows = React.useCallback((asset: GeneratedAsset) => {
    return buildGeneratedAssetUserMetadataRows(asset)
      .filter((row) =>
        ['Tool', 'Model', 'Request Type', 'Credits Used', 'Source File'].includes(row.label)
      )
      .filter((row) => row.value !== 'Not applicable' && row.value !== 'Not recorded')
      .slice(0, 4);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-emerald-500/10 text-emerald-500">
            <FolderOpen size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              {t('resultsLibrary', { defaultValue: 'Results Library' })}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('resultsLibraryHint', {
                defaultValue:
                  'Browse your storage-backed generated assets, preview them, download them, or reopen editable images in the dedicated editor. Assets are retained for 3 days.',
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/image-editor')}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <PencilLine size={16} />
            {t('imageEditor', { defaultValue: 'Image Editor' })}
          </button>
          <button
            onClick={() => void loadAssets('refresh')}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            <RefreshCcw size={16} className={cn(isRefreshing && 'animate-spin')} />
            {t('refreshLibrary', { defaultValue: 'Refresh Library' })}
          </button>
        </div>
      </div>

      <div className="rounded-[2.5rem] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-zinc-900 dark:text-white">
              {t('savedAssets', { defaultValue: 'Saved Assets' })}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {t('savedAssetsHint', {
                defaultValue:
                  'Only configured, persisted assets appear here. Disabled or expired items are cleaned up automatically.',
              })}
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  'rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] transition-colors',
                  activeFilter === filter.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800'
                )}
              >
                {filter.label}
              </button>
            ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={activeToolFilter}
                onChange={(event) => setActiveToolFilter(event.target.value)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600 outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                {toolFilters.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.label}
                  </option>
                ))}
              </select>

              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as AssetSortId)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-600 outline-none transition-colors focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
              >
                {sortOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isLibraryLoading && assets.length === 0 ? (
          <div className="py-10">
            <RouteLoader
              compact
              label={t('resultsLibrary', { defaultValue: 'Results Library' })}
              detail={
                libraryLoadMessage ||
                'Loading your persisted generated assets and version history.'
              }
              reason={libraryLoadReason || 'asset retrieval'}
              elapsedSeconds={libraryLoadElapsedSeconds}
            />
          </div>
        ) : isLibraryLoadFailed && assets.length === 0 ? (
          <div className="space-y-4 py-6">
            <ErrorDisplay
              type="warning"
              title="Results Library"
              message={libraryLoadMessage || 'Failed to load your results library.'}
              details={libraryLoadReason || 'asset retrieval'}
            />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadAssets('initial')}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500"
              >
                <RefreshCcw size={16} />
                Retry Library Load
              </button>
            </div>
          </div>
        ) : filteredAssets.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-50 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-emerald-500/40 dark:hover:bg-zinc-900"
              >
                <div className="aspect-[4/3] overflow-hidden border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                  {asset.assetType !== 'image' && asset.assetType !== 'edited-image' ? (
                    <div className="flex h-full w-full items-center justify-center text-zinc-400">
                      {getAssetPlaceholder(asset)}
                    </div>
                  ) : asset.id ? (
                    <GeneratedAssetImage
                      asset={asset}
                      alt={asset.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-400">
                      <ImageIcon size={34} />
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                      {asset.assetType}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                      {formatAssetExpirationLabel(asset)}
                    </span>
                  </div>

                  <div>
                    <p className="truncate text-sm font-black text-zinc-900 dark:text-white">{asset.title}</p>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {asset.editPromptHistory.at(-1) || asset.prompt || 'Saved generated asset'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 rounded-[1.5rem] border border-zinc-200 bg-white/70 px-4 py-3 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/60">
                    {getPrimaryMetadataRows(asset).map((row) => (
                      <div
                        key={`${asset.id}-${row.label}`}
                        className="flex items-center justify-between gap-3 text-zinc-600 dark:text-zinc-300"
                      >
                        <span className="font-black uppercase tracking-[0.18em] text-zinc-400">
                          {row.label}
                        </span>
                        <span className="truncate text-right">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-[1.5rem] border border-zinc-200 bg-white/70 px-4 py-3 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/60">
                    <div>
                      <p className="font-black uppercase tracking-[0.18em] text-zinc-400">Saved</p>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300">{formatGeneratedAssetTimestamp(asset.createdAt)}</p>
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-[0.18em] text-zinc-400">Expires</p>
                      <p className="mt-1 text-zinc-600 dark:text-zinc-300">{formatGeneratedAssetTimestamp(asset.expiresAt)}</p>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-zinc-200 bg-white/70 px-4 py-3 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/60">
                    <p className="font-black uppercase tracking-[0.18em] text-zinc-400">Source</p>
                    <p className="mt-1 truncate text-zinc-600 dark:text-zinc-300">
                      {asset.provider} / {asset.modelId}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {getGeneratedAssetPreviewType(asset) && (
                      <button
                        onClick={() => setPreviewAsset(asset)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <Eye size={15} />
                        {t('preview', { defaultValue: 'Preview' })}
                      </button>
                    )}
                    <button
                      onClick={() => openAsset(asset)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <ArrowUpRight size={15} />
                      {t('openAsset', { defaultValue: 'Open' })}
                    </button>
                    <button
                      onClick={() => void handleDownloadAsset(asset)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-emerald-500"
                    >
                      <Download size={15} />
                      {t('download', { defaultValue: 'Download' })}
                    </button>
                  </div>

                  {asset.isEditable && (
                    <button
                      onClick={() => navigate(`/image-editor/${asset.id}`)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-100 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <PencilLine size={15} />
                      {t('openInEditor', { defaultValue: 'Open in Editor' })}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-zinc-100 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600">
              <Sparkles size={36} />
            </div>
            <div className="space-y-2">
              <p className="text-lg font-black text-zinc-900 dark:text-white">
                {t('noSavedAssetsYet', { defaultValue: 'No saved assets yet.' })}
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {t('noSavedAssetsYetHint', {
                  defaultValue:
                    'Run the image generator or future storage-backed tools to build a persistent results library here.',
                })}
              </p>
            </div>
            <button
              onClick={() => navigate('/images')}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500"
            >
              <Sparkles size={16} />
              {t('goToImageGenerator', { defaultValue: 'Go to Image Generator' })}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-[2.5rem] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black text-zinc-900 dark:text-white">
              {t('historyBridgeTitle', { defaultValue: 'Other Saved Results' })}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('historyBridgeHint', {
                defaultValue:
                  'Quizzes, study notes, document analyses, and older saved results still remain available in the existing History page while the storage-backed asset library expands tool by tool.',
              })}
            </p>
          </div>
          <button
            onClick={() => navigate('/history')}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-zinc-700 transition-colors hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <FolderOpen size={16} />
            {t('activityHistory', { defaultValue: 'Activity History' })}
          </button>
        </div>
      </div>

      {previewAsset && previewType && (
        <ResultPreview
          isOpen={!!previewAsset}
          onClose={() => setPreviewAsset(null)}
          title={previewAsset.title}
          type={previewType}
          data={getGeneratedAssetPreviewData(previewAsset, previewAssetObjectUrl)}
          sourceTool="results-library"
          previewThemeMode={previewThemeMode}
          onPreviewThemeModeChange={setPreviewThemeMode}
          createdAt={previewAsset.createdAt}
        />
      )}
    </div>
  );
};

export default ResultsLibraryPage;
