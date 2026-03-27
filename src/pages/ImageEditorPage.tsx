import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Layers3,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useToolScopedModelSelection } from '../hooks/useToolScopedModelSelection';
import { ModelSelector } from '../components/ModelSelector';
import { GeneratedAssetImage } from '../components/assets/GeneratedAssetImage';
import { ErrorDisplay } from '../components/ErrorDisplay';
import { RouteLoader } from '../components/RouteLoader';
import { LoadingOverlay } from '../components/status/LoadingOverlay';
import { ResultPreview, useResultPreviewThemeMode } from '../components/status/ResultPreview';
import { useGeneratedAssetObjectUrl } from '../hooks/useGeneratedAssetObjectUrl';
import { useLoadLifecycle } from '../hooks/useLoadLifecycle';
import {
  createGeneratedImageAsset,
  createOrUpdateImageEditSession,
  downloadGeneratedAsset,
  formatAssetExpirationLabel,
  getGeneratedAssetById,
  getGeneratedAssetPreviewData,
  getImageEditSessionForOriginalAsset,
  listGeneratedAssetVersions,
  listUserGeneratedAssets,
  readAssetAsDataUrl,
} from '../services/generatedAssetService';
import {
  buildGeneratedAssetMetadata,
  getGeneratedAssetSourceUpload,
} from '../services/generatedAssetMetadata';
import { GeneratedAsset } from '../types/generatedAsset';
import { editImage } from '../services/geminiService';
import { storeResult } from '../services/resultService';
import { cn } from '../utils';
import { logger } from '../utils/logger';
import { withTimeout } from '../utils/async';

const IMAGE_EDITOR_LOAD_TIMEOUT_MS = 15_000;

