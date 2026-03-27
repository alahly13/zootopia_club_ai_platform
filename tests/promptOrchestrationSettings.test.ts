import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRouter } from '../src/ai/services/aiRouter.ts';
import { AIExecutor } from '../src/ai/services/aiExecutor.ts';
import { PromptOrchestrator } from '../src/ai/services/promptOrchestrator.ts';

test('quiz routing preserves structured settings and custom instructions', async () => {
  const originalExecuteWithFallback = AIExecutor.executeWithFallback;
  let capturedOptions: Record<string, unknown> | null = null;
  let capturedContents: unknown = null;

  (AIExecutor as any).executeWithFallback = async (options: Record<string, unknown>, contents: unknown) => {
    capturedOptions = options;
    capturedContents = contents;
    return { text: '[]' };
  };

  try {
    await AIRouter.generateQuiz({
      content: 'Photosynthesis content',
      questionCount: 12,
      questionTypes: ['multiple_choice', 'true_false'],
      language: 'Arabic',
      difficulty: 'Advanced',
      assessmentMode: 'quiz',
      goal: 'exam',
      style: 'socratic',
      typePercentages: {
        multiple_choice: 70,
        true_false: 30,
      },
      generationMode: 'thinking',
      useDeepReasoning: true,
      customInstructions: 'Keep the explanations short and exam-focused.',
      modelId: 'gemini-3-flash-preview',
      providerSettings: { enableThinking: true },
    });

    assert.equal(capturedContents, 'Please generate the quiz based on the provided content.');
    assert.deepEqual(capturedOptions?.settings, {
      questionCount: 12,
      questionTypes: ['multiple_choice', 'true_false'],
      language: 'Arabic',
      difficulty: 'Advanced',
      assessmentMode: 'quiz',
      goal: 'exam',
      style: 'socratic',
      typePercentages: {
        multiple_choice: 70,
        true_false: 30,
      },
      generationMode: 'thinking',
      useDeepReasoning: true,
    });
    assert.equal(
      capturedOptions?.userPreferences,
      'Keep the explanations short and exam-focused.'
    );
    assert.equal(capturedOptions?.mode, 'thinking');
  } finally {
    (AIExecutor as any).executeWithFallback = originalExecuteWithFallback;
  }
});

test('infographic routing preserves structured visual settings and custom instructions', async () => {
  const originalExecuteWithFallback = AIExecutor.executeWithFallback;
  let capturedOptions: Record<string, unknown> | null = null;

  (AIExecutor as any).executeWithFallback = async (options: Record<string, unknown>) => {
    capturedOptions = options;
    return {
      text: JSON.stringify({
        title: 'Photosynthesis',
        summary: 'Summary',
        keyPoints: [],
        stats: [],
        chartData: [],
        didYouKnow: 'Fact',
        themeColor: '#10b981',
      }),
    };
  };

  try {
    await AIRouter.generateInfographicData({
      content: 'Photosynthesis content',
      template: 'Banana',
      density: 'Detailed',
      tone: 'Academic',
      emphasis: 'Insights',
      colorPalette: 'Indigo',
      layout: 'Bento',
      iconStyle: 'Minimal',
      detailLevel: 'High',
      resultThemeMode: 'dark',
      customInstructions: 'Use concise academic phrasing.',
      modelId: 'gemini-3-flash-preview',
    });

    assert.deepEqual(capturedOptions?.settings, {
      template: 'Banana',
      density: 'Detailed',
      tone: 'Academic',
      emphasis: 'Insights',
      colorPalette: 'Indigo',
      layout: 'Bento',
      iconStyle: 'Minimal',
      detailLevel: 'High',
      resultThemeMode: 'dark',
    });
    assert.equal(capturedOptions?.userPreferences, 'Use concise academic phrasing.');
  } finally {
    (AIExecutor as any).executeWithFallback = originalExecuteWithFallback;
  }
});

test('chat routing sends the full history contents and explicit conversation settings', async () => {
  const originalExecuteWithFallback = AIExecutor.executeWithFallback;
  let capturedOptions: Record<string, unknown> | null = null;
  let capturedContents: any = null;

  (AIExecutor as any).executeWithFallback = async (options: Record<string, unknown>, contents: unknown) => {
    capturedOptions = options;
    capturedContents = contents;
    return { text: 'ok' };
  };

  try {
    await AIRouter.chat(
      'What does this chart mean?',
      'Document context',
      [{ role: 'user', content: 'Summarize chapter 1.' }],
      'gemini-3-flash-preview',
      undefined,
      { enableSearch: true },
      'chapter1.pdf'
    );

    assert.ok(Array.isArray(capturedContents));
    assert.equal(capturedContents.length, 2);
    assert.deepEqual(capturedContents[0], {
      role: 'user',
      parts: [{ text: 'Summarize chapter 1.' }],
    });
    assert.deepEqual(capturedContents[1], {
      role: 'user',
      parts: [{ text: 'What does this chart mean?' }],
    });
    assert.deepEqual(capturedOptions?.settings, {
      conversationMode: 'search',
      historyTurns: 1,
      hasDocumentContext: true,
      fileName: 'chapter1.pdf',
    });
  } finally {
    (AIExecutor as any).executeWithFallback = originalExecuteWithFallback;
  }
});

test('prompt orchestrator renders structured settings and high-priority custom instructions', () => {
  const orchestration = PromptOrchestrator.orchestrate(
    'quiz',
    'Generate the quiz.',
    'gemini-3-flash-preview',
    {
      toolId: 'quiz',
      settings: {
        questionCount: 10,
        questionTypes: ['multiple_choice', 'true_false'],
        language: 'English',
        difficulty: 'Intermediate',
        assessmentMode: 'quiz',
        goal: 'practice',
        style: 'academic',
      },
      userPreferences: 'Use a reassuring tone.',
    }
  );

  assert.match(orchestration.prompt, /\[TOOL SETTINGS\]/);
  assert.match(orchestration.prompt, /Question Count: 10/);
  assert.match(orchestration.prompt, /\[USER CUSTOM INSTRUCTIONS - HIGH PRIORITY\]/);
  assert.match(orchestration.prompt, /Use a reassuring tone\./);
});
