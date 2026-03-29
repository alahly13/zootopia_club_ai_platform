import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { Document as DocxDocument, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";
import html2canvas from "html2canvas";
import { Quiz, COPYRIGHT } from "../utils";
import { BRANDING_COLORS, PLATFORM_NAME, PLATFORM_TAGLINE, QR_CODE_DATA_URL, WHATSAPP_NUMBER, drawBrandingSeal, drawQRCode } from "./branding";
import {
  buildDocumentBackgroundCss,
  loadDocumentBackgroundDataUrl,
  resolveDocumentBackgroundBaseColor,
} from "./documentBackgrounds";
import { buildDownloadFileName } from "./fileDownloads";
import { downloadBlobToFile } from "./fileDownloads";
import { logger } from "./logger";
import {
  formatQuizCorrectAnswerText,
  formatQuizOptionWithMarker,
  getQuizCorrectAnswerMarker,
  getQuizOptionMarker,
  QUIZ_PRESENTATION_COPY,
} from "./quizPresentation";

export type ExportThemeMode = 'light' | 'dark';
export interface ExportMetadataItem {
  label: string;
  value: string;
}

interface ExportOptions {
  themeMode?: ExportThemeMode;
  summary?: string;
  metadata?: ExportMetadataItem[];
}

type SnapshotExportContext = {
  area: string;
  event: string;
  format: 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp';
  resultTitle?: string;
  resultType?: string;
  sourceTool?: string | null;
};

type DomDocumentWithFonts = globalThis.Document & {
  fonts?: FontFaceSet;
};

const THEME_STORAGE_KEY = 'zootopia_theme';

const resolveExportThemeMode = (mode?: ExportThemeMode): ExportThemeMode => {
  if (mode) return mode;
  if (typeof window === 'undefined') return 'light';

  const savedMode = window.localStorage.getItem(THEME_STORAGE_KEY);
  return savedMode === 'dark' ? 'dark' : 'light';
};

const buildExportFileName = (
  baseName: string,
  extension: string,
  fallbackBaseName = 'zootopia-result'
) => buildDownloadFileName(baseName, extension, fallbackBaseName);

const hasQuizExportContent = (quiz: Quiz | null | undefined) =>
  Boolean(quiz?.title?.trim() && Array.isArray(quiz.questions) && quiz.questions.length > 0);

const hasTextExportContent = (title: string, content: string) =>
  Boolean(title?.trim() && content?.trim());

const normalizeExportMetadata = (metadata?: ExportMetadataItem[]): ExportMetadataItem[] => {
  if (!Array.isArray(metadata)) {
    return [];
  }

  return metadata
    .map((item) => ({
      label: typeof item?.label === 'string' ? item.label.trim() : '',
      value: typeof item?.value === 'string' ? item.value.trim() : '',
    }))
    .filter((item) => item.label && item.value);
};

const buildMetadataSummaryLine = (metadata?: ExportMetadataItem[], limit = 5): string | null => {
  const normalized = normalizeExportMetadata(metadata).slice(0, limit);
  if (!normalized.length) {
    return null;
  }

  return normalized.map((item) => `${item.label}: ${item.value}`).join(' | ');
};

const appendMetadataListMarkdown = (metadata?: ExportMetadataItem[]): string => {
  const normalized = normalizeExportMetadata(metadata);
  if (!normalized.length) {
    return '';
  }

  return [
    '### Export Metadata',
    '',
    ...normalized.map((item) => `- **${item.label}:** ${item.value}`),
    '',
  ].join('\n');
};

const addOptionalSummaryBlock = (
  doc: any,
  y: number,
  pageWidth: number,
  summary: string | undefined,
  themeMode: ExportThemeMode
): number => {
  if (!summary?.trim()) {
    return y;
  }

  const isDark = themeMode === 'dark';
  const summaryLines = doc.splitTextToSize(summary.trim(), pageWidth - 52);
  const blockHeight = Math.max(summaryLines.length * 7 + 16, 28);

  doc.setFillColor(...(isDark ? [24, 24, 27] : [248, 250, 252]));
  doc.roundedRect(20, y - 4, pageWidth - 40, blockHeight, 6, 6, 'F');
  doc.setTextColor(...(isDark ? [16, 185, 129] : [5, 150, 105]));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("EXPORT SUMMARY", 26, y + 4);

  doc.setTextColor(...(isDark ? [226, 232, 240] : [55, 65, 81]));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(summaryLines, 26, y + 11);

  return y + blockHeight + 8;
};

type PdfThemePalette = {
  pageBackground: string;
  pageAccent: string;
  pageAccentSecondary: string;
  surface: string;
  surfaceSoft: string;
  surfaceStrong: string;
  border: string;
  grid: string;
  text: string;
  muted: string;
  accent: string;
  accentSoft: string;
  accentStrong: string;
  chipBackground: string;
  chipText: string;
  answerBackground: string;
  explanationBackground: string;
};

type PdfLabels = {
  exportSummary: string;
  exportMetadata: string;
  generatedOn: string;
  previewTheme: string;
  content: string;
  question: string;
  answerChoices?: string;
  choiceMatrix?: string;
  bestMatch?: string;
  verifiedAnswer?: string;
  correctAnswer: string;
  whyItWorks?: string;
  explanation: string;
  light: string;
  dark: string;
  verified: string;
  topicImage: string;
  questionSet: string;
  totalQuestions: string;
  questionMix: string;
  contentBlocks: string;
  totalWords: string;
  facultyReady: string;
  academicFormat: string;
};

type PdfMetricItem = {
  label: string;
  value: string;
};

const getPdfThemePalette = (themeMode: ExportThemeMode): PdfThemePalette =>
  themeMode === 'dark'
    ? {
        pageBackground: '#07131f',
        pageAccent: 'rgba(16, 185, 129, 0.18)',
        pageAccentSecondary: 'rgba(34, 211, 238, 0.14)',
        surface: 'rgba(9, 18, 31, 0.92)',
        surfaceSoft: 'rgba(15, 23, 42, 0.84)',
        surfaceStrong: '#0f172a',
        border: 'rgba(148, 163, 184, 0.18)',
        grid: 'rgba(148, 163, 184, 0.08)',
        text: '#f8fafc',
        muted: '#cbd5e1',
        accent: '#34d399',
        accentSoft: 'rgba(52, 211, 153, 0.14)',
        accentStrong: '#10b981',
        chipBackground: 'rgba(15, 23, 42, 0.92)',
        chipText: '#e2e8f0',
        answerBackground: 'rgba(16, 185, 129, 0.16)',
        explanationBackground: 'rgba(14, 165, 233, 0.14)',
      }
    : {
        pageBackground: '#f8fafc',
        pageAccent: 'rgba(16, 185, 129, 0.12)',
        pageAccentSecondary: 'rgba(14, 165, 233, 0.1)',
        surface: '#ffffff',
        surfaceSoft: '#f8fafc',
        surfaceStrong: '#ecfdf5',
        border: 'rgba(15, 23, 42, 0.08)',
        grid: 'rgba(15, 23, 42, 0.04)',
        text: '#0f172a',
        muted: '#475569',
        accent: '#059669',
        accentSoft: 'rgba(16, 185, 129, 0.12)',
        accentStrong: '#047857',
        chipBackground: '#f8fafc',
        chipText: '#1f2937',
        answerBackground: 'rgba(16, 185, 129, 0.1)',
        explanationBackground: 'rgba(14, 165, 233, 0.08)',
      };

const hasArabicCharacters = (value?: string) => Boolean(value && /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(value));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatInlineExportMarkup = (value: string) => {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(15,23,42,0.08); padding: 0.12rem 0.4rem; border-radius: 999px; font-family: \'JetBrains Mono\', \'Courier New\', monospace; font-size: 0.92em;">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s>])\*([^*]+)\*(?=$|[\s<])/g, '$1<em>$2</em>');
  return html;
};

const waitForImages = async (container: HTMLElement) => {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }

          const done = () => {
            image.removeEventListener('load', done);
            image.removeEventListener('error', done);
            resolve();
          };

          image.addEventListener('load', done);
          image.addEventListener('error', done);
        })
    )
  );
};

const waitForAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const createSnapshotHost = (themeMode: ExportThemeMode) => {
  const host = document.createElement('div');
  host.setAttribute('data-export-host', 'zootopia-snapshot-pdf');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '1180px';
  host.style.padding = '24px 0';
  host.style.pointerEvents = 'none';
  host.style.opacity = '1';
  host.style.background = resolveDocumentBackgroundBaseColor(themeMode);
  return host;
};

const getPdfLabels = (isRtl: boolean): PdfLabels =>
  isRtl
    ? {
        exportSummary: 'ملخص التصدير',
        exportMetadata: 'بيانات التصدير',
        generatedOn: 'تاريخ التصدير',
        previewTheme: 'وضع المعاينة',
        content: 'المحتوى',
        question: 'السؤال',
        correctAnswer: 'الإجابة الصحيحة',
        explanation: 'الشرح',
        light: 'فاتح',
        dark: 'داكن',
        verified: 'معتمد من Zootopia Club',
        topicImage: 'الصورة الموضوعية',
        questionSet: 'مجموعة الأسئلة',
        totalQuestions: 'إجمالي الأسئلة',
        questionMix: 'تنوع الأسئلة',
        contentBlocks: 'أقسام المحتوى',
        totalWords: 'عدد الكلمات',
        facultyReady: 'جاهز لكلية العلوم',
        academicFormat: 'تنسيق أكاديمي قابل للطباعة',
      }
    : {
        exportSummary: 'Export Summary',
        exportMetadata: 'Export Metadata',
        generatedOn: 'Generated On',
        previewTheme: 'Preview Theme',
        content: 'Content',
        question: 'Question',
        correctAnswer: 'Correct Answer',
        explanation: 'Explanation',
        light: 'Light',
        dark: 'Dark',
        verified: 'Verified by Zootopia Club',
        topicImage: 'Topic Image',
        questionSet: 'Question Set',
        totalQuestions: 'Total Questions',
        questionMix: 'Question Mix',
        contentBlocks: 'Content Blocks',
        totalWords: 'Word Count',
        facultyReady: 'Faculty of Science Ready',
        academicFormat: 'Printable academic layout',
      };

const mergeExportMetadata = (...groups: Array<ExportMetadataItem[] | undefined>): ExportMetadataItem[] => {
  const seenLabels = new Set<string>();
  const merged: ExportMetadataItem[] = [];

  groups
    .flatMap((group) => normalizeExportMetadata(group))
    .forEach((item) => {
      const labelKey = item.label.trim().toLowerCase();
      if (seenLabels.has(labelKey)) {
        return;
      }
      seenLabels.add(labelKey);
      merged.push(item);
    });

  return merged;
};

const formatExportDate = (isRtl: boolean) =>
  new Intl.DateTimeFormat(isRtl ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
  }).format(new Date());

const buildMetricCardsMarkup = (
  metrics: PdfMetricItem[] | undefined,
  palette: PdfThemePalette,
  isRtl: boolean
) => {
  if (!metrics?.length) {
    return '';
  }

  return `
    <div style="display:grid; grid-template-columns:repeat(${Math.min(Math.max(metrics.length, 1), 3)}, minmax(0, 1fr)); gap:14px; margin-top:22px;">
      ${metrics
        .map(
          (metric) => `
            <div style="border:1px solid ${palette.border}; background:${palette.surfaceStrong}; border-radius:26px; padding:16px 18px; min-height:94px;">
              <div style="font-size:11px; font-weight:900; letter-spacing:0.16em; text-transform:uppercase; color:${palette.muted};">${escapeHtml(metric.label)}</div>
              <div style="margin-top:10px; font-size:24px; font-weight:900; line-height:1.25; color:${palette.text}; direction:${hasArabicCharacters(metric.value) ? 'rtl' : 'ltr'}; text-align:${hasArabicCharacters(metric.value) || isRtl ? 'right' : 'left'};">${formatInlineExportMarkup(metric.value)}</div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
};

const buildScientificBackdropMarkup = (
  palette: PdfThemePalette,
  themeMode: ExportThemeMode,
  isRtl: boolean
) => `
  <div style="position:absolute; inset:0; pointer-events:none; overflow:hidden;">
    <div style="position:absolute; inset:0; background-image:linear-gradient(${palette.grid} 1px, transparent 1px), linear-gradient(90deg, ${palette.grid} 1px, transparent 1px); background-size:34px 34px; opacity:${themeMode === 'dark' ? '0.55' : '0.8'};"></div>
    <div style="position:absolute; top:-120px; ${isRtl ? 'left' : 'right'}:-80px; width:320px; height:320px; border-radius:999px; background:${palette.pageAccent}; filter:blur(8px);"></div>
    <div style="position:absolute; top:170px; ${isRtl ? 'right' : 'left'}:-100px; width:260px; height:260px; border-radius:999px; background:${palette.pageAccentSecondary}; filter:blur(10px);"></div>
    <div style="position:absolute; bottom:160px; ${isRtl ? 'left' : 'right'}:48px; width:180px; height:180px; border:1px solid ${palette.border}; border-radius:999px;"></div>
    <div style="position:absolute; bottom:110px; ${isRtl ? 'left' : 'right'}:88px; width:110px; height:110px; border:1px solid ${palette.border}; border-radius:999px;"></div>
    <svg viewBox="0 0 260 260" aria-hidden="true" style="position:absolute; top:70px; ${isRtl ? 'left' : 'right'}:48px; width:260px; height:260px; opacity:${themeMode === 'dark' ? '0.78' : '0.62'};">
      <g fill="none" stroke="${palette.border}" stroke-width="1.4">
        <circle cx="130" cy="130" r="100" />
        <circle cx="130" cy="130" r="64" />
        <circle cx="130" cy="130" r="22" />
      </g>
      <g fill="none" stroke="${palette.accentStrong}" stroke-width="2.4" stroke-linecap="round" opacity="0.8">
        <path d="M58 146 L104 88 L168 102 L198 154 L146 198 L82 186 Z" />
        <path d="M104 88 L130 46 L168 102" />
        <path d="M82 186 L62 218 L146 198" />
      </g>
      <g fill="${palette.accent}">
        <circle cx="58" cy="146" r="6" />
        <circle cx="104" cy="88" r="6" />
        <circle cx="168" cy="102" r="6" />
        <circle cx="198" cy="154" r="6" />
        <circle cx="146" cy="198" r="6" />
        <circle cx="82" cy="186" r="6" />
        <circle cx="130" cy="46" r="5" />
        <circle cx="62" cy="218" r="5" />
      </g>
    </svg>
    <svg viewBox="0 0 280 180" aria-hidden="true" style="position:absolute; bottom:84px; ${isRtl ? 'right' : 'left'}:42px; width:280px; height:180px; opacity:${themeMode === 'dark' ? '0.72' : '0.54'};">
      <g fill="none" stroke="${palette.border}" stroke-width="1.4">
        <path d="M20 136 C66 48, 116 44, 162 118 S248 158, 260 52" />
        <path d="M20 104 C54 142, 104 154, 140 94 S220 42, 260 118" />
      </g>
      <g fill="${palette.accentStrong}">
        <circle cx="20" cy="136" r="5" />
        <circle cx="66" cy="48" r="5" />
        <circle cx="116" cy="44" r="5" />
        <circle cx="162" cy="118" r="5" />
        <circle cx="214" cy="150" r="5" />
        <circle cx="260" cy="52" r="5" />
      </g>
    </svg>
    <div style="position:absolute; top:414px; ${isRtl ? 'left' : 'right'}:64px; transform:rotate(90deg); transform-origin:center; font-size:11px; font-weight:900; letter-spacing:0.3em; text-transform:uppercase; color:${palette.muted}; opacity:${themeMode === 'dark' ? '0.28' : '0.36'};">FACULTY OF SCIENCE</div>
    <div style="position:absolute; bottom:138px; ${isRtl ? 'right' : 'left'}:70px; font-size:64px; font-weight:900; letter-spacing:0.12em; color:${palette.grid}; opacity:${themeMode === 'dark' ? '0.56' : '0.88'};">Na+</div>
  </div>
`;

