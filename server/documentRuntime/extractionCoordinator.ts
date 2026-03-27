import crypto from 'crypto';
import { actorWorkspaceResolver } from './actorWorkspaceResolver.js';
import { DOCUMENT_EXTRACTION_VERSION, DOCUMENT_RUNTIME_ARTIFACT_TTL_SEC } from './config.js';
import { documentStructureNormalizer } from './documentStructureNormalizer.js';
import { fileTypeDetectionService } from './fileTypeDetectionService.js';
import { hybridMergeService } from './hybridMergeService.js';
import { nativeExtractionService } from './nativeExtractionService.js';
import { ocrExtractionService } from './ocrExtractionService.js';
import { pythonDocumentWorker } from './pythonDocumentWorker.js';
import { DocumentActorContext, DocumentArtifactPayload, ExtractedArtifactEnvelope } from './types.js';

type ExtractionCoordinatorInput = {
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

export class ExtractionCoordinator {
  async extract(input: ExtractionCoordinatorInput): Promise<ExtractedArtifactEnvelope> {
    const strategy = await fileTypeDetectionService.resolveStrategy({
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });

    const pythonResponse =
      strategy.detection.supportsNativeExtraction || strategy.detection.supportsOcr
        ? await pythonDocumentWorker.extract({
            sourcePath: input.sourcePath,
            fileName: input.fileName,
            mimeType: input.mimeType,
            mode: strategy.executionMode === 'marker' ? 'native' : strategy.executionMode,
            fileType: strategy.detection.fileType,
          })
        : null;

    const nativeResult =
      strategy.nativePreferred || strategy.executionMode === 'native' || strategy.executionMode === 'hybrid'
        ? await nativeExtractionService.extract(
            {
              fileType: strategy.detection.fileType,
              fileName: input.fileName,
              mimeType: input.mimeType,
              buffer: input.buffer,
              sourcePath: input.sourcePath,
            },
            pythonResponse
          )
        : null;

    const ocrResult =
      strategy.ocrPreferred || strategy.executionMode === 'ocr' || strategy.executionMode === 'hybrid'
        ? await ocrExtractionService.extract(
            {
              fileType: strategy.detection.fileType,
              fileName: input.fileName,
              mimeType: input.mimeType,
              buffer: input.buffer,
              sourcePath: input.sourcePath,
            },
            pythonResponse
          )
        : null;

    const merged =
      strategy.executionMode === 'hybrid'
        ? hybridMergeService.merge({
            native: nativeResult,
            ocr: ocrResult,
          })
        : strategy.executionMode === 'ocr'
          ? {
              pageSegments: ocrResult?.pageSegments || [],
              ocrBlocks: ocrResult?.ocrBlocks || [],
              languageHints: ocrResult?.languageHints || [],
              fullText: ocrResult?.fullText || '',
              notes: ocrResult?.notes || [],
            }
          : {
              pageSegments: nativeResult?.pageSegments || [],
              ocrBlocks: [],
              languageHints: nativeResult?.languageHints || [],
              fullText: nativeResult?.fullText || '',
              notes: nativeResult?.notes || [],
            };

    if (merged.pageSegments.length === 0 || !merged.fullText.trim()) {
      throw new Error('No extractable text found in file.');
    }

    const artifactId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + DOCUMENT_RUNTIME_ARTIFACT_TTL_SEC * 1000).toISOString();
    const artifactWorkspace = actorWorkspaceResolver.resolveArtifactWorkspace(
      input.actor,
      input.workflowId,
      input.documentId,
      artifactId
    );

    const payload = documentStructureNormalizer.normalize({
      artifactBase: {
        artifactId,
        documentId: input.documentId,
        workflowId: input.workflowId,
        sourceFileId: input.sourceFileId,
        actorId: input.actor.actorId,
        actorRole: input.actor.actorRole,
        ownerActorId: input.actor.actorId,
        ownerRole: input.actor.actorRole,
        workspaceScope: input.actor.scope,
        extractionVersion: DOCUMENT_EXTRACTION_VERSION,
        extractionStrategy: strategy.strategyId,
        processingPathway: 'local_extraction',
        status: 'ready',
        fileType: strategy.detection.fileType,
        sourceFileName: input.fileName,
        sourceMimeType: input.mimeType,
        paths: {
          workspaceRootPath: artifactWorkspace.documentRootPath,
          workspaceRelativeRootPath: artifactWorkspace.relativeDocumentRootPath,
          originalFilePath: input.sourceRelativePath,
          finalExtractedTextPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.cleanTextPath),
          structuredJsonPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.structuredJsonPath),
          normalizedMarkdownPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.normalizedMarkdownPath),
          pageMapPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.pageMapPath),
          ocrBlocksPath: strategy.ocrPreferred || merged.ocrBlocks.length > 0
            ? actorWorkspaceResolver.toRelativePath(artifactWorkspace.ocrBlocksPath)
            : null,
          manifestPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.manifestPath),
        },
        extractionMeta: {
          extractedAt: nowIso,
          extractionMode: strategy.executionMode,
          detection: strategy.detection,
          strategyReason: strategy.reason,
          engines: {
            native: nativeResult?.engine || null,
            ocr: ocrResult?.engine || null,
            pythonWorker: pythonResponse?.capabilities || null,
          },
          notes: [
            ...(nativeResult?.notes || []),
            ...(ocrResult?.notes || []),
            ...(merged.notes || []),
            ...(pythonResponse?.notes || []),
            ...((pythonResponse?.errors || []).map((error) => `python:${error}`)),
          ],
        },
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt,
      },
      pageSegments: merged.pageSegments,
      ocrBlocks: merged.ocrBlocks,
      languageHints: merged.languageHints,
      docling: pythonResponse?.docling || null,
      notes: [
        ...(merged.notes || []),
        ...((pythonResponse?.errors || []).map((error) => `Python worker note: ${error}`)),
      ],
    });

    return {
      payload,
      textLength: payload.normalizedText.length,
    };
  }
}

export const extractionCoordinator = new ExtractionCoordinator();
