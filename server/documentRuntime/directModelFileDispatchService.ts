import path from 'path';
import { DOCUMENT_DIRECT_FILE_MODE_ENABLED, DOCUMENT_RUNTIME_STORAGE_ROOT } from './config.js';
import { DocumentArtifactStore } from './documentArtifactStore.js';
import { resolveProviderFileCapability } from './providerFileCapabilityRegistry.js';
import {
  DirectModelDispatchPreparationInput,
  DirectModelDispatchPreparationResult,
} from './types.js';

export class DirectModelFileDispatchService {
  constructor(private readonly artifactStore: DocumentArtifactStore) {}

  async prepare(
    input: DirectModelDispatchPreparationInput
  ): Promise<DirectModelDispatchPreparationResult> {
    if (!DOCUMENT_DIRECT_FILE_MODE_ENABLED) {
      throw new Error('DIRECT_FILE_MODE_DISABLED');
    }

    const capability = resolveProviderFileCapability({
      modelId: input.modelId,
      toolId: input.toolId,
    });

    if (!capability.supportsDirectFileToModel) {
      throw new Error('DIRECT_FILE_MODE_UNSUPPORTED_FOR_MODEL');
    }

    const document = await this.artifactStore.getOwnedDocument(input.actor, input.documentId);

    return {
      enabled: true,
      providerSupportsFiles: capability.providerSupportsFiles,
      pathway: 'direct_file_to_model',
      providerModelId: input.modelId,
      toolId: input.toolId,
      documentId: document.documentId,
      sourceFileId: document.sourceFileId,
      fileReference: {
        fileName: document.fileName,
        mimeType: document.mimeType,
        storagePath: path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, document.sourceStorageRelativePath),
        relativePath: document.sourceStorageRelativePath,
      },
      requestShape: {
        mode: input.mode,
        providerSettings: input.providerSettings,
        toolSettings: input.toolSettings,
        userPreferences: input.userPreferences,
      },
    };
  }
}
