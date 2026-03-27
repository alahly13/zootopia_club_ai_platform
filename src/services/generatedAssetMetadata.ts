import { Timestamp } from 'firebase/firestore';
import {
  GeneratedAsset,
  GeneratedAssetExecutionMetadata,
  GeneratedAssetMetadata,
  GeneratedAssetSourceUploadMetadata,
  GeneratedAssetStorageMetadata,
} from '../types/generatedAsset';
import { User } from '../utils';
import { formatGeneratedAssetTimestamp } from './generatedAssetPolicy';

export interface GeneratedAssetMetadataField {
  label: string;
  value: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeNestedRecord(
  value: Record<string, unknown> | undefined | null
): Record<string, unknown> | undefined {
  if (!value) return undefined;

  const filteredEntries = Object.entries(value).filter(([, nestedValue]) => {
    if (nestedValue === undefined || nestedValue === null || nestedValue === '') {
      return false;
    }

    if (Array.isArray(nestedValue)) {
      return nestedValue.length > 0;
    }

    if (isRecord(nestedValue)) {
      return Object.keys(nestedValue).length > 0;
    }

    return true;
  });

  if (filteredEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(filteredEntries);
}

function humanizeIdentifier(value: string | null | undefined): string {
  if (!value) return 'Unknown';

  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMetadataValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'Not available';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : 'Not available';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => formatMetadataValue(item)).join(', ') : 'Not available';
  }

  if (value instanceof Timestamp) {
    return formatGeneratedAssetTimestamp(value);
  }

  if (value instanceof Date) {
    return formatGeneratedAssetTimestamp(value);
  }

  if (isRecord(value)) {
    const summarized = Object.entries(value)
      .slice(0, 4)
      .map(([key, nestedValue]) => `${humanizeIdentifier(key)}: ${formatMetadataValue(nestedValue)}`)
      .join(' | ');

    return summarized || 'Not available';
  }

  return String(value);
}

