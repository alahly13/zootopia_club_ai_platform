import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CollapsibleSection } from '../../../components/CollapsibleSection';
import { 
  Image as ImageIcon, 
  Maximize2, 
  Loader2,
  Sparkles,
  Eye,
  PencilLine,
  FolderOpen
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../../../auth/AuthContext';
import { generateImage } from '../../../services/geminiService';
import { cn } from '../../../utils';
import { useStatus } from '../../../hooks/useStatus';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoadingOverlay } from '../../../components/status/LoadingOverlay';
import { ProgressTracker } from '../../../components/status/ProgressTracker';
import { ResultPreview, useResultPreviewThemeMode } from '../../../components/status/ResultPreview';
import { OperationMetaCard } from '../../../components/status/OperationMetaCard';
import { PreviewThemeModeToggle } from '../../../components/status/PreviewThemeModeToggle';

import { OptionSelector } from '../../../components/OptionSelector';
import { ModelSelector } from '../../../components/ModelSelector';

import { MasterConnectionSystem } from '../../../ai/services/masterConnectionSystem';
import { ExecutionTrace } from '../../../ai/types';
import { storeResult } from '../../../services/resultService';
import { createGeneratedImageAsset, getGeneratedAssetPreviewData } from '../../../services/generatedAssetService';
import { buildGeneratedAssetMetadata } from '../../../services/generatedAssetMetadata';
import { useToolScopedModelSelection } from '../../../hooks/useToolScopedModelSelection';
import { logger } from '../../../utils/logger';

