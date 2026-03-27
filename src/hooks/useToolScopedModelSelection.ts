import * as React from 'react';
import { AIModel } from '../utils/aiModels';
import { User } from '../utils';
import {
  buildToolModelStorageKey,
  readPersistedToolModelSelection,
  resolveInitialToolModelSelection,
  resolveNextToolModelSelection,
  resolveToolSelectionScopeId,
} from '../ai/toolModelSelection';

export const useToolScopedModelSelection = (params: {
  toolId: string;
  selectionScopeId?: string;
  models: AIModel[];
  user: User | null;
  fallbackModelId?: string;
}) => {
  const { toolId, selectionScopeId, models, user, fallbackModelId } = params;
  const resolvedSelectionScopeId = React.useMemo(
    () => resolveToolSelectionScopeId({ toolId, selectionScopeId }),
    [selectionScopeId, toolId]
  );
  const storageKey = React.useMemo(
    () => buildToolModelStorageKey(resolvedSelectionScopeId),
    [resolvedSelectionScopeId]
  );

  /**
   * Keep compatibility/execution identity separate from persistence scope.
   * A page may contain multiple subtools or modes that share the same model
   * compatibility rules but must remember selections independently.
   */
  const [selectedModelId, setSelectedModelIdState] = React.useState<string>(() =>
    resolveInitialToolModelSelection({
      toolId,
      selectionScopeId,
      models,
      user,
      fallbackModelId,
      persistedModelId: readPersistedToolModelSelection({ toolId, selectionScopeId }),
    })
  );

  React.useEffect(() => {
    const nextModelId = resolveInitialToolModelSelection({
      toolId,
      selectionScopeId,
      models,
      user,
      fallbackModelId,
      persistedModelId: readPersistedToolModelSelection({ toolId, selectionScopeId }),
    });

    if (nextModelId && nextModelId !== selectedModelId) {
      setSelectedModelIdState(nextModelId);
      localStorage.setItem(storageKey, nextModelId);
    }
  }, [
    fallbackModelId,
    models,
    selectionScopeId,
    selectedModelId,
    storageKey,
    toolId,
    user?.accountScope,
    user?.id,
    user?.isTemporaryAccess,
    user?.role,
    user?.unlockedModels,
  ]);

  const setSelectedModelId = React.useCallback((modelId: string) => {
    const nextModelId = resolveNextToolModelSelection({
      nextModelId: modelId,
      toolId,
      selectionScopeId,
      models,
      user,
      fallbackModelId,
    });

    if (!nextModelId) {
      return '';
    }

    setSelectedModelIdState(nextModelId);
    localStorage.setItem(storageKey, nextModelId);
    return nextModelId;
  }, [fallbackModelId, models, selectionScopeId, storageKey, toolId, user]);

  const selectedModel = React.useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId]
  );
  const selectedProvider = selectedModel?.provider || '';

  return {
    selectedModelId,
    setSelectedModelId,
    selectedModel,
    selectedProvider,
    selectionScopeId: resolvedSelectionScopeId,
  };
};
