export type AIProviderId = 'google' | 'qwen' | 'custom';

export type ModelLifecycleStatus =
  | 'active'
  | 'hidden'
  | 'experimental'
  | 'planned'
  | 'disabled'
  | 'deprecated';

export type ModelCatalogCategory =
  | 'text'
  | 'vision'
  | 'ocr'
  | 'image-generation'
  | 'image-editing'
  | 'video-generation'
  | 'audio-understanding'
  | 'speech-generation'
  | 'multimodal-analysis'
  | 'code';

export type ModelCapabilityTag =
  | 'text'
  | 'chat'
  | 'reasoning'
  | 'summarization'
  | 'code'
  | 'vision'
  | 'ocr'
  | 'image-generation'
  | 'image-editing'
  | 'infographic-generation'
  | 'video-generation'
  | 'image-to-video'
  | 'text-to-video'
  | 'audio-generation'
  | 'audio-understanding'
  | 'asr'
  | 'speech'
  | 'speech-generation'
  | 'multimodal-analysis'
  | 'translation'
  | 'realtime'
  | 'long-context';

export type ProviderTransport =
  | 'google-genai-native'
  | 'google-imagen-native'
  | 'google-veo-native'
  | 'alibaba-openai-compatible'
  | 'alibaba-native-media'
  | 'custom';

export type ToolId = string;

export interface AIProviderSettings {
  // Keep extensible to avoid breaking provider-specific settings.
  [key: string]: unknown;
}

