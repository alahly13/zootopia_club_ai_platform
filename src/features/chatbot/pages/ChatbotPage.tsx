import * as React from 'react';
import { useState } from 'react';
import { Send, Bot, User, Loader2, Sparkles, Eye } from 'lucide-react';
import { chatWithAI } from '../../../services/geminiService';
import { ModelSelector } from '../../../components/ModelSelector';
import { MasterConnectionSystem } from '../../../ai/services/masterConnectionSystem';
import { ModeSelector, Mode } from '../../../components/ModeSelector';
import { AI_MODELS } from '../../../constants/aiModels';
import { cn } from '../../../utils';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../../auth/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import CompactDocumentInfoBar from '../../../upload/CompactDocumentInfoBar';
import { useStatus } from '../../../hooks/useStatus';
import { ResultPreview, useResultPreviewThemeMode } from '../../../components/status/ResultPreview';
import { ProgressTracker } from '../../../components/status/ProgressTracker';
import { ExecutionTrace } from '../../../ai/types';
import { OperationMetaCard } from '../../../components/status/OperationMetaCard';
import { useToolScopedModelSelection } from '../../../hooks/useToolScopedModelSelection';
import { PreviewThemeModeToggle } from '../../../components/status/PreviewThemeModeToggle';
import { buildDocumentContextRef } from '../../../services/documentRuntimeService';

