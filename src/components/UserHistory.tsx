import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { 
  History, 
  Database, 
  Zap, 
  Clock, 
  MessageSquare, 
  Image as ImageIcon, 
  Video,
  BarChart3,
  LogIn,
  CreditCard,
  FileText,
  Download,
  Eye,
  ArrowUpRight,
  Image as ImageFileIcon,
  Video as VideoFileIcon,
  FileBarChart,
} from 'lucide-react';
import { cn } from '../utils';
import { motion } from 'motion/react';
import { Result, getResults, getRetentionPolicySummary } from '../services/resultService';
import { quickDownloadResultPreview, resolvePreferredPreviewThemeMode, ResultPreview } from './status/ResultPreview';
import { openDetachedResultPreview } from './status/resultPreviewStorage';
import { useTheme } from '../themes/ThemeProvider';

const UserHistory: React.FC = () => {
  const { activities, user, userRequests } = useAuth();
  const { t } = useLanguage();
  const { isDarkMode } = useTheme();
  const [results, setResults] = useState<Result[]>([]);
  const [previewResult, setPreviewResult] = useState<Result | null>(null);

  useEffect(() => {
    if (user?.id) {
      getResults(user.id, user.plan).then(setResults);
    }
  }, [user?.id, user?.plan]);

  const formatResultDate = (createdAt: any) => {
    if (!createdAt) return t('unknownDate', 'Unknown date');
    if (typeof createdAt?.toDate === 'function') {
      return createdAt.toDate().toLocaleString();
    }
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString();
    }
    return t('unknownDate', 'Unknown date');
  };
  
  // Filter activities for current user (unless admin, but dashboard is usually per-user)
  const userActivities = activities.filter(a => a.userId === user?.id);
  const myRequests = userRequests.filter(r => r.userId === user?.id);

  const getIcon = (type: string) => {
    switch (type) {
      case 'upload': return <Database size={18} />;
      case 'quiz_gen': return <Zap size={18} />;
      case 'chat': return <MessageSquare size={18} />;
      case 'image_gen': return <ImageIcon size={18} />;
      case 'video_gen': return <Video size={18} />;
      case 'infographic_gen': return <BarChart3 size={18} />;
      case 'login': return <LogIn size={18} />;
      default: return <Clock size={18} />;
    }
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <ImageFileIcon size={18} />;
      case 'video':
        return <VideoFileIcon size={18} />;
      case 'infographic':
        return <FileBarChart size={18} />;
      default:
        return <FileText size={18} />;
    }
  };

  const getResultTone = (type: string) => {
    switch (type) {
      case 'image':
        return 'bg-amber-500/10 text-amber-500';
      case 'video':
        return 'bg-rose-500/10 text-rose-500';
      case 'infographic':
        return 'bg-cyan-500/10 text-cyan-500';
      case 'quiz':
        return 'bg-emerald-500/10 text-emerald-500';
      default:
        return 'bg-violet-500/10 text-violet-500';
    }
  };

  const handleDetachedHistoryPreview = (result: Result) => {
    const previewThemeMode = resolvePreferredPreviewThemeMode({
      sourceTool: result.sourceTool,
      type: result.type as any,
      fallbackMode: isDarkMode ? 'dark' : 'light',
    });

    openDetachedResultPreview({
      title: result.title,
      type: result.type as any,
      data: result.data,
      sourceTool: result.sourceTool,
      createdAt: formatResultDate(result.createdAt),
      previewThemeMode,
    });
  };

  const handleQuickDownload = (result: Result) => {
    const previewThemeMode = resolvePreferredPreviewThemeMode({
      sourceTool: result.sourceTool,
      type: result.type as any,
      fallbackMode: isDarkMode ? 'dark' : 'light',
    });

    const didStartDownload = quickDownloadResultPreview({
      title: result.title,
      data: result.data,
      type: result.type as any,
      sourceTool: result.sourceTool,
      createdAt: result.createdAt,
      previewThemeMode,
    });

    if (!didStartDownload) {
      setPreviewResult(result);
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'upload': return "bg-emerald-500/10 text-emerald-500";
      case 'quiz_gen': return "bg-purple-500/10 text-purple-500";
      case 'chat': return "bg-blue-500/10 text-blue-500";
      case 'image_gen': return "bg-amber-500/10 text-amber-500";
      case 'video_gen': return "bg-rose-500/10 text-rose-500";
      case 'infographic_gen': return "bg-indigo-500/10 text-indigo-500";
      case 'login': return "bg-zinc-500/10 text-zinc-500";
      default: return "bg-zinc-500/10 text-zinc-500";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return "text-amber-500 bg-amber-500/10";
      case 'Approved': return "text-emerald-500 bg-emerald-500/10";
      case 'Rejected': return "text-rose-500 bg-rose-500/10";
      case 'Modified': return "text-blue-500 bg-blue-500/10";
      default: return "text-zinc-500 bg-zinc-500/10";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Pending': return t('pending');
      case 'Approved': return t('approved');
      case 'Rejected': return t('rejected');
      case 'Modified': return t('modified');
      default: return status;
    }
  };

  return (
    <div className="space-y-12">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-emerald-600/20 rounded-2xl flex items-center justify-center text-emerald-500">
          <History size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('activityHistory')}</h2>
          <p className="text-zinc-500 text-sm">{t('trackRecentActions')}</p>
        </div>
      </div>

      {/* Generated Results Section */}
      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <h3 className="font-bold text-zinc-900 dark:text-white">{t('generatedResults', 'Generated Results')}</h3>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{results.length} {t('results', 'Results')}</span>
        </div>
        
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {results.length > 0 ? results.map((result, i) => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={result.id} 
              className="p-5 sm:p-6 flex flex-col gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4 sm:gap-5 min-w-0">
                  <div className={cn("w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0", getResultTone(result.type))}>
                    {getResultIcon(result.type)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                        {result.type}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                        {result.sourceTool}
                      </span>
                    </div>
                    <p className="mt-2 text-sm sm:text-base text-zinc-900 dark:text-white font-bold truncate sm:whitespace-normal">
                      {result.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-2">
                      <span className="text-[10px] sm:text-xs text-zinc-500">{formatResultDate(result.createdAt)}</span>
                      {result.expiresAt && (
                        <>
                          <div className="hidden sm:block w-1 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
                          <span className="text-[10px] sm:text-xs text-zinc-400">
                            {t('retainedUntil', { defaultValue: 'Retained until' })}: {formatResultDate(result.expiresAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button 
                    onClick={() => setPreviewResult(result)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-black uppercase tracking-[0.18em] rounded-2xl transition-all active:scale-95 cursor-pointer"
                  >
                    <Eye size={16} />
                    <span>{t('preview', { defaultValue: 'Preview' })}</span>
                  </button>
                  <button 
                    onClick={() => handleDetachedHistoryPreview(result)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-black uppercase tracking-[0.18em] rounded-2xl transition-all active:scale-95 cursor-pointer"
                  >
                    <ArrowUpRight size={16} />
                    <span>{t('openSeparately', { defaultValue: 'Open Separately' })}</span>
                  </button>
                  <button 
                    onClick={() => handleQuickDownload(result)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-[0.18em] rounded-2xl transition-all active:scale-95 cursor-pointer"
                  >
                    <Download size={16} />
                    <span>{t('download', { defaultValue: 'Download' })}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="p-12 text-center text-zinc-500 text-sm">{t('noResultsYet', 'No results yet.')}</div>
          )}
        </div>
      </div>

      {/* Credit Requests Section */}
      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <h3 className="font-bold text-zinc-900 dark:text-white">{t('creditRequests')}</h3>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{myRequests.length} {t('requests')}</span>
        </div>
        
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {myRequests.length > 0 ? myRequests.map((req, i) => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={req.id} 
              className="p-4 sm:p-6 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
                <CreditCard size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                  {req.type === 'Model Access' 
                    ? `${req.type} - ${req.targetModel}` 
                    : req.type === 'Page Access'
                    ? `${req.type} - ${req.targetPage}`
                    : `${req.type} - ${req.requestedAmount} ${t('credits')}`
                  }
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", getStatusColor(req.status))}>
                    {getStatusLabel(req.status)}
                  </span>
                  <span className="text-[10px] text-zinc-500">{new Date(req.createdAt).toLocaleDateString()}</span>
                  {req.unlockCode && (
                    <div className="flex items-center gap-1 ml-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                      <span className="font-bold">Code:</span> {req.unlockCode}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="p-12 text-center text-zinc-500 text-sm">{t('noCreditRequestsYet')}</div>
          )}
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="p-8 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
          <h3 className="font-bold text-zinc-900 dark:text-white">{t('recentActivity')}</h3>
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{userActivities.length} {t('eventsLogged')}</span>
        </div>
        
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {userActivities.length > 0 ? userActivities.map((activity, i) => (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              key={activity.id} 
              className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors group"
            >
              <div className={cn(
                "w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 shrink-0",
                getColor(activity.type)
              )}>
                {getIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base text-zinc-900 dark:text-white font-bold truncate sm:whitespace-normal">{activity.description}</p>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-zinc-400">{activity.type.replace('_', ' ')}</span>
                  <div className="hidden sm:block w-1 h-1 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
                  <span className="text-[10px] sm:text-xs text-zinc-500">{new Date(activity.timestamp).toLocaleString()}</span>
                </div>
              </div>
              <button className="w-full sm:w-auto px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer">
                {t('viewDetails')}
              </button>
            </motion.div>
          )) : (
            <div className="p-20 text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-3xl flex items-center justify-center text-zinc-300 dark:text-zinc-700 mx-auto">
                <History size={40} />
              </div>
              <div>
                <p className="text-zinc-900 dark:text-white font-bold text-lg">{t('noActivityYet')}</p>
                <p className="text-zinc-500 text-sm">{t('actionsAppearHere')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center py-4 text-zinc-400 dark:text-zinc-600 text-xs font-medium">
        {getRetentionPolicySummary(user?.plan) || t('resultRetentionPolicy', 'Results are automatically cleared according to your plan.')}
      </div>
      <div className="text-center py-8 text-zinc-500 dark:text-zinc-600 text-xs font-medium">
        © Zootopia Club – Copyright Ebn Abdallah Yousef
      </div>

      {previewResult && (
        <ResultPreview
          isOpen={!!previewResult}
          onClose={() => setPreviewResult(null)}
          title={previewResult.title}
          data={previewResult.data}
          type={previewResult.type as any}
          sourceTool={previewResult.sourceTool}
          createdAt={previewResult.createdAt}
        />
      )}
    </div>
  );
};

export default UserHistory;
