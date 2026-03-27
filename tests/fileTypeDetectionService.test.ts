import test from 'node:test';
import assert from 'node:assert/strict';
import { fileTypeDetectionService } from '../server/documentRuntime/fileTypeDetectionService';

test('file type detection prefers binary signatures over misleading extensions when safe', async () => {
  const detected = await fileTypeDetectionService.detect({
    fileName: 'lecture.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('%PDF-1.7 sample payload', 'utf8'),
  });

  assert.equal(detected.fileType, 'pdf');
  assert.equal(detected.confidence, 'medium');
  assert.ok(detected.hints.includes('signature:pdf'));
  assert.ok(detected.supportsNativeExtraction);
  assert.ok(detected.supportsOcr);
});