const buildMetadataMarkup = (
  metadata: ExportMetadataItem[] | undefined,
  palette: PdfThemePalette,
  isRtl: boolean
) => {
  const normalized = normalizeExportMetadata(metadata);
  if (!normalized.length) {
    return '';
  }

  return `
    <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; margin-top:24px;">
      ${normalized
        .map(
          (item) => `
            <div style="border:1px solid ${palette.border}; background:${palette.chipBackground}; border-radius:24px; padding:16px 18px; box-shadow:0 10px 24px rgba(15,23,42,0.06);">
              <div style="font-size:11px; font-weight:800; letter-spacing:0.18em; text-transform:uppercase; color:${palette.muted};">${escapeHtml(item.label)}</div>
              <div style="margin-top:8px; font-size:15px; font-weight:700; color:${palette.chipText}; direction:${hasArabicCharacters(item.value) ? 'rtl' : 'ltr'}; text-align:${hasArabicCharacters(item.value) ? 'right' : 'left'};">${formatInlineExportMarkup(item.value)}</div>
            </div>
          `
        )
        .join('')}
    </div>
  `;
};

const getContentBlocks = (content: string) =>
  content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

const joinRichLines = (lines: string[]) => lines.map((line) => formatInlineExportMarkup(line)).join('<br/>');

const renderTextContentMarkup = (content: string, palette: PdfThemePalette, isRtl: boolean) => {
  const blocks = getContentBlocks(content);

  return blocks
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) {
        return '';
      }

      if (/^```[\s\S]*```$/.test(block)) {
        const codeContent = block.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
        return `
          <pre style="margin:0 0 22px 0; padding:18px 20px; border-radius:24px; background:${palette.surfaceStrong}; border:1px solid ${palette.border}; color:${palette.text}; font-size:14px; line-height:1.9; overflow:auto; white-space:pre-wrap; font-family:'JetBrains Mono', 'Cascadia Code', 'Courier New', monospace;">${escapeHtml(codeContent)}</pre>
        `;
      }

      if (lines.length === 1 && /^(-{3,}|\*{3,})$/.test(lines[0])) {
        return `<div style="height:1px; margin:8px 0 24px; background:${palette.border};"></div>`;
      }

      if (lines.every((line) => /^>\s?/.test(line))) {
        return `
          <blockquote style="margin:0 0 22px 0; padding:18px 20px; border-radius:24px; border-inline-start:4px solid ${palette.accentStrong}; background:${palette.explanationBackground}; color:${palette.text}; line-height:1.95;">
            ${joinRichLines(lines.map((line) => line.replace(/^>\s?/, '')))}
          </blockquote>
        `;
      }

      if (lines.every((line) => /^[-*]\s+/.test(line))) {
        return `
          <ul style="margin:0; padding-${isRtl ? 'right' : 'left'}:24px; color:${palette.text}; line-height:1.95;">
            ${lines.map((line) => `<li style="margin:0 0 10px 0;">${formatInlineExportMarkup(line.replace(/^[-*]\s+/, ''))}</li>`).join('')}
          </ul>
        `;
      }

      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        return `
          <ol style="margin:0; padding-${isRtl ? 'right' : 'left'}:24px; color:${palette.text}; line-height:1.95;">
            ${lines.map((line) => `<li style="margin:0 0 10px 0;">${formatInlineExportMarkup(line.replace(/^\d+\.\s+/, ''))}</li>`).join('')}
          </ol>
        `;
      }

      const headingMatch = lines[0].match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const fontSize = level === 1 ? '30px' : level === 2 ? '24px' : '20px';
        const rest = lines.slice(1).join('<br/>');

        return `
          <section style="margin:0 0 24px 0;">
            <div style="font-size:${fontSize}; font-weight:900; letter-spacing:-0.03em; color:${palette.text};">${formatInlineExportMarkup(headingMatch[2])}</div>
            ${rest ? `<p style="margin:14px 0 0 0; color:${palette.muted}; line-height:1.95;">${joinRichLines(lines.slice(1))}</p>` : ''}
          </section>
        `;
      }

      return `<p style="margin:0 0 22px 0; color:${palette.text}; line-height:2; font-size:15px;">${joinRichLines(lines)}</p>`;
    })
    .join('');
};

const buildScientificPdfMarkup = (params: {
  title: string;
  summary?: string;
  metadata?: ExportMetadataItem[];
  themeMode: ExportThemeMode;
  isRtl: boolean;
  bodyMarkup: string;
  bodyEyebrow: string;
  heroImage?: string | null;
  highlightMetrics?: PdfMetricItem[];
}) => {
  // Keep direct PDF exports on the same theme/metadata source of truth as preview
  // so download styling stays aligned with the user-selected result mode.
  const { title, summary, metadata, themeMode, isRtl, bodyMarkup, bodyEyebrow, heroImage, highlightMetrics } = params;
  const palette = getPdfThemePalette(themeMode);
  const labels = getPdfLabels(isRtl);
  const metadataMarkup = buildMetadataMarkup(metadata, palette, isRtl);
  const metricsMarkup = buildMetricCardsMarkup(highlightMetrics, palette, isRtl);
  const themeLabel = themeMode === 'dark' ? labels.dark : labels.light;
  const exportDate = formatExportDate(isRtl);
  const copyrightLine = escapeHtml(COPYRIGHT).replace(/\n/g, ' &bull; ');

  return `
    <div lang="${isRtl ? 'ar' : 'en'}" style="width:1120px; position:relative; overflow:hidden; ${buildDocumentBackgroundCss(themeMode, { overlayOpacity: themeMode === 'dark' ? 0.82 : 0.9, backgroundSize: 'cover', backgroundPosition: 'center' })}; color:${palette.text}; padding:56px 54px 44px; font-family:${isRtl ? "'Segoe UI', Tahoma, Arial, sans-serif" : "Inter, 'Segoe UI', Arial, sans-serif"}; direction:${isRtl ? 'rtl' : 'ltr'}; text-align:${isRtl ? 'right' : 'left'}; unicode-bidi:plaintext; -webkit-font-smoothing:antialiased;">
      ${buildScientificBackdropMarkup(palette, themeMode, isRtl)}

      <div style="position:relative; z-index:1;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:28px; padding:28px 30px; border:1px solid ${palette.border}; border-radius:34px; background:${palette.surface}; box-shadow:0 18px 40px rgba(15,23,42,0.08);">
          <div style="flex:1;">
            <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
              <span style="display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:999px; background:${palette.accentSoft}; color:${palette.accentStrong}; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.18em;">${escapeHtml(bodyEyebrow)}</span>
              <span style="display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:999px; background:${palette.chipBackground}; color:${palette.muted}; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.16em;">${escapeHtml(labels.previewTheme)}: ${escapeHtml(themeLabel)}</span>
              <span style="display:inline-flex; align-items:center; gap:8px; padding:8px 14px; border-radius:999px; background:${palette.surfaceStrong}; color:${palette.muted}; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.16em;">${escapeHtml(labels.facultyReady)}</span>
            </div>
            <div style="margin-top:20px; font-size:40px; font-weight:900; letter-spacing:-0.05em; line-height:1.1;">${formatInlineExportMarkup(title)}</div>
            ${summary?.trim() ? `<p style="margin:18px 0 0 0; max-width:820px; color:${palette.muted}; font-size:16px; line-height:1.9;">${formatInlineExportMarkup(summary.trim())}</p>` : ''}
            <div style="margin-top:18px; display:flex; flex-wrap:wrap; gap:12px;">
              <span style="display:inline-flex; padding:10px 14px; border-radius:20px; background:${palette.surfaceSoft}; color:${palette.muted}; font-size:12px; font-weight:700; border:1px solid ${palette.border};">${escapeHtml(labels.generatedOn)}: ${escapeHtml(exportDate)}</span>
              <span style="display:inline-flex; padding:10px 14px; border-radius:20px; background:${palette.surfaceSoft}; color:${palette.muted}; font-size:12px; font-weight:700; border:1px solid ${palette.border};">${escapeHtml(labels.academicFormat)}</span>
            </div>
          </div>
          <div style="width:120px; text-align:${isRtl ? 'left' : 'right'};">
            <img src="${QR_CODE_DATA_URL}" alt="QR" style="width:76px; height:76px; border-radius:22px; background:#ffffff; padding:8px; border:1px solid ${palette.border};" />
            <div style="margin-top:12px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.16em; color:${palette.muted};">${escapeHtml(labels.verified)}</div>
          </div>
        </div>

        <div style="margin-top:18px; display:flex; flex-wrap:wrap; gap:12px;">
          <span style="display:inline-flex; padding:10px 14px; border-radius:20px; background:${palette.surfaceSoft}; color:${palette.muted}; font-size:12px; font-weight:700; border:1px solid ${palette.border};">${escapeHtml(labels.exportSummary)}</span>
          <span style="display:inline-flex; padding:10px 14px; border-radius:20px; background:${palette.surfaceSoft}; color:${palette.muted}; font-size:12px; font-weight:700; border:1px solid ${palette.border};">${escapeHtml(PLATFORM_TAGLINE)}</span>
        </div>

        ${metricsMarkup}

        ${metadataMarkup}

        ${heroImage ? `
          <div style="margin-top:28px; border:1px solid ${palette.border}; border-radius:30px; overflow:hidden; background:${palette.surface};">
            <div style="padding:14px 18px; border-bottom:1px solid ${palette.border}; color:${palette.muted}; font-size:11px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase;">${escapeHtml(labels.topicImage)}</div>
            <img src="${heroImage}" alt="${escapeHtml(labels.topicImage)}" style="display:block; width:100%; height:auto;" />
          </div>
        ` : ''}

        <div style="margin-top:28px; border:1px solid ${palette.border}; border-radius:34px; background:${palette.surface}; overflow:hidden;">
          <div style="padding:18px 22px; border-bottom:1px solid ${palette.border}; background:${palette.surfaceStrong}; color:${palette.accentStrong}; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:0.18em;">${escapeHtml(bodyEyebrow)}</div>
          <div style="padding:28px;">
            ${bodyMarkup}
          </div>
        </div>

        <div style="margin-top:24px; display:flex; justify-content:space-between; align-items:center; gap:18px; border-top:1px solid ${palette.border}; padding-top:18px; color:${palette.muted}; font-size:12px;">
          <div style="font-weight:800; letter-spacing:0.08em;">${copyrightLine}</div>
          <div style="font-weight:800;">WhatsApp: ${escapeHtml(WHATSAPP_NUMBER)}</div>
        </div>
      </div>
    </div>
  `;
};

