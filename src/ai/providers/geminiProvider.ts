import { GoogleGenAI } from "@google/genai";
import { AIRequestOptions, AIResponse, ProviderImplementation } from '../types';

export class GeminiProvider implements ProviderImplementation {
  id = 'google' as const;

  async execute(options: AIRequestOptions, contents: any): Promise<AIResponse> {
    try {
      const apiKey = options.apiKey;
      if (!apiKey) {
        throw new Error("Frontend Gemini execution requires an explicit client-approved API key.");
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: options.modelId,
        contents,
        config: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          responseMimeType: options.responseMimeType,
          responseSchema: options.responseSchema,
          systemInstruction: options.systemInstruction
        }
      });

      return this.parseResponse(response);
    } catch (error: any) {
      return { text: '', error: this.parseError(error) };
    }
  }

  formatRequest(options: AIRequestOptions, contents: any) {
    return {
      model: options.modelId,
      contents,
      config: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        responseMimeType: options.responseMimeType,
        responseSchema: options.responseSchema,
        systemInstruction: options.systemInstruction
      }
    };
  }

  parseResponse(response: any): AIResponse {
    return { text: response.text };
  }

  parseError(error: any): string {
    return error.message || "Unknown Gemini error";
  }
}

export const geminiProvider = new GeminiProvider();
