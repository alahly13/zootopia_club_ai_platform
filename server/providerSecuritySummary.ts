import type { ProviderRuntimeResolution } from './providerRuntime.js';
import { resolveProviderRuntimeByModel, resolveQwenRuntime } from './providerRuntime.js';

export interface ProviderSecuritySummary {
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
}

function toSafeGoogleSummary(runtime: ProviderRuntimeResolution) {
  return {
    configured: runtime.credentialResolved,
    executionMode: 'server-managed' as const,
    envKeyName: runtime.envKeyName,
    endpoint: runtime.endpoint,
  };
}

function toSafeAlibabaSummary(runtime: ProviderRuntimeResolution) {
  return {
    configured: runtime.credentialResolved,
    executionMode: 'server-managed' as const,
    envKeyName: runtime.envKeyName,
    region: runtime.region,
    baseUrl: runtime.baseUrl,
    endpoint: runtime.endpoint,
  };
}

export function buildProviderSecuritySummary(
  env: Record<string, string | undefined> = process.env
): ProviderSecuritySummary {
  const googleRuntime = resolveProviderRuntimeByModel({
    modelId: 'gemini-3-flash-preview',
    env,
  });
  const qwenRuntime = resolveQwenRuntime({ env });

  return {
    clientSecretsAllowed: false,
    sourceMapsEnabled: false,
    assetDeliveryMode: 'authenticated-proxy',
    buildMinification: 'esbuild',
    providers: {
      google: toSafeGoogleSummary(googleRuntime),
      alibabaModelStudio: toSafeAlibabaSummary(qwenRuntime),
    },
  };
}
