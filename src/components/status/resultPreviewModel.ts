import { InfographicData, Quiz } from '../../utils';
import {
  formatQuizCorrectAnswerText,
  formatQuizOptionWithMarker,
  QUIZ_PRESENTATION_COPY,
} from '../../utils/quizPresentation';

export type ResultPreviewType = 'quiz' | 'infographic' | 'text' | 'image' | 'video';

export interface ResultPreviewMetadataItem {
  label: string;
  value: string;
}

export interface ResultPreviewTranscriptMessage {
  role: 'user' | 'ai' | 'assistant' | 'system';
  content: string;
}

export interface NormalizedResultPreview {
  title: string;
  type: ResultPreviewType;
  typeLabel: string;
  summary: string;
  metadata: ResultPreviewMetadataItem[];
  topicImage: string | null;
  downloadFileStem: string;
  rawText: string;
  plainTextExport: string;
  markdownExport: string | null;
  fallbackReason: string | null;
  sourceLabel: string | null;
  hasStructuredContent: boolean;
  quiz?: Quiz;
  infographic?: InfographicData;
  textContent?: string;
  markdownContent?: string;
  messages?: ResultPreviewTranscriptMessage[];
  image?: {
    url: string;
    prompt?: string;
    size?: string;
    aspectRatio?: string;
    modelId?: string;
    alt?: string;
  };
  video?: {
    url: string;
    prompt?: string;
    aspectRatio?: string;
    modelId?: string;
  };
}

interface NormalizeResultPreviewInput {
  title: string;
  type: ResultPreviewType;
  data: unknown;
  topicImage?: string | null;
  sourceTool?: string | null;
  createdAt?: unknown;
}

type UnknownRecord = Record<string, unknown>;

const TYPE_LABELS: Record<ResultPreviewType, string> = {
  quiz: 'Quiz',
  infographic: 'Infographic',
  text: 'Document',
  image: 'Image',
  video: 'Video',
};

function asRecord(value: unknown): UnknownRecord | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as UnknownRecord;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as UnknownRecord;
    }
  } catch {
    return null;
  }

  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const values = value
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item));

  return values.length ? values : undefined;
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function shorten(text: string, maxLength = 160): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trim()}...`;
}

function humanizeSourceTool(value?: string | null): string | null {
  const source = asString(value);
  if (!source) return null;

  return source
    .replace(/[:/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeKind(value?: string | null): string | null {
  return humanizeSourceTool(value);
}

function normalizeCreatedAt(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toLocaleString();
      }
    } catch {
      return null;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleString();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString();
    }
  }

  return null;
}

function createFileStem(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_');

  return cleaned || 'zootopia_result';
}

function pushMetadata(
  metadata: ResultPreviewMetadataItem[],
  label: string,
  value: unknown
) {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!normalized) return;
  metadata.push({ label, value: normalized });
}

function isQuiz(value: unknown): value is Quiz {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Quiz;
  return Array.isArray(candidate.questions) && typeof candidate.title === 'string';
}

function isInfographic(value: unknown): value is InfographicData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as InfographicData;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.summary === 'string' &&
    Array.isArray(candidate.keyPoints) &&
    Array.isArray(candidate.stats) &&
    Array.isArray(candidate.chartData)
  );
}

function normalizeTranscriptMessages(value: unknown): ResultPreviewTranscriptMessage[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const messages = value
    .map((item) => {
      const role =
        typeof item === 'object' && item !== null && typeof (item as { role?: unknown }).role === 'string'
          ? ((item as { role: string }).role.toLowerCase() as ResultPreviewTranscriptMessage['role'])
          : null;
      const content =
        typeof item === 'object' && item !== null && typeof (item as { content?: unknown }).content === 'string'
          ? (item as { content: string }).content
          : null;

      if (!role || !content?.trim()) {
        return null;
      }

      if (role !== 'user' && role !== 'ai' && role !== 'assistant' && role !== 'system') {
        return null;
      }

      return {
        role,
        content: content.trim(),
      };
    })
    .filter((item): item is ResultPreviewTranscriptMessage => Boolean(item));

  return messages.length ? messages : undefined;
}

function buildTranscriptPlainText(messages: ResultPreviewTranscriptMessage[]): string {
  return messages
    .map((message) => `${message.role === 'user' ? 'User' : message.role === 'system' ? 'System' : 'AI'}: ${message.content}`)
    .join('\n\n');
}

function buildTranscriptMarkdown(messages: ResultPreviewTranscriptMessage[]): string {
  return messages
    .map((message) => {
      const speaker = message.role === 'user' ? 'User' : message.role === 'system' ? 'System' : 'AI';
      return `### ${speaker}\n\n${message.content}`;
    })
    .join('\n\n---\n\n');
}

