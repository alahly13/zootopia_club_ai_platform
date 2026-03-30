import { normalizeUploadExtension } from '../../src/upload/documentFilePolicy.js';
import {
  DocumentFileType,
  DocumentTypeDetectionResult,
  ExtractionExecutionMode,
  ExtractionStrategyResolution,
} from './types.js';

type FileDetectionInput = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

type PdfTextDensityReport = {
  totalPages: number;
  pagesWithText: number;
  sparseTextPages: number;
  totalCharacters: number;
  averageCharactersPerPage: number;
};

type FileSignature = 'pdf' | 'png' | 'jpeg' | 'webp' | 'zip' | 'unknown';

function inferFileType(extension: string): DocumentFileType {
  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx') return 'docx';
  if (extension === 'xlsx') return 'xlsx';
  if (extension === 'xls') return 'xls';
  if (extension === 'csv') return 'csv';
  if (extension === 'pptx') return 'pptx';
  if (extension === 'txt') return 'txt';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(extension)) return 'image';
  return 'unknown';
}

function detectFileSignature(buffer: Buffer): FileSignature {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'pdf';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'zip';
  }

  return 'unknown';
}

function resolveDetectedFileType(extensionType: DocumentFileType, signature: FileSignature): {
  fileType: DocumentFileType;
  confidence: DocumentTypeDetectionResult['confidence'];
  hints: string[];
} {
  const hints: string[] = [`extension:${extensionType}`];

  if (signature !== 'unknown') {
    hints.push(`signature:${signature}`);
  }

  if (signature === 'pdf') {
    return {
      fileType: 'pdf',
      confidence: extensionType === 'pdf' ? 'high' : 'medium',
      hints,
    };
  }

  if (signature === 'png' || signature === 'jpeg' || signature === 'webp') {
    return {
      fileType: 'image',
      confidence: extensionType === 'image' ? 'high' : 'medium',
      hints,
    };
  }

  if (signature === 'zip' && ['docx', 'xlsx', 'pptx'].includes(extensionType)) {
    return {
      fileType: extensionType,
      confidence: 'high',
      hints: [...hints, 'container:zip-office'],
    };
  }

  return {
    fileType: extensionType,
    confidence: extensionType === 'unknown' ? 'low' : 'high',
    hints,
  };
}

function buildHints(fileType: DocumentFileType, mimeType: string, baseHints: string[]): string[] {
  const hints = new Set<string>([fileType, ...baseHints]);
  if (mimeType) {
    hints.add(`mime:${mimeType}`);
  }
  if (fileType === 'image') {
    hints.add('ocr-capable');
  }
  if (fileType === 'pdf') {
    hints.add('pdf-layout');
  }
  if (fileType === 'docx' || fileType === 'xlsx' || fileType === 'pptx') {
    hints.add('office-document');
  }
  return Array.from(hints);
}

async function inspectPdfTextDensity(buffer: Buffer): Promise<PdfTextDensityReport> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
  });

  try {
    const pdf = await loadingTask.promise;
    let pagesWithText = 0;
    let sparseTextPages = 0;
    let totalCharacters = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join(' ')
        .trim();
      if (pageText.length > 20) {
        pagesWithText += 1;
      }
      if (pageText.length > 0 && pageText.length < 80) {
        sparseTextPages += 1;
      }
      if (pageText.length === 0) {
        sparseTextPages += 1;
      }
      totalCharacters += pageText.length;
    }

    return {
      totalPages: pdf.numPages,
      pagesWithText,
      sparseTextPages,
      totalCharacters,
      averageCharactersPerPage: pdf.numPages > 0 ? Math.round(totalCharacters / pdf.numPages) : 0,
    };
  } finally {
    const destroyResult = (loadingTask as { destroy?: () => unknown }).destroy?.();
    if (destroyResult && typeof (destroyResult as Promise<unknown>).then === 'function') {
      await destroyResult;
    }
  }
}

function resolveDefaultExecutionMode(fileType: DocumentFileType): ExtractionExecutionMode {
  if (fileType === 'image') return 'ocr';
  if (fileType === 'pdf') return 'hybrid';
  if (fileType === 'docx' || fileType === 'xlsx' || fileType === 'xls' || fileType === 'csv' || fileType === 'txt') {
    return 'native';
  }
  return 'marker';
}

