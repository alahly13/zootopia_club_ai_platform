import * as React from 'react';
import { ArrowUpRight, Brain, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';
import { cn } from '../../../utils';

interface AnalysisLaunchCardProps {
  className?: string;
}

/**
 * Keep analysis navigation compact on the generator landing page.
 * The dashboard should hint that analysis is available without embedding a
 * second large workflow surface inline above the assessment experience.
 */
const AnalysisLaunchCard: React.FC<AnalysisLaunchCardProps> = ({ className }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <motion.button
      type="button"
      onClick={() => navigate('/analysis')}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'w-full rounded-[1.75rem] border border-emerald-500/20 bg-white/90 p-4 text-left shadow-lg shadow-emerald-500/8 transition-colors hover:border-emerald-500/30 hover:bg-white dark:bg-zinc-950/55 dark:hover:bg-zinc-950/70 sm:p-5',
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
            <Brain size={20} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                {t('uploadUI.analysisLaunchEyebrow', {
                  defaultValue: 'Separate analysis workspace',
                })}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                <Sparkles size={11} />
                {t('uploadUI.analysisLaunchStatus', { defaultValue: 'Ready' })}
              </span>
            </div>

            <p className="mt-2 text-base font-black tracking-tight text-zinc-900 dark:text-white sm:text-lg">
              {t('uploadUI.analysisLaunchTitle', {
                defaultValue: 'You can now analyze and summarize the lecture from here.',
              })}
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('uploadUI.analysisLaunchDescription', {
                defaultValue:
                  'Open the dedicated Analysis page whenever you want summaries, insights, and exports without crowding the quiz generator.',
              })}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 self-start rounded-2xl bg-emerald-600 px-4 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-500/20">
          <span>{t('uploadUI.analysisLaunchAction', { defaultValue: 'Open analysis page' })}</span>
          <ArrowUpRight size={16} />
        </div>
      </div>
    </motion.button>
  );
};

export default AnalysisLaunchCard;
