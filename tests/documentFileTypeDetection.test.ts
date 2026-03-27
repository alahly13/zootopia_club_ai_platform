import test from 'node:test';
import assert from 'node:assert/strict';
import { fileTypeDetectionService } from '../server/documentRuntime/fileTypeDetectionService';

test('file type detection prefers magic-byte evidence over extension noise', async () => {
  const detection = await fileTypeDetectionService.detect({
    fileName: 'lecture.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('%PDF-1.7\n1 0 obj\n', 'utf8'),
  });

  assert.equal(detection.fileType, 'pdf');
  assert.match(detection.hints.join(' '), /magic:pdf/);
});

test('file type detection identifies office containers structurally', async () => {
  const detection = await fileTypeDetectionService.detect({
    fileName: 'notes.upload',
    mimeType: 'application/octet-stream',
    buffer: Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('word/document.xml', 'latin1'),
    ]),
  });

  assert.equal(detection.fileType, 'docx');
  assert.match(detection.hints.join(' '), /magic:docx/);
});
