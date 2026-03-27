import * as React from 'react';
import { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, UserPlus, Phone, Trash2, Power, PowerOff, Pencil, Save, X } from 'lucide-react';
import { auth } from '../../firebase';
import { cn } from '../../utils';

type FastAccessManagedAccount = {
  id: string;
  name: string;
  email: string;
  username: string;
  phoneNumber: string;
  status: 'active' | 'disabled' | 'deleted' | string;
  accountScope: string;
  temporaryAccessType: string;
  isTemporaryAccess: boolean;
  fastAccessCredits: number;
  department?: string;
  universityCode?: string;
  academicYear?: string;
  temporaryAccessExpiresAt?: string;
  usage?: {
    aiRequestsToday?: number;
    quizGenerationsToday?: number;
    uploadsToday?: number;
  } | null;
  limits?: {
    aiRequestsPerDay?: number;
    quizGenerationsPerDay?: number;
    uploadsPerDay?: number;
  } | null;
  totalAIRequests?: number;
  createdAt?: string;
  deletedAt?: string;
  readOnly?: boolean;
  updatedAt?: string;
  statusContext?: {
    suspensionReason?: string;
    reactivationMessage?: string;
    pendingReactivationNotice?: boolean;
    lastStatusChangedAt?: string;
    lastStatusChangedBy?: string;
  } | null;
  internalNotes?: string;
  deletionAudit?: {
    auditId?: string;
    deletedAt?: string;
    deletedByUid?: string;
    deletedByEmail?: string;
    deleteReason?: string;
    deletionState?: string;
    source?: string;
  } | null;
};

type FastAccessAccountDraft = {
  fullName: string;
  department: string;
  universityCode: string;
  academicYear: string;
  temporaryAccessExpiresAt: string;
  fastAccessCredits: string;
  internalNotes: string;
  suspensionReason: string;
  restorationMessage: string;
  deletionReason: string;
};

const STATUS_FILTER_LABELS: Record<'all' | 'active' | 'disabled' | 'deleted', string> = {
  all: 'All',
  active: 'Active',
  disabled: 'Suspended',
  deleted: 'Deleted Audit',
};

