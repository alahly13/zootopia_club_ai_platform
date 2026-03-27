import { auth } from '../../firebase';
import type { User } from '../../utils';
import { logger } from '../../utils/logger';

export interface AdminAccountDirectoryResponse {
  success: boolean;
  accounts: User[];
  summary?: Record<string, unknown>;
  error?: string;
}

async function getAdminHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Missing authentication token for admin account directory request.');
  }

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchAdminAccountDirectory(): Promise<AdminAccountDirectoryResponse> {
  const headers = await getAdminHeaders();
  const response = await fetch('/api/admin/accounts', {
    method: 'GET',
    headers,
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: 'Invalid admin account directory response.',
  }));

  if (!response.ok || payload?.success === false) {
    const error = payload?.error || 'Failed to fetch admin account directory.';
    logger.error('Failed to fetch admin account directory.', {
      area: 'auth',
      event: 'admin-account-directory-fetch-failed',
      statusCode: response.status,
      error,
    });
    throw new Error(error);
  }

  return {
    success: true,
    accounts: Array.isArray(payload?.accounts) ? payload.accounts : [],
    summary: payload?.summary,
  };
}
