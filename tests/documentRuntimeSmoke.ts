import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { buildDocumentContextRef } from '../src/services/documentRuntimeService';
import { CleanupCoordinator } from '../server/documentRuntime/cleanupCoordinator';
import { jobOrchestrationService } from '../server/documentRuntime/jobOrchestrationService';
import { promptContextAssembler } from '../server/documentRuntime/promptContextAssembler';
import { buildDocumentRuntimeKeySet } from '../server/documentRuntime/runtimeStateService';
import { runtimeStateService } from '../server/documentRuntime/runtimeStateService';
import { resolveDocumentProcessingStrategy } from '../server/documentRuntime/documentProcessingStrategyResolver';
import { fileTypeDetectionService } from '../server/documentRuntime/fileTypeDetectionService';
import { extractDocumentArtifact } from '../server/documentRuntime/extractionEngine';
import type { DocumentActorContext } from '../server/documentRuntime/types';

const userActor: DocumentActorContext = {
  actorId: 'user-1',
  actorRole: 'User',
  scope: 'user',
};

const adminActor: DocumentActorContext = {
  actorId: 'user-1',
  actorRole: 'Admin',
  scope: 'admin',
  adminLevel: 'primary',
};

async function createTempSourceFile(fileName: string, contents: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `zootopia-smoke-${Date.now()}-${fileName}`);
  await fs.writeFile(tempPath, contents, 'utf8');
  return tempPath;
}