const buildQuizDistributionSummary = (quiz: Quiz) => {
  const typeCounts: Record<string, number> = {};
  quiz.questions.forEach((question) => {
    typeCounts[question.type] = (typeCounts[question.type] || 0) + 1;
  });

  return Object.entries(typeCounts)
    .map(([type, count]) => `${type}: ${Math.round((count / Math.max(quiz.questions.length, 1)) * 100)}%`)
    .join(' | ');
};

const buildQuizBodyMarkup = (quiz: Quiz, themeMode: ExportThemeMode, labels: PdfLabels) => {
  const palette = getPdfThemePalette(themeMode);
  const answerChoicesLabel = labels.answerChoices ?? QUIZ_PRESENTATION_COPY.answerChoicesLabel;
  const choiceMatrixLabel = labels.choiceMatrix ?? QUIZ_PRESENTATION_COPY.answerChoicesEyebrow;
  const bestMatchLabel = labels.bestMatch ?? QUIZ_PRESENTATION_COPY.bestMatchLabel;
  const verifiedAnswerLabel = labels.verifiedAnswer ?? QUIZ_PRESENTATION_COPY.correctAnswerEyebrow;
  const whyItWorksLabel = labels.whyItWorks ?? QUIZ_PRESENTATION_COPY.explanationEyebrow;

  return quiz.questions
    .map((question, index) => {
      const correctMarker = getQuizCorrectAnswerMarker(question);
      const questionTitle = `${question.emoji ? `${question.emoji} ` : ''}${question.question}`;
      const optionsMarkup = Array.isArray(question.options) && question.options.length
        ? `
          <div style="margin-top:18px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="flex:1; height:1px; background:${palette.border};"></div>
              <div style="min-width:190px; border:1px solid ${palette.border}; background:${palette.surface}; border-radius:22px; padding:12px 16px; text-align:center; box-shadow:0 10px 24px rgba(15,23,42,0.06);">
                <div style="font-size:9px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase; color:${palette.muted};">${escapeHtml(choiceMatrixLabel)}</div>
                <div style="margin-top:6px; font-size:11px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase; color:${palette.accentStrong};">${escapeHtml(answerChoicesLabel)}</div>
              </div>
              <div style="flex:1; height:1px; background:${palette.border};"></div>
            </div>
            <div style="display:grid; gap:10px; margin-top:14px;">
            ${question.options
              .map((option, optionIndex) => {
                const isCorrect = option === question.correctAnswer;
                const marker = getQuizOptionMarker(optionIndex);
                return `
                  <div style="padding:13px 15px; border-radius:20px; border:1px solid ${isCorrect ? palette.accentStrong : palette.border}; background:${isCorrect ? palette.answerBackground : palette.surfaceSoft}; color:${palette.text}; font-size:15px; line-height:1.8;">
                    <div style="display:flex; align-items:flex-start; gap:12px;">
                      <div style="width:42px; height:42px; min-width:42px; border-radius:18px; display:flex; align-items:center; justify-content:center; border:1px solid ${isCorrect ? palette.accentStrong : palette.border}; background:${themeMode === 'dark' ? '#09111d' : '#f8fafc'}; box-shadow:0 8px 18px rgba(15,23,42,0.08);">
                        <div style="width:30px; height:30px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; border:1px solid ${isCorrect ? palette.accentStrong : palette.border}; background:${themeMode === 'dark' ? '#0f172a' : '#ffffff'}; color:${isCorrect ? palette.accentStrong : palette.muted};">
                          ${escapeHtml(marker)}
                        </div>
                      </div>
                      <div style="flex:1; min-width:0;">
                        <div style="font-size:15px; line-height:1.8; color:${palette.text};">${formatInlineExportMarkup(option)}</div>
                        ${isCorrect ? `<div style="margin-top:8px; display:inline-flex; align-items:center; padding:6px 10px; border-radius:999px; border:1px solid ${palette.accentSoft}; background:${palette.accentSoft}; font-size:10px; font-weight:900; letter-spacing:0.16em; text-transform:uppercase; color:${palette.accentStrong};">${escapeHtml(bestMatchLabel)}</div>` : ''}
                      </div>
                    </div>
                  </div>
                `;
              })
              .join('')}
            </div>
          </div>
        `
        : '';
      const answerText = formatQuizCorrectAnswerText(question);

      return `
        <section style="page-break-inside:avoid; break-inside:avoid; border:1px solid ${palette.border}; border-radius:28px; padding:22px 22px 20px; background:${palette.surfaceSoft}; margin-bottom:20px; box-shadow:0 12px 28px rgba(15,23,42,0.05);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap;">
            <div style="display:inline-flex; align-items:center; gap:10px; padding:8px 14px; border-radius:999px; background:${palette.accentSoft}; color:${palette.accentStrong}; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.16em;">${escapeHtml(labels.question)} ${index + 1}</div>
            <div style="font-size:12px; color:${palette.muted}; font-weight:700;">${formatInlineExportMarkup(question.type)}</div>
          </div>
          <div style="margin-top:18px; font-size:22px; font-weight:900; line-height:1.45; color:${palette.text};">${formatInlineExportMarkup(questionTitle)}</div>
          ${optionsMarkup}
          <div style="display:grid; gap:12px; margin-top:18px;">
            <div style="padding:16px 18px; border-radius:22px; background:${palette.answerBackground}; border:1px solid ${palette.border};">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                <div>
                  <div style="font-size:10px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase; color:${palette.accentStrong}; opacity:0.85;">${escapeHtml(verifiedAnswerLabel)}</div>
                  <div style="margin-top:8px; font-size:11px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase; color:${palette.accentStrong};">${escapeHtml(labels.correctAnswer)}</div>
                </div>
                ${correctMarker ? `<div style="width:40px; height:40px; min-width:40px; border-radius:16px; display:flex; align-items:center; justify-content:center; border:1px solid ${palette.accentStrong}; background:${themeMode === 'dark' ? '#0f172a' : '#ffffff'}; color:${palette.accentStrong}; font-size:14px; font-weight:900; box-shadow:0 8px 18px rgba(15,23,42,0.08);">${escapeHtml(correctMarker)}</div>` : ''}
              </div>
              <div style="margin-top:8px; font-size:15px; line-height:1.85; color:${palette.text};">${formatInlineExportMarkup(answerText)}</div>
            </div>
            <div style="padding:16px 18px; border-radius:22px; background:${palette.explanationBackground}; border:1px solid ${palette.border};">
              <div style="font-size:10px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase; color:${palette.muted}; opacity:0.9;">${escapeHtml(whyItWorksLabel)}</div>
              <div style="margin-top:8px; font-size:11px; font-weight:900; letter-spacing:0.18em; text-transform:uppercase; color:${palette.muted};">${escapeHtml(labels.explanation)}</div>
              <div style="margin-top:8px; font-size:15px; line-height:1.9; color:${palette.text};">${formatInlineExportMarkup(question.explanation)}</div>
            </div>
          </div>
        </section>
      `;
    })
    .join('');
};

