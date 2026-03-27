import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  deleteObject,
  getBlob,
  ref,
  uploadBytes,
  uploadString,
} from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import {
  GeneratedAsset,
  GeneratedAssetCleanupSummary,
  GeneratedAssetMetadata,
  GeneratedAssetType,
  ImageEditSession,
} from '../types/generatedAsset';
import {
  computeGeneratedAssetExpiry,
  deriveGeneratedAssetVersionState,
  formatGeneratedAssetTimestamp,
  GENERATED_ASSET_RETENTION_DAYS,
  getGeneratedAssetLibraryBucket,
  getGeneratedAssetPreviewType,
  type GeneratedAssetLibraryBucket,
  type GeneratedAssetPreviewKind,
} from './generatedAssetPolicy';
import { buildDownloadFileName, downloadBlobToFile } from '../utils/fileDownloads';
import { logger } from '../utils/logger';

export {
  computeGeneratedAssetExpiry,
  deriveGeneratedAssetVersionState,
  formatGeneratedAssetTimestamp,
  GENERATED_ASSET_RETENTION_DAYS,
  getGeneratedAssetLibraryBucket,
  getGeneratedAssetPreviewType,
  type GeneratedAssetLibraryBucket,
  type GeneratedAssetPreviewKind,
} from './generatedAssetPolicy';

export const GENERATED_ASSET_COLLECTION = 'generatedOutputs';
export const IMAGE_EDIT_SESSION_COLLECTION = 'image_edit_sessions';

type CreateImageAssetParams = {
  userId: string;
  toolId: string;
  title: string;
  dataUrl: string;
  prompt?: string;
  provider: string;
  family?: string;
  modelId: string;
  sourceAsset?: GeneratedAsset | null;
  editPrompt?: string;
  metadata?: GeneratedAssetMetadata;
};

type GeneratedAssetUploadInput =
  | {
      kind: 'data_url';
      dataUrl: string;
    }
  | {
      kind: 'blob';
      blob: Blob;
      mimeType?: string;
    }
  | {
      kind: 'text';
      textContent: string;
      mimeType: string;
    };

type CreateGeneratedAssetParams = {
  userId: string;
  toolId: string;
  title: string;
  provider: string;
  family?: string;
  modelId: string;
  upload: GeneratedAssetUploadInput;
  assetType?: GeneratedAssetType;
  prompt?: string;
  sourceAsset?: GeneratedAsset | null;
  editPrompt?: string;
  isEditable?: boolean;
  editableByCapabilities?: string[];
  thumbnailUrl?: string | null;
  metadata?: GeneratedAssetMetadata;
};

type ListAdminGeneratedAssetsOptions = {
  includeExpired?: boolean;
  includeDeleted?: boolean;
  userId?: string;
};

