import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDownloadFileName,
  sanitizeDownloadFileName,
} from '../src/utils/fileDownloads';

test('sanitizeDownloadFileName removes reserved characters and preserves readable spacing', () => {
  assert.equal(
    sanitizeDownloadFileName('Analysis: Biology/Chapter 1?.pdf'),
    'Analysis Biology Chapter 1 .pdf'
  );
});

test('buildDownloadFileName normalizes the extension and falls back safely', () => {
  assert.equal(
    buildDownloadFileName('Generated Result', '.PDF'),
    'Generated Result.pdf'
  );

  assert.equal(
    buildDownloadFileName('', 'md'),
    'zootopia-result.md'
  );
});
