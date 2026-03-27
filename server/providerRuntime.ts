import { getModelByAnyId } from '../src/ai/models/modelRegistry.js';
import { ProviderTransport } from '../src/ai/types.js';

/**
 * Server-authoritative provider runtime resolution
 * --------------------------------------------------------------------------
 * Provider credentials, regions, and endpoints must be derived on the server
 * from trusted environment configuration. Browser-selected model IDs are
 * inputs to routing, not sources of truth for secrets or endpoint ownership.
 */

export type AlibabaModelStudioRegion =
  | 'china-mainland'
  | 'us-virginia'
  | 'singapore'
  | 'hong-kong'
  | 'frankfurt'
  | 'custom';

export type QwenRegion = AlibabaModelStudioRegion;

export type ProviderRuntimeResolution = {
  provider: 'google' | 'qwen';
  providerId: string;
  family: string;
  transport: ProviderTransport;
  adapterId: ProviderTransport;
  canonicalModelId: string;
  envKeyName: string;
  envRequirements: string[];
  apiKey: string;
  usesEnvCredentials: boolean;
  region: string;
  baseUrl?: string;
  endpoint: string;
  credentialResolved: boolean;
};

const DEFAULT_ALIBABA_MODEL_STUDIO_REGION: Exclude<AlibabaModelStudioRegion, 'custom'> = 'us-virginia';

export const ALIBABA_MODEL_STUDIO_REGION_BASE_URLS: Record<
  Exclude<AlibabaModelStudioRegion, 'custom' | 'frankfurt'>,
  string
> = {
  'china-mainland': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'us-virginia': 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
  singapore: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  'hong-kong': 'https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1',
};

export const QWEN_REGION_BASE_URLS = {
  ...ALIBABA_MODEL_STUDIO_REGION_BASE_URLS,
  frankfurt: 'https://{workspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1',
} as const;

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

const buildFrankfurtBaseUrl = (workspaceId: string | undefined): string | undefined => {
  const safeWorkspaceId = String(workspaceId || '').trim();
  if (!safeWorkspaceId) return undefined;
  return `https://${safeWorkspaceId}.eu-central-1.maas.aliyuncs.com/compatible-mode/v1`;
};

const inferAlibabaModelStudioRegionFromBaseUrl = (
  value: string | undefined
): AlibabaModelStudioRegion | undefined => {
  const normalized = value ? normalizeBaseUrl(value) : '';
  if (!normalized) return undefined;

  for (const [region, officialBaseUrl] of Object.entries(ALIBABA_MODEL_STUDIO_REGION_BASE_URLS)) {
    if (normalized === officialBaseUrl) {
      return region as Exclude<AlibabaModelStudioRegion, 'custom' | 'frankfurt'>;
    }
  }

  if (normalized.includes('.eu-central-1.maas.aliyuncs.com/compatible-mode/v1')) {
    return 'frankfurt';
  }

  return undefined;
};

export const normalizeAlibabaModelStudioRegion = (value: unknown): AlibabaModelStudioRegion => {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) return DEFAULT_ALIBABA_MODEL_STUDIO_REGION;
  if (normalized === 'china-mainland' || normalized === 'china' || normalized === 'beijing') return 'china-mainland';
  if (normalized === 'us-virginia' || normalized === 'us' || normalized === 'us-east' || normalized === 'virginia') return 'us-virginia';
  if (normalized === 'singapore' || normalized === 'intl' || normalized === 'international') return 'singapore';
  if (normalized === 'hong-kong' || normalized === 'hongkong') return 'hong-kong';
  if (normalized === 'frankfurt' || normalized === 'germany') return 'frankfurt';
  if (normalized === 'custom') return 'custom';

  return DEFAULT_ALIBABA_MODEL_STUDIO_REGION;
};

export const normalizeQwenRegion = normalizeAlibabaModelStudioRegion;

const resolveAlibabaBaseUrl = (params: {
  region: AlibabaModelStudioRegion;
  workspaceId?: string;
  explicitBaseUrl?: string;
}): string => {
  const normalizedExplicitBaseUrl = params.explicitBaseUrl
    ? normalizeBaseUrl(params.explicitBaseUrl)
    : undefined;

  if (params.region === 'custom') {
    if (!normalizedExplicitBaseUrl) {
      throw new Error('ALIBABA_MODEL_STUDIO_CUSTOM_BASE_URL_REQUIRED');
    }
    return normalizedExplicitBaseUrl;
  }

  const officialBaseUrl =
    params.region === 'frankfurt'
      ? buildFrankfurtBaseUrl(params.workspaceId)
      : ALIBABA_MODEL_STUDIO_REGION_BASE_URLS[params.region];

  if (!officialBaseUrl) {
    throw new Error('ALIBABA_MODEL_STUDIO_FRANKFURT_WORKSPACE_REQUIRED');
  }

  if (normalizedExplicitBaseUrl && normalizedExplicitBaseUrl !== normalizeBaseUrl(officialBaseUrl)) {
    throw new Error('ALIBABA_MODEL_STUDIO_REGION_BASE_URL_MISMATCH');
  }

  return normalizeBaseUrl(officialBaseUrl);
};

