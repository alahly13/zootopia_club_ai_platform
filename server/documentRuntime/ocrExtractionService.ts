import { buildLanguageHints, createSegmentId, linesToBlocks, normalizeWhitespace } from './extractionShared.js';
import {
  DocumentFileType,
  DocumentPageSegment,
  DocumentStructuredBlock,
  OcrExtractionResult,
} from './types.js';
import { DOCUMENT_RUNTIME_REQUIRE_PYTHON_OCR } from './config.js';

type PythonWorkerExtractionResponse = {
  ocr?: Record<string, unknown> | null;
  docling?: Record<string, unknown> | null;
  capabilities?: {
    ocrReady?: boolean;
    reasons?: string[];
  } | null;
  errors?: string[];
};

type OcrExtractionInput = {
  fileType: DocumentFileType;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  sourcePath: string;
};

function normalizeBlocks(value: unknown, pageNumber = 1): DocumentStructuredBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const blocks: DocumentStructuredBlock[] = [];

  value.forEach((item, index) => {
    const record = item as Record<string, unknown>;
    const text = normalizeWhitespace(String(record.text || ''));
    if (!text) {
      return;
    }

    blocks.push({
      blockId: String(record.blockId || `ocr-${pageNumber}-${index + 1}`),
      type: (record.type as DocumentStructuredBlock['type']) || 'ocr_block',
      source: (record.source as DocumentStructuredBlock['source']) || 'ocr',
      text,
      pageNumber:
        typeof record.pageNumber === 'number' && Number.isFinite(record.pageNumber)
          ? record.pageNumber
          : pageNumber,
      order:
        typeof record.order === 'number' && Number.isFinite(record.order)
          ? record.order
          : index + 1,
      level:
        typeof record.level === 'number' && Number.isFinite(record.level)
          ? record.level
          : null,
      confidence:
        typeof record.confidence === 'number' && Number.isFinite(record.confidence)
          ? record.confidence
          : null,
      bbox: (record.bbox as DocumentStructuredBlock['bbox']) || null,
      rows: Array.isArray(record.rows) ? (record.rows as string[][]) : null,
      notes: Array.isArray(record.notes)
        ? record.notes.filter((note): note is string => typeof note === 'string')
        : null,
    });
  });

  return blocks;
}

function pagesFromPython(rawPages: unknown): DocumentPageSegment[] {
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
      const blocks = normalizeBlocks(record.blocks, pageNumber);
      const headingCandidates = Array.isArray(record.headingCandidates)
        ? record.headingCandidates.filter((item): item is string => typeof item === 'string')
        : blocks
            .filter((block) => block.type === 'heading' || block.type === 'title')
            .map((block) => block.text);

      return {
        segmentId: createSegmentId(pageNumber, text, 'ocr'),
        pageNumber,
        text,
        kind: 'ocr' as const,
        headingCandidates,
        blocks: blocks.length > 0 ? blocks : linesToBlocks({
          pageNumber,
          text,
          source: 'ocr',
        }),
        tableCount: blocks.filter((block) => block.type === 'table').length,
        listCount: blocks.filter((block) => block.type === 'list_item').length,
      };
    })
    .filter((segment) => segment.text.length > 0);
}

function fromPages(
  engine: string,
  pageSegments: DocumentPageSegment[],
  ocrBlocks: DocumentStructuredBlock[],
  notes: string[] = []
): OcrExtractionResult {
  const fullText = normalizeWhitespace(pageSegments.map((segment) => segment.text).join('\n\n'));

  return {
    engine,
    pageSegments,
    ocrBlocks,
    languageHints: buildLanguageHints(fullText),
    pageCount: pageSegments.length,
    fullText,
    notes,
  };
}

