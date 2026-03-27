import test from 'node:test';
import assert from 'node:assert/strict';
import { PromptContextResolver } from '../server/documentRuntime/promptContextResolver';
import type {
  DocumentActorContext,
  DocumentArtifactPayload,
  StoredArtifactRecord,
  StoredDocumentRecord,
} from '../server/documentRuntime/types';

const actor: DocumentActorContext = {
  actorId: 'user-ctx',
  actorRole: 'User',
  scope: 'user',
};

const documentRecord: StoredDocumentRecord = {
  documentId: 'doc-ctx',
  workflowId: 'wf-ctx',
  sourceFileId: 'source-ctx',
  activeArtifactId: 'artifact-ctx',
  ownerActorId: actor.actorId,
  ownerRole: actor.actorRole,
  workspaceScope: actor.scope,
  processingPathway: 'local_extraction',
  requestedPathway: 'local_extraction',
  status: 'ready',
  fileName: 'lecture.txt',
  mimeType: 'text/plain',
  extension: 'txt',
  fileType: 'txt',
  fileSizeBytes: 123,
  sourceStoragePath: 'runtime/source/lecture.txt',
  sourceStorageRelativePath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/source/lecture.txt',
  sourceSha256: 'abc',
  extractionVersion: '2026.03.layered-runtime-v2',
  extractionStrategy: 'txt_native',
  extractionMeta: {},
  latestError: null,
  runtimeOperationId: 'op-ctx',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const artifactRecord: StoredArtifactRecord = {
  artifactId: 'artifact-ctx',
  documentId: 'doc-ctx',
  workflowId: 'wf-ctx',
  sourceFileId: 'source-ctx',
  ownerActorId: actor.actorId,
  ownerRole: actor.actorRole,
  workspaceScope: actor.scope,
  processingPathway: 'local_extraction',
  extractionVersion: '2026.03.layered-runtime-v2',
  extractionStrategy: 'txt_native',
  status: 'ready',
  artifactStoragePath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/artifacts/artifact-ctx/manifest.json',
  artifactStorageRelativePath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/artifacts/artifact-ctx/manifest.json',
  workspaceRootRelativePath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx',
  fileType: 'txt',
  originalFilePath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/source/lecture.txt',
  finalExtractedTextPath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/artifacts/artifact-ctx/clean/final-extracted.txt',
  structuredJsonPath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/artifacts/artifact-ctx/structured/document.json',
  normalizedMarkdownPath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/artifacts/artifact-ctx/normalized/document.md',
  pageMapPath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/artifacts/artifact-ctx/structured/page-map.json',
  ocrBlocksPath: null,
  manifestPath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx/artifacts/artifact-ctx/manifest.json',
  languageHints: ['en'],
  textLength: 256,
  pageCount: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

const payload: DocumentArtifactPayload = {
  artifactId: 'artifact-ctx',
  documentId: 'doc-ctx',
  workflowId: 'wf-ctx',
  sourceFileId: 'source-ctx',
  actorId: actor.actorId,
  actorRole: actor.actorRole,
  ownerActorId: actor.actorId,
  ownerRole: actor.actorRole,
  workspaceScope: actor.scope,
  extractionVersion: '2026.03.layered-runtime-v2',
  extractionStrategy: 'txt_native',
  processingPathway: 'local_extraction',
  status: 'ready',
  fileType: 'txt',
  sourceFileName: 'lecture.txt',
  sourceMimeType: 'text/plain',
  paths: {
    workspaceRootPath: 'runtime/document-workspaces/users/user-ctx/workflows/wf-ctx/documents/doc-ctx',
    workspaceRelativeRootPath: 'users/user-ctx/workflows/wf-ctx/documents/doc-ctx',
    originalFilePath: artifactRecord.originalFilePath,
    finalExtractedTextPath: artifactRecord.finalExtractedTextPath,
    structuredJsonPath: artifactRecord.structuredJsonPath,
    normalizedMarkdownPath: artifactRecord.normalizedMarkdownPath,
    pageMapPath: artifactRecord.pageMapPath,
    ocrBlocksPath: null,
    manifestPath: artifactRecord.manifestPath,
  },
  fullText: 'Cell biology introduction',
  normalizedText: 'Cell biology introduction',
  normalizedMarkdown: '# lecture.txt\n\n## Page 1\n\nCell biology introduction',
  structuredDocumentJson: {
    documentTitle: 'lecture.txt',
    fileType: 'txt',
    languageHints: ['en'],
    pages: [{
      pageNumber: 1,
      headings: [],
      text: 'Cell biology introduction',
      blocks: [],
    }],
    sections: [],
    headingTree: [],
    tables: [],
    lists: [],
    metadata: {},
  },
  pageMap: [{
    pageNumber: 1,
    segmentIds: ['seg-1'],
    sectionTitles: [],
    headingIds: [],
    sourceKinds: ['native'],
    charCount: 26,
  }],
  ocrBlocks: [],
  pageSegments: [{
    segmentId: 'seg-1',
    pageNumber: 1,
    text: 'Cell biology introduction',
    kind: 'native',
    headingCandidates: [],
    blocks: [],
    tableCount: 0,
    listCount: 0,
  }],
  headingTree: [],
  extractionMeta: {},
  languageHints: ['en'],
  sourceAttribution: [{
    pageNumber: 1,
    source: 'native',
    label: 'page-1-native',
  }],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

test('prompt context resolver exposes normalized markdown and artifact metadata through the shared resolver', async () => {
  const resolver = new PromptContextResolver({
    async getArtifactForDocument() {
      return {
        document: documentRecord,
        artifact: artifactRecord,
        payload,
      };
    },
  } as any);

  const resolved = await resolver.resolve({
    actor,
    documentId: documentRecord.documentId,
    toolId: 'summary',
  });

  assert.match(resolved.fileContext, /# lecture\.txt/);
  assert.equal(resolved.additionalContext.metadata.workflowId, 'wf-ctx');
  assert.equal(resolved.additionalContext.metadata.fileType, 'txt');
  assert.match(String(resolved.additionalContext.insights), /Sections:/);
  assert.match(String(resolved.additionalContext.extractedMarkdown), /Page 1/);
  assert.match(String(resolved.additionalContext.structuredDocument), /documentTitle/);
  assert.match(String(resolved.additionalContext.pageMap), /Page 1 \| headings: none/);
});
