import { getModelByAnyId, toCanonicalModelId } from './models/modelRegistry';

export type ToolFallbackPlan = {
  toolId: string;
  provider?: string;
  allowAutomaticFallback: boolean;
  candidateModelIds: string[];
};

const SAME_PROVIDER_FALLBACKS: Record<string, Partial<Record<'google' | 'qwen', string[]>>> = {
  analyze: {
    google: ['gemini-3-flash-preview'],
    qwen: ['qwen-plus'],
  },
  chat: {
    google: ['gemini-3-flash-preview'],
    qwen: ['qwen-plus'],
  },
  infographic: {
    google: ['gemini-3-flash-preview'],
    qwen: ['qwen-plus', 'qwen3-vl-flash'],
  },
  quiz: {
    google: ['gemini-3-flash-preview'],
    qwen: ['qwen-plus'],
  },
  study: {
    google: ['gemini-3-flash-preview'],
    qwen: ['qwen-plus', 'qwen3-vl-flash'],
  },
};

export const getFallbackPlan = (params: {
  toolId: string;
  modelId: string;
}): ToolFallbackPlan => {
  const normalizedToolId = String(params.toolId || '').trim().toLowerCase();
  const model = getModelByAnyId(params.modelId);
  const provider = model?.provider;

  const rawCandidates =
    (provider && SAME_PROVIDER_FALLBACKS[normalizedToolId]?.[provider]) || [];

  const candidateModelIds = rawCandidates
    .map((candidateId) => toCanonicalModelId(candidateId))
    .filter((candidateId, index, allCandidates) =>
      Boolean(candidateId) &&
      candidateId !== model?.id &&
      allCandidates.indexOf(candidateId) === index
    );

  return {
    toolId: normalizedToolId,
    provider,
    allowAutomaticFallback: false,
    candidateModelIds,
  };
};
