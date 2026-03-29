import crypto from 'crypto';
import { logDiagnostic, normalizeError } from '../diagnostics.js';
import { isRecoverableAdminCredentialError } from '../adminAccountDirectoryService.js';
import { shouldAllowDocumentRuntimeMemoryFallback } from './config.js';
import { documentWorkspaceStorage } from './documentStorage.js';
import { assertActorOwnsResource } from './actorScope.js';
import {
  DocumentActorContext,
  DocumentArtifactPayload,
  StoredArtifactRecord,
  StoredDocumentRecord,
} from './types.js';

export const RUNTIME_DOCUMENT_COLLECTION = 'runtime_documents';
export const RUNTIME_DOCUMENT_ARTIFACT_COLLECTION = 'runtime_document_artifacts';
export const RUNTIME_DOCUMENT_AUDIT_COLLECTION = 'runtime_document_access_audits';
const DOCUMENT_ARTIFACT_STORE_MEMORY_FALLBACK_ENABLED = shouldAllowDocumentRuntimeMemoryFallback();

function isExpiredIso(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  const expiresAtMs = new Date(value).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

export class DocumentArtifactStore {
  private readonly documentFallbackStore = new Map<string, StoredDocumentRecord>();
  private readonly artifactFallbackStore = new Map<string, StoredArtifactRecord>();
  private hasLoggedMemoryFallbackActivation = false;

  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private shouldUseMemoryFallback(error: unknown): boolean {
    return DOCUMENT_ARTIFACT_STORE_MEMORY_FALLBACK_ENABLED && isRecoverableAdminCredentialError(error);
  }

  private cacheDocumentRecord(record: StoredDocumentRecord): StoredDocumentRecord {
    const cached = { ...record };
    this.documentFallbackStore.set(record.documentId, cached);
    return cached;
  }

  private cacheArtifactRecord(record: StoredArtifactRecord): StoredArtifactRecord {
    const cached = { ...record };
    this.artifactFallbackStore.set(record.artifactId, cached);
    return cached;
  }

  private getCachedDocumentRecord(documentId: string): StoredDocumentRecord | null {
    const cached = this.documentFallbackStore.get(documentId);
    return cached ? { ...cached } : null;
  }

  private getCachedArtifactRecord(artifactId: string): StoredArtifactRecord | null {
    const cached = this.artifactFallbackStore.get(artifactId);
    return cached ? { ...cached } : null;
  }

  private logMemoryFallback(event: string, details: Record<string, unknown>, error: unknown): void {
    if (!this.hasLoggedMemoryFallbackActivation) {
      this.hasLoggedMemoryFallbackActivation = true;
      logDiagnostic('warn', 'document_runtime.artifact_store_memory_fallback_enabled', {
        area: 'document-runtime',
        stage: 'artifact_store',
        status: 'fallback',
        details: {
          reason: 'recoverable_firebase_admin_credential_error',
          error: normalizeError(error),
        },
      });
    }

    logDiagnostic('warn', event, {
      area: 'document-runtime',
      stage: 'artifact_store',
      status: 'fallback',
      details: {
        ...details,
        error: normalizeError(error),
      },
    });
  }

  private async markArtifactInvalidated(
    artifactId: string | null | undefined,
    reason: string
  ): Promise<void> {
    if (!artifactId) {
      return;
    }

    const update = {
      updatedAt: new Date().toISOString(),
      invalidatedAt: new Date().toISOString(),
      invalidationReason: reason,
    };

    try {
      await this.db
        .collection(RUNTIME_DOCUMENT_ARTIFACT_COLLECTION)
        .doc(artifactId)
        .set(update, { merge: true });

      const cachedArtifact = this.getCachedArtifactRecord(artifactId);
      if (cachedArtifact) {
        this.cacheArtifactRecord({
          ...cachedArtifact,
          ...update,
        });
      }
    } catch (error) {
      if (!this.shouldUseMemoryFallback(error)) {
        throw error;
      }

      const cachedArtifact = this.getCachedArtifactRecord(artifactId);
      if (cachedArtifact) {
        this.cacheArtifactRecord({
          ...cachedArtifact,
          ...update,
        });
      }

      this.logMemoryFallback('document_runtime.artifact_invalidation_fallback', {
        artifactId,
        reason,
      }, error);
    }
  }

  async createDocumentRecord(input: Omit<StoredDocumentRecord, 'createdAt' | 'updatedAt'>): Promise<StoredDocumentRecord> {
    const nowIso = new Date().toISOString();
    const record: StoredDocumentRecord = {
      ...input,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await this.db.collection(RUNTIME_DOCUMENT_COLLECTION).doc(record.documentId).set(record);
    } catch (error) {
      if (!this.shouldUseMemoryFallback(error)) {
        throw error;
      }

      this.logMemoryFallback('document_runtime.document_record_create_fallback', {
        documentId: record.documentId,
        workflowId: record.workflowId,
        fileName: record.fileName,
      }, error);
    }

    return this.cacheDocumentRecord(record);
  }

  async updateDocumentRecord(
    documentId: string,
    updates: Partial<StoredDocumentRecord>
  ): Promise<StoredDocumentRecord> {
    const ref = this.db.collection(RUNTIME_DOCUMENT_COLLECTION).doc(documentId);

    try {
      const snap = await ref.get();
      if (!snap.exists) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      const current = snap.data() as StoredDocumentRecord;
      const next: StoredDocumentRecord = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      await ref.set(next);
      return this.cacheDocumentRecord(next);
    } catch (error) {
      if (!this.shouldUseMemoryFallback(error)) {
        throw error;
      }

      const current = this.getCachedDocumentRecord(documentId);
      if (!current) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      const next: StoredDocumentRecord = {
        ...current,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      this.logMemoryFallback('document_runtime.document_record_update_fallback', {
        documentId,
        updatedFields: Object.keys(updates),
      }, error);

      return this.cacheDocumentRecord(next);
    }
  }

  async createArtifactRecord(input: {
    payload: DocumentArtifactPayload;
    relativePath: string;
    workspaceRootRelativePath: string;
    originalFilePath: string;
    finalExtractedTextPath: string;
    structuredJsonPath: string;
    normalizedMarkdownPath: string;
    pageMapPath: string;
    ocrBlocksPath: string | null;
    manifestPath: string;
  }): Promise<StoredArtifactRecord> {
    const nowIso = new Date().toISOString();
    const record: StoredArtifactRecord = {
      artifactId: input.payload.artifactId,
      documentId: input.payload.documentId,
      workflowId: input.payload.workflowId,
      sourceFileId: input.payload.sourceFileId,
      ownerActorId: input.payload.actorId,
      ownerRole: input.payload.actorRole,
      workspaceScope: input.payload.workspaceScope,
      processingPathway: input.payload.processingPathway,
      extractionVersion: input.payload.extractionVersion,
      extractionStrategy: input.payload.extractionStrategy,
      status: input.payload.status,
      artifactStoragePath: input.relativePath,
      artifactStorageRelativePath: input.relativePath,
      workspaceRootRelativePath: input.workspaceRootRelativePath,
      fileType: input.payload.fileType,
      originalFilePath: input.originalFilePath,
      finalExtractedTextPath: input.finalExtractedTextPath,
      structuredJsonPath: input.structuredJsonPath,
      normalizedMarkdownPath: input.normalizedMarkdownPath,
      pageMapPath: input.pageMapPath,
      ocrBlocksPath: input.ocrBlocksPath,
      manifestPath: input.manifestPath,
      languageHints: input.payload.languageHints,
      textLength: input.payload.normalizedText.length,
      pageCount: input.payload.pageSegments.length,
      createdAt: input.payload.createdAt,
      updatedAt: input.payload.updatedAt || nowIso,
      expiresAt: input.payload.expiresAt || null,
      invalidatedAt: null,
      invalidationReason: null,
    };

    const nextDocumentFromCurrent = (current: StoredDocumentRecord): StoredDocumentRecord => ({
      ...current,
      activeArtifactId: record.artifactId,
      status: 'ready',
      fileType: input.payload.fileType,
      extractionMeta: input.payload.extractionMeta,
      extractionStrategy: input.payload.extractionStrategy,
      extractionVersion: input.payload.extractionVersion,
      expiresAt: input.payload.expiresAt || null,
      latestError: null,
      updatedAt: nowIso,
    });

    let committedDocumentRecord: StoredDocumentRecord | null = null;

    try {
      await this.db.runTransaction(async (tx) => {
        const documentRef = this.db.collection(RUNTIME_DOCUMENT_COLLECTION).doc(record.documentId);
        const artifactRef = this.db
          .collection(RUNTIME_DOCUMENT_ARTIFACT_COLLECTION)
          .doc(record.artifactId);
        const documentSnap = await tx.get(documentRef);

        if (!documentSnap.exists) {
          throw new Error('DOCUMENT_NOT_FOUND');
        }

        const current = documentSnap.data() as StoredDocumentRecord;
        if (current.status !== 'processing' && current.status !== 'pending') {
          throw new Error('DOCUMENT_RUNTIME_STALE_WRITE_BLOCKED');
        }

        const nextDocument = nextDocumentFromCurrent(current);

        tx.set(artifactRef, record);
        tx.set(documentRef, nextDocument);
        committedDocumentRecord = nextDocument;
      });

      if (committedDocumentRecord) {
        this.cacheDocumentRecord(committedDocumentRecord);
      }
    } catch (error) {
      if (!this.shouldUseMemoryFallback(error)) {
        throw error;
      }

      const current = this.getCachedDocumentRecord(record.documentId);
      if (!current) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      if (current.status !== 'processing' && current.status !== 'pending') {
        throw new Error('DOCUMENT_RUNTIME_STALE_WRITE_BLOCKED');
      }

      const nextDocument = nextDocumentFromCurrent(current);
      this.cacheArtifactRecord(record);
      this.cacheDocumentRecord(nextDocument);

      this.logMemoryFallback('document_runtime.artifact_record_create_fallback', {
        documentId: record.documentId,
        artifactId: record.artifactId,
        workflowId: record.workflowId,
      }, error);
    }

    return this.cacheArtifactRecord(record);
  }

  async getOwnedDocument(actor: DocumentActorContext, documentId: string): Promise<StoredDocumentRecord> {
    try {
      const snap = await this.db.collection(RUNTIME_DOCUMENT_COLLECTION).doc(documentId).get();
      if (!snap.exists) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      const record = snap.data() as StoredDocumentRecord;
      assertActorOwnsResource(actor, record.ownerActorId, record.workspaceScope);
      return this.cacheDocumentRecord(record);
    } catch (error) {
      if (!this.shouldUseMemoryFallback(error)) {
        throw error;
      }

      const record = this.getCachedDocumentRecord(documentId);
      if (!record) {
        throw new Error('DOCUMENT_NOT_FOUND');
      }

      assertActorOwnsResource(actor, record.ownerActorId, record.workspaceScope);
      this.logMemoryFallback('document_runtime.document_record_read_fallback', {
        documentId,
        actorId: actor.actorId,
      }, error);
      return record;
    }
  }

  async getOwnedArtifact(actor: DocumentActorContext, artifactId: string): Promise<StoredArtifactRecord> {
    try {
      const snap = await this.db.collection(RUNTIME_DOCUMENT_ARTIFACT_COLLECTION).doc(artifactId).get();
      if (!snap.exists) {
        throw new Error('DOCUMENT_ARTIFACT_NOT_FOUND');
      }

      const record = snap.data() as StoredArtifactRecord;
      assertActorOwnsResource(actor, record.ownerActorId, record.workspaceScope);
      return this.cacheArtifactRecord(record);
    } catch (error) {
      if (!this.shouldUseMemoryFallback(error)) {
        throw error;
      }

      const record = this.getCachedArtifactRecord(artifactId);
      if (!record) {
        throw new Error('DOCUMENT_ARTIFACT_NOT_FOUND');
      }

      assertActorOwnsResource(actor, record.ownerActorId, record.workspaceScope);
      this.logMemoryFallback('document_runtime.artifact_record_read_fallback', {
        artifactId,
        actorId: actor.actorId,
      }, error);
      return record;
    }
  }

  async getArtifactForDocument(actor: DocumentActorContext, documentId: string): Promise<{
    document: StoredDocumentRecord;
    artifact: StoredArtifactRecord;
    payload: DocumentArtifactPayload;
  }> {
    const document = await this.getOwnedDocument(actor, documentId);
    if (isExpiredIso(document.expiresAt)) {
      await this.invalidateDocument(actor, documentId, 'Document artifact expired.');
      throw new Error('DOCUMENT_ARTIFACT_EXPIRED');
    }
    if (document.status === 'deleted' || document.status === 'cancelled') {
      throw new Error('DOCUMENT_ARTIFACT_NOT_READY');
    }
    if (!document.activeArtifactId) {
      throw new Error('DOCUMENT_ARTIFACT_NOT_READY');
    }

    const artifact = await this.getOwnedArtifact(actor, document.activeArtifactId);
    if (artifact.invalidatedAt) {
      throw new Error('DOCUMENT_ARTIFACT_NOT_READY');
    }
    const payload = await documentWorkspaceStorage.readArtifactPayload(artifact.artifactStorageRelativePath);

    return {
      document,
      artifact,
      payload,
    };
  }

  async markFailed(
    actor: DocumentActorContext,
    documentId: string,
    input: {
      code: string;
      message: string;
      retryable: boolean;
    }
  ): Promise<StoredDocumentRecord> {
    const document = await this.getOwnedDocument(actor, documentId);
    return this.updateDocumentRecord(document.documentId, {
      status: 'failed',
      latestError: input,
    });
  }

  async markCancelled(actor: DocumentActorContext, documentId: string): Promise<StoredDocumentRecord> {
    const document = await this.getOwnedDocument(actor, documentId);
    await documentWorkspaceStorage.removeDocumentWorkspace(actor, document.workflowId, documentId);
    await this.markArtifactInvalidated(document.activeArtifactId, 'Document processing was cancelled.');
    return this.updateDocumentRecord(document.documentId, {
      status: 'cancelled',
      activeArtifactId: null,
      latestError: {
        code: 'DOCUMENT_CANCELLED',
        message: 'Document processing was cancelled.',
        retryable: true,
      },
    });
  }

  async invalidateDocument(
    actor: DocumentActorContext,
    documentId: string,
    reason: string
  ): Promise<StoredDocumentRecord> {
    const document = await this.getOwnedDocument(actor, documentId);
    await documentWorkspaceStorage.removeDocumentWorkspace(actor, document.workflowId, documentId);
    await this.markArtifactInvalidated(document.activeArtifactId, reason);
    return this.updateDocumentRecord(document.documentId, {
      status: 'deleted',
      activeArtifactId: null,
      deletedAt: new Date().toISOString(),
      latestError: {
        code: 'DOCUMENT_INVALIDATED',
        message: reason,
        retryable: false,
      },
    });
  }

  async auditExplicitAdminAccess(input: {
    adminActor: DocumentActorContext;
    targetDocumentId: string;
    targetOwnerActorId: string;
    reason: string;
  }): Promise<void> {
    const auditRecord = {
      auditId: crypto.randomUUID(),
      actorId: input.adminActor.actorId,
      actorRole: input.adminActor.actorRole,
      adminLevel: input.adminActor.adminLevel || null,
      targetDocumentId: input.targetDocumentId,
      targetOwnerActorId: input.targetOwnerActorId,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.db.collection(RUNTIME_DOCUMENT_AUDIT_COLLECTION).add(auditRecord);
    } catch (error) {
      if (!this.shouldUseMemoryFallback(error)) {
        throw error;
      }

      this.logMemoryFallback('document_runtime.audit_write_fallback', {
        targetDocumentId: input.targetDocumentId,
        targetOwnerActorId: input.targetOwnerActorId,
        adminActorId: input.adminActor.actorId,
      }, error);
    }
  }
}
