import { GoogleGenAI } from "@google/genai";
import { logDiagnostic, normalizeError } from './diagnostics';
import { AI_PROVIDER_EXECUTION_TIMEOUT_MS } from '../src/ai/config/timeoutBudgets.js';
import { ProviderRuntimeResolution } from './providerRuntime.js';

export interface AIProviderResponse {
  success: boolean;
  text?: string;
  error?: string;
  usage?: any;
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

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

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export class GeminiProvider {
  private static extractTextOrInlineData(response: any): string {
    if (typeof response?.text === 'string' && response.text.trim()) {
      return response.text;
    }

    for (const part of response?.candidates?.[0]?.content?.parts || []) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        return part.text;
      }
      if (part?.inlineData?.data && part?.inlineData?.mimeType) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }

    return '';
  }

  static async execute(
    modelId: string,
    contents: any,
    config: any,
    runtime: ProviderRuntimeResolution
  ): Promise<AIProviderResponse> {
    try {
      const traceId = config?.traceId;
      logDiagnostic('info', 'ai_provider.gemini_execute_start', {
        traceId,
        area: 'aiProviders',
        provider: 'google',
        modelId,
        details: {
          region: runtime.region,
          endpoint: runtime.endpoint,
          envKeyName: runtime.envKeyName,
          envCredentialResolved: runtime.credentialResolved,
        },
      });

      const ai = new GoogleGenAI({ apiKey: runtime.apiKey });
      const response = await withTimeout(
        ai.models.generateContent({
          model: modelId,
          contents,
          config: {
            temperature: config?.temperature,
            maxOutputTokens: config?.maxOutputTokens,
            responseMimeType: config?.responseMimeType,
            responseSchema: config?.responseSchema,
            systemInstruction: config?.systemInstruction,
            thinkingConfig: config?.thinkingConfig
          }
        }),
        AI_PROVIDER_EXECUTION_TIMEOUT_MS,
        'Gemini provider request timed out while waiting for the model response.'
      );

      logDiagnostic('info', 'ai_provider.gemini_execute_success', {
        traceId,
        area: 'aiProviders',
        provider: 'google',
        modelId,
        details: {
          region: runtime.region,
          endpoint: runtime.endpoint,
        },
      });
      return {
        success: true,
        text: this.extractTextOrInlineData(response),
        usage: response?.usageMetadata,
      };
    } catch (error: any) {
      logDiagnostic('error', 'ai_provider.gemini_execute_failed', {
        traceId: config?.traceId,
        area: 'aiProviders',
        provider: 'google',
        modelId,
        details: {
          region: runtime.region,
          endpoint: runtime.endpoint,
          error: normalizeError(error),
        },
      });
      return { success: false, error: error.message || "Gemini execution failed" };
    }
  }
}

export class QwenProvider {
  private static toQwenRole(role: string): 'assistant' | 'user' | 'system' {
    if (role === 'model' || role === 'assistant') return 'assistant';
    if (role === 'system') return 'system';
    return 'user';
  }

  private static extractTextContent(input: any): string {
    if (!input) return '';

    if (typeof input === 'string') return input;
    if (typeof input.content === 'string') return input.content;
    if (Array.isArray(input.parts)) {
      return input.parts
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('\n');
    }

    return '';
  }

