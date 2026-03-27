import React from 'react';
import { motion } from 'motion/react';
import { Clock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

const WaitingForApproval: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
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
            <Clock className="w-12 h-12 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-stone-900 mb-4 font-sans">
          Account Awaiting Approval
        </h2>
        <p className="text-stone-600 text-center mb-8 font-sans">
          Your email has been verified successfully. Your account is now awaiting approval from the platform administrators. You will be notified once your account is active.
        </p>
        
        <button
          onClick={handleLogout}
          className="w-full bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold py-3 px-4 rounded-xl transition-colors"
        >
          Sign Out
        </button>
      </motion.div>
    </div>
  );
};

export default WaitingForApproval;
