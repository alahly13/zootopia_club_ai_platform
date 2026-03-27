import * as React from 'react';
import { useState } from 'react';
import { 
  Video, 
  Download, 
  Loader2, 
  Sparkles,
  Monitor,
  Smartphone,
  Eye
} from 'lucide-react';
import { cn } from '../../../utils';
import { useAuth } from '../../../auth/AuthContext';
import { useStatus } from '../../../hooks/useStatus';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoadingOverlay } from '../../../components/status/LoadingOverlay';
import { ProgressTracker, Stage } from '../../../components/status/ProgressTracker';
import { ModelSelector } from '../../../components/ModelSelector';
import { ResultPreview } from '../../../components/status/ResultPreview';
import { OperationMetaCard } from '../../../components/status/OperationMetaCard';

import { MasterConnectionSystem } from '../../../ai/services/masterConnectionSystem';
import { useToolScopedModelSelection } from '../../../hooks/useToolScopedModelSelection';

const VideoGenerator: React.FC = () => {
  const { user, notify, models, getModelConfig, checkLimit } = useAuth();
  const { t } = useLanguage();
  const { selectedModelId, setSelectedModelId } = useToolScopedModelSelection({
    toolId: 'video-generator',
    models,
    user,
  });
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { status, message, error, startTime, endTime, durationMs, setStatus, setError, setStages, updateStage, elapsed, isLoading, isError, reset, stages } = useStatus();
  const videoPresentationStage = generatedVideo
    ? {
        label: 'Video displayed',
        status: 'completed' as const,
        message: 'The generated video is available in the playback surface.',
      }
    : null;
  const videoOutputMetaRows = generatedVideo
    ? [
        { label: 'Aspect Ratio', value: aspectRatio },
        { label: 'Prompt Length', value: `${prompt.length.toLocaleString()} chars` },
      ]
    : [];

  const handleModelSelect = (id: string) => {
    const resolvedId = setSelectedModelId(id);
    const resolvedModel = getModelConfig(resolvedId || id);
    if (resolvedId) {
      notify.success(`Model updated to ${resolvedModel?.name || resolvedId}`);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (user && !user.permissions.generateVideos) {
      notify.error(t('noPermissionGenerateVideos'));
      return;
    }
    if (!checkLimit('aiRequestsToday')) return;

    setGeneratedVideo(null);
    setStages([
      { id: 'validate', label: t('validatingModel'), status: 'active' },
      { id: 'dispatch', label: 'Checking backend video route', status: 'pending' },
      { id: 'finalize', label: 'Stopping simulated output', status: 'pending' },
    ]);
    /**
     * PRODUCT INTEGRITY GUARD
     * ------------------------------------------------------------------
     * The old sample-video fallback made model selection look functional while
     * bypassing the real provider path entirely. Keep this explicit failure
     * until the real backend video route exists so users never receive fake
     * output for a paid/locked model workflow.
     */
    const activeModel = getModelConfig(selectedModelId);
    updateStage('validate', { status: 'completed', label: `Model Confirmed: ${activeModel?.name || selectedModelId}` });
    updateStage('dispatch', { status: 'completed', label: 'Real video execution is not wired yet for this environment.' });
    updateStage('finalize', { status: 'failed', label: 'Removed the old sample-video fallback to avoid fake user-facing output.' });

    setStatus('blocking_error', 'Video generation is temporarily unavailable because the real provider execution path is not connected yet.');
    setError(
      new Error('Video generation is disabled until the real backend video provider is wired. Sample/demo output was intentionally removed to keep model behavior honest.'),
      handleGenerate
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative">
      <div className="lg:col-span-3">
        <ProgressTracker 
          stages={stages || []} 
          isVisible={isLoading || status === 'success' || isError} 
          elapsedTime={elapsed} 
          presentationStage={videoPresentationStage}
          status={status}
          message={message}
          onRetry={error?.retryAction}
          title={t('generationPipeline')} 
        />
      </div>
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl space-y-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600/20 rounded-xl flex items-center justify-center text-emerald-500">
                <Video size={20} />
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('videoCreator')}</h2>
            </div>
          </div>

          <ModelSelector 
            selectedModelId={selectedModelId}
            onModelSelect={handleModelSelect}
            toolId="video-generator"
            filter={(m) => MasterConnectionSystem.getCompatibleModels('video-generator').includes(m.id)}
          />

          <div className="space-y-4">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('videoPrompt')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('describeScientificAnimation')}
              className="w-full h-32 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white rounded-xl p-4 text-sm focus:outline-none focus:border-emerald-500 resize-none transition-all"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('aspectRatio')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setAspectRatio('16:9')}
                disabled={isLoading}
                className={cn(
                  "py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                  aspectRatio === '16:9' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700",
                  isLoading && "opacity-50 cursor-not-allowed"
                )}
              >
                <Monitor size={14} /> {t('landscape')} (16:9)
              </button>
              <button
                onClick={() => setAspectRatio('9:16')}
                disabled={isLoading}
                className={cn(
                  "py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer",
                  aspectRatio === '9:16' ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700",
                  isLoading && "opacity-50 cursor-not-allowed"
                )}
              >
                <Smartphone size={14} /> {t('portrait')} (9:16)
              </button>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isLoading || !prompt.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-900/20 active:scale-95 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" />
                {t('creatingVideo')}
              </>
            ) : (
              <>
                <Sparkles size={18} />
                {t('generateVideo')}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="lg:col-span-2">
        {(generatedVideo || status === 'success' || isError) && (
          <OperationMetaCard
            status={status}
            startTime={startTime}
            endTime={endTime}
            durationMs={durationMs}
            elapsedSeconds={isLoading ? elapsed : undefined}
            outputMetaRows={videoOutputMetaRows}
            title="Generation Summary"
            className="mb-4"
          />
        )}
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl h-full min-h-[500px] flex flex-col items-center justify-center p-8 relative overflow-hidden shadow-sm">
          <LoadingOverlay isVisible={isLoading} message={message} />
          
          {generatedVideo ? (
            <div className={cn(
              "relative rounded-2xl overflow-hidden shadow-2xl",
              aspectRatio === '16:9' ? "aspect-video w-full" : "aspect-[9/16] h-full"
            )}>
              <video 
                src={generatedVideo} 
                controls 
                autoPlay 
                loop 
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 end-4 flex gap-2">
                <button 
                  onClick={() => setIsPreviewOpen(true)}
                  className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-500 transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 px-4 font-bold"
                >
                  <Eye size={20} />
                  {t('previewAndExport')}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-3xl flex items-center justify-center text-zinc-400 dark:text-zinc-600 mx-auto">
                <Video size={40} />
              </div>
              <div>
                <p className="text-zinc-900 dark:text-white font-bold">{t('noVideoGeneratedYet')}</p>
                <p className="text-zinc-500 text-sm">{t('useVeoToCreateAnimations')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ResultPreview 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={t('generatedVideo')}
        type="video"
        data={{
          url: generatedVideo || '',
          prompt,
          aspectRatio,
          modelId: selectedModelId,
        }}
        sourceTool="video-generator"
      />
    </div>
  );
};

export default VideoGenerator;
