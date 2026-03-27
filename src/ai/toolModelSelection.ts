import { User } from '../utils';
import { AIModel } from '../utils/aiModels';
import { getFirstAccessibleModelIdForTool, resolveModelAccess } from './modelAccess';

/**
 * Tool-scoped model-selection helpers
 * --------------------------------------------------------------------------
 * Keep selection persistence keyed by tool so one tool can never silently
 * override another tool's chosen model.
 */

export const buildToolModelStorageKey = (toolId: string) =>
  `zootopia_tool_model:${(toolId || '').trim().toLowerCase()}`;

type ResolveToolModelSelectionParams = {
  toolId: string;
  selectionScopeId?: string;
  models: AIModel[];
  user: User | null;
  persistedModelId?: string;
  fallbackModelId?: string;
};

export const resolveToolSelectionScopeId = (params: {
  toolId: string;
  selectionScopeId?: string;
}) => (params.selectionScopeId || params.toolId || '').trim().toLowerCase();

const resolveAccessibleToolFallback = (params: {
  toolId: string;
  models: AIModel[];
  user: User | null;
}): string => {
  return (
    getFirstAccessibleModelIdForTool({
      toolId: params.toolId,
      unlockedModels: params.user?.unlockedModels,
      isAdmin: String(params.user?.role || '').trim().toLowerCase() === 'admin',
    }) ||
    params.models[0]?.id ||
    ''
  );
};

export const resolveInitialToolModelSelection = (
  params: ResolveToolModelSelectionParams
): string => {
  const candidateId =
    params.persistedModelId ||
    params.fallbackModelId ||
    resolveAccessibleToolFallback(params);

  const access = resolveModelAccess({
    modelId: candidateId,
    toolId: params.toolId,
    unlockedModels: params.user?.unlockedModels,
    isAdmin: String(params.user?.role || '').trim().toLowerCase() === 'admin',
    isTemporaryAccess:
      params.user?.isTemporaryAccess === true ||
      params.user?.accountScope === 'faculty_science_fast_access',
  });

  if (access.allowed) {
    return access.canonicalModelId;
  }

  return access.fallbackModelId || resolveAccessibleToolFallback(params);
};

export const resolveNextToolModelSelection = (
  params: ResolveToolModelSelectionParams & { nextModelId: string }
): string => {
  const access = resolveModelAccess({
    modelId: params.nextModelId,
    toolId: params.toolId,
    unlockedModels: params.user?.unlockedModels,
    isAdmin: String(params.user?.role || '').trim().toLowerCase() === 'admin',
    isTemporaryAccess:
      params.user?.isTemporaryAccess === true ||
      params.user?.accountScope === 'faculty_science_fast_access',
  });

  if (access.allowed) {
    return access.canonicalModelId;
  }

  return access.fallbackModelId || resolveAccessibleToolFallback(params);
};

export const readPersistedToolModelSelection = (params: {
  toolId: string;
  selectionScopeId?: string;
}): string | undefined => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return undefined;
  }

  const storageKey = buildToolModelStorageKey(
    resolveToolSelectionScopeId({
      toolId: params.toolId,
      selectionScopeId: params.selectionScopeId,
    })
  );

  return window.localStorage.getItem(storageKey) || undefined;
};
