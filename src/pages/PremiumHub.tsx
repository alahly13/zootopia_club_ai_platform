import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, Lock, ArrowRight, Zap, BrainCircuit, Globe, Code } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../firebase';

const PremiumHub = () => {
  const { user, notify } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      notify.error('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Missing authentication token');
      }

      const response = await fetch('/api/notifications/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user?.id,
          subject: `Waitlist Signup: Premium Hub`,
          message: `Email: ${email}\nUser ID: ${user?.id || 'N/A'}\nName: ${user?.name || 'N/A'}`
        })
      });

      if (!response.ok) throw new Error('Failed to join waitlist');
      
      notify.success('Successfully joined the waitlist! We will notify you when features are available.');
      if (!user) setEmail('');
    } catch (error) {
      notify.error('Failed to join waitlist. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };
  const upcomingFeatures = [
    {
      title: 'Advanced AI Models',
      description: 'Access to GPT-4o, Claude 3.5 Sonnet, and specialized science models.',
      icon: <BrainCircuit className="w-6 h-6" />,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10'
    },
    {
      title: 'Smart Research Assistant',
      description: 'Automated literature review and citation generation for your papers.',
      icon: <Globe className="w-6 h-6" />,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10'
    },
    {
      title: 'Team Collaboration',
      description: 'Work on projects together with real-time syncing and shared workspaces.',
      icon: <Code className="w-6 h-6" />,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10'
    },
    {
      title: 'Custom API Access',
      description: 'Integrate Zootopia Club\'s powerful AI tools directly into your own apps.',
      icon: <Zap className="w-6 h-6" />,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-12">
      <div className="text-center space-y-6">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center mx-auto text-white shadow-xl shadow-amber-500/20 mb-6"
        >
          <Sparkles className="w-10 h-10" />
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900 dark:text-white"
        >
          Premium Hub
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-lg text-zinc-500 max-w-2xl mx-auto"
        >
          Discover the next generation of AI tools coming to Zootopia Club.
        </motion.p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {upcomingFeatures.map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 + 0.2 }}
            className="p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 relative overflow-hidden group"
          >
            <div className="absolute top-4 end-4 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-bold rounded-full flex items-center gap-1">
              <Lock className="w-3 h-3" /> Coming Soon
            </div>
            <div className={`w-14 h-14 rounded-2xl ${feature.bg} ${feature.color} flex items-center justify-center mb-6`}>
              {feature.icon}
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">{feature.title}</h3>
            <p className="text-zinc-500 leading-relaxed mb-6">{feature.description}</p>
            <button className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2 group-hover:gap-3 transition-all">
              Notify me when available <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 p-12 rounded-[2.5rem] bg-gradient-to-br from-zinc-900 to-black text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="relative z-10 space-y-6 max-w-2xl mx-auto">
          <h2 className="text-3xl font-black text-white">Ready to upgrade your experience?</h2>
          <p className="text-zinc-400 text-lg">Join the waitlist for Zootopia Club Premium and get early access to these features before anyone else.</p>
          <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
              className="w-full sm:w-auto flex-1 px-6 py-4 bg-white/10 border border-white/20 rounded-2xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-8 py-4 bg-white text-black font-black rounded-2xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Joining...' : 'Join Waitlist'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PremiumHub;
