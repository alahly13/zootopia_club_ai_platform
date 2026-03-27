import test from 'node:test';
import assert from 'node:assert/strict';
import { documentStructureNormalizer } from '../server/documentRuntime/documentStructureNormalizer';

test('document structure normalizer produces prompt-ready markdown and grouped sections', () => {
  const payload = documentStructureNormalizer.normalize({
    artifactBase: {
      artifactId: 'artifact-structured',
      documentId: 'doc-structured',
      workflowId: 'wf-structured',
      sourceFileId: 'source-structured',
      actorId: 'user-1',
      actorRole: 'User',
      ownerActorId: 'user-1',
      ownerRole: 'User',
      workspaceScope: 'user',
      extractionVersion: '2026.03.layered-runtime-v2',
      extractionStrategy: 'txt_native',
      processingPathway: 'local_extraction',
      status: 'ready',
      fileType: 'txt',
      sourceFileName: 'biology-outline.txt',
      sourceMimeType: 'text/plain',
      paths: {
        workspaceRootPath: 'runtime/document-workspaces/users/user-1/workflows/wf-structured/documents/doc-structured',
        workspaceRelativeRootPath: 'users/user-1/workflows/wf-structured/documents/doc-structured',
        originalFilePath: 'users/user-1/workflows/wf-structured/documents/doc-structured/source/original.txt',
        finalExtractedTextPath: 'users/user-1/workflows/wf-structured/documents/doc-structured/artifacts/artifact-structured/clean/final-extracted.txt',
        structuredJsonPath: 'users/user-1/workflows/wf-structured/documents/doc-structured/artifacts/artifact-structured/structured/document.json',
        normalizedMarkdownPath: 'users/user-1/workflows/wf-structured/documents/doc-structured/artifacts/artifact-structured/normalized/document.md',
        pageMapPath: 'users/user-1/workflows/wf-structured/documents/doc-structured/artifacts/artifact-structured/structured/page-map.json',
        ocrBlocksPath: null,
        manifestPath: 'users/user-1/workflows/wf-structured/documents/doc-structured/artifacts/artifact-structured/manifest.json',
      },
      extractionMeta: {
        extractedAt: new Date('2026-03-26T00:00:00.000Z').toISOString(),
      },
      createdAt: new Date('2026-03-26T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-03-26T00:00:00.000Z').toISOString(),
      expiresAt: new Date('2026-03-27T00:00:00.000Z').toISOString(),
    },
    pageSegments: [
      {
        segmentId: 'seg-1',
        pageNumber: 1,
        text: 'Cell Biology\n1. Membrane Structure\nCells are the basic unit of life.',
        kind: 'native',
        headingCandidates: ['Cell Biology', '1. Membrane Structure'],
        blocks: [
          {
            blockId: 'block-1',
            type: 'title',
            source: 'native',
            text: 'Cell Biology',
            pageNumber: 1,
            order: 1,
            level: 1,
          },
          {
            blockId: 'block-2',
            type: 'heading',
            source: 'native',
            text: '1. Membrane Structure',
            pageNumber: 1,
            order: 2,
            level: 2,
          },
          {
            blockId: 'block-3',
            type: 'paragraph',
            source: 'native',
            text: 'Cells are the basic unit of life.',
            pageNumber: 1,
            order: 3,
            level: null,
          },
          {
            blockId: 'block-4',
            type: 'table',
            source: 'native',
            text: 'Organelle | Function\nNucleus | Stores DNA',
            pageNumber: 1,
            order: 4,
            level: null,
            rows: [
              ['Organelle', 'Function'],
              ['Nucleus', 'Stores DNA'],
            ],
          },
        ],
        tableCount: 1,
        listCount: 0,
      },
      {
        segmentId: 'seg-2',
        pageNumber: 2,
        text: '1.1 Channel Proteins\n- Ion channels regulate transport\n- Carrier proteins move molecules',
        kind: 'native',
        headingCandidates: ['1.1 Channel Proteins'],
        blocks: [
          {
            blockId: 'block-5',
            type: 'subheading',
            source: 'native',
            text: '1.1 Channel Proteins',
            pageNumber: 2,
            order: 1,
            level: 3,
          },
          {
            blockId: 'block-6',
            type: 'list_item',
            source: 'native',
            text: '- Ion channels regulate transport',
            pageNumber: 2,
            order: 2,
            level: null,
          },
          {
            blockId: 'block-7',
            type: 'list_item',
            source: 'native',
            text: '- Carrier proteins move molecules',
            pageNumber: 2,
            order: 3,
            level: null,
          },
        ],
        tableCount: 0,
        listCount: 2,
      },
    ],
    ocrBlocks: [],
    languageHints: ['en'],
    notes: ['Structured normalization preserved heading hierarchy.'],
  });

  assert.match(payload.normalizedMarkdown, /## Source Metadata/);
  assert.match(payload.normalizedMarkdown, /## Reconstructed Document/);
  assert.match(payload.normalizedMarkdown, /##### 1\.1 Channel Proteins/);
  assert.match(payload.normalizedMarkdown, /\| Organelle \| Function \|/);
  assert.match(payload.normalizedMarkdown, /- Ion channels regulate transport/);

  const heading = payload.headingTree.find((item) => item.title === '1. Membrane Structure');
  const subheading = payload.headingTree.find((item) => item.title === '1.1 Channel Proteins');
  assert.ok(heading);
  assert.ok(subheading);
  assert.equal(subheading?.parentId, heading?.id);

  const section = payload.structuredDocumentJson.sections.find(
    (item) => item.title === '1.1 Channel Proteins'
  );
  assert.ok(section);
  assert.match(String(section?.content), /Carrier proteins move molecules/);
  assert.equal(
    (payload.structuredDocumentJson.metadata.sourceMetadata as { pageCount: number }).pageCount,
    2
  );
});
