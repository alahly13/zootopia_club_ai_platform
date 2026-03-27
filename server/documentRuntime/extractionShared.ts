import crypto from 'crypto';
import {
  DocumentHeadingTreeNode,
  DocumentPageMapEntry,
  DocumentPageSegment,
  DocumentStructuredBlock,
  StructuredDocumentPayload,
  StructuredBlockKind,
} from './types.js';

const LIST_MARKER_PATTERN = /^(\*|-|\u2022|\d+[\.\)])\s+/;
const HEADING_PREFIX_PATTERN = /^(\d+(?:\.\d+)*\.?)\s+/;

export function buildLanguageHints(text: string): string[] {
  const normalized = text || '';
  const hints = new Set<string>();
  if (/[A-Za-z]/.test(normalized)) {
    hints.add('en');
  }
  if (/[\u0600-\u06FF]/.test(normalized)) {
    hints.add('ar');
  }
  return Array.from(hints);
}

export function createStableId(seed: string): string {
  return crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

export function createSegmentId(pageNumber: number, text: string, kind: string): string {
  return createStableId(`${kind}:${pageNumber}:${text}`);
}

export function createBlockId(pageNumber: number, order: number, text: string): string {
  return createStableId(`block:${pageNumber}:${order}:${text}`);
}

export function normalizeWhitespace(value: string): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function escapeMarkdown(text: string): string {
  return String(text || '').replace(/\n{3,}/g, '\n\n').trim();
}

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 120) return false;
  if (/^(chapter|section|unit|module|lesson|topic|abstract|introduction|conclusion)\b/i.test(trimmed)) {
    return true;
  }
  if (HEADING_PREFIX_PATTERN.test(trimmed)) {
    return true;
  }
  if (/^[A-Z0-9\s\-:()]{4,}$/.test(trimmed)) {
    return true;
  }
  if (/^[\u0600-\u06FF0-9\s\-:()]{4,}$/.test(trimmed) && trimmed.length <= 80) {
    return true;
  }
  return false;
}

function looksLikeTitleCandidate(line: string, index: number): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (index > 1) return false;
  if (trimmed.length > 100) return false;
  return (
    /^[A-Z][A-Za-z0-9\s\-:()]{4,}$/.test(trimmed) ||
    /^[\u0600-\u06FF][\u0600-\u06FF0-9\s\-:()]{3,}$/.test(trimmed)
  );
}

function looksLikeListItem(line: string): boolean {
  return LIST_MARKER_PATTERN.test(line.trim());
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return trimmed.includes('\t') || /\s{3,}/.test(trimmed) || /\|/.test(trimmed);
}

function inferHeadingMetadata(line: string, index: number): {
  type: Extract<StructuredBlockKind, 'title' | 'heading' | 'subheading'>;
  level: number;
} | null {
  const trimmed = line.trim();
  if (!looksLikeHeading(trimmed)) {
    if (looksLikeTitleCandidate(trimmed, index)) {
      return {
        type: 'title',
        level: 1,
      };
    }
    return null;
  }

  const numberedMatch = trimmed.match(HEADING_PREFIX_PATTERN);
  if (numberedMatch) {
    const depth = numberedMatch[1].replace(/\.$/, '').split('.').length;
    return {
      type: depth <= 1 ? 'heading' : 'subheading',
      level: Math.min(6, depth + 1),
    };
  }

  if (looksLikeTitleCandidate(trimmed, index)) {
    return {
      type: 'title',
      level: 1,
    };
  }

  return {
    type: /^[A-Z0-9\s\-:()]{4,}$/.test(trimmed) ? 'heading' : 'subheading',
    level: /^[A-Z0-9\s\-:()]{4,}$/.test(trimmed) ? 2 : 3,
  };
}

function normalizeTableCells(line: string): string[] {
  return line
    .split(/\s{3,}|\t|\|/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER_PATTERN, '').trim();
}

