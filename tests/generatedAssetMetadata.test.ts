import test from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase/firestore';
import type { GeneratedAsset } from '../src/types/generatedAsset.ts';
import {
  buildGeneratedAssetAdminMetadataRows,
  buildGeneratedAssetMetadata,
  buildGeneratedAssetSourceUploadMetadata,
  formatGeneratedAssetBytes,
  getGeneratedAssetExecutionMetadata,
  getGeneratedAssetSourceUpload,
} from '../src/services/generatedAssetMetadata.ts';

const buildAsset = (): GeneratedAsset => ({
  id: 'asset-1',
  userId: 'user-1',
  toolId: 'image-generator',
  sourceToolId: 'image-generator',
  assetType: 'image',
  mimeType: 'image/png',
  provider: 'google-gemini-api',
  sourceProvider: 'google-gemini-api',
  family: 'gemini-image',
  modelId: 'gemini-3.1-flash-image-preview',
  sourceModelId: 'gemini-3.1-flash-image-preview',
  sourceAssetId: null,
  rootAssetId: 'asset-1',
  title: 'Microscope Plate',
  prompt: 'Generate a microscope plate illustration.',
  editPromptHistory: [],
  storagePath: 'generated_assets/user-1/image-generator/asset-1/asset.png',
  storageUrl: 'https://example.com/storage/asset.png',
  downloadUrl: 'https://example.com/storage/asset.png',
  thumbnailUrl: 'https://example.com/storage/asset.png',
  createdAt: Timestamp.fromDate(new Date('2026-03-24T08:00:00.000Z')),
  updatedAt: Timestamp.fromDate(new Date('2026-03-24T08:05:00.000Z')),
  expiresAt: Timestamp.fromDate(new Date('2026-03-27T08:00:00.000Z')),
  status: 'active',
  isEditable: true,
  editableByCapabilities: ['image-editing'],
  versionIndex: 0,
  versionHistory: ['asset-1'],
  metadata: {},
});

test('source upload metadata builder requires a filename and normalizes fields', () => {
  assert.equal(buildGeneratedAssetSourceUploadMetadata({ fileName: '' }), undefined);

  const sourceUpload = buildGeneratedAssetSourceUploadMetadata({
    fileName: 'lecture-notes.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    uploadedAt: '2026-03-24T08:00:00.000Z',
    processToolId: 'document-analysis',
  });

  assert.deepEqual(sourceUpload, {
    fileName: 'lecture-notes.pdf',
    mimeType: 'application/pdf',
    fileType: 'application/pdf',
    sizeBytes: 1024,
    uploadedAt: '2026-03-24T08:00:00.000Z',
    sourceReference: null,
    processToolId: 'document-analysis',
  });
});

test('generated asset metadata builder merges execution, customization, and storage records', () => {
  const metadata = buildGeneratedAssetMetadata({
    existingMetadata: {
      customization: {
        aspectRatio: '1:1',
      },
    },
    execution: {
      requestType: 'image-generation',
      generationType: 'text-to-image',
      creditsUsed: 1,
      status: 'success',
      transport: 'google-genai',
    },
    customization: {
      size: '2K',
    },
    storage: {
      retrievalReference: 'generated_assets/user-1/image-generator/asset-1/asset.png',
    },
    additionalMetadata: {
      traceLabel: 'trace-1',
    },
  });

  assert.equal(metadata.execution?.generationType, 'text-to-image');
  assert.equal(metadata.execution?.creditsUsed, 1);
  assert.equal(metadata.customization?.aspectRatio, '1:1');
  assert.equal(metadata.customization?.size, '2K');
  assert.equal(metadata.storage?.retrievalReference, 'generated_assets/user-1/image-generator/asset-1/asset.png');
  assert.equal(metadata.traceLabel, 'trace-1');
});

test('admin metadata rows expose credits and source linkage without owner data loss', () => {
  const asset = buildAsset();
  asset.sourceAssetId = 'asset-root';
  asset.metadata = buildGeneratedAssetMetadata({
    sourceUpload: buildGeneratedAssetSourceUploadMetadata({
      fileName: 'lesson.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      processToolId: 'assessment',
    }),
    execution: {
      requestType: 'image-generation',
      creditsUsed: 1,
      status: 'success',
    },
  });

  const rows = buildGeneratedAssetAdminMetadataRows(asset, {
    name: 'Dr. Rana',
    email: 'rana@example.com',
  });

  assert.ok(rows.some((row) => row.label === 'Owner' && row.value === 'Dr. Rana'));
  assert.ok(rows.some((row) => row.label === 'Credits Used' && row.value === '1'));
  assert.ok(rows.some((row) => row.label === 'Source Asset ID' && row.value === 'asset-root'));

  assert.equal(getGeneratedAssetExecutionMetadata(asset)?.status, 'success');
  assert.equal(getGeneratedAssetSourceUpload(asset)?.fileName, 'lesson.pdf');
});

test('byte formatter stays stable for asset metadata displays', () => {
  assert.equal(formatGeneratedAssetBytes(undefined), 'Unknown');
  assert.equal(formatGeneratedAssetBytes(512), '512 B');
  assert.equal(formatGeneratedAssetBytes(1024), '1.00 KB');
});