const buildQuizPdfMarkup = (
  quiz: Quiz,
  topicImage: string | null | undefined,
  options: ExportOptions | undefined,
  themeMode: ExportThemeMode
) => {
  // Quiz downloads stay structured here instead of regex-slicing rendered markup so
  // future PDF design changes can preserve Arabic-safe layout and export fidelity.
  const isRtl =
    quiz.language === 'Arabic' ||
    hasArabicCharacters(quiz.title) ||
    quiz.questions.some((question) => hasArabicCharacters(question.question) || hasArabicCharacters(question.explanation));
  const labels = getPdfLabels(isRtl);
  const distributionSummary = buildQuizDistributionSummary(quiz);
  const exportMetadata = mergeExportMetadata(
    [
      { label: isRtl ? 'اللغة' : 'Language', value: quiz.language },
      { label: labels.totalQuestions, value: String(quiz.questions.length) },
      { label: labels.questionMix, value: distributionSummary },
    ],
    options?.metadata
  );

  return buildScientificPdfMarkup({
    title: quiz.title,
    summary: options?.summary,
    metadata: exportMetadata,
    themeMode,
    isRtl,
    heroImage: topicImage,
    bodyEyebrow: labels.questionSet,
    highlightMetrics: [
      { label: labels.totalQuestions, value: String(quiz.questions.length) },
      { label: labels.questionMix, value: distributionSummary },
      { label: labels.previewTheme, value: themeMode === 'dark' ? labels.dark : labels.light },
    ],
    bodyMarkup: buildQuizBodyMarkup(quiz, themeMode, labels),
  });
};

const buildTextPdfMarkup = (
  title: string,
  content: string,
  options: ExportOptions | undefined,
  themeMode: ExportThemeMode
) => {
  const combined = [title, options?.summary || '', content, buildMetadataSummaryLine(options?.metadata) || ''].join('\n');
  const isRtl = hasArabicCharacters(combined);
  const labels = getPdfLabels(isRtl);
  const palette = getPdfThemePalette(themeMode);
  const blocks = getContentBlocks(content);
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const exportMetadata = mergeExportMetadata(
    [
      { label: labels.contentBlocks, value: String(blocks.length) },
      { label: labels.totalWords, value: String(wordCount) },
    ],
    options?.metadata
  );

  return buildScientificPdfMarkup({
    title,
    summary: options?.summary,
    metadata: exportMetadata,
    themeMode,
    isRtl,
    heroImage: null,
    bodyEyebrow: labels.content,
    highlightMetrics: [
      { label: labels.contentBlocks, value: String(blocks.length) },
      { label: labels.totalWords, value: String(wordCount) },
      { label: labels.previewTheme, value: themeMode === 'dark' ? labels.dark : labels.light },
    ],
    bodyMarkup: renderTextContentMarkup(content, palette, isRtl),
  });
};

const renderMarkupToPdf = async (
  markup: string,
  fileName: string,
  themeMode: ExportThemeMode
) => {
  if (typeof document === 'undefined') {
    throw new Error('Document is unavailable for snapshot PDF export.');
  }

  const host = document.createElement('div');
  host.setAttribute('data-export-host', 'zootopia-pdf');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '1120px';
  host.style.padding = '24px 0';
  host.style.pointerEvents = 'none';
  host.style.opacity = '1';
  host.style.background = resolveDocumentBackgroundBaseColor(themeMode);
  host.innerHTML = markup;
  document.body.appendChild(host);

  try {
    // Architecture-sensitive: text/quiz PDFs use a styled HTML snapshot first so
    // themed decoration, browser typography, and Arabic RTL shaping stay closer
    // to the on-screen preview/export surfaces. Legacy jsPDF layout remains fallback.
    const documentWithFonts = document as DomDocumentWithFonts;
    if ('fonts' in documentWithFonts && documentWithFonts.fonts?.ready) {
      await documentWithFonts.fonts.ready;
    }

    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await waitForImages(host);

    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: getPdfThemePalette(themeMode).pageBackground,
      windowWidth: 1200,
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4',
      hotfixes: ['px_scaling'],
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    const imgData = canvas.toDataURL('image/png', 1.0);
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(fileName);
  } finally {
    host.remove();
  }
};

export const exportElementToPDF = async (input: {
  element: HTMLElement | null;
  fileNameStem: string;
  themeMode?: ExportThemeMode;
  context: SnapshotExportContext;
}) => {
  const { element, fileNameStem, context } = input;
  const themeMode = resolveExportThemeMode(input.themeMode);
  const fileName = buildExportFileName(fileNameStem, 'pdf');

  if (typeof document === 'undefined' || !element) {
    logger.warn('Snapshot PDF export aborted because the export element is missing.', {
      ...context,
      fileName,
    });
    return false;
  }

  const host = createSnapshotHost(themeMode);
  const snapshot = element.cloneNode(true);
  host.appendChild(snapshot);
  document.body.appendChild(host);

  logger.info('Starting snapshot PDF export.', {
    ...context,
    fileName,
    themeMode,
  });

  try {
    const documentWithFonts = document as DomDocumentWithFonts;
    if ('fonts' in documentWithFonts && documentWithFonts.fonts?.ready) {
      await documentWithFonts.fonts.ready;
    }

    await waitForAnimationFrame();
    await waitForAnimationFrame();
    await waitForImages(host);

    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      imageTimeout: 15000,
      backgroundColor: getPdfThemePalette(themeMode).pageBackground,
      windowWidth: 1440,
    });

    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('EXPORT_CANVAS_EMPTY');
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: 'a4',
      hotfixes: ['px_scaling'],
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/png', 1.0);

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(fileName);

    logger.info('Snapshot PDF export completed.', {
      ...context,
      fileName,
    });

    return true;
  } catch (error) {
    logger.error('Snapshot PDF export failed.', {
      ...context,
      fileName,
      error,
    });
    return false;
  } finally {
    host.remove();
  }
};

export const exportElementToImage = async (input: {
  element: HTMLElement | null;
  fileNameStem: string;
  format?: 'png' | 'jpg' | 'jpeg' | 'webp';
  themeMode?: ExportThemeMode;
  context: SnapshotExportContext;
}) => {
  const { element, fileNameStem, context } = input;
  const themeMode = resolveExportThemeMode(input.themeMode);
  const format = input.format || 'png';
  const mimeType =
    format === 'jpg' || format === 'jpeg'
      ? 'image/jpeg'
      : format === 'webp'
        ? 'image/webp'
        : 'image/png';
  const fileName = buildExportFileName(fileNameStem, format === 'jpeg' ? 'jpg' : format);

  if (typeof document === 'undefined' || !element) {
    logger.warn('Snapshot image export aborted because the export element is missing.', {
      ...context,
      fileName,
    });
    return false;
  }

  const host = createSnapshotHost(themeMode);
  const snapshot = element.cloneNode(true);
  host.appendChild(snapshot);
  document.body.appendChild(host);

  logger.info('Starting snapshot image export.', {
    ...context,
    fileName,
    themeMode,
    format,
  });

  try {
    const documentWithFonts = document as DomDocumentWithFonts;
    if ('fonts' in documentWithFonts && documentWithFonts.fonts?.ready) {
      await documentWithFonts.fonts.ready;
    }

    await waitForAnimationFrame();
    await waitForAnimationFrame();
    await waitForImages(host);

    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      logging: false,
      imageTimeout: 15000,
      backgroundColor: getPdfThemePalette(themeMode).pageBackground,
      windowWidth: 1440,
    });

    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('EXPORT_CANVAS_EMPTY');
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, 1);
    });

    if (!blob) {
      throw new Error('EXPORT_IMAGE_BLOB_UNAVAILABLE');
    }

    await downloadBlobToFile({
      blob,
      fileName,
      context: {
        area: context.area,
        event: context.event,
        resultTitle: context.resultTitle,
        resultType: context.resultType,
        sourceTool: context.sourceTool,
      },
    });

    logger.info('Snapshot image export completed.', {
      ...context,
      fileName,
      format,
    });

    return true;
  } catch (error) {
    logger.error('Snapshot image export failed.', {
      ...context,
      fileName,
      format,
      error,
    });
    return false;
  } finally {
    host.remove();
  }
};

