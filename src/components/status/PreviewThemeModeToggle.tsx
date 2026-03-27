import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '../../utils';
import { ExportThemeMode } from '../../utils/exporters';

interface PreviewThemeModeToggleProps {
  value: ExportThemeMode;
  onChange: (mode: ExportThemeMode) => void;
  className?: string;
}

export const PreviewThemeModeToggle: React.FC<PreviewThemeModeToggleProps> = ({
  value,
  onChange,
  className,
}) => {
  const { t } = useLanguage();

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-900',
        className
      )}
    >
      <button
        onClick={() => onChange('light')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-all cursor-pointer',
          value === 'light'
            ? 'bg-white text-zinc-700 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
        )}
      >
        <Sun size={12} />
        <span>{t('light', { defaultValue: 'Light' })}</span>
      </button>

      <button
        onClick={() => onChange('dark')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] transition-all cursor-pointer',
          value === 'dark'
            ? 'bg-zinc-800 text-zinc-200 shadow-sm'
            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
        )}
      >
        <Moon size={12} />
        <span>{t('dark', { defaultValue: 'Dark' })}</span>
      </button>
    </div>
  );
};
