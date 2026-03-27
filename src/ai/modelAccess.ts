import {
  USER_VISIBLE_MODEL_REGISTRY,
  getModelByAnyId,
  toCanonicalModelId,
} from './models/modelRegistry';
import { AIModelMetadata } from './types';

export const MODEL_UNLOCK_PRICE_EGP = 300 as const;

export type ModelExecutionMode = 'frontend' | 'backend';

export type ModelAccessResolution = {
  allowed: boolean;
  canonicalModelId: string;
  reasonCode:
    | 'admin'
    | 'default'
    | 'entitled'
    | 'model-not-found'
    | 'model-incompatible'
    | 'model-locked';
  message: string;
  fallbackModelId?: string;
  executionMode?: ModelExecutionMode;
};

const TEXT_DEFAULT_MODEL_IDS = ['gemini-3-flash-preview', 'qwen3.5-plus'] as const;

const TOOL_DEFAULT_MODEL_PRIORITY: Record<string, readonly string[]> = {
  analyze: TEXT_DEFAULT_MODEL_IDS,
  chat: TEXT_DEFAULT_MODEL_IDS,
  concepts: TEXT_DEFAULT_MODEL_IDS,
  diagrams: TEXT_DEFAULT_MODEL_IDS,
  flashcards: TEXT_DEFAULT_MODEL_IDS,
  infographic: TEXT_DEFAULT_MODEL_IDS,
  image: TEXT_DEFAULT_MODEL_IDS,
  'image-generator': ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'],
  'image-editor': ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'],
  'live-voice': ['gemini-2.5-flash-native-audio-preview-09-2025'],
  mindmap: TEXT_DEFAULT_MODEL_IDS,
  notes: TEXT_DEFAULT_MODEL_IDS,
  quiz: TEXT_DEFAULT_MODEL_IDS,
  study: TEXT_DEFAULT_MODEL_IDS,
  summary: TEXT_DEFAULT_MODEL_IDS,
  translate: TEXT_DEFAULT_MODEL_IDS,
  'video-generator': ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'],
};

const STUDY_TOOL_IDS = new Set(['summary', 'flashcards', 'mindmap', 'concepts', 'notes', 'diagrams']);

export const normalizeToolId = (toolId: string): string => (toolId || '').trim().toLowerCase();

export const isAdminRoleValue = (role: unknown): boolean =>
  String(role || '').trim().toLowerCase() === 'admin';

export const isModelCompatibleWithTool = (model: AIModelMetadata, toolId: string): boolean => {
  const normalizedToolId = normalizeToolId(toolId);

  if (!normalizedToolId) {
    return true;
  }

  if (Array.isArray(model.toolCompatibility) && model.toolCompatibility.includes(normalizedToolId)) {
    return true;
  }

  if (STUDY_TOOL_IDS.has(normalizedToolId)) {
    return !!model.supportsText || !!model.supportsTextReasoning;
  }

  switch (normalizedToolId) {
    case 'analyze':
      return !!model.supportsDocumentAnalysis || !!model.supportsText || !!model.supportsTextReasoning || !!model.supportsOCR || !!model.supportsVisualReasoning;
    case 'chat':
      return !!model.supportsText || !!model.supportsTextReasoning;
    case 'image':
      return !!model.supportsText || !!model.supportsTextReasoning;
    case 'image-generator':
      return !!model.supportsImageGeneration;
    case 'image-editor':
      return !!model.supportsImageEditing;
    case 'infographic':
      return !!model.supportsInfographicWorkflows || !!model.supportsText || !!model.supportsTextReasoning || !!model.supportsOCR || !!model.supportsVisualReasoning;
    case 'live-voice':
      return !!model.supportsAudioGeneration || !!model.supportsSpeechRecognition || !!model.supportsRealtime;
    case 'quiz':
      return !!model.supportsQuizGeneration || !!model.supportsText || !!model.supportsTextReasoning;
    case 'translate':
      return !!model.supportsTranslation || !!model.supportsText || !!model.supportsTextReasoning;
    case 'video-generator':
      return !!model.supportsVideoGeneration;
    default:
      return !!model.supportsText || !!model.supportsTextReasoning || model.toolCompatibility.length === 0;
  }
};

export const getCompatibleModelsForTool = (
  toolId: string,
  models: AIModelMetadata[] = USER_VISIBLE_MODEL_REGISTRY
): AIModelMetadata[] => {
  const normalizedToolId = normalizeToolId(toolId);

  return models
    .filter((model) => model.isEnabled !== false)
    .filter((model) => model.isVisibleToUsers !== false)
    .filter((model) => !['hidden', 'planned', 'disabled', 'deprecated'].includes(model.lifecycleStatus))
    .filter((model) => isModelCompatibleWithTool(model, normalizedToolId))
    .sort((left, right) => (left.sortOrder ?? left.priority) - (right.sortOrder ?? right.priority));
};

const getDefaultPriorityIdsForTool = (toolId: string): readonly string[] => {
  const normalizedToolId = normalizeToolId(toolId);
  return TOOL_DEFAULT_MODEL_PRIORITY[normalizedToolId] || TEXT_DEFAULT_MODEL_IDS;
};

