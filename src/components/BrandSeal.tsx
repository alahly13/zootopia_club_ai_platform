import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { cn } from '../utils';

interface BrandSealProps {
  className?: string;
}

export const BrandSeal: React.FC<BrandSealProps> = ({ className }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
      className={cn(
        "pointer-events-none select-none opacity-30 dark:opacity-20 mix-blend-multiply dark:mix-blend-screen",
        className
      )}
    >
      <div className="flex items-center gap-3 px-4 py-2 rounded-full border border-zinc-900/20 dark:border-white/20 bg-zinc-900/5 dark:bg-white/5 backdrop-blur-sm">
        <Sparkles size={14} className="text-zinc-900 dark:text-white" />
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-white leading-tight">
            Zootopia Club
          </span>
          <span className="text-[8px] font-medium uppercase tracking-widest text-zinc-600 dark:text-zinc-400 leading-tight">
            Ebn Abdallah '22
          </span>
        </div>
      </div>
    </motion.div>
  );
};
