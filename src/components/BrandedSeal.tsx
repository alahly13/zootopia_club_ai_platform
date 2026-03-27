import React from 'react';
import { cn } from '../utils';

interface BrandedSealProps {
  className?: string;
}

export const BrandedSeal: React.FC<BrandedSealProps> = ({ className }) => {
  return (
    <div className={cn("flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity duration-300 select-none", className)}>
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
        <span className="text-[10px] font-black text-white leading-none tracking-tighter">ZC</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-900 dark:text-white leading-none mb-0.5">Zootopia Club</span>
        <span className="text-[8px] font-medium text-zinc-500 uppercase tracking-widest leading-none">By Ebn Abdallah</span>
      </div>
    </div>
  );
};
