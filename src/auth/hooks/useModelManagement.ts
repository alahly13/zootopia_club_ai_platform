import { useState, useEffect, useCallback } from 'react';
import { AIModel } from '../../constants/aiModels';
import { User } from '../../utils';
import toast from 'react-hot-toast';
import { toCanonicalModelId } from '../../ai/models/modelRegistry';
import { INITIAL_MODELS } from '../../utils/aiModels';
import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../../utils/browserStorage';

function resolveValidModelId(candidateId: string | undefined, models: AIModel[]): string {
  const canonical = toCanonicalModelId(candidateId || '');
  const exact = models.find(m => m.id === canonical || m.modelId === candidateId);

  if (exact && exact.isEnabled && exact.status === 'Ready') return exact.id;

  const fallback = models.find(m => m.isFallback && m.isEnabled && m.status === 'Ready');
  if (fallback) return fallback.id;

  const firstReady = models.find(m => m.isEnabled && m.status === 'Ready');
  if (firstReady) return firstReady.id;

  return models[0]?.id || INITIAL_MODELS[0].id;
}

export function useModelManagement(
  user: User | null, 
  updateUserSettings: (settings: any) => Promise<void>,
  _platformApiKey: string,
  _qwenApiKey: string,
  _qwenBaseUrl: string
) {
  const [models, setModels] = useState<AIModel[]>(() => INITIAL_MODELS);

  /**
   * LEGACY ACCOUNT-LEVEL MODEL PREFERENCE
   * ----------------------------------------------------------------------
   * This state is preserved for settings/admin preference surfaces only.
   * Live tool execution must use `useToolScopedModelSelection`, which keeps
   * each tool's chosen model isolated and prevents cross-tool contamination.
   */
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    const saved = safeLocalStorageGetItem('zootopia_selected_model');
    return resolveValidModelId(saved || INITIAL_MODELS[0].id, INITIAL_MODELS);
  });

  useEffect(() => {
    if (user?.settings?.preferredModelId) {
      const resolvedId = resolveValidModelId(user.settings.preferredModelId, models);
      if (resolvedId !== selectedModelId) {
        setSelectedModelId(resolvedId);
        safeLocalStorageSetItem('zootopia_selected_model', resolvedId);
      }
    }
  }, [user?.settings?.preferredModelId, models, selectedModelId]);

  const updateModel = useCallback((modelId: string, updates: Partial<AIModel>) => {
    setModels(prev => {
      const updated = prev.map(m => m.id === modelId ? { ...m, ...updates } : m);
      return updated;
    });
  }, []);

  const addModel = useCallback((model: AIModel) => {
    setModels(prev => {
      const existsInRegistry = INITIAL_MODELS.some((entry) => entry.id === model.id);
      if (!existsInRegistry) {
        toast.error('Only registry-backed models can appear in the live catalog.');
        return prev;
      }
      return prev.some((entry) => entry.id === model.id) ? prev : [...prev, model];
    });
  }, []);

  const deleteModel = useCallback((modelId: string) => {
    setModels(prev => {
      const updated = prev.filter(m => m.id !== modelId);
      return updated;
    });
    if (selectedModelId === modelId) {
      const nextModel = models.find(m => m.id !== modelId);
      if (nextModel) {
        selectModel(nextModel.id);
      }
    }
  }, [selectedModelId, models]);

  const selectModel = useCallback(async (modelId: string) => {
    const resolvedId = resolveValidModelId(modelId, models);
    setSelectedModelId(resolvedId);
    safeLocalStorageSetItem('zootopia_selected_model', resolvedId);

    if (user) {
      try {
        await updateUserSettings({ preferredModelId: resolvedId });
      } catch (error) {
        console.error('Failed to sync model preference', error);
      }
    }
  }, [user, updateUserSettings, models]);

  const getModelConfig = useCallback((modelId: string) => {
    const resolvedId = resolveValidModelId(modelId, models);
    const model = models.find(m => m.id === resolvedId);

    if (!model) {
      return undefined;
    }

    // Keep live provider secrets server-authoritative.
    // The client only needs canonical model metadata for selection and display.
    return { ...model } as AIModel;
  }, [models]);

  const getActiveModel = useCallback(() => {
    return getModelConfig(selectedModelId);
  }, [getModelConfig, selectedModelId]);

  const validateModel = useCallback(async (modelId: string): Promise<{ isValid: boolean; error?: string }> => {
    const model = models.find(m => m.id === modelId || m.modelId === modelId);
    if (!model) return { isValid: false, error: "Model not found" };

    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: model.provider === 'Google' ? 'google' : 'qwen',
          modelId: model.modelId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        return { isValid: false, error: data?.error || 'Validation failed' };
      }
      return { isValid: true };
    } catch (err: any) {
      return { isValid: false, error: err.message };
    }
  }, [models]);

  const validateQwenModels = useCallback(async () => {
    setModels(INITIAL_MODELS);
    toast.success('Qwen registry view refreshed');
  }, []);

  const testQwenConnection = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'qwen' })
      });
      const data = await response.json();
      if (data.success) return { success: true, message: 'Connection successful!' };
      return { success: false, message: data.error || 'Connection failed' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection failed' };
    }
  }, []);

  const testGoogleConnection = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google' })
      });
      const data = await response.json();
      if (data.success) return { success: true, message: 'Connection successful!' };
      return { success: false, message: data.error || 'Connection failed' };
    } catch (error: any) {
      return { success: false, message: error.message || 'Connection failed' };
    }
  }, []);

  const refreshModels = useCallback(async () => {
    setModels(INITIAL_MODELS);
    toast.success('Registry-backed models refreshed');
  }, []);

  return {
    models,
    setModels,
    selectedModelId,
    updateModel,
    addModel,
    deleteModel,
    selectModel,
    getModelConfig,
    getActiveModel,
    validateModel,
    validateQwenModels,
    testQwenConnection,
    testGoogleConnection,
    refreshModels
  };
}