async function main() {
  assert.equal(
    buildDocumentContextRef({
      documentId: null,
      artifactId: null,
      processingPathway: null,
    }),
    undefined
  );

  const userKeys = buildDocumentRuntimeKeySet(userActor, 'doc-123');
  const adminKeys = buildDocumentRuntimeKeySet(adminActor, 'doc-123');
  assert.notEqual(userKeys.activeDocument, adminKeys.activeDocument);
  assert.match(userKeys.document, /:user:user-1:extract:doc-123$/);
  assert.match(adminKeys.document, /:admin:user-1:extract:doc-123$/);

  const strategy = resolveDocumentProcessingStrategy({
    toolId: 'quiz',
    requestedPathway: 'direct_file_to_model',
  });
  assert.equal(strategy.pathway, 'local_extraction');
  assert.equal(strategy.directModeEnabled, false);

  const detectedPdf = await fileTypeDetectionService.detect({
    fileName: 'lecture.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('%PDF-1.7\n1 0 obj\n', 'utf8'),
  });
  assert.equal(detectedPdf.fileType, 'pdf');

  const textSourcePath = await createTempSourceFile(
    'lecture.txt',
    [
      'CELL BIOLOGY',
      '1. Membrane Structure',
      '1.1 Channel Proteins',
      '- Ion channels regulate transport',
      '- Carrier proteins move molecules',
    ].join('\n')
  );
  const imageSourcePath = await createTempSourceFile('diagram.png', 'png-binary-placeholder');

  try {
    const textExtraction = await extractDocumentArtifact({
      actor: userActor,
      workflowId: 'wf-text',
      documentId: 'doc-text',
      sourceFileId: 'source-1',
      fileName: 'lecture.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [
          'CELL BIOLOGY',
          '1. Membrane Structure',
          '1.1 Channel Proteins',
          '- Ion channels regulate transport',
          '- Carrier proteins move molecules',
        ].join('\n'),
        'utf8'
      ),
      sourcePath: textSourcePath,
      sourceRelativePath: 'users/user-1/workflows/wf-text/documents/doc-text/source/source-1-lecture.txt',
    });
    assert.equal(textExtraction.payload.fileType, 'txt');
    assert.equal(textExtraction.payload.actorId, userActor.actorId);
    assert.deepEqual(textExtraction.payload.languageHints, ['en']);
    assert.equal(textExtraction.payload.headingTree.length, 3);
    assert.match(textExtraction.payload.normalizedMarkdown, /## Reconstructed Document/);
    assert.match(textExtraction.payload.normalizedMarkdown, /1\.1 Channel Proteins/);

    const assembledPromptContext = promptContextAssembler.assemble({
      toolId: 'quiz',
      document: {
        documentId: 'doc-text',
        workflowId: 'wf-text',
        sourceFileId: 'source-1',
        activeArtifactId: textExtraction.payload.artifactId,
        ownerActorId: userActor.actorId,
        ownerRole: userActor.actorRole,
        workspaceScope: userActor.scope,
        processingPathway: 'local_extraction',
        requestedPathway: 'local_extraction',
        status: 'ready',
        fileName: 'lecture.txt',
        mimeType: 'text/plain',
        extension: 'txt',
        fileType: 'txt',
        fileSizeBytes: textExtraction.payload.normalizedText.length,
        sourceStoragePath: textExtraction.payload.paths.originalFilePath,
        sourceStorageRelativePath: textExtraction.payload.paths.originalFilePath,
        sourceSha256: 'sha',
        extractionVersion: textExtraction.payload.extractionVersion,
        extractionStrategy: textExtraction.payload.extractionStrategy,
        extractionMeta: textExtraction.payload.extractionMeta,
        latestError: null,
        runtimeOperationId: 'op-text',
        createdAt: textExtraction.payload.createdAt,
        updatedAt: textExtraction.payload.updatedAt,
        expiresAt: textExtraction.payload.expiresAt || null,
      },
      artifact: {
        artifactId: textExtraction.payload.artifactId,
        documentId: textExtraction.payload.documentId,
        workflowId: textExtraction.payload.workflowId,
        sourceFileId: textExtraction.payload.sourceFileId,
        ownerActorId: userActor.actorId,
        ownerRole: userActor.actorRole,
        workspaceScope: userActor.scope,
        processingPathway: 'local_extraction',
        extractionVersion: textExtraction.payload.extractionVersion,
        extractionStrategy: textExtraction.payload.extractionStrategy,
        status: 'ready',
        artifactStoragePath: textExtraction.payload.paths.manifestPath,
        artifactStorageRelativePath: textExtraction.payload.paths.manifestPath,
        workspaceRootRelativePath: textExtraction.payload.paths.workspaceRelativeRootPath,
        fileType: textExtraction.payload.fileType,
        originalFilePath: textExtraction.payload.paths.originalFilePath,
        finalExtractedTextPath: textExtraction.payload.paths.finalExtractedTextPath,
        structuredJsonPath: textExtraction.payload.paths.structuredJsonPath,
        normalizedMarkdownPath: textExtraction.payload.paths.normalizedMarkdownPath,
        pageMapPath: textExtraction.payload.paths.pageMapPath,
        ocrBlocksPath: textExtraction.payload.paths.ocrBlocksPath,
        manifestPath: textExtraction.payload.paths.manifestPath,
        languageHints: textExtraction.payload.languageHints,
        textLength: textExtraction.textLength,
        pageCount: textExtraction.payload.pageSegments.length,
        createdAt: textExtraction.payload.createdAt,
        updatedAt: textExtraction.payload.updatedAt,
        expiresAt: textExtraction.payload.expiresAt || null,
      },
      payload: textExtraction.payload,
      mode: null,
    });
    assert.match(assembledPromptContext.fileContext, /CELL BIOLOGY/);
    assert.match(String(assembledPromptContext.additionalContext.pageMap), /Page 1 \| headings:/);
    assert.equal(
      (assembledPromptContext.additionalContext.metadata as Record<string, unknown>).normalizedMarkdownPath,
      undefined
    );
    assert.equal(
      ((assembledPromptContext.additionalContext.metadata as Record<string, unknown>).artifactPaths as Record<string, unknown>).normalizedMarkdownPath,
      textExtraction.payload.paths.normalizedMarkdownPath
    );

    const imageExtraction = await extractDocumentArtifact({
      actor: userActor,
      workflowId: 'wf-image',
      documentId: 'doc-image',
      sourceFileId: 'source-2',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      buffer: Buffer.from('png-binary-placeholder'),
      sourcePath: imageSourcePath,
      sourceRelativePath: 'users/user-1/workflows/wf-image/documents/doc-image/source/source-2-diagram.png',
    });
    assert.match(imageExtraction.payload.fullText, /^\[IMAGE_DATA:image\/png;base64,/);
    assert.equal(imageExtraction.payload.pageSegments[0]?.kind, 'image_payload');

    const cleanupCalls: string[] = [];
    const originalRequestCancellation = runtimeStateService.requestCancellation;
    const originalClearDocumentState = runtimeStateService.clearDocumentState;
    const originalGetActiveDocument = runtimeStateService.getActiveDocument;
    const originalClearActiveDocument = runtimeStateService.clearActiveDocument;
    const originalCancel = jobOrchestrationService.cancel;

    (runtimeStateService as any).requestCancellation = async (_actor: DocumentActorContext, operationId: string) => {
      cleanupCalls.push(`request:${operationId}`);
    };
    (runtimeStateService as any).clearDocumentState = async (_actor: DocumentActorContext, documentId: string) => {
      cleanupCalls.push(`clear-document:${documentId}`);
    };
    (runtimeStateService as any).getActiveDocument = async () => ({
      documentId: 'doc-cleanup',
    });
    (runtimeStateService as any).clearActiveDocument = async () => {
      cleanupCalls.push('clear-active');
    };
    (jobOrchestrationService as any).cancel = async (_actor: DocumentActorContext, operationId: string) => {
      cleanupCalls.push(`cancel-state:${operationId}`);
    };

    try {
      const cleanupCoordinator = new CleanupCoordinator({
        async markCancelled() {
          cleanupCalls.push('mark-cancelled');
          return {} as any;
        },
      } as any);

      await cleanupCoordinator.cancelOperation(userActor, 'doc-cleanup', 'op-cleanup');
    } finally {
      (runtimeStateService as any).requestCancellation = originalRequestCancellation;
      (runtimeStateService as any).clearDocumentState = originalClearDocumentState;
      (runtimeStateService as any).getActiveDocument = originalGetActiveDocument;
      (runtimeStateService as any).clearActiveDocument = originalClearActiveDocument;
      (jobOrchestrationService as any).cancel = originalCancel;
    }

    assert.deepEqual(cleanupCalls, [
      'request:op-cleanup',
      'cancel-state:op-cleanup',
      'mark-cancelled',
      'clear-document:doc-cleanup',
      'clear-active',
    ]);
  } finally {
    await Promise.allSettled([
      fs.rm(textSourcePath, { force: true }),
      fs.rm(imageSourcePath, { force: true }),
    ]);
  }

  console.log('document-runtime-smoke:ok');
}

main().catch((error) => {
  console.error('document-runtime-smoke:failed');
  console.error(error);
  process.exitCode = 1;
});