const buildProviderFallbackDefaultIds = (toolId: string): string[] => {
  const compatible = getCompatibleModelsForTool(toolId);
  const googleDefault = compatible.find((model) => model.provider === 'google');
  const qwenDefault = compatible.find((model) => model.provider === 'qwen');

  return [googleDefault?.id, qwenDefault?.id].filter((value): value is string => Boolean(value));
};

export const getDefaultAccessibleModelIdsForTool = (toolId: string): string[] => {
  const priorityIds = getDefaultPriorityIdsForTool(toolId);
  const resolved = priorityIds
    .map((candidateId) => getModelByAnyId(candidateId))
    .filter((model): model is AIModelMetadata => Boolean(model))
    .filter((model) => model.isEnabled !== false)
    .filter((model) => isModelCompatibleWithTool(model, toolId))
    .map((model) => model.id);

  if (resolved.length > 0) {
    return Array.from(new Set(resolved));
  }

  return Array.from(new Set(buildProviderFallbackDefaultIds(toolId)));
};

export const getUnlockableModelIdsForTool = (toolId: string): string[] => {
  const defaults = new Set(getDefaultAccessibleModelIdsForTool(toolId));
  return getCompatibleModelsForTool(toolId)
    .map((model) => model.id)
    .filter((modelId) => !defaults.has(modelId));
};

export const getFirstAccessibleModelIdForTool = (params: {
  toolId: string;
  unlockedModels?: string[];
  isAdmin?: boolean;
}): string | undefined => {
  const compatible = getCompatibleModelsForTool(params.toolId);
  const unlocked = new Set((params.unlockedModels || []).map((value) => toCanonicalModelId(value)));
  const defaults = new Set(getDefaultAccessibleModelIdsForTool(params.toolId));

  if (params.isAdmin) {
    return compatible[0]?.id;
  }

  const accessible = compatible.find((model) => defaults.has(model.id) || unlocked.has(model.id));
  return accessible?.id;
};

export const resolveExecutionModeForModel = (
  model: AIModelMetadata,
  options?: { isTemporaryAccess?: boolean }
): ModelExecutionMode => {
  // Keep provider credentials server-resolved from environment configuration
  // for normal generation flows. This avoids mixing client-side model choice
  // with client-side secret ownership and keeps routing traceable end-to-end.
  return 'backend';
};

export const resolveModelAccess = (input: {
  modelId: string;
  toolId: string;
  unlockedModels?: string[];
  isAdmin?: boolean;
  isTemporaryAccess?: boolean;
}): ModelAccessResolution => {
  const normalizedToolId = normalizeToolId(input.toolId);
  const canonicalModelId = toCanonicalModelId(input.modelId);
  const model = getModelByAnyId(canonicalModelId);

  if (!model || model.isEnabled === false) {
    return {
      allowed: false,
      canonicalModelId,
      reasonCode: 'model-not-found',
      message: 'The selected model is not available in the live registry.',
      fallbackModelId: getFirstAccessibleModelIdForTool({
        toolId: normalizedToolId,
        unlockedModels: input.unlockedModels,
        isAdmin: input.isAdmin,
      }),
    };
  }

  if (!isModelCompatibleWithTool(model, normalizedToolId)) {
    return {
      allowed: false,
      canonicalModelId: model.id,
      reasonCode: 'model-incompatible',
      message: `Model ${model.id} is not compatible with tool ${normalizedToolId}.`,
      fallbackModelId: getFirstAccessibleModelIdForTool({
        toolId: normalizedToolId,
        unlockedModels: input.unlockedModels,
        isAdmin: input.isAdmin,
      }),
    };
  }

  if (input.isAdmin) {
    return {
      allowed: true,
      canonicalModelId: model.id,
      reasonCode: 'admin',
      message: 'Admin access grants unrestricted model use.',
      executionMode: resolveExecutionModeForModel(model, { isTemporaryAccess: input.isTemporaryAccess }),
    };
  }

  const defaultIds = new Set(getDefaultAccessibleModelIdsForTool(normalizedToolId));
  if (defaultIds.has(model.id)) {
    return {
      allowed: true,
      canonicalModelId: model.id,
      reasonCode: 'default',
      message: 'Model is included in the default non-admin access tier.',
      executionMode: resolveExecutionModeForModel(model, { isTemporaryAccess: input.isTemporaryAccess }),
    };
  }

  const unlockedIds = new Set((input.unlockedModels || []).map((value) => toCanonicalModelId(value)));
  if (unlockedIds.has(model.id)) {
    return {
      allowed: true,
      canonicalModelId: model.id,
      reasonCode: 'entitled',
      message: 'Model access was granted through an explicit entitlement.',
      executionMode: resolveExecutionModeForModel(model, { isTemporaryAccess: input.isTemporaryAccess }),
    };
  }

  return {
    allowed: false,
    canonicalModelId: model.id,
    reasonCode: 'model-locked',
    message: 'Model is locked and requires admin grant, unlock code, or paid unlock entitlement.',
    fallbackModelId: getFirstAccessibleModelIdForTool({
      toolId: normalizedToolId,
      unlockedModels: input.unlockedModels,
      isAdmin: input.isAdmin,
    }),
  };
};
