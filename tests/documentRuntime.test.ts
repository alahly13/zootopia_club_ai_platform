import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { buildDocumentContextRef } from '../src/services/documentRuntimeService';
import { actorWorkspaceResolver } from '../server/documentRuntime/actorWorkspaceResolver';
import { buildDocumentRuntimeKeySet } from '../server/documentRuntime/runtimeStateService';
import { resolveDocumentProcessingStrategy } from '../server/documentRuntime/documentProcessingStrategyResolver';
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
  const tempPath = path.join(os.tmpdir(), `zootopia-${Date.now()}-${fileName}`);
  await fs.writeFile(tempPath, contents, 'utf8');
  return tempPath;
}

test('buildDocumentContextRef returns undefined without a document id', () => {
  assert.equal(
    buildDocumentContextRef({
      documentId: null,
      artifactId: null,
      processingPathway: null,
    }),
    undefined
  );
});

test('runtime keys stay actor-scoped even for identical ids', () => {
  const userKeys = buildDocumentRuntimeKeySet(userActor, 'doc-123');
  const adminKeys = buildDocumentRuntimeKeySet(adminActor, 'doc-123');

  assert.notEqual(userKeys.activeDocument, adminKeys.activeDocument);
  assert.match(userKeys.document, /:user:user-1:extract:doc-123$/);
  assert.match(adminKeys.document, /:admin:user-1:extract:doc-123$/);
});

test('workspace paths stay actor-scoped even for identical workflow and document ids', () => {
  const userWorkspace = actorWorkspaceResolver.resolveArtifactWorkspace(userActor, 'wf-1', 'doc-123', 'artifact-1');
  const adminWorkspace = actorWorkspaceResolver.resolveArtifactWorkspace(adminActor, 'wf-1', 'doc-123', 'artifact-1');

  assert.match(userWorkspace.relativeDocumentRootPath, /users\/user-1\/workflows\/wf-1\/documents\/doc-123/);
  assert.match(adminWorkspace.relativeDocumentRootPath, /admins\/user-1\/workflows\/wf-1\/documents\/doc-123/);
  assert.notEqual(userWorkspace.relativeDocumentRootPath, adminWorkspace.relativeDocumentRootPath);
});

test('direct file mode remains dormant by default', () => {
  const strategy = resolveDocumentProcessingStrategy({
    toolId: 'quiz',
    requestedPathway: 'direct_file_to_model',
  });

  assert.equal(strategy.pathway, 'local_extraction');
  assert.equal(strategy.directModeEnabled, false);
  assert.equal(strategy.toolSupportsDirectFileMode, true);
});

test('text extraction creates a structured owner-scoped artifact envelope', async () => {
  const sourcePath = await createTempSourceFile('lecture.txt', 'Cell biology introduction');

  try {
    const extracted = await extractDocumentArtifact({
      actor: userActor,
      workflowId: 'wf-text',
      documentId: 'doc-text',
      sourceFileId: 'source-1',
      fileName: 'lecture.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Cell biology introduction', 'utf8'),
      sourcePath,
      sourceRelativePath: 'users/user-1/workflows/wf-text/documents/doc-text/source/source-1-lecture.txt',
    });

    assert.equal(extracted.payload.documentId, 'doc-text');
    assert.equal(extracted.payload.workflowId, 'wf-text');
    assert.equal(extracted.payload.actorId, userActor.actorId);
    assert.equal(extracted.payload.processingPathway, 'local_extraction');
    assert.equal(extracted.payload.fileType, 'txt');
    assert.equal(extracted.payload.normalizedText, 'Cell biology introduction');
    assert.match(extracted.payload.normalizedMarkdown, /# lecture\.txt/);
    assert.match(extracted.payload.normalizedMarkdown, /## Source Metadata/);
    assert.match(extracted.payload.paths.normalizedMarkdownPath, /users\/user-1\/workflows\/wf-text\/documents\/doc-text\/artifacts\//);
    assert.deepEqual(extracted.payload.languageHints, ['en']);
    assert.equal(extracted.payload.pageMap[0]?.pageNumber, 1);
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
});

test('text extraction reconstructs nested headings and section content for prompt-ready artifacts', async () => {
  const sourcePath = await createTempSourceFile(
    'outline.txt',
    [
      'CELL BIOLOGY',
      '1. Membrane Structure',
      '1.1 Channel Proteins',
      '- Ion channels regulate transport',
      '- Carrier proteins move molecules',
    ].join('\n')
  );

  try {
    const extracted = await extractDocumentArtifact({
      actor: userActor,
      workflowId: 'wf-outline',
      documentId: 'doc-outline',
      sourceFileId: 'source-outline',
      fileName: 'outline.txt',
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
      sourcePath,
      sourceRelativePath: 'users/user-1/workflows/wf-outline/documents/doc-outline/source/source-outline-outline.txt',
    });

    assert.equal(extracted.payload.headingTree.length, 3);
    assert.equal(extracted.payload.headingTree[1]?.parentId, extracted.payload.headingTree[0]?.id);
    assert.equal(extracted.payload.headingTree[2]?.parentId, extracted.payload.headingTree[1]?.id);
    assert.match(extracted.payload.normalizedMarkdown, /## Reconstructed Document/);
    assert.match(extracted.payload.normalizedMarkdown, /##### 1\.1 Channel Proteins/);

    const subSection = extracted.payload.structuredDocumentJson.sections.find(
      (section) => section.title === '1.1 Channel Proteins'
    );
    assert.ok(subSection);
    assert.match(String(subSection?.content), /Ion channels regulate transport/);
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
});

test('image uploads preserve the multimodal marker contract when OCR runtime is unavailable', async () => {
  const sourcePath = await createTempSourceFile('diagram.png', 'png-binary-placeholder');

  try {
    const extracted = await extractDocumentArtifact({
      actor: userActor,
      workflowId: 'wf-image',
      documentId: 'doc-image',
      sourceFileId: 'source-2',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      buffer: Buffer.from('png-binary-placeholder'),
      sourcePath,
      sourceRelativePath: 'users/user-1/workflows/wf-image/documents/doc-image/source/source-2-diagram.png',
    });

    assert.equal(extracted.payload.fileType, 'image');
    assert.equal(extracted.payload.extractionStrategy, 'image_ocr_primary');
    assert.match(extracted.payload.fullText, /^\[IMAGE_DATA:image\/png;base64,/);
    assert.equal(extracted.payload.pageSegments[0]?.kind, 'image_payload');
    assert.match(extracted.payload.normalizedMarkdown, /OCR \/ Extraction Notes/);
  } finally {
    await fs.rm(sourcePath, { force: true });
  }
});
