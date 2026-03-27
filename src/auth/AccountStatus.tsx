import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { Clock, XCircle, AlertTriangle, ShieldAlert, LogOut, Mail } from 'lucide-react';

interface AccountStatusProps {
  status: 'PendingAdminApproval' | 'Rejected' | 'Suspended' | 'Blocked';
}

export const AccountStatus: React.FC<AccountStatusProps> = ({ status }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (user.status === 'Active') {
      navigate('/');
    } else if (user.status !== status) {
      // Redirect to the correct status page
      switch (user.status) {
        case 'PendingAdminApproval': navigate('/waiting-approval'); break;
        case 'Rejected': navigate('/account-rejected'); break;
        case 'Suspended': navigate('/account-suspended'); break;
        case 'Blocked': navigate('/account-blocked'); break;
        default: navigate('/');
      }
    }
  }, [user, navigate, status]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const suspensionReason = user?.statusContext?.suspensionReason || user?.statusMessage;
  const reactivationMessage = user?.statusContext?.reactivationMessage;

  const statusConfig = {
    PendingAdminApproval: {
      icon: <Clock className="w-12 h-12 text-blue-600" />,
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      title: 'Account Awaiting Approval',
      message: 'Your email has been verified successfully. Your account is currently under review by the platform administrators. You will be notified once your account is approved.',
    },
    Rejected: {
      icon: <XCircle className="w-12 h-12 text-red-600" />,
      bg: 'bg-red-50',
      border: 'border-red-100',
      title: 'Account Application Rejected',
      message: 'Unfortunately, your account application has not been approved at this time.',
    },
    Suspended: {
      icon: <AlertTriangle className="w-12 h-12 text-orange-600" />,
      bg: 'bg-orange-50',
      border: 'border-orange-100',
      title: 'Account Suspended',
      message: suspensionReason || 'Your account has been temporarily suspended. Please contact support for more information.',
    },
    Blocked: {
      icon: <ShieldAlert className="w-12 h-12 text-red-600" />,
      bg: 'bg-red-50',
      border: 'border-red-100',
      title: 'Account Blocked',
      message: suspensionReason || 'Your account has been blocked due to a violation of our terms of service.',
    }
  };

  const config = statusConfig[status];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border ${config.border}`}
      >
        <div className="flex justify-center mb-6">
          <div className={`${config.bg} p-4 rounded-full`}>
            {config.icon}
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-stone-900 mb-4 font-sans">
          {config.title}
        </h2>
        <p className="text-stone-600 text-center mb-8 font-sans leading-relaxed">
          {config.message}
        </p>

        {status === 'Suspended' && reactivationMessage && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
            <p className="font-semibold">Reactivation Note</p>
            <p className="mt-1">{reactivationMessage}</p>
          </div>
        )}
        
        <div className="space-y-4">
          <button
            onClick={() => window.location.href = 'mailto:support@zootopiaclub.com'}
            className="w-full flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Support
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-stone-500 hover:text-stone-700 py-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </motion.div>
      
      <div className="mt-12 text-center text-stone-400 text-xs font-medium tracking-wider uppercase space-y-1">
        <p>© Zootopia Club – Copyright Ebn Abdallah Yousef</p>
        <p>Class of 2022 – Chemistry & Zoology Double Major – Batch 22</p>
      </div>
    </div>
  );
};