function createImageMarker(fileName: string, mimeType: string, buffer: Buffer): OcrExtractionResult {
  const safeMimeType = mimeType || 'image/png';
  const marker = `[IMAGE_DATA:${safeMimeType};base64,${buffer.toString('base64')}]`;
  const blocks = [{
    blockId: `image-marker-${fileName}`,
    type: 'note' as const,
    source: 'image-marker' as const,
    text: marker,
    pageNumber: 1,
    order: 1,
    level: null,
    confidence: null,
    bbox: null,
    rows: null,
    notes: ['OCR engine unavailable, preserved image payload marker for multimodal fallback.'],
  }];

  return fromPages(
    'fallback:image-marker',
    [{
      segmentId: createSegmentId(1, marker, 'image_payload'),
      pageNumber: 1,
      text: marker,
      kind: 'image_payload',
      headingCandidates: [],
      blocks,
      tableCount: 0,
      listCount: 0,
    }],
    blocks,
    ['OCR engine unavailable, preserved multimodal image marker.']
  );
}

function createUnavailableOcrNote(fileName: string, fileType: DocumentFileType): OcrExtractionResult | null {
  const noteText =
    fileType === 'pdf'
      ? `OCR runtime unavailable for scanned PDF: ${fileName}`
      : `OCR runtime unavailable for ${fileType}: ${fileName}`;

  const blocks = [{
    blockId: `ocr-unavailable-${fileName}`,
    type: 'note' as const,
    source: 'ocr' as const,
    text: noteText,
    pageNumber: 1,
    order: 1,
    level: null,
    confidence: null,
    bbox: null,
    rows: null,
    notes: ['Provision the Python OCR runtime to replace this fallback.'],
  }];

  return fromPages(
    'fallback:ocr-unavailable',
    [{
      segmentId: createSegmentId(1, noteText, 'ocr'),
      pageNumber: 1,
      text: noteText,
      kind: 'ocr',
      headingCandidates: [],
      blocks,
      tableCount: 0,
      listCount: 0,
    }],
    blocks,
    ['OCR runtime unavailable.']
  );
}

export class OcrExtractionService {
  async extract(
    input: OcrExtractionInput,
    pythonResponse?: PythonWorkerExtractionResponse | null
  ): Promise<OcrExtractionResult | null> {
    const pythonPages = pagesFromPython(pythonResponse?.ocr?.pages);
    if (pythonPages.length > 0) {
      const notes = Array.isArray(pythonResponse?.ocr?.notes)
        ? pythonResponse?.ocr?.notes.filter((item): item is string => typeof item === 'string')
        : [];
      const ocrBlocks = normalizeBlocks(
        pythonResponse?.ocr?.ocrBlocks || pythonPages.flatMap((page) => page.blocks),
        1
      );

      return fromPages(
        String(pythonResponse?.ocr?.engine || 'python:ocr'),
        pythonPages,
        ocrBlocks.length > 0 ? ocrBlocks : pythonPages.flatMap((page) => page.blocks),
        notes
      );
    }

    const doclingText = normalizeWhitespace(String(pythonResponse?.docling?.text || pythonResponse?.docling?.markdown || ''));
    if (doclingText) {
      const pageSegments: DocumentPageSegment[] = [{
        segmentId: createSegmentId(1, doclingText, 'ocr'),
        pageNumber: 1,
        text: doclingText,
        kind: 'ocr',
        headingCandidates: [],
        blocks: linesToBlocks({
          pageNumber: 1,
          text: doclingText,
          source: 'ocr',
        }),
        tableCount: 0,
        listCount: 0,
      }];

      return fromPages(
        'python:docling-ocr-fallback',
        pageSegments,
        pageSegments.flatMap((page) => page.blocks),
        ['Docling payload supplied OCR/hybrid fallback text.']
      );
    }

    if (input.fileType === 'image') {
      return createImageMarker(input.fileName, input.mimeType, input.buffer);
    }

    if (DOCUMENT_RUNTIME_REQUIRE_PYTHON_OCR) {
      return null;
    }

    return createUnavailableOcrNote(input.fileName, input.fileType);
  }
}

export const ocrExtractionService = new OcrExtractionService();
