import path from 'path';
import { DOCUMENT_RUNTIME_STORAGE_ROOT } from './config.js';
import { buildActorNamespace } from './actorScope.js';
import { DocumentActorContext } from './types.js';

function sanitizePathPart(value: string, fallback: string): string {
  return String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || fallback;
}

function toRelativePath(absolutePath: string): string {
  return path.relative(DOCUMENT_RUNTIME_STORAGE_ROOT, absolutePath).replace(/\\/g, '/');
}

export interface ResolvedDocumentWorkspacePaths {
  actorRootPath: string;
  workflowRootPath: string;
  documentRootPath: string;
  sourceDirPath: string;
  artifactsDirPath: string;
  relativeDocumentRootPath: string;
}

export interface ResolvedArtifactWorkspacePaths extends ResolvedDocumentWorkspacePaths {
  artifactRootPath: string;
  relativeArtifactRootPath: string;
  cleanTextPath: string;
  normalizedMarkdownPath: string;
  structuredJsonPath: string;
  pageMapPath: string;
  ocrBlocksPath: string;
  manifestPath: string;
}

export class ActorWorkspaceResolver {
  resolveDocumentWorkspace(actor: DocumentActorContext, workflowId: string, documentId: string): ResolvedDocumentWorkspacePaths {
    const actorRootPath = path.join(DOCUMENT_RUNTIME_STORAGE_ROOT, buildActorNamespace(actor));
    const workflowRootPath = path.join(
      actorRootPath,
      'workflows',
      sanitizePathPart(workflowId, 'workflow')
    );
    const documentRootPath = path.join(
      workflowRootPath,
      'documents',
      sanitizePathPart(documentId, 'document')
    );

    return {
      actorRootPath,
      workflowRootPath,
      documentRootPath,
      sourceDirPath: path.join(documentRootPath, 'source'),
      artifactsDirPath: path.join(documentRootPath, 'artifacts'),
      relativeDocumentRootPath: toRelativePath(documentRootPath),
    };
  }

  resolveArtifactWorkspace(
    actor: DocumentActorContext,
    workflowId: string,
    documentId: string,
    artifactId: string
  ): ResolvedArtifactWorkspacePaths {
    const documentWorkspace = this.resolveDocumentWorkspace(actor, workflowId, documentId);
    const artifactRootPath = path.join(
      documentWorkspace.artifactsDirPath,
      sanitizePathPart(artifactId, 'artifact')
    );

    return {
      ...documentWorkspace,
      artifactRootPath,
      relativeArtifactRootPath: toRelativePath(artifactRootPath),
      cleanTextPath: path.join(artifactRootPath, 'clean', 'final-extracted.txt'),
      normalizedMarkdownPath: path.join(artifactRootPath, 'normalized', 'document.md'),
      structuredJsonPath: path.join(artifactRootPath, 'structured', 'document.json'),
      pageMapPath: path.join(artifactRootPath, 'structured', 'page-map.json'),
      ocrBlocksPath: path.join(artifactRootPath, 'structured', 'ocr-blocks.json'),
      manifestPath: path.join(artifactRootPath, 'manifest.json'),
    };
  }

  toRelativePath(absolutePath: string): string {
    return toRelativePath(absolutePath);
  }
}

export const actorWorkspaceResolver = new ActorWorkspaceResolver();