export type TraceStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ExecutionTraceStage {
  id: string;
  label: string;
  status: TraceStageStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface StructuredAIError {
  category:
    | 'validation'
    | 'input'
    | 'auth'
    | 'permission'
    | 'network'
    | 'timeout'
    | 'provider'
    | 'routing'
    | 'cache'
    | 'parsing'
    | 'storage'
    | 'communication'
    | 'internal';
  code: string;
  message: string;
  userMessage: string;
  stage?: string;
  traceId?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

export interface ExecutionOperationMeta {
  operationId?: string;
  operationType?: string;
  toolName?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  status?: 'running' | 'success' | 'failed';
  currentStageId?: string;
  finalStageId?: string;
  stagesCompleted?: number;
  stageCount?: number;
}

export interface ExecutionResultMeta {
  ready?: boolean;
  textLength?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  fallbackHappened?: boolean;
  providerFamily?: string;
  modelUsed?: string;
}

export interface ExecutionTrace {
  traceId: string;
  toolId: string;
  actionName: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  endedAt?: string;
  elapsedMs?: number;
  currentStageId?: string;
  stages: ExecutionTraceStage[];
  retryCount?: number;
  fallback?: {
    attempted: boolean;
    usedModelId?: string;
    reason?: string;
  };
  cache?: {
    status: 'hit' | 'miss';
    keyHint?: string;
  };
  provider?: {
    family?: string;
    modelRequested?: string;
    modelResolved?: string;
  };
  failure?: {
    stageId?: string;
    category?: StructuredAIError['category'];
    code?: string;
    message?: string;
  };
  operationMeta?: ExecutionOperationMeta;
  resultMeta?: ExecutionResultMeta;
}

export interface AIObservabilityOptions {
  traceId?: string;
  actionName?: string;
  operationId?: string;
  onTraceUpdate?: (trace: ExecutionTrace) => void;
}

export interface AIAdditionalContext {
  summary?: string;
  ocr?: string;
  metadata?: unknown;
  insights?: string;
  extractedText?: string;
  extractedMarkdown?: string;
  structuredDocument?: string;
  pageMap?: string;
  headingTree?: string;
}

export interface DocumentRuntimeContextRef {
  documentId?: string | null;
  artifactId?: string | null;
  pathway?: 'local_extraction' | 'direct_file_to_model';
  documentRevision?: number | null;
  fileName?: string | null;
}

export interface DirectModelDispatchOptions {
  pathway?: 'local_extraction' | 'direct_file_to_model';
  mode?: string | null;
  userPreferences?: string | null;
}

export interface AIModelMetadata {
  id: string;
  displayName: string;
  provider: AIProviderId;
  providerId: string;
  family: string;
  modelId: string;
  modelCategory: ModelCatalogCategory;
  capabilityTags: ModelCapabilityTag[];
  transport: ProviderTransport;
  description: string;
  speedRating: number; // 1-5
  costRating: number; // 1-5
  contextSize: string;
  status: 'active' | 'preview' | 'disabled';
  lifecycleStatus: ModelLifecycleStatus;
  tags: string[];
  isFallback?: boolean;
  isEnabled?: boolean;
  isVisibleToUsers: boolean;
  category: 'Free-Friendly' | 'Balanced' | 'Advanced' | 'Experimental';
  sortOrder: number;
  supportedTools: string[];
  capabilities: {
    text: boolean;
    quiz: boolean;
    documentAnalysis: boolean;
    infographic: boolean;
    imageGeneration: boolean;
    imageEditing: boolean;
    videoGeneration: boolean;
    audioGeneration: boolean;
    speechRecognition: boolean;
    translation: boolean;
    ocr: boolean;
    vision: boolean;
    reasoning: boolean;
    longContext: boolean;
    realtime: boolean;
    streaming: boolean;
    thinking?: boolean;
  };
  supportsVision: boolean;
  supportsStreaming: boolean;
  envKeyName: string;
  envRequirements: string[];
  baseUrlResolver: string;
  regionSupport: string[];
  supportedRegions?: string[];
  adminNotes?: string;
  legacyAliases?: string[];
  
  // Core Concepts to Model
  toolCompatibility: string[];
  routingPath: string;
  promptTemplateGroup: string;
  
  // Capabilities
  supportsPreview: boolean;
  supportsExport: boolean;
  supportsPrint: boolean;
  supportsImageGeneration: boolean;
  supportsImageEditing: boolean;
  supportsVideoGeneration: boolean;
  supportsAudioGeneration: boolean;
  supportsSpeechRecognition: boolean;
  supportsTranslation: boolean;
  supportsOCR: boolean;
  supportsVisualReasoning: boolean;
  supportsTextReasoning: boolean;
  supportsLongContext: boolean;
  supportsRealtime: boolean;

  // Legacy/Other Capabilities (Keep for compatibility if needed)
  supportsText?: boolean;
  supportsFiles?: boolean;
  supportsDocumentAnalysis?: boolean;
  supportsQuizGeneration?: boolean;
  supportsGenerateContent?: boolean;
  supportsImageInput?: boolean;
  supportsVideoInput?: boolean;
  supportsSpeechSynthesis?: boolean;
  supportsEmbeddings?: boolean;
  supportsThinking?: boolean;
  supportsSearch?: boolean;
  supportsCoding?: boolean;
  supportsInfographicWorkflows?: boolean;
  supportsFileUploadFlow?: boolean;
  supportsFastMode?: boolean;
  
  recommendedTools?: string[];
  fallbackModels?: string[];
  badge?: string;
  priority: number;
}

export interface AIProvider {
  id: AIProviderId;
  displayName: string;
  baseUrl: string;
  authMethod: 'header' | 'query' | 'none';
  capabilities: {
    textGeneration: boolean;
    reasoning: boolean;
    quizGeneration: boolean;
    educationalExplanations: boolean;
    chatbot: boolean;
    longContext: boolean;
  };
}

export interface AIRequestOptions {
  modelId: string;
  toolId: ToolId;
  mode: 'standard' | 'thinking' | 'search' | 'image' | 'video' | 'chat' | 'generate' | 'analyze' | 'quiz';
  taskType: 'text' | 'image' | 'quiz' | 'document_analysis';
  apiKey?: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  responseMimeType?: string;
  responseSchema?: unknown;
  providerSettings?: AIProviderSettings;
  userPreferences?: string;
  fileContext?: string;
  fileName?: string;
  additionalContext?: AIAdditionalContext;
  documentContextRef?: DocumentRuntimeContextRef;
  directFileDispatch?: DirectModelDispatchOptions;
  selectedAssetSource?: {
    assetId: string;
    sourceProvider: string;
    sourceModelId: string;
    sourceToolId: string;
  };
  settings?: Record<string, unknown>;
  observability?: AIObservabilityOptions;
}

export interface AIResponse {
  text: string;
  modelUsed?: string;
  fallbackHappened?: boolean;
  trace?: ExecutionTrace;
  traceId?: string;
  cacheHit?: boolean;
  errorInfo?: StructuredAIError;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
}

export interface ProviderImplementation {
  id: AIProviderId;
  execute(options: AIRequestOptions, contents: any): Promise<AIResponse>;
  formatRequest(options: AIRequestOptions, contents: any): any;
  parseResponse(response: any): AIResponse;
  parseError(error: any): string;
}
