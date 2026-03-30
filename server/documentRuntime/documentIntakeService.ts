import crypto from 'crypto';
import {
  normalizeUploadExtension,
  validateUploadDescriptor,
} from '../../src/upload/documentFilePolicy.js';
import { logDiagnostic } from '../diagnostics.js';
import { extractDocumentArtifact } from './extractionEngine.js';
import { runtimeStateService } from './runtimeStateService.js';
import { jobOrchestrationService } from './jobOrchestrationService.js';
import { documentWorkspaceStorage } from './documentStorage.js';
import { DocumentArtifactStore } from './documentArtifactStore.js';
import { resolveDocumentProcessingStrategy } from './documentProcessingStrategyResolver.js';
import { DOCUMENT_EXTRACTION_VERSION, getDocumentExtractionEngine } from './config.js';
import { DocumentActorContext, DocumentIntakeResult, DocumentOperationState } from './types.js';

export class DocumentIntakeService {
  constructor(private readonly artifactStore: DocumentArtifactStore) {}

  async intake(input: {
    actor: DocumentActorContext;
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    requestedPathway?: 'local_extraction' | 'direct_file_to_model' | null;
    operationId?: string | null;
  }): Promise<DocumentIntakeResult> {
    const documentId = crypto.randomUUID();
    const workflowId = crypto.randomUUID();
    const operationId =
      (typeof input.operationId === 'string' && input.operationId.trim()) ||
      `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const traceId = `${documentId}:${operationId}`;
    const cancelledMessage = 'DOCUMENT_OPERATION_CANCELLED';
    const staleWriteMessage = 'DOCUMENT_RUNTIME_STALE_WRITE_BLOCKED';
    const extractionEngine = getDocumentExtractionEngine();
    const strategy = resolveDocumentProcessingStrategy({
      toolId: 'document-runtime',
      requestedPathway: input.requestedPathway || 'local_extraction',
    });
    const startedAt = new Date().toISOString();

    return runtimeStateService.withDocumentLock(input.actor, documentId, async () => {
      let documentCreated = false;
      const ensureOperationActive = async () => {
        if (await runtimeStateService.isCancellationRequested(input.actor, operationId)) {
          throw new Error(cancelledMessage);
        }

        if (!documentCreated) {
          return;
        }

        const currentDocument = await this.artifactStore.getOwnedDocument(input.actor, documentId);
        if (currentDocument.status === 'cancelled' || currentDocument.status === 'deleted') {
          throw new Error(staleWriteMessage);
        }
      };

      try {
        await jobOrchestrationService.start(input.actor, {
          operationId,
          documentId,
          stage: 'validating',
          status: 'running',
          message: 'Validating uploaded document',
          processingPathway: strategy.pathway,
          startedAt,
          updatedAt: startedAt,
        });

        validateUploadDescriptor({
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.buffer.byteLength,
        });

        const storedSource = await documentWorkspaceStorage.persistSourceFile({
          actor: input.actor,
          workflowId,
          documentId,
          fileName: input.fileName,
          buffer: input.buffer,
        });

        logDiagnostic('info', 'document_runtime.source_file_persisted', {
          area: 'document-runtime',
          traceId,
          stage: 'upload',
          status: 'success',
          details: {
            documentId,
            workflowId,
            sourceFileId: storedSource.sourceFileId,
            fileName: input.fileName,
            processingPathway: strategy.pathway,
          },
        });

        const document = await this.artifactStore.createDocumentRecord({
          documentId,
          workflowId,
          sourceFileId: storedSource.sourceFileId,
          activeArtifactId: null,
          ownerActorId: input.actor.actorId,
          ownerRole: input.actor.actorRole,
          workspaceScope: input.actor.scope,
          processingPathway: strategy.pathway,
          requestedPathway: input.requestedPathway || 'local_extraction',
          status: 'processing',
          fileName: input.fileName,
          mimeType: input.mimeType,
          extension: normalizeUploadExtension(input.fileName),
          fileType: 'unknown',
          fileSizeBytes: input.buffer.byteLength,
          sourceStoragePath: storedSource.absolutePath,
          sourceStorageRelativePath: storedSource.relativePath,
          sourceSha256: storedSource.sha256,
          extractionVersion: DOCUMENT_EXTRACTION_VERSION,
          extractionStrategy: 'pending',
          extractionMeta: null,
          latestError: null,
          runtimeOperationId: operationId,
        });
        documentCreated = true;

        logDiagnostic('info', 'document_runtime.document_record_ready', {
          area: 'document-runtime',
          traceId,
          stage: 'persist_document',
          status: 'success',
          details: {
            documentId: document.documentId,
            workflowId: document.workflowId,
            runtimeOperationId: document.runtimeOperationId,
            processingPathway: strategy.pathway,
          },
        });

        await runtimeStateService.setDocumentState(input.actor, documentId, {
          documentId,
          workflowId,
          operationId,
          status: 'processing',
          processingPathway: strategy.pathway,
          fileName: input.fileName,
          mimeType: input.mimeType,
        });

        await ensureOperationActive();
        await jobOrchestrationService.patch(input.actor, operationId, {
          stage: extractionEngine === 'python_legacy' ? 'extracting' : 'submitting_to_datalab',
          message:
            extractionEngine === 'python_legacy'
              ? 'Running legacy layered extraction'
              : 'Submitting document to Datalab Convert',
        });

        /**
         * Keep extraction-stage messages backend-authoritative. The frontend
         * upload flow must not guess hidden remote-conversion progress, and it
         * must not decide which extraction engine is active.
         */
        const extracted = await extractDocumentArtifact({
          actor: input.actor,
          workflowId,
          documentId,
          sourceFileId: storedSource.sourceFileId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          buffer: input.buffer,
          sourcePath: storedSource.absolutePath,
          sourceRelativePath: storedSource.relativePath,
          reportStage: async (stageUpdate) => {
            await jobOrchestrationService.patch(input.actor, operationId, {
              stage: stageUpdate.stage,
              message: stageUpdate.message,
            });
          },
        });

        await ensureOperationActive();
        await jobOrchestrationService.patch(input.actor, operationId, {
          stage: 'persisting_artifact',
          message: 'Persisting extracted artifact',
        });

        const persistedArtifact = await documentWorkspaceStorage.persistArtifactPayload({
          actor: input.actor,
          workflowId,
          documentId,
          artifactId: extracted.payload.artifactId,
          payload: extracted.payload,
        });

        await ensureOperationActive();
        const artifact = await this.artifactStore.createArtifactRecord({
          payload: extracted.payload,
          relativePath: persistedArtifact.relativePath,
          workspaceRootRelativePath: persistedArtifact.workspaceRootRelativePath,
          originalFilePath: persistedArtifact.originalFilePath,
          finalExtractedTextPath: persistedArtifact.finalExtractedTextPath,
          structuredJsonPath: persistedArtifact.structuredJsonPath,
          normalizedMarkdownPath: persistedArtifact.normalizedMarkdownPath,
          pageMapPath: persistedArtifact.pageMapPath,
          ocrBlocksPath: persistedArtifact.ocrBlocksPath,
          manifestPath: persistedArtifact.manifestPath,
        });

        logDiagnostic('info', 'document_runtime.artifact_record_ready', {
          area: 'document-runtime',
          traceId,
          stage: 'persist_artifact',
          status: 'success',
          details: {
            documentId,
            workflowId,
            artifactId: artifact.artifactId,
            processingPathway: strategy.pathway,
          },
        });

        const runtime = {
          documentId,
          workflowId,
          artifactId: artifact.artifactId,
          processingPathway: strategy.pathway,
          sourceFileId: storedSource.sourceFileId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileType: extracted.payload.fileType,
          updatedAt: new Date().toISOString(),
        } as const;

        await runtimeStateService.setActiveDocument(input.actor, runtime);
        await runtimeStateService.setDocumentState(input.actor, documentId, {
          documentId,
          workflowId,
          artifactId: artifact.artifactId,
          status: 'ready',
          processingPathway: strategy.pathway,
          fileType: extracted.payload.fileType,
          extractionStrategy: extracted.payload.extractionStrategy,
          textLength: extracted.textLength,
          pageCount: extracted.payload.pageSegments.length,
          sectionCount: extracted.payload.structuredDocumentJson.sections.length,
          ocrBlockCount: extracted.payload.ocrBlocks.length,
          extractorChain:
            ((extracted.payload.extractionMeta?.extractorChain as string[] | undefined) || []).slice(0, 20),
          fallbackChain:
            ((extracted.payload.extractionMeta?.fallbackChain as string[] | undefined) || []).slice(0, 20),
          warnings:
            ((extracted.payload.extractionMeta?.warnings as string[] | undefined) || []).slice(0, 20),
          updatedAt: new Date().toISOString(),
        });

        logDiagnostic('info', 'document_runtime.persistence_ready', {
          area: 'document-runtime',
          traceId,
          stage: 'persist',
          status: 'success',
          details: {
            documentId,
            workflowId,
            artifactId: artifact.artifactId,
            fileName: input.fileName,
            fileType: extracted.payload.fileType,
            extractionStrategy: extracted.payload.extractionStrategy,
            textLength: extracted.textLength,
            pageCount: extracted.payload.pageSegments.length,
            sectionCount: extracted.payload.structuredDocumentJson.sections.length,
            extractorChain: extracted.payload.extractionMeta?.extractorChain || [],
            fallbackChain: extracted.payload.extractionMeta?.fallbackChain || [],
            processingPathway: strategy.pathway,
          },
        });

        const operation = await jobOrchestrationService.patch(input.actor, operationId, {
          stage: 'ready',
          status: 'success',
          message: 'Document artifact is ready for tool consumption',
        });
        await runtimeStateService.clearCancellationRequest(input.actor, operationId);

        return {
          document: {
            ...document,
            workflowId,
            activeArtifactId: artifact.artifactId,
            status: 'ready',
            fileType: extracted.payload.fileType,
            extractionStrategy: extracted.payload.extractionStrategy,
            extractionMeta: extracted.payload.extractionMeta,
            updatedAt: new Date().toISOString(),
            expiresAt: extracted.payload.expiresAt || null,
          },
          artifact,
          payload: extracted.payload,
          runtime,
          operation: operation || {
            operationId,
            documentId,
            stage: 'ready',
            status: 'success',
            message: 'Document artifact is ready for tool consumption',
            processingPathway: strategy.pathway,
            startedAt,
            updatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        const runtimeError = error as Error & {
          code?: string;
          operationStage?: DocumentOperationState['stage'];
          retryable?: boolean;
        };
        const errorMessage = String(runtimeError?.message || 'document-intake-failed');
        const wasCancelled =
          errorMessage === cancelledMessage || errorMessage === staleWriteMessage;

        if (wasCancelled) {
          await jobOrchestrationService.cancel(input.actor, operationId, {
            stage: 'cancelled',
            message: 'Document processing was cancelled.',
          });

          if (documentCreated) {
            const currentDocument = await this.artifactStore
              .getOwnedDocument(input.actor, documentId)
              .catch(() => null);
            if (currentDocument?.status !== 'cancelled' && currentDocument?.status !== 'deleted') {
              await this.artifactStore.markCancelled(input.actor, documentId);
            } else {
              await documentWorkspaceStorage.removeDocumentWorkspace(input.actor, workflowId, documentId);
            }
          }

          await runtimeStateService.clearCancellationRequest(input.actor, operationId);
          logDiagnostic('info', 'document_runtime.persistence_cancelled', {
            area: 'document-runtime',
            traceId,
            stage: 'cancelled',
            status: 'cancelled',
            details: {
              documentId,
              workflowId,
              fileName: input.fileName,
              processingPathway: strategy.pathway,
            },
          });
          throw new Error('File processing was cancelled.');
        }

        await jobOrchestrationService.fail(input.actor, operationId, {
          stage: runtimeError.operationStage || 'failed',
          message: errorMessage,
          errorCode: runtimeError.code || 'DOCUMENT_INTAKE_FAILED',
        });

        if (documentCreated) {
          await this.artifactStore.markFailed(input.actor, documentId, {
            code: runtimeError.code || 'DOCUMENT_INTAKE_FAILED',
            message: errorMessage,
            retryable: runtimeError.retryable ?? true,
          });
          await runtimeStateService.clearDocumentState(input.actor, documentId);
          await documentWorkspaceStorage.removeDocumentWorkspace(input.actor, workflowId, documentId);
        }

        logDiagnostic('error', 'document_runtime.persistence_failed', {
          area: 'document-runtime',
          traceId,
          stage: 'failed',
          status: 'failed',
          details: {
            documentId,
            workflowId,
            fileName: input.fileName,
            processingPathway: strategy.pathway,
            errorMessage,
          },
        });

        throw error;
      }
    });
  }
}
