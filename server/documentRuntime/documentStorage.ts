import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DOCUMENT_RUNTIME_STORAGE_ROOT } from './config.js';
import { actorWorkspaceResolver } from './actorWorkspaceResolver.js';
import { DocumentActorContext, DocumentArtifactPayload } from './types.js';

async function ensureDir(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

async function writeJson(targetPath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, JSON.stringify(value, null, 2), 'utf8');
}

async function writeText(targetPath: string, value: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.writeFile(targetPath, value, 'utf8');
}

async function readJson<T>(targetPath: string): Promise<T> {
  const raw = await fs.readFile(targetPath, 'utf8');
  return JSON.parse(raw) as T;
}

type StoredArtifactManifest = Omit<
  DocumentArtifactPayload,
  'fullText' | 'normalizedText' | 'normalizedMarkdown' | 'structuredDocumentJson' | 'pageMap' | 'ocrBlocks'
>;

export class DocumentWorkspaceStorage {
  getDocumentWorkspaceRoot(actor: DocumentActorContext, workflowId: string, documentId: string): string {
    return actorWorkspaceResolver.resolveDocumentWorkspace(actor, workflowId, documentId).documentRootPath;
  }

  async persistSourceFile(input: {
    actor: DocumentActorContext;
    workflowId: string;
    documentId: string;
    fileName: string;
    buffer: Buffer;
  }): Promise<{
    sourceFileId: string;
    absolutePath: string;
    relativePath: string;
    sha256: string;
  }> {
    const workspace = actorWorkspaceResolver.resolveDocumentWorkspace(
      input.actor,
      input.workflowId,
      input.documentId
    );
    await ensureDir(workspace.sourceDirPath);

    const sourceFileId = crypto.randomUUID();
    const storedFileName = `${sourceFileId}-${String(input.fileName || 'upload')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 120) || 'upload'}`;
    const absolutePath = path.join(workspace.sourceDirPath, storedFileName);
    await fs.writeFile(absolutePath, input.buffer);

    return {
      sourceFileId,
      absolutePath,
      relativePath: actorWorkspaceResolver.toRelativePath(absolutePath),
      sha256: crypto.createHash('sha256').update(input.buffer).digest('hex'),
    };
  }

  async persistArtifactPayload(input: {
    actor: DocumentActorContext;
    workflowId: string;
    documentId: string;
    artifactId: string;
    payload: DocumentArtifactPayload;
  }): Promise<{
    absolutePath: string;
    relativePath: string;
    workspaceRootRelativePath: string;
    originalFilePath: string;
    finalExtractedTextPath: string;
    structuredJsonPath: string;
    normalizedMarkdownPath: string;
    pageMapPath: string;
    ocrBlocksPath: string | null;
    manifestPath: string;
  }> {
    const workspace = actorWorkspaceResolver.resolveArtifactWorkspace(
      input.actor,
      input.workflowId,
      input.documentId,
      input.artifactId
    );

    await ensureDir(workspace.artifactRootPath);
    await writeText(workspace.cleanTextPath, input.payload.normalizedText);
    await writeText(workspace.normalizedMarkdownPath, input.payload.normalizedMarkdown);
    await writeJson(workspace.structuredJsonPath, input.payload.structuredDocumentJson);
    await writeJson(workspace.pageMapPath, input.payload.pageMap);

    const hasOcrBlocks = input.payload.ocrBlocks.length > 0;
    if (hasOcrBlocks) {
      await writeJson(workspace.ocrBlocksPath, input.payload.ocrBlocks);
    }

    const {
      fullText: _ignoredFullText,
      normalizedText: _ignoredNormalizedText,
      normalizedMarkdown: _ignoredNormalizedMarkdown,
      structuredDocumentJson: _ignoredStructuredDocumentJson,
      pageMap: _ignoredPageMap,
      ocrBlocks: _ignoredOcrBlocks,
      ...manifestBase
    } = input.payload;

    const manifest: StoredArtifactManifest = {
      ...manifestBase,
      paths: {
        ...input.payload.paths,
        workspaceRootPath: workspace.documentRootPath,
        workspaceRelativeRootPath: workspace.relativeDocumentRootPath,
        originalFilePath: input.payload.paths.originalFilePath,
        finalExtractedTextPath: actorWorkspaceResolver.toRelativePath(workspace.cleanTextPath),
        structuredJsonPath: actorWorkspaceResolver.toRelativePath(workspace.structuredJsonPath),
        normalizedMarkdownPath: actorWorkspaceResolver.toRelativePath(workspace.normalizedMarkdownPath),
        pageMapPath: actorWorkspaceResolver.toRelativePath(workspace.pageMapPath),
        ocrBlocksPath: hasOcrBlocks
          ? actorWorkspaceResolver.toRelativePath(workspace.ocrBlocksPath)
          : null,
        manifestPath: actorWorkspaceResolver.toRelativePath(workspace.manifestPath),
      },
    };

    await writeJson(workspace.manifestPath, manifest);

    return {
      absolutePath: workspace.manifestPath,
      relativePath: actorWorkspaceResolver.toRelativePath(workspace.manifestPath),
      workspaceRootRelativePath: workspace.relativeDocumentRootPath,
      originalFilePath: input.payload.paths.originalFilePath,
      finalExtractedTextPath: actorWorkspaceResolver.toRelativePath(workspace.cleanTextPath),
      structuredJsonPath: actorWorkspaceResolver.toRelativePath(workspace.structuredJsonPath),
      normalizedMarkdownPath: actorWorkspaceResolver.toRelativePath(workspace.normalizedMarkdownPath),
      pageMapPath: actorWorkspaceResolver.toRelativePath(workspace.pageMapPath),
      ocrBlocksPath: hasOcrBlocks
        ? actorWorkspaceResolver.toRelativePath(workspace.ocrBlocksPath)
        : null,
      manifestPath: actorWorkspaceResolver.toRelativePath(workspace.manifestPath),
    };
  }

  async readArtifactPayload(relativePath: string): Promise<DocumentArtifactPayload> {
    const absolutePath = path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, relativePath);
    const manifest = await readJson<StoredArtifactManifest>(absolutePath);

    const normalizedText = await fs.readFile(
      path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, manifest.paths.finalExtractedTextPath),
      'utf8'
    );
    const normalizedMarkdown = await fs.readFile(
      path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, manifest.paths.normalizedMarkdownPath),
      'utf8'
    );
    const structuredDocumentJson = await readJson<DocumentArtifactPayload['structuredDocumentJson']>(
      path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, manifest.paths.structuredJsonPath)
    );
    const pageMap = await readJson<DocumentArtifactPayload['pageMap']>(
      path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, manifest.paths.pageMapPath)
    );
    const ocrBlocks = manifest.paths.ocrBlocksPath
      ? await readJson<DocumentArtifactPayload['ocrBlocks']>(
          path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, manifest.paths.ocrBlocksPath)
        )
      : [];

    return {
      ...manifest,
      fullText: normalizedText,
      normalizedText,
      normalizedMarkdown,
      structuredDocumentJson,
      pageMap,
      ocrBlocks,
    };
  }

  async removeDocumentWorkspace(actor: DocumentActorContext, workflowId: string, documentId: string): Promise<void> {
    const workspaceRoot = this.getDocumentWorkspaceRoot(actor, workflowId, documentId);
    await fs.rm(workspaceRoot, {
      recursive: true,
      force: true,
    });
  }
}

export const documentWorkspaceStorage = new DocumentWorkspaceStorage();
