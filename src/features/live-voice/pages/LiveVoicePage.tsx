import * as React from 'react';
import { useState, useRef } from 'react';
import { Mic, MicOff, Volume2, Loader2, Bot, User, Sparkles, Download, FileText } from 'lucide-react';
import { exportTextToPDF, exportTextToMarkdown } from '../../../utils/exporters';
import { cn } from '../../../utils';
import { useAuth } from '../../../auth/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useStatus } from '../../../hooks/useStatus';
import { StatusIndicator } from '../../../components/status/StatusIndicator';
import { StatusCard } from '../../../components/status/StatusCard';
import { useTheme } from '../../../themes/ThemeProvider';
import toast from 'react-hot-toast';
import { logger } from '../../../utils/logger';

const LiveVoice: React.FC = () => {
  const { logActivity, checkLimit, incrementUsage, deductCredits, user, notify } = useAuth();
  const { t } = useLanguage();
  const { isDarkMode } = useTheme();
  const [isActive, setIsActive] = useState(false);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [transcriptExportAction, setTranscriptExportAction] = useState<'pdf' | 'markdown' | null>(null);
  const { status, message, error, setStatus, setError, isLoading, isError, reset } = useStatus();
  const userIntentSessionStartRef = useRef(false);

  const runTranscriptExport = async (input: {
    action: 'pdf' | 'markdown';
    loadingMessage: string;
    operation: () => Promise<boolean>;
  }) => {
    if (transcriptExportAction || transcript.length === 0) {
      return;
    }

    setTranscriptExportAction(input.action);
    const toastId = toast.loading(input.loadingMessage);

    try {
      const didSucceed = await input.operation();
      if (!didSucceed) {
        toast.error(t('exportFailed', { defaultValue: 'Export failed.' }), { id: toastId });
        return;
      }

      toast.success(t('exportSuccessful', { defaultValue: 'Export completed successfully.' }), { id: toastId });
    } catch (error) {
      logger.error('Live Voice transcript export failed', {
        area: 'live-voice',
        event: 'transcript-export-failed',
        format: input.action,
        transcriptLength: transcript.length,
        error,
      });
      toast.error(t('exportFailed', { defaultValue: 'Export failed.' }), { id: toastId });
    } finally {
      setTranscriptExportAction((current) => (current === input.action ? null : current));
    }
  };

  const requestMicrophoneAccessOnDemand = async () => {
    /**
     * Permission architecture rule:
     * Never request microphone access during app bootstrap or route mount.
     * This helper must only be called from an explicit user-intent action
     * (e.g., pressing "Start conversation") to avoid intrusive first-load prompts.
     */
    if (!navigator?.mediaDevices?.getUserMedia) {
      const unsupportedError = new Error('Microphone access is not supported in this browser.');
      (unsupportedError as any).name = 'NotSupportedError';
      throw unsupportedError;
    }

    // Permission preflight: ask only now, then release immediately.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
  };

  const startSession = async () => {
    /**
     * Permission-flow guard:
     * Live audio/session bootstrap must only run from an explicit user action.
     * Keep this check in place so no mount/effect path can accidentally trigger
     * microphone-related permission prompts on initial app load.
     */
    if (!userIntentSessionStartRef.current) {
      return;
    }

    if (user && !user.permissions.useLiveVoice) {
      notify.error(t('noPermissionLiveVoice'));
      userIntentSessionStartRef.current = false;
      return;
    }
    if (!checkLimit('aiRequestsToday')) {
      userIntentSessionStartRef.current = false;
      return;
    }

    setStatus(
      'processing',
      t('requestingMicrophoneAccess', {
        defaultValue: 'Requesting microphone access...'
      })
    );

    try {
      await requestMicrophoneAccessOnDemand();

      setStatus('processing', t('connectingToLiveVoiceApi'));

      // Note: In a real environment, we'd setup the Web Audio API here
      // This is a UI representation of the Live API functionality
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await deductCredits();
      incrementUsage('aiRequestsToday');
      
      setIsActive(true);
      setTranscript(prev => [...prev, { role: 'ai', text: t('liveSessionStartedGreeting') }]);
      logActivity('chat', 'Started Live Voice session');
      setStatus('success', t('connected'));
      userIntentSessionStartRef.current = false;

    } catch (err: any) {
      console.error(err);

      // Keep permission denials actionable and non-fatal for the rest of the app.
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        notify.error(t('microphonePermissionDenied', { defaultValue: 'Microphone permission was denied. Please allow access and try again.' }));
      }

      userIntentSessionStartRef.current = false;
      // Retry must re-establish explicit user intent before any media permission flow.
      setError(err, () => {
        userIntentSessionStartRef.current = true;
        startSession();
      });
    }
  };

  const stopSession = () => {
    setIsActive(false);
    setTranscript([]);
    reset();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="bg-zinc-900/50 border border-zinc-800 p-12 rounded-[3rem] text-center space-y-8 relative overflow-hidden">
        <div className="absolute top-8 right-8">
          <StatusIndicator status={status} message={message} />
        </div>
        
        {/* Animated Background Pulse */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
            <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[100px] animate-pulse" />
          </div>
        )}

        <div className="relative z-10 space-y-6">
          <div className="w-24 h-24 bg-emerald-600/20 rounded-full flex items-center justify-center text-emerald-500 mx-auto relative">
            {isActive ? (
              <>
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500 animate-ping opacity-20" />
                <Mic size={40} />
              </>
            ) : (
              <MicOff size={40} className="text-zinc-600" />
            )}
          </div>

          <div className="max-w-md mx-auto">
            <h2 className="text-3xl font-black text-white tracking-tight">{t('liveVoice')}</h2>
            <p className="text-zinc-500 mt-2">{t('liveVoiceDescription')}</p>
          </div>

          <div className="flex justify-center gap-4">
            {!isActive ? (
              <div className="flex flex-col items-center gap-6">
                {isError && (
                  <div className="w-full max-w-md">
                    <StatusCard 
                      status={status}
                      title={t('connectionError')}
                      message={error?.message}
                      onRetry={error?.retryAction}
                      onDismiss={reset}
                    />
                  </div>
                )}
                <button
                  onClick={() => {
                    userIntentSessionStartRef.current = true;
                    startSession();
                  }}
                  disabled={isLoading}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-white font-bold px-10 py-4 rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-emerald-900/20 cursor-pointer"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                  {isLoading ? t('connecting') : t('startConversation')}
                </button>
              </div>
            ) : (
              <button
                onClick={stopSession}
                className="bg-red-600 hover:bg-red-500 text-white font-bold px-10 py-4 rounded-2xl flex items-center gap-3 transition-all shadow-xl shadow-red-900/20"
              >
                <MicOff size={20} />
                {t('endSession')}
              </button>
            )}
          </div>
        </div>
      </div>

      {isActive && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 space-y-4 max-h-[400px] overflow-y-auto relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{t('liveTranscript')}</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  void runTranscriptExport({
                    action: 'pdf',
                    loadingMessage: t('preparingHighResExport', { defaultValue: 'Preparing high-resolution export...' }),
                    operation: () =>
                      exportTextToPDF(
                        'Live Voice Transcript',
                        transcript.map(t => `${t.role === 'user' ? 'User' : 'AI'}: ${t.text}`).join('\n\n'),
                        { themeMode: isDarkMode ? 'dark' : 'light' }
                      ),
                  });
                }}
                disabled={Boolean(transcriptExportAction)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                title="Export PDF"
              >
                {transcriptExportAction === 'pdf' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
              <button 
                onClick={() => {
                  void runTranscriptExport({
                    action: 'markdown',
                    loadingMessage: t('preparingMarkdownExport', { defaultValue: 'Preparing Markdown export...' }),
                    operation: () =>
                      exportTextToMarkdown(
                        'Live Voice Transcript',
                        transcript.map(t => `**${t.role === 'user' ? 'User' : 'AI'}**:\n${t.text}`).join('\n\n---\n\n'),
                        { themeMode: isDarkMode ? 'dark' : 'light' }
                      ),
                  });
                }}
                disabled={Boolean(transcriptExportAction)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                title="Export Markdown"
              >
                {transcriptExportAction === 'markdown' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              </button>
            </div>
          </div>
          {transcript.map((t, i) => (
            <div key={i} className={cn(
              "flex gap-3 items-start max-w-[85%]",
              t.role === 'user' ? "ms-auto flex-row-reverse" : ""
            )}>
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                t.role === 'user' ? "bg-zinc-800 text-zinc-400" : "bg-emerald-600/20 text-emerald-500"
              )}>
                {t.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={cn(
                "p-3 rounded-2xl text-sm max-w-[80%]",
                t.role === 'user' ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300"
              )}>
                {t.text}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center py-8 text-zinc-600 text-xs font-medium">
        © Zootopia Club – Copyright Ebn Abdallah Yousef
      </div>
    </div>
  );
};

export default LiveVoice;
