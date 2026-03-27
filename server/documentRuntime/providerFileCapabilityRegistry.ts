import { getModelByAnyId } from '../../src/ai/models/modelRegistry.js';

export function resolveProviderFileCapability(input: {
  modelId: string;
  toolId: string;
}): {
  providerSupportsFiles: boolean;
  supportsDirectFileToModel: boolean;
} {
  const model = getModelByAnyId(input.modelId);
  const providerSupportsFiles = Boolean(
    model?.supportsFiles || model?.supportsDocumentAnalysis || model?.supportsVisualReasoning
  );

  return {
    providerSupportsFiles,
    supportsDirectFileToModel: providerSupportsFiles,
  };
}
