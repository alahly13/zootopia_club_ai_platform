import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { linesToBlocks, buildLanguageHints, createSegmentId, normalizeWhitespace } from './extractionShared.js';
import { NativeExtractionResult, DocumentFileType, DocumentPageSegment } from './types.js';

type PythonWorkerExtractionResponse = {
  native?: Record<string, unknown> | null;
  docling?: Record<string, unknown> | null;
};

type NativeExtractionInput = {
  fileType: DocumentFileType;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  sourcePath: string;
};

function toPageSegments(rawPages: unknown, fallbackKind: DocumentPageSegment['kind']): DocumentPageSegment[] {
  if (!Array.isArray(rawPages)) {
    return [];
  }

  return rawPages
    .map((page, index) => {
      const record = page as Record<string, unknown>;
      const pageNumber =
        typeof record.pageNumber === 'number' && Number.isFinite(record.pageNumber)
          ? record.pageNumber
          : index + 1;
      const text = normalizeWhitespace(String(record.text || ''));
      const fallbackSource =
        fallbackKind === 'ocr'
          ? 'ocr'
          : fallbackKind === 'hybrid'
            ? 'hybrid'
            : 'native';
      const blocks = Array.isArray(record.blocks) ? (record.blocks as DocumentPageSegment['blocks']) : linesToBlocks({
        pageNumber,
        text,
        source: fallbackSource,
      });
      const headingCandidates = Array.isArray(record.headingCandidates)
        ? record.headingCandidates.filter((item): item is string => typeof item === 'string')
        : blocks
            .filter((block) => block.type === 'heading' || block.type === 'title')
            .map((block) => block.text);

      return {
        segmentId: createSegmentId(pageNumber, text, fallbackKind),
        pageNumber,
        label:
          typeof record.label === 'string' && record.label.trim()
            ? record.label.trim()
            : typeof record.unitLabel === 'string' && record.unitLabel.trim()
              ? record.unitLabel.trim()
              : null,
        text,
        kind: fallbackKind,
        headingCandidates,
        blocks,
        tableCount: blocks.filter((block) => block.type === 'table').length,
        listCount: blocks.filter((block) => block.type === 'list_item').length,
      };
    })
    .filter((page) => page.text.length > 0);
}

async function extractPdfText(buffer: Buffer): Promise<DocumentPageSegment[]> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  });

  try {
    const pdf = await loadingTask.promise;
    const pageSegments: DocumentPageSegment[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = normalizeWhitespace(
        content.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' ')
      );
      const blocks = linesToBlocks({
        pageNumber,
        text: pageText,
        source: 'native',
      });

      pageSegments.push({
        segmentId: createSegmentId(pageNumber, pageText, 'native'),
        pageNumber,
        label: `Page ${pageNumber}`,
        text: pageText,
        kind: 'native',
        headingCandidates: blocks
          .filter((block) => block.type === 'heading' || block.type === 'title')
          .map((block) => block.text),
        blocks,
        tableCount: blocks.filter((block) => block.type === 'table').length,
        listCount: blocks.filter((block) => block.type === 'list_item').length,
      });
    }

    return pageSegments;
  } finally {
    const destroyResult = (loadingTask as { destroy?: () => unknown }).destroy?.();
    if (destroyResult && typeof (destroyResult as Promise<unknown>).then === 'function') {
      await destroyResult;
    }
  }
}

async function extractDocxText(buffer: Buffer): Promise<DocumentPageSegment[]> {
  const result = await mammoth.extractRawText({ buffer });
  const text = normalizeWhitespace(result.value);
  const blocks = linesToBlocks({
    pageNumber: 1,
    text,
    source: 'native',
  });

  return [{
    segmentId: createSegmentId(1, text, 'native'),
    pageNumber: 1,
    label: 'Section 1',
    text,
    kind: 'native',
    headingCandidates: blocks
      .filter((block) => block.type === 'heading' || block.type === 'title')
      .map((block) => block.text),
    blocks,
    tableCount: blocks.filter((block) => block.type === 'table').length,
    listCount: blocks.filter((block) => block.type === 'list_item').length,
  }];
}