function renderBlockPlainText(block: DocumentStructuredBlock): string {
  if (block.type === 'list_item') {
    return `- ${stripListMarker(block.text)}`;
  }

  if (block.type === 'table') {
    const rows = (block.rows || [[block.text]])
      .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
      .filter((row) => row.length > 0);
    if (rows.length === 0) {
      return block.text;
    }
    return rows.map((row) => row.join(' | ')).join('\n');
  }

  if (block.type === 'ocr_block') {
    return `OCR: ${block.text}`;
  }

  if (block.type === 'note') {
    return `Note: ${block.text}`;
  }

  return block.text.trim();
}

function renderTableMarkdown(rows: string[][] | null, fallbackText: string): string[] {
  const normalizedRows = (rows || [])
    .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 0);

  if (normalizedRows.length === 0) {
    const fallbackCells = normalizeTableCells(fallbackText);
    if (fallbackCells.length === 0) {
      return [fallbackText];
    }
    normalizedRows.push(fallbackCells);
  }

  const columnCount = Math.max(...normalizedRows.map((row) => row.length));
  const paddedRows = normalizedRows.map((row) => {
    const cells = [...row];
    while (cells.length < columnCount) {
      cells.push('');
    }
    return cells;
  });

  const header = paddedRows[0];
  const separator = new Array(columnCount).fill('---');
  const bodyRows = paddedRows.slice(1);

  return [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

export function linesToBlocks(input: {
  pageNumber: number;
  text: string;
  source: DocumentStructuredBlock['source'];
  startingOrder?: number;
}): DocumentStructuredBlock[] {
  const lines = normalizeWhitespace(input.text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    const heading = inferHeadingMetadata(line, index);
    let type: StructuredBlockKind = 'paragraph';
    let level: number | null = null;
    let rows: string[][] | null = null;

    if (heading) {
      type = heading.type;
      level = heading.level;
    } else if (looksLikeListItem(line)) {
      type = 'list_item';
    } else if (looksLikeTableRow(line)) {
      type = 'table';
      rows = [normalizeTableCells(line)];
    }

    return {
      blockId: createBlockId(input.pageNumber, (input.startingOrder || 0) + index + 1, line),
      type,
      source: input.source,
      text: line,
      pageNumber: input.pageNumber,
      order: (input.startingOrder || 0) + index + 1,
      level,
      rows,
      notes: null,
    };
  });
}

function headingLevelForBlock(block: DocumentStructuredBlock): number {
  if (block.type === 'title') {
    return 1;
  }
  if (block.type === 'subheading') {
    return block.level || 3;
  }
  return block.level || 2;
}

function collectSectionPreview(blocks: DocumentStructuredBlock[], startIndex: number): string {
  const previewParts: string[] = [];

  for (let index = startIndex + 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (block.type === 'title' || block.type === 'heading' || block.type === 'subheading') {
      break;
    }

    const text = renderBlockPlainText(block);
    if (!text) continue;
    previewParts.push(text);

    if (previewParts.join(' ').length >= 180) {
      break;
    }
  }

  return normalizeWhitespace(previewParts.join(' ')).slice(0, 180);
}

export function buildHeadingTree(pageSegments: DocumentPageSegment[]): DocumentHeadingTreeNode[] {
  const nodes: DocumentHeadingTreeNode[] = [];
  const stack: Array<{ id: string; level: number }> = [];

  const orderedSegments = [...pageSegments].sort((left, right) => left.pageNumber - right.pageNumber);

  for (const segment of orderedSegments) {
    const orderedBlocks = [...segment.blocks].sort((left, right) => left.order - right.order);

    for (let index = 0; index < orderedBlocks.length; index += 1) {
      const block = orderedBlocks[index];
      if (block.type !== 'title' && block.type !== 'heading' && block.type !== 'subheading') {
        continue;
      }

      const level = headingLevelForBlock(block);
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const id = createStableId(`heading:${segment.pageNumber}:${block.order}:${block.text}`);
      const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;

      nodes.push({
        id,
        title: block.text,
        level,
        pageNumber: segment.pageNumber,
        parentId,
        blockId: block.blockId,
        contentPreview: collectSectionPreview(orderedBlocks, index),
      });

      stack.push({ id, level });
    }
  }

  return nodes;
}

