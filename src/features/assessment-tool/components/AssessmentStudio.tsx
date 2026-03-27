import * as React from 'react';
import { useState } from 'react';
import { 
  FileText, 
  Settings2, 
  ChevronRight, 
  Check, 
  Download, 
  Share2,
  Printer,
  Eye,
  FileJson,
  Table,
  FileCode,
  Loader2,
  Zap,
  BookOpen,
  Brain,
  ListChecks,
  HelpCircle,
  GraduationCap
} from 'lucide-react';
import { cn, Quiz, QuestionType, Language, Difficulty, UploadStage } from '../../../utils';
import { logger } from '../../../utils/logger';
import { generateQuiz, generateTopicImagePrompt, generateImage } from '../../../services/geminiService';
import { exportToPDF, exportToDocx, exportToMarkdown } from '../../../utils/exporters';
import { ModeSelector, Mode } from '../../../components/ModeSelector';
import { QuizResult } from './QuizResult';
import { ModelSelector } from '../../../components/ModelSelector';
import { LoadingOverlay } from '../../../components/status/LoadingOverlay';
import { ProgressTracker, Stage } from '../../../components/status/ProgressTracker';
import { ResultPreview, useResultPreviewThemeMode } from '../../../components/status/ResultPreview';
import { OperationMetaCard } from '../../../components/status/OperationMetaCard';
import { PreviewThemeModeToggle } from '../../../components/status/PreviewThemeModeToggle';
import { motion, AnimatePresence } from 'motion/react';
import { useStatus } from '../../../hooks/useStatus';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';

import { CollapsibleSection } from '../../../components/CollapsibleSection';
import { OptionSelector, OptionItem } from '../../../components/OptionSelector';
import { useAuth } from '../../../auth/AuthContext';

import { MasterConnectionSystem } from '../../../ai/services/masterConnectionSystem';
import { ExecutionTrace } from '../../../ai/types';
import { storeResult } from '../../../services/resultService';
import { isFacultyFastAccessUser } from '../../../constants/fastAccessPolicy';
import { useToolScopedModelSelection } from '../../../hooks/useToolScopedModelSelection';
import { buildDocumentContextRef } from '../../../services/documentRuntimeService';

