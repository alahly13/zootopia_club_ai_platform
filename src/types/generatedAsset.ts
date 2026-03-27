import { Timestamp } from 'firebase/firestore';

export type GeneratedAssetType =
  | 'image'
  | 'edited-image'
  | 'pdf'
  | 'docx'
  | 'markdown'
  | 'json'
  | 'video'
  | 'audio'
  | 'other';

export type GeneratedAssetStatus = 'active' | 'expired' | 'deleted' | 'processing' | 'failed';

export interface GeneratedAssetSourceUploadMetadata {
  fileName: string;
  mimeType: string;
  fileType?: string | null;
  sizeBytes: number;
  uploadedAt?: string | null;
  sourceReference?: string | null;
  processToolId?: string | null;
}

export interface GeneratedAssetExecutionMetadata {
  requestType?: string;
  generationType?: string;
  creditsUsed?: number;
  status?: string;
  fallbackHappened?: boolean;
  operationId?: string;
  traceId?: string;
  transport?: string;
}

export interface GeneratedAssetStorageMetadata extends Record<string, unknown> {
  retrievalReference?: string | null;
  originalStoragePath?: string | null;
}

export interface GeneratedAssetMetadata extends Record<string, unknown> {
  sourceUpload?: GeneratedAssetSourceUploadMetadata;
  execution?: GeneratedAssetExecutionMetadata;
  customization?: Record<string, unknown>;
  output?: Record<string, unknown>;
  storage?: GeneratedAssetStorageMetadata;
}

export interface GeneratedAsset {
  id: string;
  userId: string;
  toolId: string;
  sourceToolId?: string;
  assetType: GeneratedAssetType;
  mimeType: string;
  provider: string;
  sourceProvider?: string;
  family?: string;
  modelId: string;
  sourceModelId?: string;
  sourceAssetId?: string | null;
  rootAssetId?: string | null;
  title: string;
  prompt?: string | null;
  editPromptHistory: string[];
  storagePath: string;
  storageUrl?: string;
  downloadUrl: string;
  thumbnailUrl?: string | null;
  createdAt: Timestamp;
  updatedAt?: Timestamp | null;
  expiresAt: Timestamp;
  status: GeneratedAssetStatus;
  isEditable: boolean;
  editableByCapabilities: string[];
  versionIndex: number;
  versionHistory: string[];
  metadata?: GeneratedAssetMetadata;
}

export interface ImageEditSession {
  id: string;
  userId: string;
  originalAssetId: string;
  currentAssetId: string;
  selectedEditModelId: string;
  versionHistory: string[];
  editPromptHistory: string[];
  sourceMetadata?: Record<string, unknown>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GeneratedAssetCleanupSummary {
  scanned: number;
  deleted: number;
  skippedInvalid: number;
  deleteErrors: number;
}
