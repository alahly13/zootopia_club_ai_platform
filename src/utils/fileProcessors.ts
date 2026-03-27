import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { logger } from './logger';
import {
  IMAGE_UPLOAD_EXTENSIONS,
  normalizeUploadExtension,
  validateUploadDescriptor,
} from '../upload/documentFilePolicy';

// Use a local Vite-bundled worker URL to avoid CDN/fake-worker failures.
// This keeps PDF extraction deterministic on localhost and production builds.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const PDF_PAGE_BATCH_SIZE = 4;

export type ExtractionStage =
  | 'validating'
  | 'extracting'
  | 'loading_pdf_worker'
  | 'parsing_pdf'
  | 'reading_docx'
  | 'reading_spreadsheet'
  | 'reading_image'
  | 'reading_text'
  | 'complete';

export interface ExtractionProgressUpdate {
  stage: ExtractionStage;
  label: string;
  progress?: number;
}

export interface ExtractTextOptions {
  onProgress?: (update: ExtractionProgressUpdate) => void;
  signal?: AbortSignal;
}

const assertNotAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) {
    return;
  }

  const reason = signal.reason;
  if (reason instanceof Error) {
    throw reason;
  }

  throw new Error(typeof reason === 'string' ? reason : 'File processing was cancelled.');
};

const readArrayBuffer = async (file: File, signal?: AbortSignal): Promise<ArrayBuffer> => {
  assertNotAborted(signal);
  const buffer = await file.arrayBuffer();
  assertNotAborted(signal);
  if (!buffer.byteLength) {
    throw new Error('File is empty.');
  }
  return buffer;
};

const toDataUrl = async (file: File): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
};

export const validateSupportedUploadFile = async (file: File): Promise<void> => {
  validateUploadDescriptor({
    fileName: file?.name || '',
    mimeType: file?.type,
    sizeBytes: file?.size ?? 0,
  });
};

const toPdfText = async (
  arrayBuffer: ArrayBuffer,
  emitProgress?: (update: ExtractionProgressUpdate) => void,
  signal?: AbortSignal
): Promise<string> => {
  emitProgress?.({
    stage: 'loading_pdf_worker',
    label: 'Loading PDF worker',
    progress: 15,
  });

  assertNotAborted(signal);
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

  emitProgress?.({
    stage: 'parsing_pdf',
    label: 'Loading PDF document',
    progress: 25,
  });

  let pdf: Awaited<typeof loadingTask.promise> | null = null;

  try {
    pdf = await loadingTask.promise;
    assertNotAborted(signal);

    const pageTexts = new Array<string>(pdf.numPages).fill('');
    let processedPages = 0;

    logger.debug('PDF loaded', { numPages: pdf.numPages });

    for (let startPage = 1; startPage <= pdf.numPages; startPage += PDF_PAGE_BATCH_SIZE) {
      assertNotAborted(signal);
      const endPage = Math.min(pdf.numPages, startPage + PDF_PAGE_BATCH_SIZE - 1);
      const batchPages = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index);

      await Promise.all(
        batchPages.map(async (pageNumber) => {
          assertNotAborted(signal);
          const page = await pdf!.getPage(pageNumber);
          assertNotAborted(signal);
          const content = await page.getTextContent();
          assertNotAborted(signal);
          pageTexts[pageNumber - 1] = content.items.map((item: any) => item.str).join(' ');

          processedPages += 1;
          const progress = Math.min(95, Math.floor((processedPages / pdf!.numPages) * 100));
          emitProgress?.({
            stage: 'parsing_pdf',
            label: `Parsing PDF page ${processedPages} of ${pdf!.numPages}`,
            progress,
          });
        })
      );
    }

    emitProgress?.({
      stage: 'complete',
      label: 'PDF text extraction completed',
      progress: 100,
    });

    return pageTexts.join('\n');
  } finally {
    // Release worker/task resources after each extraction attempt so repeated
    // uploads do not accumulate orphaned PDF loading tasks.
    const cleanupResult = (loadingTask as { destroy?: () => unknown }).destroy?.();
    if (cleanupResult && typeof (cleanupResult as Promise<unknown>).then === 'function') {
      await cleanupResult;
    }
  }
};

