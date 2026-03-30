import crypto from 'crypto';
import { logDiagnostic } from '../diagnostics.js';
import { actorWorkspaceResolver } from './actorWorkspaceResolver.js';
import { DOCUMENT_EXTRACTION_VERSION, DOCUMENT_RUNTIME_ARTIFACT_TTL_SEC } from './config.js';
import { datalabConvertService } from './datalabConvertService.js';
import {
  buildDocumentSections,
  buildHeadingTree,
  buildLanguageHints,
  buildPageMap,
  buildStructuredDocumentPayload,
  createBlockId,
  createSegmentId,
  normalizeWhitespace,
} from './extractionShared.js';
import { fileTypeDetectionService } from './fileTypeDetectionService.js';
import {
  DocumentActorContext,
  DocumentArtifactPayload,
  DocumentOperationState,
  DocumentPageSegment,
  DocumentStructuredBlock,
  ExtractedArtifactEnvelope,
} from './types.js';

type ExtractionCoordinatorInput = {
  actor: DocumentActorContext;
  workflowId: string;
  documentId: string;
  sourceFileId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  sourcePath: string;
  sourceRelativePath: string;
  reportStage?: (input: {
    stage: Extract<
      DocumentOperationState['stage'],
      'submitting_to_datalab' | 'waiting_for_datalab' | 'finalizing_extraction'
    >;
    message: string;
  }) => Promise<void> | void;
};

const PAGE_DELIMITER_PATTERN = /^\{(\d+)\}-{16,}\s*$/gm;
const SINGLE_PAGE_DELIMITER_PATTERN = /^\{(\d+)\}-{16,}\s*$/;
const TABLE_SEPARATOR_PATTERN = /^\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/;
const LIST_ITEM_PATTERN = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;

function normalizeMarkdown(value: string): string {
  return String(value || '')
    .replace(/\r/g, '')
    .trim();
}

function maybeRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stripInlineMarkdown(text: string): string {
  return normalizeWhitespace(
    String(text || '')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~]/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\\([\\`*_{}\[\]()#+\-.!])/g, '$1')
  );
}

function parseTableRows(lines: string[]): string[][] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !TABLE_SEPARATOR_PATTERN.test(line))
    .map((line) =>
      line
        .split('|')
        .map((cell) => stripInlineMarkdown(cell))
        .filter(Boolean)
    )
    .filter((row) => row.length > 0);
}

function blockText(block: DocumentStructuredBlock): string {
  if (block.type === 'list_item') {
    return block.text;
  }

  if (block.type === 'table') {
    return (block.rows || [])
      .map((row) => row.join(' | '))
      .filter(Boolean)
      .join('\n');
  }

  if (block.type === 'note') {
    return `Note: ${block.text}`;
  }

  return block.text;
}

function blocksFromMarkdownPage(
  pageNumber: number,
  markdown: string,
  fileType: string
): DocumentStructuredBlock[] {
  const lines = markdown.split('\n');
  const blocks: DocumentStructuredBlock[] = [];
  const defaultSource: DocumentStructuredBlock['source'] = fileType === 'image' ? 'ocr' : 'text';
  let order = 1;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed || SINGLE_PAGE_DELIMITER_PATTERN.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        const codeLine = stripInlineMarkdown(lines[index]);
        if (codeLine) {
          codeLines.push(codeLine);
        }
        index += 1;
      }

      const codeText = normalizeWhitespace(codeLines.join('\n'));
      if (codeText) {
        blocks.push({
          blockId: createBlockId(pageNumber, order, codeText),
          type: 'paragraph',
          source: defaultSource,
          text: codeText,
          pageNumber,
          order,
          level: null,
          rows: null,
          notes: null,
        });
        order += 1;
      }
      continue;
    }

    if (trimmed.includes('|')) {
      const tableLines = [trimmed];
      while (index + 1 < lines.length && lines[index + 1].trim().includes('|')) {
        tableLines.push(lines[index + 1].trim());
        index += 1;
      }

      const rows = parseTableRows(tableLines);
      if (rows.length > 0) {
        const tableText = rows.map((row) => row.join(' | ')).join('\n');
        blocks.push({
          blockId: createBlockId(pageNumber, order, tableText),
          type: 'table',
          source: defaultSource,
          text: tableText,
          pageNumber,
          order,
          level: null,
          rows,
          notes: null,
        });
        order += 1;
        continue;
      }
    }

    const headingMatch = trimmed.match(HEADING_PATTERN);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const headingText = stripInlineMarkdown(headingMatch[2]);
      if (headingText) {
        blocks.push({
          blockId: createBlockId(pageNumber, order, headingText),
          type: depth <= 1 ? 'title' : depth === 2 ? 'heading' : 'subheading',
          source: defaultSource,
          text: headingText,
          pageNumber,
          order,
          level: Math.min(6, depth),
          rows: null,
          notes: null,
        });
        order += 1;
      }
      continue;
    }

    if (LIST_ITEM_PATTERN.test(trimmed)) {
      const listText = stripInlineMarkdown(trimmed.replace(LIST_ITEM_PATTERN, ''));
      if (listText) {
        blocks.push({
          blockId: createBlockId(pageNumber, order, listText),
          type: 'list_item',
          source: defaultSource,
          text: `- ${listText}`,
          pageNumber,
          order,
          level: null,
          rows: null,
          notes: null,
        });
        order += 1;
      }
      continue;
    }

    if (trimmed.startsWith('>')) {
      const noteText = stripInlineMarkdown(trimmed.replace(/^>\s?/, ''));
      if (noteText) {
        blocks.push({
          blockId: createBlockId(pageNumber, order, noteText),
          type: 'note',
          source: defaultSource,
          text: noteText,
          pageNumber,
          order,
          level: null,
          rows: null,
          notes: null,
        });
        order += 1;
      }
      continue;
    }

    const paragraphText = stripInlineMarkdown(trimmed);
    if (!paragraphText) {
      continue;
    }

    blocks.push({
      blockId: createBlockId(pageNumber, order, paragraphText),
      type: 'paragraph',
      source: defaultSource,
      text: paragraphText,
      pageNumber,
      order,
      level: null,
      rows: null,
      notes: null,
    });
    order += 1;
  }

  return blocks;
}

function splitMarkdownPages(markdown: string): Array<{ pageNumber: number; markdown: string }> {
  const normalized = normalizeMarkdown(markdown);
  if (!normalized) {
    return [];
  }

  const matches = Array.from(normalized.matchAll(PAGE_DELIMITER_PATTERN));
  if (matches.length === 0) {
    return [{ pageNumber: 1, markdown: normalized }];
  }

  const pages = matches
    .map((match, index) => {
      const start = (match.index || 0) + match[0].length;
      const end = index + 1 < matches.length ? (matches[index + 1].index || normalized.length) : normalized.length;
      const pageNumber = Number.parseInt(match[1], 10);
      return {
        pageNumber: Number.isFinite(pageNumber) ? pageNumber + 1 : index + 1,
        markdown: normalized.slice(start, end).trim(),
      };
    })
    .filter((page) => page.markdown.length > 0);

  return pages.length > 0 ? pages : [{ pageNumber: 1, markdown: normalized.replace(PAGE_DELIMITER_PATTERN, '').trim() }];
}

function buildPageSegments(input: {
  fileType: string;
  markdown: string;
}): DocumentPageSegment[] {
  const defaultKind: DocumentPageSegment['kind'] = input.fileType === 'image' ? 'ocr' : 'native';

  return splitMarkdownPages(input.markdown)
    .map((page) => {
      const blocks = blocksFromMarkdownPage(page.pageNumber, page.markdown, input.fileType);
      const text = normalizeWhitespace(blocks.map((block) => blockText(block)).join('\n'));
      if (!text) {
        return null;
      }

      const headingCandidates = blocks
        .filter((block) => block.type === 'title' || block.type === 'heading' || block.type === 'subheading')
        .map((block) => block.text);

      return {
        segmentId: createSegmentId(page.pageNumber, text, defaultKind),
        pageNumber: page.pageNumber,
        label: `Page ${page.pageNumber}`,
        text,
        kind: defaultKind,
        headingCandidates,
        blocks,
        tableCount: blocks.filter((block) => block.type === 'table').length,
        listCount: blocks.filter((block) => block.type === 'list_item').length,
      } satisfies DocumentPageSegment;
    })
    .filter(Boolean) as DocumentPageSegment[];
}

/**
 * Datalab-backed extraction coordinator.
 *
 * Keep this backend-authoritative and single-engine per intake job. The
 * runtime selector in `extractionEngine.ts` chooses between this coordinator
 * and the isolated legacy path so upload requests never fan out into multiple
 * competing extractors.
 */
export class ExtractionCoordinator {
  async extract(input: ExtractionCoordinatorInput): Promise<ExtractedArtifactEnvelope> {
    const strategy = await fileTypeDetectionService.resolveStrategy({
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });
    const extractionTraceId = `${input.documentId}:${Date.now()}`;

    logDiagnostic('info', 'document_runtime.file_type_detected', {
      area: 'document-runtime',
      traceId: extractionTraceId,
      stage: 'detect',
      details: {
        documentId: input.documentId,
        workflowId: input.workflowId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileType: strategy.detection.fileType,
        confidence: strategy.detection.confidence,
        strategyId: strategy.strategyId,
        detectionHints: strategy.detection.hints,
      },
    });

    const convertResult = await datalabConvertService.convert({
      documentId: input.documentId,
      workflowId: input.workflowId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer: input.buffer,
      reportStage: input.reportStage,
    });

    const pageSegments = buildPageSegments({
      fileType: strategy.detection.fileType,
      markdown: convertResult.markdown,
    });
    const normalizedText = normalizeWhitespace(pageSegments.map((segment) => segment.text).join('\n\n'));

    if (!normalizedText) {
      throw Object.assign(new Error('No extractable text found in file.'), {
        code: 'DATALAB_EMPTY_TEXT',
        operationStage: 'finalizing_extraction' as const,
        retryable: true,
      });
    }

    const artifactId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + DOCUMENT_RUNTIME_ARTIFACT_TTL_SEC * 1000).toISOString();
    const artifactWorkspace = actorWorkspaceResolver.resolveArtifactWorkspace(
      input.actor,
      input.workflowId,
      input.documentId,
      artifactId
    );

    const headingTree = buildHeadingTree(pageSegments);
    const sections = buildDocumentSections({
      pageSegments,
      headingTree,
    });
    const languageHints = buildLanguageHints(normalizedText || convertResult.markdown);
    const extractionDetails = maybeRecord(convertResult.raw);
    const metadata = maybeRecord(extractionDetails?.metadata);
    const qualityMetadata = maybeRecord(metadata?.quality_metadata);
    const ocrUsed =
      strategy.detection.fileType === 'image' ||
      qualityMetadata?.ocr_detected === true ||
      qualityMetadata?.ocrDetected === true;
    const pageMap = buildPageMap(pageSegments, headingTree);
    const warnings = convertResult.warnings;

    const payload: DocumentArtifactPayload = {
      artifactId,
      documentId: input.documentId,
      workflowId: input.workflowId,
      sourceFileId: input.sourceFileId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
      ownerActorId: input.actor.actorId,
      ownerRole: input.actor.actorRole,
      workspaceScope: input.actor.scope,
      extractionVersion: DOCUMENT_EXTRACTION_VERSION,
      extractionStrategy: strategy.strategyId,
      processingPathway: 'local_extraction',
      status: 'ready',
      fileType: strategy.detection.fileType,
      sourceFileName: input.fileName,
      sourceMimeType: input.mimeType,
      paths: {
        workspaceRootPath: artifactWorkspace.documentRootPath,
        workspaceRelativeRootPath: artifactWorkspace.relativeDocumentRootPath,
        originalFilePath: input.sourceRelativePath,
        finalExtractedTextPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.cleanTextPath),
        structuredJsonPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.structuredJsonPath),
        normalizedMarkdownPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.normalizedMarkdownPath),
        pageMapPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.pageMapPath),
        ocrBlocksPath: null,
        manifestPath: actorWorkspaceResolver.toRelativePath(artifactWorkspace.manifestPath),
      },
      fullText: normalizedText,
      normalizedText,
      normalizedMarkdown: normalizeMarkdown(convertResult.markdown),
      structuredDocumentJson: buildStructuredDocumentPayload({
        fileName: input.fileName,
        fileType: strategy.detection.fileType,
        languageHints,
        pageSegments,
        headingTree,
        extractionMeta: {
          extractedAt: nowIso,
          detection: strategy.detection,
          strategyReason: strategy.reason,
          provider: 'datalab-convert',
          requestId: convertResult.requestId,
          requestCheckUrl: convertResult.requestCheckUrl,
          warnings,
          extractorChain: ['datalab:convert'],
          fallbackChain: [`strategy:${strategy.strategyId}`, 'engine:datalab-convert'],
          qualitySignals: {
            pageCount: pageSegments.length,
            sectionCount: sections.length,
            textLength: normalizedText.length,
            ocrUsed,
          },
          datalab: {
            metadata,
            versions: convertResult.versions,
          },
        },
      }),
      pageMap,
      ocrBlocks: [],
      pageSegments,
      headingTree,
      extractionMeta: {
        extractedAt: nowIso,
        detection: strategy.detection,
        strategyReason: strategy.reason,
        provider: 'datalab-convert',
        requestId: convertResult.requestId,
        requestCheckUrl: convertResult.requestCheckUrl,
        warnings,
        extractorChain: ['datalab:convert'],
        fallbackChain: [`strategy:${strategy.strategyId}`, 'engine:datalab-convert'],
        qualitySignals: {
          pageCount: pageSegments.length,
          sectionCount: sections.length,
          textLength: normalizedText.length,
          ocrUsed,
        },
        datalab: {
          metadata,
          versions: convertResult.versions,
          rawStatus: extractionDetails?.status || 'complete',
        },
      },
      languageHints,
      sourceAttribution: pageSegments.map((segment) => ({
        pageNumber: segment.pageNumber,
        source: segment.kind === 'ocr' ? 'ocr' : 'text',
        label: `page-${segment.pageNumber}-datalab-markdown`,
      })),
      createdAt: nowIso,
      updatedAt: nowIso,
      expiresAt,
    };

    logDiagnostic('info', 'document_runtime.extraction_completed', {
      area: 'document-runtime',
      traceId: extractionTraceId,
      stage: 'extract',
      status: 'success',
      details: {
        documentId: input.documentId,
        workflowId: input.workflowId,
        fileName: input.fileName,
        fileType: payload.fileType,
        strategyId: strategy.strategyId,
        provider: 'datalab-convert',
        requestId: convertResult.requestId,
        pageCount: payload.pageSegments.length,
        sectionCount: payload.structuredDocumentJson.sections.length,
        textLength: payload.normalizedText.length,
        warnings,
      },
    });

    return {
      payload,
      textLength: payload.normalizedText.length,
    };
  }
}

export const extractionCoordinator = new ExtractionCoordinator();
