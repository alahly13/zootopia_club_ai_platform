import { validateUploadDescriptor } from '../../src/upload/documentFilePolicy.js';
import { extractionCoordinator } from './extractionCoordinator.js';
import { DocumentActorContext, ExtractedArtifactEnvelope } from './types.js';

type ExtractionInput = {
  actor: DocumentActorContext;
  workflowId: string;
  documentId: string;
  sourceFileId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  sourcePath: string;
  sourceRelativePath: string;
};

/**
 * Backward-compatible extraction entry point.
 * The old flat extractor has been replaced by a layered coordinator, but the
 * public function stays stable so the current intake flow and tests do not
 * need to know which internal services are now involved.
 */
export async function extractDocumentArtifact(input: ExtractionInput): Promise<ExtractedArtifactEnvelope> {
  validateUploadDescriptor({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
  });

  return extractionCoordinator.extract(input);
}