  static async execute(
    modelId: string,
    contents: any,
    config: any,
    runtime: ProviderRuntimeResolution
  ): Promise<AIProviderResponse> {
    try {
      const traceId = config?.traceId;
      logDiagnostic('info', 'ai_provider.qwen_execute_start', {
        traceId,
        area: 'aiProviders',
        provider: 'qwen',
        modelId,
        details: {
          region: runtime.region,
          endpoint: runtime.endpoint,
          envKeyName: runtime.envKeyName,
          envCredentialResolved: runtime.credentialResolved,
        },
      });

      const messages = [];
      
      // Add system instruction if present
      if (config?.systemInstruction) {
        messages.push({
          role: 'system',
          content: typeof config.systemInstruction === 'string' 
            ? config.systemInstruction 
            : (config.systemInstruction.parts?.[0]?.text || '')
        });
      }

      // Map contents to OpenAI format
      if (Array.isArray(contents)) {
        contents.forEach((c: any) => {
          const text = this.extractTextContent(c);
          const imageMatch = text.match(/\[IMAGE_DATA:(.*?);base64,(.*?)\]/);
          
          if (imageMatch) {
            const mimeType = imageMatch[1];
            const base64Data = imageMatch[2];
            const cleanText = text.replace(/\[IMAGE_DATA:.*?;base64,.*?\]/, '').trim();
            
            const contentArray: any[] = [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
            ];
            if (cleanText) {
              contentArray.push({ type: "text", text: cleanText });
            }
            
            messages.push({
              role: this.toQwenRole(c.role),
              content: contentArray
            });
          } else {
            messages.push({
              role: this.toQwenRole(c.role),
              content: text
            });
          }
        });
      } else if (typeof contents === 'string') {
        const imageMatch = contents.match(/\[IMAGE_DATA:(.*?);base64,(.*?)\]/);
        if (imageMatch) {
          const mimeType = imageMatch[1];
          const base64Data = imageMatch[2];
          const cleanText = contents.replace(/\[IMAGE_DATA:.*?;base64,.*?\]/, '').trim();
          
          const contentArray: any[] = [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
          ];
          if (cleanText) {
            contentArray.push({ type: "text", text: cleanText });
          }
          
          messages.push({ role: 'user', content: contentArray });
        } else {
          messages.push({ role: 'user', content: contents });
        }
      }

      const response = await fetchWithTimeout(runtime.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${runtime.apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          temperature: config?.temperature ?? 0.7,
          max_tokens: config?.maxOutputTokens || 2000,
          top_p: config?.topP,
          top_k: config?.topK,
          presence_penalty: config?.presencePenalty,
          seed: config?.seed,
          enable_thinking: config?.enableThinking,
          thinking_budget: config?.thinkingBudget,
          enable_search: config?.enableSearch,
          response_format: config?.responseMimeType === 'application/json' ? { type: "json_object" } : undefined
        })
      }, AI_PROVIDER_EXECUTION_TIMEOUT_MS, 'Qwen provider request timed out while waiting for the model response.');

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Qwen API Error: ${error.error?.message || error.message || response.statusText}`);
      }

      const data: any = await response.json();
      logDiagnostic('info', 'ai_provider.qwen_execute_success', {
        traceId,
        area: 'aiProviders',
        provider: 'qwen',
        modelId,
        details: {
          region: runtime.region,
          endpoint: runtime.endpoint,
        },
      });
      return { 
        success: true, 
        text: data.choices[0].message.content,
        usage: data.usage
      };
    } catch (error: any) {
      logDiagnostic('error', 'ai_provider.qwen_execute_failed', {
        traceId: config?.traceId,
        area: 'aiProviders',
        provider: 'qwen',
        modelId,
        details: {
          region: runtime.region,
          endpoint: runtime.endpoint,
          error: normalizeError(error),
        },
      });
      return { success: false, error: error.message || "Qwen execution failed" };
    }
  }
}

/**
 * Future-ready adapter placeholders
 * --------------------------------------------------------------------------
 * Keep provider connection methods separated by transport so new Google or
 * Alibaba media families can be activated without forcing them through the
 * text/chat adapter path used by Gemini text or DashScope compatible mode.
 */
export class GoogleImagenProvider {
  static async execute(
    _modelId: string,
    _contents: any,
    _config: any,
    runtime: ProviderRuntimeResolution
  ): Promise<AIProviderResponse> {
    return {
      success: false,
      error: `Provider adapter ${runtime.adapterId} is not enabled in this environment yet.`,
    };
  }
}

export class GoogleVeoProvider {
  static async execute(
    _modelId: string,
    _contents: any,
    _config: any,
    runtime: ProviderRuntimeResolution
  ): Promise<AIProviderResponse> {
    return {
      success: false,
      error: `Provider adapter ${runtime.adapterId} is not enabled in this environment yet.`,
    };
  }
}

export class AlibabaNativeMediaProvider {
  static async execute(
    _modelId: string,
    _contents: any,
    _config: any,
    runtime: ProviderRuntimeResolution
  ): Promise<AIProviderResponse> {
    return {
      success: false,
      error: `Provider adapter ${runtime.adapterId} is not enabled in this environment yet.`,
    };
  }
}

export const executeWithProviderAdapter = async (
  modelId: string,
  contents: any,
  config: any,
  runtime: ProviderRuntimeResolution
): Promise<AIProviderResponse> => {
  switch (runtime.adapterId) {
    case 'google-genai-native':
      return GeminiProvider.execute(modelId, contents, config, runtime);
    case 'google-imagen-native':
      return GoogleImagenProvider.execute(modelId, contents, config, runtime);
    case 'google-veo-native':
      return GoogleVeoProvider.execute(modelId, contents, config, runtime);
    case 'alibaba-openai-compatible':
      return QwenProvider.execute(modelId, contents, config, runtime);
    case 'alibaba-native-media':
      return AlibabaNativeMediaProvider.execute(modelId, contents, config, runtime);
    default:
      return {
        success: false,
        error: `Unsupported provider adapter: ${runtime.adapterId}`,
      };
  }
};
