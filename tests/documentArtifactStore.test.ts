import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DocumentArtifactStore,
  RUNTIME_DOCUMENT_ARTIFACT_COLLECTION,
  RUNTIME_DOCUMENT_COLLECTION,
} from '../server/documentRuntime/documentArtifactStore';
import type { DocumentArtifactPayload, StoredDocumentRecord } from '../server/documentRuntime/types';

class FakeDocumentSnapshot {
  constructor(private readonly value: Record<string, unknown> | undefined) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): Record<string, unknown> | undefined {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(
    private readonly buckets: Map<string, Map<string, Record<string, unknown>>>,
    private readonly collectionName: string,
    private readonly documentId: string
  ) {}

  async get(): Promise<FakeDocumentSnapshot> {
    const bucket = this.buckets.get(this.collectionName);
    return new FakeDocumentSnapshot(bucket?.get(this.documentId));
  }

  async set(
    value: Record<string, unknown>,
    options?: {
      merge?: boolean;
    }
  ): Promise<void> {
    const bucket = this.ensureBucket();
    if (options?.merge) {
      bucket.set(this.documentId, {
        ...(bucket.get(this.documentId) || {}),
        ...value,
      });
      return;
    }

    bucket.set(this.documentId, value);
  }

  private ensureBucket(): Map<string, Record<string, unknown>> {
    const existing = this.buckets.get(this.collectionName);
    if (existing) {
      return existing;
    }

    const created = new Map<string, Record<string, unknown>>();
    this.buckets.set(this.collectionName, created);
    return created;
  }
}

class FakeCollectionReference {
  constructor(
    private readonly buckets: Map<string, Map<string, Record<string, unknown>>>,
    private readonly collectionName: string
  ) {}

  doc(documentId: string): FakeDocumentReference {
    return new FakeDocumentReference(this.buckets, this.collectionName, documentId);
  }

  async add(value: Record<string, unknown>): Promise<{ id: string }> {
    const documentId = `auto-${Date.now()}`;
    await this.doc(documentId).set(value);
    return { id: documentId };
  }
}

class FakeFirestore {
  private readonly buckets = new Map<string, Map<string, Record<string, unknown>>>();

  collection(collectionName: string): FakeCollectionReference {
    return new FakeCollectionReference(this.buckets, collectionName);
  }

  async runTransaction<T>(
    callback: (tx: {
      get: (ref: FakeDocumentReference) => Promise<FakeDocumentSnapshot>;
      set: (
        ref: FakeDocumentReference,
        value: Record<string, unknown>,
        options?: { merge?: boolean }
      ) => Promise<void>;
    }) => Promise<T>
  ): Promise<T> {
    return callback({
      get: (ref) => ref.get(),
      set: (ref, value, options) => ref.set(value, options),
    });
  }

  read(collectionName: string, documentId: string): Record<string, unknown> | undefined {
    return this.buckets.get(collectionName)?.get(documentId);
  }
}

function buildPayload(): DocumentArtifactPayload {
  return {
    artifactId: 'artifact-1',
    documentId: 'doc-1',
    workflowId: 'wf-1',
    sourceFileId: 'source-1',
    actorId: 'user-1',
    actorRole: 'User',
    ownerActorId: 'user-1',
    ownerRole: 'User',
    workspaceScope: 'user',
    extractionVersion: '2026.03.layered-runtime-v2',
    extractionStrategy: 'txt_native',
    processingPathway: 'local_extraction',
    status: 'ready',
    fileType: 'txt',
    sourceFileName: 'lecture.txt',
    sourceMimeType: 'text/plain',
    paths: {
      workspaceRootPath: 'runtime/document-workspaces/users/user-1/workflows/wf-1/documents/doc-1',
      workspaceRelativeRootPath: 'users/user-1/workflows/wf-1/documents/doc-1',
      originalFilePath: 'users/user-1/workflows/wf-1/documents/doc-1/source/source-1-lecture.txt',
      finalExtractedTextPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/clean/final-extracted.txt',
      structuredJsonPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/structured/document.json',
      normalizedMarkdownPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/normalized/document.md',
      pageMapPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/structured/page-map.json',
      ocrBlocksPath: null,
      manifestPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/manifest.json',
    },
    fullText: 'Cell biology introduction',
    normalizedText: 'Cell biology introduction',
    normalizedMarkdown: '# lecture.txt',
    structuredDocumentJson: {
      documentTitle: 'lecture.txt',
      fileType: 'txt',
      languageHints: ['en'],
      pages: [],
      sections: [],
      headingTree: [],
      tables: [],
      lists: [],
      metadata: {},
    },
    pageMap: [],
    ocrBlocks: [],
    pageSegments: [
      {
        segmentId: 'seg-1',
        pageNumber: 1,
        text: 'Cell biology introduction',
        kind: 'native',
        headingCandidates: [],
        blocks: [],
        tableCount: 0,
        listCount: 0,
      },
    ],
    headingTree: [],
    extractionMeta: {},
    languageHints: ['en'],
    sourceAttribution: [],
    createdAt: new Date('2026-03-26T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-03-26T00:00:00.000Z').toISOString(),
    expiresAt: new Date('2026-03-27T00:00:00.000Z').toISOString(),
  };
}

