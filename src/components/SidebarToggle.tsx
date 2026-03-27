import React from 'react';
import { motion } from 'motion/react';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { cn } from '../utils';

interface SidebarToggleProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export const SidebarToggle: React.FC<SidebarToggleProps> = ({ isCollapsed, onToggle }) => {
  const ariaLabel = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <motion.button
      whileHover={{ scale: 1.04, y: -1 }}
      whileTap={{ scale: 0.96 }}
      onClick={onToggle}
      title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      aria-label={ariaLabel}
      aria-pressed={!isCollapsed}
      className={cn(
        'group relative w-11 h-11 flex items-center justify-center rounded-2xl border shadow-lg transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500 dark:focus-visible:ring-emerald-400 focus-visible:ring-offset-zinc-50 dark:focus-visible:ring-offset-zinc-950',
        isCollapsed 
          ? 'bg-gradient-to-br from-emerald-500 to-cyan-500 text-white border-emerald-300/40 shadow-emerald-500/25'
          : 'bg-gradient-to-br from-zinc-200 to-amber-100 dark:from-zinc-800 dark:to-zinc-700 text-zinc-700 dark:text-zinc-200 border-zinc-300/70 dark:border-zinc-700/80 shadow-zinc-900/10'
      )}
    >
      {/*
        Two-state accent ring intentionally differs between collapsed and expanded modes
        so users can identify "open" vs "close" affordance at a glance.
      */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-0 rounded-2xl transition-opacity duration-300',
          isCollapsed
            ? 'opacity-100 ring-1 ring-white/25'
            : 'opacity-100 ring-1 ring-amber-400/30 dark:ring-emerald-400/20'
        )}
      />

      <motion.div
        initial={false}
        animate={{ rotate: isCollapsed ? 0 : 180, x: isCollapsed ? 0 : -0.5 }}
        transition={{ duration: 0.26, ease: 'easeInOut' }}
        className="relative z-10"
      >
        {isCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
      </motion.div>

      <span className="sr-only">{ariaLabel}</span>
    </motion.button>
  );
};
