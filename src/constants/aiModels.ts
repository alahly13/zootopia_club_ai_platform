import { USER_VISIBLE_MODEL_REGISTRY } from '../ai/models/modelRegistry';
import { AIModel, AIProvider } from '../utils/aiModels';

export type { AIModel };

const toUiProvider = (provider: string): AIProvider => {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'google') return 'Google';
  if (normalized === 'qwen') return 'Qwen';
  if (normalized === 'openai') return 'OpenAI';
  if (normalized === 'anthropic') return 'Anthropic';
  return 'Custom';
};

export const AI_MODELS: AIModel[] = USER_VISIBLE_MODEL_REGISTRY.map(m => ({
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
  
  toolCompatibility: m.toolCompatibility || [],
  routingPath: m.routingPath || 'default',
  promptTemplateGroup: m.promptTemplateGroup || 'default',
  
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
  isEnabled: m.isEnabled !== false,
  status: m.status === 'disabled' ? 'Inactive' : 'Ready',
  badge: m.badge,
  priority: m.sortOrder ?? m.priority,
}));
