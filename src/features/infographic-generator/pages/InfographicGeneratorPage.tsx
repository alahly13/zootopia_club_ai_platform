import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { WhatsAppFooter } from '../../../components/WhatsAppFooter';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { CollapsibleSection } from '../../../components/CollapsibleSection';
import { 
  Lightbulb, Info, 
  TrendingUp, Target, Zap,
  Loader2, FileBarChart, Sparkles, Layout, Sun, Moon
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { generateInfographicData, generateTopicImagePrompt, generateImage } from '../../../services/geminiService';
import { InfographicData, cn } from '../../../utils';
import { useAuth } from '../../../auth/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import CompactDocumentInfoBar from '../../../upload/CompactDocumentInfoBar';
import { useStatus } from '../../../hooks/useStatus';
import { LoadingOverlay } from '../../../components/status/LoadingOverlay';
import { ProgressTracker } from '../../../components/status/ProgressTracker';
import { OptionSelector } from '../../../components/OptionSelector';
import { ModelSelector } from '../../../components/ModelSelector';
import { ResultPreview } from '../../../components/status/ResultPreview';
import { OperationMetaCard } from '../../../components/status/OperationMetaCard';
import { Eye } from 'lucide-react';

import { MasterConnectionSystem } from '../../../ai/services/masterConnectionSystem';
import { ExecutionTrace } from '../../../ai/types';
import { storeResult } from '../../../services/resultService';
import { isFacultyFastAccessUser } from '../../../constants/fastAccessPolicy';
import { useToolScopedModelSelection } from '../../../hooks/useToolScopedModelSelection';
import { getFirstAccessibleModelIdForTool } from '../../../ai/modelAccess';
import { ExportThemeMode } from '../../../utils/exporters';
import { useTheme } from '../../../themes/ThemeProvider';
import { buildDocumentContextRef } from '../../../services/documentRuntimeService';

const INFOGRAPHIC_RESULT_THEME_STORAGE_KEY = 'zootopia_infographic_result_theme';

function readStoredInfographicThemeMode(fallback: ExportThemeMode): ExportThemeMode {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const stored = window.localStorage.getItem(INFOGRAPHIC_RESULT_THEME_STORAGE_KEY);
  return stored === 'dark' || stored === 'light' ? stored : fallback;
}

function persistInfographicThemeMode(mode: ExportThemeMode) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(INFOGRAPHIC_RESULT_THEME_STORAGE_KEY, mode);
}

