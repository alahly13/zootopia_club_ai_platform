export interface NormalizedToolPromptConfig {
  settings?: Record<string, unknown>;
  userPreferences?: string;
}

export interface QuizToolPromptInput {
  questionCount: number;
  questionTypes: string[];
  language: string;
  difficulty: string;
  assessmentMode: 'quiz' | 'questions';
  goal?: string;
  style?: string;
  typePercentages?: Record<string, number>;
  generationMode?: string;
  useDeepReasoning?: boolean;
  customInstructions?: string;
}

export interface InfographicToolPromptInput {
  template: 'Nano' | 'Banana' | 'Free';
  density: 'Minimal' | 'Balanced' | 'Detailed';
  tone: 'Professional' | 'Creative' | 'Academic' | 'Casual';
  emphasis: 'Data' | 'Summary' | 'Insights';
  colorPalette: 'Emerald' | 'Amber' | 'Indigo' | 'Rose' | 'Zinc';
  layout: 'Grid' | 'Linear' | 'Bento';
  iconStyle: 'Solid' | 'Outline' | 'Minimal' | 'None';
  detailLevel: 'High' | 'Medium' | 'Low';
  resultThemeMode?: 'dark' | 'light';
  customInstructions?: string;
}

export interface StudyToolPromptInput {
  studyToolId: string;
  studyToolLabel?: string;
  generationMode?: string;
  customInstructions?: string;
}

export interface ChatToolPromptInput {
  conversationMode?: string;
  historyTurns?: number;
  hasDocumentContext?: boolean;
  fileName?: string;
}

export interface AnalysisToolPromptInput {
  fileName: string;
  hasFileContext?: boolean;
}

const trimOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string') {
    return trimOptionalString(value);
  }

  if (Array.isArray(value)) {
    const sanitizedItems = value
      .map((item) => sanitizeValue(item))
      .filter((item) => item !== undefined);

    return sanitizedItems.length > 0 ? sanitizedItems : undefined;
  }

  if (typeof value === 'object') {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, sanitizeValue(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== undefined);

    return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : undefined;
  }

  return value;
};

export const sanitizeToolSettings = (
  settings?: Record<string, unknown>
): Record<string, unknown> | undefined => {
  const sanitized = sanitizeValue(settings);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return undefined;
  }

  return sanitized as Record<string, unknown>;
};

export const buildQuizToolPromptConfig = (
  input: QuizToolPromptInput
): NormalizedToolPromptConfig => ({
  settings: sanitizeToolSettings({
    questionCount: input.questionCount,
    questionTypes: input.questionTypes,
    language: input.language,
    difficulty: input.difficulty,
    assessmentMode: input.assessmentMode,
    goal: input.goal,
    style: input.style,
    typePercentages: input.typePercentages,
    generationMode: input.generationMode,
    useDeepReasoning: input.useDeepReasoning,
  }),
  userPreferences: trimOptionalString(input.customInstructions),
});

export const buildInfographicToolPromptConfig = (
  input: InfographicToolPromptInput
): NormalizedToolPromptConfig => ({
  settings: sanitizeToolSettings({
    template: input.template,
    density: input.density,
    tone: input.tone,
    emphasis: input.emphasis,
    colorPalette: input.colorPalette,
    layout: input.layout,
    iconStyle: input.iconStyle,
    detailLevel: input.detailLevel,
    resultThemeMode: input.resultThemeMode,
  }),
  userPreferences: trimOptionalString(input.customInstructions),
});

export const buildStudyToolPromptConfig = (
  input: StudyToolPromptInput
): NormalizedToolPromptConfig => ({
  settings: sanitizeToolSettings({
    studyToolId: input.studyToolId,
    studyToolLabel: input.studyToolLabel,
    generationMode: input.generationMode,
  }),
  userPreferences: trimOptionalString(input.customInstructions),
});

export const buildChatToolPromptConfig = (
  input: ChatToolPromptInput
): NormalizedToolPromptConfig => ({
  settings: sanitizeToolSettings({
    conversationMode: input.conversationMode,
    historyTurns: input.historyTurns,
    hasDocumentContext: input.hasDocumentContext,
    fileName: input.fileName,
  }),
});

export const buildAnalysisToolPromptConfig = (
  input: AnalysisToolPromptInput
): NormalizedToolPromptConfig => ({
  settings: sanitizeToolSettings({
    fileName: input.fileName,
    hasFileContext: input.hasFileContext,
  }),
});

const formatList = (value: unknown): string | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return value.map((entry) => String(entry)).join(', ');
};

const formatInlineJson = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return JSON.stringify(value);
};