const ImageEditorPage: React.FC = () => {
  const navigate = useNavigate();
  const { assetId } = useParams();
  const {
    user,
    isAdmin,
    models,
    notify,
    getModelConfig,
    checkLimit,
    deductCredits,
    incrementUsage,
    logActivity,
    isProfileHydrating,
  } = useAuth();
  const { t } = useLanguage();
  const toolScopedSelection = useToolScopedModelSelection({
    toolId: 'image-editor',
    models,
    user,
  });
  const [imageAssets, setImageAssets] = React.useState<GeneratedAsset[]>([]);
  const [activeAsset, setActiveAsset] = React.useState<GeneratedAsset | null>(null);
  const [rootAsset, setRootAsset] = React.useState<GeneratedAsset | null>(null);
  const [versions, setVersions] = React.useState<GeneratedAsset[]>([]);
  const [editPrompt, setEditPrompt] = React.useState('');
  const [isApplyingEdit, setIsApplyingEdit] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewThemeMode, setPreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool: 'image-editor',
    type: 'image',
  });
  const [editSessionId, setEditSessionId] = React.useState<string | undefined>(undefined);
  const { objectUrl: activeAssetObjectUrl } = useGeneratedAssetObjectUrl(activeAsset);
  const { objectUrl: rootAssetObjectUrl } = useGeneratedAssetObjectUrl(rootAsset);
  const {
    reason: editorLoadReason,
    message: editorLoadMessage,
    elapsedSeconds: editorLoadElapsedSeconds,
    isWorking: isEditorLoading,
    isFailed: isEditorLoadFailed,
    setPhase: setEditorLoadPhase,
  } = useLoadLifecycle();

  const editableAssets = React.useMemo(
    () =>
      imageAssets.filter(
        (asset) =>
          asset.isEditable &&
          (asset.assetType === 'image' || asset.assetType === 'edited-image') &&
          (asset.editableByCapabilities.includes('image-editing') || asset.editableByCapabilities.length === 0)
      ),
    [imageAssets]
  );

  const availableEditModels = React.useMemo(
    () => models.filter((model) => model.supportsImageEditing),
    [models]
  );

  const loadAssets = React.useCallback(async () => {
    // Image editor assets are user-scoped. Do not start a fake asset load while
    // the auth shell is still hydrating the current user profile.
    if (!user?.id) {
      if (isProfileHydrating) {
        setEditorLoadPhase({
          phase: 'preparing',
          reason: 'Restoring your workspace profile',
          message: 'Waiting for your account profile before loading saved images.',
        });
      } else {
        setEditorLoadPhase({
          phase: 'failed',
          reason: 'Image editor unavailable',
          message: 'We could not resolve your account profile for the image editor.',
        });
      }
      return;
    }

    setEditorLoadPhase({
      phase: assetId ? 'loading' : 'preparing',
      reason: assetId ? 'Loading selected image workspace' : 'Loading saved editable images',
      message: assetId
        ? 'Loading your saved image and version history.'
        : 'Fetching your editable saved images.',
    });
    try {
      const assets = await withTimeout(
        listUserGeneratedAssets(user.id),
        IMAGE_EDITOR_LOAD_TIMEOUT_MS,
        'Image editor assets took too long to load.'
      );
      const filtered = assets.filter(
        (asset) => asset.assetType === 'image' || asset.assetType === 'edited-image'
      );
      setImageAssets(filtered);
      if (!assetId) {
        setEditorLoadPhase({
          phase: 'ready',
          reason: 'Image editor ready',
          message: 'Saved editable images are ready.',
          preserveElapsed: true,
        });
      }
    } catch (error) {
      console.error('Failed to load generated assets for editor:', error);
      setEditorLoadPhase({
        phase: 'failed',
        reason: 'Image editor asset load failed',
        message:
          error instanceof Error ? error.message : 'Failed to load your saved images.',
        preserveElapsed: true,
      });
      notify.error(error instanceof Error ? error.message : 'Failed to load your saved images.');
    }
  }, [assetId, isProfileHydrating, notify, setEditorLoadPhase, user?.id]);

  const loadSelectedAsset = React.useCallback(
    async (nextAssetId: string, knownAssets?: GeneratedAsset[]) => {
      if (!user?.id || !nextAssetId) {
        return;
      }

      setEditorLoadPhase({
        phase: 'loading',
        reason: 'Loading selected image workspace',
        message: 'Opening the selected image, versions, and edit session.',
      });

      try {
        const selected =
          knownAssets?.find((asset) => asset.id === nextAssetId) ||
          await withTimeout(
            getGeneratedAssetById(nextAssetId),
            IMAGE_EDITOR_LOAD_TIMEOUT_MS,
            'The selected image took too long to load.'
        );

        if (!selected) {
          setEditorLoadPhase({
            phase: 'failed',
            reason: 'Selected image not found',
            message: 'The selected image could not be found.',
            preserveElapsed: true,
          });
          notify.error('The selected image could not be found.');
          return;
        }

        if (selected.userId !== user.id && !isAdmin) {
          setEditorLoadPhase({
            phase: 'failed',
            reason: 'Selected image is not available',
            message: 'You can only edit your own saved images.',
            preserveElapsed: true,
          });
          notify.error('You can only edit your own saved images.');
          return;
        }

        const resolvedRootId = selected.rootAssetId || selected.id;
        const root =
          resolvedRootId === selected.id
            ? selected
            : await withTimeout(
                getGeneratedAssetById(resolvedRootId),
                IMAGE_EDITOR_LOAD_TIMEOUT_MS,
                'The root image version took too long to load.'
              );

        setActiveAsset(selected);
        setRootAsset(root || selected);

        const [versionList, session] = await withTimeout(
          Promise.all([
            listGeneratedAssetVersions(user.id, resolvedRootId),
            getImageEditSessionForOriginalAsset(user.id, resolvedRootId),
          ]),
          IMAGE_EDITOR_LOAD_TIMEOUT_MS,
          'Image editor versions took too long to load.'
        );

        setVersions(versionList);
        setEditSessionId(session?.id);
        setEditorLoadPhase({
          phase: 'ready',
          reason: 'Image editor ready',
          message: 'Selected image workspace is ready.',
          preserveElapsed: true,
        });
      } catch (error) {
        console.error('Failed to load editor asset:', error);
        setEditorLoadPhase({
          phase: 'failed',
          reason: 'Selected image load failed',
          message:
            error instanceof Error ? error.message : 'Failed to load the selected image.',
          preserveElapsed: true,
        });
        notify.error(error instanceof Error ? error.message : 'Failed to load the selected image.');
      }
    },
    [isAdmin, notify, setEditorLoadPhase, user?.id]
  );

  React.useEffect(() => {
    if (user?.id) {
      void loadAssets();
      return;
    }

    if (isProfileHydrating) {
      setEditorLoadPhase({
        phase: 'preparing',
        reason: 'Restoring your workspace profile',
        message: 'Waiting for your account profile before loading saved images.',
      });
      return;
    }

    setEditorLoadPhase({
      phase: 'failed',
      reason: 'Image editor unavailable',
      message: 'We could not resolve your account profile for the image editor.',
    });
  }, [isProfileHydrating, loadAssets, setEditorLoadPhase, user?.id]);

  React.useEffect(() => {
    if (!assetId || !user?.id) return;
    void loadSelectedAsset(assetId, imageAssets);
  }, [assetId, imageAssets, loadSelectedAsset, user?.id]);

  const handlePickAsset = React.useCallback(
    (asset: GeneratedAsset) => {
      navigate(`/image-editor/${asset.id}`);
    },
    [navigate]
  );

  const handleApplyEdit = React.useCallback(async () => {
    if (!user?.id || !activeAsset || !rootAsset) return;
    if (user.permissions && !user.permissions.generateImages) {
      notify.error('You do not have permission to edit images.');
      return;
    }
    if (!editPrompt.trim()) {
      notify.error('Write a clear edit instruction first.');
      return;
    }
    if (!checkLimit('aiRequestsToday')) return;

    const activeModel = getModelConfig(toolScopedSelection.selectedModelId);
    if (!activeModel) {
      notify.error('Select a valid edit model first.');
      return;
    }

    setIsApplyingEdit(true);
    try {
      const sourceImageDataUrl = await readAssetAsDataUrl(activeAsset);
      const editedImageDataUrl = await editImage(
        editPrompt.trim(),
        sourceImageDataUrl,
        activeModel,
        {
          actionName: 'image-editing',
        },
        {
          assetId: activeAsset.id,
          sourceProvider: activeAsset.sourceProvider || activeAsset.provider,
          sourceModelId: activeAsset.sourceModelId || activeAsset.modelId,
          sourceToolId: activeAsset.sourceToolId || activeAsset.toolId,
        }
      );

      const nextAsset = await createGeneratedImageAsset({
        userId: user.id,
        toolId: 'image-editor',
        title: activeAsset.title,
        dataUrl: editedImageDataUrl,
        prompt: rootAsset.prompt || activeAsset.prompt || editPrompt.trim(),
        provider: activeModel.providerId || activeModel.provider,
        family: activeModel.family,
        modelId: activeModel.id,
        sourceAsset: activeAsset,
        editPrompt: editPrompt.trim(),
        metadata: buildGeneratedAssetMetadata({
          existingMetadata: activeAsset.metadata,
          sourceUpload: getGeneratedAssetSourceUpload(rootAsset) || undefined,
          execution: {
            requestType: 'image-editing',
            generationType: 'image-to-image',
            creditsUsed: 1,
            status: 'success',
            transport: activeModel.transport,
          },
          customization: {
            editInstruction: editPrompt.trim(),
          },
          output: {
            mimeType: 'image/png',
          },
          additionalMetadata: {
            lastEditedAt: new Date().toISOString(),
            lastEditModelId: activeModel.id,
            lastEditSourceAssetId: activeAsset.id,
          },
        }),
      });

      await createOrUpdateImageEditSession({
        sessionId: editSessionId,
        userId: user.id,
        originalAssetId: rootAsset.id,
        currentAssetId: nextAsset.id,
        selectedEditModelId: activeModel.id,
        versionHistory: nextAsset.versionHistory,
        editPromptHistory: nextAsset.editPromptHistory,
        sourceMetadata: {
          sourceAssetId: activeAsset.id,
          rootAssetId: rootAsset.id,
        },
      });

      await deductCredits();
      incrementUsage('aiRequestsToday');
      logActivity('image_gen', `Edited image asset ${activeAsset.id} with ${activeModel.name || activeModel.id}`);

      void storeResult(
        user.id,
        `${nextAsset.title}`,
        'image',
        JSON.stringify(getGeneratedAssetPreviewData(nextAsset, editedImageDataUrl)),
        'image-editor',
        user.plan
      ).catch((error) => {
        console.warn('Failed to persist edited image history result', error);
      });

      notify.success('New edited version saved successfully.');
      setEditPrompt('');
      await loadAssets();
      navigate(`/image-editor/${nextAsset.id}`, { replace: true });
    } catch (error: any) {
      console.error('Image edit failed:', error);
      notify.error(error?.message || 'Failed to apply image edit.');
    } finally {
      setIsApplyingEdit(false);
    }
  }, [
    activeAsset,
    checkLimit,
    deductCredits,
    editPrompt,
    editSessionId,
    getModelConfig,
    incrementUsage,
    loadAssets,
    logActivity,
    navigate,
    notify,
    rootAsset,
    toolScopedSelection.selectedModelId,
    user?.id,
    user?.plan,
  ]);

  const activePreviewData = React.useMemo(
    () => (activeAsset ? getGeneratedAssetPreviewData(activeAsset, activeAssetObjectUrl) : null),
    [activeAsset, activeAssetObjectUrl]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-emerald-500/10 text-emerald-500">
            <Wand2 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white">
              {t('imageEditor', { defaultValue: 'Image Editor' })}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('imageEditorWorkspaceHint', {
                defaultValue:
                  'Open a saved generated image, apply prompt-based edits, and keep every version safely stored for 3 days.',
              })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate('/library')}
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FolderOpen size={16} />
            {t('resultsLibrary', { defaultValue: 'Results Library' })}
          </button>
          <button
            onClick={() => navigate('/images')}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500"
          >
            <ArrowLeft size={16} />
            {t('backToImageGenerator', { defaultValue: 'Back to Image Generator' })}
          </button>
        </div>
      </div>

      {!activeAsset ? (
        <div className="rounded-[2.5rem] border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-white">
                {t('chooseImageToEdit', { defaultValue: 'Choose an Image to Edit' })}
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {t('chooseImageToEditHint', {
                  defaultValue:
                    'Pick one of your saved generated images. The editor loads assets by canonical ID so the workspace survives refreshes and reopened sessions.',
                })}
              </p>
            </div>
            {isEditorLoading && (
              <div className="rounded-full border border-emerald-200 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:border-emerald-900/40 dark:text-emerald-300">
                {editorLoadReason || 'Loading image editor'}
                <span className="ms-2">{editorLoadElapsedSeconds}s</span>
              </div>
            )}
          </div>

          {isEditorLoading && editableAssets.length === 0 ? (
            <div className="mt-6">
              <RouteLoader
                compact
                label={t('imageEditor', { defaultValue: 'Image Editor' })}
                detail={
                  editorLoadMessage ||
                  'Loading saved editable images and version history.'
                }
                reason={editorLoadReason || 'asset retrieval'}
                elapsedSeconds={editorLoadElapsedSeconds}
              />
            </div>
          ) : isEditorLoadFailed && editableAssets.length === 0 ? (
            <div className="mt-6 space-y-4">
              <ErrorDisplay
                type="warning"
                title="Image Editor"
                message={editorLoadMessage || 'Failed to load your saved images.'}
                details={editorLoadReason || 'asset retrieval'}
              />
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadAssets()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500"
                >
                  <Loader2 size={16} />
                  Retry Image Editor Load
                </button>
              </div>
            </div>
          ) : editableAssets.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {editableAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handlePickAsset(asset)}
                  className="group overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-50 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950/50 dark:hover:border-emerald-500/40 dark:hover:bg-zinc-900"
                >
                  <div className="aspect-[4/3] overflow-hidden border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                    <GeneratedAssetImage
                      asset={asset}
                      alt={asset.title}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="space-y-3 p-4">
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
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {asset.editPromptHistory.at(-1) || asset.prompt || 'Saved image asset'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                      <Layers3 size={12} />
                      {t('versionCountLabel', {
                        defaultValue: 'Version {{count}}',
                        count: (asset.versionIndex || 0) + 1,
                      })}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[2rem] bg-zinc-100 text-zinc-400 dark:bg-zinc-950 dark:text-zinc-600">
                <ImageIcon size={36} />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-black text-zinc-900 dark:text-white">
                  {t('noEditableImagesYet', { defaultValue: 'No saved editable images yet.' })}
                </p>
                <p className="max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {t('noEditableImagesYetHint', {
                    defaultValue:
                      'Generate an image first, or open your results library after a successful image run to start editing from a persistent saved asset.',
                  })}
                </p>
              </div>
              <button
                onClick={() => navigate('/images')}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500"
              >
                <Sparkles size={16} />
                {t('generateAnImageFirst', { defaultValue: 'Generate an Image First' })}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.45fr,0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[2.5rem] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-300">
                    {activeAsset.assetType}
                  </p>
                  <h2 className="mt-2 text-xl font-black text-zinc-900 dark:text-white">{activeAsset.title}</h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {t('assetRetentionHint', {
                      defaultValue: 'Saved for 3 days. {{time}}.',
                      time: formatAssetExpirationLabel(activeAsset),
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPreviewOpen(true)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <Eye size={16} />
                    {t('preview', { defaultValue: 'Preview' })}
                  </button>
                  <button
                    onClick={() => {
                      void downloadGeneratedAsset(activeAsset).catch((error) => {
                        logger.error('Failed to download generated editor asset.', {
                          area: 'image-editor',
                          event: 'download-editor-asset-failed',
                          assetId: activeAsset.id,
                          error,
                        });
                        notify.error('Failed to download this image.');
                      });
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500"
                  >
                    <Download size={16} />
                    {t('download', { defaultValue: 'Download' })}
                  </button>
                </div>
              </div>

              <div className="relative">
                <LoadingOverlay
                  isVisible={isApplyingEdit}
                  message={t('applyingImageEdit', { defaultValue: 'Applying image edit...' })}
                />

                <div className={cn('grid gap-4', activeAsset.id !== rootAsset?.id ? 'lg:grid-cols-2' : 'grid-cols-1')}>
                  {rootAsset && activeAsset.id !== rootAsset.id && (
                    <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/50">
                      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                          {t('originalVersion', { defaultValue: 'Original' })}
                        </p>
                      </div>
                      <div className="aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
                        {rootAssetObjectUrl ? (
                          <img
                            src={rootAssetObjectUrl}
                            alt={rootAsset.title}
                            className="h-full w-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <GeneratedAssetImage
                            asset={rootAsset}
                            alt={rootAsset.title}
                            className="h-full w-full object-contain"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                        {activeAsset.id === rootAsset?.id
                          ? t('currentImage', { defaultValue: 'Current Image' })
                          : t('latestVersion', { defaultValue: 'Current Version' })}
                      </p>
                    </div>
                    <div className="aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
                      {activeAssetObjectUrl ? (
                        <img
                          src={activeAssetObjectUrl}
                          alt={activeAsset.title}
                          className="h-full w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <GeneratedAssetImage
                          asset={activeAsset}
                          alt={activeAsset.title}
                          className="h-full w-full object-contain"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="mb-5 flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                  <Layers3 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                    {t('versionHistory', { defaultValue: 'Version History' })}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {t('versionHistoryHint', {
                      defaultValue:
                        'Every edit creates a new saved asset version instead of overwriting the original image.',
                    })}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    onClick={() => handlePickAsset(version)}
                    className={cn(
                      'overflow-hidden rounded-[1.75rem] border text-start transition-all',
                      version.id === activeAsset.id
                        ? 'border-emerald-400 bg-emerald-50/70 dark:border-emerald-500/50 dark:bg-emerald-500/10'
                        : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/40 dark:hover:border-zinc-700'
                    )}
                  >
                    <div className="aspect-[4/3] overflow-hidden border-b border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                      <GeneratedAssetImage
                        asset={version}
                        alt={version.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-2 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-black text-zinc-900 dark:text-white">
                          {t('versionShort', {
                            defaultValue: 'V{{count}}',
                            count: (version.versionIndex || 0) + 1,
                          })}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                          {formatAssetExpirationLabel(version)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {version.editPromptHistory.at(-1) || version.prompt || 'Saved version'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2.5rem] border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="mb-6">
                <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                  {t('editControls', { defaultValue: 'Edit Controls' })}
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {t('editControlsHint', {
                    defaultValue:
                      'Use a dedicated image-editing model, write a clear transformation prompt, and save each result as a new version.',
                  })}
                </p>
              </div>

              <div className="space-y-5">
                <ModelSelector
                  selectedModelId={toolScopedSelection.selectedModelId}
                  onModelSelect={toolScopedSelection.setSelectedModelId}
                  toolId="image-editor"
                  label={t('editModelLabel', { defaultValue: 'Edit Model' })}
                  models={availableEditModels}
                  filter={(model) => model.supportsImageEditing}
                />

                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    {t('editPromptLabel', { defaultValue: 'Edit Prompt' })}
                  </label>
                  <textarea
                    value={editPrompt}
                    onChange={(event) => setEditPrompt(event.target.value)}
                    placeholder={t('editPromptPlaceholder', {
                      defaultValue:
                        'Example: brighten the background, sharpen the cell membrane details, and keep the original scientific layout intact.',
                    })}
                    rows={6}
                    className="w-full rounded-[1.75rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-900 outline-none transition-colors focus:border-emerald-400 focus:bg-white dark:border-zinc-800 dark:bg-zinc-950/70 dark:text-white dark:focus:border-emerald-500 dark:focus:bg-zinc-950"
                  />
                </div>

                {activeAsset.editPromptHistory.length > 0 && (
                  <div className="rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                      {t('recentEditInstructions', { defaultValue: 'Recent Edit Instructions' })}
                    </p>
                    <div className="mt-3 space-y-2">
                      {activeAsset.editPromptHistory.slice(-3).reverse().map((item, index) => (
                        <p key={`${activeAsset.id}-prompt-${index}`} className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {item}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => void handleApplyEdit()}
                  disabled={isApplyingEdit || !editPrompt.trim()}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-[1.75rem] bg-emerald-600 px-4 py-4 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
                >
                  {isApplyingEdit ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 size={18} />}
                  {t('applyEdit', { defaultValue: 'Apply Edit' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeAsset && activePreviewData && (
        <ResultPreview
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={activeAsset.title}
          type="image"
          data={activePreviewData}
          sourceTool="image-editor"
          previewThemeMode={previewThemeMode}
          onPreviewThemeModeChange={setPreviewThemeMode}
          createdAt={activeAsset.createdAt}
        />
      )}
    </div>
  );
};

export default ImageEditorPage;
