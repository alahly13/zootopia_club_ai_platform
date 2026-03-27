import React from 'react';
import { motion } from 'motion/react';

const ScienceMouse: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="relative w-24 h-24"
    >
      {/* Mouse Body */}
      <svg viewBox="0 0 100 100" className="w-full h-full text-zinc-800">
        <circle cx="50" cy="60" r="30" fill="currentColor" />
        <circle cx="30" cy="40" r="15" fill="currentColor" />
        <circle cx="70" cy="40" r="15" fill="currentColor" />
        {/* Goggles */}
        <circle cx="42" cy="55" r="8" fill="none" stroke="#e4e4e7" strokeWidth="2" />
        <circle cx="58" cy="55" r="8" fill="none" stroke="#e4e4e7" strokeWidth="2" />
        <line x1="50" y1="55" x2="50" y2="55" stroke="#e4e4e7" strokeWidth="2" />
      </svg>
      
      {/* Micro-animations */}
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-4 start-1/2 -translate-x-1/2"
      >
        <div className="w-4 h-4 bg-emerald-400 rounded-full blur-sm" />
      </motion.div>
    </motion.div>
  );
};

export default ScienceMouse;
