import * as React from 'react';
import { cn, COPYRIGHT } from '../utils';
import { Cpu } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Footer: React.FC<{ className?: string }> = ({ className }) => {
  const quickLinks = [
    { label: 'About', to: '/about' },
    { label: 'Plans', to: '/plans' },
    { label: 'Contact', to: '/contact' },
    { label: 'Support', to: '/support' },
  ];
  const shortCopyright = COPYRIGHT.split('\n')[0];

  return (
    <footer
      className={cn(
        'border-t border-zinc-200/80 bg-white/75 px-4 py-5 backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-950/75 sm:px-6',
        className
      )}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/15 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Cpu size={16} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-white">
                Zootopia Club
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                AI Science Education Platform
              </p>
            </div>
          </div>
        </div>

        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400"
        >
          {quickLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 lg:max-w-xs lg:text-right">
          {shortCopyright}
        </p>
      </div>
    </footer>
  );
};