const drawHeader = (doc: any, pageWidth: number, title: string, themeMode: ExportThemeMode) => {
  const isDark = themeMode === 'dark';
  const headerColor = isDark ? [6, 95, 70] : BRANDING_COLORS.primary;
  doc.setFillColor(...headerColor);
  doc.rect(0, 0, pageWidth, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(PLATFORM_NAME, 20, 25);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(PLATFORM_TAGLINE, 20, 32);
  
  // Seal and Barcode
  drawBrandingSeal(doc, pageWidth - 30, 20, 10);
  drawQRCode(doc, pageWidth - 45, 15, 10);
};

const applyPageThemeBackground = (doc: any, pageWidth: number, pageHeight: number, themeMode: ExportThemeMode) => {
  const rgb = themeMode === 'dark' ? [10, 15, 29] : [255, 255, 255];
  doc.setFillColor(...rgb);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');
};

const drawLegacyPdfDocumentBackground = (
  doc: any,
  pageWidth: number,
  pageHeight: number,
  backgroundDataUrl: string | null
) => {
  if (!backgroundDataUrl) {
    return;
  }

  try {
    doc.addImage(backgroundDataUrl, 'PNG', 0, 0, pageWidth, pageHeight);
  } catch {
    // Background images are decorative enhancement only. Export must continue
    // even if a background asset fails to draw in the legacy jsPDF fallback.
  }
};

const legacyExportToPDF = async (quiz: Quiz, topicImage?: string | null, options?: ExportOptions) => {
  const themeMode = resolveExportThemeMode(options?.themeMode);
  const isDark = themeMode === 'dark';
  const metadataLine = buildMetadataSummaryLine(options?.metadata);
  const backgroundDataUrl = await loadDocumentBackgroundDataUrl(themeMode);

  const doc: any = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 40;

  // Architecture-sensitive: PDF exports must reflect the active preview theme.
  // We resolve from explicit options first, then persisted theme selection.
  applyPageThemeBackground(doc, pageWidth, pageHeight, themeMode);
  drawLegacyPdfDocumentBackground(doc, pageWidth, pageHeight, backgroundDataUrl);
  drawHeader(doc, pageWidth, quiz.title, themeMode);

  // Topic Image if provided
  if (topicImage) {
    try {
      doc.addImage(topicImage, 'PNG', 20, y, pageWidth - 40, 60);
      y += 70;
    } catch (e) {
      console.error("Failed to add image to PDF", e);
    }
  }

  // Quiz Title
  doc.setTextColor(...(isDark ? [241, 245, 249] : [31, 41, 55]));
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(quiz.title, 20, y);
  y += 10;

  // Metadata
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...(isDark ? [148, 163, 184] : [107, 114, 128]));
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | Language: ${quiz.language}`, 20, y);
  y += 8;

  if (metadataLine) {
    doc.setFontSize(8);
    const metadataLines = doc.splitTextToSize(metadataLine, pageWidth - 40);
    doc.text(metadataLines, 20, y);
    y += metadataLines.length * 4 + 4;
  }

  // Percentage Distribution
  const typeCounts: Record<string, number> = {};
  quiz.questions.forEach(q => {
    typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;
  });
  const total = quiz.questions.length;
  const distribution = Object.entries(typeCounts)
    .map(([type, count]) => `${type}: ${Math.round((count / total) * 100)}%`)
    .join(" | ");
  
  doc.setFontSize(8);
  doc.text(`Distribution: ${distribution}`, 20, y);
  y += 12;
  y = addOptionalSummaryBlock(doc, y, pageWidth, options?.summary, themeMode);

  const ensurePageRoom = (requiredHeight = 24) => {
    if (y + requiredHeight <= pageHeight - 18) {
      return;
    }

    doc.addPage();
    applyPageThemeBackground(doc, pageWidth, pageHeight, themeMode);
    drawLegacyPdfDocumentBackground(doc, pageWidth, pageHeight, backgroundDataUrl);
    y = 20;
  };

  quiz.questions.forEach((q, i) => {
    const questionTitle = `${q.emoji ? `${q.emoji} ` : ''}${q.question}`;
    const answerText = formatQuizCorrectAnswerText(q);
    const correctMarker = getQuizCorrectAnswerMarker(q);

    ensurePageRoom(42);

    // Question Number & Text
    doc.setFillColor(...(isDark ? [22, 101, 52] : [240, 253, 244]));
    doc.roundedRect(15, y - 5, pageWidth - 30, 12, 3, 3, 'F');
    doc.setTextColor(...(isDark ? [236, 253, 245] : [5, 150, 105]));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`QUESTION ${i + 1}`, 20, y + 3);
    y += 14;

    doc.setTextColor(...(isDark ? [241, 245, 249] : [31, 41, 55]));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const questionLines = doc.splitTextToSize(questionTitle, pageWidth - 40);
    doc.text(questionLines, 20, y);
    y += questionLines.length * 7 + 6;

    // Options
    if (q.options?.length) {
      ensurePageRoom(18);
      doc.setDrawColor(...(isDark ? [63, 63, 70] : [209, 213, 219]));
      doc.line(25, y + 2, 52, y + 2);
      doc.line(pageWidth - 52, y + 2, pageWidth - 25, y + 2);
      doc.setFillColor(...(isDark ? [6, 78, 59] : [236, 253, 245]));
      doc.roundedRect(pageWidth / 2 - 34, y - 5, 68, 14, 4, 4, 'F');
      doc.setTextColor(...(isDark ? [167, 243, 208] : [5, 150, 105]));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(QUIZ_PRESENTATION_COPY.answerChoicesLabel.toUpperCase(), pageWidth / 2, y + 1.8, { align: 'center' });
      y += 16;

      q.options.forEach((opt, idx) => {
        const isCorrect = opt === q.correctAnswer;
        const optionLines = doc.splitTextToSize(opt, pageWidth - 82);
        const optionHeight = Math.max(optionLines.length * 5 + (isCorrect ? 18 : 12), 16);

        ensurePageRoom(optionHeight + 4);

        doc.setFillColor(...(isCorrect ? (isDark ? [6, 78, 59] : [236, 253, 245]) : isDark ? [24, 24, 27] : [249, 250, 251]));
        doc.roundedRect(25, y - 5, pageWidth - 50, optionHeight, 4, 4, 'F');
        doc.setDrawColor(...(isCorrect ? [16, 185, 129] : isDark ? [71, 85, 105] : [229, 231, 235]));
        doc.circle(34, y + 2, 5, 'S');
        doc.setFillColor(...(isDark ? [15, 23, 42] : [255, 255, 255]));
        doc.circle(34, y + 2, 4.1, 'F');
        doc.setTextColor(16, 185, 129);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(getQuizOptionMarker(idx), 31.8, y + 3);
        doc.setTextColor(...(isDark ? [226, 232, 240] : [75, 85, 99]));
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(optionLines, 43, y + 2);

        if (isCorrect) {
          doc.setTextColor(5, 150, 105);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.text(QUIZ_PRESENTATION_COPY.bestMatchLabel.toUpperCase(), 43, y + optionLines.length * 5 + 4);
        }

        y += optionHeight + 3;
      });
    }

    // Answer & Explanation
    y += 4;
    const answerLines = doc.splitTextToSize(answerText, pageWidth - 68);
    const answerHeight = Math.max(answerLines.length * 5 + 16, 24);
    const explanationLines = doc.splitTextToSize(q.explanation, pageWidth - 50);
    const explanationHeight = Math.max(explanationLines.length * 5 + 16, 24);

    ensurePageRoom(answerHeight + explanationHeight + 16);

    doc.setFillColor(...(isDark ? [22, 101, 52] : [236, 253, 245]));
    doc.roundedRect(20, y - 4, pageWidth - 40, answerHeight, 4, 4, 'F');
    doc.setTextColor(5, 150, 105);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(QUIZ_PRESENTATION_COPY.correctAnswerEyebrow.toUpperCase(), 25, y + 1);
    doc.setFontSize(9);
    doc.text("CORRECT ANSWER", 25, y + 7);

    if (correctMarker) {
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(pageWidth - 36, y - 1, 12, 12, 3, 3, 'S');
      doc.setTextColor(16, 185, 129);
      doc.setFontSize(10);
      doc.text(correctMarker, pageWidth - 32.2, y + 7);
    }

    doc.setTextColor(...(isDark ? [241, 245, 249] : [31, 41, 55]));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(answerLines, 25, y + 14);
    y += answerHeight + 6;

    doc.setFillColor(...(isDark ? [15, 23, 42] : [248, 250, 252]));
    doc.roundedRect(20, y - 4, pageWidth - 40, explanationHeight, 4, 4, 'F');
    doc.setTextColor(107, 114, 128);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(QUIZ_PRESENTATION_COPY.explanationEyebrow.toUpperCase(), 25, y + 1);
    doc.setFontSize(9);
    doc.text("EXPLANATION", 25, y + 7);
    doc.setTextColor(...(isDark ? [226, 232, 240] : [75, 85, 99]));
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text(explanationLines, 25, y + 14);
    y += explanationHeight + 6;
  });

  // Footer on last page
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...(isDark ? [148, 163, 184] : [156, 163, 175]));
  doc.text(`${COPYRIGHT} | WhatsApp: ${WHATSAPP_NUMBER}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

  doc.save(buildExportFileName(quiz.title, 'pdf'));
};

