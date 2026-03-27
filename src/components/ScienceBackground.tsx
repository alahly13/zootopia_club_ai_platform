import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useEgyptAuthBackground } from '../auth/useEgyptAuthBackground';

const ScienceBackground: React.FC = () => {
  const authBackground = useEgyptAuthBackground();

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Shared auth-background boundary:
          login, registration, and the surrounding auth shell all render through
          this component, so Egypt-time switching stays centralized here instead
          of being duplicated across individual auth modes. */}
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={authBackground.imagePath}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url('${authBackground.imagePath}')` }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_transparent_42%),linear-gradient(180deg,rgba(2,6,23,0.42),rgba(2,6,23,0.82)_42%,rgba(0,0,0,0.9))]" />
      <div className="absolute inset-0 bg-black/35 dark:bg-black/55" />

      {/* Molecular lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.08] text-emerald-100">
        <pattern id="molecular" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
          <circle cx="50" cy="50" r="2" fill="currentColor" />
          <line x1="50" y1="50" x2="80" y2="20" stroke="currentColor" strokeWidth="1" />
          <circle cx="80" cy="20" r="2" fill="currentColor" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#molecular)" />
      </svg>
      
      {/* Floating particles */}
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: Math.random() * 1000, y: Math.random() * 1000 }}
          animate={{ 
            y: [Math.random() * 1000, Math.random() * 1000],
            opacity: [0, 0.35, 0]
          }}
          transition={{ duration: 10 + Math.random() * 10, repeat: Infinity, ease: "linear" }}
          className="absolute h-2 w-2 rounded-full bg-emerald-300 blur-sm"
        />
      ))}
    </div>
  );
};

export default ScienceBackground;
