import crypto from 'crypto';
import { logDiagnostic } from '../diagnostics.js';
import { actorWorkspaceResolver } from './actorWorkspaceResolver.js';
import { DOCUMENT_EXTRACTION_VERSION, DOCUMENT_RUNTIME_ARTIFACT_TTL_SEC } from './config.js';
import { documentStructureNormalizer } from './documentStructureNormalizer.js';
import { normalizeWhitespace } from './extractionShared.js';
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

function readStringArray(record: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readWeakPdfPages(raw: Record<string, unknown> | null | undefined): number[] {
  const metadata = raw?.metadata;
  const metadataRecord =
    metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null;
  const candidates = [
    raw?.weakPages,
    metadataRecord?.weakPages,
    metadataRecord?.weakPageNumbers,
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const pageNumbers = candidate
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (pageNumbers.length > 0) {
      return pageNumbers;
    }
  }

  return [];
}

export class ExtractionCoordinator {
  async extract(input: ExtractionCoordinatorInput): Promise<ExtractedArtifactEnvelope> {
    const strategy = await fileTypeDetectionService.resolveStrategy({
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });
    const extractionTraceId = `${input.documentId}:${Date.now()}`;

    logDiagnostic('info', 'document_runtime.file_type_detected', {
      area: 'document-runtime',
      traceId: extractionTraceId,
      stage: 'detect',
      details: {
        documentId: input.documentId,
        workflowId: input.workflowId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileType: strategy.detection.fileType,
        confidence: strategy.detection.confidence,
        executionMode: strategy.executionMode,
        strategyId: strategy.strategyId,
        detectionHints: strategy.detection.hints,
      },
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

    let ocrResult =
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

    const weakPdfPages =
      strategy.detection.fileType === 'pdf'
        ? readWeakPdfPages(nativeResult?.raw || null)
        : [];
    const shouldRunLatePdfOcrFallback =
      strategy.detection.fileType === 'pdf' &&
      strategy.executionMode === 'native' &&
      !ocrResult &&
      weakPdfPages.length > 0;

    let latePdfOcrResponse: Awaited<ReturnType<typeof pythonDocumentWorker.extract>> | null = null;
    if (shouldRunLatePdfOcrFallback) {
      latePdfOcrResponse = await pythonDocumentWorker.extract({
        sourcePath: input.sourcePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
        mode: 'ocr',
        fileType: strategy.detection.fileType,
      });

      ocrResult = await ocrExtractionService.extract(
        {
          fileType: strategy.detection.fileType,
          fileName: input.fileName,
          mimeType: input.mimeType,
          buffer: input.buffer,
          sourcePath: input.sourcePath,
        },
        latePdfOcrResponse
      );
    }

    const effectiveExecutionMode =
      strategy.executionMode === 'native' && ocrResult?.pageSegments.length ? 'hybrid' : strategy.executionMode;

    const merged =
      effectiveExecutionMode === 'hybrid'
        ? hybridMergeService.merge({
            native: nativeResult,
            ocr: ocrResult,
          })
        : effectiveExecutionMode === 'ocr'
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

    const usableSegments = merged.pageSegments.filter((segment) => {
      const normalizedText = normalizeWhitespace(segment.text);
      if (!normalizedText) {
        return false;
      }

      if (segment.kind === 'image_payload') {
        return true;
      }

      const meaningfulBlocks = segment.blocks.filter((block) => block.type !== 'note');
      if (meaningfulBlocks.length > 0) {
        return true;
      }

      return !/^ocr runtime unavailable\b/i.test(normalizedText);
    });

    if (usableSegments.length === 0 || !merged.fullText.trim()) {
      logDiagnostic('warn', 'document_runtime.extraction_empty', {
        area: 'document-runtime',
        traceId: extractionTraceId,
        stage: 'extract',
        details: {
          documentId: input.documentId,
          workflowId: input.workflowId,
          fileName: input.fileName,
          fileType: strategy.detection.fileType,
          executionMode: strategy.executionMode,
          nativeEngine: nativeResult?.engine || null,
          ocrEngine: ocrResult?.engine || null,
          pythonErrors: pythonResponse?.errors || [],
        },
      });
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

    const pipelineWarnings = Array.from(
      new Set(
        [
          ...(nativeResult?.notes || []),
          ...(ocrResult?.notes || []),
          ...(merged.notes || []),
          ...(pythonResponse?.notes || []),
          ...(pythonResponse?.warnings || []),
          ...(latePdfOcrResponse?.notes || []),
          ...(latePdfOcrResponse?.warnings || []),
          ...readStringArray(nativeResult?.raw || null, 'warnings'),
          ...readStringArray(ocrResult?.raw || null, 'warnings'),
          ...((pythonResponse?.errors || []).map((error) => `python:${error}`)),
          ...((latePdfOcrResponse?.errors || []).map((error) => `python:late-ocr:${error}`)),
        ]
          .map((note) => normalizeWhitespace(String(note || '')))
          .filter(Boolean)
      )
    );
    const extractorChain = Array.from(
      new Set(
        [
          ...readStringArray(nativeResult?.raw || null, 'extractorChain'),
          ...readStringArray(ocrResult?.raw || null, 'extractorChain'),
          ...readStringArray(pythonResponse?.native as Record<string, unknown> | null, 'extractorChain'),
          ...readStringArray(pythonResponse?.ocr as Record<string, unknown> | null, 'extractorChain'),
          ...readStringArray(pythonResponse?.docling as Record<string, unknown> | null, 'extractorChain'),
          ...readStringArray(latePdfOcrResponse?.ocr as Record<string, unknown> | null, 'extractorChain'),
        ]
          .map((value) => normalizeWhitespace(value))
          .filter(Boolean)
      )
    );
    const fallbackChain = [
      `strategy:${strategy.strategyId}`,
      pythonResponse ? `python:${pythonResponse.ok ? 'ok' : 'degraded'}` : 'python:not-requested',
      nativeResult?.engine ? `native:${nativeResult.engine}` : 'native:skipped',
      ocrResult?.engine ? `ocr:${ocrResult.engine}` : 'ocr:skipped',
      shouldRunLatePdfOcrFallback ? `ocr:late-pdf-weak-pages:${weakPdfPages.join(',')}` : 'ocr:late-pdf-weak-pages:none',
      effectiveExecutionMode === 'hybrid' ? 'merge:hybrid' : `merge:${effectiveExecutionMode}`,
    ];

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
          extractionMode: effectiveExecutionMode,
          detection: strategy.detection,
          strategyReason: strategy.reason,
          extractorChain,
          fallbackChain,
          engines: {
            native: nativeResult?.engine || null,
            ocr: ocrResult?.engine || null,
            pythonWorker: pythonResponse?.capabilities || null,
            latePdfOcrWorker: latePdfOcrResponse?.capabilities || null,
          },
          warnings: pipelineWarnings,
          qualitySignals: {
            usableSegmentCount: usableSegments.length,
            pageSegmentCount: merged.pageSegments.length,
            ocrBlockCount: merged.ocrBlocks.length,
            textLength: merged.fullText.length,
            weakPdfPages,
            ocrUsed:
              Boolean(ocrResult?.pageSegments.length) ||
              merged.pageSegments.some((segment) => segment.kind === 'ocr' || segment.kind === 'hybrid'),
          },
          extractionDetails: {
            native: nativeResult?.raw || null,
            ocr: ocrResult?.raw || null,
            docling: pythonResponse?.docling || null,
            latePdfOcrAttempted: shouldRunLatePdfOcrFallback,
          },
          notes: pipelineWarnings,
        },
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt,
      },
      pageSegments: merged.pageSegments,
      ocrBlocks: merged.ocrBlocks,
      languageHints: merged.languageHints,
      docling: pythonResponse?.docling || null,
      notes: pipelineWarnings,
    });

    logDiagnostic('info', 'document_runtime.extraction_completed', {
      area: 'document-runtime',
      traceId: extractionTraceId,
      stage: 'extract',
      status: 'success',
      details: {
        documentId: input.documentId,
        workflowId: input.workflowId,
        fileName: input.fileName,
        fileType: payload.fileType,
        strategyId: strategy.strategyId,
        executionMode: strategy.executionMode,
        effectiveExecutionMode,
        nativeEngine: nativeResult?.engine || null,
        ocrEngine: ocrResult?.engine || null,
        pageCount: payload.pageSegments.length,
        sectionCount: payload.structuredDocumentJson.sections.length,
        textLength: payload.normalizedText.length,
        ocrBlockCount: payload.ocrBlocks.length,
        weakPdfPages,
        ocrUsed: Boolean(payload.ocrBlocks.length) || payload.pageSegments.some((segment) => segment.kind === 'ocr' || segment.kind === 'hybrid'),
        warnings: pipelineWarnings,
      },
    });

    return {
      payload,
      textLength: payload.normalizedText.length,
    };
  }
}

export const extractionCoordinator = new ExtractionCoordinator();