async function createDocumentRecord(
  store: DocumentArtifactStore,
  overrides: Partial<StoredDocumentRecord>
): Promise<void> {
  await store.createDocumentRecord({
    documentId: 'doc-1',
    workflowId: 'wf-1',
    sourceFileId: 'source-1',
    activeArtifactId: null,
    ownerActorId: 'user-1',
    ownerRole: 'User',
    workspaceScope: 'user',
    processingPathway: 'local_extraction',
    requestedPathway: 'local_extraction',
    status: 'processing',
    fileName: 'lecture.txt',
    mimeType: 'text/plain',
    extension: 'txt',
    fileType: 'txt',
    fileSizeBytes: 100,
    sourceStoragePath: 'runtime/source/lecture.txt',
    sourceStorageRelativePath: 'users/user-1/workflows/wf-1/documents/doc-1/source/source-1-lecture.txt',
    sourceSha256: 'sha',
    extractionVersion: '2026.03.layered-runtime-v2',
    extractionStrategy: 'pending',
    extractionMeta: null,
    latestError: null,
    runtimeOperationId: 'op-1',
    ...overrides,
  });
}

test('artifact store blocks stale artifact promotion when the document has already been cancelled', async () => {
  const db = new FakeFirestore();
  const store = new DocumentArtifactStore(db as any);

  await createDocumentRecord(store, {
    status: 'cancelled',
  });

  await assert.rejects(
    () =>
      store.createArtifactRecord({
        payload: buildPayload(),
        relativePath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/manifest.json',
        workspaceRootRelativePath: 'users/user-1/workflows/wf-1/documents/doc-1',
        originalFilePath: 'users/user-1/workflows/wf-1/documents/doc-1/source/source-1-lecture.txt',
        finalExtractedTextPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/clean/final-extracted.txt',
        structuredJsonPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/structured/document.json',
        normalizedMarkdownPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/normalized/document.md',
        pageMapPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/structured/page-map.json',
        ocrBlocksPath: null,
        manifestPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/manifest.json',
      }),
    /DOCUMENT_RUNTIME_STALE_WRITE_BLOCKED/
  );

  assert.equal(db.read(RUNTIME_DOCUMENT_ARTIFACT_COLLECTION, 'artifact-1'), undefined);
});

test('artifact store promotes processing documents to ready only through the guarded transaction path', async () => {
  const db = new FakeFirestore();
  const store = new DocumentArtifactStore(db as any);

  await createDocumentRecord(store, {});
  const record = await store.createArtifactRecord({
    payload: buildPayload(),
    relativePath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/manifest.json',
    workspaceRootRelativePath: 'users/user-1/workflows/wf-1/documents/doc-1',
    originalFilePath: 'users/user-1/workflows/wf-1/documents/doc-1/source/source-1-lecture.txt',
    finalExtractedTextPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/clean/final-extracted.txt',
    structuredJsonPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/structured/document.json',
    normalizedMarkdownPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/normalized/document.md',
    pageMapPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/structured/page-map.json',
    ocrBlocksPath: null,
    manifestPath: 'users/user-1/workflows/wf-1/documents/doc-1/artifacts/artifact-1/manifest.json',
  });

  const storedDocument = db.read(RUNTIME_DOCUMENT_COLLECTION, 'doc-1') as unknown as StoredDocumentRecord;
  assert.equal(record.invalidatedAt, null);
  assert.equal(storedDocument.status, 'ready');
  assert.equal(storedDocument.activeArtifactId, 'artifact-1');
});
