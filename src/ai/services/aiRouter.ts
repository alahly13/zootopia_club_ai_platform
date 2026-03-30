import { AIExecutor } from './aiExecutor';
import { Mode } from '../../components/ModeSelector';
import {
  AIObservabilityOptions,
  AIResponse,
  DirectModelDispatchOptions,
  DocumentRuntimeContextRef,
} from '../types';
import {
  buildAnalysisToolPromptConfig,
  buildChatToolPromptConfig,
  buildInfographicToolPromptConfig,
  buildQuizToolPromptConfig,
  type InfographicToolPromptInput,
  type QuizToolPromptInput,
} from '../orchestration/toolPromptConfig';

export interface QuizGenerationRouteRequest extends QuizToolPromptInput {
  content: string;
  modelId: string;
  apiKey?: string;
  providerSettings?: Record<string, any>;
  observability?: AIObservabilityOptions;
  documentContextRef?: DocumentRuntimeContextRef;
  directFileDispatch?: DirectModelDispatchOptions;
}

export interface InfographicGenerationRouteRequest extends InfographicToolPromptInput {
  content: string;
  modelId: string;
  apiKey?: string;
  providerSettings?: Record<string, any>;
  observability?: AIObservabilityOptions;
  documentContextRef?: DocumentRuntimeContextRef;
  directFileDispatch?: DirectModelDispatchOptions;
}

export class AIRouter {
  private static clipContext(content: string, limit: number): string {
    const safeContent = content || '';
    return safeContent.startsWith('[IMAGE_DATA:') ? safeContent : safeContent.substring(0, limit);
  }

  private static throwExecutionError(response: AIResponse, fallbackMessage: string): never {
    const error = new Error(response.error || fallbackMessage) as Error & {
      errorInfo?: AIResponse['errorInfo'];
      trace?: AIResponse['trace'];
      traceId?: AIResponse['traceId'];
    };

    if (response.errorInfo) {
      error.errorInfo = response.errorInfo;
    }
    if (response.trace) {
      error.trace = response.trace;
    }
    if (response.traceId) {
      error.traceId = response.traceId;
    }

    throw error;
  }

