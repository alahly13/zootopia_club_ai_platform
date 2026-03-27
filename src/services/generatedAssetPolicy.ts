import { Timestamp } from 'firebase/firestore';
import { GeneratedAsset } from '../types/generatedAsset';

export const GENERATED_ASSET_RETENTION_DAYS = 3;

const GENERATED_ASSET_RETENTION_MS =
  GENERATED_ASSET_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export type GeneratedAssetLibraryBucket =
  | 'image'
  | 'edited-image'
  | 'document'
  | 'media'
  | 'other';

export type GeneratedAssetPreviewKind = 'image' | 'video';

export function computeGeneratedAssetExpiry(
  createdAt: Date | Timestamp | string = new Date()
): Timestamp {
  const base =
    createdAt instanceof Timestamp
      ? createdAt.toDate()
      : createdAt instanceof Date
        ? createdAt
        : new Date(createdAt);

  return Timestamp.fromDate(new Date(base.getTime() + GENERATED_ASSET_RETENTION_MS));
}

export function deriveGeneratedAssetVersionState(input: {
  sourceAsset?: Pick<GeneratedAsset, 'id' | 'rootAssetId' | 'versionIndex' | 'editPromptHistory'> | null;
  editPrompt?: string;
}) {
  const rootAssetId = input.sourceAsset?.rootAssetId || input.sourceAsset?.id || null;
  const versionIndex = input.sourceAsset ? (input.sourceAsset.versionIndex || 0) + 1 : 0;
  const editPromptHistory = input.sourceAsset?.editPromptHistory
    ? [...input.sourceAsset.editPromptHistory]
    : [];

  if (input.editPrompt?.trim()) {
    editPromptHistory.push(input.editPrompt.trim());
  }

  return {
    rootAssetId,
    versionIndex,
    editPromptHistory,
  };
}

export function getGeneratedAssetLibraryBucket(
  asset: Pick<GeneratedAsset, 'assetType'>
): GeneratedAssetLibraryBucket {
  if (asset.assetType === 'image') return 'image';
  if (asset.assetType === 'edited-image') return 'edited-image';
  if (['pdf', 'docx', 'markdown', 'json'].includes(asset.assetType)) return 'document';
  if (['video', 'audio'].includes(asset.assetType)) return 'media';
  return 'other';
}

export function getGeneratedAssetPreviewType(
  asset: Pick<GeneratedAsset, 'assetType'>
): GeneratedAssetPreviewKind | null {
  if (asset.assetType === 'image' || asset.assetType === 'edited-image') {
    return 'image';
  }

  if (asset.assetType === 'video') {
    return 'video';
  }

  return null;
}

export function formatGeneratedAssetTimestamp(value: Timestamp | Date | string | null | undefined): string {
  if (!value) {
    return 'Unknown';
  }

  const date =
    value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString();
}
