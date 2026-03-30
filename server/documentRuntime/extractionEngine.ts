import { validateUploadDescriptor } from '../../src/upload/documentFilePolicy.js';
import { getDocumentExtractionEngine } from './config.js';
import { extractionCoordinator } from './extractionCoordinator.js';
import { legacyExtractionCoordinator } from './legacyExtractionCoordinator.js';
import { DocumentActorContext, DocumentOperationState, ExtractedArtifactEnvelope } from './types.js';

type ExtractionReportStage = Extract<
  DocumentOperationState['stage'],
  'submitting_to_datalab' | 'waiting_for_datalab' | 'extracting' | 'finalizing_extraction'
>;

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
  reportStage?: (input: {
    stage: ExtractionReportStage;
    message: string;
  }) => Promise<void> | void;
};

/**
 * Backward-compatible extraction entry point.
 * Keep the public function stable so the intake flow and shared document
 * runtime contract do not need to know which backend extractor is active.
 *
 * Engine selection stays backend-only on purpose. The frontend upload flow and
 * DocumentContext mirror must remain stable consumers of the backend-owned
 * artifact/result model rather than sources of extraction truth.
 */
export async function extractDocumentArtifact(input: ExtractionInput): Promise<ExtractedArtifactEnvelope> {
  validateUploadDescriptor({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
  });

  const extractionEngine = getDocumentExtractionEngine();

  if (extractionEngine === 'python_legacy') {
    return legacyExtractionCoordinator.extract(input);
  }

  return extractionCoordinator.extract(input);
}
