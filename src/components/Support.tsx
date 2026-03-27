import * as React from 'react';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { MessageSquare, Plus, Clock, CheckCircle2, XCircle, Send, Loader2 } from 'lucide-react';
import { cn, RequestType } from '../utils';
import { useStatus } from '../hooks/useStatus';
import { StatusIndicator } from './status/StatusIndicator';
import { StatusCard } from './status/StatusCard';
import { useLanguage } from '../contexts/LanguageContext';

const Support: React.FC = () => {
  const { user, userRequests, submitRequest } = useAuth();
  const { t } = useLanguage();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>('Increase Limit');
  const [message, setMessage] = useState('');
  const { status, message: statusMessage, error, setStatus, setError, isLoading, isSuccess, isError, reset } = useStatus();

  const myRequests = userRequests.filter(r => r.userId === user?.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    
    setStatus('processing', t('submittingYourRequest'));
    try {
      await submitRequest(requestType, message);
      setStatus('success', t('requestSubmittedSuccessfully'));
      setMessage('');
      setTimeout(() => {
        reset();
        setIsFormOpen(false);
      }, 3000);
    } catch (err: any) {
      console.error(err);
      setError(err, () => handleSubmit({ preventDefault: () => {} } as any));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
          <MessageSquare className="text-emerald-500" />
          {t('supportAndRequests')}
        </h2>
        <div className="flex items-center gap-4">
          <StatusIndicator status={status} message={statusMessage} />
          <button 
            onClick={() => {
              setIsFormOpen(!isFormOpen);
              if (isError) reset();
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2 cursor-pointer"
          >
            {isFormOpen ? t('cancel') : <><Plus size={16} /> {t('newRequest')}</>}
          </button>
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-3xl shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{t('submitARequest')}</h3>
            {isSuccess && (
              <div className="flex items-center gap-2 text-emerald-500 text-sm font-bold">
                <CheckCircle2 size={16} />
                {t('requestSent')}
              </div>
            )}
          </div>

          {isError && (
            <StatusCard 
              status={status}
              title={t('submissionError')}
              message={error?.message}
              onRetry={error?.retryAction}
              onDismiss={reset}
            />
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">{t('requestType')}</label>
              <select 
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as RequestType)}
                disabled={isLoading}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all disabled:opacity-50"
              >
                <option value="Increase Limit">{t('increaseDailyLimit')}</option>
                <option value="Premium Access">{t('requestPremiumAccess')}</option>
                <option value="Feature Activation">{t('featureActivation')}</option>
                <option value="Account Review">{t('accountReview')}</option>
                <option value="Other">{t('other')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-2">{t('message')}</label>
              <textarea 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('messagePlaceholder')}
                required
                disabled={isLoading}
                className="w-full h-32 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-all resize-none disabled:opacity-50"
              />
            </div>
            <div className="flex justify-end">
              <button 
                type="submit"
                disabled={!message.trim() || isLoading}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Send size={16} />
                )}
                {isLoading ? t('submitting') : t('submitRequest')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="font-bold text-zinc-900 dark:text-white">{t('yourRequests')}</h3>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {myRequests.length > 0 ? myRequests.map(req => (
            <div key={req.id} className="p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      {req.type}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-900 dark:text-white">{req.message}</p>
                </div>
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shrink-0",
                  req.status === 'Pending' ? "bg-amber-500/10 text-amber-600" :
                  req.status === 'Approved' ? "bg-emerald-500/10 text-emerald-600" :
                  "bg-red-500/10 text-red-600"
                )}>
                  {req.status === 'Pending' && <Clock size={14} />}
                  {req.status === 'Approved' && <CheckCircle2 size={14} />}
                  {req.status === 'Rejected' && <XCircle size={14} />}
                  {req.status === 'Pending' ? t('pending') : req.status === 'Approved' ? t('approved') : t('rejected')}
                </div>
              </div>
              {req.adminResponse && (
                <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">{t('adminResponse')}</p>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{req.adminResponse}</p>
                </div>
              )}
            </div>
          )) : (
            <div className="p-12 text-center text-zinc-500 text-sm italic">
              {t('noRequestsYet')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Support;