const ImageGenerator: React.FC = () => {
  const navigate = useNavigate();
  const { logActivity, checkLimit, incrementUsage, deductCredits, user, notify, models, getModelConfig } = useAuth();
  const { t } = useLanguage();
  const { selectedModelId, setSelectedModelId } = useToolScopedModelSelection({
    toolId: 'image-generator',
    models,
    user,
  });
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<"1K" | "2K" | "4K">("1K");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const { status, message, error, startTime, endTime, durationMs, setStatus, setError, setStages, updateStage, elapsed, isLoading, isError, stages } = useStatus();
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedAssetId, setGeneratedAssetId] = useState<string | null>(null);
  const [isPersistingAsset, setIsPersistingAsset] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [liveTrace, setLiveTrace] = useState<ExecutionTrace | null>(null);
  const [imagePreviewThemeMode, setImagePreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool: 'image-generator',
    type: 'image',
  });

  const handleModelSelect = (id: string) => {
    const resolvedId = setSelectedModelId(id);
    const resolvedModel = getModelConfig(resolvedId || id);
    if (resolvedId) {
      notify.success(`Model updated to ${resolvedModel?.name || resolvedId}`);
    }
  };

  const sizes: ("1K" | "2K" | "4K")[] = ["1K", "2K", "4K"];
  const ratios = ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"];
  const imagePresentationStage = generatedImage
    ? {
        label: 'Image displayed',
        status: 'completed' as const,
        message: 'The generated image is rendered in the result canvas and ready for preview or export.',
      }
    : liveTrace?.resultMeta?.ready
      ? {
          label: 'Rendering image',
          status: 'active' as const,
          message: 'Preparing the generated image for final display.',
        }
      : null;
  const imageOutputMetaRows = generatedImage
    ? [
        { label: 'Resolution Tier', value: size },
        { label: 'Aspect Ratio', value: aspectRatio },
        { label: 'Prompt Length', value: `${prompt.length.toLocaleString()} chars` },
      ]
    : [];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (user && !user.permissions.generateImages) {
      notify.error('You do not have permission to generate images.');
      return;
    }
    if (!checkLimit('aiRequestsToday')) return;

    setStatus('processing', t('creatingVisualization'));
    setGeneratedImage(null);
    setGeneratedAssetId(null);
    setIsPersistingAsset(false);
    setLiveTrace(null);
    setStages([
      { id: 'validate', label: t('validatingModel'), status: 'active' },
      { id: 'prompt', label: t('buildingPrompt'), status: 'pending' },
      { id: 'generate', label: t('generatingVisualAssets'), status: 'pending' },
      { id: 'finalize', label: t('finalizingAssessment'), status: 'pending' },
    ]);

    try {
      const activeModel = getModelConfig(selectedModelId);
      updateStage('validate', { status: 'completed', label: `Model Confirmed: ${activeModel?.name || selectedModelId}` });

      updateStage('prompt', { status: 'active' });
      // Simulate prompt building
      await new Promise(r => setTimeout(r, 800));
      updateStage('prompt', { status: 'completed' });

      updateStage('generate', { status: 'active', label: t('generatingVisualAssets') });
      const img = await generateImage(prompt, size, aspectRatio, activeModel, {
        actionName: 'image-generation',
        onTraceUpdate: (trace) => setLiveTrace(trace),
      });
      setGeneratedImage(img);
      updateStage('generate', { status: 'completed' });

      updateStage('finalize', { status: 'active' });
      await deductCredits();
      incrementUsage('aiRequestsToday');
      logActivity('image_gen', `Generated ${size} image: ${prompt.substring(0, 30)}...`);

      let persistedImageUrl = img;
      if (user?.id && activeModel) {
        setIsPersistingAsset(true);
        try {
          const generatedAsset = await createGeneratedImageAsset({
            userId: user.id,
            toolId: 'image-generator',
            title: `Generated Image (${size}, ${aspectRatio})`,
            dataUrl: img,
            prompt,
            provider: activeModel.providerId || activeModel.provider,
            family: activeModel.family,
            modelId: activeModel.id,
            metadata: buildGeneratedAssetMetadata({
              execution: {
                requestType: 'image-generation',
                generationType: 'text-to-image',
                creditsUsed: 1,
                status: 'success',
                transport: activeModel.transport,
              },
              customization: {
                size,
                aspectRatio,
              },
              output: {
                mimeType: 'image/png',
              },
            }),
          });
          setGeneratedAssetId(generatedAsset.id);
          persistedImageUrl = img;
          setGeneratedImage(persistedImageUrl);

          void storeResult(
            user.id,
            `Generated Image (${size}, ${aspectRatio})`,
            'image',
            JSON.stringify(getGeneratedAssetPreviewData(generatedAsset, img)),
            'image-generator',
            user.plan
          ).catch((storeError) => {
            logger.warn('Failed to persist generated image result.', {
              area: 'image-generator',
              event: 'persist-generated-image-history-failed',
              error: storeError,
            });
          });
        } catch (assetError) {
          logger.warn('Failed to persist generated image asset.', {
            area: 'image-generator',
            event: 'persist-generated-image-asset-failed',
            error: assetError,
          });
          notify.warning('The image was generated, but saving it to your library failed this time.');

          void storeResult(
            user.id,
            `Generated Image (${size}, ${aspectRatio})`,
            'image',
            JSON.stringify({
              url: img,
              prompt,
              size,
              aspectRatio,
              modelId: selectedModelId,
            }),
            'image-generator',
            user.plan
          ).catch((storeError) => {
            logger.warn('Failed to persist fallback generated image result.', {
              area: 'image-generator',
              event: 'persist-generated-image-fallback-history-failed',
              error: storeError,
            });
          });
        } finally {
          setIsPersistingAsset(false);
        }
      }

      updateStage('finalize', { status: 'completed' });
      setStatus('success', t('imageGeneratedSuccessfully'));
    } catch (error: any) {
      logger.error('Image generation failed.', {
        area: 'image-generator',
        event: 'generate-image-failed',
        error,
      });
      setError(error, handleGenerate);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
      <div className="lg:col-span-3">
        <ProgressTracker 
          stages={stages || []} 
          isVisible={isLoading || !!liveTrace || status === 'success' || isError} 
          elapsedTime={elapsed} 
          trace={liveTrace}
          presentationStage={imagePresentationStage}
          status={status}
          message={message}
          onRetry={error?.retryAction}
          title={t('generationPipeline')} 
        />
      </div>
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600/20 rounded-xl flex items-center justify-center text-emerald-500">
                <ImageIcon size={20} />
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('imageCreator')}</h2>
            </div>
          </div>

          <CollapsibleSection title={t('modelSettings')}>
            <ModelSelector 
              selectedModelId={selectedModelId}
              onModelSelect={handleModelSelect}
              toolId="image-generator"
              filter={(m) => MasterConnectionSystem.getCompatibleModels('image-generator').includes(m.id)}
            />
          </CollapsibleSection>

          <CollapsibleSection title={t('promptConfiguration')}>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('prompt')}</label>
                {prompt.length > 0 && (
                  <button onClick={() => setPrompt('')} className="text-[10px] text-zinc-400 hover:text-zinc-200">{t('clear')}</button>
                )}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('describeScientificVisualization')}
                className="w-full h-32 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl p-4 text-sm focus:outline-none focus:border-emerald-500 resize-none transition-all"
                disabled={isLoading}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection title={t('dimensionsAndFormat')}>
            <div className="space-y-6">
              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('imageSize')}</label>
                <OptionSelector
                  options={sizes.map(s => ({ value: s, label: s }))}
                  value={size}
                  onChange={(val) => setSize(val as any)}
                  layout="compact"
                />
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('aspectRatio')}</label>
                <OptionSelector
                  options={ratios.map(r => ({ value: r, label: r }))}
                  value={aspectRatio}
                  onChange={(val) => setAspectRatio(val as any)}
                  layout="compact"
                />
              </div>
            </div>
          </CollapsibleSection>

          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-900/20 active:scale-95 cursor-pointer"
          >
            {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
            {t('generateImage')}
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 relative min-h-[500px]">
        {(generatedImage || status === 'success' || isError) && (
          <OperationMetaCard
            trace={liveTrace}
            status={status}
            startTime={startTime}
            endTime={endTime}
            durationMs={durationMs}
            elapsedSeconds={isLoading ? elapsed : undefined}
            outputMetaRows={imageOutputMetaRows}
            title="Generation Summary"
            className="mb-4"
          />
        )}
        <LoadingOverlay isVisible={isLoading} message={message} />
        <div
          className={cn(
            'rounded-3xl border h-full flex flex-col items-center justify-center p-8 relative overflow-hidden transition-colors shadow-sm',
            imagePreviewThemeMode === 'dark'
              ? 'border-zinc-800 bg-zinc-950/90'
              : 'border-zinc-200 bg-white'
          )}
        >
          {generatedImage && (
            <div className="absolute top-4 start-4 z-10">
              <PreviewThemeModeToggle value={imagePreviewThemeMode} onChange={setImagePreviewThemeMode} />
            </div>
          )}
          {generatedImage ? (
            <>
              <div
                className={cn(
                  'absolute inset-0 opacity-80',
                  imagePreviewThemeMode === 'dark'
                    ? 'bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.28),transparent_55%)]'
                    : 'bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.10),_transparent_45%),linear-gradient(180deg,rgba(240,253,244,0.95),transparent_55%)]'
                )}
              />
              <motion.img 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                src={generatedImage} 
                alt="Generated" 
                className={cn(
                  'relative z-[1] max-w-full max-h-full rounded-xl shadow-2xl border',
                  imagePreviewThemeMode === 'dark'
                    ? 'border-zinc-800'
                    : 'border-zinc-200'
                )}
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-4 end-4 flex gap-2">
                <button 
                  onClick={() => setIsPreviewOpen(true)}
                  className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 px-4 font-bold"
                >
                  <Eye size={20} />
                  {t('previewAndExport')}
                </button>
                <button
                  onClick={() => generatedAssetId && navigate(`/image-editor/${generatedAssetId}`)}
                  disabled={!generatedAssetId || isPersistingAsset}
                  className="p-3 bg-white/80 dark:bg-black/50 backdrop-blur-md text-zinc-900 dark:text-white rounded-xl hover:bg-white dark:hover:bg-black/70 transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 px-4 font-bold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPersistingAsset ? <Loader2 size={18} className="animate-spin" /> : <PencilLine size={20} />}
                  {t('openInEditor', { defaultValue: 'Open in Editor' })}
                </button>
                <button
                  onClick={() => navigate('/library')}
                  className="p-3 bg-white/80 dark:bg-black/50 backdrop-blur-md text-zinc-900 dark:text-white rounded-xl hover:bg-white dark:hover:bg-black/70 transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 px-4 font-bold"
                >
                  <FolderOpen size={20} />
                  {t('resultsLibrary', { defaultValue: 'Results Library' })}
                </button>
                <button 
                  onClick={() => window.open(generatedImage, '_blank')}
                  className="p-3 bg-white/80 dark:bg-black/50 backdrop-blur-md text-zinc-900 dark:text-white rounded-xl hover:bg-white dark:hover:bg-black/70 transition-all shadow-lg cursor-pointer flex items-center justify-center"
                >
                  <Maximize2 size={20} />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center space-y-4">
              <div
                className={cn(
                  'w-20 h-20 rounded-3xl flex items-center justify-center mx-auto',
                  imagePreviewThemeMode === 'dark'
                    ? 'bg-zinc-900 text-zinc-600'
                    : 'bg-zinc-100 text-zinc-400'
                )}
              >
                <ImageIcon size={40} />
              </div>
              <div>
                <p className={cn('font-bold', imagePreviewThemeMode === 'dark' ? 'text-white' : 'text-zinc-900')}>
                  {t('noImageGeneratedYet')}
                </p>
                <p className={cn('text-sm', imagePreviewThemeMode === 'dark' ? 'text-zinc-400' : 'text-zinc-500')}>
                  {t('enterPromptToCreateVisuals')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ResultPreview 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={t('generatedImage')}
        type="image"
        data={{
          url: generatedImage || '',
          prompt,
          size,
          aspectRatio,
          modelId: selectedModelId,
        }}
        sourceTool="image-generator"
        previewThemeMode={imagePreviewThemeMode}
        onPreviewThemeModeChange={setImagePreviewThemeMode}
      />
    </div>
  );
};

export default ImageGenerator;