export class LegacyFileTypeDetectionService {
  async detect(input: FileDetectionInput): Promise<DocumentTypeDetectionResult> {
    const extension = normalizeUploadExtension(input.fileName);
    const extensionType = inferFileType(extension);
    const signature = detectFileSignature(input.buffer);
    const detected = resolveDetectedFileType(extensionType, signature);

    return {
      fileType: detected.fileType,
      extension,
      mimeType: input.mimeType,
      confidence: detected.confidence,
      isImage: detected.fileType === 'image',
      supportsNativeExtraction: ['pdf', 'docx', 'xlsx', 'xls', 'csv', 'txt'].includes(detected.fileType),
      supportsOcr: detected.fileType === 'image' || detected.fileType === 'pdf',
      hints: buildHints(detected.fileType, input.mimeType, detected.hints),
    };
  }

  async resolveStrategy(input: FileDetectionInput): Promise<ExtractionStrategyResolution> {
    const detection = await this.detect(input);
    const defaultMode = resolveDefaultExecutionMode(detection.fileType);

    if (detection.fileType === 'pdf') {
      const density = await inspectPdfTextDensity(input.buffer);
      const textCoverageRatio =
        density.totalPages > 0 ? density.pagesWithText / density.totalPages : 0;
      const sparsePageRatio =
        density.totalPages > 0 ? density.sparseTextPages / density.totalPages : 0;

      if (density.totalCharacters === 0 || textCoverageRatio < 0.35) {
        return {
          strategyId: 'pdf_ocr_primary',
          executionMode: 'ocr',
          reason: 'PDF appears scanned or image-first, so OCR should lead extraction.',
          detection: {
            ...detection,
            hints: [
              ...detection.hints,
              `pdf-pages:${density.totalPages}`,
              `pdf-pages-with-text:${density.pagesWithText}`,
              `pdf-sparse-pages:${density.sparseTextPages}`,
            ],
          },
          nativePreferred: false,
          ocrPreferred: true,
          hybridPreferred: false,
          shouldUseDoclingNormalization: true,
        };
      }

      if (textCoverageRatio < 0.85 || density.averageCharactersPerPage < 180 || sparsePageRatio > 0) {
        return {
          strategyId: 'pdf_hybrid_merge',
          executionMode: 'hybrid',
          reason: 'PDF has partial or sparse native text coverage, so native extraction with OCR fallback is safer.',
          detection: {
            ...detection,
            hints: [
              ...detection.hints,
              `pdf-pages:${density.totalPages}`,
              `pdf-pages-with-text:${density.pagesWithText}`,
              `pdf-sparse-pages:${density.sparseTextPages}`,
            ],
          },
          nativePreferred: true,
          ocrPreferred: true,
          hybridPreferred: true,
          shouldUseDoclingNormalization: true,
        };
      }

      return {
        strategyId: 'pdf_native_structured',
        executionMode: 'native',
        reason: 'PDF has strong embedded text, so native extraction should lead.',
        detection: {
          ...detection,
          hints: [
            ...detection.hints,
            `pdf-pages:${density.totalPages}`,
            `pdf-pages-with-text:${density.pagesWithText}`,
            `pdf-sparse-pages:${density.sparseTextPages}`,
          ],
        },
        nativePreferred: true,
        ocrPreferred: false,
        hybridPreferred: false,
        shouldUseDoclingNormalization: true,
      };
    }

    if (detection.fileType === 'image') {
      return {
        strategyId: 'image_ocr_primary',
        executionMode: 'ocr',
        reason: 'Images require OCR/document-vision extraction.',
        detection,
        nativePreferred: false,
        ocrPreferred: true,
        hybridPreferred: false,
        shouldUseDoclingNormalization: true,
      };
    }

    if (detection.fileType === 'docx') {
      return {
        strategyId: 'docx_structured_native',
        executionMode: 'native',
        reason: 'DOCX supports structural native extraction.',
        detection,
        nativePreferred: true,
        ocrPreferred: false,
        hybridPreferred: false,
        shouldUseDoclingNormalization: true,
      };
    }

    if (['xlsx', 'xls', 'csv'].includes(detection.fileType)) {
      return {
        strategyId: 'spreadsheet_native',
        executionMode: 'native',
        reason: 'Spreadsheet formats should stay sheet-aware and native-first.',
        detection,
        nativePreferred: true,
        ocrPreferred: false,
        hybridPreferred: false,
        shouldUseDoclingNormalization: false,
      };
    }

    return {
      strategyId: `${detection.fileType || 'unknown'}_${defaultMode}`,
      executionMode: defaultMode,
      reason: 'Fallback strategy selected from the detected file type.',
      detection,
      nativePreferred: defaultMode === 'native',
      ocrPreferred: defaultMode === 'ocr',
      hybridPreferred: defaultMode === 'hybrid',
      shouldUseDoclingNormalization: detection.fileType !== 'unknown',
    };
  }
}

export const legacyFileTypeDetectionService = new LegacyFileTypeDetectionService();
