import React from 'react';
import { cn } from '../utils';

export const LoginLogo = ({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) => (
  <div className={cn("flex flex-col items-center", className)}>
    <div className={cn("drop-shadow-lg", compact ? "mb-4 h-16 w-16 sm:h-20 sm:w-20" : "mb-6 h-24 w-24")}>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <rect width="100" height="100" rx="24" fill="#065f46" /> {/* Dark Emerald */}
        <circle cx="28" cy="30" r="14" fill="white" />
        <circle cx="72" cy="30" r="14" fill="white" />
        <circle cx="28" cy="30" r="8" fill="#065f46" />
        <circle cx="72" cy="30" r="8" fill="#065f46" />
        <path d="M42 35 V45 L25 75 A 8 8 0 0 0 33 85 H67 A 8 8 0 0 0 75 75 L58 45 V35" fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="6" strokeLinejoin="round" />
        <path d="M36 35 H64" stroke="white" strokeWidth="6" strokeLinecap="round" />
        <circle cx="40" cy="60" r="4" fill="white" />
        <circle cx="60" cy="60" r="4" fill="white" />
        <circle cx="50" cy="68" r="3" fill="white" />
        <path d="M35 65 L25 62 M35 70 L25 72 M65 65 L75 62 M65 70 L75 72" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="50" cy="50" rx="42" ry="14" transform="rotate(30 50 50)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />
        <ellipse cx="50" cy="50" rx="42" ry="14" transform="rotate(-30 50 50)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />
      </svg>
    </div>
    <div className="text-center">
      <span className={cn("font-black tracking-tighter text-emerald-950 dark:text-white transition-colors", compact ? "text-2xl sm:text-3xl" : "text-4xl")}>ZOOTOPIA</span>
      <span className={cn("font-black tracking-tighter text-emerald-600", compact ? "text-2xl sm:text-3xl" : "text-4xl")}>CLUB</span>
      <p className={cn("font-bold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-400 transition-colors", compact ? "mt-1.5 text-[10px] sm:text-xs" : "mt-2 text-sm")}>AI Science Education Platform</p>
    </div>
  </div>
);
