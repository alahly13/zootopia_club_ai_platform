import { logger } from "../utils/logger";
import { AIModel } from "../utils/aiModels";
import {
  AIRouter,
  type InfographicGenerationRouteRequest,
  type QuizGenerationRouteRequest,
} from "../ai/services/aiRouter";
import { AIExecutor } from "../ai/services/aiExecutor";
import {
  AIObservabilityOptions,
  AIResponse,
  DirectModelDispatchOptions,
  DocumentRuntimeContextRef,
} from "../ai/types";
import { toCanonicalModelId } from "../ai/models/modelRegistry";
import { AI_UI_EXECUTION_TIMEOUT_MS } from "../ai/config/timeoutBudgets";

const getModelId = (modelConfig?: AIModel) => {
  // Keep existing default behavior while allowing callers to pass either id or modelId safely.
  return toCanonicalModelId(modelConfig?.id || modelConfig?.modelId || "gemini-3-flash-preview");
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

/**
 * Maps raw API errors to user-friendly messages.
 */
const mapErrorToMessage = (error: any): string => {
  const structuredMessage =
    typeof error?.errorInfo?.userMessage === 'string'
      ? error.errorInfo.userMessage.trim()
      : '';
  if (structuredMessage) {
    return structuredMessage;
  }

  const message = error.message || "";
  
  if (message.includes("timeout") || message.includes("deadline")) {
    return "The AI request timed out. This often happens with large documents or complex tasks. Please try a faster model or a smaller document.";
  }
  if (message.includes("not found") || message.includes("404")) {
    return "The selected AI model is currently unavailable or not found. Please try switching to another model.";
  }
  if (
    message.includes("expected oauth 2 access token") ||
    message.includes("invalid authentication credentials") ||
    message.includes("invalid authentication credential")
  ) {
    return "Generation reached the AI provider, but the server-side Gemini credentials were rejected. Please retry once. If it continues, the backend Gemini configuration needs attention.";
  }
  if (message.includes("session is invalid") || message.includes("sign in again")) {
    return "Your session is no longer valid for AI generation. Please sign in again and retry.";
  }
  if (message.includes("not supported for generateContent")) {
    return "This model does not support content generation. Please choose a compatible model.";
  }
  if (message.includes("quota") || message.includes("429")) {
    return "API quota exceeded. Please wait a moment or try a different model.";
  }
  if (message.includes("safety")) {
    return "The request was blocked by safety filters. Please try with different content.";
  }
  if (message.includes("ThinkingLevel") || message.includes("thinkingLevel")) {
    return "The selected model does not support advanced reasoning. Please switch to a more capable model.";
  }
  
  return message || "An unexpected error occurred while communicating with the AI.";
};

const throwFriendlyError = (error: any, friendlyMessage: string): never => {
  // Preserve backend/AI executor diagnostics while still mapping the visible
  // message into calmer UX copy for cards, trackers, and retry surfaces.
  const wrapped = new Error(friendlyMessage) as Error & {
    errorInfo?: unknown;
    traceId?: string;
    trace?: unknown;
    details?: unknown;
  };

  if (error?.errorInfo) {
    wrapped.errorInfo = error.errorInfo;
  }
  if (error?.traceId) {
    wrapped.traceId = error.traceId;
  }
  if (error?.trace) {
    wrapped.trace = error.trace;
  }
  if (error?.details) {
    wrapped.details = error.details;
  }

  throw wrapped;
};

export const analyzeDocument = async (
  content: string,
  fileName: string,
  modelConfig?: AIModel,
  providerSettings?: Record<string, any>,
  userPreferences?: string,
  observability?: AIObservabilityOptions,
  documentContextRef?: DocumentRuntimeContextRef,
  directFileDispatch?: DirectModelDispatchOptions
) => {
  const modelId = getModelId(modelConfig);
  logger.info('Starting AI document analysis', { fileName, model: modelId });
  
  try {
    const result = await withTimeout(
      AIRouter.analyzeDocument(
        content,
        fileName,
        modelId,
        modelConfig?.apiKey,
        providerSettings,
        userPreferences,
        observability,
        documentContextRef,
        directFileDispatch
      ),
      AI_UI_EXECUTION_TIMEOUT_MS,
      "Document analysis timed out. The file might be too large or the model is busy."
    );

    logger.info('AI analysis complete');
    return result;
  } catch (error: any) {
    const friendlyMessage = mapErrorToMessage(error);
    logger.error('AI analysis failed', { error: error.message, friendlyMessage });
    throwFriendlyError(error, friendlyMessage);
  }
};

export interface QuizGenerationRequest extends Omit<QuizGenerationRouteRequest, 'modelId' | 'apiKey'> {
  modelConfig?: AIModel;
}

export const generateQuiz = async (request: QuizGenerationRequest) => {
  const modelId = getModelId(request.modelConfig);

  try {
    const quiz = await withTimeout(
      AIRouter.generateQuiz({
        ...request,
        modelId,
        apiKey: request.modelConfig?.apiKey,
      }),
      AI_UI_EXECUTION_TIMEOUT_MS,
      "Quiz generation timed out. Try reducing the number of questions or choosing a faster model."
    );
    
    return quiz;
  } catch (error: any) {
    const friendlyMessage = mapErrorToMessage(error);
    logger.error('Quiz generation failed', { error: error.message, friendlyMessage });
    throwFriendlyError(error, friendlyMessage);
  }
};

export interface InfographicGenerationRequest extends Omit<InfographicGenerationRouteRequest, 'modelId' | 'apiKey'> {
  modelConfig?: AIModel;
}

export const generateInfographicData = async (request: InfographicGenerationRequest) => {
  const modelId = getModelId(request.modelConfig);
  try {
    const data = await withTimeout(
      AIRouter.generateInfographicData({
        ...request,
        modelId,
        apiKey: request.modelConfig?.apiKey,
      }),
      AI_UI_EXECUTION_TIMEOUT_MS,
      "Infographic generation timed out. Try a faster model."
    );

    return data;
  } catch (error: any) {
    const friendlyMessage = mapErrorToMessage(error);
    logger.error('Infographic generation failed', { error: error.message, friendlyMessage });
    throwFriendlyError(error, friendlyMessage);
  }
};

export const chatWithAI = async (
  message: string,
  context: string,
  modelConfig?: AIModel,
  history: any[] = [],
  providerSettings?: Record<string, any>,
  fileName?: string,
  observability?: AIObservabilityOptions,
  documentContextRef?: DocumentRuntimeContextRef,
  directFileDispatch?: DirectModelDispatchOptions
) => {
  const modelId = getModelId(modelConfig);
  try {
    const text = await withTimeout(
      AIRouter.chat(
        message,
        context,
        history,
        modelId,
        modelConfig?.apiKey,
        providerSettings,
        fileName,
        observability,
        documentContextRef,
        directFileDispatch
      ),
      AI_UI_EXECUTION_TIMEOUT_MS,
      "The AI is taking too long to respond. Please try again."
    );
    
    return text;
  } catch (error: any) {
    const friendlyMessage = mapErrorToMessage(error);
    logger.error('Chat failed', { error: error.message, friendlyMessage });
    throwFriendlyError(error, friendlyMessage);
  }
};

export const generateTopicImagePrompt = async (
  content: string,
  modelConfig?: AIModel,
  providerSettings?: Record<string, any>,
  observability?: AIObservabilityOptions,
  documentContextRef?: DocumentRuntimeContextRef
) => {
  const modelId = getModelId(modelConfig);
  try {
    const text = await withTimeout(
      AIRouter.generateTopicImagePrompt(
        content,
        modelId,
        modelConfig?.apiKey,
        providerSettings,
        observability,
        documentContextRef
      ),
      AI_UI_EXECUTION_TIMEOUT_MS,
      "Image prompt generation timed out."
    );

    return text;
  } catch (error: any) {
    const friendlyMessage = mapErrorToMessage(error);
    logger.error('Image prompt generation failed', { error: error.message, friendlyMessage });
    throwFriendlyError(error, friendlyMessage);
  }
};

export const generateImage = async (prompt: string, size: "1K" | "2K" | "4K" = "1K", aspectRatio: string = "1:1", modelConfig?: AIModel, observability?: AIObservabilityOptions) => {
  const modelId = getModelId(modelConfig);
  
  try {
    const response = await withTimeout(
      AIExecutor.execute({
        modelId,
        toolId: 'image-generator',
        taskType: 'image',
        mode: 'image',
        settings: { size, aspectRatio },
        observability,
      }, prompt),
      AI_UI_EXECUTION_TIMEOUT_MS,
      "Image generation timed out. Image models can be slow."
    ) as AIResponse;

    if (response.error) throw new Error(response.error);
    return response.text;
  } catch (error: any) {
    const friendlyMessage = mapErrorToMessage(error);
    logger.error('Image generation failed', { error: error.message, friendlyMessage });
    throwFriendlyError(error, friendlyMessage);
  }
};

export const editImage = async (
  prompt: string,
  sourceImageDataUrl: string,
  modelConfig?: AIModel,
  observability?: AIObservabilityOptions,
  selectedAssetSource?: {
    assetId: string;
    sourceProvider: string;
    sourceModelId: string;
    sourceToolId: string;
  }
) => {
  const modelId = getModelId(modelConfig);
  const imageMatch = String(sourceImageDataUrl || '').match(/^data:(.+?);base64,(.+)$/);

  if (!imageMatch) {
    throw new Error('Source image is invalid or unavailable for editing.');
  }

  const editPayload = `[IMAGE_DATA:${imageMatch[1]};base64,${imageMatch[2]}]\n${prompt}`;

  try {
    const response = await withTimeout(
      AIExecutor.execute(
        {
          modelId,
          toolId: 'image-editor',
          taskType: 'image',
          mode: 'image',
          selectedAssetSource,
          observability,
        },
        editPayload
      ),
      AI_UI_EXECUTION_TIMEOUT_MS,
      "Image editing timed out. Please retry with a shorter edit prompt."
    ) as AIResponse;

    if (response.error) throw new Error(response.error);
    return response.text;
  } catch (error: any) {
    const friendlyMessage = mapErrorToMessage(error);
    logger.error('Image editing failed', { error: error.message, friendlyMessage });
    throwFriendlyError(error, friendlyMessage);
  }
};
