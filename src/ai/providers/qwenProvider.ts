import { AIRequestOptions, AIResponse, ProviderImplementation } from '../types';
import { toCanonicalModelId } from '../models/modelRegistry';

export class QwenProvider implements ProviderImplementation {
  id = 'qwen' as const;

  async execute(options: AIRequestOptions, contents: any): Promise<AIResponse> {
    try {
      // Qwen is handled via backend to protect API keys
      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...this.formatRequest(options, contents),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to execute Qwen request');
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error: any) {
      return { text: '', error: this.parseError(error) };
    }
  }

  formatRequest(options: AIRequestOptions, contents: any) {
    const normalizedModelId = toCanonicalModelId(options.modelId);
    const normalizedToolId = (options.toolId || '').trim();
    const userPrompt = typeof contents === 'string' ? contents : JSON.stringify(contents);

    return {
      provider: this.id,
      toolId: normalizedToolId,
      modelId: normalizedModelId,
      userPrompt,
      contents,
      userPreferences: options.userPreferences,
      fileContext: options.fileContext,
      fileName: options.fileName,
      documentContextRef: options.documentContextRef,
      directFileDispatch: options.directFileDispatch,
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        responseMimeType: options.responseMimeType,
        topP: options.providerSettings?.topP,
        topK: options.providerSettings?.topK,
        presencePenalty: options.providerSettings?.presencePenalty,
        seed: options.providerSettings?.seed,
        enableThinking: options.providerSettings?.enableThinking,
        thinkingBudget: options.providerSettings?.thinkingBudget,
        enableSearch: options.providerSettings?.enableSearch
      },
      settings: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        responseMimeType: options.responseMimeType,
        topP: options.providerSettings?.topP,
        topK: options.providerSettings?.topK,
        presencePenalty: options.providerSettings?.presencePenalty,
        seed: options.providerSettings?.seed,
        enableThinking: options.providerSettings?.enableThinking,
        thinkingBudget: options.providerSettings?.thinkingBudget,
        enableSearch: options.providerSettings?.enableSearch
      }
    };
  }

  parseResponse(response: any): AIResponse {
    // Backend should return a normalized response
    return { 
      text: response.text,
      usage: response.usage,
      modelUsed: response.modelUsed,
      fallbackHappened: response.fallbackHappened
    };
  }

  parseError(error: any): string {
    const message = error.message || "";
    const lowercaseMessage = message.toLowerCase();

    // Common Qwen API Error Patterns
    if (lowercaseMessage.includes("api key") || lowercaseMessage.includes("invalidapikey")) {
      return "Invalid Qwen API key. Please check your Qwen API key in Admin Settings.";
    }
    
    if (lowercaseMessage.includes("region") || lowercaseMessage.includes("regionmismatch")) {
      return "Qwen region mismatch. Please ensure your Qwen region matches your API key's region in Admin Settings.";
    }

    if (lowercaseMessage.includes("quota") || lowercaseMessage.includes("insufficient balance") || lowercaseMessage.includes("out of quota")) {
      return "Qwen API quota exceeded or insufficient balance. Please check your Alibaba Cloud usage.";
    }

    if (lowercaseMessage.includes("model unavailable") || lowercaseMessage.includes("model not found") || lowercaseMessage.includes("model_not_found")) {
      return "The selected Qwen model is currently unavailable or not found. Please check your model configuration.";
    }

    if (lowercaseMessage.includes("rate limit") || lowercaseMessage.includes("too many requests")) {
      return "Qwen API rate limit reached. Please try again in a moment.";
    }

    if (lowercaseMessage.includes("timeout") || lowercaseMessage.includes("deadline exceeded")) {
      return "Qwen API request timed out. Please check your connection and try again.";
    }

    return message || "Unknown Qwen error occurred";
  }
}

export const qwenProvider = new QwenProvider();
