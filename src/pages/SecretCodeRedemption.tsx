import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { PageLock } from '../components/PageLock';
import { Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';
import { cleanString } from '../utils/validators';

export const SecretCodeRedemption: React.FC = () => {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleRedeem = async () => {
    const normalizedCode = cleanString(code);
    if (!normalizedCode || !user || !auth.currentUser) return;

    setLoading(true);
    setStatus('idle');
    
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/secrets/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ code: normalizedCode, userId: user.id })
      });

      const data = await response.json().catch(() => ({}));
      
      if (response.ok && data.success) {
        setStatus('success');
        setMessage(data.message || 'Secrets unlocked!');
        toast.success(data.message || 'Secrets unlocked!');
      } else {
        setStatus('error');
        setMessage(data.error || 'Verification failed');
        toast.error(data.error || 'Verification failed');
      }
    } catch (error) {
      setStatus('error');
      setMessage('An error occurred. Please try again.');
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLock pageId="secrets" pageName="Secret Code Redemption">
      <div className="flex flex-col h-full bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
            <Lock size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Secret Code Redemption</h2>
            <p className="text-sm text-zinc-500">Redeem your secret code to unlock special rewards</p>
          </div>
        </div>
        <div className="flex-1 p-6 flex flex-col items-center justify-center gap-4">
            {status === 'success' ? (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-4 text-emerald-600"
              >
                <CheckCircle size={64} className="animate-bounce" />
                <p className="text-2xl font-bold">Success!</p>
                <p className="text-lg text-zinc-700 dark:text-zinc-300 text-center">
                  {message || 'You have successfully redeemed your code and received 33 credits!'}
                </p>
              </motion.div>
            ) : (
              <>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter your secret code"
                  className="w-full max-w-xs p-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white"
                />
                <button
                  onClick={handleRedeem}
                  disabled={loading || !code}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 disabled:bg-zinc-400"
                >
                  {loading ? 'Verifying...' : 'Redeem Code'}
                </button>
                {status === 'error' && (
                  <div className="flex items-center gap-2 text-red-500">
                    <AlertCircle size={20} />
                    <p>{message}</p>
                  </div>
                )}
              </>
            )}
        </div>
      </div>
    </PageLock>
  );
};
