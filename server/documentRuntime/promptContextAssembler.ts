import {
  DocumentArtifactPayload,
  PromptContextResolutionResult,
  StoredArtifactRecord,
  StoredDocumentRecord,
} from './types.js';

const DEFAULT_TOOL_CHAR_LIMITS: Record<string, number> = {
  analyze: 140000,
  quiz: 120000,
  infographic: 90000,
  chat: 140000,
  summary: 90000,
  flashcards: 90000,
  mindmap: 90000,
  concepts: 90000,
  notes: 90000,
  diagrams: 90000,
};

function clipContext(text: string, limit: number): string {
  return text.startsWith('[IMAGE_DATA:') ? text : text.slice(0, limit);
}

function buildSummary(input: {
  document: StoredDocumentRecord;
  artifact: StoredArtifactRecord;
  payload: DocumentArtifactPayload;
}): string {
  const extractionChain = Array.isArray(input.payload.extractionMeta?.extractorChain)
    ? input.payload.extractionMeta.extractorChain.filter((item): item is string => typeof item === 'string')
    : [];
  return [
    `Document: ${input.document.fileName}`,
    `File type: ${input.payload.fileType}`,
    `Strategy: ${input.artifact.extractionStrategy}`,
    `Pages: ${input.payload.pageSegments.length}`,
    `Languages: ${input.payload.languageHints.join(', ') || 'unknown'}`,
    `Extractors: ${extractionChain.join(' -> ') || 'unknown'}`,
    `Workflow: ${input.document.workflowId}`,
  ].join(' | ');
}

function buildInsights(input: {
  document: StoredDocumentRecord;
  artifact: StoredArtifactRecord;
  payload: DocumentArtifactPayload;
}): string {
  const fallbackChain = Array.isArray(input.payload.extractionMeta?.fallbackChain)
    ? input.payload.extractionMeta.fallbackChain.filter((item): item is string => typeof item === 'string')
    : [];
  return [
    `Sections: ${input.payload.structuredDocumentJson.sections.length}`,
    `Tables: ${input.payload.structuredDocumentJson.tables.length}`,
    `Lists: ${input.payload.structuredDocumentJson.lists.length}`,
    `OCR blocks: ${input.payload.ocrBlocks.length}`,
    `Fallback chain: ${fallbackChain.join(' -> ') || 'none'}`,
    `Actor scope: ${input.document.workspaceScope}/${input.document.ownerActorId}`,
    `Workspace: ${input.artifact.workspaceRootRelativePath}`,
  ].join(' | ');
}

function buildPageMapSummary(payload: DocumentArtifactPayload): string {
  const segmentLabels = new Map(
    payload.pageSegments.map((segment) => [segment.pageNumber, segment.label || `Page ${segment.pageNumber}`])
  );

  return payload.pageMap
    .map((page) => {
      const headings = page.sectionTitles.join(', ') || 'none';
      const sources = page.sourceKinds.join(', ');
      const label = segmentLabels.get(page.pageNumber) || `Page ${page.pageNumber}`;
      return `${label} | headings: ${headings} | chars: ${page.charCount} | sources: ${sources}`;
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

function buildWarningSummary(payload: DocumentArtifactPayload): string | undefined {
  const warnings = Array.isArray(payload.extractionMeta?.warnings)
    ? payload.extractionMeta.warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  if (warnings.length === 0) {
    return undefined;
  }

  return warnings.slice(0, 20).join('\n');
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
        warnings: buildWarningSummary(input.payload),
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
          extractorChain: Array.isArray(input.payload.extractionMeta?.extractorChain)
            ? input.payload.extractionMeta.extractorChain
            : [],
          fallbackChain: Array.isArray(input.payload.extractionMeta?.fallbackChain)
            ? input.payload.extractionMeta.fallbackChain
            : [],
          extractionWarnings: Array.isArray(input.payload.extractionMeta?.warnings)
            ? input.payload.extractionMeta.warnings
            : [],
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
