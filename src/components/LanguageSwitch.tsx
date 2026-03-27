import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../utils';

export const LanguageSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const { language, toggleLanguage } = useLanguage();

  return (
    <div className={cn("flex items-center bg-zinc-100 dark:bg-zinc-900 rounded-xl p-1 border border-zinc-200 dark:border-zinc-800", className)}>
      <button
        onClick={() => language !== 'en' && toggleLanguage()}
        className={cn(
          "px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-lg transition-all duration-200 whitespace-nowrap",
          language === 'en'
            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
            : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        )}
      >
        EN
      </button>
      <button
        onClick={() => language !== 'ar' && toggleLanguage()}
        className={cn(
          "px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold rounded-lg transition-all duration-200 whitespace-nowrap",
          language === 'ar'
            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
            : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        )}
      >
        عربي
      </button>
    </div>
  );
};
