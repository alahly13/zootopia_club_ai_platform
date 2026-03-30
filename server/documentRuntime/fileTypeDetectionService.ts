import { normalizeUploadExtension } from '../../src/upload/documentFilePolicy.js';
import {
  DocumentFileType,
  DocumentTypeDetectionResult,
  ExtractionStrategyResolution,
} from './types.js';

type FileDetectionInput = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
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

function detectOfficeContainerType(buffer: Buffer): DocumentFileType | null {
  const preview = buffer.toString('latin1', 0, Math.min(buffer.length, 4096)).toLowerCase();
  if (preview.includes('word/')) {
    return 'docx';
  }
  if (preview.includes('xl/')) {
    return 'xlsx';
  }
  if (preview.includes('ppt/')) {
    return 'pptx';
  }
  return null;
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

function resolveDetectedFileType(input: {
  extensionType: DocumentFileType;
  signature: FileSignature;
  buffer: Buffer;
}): {
  fileType: DocumentFileType;
  confidence: DocumentTypeDetectionResult['confidence'];
  hints: string[];
} {
  const hints: string[] = [`extension:${input.extensionType}`];

  if (input.signature !== 'unknown') {
    hints.push(`signature:${input.signature}`);
  }

  if (input.signature === 'pdf') {
    return {
      fileType: 'pdf',
      confidence: input.extensionType === 'pdf' ? 'high' : 'medium',
      hints: [...hints, 'magic:pdf'],
    };
  }

  if (input.signature === 'png' || input.signature === 'jpeg' || input.signature === 'webp') {
    return {
      fileType: 'image',
      confidence: input.extensionType === 'image' ? 'high' : 'medium',
      hints: [...hints, `magic:${input.signature}`],
    };
  }

  if (input.signature === 'zip') {
    const officeType = detectOfficeContainerType(input.buffer);
    if (officeType) {
      return {
        fileType: officeType,
        confidence: input.extensionType === officeType ? 'high' : 'medium',
        hints: [...hints, 'container:zip-office', `magic:${officeType}`],
      };
    }
  }

  return {
    fileType: input.extensionType,
    confidence: input.extensionType === 'unknown' ? 'low' : 'high',
    hints,
  };
}

function buildStrategyId(fileType: DocumentFileType): string {
  return `datalab_convert_${fileType || 'unknown'}`;
}

export class FileTypeDetectionService {
  async detect(input: FileDetectionInput): Promise<DocumentTypeDetectionResult> {
    const extension = normalizeUploadExtension(input.fileName);
    const extensionType = inferFileType(extension);
    const signature = detectFileSignature(input.buffer);
    const detected = resolveDetectedFileType({
      extensionType,
      signature,
      buffer: input.buffer,
    });

    return {
      fileType: detected.fileType,
      extension,
      mimeType: input.mimeType,
      confidence: detected.confidence,
      isImage: detected.fileType === 'image',
      supportsNativeExtraction: ['pdf', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'pptx'].includes(
        detected.fileType
      ),
      supportsOcr: detected.fileType === 'image' || detected.fileType === 'pdf',
      hints: buildHints(detected.fileType, input.mimeType, detected.hints),
    };
  }

  async resolveStrategy(input: FileDetectionInput): Promise<ExtractionStrategyResolution> {
    const detection = await this.detect(input);

    return {
      strategyId: buildStrategyId(detection.fileType),
      executionMode: 'marker',
      reason: 'Datalab Convert is the canonical backend extraction engine for document intake.',
      detection,
      nativePreferred: false,
      ocrPreferred: detection.isImage,
      hybridPreferred: false,
      shouldUseDoclingNormalization: false,
    };
  }
}

export const fileTypeDetectionService = new FileTypeDetectionService();
