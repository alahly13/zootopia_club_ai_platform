import React from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, FlaskConical, Layers, Orbit } from 'lucide-react';
import { cn, Quiz } from '../../../utils';
import { getDocumentBackgroundStyle } from '../../../utils/documentBackgrounds';
import { ExportThemeMode } from '../../../utils/exporters';
import {
  formatQuizCorrectAnswerText,
  getQuizCorrectAnswerMarker,
  getQuizOptionMarker,
  QUIZ_PRESENTATION_COPY,
  resolveQuizTextAlignmentClass,
  resolveQuizTextDirection,
} from '../../../utils/quizPresentation';

interface QuizResultProps {
  quiz: Quiz;
  resultThemeMode?: ExportThemeMode;
}

export const QuizResult: React.FC<QuizResultProps> = ({ quiz, resultThemeMode = 'light' }) => {
  const isDarkPreview = resultThemeMode === 'dark';
  const documentBackgroundStyle = React.useMemo(
    () =>
      getDocumentBackgroundStyle(resultThemeMode, {
        overlayOpacity: isDarkPreview ? 0.82 : 0.9,
      }),
    [isDarkPreview, resultThemeMode]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'space-y-6 rounded-[2rem] border p-6 shadow-sm transition-colors',
        isDarkPreview
          ? 'border-zinc-800 bg-zinc-950/90 shadow-[0_24px_60px_rgba(2,6,23,0.35)]'
          : 'border-zinc-200 bg-white'
      )}
      style={documentBackgroundStyle}
    >
      <div
        className={cn(
          'overflow-hidden rounded-[1.75rem] border p-5 transition-colors',
          isDarkPreview
            ? 'border-emerald-900/40 bg-emerald-950/20'
            : 'border-emerald-200 bg-emerald-50'
        )}
      >
        <div
          className={cn(
            'mb-4 h-1.5 w-28 rounded-full',
            isDarkPreview ? 'bg-emerald-400/60' : 'bg-emerald-500/70'
          )}
        />
        <div className="flex flex-wrap items-start gap-3">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-2xl border bg-emerald-500/10 shadow-sm',
              isDarkPreview
                ? 'border-emerald-900/40 text-emerald-400'
                : 'border-emerald-200 text-emerald-600'
            )}
          >
            <Layers size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
                  isDarkPreview
                    ? 'border-emerald-900/40 bg-emerald-950/30 text-emerald-300'
                    : 'border-emerald-200 bg-white/80 text-emerald-700'
                )}
              >
                {QUIZ_PRESENTATION_COPY.reviewSheet}
              </span>
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
                  isDarkPreview
                    ? 'border-zinc-800 bg-zinc-900/80 text-zinc-300'
                    : 'border-white/80 bg-white/80 text-zinc-600'
                )}
              >
                {quiz.questions.length} Questions
              </span>
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]',
                  isDarkPreview
                    ? 'border-zinc-800 bg-zinc-900/80 text-zinc-300'
                    : 'border-white/80 bg-white/80 text-zinc-600'
                )}
              >
                {quiz.language}
              </span>
            </div>
            <h2 className={cn('mt-3 text-2xl font-black tracking-tight', isDarkPreview ? 'text-white' : 'text-zinc-900')} dir="auto">
              {quiz.title}
            </h2>
            <p className={cn('mt-2 max-w-2xl text-sm leading-relaxed', isDarkPreview ? 'text-zinc-300' : 'text-zinc-600')}>
              Premium multiple-choice markers, answer verification, and explanation layout are aligned for review, preview, and export.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {quiz.questions.map((q, index) => {
          const correctMarker = getQuizCorrectAnswerMarker(q);

          return (
            <div
              key={q.id || index}
              className={cn(
                'rounded-[1.75rem] border p-5 shadow-sm transition-colors',
                isDarkPreview
                  ? 'border-zinc-800 bg-zinc-950/60'
                  : 'border-zinc-200 bg-zinc-50'
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border bg-emerald-500/10 text-sm font-black shadow-sm',
                    isDarkPreview
                      ? 'border-emerald-900/40 text-emerald-400'
                      : 'border-emerald-200 text-emerald-600'
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-[11px] font-black uppercase tracking-[0.2em]', isDarkPreview ? 'text-zinc-400' : 'text-zinc-500')}>
                      {q.type}
                    </p>
                    {Array.isArray(q.options) && q.options.length > 0 ? (
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]',
                          isDarkPreview
                            ? 'border-zinc-800 bg-zinc-900 text-zinc-300'
                            : 'border-zinc-200 bg-white text-zinc-500'
                        )}
                      >
                        {q.options.length} Choices
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      'mt-2 text-base font-bold leading-relaxed',
                      isDarkPreview ? 'text-white' : 'text-zinc-900',
                      resolveQuizTextAlignmentClass(q.question)
                    )}
                    dir={resolveQuizTextDirection(q.question)}
                  >
                    {q.emoji ? `${q.emoji} ` : ''}
                    {q.question}
                  </p>
                </div>
              </div>

              {Array.isArray(q.options) && q.options.length > 0 ? (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={cn('h-px flex-1', isDarkPreview ? 'bg-zinc-800' : 'bg-zinc-200')} />
                    <div
                      className={cn(
                        'rounded-[1.35rem] border px-4 py-2.5 text-center shadow-sm',
                        isDarkPreview
                          ? 'border-emerald-900/40 bg-emerald-950/25'
                          : 'border-emerald-200 bg-white/90'
                      )}
                    >
                      <p className={cn('text-[9px] font-black uppercase tracking-[0.18em]', isDarkPreview ? 'text-zinc-400' : 'text-zinc-500')}>
                        {QUIZ_PRESENTATION_COPY.answerChoicesEyebrow}
                      </p>
                      <div className={cn('mt-1 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]', isDarkPreview ? 'text-emerald-300' : 'text-emerald-700')}>
                        <Orbit size={12} />
                        <span>{QUIZ_PRESENTATION_COPY.answerChoicesLabel}</span>
                      </div>
                    </div>
                    <div className={cn('h-px flex-1', isDarkPreview ? 'bg-zinc-800' : 'bg-zinc-200')} />
                  </div>
                  <div className="grid gap-3">
                    {q.options.map((option, optIndex) => {
                      const isCorrect = option === q.correctAnswer;

                      return (
                        <div
                          key={optIndex}
                          className={cn(
                            'rounded-[1.4rem] border px-4 py-3.5 text-sm transition-colors',
                            isCorrect
                              ? isDarkPreview
                                ? 'border-emerald-900/50 bg-emerald-950/35 text-emerald-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : isDarkPreview
                              ? 'border-zinc-800 bg-zinc-900 text-zinc-200'
                              : 'border-zinc-200 bg-white text-zinc-700'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                'flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] border shadow-sm',
                                isCorrect
                                  ? isDarkPreview
                                    ? 'border-emerald-700/60 bg-emerald-500/15'
                                    : 'border-emerald-200 bg-white'
                                  : isDarkPreview
                                  ? 'border-zinc-700 bg-zinc-950'
                                  : 'border-zinc-200 bg-zinc-50'
                              )}
                            >
                              <div
                                className={cn(
                                  'flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-black',
                                  isCorrect
                                    ? isDarkPreview
                                      ? 'border-emerald-700/60 bg-emerald-500/15 text-emerald-200'
                                      : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                    : isDarkPreview
                                    ? 'border-zinc-600 bg-zinc-900 text-zinc-300'
                                    : 'border-zinc-200 bg-white text-zinc-500'
                                )}
                              >
                                {getQuizOptionMarker(optIndex)}
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
                    })}
                  </div>
                </div>
              ) : null}

              <div
                className={cn(
                  'mt-5 rounded-[1.6rem] border p-4 transition-colors',
                  isDarkPreview
                    ? 'border-emerald-900/40 bg-emerald-950/20'
                    : 'border-emerald-200 bg-emerald-50'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn('text-[10px] font-black uppercase tracking-[0.18em]', isDarkPreview ? 'text-emerald-300/80' : 'text-emerald-700/80')}>
                      {QUIZ_PRESENTATION_COPY.correctAnswerEyebrow}
                    </p>
                    <div className={cn('mt-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]', isDarkPreview ? 'text-emerald-300' : 'text-emerald-700')}>
                      <CheckCircle2 size={14} />
                      <span>{QUIZ_PRESENTATION_COPY.correctAnswerLabel}</span>
                    </div>
                  </div>
                  {correctMarker ? (
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] border text-sm font-black shadow-sm',
                        isDarkPreview
                          ? 'border-emerald-700/60 bg-emerald-500/15 text-emerald-200'
                          : 'border-emerald-200 bg-white text-emerald-700'
                      )}
                    >
                      {correctMarker}
                    </div>
                  ) : null}
                </div>
                <p
                  className={cn(
                    'mt-3 text-sm font-semibold leading-relaxed',
                    isDarkPreview ? 'text-emerald-100' : 'text-emerald-900',
                    resolveQuizTextAlignmentClass(q.correctAnswer)
                  )}
                  dir={resolveQuizTextDirection(q.correctAnswer)}
                >
                  {formatQuizCorrectAnswerText(q)}
                </p>
              </div>

              <div
                className={cn(
                  'mt-4 rounded-[1.6rem] border p-4 transition-colors',
                  isDarkPreview
                    ? 'border-zinc-800 bg-zinc-900'
                    : 'border-zinc-200 bg-white'
                )}
              >
                <p className={cn('text-[10px] font-black uppercase tracking-[0.18em]', isDarkPreview ? 'text-zinc-500' : 'text-zinc-500')}>
                  {QUIZ_PRESENTATION_COPY.explanationEyebrow}
                </p>
                <div className={cn('mt-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]', isDarkPreview ? 'text-zinc-400' : 'text-zinc-500')}>
                  <FlaskConical size={14} className="text-sky-500" />
                  <span>{QUIZ_PRESENTATION_COPY.explanationLabel}</span>
                </div>
                <p
                  className={cn(
                    'mt-3 text-sm leading-relaxed',
                    isDarkPreview ? 'text-zinc-300' : 'text-zinc-600',
                    resolveQuizTextAlignmentClass(q.explanation)
                  )}
                  dir={resolveQuizTextDirection(q.explanation)}
                >
                  {q.explanation}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
