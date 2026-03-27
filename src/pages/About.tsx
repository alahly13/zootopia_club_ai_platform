import * as React from 'react';
import { motion } from 'motion/react';
import { BookOpen, BrainCircuit, ShieldCheck, Zap, GraduationCap, Microscope } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export const About: React.FC = () => {
  const { t } = useLanguage();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto p-6 md:p-12 space-y-16"
    >
      {/* Hero Section */}
      <div className="text-center space-y-6">
        <h1 className="text-5xl md:text-6xl font-extrabold text-zinc-900 dark:text-white tracking-tighter">
          {t('aboutTitle')}
        </h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto font-light">
          {t('aboutSubtitle')}
        </p>
      </div>

      {/* Platform Overview & Mission */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-zinc-50 dark:bg-zinc-900/50 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800">
          <BrainCircuit className="w-12 h-12 text-emerald-600 mb-6" />
          <h2 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-white">{t('platformOverview')}</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t('platformOverviewDesc')}
          </p>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-900/50 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800">
          <Zap className="w-12 h-12 text-emerald-600 mb-6" />
          <h2 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-white">{t('missionVision')}</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t('missionVisionDesc')}
          </p>
        </div>
      </div>

      {/* Developer Identity */}
      <div className="bg-white dark:bg-zinc-950 p-10 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-lg flex flex-col md:flex-row items-center gap-8">
        <div className="flex-shrink-0">
          <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
            <GraduationCap className="w-12 h-12 text-emerald-600" />
          </div>
        </div>
        <div className="flex-grow space-y-2 text-center md:text-left">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-600">{t('builtAndSupervised')}</h3>
          <p className="text-3xl font-bold text-zinc-900 dark:text-white">{t('developerName')}</p>
          <div className="flex flex-wrap justify-center md:justify-start gap-4 text-zinc-500">
            <span className="flex items-center gap-1"><BookOpen className="w-4 h-4" /> {t('developerClass')}</span>
            <span className="flex items-center gap-1"><Microscope className="w-4 h-4" /> {t('developerMajor')}</span>
          </div>
        </div>
      </div>

      {/* Why & Personal Note */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800">
          <h2 className="text-2xl font-bold mb-4 text-zinc-900 dark:text-white">{t('whyPlatformExists')}</h2>
          <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t('whyPlatformExistsDesc')}
          </p>
        </div>
        <div className="bg-emerald-600 text-white p-8 rounded-3xl shadow-xl shadow-emerald-500/20">
          <h2 className="text-2xl font-bold mb-4">{t('developerIntro')}</h2>
          <p className="leading-relaxed opacity-90">
            {t('developerIntroDesc')}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

