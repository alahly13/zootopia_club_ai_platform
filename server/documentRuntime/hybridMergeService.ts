import { buildLanguageHints, createSegmentId, normalizeWhitespace } from './extractionShared.js';
import { DocumentPageSegment, DocumentStructuredBlock, NativeExtractionResult, OcrExtractionResult } from './types.js';

export interface HybridMergeResult {
  pageSegments: DocumentPageSegment[];
  ocrBlocks: DocumentStructuredBlock[];
  languageHints: string[];
  fullText: string;
  notes: string[];
}

function mergeTexts(nativeText: string, ocrText: string): string {
  const left = normalizeWhitespace(nativeText);
  const right = normalizeWhitespace(ocrText);
  if (!left) return right;
  if (!right) return left;
  if (left === right) return left;
  if (left.includes(right)) return left;
  if (right.includes(left)) return right;
  return `${left}\n\n[OCR Supplement]\n${right}`;
}

function dedupeBlocks(blocks: DocumentStructuredBlock[]): DocumentStructuredBlock[] {
  const seen = new Set<string>();
  const output: DocumentStructuredBlock[] = [];

  for (const block of blocks) {
    const key = `${block.pageNumber}:${block.type}:${block.text}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(block);
  }

  return output
    .sort((left, right) => {
      if (left.pageNumber !== right.pageNumber) {
        return left.pageNumber - right.pageNumber;
      }
      return left.order - right.order;
    })
    .map((block, index) => ({
      ...block,
      order: index + 1,
    }));
}

export class HybridMergeService {
  merge(input: {
    native: NativeExtractionResult | null;
    ocr: OcrExtractionResult | null;
  }): HybridMergeResult {
    const byPage = new Map<number, { native?: DocumentPageSegment; ocr?: DocumentPageSegment }>();

    for (const segment of input.native?.pageSegments || []) {
      byPage.set(segment.pageNumber, {
        ...(byPage.get(segment.pageNumber) || {}),
        native: segment,
      });
    }

    for (const segment of input.ocr?.pageSegments || []) {
      byPage.set(segment.pageNumber, {
        ...(byPage.get(segment.pageNumber) || {}),
        ocr: segment,
      });
    }

    const pageSegments = Array.from(byPage.entries())
      .sort(([left], [right]) => left - right)
      .map(([pageNumber, pair]) => {
        const mergedText = mergeTexts(pair.native?.text || '', pair.ocr?.text || '');
        const mergedBlocks = dedupeBlocks([
          ...(pair.native?.blocks || []),
          ...(pair.ocr?.blocks || []),
        ]);
        const headingCandidates = Array.from(
          new Set([
            ...(pair.native?.headingCandidates || []),
            ...(pair.ocr?.headingCandidates || []),
          ].filter(Boolean))
        );
        const kind =
          pair.native && pair.ocr
            ? 'hybrid'
            : pair.native
              ? pair.native.kind
              : pair.ocr?.kind || 'ocr';

        return {
          segmentId: createSegmentId(pageNumber, mergedText, kind),
          pageNumber,
          text: mergedText,
          kind,
          headingCandidates,
          blocks: mergedBlocks,
          tableCount: mergedBlocks.filter((block) => block.type === 'table').length,
          listCount: mergedBlocks.filter((block) => block.type === 'list_item').length,
        } as DocumentPageSegment;
      });

    const ocrBlocks = dedupeBlocks([
      ...(input.ocr?.ocrBlocks || []),
      ...pageSegments.flatMap((segment) => segment.blocks.filter((block) => block.source === 'ocr')),
    ]);

    const fullText = normalizeWhitespace(pageSegments.map((segment) => segment.text).join('\n\n'));
    const languageHints = Array.from(
      new Set([
        ...(input.native?.languageHints || []),
        ...(input.ocr?.languageHints || []),
        ...buildLanguageHints(fullText),
      ])
    );

    return {
      pageSegments,
      ocrBlocks,
      languageHints,
      fullText,
      notes: [
        ...(input.native?.notes || []),
        ...(input.ocr?.notes || []),
      ],
    };
  }
}

export const hybridMergeService = new HybridMergeService();
