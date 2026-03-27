import React from 'react';
import { cn } from '../utils';

export const Logo = ({ className, iconClassName = "w-8 h-8", showText = true, shortTextOnMobile = false, textColor = "text-zinc-900 dark:text-white" }: { className?: string, iconClassName?: string, showText?: boolean, shortTextOnMobile?: boolean, textColor?: string }) => (
  <div className={cn("flex items-center gap-2 shrink-0", className)}>
    <div className={cn("shrink-0", iconClassName)}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
        <rect width="100" height="100" rx="24" fill="#10b981" />
        {/* Mouse Ears */}
        <circle cx="28" cy="30" r="14" fill="white" />
        <circle cx="72" cy="30" r="14" fill="white" />
        <circle cx="28" cy="30" r="8" fill="#10b981" />
        <circle cx="72" cy="30" r="8" fill="#10b981" />
        
        {/* Flask Body (Mouse Face) */}
        <path d="M42 35 V45 L25 75 A 8 8 0 0 0 33 85 H67 A 8 8 0 0 0 75 75 L58 45 V35" fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="6" strokeLinejoin="round" />
        <path d="M36 35 H64" stroke="white" strokeWidth="6" strokeLinecap="round" />
        
        {/* Mouse Eyes */}
        <circle cx="40" cy="60" r="4" fill="white" />
        <circle cx="60" cy="60" r="4" fill="white" />
        
        {/* Mouse Nose */}
        <circle cx="50" cy="68" r="3" fill="white" />
        
        {/* Whiskers */}
        <path d="M35 65 L25 62 M35 70 L25 72 M65 65 L75 62 M65 70 L75 72" stroke="white" strokeWidth="3" strokeLinecap="round" />
        
        {/* Atom orbits */}
        <ellipse cx="50" cy="50" rx="42" ry="14" transform="rotate(30 50 50)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />
        <ellipse cx="50" cy="50" rx="42" ry="14" transform="rotate(-30 50 50)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />
      </svg>
    </div>
    {showText && (
      <div className="flex flex-col">
        <span className={cn(
          "font-black text-xl tracking-tighter whitespace-nowrap leading-none",
          textColor,
          shortTextOnMobile ? "block" : "hidden sm:block"
        )}>
          {shortTextOnMobile ? (
            <>
              <span className={cn("hidden lg:inline", textColor)}>ZOOTOPIA</span>
              <span className={cn("lg:hidden", textColor)}>Z</span>
              <span className="text-emerald-500">
                <span className="hidden lg:inline">CLUB</span>
                <span className="lg:hidden">C</span>
              </span>
            </>
          ) : (
            <><span className={textColor}>ZOOTOPIA</span><span className="text-emerald-500">CLUB</span></>
          )}
        </span>
        <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-[0.2em] leading-none mt-1 hidden lg:block">
          AI Science Education Platform
        </span>
      </div>
    )}
  </div>
);