/**
 * GENERATED ASSET ARCHITECTURE
 * --------------------------------------------------------------------------
 * `generatedOutputs` is the canonical Firestore metadata store for persisted
 * user-owned media/files, even though the collection name is legacy.
 *
 * Actual binary payloads belong in Firebase Storage. Firestore stores only the
 * durable metadata needed to reopen, preview, version, edit, and expire assets.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;

  if (isRecord(value) && typeof value.toDate === 'function') {
    try {
      const date = value.toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return Timestamp.fromDate(date);
      }
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }

  return null;
}

function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = String(dataUrl || '').match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error('ASSET_DATA_URL_INVALID');
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function sanitizePathPart(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

function sanitizeFileName(value: string): string {
  return String(value || 'generated-asset')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'generated-asset';
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'video/mp4':
      return 'mp4';
    case 'audio/mpeg':
      return 'mp3';
    case 'application/pdf':
      return 'pdf';
    case 'application/json':
      return 'json';
    case 'text/markdown':
      return 'md';
    case 'text/plain':
      return 'txt';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx';
    default:
      return 'bin';
  }
}

function assetTypeFromMimeType(mimeType: string, sourceAsset?: GeneratedAsset | null): GeneratedAssetType {
  if (sourceAsset?.assetType === 'image' || sourceAsset?.assetType === 'edited-image') {
    return 'edited-image';
  }
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'other';
}

function deriveEditableCapabilities(input: {
  mimeType: string;
  sourceAsset?: GeneratedAsset | null;
}): string[] {
  if (input.mimeType.startsWith('image/')) {
    return ['image-editing'];
  }

  if (
    input.sourceAsset?.editableByCapabilities &&
    Array.isArray(input.sourceAsset.editableByCapabilities)
  ) {
    return input.sourceAsset.editableByCapabilities.filter(
      (item): item is string => typeof item === 'string'
    );
  }

  return [];
}

function resolveUploadMimeType(upload: GeneratedAssetUploadInput): string {
  if (upload.kind === 'data_url') {
    return parseDataUrl(upload.dataUrl).mimeType;
  }

  if (upload.kind === 'blob') {
    const blobMimeType = upload.mimeType || upload.blob.type;
    if (!blobMimeType.trim()) {
      throw new Error('ASSET_MIME_TYPE_REQUIRED');
    }

    return blobMimeType;
  }

  if (!upload.mimeType.trim()) {
    throw new Error('ASSET_MIME_TYPE_REQUIRED');
  }

  return upload.mimeType;
}

async function uploadGeneratedAssetPayload(input: {
  storagePath: string;
  upload: GeneratedAssetUploadInput;
  metadata: Record<string, string>;
}) {
  const storageRef = ref(storage, input.storagePath);
  const mimeType = resolveUploadMimeType(input.upload);

  if (input.upload.kind === 'data_url') {
    await uploadString(storageRef, input.upload.dataUrl, 'data_url', {
      contentType: mimeType,
      cacheControl: 'private, max-age=300, no-transform',
      customMetadata: input.metadata,
    });
    return storageRef;
  }

  if (input.upload.kind === 'blob') {
    await uploadBytes(storageRef, input.upload.blob, {
      contentType: mimeType,
      cacheControl: 'private, max-age=300, no-transform',
      customMetadata: input.metadata,
    });
    return storageRef;
  }

  await uploadString(storageRef, input.upload.textContent, 'raw', {
    contentType: mimeType,
    cacheControl: 'private, max-age=300, no-transform',
    customMetadata: input.metadata,
  });
  return storageRef;
}

function deriveVersionHistory(input: {
  sourceAsset?: GeneratedAsset | null;
  nextAssetId: string;
  rootAssetId: string;
}): string[] {
  const priorHistory = Array.isArray(input.sourceAsset?.versionHistory)
    ? input.sourceAsset.versionHistory.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  const baseHistory =
    priorHistory.length > 0
      ? priorHistory
      : input.sourceAsset
        ? [input.rootAssetId, input.sourceAsset.id]
        : [input.rootAssetId];

  const merged = [...baseHistory, input.nextAssetId];
  return Array.from(new Set(merged));
}

type GeneratedAssetAccessTarget = Pick<
  GeneratedAsset,
  'id' | 'title' | 'mimeType' | 'downloadUrl' | 'storagePath' | 'storageUrl'
>;

function buildProtectedGeneratedAssetContentPath(assetId: string, disposition: 'inline' | 'attachment' = 'inline') {
  const params = new URLSearchParams({
    disposition,
  });

  return `/api/assets/${encodeURIComponent(assetId)}/content?${params.toString()}`;
}

async function getGeneratedAssetAuthHeaders() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('ASSET_AUTH_REQUIRED');
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function fetchProtectedGeneratedAssetResponse(
  asset: GeneratedAssetAccessTarget,
  disposition: 'inline' | 'attachment'
): Promise<Response> {
  const headers = await getGeneratedAssetAuthHeaders();
  const response = await fetch(buildProtectedGeneratedAssetContentPath(asset.id, disposition), {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`ASSET_CONTENT_${response.status}`);
  }

  return response;
}

async function fetchLegacyGeneratedAssetBlob(asset: GeneratedAssetAccessTarget): Promise<Blob> {
  const legacyUrl = asset.storageUrl || asset.downloadUrl;
  if (!legacyUrl) {
    throw new Error('ASSET_URL_MISSING');
  }

  const response = await fetch(legacyUrl);
  if (!response.ok) {
    throw new Error(`ASSET_LEGACY_CONTENT_${response.status}`);
  }

  return response.blob();
}

export async function fetchGeneratedAssetBlob(asset: GeneratedAssetAccessTarget): Promise<Blob> {
  if (asset.id?.trim()) {
    try {
      const response = await fetchProtectedGeneratedAssetResponse(asset, 'inline');
      return await response.blob();
    } catch (error) {
      logger.warn('Protected asset fetch failed, falling back to legacy retrieval when available.', {
        area: 'generated-assets',
        event: 'protected-asset-fetch-fallback',
        assetId: asset.id,
        error,
      });
    }
  }

  if (asset.storagePath?.trim()) {
    try {
      return await getBlob(ref(storage, asset.storagePath));
    } catch (error) {
      logger.warn('Storage SDK asset fetch failed, falling back to legacy retrieval when available.', {
        area: 'generated-assets',
        event: 'storage-sdk-asset-fetch-fallback',
        assetId: asset.id,
        error,
      });
    }
  }

  return fetchLegacyGeneratedAssetBlob(asset);
}

export async function createGeneratedAssetObjectUrl(asset: GeneratedAssetAccessTarget): Promise<string> {
  const blob = await fetchGeneratedAssetBlob(asset);
  return URL.createObjectURL(blob);
}

export async function openGeneratedAsset(asset: GeneratedAssetAccessTarget) {
  const blob = await fetchGeneratedAssetBlob(asset);
  const objectUrl = URL.createObjectURL(blob);
  const openedWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');

  if (!openedWindow) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('ASSET_OPEN_BLOCKED');
  }

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return true;
}

export function getGeneratedAssetOpenUrl(asset: Pick<GeneratedAsset, 'id' | 'storageUrl' | 'downloadUrl'>): string {
  if (asset.id?.trim()) {
    return buildProtectedGeneratedAssetContentPath(asset.id, 'inline');
  }

  return asset.storageUrl || asset.downloadUrl;
}

export function canOpenGeneratedAsset(asset: Pick<GeneratedAsset, 'id' | 'storageUrl' | 'downloadUrl'>): boolean {
  return Boolean(asset.id?.trim() || asset.storageUrl || asset.downloadUrl);
}

export async function downloadGeneratedAsset(
  asset: GeneratedAssetAccessTarget,
  suggestedFileName?: string
) {
  const fileName =
    suggestedFileName ||
    buildDownloadFileName(
      sanitizeFileName(asset.title),
      extensionFromMimeType(asset.mimeType),
      'generated-asset'
    );

  logger.info('Downloading generated asset.', {
    area: 'generated-assets',
    event: 'download-started',
    resultTitle: asset.title,
    fileName,
      mimeType: asset.mimeType,
  });

  const blob = await fetchGeneratedAssetBlob(asset);
  await downloadBlobToFile({
    blob,
    fileName,
    context: {
      area: 'generated-assets',
      event: 'download-generated-asset',
      resultTitle: asset.title,
    },
  });
}

export function buildGeneratedAssetStoragePath(input: {
  userId: string;
  assetId: string;
  mimeType: string;
  toolId: string;
}) {
  const extension = extensionFromMimeType(input.mimeType);
  const safeToolId = sanitizePathPart(input.toolId);
  return `generated_assets/${sanitizePathPart(input.userId)}/${safeToolId}/${input.assetId}/asset.${extension}`;
}

function normalizeGeneratedAssetRecord(
  id: string,
  raw: Record<string, unknown>
): GeneratedAsset {
  const createdAt = toTimestamp(raw.createdAt) || Timestamp.now();
  const expiresAt = toTimestamp(raw.expiresAt) || computeGeneratedAssetExpiry(createdAt);
  const updatedAt = toTimestamp(raw.updatedAt);

  return {
    id,
    userId: String(raw.userId || ''),
    toolId: String(raw.toolId || ''),
    sourceToolId: typeof raw.sourceToolId === 'string' ? raw.sourceToolId : String(raw.toolId || ''),
    assetType: (String(raw.assetType || 'other') as GeneratedAssetType),
    mimeType: String(raw.mimeType || 'application/octet-stream'),
    provider: String(raw.provider || ''),
    sourceProvider: typeof raw.sourceProvider === 'string' ? raw.sourceProvider : String(raw.provider || ''),
    family: typeof raw.family === 'string' ? raw.family : undefined,
    modelId: String(raw.modelId || ''),
    sourceModelId: typeof raw.sourceModelId === 'string' ? raw.sourceModelId : String(raw.modelId || ''),
    sourceAssetId: typeof raw.sourceAssetId === 'string' ? raw.sourceAssetId : null,
    rootAssetId: typeof raw.rootAssetId === 'string' ? raw.rootAssetId : null,
    title: String(raw.title || 'Generated Asset'),
    prompt: typeof raw.prompt === 'string' ? raw.prompt : null,
    editPromptHistory: Array.isArray(raw.editPromptHistory)
      ? raw.editPromptHistory.filter((item): item is string => typeof item === 'string')
      : [],
    storagePath: String(raw.storagePath || ''),
    storageUrl: typeof raw.storageUrl === 'string' ? raw.storageUrl : String(raw.downloadUrl || ''),
    downloadUrl: String(raw.downloadUrl || ''),
    thumbnailUrl: typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl : null,
    createdAt,
    updatedAt,
    expiresAt,
    status: String(raw.status || 'active') as GeneratedAsset['status'],
    isEditable: raw.isEditable === true,
    editableByCapabilities: Array.isArray(raw.editableByCapabilities)
      ? raw.editableByCapabilities.filter((item): item is string => typeof item === 'string')
      : deriveEditableCapabilities({
          mimeType: String(raw.mimeType || 'application/octet-stream'),
        }),
    versionIndex:
      typeof raw.versionIndex === 'number' && Number.isFinite(raw.versionIndex)
        ? raw.versionIndex
        : 0,
    versionHistory: Array.isArray(raw.versionHistory)
      ? raw.versionHistory.filter((item): item is string => typeof item === 'string')
      : Array.from(new Set([typeof raw.rootAssetId === 'string' ? raw.rootAssetId : id, id])),
    metadata: isRecord(raw.metadata) ? (raw.metadata as GeneratedAssetMetadata) : {},
  };
}

export async function createGeneratedImageAsset(
  params: CreateImageAssetParams
): Promise<GeneratedAsset> {
  return createGeneratedAsset({
    userId: params.userId,
    toolId: params.toolId,
    title: params.title,
    provider: params.provider,
    family: params.family,
    modelId: params.modelId,
    prompt: params.prompt,
    sourceAsset: params.sourceAsset,
    editPrompt: params.editPrompt,
    metadata: params.metadata,
    upload: {
      kind: 'data_url',
      dataUrl: params.dataUrl,
    },
  });
}

/**
 * Use this wrapper when a tool already has a Blob/File result (PDF, DOCX,
 * video, audio, future export payloads) and wants to persist it through the
 * canonical generated-asset contract without going through an image-only path.
 */