export const exportToDocx = async (quiz: Quiz, options?: ExportOptions) => {
  if (!hasQuizExportContent(quiz)) {
    logger.warn('DOCX export aborted because quiz payload is incomplete.', {
      area: 'result-export',
      event: 'docx-export-invalid-quiz',
      format: 'docx',
      resultTitle: quiz?.title,
      resultType: 'quiz',
    });
    return false;
  }

  const themeMode = resolveExportThemeMode(options?.themeMode);
  const metadataLine = buildMetadataSummaryLine(options?.metadata);
  const children = [
    // Header with Logo-like styling
    new Paragraph({
      children: [
        new TextRun({ text: "ZOOTOPIA ", bold: true, size: 48, color: "111827" }),
        new TextRun({ text: "CLUB", bold: true, size: 48, color: "10b981" }),
      ],
      alignment: "center",
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "THE ULTIMATE AI SCIENCE PLATFORM", size: 16, color: "9ca3af", characterSpacing: 100 }),
      ],
      alignment: "center",
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: quiz.title, bold: true, size: 36 }),
      ],
      alignment: "center",
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Generated on: ${new Date().toLocaleDateString()} | Language: ${quiz.language} | Preview Theme: ${themeMode}`, size: 18, color: "666666" }),
      ],
      alignment: "center",
      spacing: { after: 800 },
    }),
  ];

  if (metadataLine) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: metadataLine, size: 18, color: "666666" }),
      ],
      alignment: "center",
      spacing: { after: 240 },
    }));
  }

  if (options?.summary?.trim()) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: options.summary.trim(), italics: true, size: 20, color: themeMode === 'dark' ? "e2e8f0" : "374151" }),
      ],
      spacing: { after: 420 },
    }));
  }

  quiz.questions.forEach((q, i) => {
    const questionTitle = `${q.emoji ? `${q.emoji} ` : ''}${q.question}`;
    const correctMarker = getQuizCorrectAnswerMarker(q);

    children.push(new Paragraph({
      children: [
        new TextRun({ text: `QUESTION ${i + 1}`, bold: true, size: 24, color: "10b981" }),
      ],
      spacing: { before: 400, after: 200 },
    }));
    
    children.push(new Paragraph({
      children: [new TextRun({ text: questionTitle, bold: true, size: 28 })],
      spacing: { after: 300 },
    }));
    
    if (q.options?.length) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${QUIZ_PRESENTATION_COPY.answerChoicesEyebrow.toUpperCase()}  `, bold: true, size: 16, color: "64748b" }),
          new TextRun({ text: QUIZ_PRESENTATION_COPY.answerChoicesLabel.toUpperCase(), bold: true, size: 16, color: "10b981" }),
        ],
        spacing: { after: 120 },
      }));

      q.options.forEach((opt, idx) => {
        const isCorrect = opt === q.correctAnswer;
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${formatQuizOptionWithMarker(opt, idx)} `, bold: isCorrect, color: isCorrect ? "059669" : "1f2937" }),
            ...(isCorrect
              ? [new TextRun({ text: `(${QUIZ_PRESENTATION_COPY.bestMatchLabel})`, bold: true, color: "10b981" })]
              : []),
          ],
          indent: { left: 720 },
          spacing: { after: 150 },
        }));
      });

      children.push(new Paragraph({
        children: [],
        spacing: { after: 120 },
      }));
    }

    const answerText = formatQuizCorrectAnswerText(q);

    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${QUIZ_PRESENTATION_COPY.correctAnswerEyebrow.toUpperCase()}  `, bold: true, size: 18, color: "059669" }),
        new TextRun({ text: "CORRECT ANSWER: ", bold: true, size: 20, color: "10b981" }),
        ...(correctMarker ? [new TextRun({ text: `[${correctMarker}] `, bold: true, size: 20, color: "047857" })] : []),
        new TextRun({ text: answerText, bold: true, size: 20 }),
      ],
      spacing: { before: 200, after: 100 },
    }));

    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${QUIZ_PRESENTATION_COPY.explanationEyebrow.toUpperCase()}  `, bold: true, size: 16, color: "64748b" }),
        new TextRun({ text: "EXPLANATION: ", bold: true, size: 18, color: "999999" }),
        new TextRun({ text: q.explanation, italics: true, size: 18, color: "666666" }),
      ],
      spacing: { after: 400 },
    }));
  });

  children.push(new Paragraph({
    children: [new TextRun({ text: `${COPYRIGHT} | WhatsApp: ${WHATSAPP_NUMBER}`, size: 16, color: "999999" })],
    alignment: "center",
    spacing: { before: 800 },
  }));

  const doc = new DocxDocument({
    sections: [{ children }],
  });

  try {
    const blob = await Packer.toBlob(doc);
    saveAs(blob, buildExportFileName(quiz.title, 'docx'));

    logger.info('DOCX export completed.', {
      area: 'result-export',
      event: 'docx-export-completed',
      format: 'docx',
      resultTitle: quiz.title,
      resultType: 'quiz',
      themeMode,
    });
    return true;
  } catch (error) {
    logger.error('DOCX export failed.', {
      area: 'result-export',
      event: 'docx-export-failed',
      format: 'docx',
      resultTitle: quiz.title,
      resultType: 'quiz',
      themeMode,
      error,
    });
    return false;
  }
};

const legacyExportTextToPDF = async (title: string, content: string, options?: ExportOptions) => {
  const themeMode = resolveExportThemeMode(options?.themeMode);
  const isDark = themeMode === 'dark';
  const metadataLine = buildMetadataSummaryLine(options?.metadata);
  const backgroundDataUrl = await loadDocumentBackgroundDataUrl(themeMode);

  const doc: any = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 40;

  applyPageThemeBackground(doc, pageWidth, pageHeight, themeMode);
  drawLegacyPdfDocumentBackground(doc, pageWidth, pageHeight, backgroundDataUrl);
  drawHeader(doc, pageWidth, title, themeMode);

  // Title
  doc.setTextColor(...(isDark ? [241, 245, 249] : [31, 41, 55]));
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(title, 20, y);
  y += 10;

  // Metadata
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...(isDark ? [148, 163, 184] : [107, 114, 128]));
  doc.text(`Generated on: ${new Date().toLocaleDateString()} | Preview Theme: ${themeMode}`, 20, y);
  y += 15;

  if (metadataLine) {
    doc.setFontSize(8);
    const metadataLines = doc.splitTextToSize(metadataLine, pageWidth - 40);
    doc.text(metadataLines, 20, y);
    y += metadataLines.length * 4 + 6;
  }

  y = addOptionalSummaryBlock(doc, y, pageWidth, options?.summary, themeMode);

  // Content
  doc.setTextColor(...(isDark ? [226, 232, 240] : [31, 41, 55]));
  doc.setFontSize(12);
  const contentLines = doc.splitTextToSize(content, pageWidth - 40);
  
  contentLines.forEach((line: string) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      applyPageThemeBackground(doc, pageWidth, pageHeight, themeMode);
      drawLegacyPdfDocumentBackground(doc, pageWidth, pageHeight, backgroundDataUrl);
      y = 20;
    }
    doc.text(line, 20, y);
    y += 6;
  });

  // Footer on last page
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...(isDark ? [148, 163, 184] : [156, 163, 175]));
  doc.text(`${COPYRIGHT} | WhatsApp: ${WHATSAPP_NUMBER}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

  doc.save(buildExportFileName(title, 'pdf'));
};