const Chatbot: React.FC = () => {
  const {
    context,
    extractedText,
    fileName,
    hasDocument,
    documentId,
    artifactId,
    processingPathway,
    documentRevision,
    documentStatus,
    documentPreparationError,
  } = useDocument();
  const { logActivity, checkLimit, incrementUsage, deductCredits, user, handleError, notify, models, getModelConfig } = useAuth();
  const { t } = useLanguage();
  const { selectedModelId, setSelectedModelId } = useToolScopedModelSelection({
    toolId: 'chat',
    models,
    user,
  });
  const [selectedMode, setSelectedMode] = useState<Mode>('standard');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([
    { role: 'ai', content: t('aiAssistantGreeting') }
  ]);
  const [input, setInput] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [liveTrace, setLiveTrace] = useState<ExecutionTrace | null>(null);
  const [chatPreviewThemeMode, setChatPreviewThemeMode] = useResultPreviewThemeMode({
    sourceTool: 'chatbot',
    type: 'text',
  });
  const { status, message, error, startTime, endTime, durationMs, setStatus, setError, elapsed, isLoading, isError } = useStatus();
  const documentRevisionRef = React.useRef(documentRevision);
  const documentContextRef = React.useMemo(
    () =>
      buildDocumentContextRef({
        documentId,
        artifactId,
        processingPathway,
        documentRevision,
        fileName,
      }),
    [artifactId, documentId, documentRevision, fileName, processingPathway]
  );

  React.useEffect(() => {
    documentRevisionRef.current = documentRevision;
    setMessages([{ role: 'ai', content: t('aiAssistantGreeting') }]);
    setInput('');
    setLiveTrace(null);
    setIsPreviewOpen(false);
    setStatus('idle');
  }, [documentRevision, setStatus, t]);

  const handleModelSelect = (id: string) => {
    const resolvedId = setSelectedModelId(id);
    const resolvedModel = getModelConfig(resolvedId || id);
    if (resolvedId) {
      notify.success(`Model updated to ${resolvedModel?.name || resolvedId}`);
    }
  };

  const activeModel = React.useMemo(
    () => getModelConfig(selectedModelId),
    [getModelConfig, selectedModelId]
  );
  const lastAssistantMessage = [...messages].reverse().find((entry) => entry.role === 'ai');
  const chatPresentationStage =
    status === 'idle' && lastAssistantMessage
      ? {
          label: 'Reply displayed',
          status: 'completed' as const,
          message: 'The latest assistant response is visible in the conversation.',
        }
      : null;
  const chatOutputMetaRows = [
    { label: 'Messages', value: `${messages.length}` },
    { label: 'Assistant Replies', value: `${messages.filter((entry) => entry.role === 'ai').length}` },
    { label: 'Attached File', value: fileName || '--' },
    { label: 'Latest Reply', value: lastAssistantMessage ? `${lastAssistantMessage.content.length.toLocaleString()} chars` : '--' },
  ];
  const chatSummaryOutputMetaRows = liveTrace || typeof durationMs === 'number' ? chatOutputMetaRows : [];

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const activeDocumentRevision = documentRevisionRef.current;
    const chatDocumentContext = context.trim().length > 0 ? context : extractedText;
    if (user && !user.permissions.useChatbot) {
      handleError(new Error(t('noPermissionChatbot')), 'admin_permission', 'Chatbot');
      return;
    }
    if (!checkLimit('aiRequestsToday')) return;

    const userMsg = input;
    const operationId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLiveTrace(null);
    setStatus('processing', t('thinking'));

    try {
      const providerSettings = { 
        enableThinking: selectedMode === 'thinking',
        enableSearch: selectedMode === 'search'
      };
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'ai',
        content: m.content
      }));
      const aiResponse = await chatWithAI(
        userMsg,
        chatDocumentContext,
        activeModel,
        history,
        providerSettings,
        fileName,
        {
          actionName: 'chat-conversation',
          operationId,
          onTraceUpdate: (trace) => setLiveTrace(trace),
        },
        documentContextRef
      );

      if (documentRevisionRef.current !== activeDocumentRevision) {
        return;
      }

      await deductCredits();
      incrementUsage('aiRequestsToday');
      setMessages(prev => [...prev, { role: 'ai', content: aiResponse || t('sorryEncounteredError') }]);
      logActivity('chat', `Asked: ${userMsg.substring(0, 30)}...`);
      setStatus('idle');
    } catch (error: any) {
      console.error(error);
      setError(error, handleSend);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col h-150 rounded-3xl overflow-hidden border shadow-xl transition-colors',
        chatPreviewThemeMode === 'dark'
          ? 'border-zinc-800 bg-zinc-950/95'
          : 'border-zinc-200 bg-white'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between border-b p-4 transition-colors',
          chatPreviewThemeMode === 'dark'
            ? 'border-zinc-800 bg-zinc-950'
            : 'border-zinc-200 bg-zinc-50'
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
            <Bot size={18} />
          </div>
          <div>
            <h3 className={cn('text-sm font-bold', chatPreviewThemeMode === 'dark' ? 'text-white' : 'text-zinc-900')}>
              {t('aiAssistant')}
            </h3>
            <p className={cn('text-xs', chatPreviewThemeMode === 'dark' ? 'text-zinc-400' : 'text-zinc-500')}>
              {t('online')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PreviewThemeModeToggle value={chatPreviewThemeMode} onChange={setChatPreviewThemeMode} />
          <button 
            onClick={() => setIsPreviewOpen(true)}
            className="p-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 rounded-lg transition-all cursor-pointer flex items-center gap-2 text-xs font-bold"
            title={t('previewAndExport')}
          >
            <Eye size={16} />
            <span className="hidden sm:inline">{t('export')}</span>
          </button>
          <ModelSelector 
            selectedModelId={selectedModelId}
            onModelSelect={handleModelSelect}
            toolId="chat"
            filter={(m) => MasterConnectionSystem.getCompatibleModels('chat').includes(m.id)}
          />
        </div>
      </div>

      <ResultPreview 
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={t('chatHistory')}
        type="text"
        data={{
          kind: 'chat-transcript',
          messages: messages.map((message) => ({
            role: message.role === 'user' ? 'user' : 'ai',
            content: message.content,
          })),
          fileName,
        }}
        sourceTool="chatbot"
        previewThemeMode={chatPreviewThemeMode}
        onPreviewThemeModeChange={setChatPreviewThemeMode}
      />

      {hasDocument ? (
        <div className="border-b border-zinc-200/80 p-4 dark:border-zinc-800/80">
          <CompactDocumentInfoBar
            statusLabel={
              documentPreparationError
                ? t('uploadUI.documentPreparationFailed', {
                    defaultValue: 'Document preparation failed',
                  })
                : documentStatus === 'preparing'
                ? t('uploadUI.filePreparing', { defaultValue: 'Preparing file' })
                : t('uploadUI.contextReady', { defaultValue: 'Context ready' })
            }
            statusTone={
              documentPreparationError
                ? 'error'
                : documentStatus === 'preparing'
                  ? 'warning'
                  : 'success'
            }
            className="shadow-none"
          />
        </div>
      ) : null}

      <div className="px-4 pt-4">
        <OperationMetaCard
          trace={liveTrace}
          status={status}
          startTime={startTime}
          endTime={endTime}
          durationMs={durationMs}
          elapsedSeconds={isLoading ? elapsed : undefined}
          outputMetaRows={chatSummaryOutputMetaRows}
          title="Conversation Summary"
          className="mb-3"
        />
        <ProgressTracker
          stages={[]}
          isVisible={isLoading || !!liveTrace || isError}
          elapsedTime={elapsed}
          trace={liveTrace}
          presentationStage={chatPresentationStage}
          status={status}
          message={message}
          onRetry={error?.retryAction}
          title={t('generationPipeline')}
        />
      </div>

      <div className={cn('flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar transition-colors', chatPreviewThemeMode === 'dark' ? 'bg-zinc-950/80' : 'bg-white')}>
        {messages.map((msg, i) => (
          <div key={i} className={cn(
            "flex gap-3 max-w-[85%]",
            msg.role === 'user' ? "ms-auto flex-row-reverse" : ""
          )}>
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              msg.role === 'user'
                ? (chatPreviewThemeMode === 'dark' ? "bg-zinc-900 text-zinc-400" : "bg-zinc-100 text-zinc-400")
                : "bg-emerald-600/20 text-emerald-500"
            )}>
              {msg.role === 'user' ? <User size={16} /> : <Sparkles size={16} />}
            </div>
            <div className={cn(
              "p-3 rounded-2xl text-sm",
              msg.role === 'user'
                ? "bg-emerald-600 text-white"
                : (chatPreviewThemeMode === 'dark' ? "bg-zinc-900 text-zinc-300" : "bg-zinc-100 text-zinc-700")
            )}>
              <div className="markdown-body">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-emerald-600/20 rounded-lg flex items-center justify-center text-emerald-500">
              <Loader2 size={16} className="animate-spin" />
            </div>
            <div className={cn('p-3 rounded-2xl text-sm italic', chatPreviewThemeMode === 'dark' ? 'bg-zinc-900 text-zinc-400' : 'bg-zinc-100 text-zinc-500')}>
              {message || t('thinking')}
            </div>
          </div>
        )}
      </div>

      <div
        className={cn(
          'border-t p-4 transition-colors',
          chatPreviewThemeMode === 'dark'
            ? 'border-zinc-800 bg-zinc-950'
            : 'border-zinc-200 bg-zinc-50'
        )}
      >
        <ModeSelector 
          selectedMode={selectedMode}
          onModeSelect={setSelectedMode}
          model={activeModel || (models && models.length > 0 ? models[0] : AI_MODELS[0])}
        />
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={t('askAnything')}
            className={cn(
              'w-full rounded-xl border ps-4 pe-12 py-3 transition-all focus:outline-none focus:border-emerald-500',
              chatPreviewThemeMode === 'dark'
                ? 'border-zinc-800 bg-zinc-900 text-white'
                : 'border-zinc-200 bg-white text-zinc-900'
            )}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute inset-e-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-white rounded-lg transition-all cursor-pointer"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="mt-2 text-[9px] text-center text-zinc-400 font-medium">
          © Zootopia Club – Copyright Ebn Abdallah Yousef
        </p>
      </div>
    </div>
  );
};

export default Chatbot;