export async function createGeneratedFileAssetFromBlob(
  params: Omit<CreateGeneratedAssetParams, 'upload'> & {
    blob: Blob;
    mimeType?: string;
  }
): Promise<GeneratedAsset> {
  return createGeneratedAsset({
    ...params,
    upload: {
      kind: 'blob',
      blob: params.blob,
      mimeType: params.mimeType,
    },
  });
}

/**
 * Use this wrapper for structured text exports that should stay in Storage
 * rather than being embedded directly inside Firestore documents.
 */
export async function createGeneratedTextAsset(
  params: Omit<CreateGeneratedAssetParams, 'upload'> & {
    textContent: string;
    mimeType: string;
  }
): Promise<GeneratedAsset> {
  return createGeneratedAsset({
    ...params,
    upload: {
      kind: 'text',
      textContent: params.textContent,
      mimeType: params.mimeType,
    },
  });
}

export async function createGeneratedAsset(
  params: CreateGeneratedAssetParams
): Promise<GeneratedAsset> {
  const mimeType = resolveUploadMimeType(params.upload);
  const assetRef = doc(collection(db, GENERATED_ASSET_COLLECTION));
  const createdAt = Timestamp.now();
  const expiresAt = computeGeneratedAssetExpiry(createdAt);
  const versionState = deriveGeneratedAssetVersionState({
    sourceAsset: params.sourceAsset,
    editPrompt: params.editPrompt,
  });
  const storagePath = buildGeneratedAssetStoragePath({
    userId: params.userId,
    assetId: assetRef.id,
    mimeType,
    toolId: params.toolId,
  });
  const storageRef = ref(storage, storagePath);
  const uploadMetadata = {
    userId: params.userId,
    toolId: params.toolId,
    modelId: params.modelId,
  };

  await uploadGeneratedAssetPayload({
    storagePath,
    upload: params.upload,
    metadata: uploadMetadata,
  });

  try {
    const title =
      params.sourceAsset && versionState.versionIndex > 0
        ? `${params.sourceAsset.title || params.title} v${versionState.versionIndex + 1}`
        : params.title;

    const asset: GeneratedAsset = {
      id: assetRef.id,
      userId: params.userId,
      toolId: params.toolId,
      sourceToolId: params.toolId,
      assetType: params.assetType || assetTypeFromMimeType(mimeType, params.sourceAsset),
      mimeType,
      provider: params.provider,
      sourceProvider: params.provider,
      family: params.family,
      modelId: params.modelId,
      sourceModelId: params.modelId,
      sourceAssetId: params.sourceAsset?.id || null,
      rootAssetId: versionState.rootAssetId || assetRef.id,
      title,
      prompt: params.prompt?.trim() || params.sourceAsset?.prompt || null,
      editPromptHistory: versionState.editPromptHistory,
      storagePath,
      storageUrl: '',
      downloadUrl: '',
      thumbnailUrl:
        params.thumbnailUrl !== undefined
          ? params.thumbnailUrl
          : null,
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      status: 'active',
      isEditable: params.isEditable ?? mimeType.startsWith('image/'),
      editableByCapabilities:
        params.editableByCapabilities && params.editableByCapabilities.length > 0
          ? Array.from(
              new Set(
                params.editableByCapabilities.filter(
                  (item): item is string => typeof item === 'string' && item.trim().length > 0
                )
              )
            )
          : deriveEditableCapabilities({
              mimeType,
              sourceAsset: params.sourceAsset,
            }),
      versionIndex: versionState.versionIndex,
      versionHistory: deriveVersionHistory({
        sourceAsset: params.sourceAsset,
        nextAssetId: assetRef.id,
        rootAssetId: versionState.rootAssetId || assetRef.id,
      }),
      metadata: {
        ...(params.metadata || {}),
        storage: {
          ...((params.metadata?.storage && isRecord(params.metadata.storage))
            ? params.metadata.storage
            : {}),
          retrievalReference: `generated-asset:${assetRef.id}`,
          originalStoragePath: storagePath,
        },
      },
    };

    await setDoc(assetRef, asset);
    return asset;
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined);
    throw error;
  }
}