export function buildPageMap(
  pageSegments: DocumentPageSegment[],
  headingTree: DocumentHeadingTreeNode[]
): DocumentPageMapEntry[] {
  return pageSegments.map((segment) => ({
    pageNumber: segment.pageNumber,
    segmentIds: [segment.segmentId],
    sectionTitles: Array.from(new Set(segment.headingCandidates.filter(Boolean))),
    headingIds: headingTree
      .filter((heading) => heading.pageNumber === segment.pageNumber)
      .map((heading) => heading.id),
    sourceKinds: [segment.kind],
    charCount: segment.text.length,
  }));
}

export function buildDocumentSections(input: {
  pageSegments: DocumentPageSegment[];
  headingTree: DocumentHeadingTreeNode[];
}): StructuredDocumentPayload['sections'] {
  const sections: StructuredDocumentPayload['sections'] = [];
  const orderedSegments = [...input.pageSegments].sort((left, right) => left.pageNumber - right.pageNumber);
  let activeSection: {
    id: string;
    title: string;
    level: number;
    pageNumber: number;
    content: string[];
    implicit: boolean;
  } | null = null;

  const flushActiveSection = () => {
    if (!activeSection) return;
    const content = normalizeWhitespace(activeSection.content.join('\n\n'));
    if (!content) {
      activeSection = null;
      return;
    }
    sections.push({
      id: activeSection.id,
      title: activeSection.title,
      level: activeSection.level,
      pageNumber: activeSection.pageNumber,
      content,
    });
    activeSection = null;
  };

  for (const segment of orderedSegments) {
    if (activeSection?.implicit && activeSection.pageNumber !== segment.pageNumber) {
      flushActiveSection();
    }

    const orderedBlocks = [...segment.blocks].sort((left, right) => left.order - right.order);

    for (const block of orderedBlocks) {
      if (block.type === 'title' || block.type === 'heading' || block.type === 'subheading') {
        flushActiveSection();
        activeSection = {
          id: createStableId(`section:${segment.pageNumber}:${block.order}:${block.text}`),
          title: block.text,
          level: headingLevelForBlock(block),
          pageNumber: segment.pageNumber,
          content: [],
          implicit: false,
        };
        continue;
      }

      const text = renderBlockPlainText(block);
      if (!text) continue;

      if (!activeSection) {
        activeSection = {
          id: createStableId(`section:${segment.pageNumber}:overview`),
          title: `Page ${segment.pageNumber} Overview`,
          level: 2,
          pageNumber: segment.pageNumber,
          content: [],
          implicit: true,
        };
      }

      activeSection.content.push(text);
    }
  }

  flushActiveSection();

  return sections;
}

