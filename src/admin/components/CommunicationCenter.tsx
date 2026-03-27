import * as React from 'react';
import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Loader2,
  Sparkles,
  Key,
  Search,
  Users,
  CheckCircle2,
  FileText,
  Settings2,
  Eye,
  ShieldAlert,
  RefreshCw,
  Mail,
  Bell,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { isUserAdmin } from '../../auth/accessControl';
import { Purpose } from '../../types/communication';
import { purposeDispatchService } from '../../services/purposeDispatchService';
import { templates } from '../../services/communicationTemplates';
import toast from 'react-hot-toast';
import { cn } from '../../utils';
import { auth } from '../../firebase';
import { cleanString, toPositiveInteger } from '../../utils/validators';

type DeliveryChannel = 'internal' | 'email' | 'both';
type MessageType = 'message' | 'notification' | 'popup' | 'toast';
type UsageMode = 'single-use' | 'limited-use' | 'unlimited-use';

type NormalizedRecipient = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  status: string;
  authProviders: string[];
  picture?: string;
};

type DispatchSummary = {
  attempted: number;
  success: number;
  failed: number;
};

type GeneratedCodeResponse = {
  code?: string;
  id?: string;
  success?: boolean;
  error?: string;
};

const PURPOSES_REQUIRING_CODE: Purpose[] = [
  'gift-code',
  'secrets-access',
  'model-unlock',
  'tool-unlock',
  'chat-unlock',
];

/**
 * Normalize legacy / incomplete user documents so recipient rendering
 * remains stable even if some Firestore user docs were created before
 * the latest schema updates.
 */
function normalizeRecipient(raw: any): NormalizedRecipient {
  const providers = Array.isArray(raw?.authProviders)
    ? raw.authProviders.filter(Boolean)
    : [];

  return {
    id: String(raw?.id || raw?.uid || ''),
    name: String(raw?.name || raw?.displayName || 'Unknown User'),
    email: String(raw?.email || ''),
    username: String(raw?.username || ''),
    role: String(raw?.role || 'user'),
    status: String(raw?.status || raw?.accountStatus || 'unknown'),
    authProviders: providers,
    picture: raw?.picture || raw?.photoURL || '',
  };
}

function normalizeStatusLabel(status: string) {
  const s = String(status || '').toLowerCase();

  if (s === 'active') return 'Active';
  if (s === 'pendingadminapproval' || s === 'pending_admin_approval') return 'Pending Approval';
  if (s === 'pendingemailverification' || s === 'pending_email_verification') return 'Pending Email Verification';
  if (s === 'blocked') return 'Blocked';
  if (s === 'suspended') return 'Suspended';
  if (s === 'rejected') return 'Rejected';

  return status || 'Unknown';
}

function purposeRequiresCode(purpose: Purpose) {
  return PURPOSES_REQUIRING_CODE.includes(purpose);
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>();
  items.forEach((item) => {
    if (item?.id) map.set(item.id, item);
  });
  return Array.from(map.values());
}

function getMessageTypeIcon(type: MessageType) {
  switch (type) {
    case 'notification':
      return Bell;
    case 'popup':
      return Zap;
    case 'toast':
      return Sparkles;
    default:
      return MessageSquare;
  }
}

