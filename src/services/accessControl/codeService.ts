import { auth } from '../../firebase';
import { UnlockCode } from '../../utils';

const normalizeRequired = (value: string, fieldName: string): string => {
  const normalized = (value || '').trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
};

const getAuthHeaders = async () => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Missing authentication token. Please sign in again.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const mapLegacyTypeToPurpose = (type?: UnlockCode['type']): string => {
  if (type === 'Model Access') return 'model-unlock';
  if (type === 'Chat Unlock') return 'chat-unlock';
  if (type === 'Secrets Access') return 'secrets-access';
  return 'tool-unlock';
};

export const createUnlockCode = async (data: Omit<UnlockCode, 'id' | 'createdAt' | 'redeemedBy'>) => {
  const normalizedCode = normalizeRequired(data.code, 'Code');
  const headers = await getAuthHeaders();

  const response = await fetch('/api/admin/generate-code', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      purpose: mapLegacyTypeToPurpose(data.type),
      usageMode: data.maxUses ? 'limited-use' : 'single-use',
      maxUses: data.maxUses,
      neverExpires: !data.expiresAt,
      expiresAt: data.expiresAt,
      title: `Legacy Unlock: ${data.type}`,
      metadata: {
        migratedFromLegacyUnlockCodes: true,
        targetId: data.targetId,
      },
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.id) {
    throw new Error(json?.error || 'Failed to create unlock code.');
  }

  return json.id as string;
};

export const getUnlockCodes = async (type?: UnlockCode['type']) => {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/admin/codes', { headers });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || 'Failed to fetch issued codes.');
  }

  const codes = Array.isArray(json?.codes) ? json.codes : [];
  return codes
    .filter((code: any) => (type ? mapLegacyTypeToPurpose(type) === code.purpose : true))
    .map((code: any) => ({
      id: code.id,
      code: code.codeValue,
      type: type || 'Page Access',
      targetId: code?.metadata?.targetId,
      isActive: code.status === 'active',
      redeemedBy: [],
      maxUses: code.maxUses,
      expiresAt: code.expiresAt,
      createdAt: code.createdAt,
      createdBy: code.issuedByAdminId,
    } as UnlockCode));
};

export const verifyAndRedeemCode = async (
  code: string,
  userId: string,
  type?: UnlockCode['type'],
  targetId?: string
): Promise<UnlockCode | null> => {
  const normalizedCode = normalizeRequired(code, 'Code');
  normalizeRequired(userId, 'User ID');
  const headers = await getAuthHeaders();

  const purpose = mapLegacyTypeToPurpose(type);
  const normalizedTargetId = typeof targetId === 'string' ? targetId.trim() : '';

  let endpoint = '/api/codes/verify';
  let payload: Record<string, unknown> = {
    codeValue: normalizedCode,
    purpose,
  };

  if (type === 'Model Access') {
    endpoint = '/api/unlocks/redeem-model-code';
    payload = {
      codeValue: normalizedCode,
      modelId: normalizedTargetId || 'all',
    };
  } else if (type === 'Page Access') {
    endpoint = '/api/unlocks/redeem-page-code';
    const pagePurpose =
      normalizedTargetId === 'internal-chat'
        ? 'chat-unlock'
        : normalizedTargetId === 'secrets'
          ? 'secrets-access'
          : 'tool-unlock';
    payload = {
      codeValue: normalizedCode,
      pageId: normalizedTargetId || 'generate',
      purpose: pagePurpose,
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) {
    if (json?.error === 'code-not-found') return null;
    throw new Error(json?.error || 'Failed to verify unlock code.');
  }

  if (type === 'Model Access' || type === 'Page Access') {
    return {
      id: json.codeId || 'backend-issued',
      code: normalizedCode,
      type: type || 'Page Access',
      targetId: normalizedTargetId || undefined,
      isActive: true,
      redeemedBy: [userId],
      createdAt: new Date().toISOString(),
      createdBy: 'backend',
    };
  }

  const backendCode = json.code;
  if (!backendCode) return null;

  return {
    id: backendCode.id,
    code: backendCode.codeValue,
    type: type || 'Page Access',
    targetId: backendCode?.metadata?.targetId,
    isActive: backendCode.status === 'active',
    redeemedBy: backendCode.redeemedByUserId ? [backendCode.redeemedByUserId] : [],
    maxUses: backendCode.maxUses,
    expiresAt: backendCode.expiresAt,
    createdAt: backendCode.createdAt || backendCode.issuedAt,
    createdBy: backendCode.issuedByAdminId,
  };
};

export const updateUnlockCode = async (id: string, data: Partial<UnlockCode>) => {
  const normalizedId = normalizeRequired(id, 'Code ID');
  const headers = await getAuthHeaders();
  if (data.isActive === undefined) {
    throw new Error('Only status updates are supported for migrated unlock codes.');
  }
  const status = data.isActive ? 'active' : 'revoked';

  const response = await fetch(`/api/admin/codes/${encodeURIComponent(normalizedId)}/status`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ status }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.success === false) {
    throw new Error(json?.error || 'Failed to update code status.');
  }
};

export const deleteUnlockCode = async (id: string) => {
  await updateUnlockCode(id, { isActive: false });
};
