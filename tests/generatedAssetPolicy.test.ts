import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import {
  computeGeneratedAssetExpiry,
  deriveGeneratedAssetVersionState,
  formatGeneratedAssetTimestamp,
  GENERATED_ASSET_RETENTION_DAYS,
  getGeneratedAssetLibraryBucket,
  getGeneratedAssetPreviewType,
} from '../src/services/generatedAssetPolicy.ts';

test('generated asset retention defaults to 3 days', () => {
  assert.equal(GENERATED_ASSET_RETENTION_DAYS, 3);

  const createdAt = new Date('2026-03-24T00:00:00.000Z');
  const expiresAt = computeGeneratedAssetExpiry(createdAt);

  assert.equal(
    expiresAt.toDate().toISOString(),
    '2026-03-27T00:00:00.000Z'
  );
});

test('version state preserves root lineage and appends edit prompts', () => {
  const versionState = deriveGeneratedAssetVersionState({
    sourceAsset: {
      id: 'asset-v1',
      rootAssetId: 'asset-root',
      versionIndex: 2,
      editPromptHistory: ['brighten background', 'increase contrast'],
    },
    editPrompt: 'sharpen microscope labels',
  });

  assert.equal(versionState.rootAssetId, 'asset-root');
  assert.equal(versionState.versionIndex, 3);
  assert.deepEqual(versionState.editPromptHistory, [
    'brighten background',
    'increase contrast',
    'sharpen microscope labels',
  ]);
});

test('library buckets remain stable for supported asset categories', () => {
  assert.equal(getGeneratedAssetLibraryBucket({ assetType: 'image' }), 'image');
  assert.equal(getGeneratedAssetLibraryBucket({ assetType: 'edited-image' }), 'edited-image');
  assert.equal(getGeneratedAssetLibraryBucket({ assetType: 'pdf' }), 'document');
  assert.equal(getGeneratedAssetLibraryBucket({ assetType: 'docx' }), 'document');
  assert.equal(getGeneratedAssetLibraryBucket({ assetType: 'video' }), 'media');
  assert.equal(getGeneratedAssetLibraryBucket({ assetType: 'audio' }), 'media');
  assert.equal(getGeneratedAssetLibraryBucket({ assetType: 'other' }), 'other');
});

test('preview typing remains limited to assets with dedicated preview surfaces', () => {
  assert.equal(getGeneratedAssetPreviewType({ assetType: 'image' }), 'image');
  assert.equal(getGeneratedAssetPreviewType({ assetType: 'edited-image' }), 'image');
  assert.equal(getGeneratedAssetPreviewType({ assetType: 'video' }), 'video');
  assert.equal(getGeneratedAssetPreviewType({ assetType: 'audio' }), null);
  assert.equal(getGeneratedAssetPreviewType({ assetType: 'pdf' }), null);
});

test('timestamp formatter handles firestore timestamps and invalid values safely', () => {
  const formatted = formatGeneratedAssetTimestamp(
    Timestamp.fromDate(new Date('2026-03-24T12:34:56.000Z'))
  );

  assert.ok(formatted.includes('2026') || formatted.includes('3/24'));
  assert.equal(formatGeneratedAssetTimestamp('not-a-date'), 'Unknown');
});