const InfographicGenerator: React.FC = () => {
  const {
    extractedText,
    hasDocument,
    documentId,
    artifactId,
    processingPathway,
    documentRevision,
    documentStatus,
    documentPreparationError,
  } = useDocument();
  const { logActivity, checkLimit, incrementUsage, deductCredits, user, isAdmin, models, notify, getModelConfig } = useAuth();
  const { t } = useLanguage();
  const { isDarkMode } = useTheme();
  const isFastAccessUser = isFacultyFastAccessUser(user);
  const [data, setData] = useState<InfographicData | null>(null);
  const [topicImage, setTopicImage] = useState<string | null>(null);
  const [template, setTemplate] = useState<'Nano' | 'Banana' | 'Free'>('Free');
  const { selectedModelId: infographicModelId, setSelectedModelId: setInfographicModelId } = useToolScopedModelSelection({
    toolId: 'infographic',
    models,
    user,
  });
  const [customInstructions, setCustomInstructions] = useState('');
  const [density, setDensity] = useState<'Minimal' | 'Balanced' | 'Detailed'>('Balanced');
  const [tone, setTone] = useState<'Professional' | 'Creative' | 'Academic' | 'Casual'>('Professional');
  const [emphasis, setEmphasis] = useState<'Data' | 'Summary' | 'Insights'>('Data');
  const [colorPalette, setColorPalette] = useState<'Emerald' | 'Amber' | 'Indigo' | 'Rose' | 'Zinc'>('Emerald');
  const [layout, setLayout] = useState<'Grid' | 'Linear' | 'Bento'>('Grid');
  const [iconStyle, setIconStyle] = useState<'Solid' | 'Outline' | 'Minimal' | 'None'>('Outline');
  const [detailLevel, setDetailLevel] = useState<'High' | 'Medium' | 'Low'>('Medium');
  // Architecture-sensitive: infographic result mode is scoped to this tool surface.
  // Keep inline rendering, preview/export, and saved result metadata synchronized from
  // this single state value instead of coupling infographic presentation to app theme.
  const [resultThemeMode, setResultThemeMode] = useState<ExportThemeMode>(() =>
    readStoredInfographicThemeMode(isDarkMode ? 'dark' : 'light')
  );
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [liveTrace, setLiveTrace] = useState<ExecutionTrace | null>(null);
  const { status, message, error, startTime, endTime, durationMs, setStatus, setError, setStages, updateStage, elapsed, isLoading, isError, reset, stages } = useStatus();
  const isResultDark = resultThemeMode === 'dark';
  const documentRevisionRef = useRef(documentRevision);
  const documentContextRef = React.useMemo(
    () =>
      buildDocumentContextRef({
        documentId,
        artifactId,
        processingPathway,
        documentRevision,
        fileName: null,
      }),
    [artifactId, documentId, documentRevision, processingPathway]
  );

  useEffect(() => {
    documentRevisionRef.current = documentRevision;
    setData(null);
    setTopicImage(null);
    setLiveTrace(null);
    setIsPreviewOpen(false);
    reset();
    setStatus('idle');
  }, [documentRevision, reset, setStatus]);

  useEffect(() => {
    persistInfographicThemeMode(resultThemeMode);
  }, [resultThemeMode]);

  const getResultModeButtonClass = (mode: ExportThemeMode) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all',
      resultThemeMode === mode
        ? mode === 'dark'
          ? 'bg-zinc-800 text-zinc-200 shadow-sm'
          : 'bg-white text-zinc-700 shadow-sm'
        : isResultDark
          ? 'text-zinc-400 hover:text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-700'
    );

  const getInfographicCardClass = (size: 'large' | 'compact' = 'large') =>
    cn(
      'border p-8 shadow-sm',
      template === 'Banana'
        ? isResultDark
          ? size === 'large'
            ? 'bg-amber-950/40 border-amber-700/50 rounded-4xl'
            : 'bg-amber-950/40 border-amber-700/50 rounded-4xl'
          : size === 'large'
            ? 'bg-yellow-50 border-yellow-200 rounded-4xl'
            : 'bg-yellow-50 border-yellow-200 rounded-4xl'
        : template === 'Nano'
          ? isResultDark
            ? 'bg-zinc-950 border-zinc-800 rounded-none'
            : 'bg-zinc-50 border-zinc-200 rounded-none'
          : isResultDark
            ? 'bg-zinc-900 border-zinc-800 rounded-3xl'
            : 'bg-white border-zinc-200 rounded-3xl'
    );

  const resultTitleTextClass = isResultDark ? 'text-zinc-100' : 'text-zinc-900';
  const resultMutedTextClass = isResultDark ? 'text-zinc-400' : 'text-zinc-500';
  const resultBodyTextClass = isResultDark ? 'text-zinc-300' : 'text-zinc-700';
  const resultShellClass = isResultDark ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900';
  const resultBackButtonClass = isResultDark
    ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600';
  const resultFooterClass = isResultDark
    ? 'border-zinc-800 text-zinc-500'
    : 'border-zinc-200 text-zinc-400';
  const resultChartGridColor = isResultDark ? '#3f3f46' : '#d4d4d8';
  const resultChartAxisColor = isResultDark ? '#94a3b8' : '#64748b';
  const resultChartTooltipStyle = {
    backgroundColor: isResultDark ? '#18181b' : '#ffffff',
    border: `1px solid ${isResultDark ? '#3f3f46' : '#e4e4e7'}`,
    borderRadius: '12px',
    color: isResultDark ? '#ffffff' : '#18181b',
  };
  const resultImageFrameClass = cn(
    'mb-8 overflow-hidden border shadow-lg',
    template === 'Banana'
      ? isResultDark
          ? 'rounded-4xl border-amber-700/50'
          : 'rounded-4xl border-yellow-200'
      : template === 'Nano'
        ? isResultDark
          ? 'rounded-none border-zinc-800'
          : 'rounded-none border-zinc-300'
        : isResultDark
          ? 'rounded-2xl border-zinc-800'
          : 'rounded-2xl border-zinc-200'
  );
  const resultInsightIconClass = (templateValue: 'Nano' | 'Banana' | 'Free') =>
    cn(
      'w-12 h-12 flex items-center justify-center text-emerald-500 shrink-0 group-hover:scale-110 transition-transform',
      templateValue === 'Banana'
        ? isResultDark
          ? 'bg-amber-700/20 rounded-2xl'
          : 'bg-yellow-200 rounded-2xl'
        : templateValue === 'Nano'
          ? isResultDark
            ? 'bg-zinc-800 rounded-none'
            : 'bg-zinc-200 rounded-none'
          : 'bg-emerald-500/10 rounded-2xl'
    );
  const didYouKnowCardClass = cn(
    'p-8 shadow-xl relative overflow-hidden',
    template === 'Banana'
      ? isResultDark
        ? 'bg-amber-600 text-amber-950 rounded-[3rem]'
        : 'bg-yellow-400 text-yellow-950 rounded-[3rem]'
      : template === 'Nano'
        ? 'bg-zinc-900 text-white rounded-none'
        : isResultDark
          ? 'bg-emerald-700 text-white rounded-3xl'
          : 'bg-emerald-600 text-white rounded-3xl'
  );

  const handleModelSelect = (modelId: string) => {
    const resolvedId = setInfographicModelId(modelId);
    const resolvedModel = getModelConfig(resolvedId || modelId);
    if (resolvedId) {
      notify.success(`Model updated to ${resolvedModel?.name || resolvedId}`);
    }
  };
  const infographicPresentationStage = data
    ? {
        label: 'Infographic displayed',
        status: 'completed' as const,
        message: 'The infographic layout is rendered and ready for preview or export.',
      }
    : liveTrace?.resultMeta?.ready
      ? {
          label: 'Rendering infographic',
          status: 'active' as const,
          message: 'Applying the generated infographic layout to the live view.',
        }
      : null;
  const infographicOutputMetaRows = data
    ? [
        { label: 'Insights', value: `${data.keyPoints.length}` },
        { label: 'Stats', value: `${data.stats.length}` },
        { label: 'Template', value: template },
        { label: 'Palette', value: colorPalette },
        { label: 'Result Mode', value: resultThemeMode === 'dark' ? 'Dark' : 'Light' },
      ]
    : [];
  const infographicPreviewData = data
    ? {
        infographic: data,
        topicImage,
        template,
        colorPalette,
        layout,
        density,
        tone,
        emphasis,
        iconStyle,
        detailLevel,
        resultThemeMode,
      }
    : null;

  const handleGenerate = async (existingOperationId?: string) => {
    const operationId = existingOperationId || `infographic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const activeDocumentRevision = documentRevisionRef.current;
    if (!extractedText) {
      notify.error(t('pleaseUploadDocumentFirst'));
      return;
    }
    if (user && !user.permissions.generateInfographics) {
      notify.error(t('noPermissionGenerateInfographics'));
      return;
    }
    if (!checkLimit('aiRequestsToday')) return;

    setStatus('processing', t('designingInfographic'));
    setData(null);
    setTopicImage(null);
    setLiveTrace(null);
    setStages([
      { id: 'file', label: t('fileContextReady'), status: 'completed' },
      { id: 'validate', label: t('validatingModel'), status: 'active' },
      { id: 'analyze', label: t('analyzingDataGeneratingLayout'), status: 'pending' },
      { id: 'visuals', label: t('generatingVisualAssets'), status: 'pending' },
      { id: 'finalize', label: t('finalizingAssessment'), status: 'pending' },
    ]);

    try {
      const activeModel = getModelConfig(infographicModelId);
      const providerSettings = {};
      
      updateStage('validate', { status: 'completed', label: `Model Confirmed: ${activeModel?.name || infographicModelId}` });

      const options = {
        density,
        tone,
        emphasis,
        customInstructions,
        template,
        colorPalette,
        layout,
        iconStyle,
        detailLevel,
        resultThemeMode,
      };

      setStatus('processing', t('analyzingDataGeneratingLayout'));
      updateStage('analyze', { status: 'active' });
      
      const [result, imagePrompt] = await Promise.all([
        generateInfographicData({
          content: extractedText,
          modelConfig: activeModel,
          providerSettings,
          ...options,
          documentContextRef,
          observability: {
            actionName: 'infographic-structure-generation',
            operationId,
            onTraceUpdate: (trace) => setLiveTrace(trace),
          },
        }),
        isFastAccessUser
          ? Promise.resolve('')
          : generateTopicImagePrompt(
              extractedText,
              activeModel,
              providerSettings,
              undefined,
              documentContextRef
            )
      ]);

      if (documentRevisionRef.current !== activeDocumentRevision) {
        return;
      }
      
      setData(result);
      updateStage('analyze', { status: 'completed' });
      
      setStatus('processing', t('generatingVisualAssets'));
      updateStage('visuals', { status: 'active' });
      
      // Always use a model that supports image generation for the image generation step
      let imageUrl = '';
      if (!isFastAccessUser && imagePrompt) {
        const imageModel = getModelConfig(
          getFirstAccessibleModelIdForTool({
            toolId: 'image-generator',
            unlockedModels: user?.unlockedModels,
            isAdmin,
          }) || 'gemini-3.1-flash-image-preview'
        );
        imageUrl = await generateImage(imagePrompt, "1K", "16:9", imageModel, {
          actionName: 'infographic-hero-image-generation',
          onTraceUpdate: (trace) => setLiveTrace(trace),
        });

        if (documentRevisionRef.current !== activeDocumentRevision) {
          return;
        }
      }
      setTopicImage(imageUrl);
      updateStage('visuals', { status: 'completed' });
      
      updateStage('finalize', { status: 'active' });
      await deductCredits();
      incrementUsage('aiRequestsToday');
      logActivity('infographic_gen', `Generated ${template} infographic: ${result.title}`);
      updateStage('finalize', { status: 'completed' });
      setStatus('success', t('infographicGeneratedSuccessfully'));
      notify.success(t('infographicIsReady'));

      if (user?.id) {
        const persistedPayload = {
          infographic: result,
          topicImage: imageUrl,
          template,
          options,
          resultThemeMode,
        };

        void storeResult(
          user.id,
          result.title || 'Generated Infographic',
          'infographic',
          JSON.stringify(persistedPayload),
          'infographic-generator',
          user.plan
        ).catch((storeError) => {
          console.warn('Failed to persist infographic result', storeError);
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err, () => handleGenerate(operationId));
      notify.error(t('failedToGenerateInfographic'));
    }
  };

  const handleReset = () => {
    setData(null);
    setTopicImage(null);
    reset();
  };

  const infographicRef = useRef<HTMLDivElement>(null);

  const handleShare = () => {
    notify.success(t('linkCopiedToClipboard'));
  };

  const getIcon = (name: string) => {
    const IconComponent = (Icons as any)[name] || Icons.HelpCircle;
    return <IconComponent size={24} />;
  };

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto space-y-10 pb-20 relative">
        <LoadingOverlay isVisible={isLoading} message={message} className="rounded-[3rem]" />
        <div className="text-center space-y-4 mb-12">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-emerald-500 mx-auto mb-6 rotate-3">
            <FileBarChart size={40} />
          </div>
          <h2 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter uppercase">{t('infographicStudio')}</h2>
          <p className="text-zinc-500 font-medium max-w-xl mx-auto">{t('transformComplexData')}</p>
        </div>

        {hasDocument ? (
          <CompactDocumentInfoBar
            statusLabel={
              documentPreparationError
                ? t('uploadUI.documentPreparationFailed', {
                    defaultValue: 'Document preparation failed',
                  })
                : documentStatus === 'preparing'
                ? t('uploadUI.filePreparing', { defaultValue: 'Preparing file' })
                : t('uploadUI.sharedAcrossTools', { defaultValue: 'Shared across tools' })
            }
            statusTone={
              documentPreparationError
                ? 'error'
                : documentStatus === 'preparing'
                  ? 'warning'
                  : 'success'
            }
          />
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-12">
            <ProgressTracker 
              stages={stages || []} 
              isVisible={isLoading || !!liveTrace || status === 'success' || isError} 
              elapsedTime={elapsed} 
              trace={liveTrace}
              presentationStage={infographicPresentationStage}
              status={status}
              message={message}
              onRetry={error?.retryAction}
              title={t('generationPipeline')} 
            />
          </div>
          {/* Left Column: Visual Configuration */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[3rem] p-10 shadow-2xl shadow-zinc-900/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full -mr-32 -mt-32 pointer-events-none" />
              
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 bg-linear-to-br from-emerald-500 to-emerald-700 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
                    <Layout size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">{t('visualDna')}</h3>
                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mt-1">{t('aestheticStructuralParameters')}</p>
                  </div>
                </div>
                <div className="w-48">
                    <ModelSelector 
                      selectedModelId={infographicModelId}
                      onModelSelect={handleModelSelect}
                      toolId="infographic"
                      filter={(m) =>
                        MasterConnectionSystem.getCompatibleModels('infographic').includes(m.id) &&
                        (!isFastAccessUser || ['Google', 'Qwen'].includes(m.provider))
                      }
                      label={t('aiModel')}
                      models={models}
                    />
                </div>
              </div>

              <CollapsibleSection title={t('visualParameters')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Style Template */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em]">{t('styleTemplate')}</label>
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{t('required')}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {(['Nano', 'Banana', 'Free'] as const).map(t_val => (
                        <button
                          key={t_val}
                          onClick={() => setTemplate(t_val)}
                          className={cn(
                            "flex items-center justify-between px-5 py-4 rounded-3xl border-2 transition-all cursor-pointer group relative overflow-hidden",
                            template === t_val 
                              ? "bg-emerald-500/5 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-xl shadow-emerald-500/10" 
                              : "bg-zinc-50 dark:bg-zinc-800/30 border-transparent text-zinc-500 hover:border-zinc-200 dark:hover:border-zinc-700"
                          )}
                        >
                          <div className="flex items-center gap-4 relative z-10">
                            <div className={cn(
                              "w-3 h-3 rounded-full transition-all duration-500",
                              template === t_val ? "bg-emerald-500 scale-125 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-zinc-300 dark:bg-zinc-600"
                            )} />
                            <div className="text-left">
                              <span className="text-sm font-black uppercase tracking-widest block">{t(t_val.toLowerCase())}</span>
                              <span className="text-[9px] font-bold opacity-60 uppercase tracking-widest">
                                {t_val === 'Nano' ? t('technicalMinimal') : t_val === 'Banana' ? t('creativeBold') : t('standardLayout')}
                              </span>
                            </div>
                          </div>
                          <div className={cn(
                            "absolute inset-0 bg-linear-to-r from-emerald-500/0 to-emerald-500/5 transition-transform duration-700",
                            template === t_val ? "translate-x-0" : "-translate-x-full"
                          )} />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color Palette */}
                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] px-1">{t('chromaticStrategy')}</label>
                    <div className="grid grid-cols-1 gap-3">
                      {(['Emerald', 'Amber', 'Indigo', 'Rose', 'Zinc'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => setColorPalette(p)}
                          className={cn(
                            "flex items-center justify-between px-5 py-4 rounded-3xl border-2 transition-all cursor-pointer group",
                            colorPalette === p 
                              ? "bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-zinc-900 shadow-xl shadow-zinc-900/20" 
                              : "bg-zinc-50 dark:bg-zinc-800/30 border-transparent text-zinc-500 hover:border-zinc-200 dark:hover:border-zinc-700"
                          )}
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "w-5 h-5 rounded-full shadow-inner ring-2 ring-offset-2 transition-all duration-500",
                              colorPalette === p ? "ring-zinc-900 dark:ring-white ring-offset-white dark:ring-offset-zinc-900" : "ring-transparent",
                              p === 'Emerald' ? "bg-emerald-500" :
                              p === 'Amber' ? "bg-amber-500" :
                              p === 'Indigo' ? "bg-indigo-500" :
                              p === 'Rose' ? "bg-rose-500" :
                              "bg-zinc-500"
                            )} />
                            <span className="text-sm font-black uppercase tracking-widest">{t(p.toLowerCase())}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 rounded-4xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] block">
                        {t('resultMode', { defaultValue: 'Result Mode' })}
                      </label>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl">
                        {t('infographicResultModeHint', { defaultValue: 'Choose how the infographic canvas, preview, and exports should look.' })}
                      </p>
                    </div>

                    <div className="inline-flex items-center rounded-[1.25rem] border border-zinc-200 bg-white p-1.5 shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
                      <button
                        onClick={() => setResultThemeMode('light')}
                        className={getResultModeButtonClass('light')}
                      >
                        <Sun size={14} />
                        <span>{t('light', { defaultValue: 'Light' })}</span>
                      </button>
                      <button
                        onClick={() => setResultThemeMode('dark')}
                        className={getResultModeButtonClass('dark')}
                      >
                        <Moon size={14} />
                        <span>{t('dark', { defaultValue: 'Dark' })}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title={t('advancedConfiguration')} description={t('fineTuneLayout')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] px-1 block">{t('layoutArchitecture')}</label>
                    <OptionSelector
                      options={['Grid', 'Linear', 'Bento'].map(o => ({ value: o, label: t(o.toLowerCase()), icon: <Layout size={16} /> }))}
                      value={layout}
                      onChange={(val) => setLayout(val as any)}
                      layout="compact"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] px-1 block">{t('informationDensity')}</label>
                    <OptionSelector
                      options={['Minimal', 'Balanced', 'Detailed'].map(o => ({ value: o, label: t(o.toLowerCase()), icon: <FileBarChart size={16} /> }))}
                      value={density}
                      onChange={(val) => setDensity(val as any)}
                      layout="compact"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] px-1 block">{t('contentTone')}</label>
                    <OptionSelector
                      options={['Professional', 'Creative', 'Academic', 'Casual'].map(o => ({ value: o, label: t(o.toLowerCase()), icon: <Sparkles size={16} /> }))}
                      value={tone}
                      onChange={(val) => setTone(val as any)}
                      layout="compact"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] px-1 block">{t('dataEmphasis')}</label>
                    <OptionSelector
                      options={['Data', 'Summary', 'Insights'].map(o => ({ value: o, label: t(o.toLowerCase()), icon: <Target size={16} /> }))}
                      value={emphasis}
                      onChange={(val) => setEmphasis(val as any)}
                      layout="compact"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] px-1 block">{t('iconStyle')}</label>
                    <OptionSelector
                      options={['Solid', 'Outline', 'Minimal', 'None'].map(o => ({ value: o, label: t(o.toLowerCase()), icon: <Icons.Image size={16} /> }))}
                      value={iconStyle}
                      onChange={(val) => setIconStyle(val as any)}
                      layout="compact"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] px-1 block">{t('detailLevel')}</label>
                    <OptionSelector
                      options={['High', 'Medium', 'Low'].map(o => ({ value: o, label: t(o.toLowerCase()), icon: <Icons.ZoomIn size={16} /> }))}
                      value={detailLevel}
                      onChange={(val) => setDetailLevel(val as any)}
                      layout="compact"
                    />
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          </div>

          {/* Right Column: AI Directives */}
          <div className="lg:col-span-4 space-y-8">
            <CollapsibleSection title={t('aiDirectives')} description={t('precisionTuning')}>
              <div className="bg-zinc-950 border border-zinc-800 rounded-4xl p-6 shadow-2xl shadow-zinc-950/50 h-full flex flex-col group relative overflow-hidden">
                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-linear-to-t from-emerald-500/5 to-transparent pointer-events-none" />
                
                <div className="flex items-center gap-5 mb-6 relative z-10">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500 ring-4 ring-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.2)] group-hover:scale-110 transition-transform duration-500">
                    <Zap size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tighter leading-none">{t('aiDirectives')}</h3>
                  </div>
                </div>
                
                <div className="relative flex-1 min-h-50 z-10">
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder={t('infographicDirectivesPlaceholder')}
                    className="w-full h-full bg-zinc-900/50 border-2 border-zinc-800 focus:border-emerald-500/50 text-white rounded-3xl px-6 py-5 focus:outline-none resize-none text-sm font-medium transition-all placeholder:text-zinc-700 leading-relaxed"
                  />
                  <div className="absolute bottom-4 right-6 text-[10px] font-black text-zinc-700 uppercase tracking-[0.2em] pointer-events-none">
                    {t('neuralEngineActive')}
                  </div>
                </div>
                
                <div className="mt-6 pt-6 border-t border-zinc-800 relative z-10">
                  <div className="flex items-start gap-4 p-4 bg-white/5 rounded-3xl border border-white/10 group-hover:border-emerald-500/30 transition-all duration-500">
                    <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500 shrink-0">
                      <Info size={16} />
                    </div>
                    <div>
                      <span className="text-emerald-500 font-black uppercase tracking-[0.2em] text-[9px] block mb-1">{t('proTip')}</span>
                      <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                        {t('infographicProTip')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6 pt-10">
          <button
            onClick={() => {
              void handleGenerate();
            }}
            disabled={isLoading}
            className="w-full max-w-lg px-10 py-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-4xl transition-all shadow-2xl shadow-emerald-500/30 active:scale-[0.98] cursor-pointer flex items-center justify-center gap-4 group uppercase tracking-widest text-lg"
          >
            <Sparkles size={24} className="group-hover:rotate-12 transition-transform" />
            {t('launchGeneration')}
          </button>
          <div className="flex items-center gap-3 px-6 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-zinc-200 dark:border-zinc-700">
            <Zap size={14} className="text-emerald-500" />
            <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-black">
              {t('aiCreditPerGeneration')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "space-y-8 pb-20 relative",
        template === 'Banana' && "font-sans",
        template === 'Nano' && "font-mono tracking-tight"
      )}
    >
      <LoadingOverlay isVisible={isLoading} message={message} />

      {/* Header */}
      <div className={cn(
        "flex flex-col sm:flex-row items-start sm:items-center justify-between border p-6 shadow-lg gap-4",
        template === 'Banana'
          ? isResultDark
            ? "bg-amber-950/40 border-amber-700/50 rounded-[2.5rem]"
            : "bg-yellow-50 border-yellow-200 rounded-[2.5rem]"
          : template === 'Nano'
            ? isResultDark
              ? "bg-zinc-950 border-zinc-800 rounded-none"
              : "bg-zinc-50 border-zinc-200 rounded-none"
            : isResultDark
              ? "bg-zinc-950 border-zinc-800 rounded-3xl"
              : "bg-white border-zinc-200 rounded-3xl"
      )}>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleReset}
            className={cn(
              "p-3 rounded-xl transition-all cursor-pointer group",
              resultBackButtonClass
            )}
            title={t('backToStudio')}
          >
            <Icons.ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className={cn("text-2xl font-bold", resultTitleTextClass)} dir="auto">{data?.title}</h2>
            </div>
            <p className={cn("text-sm mt-1", resultMutedTextClass)}>{t('aiPoweredVisualSummary')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
          <div className={cn(
            "inline-flex items-center rounded-[1.25rem] border p-1.5 shadow-sm",
            isResultDark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-200 bg-zinc-100'
          )}>
            <button
              onClick={() => setResultThemeMode('light')}
              className={getResultModeButtonClass('light')}
            >
              <Sun size={14} />
              <span>{t('light', { defaultValue: 'Light' })}</span>
            </button>
            <button
              onClick={() => setResultThemeMode('dark')}
              className={getResultModeButtonClass('dark')}
            >
              <Moon size={14} />
              <span>{t('dark', { defaultValue: 'Dark' })}</span>
            </button>
          </div>
          <button 
            onClick={() => setIsPreviewOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all cursor-pointer font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/20"
          >
            <Eye size={18} />
            <span>{t('previewAndExport')}</span>
          </button>
        </div>
      </div>

      <OperationMetaCard
        trace={liveTrace}
        status={status}
        startTime={startTime}
        endTime={endTime}
        durationMs={durationMs}
        elapsedSeconds={isLoading ? elapsed : undefined}
        outputMetaRows={infographicOutputMetaRows}
        title="Generation Summary"
      />

      <ResultPreview 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={data?.title || 'Infographic'}
        type="infographic"
        data={infographicPreviewData || data}
        topicImage={topicImage}
        sourceTool="infographic-generator"
        previewThemeMode={resultThemeMode}
        onPreviewThemeModeChange={setResultThemeMode}
      />

      {/* Main Content Grid */}
      <div ref={infographicRef} className={cn("rounded-3xl p-4", resultShellClass)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Summary & Stats */}
          <div className="lg:col-span-2 space-y-8">
          {/* Summary Card */}
          <div className={getInfographicCardClass()}>
            {topicImage && (
              <div className={resultImageFrameClass}>
                <img 
                  src={topicImage} 
                  alt="Topic Illustration" 
                  className="w-full h-auto object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
            <div className="flex items-center gap-3 mb-4">
              <Info className="text-emerald-500" size={20} />
              <h3 className={cn("font-bold uppercase tracking-widest text-xs", resultTitleTextClass)}>{t('overview')}</h3>
            </div>
            <p className={cn("leading-relaxed text-lg", resultBodyTextClass)} dir="auto">
              {data?.summary}
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {data?.stats.map((stat, i) => (
              <div key={i} className={cn(getInfographicCardClass('compact'), "p-6 text-center")}>
                <p className={cn("text-xs font-bold uppercase tracking-wider mb-2", resultMutedTextClass)} dir="auto">{stat.label}</p>
                <p className="text-3xl font-black text-emerald-500">
                  {stat.value}
                  <span className={cn("text-sm font-medium ms-1", resultMutedTextClass)}>{stat.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {/* Chart Section */}
          <div className={getInfographicCardClass()}>
            <div className="flex items-center gap-3 mb-8">
              <TrendingUp className="text-emerald-500" size={20} />
              <h3 className={cn("font-bold uppercase tracking-widest text-xs", resultTitleTextClass)}>{t('dataDistribution')}</h3>
            </div>
            <div className="h-75 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={resultChartGridColor} vertical={false} opacity={0.18} />
                  <XAxis dataKey="name" stroke={resultChartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={resultChartAxisColor} fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={resultChartTooltipStyle}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column: Key Points & Did You Know */}
        <div className="space-y-8">
          {/* Key Points */}
          <div className={cn(getInfographicCardClass(), "space-y-6")}>
            <div className="flex items-center gap-3 mb-2">
              <Target className="text-emerald-500" size={20} />
              <h3 className={cn("font-bold uppercase tracking-widest text-xs", resultTitleTextClass)}>{t('coreInsights')}</h3>
            </div>
            {data?.keyPoints.map((point, i) => (
              <div key={i} className="flex gap-4 group">
                <div className={resultInsightIconClass(template)}>
                  {getIcon(point.icon)}
                </div>
                <div>
                  <h4 className={cn("font-bold text-sm", resultTitleTextClass)} dir="auto">{point.title}</h4>
                  <p className={cn("text-xs mt-1 leading-relaxed", resultMutedTextClass)} dir="auto">{point.description}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Did You Know Card */}
          <div className={didYouKnowCardClass}>
            <Zap className={cn(
              "absolute -inset-e-4 -bottom-4 w-32 h-32 rotate-12",
              template === 'Banana' ? "text-yellow-950/10" : "text-white/10"
            )} />
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <Lightbulb size={24} />
              <h3 className="font-bold uppercase tracking-widest text-xs">{t('didYouKnow')}</h3>
            </div>
            <p className={cn(
              "relative z-10 font-medium leading-relaxed",
              template === 'Banana'
                ? isResultDark
                  ? "text-amber-950"
                  : "text-yellow-900"
                : "text-emerald-50"
            )} dir="auto">
              {data?.didYouKnow}
            </p>
          </div>
        </div>
      </div>
        
      {/* Branding Footer (Visible in Export) */}
      <div className={cn("mt-8 pt-6 border-t flex items-center justify-between", resultFooterClass)}>
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-emerald-500" />
          <span className={cn("font-bold text-xs uppercase tracking-widest", resultMutedTextClass)}>Zootopia Club AI</span>
        </div>
        <WhatsAppFooter />
        <div className="text-[10px] font-medium uppercase tracking-wider">
          {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  </motion.div>
  );
};

export default InfographicGenerator;