export async function getGeneratedAssetById(assetId: string): Promise<GeneratedAsset | null> {
  if (!assetId.trim()) return null;

  const assetDoc = await getDoc(doc(db, GENERATED_ASSET_COLLECTION, assetId));
  if (!assetDoc.exists()) {
    return null;
  }

  return normalizeGeneratedAssetRecord(assetDoc.id, assetDoc.data() as Record<string, unknown>);
}

export async function listUserGeneratedAssets(userId: string): Promise<GeneratedAsset[]> {
  await cleanupExpiredGeneratedAssetsForUser(userId);

  const assetQuery = query(
    collection(db, GENERATED_ASSET_COLLECTION),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(assetQuery);
  const now = Timestamp.now();

  return snapshot.docs
    .map((assetDoc) =>
      normalizeGeneratedAssetRecord(assetDoc.id, assetDoc.data() as Record<string, unknown>)
    )
    .filter((asset) => asset.status !== 'deleted')
    .filter((asset) => asset.expiresAt.toMillis() > now.toMillis())
    .sort((left, right) => right.createdAt.toMillis() - left.createdAt.toMillis());
}

/**
 * Admin explorer path.
 * --------------------------------------------------------------------------
 * Keep this separate from user-scoped queries so the admin UI can inspect the
 * same canonical asset records without weakening the normal per-user access
 * pattern used by the public library surface.
 */
export async function listAllGeneratedAssetsForAdmin(
  options: ListAdminGeneratedAssetsOptions = {}
): Promise<GeneratedAsset[]> {
  const assetQuery = options.userId?.trim()
    ? query(
        collection(db, GENERATED_ASSET_COLLECTION),
        where('userId', '==', options.userId.trim())
      )
    : collection(db, GENERATED_ASSET_COLLECTION);

  const snapshot = await getDocs(assetQuery);
  const now = Timestamp.now();

  return snapshot.docs
    .map((assetDoc) =>
      normalizeGeneratedAssetRecord(assetDoc.id, assetDoc.data() as Record<string, unknown>)
    )
    .filter((asset) => (options.includeDeleted ? true : asset.status !== 'deleted'))
    .filter((asset) =>
      options.includeExpired ? true : asset.expiresAt.toMillis() > now.toMillis()
    )
    .sort((left, right) => right.createdAt.toMillis() - left.createdAt.toMillis());
}

export async function listGeneratedAssetVersions(
  userId: string,
  rootAssetId: string
): Promise<GeneratedAsset[]> {
  const assets = await listUserGeneratedAssets(userId);
  return assets
    .filter((asset) => (asset.rootAssetId || asset.id) === rootAssetId)
    .sort((left, right) => left.versionIndex - right.versionIndex);
}

export async function cleanupExpiredGeneratedAssetsForUser(
  userId: string
): Promise<GeneratedAssetCleanupSummary> {
  const assetQuery = query(
    collection(db, GENERATED_ASSET_COLLECTION),
    where('userId', '==', userId)
  );
  const snapshot = await getDocs(assetQuery);
  const now = Timestamp.now();
  const summary: GeneratedAssetCleanupSummary = {
    scanned: snapshot.docs.length,
    deleted: 0,
    skippedInvalid: 0,
    deleteErrors: 0,
  };

  for (const assetDoc of snapshot.docs) {
    try {
      const asset = normalizeGeneratedAssetRecord(
        assetDoc.id,
        assetDoc.data() as Record<string, unknown>
      );

      if (!asset.storagePath) {
        summary.skippedInvalid += 1;
        continue;
      }

      if (asset.expiresAt.toMillis() > now.toMillis()) {
        continue;
      }

      await deleteObject(ref(storage, asset.storagePath)).catch((error: unknown) => {
        const message = String((error as { code?: string; message?: string })?.code || (error as Error)?.message || '');
        if (!message.includes('storage/object-not-found')) {
          throw error;
        }
      });

      await deleteDoc(assetDoc.ref);
      summary.deleted += 1;
    } catch {
      summary.deleteErrors += 1;
    }
  }

  return summary;
}

export async function createOrUpdateImageEditSession(params: {
  sessionId?: string;
  userId: string;
  originalAssetId: string;
  currentAssetId: string;
  selectedEditModelId: string;
  versionHistory: string[];
  editPromptHistory: string[];
  sourceMetadata?: Record<string, unknown>;
}): Promise<ImageEditSession> {
  const sessionRef = params.sessionId
    ? doc(db, IMAGE_EDIT_SESSION_COLLECTION, params.sessionId)
    : doc(collection(db, IMAGE_EDIT_SESSION_COLLECTION));

  const now = Timestamp.now();
  const existing = params.sessionId ? await getDoc(sessionRef) : null;
  const createdAt = existing?.exists()
    ? toTimestamp(existing.data()?.createdAt) || now
    : now;

  const session: ImageEditSession = {
    id: sessionRef.id,
    userId: params.userId,
    originalAssetId: params.originalAssetId,
    currentAssetId: params.currentAssetId,
    selectedEditModelId: params.selectedEditModelId,
    versionHistory: Array.isArray(params.versionHistory) ? params.versionHistory : [],
    editPromptHistory: params.editPromptHistory,
    sourceMetadata: params.sourceMetadata,
    createdAt,
    updatedAt: now,
  };

  await setDoc(sessionRef, session, { merge: true });
  return session;
}

export async function getImageEditSessionForOriginalAsset(
  userId: string,
  originalAssetId: string
): Promise<ImageEditSession | null> {
  const sessionQuery = query(
    collection(db, IMAGE_EDIT_SESSION_COLLECTION),
    where('userId', '==', userId),
    where('originalAssetId', '==', originalAssetId)
  );
  const snapshot = await getDocs(sessionQuery);
  const sessionRecords: Array<Record<string, unknown> & { id: string }> = snapshot.docs.map((sessionDoc) => ({
      id: sessionDoc.id,
      ...(sessionDoc.data() as Record<string, unknown>),
    }));
  const latest = sessionRecords
    .sort((left, right) => {
      const leftUpdated = toTimestamp(left.updatedAt)?.toMillis() || 0;
      const rightUpdated = toTimestamp(right.updatedAt)?.toMillis() || 0;
      return rightUpdated - leftUpdated;
    })[0];

  if (!latest) return null;

  return {
    id: String(latest.id),
    userId: String(latest.userId || ''),
    originalAssetId: String(latest.originalAssetId || ''),
    currentAssetId: String(latest.currentAssetId || ''),
    selectedEditModelId: String(latest.selectedEditModelId || ''),
    versionHistory: Array.isArray(latest.versionHistory)
      ? latest.versionHistory.filter((item): item is string => typeof item === 'string')
      : [],
    editPromptHistory: Array.isArray(latest.editPromptHistory)
      ? latest.editPromptHistory.filter((item): item is string => typeof item === 'string')
      : [],
    sourceMetadata: isRecord(latest.sourceMetadata) ? latest.sourceMetadata : {},
    createdAt: toTimestamp(latest.createdAt) || Timestamp.now(),
    updatedAt: toTimestamp(latest.updatedAt) || Timestamp.now(),
  };
}

export async function readAssetAsDataUrl(asset: GeneratedAsset): Promise<string> {
  const blob = await fetchGeneratedAssetBlob(asset);

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('ASSET_READ_FAILED'));
    };
    reader.onerror = () => reject(new Error('ASSET_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

export function getGeneratedAssetPreviewData(asset: GeneratedAsset, resolvedUrl?: string | null) {
  return {
    url: resolvedUrl || asset.downloadUrl || '',
    storageUrl: asset.storageUrl || asset.downloadUrl || resolvedUrl || '',
    prompt: asset.editPromptHistory.at(-1) || asset.prompt || '',
    modelId: asset.modelId,
    sourceProvider: asset.sourceProvider || asset.provider,
    sourceModelId: asset.sourceModelId || asset.modelId,
    sourceToolId: asset.sourceToolId || asset.toolId,
    assetId: asset.id,
    sourceAssetId: asset.sourceAssetId || null,
    versionIndex: asset.versionIndex,
    versionHistory: asset.versionHistory,
    editableByCapabilities: asset.editableByCapabilities,
    ...(isRecord(asset.metadata) ? asset.metadata : {}),
  };
}

export function formatAssetExpirationLabel(asset: GeneratedAsset): string {
  const remainingMs = asset.expiresAt.toMillis() - Date.now();
  if (remainingMs <= 0) {
    return 'Expired';
  }

  const totalHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (totalHours >= 24) {
    const days = Math.ceil(totalHours / 24);
    return `${days} day${days === 1 ? '' : 's'} left`;
  }

  return `${totalHours} hour${totalHours === 1 ? '' : 's'} left`;
}
