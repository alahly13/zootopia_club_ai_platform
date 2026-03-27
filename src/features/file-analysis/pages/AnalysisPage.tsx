import * as React from 'react';
import { Brain, FileSearch, Sparkles } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useDocument } from '../../../contexts/DocumentContext';
import DocumentAnalysisWorkspace from '../components/DocumentAnalysisWorkspace';

const AnalysisPage: React.FC = () => {
  const { t } = useLanguage();
  const { hasDocument } = useDocument();

  return (
    <div className="space-y-6">
      <section className="rounded-[2.5rem] border border-zinc-200/80 bg-white/84 p-6 shadow-xl shadow-zinc-900/5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/55 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12">
                <Brain size={22} />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em]">
                  {t('uploadUI.analysisWorkspaceTitle', { defaultValue: 'Analysis Workspace' })}
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
                  {t('uploadUI.fullAnalysisTitle', { defaultValue: 'Document Analysis' })}
                </h1>
              </div>
            </div>
            <p className="max-w-4xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 sm:text-base">
              {t('uploadUI.fullAnalysisHint', {
                defaultValue:
                  'Open document analysis in a dedicated full-page workspace so you can inspect the uploaded file, run AI analysis manually, and export the result without crowding the assessment generator.',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              <FileSearch size={14} />
              <span>
                {hasDocument
                  ? t('uploadUI.analysisInputReady', { defaultValue: 'Analysis input ready' })
                  : t('uploadUI.documentWorkflowLabel', { defaultValue: 'Document workflow' })}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <Sparkles size={14} />
              <span>{t('waitingForAction')}</span>
            </div>
          </div>
        </div>
      </section>

      <DocumentAnalysisWorkspace variant="page" showBackToGenerator />
    </div>
  );
};

export default AnalysisPage;
