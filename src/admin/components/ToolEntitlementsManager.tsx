import * as React from 'react';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';

type ToolEntitlement = {
  id: string;
  userId: string;
  toolId: string;
  active: boolean;
  grantedAt?: string;
  revokedAt?: string;
  lastSource?: 'payment' | 'code' | 'admin';
  lastReferenceId?: string | null;
  grantedBy?: string | null;
  revokedBy?: string | null;
  lastAdminReason?: string | null;
  updatedAt?: string;
};

type ToolEntitlementEvent = {
  id: string;
  userId: string;
  toolId: string;
  action: 'grant' | 'revoke';
  source: 'payment' | 'code' | 'admin';
  sourceReferenceId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  createdAt?: string;
};

const ELIGIBLE_TOOLS = [
  { id: 'quiz', label: 'Assessment Generator' },
  { id: 'analyze', label: 'Analyze' },
  { id: 'infographic', label: 'Infographic Generator' },
];

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const getAuthHeaders = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Missing authentication token. Please sign in again.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

export const ToolEntitlementsManager: React.FC = () => {
  const [entitlements, setEntitlements] = React.useState<ToolEntitlement[]>([]);
  const [events, setEvents] = React.useState<ToolEntitlementEvent[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMutating, setIsMutating] = React.useState(false);
  const [userIdFilter, setUserIdFilter] = React.useState('');
  const [selectedToolId, setSelectedToolId] = React.useState('quiz');
  const [targetUserId, setTargetUserId] = React.useState('');
  const [reason, setReason] = React.useState('');

  const fetchEntitlements = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const query = new URLSearchParams();
      query.set('includeEvents', 'true');
      if (userIdFilter.trim()) {
        query.set('userId', userIdFilter.trim());
      }

      const response = await fetch(`/api/admin/tool-entitlements?${query.toString()}`, { headers });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || 'Failed to load entitlements.');
      }

      setEntitlements(Array.isArray(json.entitlements) ? json.entitlements : []);
      setEvents(Array.isArray(json.events) ? json.events : []);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load entitlements.');
    } finally {
      setIsLoading(false);
    }
  }, [userIdFilter]);

  React.useEffect(() => {
    fetchEntitlements();
  }, [fetchEntitlements]);

  const runMutation = async (action: 'grant' | 'revoke') => {
    if (!targetUserId.trim()) {
      toast.error('User ID is required.');
      return;
    }

    setIsMutating(true);
    try {
      const headers = await getAuthHeaders();
      const endpoint = action === 'grant'
        ? '/api/admin/tool-entitlements/grant'
        : '/api/admin/tool-entitlements/revoke';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: targetUserId.trim(),
          toolId: selectedToolId,
          reason: reason.trim() || undefined,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Failed to ${action} entitlement.`);
      }

      toast.success(`Entitlement ${action} completed.`);
      await fetchEntitlements();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} entitlement.`);
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-600 text-[10px] font-black">TE</span>
          <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white">
            Tool Entitlements Control
          </h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Keep entitlement sources separate. Payment, code redemption, and manual override must remain auditable and isolated.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            placeholder="Target user ID"
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          />
          <select
            value={selectedToolId}
            onChange={(event) => setSelectedToolId(event.target.value)}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          >
            {ELIGIBLE_TOOLS.map((tool) => (
              <option key={tool.id} value={tool.id}>{tool.label}</option>
            ))}
          </select>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => runMutation('grant')}
              disabled={isMutating}
              className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60"
            >
              Grant
            </button>
            <button
              onClick={() => runMutation('revoke')}
              disabled={isMutating}
              className="flex-1 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-60"
            >
              Revoke
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
        <div className="flex items-center justify-between mb-4 gap-3">
          <input
            value={userIdFilter}
            onChange={(event) => setUserIdFilter(event.target.value)}
            placeholder="Filter by user ID"
            className="w-full max-w-sm px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          />
          <button
            onClick={fetchEntitlements}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-black uppercase tracking-widest inline-flex items-center gap-1"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 flex justify-center"><div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-zinc-500">
                <tr>
                  <th className="text-start py-2">User</th>
                  <th className="text-start py-2">Tool</th>
                  <th className="text-start py-2">Active</th>
                  <th className="text-start py-2">Source</th>
                  <th className="text-start py-2">Reference</th>
                  <th className="text-start py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 font-mono text-xs">{row.userId}</td>
                    <td className="py-2">{row.toolId}</td>
                    <td className="py-2">
                      <span className={row.active ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>
                        {row.active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td className="py-2 uppercase text-xs">{row.lastSource || '-'}</td>
                    <td className="py-2 font-mono text-xs">{row.lastReferenceId || '-'}</td>
                    <td className="py-2 text-xs">{formatDate(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
        <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white mb-3">Recent Entitlement Events</h4>
        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          {events.map((event) => (
            <div key={event.id} className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
              <div className="text-xs font-bold text-zinc-900 dark:text-white">
                {event.action.toUpperCase()} {event.toolId} for {event.userId}
              </div>
              <div className="text-[11px] text-zinc-500">
                source={event.source} ref={event.sourceReferenceId || '-'} actor={event.actorUserId || '-'} at {formatDate(event.createdAt)}
              </div>
              {event.reason && <div className="text-[11px] text-zinc-500">reason: {event.reason}</div>}
            </div>
          ))}
          {!events.length && <p className="text-sm text-zinc-500">No events found for the selected filter.</p>}
        </div>
      </div>
    </div>
  );
};