export const extractTextFromFile = async (file: File, options?: ExtractTextOptions): Promise<string> => {
  logger.info('Starting text extraction', { fileName: file.name, type: file.type, size: file.size });
  const extension = normalizeUploadExtension(file.name);
  const emitProgress = options?.onProgress;
  const signal = options?.signal;

  try {
    assertNotAborted(signal);
    emitProgress?.({ stage: 'validating', label: 'Validating file', progress: 5 });
    await validateSupportedUploadFile(file);
    assertNotAborted(signal);
    emitProgress?.({ stage: 'extracting', label: 'Preparing extraction pipeline', progress: 10 });

    if (extension === 'pdf') {
      logger.debug('Processing PDF file');
      const arrayBuffer = await readArrayBuffer(file, signal);

      const text = await toPdfText(arrayBuffer, emitProgress, signal);
      logger.info('PDF text extraction complete', { textLength: text.length });
      return text;
    }

    if (extension === 'docx') {
      emitProgress?.({ stage: 'reading_docx', label: 'Reading DOCX content', progress: 40 });
      const arrayBuffer = await readArrayBuffer(file, signal);
      assertNotAborted(signal);
      const result = await mammoth.extractRawText({ arrayBuffer });
      assertNotAborted(signal);
      emitProgress?.({ stage: 'complete', label: 'DOCX extraction completed', progress: 100 });
      return result.value;
    }

    if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
      emitProgress?.({ stage: 'reading_spreadsheet', label: 'Reading spreadsheet content', progress: 40 });
      const arrayBuffer = await readArrayBuffer(file, signal);
      assertNotAborted(signal);
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        text += XLSX.utils.sheet_to_txt(sheet) + '\n';
      });
      assertNotAborted(signal);
      emitProgress?.({ stage: 'complete', label: 'Spreadsheet extraction completed', progress: 100 });
      return text;
    }

    if (IMAGE_UPLOAD_EXTENSIONS.has(extension)) {
      emitProgress?.({ stage: 'reading_image', label: 'Preparing image input', progress: 60 });
      // Architecture-sensitive note:
      // Document analysis pipeline expects the exact IMAGE_DATA marker format.
      // Keep this return shape stable to preserve multimodal routing.
      assertNotAborted(signal);
      const dataUrl = await toDataUrl(file);
      assertNotAborted(signal);
      const [, base64Payload = ''] = dataUrl.split(',');
      const mime = file.type || 'image/png';
      emitProgress?.({ stage: 'complete', label: 'Image payload prepared', progress: 100 });
      return `[IMAGE_DATA:${mime};base64,${base64Payload}]`;
    }

    emitProgress?.({ stage: 'reading_text', label: 'Reading text content', progress: 70 });
    assertNotAborted(signal);
    const text = await file.text();
    assertNotAborted(signal);
    emitProgress?.({ stage: 'complete', label: 'Text extraction completed', progress: 100 });
    return text;
  } catch (error: any) {
    if (signal?.aborted) {
      const abortReason = signal.reason;
      if (abortReason instanceof Error) {
        throw abortReason;
      }

      throw new Error(typeof abortReason === 'string' ? abortReason : 'File processing was cancelled.');
    }

    const reason = error?.message || String(error);

    logger.error('File extraction failed', {
      fileName: file.name,
      extension,
      reason,
    });

    if (extension === 'pdf' && /setting up fake worker failed|pdf\.worker|failed to fetch dynamically imported module/i.test(reason)) {
      throw new Error(`PDF worker setup failed: ${reason}`);
    }

    if (extension === 'pdf') {
      throw new Error(`PDF parsing failed: ${reason}`);
    }

    throw new Error(reason || 'Failed to process file.');
  }
};
