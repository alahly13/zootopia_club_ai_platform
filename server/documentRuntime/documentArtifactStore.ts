import crypto from 'crypto';
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

function isExpiredIso(value?: string | null): boolean {
  if (!value) {
    return false;
  }

  const expiresAtMs = new Date(value).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

export class DocumentArtifactStore {
  constructor(private readonly db: FirebaseFirestore.Firestore) {}

  private async markArtifactInvalidated(
    artifactId: string | null | undefined,
    reason: string
  ): Promise<void> {
    if (!artifactId) {
      return;
    }

    await this.db
      .collection(RUNTIME_DOCUMENT_ARTIFACT_COLLECTION)
      .doc(artifactId)
      .set(
        {
          updatedAt: new Date().toISOString(),
          invalidatedAt: new Date().toISOString(),
          invalidationReason: reason,
        },
        { merge: true }
      );
  }

  async createDocumentRecord(input: Omit<StoredDocumentRecord, 'createdAt' | 'updatedAt'>): Promise<StoredDocumentRecord> {
    const nowIso = new Date().toISOString();
    const record: StoredDocumentRecord = {
      ...input,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await this.db.collection(RUNTIME_DOCUMENT_COLLECTION).doc(record.documentId).set(record);
    return record;
  }

  async updateDocumentRecord(
    documentId: string,
    updates: Partial<StoredDocumentRecord>
  ): Promise<StoredDocumentRecord> {
    const ref = this.db.collection(RUNTIME_DOCUMENT_COLLECTION).doc(documentId);
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
    return next;
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

      const nextDocument: StoredDocumentRecord = {
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
      };

      tx.set(artifactRef, record);
      tx.set(documentRef, nextDocument);
    });

    return record;
  }

  async getOwnedDocument(actor: DocumentActorContext, documentId: string): Promise<StoredDocumentRecord> {
    const snap = await this.db.collection(RUNTIME_DOCUMENT_COLLECTION).doc(documentId).get();
    if (!snap.exists) {
      throw new Error('DOCUMENT_NOT_FOUND');
    }

    const record = snap.data() as StoredDocumentRecord;
    assertActorOwnsResource(actor, record.ownerActorId, record.workspaceScope);
    return record;
  }

  async getOwnedArtifact(actor: DocumentActorContext, artifactId: string): Promise<StoredArtifactRecord> {
    const snap = await this.db.collection(RUNTIME_DOCUMENT_ARTIFACT_COLLECTION).doc(artifactId).get();
    if (!snap.exists) {
      throw new Error('DOCUMENT_ARTIFACT_NOT_FOUND');
    }

    const record = snap.data() as StoredArtifactRecord;
    assertActorOwnsResource(actor, record.ownerActorId, record.workspaceScope);
    return record;
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
    await this.db.collection(RUNTIME_DOCUMENT_AUDIT_COLLECTION).add({
      auditId: crypto.randomUUID(),
      actorId: input.adminActor.actorId,
      actorRole: input.adminActor.actorRole,
      adminLevel: input.adminActor.adminLevel || null,
      targetDocumentId: input.targetDocumentId,
      targetOwnerActorId: input.targetOwnerActorId,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });
  }
}
