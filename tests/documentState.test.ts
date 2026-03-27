import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUploadedDocument,
  createDocumentIdentity,
  createEmptyDocument,
} from '../src/contexts/documentState.ts';

test('document identity changes with file metadata and upload timestamp', () => {
  const file = {
    name: 'chapter-1.pdf',
    size: 1024,
    type: 'application/pdf',
    lastModified: 1710000000000,
  } as File;

  const identityA = createDocumentIdentity(file, '2026-03-25T10:00:00.000Z');
  const identityB = createDocumentIdentity(file, '2026-03-25T11:00:00.000Z');

  assert.ok(identityA);
  assert.ok(identityB);
  assert.notEqual(identityA, identityB);
});

test('uploaded document snapshots preserve the canonical lifecycle fields', () => {
  const file = {
    name: 'chapter-2.docx',
    size: 4096,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    lastModified: 1710000001000,
  } as File;

  const empty = createEmptyDocument();
  const preparing = buildUploadedDocument({
    previous: empty,
    file,
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type,
  });

  assert.equal(preparing.fileName, 'chapter-2.docx');
  assert.equal(preparing.documentStatus, 'preparing');
  assert.equal(preparing.documentRevision, 1);
  assert.ok(preparing.documentId);

  const ready = buildUploadedDocument({
    previous: preparing,
    file,
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type,
    extractedText: 'Extracted content',
  });

  assert.equal(ready.documentStatus, 'ready');
  assert.equal(ready.documentRevision, 2);
  assert.equal(ready.extractedText, 'Extracted content');
});