export function buildNormalizedMarkdown(input: {
  fileName: string;
  fileType: string;
  extractionStrategy: string;
  languageHints: string[];
  pageSegments: DocumentPageSegment[];
  headingTree: DocumentHeadingTreeNode[];
  sections?: StructuredDocumentPayload['sections'];
  ocrNotes?: string[];
}): string {
  const lines: string[] = [];
  const sections = input.sections || buildDocumentSections({
    pageSegments: input.pageSegments,
    headingTree: input.headingTree,
  });

  lines.push(`# ${input.fileName}`);
  lines.push('');
  lines.push('## Source Metadata');
  lines.push(`- File type: ${input.fileType}`);
  lines.push(`- Extraction strategy: ${input.extractionStrategy}`);
  lines.push(`- Language hints: ${input.languageHints.join(', ') || 'unknown'}`);
  lines.push(`- Total pages: ${input.pageSegments.length}`);
  lines.push(`- Detected sections: ${sections.length}`);
  lines.push('');

  if (input.headingTree.length > 0) {
    lines.push('## Structural Overview');
    for (const heading of input.headingTree) {
      lines.push(`- Page ${heading.pageNumber} | L${heading.level} | ${heading.title}`);
    }
    lines.push('');
  }

  lines.push('## Reconstructed Document');
  lines.push('');

  for (const segment of input.pageSegments) {
    lines.push(`### Page ${segment.pageNumber}`);
    lines.push('');

    const orderedBlocks = [...segment.blocks].sort((left, right) => left.order - right.order);
    if (orderedBlocks.length === 0 && segment.text.trim()) {
      lines.push(segment.text.trim());
      lines.push('');
      continue;
    }

    for (const block of orderedBlocks) {
      const text = block.text.trim();
      if (!text) continue;

      if (block.type === 'title') {
        lines.push(`#### ${escapeMarkdown(text)}`);
        lines.push('');
        continue;
      }

      if (block.type === 'heading') {
        lines.push(`#### ${escapeMarkdown(text)}`);
        lines.push('');
        continue;
      }

      if (block.type === 'subheading') {
        lines.push(`##### ${escapeMarkdown(text)}`);
        lines.push('');
        continue;
      }

      if (block.type === 'list_item') {
        lines.push(`- ${escapeMarkdown(stripListMarker(text))}`);
        continue;
      }

      if (block.type === 'table') {
        for (const rowLine of renderTableMarkdown(block.rows || null, text)) {
          lines.push(rowLine);
        }
        lines.push('');
        continue;
      }

      if (block.type === 'ocr_block') {
        lines.push(`> OCR: ${escapeMarkdown(text)}`);
        lines.push('');
        continue;
      }

      if (block.type === 'note') {
        lines.push(`> Note: ${escapeMarkdown(text)}`);
        lines.push('');
        continue;
      }

      lines.push(escapeMarkdown(text));
      lines.push('');
    }
  }

  if (input.ocrNotes && input.ocrNotes.length > 0) {
    lines.push('## OCR / Extraction Notes');
    for (const note of input.ocrNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  return normalizeWhitespace(lines.join('\n'));
}

export function buildStructuredDocumentPayload(input: {
  fileName: string;
  fileType: string;
  languageHints: string[];
  pageSegments: DocumentPageSegment[];
  headingTree: DocumentHeadingTreeNode[];
  extractionMeta: Record<string, unknown>;
}): StructuredDocumentPayload {
  const normalizeStructuredSource = (
    source: DocumentStructuredBlock['source'] | DocumentPageSegment['kind']
  ) => {
    if (source === 'ocr' || source === 'image-marker' || source === 'image_payload') {
      return 'ocr' as const;
    }
    if (source === 'hybrid') {
      return 'hybrid' as const;
    }
    return 'native' as const;
  };

  const sections = buildDocumentSections({
    pageSegments: input.pageSegments,
    headingTree: input.headingTree,
  });
  const tableCount = input.pageSegments.reduce((sum, segment) => sum + segment.tableCount, 0);
  const listCount = input.pageSegments.reduce((sum, segment) => sum + segment.listCount, 0);

  return {
    documentTitle: input.fileName,
    fileType: input.fileType as StructuredDocumentPayload['fileType'],
    languageHints: input.languageHints,
    pages: input.pageSegments.map((segment) => ({
      pageNumber: segment.pageNumber,
      headings: segment.headingCandidates,
      text: segment.text,
      blocks: segment.blocks,
    })),
    sections,
    headingTree: input.headingTree,
    tables: input.pageSegments.flatMap((segment) =>
      segment.blocks
        .filter((block) => block.type === 'table')
        .map((block) => ({
          pageNumber: segment.pageNumber,
          rows: block.rows || [normalizeTableCells(block.text)],
          source: normalizeStructuredSource(block.source),
        }))
    ),
    lists: input.pageSegments.flatMap((segment) => {
      const listItems = segment.blocks
        .filter((block) => block.type === 'list_item')
        .map((block) => stripListMarker(block.text))
        .filter(Boolean);

      return listItems.length > 0
        ? [{
            pageNumber: segment.pageNumber,
            items: listItems,
            source: normalizeStructuredSource(segment.kind),
          }]
        : [];
    }),
    metadata: {
      ...input.extractionMeta,
      sourceMetadata: {
        fileName: input.fileName,
        fileType: input.fileType,
        pageCount: input.pageSegments.length,
        headingCount: input.headingTree.length,
        sectionCount: sections.length,
        tableCount,
        listCount,
        languageHints: input.languageHints,
      },
    },
  };
}
