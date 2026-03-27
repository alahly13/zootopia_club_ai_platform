import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Rocket, 
  Construction, 
  CheckCircle2, 
  Clock, 
  Zap, 
  Brain, 
  Globe, 
  Shield, 
  Sparkles,
  Cpu,
  Database,
  Code2,
  ArrowRight,
  Crown,
  Lock
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../utils';
import toast from 'react-hot-toast';

const ProjectCard = ({ 
  id,
  title, 
  description, 
  status, 
  icon: Icon, 
  tags, 
  progress,
  isPremium
}: { 
  id: string;
  title: string; 
  description: string; 
  status: 'completed' | 'in-progress' | 'planned'; 
  icon: any; 
  tags: string[]; 
  progress?: number;
  isPremium?: boolean;
}) => {
  const { t } = useLanguage();
  const { user, isAdmin, submitRequest } = useAuth();
  const [isRequesting, setIsRequesting] = useState(false);

  const isUnlocked = isAdmin || user?.unlockedProjects?.includes(id);

  const handleJoinRequest = async () => {
    if (!user) {
      toast.error('Please login to request access to premium projects');
      return;
    }
    setIsRequesting(true);
    try {
      await submitRequest('Project Join', `Requesting to join project: ${title}`, undefined, id);
    } finally {
      setIsRequesting(false);
    }
  };

  const statusConfig = {
    completed: {
      color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
      icon: CheckCircle2,
      label: 'Completed'
    },
    'in-progress': {
      color: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      icon: Clock,
      label: 'In Progress'
    },
    planned: {
      color: 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20',
      icon: Rocket,
      label: 'Planned'
    }
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={cn(
        "group relative bg-white/40 dark:bg-zinc-900/40 backdrop-blur-xl border rounded-3xl p-6 transition-all duration-500 flex flex-col h-full",
        isPremium 
          ? "border-amber-500/20 hover:border-amber-500/40 shadow-lg shadow-amber-500/5" 
          : "border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/30"
      )}
    >
      {isPremium && (
        <div className="absolute -top-3 -right-3 w-10 h-10 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-amber-500/30 z-10 border-2 border-white dark:border-zinc-900">
          <Crown size={18} className="drop-shadow-sm" />
        </div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500 shadow-inner",
          status === 'completed' ? 'bg-emerald-500/20 text-emerald-500' : 
          status === 'in-progress' ? 'bg-amber-500/20 text-amber-500' : 
          'bg-zinc-500/20 text-zinc-500'
        )}>
          <Icon size={24} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest",
            config.color
          )}>
            <StatusIcon size={10} />
            {config.label}
          </div>
          {isPremium && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md text-[8px] font-black uppercase tracking-tighter border border-amber-500/20">
              <Sparkles size={8} />
              Premium
            </div>
          )}
        </div>
      </div>

      <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-2 uppercase tracking-tight flex items-center gap-2">
        {title}
      </h3>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 line-clamp-2">
        {description}
      </p>

      <div className="flex-grow">
        {status === 'in-progress' && progress !== undefined && (
          <div className="mb-6 space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              <span>Development Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                whileInView={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-amber-500 rounded-full"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map(tag => (
            <span key={tag} className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-lg text-[9px] font-bold uppercase tracking-widest">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
        {isPremium && !isUnlocked ? (
          <button
            onClick={handleJoinRequest}
            disabled={isRequesting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-black uppercase tracking-widest text-[10px] rounded-xl transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-amber-500/20"
          >
            {isRequesting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Lock size={14} />
                Request to Join
              </>
            )}
          </button>
        ) : isPremium && isUnlocked ? (
          <div className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500/10 text-emerald-500 font-black uppercase tracking-widest text-[10px] rounded-xl text-center border border-emerald-500/20">
            <CheckCircle2 size={14} />
            Access Granted
          </div>
        ) : (
          <div className="w-full py-3 bg-zinc-100 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 font-black uppercase tracking-widest text-[10px] rounded-xl text-center">
            Public Project
          </div>
        )}
      </div>
    </motion.div>
  );
};

const Projects = () => {
  const { t } = useLanguage();

  const projects = [
    {
      id: 'neural-engine-v2',
      title: "Zootopia Neural Engine v2",
      description: "A complete overhaul of our AI orchestration layer with support for multi-modal reasoning and real-time feedback loops.",
      status: 'completed' as const,
      icon: Brain,
      tags: ['AI', 'Infrastructure', 'Real-time'],
      isPremium: true
    },
    {
      id: 'viz-studio',
      title: "Scientific Visualization Studio",
      description: "Advanced 3D visualization tools for biological pathways and chemical structures directly in the browser.",
      status: 'in-progress' as const,
      icon: Sparkles,
      tags: ['3D', 'Bio-Tech', 'Visualization'],
      progress: 65,
      isPremium: true
    },
    {
      id: 'collab-hub',
      title: "Global Collaboration Hub",
      description: "Real-time collaborative study rooms with shared whiteboards and AI-assisted group discussions.",
      status: 'planned' as const,
      icon: Globe,
      tags: ['Social', 'Real-time', 'Education'],
      isPremium: true
    },
    {
      id: 'mobile-native',
      title: "Mobile Native Experience",
      description: "Dedicated iOS and Android applications with offline study capabilities and push notifications.",
      status: 'planned' as const,
      icon: Rocket,
      tags: ['Mobile', 'Native', 'Offline']
    },
    {
      id: 'security-protocol',
      title: "Advanced Security Protocol",
      description: "Implementing end-to-end encryption for sensitive research documents and biometric authentication.",
      status: 'in-progress' as const,
      icon: Shield,
      tags: ['Security', 'Privacy', 'Encryption'],
      progress: 40,
      isPremium: true
    },
    {
      id: 'model-training',
      title: "Custom Model Training",
      description: "Allowing institutions to fine-tune Zootopia models on their own proprietary scientific datasets.",
      status: 'planned' as const,
      icon: Cpu,
      tags: ['ML', 'Enterprise', 'Training'],
      isPremium: true
    }
  ];

  return (
    <div className="space-y-12 pb-12">
      <header className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
            <Construction size={20} />
          </div>
          <h1 className="text-3xl font-black text-zinc-900 dark:text-white uppercase tracking-tighter">
            {t('projects')}
          </h1>
        </div>
        <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl text-lg">
          Explore the future of Zootopia Club. We are constantly innovating to provide the most advanced scientific learning tools.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project, idx) => (
          <ProjectCard key={idx} {...project} />
        ))}
      </div>

      <section className="bg-zinc-900 dark:bg-zinc-950 rounded-[2.5rem] p-8 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full" />
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tighter">
              Have a feature request?
            </h2>
            <p className="text-zinc-400 max-w-xl">
              Our roadmap is driven by our community. If you have an idea for a tool that could help your scientific journey, we want to hear it.
            </p>
          </div>
          <button className="flex items-center gap-2 px-8 py-4 bg-white text-zinc-900 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-emerald-500 hover:text-white transition-all active:scale-95">
            Submit Feature Request
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-6 bg-zinc-100 dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-zinc-800">
          <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-900 dark:text-white mb-4 shadow-sm">
            <Code2 size={20} />
          </div>
          <h4 className="font-black text-zinc-900 dark:text-white uppercase tracking-widest text-xs mb-2">Open Source</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Contributing to the scientific community through open-source initiatives.</p>
        </div>
        <div className="p-6 bg-zinc-100 dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-zinc-800">
          <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-900 dark:text-white mb-4 shadow-sm">
            <Database size={20} />
          </div>
          <h4 className="font-black text-zinc-900 dark:text-white uppercase tracking-widest text-xs mb-2">Data Integrity</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Ensuring the highest standards of scientific data accuracy and provenance.</p>
        </div>
        <div className="p-6 bg-zinc-100 dark:bg-zinc-900/50 rounded-3xl border border-zinc-200 dark:border-zinc-800">
          <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-900 dark:text-white mb-4 shadow-sm">
            <Zap size={20} />
          </div>
          <h4 className="font-black text-zinc-900 dark:text-white uppercase tracking-widest text-xs mb-2">Performance</h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Optimizing every interaction for speed and scientific workflow efficiency.</p>
        </div>
      </div>
    </div>
  );
};

export default Projects;
