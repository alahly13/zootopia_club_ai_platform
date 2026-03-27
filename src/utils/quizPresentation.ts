import type { QuizQuestion } from '../utils';

export const getQuizOptionMarker = (optionIndex: number): string => {
  if (optionIndex >= 0 && optionIndex < 26) {
    return String.fromCharCode(65 + optionIndex);
  }

  return String(optionIndex + 1);
};

// Shared quiz presentation copy stays centralized here so inline results,
// detached previews, and generated exports keep the same semantic hierarchy.
export const QUIZ_PRESENTATION_COPY = Object.freeze({
  reviewSheet: 'AI Review Sheet',
  answerChoicesEyebrow: 'Choice Matrix',
  answerChoicesLabel: 'Answer Choices',
  bestMatchLabel: 'Best Match',
  correctAnswerEyebrow: 'Verified Answer',
  correctAnswerLabel: 'Correct Answer',
  explanationEyebrow: 'Why It Works',
  explanationLabel: 'Explanation',
});

export const hasQuizRtlText = (value?: string) => Boolean(value && /[\u0590-\u08ff]/.test(value));

export const resolveQuizTextDirection = (value?: string): 'rtl' | 'ltr' =>
  (hasQuizRtlText(value) ? 'rtl' : 'ltr');

export const resolveQuizTextAlignmentClass = (value?: string) =>
  (hasQuizRtlText(value) ? 'text-right' : 'text-left');

export const formatQuizOptionWithMarker = (optionText: string, optionIndex: number): string =>
  `${getQuizOptionMarker(optionIndex)}. ${optionText}`;

export const getQuizCorrectAnswerMarker = (question: QuizQuestion): string | null => {
  if (!Array.isArray(question.options) || question.options.length === 0) {
    return null;
  }

  const optionIndex = question.options.findIndex((option) => option === question.correctAnswer);
  return optionIndex >= 0 ? getQuizOptionMarker(optionIndex) : null;
};

export const formatQuizCorrectAnswerText = (question: QuizQuestion): string => {
  const marker = getQuizCorrectAnswerMarker(question);
  return marker ? `${marker}. ${question.correctAnswer}` : question.correctAnswer;
};
