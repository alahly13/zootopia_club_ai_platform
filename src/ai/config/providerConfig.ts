import { AIProvider } from '../types';

export const PROVIDER_CONFIG: Record<string, AIProvider> = {
  google: {
    id: 'google',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authMethod: 'query',
    capabilities: {
      textGeneration: true,
      reasoning: true,
      quizGeneration: true,
      educationalExplanations: true,
      chatbot: true,
      longContext: true
    }
  },
  qwen: {
    id: 'qwen',
    displayName: 'Alibaba Cloud Model Studio',
    baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
    authMethod: 'header',
    capabilities: {
      textGeneration: true,
      reasoning: true,
      quizGeneration: true,
      educationalExplanations: true,
      chatbot: true,
      longContext: true
    }
  }
};