function buildQuizPlainText(quiz: Quiz): string {
  return quiz.questions
    .map((question, index) => {
      const options = Array.isArray(question.options)
        ? [
            `${QUIZ_PRESENTATION_COPY.answerChoicesEyebrow}: ${QUIZ_PRESENTATION_COPY.answerChoicesLabel}`,
            ...question.options.map((option, optionIndex) => formatQuizOptionWithMarker(option, optionIndex)),
          ].join('\n')
        : '';
      const questionTitle = `${question.emoji ? `${question.emoji} ` : ''}${question.question}`;

      return [
        `${index + 1}. ${questionTitle}`,
        options,
        `${QUIZ_PRESENTATION_COPY.correctAnswerEyebrow}: ${formatQuizCorrectAnswerText(question)}`,
        `${QUIZ_PRESENTATION_COPY.explanationLabel}: ${question.explanation}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function buildQuizMarkdown(quiz: Quiz): string {
  return quiz.questions
    .map((question, index) => {
      const options = Array.isArray(question.options)
        ? [
            `*${QUIZ_PRESENTATION_COPY.answerChoicesEyebrow}*`,
            '',
            ...question.options.map((option, optionIndex) => `- **${formatQuizOptionWithMarker(option, optionIndex)}**`),
          ].join('\n')
        : '';
      const questionTitle = `${question.emoji ? `${question.emoji} ` : ''}${question.question}`;

      return [
        `## Question ${index + 1}`,
        questionTitle,
        '',
        options,
        '',
        `**${QUIZ_PRESENTATION_COPY.correctAnswerEyebrow}:** ${formatQuizCorrectAnswerText(question)}`,
        '',
        `**${QUIZ_PRESENTATION_COPY.explanationLabel}:** ${question.explanation}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

function buildInfographicMarkdown(infographic: InfographicData): string {
  const stats = infographic.stats
    .map((stat) => `- **${stat.label}:** ${stat.value}${stat.unit ? ` ${stat.unit}` : ''}`)
    .join('\n');

  const insights = infographic.keyPoints
    .map((point) => `- **${point.title}:** ${point.description}`)
    .join('\n');

  return [
    `## Overview`,
    infographic.summary,
    '',
    `## Key Stats`,
    stats,
    '',
    `## Core Insights`,
    insights,
    '',
    `## Did You Know`,
    infographic.didYouKnow,
  ].join('\n');
}

function buildInfographicPlainText(infographic: InfographicData): string {
  const stats = infographic.stats
    .map((stat) => `${stat.label}: ${stat.value}${stat.unit ? ` ${stat.unit}` : ''}`)
    .join('\n');

  const insights = infographic.keyPoints
    .map((point) => `${point.title}: ${point.description}`)
    .join('\n');

  return [
    infographic.summary,
    '',
    'Key Stats',
    stats,
    '',
    'Core Insights',
    insights,
    '',
    `Did You Know: ${infographic.didYouKnow}`,
  ].join('\n');
}

function buildMediaMarkdown(
  title: string,
  url: string,
  prompt?: string
): string {
  const lines = [`## Asset`, `[Open Asset](${url})`];

  if (prompt) {
    lines.push('', '## Prompt', prompt);
  }

  return [`# ${title}`, '', ...lines].join('\n');
}

function buildMediaPlainText(url: string, prompt?: string): string {
  return [`Asset URL: ${url}`, prompt ? `Prompt: ${prompt}` : null].filter(Boolean).join('\n');
}

function normalizeQuizData(data: unknown): { quiz?: Quiz; topicImage?: string | null; metadata: ResultPreviewMetadataItem[] } {
  const metadata: ResultPreviewMetadataItem[] = [];
  const record = asRecord(data);
  const quizCandidate = record?.quiz ?? data;
  const topicImage = asString(record?.topicImage) ?? null;
  const selectedTypes = asStringArray(record?.selectedTypes);

  if (!isQuiz(quizCandidate)) {
    return { metadata };
  }

  pushMetadata(metadata, 'Questions', quizCandidate.questions.length);
  pushMetadata(metadata, 'Language', quizCandidate.language);
  pushMetadata(metadata, 'Mode', record?.assessmentMode);
  pushMetadata(metadata, 'Difficulty', record?.difficulty);
  pushMetadata(metadata, 'Goal', record?.assessmentGoal);
  pushMetadata(metadata, 'Style', record?.questionStyle);
  pushMetadata(metadata, 'Question Types', selectedTypes?.join(', '));

  return {
    quiz: quizCandidate,
    topicImage,
    metadata,
  };
}

function normalizeInfographicData(data: unknown): {
  infographic?: InfographicData;
  topicImage?: string | null;
  template?: string;
  metadata: ResultPreviewMetadataItem[];
} {
  const metadata: ResultPreviewMetadataItem[] = [];
  const record = asRecord(data);
  const optionsRecord = asRecord(record?.options);
  const infographicCandidate = record?.infographic ?? data;
  const topicImage = asString(record?.topicImage) ?? null;
  const template = asString(record?.template) ?? asString(optionsRecord?.template) ?? undefined;

  if (!isInfographic(infographicCandidate)) {
    return { metadata };
  }

  pushMetadata(metadata, 'Insights', infographicCandidate.keyPoints.length);
  pushMetadata(metadata, 'Stats', infographicCandidate.stats.length);
  pushMetadata(metadata, 'Template', template);
  pushMetadata(metadata, 'Palette', asString(record?.colorPalette) ?? asString(optionsRecord?.colorPalette));
  pushMetadata(metadata, 'Layout', asString(record?.layout) ?? asString(optionsRecord?.layout));
  pushMetadata(metadata, 'Density', asString(record?.density) ?? asString(optionsRecord?.density));
  pushMetadata(metadata, 'Tone', asString(record?.tone) ?? asString(optionsRecord?.tone));
  pushMetadata(metadata, 'Emphasis', asString(record?.emphasis) ?? asString(optionsRecord?.emphasis));
  pushMetadata(metadata, 'Result Mode', asString(record?.resultThemeMode) ?? asString(optionsRecord?.resultThemeMode));

  return {
    infographic: infographicCandidate,
    topicImage,
    template,
    metadata,
  };
}

function normalizeTextData(data: unknown): {
  textContent?: string;
  markdownContent?: string;
  messages?: ResultPreviewTranscriptMessage[];
  metadata: ResultPreviewMetadataItem[];
  modelUsed?: string;
  kind?: string;
  toolLabel?: string;
} {
  const metadata: ResultPreviewMetadataItem[] = [];
  const record = asRecord(data);
  const messages = normalizeTranscriptMessages(record?.messages);
  const modelUsed = asString(record?.modelUsed) ?? undefined;
  const fileName = asString(record?.fileName) ?? undefined;
  const kind = asString(record?.kind) ?? undefined;
  const toolLabel = asString(record?.toolLabel) ?? undefined;
  const language = asString(record?.language) ?? undefined;
  const textContent =
    asString(record?.content) ??
    asString(record?.text) ??
    asString(record?.analysis) ??
    (typeof data === 'string' ? data : undefined);
  const markdownContent = asString(record?.markdown) ?? textContent;

  pushMetadata(metadata, 'Format', messages ? 'Transcript' : 'Text');
  pushMetadata(metadata, 'View', humanizeKind(kind));
  pushMetadata(metadata, 'Tool', toolLabel);
  pushMetadata(metadata, 'Model', modelUsed);
  pushMetadata(metadata, 'File', fileName);
  pushMetadata(metadata, 'Language', language);

  if (messages?.length) {
    pushMetadata(metadata, 'Messages', messages.length);
  }

  return {
    textContent: messages ? buildTranscriptPlainText(messages) : textContent,
    markdownContent: messages ? buildTranscriptMarkdown(messages) : markdownContent,
    messages,
    metadata,
    modelUsed,
    kind,
    toolLabel,
  };
}

function normalizeImageData(data: unknown): {
  image?: NormalizedResultPreview['image'];
  metadata: ResultPreviewMetadataItem[];
} {
  const metadata: ResultPreviewMetadataItem[] = [];
  const record = asRecord(data);
  const url = asString(record?.url) ?? asString(record?.imageUrl) ?? (typeof data === 'string' ? data : null);

  if (!url) {
    return { metadata };
  }

  const image = {
    url,
    prompt: asString(record?.prompt) ?? undefined,
    size: asString(record?.size) ?? undefined,
    aspectRatio: asString(record?.aspectRatio) ?? undefined,
    modelId: asString(record?.modelId) ?? undefined,
    alt: asString(record?.alt) ?? undefined,
  };

  pushMetadata(metadata, 'Format', 'Image');
  pushMetadata(metadata, 'Size', image.size);
  pushMetadata(metadata, 'Aspect Ratio', image.aspectRatio);
  pushMetadata(metadata, 'Model', image.modelId);

  return { image, metadata };
}

function normalizeVideoData(data: unknown): {
  video?: NormalizedResultPreview['video'];
  metadata: ResultPreviewMetadataItem[];
} {
  const metadata: ResultPreviewMetadataItem[] = [];
  const record = asRecord(data);
  const url = asString(record?.url) ?? asString(record?.videoUrl) ?? (typeof data === 'string' ? data : null);

  if (!url) {
    return { metadata };
  }

  const video = {
    url,
    prompt: asString(record?.prompt) ?? undefined,
    aspectRatio: asString(record?.aspectRatio) ?? undefined,
    modelId: asString(record?.modelId) ?? undefined,
  };

  pushMetadata(metadata, 'Format', 'Video');
  pushMetadata(metadata, 'Aspect Ratio', video.aspectRatio);
  pushMetadata(metadata, 'Model', video.modelId);

  return { video, metadata };
}

export function normalizeResultPreview({
  title,
  type,
  data,
  topicImage,
  sourceTool,
  createdAt,
}: NormalizeResultPreviewInput): NormalizedResultPreview {
  const metadata: ResultPreviewMetadataItem[] = [];
  const sourceLabel = humanizeSourceTool(sourceTool);
  const createdAtLabel = normalizeCreatedAt(createdAt);
  const safeTitle = title.trim() || 'Untitled Result';
  const rawText = toStringValue(data);
  const downloadFileStem = createFileStem(safeTitle);

  pushMetadata(metadata, 'Type', TYPE_LABELS[type]);
  pushMetadata(metadata, 'Source', sourceLabel);
  pushMetadata(metadata, 'Created', createdAtLabel);

  if (type === 'quiz') {
    const quizData = normalizeQuizData(data);
    metadata.push(...quizData.metadata);

    if (quizData.quiz) {
      const summary = `${quizData.quiz.questions.length} questions arranged for export and review.`;
      return {
        title: safeTitle,
        type,
        typeLabel: TYPE_LABELS[type],
        summary,
        metadata,
        topicImage: quizData.topicImage ?? topicImage ?? null,
        downloadFileStem,
        rawText,
        plainTextExport: buildQuizPlainText(quizData.quiz),
        markdownExport: buildQuizMarkdown(quizData.quiz),
        fallbackReason: null,
        sourceLabel,
        hasStructuredContent: true,
        quiz: quizData.quiz,
      };
    }
  }

  if (type === 'infographic') {
    const infographicData = normalizeInfographicData(data);
    metadata.push(...infographicData.metadata);

    if (infographicData.infographic) {
      return {
        title: safeTitle,
        type,
        typeLabel: TYPE_LABELS[type],
        summary: shorten(infographicData.infographic.summary, 120),
        metadata,
        topicImage: infographicData.topicImage ?? topicImage ?? null,
        downloadFileStem,
        rawText,
        plainTextExport: buildInfographicPlainText(infographicData.infographic),
        markdownExport: buildInfographicMarkdown(infographicData.infographic),
        fallbackReason: null,
        sourceLabel,
        hasStructuredContent: true,
        infographic: infographicData.infographic,
      };
    }
  }

  if (type === 'text') {
    const textData = normalizeTextData(data);
    metadata.push(...textData.metadata);
    const textContent = textData.textContent ?? rawText;
    const markdownContent = textData.markdownContent ?? textContent;
    const summary = textData.messages?.length
      ? `${textData.messages.length} messages ready for export or detached review.`
      : textData.kind === 'analysis'
        ? 'Structured analysis ready for reading, detached preview, and export.'
        : textData.kind === 'study-tool-text'
          ? `${textData.toolLabel || 'Study tool'} result ready for reading and export.`
          : shorten(textContent, 120) || 'Readable document preview';

    return {
      title: safeTitle,
      type,
      typeLabel: TYPE_LABELS[type],
      summary,
      metadata,
      topicImage: topicImage ?? null,
      downloadFileStem,
      rawText,
      plainTextExport: textContent,
      markdownExport: markdownContent,
      fallbackReason: null,
      sourceLabel,
      hasStructuredContent: Boolean(textData.messages?.length || textContent.trim()),
      textContent,
      markdownContent,
      messages: textData.messages,
    };
  }

  if (type === 'image') {
    const imageData = normalizeImageData(data);
    metadata.push(...imageData.metadata);

    if (imageData.image) {
      return {
        title: safeTitle,
        type,
        typeLabel: TYPE_LABELS[type],
        summary: imageData.image.prompt
          ? shorten(imageData.image.prompt, 120)
          : 'Visual preview ready for zooming and detached review.',
        metadata,
        topicImage: topicImage ?? null,
        downloadFileStem,
        rawText,
        plainTextExport: buildMediaPlainText(imageData.image.url, imageData.image.prompt),
        markdownExport: null,
        fallbackReason: null,
        sourceLabel,
        hasStructuredContent: true,
        image: imageData.image,
      };
    }
  }

  if (type === 'video') {
    const videoData = normalizeVideoData(data);
    metadata.push(...videoData.metadata);

    if (videoData.video) {
      return {
        title: safeTitle,
        type,
        typeLabel: TYPE_LABELS[type],
        summary: videoData.video.prompt
          ? shorten(videoData.video.prompt, 120)
          : 'Video preview ready for playback and detached review.',
        metadata,
        topicImage: topicImage ?? null,
        downloadFileStem,
        rawText,
        plainTextExport: buildMediaPlainText(videoData.video.url, videoData.video.prompt),
        markdownExport: null,
        fallbackReason: null,
        sourceLabel,
        hasStructuredContent: true,
        video: videoData.video,
      };
    }
  }

  return {
    title: safeTitle,
    type,
    typeLabel: TYPE_LABELS[type],
    summary: 'Preview data is available in fallback mode.',
    metadata,
    topicImage: topicImage ?? null,
    downloadFileStem,
    rawText,
    plainTextExport: rawText,
    markdownExport: rawText ? `# ${safeTitle}\n\n\`\`\`\n${rawText}\n\`\`\`` : null,
    fallbackReason: 'The stored payload does not match the expected preview shape for this result type.',
    sourceLabel,
    hasStructuredContent: false,
  };
}

export function getPreviewAssetUrl(preview: NormalizedResultPreview): string | null {
  if (preview.image?.url) return preview.image.url;
  if (preview.video?.url) return preview.video.url;
  return null;
}

export function getMediaMarkdownExport(preview: NormalizedResultPreview): string | null {
  if (preview.image?.url) {
    return buildMediaMarkdown(preview.title, preview.image.url, preview.image.prompt);
  }

  if (preview.video?.url) {
    return buildMediaMarkdown(preview.title, preview.video.url, preview.video.prompt);
  }

  return preview.markdownExport;
}
