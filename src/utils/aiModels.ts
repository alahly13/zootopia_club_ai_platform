import { USER_VISIBLE_MODEL_REGISTRY } from '../ai/models/modelRegistry';

export type AIProvider = 'Google' | 'Qwen' | 'OpenAI' | 'Anthropic' | 'Custom';

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  providerId?: string;
  family?: string;
  modelId: string;
  modelCategory?: string;
  transport?: string;
  category: 'Free-Friendly' | 'Balanced' | 'Advanced' | 'Experimental';
  description: string;
  helperText: string;
  
  // Core Concepts to Model
  toolCompatibility: string[];
  routingPath: string;
  promptTemplateGroup: string;
  
  // Capabilities
  supportsPreview: boolean;
  supportsExport: boolean;
  supportsPrint: boolean;
  supportsImageGeneration: boolean;
  supportsImageEditing: boolean;
  supportsVideoGeneration: boolean;
  supportsAudioGeneration: boolean;
  supportsSpeechRecognition: boolean;
  supportsTranslation: boolean;
  supportsOCR: boolean;
  supportsVisualReasoning: boolean;
  supportsTextReasoning: boolean;
  supportsLongContext: boolean;
  supportsRealtime: boolean;

  // Legacy/Other Capabilities
  supportsText: boolean;
  supportsFiles: boolean;
  supportsDocumentAnalysis: boolean;
  supportsQuizGeneration: boolean;
  supportsGenerateContent: boolean;
  supportsVideoOrMediaTasks?: boolean;
  supportsThinking?: boolean;
  supportsSearch?: boolean;
  supportsInfographicWorkflows?: boolean;
  
  isFreeFriendly: boolean;
  isPreview: boolean;
  isFallback?: boolean;
  isEnabled: boolean;
  status: 'Ready' | 'Waiting for API Key' | 'Inactive' | 'Unsupported' | 'Quota Exceeded';
  badge?: string;
  priority: number;
  apiKey?: string;
}

const toUiProvider = (provider: string): AIProvider => {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'google') return 'Google';
  if (normalized === 'qwen') return 'Qwen';
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'anthropic') return 'Anthropic';
  return 'Custom';
};

const normalizeToolCompatibility = (toolCompatibility: string[] | undefined): string[] => {
  if (!Array.isArray(toolCompatibility)) return [];

  const normalized = toolCompatibility
    .map(tool => (tool || '').trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
};

const toUiStatus = (
  registryStatus: 'active' | 'preview' | 'disabled',
  isEnabled: boolean | undefined
): AIModel['status'] => {
  // Architecture note:
  // `AIModel.status` is consumed by legacy UI/admin surfaces expecting one of
  // Ready/Waiting for API Key/Inactive/Unsupported/Quota Exceeded.
  // Registry status now uses active/preview/disabled, so we translate
  // conservatively and keep contracts backward-compatible.
  if (isEnabled === false || registryStatus === 'disabled') {
    return 'Inactive';
  }

  return 'Ready';
};

export const mapRegistryModelToAIModel = (m: (typeof USER_VISIBLE_MODEL_REGISTRY)[number]): AIModel => ({
  id: m.id,
  name: m.displayName,
  modelId: m.modelId,
  provider: toUiProvider(m.provider),
  providerId: m.providerId,
  family: m.family,
  modelCategory: m.modelCategory,
  transport: m.transport,
  category: m.category,
  description: m.description,
  helperText: m.description,
  
  toolCompatibility: normalizeToolCompatibility(m.toolCompatibility),
  routingPath: (m.routingPath || 'default').trim() || 'default',
  promptTemplateGroup: (m.promptTemplateGroup || 'default').trim() || 'default',
  
  supportsPreview: !!m.supportsPreview,
  supportsExport: !!m.supportsExport,
  supportsPrint: !!m.supportsPrint,
  supportsImageGeneration: !!m.supportsImageGeneration,
  supportsImageEditing: !!m.supportsImageEditing,
  supportsVideoGeneration: !!m.supportsVideoGeneration,
  supportsAudioGeneration: !!m.supportsAudioGeneration,
  supportsSpeechRecognition: !!m.supportsSpeechRecognition,
  supportsTranslation: !!m.supportsTranslation,
  supportsOCR: !!m.supportsOCR,
  supportsVisualReasoning: !!m.supportsVisualReasoning,
  supportsTextReasoning: !!m.supportsTextReasoning,
  supportsLongContext: !!m.supportsLongContext,
  supportsRealtime: !!m.supportsRealtime,

  supportsText: !!m.supportsText,
  supportsFiles: !!m.supportsFiles,
  supportsDocumentAnalysis: !!m.supportsDocumentAnalysis,
  supportsQuizGeneration: !!m.supportsQuizGeneration,
  supportsGenerateContent: !!m.supportsGenerateContent,
  supportsVideoOrMediaTasks: !!m.supportsVideoGeneration,
  supportsThinking: !!m.supportsThinking,
  supportsSearch: !!m.supportsSearch,
  supportsInfographicWorkflows: !!m.supportsInfographicWorkflows,
  
  isFreeFriendly: m.category === 'Free-Friendly',
  isPreview: m.status === 'preview',
  isFallback: !!m.isFallback,
  isEnabled: m.isEnabled !== false,
  status: toUiStatus(m.status, m.isEnabled),
  badge: m.badge,
  priority: m.sortOrder ?? m.priority,
});

// Keep as mutable array for existing admin/model-management flows that update
// local model state at runtime; callers rely on the current non-readonly shape.
export const INITIAL_MODELS: AIModel[] = USER_VISIBLE_MODEL_REGISTRY.map(mapRegistryModelToAIModel);
