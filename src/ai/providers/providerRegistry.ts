import {
  AIProviderId,
  ModelLifecycleStatus,
  ProviderTransport,
} from '../types';

export type CanonicalProviderRegistryId =
  | 'google-gemini-api'
  | 'google-imagen'
  | 'google-veo'
  | 'alibaba-model-studio/qwen'
  | 'alibaba-model-studio/qwen-vl'
  | 'alibaba-model-studio/wan'
  | 'alibaba-model-studio/audio';

export interface ProviderRegistryEntry {
  id: CanonicalProviderRegistryId;
  provider: AIProviderId;
  family: string;
  displayName: string;
  transport: ProviderTransport;
  adapterId: ProviderTransport;
  regionSupport: readonly string[];
  envRequirements: readonly string[];
  baseUrlResolver: string;
  status: ModelLifecycleStatus;
  isEnabled: boolean;
  isVisibleToUsers: boolean;
  adminNotes?: string;
}

const GLOBAL_REGION = ['global'] as const;
const KNOWN_ALIBABA_MODEL_STUDIO_REGIONS = [
  'us-virginia',
  'singapore',
  'china-mainland',
  'hong-kong',
  'frankfurt',
] as const;

/**
 * Canonical provider registry
 * --------------------------------------------------------------------------
 * Keep provider-family configuration separate from the per-model catalog so
 * new Alibaba/Google families can be introduced without rewriting selector,
 * runtime, or asset-routing code in multiple places.
 */
export const PROVIDER_REGISTRY: readonly ProviderRegistryEntry[] = Object.freeze([
  {
    id: 'google-gemini-api',
    provider: 'google',
    family: 'gemini',
    displayName: 'Google Gemini API',
    transport: 'google-genai-native',
    adapterId: 'google-genai-native',
    regionSupport: GLOBAL_REGION,
    envRequirements: ['GEMINI_API_KEY'],
    baseUrlResolver: 'google-sdk-generate-content',
    status: 'active',
    isEnabled: true,
    isVisibleToUsers: true,
    adminNotes: 'Primary Google GenAI text, vision, image, and realtime family.',
  },
  {
    id: 'google-imagen',
    provider: 'google',
    family: 'imagen',
    displayName: 'Google Imagen',
    transport: 'google-imagen-native',
    adapterId: 'google-imagen-native',
    regionSupport: GLOBAL_REGION,
    envRequirements: ['GEMINI_API_KEY'],
    baseUrlResolver: 'google-imagen-generate',
    status: 'planned',
    isEnabled: false,
    isVisibleToUsers: false,
    adminNotes: 'Prepared for future dedicated Imagen activation without mixing it into Gemini-native image routes.',
  },
  {
    id: 'google-veo',
    provider: 'google',
    family: 'veo',
    displayName: 'Google Veo',
    transport: 'google-veo-native',
    adapterId: 'google-veo-native',
    regionSupport: GLOBAL_REGION,
    envRequirements: ['GEMINI_API_KEY'],
    baseUrlResolver: 'google-veo-generate',
    status: 'experimental',
    isEnabled: true,
    isVisibleToUsers: true,
    adminNotes: 'Prepared for the dedicated video adapter path. Surface exposure remains a product decision per model.',
  },
  {
    id: 'alibaba-model-studio/qwen',
    provider: 'qwen',
    family: 'qwen',
    displayName: 'Alibaba Model Studio Qwen',
    transport: 'alibaba-openai-compatible',
    adapterId: 'alibaba-openai-compatible',
    regionSupport: KNOWN_ALIBABA_MODEL_STUDIO_REGIONS,
    envRequirements: ['DASHSCOPE_API_KEY', 'ALIBABA_MODEL_STUDIO_REGION', 'ALIBABA_MODEL_STUDIO_BASE_URL'],
    baseUrlResolver: 'dashscope-compatible-chat',
    status: 'active',
    isEnabled: true,
    isVisibleToUsers: true,
    adminNotes: 'Official OpenAI-compatible DashScope path for Qwen text models.',
  },
  {
    id: 'alibaba-model-studio/qwen-vl',
    provider: 'qwen',
    family: 'qwen-vl',
    displayName: 'Alibaba Model Studio Qwen VL',
    transport: 'alibaba-openai-compatible',
    adapterId: 'alibaba-openai-compatible',
    regionSupport: KNOWN_ALIBABA_MODEL_STUDIO_REGIONS,
    envRequirements: ['DASHSCOPE_API_KEY', 'ALIBABA_MODEL_STUDIO_REGION', 'ALIBABA_MODEL_STUDIO_BASE_URL'],
    baseUrlResolver: 'dashscope-compatible-chat',
    status: 'active',
    isEnabled: true,
    isVisibleToUsers: true,
    adminNotes: 'Official OpenAI-compatible multimodal path for Qwen VL/OCR-capable models.',
  },
  {
    id: 'alibaba-model-studio/wan',
    provider: 'qwen',
    family: 'wan',
    displayName: 'Alibaba Model Studio Wan',
    transport: 'alibaba-native-media',
    adapterId: 'alibaba-native-media',
    regionSupport: KNOWN_ALIBABA_MODEL_STUDIO_REGIONS,
    envRequirements: ['DASHSCOPE_API_KEY', 'ALIBABA_MODEL_STUDIO_REGION', 'ALIBABA_MODEL_STUDIO_BASE_URL'],
    baseUrlResolver: 'alibaba-native-media',
    status: 'planned',
    isEnabled: false,
    isVisibleToUsers: false,
    adminNotes: 'Prepared for future Wan image/video generation and editing adapters.',
  },
  {
    id: 'alibaba-model-studio/audio',
    provider: 'qwen',
    family: 'qwen-audio',
    displayName: 'Alibaba Model Studio Audio',
    transport: 'alibaba-native-media',
    adapterId: 'alibaba-native-media',
    regionSupport: KNOWN_ALIBABA_MODEL_STUDIO_REGIONS,
    envRequirements: ['DASHSCOPE_API_KEY', 'ALIBABA_MODEL_STUDIO_REGION', 'ALIBABA_MODEL_STUDIO_BASE_URL'],
    baseUrlResolver: 'alibaba-native-media',
    status: 'planned',
    isEnabled: false,
    isVisibleToUsers: false,
    adminNotes: 'Prepared for future ASR/speech/audio generation model families.',
  },
]);

const PROVIDER_REGISTRY_INDEX = new Map(
  PROVIDER_REGISTRY.map((entry) => [entry.id, entry] as const)
);

export const getProviderRegistryEntry = (providerId: CanonicalProviderRegistryId) =>
  PROVIDER_REGISTRY_INDEX.get(providerId);

export const getProviderRegistryEntryRequired = (providerId: CanonicalProviderRegistryId) => {
  const entry = getProviderRegistryEntry(providerId);
  if (!entry) {
    throw new Error(`Unknown provider registry entry: ${providerId}`);
  }
  return entry;
};

