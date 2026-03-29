import React from 'react';
import ReactMarkdown from 'react-markdown';
import {
  BarChart3,
  Bot,
  CheckCircle2,
  FlaskConical,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Lightbulb,
  MessageSquare,
  Orbit,
  PlayCircle,
  Sparkles,
  User,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '../../utils';
import {
  formatQuizCorrectAnswerText,
  getQuizCorrectAnswerMarker,
  getQuizOptionMarker,
  QUIZ_PRESENTATION_COPY,
  resolveQuizTextAlignmentClass,
  resolveQuizTextDirection,
} from '../../utils/quizPresentation';
import { ExportThemeMode } from '../../utils/exporters';
import { NormalizedResultPreview } from './resultPreviewModel';

interface ResultPreviewContentProps {
  preview: NormalizedResultPreview;
  exportThemeMode?: ExportThemeMode;
}

const sectionSurface = (exportThemeMode?: ExportThemeMode) => {
  // Export theme mode is explicit to keep detached/export rendering deterministic
  // and independent from ambient app theme classes.
  if (exportThemeMode === 'dark') {
    return 'rounded-[1.75rem] border border-zinc-800 bg-zinc-900/80 p-6 shadow-sm';
  }

  if (exportThemeMode === 'light') {
    return 'rounded-[1.75rem] border border-zinc-200 bg-white p-6 shadow-sm';
  }

  return 'rounded-[1.75rem] border border-zinc-200/80 bg-white/95 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/70';
};

const sectionTitle = (exportThemeMode?: ExportThemeMode) =>
  cn(
    'flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em]',
    exportThemeMode === 'dark'
      ? 'text-zinc-300'
      : exportThemeMode === 'light'
      ? 'text-zinc-500'
      : 'text-zinc-500 dark:text-zinc-400'
  );

const proseClass = (exportThemeMode?: ExportThemeMode) =>
  cn(
    'markdown-body leading-relaxed break-words',
    exportThemeMode === 'dark'
      ? 'text-zinc-100'
      : exportThemeMode === 'light'
      ? 'text-zinc-700'
      : 'text-zinc-700 dark:text-zinc-200'
  );

const hasRtlCharacters = (value?: string) => Boolean(value && /[\u0590-\u08ff]/.test(value));

const resolveTextDirection = (value?: string): 'rtl' | 'ltr' => (hasRtlCharacters(value) ? 'rtl' : 'ltr');

const resolveTextAlignment = (value?: string) => (hasRtlCharacters(value) ? 'text-right' : 'text-left');

const pickMetadata = (preview: NormalizedResultPreview, preferredLabels: string[], limit = 4) => {
  const preferredSet = new Set(preferredLabels);
  const selected = preview.metadata.filter((item) => preferredSet.has(item.label));
  return selected.slice(0, limit);
};

const metadataChipClass = (exportThemeMode?: ExportThemeMode) =>
  cn(
    'rounded-2xl border px-4 py-3',
    exportThemeMode === 'dark'
      ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
      : exportThemeMode === 'light'
      ? 'border-zinc-200 bg-zinc-50 text-zinc-800'
      : 'border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100'
  );

const MetadataStrip: React.FC<{
  items: NormalizedResultPreview['metadata'];
  exportThemeMode?: ExportThemeMode;
}> = ({ items, exportThemeMode }) => {
  if (!items.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className={metadataChipClass(exportThemeMode)}>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">{item.label}</p>
          <p className={cn('mt-2 text-sm font-semibold', resolveTextAlignment(item.value))} dir="auto">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
};

const PreviewMarkdown: React.FC<{
  content: string;
  exportThemeMode?: ExportThemeMode;
}> = ({ content, exportThemeMode }) => {
  const direction = resolveTextDirection(content);

  return (
    <div className={cn(proseClass(exportThemeMode), resolveTextAlignment(content), 'space-y-4')} dir={direction}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-3xl font-black tracking-tight">{children}</h1>,
          h2: ({ children }) => <h2 className="pt-2 text-2xl font-black tracking-tight">{children}</h2>,
          h3: ({ children }) => <h3 className="pt-1 text-xl font-bold tracking-tight">{children}</h3>,
          p: ({ children }) => <p className="text-sm leading-8 sm:text-[15px]">{children}</p>,
          ul: ({ children }) => <ul className="space-y-2 ps-5 text-sm leading-7 sm:text-[15px] list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="space-y-2 ps-5 text-sm leading-7 sm:text-[15px] list-decimal">{children}</ol>,
          li: ({ children }) => <li className="ps-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote
              className={cn(
                'rounded-[1.5rem] border-s-4 px-5 py-4 text-sm italic leading-7',
                exportThemeMode === 'dark'
                  ? 'border-emerald-500 bg-zinc-900/90 text-zinc-200'
                  : exportThemeMode === 'light'
                  ? 'border-emerald-500 bg-emerald-50 text-zinc-700'
                  : 'border-emerald-500 bg-emerald-50 text-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200'
              )}
            >
              {children}
            </blockquote>
          ),
          hr: () => <hr className={cn('my-6 border-dashed', exportThemeMode === 'dark' ? 'border-zinc-700' : 'border-zinc-200')} />,
          code: ({ className, children }) =>
            !className ? (
              <code
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[0.9em] font-semibold',
                  exportThemeMode === 'dark'
                    ? 'bg-zinc-800 text-emerald-300'
                    : 'bg-emerald-50 text-emerald-700'
                )}
              >
                {children}
              </code>
            ) : (
              <code>{children}</code>
            ),
          pre: ({ children }) => (
            <pre
              className={cn(
                'overflow-x-auto rounded-[1.5rem] border p-4 text-xs leading-6',
                exportThemeMode === 'dark'
                  ? 'border-zinc-700 bg-zinc-950 text-zinc-100'
                  : exportThemeMode === 'light'
                  ? 'border-zinc-200 bg-zinc-50 text-zinc-800'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100'
              )}
            >
              {children}
            </pre>
          ),
          strong: ({ children }) => <strong className="font-black text-emerald-600 dark:text-emerald-400">{children}</strong>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

const ResultSection: React.FC<{
  exportThemeMode?: ExportThemeMode;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ exportThemeMode, icon, title, children }) => (
  <section className={sectionSurface(exportThemeMode)}>
    <div className={sectionTitle(exportThemeMode)}>
      {icon}
      <span>{title}</span>
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

const QuizOptionRow: React.FC<{
  option: string;
  optionIndex: number;
  isCorrect: boolean;
  exportThemeMode?: ExportThemeMode;
}> = ({ option, optionIndex, isCorrect, exportThemeMode }) => {
  const marker = getQuizOptionMarker(optionIndex);

  return (
    <div
      className={cn(
        'rounded-[1.4rem] border px-4 py-3.5 text-sm transition-colors',
        isCorrect
          ? exportThemeMode === 'dark'
            ? 'border-emerald-900/50 bg-emerald-950/35 text-emerald-100'
            : exportThemeMode === 'light'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
          : exportThemeMode === 'dark'
          ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
          : exportThemeMode === 'light'
          ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
          : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border shadow-sm',
            isCorrect
              ? exportThemeMode === 'dark'
                ? 'border-emerald-700/60 bg-emerald-500/15'
                : 'border-emerald-200 bg-white'
              : exportThemeMode === 'dark'
              ? 'border-zinc-700 bg-zinc-950'
              : 'border-zinc-200 bg-zinc-50'
          )}
        >
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-black',
              isCorrect
                ? exportThemeMode === 'dark'
                  ? 'border-emerald-700/60 bg-emerald-500/15 text-emerald-200'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : exportThemeMode === 'dark'
                ? 'border-zinc-600 bg-zinc-900 text-zinc-300'
                : 'border-zinc-200 bg-white text-zinc-500'
            )}
          >
            {marker}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={cn('text-sm font-medium leading-relaxed', resolveQuizTextAlignmentClass(option))}
            dir={resolveQuizTextDirection(option)}
          >
            {option}
          </p>
          {isCorrect ? (
            <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
              {QUIZ_PRESENTATION_COPY.bestMatchLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const EmptyFallback: React.FC<{ preview: NormalizedResultPreview; exportThemeMode?: ExportThemeMode }> = ({
  preview,
  exportThemeMode,
}) => (
  <ResultSection
    exportThemeMode={exportThemeMode}
    icon={<HelpCircle size={16} className="text-amber-500" />}
    title="Fallback Preview"
  >
    <p className={cn('text-sm', exportThemeMode === 'dark' ? 'text-zinc-300' : exportThemeMode === 'light' ? 'text-zinc-600' : 'text-zinc-600 dark:text-zinc-300')}>
      {preview.fallbackReason || 'This result could not be rendered with a richer viewer.'}
    </p>
    <pre
      className={cn(
        'mt-4 max-h-[480px] overflow-auto rounded-2xl border p-4 text-xs whitespace-pre-wrap break-words',
        exportThemeMode === 'dark'
          ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
          : exportThemeMode === 'light'
          ? 'border-zinc-200 bg-zinc-50 text-zinc-700'
          : 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200'
      )}
    >
      {preview.rawText || 'No preview data available.'}
    </pre>
  </ResultSection>
);

const TextContent: React.FC<{ preview: NormalizedResultPreview; exportThemeMode?: ExportThemeMode }> = ({
  preview,
  exportThemeMode,
}) => {
  const metadataHighlights = pickMetadata(preview, ['View', 'Tool', 'File', 'Model', 'Messages', 'Language']);

  if (preview.messages?.length) {
    return (
      <div className="space-y-4">
        <MetadataStrip items={metadataHighlights} exportThemeMode={exportThemeMode} />
        {preview.messages.map((message, index) => {
          const isUser = message.role === 'user';
          const speakerLabel = isUser ? 'User' : message.role === 'system' ? 'System' : 'AI';

          return (
            <div
              key={`${speakerLabel}-${index}`}
              className={cn(
                'max-w-[94%] rounded-[1.75rem] border p-5 shadow-sm',
                isUser ? 'ms-auto' : 'me-auto',
                exportThemeMode === 'dark'
                  ? isUser
                    ? 'border-emerald-900/60 bg-emerald-950/40'
                    : 'border-zinc-800 bg-zinc-900'
                  : exportThemeMode === 'light'
                  ? isUser
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-zinc-200 bg-zinc-50'
                  : isUser
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30'
                  : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/70'
              )}
            >
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
                {isUser ? <User size={14} className="text-emerald-500" /> : <Bot size={14} className="text-sky-500" />}
                <span>{speakerLabel}</span>
              </div>
              <PreviewMarkdown content={message.content} exportThemeMode={exportThemeMode} />
            </div>
          );
        })}
      </div>
    );
  }

  if (!preview.markdownContent && !preview.textContent) {
    return <EmptyFallback preview={preview} exportThemeMode={exportThemeMode} />;
  }

  return (
    <ResultSection
      exportThemeMode={exportThemeMode}
      icon={<MessageSquare size={16} className="text-emerald-500" />}
      title={preview.metadata.find((item) => item.label === 'View')?.value || 'Reading View'}
    >
      <div className="space-y-5">
        <MetadataStrip items={metadataHighlights} exportThemeMode={exportThemeMode} />
        <PreviewMarkdown content={preview.markdownContent || preview.textContent || ''} exportThemeMode={exportThemeMode} />
      </div>
    </ResultSection>
  );
};

const QuizContent: React.FC<{ preview: NormalizedResultPreview; exportThemeMode?: ExportThemeMode }> = ({
  preview,
  exportThemeMode,
}) => {
  if (!preview.quiz) {
    return <EmptyFallback preview={preview} exportThemeMode={exportThemeMode} />;
  }

  const metadataHighlights = pickMetadata(preview, ['Questions', 'Language', 'Mode', 'Difficulty', 'Goal', 'Style', 'Question Types'], 6);

  return (
    <div className="space-y-5">
      <MetadataStrip items={metadataHighlights} exportThemeMode={exportThemeMode} />
      {preview.topicImage && (
        <div className={cn(sectionSurface(exportThemeMode), 'overflow-hidden p-0')}>
          <img
            src={preview.topicImage}
            alt={preview.title}
            className="h-[260px] w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {preview.quiz.questions.map((question, index) => {
        const correctMarker = getQuizCorrectAnswerMarker(question);

        return (
          <section key={question.id || `${question.question}-${index}`} className={sectionSurface(exportThemeMode)}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[1.1rem] border border-emerald-500/20 bg-emerald-500/10 text-sm font-black text-emerald-600 shadow-sm dark:text-emerald-400">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('text-[11px] font-black uppercase tracking-[0.22em]', exportThemeMode === 'dark' ? 'text-zinc-300' : exportThemeMode === 'light' ? 'text-zinc-500' : 'text-zinc-500 dark:text-zinc-400')}>
                    {question.type}
                  </p>
                  {Array.isArray(question.options) && question.options.length > 0 ? (
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]',
                        exportThemeMode === 'dark'
                          ? 'border-zinc-700 bg-zinc-900 text-zinc-300'
                          : exportThemeMode === 'light'
                          ? 'border-zinc-200 bg-zinc-50 text-zinc-500'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
                      )}
                    >
                      {question.options.length} Choices
                    </span>
                  ) : null}
                </div>
                <h4
                  className={cn('mt-1 text-base font-bold', exportThemeMode === 'dark' ? 'text-zinc-100' : exportThemeMode === 'light' ? 'text-zinc-900' : 'text-zinc-900 dark:text-white', resolveTextAlignment(question.question))}
                  dir={resolveQuizTextDirection(question.question)}
                >
                  {question.emoji ? `${question.emoji} ` : ''}
                  {question.question}
                </h4>
              </div>
            </div>

          {question.options?.length ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className={cn('h-px flex-1', exportThemeMode === 'dark' ? 'bg-zinc-800' : exportThemeMode === 'light' ? 'bg-zinc-200' : 'bg-zinc-200 dark:bg-zinc-800')} />
                <div
                  className={cn(
                    'rounded-[1.35rem] border px-4 py-2.5 text-center shadow-sm',
                    exportThemeMode === 'dark'
                      ? 'border-emerald-900/40 bg-emerald-950/25'
                      : exportThemeMode === 'light'
                      ? 'border-emerald-200 bg-white'
                      : 'border-emerald-200 bg-white dark:border-emerald-900/40 dark:bg-zinc-950/40'
                  )}
                >
                  <p className={cn('text-[9px] font-black uppercase tracking-[0.18em]', exportThemeMode === 'dark' ? 'text-zinc-400' : exportThemeMode === 'light' ? 'text-zinc-500' : 'text-zinc-500 dark:text-zinc-400')}>
                    {QUIZ_PRESENTATION_COPY.answerChoicesEyebrow}
                  </p>
                  <div className="mt-1 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
                    <Orbit size={12} />
                    <span>{QUIZ_PRESENTATION_COPY.answerChoicesLabel}</span>
                  </div>
                </div>
                <div className={cn('h-px flex-1', exportThemeMode === 'dark' ? 'bg-zinc-800' : exportThemeMode === 'light' ? 'bg-zinc-200' : 'bg-zinc-200 dark:bg-zinc-800')} />
              </div>
              <div className="grid gap-3">
                {question.options.map((option, optionIndex) => {
                  const isCorrect = option === question.correctAnswer;
                  return (
                    <QuizOptionRow
                      key={`${question.id || index}-${optionIndex}`}
                      option={option}
                      optionIndex={optionIndex}
                      isCorrect={isCorrect}
                      exportThemeMode={exportThemeMode}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-[1.6rem] border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700/80 dark:text-emerald-300/80">
                  {QUIZ_PRESENTATION_COPY.correctAnswerEyebrow}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={16} />
                  <span>{QUIZ_PRESENTATION_COPY.correctAnswerLabel}</span>
                </div>
              </div>
              {correctMarker ? (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border border-emerald-300 bg-white text-sm font-black text-emerald-700 shadow-sm dark:border-emerald-700/60 dark:bg-emerald-500/15 dark:text-emerald-200">
                  {correctMarker}
                </div>
              ) : null}
            </div>
            <p
              className={cn('mt-3 text-sm font-semibold text-emerald-900 dark:text-emerald-100', resolveQuizTextAlignmentClass(question.correctAnswer))}
              dir={resolveQuizTextDirection(question.correctAnswer)}
            >
              {formatQuizCorrectAnswerText(question)}
            </p>
          </div>

          <div className={cn(
            'mt-4 rounded-[1.6rem] border p-4',
            exportThemeMode === 'dark'
              ? 'border-zinc-700 bg-zinc-900'
              : exportThemeMode === 'light'
              ? 'border-zinc-200 bg-zinc-50'
              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
          )}>
            <p className={cn('text-[10px] font-black uppercase tracking-[0.18em]', exportThemeMode === 'dark' ? 'text-zinc-500' : exportThemeMode === 'light' ? 'text-zinc-500' : 'text-zinc-500 dark:text-zinc-500')}>
              {QUIZ_PRESENTATION_COPY.explanationEyebrow}
            </p>
            <div className={cn('mt-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em]', exportThemeMode === 'dark' ? 'text-zinc-300' : exportThemeMode === 'light' ? 'text-zinc-500' : 'text-zinc-500 dark:text-zinc-400')}>
              <FlaskConical size={16} className="text-sky-500" />
              <span>{QUIZ_PRESENTATION_COPY.explanationLabel}</span>
            </div>
            <p
              className={cn('mt-3 text-sm leading-relaxed', exportThemeMode === 'dark' ? 'text-zinc-100' : exportThemeMode === 'light' ? 'text-zinc-700' : 'text-zinc-700 dark:text-zinc-200', resolveQuizTextAlignmentClass(question.explanation))}
              dir={resolveQuizTextDirection(question.explanation)}
            >
              {question.explanation}
            </p>
          </div>
          </section>
        );
      })}
    </div>
  );
};

const InfographicContent: React.FC<{ preview: NormalizedResultPreview; exportThemeMode?: ExportThemeMode }> = ({
  preview,
  exportThemeMode,
}) => {
  if (!preview.infographic) {
    return <EmptyFallback preview={preview} exportThemeMode={exportThemeMode} />;
  }

  const axisColor = exportThemeMode === 'dark' ? '#94a3b8' : '#64748b';
  const metadataHighlights = pickMetadata(preview, ['Insights', 'Stats', 'Template', 'Palette', 'Layout', 'Density', 'Tone'], 6);

  return (
    <div className="space-y-5">
      <MetadataStrip items={metadataHighlights} exportThemeMode={exportThemeMode} />
      {preview.topicImage && (
        <div className={cn(sectionSurface(exportThemeMode), 'overflow-hidden p-0')}>
          <img
            src={preview.topicImage}
            alt={preview.title}
            className="h-[260px] w-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <ResultSection
        exportThemeMode={exportThemeMode}
        icon={<Info size={16} className="text-emerald-500" />}
        title="Overview"
      >
        <p
          className={cn('text-base leading-relaxed', exportThemeMode === 'dark' ? 'text-zinc-100' : exportThemeMode === 'light' ? 'text-zinc-700' : 'text-zinc-700 dark:text-zinc-200', resolveTextAlignment(preview.infographic.summary))}
          dir="auto"
        >
          {preview.infographic.summary}
        </p>
      </ResultSection>

      <div className="grid gap-4 md:grid-cols-3">
        {preview.infographic.stats.map((stat, index) => (
          <div key={`${stat.label}-${index}`} className={sectionSurface(exportThemeMode)}>
            <p className={cn('text-[11px] font-black uppercase tracking-[0.22em]', exportThemeMode === 'dark' ? 'text-zinc-300' : exportThemeMode === 'light' ? 'text-zinc-500' : 'text-zinc-500 dark:text-zinc-400')}>
              {stat.label}
            </p>
            <p className={cn('mt-4 text-3xl font-black', exportThemeMode === 'dark' ? 'text-emerald-300' : exportThemeMode === 'light' ? 'text-emerald-600' : 'text-emerald-600 dark:text-emerald-400')}>
              {stat.value}
              {stat.unit ? <span className="ms-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">{stat.unit}</span> : null}
            </p>
          </div>
        ))}
      </div>

      <ResultSection
        exportThemeMode={exportThemeMode}
        icon={<BarChart3 size={16} className="text-emerald-500" />}
        title="Data Distribution"
      >
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={preview.infographic.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={axisColor} opacity={0.12} vertical={false} />
              <XAxis dataKey="name" stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={axisColor} fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: exportThemeMode === 'dark' ? '#18181b' : '#ffffff',
                  border: 'none',
                  borderRadius: '16px',
                  color: exportThemeMode === 'dark' ? '#ffffff' : '#18181b',
                }}
              />
              <Bar dataKey="value" fill="#10b981" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ResultSection>

      <ResultSection
        exportThemeMode={exportThemeMode}
        icon={<Sparkles size={16} className="text-amber-500" />}
        title="Core Insights"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {preview.infographic.keyPoints.map((point, index) => (
            <div
              key={`${point.title}-${index}`}
              className={cn(
                'rounded-2xl border p-4',
                exportThemeMode === 'dark'
                  ? 'border-zinc-700 bg-zinc-900'
                  : exportThemeMode === 'light'
                  ? 'border-zinc-200 bg-zinc-50'
                  : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950'
              )}
            >
              <p className={cn('text-sm font-bold', exportThemeMode === 'dark' ? 'text-zinc-100' : exportThemeMode === 'light' ? 'text-zinc-900' : 'text-zinc-900 dark:text-white', resolveTextAlignment(point.title))} dir="auto">
                {point.title}
              </p>
              <p className={cn('mt-2 text-sm leading-relaxed', exportThemeMode === 'dark' ? 'text-zinc-300' : exportThemeMode === 'light' ? 'text-zinc-600' : 'text-zinc-600 dark:text-zinc-300', resolveTextAlignment(point.description))} dir="auto">
                {point.description}
              </p>
            </div>
          ))}
        </div>
      </ResultSection>

      <section
        className={cn(
          'overflow-hidden rounded-[1.75rem] p-6 shadow-sm',
          exportThemeMode === 'dark'
            ? 'bg-emerald-700 text-white'
            : exportThemeMode === 'light'
            ? 'bg-emerald-600 text-white'
            : 'bg-emerald-600 text-white dark:bg-emerald-700'
        )}
      >
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/80">
          <Lightbulb size={16} />
          <span>Did You Know</span>
        </div>
        <p className={cn('mt-4 text-base leading-relaxed text-white', resolveTextAlignment(preview.infographic.didYouKnow))} dir="auto">
          {preview.infographic.didYouKnow}
        </p>
      </section>
    </div>
  );
};

const ImageContent: React.FC<{ preview: NormalizedResultPreview; exportThemeMode?: ExportThemeMode }> = ({
  preview,
  exportThemeMode,
}) => {
  if (!preview.image?.url) {
    return <EmptyFallback preview={preview} exportThemeMode={exportThemeMode} />;
  }

  const metadataHighlights = pickMetadata(preview, ['Size', 'Aspect Ratio', 'Model']);

  return (
    <div className="space-y-5">
      <MetadataStrip items={metadataHighlights} exportThemeMode={exportThemeMode} />
      <section className={cn(sectionSurface(exportThemeMode), 'overflow-hidden p-0')}>
        <div className={cn('flex items-center justify-center p-4 sm:p-6', exportThemeMode === 'dark' ? 'bg-zinc-900/70' : exportThemeMode === 'light' ? 'bg-zinc-50' : 'bg-zinc-50 dark:bg-zinc-900/70')}>
          <img
            src={preview.image.url}
            alt={preview.image.alt || preview.title}
            className="max-h-[620px] w-full rounded-[1.5rem] object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      </section>

      {preview.image.prompt ? (
        <ResultSection
          exportThemeMode={exportThemeMode}
          icon={<ImageIcon size={16} className="text-emerald-500" />}
          title="Prompt"
        >
          <p className={cn('text-sm leading-relaxed', exportThemeMode === 'dark' ? 'text-zinc-100' : exportThemeMode === 'light' ? 'text-zinc-700' : 'text-zinc-700 dark:text-zinc-200', resolveTextAlignment(preview.image.prompt))} dir="auto">
            {preview.image.prompt}
          </p>
        </ResultSection>
      ) : null}
    </div>
  );
};

const VideoContent: React.FC<{ preview: NormalizedResultPreview; exportThemeMode?: ExportThemeMode }> = ({
  preview,
  exportThemeMode,
}) => {
  if (!preview.video?.url) {
    return <EmptyFallback preview={preview} exportThemeMode={exportThemeMode} />;
  }

  const metadataHighlights = pickMetadata(preview, ['Aspect Ratio', 'Model']);

  return (
    <div className="space-y-5">
      <MetadataStrip items={metadataHighlights} exportThemeMode={exportThemeMode} />
      <section className={cn(sectionSurface(exportThemeMode), 'overflow-hidden p-0')}>
        <div className={cn('p-4 sm:p-6', exportThemeMode === 'dark' ? 'bg-zinc-900/70' : exportThemeMode === 'light' ? 'bg-zinc-50' : 'bg-zinc-50 dark:bg-zinc-900/70')}>
          <div className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-black shadow-sm dark:border-zinc-800">
            <video
              src={preview.video.url}
              controls
              className="aspect-video w-full bg-black object-contain"
            />
          </div>
        </div>
      </section>

      {preview.video.prompt ? (
        <ResultSection
          exportThemeMode={exportThemeMode}
          icon={<PlayCircle size={16} className="text-emerald-500" />}
          title="Prompt"
        >
          <p className={cn('text-sm leading-relaxed', exportThemeMode === 'dark' ? 'text-zinc-100' : exportThemeMode === 'light' ? 'text-zinc-700' : 'text-zinc-700 dark:text-zinc-200', resolveTextAlignment(preview.video.prompt))} dir="auto">
            {preview.video.prompt}
          </p>
        </ResultSection>
      ) : null}
    </div>
  );
};

export const ResultPreviewContent: React.FC<ResultPreviewContentProps> = ({
  preview,
  exportThemeMode,
}) => {
  // Shared-vs-tool rendering boundary:
  // This component owns the normalized preview/detached/export-safe rendering
  // contract. Tool pages can still keep their own inline layouts, but any data
  // they send here should remain serializable and type-aware.
  switch (preview.type) {
    case 'quiz':
      return <QuizContent preview={preview} exportThemeMode={exportThemeMode} />;
    case 'infographic':
      return <InfographicContent preview={preview} exportThemeMode={exportThemeMode} />;
    case 'image':
      return <ImageContent preview={preview} exportThemeMode={exportThemeMode} />;
    case 'video':
      return <VideoContent preview={preview} exportThemeMode={exportThemeMode} />;
    case 'text':
      return <TextContent preview={preview} exportThemeMode={exportThemeMode} />;
    default:
      return <EmptyFallback preview={preview} exportThemeMode={exportThemeMode} />;
  }
};
