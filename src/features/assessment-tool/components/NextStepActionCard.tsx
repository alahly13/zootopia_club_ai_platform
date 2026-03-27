import * as React from 'react';
import { ArrowUpRight, LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../../utils';

type NextStepActionTone = 'summary' | 'questions';

interface NextStepActionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: NextStepActionTone;
  onClick: () => void;
}

const TONE_STYLES: Record<NextStepActionTone, {
  surface: string;
  icon: string;
  accent: string;
}> = {
  summary: {
    surface:
      'border-cyan-500/20 bg-cyan-500/10 hover:border-cyan-400/40 hover:bg-cyan-500/14',
    icon: 'bg-cyan-500/14 text-cyan-300',
    accent: 'text-cyan-300',
  },
  questions: {
    surface:
      'border-emerald-500/20 bg-emerald-500/10 hover:border-emerald-400/40 hover:bg-emerald-500/14',
    icon: 'bg-emerald-500/14 text-emerald-300',
    accent: 'text-emerald-300',
  },
};

/**
 * Feature-local CTA card used only by the upload-first assessment landing flow.
 * It keeps the dashboard hero focused while giving each next-step action its
 * own visual identity without introducing cross-feature coupling.
 */
const NextStepActionCard: React.FC<NextStepActionCardProps> = ({
  icon: Icon,
  title,
  description,
  tone,
  onClick,
}) => {
  const toneStyles = TONE_STYLES[tone];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'group flex w-full flex-col items-start gap-4 rounded-[1.9rem] border p-5 text-left shadow-lg shadow-black/10 transition-all sm:p-6',
        toneStyles.surface
      )}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', toneStyles.icon)}>
          <Icon size={22} />
        </div>

        <div className={cn('flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em]', toneStyles.accent)}>
          <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-black tracking-tight text-white sm:text-[1.35rem]">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-zinc-300">
          {description}
        </p>
      </div>
    </motion.button>
  );
};

export default NextStepActionCard;
