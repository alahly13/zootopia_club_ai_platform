import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, FileText, BarChart3, User } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../utils';
import { useAuth } from '../auth/AuthContext';
import {
  FACULTY_FAST_ACCESS_CONVERSION_PROMPT,
  isFacultyFastAccessUser,
  isFastAccessProfileCompletionPending,
} from '../constants/fastAccessPolicy';

export const FastAccessLockedState: React.FC<{ pageLabel?: string }> = ({ pageLabel = 'this area' }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const hasExhaustedFastAccessCredits =
    isFacultyFastAccessUser(user) &&
    !isFastAccessProfileCompletionPending(user) &&
    (user?.fastAccessCredits ?? 0) <= 0;

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl rounded-[2rem] border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl shadow-2xl overflow-hidden"
      >
        <div className="relative p-6 sm:p-8 lg:p-10 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-900 text-white">
          <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="relative z-10 flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Lock size={22} />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Fast Access</p>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                {hasExhaustedFastAccessCredits ? 'Complete Your Account To Continue' : 'Continue With Full Registration'}
              </h2>
              <p className="text-sm sm:text-base text-zinc-200 max-w-2xl">
                {hasExhaustedFastAccessCredits
                  ? FACULTY_FAST_ACCESS_CONVERSION_PROMPT
                  : `To continue beyond ${pageLabel}, complete full registration to unlock more tools, receive more credits, and keep your generated files and history permanently.`}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-700/60 bg-emerald-50/70 dark:bg-emerald-900/20 p-4 sm:p-5">
            <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300 mb-2">
              Continue Smoothly
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
              Full registration takes a moment and unlocks the complete platform, higher credits, and permanent saved results.
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Available now</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { id: 'assessment', label: 'Assessment Generator', icon: FileText },
                { id: 'analyze', label: 'Analyze', icon: Sparkles },
                { id: 'infographic', label: 'Infographic Generator', icon: BarChart3 },
              ].map((tool) => (
                <div
                  key={tool.id}
                  className={cn(
                    'rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 p-4',
                    'flex items-center gap-3'
                  )}
                >
                  <tool.icon size={18} className="text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">{tool.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex-1 px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-bold text-xs uppercase tracking-wider hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              Go To Assessment
            </button>
            <button
              type="button"
              onClick={() => navigate('/infographic')}
              className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-emerald-500 transition-colors"
            >
              Go To Infographic
            </button>
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs uppercase tracking-wider hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors inline-flex items-center justify-center gap-2"
              >
                <User size={14} /> Complete Your Account
              </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