  private static parseJsonResponse<T>(text: string, errorMessage: string): T {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(errorMessage);
    }
  }

  static async analyzeDocument(
    content: string,
    fileName: string,
    modelId: string,
    apiKey?: string,
    providerSettings?: Record<string, any>,
    userPreferences?: string,
    observability?: AIObservabilityOptions,
    documentContextRef?: DocumentRuntimeContextRef,
    directFileDispatch?: DirectModelDispatchOptions
  ): Promise<AIResponse> {
    const promptConfig = buildAnalysisToolPromptConfig({
      fileName,
      hasFileContext: Boolean(content),
    });

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'analyze',
        apiKey, 
        temperature: 0.2, 
        providerSettings, 
        mode: 'analyze', 
        taskType: 'document_analysis',
        fileName,
        fileContext: this.clipContext(content, 100000),
        documentContextRef,
        directFileDispatch,
        settings: promptConfig.settings,
        userPreferences: userPreferences || promptConfig.userPreferences,
        observability,
      },
      `Please analyze the document "${fileName}".`
    );

    if (response.error) {
      this.throwExecutionError(response, 'Document analysis failed.');
    }
    return response;
  }

  static async generateQuiz(request: QuizGenerationRouteRequest): Promise<any[]> {
    const {
      content,
      questionCount,
      questionTypes,
      language,
      difficulty,
      assessmentMode,
      goal,
      style,
      typePercentages,
      generationMode,
      useDeepReasoning,
      customInstructions,
      modelId,
      apiKey,
      providerSettings,
      observability,
      documentContextRef,
      directFileDispatch,
    } = request;
    const promptConfig = buildQuizToolPromptConfig({
      questionCount,
      questionTypes,
      language,
      difficulty,
      assessmentMode,
      goal,
      style,
      typePercentages,
      generationMode,
      useDeepReasoning,
      customInstructions,
    });

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'quiz',
        apiKey,
        temperature: 0.3,
        responseMimeType: 'application/json',
        providerSettings,
        mode: (generationMode as Mode) || 'standard',
        taskType: 'quiz',
        fileContext: this.clipContext(content, 80000),
        documentContextRef,
        directFileDispatch,
        settings: promptConfig.settings,
        userPreferences: promptConfig.userPreferences,
        observability,
      },
      "Please generate the quiz based on the provided content."
    );

    if (response.error) {
      this.throwExecutionError(response, 'Quiz generation failed.');
    }

    return this.parseJsonResponse<any[]>(response.text, "AI returned invalid quiz format. Please try again.");
  }

  static async generateInfographicData(request: InfographicGenerationRouteRequest): Promise<any> {
    const {
      content,
      modelId,
      apiKey,
      providerSettings,
      observability,
      documentContextRef,
      directFileDispatch,
      ...options
    } = request;
    const promptConfig = buildInfographicToolPromptConfig(options);

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'infographic',
        apiKey,
        temperature: 0.4,
        responseMimeType: 'application/json',
        providerSettings,
        mode: 'generate',
        taskType: 'text',
        fileContext: this.clipContext(content, 60000),
        documentContextRef,
        directFileDispatch,
        settings: promptConfig.settings,
        userPreferences: promptConfig.userPreferences,
        observability,
      },
      "Please generate the infographic data based on the provided content. Ensure the output strictly follows the requested JSON schema."
    );

    if (response.error) {
      this.throwExecutionError(response, 'Infographic generation failed.');
    }

    return this.parseJsonResponse<any>(response.text, "AI returned invalid infographic format.");
  }

  static async chat(
    message: string,
    context: string,
    history: any[],
    modelId: string,
    apiKey?: string,
    providerSettings?: Record<string, any>,
    fileName?: string,
    observability?: AIObservabilityOptions,
    documentContextRef?: DocumentRuntimeContextRef,
    directFileDispatch?: DirectModelDispatchOptions
  ): Promise<string> {
    const contents = [
      ...history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];
    // Chat must send the full structured turn history, not just the latest
    // message string, otherwise prompt orchestration loses the active dialogue state.
    const promptConfig = buildChatToolPromptConfig({
      conversationMode: providerSettings?.enableSearch
        ? 'search'
        : providerSettings?.enableThinking
          ? 'thinking'
          : 'standard',
      historyTurns: history.length,
      hasDocumentContext: Boolean(context),
      fileName,
    });

    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'chat',
        apiKey,
        temperature: 0.7,
        providerSettings,
        mode: 'chat',
        taskType: 'text',
        fileContext: context,
        documentContextRef,
        directFileDispatch,
        fileName,
        settings: promptConfig.settings,
        observability,
      },
      contents
    );

    if (response.error) {
      this.throwExecutionError(response, 'Chat generation failed.');
    }
    return response.text;
  }

  static async generateTopicImagePrompt(
    content: string,
    modelId: string,
    apiKey?: string,
    providerSettings?: Record<string, any>,
    observability?: AIObservabilityOptions,
    documentContextRef?: DocumentRuntimeContextRef
  ): Promise<string> {
    const response = await AIExecutor.executeWithFallback(
      { 
        modelId, 
        toolId: 'image',
        apiKey, 
        temperature: 0.8, 
        providerSettings, 
        mode: 'generate',
        taskType: 'image',
        fileContext: this.clipContext(content, 20000),
        documentContextRef,
        observability,
      },
      "Based on this scientific content, generate a highly descriptive, professional prompt for a state-of-the-art AI image generator."
    );

    if (response.error) {
      this.throwExecutionError(response, 'Image prompt generation failed.');
    }
    return response.text;
  }
}