/**
 * Tool settings are rendered explicitly before the raw JSON block so prompt
 * adherence stays readable for both model execution and future debugging.
 */
export const formatToolSettingsForPrompt = (
  toolId: string,
  settings?: Record<string, unknown>
): string => {
  const sanitizedSettings = sanitizeToolSettings(settings);
  if (!sanitizedSettings) {
    return '';
  }

  const lines: string[] = [];

  if (toolId === 'quiz') {
    lines.push(`- Question Count: ${String(sanitizedSettings.questionCount ?? 'Not specified')}`);
    lines.push(`- Question Types: ${formatList(sanitizedSettings.questionTypes) || 'Not specified'}`);
    lines.push(`- Language: ${String(sanitizedSettings.language ?? 'Not specified')}`);
    lines.push(`- Difficulty: ${String(sanitizedSettings.difficulty ?? 'Not specified')}`);
    lines.push(`- Assessment Mode: ${String(sanitizedSettings.assessmentMode ?? 'Not specified')}`);
    if (sanitizedSettings.goal) {
      lines.push(`- Goal: ${String(sanitizedSettings.goal)}`);
    }
    if (sanitizedSettings.style) {
      lines.push(`- Style: ${String(sanitizedSettings.style)}`);
    }
    if (sanitizedSettings.generationMode) {
      lines.push(`- Generation Mode: ${String(sanitizedSettings.generationMode)}`);
    }
    if (sanitizedSettings.typePercentages) {
      lines.push(`- Requested Type Distribution: ${formatInlineJson(sanitizedSettings.typePercentages)}`);
    }
    if (typeof sanitizedSettings.useDeepReasoning === 'boolean') {
      lines.push(`- Deep Reasoning Requested: ${sanitizedSettings.useDeepReasoning ? 'Yes' : 'No'}`);
    }
  } else if (toolId === 'infographic') {
    lines.push(`- Template: ${String(sanitizedSettings.template ?? 'Not specified')}`);
    lines.push(`- Density: ${String(sanitizedSettings.density ?? 'Not specified')}`);
    lines.push(`- Tone: ${String(sanitizedSettings.tone ?? 'Not specified')}`);
    lines.push(`- Emphasis: ${String(sanitizedSettings.emphasis ?? 'Not specified')}`);
    lines.push(`- Color Palette: ${String(sanitizedSettings.colorPalette ?? 'Not specified')}`);
    lines.push(`- Layout: ${String(sanitizedSettings.layout ?? 'Not specified')}`);
    lines.push(`- Icon Style: ${String(sanitizedSettings.iconStyle ?? 'Not specified')}`);
    lines.push(`- Detail Level: ${String(sanitizedSettings.detailLevel ?? 'Not specified')}`);
    if (sanitizedSettings.resultThemeMode) {
      lines.push(`- Result Theme Mode: ${String(sanitizedSettings.resultThemeMode)}`);
    }
  } else if (
    ['summary', 'flashcards', 'mindmap', 'concepts', 'notes', 'diagrams'].includes(toolId)
  ) {
    lines.push(`- Study Tool: ${String(sanitizedSettings.studyToolLabel || sanitizedSettings.studyToolId || toolId)}`);
    if (sanitizedSettings.generationMode) {
      lines.push(`- Generation Mode: ${String(sanitizedSettings.generationMode)}`);
    }
  } else if (toolId === 'chat') {
    if (sanitizedSettings.conversationMode) {
      lines.push(`- Conversation Mode: ${String(sanitizedSettings.conversationMode)}`);
    }
    if (sanitizedSettings.historyTurns !== undefined) {
      lines.push(`- Prior Conversation Turns: ${String(sanitizedSettings.historyTurns)}`);
    }
    if (typeof sanitizedSettings.hasDocumentContext === 'boolean') {
      lines.push(`- Document Context Available: ${sanitizedSettings.hasDocumentContext ? 'Yes' : 'No'}`);
    }
    if (sanitizedSettings.fileName) {
      lines.push(`- Active File Name: ${String(sanitizedSettings.fileName)}`);
    }
  } else if (toolId === 'analyze') {
    if (sanitizedSettings.fileName) {
      lines.push(`- File Name: ${String(sanitizedSettings.fileName)}`);
    }
    if (typeof sanitizedSettings.hasFileContext === 'boolean') {
      lines.push(`- Extracted File Context Available: ${sanitizedSettings.hasFileContext ? 'Yes' : 'No'}`);
    }
  }

  const formattedSummary = lines.length > 0 ? `${lines.join('\n')}\n\n` : '';
  return `${formattedSummary}[TOOL SETTINGS JSON]\n${JSON.stringify(sanitizedSettings, null, 2)}`;
};