const STATUS_BADGE_LABELS: Record<'active' | 'disabled' | 'deleted', string> = {
  active: 'Active',
  disabled: 'Suspended',
  deleted: 'Deleted',
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

const toNonNegativeInt = (value: string, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
};

export const FastAccessAccountsManager: React.FC<{ canHardDelete?: boolean }> = ({ canHardDelete = false }) => {
  /**
   * ARCHITECTURE GUARD (Temporary Account Isolation)
   * ------------------------------------------------------------------
   * This panel intentionally manages only Faculty temporary-access users.
   * Keep lifecycle operations scoped to the dedicated backend routes and
   * avoid mixing them into generic full-account user creation/deletion flows.
   */
  const [accounts, setAccounts] = useState<FastAccessManagedAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'deleted'>('all');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftByAccountId, setDraftByAccountId] = useState<Record<string, FastAccessAccountDraft>>({});

  const [form, setForm] = useState({
    phoneNumber: '',
    fullName: '',
    universityCode: '',
    academicYear: '',
    department: 'Faculty of Science',
    initialCredits: '3',
  });

  const deleteCapabilityMode = canHardDelete ? 'safe-delete-audit-primary' : 'safe-delete-audit';

  const fetchAccounts = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Missing admin auth token.');
      }

      const params = new URLSearchParams();
      params.set('limit', '200');
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const response = await fetch(`/api/admin/fast-access/accounts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to load fast-access accounts.');
      }

      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load fast-access accounts.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((account) =>
      [account.name, account.phoneNumber, account.email, account.username, account.universityCode]
        .some((field) => String(field || '').toLowerCase().includes(q))
    );
  }, [accounts, search]);

  const withAdminToken = async (input: RequestInfo, init: RequestInit = {}) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Missing admin auth token.');

    const response = await fetch(input, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || 'Fast-access admin operation failed.');
    }

    return payload;
  };

  const getDraftForAccount = React.useCallback((account: FastAccessManagedAccount): FastAccessAccountDraft => {
    const existingDraft = draftByAccountId[account.id];
    if (existingDraft) {
      return existingDraft;
    }

    const dateValue = account.temporaryAccessExpiresAt
      ? new Date(account.temporaryAccessExpiresAt).toISOString().slice(0, 16)
      : '';

    return {
      fullName: account.name || '',
      department: account.department || '',
      universityCode: account.universityCode || '',
      academicYear: account.academicYear || '',
      temporaryAccessExpiresAt: dateValue,
      fastAccessCredits: String(account.fastAccessCredits ?? 0),
      internalNotes: account.internalNotes || '',
      suspensionReason: account.statusContext?.suspensionReason || '',
      restorationMessage: account.statusContext?.reactivationMessage || '',
      deletionReason: account.deletionAudit?.deleteReason || '',
    };
  }, [draftByAccountId]);

  const setDraftField = (accountId: string, field: keyof FastAccessAccountDraft, value: string) => {
    setDraftByAccountId((prev) => {
      const current = prev[accountId] || {
        fullName: '',
        department: '',
        universityCode: '',
        academicYear: '',
        temporaryAccessExpiresAt: '',
        fastAccessCredits: '0',
        internalNotes: '',
        suspensionReason: '',
        restorationMessage: '',
        deletionReason: '',
      };
      return {
        ...prev,
        [accountId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const handleCreate = async () => {
    if (!form.phoneNumber.trim()) {
      setError('Phone number is required.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await withAdminToken('/api/admin/fast-access/accounts', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: form.phoneNumber.trim(),
          fullName: form.fullName.trim() || undefined,
          universityCode: form.universityCode.trim() || undefined,
          academicYear: form.academicYear.trim() || undefined,
          department: form.department.trim() || 'Faculty of Science',
          initialCredits: toNonNegativeInt(form.initialCredits, 3),
        }),
      });

      setForm({
        phoneNumber: '',
        fullName: '',
        universityCode: '',
        academicYear: '',
        department: 'Faculty of Science',
        initialCredits: '3',
      });
      await fetchAccounts();
    } catch (err: any) {
      setError(err?.message || 'Failed to create temporary fast-access account.');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (
    userId: string,
    status: 'active' | 'disabled' | 'deleted',
    options?: { reason?: string; restorationMessage?: string; internalNote?: string }
  ) => {
    setActioningId(userId);
    setError(null);
    try {
      await withAdminToken(`/api/admin/fast-access/accounts/${encodeURIComponent(userId)}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          reason: options?.reason,
          restorationMessage: options?.restorationMessage,
          internalNote: options?.internalNote,
        }),
      });
      await fetchAccounts();
    } catch (err: any) {
      setError(err?.message || 'Failed to update temporary account status.');
    } finally {
      setActioningId(null);
    }
  };

  const handleSaveAccount = async (account: FastAccessManagedAccount) => {
    const draft = getDraftForAccount(account);

    setActioningId(account.id);
    setError(null);
    try {
      await withAdminToken(`/api/admin/fast-access/accounts/${encodeURIComponent(account.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: draft.fullName || undefined,
          department: draft.department || undefined,
          universityCode: draft.universityCode || undefined,
          academicYear: draft.academicYear || undefined,
          temporaryAccessExpiresAt: draft.temporaryAccessExpiresAt
            ? new Date(draft.temporaryAccessExpiresAt).toISOString()
            : undefined,
          fastAccessCredits: toNonNegativeInt(draft.fastAccessCredits, account.fastAccessCredits || 0),
          internalNotes: draft.internalNotes,
        }),
      });

      setEditingId(null);
      await fetchAccounts();
    } catch (err: any) {
      setError(err?.message || 'Failed to update temporary account data.');
    } finally {
      setActioningId(null);
    }
  };

  const handleDeleteAccount = async (account: FastAccessManagedAccount) => {
    const draft = getDraftForAccount(account);
    const confirmed = window.confirm(
      `Delete ${account.name || 'this fast-access account'}?\n\nThis safely archives the temporary account for audit, removes live auth/state residue, and releases the phone-auth identity so the student can register again later.`
    );

    if (!confirmed) {
      return;
    }

    setActioningId(account.id);
    setError(null);
    try {
      await withAdminToken(`/api/admin/fast-access/accounts/${encodeURIComponent(account.id)}`, {
        method: 'DELETE',
        body: JSON.stringify({
          reason: draft.deletionReason.trim() || undefined,
          internalNote: draft.internalNotes.trim() || undefined,
        }),
      });
      setEditingId((current) => (current === account.id ? null : current));
      await fetchAccounts();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete temporary account.');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="space-y-6" data-delete-capability={deleteCapabilityMode}>
      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Faculty Fast Access</p>
            <h3 className="text-lg font-black text-zinc-900 dark:text-white uppercase tracking-wider mt-1">Temporary Accounts Manager</h3>
            <p className="text-xs text-zinc-500 mt-2">Admin-safe controls for temporary Faculty account lifecycle, suspend messaging, internal notes, and deletion with audit-preserved re-registration safety.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email, username..."
                className="w-72 max-w-[70vw] ps-9 pe-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            {(['all', 'active', 'disabled', 'deleted'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-colors',
                  statusFilter === status
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-500'
                )}
              >
                {STATUS_FILTER_LABELS[status]}
              </button>
            ))}
            <button
              type="button"
              onClick={fetchAccounts}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              <RefreshCw size={14} className={cn(loading && 'animate-spin')} /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={16} className="text-emerald-500" />
          <h4 className="text-xs font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-200">Create Temporary Account By Phone</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <input
            value={form.phoneNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
            placeholder="Phone (E.164), e.g. +201001234567"
            className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
          <input
            value={form.fullName}
            onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder="Full name (optional)"
            className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
          <input
            value={form.universityCode}
            onChange={(e) => setForm((prev) => ({ ...prev, universityCode: e.target.value }))}
            placeholder="University code (optional)"
            className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
          <input
            value={form.academicYear}
            onChange={(e) => setForm((prev) => ({ ...prev, academicYear: e.target.value }))}
            placeholder="Academic year (optional)"
            className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
          <input
            value={form.department}
            onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
            placeholder="Department"
            className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
          <input
            value={form.initialCredits}
            onChange={(e) => setForm((prev) => ({ ...prev, initialCredits: e.target.value }))}
            placeholder="Initial credits"
            className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
          >
            {creating ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />} Create Temporary Account
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300/70 dark:border-rose-700/60 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="bg-white/40 dark:bg-zinc-900/40 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-start min-w-[1440px]">
            <thead>
              <tr className="bg-zinc-50/60 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">User</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Phone</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Status</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Remaining Credits</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Usage Today</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Expires</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Messages & Notes</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredAccounts.map((account) => {
                const aiToday = account.usage?.aiRequestsToday ?? 0;
                const aiLimit = account.limits?.aiRequestsPerDay ?? 0;
                const isActioning = actioningId === account.id;
                const isReadOnly = account.readOnly === true || account.status === 'deleted';
                const isEditing = !isReadOnly && editingId === account.id;
                const draft = getDraftForAccount(account);
                const statusKey: 'active' | 'disabled' | 'deleted' =
                  account.status === 'disabled' || account.status === 'deleted' ? account.status : 'active';
                const deletionReason = account.deletionAudit?.deleteReason || '-';

                return (
                  <React.Fragment key={account.id}>
                    <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-200">
                      <div className="flex flex-col">
                        <span className="font-black uppercase tracking-wider">{account.name || '-'}</span>
                        <span className="text-zinc-500 dark:text-zinc-400">{account.email || '-'}</span>
                      </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-200">
                      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        <Phone size={12} /> {account.phoneNumber || '-'}
                      </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                      <span
                        className={cn(
                          'px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider',
                          statusKey === 'active'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : statusKey === 'disabled'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {STATUS_BADGE_LABELS[statusKey]}
                      </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-700 dark:text-zinc-200 font-black tabular-nums">
                      {account.fastAccessCredits}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                      AI: {aiToday}/{aiLimit}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300">
                      {formatDateTime(account.temporaryAccessExpiresAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-600 dark:text-zinc-300 max-w-[320px]">
                        <div className="space-y-1">
                          <p className="line-clamp-2">
                            <span className="font-bold text-zinc-700 dark:text-zinc-200">Suspend:</span>{' '}
                            {account.statusContext?.suspensionReason || '-'}
                          </p>
                          <p className="line-clamp-2">
                            <span className="font-bold text-zinc-700 dark:text-zinc-200">Re-entry:</span>{' '}
                            {account.statusContext?.reactivationMessage || '-'}
                          </p>
                          <p className="line-clamp-2">
                            <span className="font-bold text-zinc-700 dark:text-zinc-200">Admin note:</span>{' '}
                            {account.internalNotes || '-'}
                          </p>
                          {isReadOnly && (
                            <>
                              <p className="line-clamp-2">
                                <span className="font-bold text-zinc-700 dark:text-zinc-200">Delete reason:</span>{' '}
                                {deletionReason}
                              </p>
                              <p className="line-clamp-2">
                                <span className="font-bold text-zinc-700 dark:text-zinc-200">Deleted:</span>{' '}
                                {formatDateTime(account.deletionAudit?.deletedAt || account.deletedAt)}
                              </p>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {isReadOnly ? (
                          <button
                            type="button"
                            disabled
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider"
                          >
                            Archived Delete Audit
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (isEditing) {
                                  setEditingId(null);
                                  return;
                                }
                                setDraftByAccountId((prev) => ({
                                  ...prev,
                                  [account.id]: getDraftForAccount(account),
                                }));
                                setEditingId(account.id);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold"
                              title="Edit account profile and notes"
                            >
                              {isEditing ? <X size={12} /> : <Pencil size={12} />} {isEditing ? 'Close' : 'Edit'}
                            </button>
                            {account.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const suspensionReason = (draft.suspensionReason || '').trim();
                                  if (!suspensionReason) {
                                    setError('Suspension reason is required before suspending a fast-access account.');
                                    return;
                                  }
                                  if (!window.confirm(`Suspend ${account.name || 'this account'} and block platform access until an admin restores it?`)) {
                                    return;
                                  }
                                  void handleStatusChange(account.id, 'disabled', {
                                    reason: suspensionReason,
                                    internalNote: draft.internalNotes,
                                  });
                                }}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold disabled:opacity-50"
                                title="Suspend account"
                              >
                                <PowerOff size={12} /> Suspend
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!window.confirm(`Remove suspension for ${account.name || 'this account'} and restore fast-access entry?`)) {
                                    return;
                                  }
                                  void handleStatusChange(account.id, 'active', {
                                    restorationMessage: draft.restorationMessage,
                                    internalNote: draft.internalNotes,
                                  });
                                }}
                                disabled={isActioning}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold disabled:opacity-50"
                                title="Remove suspension"
                              >
                                <Power size={12} /> Remove Suspension
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteAccount(account);
                              }}
                              disabled={isActioning}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold disabled:opacity-50"
                              title="Delete account and release phone re-registration"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {isEditing && (
                      <tr className="bg-zinc-50/50 dark:bg-zinc-900/40">
                        <td colSpan={8} className="px-4 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            <input
                              value={draft.fullName}
                              onChange={(e) => setDraftField(account.id, 'fullName', e.target.value)}
                              placeholder="Full name"
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                            />
                            <input
                              value={draft.department}
                              onChange={(e) => setDraftField(account.id, 'department', e.target.value)}
                              placeholder="Department"
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                            />
                            <input
                              value={draft.universityCode}
                              onChange={(e) => setDraftField(account.id, 'universityCode', e.target.value)}
                              placeholder="University code"
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                            />
                            <input
                              value={draft.academicYear}
                              onChange={(e) => setDraftField(account.id, 'academicYear', e.target.value)}
                              placeholder="Academic year"
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                            />
                            <input
                              value={draft.fastAccessCredits}
                              onChange={(e) => setDraftField(account.id, 'fastAccessCredits', e.target.value)}
                              placeholder="Fast-access credits"
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                            />
                            <input
                              type="datetime-local"
                              value={draft.temporaryAccessExpiresAt}
                              onChange={(e) => setDraftField(account.id, 'temporaryAccessExpiresAt', e.target.value)}
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                            />
                            <textarea
                              value={draft.suspensionReason}
                              onChange={(e) => setDraftField(account.id, 'suspensionReason', e.target.value)}
                              placeholder="Suspension reason shown to student"
                              rows={3}
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 lg:col-span-2"
                            />
                            <textarea
                              value={draft.restorationMessage}
                              onChange={(e) => setDraftField(account.id, 'restorationMessage', e.target.value)}
                              placeholder="Reactivation message shown after suspension is removed"
                              rows={3}
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 lg:col-span-1"
                            />
                            <textarea
                              value={draft.deletionReason}
                              onChange={(e) => setDraftField(account.id, 'deletionReason', e.target.value)}
                              placeholder="Deletion reason kept in the admin audit archive"
                              rows={3}
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 lg:col-span-1"
                            />
                            <textarea
                              value={draft.internalNotes}
                              onChange={(e) => setDraftField(account.id, 'internalNotes', e.target.value)}
                              placeholder="Internal admin notes (never shown to student)"
                              rows={3}
                              className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 lg:col-span-2"
                            />
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleSaveAccount(account)}
                              disabled={isActioning}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                            >
                              <Save size={14} /> Save Profile + Notes
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}

              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500 italic">
                    {loading ? 'Loading temporary accounts...' : 'No temporary fast-access accounts found for the current filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
