import {
  buildDocumentSections,
  buildHeadingTree,
  buildNormalizedMarkdown,
  buildPageMap,
  buildStructuredDocumentPayload,
  normalizeWhitespace,
} from './extractionShared.js';
import {
  DocumentArtifactPayload,
  DocumentPageSegment,
  DocumentStructuredBlock,
  StructuredDocumentPayload,
} from './types.js';

type NormalizationInput = {
  artifactBase: Omit<
    DocumentArtifactPayload,
    | 'fullText'
    | 'normalizedText'
    | 'normalizedMarkdown'
    | 'structuredDocumentJson'
    | 'pageMap'
    | 'ocrBlocks'
    | 'pageSegments'
    | 'headingTree'
    | 'languageHints'
    | 'sourceAttribution'
  >;
  pageSegments: DocumentPageSegment[];
  ocrBlocks: DocumentStructuredBlock[];
  languageHints: string[];
  docling?: Record<string, unknown> | null;
  notes?: string[];
};

function maybeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export class DocumentStructureNormalizer {
  normalize(input: NormalizationInput): DocumentArtifactPayload {
    const pageSegments = input.pageSegments
      .slice()
      .sort((left, right) => left.pageNumber - right.pageNumber);
    const headingTree = buildHeadingTree(pageSegments);
    const sections = buildDocumentSections({
      pageSegments,
      headingTree,
    });
    const pageMap = buildPageMap(pageSegments, headingTree);
    const fullText = normalizeWhitespace(pageSegments.map((segment) => segment.text).join('\n\n'));
    const doclingMarkdown = maybeString(input.docling?.markdown);
    const doclingStructured = input.docling?.structured as Record<string, unknown> | undefined;
    const notes = input.notes || [];

    const structuredDocumentJson: StructuredDocumentPayload = buildStructuredDocumentPayload({
      fileName: input.artifactBase.sourceFileName,
      fileType: input.artifactBase.fileType,
      languageHints: input.languageHints,
      pageSegments,
      headingTree,
      extractionMeta: {
        ...input.artifactBase.extractionMeta,
        doclingStructuredAvailable: Boolean(doclingStructured),
        doclingMarkdownAvailable: Boolean(doclingMarkdown),
        sectionCount: sections.length,
        pageCount: pageSegments.length,
        normalizationNotes: notes,
      },
    });

    if (doclingStructured) {
      structuredDocumentJson.metadata.docling = doclingStructured;
    }

    const normalizedMarkdownCore = buildNormalizedMarkdown({
      fileName: input.artifactBase.sourceFileName,
      fileType: input.artifactBase.fileType,
      extractionStrategy: input.artifactBase.extractionStrategy,
      languageHints: input.languageHints,
      pageSegments,
      headingTree,
      sections,
      ocrNotes: notes,
    });
    const normalizedMarkdown = normalizedMarkdownCore;

    const sourceAttribution = pageSegments.map((segment) => {
      if (segment.kind === 'hybrid') {
        return {
          pageNumber: segment.pageNumber,
          source: 'hybrid' as const,
          label: `page-${segment.pageNumber}-hybrid`,
        };
      }

      if (segment.kind === 'image_payload') {
        return {
          pageNumber: segment.pageNumber,
          source: 'image-marker' as const,
          label: `page-${segment.pageNumber}-image-marker`,
        };
      }

      return {
        pageNumber: segment.pageNumber,
        source: segment.kind === 'ocr' ? 'ocr' as const : 'native' as const,
        label: `page-${segment.pageNumber}-${segment.kind}`,
      };
    });

    return {
      ...input.artifactBase,
      fullText,
      normalizedText: fullText,
      normalizedMarkdown,
      structuredDocumentJson,
      pageMap,
      ocrBlocks: input.ocrBlocks,
      pageSegments,
      headingTree,
      languageHints: input.languageHints,
      sourceAttribution,
    };
  }
}

export const documentStructureNormalizer = new DocumentStructureNormalizer();