export const exportToPDF = async (quiz: Quiz, topicImage?: string | null, options?: ExportOptions) => {
  if (!hasQuizExportContent(quiz)) {
    logger.warn('Quiz PDF export aborted because quiz payload is incomplete.', {
      area: 'result-export',
      event: 'pdf-export-invalid-quiz',
      format: 'pdf',
      resultTitle: quiz?.title,
      resultType: 'quiz',
    });
    return false;
  }

  const themeMode = resolveExportThemeMode(options?.themeMode);
  const fileName = buildExportFileName(quiz.title, 'pdf');
  const snapshotMarkup = buildQuizPdfMarkup(quiz, topicImage, options, themeMode);

  logger.info('Starting quiz PDF export.', {
    area: 'result-export',
    event: 'pdf-export-started',
    format: 'pdf',
    resultTitle: quiz.title,
    resultType: 'quiz',
    themeMode,
  });

  try {
    await renderMarkupToPdf(snapshotMarkup, fileName, themeMode);
    logger.info('Quiz PDF export completed.', {
      area: 'result-export',
      event: 'pdf-export-completed',
      format: 'pdf',
      resultTitle: quiz.title,
      resultType: 'quiz',
      themeMode,
    });
    return true;
  } catch (error) {
    logger.warn('Falling back to legacy quiz PDF export.', {
      area: 'result-export',
      event: 'pdf-export-fallback',
      format: 'pdf',
      resultTitle: quiz.title,
      resultType: 'quiz',
      themeMode,
      error,
    });

    try {
      await legacyExportToPDF(quiz, topicImage, options);
      return true;
    } catch (legacyError) {
      logger.error('Quiz PDF export failed after fallback.', {
        area: 'result-export',
        event: 'pdf-export-failed',
        format: 'pdf',
        resultTitle: quiz.title,
        resultType: 'quiz',
        themeMode,
        error: legacyError,
      });
      return false;
    }
  }
};

export const exportTextToPDF = async (title: string, content: string, options?: ExportOptions) => {
  if (!hasTextExportContent(title, content)) {
    logger.warn('Text PDF export aborted because text payload is empty.', {
      area: 'result-export',
      event: 'text-pdf-export-invalid-content',
      format: 'pdf',
      resultTitle: title,
      resultType: 'text',
    });
    return false;
  }

  const themeMode = resolveExportThemeMode(options?.themeMode);
  const fileName = buildExportFileName(title, 'pdf');
  const snapshotMarkup = buildTextPdfMarkup(title, content, options, themeMode);

  logger.info('Starting text PDF export.', {
    area: 'result-export',
    event: 'text-pdf-export-started',
    format: 'pdf',
    resultTitle: title,
    resultType: 'text',
    themeMode,
  });

  try {
    await renderMarkupToPdf(snapshotMarkup, fileName, themeMode);
    logger.info('Text PDF export completed.', {
      area: 'result-export',
      event: 'text-pdf-export-completed',
      format: 'pdf',
      resultTitle: title,
      resultType: 'text',
      themeMode,
    });
    return true;
  } catch (error) {
    logger.warn('Falling back to legacy text PDF export.', {
      area: 'result-export',
      event: 'text-pdf-export-fallback',
      format: 'pdf',
      resultTitle: title,
      resultType: 'text',
      themeMode,
      error,
    });

    try {
      await legacyExportTextToPDF(title, content, options);
      return true;
    } catch (legacyError) {
      logger.error('Text PDF export failed after fallback.', {
        area: 'result-export',
        event: 'text-pdf-export-failed',
        format: 'pdf',
        resultTitle: title,
        resultType: 'text',
        themeMode,
        error: legacyError,
      });
      return false;
    }
  }
};

export const exportTextToMarkdown = async (title: string, content: string, options?: ExportOptions) => {
  if (!hasTextExportContent(title, content)) {
    logger.warn('Text markdown export aborted because content is empty.', {
      area: 'result-export',
      event: 'markdown-export-invalid-content',
      format: 'markdown',
      resultTitle: title,
      resultType: 'text',
    });
    return false;
  }

  const themeMode = resolveExportThemeMode(options?.themeMode);
  let md = `# ZOOTOPIA CLUB\n`;
  md += `### THE ULTIMATE AI SCIENCE PLATFORM\n\n`;
  md += `## ${title}\n\n`;
  md += `*Generated on: ${new Date().toLocaleDateString()} | Preview Theme: ${themeMode}*\n\n`;
  if (options?.summary?.trim()) {
    md += `> ${options.summary.trim()}\n\n`;
  }
  md += appendMetadataListMarkdown(options?.metadata);
  md += `---\n\n`;
  md += content;
  md += `\n\n*${COPYRIGHT} | WhatsApp: ${WHATSAPP_NUMBER}*`;

  const blob = new Blob([md], { type: 'text/markdown' });
  try {
    saveAs(blob, buildExportFileName(title, 'md'));
    return true;
  } catch (error) {
    logger.error('Text markdown export failed.', {
      area: 'result-export',
      event: 'markdown-export-failed',
      format: 'markdown',
      resultTitle: title,
      resultType: 'text',
      themeMode,
      error,
    });
    return false;
  }
};
export const exportToMarkdown = async (quiz: Quiz, options?: ExportOptions) => {
  if (!hasQuizExportContent(quiz)) {
    logger.warn('Quiz markdown export aborted because quiz payload is incomplete.', {
      area: 'result-export',
      event: 'quiz-markdown-export-invalid-quiz',
      format: 'markdown',
      resultTitle: quiz?.title,
      resultType: 'quiz',
    });
    return false;
  }

  const themeMode = resolveExportThemeMode(options?.themeMode);
  let md = `# ZOOTOPIA CLUB\n`;
  md += `### THE ULTIMATE AI SCIENCE PLATFORM\n\n`;
  md += `## ${quiz.title}\n\n`;
  md += `*Generated on: ${new Date().toLocaleDateString()} | Language: ${quiz.language} | Preview Theme: ${themeMode}*\n\n`;
  if (options?.summary?.trim()) {
    md += `> ${options.summary.trim()}\n\n`;
  }
  md += appendMetadataListMarkdown(options?.metadata);
  md += `---\n\n`;
  
  quiz.questions.forEach((q, i) => {
    const questionTitle = `${q.emoji ? `${q.emoji} ` : ''}${q.question}`;
    md += `### QUESTION ${i + 1}\n`;
    md += `**${questionTitle}**\n\n`;
    
    if (q.options?.length) {
      md += `*${QUIZ_PRESENTATION_COPY.answerChoicesEyebrow}*\n\n`;
      q.options.forEach((opt, idx) => {
        const isCorrect = opt === q.correctAnswer;
        md += `- **${formatQuizOptionWithMarker(opt, idx)}**${isCorrect ? ` (${QUIZ_PRESENTATION_COPY.bestMatchLabel})` : ''}\n`;
      });
      md += '\n';
    }

    const answerText = formatQuizCorrectAnswerText(q);

    md += `> **${QUIZ_PRESENTATION_COPY.correctAnswerEyebrow} | CORRECT ANSWER:** ${answerText}\n\n`;
    md += `*${QUIZ_PRESENTATION_COPY.explanationEyebrow} | EXPLANATION:* ${q.explanation}\n\n`;
    md += `---\n\n`;
  });

  md += `\n\n*${COPYRIGHT} | WhatsApp: ${WHATSAPP_NUMBER}*`;

  const blob = new Blob([md], { type: 'text/markdown' });
  try {
    saveAs(blob, buildExportFileName(quiz.title, 'md'));
    return true;
  } catch (error) {
    logger.error('Quiz markdown export failed.', {
      area: 'result-export',
      event: 'quiz-markdown-export-failed',
      format: 'markdown',
      resultTitle: quiz.title,
      resultType: 'quiz',
      themeMode,
      error,
    });
    return false;
  }
};