export function formatGeneratedAssetBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 'Unknown';
  }

  if (value < 1024) return `${value} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const fixed = size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2);
  return `${fixed} ${units[unitIndex]}`;
}

export function buildGeneratedAssetSourceUploadMetadata(input: {
  fileName?: string | null;
  mimeType?: string | null;
  fileType?: string | null;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
  sourceReference?: string | null;
  processToolId?: string | null;
}): GeneratedAssetSourceUploadMetadata | undefined {
  if (!input.fileName?.trim()) {
    return undefined;
  }

  return {
    fileName: input.fileName.trim(),
    mimeType: input.mimeType?.trim() || 'application/octet-stream',
    fileType: input.fileType?.trim() || input.mimeType?.trim() || null,
    sizeBytes:
      typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes) && input.sizeBytes >= 0
        ? input.sizeBytes
        : 0,
    uploadedAt: input.uploadedAt?.trim() || null,
    sourceReference: input.sourceReference?.trim() || null,
    processToolId: input.processToolId?.trim() || null,
  };
}

export function buildGeneratedAssetMetadata(input: {
  existingMetadata?: GeneratedAssetMetadata | Record<string, unknown> | null;
  sourceUpload?: GeneratedAssetSourceUploadMetadata;
  execution?: Partial<GeneratedAssetExecutionMetadata>;
  customization?: Record<string, unknown>;
  output?: Record<string, unknown>;
  storage?: GeneratedAssetStorageMetadata;
  additionalMetadata?: Record<string, unknown>;
}): GeneratedAssetMetadata {
  /**
   * Canonical asset-metadata merge path.
   * Keep generated asset writers funneled through this helper so future tools
   * add rich metadata without inventing parallel field shapes in Firestore.
   */
  const baseMetadata: GeneratedAssetMetadata = isRecord(input.existingMetadata)
    ? { ...(input.existingMetadata as GeneratedAssetMetadata) }
    : {};

  const mergedMetadata: GeneratedAssetMetadata = {
    ...baseMetadata,
    ...(input.additionalMetadata || {}),
  };

  if (input.sourceUpload) {
    mergedMetadata.sourceUpload = input.sourceUpload;
  }

  if (input.execution) {
    mergedMetadata.execution = {
      ...(isRecord(baseMetadata.execution) ? (baseMetadata.execution as GeneratedAssetExecutionMetadata) : {}),
      ...input.execution,
    };
  }

  const customization = sanitizeNestedRecord({
    ...(isRecord(baseMetadata.customization) ? baseMetadata.customization : {}),
    ...(input.customization || {}),
  });
  if (customization) {
    mergedMetadata.customization = customization;
  }

  const output = sanitizeNestedRecord({
    ...(isRecord(baseMetadata.output) ? baseMetadata.output : {}),
    ...(input.output || {}),
  });
  if (output) {
    mergedMetadata.output = output;
  }

  const storage = sanitizeNestedRecord({
    ...(isRecord(baseMetadata.storage) ? baseMetadata.storage : {}),
    ...(input.storage || {}),
  });
  if (storage) {
    mergedMetadata.storage = storage as GeneratedAssetStorageMetadata;
  }

  return mergedMetadata;
}

export function getGeneratedAssetSourceUpload(
  asset: Pick<GeneratedAsset, 'metadata'>
): GeneratedAssetSourceUploadMetadata | null {
  if (!isRecord(asset.metadata) || !isRecord(asset.metadata.sourceUpload)) {
    return null;
  }

  const sourceUpload = asset.metadata.sourceUpload;
  if (typeof sourceUpload.fileName !== 'string') {
    return null;
  }

  return {
    fileName: sourceUpload.fileName,
    mimeType:
      typeof sourceUpload.mimeType === 'string'
        ? sourceUpload.mimeType
        : 'application/octet-stream',
    fileType: typeof sourceUpload.fileType === 'string' ? sourceUpload.fileType : null,
    sizeBytes:
      typeof sourceUpload.sizeBytes === 'number' && Number.isFinite(sourceUpload.sizeBytes)
        ? sourceUpload.sizeBytes
        : 0,
    uploadedAt: typeof sourceUpload.uploadedAt === 'string' ? sourceUpload.uploadedAt : null,
    sourceReference:
      typeof sourceUpload.sourceReference === 'string' ? sourceUpload.sourceReference : null,
    processToolId:
      typeof sourceUpload.processToolId === 'string' ? sourceUpload.processToolId : null,
  };
}

export function getGeneratedAssetExecutionMetadata(
  asset: Pick<GeneratedAsset, 'metadata'>
): GeneratedAssetExecutionMetadata | null {
  if (!isRecord(asset.metadata) || !isRecord(asset.metadata.execution)) {
    return null;
  }

  return asset.metadata.execution as GeneratedAssetExecutionMetadata;
}

export function getGeneratedAssetCustomizationSummary(
  asset: Pick<GeneratedAsset, 'metadata'>
): string | null {
  if (!isRecord(asset.metadata) || !isRecord(asset.metadata.customization)) {
    return null;
  }

  const summary = Object.entries(asset.metadata.customization)
    .map(([key, value]) => `${humanizeIdentifier(key)}: ${formatMetadataValue(value)}`)
    .join(' | ');

  return summary || null;
}

export function buildGeneratedAssetUserMetadataRows(
  asset: GeneratedAsset
): GeneratedAssetMetadataField[] {
  const sourceUpload = getGeneratedAssetSourceUpload(asset);
  const execution = getGeneratedAssetExecutionMetadata(asset);
  const customizationSummary = getGeneratedAssetCustomizationSummary(asset);

  return [
    { label: 'Tool', value: humanizeIdentifier(asset.sourceToolId || asset.toolId) },
    { label: 'Provider', value: asset.provider || 'Unknown' },
    { label: 'Family', value: asset.family || 'Not specified' },
    { label: 'Model', value: asset.modelId || 'Unknown' },
    {
      label: 'Request Type',
      value: execution?.generationType || execution?.requestType || humanizeIdentifier(asset.assetType),
    },
    {
      label: 'Credits Used',
      value:
        typeof execution?.creditsUsed === 'number' && Number.isFinite(execution.creditsUsed)
          ? execution.creditsUsed.toString()
          : 'Not recorded',
    },
    { label: 'Customization', value: customizationSummary || 'Default settings' },
    { label: 'Status', value: execution?.status || asset.status || 'Unknown' },
    { label: 'Saved', value: formatGeneratedAssetTimestamp(asset.createdAt) },
    { label: 'Expires', value: formatGeneratedAssetTimestamp(asset.expiresAt) },
    { label: 'Source File', value: sourceUpload?.fileName || 'Not applicable' },
    {
      label: 'Source File Type',
      value: sourceUpload?.fileType || sourceUpload?.mimeType || 'Not applicable',
    },
    {
      label: 'Source File Size',
      value: sourceUpload ? formatGeneratedAssetBytes(sourceUpload.sizeBytes) : 'Not applicable',
    },
  ];
}

export function buildGeneratedAssetAdminMetadataRows(
  asset: GeneratedAsset,
  owner?: Pick<User, 'name' | 'email'>
): GeneratedAssetMetadataField[] {
  const execution = getGeneratedAssetExecutionMetadata(asset);

  return [
    { label: 'Asset ID', value: asset.id },
    { label: 'Owner', value: owner?.name || asset.userId },
    { label: 'Owner Email', value: owner?.email || 'Unknown' },
    { label: 'User ID', value: asset.userId },
    { label: 'Asset Type', value: asset.assetType },
    { label: 'MIME Type', value: asset.mimeType },
    { label: 'Tool', value: humanizeIdentifier(asset.toolId) },
    { label: 'Provider', value: asset.provider || 'Unknown' },
    { label: 'Family', value: asset.family || 'Not specified' },
    { label: 'Model ID', value: asset.modelId || 'Unknown' },
    {
      label: 'Request Type',
      value: execution?.generationType || execution?.requestType || 'Not recorded',
    },
    {
      label: 'Credits Used',
      value:
        typeof execution?.creditsUsed === 'number' && Number.isFinite(execution.creditsUsed)
          ? execution.creditsUsed.toString()
          : 'Not recorded',
    },
    { label: 'Status', value: execution?.status || asset.status || 'Unknown' },
    { label: 'Transport', value: execution?.transport || 'Not recorded' },
    { label: 'Source Asset ID', value: asset.sourceAssetId || 'None' },
    { label: 'Root Asset ID', value: asset.rootAssetId || asset.id },
    { label: 'Storage Path', value: asset.storagePath || 'Not recorded' },
    { label: 'Saved', value: formatGeneratedAssetTimestamp(asset.createdAt) },
    { label: 'Updated', value: formatGeneratedAssetTimestamp(asset.updatedAt || asset.createdAt) },
    { label: 'Expires', value: formatGeneratedAssetTimestamp(asset.expiresAt) },
  ];
}
