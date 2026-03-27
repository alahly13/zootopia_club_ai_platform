import {
  DocumentArtifactPayload,
  PromptContextResolutionResult,
  StoredArtifactRecord,
  StoredDocumentRecord,
} from './types.js';

const DEFAULT_TOOL_CHAR_LIMITS: Record<string, number> = {
  analyze: 100000,
  quiz: 80000,
  infographic: 60000,
  chat: 120000,
  summary: 20000,
  flashcards: 20000,
  mindmap: 20000,
  concepts: 20000,
  notes: 20000,
  diagrams: 20000,
};

function clipContext(text: string, limit: number): string {
  return text.startsWith('[IMAGE_DATA:') ? text : text.slice(0, limit);
}

function buildSummary(input: {
  document: StoredDocumentRecord;
  artifact: StoredArtifactRecord;
  payload: DocumentArtifactPayload;
}): string {
  return [
    `Document: ${input.document.fileName}`,
    `File type: ${input.payload.fileType}`,
    `Strategy: ${input.artifact.extractionStrategy}`,
    `Pages: ${input.payload.pageSegments.length}`,
    `Languages: ${input.payload.languageHints.join(', ') || 'unknown'}`,
    `Workflow: ${input.document.workflowId}`,
  ].join(' | ');
}

function buildInsights(input: {
  document: StoredDocumentRecord;
  artifact: StoredArtifactRecord;
  payload: DocumentArtifactPayload;
}): string {
  return [
    `Sections: ${input.payload.structuredDocumentJson.sections.length}`,
    `Tables: ${input.payload.structuredDocumentJson.tables.length}`,
    `Lists: ${input.payload.structuredDocumentJson.lists.length}`,
    `OCR blocks: ${input.payload.ocrBlocks.length}`,
    `Actor scope: ${input.document.workspaceScope}/${input.document.ownerActorId}`,
    `Workspace: ${input.artifact.workspaceRootRelativePath}`,
  ].join(' | ');
}

function buildPageMapSummary(payload: DocumentArtifactPayload): string {
  return payload.pageMap
    .map((page) => {
      const headings = page.sectionTitles.join(', ') || 'none';
      const sources = page.sourceKinds.join(', ');
      return `Page ${page.pageNumber} | headings: ${headings} | chars: ${page.charCount} | sources: ${sources}`;
    })
    .join('\n');
}

function buildHeadingTreeSummary(payload: DocumentArtifactPayload): string {
  return payload.headingTree
    .map((heading) => `${'  '.repeat(Math.max(0, heading.level - 1))}- Page ${heading.pageNumber}: ${heading.title}`)
    .join('\n');
}

function buildOcrSummary(payload: DocumentArtifactPayload): string | undefined {
  if (payload.ocrBlocks.length === 0) {
    return undefined;
  }

  return payload.ocrBlocks
    .slice(0, 80)
    .map((block) => {
      const confidence =
        typeof block.confidence === 'number' && Number.isFinite(block.confidence)
          ? ` | confidence: ${block.confidence.toFixed(2)}`
          : '';
      return `Page ${block.pageNumber} | ${block.text}${confidence}`;
    })
    .join('\n');
}

function buildCondensedStructuredDocument(payload: DocumentArtifactPayload): string {
  return JSON.stringify({
    documentTitle: payload.structuredDocumentJson.documentTitle,
    fileType: payload.structuredDocumentJson.fileType,
    languageHints: payload.structuredDocumentJson.languageHints,
    sections: payload.structuredDocumentJson.sections.map((section) => ({
      id: section.id,
      title: section.title,
      level: section.level,
      pageNumber: section.pageNumber,
      contentPreview: section.content.slice(0, 400),
    })),
    pages: payload.structuredDocumentJson.pages.map((page) => ({
      pageNumber: page.pageNumber,
      headings: page.headings,
      textPreview: page.text.slice(0, 500),
    })),
    metadata: payload.structuredDocumentJson.metadata,
  });
}

export class PromptContextAssembler {
  assemble(input: {
    toolId: string;
    charLimit?: number;
    document: StoredDocumentRecord;
    artifact: StoredArtifactRecord;
    payload: DocumentArtifactPayload;
    mode?: string | null;
  }): Pick<PromptContextResolutionResult, 'fileContext' | 'additionalContext'> {
    const limit = input.charLimit || DEFAULT_TOOL_CHAR_LIMITS[input.toolId] || 60000;
    const baseText =
      input.payload.normalizedMarkdown.trim() ||
      input.payload.normalizedText.trim() ||
      input.payload.fullText;

    return {
      fileContext: clipContext(baseText, limit),
      additionalContext: {
        summary: buildSummary(input),
        insights: buildInsights(input),
        extractedText: input.payload.normalizedText.slice(0, limit),
        extractedMarkdown: input.payload.normalizedMarkdown.slice(0, limit),
        structuredDocument: clipContext(buildCondensedStructuredDocument(input.payload), 24000),
        pageMap: clipContext(buildPageMapSummary(input.payload), 12000),
        headingTree: clipContext(buildHeadingTreeSummary(input.payload), 12000),
        ocr: buildOcrSummary(input.payload),
        metadata: {
          documentId: input.document.documentId,
          workflowId: input.document.workflowId,
          artifactId: input.artifact.artifactId,
          sourceFileId: input.document.sourceFileId,
          fileName: input.document.fileName,
          mimeType: input.document.mimeType,
          fileType: input.payload.fileType,
          processingPathway: input.document.processingPathway,
          extractionStrategy: input.artifact.extractionStrategy,
          extractionVersion: input.artifact.extractionVersion,
          languageHints: input.payload.languageHints,
          pageCount: input.payload.pageSegments.length,
          sectionCount: input.payload.structuredDocumentJson.sections.length,
          tableCount: input.payload.structuredDocumentJson.tables.length,
          listCount: input.payload.structuredDocumentJson.lists.length,
          actorScope: input.document.workspaceScope,
          actorRole: input.document.ownerRole,
          actorId: input.document.ownerActorId,
          artifactPaths: {
            workspaceRootRelativePath: input.artifact.workspaceRootRelativePath,
            finalExtractedTextPath: input.artifact.finalExtractedTextPath,
            normalizedMarkdownPath: input.artifact.normalizedMarkdownPath,
            structuredJsonPath: input.artifact.structuredJsonPath,
            pageMapPath: input.artifact.pageMapPath,
            ocrBlocksPath: input.artifact.ocrBlocksPath,
          },
          requestedMode: input.mode || null,
        },
      },
    };
  }
}

export const promptContextAssembler = new PromptContextAssembler();