function extractSpreadsheetText(buffer: Buffer): DocumentPageSegment[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  return workbook.SheetNames.map((sheetName, index) => {
    const text = normalizeWhitespace(`Sheet: ${sheetName}\n${XLSX.utils.sheet_to_txt(workbook.Sheets[sheetName])}`);
    const blocks = linesToBlocks({
      pageNumber: index + 1,
      text,
      source: 'native',
    });

    return {
      segmentId: createSegmentId(index + 1, text, 'native'),
      pageNumber: index + 1,
      label: `Sheet ${index}: ${sheetName}`,
      text,
      kind: 'native' as const,
      headingCandidates: [sheetName],
      blocks,
      tableCount: blocks.filter((block) => block.type === 'table').length,
      listCount: blocks.filter((block) => block.type === 'list_item').length,
    };
  });
}

function extractPlainText(buffer: Buffer): DocumentPageSegment[] {
  const text = normalizeWhitespace(buffer.toString('utf8'));
  const blocks = linesToBlocks({
    pageNumber: 1,
    text,
    source: 'text',
  });

  return [{
    segmentId: createSegmentId(1, text, 'native'),
    pageNumber: 1,
    label: 'Section 1',
    text,
    kind: 'native',
    headingCandidates: blocks
      .filter((block) => block.type === 'heading' || block.type === 'title')
      .map((block) => block.text),
    blocks,
    tableCount: blocks.filter((block) => block.type === 'table').length,
    listCount: blocks.filter((block) => block.type === 'list_item').length,
  }];
}

function fromPageSegments(
  engine: string,
  pageSegments: DocumentPageSegment[],
  notes: string[] = [],
  raw: Record<string, unknown> | null = null
): NativeExtractionResult {
  const fullText = normalizeWhitespace(pageSegments.map((segment) => segment.text).join('\n\n'));

  return {
    engine,
    pageSegments,
    languageHints: buildLanguageHints(fullText),
    pageCount: pageSegments.length,
    fullText,
    notes,
    tablesDetected: pageSegments.reduce((sum, segment) => sum + segment.tableCount, 0),
    listsDetected: pageSegments.reduce((sum, segment) => sum + segment.listCount, 0),
    raw,
  };
}

export class NativeExtractionService {
  async extract(
    input: NativeExtractionInput,
    pythonResponse?: PythonWorkerExtractionResponse | null
  ): Promise<NativeExtractionResult | null> {
    const pythonPages = toPageSegments(pythonResponse?.native?.pages, 'native');
    if (pythonPages.length > 0) {
      const notes = [
        ...(Array.isArray(pythonResponse?.native?.notes)
          ? pythonResponse?.native?.notes.filter((item): item is string => typeof item === 'string')
          : []),
        ...(Array.isArray(pythonResponse?.native?.warnings)
          ? pythonResponse?.native?.warnings.filter((item): item is string => typeof item === 'string')
          : []),
      ];
      return fromPageSegments(
        String(pythonResponse?.native?.engine || 'python-native'),
        pythonPages,
        notes,
        (pythonResponse?.native as Record<string, unknown>) || null
      );
    }

    if (input.fileType === 'pdf') {
      return fromPageSegments('node:pdfjs-native', await extractPdfText(input.buffer));
    }

    if (input.fileType === 'docx') {
      return fromPageSegments('node:mammoth-fallback', await extractDocxText(input.buffer));
    }

    if (input.fileType === 'xlsx' || input.fileType === 'xls' || input.fileType === 'csv') {
      return fromPageSegments('node:xlsx-fallback', extractSpreadsheetText(input.buffer));
    }

    if (input.fileType === 'txt') {
      return fromPageSegments('node:text-fallback', extractPlainText(input.buffer));
    }

    return null;
  }
}

export const nativeExtractionService = new NativeExtractionService();
