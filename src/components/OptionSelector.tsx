import * as React from 'react';
import { cn } from '../utils';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';

export interface OptionItem<T> {
  value: T;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  color?: string; // For color swatches
}

interface OptionSelectorProps<T> {
  options: OptionItem<T>[];
  value: T | T[];
  onChange: (value: T) => void;
  multiple?: boolean;
  layout?: 'grid' | 'list' | 'compact';
  className?: string;
}

export function OptionSelector<T extends string | number>({
  options,
  value,
  onChange,
  multiple = false,
  layout = 'grid',
  className
}: OptionSelectorProps<T>) {
  
  const isSelected = (val: T) => {
    if (multiple && Array.isArray(value)) {
      return value.includes(val);
    }
    return value === val;
  };

  const handleSelect = (val: T) => {
    onChange(val);
  };

  return (
    <div className={cn(
      "gap-3",
      layout === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : 
      layout === 'compact' ? "flex flex-wrap" : "flex flex-col",
      className
    )}>
      {options.map((option) => {
        const selected = isSelected(option.value);
        
        return (
          <button
            key={String(option.value)}
            onClick={() => handleSelect(option.value)}
            className={cn(
              "relative text-left transition-all duration-200 overflow-hidden group",
              layout === 'compact' 
                ? "px-4 py-2 rounded-xl border flex items-center gap-2" 
                : "p-4 rounded-2xl border flex items-start gap-3",
              selected 
                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500/50 dark:border-emerald-500/50 shadow-sm shadow-emerald-500/10" 
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/30 dark:hover:border-emerald-500/30 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            )}
          >
            {/* Selection Indicator Background */}
            {selected && (
              <motion.div
                layoutId={`selector-bg-${layout}`}
                className="absolute inset-0 bg-emerald-500/5 dark:bg-emerald-500/10 pointer-events-none"
                initial={false}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}

            {/* Color Swatch */}
            {option.color && (
              <div 
                className="w-5 h-5 rounded-full shrink-0 border border-zinc-200 dark:border-zinc-700 shadow-sm"
                style={{ backgroundColor: option.color }}
              />
            )}

            {/* Icon */}
            {option.icon && !option.color && (
              <div className={cn(
                "shrink-0 flex items-center justify-center rounded-xl",
                layout === 'compact' ? "w-5 h-5" : "w-10 h-10 bg-zinc-100 dark:bg-zinc-800",
                selected ? "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/50" : "text-zinc-500 dark:text-zinc-400 group-hover:text-emerald-500 transition-colors"
              )}>
                {option.icon}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn(
                  "font-medium truncate",
                  layout === 'compact' ? "text-sm" : "text-base",
                  selected ? "text-emerald-700 dark:text-emerald-300" : "text-zinc-700 dark:text-zinc-300"
                )}>
                  {option.label}
                </span>
                
                {/* Checkmark for grid/list layout */}
                {layout !== 'compact' && (
                  <div className={cn(
                    "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                    selected 
                      ? "bg-emerald-500 border-emerald-500 text-white" 
                      : "border-zinc-300 dark:border-zinc-700 bg-transparent"
                  )}>
                    {selected && <Check size={12} strokeWidth={3} />}
                  </div>
                )}
              </div>
              
              {option.description && layout !== 'compact' && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                  {option.description}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