const AssessmentStudio: React.FC = () => {
  const { logActivity, checkLimit, incrementUsage, deductCredits, user, getModelConfig, validateModel, notify, models } = useAuth();
  const { t } = useLanguage();

  // Primary hook for canonical shared document state.
  // Read readiness directly from DocumentContext so the quiz workflow follows
  // the canonical uploaded-document lifecycle instead of any stale local prop.
  const {
    documentRevision,
    documentStatus,
    documentId,
    artifactId,
    processingPathway,
    extractedText,
    context,
    hasDocument,
    isDocumentPreparing,
    documentPreparationError,
  } = useDocument();

  const isFastAccessUser = isFacultyFastAccessUser(user);
  const [selectedMode, setSelectedMode] = useState<Mode>('standard');
  const [assessmentMode, setAssessmentMode] = useState<'quiz' | 'questions'>('quiz');
  // Keep quiz-vs-questions model memory isolated even though both modes share
  // the same execution compatibility rules and generator surface.
  const { selectedModelId, setSelectedModelId } = useToolScopedModelSelection({
    toolId: 'quiz',
    selectionScopeId: assessmentMode === 'quiz' ? 'assessment-quiz' : 'assessment-questions',
    models,
    user,
  });
  const [assessmentGoal, setAssessmentGoal] = useState<'practice' | 'revision' | 'exam' | 'self-assessment'>('practice');
  const [questionStyle, setQuestionStyle] = useState<'academic' | 'conversational' | 'socratic'>('academic');
  const [questionCount, setQuestionCount] = useState(10);
  const { status, message, error, startTime, endTime, durationMs, setStatus, setError, isLoading, isError, reset } = useStatus();
  
  const activeModel = React.useMemo(
    () => getModelConfig(selectedModelId),
    [getModelConfig, selectedModelId]
  );

  const handleModelSelect = (id: string) => {
    const resolvedId = setSelectedModelId(id);
    const resolvedModel = getModelConfig(resolvedId || id);
    if (resolvedId) {
      notify.success(`Model updated to ${resolvedModel?.name || resolvedId}`);
    }
  };
  const handleModeSelect = (mode: Mode) => {
    setSelectedMode(mode);
  };
  const [selectedTypes, setSelectedTypes] = useState<QuestionType[]>(['MCQ']);
  const [typePercentages, setTypePercentages] = useState<Record<string, number>>({ 'MCQ': 100 });
  const [language, setLanguage] = useState<Language>('English');
  const [difficulty, setDifficulty] = useState<Difficulty>('Intermediate');
  const [customInstructions, setCustomInstructions] = useState('');
  const [generatedQuiz, setGeneratedQuiz] = useState<Quiz | null>(null);
  const [topicImage, setTopicImage] = useState<string | null>(null);
  const [useDeepReasoning, setUseDeepReasoning] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [quizPreviewThemeMode, setQuizPreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool: 'assessment-studio',
    type: 'quiz',
  });
  const [liveTrace, setLiveTrace] = useState<ExecutionTrace | null>(null);
  const createGenerationStages = React.useCallback(() => ([
    { id: 'file', label: t('fileContextReady'), status: 'pending', time: null },
    { id: 'validate', label: t('validatingModel'), status: 'pending', time: null },
    { id: 'generate', label: t('aiGeneratingQuestions'), status: 'pending', time: null },
    { id: 'structure', label: t('structuringOutput'), status: 'pending', time: null },
    { id: 'finalize', label: t('finalizingAssessment'), status: 'pending', time: null },
  ]), [t]);
  const [genStages, setGenStages] = useState<any[]>(() => createGenerationStages());
  // Keep a component-local timestamp for stage timing inside the same async
  // generation tick. `useStatus` remains the shared summary source of truth,
  // but its state updates land on the next render.
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const documentRevisionRef = React.useRef(documentRevision);

  React.useEffect(() => {
    documentRevisionRef.current = documentRevision;
    setGeneratedQuiz(null);
    setTopicImage(null);
    setLiveTrace(null);
    setIsPreviewOpen(false);
    setGenerationStartTime(null);
    setElapsedTime(0);
    setStatus('idle');
    setGenStages(createGenerationStages());
  }, [createGenerationStages, documentRevision, setStatus]);

  const counts = [5, 10, 15, 20, 25, 30, 40, 50];
  const languages: Language[] = ['English', 'Arabic', 'French', 'German', 'Spanish'];

  const totalPercentage = Object.values(typePercentages).reduce((sum, val) => sum + val, 0);
  const normalizedExtractedText = extractedText.trim();
  const normalizedDocumentContext = context.trim();
  const documentContextRef = buildDocumentContextRef({
    documentId,
    artifactId,
    processingPathway,
    documentRevision,
    fileName: null,
  });
  // Quiz generation should use whichever canonical document payload was prepared.
  const quizInputText = normalizedExtractedText.length > 0 ? extractedText : context;
  const hasQuizInput = normalizedExtractedText.length > 0 || normalizedDocumentContext.length > 0;
  const quizGenerationReady = hasDocument && documentStatus === 'ready' && hasQuizInput;
  const canGenerateQuiz = quizGenerationReady && totalPercentage === 100 && !documentPreparationError;
  const generateButtonMessage = !hasDocument
    ? t('uploadUI.uploadPrompt', { defaultValue: 'Upload a document to enable quiz generation.' })
    : documentPreparationError
      ? documentPreparationError
    : isDocumentPreparing
      ? t('uploadUI.filePreparing', { defaultValue: 'Preparing file for quiz generation.' })
      : documentStatus === 'ready' && !hasQuizInput
        ? t('uploadUI.documentPreparing', { defaultValue: 'The document is attached but no usable text is available yet.' })
      : !quizGenerationReady
        ? t('uploadUI.documentPreparing', { defaultValue: 'Waiting for extracted text to be ready.' })
        : totalPercentage !== 100
          ? t('totalPercentageMustBe100')
          : t('generateAssessment', { mode: assessmentMode === 'quiz' ? t('quiz') : t('questions') });
  const quizPresentationStage = liveTrace?.resultMeta?.ready && !generatedQuiz
    ? {
        label: 'Rendering quiz',
        status: 'active' as const,
        message: 'Applying the generated quiz structure to the result view.',
      }
    : generatedQuiz
      ? {
          label: 'Quiz displayed',
          status: 'completed' as const,
          message: 'Questions are rendered and ready for preview or export.',
        }
      : null;
  const quizOutputMetaRows = generatedQuiz
    ? [
        { label: 'Questions', value: `${generatedQuiz.questions.length}` },
        { label: 'Language', value: generatedQuiz.language },
        { label: 'Difficulty', value: difficulty },
        { label: 'Question Types', value: `${selectedTypes.length}` },
      ]
    : [];
  const quizPreviewData = generatedQuiz
    ? {
        quiz: generatedQuiz,
        topicImage,
        assessmentMode,
        assessmentGoal,
        questionStyle,
        difficulty,
        selectedTypes,
      }
    : null;

  const toggleType = (type: QuestionType) => {
    if (selectedTypes.includes(type)) {
      if (selectedTypes.length === 1) return;
      const newTypes = selectedTypes.filter(t => t !== type);
      setSelectedTypes(newTypes);
      const newPercentages = { ...typePercentages };
      delete newPercentages[type];
      setTypePercentages(newPercentages);
    } else {
      setSelectedTypes([...selectedTypes, type]);
      setTypePercentages({ ...typePercentages, [type]: 0 });
    }
  };

  const handlePercentageChange = (type: string, value: string) => {
    const num = parseInt(value) || 0;
    setTypePercentages(prev => ({ ...prev, [type]: Math.min(100, Math.max(0, num)) }));
  };

  React.useEffect(() => {
    let interval: any;
    if (isLoading && generationStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - generationStartTime) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [generationStartTime, isLoading]);

  const updateStage = (id: string, status: 'pending' | 'loading' | 'success' | 'error', label?: string) => {
    setGenStages(prev => prev.map(s => 
      s.id === id ? { ...s, status, label: label || s.label, time: status === 'success' ? Math.floor((Date.now() - (generationStartTime || Date.now())) / 1000) : s.time } : s
    ));
  };

  const handleGenerate = async (existingOperationId?: string) => {
    const operationId = existingOperationId || `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const activeDocumentRevision = documentRevisionRef.current;
    logger.info('Starting assessment generation', { questionCount, selectedTypes, language, difficulty });

    if (documentPreparationError) {
      notify.error(documentPreparationError);
      return;
    }
    
    if (!quizGenerationReady) {
      logger.warn('Attempted to generate assessment without extracted text');
      notify.error(generateButtonMessage);
      return;
    }
    
    if (user && !user.permissions.generateQuestions) {
      logger.warn('User does not have assessment generation permissions');
      notify.error('You do not have permission to generate questions.');
      return;
    }
    
    if (!checkLimit('quizGenerationsToday')) {
      logger.warn('User reached daily assessment generation limit');
      return;
    }

    reset();
    setGeneratedQuiz(null);
    setTopicImage(null);
    setLiveTrace(null);
    setGenerationStartTime(Date.now());
    setGenStages(createGenerationStages());
    setStatus('processing');

    try {
      // Stage: File Context
      updateStage('file', 'success');
      
      // Stage: Validate
      updateStage('validate', 'loading');
      const validation = await validateModel(selectedModelId);
      if (!validation.isValid) {
        throw new Error(`Model Validation Failed: ${validation.error || 'Model not found'}`);
      }
      updateStage('validate', 'success', `Model Confirmed: ${activeModel?.name || selectedModelId}`);

      const payload = {
        text: quizInputText,
        options: {
          questionCount,
          questionTypes: selectedTypes,
          difficulty,
          language,
          assessmentMode,
          goal: assessmentGoal,
          style: questionStyle,
          customInstructions,
          useDeepReasoning,
          modelId: selectedModelId,
          providerSettings: {
            enableThinking: useDeepReasoning || selectedMode === 'thinking',
            enableSearch: selectedMode === 'search',
          },
        }
      };

      // Stage: Generate
      updateStage('generate', 'loading', `${activeModel?.name || 'AI'} is generating...`);
      
      const questions = await generateQuiz({
        content: payload.text,
        questionCount: payload.options.questionCount,
        questionTypes: payload.options.questionTypes,
        language: payload.options.language,
        difficulty: payload.options.difficulty,
        assessmentMode: payload.options.assessmentMode,
        goal: payload.options.goal,
        style: payload.options.style,
        customInstructions: payload.options.customInstructions,
        useDeepReasoning: payload.options.useDeepReasoning,
        typePercentages,
        generationMode: selectedMode,
        modelConfig: activeModel,
        providerSettings: payload.options.providerSettings,
        documentContextRef,
        observability: {
          actionName: 'assessment-quiz-generation',
          operationId,
          onTraceUpdate: (trace) => setLiveTrace(trace),
        },
      });

      if (documentRevisionRef.current !== activeDocumentRevision) {
        return;
      }
      
      if (!questions || !Array.isArray(questions)) throw new Error('No valid response from AI provider');
      
      updateStage('generate', 'success');
      updateStage('structure', 'loading');
      
      const newQuiz: Quiz = {
        id: Date.now().toString(),
        title: `Generated ${assessmentMode === 'quiz' ? 'Quiz' : 'Questions'}`,
        questions,
        language,
        createdAt: new Date().toISOString(),
        userId: user?.id || 'current-user'
      };

      if (documentRevisionRef.current !== activeDocumentRevision) {
        return;
      }

      // Stage: Finalize
      updateStage('structure', 'success');
      updateStage('finalize', 'loading');
      
      setGeneratedQuiz(newQuiz);
      await deductCredits();
      incrementUsage('quizGenerationsToday');
      logActivity('quiz_gen', `Generated ${assessmentMode} with ${activeModel?.name}`);
      
      updateStage('finalize', 'success');
      setStatus('success');
      notify.success(`${assessmentMode === 'quiz' ? 'Quiz' : 'Questions'} generated successfully!`);

      if (user?.id) {
        // Keep result persistence non-blocking so generation UX is never blocked by history writes.
        const persistedPayload = {
          quiz: newQuiz,
          topicImage,
          assessmentMode,
          difficulty,
        };

        void storeResult(
          user.id,
          newQuiz.title,
          'quiz',
          JSON.stringify(persistedPayload),
          'assessment-studio',
          user.plan
        ).catch((storeError) => {
          logger.warn('Failed to persist generated assessment result', storeError);
        });
      }

      // Optional: Generate topic image in background (decoupled)
      if (!isFastAccessUser && (selectedMode === 'image' || selectedMode === 'thinking')) {
        generateTopicImagePrompt(
          quizInputText,
          activeModel,
          payload.options.providerSettings,
          undefined,
          documentContextRef
        )
          .then(imagePrompt => {
            if (imagePrompt) {
              return generateImage(imagePrompt, "1K", "16:9", activeModel);
            }
            return null;
          })
          .then(imageUrl => {
            if (documentRevisionRef.current !== activeDocumentRevision) {
              return;
            }

            if (imageUrl) setTopicImage(imageUrl);
          })
          .catch(err => logger.warn('Optional image generation failed:', err));
      }

    } catch (err: any) {
      console.error('Generation error:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      
      // Classify error
      let classifiedError = 'Generation failed';
      if (errorMessage.includes('Model Validation')) classifiedError = 'Model validation failure';
      else if (errorMessage.includes('API key')) classifiedError = 'Provider authentication failure';
      else if (errorMessage.includes('limit')) classifiedError = 'Usage limit exceeded';
      else if (errorMessage.includes('timeout')) classifiedError = 'Request timed out';

      setError(
        new Error(`${classifiedError}: ${errorMessage}`),
        () => handleGenerate(operationId)
      );
      
      // Mark current loading stage as error
      setGenStages(prev => prev.map(s => s.status === 'loading' ? { ...s, status: 'error' } : s));
    } finally {
      setGenerationStartTime(null);
    }
  };

  const getQuestionIcon = (type: string) => {
    switch (type) {
      case 'MCQ': return <FileText className="text-blue-500" size={18} />;
      case 'True/False': return <Check className="text-emerald-500" size={18} />;
      case 'Scientific Term': return <Zap className="text-amber-500" size={18} />;
      case 'Comparison': return <Table className="text-purple-500" size={18} />;
      case 'Case Study': return <BookOpen className="text-rose-500" size={18} />;
      default: return <FileText className="text-zinc-400" size={18} />;
    }
  };

  return (
    <div className="space-y-8 relative max-w-7xl mx-auto">
      
      {/* Top-Level Mode Selector */}
      {!generatedQuiz && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex bg-zinc-100 dark:bg-zinc-900/50 p-1.5 rounded-2xl w-fit mx-auto border border-zinc-200 dark:border-zinc-800 shadow-sm"
        >
            <button
              onClick={() => setAssessmentMode('quiz')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                assessmentMode === 'quiz' 
                  ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50" 
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              <FileText size={18} />
              {t('quizMode')}
            </button>
            <button
              onClick={() => setAssessmentMode('questions')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                assessmentMode === 'questions' 
                  ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50" 
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              <BookOpen size={18} />
              {t('questionsMode')}
            </button>
        </motion.div>
      )}

      {!generatedQuiz ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-emerald-900/5 relative overflow-hidden"
        >
          <LoadingOverlay isVisible={isLoading} message={message} />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-600/10 rounded-2xl flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-600/20">
                <Settings2 size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
                  {assessmentMode === 'quiz' ? t('quizConfiguration') : t('questionsConfiguration')}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  {t('customizeParameters', { mode: assessmentMode === 'quiz' ? t('quiz') : t('questions') })}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3 items-end">
              <div className="flex items-center gap-2">
                <ModelSelector 
                  selectedModelId={selectedModelId}
                  onModelSelect={handleModelSelect}
                  toolId="quiz"
                  filter={(m) =>
                    MasterConnectionSystem.getCompatibleModels('quiz').includes(m.id) &&
                    (!isFastAccessUser || ['Google', 'Qwen'].includes(m.provider))
                  }
                />
                <ModeSelector 
                  selectedMode={selectedMode}
                  onModeSelect={handleModeSelect}
                  model={activeModel || (models && models.length > 0 ? models[0] : undefined)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-2">
              <ProgressTracker 
                stages={genStages} 
                isVisible={isLoading || !!liveTrace || status === 'success' || isError} 
                elapsedTime={elapsedTime} 
                trace={liveTrace}
                presentationStage={quizPresentationStage}
                status={status}
                message={message}
                onRetry={error?.retryAction}
                title={t('generationPipeline')} 
              />
            </div>

            {/* Assessment Goal */}
            <CollapsibleSection title={t('assessmentGoal')} defaultOpen={false}>
              <OptionSelector
                options={[
                  { value: 'practice', label: t('practiceQuestions'), icon: <Zap size={16} />, description: t('practiceDescription') },
                  { value: 'revision', label: t('revisionNotes'), icon: <BookOpen size={16} />, description: t('revisionDescription') },
                  { value: 'exam', label: t('examPreparation'), icon: <GraduationCap size={16} />, description: t('examDescription') },
                  { value: 'self-assessment', label: t('selfAssessment'), icon: <Brain size={16} />, description: t('selfAssessmentDescription') },
                ]}
                value={assessmentGoal}
                onChange={(val) => setAssessmentGoal(val as any)}
                layout="grid"
              />
            </CollapsibleSection>

            {/* Question Style */}
            <CollapsibleSection title={t('questionStyle')} defaultOpen={false}>
              <OptionSelector
                options={[
                  { value: 'academic', label: t('academic'), icon: <FileText size={16} />, description: t('academicDescription') },
                  { value: 'conversational', label: t('conversational'), icon: <HelpCircle size={16} />, description: t('conversationalDescription') },
                  { value: 'socratic', label: t('socratic'), icon: <Brain size={16} />, description: t('socraticDescription') },
                ]}
                value={questionStyle}
                onChange={(val) => setQuestionStyle(val as any)}
                layout="grid"
              />
            </CollapsibleSection>

            {/* Question Count */}
            <CollapsibleSection title={t('numberOfQuestions')} defaultOpen={false}>
              <div className="flex items-center justify-between mb-4">
                {activeModel?.supportsThinking && (
                  <button
                    onClick={() => setUseDeepReasoning(!useDeepReasoning)}
                    disabled={isLoading}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all border cursor-pointer",
                      useDeepReasoning 
                        ? "bg-purple-500/10 border-purple-500/30 text-purple-600" 
                        : "bg-zinc-100 dark:bg-zinc-800 border-transparent text-zinc-500",
                      isLoading && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className={cn("w-1.5 h-1.5 rounded-full", useDeepReasoning ? "bg-purple-500 animate-pulse" : "bg-zinc-400")} />
                    {t('deepReasoning')}
                  </button>
                )}
              </div>
              <OptionSelector
                options={counts.map(c => ({ value: c, label: `${c} Qs` }))}
                value={questionCount}
                onChange={(val) => setQuestionCount(Number(val))}
                layout="compact"
                className="gap-2"
              />
            </CollapsibleSection>

            {/* Difficulty */}
            <CollapsibleSection title={t('difficultyLevel')} defaultOpen={false}>
              <OptionSelector
                options={[
                  { value: 'Easy', label: t('easy'), icon: <Zap size={16} />, description: t('easyDescription') },
                  { value: 'Intermediate', label: t('intermediate'), icon: <BookOpen size={16} />, description: t('intermediateDescription') },
                  { value: 'Advanced', label: t('advanced'), icon: <Brain size={16} />, description: t('advancedDescription') },
                  { value: 'Exam Mode', label: t('examMode'), icon: <GraduationCap size={16} />, description: t('examModeDescription') },
                ]}
                value={difficulty}
                onChange={(val) => setDifficulty(val as Difficulty)}
                layout="grid"
              />
            </CollapsibleSection>

            {/* Question Types */}
            <CollapsibleSection title={t('questionTypes')} defaultOpen={false}>
              <div className="flex items-center justify-between mb-4">
                {selectedTypes.length > 0 && (
                  <span className={cn(
                    "text-xs font-bold px-2.5 py-1 rounded-md border",
                    totalPercentage === 100 
                      ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" 
                      : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                  )}>
                    {t('total')}: {totalPercentage}%
                  </span>
                )}
              </div>
              
              <OptionSelector
                options={[
                  { value: 'MCQ', label: t('multipleChoice'), icon: <ListChecks size={16} /> },
                  { value: 'True/False', label: t('trueFalse'), icon: <Check size={16} /> },
                  { value: 'Scientific Term', label: t('scientificTerm'), icon: <BookOpen size={16} /> },
                  { value: 'Comparison', label: t('comparison'), icon: <Table size={16} /> },
                  { value: 'Case Study', label: t('caseStudy'), icon: <FileText size={16} /> },
                  { value: 'Pathway', label: t('pathway'), icon: <ChevronRight size={16} /> },
                  { value: 'Short Answer', label: t('shortAnswer'), icon: <HelpCircle size={16} /> },
                ]}
                value={selectedTypes}
                onChange={(val) => toggleType(val as QuestionType)}
                multiple={true}
                layout="compact"
                className="gap-2"
              />
              
              {selectedTypes.length > 0 && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-5 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  {selectedTypes.map(type => (
                    <div key={`pct-${type}`} className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 truncate block">{type}</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={typePercentages[type] || 0}
                          onChange={(e) => handlePercentageChange(type, e.target.value)}
                          disabled={isLoading}
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 pe-8 disabled:opacity-50 transition-all"
                        />
                        <span className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-medium">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            {/* Language */}
            <CollapsibleSection title={t('language')} defaultOpen={false}>
              <OptionSelector
                options={languages.map(l => ({ value: l, label: l }))}
                value={language}
                onChange={(val) => setLanguage(val as Language)}
                layout="compact"
                className="gap-2"
              />
            </CollapsibleSection>

            {/* Custom Instructions */}
            <CollapsibleSection title={t('customInstructionsOptional')} defaultOpen={false}>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                disabled={isLoading}
                placeholder={t('customInstructionsPlaceholder', { mode: assessmentMode === 'quiz' ? t('quiz') : t('questions') })}
                className="w-full h-24 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 disabled:opacity-50 resize-none transition-all"
              />
            </CollapsibleSection>
          </div>

          <button
            onClick={() => {
              void handleGenerate();
            }}
            disabled={isLoading || !canGenerateQuiz}
            className={cn(
              'w-full mt-10 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg cursor-pointer btn-glow active:scale-[0.98] disabled:scale-100',
              canGenerateQuiz
                ? 'bg-emerald-600 text-white shadow-emerald-900/20 hover:bg-emerald-500'
                : 'bg-zinc-700 text-zinc-200 shadow-zinc-950/10 disabled:bg-zinc-700'
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" />
                {message || t('generatingAssessment', { mode: assessmentMode === 'quiz' ? t('scientificQuiz') : t('questions') })}
              </>
            ) : (
              <>
                <Zap size={20} />
                {generateButtonMessage}
              </>
            )}
          </button>
          <p className={cn(
            'mt-3 text-center text-xs font-medium',
            documentPreparationError
              ? 'text-red-600 dark:text-red-400'
              : canGenerateQuiz
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-zinc-500 dark:text-zinc-400'
          )}>
            {canGenerateQuiz
              ? t('uploadUI.documentReadyStage', { defaultValue: 'Document ready for quiz generation.' })
              : generateButtonMessage}
          </p>
        </motion.div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          <div
            className={cn(
              'flex flex-col gap-4 rounded-3xl border p-6 shadow-lg md:flex-row md:items-center md:justify-between',
              quizPreviewThemeMode === 'dark'
                ? 'border-zinc-800 bg-zinc-950 text-white shadow-[0_24px_60px_rgba(2,6,23,0.35)]'
                : 'border-zinc-200 bg-white text-zinc-900'
            )}
          >
            <div>
              <h2 className={cn('text-2xl font-bold', quizPreviewThemeMode === 'dark' ? 'text-white' : 'text-zinc-900')}>
                {t('assessmentGeneratedSuccessfully')}
              </h2>
              <p className={cn('mt-1 text-sm', quizPreviewThemeMode === 'dark' ? 'text-zinc-300' : 'text-zinc-500')}>
                {generatedQuiz.questions.length} {t('questions')} • {generatedQuiz.language} • {difficulty}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PreviewThemeModeToggle value={quizPreviewThemeMode} onChange={setQuizPreviewThemeMode} />
              <button 
                onClick={() => setIsPreviewOpen(true)}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-emerald-900/20 flex items-center gap-2"
              >
                <Eye size={18} />
                {t('previewAndExport')}
              </button>
              <button 
                onClick={() => {
                  setGeneratedQuiz(null);
                  reset();
                }}
                className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-95 text-zinc-600 dark:text-zinc-300 font-bold rounded-xl transition-all cursor-pointer"
              >
                {t('newQuiz')}
              </button>
            </div>
          </div>

          <OperationMetaCard
            trace={liveTrace}
            status={status}
            startTime={startTime}
            endTime={endTime}
            durationMs={durationMs}
            elapsedSeconds={isLoading ? elapsedTime : undefined}
            outputMetaRows={quizOutputMetaRows}
            title="Generation Summary"
          />

          <ResultPreview 
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            title={generatedQuiz.title}
            type="quiz"
            data={quizPreviewData || generatedQuiz}
            topicImage={topicImage}
            sourceTool="assessment-studio"
            previewThemeMode={quizPreviewThemeMode}
            onPreviewThemeModeChange={setQuizPreviewThemeMode}
          />

          {topicImage && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'rounded-3xl overflow-hidden border shadow-xl',
                quizPreviewThemeMode === 'dark'
                  ? 'border-zinc-800 bg-zinc-950'
                  : 'border-zinc-200 bg-white'
              )}
            >
              <img 
                src={topicImage} 
                alt="Quiz Topic Illustration" 
                className="w-full h-64 object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          )}

          <div className="space-y-4">
            <QuizResult quiz={generatedQuiz} resultThemeMode={quizPreviewThemeMode} />
          </div>
          
          <div className="text-center py-8 text-zinc-600 text-xs font-medium">
            © Zootopia Club – Copyright Ebn Abdallah Yousef
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default AssessmentStudio;
