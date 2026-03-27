import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Mail, RefreshCw, ArrowLeft } from 'lucide-react';

const EmailVerification: React.FC = () => {
  const { user, resendVerificationEmail, checkEmailVerificationStatus } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (user.isVerified) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleResend = async () => {
    setIsResending(true);
    setMessage(null);
    try {
      await resendVerificationEmail();
      setMessage({ type: 'success', text: t('auth.verificationEmailResent') });
    } catch (error) {
      setMessage({ type: 'error', text: t('auth.errorResendingEmail') });
    } finally {
      setIsResending(false);
    }
  };

  const handleRefresh = async () => {
    await checkEmailVerificationStatus();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-emerald-100"
      >
        <div className="flex justify-center mb-6">
          <div className="bg-emerald-50 p-4 rounded-full">
            <Mail className="w-12 h-12 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-stone-900 mb-4 font-sans">
          {t('auth.checkYourEmail')}
        </h2>
        <p className="text-stone-600 text-center mb-8 font-sans">
          {t('auth.verificationLinkSent')} <span className="font-semibold">{user?.email}</span>.
        </p>
        
        {message && (
          <div className={`p-4 rounded-lg mb-6 text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {message.text}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleResend}
            disabled={isResending}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isResending ? 'animate-spin' : ''}`} />
            {t('auth.resendEmail')}
          </button>
          <button
            onClick={handleRefresh}
            className="w-full bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            {t('auth.checkStatus')}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full flex items-center justify-center gap-2 text-stone-500 hover:text-stone-700 py-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('auth.backToLogin')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default EmailVerification;
