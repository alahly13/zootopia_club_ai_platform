import * as React from 'react';
import toast from 'react-hot-toast';
import { auth } from '../../firebase';
import { AI_MODELS } from '../../constants/aiModels';

type ModelEntitlement = {
  id: string;
  userId: string;
  modelId: string;
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

type ModelEntitlementEvent = {
  id: string;
  userId: string;
  modelId: string;
  action: 'grant' | 'revoke';
  source: 'payment' | 'code' | 'admin';
  sourceReferenceId?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  createdAt?: string;
};

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

export const ModelEntitlementsManager: React.FC = () => {
  const [entitlements, setEntitlements] = React.useState<ModelEntitlement[]>([]);
  const [events, setEvents] = React.useState<ModelEntitlementEvent[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isMutating, setIsMutating] = React.useState(false);
  const [userIdFilter, setUserIdFilter] = React.useState('');
  const [selectedModelId, setSelectedModelId] = React.useState(AI_MODELS[0]?.id || '');
  const [targetUserId, setTargetUserId] = React.useState('');
  const [reason, setReason] = React.useState('');

  const sortedModels = React.useMemo(
    () => [...AI_MODELS].sort((left, right) => left.priority - right.priority),
    []
  );

  const fetchEntitlements = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const query = new URLSearchParams();
      query.set('includeEvents', 'true');
      if (userIdFilter.trim()) {
        query.set('userId', userIdFilter.trim());
      }

      const response = await fetch(`/api/admin/model-entitlements?${query.toString()}`, { headers });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || 'Failed to load model entitlements.');
      }

      setEntitlements(Array.isArray(json.entitlements) ? json.entitlements : []);
      setEvents(Array.isArray(json.events) ? json.events : []);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load model entitlements.');
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

    if (!selectedModelId) {
      toast.error('Model selection is required.');
      return;
    }

    setIsMutating(true);
    try {
      const headers = await getAuthHeaders();
      const endpoint = action === 'grant'
        ? '/api/admin/model-entitlements/grant'
        : '/api/admin/model-entitlements/revoke';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: targetUserId.trim(),
          modelId: selectedModelId,
          reason: reason.trim() || undefined,
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || `Failed to ${action} model entitlement.`);
      }

      toast.success(`Model entitlement ${action} completed.`);
      await fetchEntitlements();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} model entitlement.`);
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-blue-500/20 text-blue-600 text-[10px] font-black">ME</span>
          <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white">
            Model Entitlements Control
          </h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Keep model metadata registry-backed and keep unlock sources explicit. Admin grants, code redemption, and payment unlocks should stay auditable instead of being mixed into local fake model edits.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={targetUserId}
            onChange={(event) => setTargetUserId(event.target.value)}
            placeholder="Target user ID"
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          />
          <select
            value={selectedModelId}
            onChange={(event) => setSelectedModelId(event.target.value)}
            className="px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm"
          >
            {sortedModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.provider})
              </option>
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
                  <th className="text-start py-2">Model</th>
                  <th className="text-start py-2">Active</th>
                  <th className="text-start py-2">Source</th>
                  <th className="text-start py-2">Reference</th>
                  <th className="text-start py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map((row) => {
                  const model = AI_MODELS.find((entry) => entry.id === row.modelId);
                  return (
                    <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-2 font-mono text-xs">{row.userId}</td>
                      <td className="py-2">
                        <div className="font-medium text-zinc-900 dark:text-white">{model?.name || row.modelId}</div>
                        <div className="text-[11px] text-zinc-500 font-mono">{row.modelId}</div>
                      </td>
                      <td className="py-2">
                        <span className={row.active ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>
                          {row.active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="py-2 uppercase text-xs">{row.lastSource || '-'}</td>
                      <td className="py-2 font-mono text-xs">{row.lastReferenceId || '-'}</td>
                      <td className="py-2 text-xs">{formatDate(row.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
        <h4 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white mb-3">Recent Model Entitlement Events</h4>
        <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          {events.map((event) => {
            const model = AI_MODELS.find((entry) => entry.id === event.modelId);
            return (
              <div key={event.id} className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/40">
                <div className="text-xs font-bold text-zinc-900 dark:text-white">
                  {event.action.toUpperCase()} {model?.name || event.modelId} for {event.userId}
                </div>
                <div className="text-[11px] text-zinc-500">
                  source={event.source} ref={event.sourceReferenceId || '-'} actor={event.actorUserId || '-'} at {formatDate(event.createdAt)}
                </div>
                {event.reason && <div className="text-[11px] text-zinc-500">reason: {event.reason}</div>}
              </div>
            );
          })}
          {!events.length && <p className="text-sm text-zinc-500">No events found for the selected filter.</p>}
        </div>
      </div>
    </div>
  );
};
