import * as React from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Plus, Trash2, Send, History, Eye, User, LayoutTemplate } from 'lucide-react';
import { auth } from '../../firebase';
import { cn } from '../../utils';
import toast from 'react-hot-toast';

export const EmailCenter: React.FC = () => {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [dynamicData, setDynamicData] = useState<string>('{}');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('manual');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const token = await auth.currentUser?.getIdToken();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    
    const [templatesRes, logsRes, usersRes] = await Promise.all([
      fetch('/api/admin/email/templates', { headers }),
      fetch('/api/admin/email/logs', { headers }),
      fetch('/api/admin/users', { headers })
    ]);
    
    setTemplates(await templatesRes.json());
    setLogs(await logsRes.json());
    setUsers(await usersRes.json());
  };

  const handleSendEmail = async () => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/admin/email/send-unified', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: selectedTemplate || null,
        recipientEmails: recipientEmails,
        subject,
        body,
        dynamicData: JSON.parse(dynamicData),
        purpose
      })
    });
    if (response.ok) {
      toast.success(t('email-sent-successfully'));
      fetchData();
    } else {
      toast.error(t('error-sending-email'));
    }
  };

  const handlePreview = () => {
    setIsPreviewOpen(true);
  };

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">{t('email-center')}</h2>
        <button className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/20" onClick={handleSendEmail}><Send className="w-4 h-4" /> {t('send-email')}</button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm space-y-6">
          <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-widest flex items-center gap-2"><Mail className="w-5 h-5 text-emerald-500" /> {t('compose-email')}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">{t('template')}</label>
              <select className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                <option value="">{t('select-template')}</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">{t('purpose')}</label>
              <select className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" value={purpose} onChange={e => setPurpose(e.target.value)}>
                <option value="manual">{t('manual')}</option>
                <option value="gift code">{t('gift-code')}</option>
                <option value="admin announcement">{t('admin-announcement')}</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-500 uppercase">{t('recipients')}</label>
            <select multiple className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 h-40" onChange={e => setRecipientEmails(Array.from(e.target.selectedOptions, option => option.value))}>
              {users.filter(u => u.email).map(u => <option key={u.id} value={u.email}>{u.email} ({u.username})</option>)}
            </select>
          </div>

          <input className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800" placeholder={t('subject')} value={subject} onChange={e => setSubject(e.target.value)} />
          <textarea className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 h-48" placeholder={t('body-html')} value={body} onChange={e => setBody(e.target.value)} />
          <textarea className="w-full p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 h-24" placeholder={t('dynamic-data-json')} value={dynamicData} onChange={e => setDynamicData(e.target.value)} />
          
          <button className="w-full py-3 bg-zinc-200 dark:bg-zinc-700 rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2" onClick={handlePreview}><Eye className="w-4 h-4" /> {t('preview')}</button>
        </div>

        <div className="space-y-8">
          <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
            <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-6 uppercase tracking-widest flex items-center gap-2"><LayoutTemplate className="w-5 h-5 text-blue-500" /> {t('templates')}</h3>
            {templates.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">{t('no-templates-found')}</p>
            ) : (
              <ul className="space-y-2">
                {templates.map(t => (
                  <li key={t.id} className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                    <span>{t.name}</span>
                    <button 
                      className="text-emerald-500 hover:text-emerald-400 font-bold text-xs uppercase"
                      onClick={() => {
                        setSelectedTemplate(t.id);
                        setSubject(t.subject || '');
                        setBody(t.htmlContent || '');
                        setDynamicData(JSON.stringify(t.dynamicFields || {}, null, 2));
                      }}
                    >
                      {t('edit')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setIsPreviewOpen(false)}>
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black mb-4">{subject}</h3>
            <div dangerouslySetInnerHTML={{ __html: body }} />
            <button className="mt-6 w-full py-3 bg-zinc-200 dark:bg-zinc-700 rounded-xl font-black uppercase tracking-widest" onClick={() => setIsPreviewOpen(false)}>{t('close')}</button>
          </div>
        </div>
      )}

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
        <h3 className="text-lg font-black text-zinc-900 dark:text-white mb-6 uppercase tracking-widest flex items-center gap-2"><History className="w-5 h-5 text-amber-500" /> {t('delivery-logs')}</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500 italic">{t('no-logs-found')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-500 uppercase tracking-widest text-[10px]">
                  <th className="text-start p-2">{t('recipient')}</th>
                  <th className="text-start p-2">{t('subject')}</th>
                  <th className="text-start p-2">{t('status')}</th>
                  <th className="text-start p-2">{t('date')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="p-2">{log.recipientEmail}</td>
                    <td className="p-2">{log.details?.subject || log.subject}</td>
                    <td className={cn("p-2 font-bold", log.status === 'sent' ? 'text-emerald-500' : 'text-red-500')}>{log.status}</td>
                    <td className="p-2">{new Date(log.sentAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
