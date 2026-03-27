import { DocumentArtifactStore } from './documentArtifactStore.js';
import {
  DocumentContextResolutionInput,
  PromptContextResolutionResult,
} from './types.js';
import { promptContextAssembler } from './promptContextAssembler.js';

export class PromptContextResolver {
  constructor(private readonly artifactStore: DocumentArtifactStore) {}

  async resolve(input: DocumentContextResolutionInput): Promise<PromptContextResolutionResult> {
    const documentId = input.documentId || undefined;
    if (!documentId) {
      throw new Error('DOCUMENT_ID_REQUIRED');
    }

    const resolved = await this.artifactStore.getArtifactForDocument(input.actor, documentId);
    const assembled = promptContextAssembler.assemble({
      toolId: input.toolId,
      charLimit: input.charLimit,
      document: resolved.document,
      artifact: resolved.artifact,
      payload: resolved.payload,
      mode: input.mode || null,
    });

    return {
      ...resolved,
      fileContext: assembled.fileContext,
      additionalContext: assembled.additionalContext,
    };
  }
}
