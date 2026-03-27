import { auth } from '../../firebase';

export interface ProviderSecuritySummaryResponse {
  success: boolean;
  summary: {
    clientSecretsAllowed: boolean;
    sourceMapsEnabled: boolean;
    assetDeliveryMode: 'authenticated-proxy';
    buildMinification: 'esbuild';
    providers: {
      google: {
        configured: boolean;
        executionMode: 'server-managed';
        envKeyName: string;
        endpoint: string;
      };
      alibabaModelStudio: {
        configured: boolean;
        executionMode: 'server-managed';
        envKeyName: string;
        region: string;
        baseUrl?: string;
        endpoint: string;
      };
    };
  };
}

export async function fetchProviderSecuritySummary(): Promise<ProviderSecuritySummaryResponse['summary']> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Missing authentication token for provider security summary request.');
  }

  const response = await fetch('/api/admin/security/provider-config-summary', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: 'Invalid provider security summary response.',
  }));

  if (!response.ok || payload?.success === false || !payload?.summary) {
    throw new Error(String(payload?.error || 'Failed to fetch provider security summary.'));
  }

  return payload.summary;
}