export const CommunicationCenter: React.FC = () => {
  const { t } = useTranslation();
  const { allUsers, isAdmin } = useAuth();

  // Form state
  const [channel, setChannel] = useState<DeliveryChannel>('internal');
  const [messageType, setMessageType] = useState<MessageType>('message');
  const [purpose, setPurpose] = useState<Purpose>('manual');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');

  // Code config
  const [usageMode, setUsageMode] = useState<UsageMode>('single-use');
  const [maxUses, setMaxUses] = useState<number>(1);
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [neverExpires, setNeverExpires] = useState<boolean>(true);

  // Recipient state
  const [searchQuery, setSearchQuery] = useState('');
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [sendToSelf, setSendToSelf] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showCodeOptions, setShowCodeOptions] = useState(false);
  const [dispatchSummary, setDispatchSummary] = useState<DispatchSummary | null>(null);

  const normalizedUsers = useMemo<NormalizedRecipient[]>(() => {
    return (allUsers || [])
      .map(normalizeRecipient)
      .filter((u) => !!u.id);
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return normalizedUsers;

    return normalizedUsers.filter((u) => {
      const providerText = u.authProviders.join(' ').toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        providerText.includes(q)
      );
    });
  }, [normalizedUsers, searchQuery]);

  const selectedRecipients = useMemo(() => {
    const map = new Map(normalizedUsers.map((u) => [u.id, u]));
    return recipientIds.map((id) => map.get(id)).filter(Boolean) as NormalizedRecipient[];
  }, [normalizedUsers, recipientIds]);

  const selectedTemplate = useMemo(() => {
    return templates.find((tpl) => tpl.id === selectedTemplateId) || null;
  }, [selectedTemplateId]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      const purposeMatch = tpl.purpose === purpose;
      if (!purposeMatch) return false;

      // "both" means admins may deliver via both channels, so show both sets.
      if (channel === 'both') {
        return tpl.channel === 'internal' || tpl.channel === 'email';
      }

      return tpl.channel === channel;
    });
  }, [purpose, channel]);

  React.useEffect(() => {
    if (!selectedTemplateId) return;

    const stillValid = filteredTemplates.some((tpl) => tpl.id === selectedTemplateId);
    if (!stillValid) {
      setSelectedTemplateId('');
    }
  }, [filteredTemplates, selectedTemplateId]);

  const handleTemplateChange = useCallback((templateId: string) => {
    setSelectedTemplateId(templateId);

    const template = templates.find((tpl) => tpl.id === templateId);
    if (!template) return;

    setTitle(template.title || '');
    setMessage(template.message || '');
  }, []);

  React.useEffect(() => {
    if (!purposeRequiresCode(purpose)) {
      setCode('');
      setShowCodeOptions(false);
      setUsageMode('single-use');
      setMaxUses(1);
      setExpiresAt('');
      setNeverExpires(true);
    }
  }, [purpose]);

  const toggleRecipient = useCallback((id: string) => {
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }, []);

  const selectAllFiltered = useCallback(() => {
    const newIds = new Set([...recipientIds, ...filteredUsers.map((u) => u.id)]);
    setRecipientIds(Array.from(newIds));
  }, [recipientIds, filteredUsers]);

  const clearRecipients = useCallback(() => {
    setRecipientIds([]);
  }, []);

  const generateCode = useCallback(async () => {
    if (!purposeRequiresCode(purpose)) {
      toast.error('This purpose does not require a code.');
      return;
    }

    const normalizedTitle = cleanString(title);
    const normalizedMessage = cleanString(message);
    const normalizedNotes = cleanString(notes);
    const normalizedTemplateId = cleanString(selectedTemplateId);
    const normalizedMaxUses = usageMode === 'limited-use' ? toPositiveInteger(maxUses) : null;

    try {
      setIsGeneratingCode(true);
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Not authenticated');

      if (usageMode === 'limited-use' && !normalizedMaxUses) {
        throw new Error('Max uses must be a positive integer.');
      }

      const res = await fetch('/api/admin/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          purpose,
          usageMode,
          maxUses: usageMode === 'limited-use' ? normalizedMaxUses : undefined,
          expiresAt: neverExpires ? null : cleanString(expiresAt) || null,
          neverExpires,
          title: normalizedTitle,
          description: normalizedMessage,
          notes: normalizedNotes,
          deliveryChannel: channel,
          messageType,
          templateId: normalizedTemplateId || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as GeneratedCodeResponse | null;
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to generate code');
      }

      setCode(data?.code || '');
      toast.success(t('code-generated', { defaultValue: 'Code generated successfully' }));
    } catch (error: any) {
      console.error('Code generation error:', error);
      toast.error(error?.message || t('error-generating-code', { defaultValue: 'Failed to generate code' }));
    } finally {
      setIsGeneratingCode(false);
    }
  }, [
    purpose,
    usageMode,
    maxUses,
    neverExpires,
    expiresAt,
    title,
    message,
    notes,
    channel,
    messageType,
    selectedTemplateId,
    t,
  ]);

  const validateDispatch = useCallback(() => {
    const requiresCode = purposeRequiresCode(purpose);

    if (!isAdmin) {
      toast.error('Only admins can access this page.');
      return false;
    }

    if (recipientIds.length === 0 && !sendToSelf) {
      toast.error(t('no-recipients-selected', { defaultValue: 'No recipients selected' }));
      return false;
    }

    if (!cleanString(title)) {
      toast.error(t('title-required', { defaultValue: 'Title is required' }));
      return false;
    }

    if (!cleanString(message)) {
      toast.error(t('message-required', { defaultValue: 'Message is required' }));
      return false;
    }

    if ((channel === 'email' || channel === 'both') && selectedRecipients.length === 0 && !sendToSelf) {
      // keep soft validation; actual per-target validation happens below
    }

    if (requiresCode && !cleanString(code)) {
      toast.error(t('code-required', { defaultValue: 'A code is required for this purpose' }));
      return false;
    }

    if (usageMode === 'limited-use' && (!maxUses || maxUses < 1)) {
      toast.error('Max uses must be at least 1.');
      return false;
    }

    if (!neverExpires && !expiresAt) {
      toast.error('Please choose an expiration date or enable never expires.');
      return false;
    }

    if (!neverExpires && expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
      toast.error('Expiration date is invalid.');
      return false;
    }

    return true;
  }, [
    purpose,
    isAdmin,
    recipientIds.length,
    sendToSelf,
    title,
    message,
    channel,
    code,
    usageMode,
    maxUses,
    neverExpires,
    expiresAt,
    t,
    selectedRecipients.length,
  ]);

  const resetAfterSuccess = useCallback(() => {
    setTitle('');
    setMessage('');
    setCode('');
    setNotes('');
    setRecipientIds([]);
    setSendToSelf(false);
    setSelectedTemplateId('');
  }, []);

  const ensureCodeIssuedForRecipient = useCallback(async (recipientUserId: string) => {
    const normalizedCode = cleanString(code);
    const normalizedRecipientUserId = cleanString(recipientUserId);
    const normalizedMaxUses = toPositiveInteger(maxUses);

    if (!normalizedCode || !purposeRequiresCode(purpose) || !normalizedRecipientUserId) return;

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) throw new Error('Not authenticated');

    if (purpose === 'gift-code') {
      const res = await fetch('/api/admin/gift-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          code: normalizedCode,
          amount: 100,
          isActive: true,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || 'Failed to create gift code');
      }

      return;
    }

    const res = await fetch('/api/secrets/issue-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        code: normalizedCode,
        userId: normalizedRecipientUserId,
        purpose,
        maxUsage:
          usageMode === 'limited-use'
            ? (normalizedMaxUses || 1)
            : usageMode === 'unlimited-use'
            ? 999999
            : 1,
        expiresAt: neverExpires ? null : cleanString(expiresAt) || null,
      }),
    });

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(payload?.error || 'Failed to issue code');
    }
  }, [code, purpose, usageMode, maxUses, neverExpires, expiresAt]);

  const handleDispatch = useCallback(async () => {
    if (!validateDispatch()) return;

    setIsLoading(true);
    setDispatchSummary(null);

    let successCount = 0;
    let failureCount = 0;

    const targets: NormalizedRecipient[] = [...selectedRecipients];

    if (sendToSelf && currentUser?.id) {
      targets.push(
        normalizeRecipient({
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          username: currentUser.username,
          role: currentUser.role,
          status: currentUser.status,
          authProviders: currentUser.authProviders,
          picture: currentUser.picture,
        })
      );
    }

    const finalTargets = dedupeById(targets);

    try {
      for (const target of finalTargets) {
        try {
          if ((channel === 'email' || channel === 'both') && !cleanString(target.email)) {
            throw new Error(`Recipient ${target.name} has no email.`);
          }

          await ensureCodeIssuedForRecipient(target.id);

          await purposeDispatchService.dispatch({
            userId: target.id,
            purpose,
            title,
            message,
            code,
            email: target.email,
            channel,
            type: messageType,
            notes,
          });

          successCount += 1;
        } catch (error) {
          console.error(`Failed to dispatch to ${target.email || target.id}:`, error);
          failureCount += 1;
        }
      }

      const summary = {
        attempted: finalTargets.length,
        success: successCount,
        failed: failureCount,
      };

      setDispatchSummary(summary);

      if (failureCount === 0) {
        toast.success(
          t('dispatch-successful', { defaultValue: 'Dispatch completed successfully' })
        );
        resetAfterSuccess();
      } else {
        toast.error(`Dispatch finished with ${failureCount} failure(s). ${successCount} succeeded.`);
      }
    } catch (error: any) {
      console.error('Critical failure during dispatch:', error);
      toast.error(error?.message || t('error-dispatching', { defaultValue: 'Dispatch failed' }));
    } finally {
      setIsLoading(false);
    }
  }, [
    validateDispatch,
    selectedRecipients,
    sendToSelf,
    currentUser,
    ensureCodeIssuedForRecipient,
    purpose,
    title,
    message,
    code,
    channel,
    messageType,
    notes,
    t,
    resetAfterSuccess,
  ]);

  if (!isAdmin) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50 p-8">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-2xl bg-red-100 dark:bg-red-900/30">
            <ShieldAlert className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-red-700 dark:text-red-300">
              Admin access required
            </h3>
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              This communication workspace is restricted to platform administrators only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const requiresCode = purposeRequiresCode(purpose);
  const TypeIcon = getMessageTypeIcon(messageType);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl overflow-hidden flex flex-col xl:flex-row">
      <div className="flex-1 p-6 md:p-8 xl:p-10 border-b xl:border-b-0 xl:border-r border-zinc-200 dark:border-zinc-800 space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            {t('communication-center', { defaultValue: 'Communication Center' })}
          </h3>

          <button
            onClick={() => setShowPreview((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <Eye className="w-4 h-4" />
            {showPreview ? t('edit', { defaultValue: 'Edit' }) : t('preview', { defaultValue: 'Preview' })}
          </button>
        </div>

        {showPreview ? (
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-700 space-y-6">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">
              <Eye className="w-4 h-4" /> Message Preview
            </div>

            <div className="flex items-center gap-2">
              <TypeIcon className="w-5 h-5 text-blue-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                {messageType}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">•</span>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                {channel}
              </span>
            </div>

            <h4 className="text-2xl font-bold text-zinc-900 dark:text-white">
              {title || 'Untitled Message'}
            </h4>

            <div className="prose dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 text-lg">
                {message || 'No message body provided.'}
              </p>
            </div>

            {selectedTemplate && (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">
                  Template
                </div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {selectedTemplate.name}
                </div>
              </div>
            )}

            {code && (
              <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
                <span className="text-sm font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">
                  Access Code
                </span>
                <span className="font-mono text-2xl font-black text-blue-600 dark:text-blue-400 break-all">
                  {code}
                </span>
              </div>
            )}

            {notes && (
              <div className="mt-6 p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider block mb-2">
                  Admin Notes
                </span>
                <p className="text-sm text-amber-900 dark:text-amber-200">{notes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            <section className="space-y-5">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                <Settings2 className="w-4 h-4" />
                Delivery Configuration
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t('delivery-channel', { defaultValue: 'Delivery Channel' })}
                  </label>
                  <select
                    className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-transparent text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as DeliveryChannel)}
                  >
                    <option value="internal">Internal</option>
                    <option value="email">Email</option>
                    <option value="both">Both</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    {t('message-type', { defaultValue: 'Message Type' })}
                  </label>
                  <select
                    className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-transparent text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                    value={messageType}
                    onChange={(e) => setMessageType(e.target.value as MessageType)}
                  >
                    <option value="message">Message</option>
                    <option value="notification">Notification</option>
                    <option value="popup">Popup</option>
                    <option value="toast">Toast</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    {t('purpose', { defaultValue: 'Purpose' })}
                  </label>
                  <select
                    className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-transparent text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as Purpose)}
                  >
                    <option value="manual">Manual</option>
                    <option value="gift-code">Gift Code</option>
                    <option value="secrets-access">Secrets Access</option>
                    <option value="model-unlock">Model Unlock</option>
                    <option value="tool-unlock">Tool Unlock</option>
                    <option value="chat-unlock">Chat Unlock</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    {t('template', { defaultValue: 'Template' })}
                  </label>
                  <select
                    className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-transparent text-zinc-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500"
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                  >
                    <option value="">{t('select-template', { defaultValue: 'Select Template' })}</option>
                    {filteredTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                  {filteredTemplates.length === 0 && (
                    <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      {t('no-template-for-purpose-channel', {
                        defaultValue: 'No templates match this purpose and delivery channel.'
                      })}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                <FileText className="w-4 h-4" />
                Message Composition
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {t('subject-title', { defaultValue: 'Subject / Title' })}
                </label>
                <input
                  className="w-full p-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-transparent text-zinc-900 dark:text-white font-bold text-xl focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400"
                  placeholder={t('enter-message-title', { defaultValue: 'Enter message title' })}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {t('message-body', { defaultValue: 'Message Body' })}
                </label>
                <textarea
                  className="w-full p-5 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-transparent text-zinc-900 dark:text-white min-h-[220px] resize-y focus:ring-2 focus:ring-blue-500 placeholder:text-zinc-400"
                  placeholder={t('type-your-message-here', { defaultValue: 'Type your message here' })}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
            </section>

            {requiresCode && (
              <section className="p-6 md:p-8 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-3xl space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="text-sm font-black text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-3">
                    <Key className="w-5 h-5" />
                    Access Code Configuration
                  </label>

                  <button
                    onClick={() => setShowCodeOptions((prev) => !prev)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showCodeOptions ? 'Hide Options' : 'Show Options'}
                  </button>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <input
                    className="flex-1 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono font-bold text-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter or generate code..."
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />

                  <button
                    onClick={generateCode}
                    disabled={isGeneratingCode}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 font-bold px-6 py-4 rounded-2xl transition-opacity',
                      isGeneratingCode
                        ? 'bg-zinc-400 text-white cursor-not-allowed'
                        : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90'
                    )}
                  >
                    {isGeneratingCode ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Generate
                  </button>
                </div>

                {showCodeOptions && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        Usage Mode
                      </label>
                      <select
                        className="w-full p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
                        value={usageMode}
                        onChange={(e) => setUsageMode(e.target.value as UsageMode)}
                      >
                        <option value="single-use">Single Use</option>
                        <option value="limited-use">Limited Use</option>
                        <option value="unlimited-use">Unlimited Use</option>
                      </select>
                    </div>

                    {usageMode === 'limited-use' && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                          Max Uses
                        </label>
                        <input
                          type="number"
                          min={1}
                          className="w-full p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
                          value={maxUses}
                          onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || 1))}
                        />
                      </div>
                    )}

                    <div className="space-y-2 md:col-span-2">
                      <label className="flex items-center gap-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          className="w-4 h-4"
                          checked={neverExpires}
                          onChange={(e) => setNeverExpires(e.target.checked)}
                        />
                        Never Expires
                      </label>

                      {!neverExpires && (
                        <input
                          type="datetime-local"
                          className="w-full p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm"
                          value={expiresAt}
                          onChange={(e) => setExpiresAt(e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Internal Notes (Optional)
              </label>
              <input
                className="w-full p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-transparent text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="Notes only visible to admins or appended to email..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>
          </div>
        )}
      </div>

      <div className="w-full xl:w-[420px] bg-zinc-50 dark:bg-zinc-800/30 p-6 md:p-8 flex flex-col border-t xl:border-t-0 xl:border-l-0 border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-6 h-6 text-zinc-400" />
          <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-widest">
            {t('recipients', { defaultValue: 'Recipients' })}
          </h3>
          <span className="ml-auto bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold px-3 py-1 rounded-full">
            {recipientIds.length} Selected
          </span>
        </div>

        <div className="relative mb-5">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <button
            onClick={selectAllFiltered}
            className="py-3 text-xs font-bold bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-xl transition-colors"
          >
            Select All
          </button>
          <button
            onClick={clearRecipients}
            className="py-3 text-xs font-bold bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-xl transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-80 max-h-[520px] space-y-3 pr-1 custom-scrollbar mb-6">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm bg-zinc-100 dark:bg-zinc-800/50 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700">
              <Users className="w-8 h-8 mx-auto mb-3 text-zinc-400" />
              No recipients found matching your search.
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isSelected = recipientIds.includes(u.id);
              const isGoogle = u.authProviders.includes('google.com');
              const isEmail = u.authProviders.includes('password');

              return (
                <button
                  key={u.id}
                  onClick={() => toggleRecipient(u.id)}
                  className={cn(
                    'w-full text-left px-4 py-4 rounded-2xl text-sm flex items-center justify-between transition-all duration-200 border',
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-700'
                  )}
                >
                  <div className="flex items-center gap-4 overflow-hidden min-w-0">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                        isSelected
                          ? 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                      )}
                    >
                      {u.name?.charAt(0).toUpperCase() || '?'}
                    </div>

                    <div className="overflow-hidden min-w-0">
                      <div
                        className={cn(
                          'font-bold truncate',
                          isSelected
                            ? 'text-blue-900 dark:text-blue-100'
                            : 'text-zinc-900 dark:text-white'
                        )}
                      >
                        {u.name}
                      </div>

                      <div className="text-xs text-zinc-500 truncate">{u.email || 'No email'}</div>

                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                            isUserAdmin(u)
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          )}
                        >
                          {u.role}
                        </span>

                        <span
                          className={cn(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                            normalizeStatusLabel(u.status) === 'Active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          )}
                        >
                          {normalizeStatusLabel(u.status)}
                        </span>

                        {isGoogle && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                            Google
                          </span>
                        )}

                        {isEmail && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                            Email
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <label className="flex items-center gap-4 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl cursor-pointer hover:border-blue-500 transition-colors mb-4">
          <input
            type="checkbox"
            checked={sendToSelf}
            onChange={(e) => setSendToSelf(e.target.checked)}
            className="w-5 h-5 text-blue-600 rounded border-zinc-300 focus:ring-blue-500"
          />
          <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
            Send copy to myself
          </span>
        </label>

        {dispatchSummary && (
          <div className="mb-4 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">
              Dispatch Summary
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-3">
                <div className="text-xs text-zinc-500">Attempted</div>
                <div className="text-lg font-black text-zinc-900 dark:text-white">
                  {dispatchSummary.attempted}
                </div>
              </div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-3">
                <div className="text-xs text-emerald-600 dark:text-emerald-300">Success</div>
                <div className="text-lg font-black text-emerald-700 dark:text-emerald-200">
                  {dispatchSummary.success}
                </div>
              </div>
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3">
                <div className="text-xs text-red-600 dark:text-red-300">Failed</div>
                <div className="text-lg font-black text-red-700 dark:text-red-200">
                  {dispatchSummary.failed}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 flex items-center gap-3">
            <Mail className="w-5 h-5 text-zinc-500" />
            <div>
              <div className="text-xs text-zinc-500">Channel</div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">{channel}</div>
            </div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 flex items-center gap-3">
            <TypeIcon className="w-5 h-5 text-zinc-500" />
            <div>
              <div className="text-xs text-zinc-500">Type</div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">{messageType}</div>
            </div>
          </div>
        </div>

        <button
          className={cn(
            'w-full py-5 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-lg',
            isLoading
              ? 'bg-zinc-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 hover:shadow-blue-500/25 active:scale-[0.98]'
          )}
          onClick={handleDispatch}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          {isLoading
            ? t('dispatching', { defaultValue: 'Dispatching...' })
            : t('dispatch-now', { defaultValue: 'Dispatch Now' })}
        </button>
      </div>
    </div>
  );
};