const resolveGoogleEndpoint = (baseUrlResolver: string): string => {
  switch (baseUrlResolver) {
    case 'google-live-api':
      return 'google-live-api:sessions';
    case 'google-veo-generate':
      return 'google-veo:videos.generate';
    case 'google-imagen-generate':
      return 'google-imagen:images.generate';
    case 'google-sdk-generate-content':
    default:
      return 'google-sdk:models.generateContent';
  }
};

export const resolveQwenRuntime = (params: {
  env?: Record<string, string | undefined>;
  allowOverride?: boolean;
  overrideApiKey?: string;
  overrideBaseUrl?: string;
  overrideRegion?: string;
}): ProviderRuntimeResolution => {
  const env = params.env || process.env;
  const usesOverride = params.allowOverride === true;

  const envApiKey = env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || '';
  const apiKey = usesOverride && params.overrideApiKey?.trim() ? params.overrideApiKey.trim() : envApiKey.trim();
  const envKeyName = env.DASHSCOPE_API_KEY ? 'DASHSCOPE_API_KEY' : 'QWEN_API_KEY';

  const rawBaseUrl =
    (usesOverride && params.overrideBaseUrl?.trim()) ||
    env.ALIBABA_MODEL_STUDIO_BASE_URL ||
    env.QWEN_BASE_URL ||
    env.DASHSCOPE_BASE_URL ||
    '';
  const inferredRegionFromBaseUrl = inferAlibabaModelStudioRegionFromBaseUrl(rawBaseUrl);

  const region = normalizeAlibabaModelStudioRegion(
    (usesOverride && params.overrideRegion) ||
      env.ALIBABA_MODEL_STUDIO_REGION ||
      env.QWEN_REGION ||
      env.DASHSCOPE_REGION ||
      inferredRegionFromBaseUrl ||
      DEFAULT_ALIBABA_MODEL_STUDIO_REGION
  );

  const baseUrl = resolveAlibabaBaseUrl({
    region,
    workspaceId:
      env.ALIBABA_MODEL_STUDIO_WORKSPACE_ID ||
      env.DASHSCOPE_WORKSPACE_ID,
    explicitBaseUrl: rawBaseUrl || undefined,
  });

  return {
    provider: 'qwen',
    providerId: 'alibaba-model-studio/qwen',
    family: 'qwen',
    transport: 'alibaba-openai-compatible',
    adapterId: 'alibaba-openai-compatible',
    canonicalModelId: '',
    envKeyName,
    envRequirements: ['DASHSCOPE_API_KEY', 'ALIBABA_MODEL_STUDIO_REGION', 'ALIBABA_MODEL_STUDIO_BASE_URL'],
    apiKey,
    usesEnvCredentials: !usesOverride,
    region,
    baseUrl,
    endpoint: `${baseUrl}/chat/completions`,
    credentialResolved: Boolean(apiKey),
  };
};

export const resolveProviderRuntimeByModel = (params: {
  modelId: string;
  env?: Record<string, string | undefined>;
  allowOverride?: boolean;
  overrideApiKey?: string;
  overrideBaseUrl?: string;
  overrideRegion?: string;
}): ProviderRuntimeResolution => {
  const model = getModelByAnyId(params.modelId);
  if (!model) {
    throw new Error(`Unknown model for provider runtime resolution: ${params.modelId}`);
  }

  if (model.provider === 'google') {
    const env = params.env || process.env;
    const usesOverride = params.allowOverride === true;
    const envApiKey = env.GEMINI_API_KEY || '';
    const apiKey = usesOverride && params.overrideApiKey?.trim() ? params.overrideApiKey.trim() : envApiKey.trim();

    return {
      provider: 'google',
      providerId: model.providerId,
      family: model.family,
      transport: model.transport,
      adapterId: model.transport,
      canonicalModelId: model.id,
      envKeyName: 'GEMINI_API_KEY',
      envRequirements: ['GEMINI_API_KEY'],
      apiKey,
      usesEnvCredentials: !usesOverride,
      region: 'global',
      endpoint: resolveGoogleEndpoint(model.baseUrlResolver),
      credentialResolved: Boolean(apiKey),
    };
  }

  if (model.provider === 'qwen') {
    const alibabaRuntime = resolveQwenRuntime({
      env: params.env,
      allowOverride: params.allowOverride,
      overrideApiKey: params.overrideApiKey,
      overrideBaseUrl: params.overrideBaseUrl,
      overrideRegion: params.overrideRegion,
    });

    const endpoint =
      model.transport === 'alibaba-openai-compatible'
        ? `${alibabaRuntime.baseUrl}/chat/completions`
        : model.baseUrlResolver;

    return {
      ...alibabaRuntime,
      providerId: model.providerId,
      family: model.family,
      transport: model.transport,
      adapterId: model.transport,
      canonicalModelId: model.id,
      endpoint,
    };
  }

  throw new Error(`Unsupported provider runtime resolution for ${model.provider}`);
};

