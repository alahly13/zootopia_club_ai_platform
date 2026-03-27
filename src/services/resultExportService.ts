import { NormalizedResultPreview } from '../components/status/resultPreviewModel';
import {
  ExportMetadataItem,
  ExportThemeMode,
  exportElementToImage,
  exportElementToPDF,
  exportTextToMarkdown,
  exportTextToPDF,
  exportToDocx,
  exportToMarkdown,
  exportToPDF,
} from '../utils/exporters';
import { logger } from '../utils/logger';

type PreviewExportInput = {
  preview: NormalizedResultPreview;
  themeMode: ExportThemeMode;
  sourceTool?: string | null;
};

type PreviewPdfExportInput = PreviewExportInput & {
  exportElement: HTMLElement | null;
};

type PreviewImageExportInput = PreviewExportInput & {
  exportElement: HTMLElement | null;
  format?: 'png' | 'jpg' | 'jpeg' | 'webp';
};

const toExportMetadata = (preview: NormalizedResultPreview) =>
  preview.metadata as ExportMetadataItem[];

export async function exportPreviewToPdf({
  preview,
  themeMode,
  exportElement,
  sourceTool,
}: PreviewPdfExportInput) {
  if (preview.type === 'quiz' && preview.quiz) {
    return exportToPDF(preview.quiz, preview.topicImage, {
      themeMode,
      summary: preview.summary,
      metadata: toExportMetadata(preview),
    });
  }

  if (preview.type === 'text') {
    return exportTextToPDF(preview.title, preview.plainTextExport, {
      themeMode,
      summary: preview.summary,
      metadata: toExportMetadata(preview),
    });
  }

  return exportElementToPDF({
    element: exportElement,
    fileNameStem: preview.downloadFileStem,
    themeMode,
    context: {
      area: 'result-preview',
      event: 'snapshot-pdf-export',
      format: 'pdf',
      resultTitle: preview.title,
      resultType: preview.type,
      sourceTool,
    },
  });
}

export async function exportPreviewToImage({
  preview,
  themeMode,
  exportElement,
  sourceTool,
  format = 'png',
}: PreviewImageExportInput) {
  return exportElementToImage({
    element: exportElement,
    fileNameStem: preview.downloadFileStem,
    format,
    themeMode,
    context: {
      area: 'result-preview',
      event: 'snapshot-image-export',
      format,
      resultTitle: preview.title,
      resultType: preview.type,
      sourceTool,
    },
  });
}

export async function exportPreviewToDocx({
  preview,
  themeMode,
}: PreviewExportInput) {
  if (!preview.quiz) {
    logger.warn('DOCX export skipped because preview has no quiz payload.', {
      area: 'result-preview',
      event: 'docx-export-missing-quiz',
      resultTitle: preview.title,
      resultType: preview.type,
    });
    return false;
  }

  return exportToDocx(preview.quiz, {
    themeMode,
    summary: preview.summary,
    metadata: toExportMetadata(preview),
  });
}

export async function exportPreviewToMarkdown({
  preview,
  themeMode,
}: PreviewExportInput) {
  if (preview.type === 'quiz' && preview.quiz) {
    return exportToMarkdown(preview.quiz, {
      themeMode,
      summary: preview.summary,
      metadata: toExportMetadata(preview),
    });
  }

  if (!preview.markdownExport?.trim()) {
    logger.warn('Markdown export skipped because preview markdown is missing.', {
      area: 'result-preview',
      event: 'markdown-export-missing-content',
      resultTitle: preview.title,
      resultType: preview.type,
    });
    return false;
  }

  return exportTextToMarkdown(preview.title, preview.markdownExport, {
    themeMode,
    summary: preview.summary,
    metadata: toExportMetadata(preview),
  });
}
