/*
 * Copyright (c) Elmahdy Abdallah Youssef. All rights reserved.
 * Developed by Elmahdy Abdallah Youssef, Software Developer.
 * Class of 2022, Faculty of Science, Cairo University, Zoology Department.
 */

import { AIRequestOptions, AIResponse, ExecutionTrace, ExecutionTraceStage, StructuredAIError } from '../types';
import { getModelByAnyId, toCanonicalModelId } from '../models/modelRegistry';
import { MasterConnectionSystem } from './masterConnectionSystem';
import { GoogleGenAI } from "@google/genai";
import { PromptOrchestrator } from './promptOrchestrator';
import { aiCache } from './cacheService';
import { auth } from '../../firebase';
import { getFallbackPlan } from '../fallbackPolicy';
import { fetchDocumentPromptContext } from '../../services/documentRuntimeService';
import {
  AI_CLIENT_EXECUTION_TIMEOUT_MS,
  AI_PROVIDER_EXECUTION_TIMEOUT_MS,
} from '../config/timeoutBudgets';

export class AIExecutor {
  // Shared observability backbone for all tool executions.
  // Keep stage updates tied to real async boundaries (cache/provider/response)
  // and avoid replacing this flow with static or timer-only progress states.
  private static readonly TRACE_STAGE_BLUEPRINT: Array<{ id: string; label: string }> = [
    { id: 'validate_input', label: 'Validating request' },
    { id: 'resolve_connection', label: 'Resolving provider route' },
    { id: 'cache_lookup', label: 'Checking cache' },
    { id: 'prepare_request', label: 'Preparing provider payload' },
    { id: 'provider_request', label: 'Contacting AI model' },
    { id: 'process_response', label: 'Processing provider response' },
    { id: 'finalize', label: 'Finalizing output' },
  ];

  private static normalizeToolId(toolId: string): string {
    return (toolId || '').trim();
  }

  private static async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
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
  }

  private static async fetchWithTimeout(
    input: RequestInfo | URL,
    init: RequestInit,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<Response> {
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
  }

  private static nowIso(): string {
    return new Date().toISOString();
  }

  private static createTrace(options: AIRequestOptions): ExecutionTrace {
    const traceId = options.observability?.traceId || `trace-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const operationId = options.observability?.operationId || traceId;
    const startedAt = this.nowIso();
    return {
      traceId,
      toolId: this.normalizeToolId(options.toolId),
      actionName: options.observability?.actionName || this.normalizeToolId(options.toolId) || 'ai-operation',
      status: 'running',
      startedAt,
      currentStageId: undefined,
      stages: this.TRACE_STAGE_BLUEPRINT.map((stage) => ({
        id: stage.id,
        label: stage.label,
        status: 'pending',
      })),
      fallback: {
        attempted: false,
      },
      cache: {
        status: 'miss',
      },
      provider: {
        modelRequested: options.modelId,
      },
      operationMeta: {
        operationId,
        operationType: options.observability?.actionName || this.normalizeToolId(options.toolId) || 'ai-operation',
        toolName: this.normalizeToolId(options.toolId),
        startedAt,
        status: 'running',
        stageCount: this.TRACE_STAGE_BLUEPRINT.length,
      },
    };
  }

  private static getStageCounts(trace: ExecutionTrace): { completed: number; total: number } {
    const total = trace.stages.length;
    const completed = trace.stages.filter((stage) => stage.status === 'completed').length;
    return { completed, total };
  }

  private static getFinalStageId(trace: ExecutionTrace): string | undefined {
    const failed = trace.stages.find((stage) => stage.status === 'failed');
    if (failed) return failed.id;

    const completed = [...trace.stages].reverse().find((stage) => stage.status === 'completed');
    return completed?.id;
  }

  private static emitTrace(options: AIRequestOptions, trace: ExecutionTrace): void {
    options.observability?.onTraceUpdate?.({
      ...trace,
      stages: trace.stages.map(stage => ({ ...stage })),
      fallback: trace.fallback ? { ...trace.fallback } : undefined,
      cache: trace.cache ? { ...trace.cache } : undefined,
      provider: trace.provider ? { ...trace.provider } : undefined,
      failure: trace.failure ? { ...trace.failure } : undefined,
    });
  }

  private static setStageStatus(trace: ExecutionTrace, stageId: string, status: ExecutionTraceStage['status'], extras?: Partial<ExecutionTraceStage>): void {
    trace.stages = trace.stages.map((stage) => {
      if (stage.id !== stageId) return stage;

      const updated: ExecutionTraceStage = {
        ...stage,
        ...extras,
        status,
      };

      if (status === 'running' && !updated.startedAt) {
        updated.startedAt = this.nowIso();
      }

      if ((status === 'completed' || status === 'failed' || status === 'skipped') && !updated.endedAt) {
        updated.endedAt = this.nowIso();
      }

      if (updated.startedAt && updated.endedAt) {
        updated.durationMs = new Date(updated.endedAt).getTime() - new Date(updated.startedAt).getTime();
      }

      return updated;
    });

    trace.currentStageId = status === 'running' ? stageId : trace.currentStageId === stageId ? undefined : trace.currentStageId;
  }

  private static startStage(options: AIRequestOptions, trace: ExecutionTrace, stageId: string, message?: string, details?: Record<string, unknown>): void {
    this.setStageStatus(trace, stageId, 'running', { message, details });
    this.emitTrace(options, trace);
  }

  private static completeStage(options: AIRequestOptions, trace: ExecutionTrace, stageId: string, message?: string, details?: Record<string, unknown>): void {
    this.setStageStatus(trace, stageId, 'completed', { message, details });
    this.emitTrace(options, trace);
  }

  private static failStage(options: AIRequestOptions, trace: ExecutionTrace, stageId: string, message?: string, details?: Record<string, unknown>): void {
    this.setStageStatus(trace, stageId, 'failed', { message, details });
    this.emitTrace(options, trace);
  }

  private static finalizeTrace(options: AIRequestOptions, trace: ExecutionTrace, status: ExecutionTrace['status']): void {
    trace.status = status;
    trace.endedAt = this.nowIso();
    trace.elapsedMs = new Date(trace.endedAt).getTime() - new Date(trace.startedAt).getTime();
    const stageCounts = this.getStageCounts(trace);
    trace.operationMeta = {
      ...(trace.operationMeta || {}),
      operationId: trace.operationMeta?.operationId || options.observability?.operationId || trace.traceId,
      operationType: trace.operationMeta?.operationType || options.observability?.actionName || trace.actionName,
      toolName: trace.operationMeta?.toolName || trace.toolId,
      startedAt: trace.startedAt,
      endedAt: trace.endedAt,
      durationMs: trace.elapsedMs,
      status,
      currentStageId: trace.currentStageId,
      finalStageId: this.getFinalStageId(trace),
      stagesCompleted: stageCounts.completed,
      stageCount: stageCounts.total,
    };
    this.emitTrace(options, trace);
  }

  private static adoptBackendTrace(responseTrace: ExecutionTrace | undefined, fallbackTrace: ExecutionTrace): ExecutionTrace {
    if (!responseTrace || !responseTrace.startedAt) {
      return fallbackTrace;
    }

    const merged: ExecutionTrace = {
      ...responseTrace,
      traceId: responseTrace.traceId || fallbackTrace.traceId,
      toolId: responseTrace.toolId || fallbackTrace.toolId,
      actionName: responseTrace.actionName || fallbackTrace.actionName,
      provider: {
        ...(fallbackTrace.provider || {}),
        ...(responseTrace.provider || {}),
      },
      fallback: {
        attempted: responseTrace.fallback?.attempted ?? fallbackTrace.fallback?.attempted ?? false,
        ...(fallbackTrace.fallback || {}),
        ...(responseTrace.fallback || {}),
      },
      cache: responseTrace.cache || fallbackTrace.cache,
      operationMeta: {
        ...(fallbackTrace.operationMeta || {}),
        ...(responseTrace.operationMeta || {}),
        operationId:
          responseTrace.operationMeta?.operationId ||
          fallbackTrace.operationMeta?.operationId ||
          responseTrace.traceId ||
          fallbackTrace.traceId,
        operationType:
          responseTrace.operationMeta?.operationType ||
          responseTrace.actionName ||
          fallbackTrace.operationMeta?.operationType ||
          fallbackTrace.actionName,
        toolName:
          responseTrace.operationMeta?.toolName ||
          responseTrace.toolId ||
          fallbackTrace.operationMeta?.toolName ||
          fallbackTrace.toolId,
      },
      resultMeta: {
        ...(fallbackTrace.resultMeta || {}),
        ...(responseTrace.resultMeta || {}),
      },
    };

    if (!merged.elapsedMs && merged.startedAt && merged.endedAt) {
      merged.elapsedMs = new Date(merged.endedAt).getTime() - new Date(merged.startedAt).getTime();
    }

    return merged;
  }

  private static classifyStructuredError(error: any, stageId: string | undefined, traceId: string): StructuredAIError {
    const upstreamErrorInfo = error?.errorInfo as StructuredAIError | undefined;
    if (upstreamErrorInfo?.category && upstreamErrorInfo?.code) {
      return {
        ...upstreamErrorInfo,
        stage: upstreamErrorInfo.stage || stageId,
        traceId: upstreamErrorInfo.traceId || traceId,
      };
    }

    const rawMessage = String(error?.message || error || 'Unexpected internal error');
    const lower = rawMessage.toLowerCase();

    let category: StructuredAIError['category'] = 'internal';
    let code = 'INTERNAL_ERROR';
    let userMessage = 'The operation failed unexpectedly. Please try again.';
    let retryable = false;

    if (lower.includes('required') || lower.includes('invalid') || lower.includes('validation')) {
      category = 'validation';
      code = 'VALIDATION_FAILED';
      userMessage = 'Some input values are invalid. Please review your request and try again.';
    } else if (lower.includes('permission') || lower.includes('forbidden')) {
      category = 'permission';
      code = 'PERMISSION_DENIED';
      userMessage = 'You do not have permission to perform this operation.';
    } else if (lower.includes('auth') || lower.includes('unauthorized') || lower.includes('api key')) {
      category = 'auth';
      code = 'AUTHENTICATION_FAILED';
      userMessage = 'Authentication failed while contacting the AI provider.';
    } else if (lower.includes('timeout')) {
      category = 'timeout';
      code = 'REQUEST_TIMEOUT';
      userMessage = 'The operation took too long and timed out. Please retry.';
      retryable = true;
    } else if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('econn') || lower.includes('socket')) {
      category = 'network';
      code = 'NETWORK_FAILURE';
      userMessage = 'Network connectivity failed while processing your request.';
      retryable = true;
    } else if (lower.includes('provider') || lower.includes('qwen') || lower.includes('gemini') || lower.includes('dashscope')) {
      category = 'provider';
      code = 'PROVIDER_FAILURE';
      userMessage = 'The AI provider could not complete the request. Please retry or switch model.';
      retryable = true;
    } else if (lower.includes('cache')) {
      category = 'cache';
      code = 'CACHE_FAILURE';
      userMessage = 'A cache operation failed. The system can continue without cache.';
      retryable = true;
    } else if (lower.includes('route') || lower.includes('unsupported provider')) {
      category = 'routing';
      code = 'ROUTING_FAILURE';
      userMessage = 'The system could not route this request to a compatible provider.';
    } else if (lower.includes('json') || lower.includes('parse') || lower.includes('schema')) {
      category = 'parsing';
      code = 'PARSING_FAILURE';
      userMessage = 'The response format was invalid and could not be parsed.';
      retryable = true;
    }

    return {
      category,
      code,
      message: rawMessage,
      userMessage,
      stage: stageId,
      traceId,
      retryable,
    };
  }

  private static async isTemporaryFastAccessSession(): Promise<boolean> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return false;

      const tokenResult = await currentUser.getIdTokenResult();
      const claims = tokenResult.claims || {};

      return (
        claims.isTemporaryAccess === true ||
        claims.accountScope === 'faculty_science_fast_access' ||
        claims.temporaryAccessType === 'FacultyOfScienceFastAccess'
      );
    } catch {
      return false;
    }
  }

  private static async authorizeModelExecution(options: AIRequestOptions): Promise<{
    canonicalModelId: string;
    executionMode: 'frontend' | 'backend';
  }> {
    const token = await auth.currentUser?.getIdToken().catch(() => undefined);
    if (!token) {
      throw new Error('Authenticated session is required to authorize model access.');
    }

    const response = await fetch('/api/ai/authorize-model', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        toolId: options.toolId,
        modelId: options.modelId,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      const error = new Error(String(payload?.error || 'model-authorization-failed'));
      (error as Error & { errorInfo?: StructuredAIError }).errorInfo = payload?.errorInfo;
      throw error;
    }

    return {
      canonicalModelId: String(payload?.modelId || options.modelId),
      executionMode: payload?.executionMode === 'backend' ? 'backend' : 'frontend',
    };
  }

  static async execute(options: AIRequestOptions, contents: any): Promise<AIResponse> {
    let normalizedOptions: AIRequestOptions = {
      ...options,
      toolId: this.normalizeToolId(options.toolId),
      modelId: toCanonicalModelId(options.modelId)
    };

    const trace = this.createTrace(normalizedOptions);
    this.emitTrace(normalizedOptions, trace);
    this.startStage(normalizedOptions, trace, 'validate_input', 'Validating model and tool selection');

    try {
      const authorization = await this.authorizeModelExecution(normalizedOptions);
      normalizedOptions = {
        ...normalizedOptions,
        modelId: authorization.canonicalModelId,
      };

      const modelMetadata = getModelByAnyId(normalizedOptions.modelId);
      if (!modelMetadata) {
        const structuredError: StructuredAIError = {
          category: 'validation',
          code: 'MODEL_NOT_FOUND',
          message: `Model ${normalizedOptions.modelId} not found in registry.`,
          userMessage: 'The selected model is not available. Please choose another model.',
          stage: 'validate_input',
          traceId: trace.traceId,
        };

        throw Object.assign(new Error(structuredError.message), { errorInfo: structuredError });
      }

      this.completeStage(normalizedOptions, trace, 'validate_input', 'Request payload is valid', {
        modelRequested: normalizedOptions.modelId,
        toolId: normalizedOptions.toolId,
        executionMode: authorization.executionMode,
      });

      this.startStage(normalizedOptions, trace, 'cache_lookup', 'Checking cache entry');

      // Check cache first
      const cachedResponse = aiCache.get(normalizedOptions, contents);
      if (cachedResponse) {
        trace.cache = { status: 'hit' };
        this.completeStage(normalizedOptions, trace, 'cache_lookup', 'Cache hit', { cacheStatus: 'hit' });
        this.startStage(normalizedOptions, trace, 'finalize', 'Returning cached result');
        this.completeStage(normalizedOptions, trace, 'finalize', 'Cached response ready');
        this.finalizeTrace(normalizedOptions, trace, 'success');
        return {
          ...cachedResponse,
          cacheHit: true,
          traceId: trace.traceId,
          trace,
        };
      }

      trace.cache = { status: 'miss' };
      this.completeStage(normalizedOptions, trace, 'cache_lookup', 'Cache miss', { cacheStatus: 'miss' });

      this.startStage(normalizedOptions, trace, 'resolve_connection', 'Resolving provider and routing context');
      // Resolve connection context using the master orchestration layer
      const connectionContext = MasterConnectionSystem.resolveConnection(normalizedOptions.toolId, normalizedOptions.modelId);
      
      // Validate payload capabilities
      MasterConnectionSystem.validatePayloadCapabilities(connectionContext, contents);

      trace.provider = {
        family: connectionContext.providerFamily,
        modelRequested: normalizedOptions.modelId,
      };
      this.completeStage(normalizedOptions, trace, 'resolve_connection', 'Provider route resolved', {
        providerFamily: connectionContext.providerFamily,
        routingPath: connectionContext.routingPath,
      });

      this.startStage(normalizedOptions, trace, 'prepare_request', 'Building provider request payload');

      let response: AIResponse;

      // BRANCHING LOGIC: Gemini on Frontend, Others on Backend
      this.completeStage(normalizedOptions, trace, 'prepare_request', 'Provider payload prepared');
      this.startStage(normalizedOptions, trace, 'provider_request', 'Dispatching request to provider', {
        providerFamily: connectionContext.providerFamily,
      });

      if (connectionContext.providerFamily === 'google' && authorization.executionMode === 'frontend') {
        response = await this.executeGeminiFrontend(normalizedOptions, contents, connectionContext, trace.traceId);
      } else {
        response = await this.executeBackend(normalizedOptions, contents, connectionContext, trace.traceId);
      }

      this.completeStage(normalizedOptions, trace, 'provider_request', 'Provider response received', {
        modelUsed: response.modelUsed,
        providerFamily: connectionContext.providerFamily,
      });

      this.startStage(normalizedOptions, trace, 'process_response', 'Processing provider response');

      trace.provider = {
        ...trace.provider,
        modelResolved: response.modelUsed || normalizedOptions.modelId,
      };

      // Cache successful responses
      if (!response.error) {
        aiCache.set(normalizedOptions, contents, response);
      }

      this.completeStage(normalizedOptions, trace, 'process_response', response.error ? 'Provider returned an error' : 'Provider response processed', {
        hasError: !!response.error,
        modelUsed: response.modelUsed,
        fallbackHappened: !!response.fallbackHappened,
      });

      this.startStage(normalizedOptions, trace, 'finalize', response.error ? 'Finalizing failed response' : 'Finalizing successful response');

      if (response.error) {
        throw Object.assign(new Error(response.error), { errorInfo: response.errorInfo });
      }

      this.completeStage(normalizedOptions, trace, 'finalize', 'Operation completed successfully');
      trace.resultMeta = {
        ready: true,
        textLength: (response.text || '').length,
        usage: response.usage,
        fallbackHappened: !!response.fallbackHappened,
        providerFamily: connectionContext.providerFamily,
        modelUsed: response.modelUsed || normalizedOptions.modelId,
      };
      this.finalizeTrace(normalizedOptions, trace, 'success');

      const synchronizedTrace = this.adoptBackendTrace(response.trace, trace);
      this.emitTrace(normalizedOptions, synchronizedTrace);

      return {
        ...response,
        cacheHit: false,
        traceId: response.traceId || synchronizedTrace.traceId,
        trace: synchronizedTrace,
      };
    } catch (error: any) {
      const failedStageId = trace.currentStageId || 'provider_request';
      const structuredError = this.classifyStructuredError(error, failedStageId, trace.traceId);
      this.failStage(normalizedOptions, trace, failedStageId, structuredError.message, {
        category: structuredError.category,
        code: structuredError.code,
      });
      this.startStage(normalizedOptions, trace, 'finalize', 'Finalizing failed response');
      this.failStage(normalizedOptions, trace, 'finalize', structuredError.userMessage, {
        stage: structuredError.stage,
      });
      trace.failure = {
        stageId: structuredError.stage,
        category: structuredError.category,
        code: structuredError.code,
        message: structuredError.message,
      };
      trace.resultMeta = {
        ready: false,
        fallbackHappened: !!trace.fallback?.attempted,
        providerFamily: trace.provider?.family,
        modelUsed: trace.provider?.modelResolved || trace.provider?.modelRequested,
      };
      this.finalizeTrace(normalizedOptions, trace, 'failed');

      return {
        text: '',
        error: structuredError.userMessage,
        errorInfo: structuredError,
        traceId: trace.traceId,
        trace,
      };
    }
  }

  private static async executeGeminiFrontend(options: AIRequestOptions, contents: any, context: any, traceId: string): Promise<AIResponse> {
    try {
      /**
       * ARCHITECTURE GUARD (Temporary Fast-Access Credit Authority)
       * ------------------------------------------------------------------
       * Temporary Faculty accounts must keep credit enforcement backend-authoritative.
       * Gemini frontend execution bypasses backend deduction/ledgering, so we block
       * this path for temporary sessions and require backend-routed models instead.
       */
      const isTemporaryFastAccess = await this.isTemporaryFastAccessSession();
      if (isTemporaryFastAccess) {
        throw new Error('Temporary Faculty fast-access accounts must use backend-authoritative models. Please select a Qwen model.');
      }

      const apiKey = options.apiKey || "";
      if (!apiKey) {
        throw new Error('Frontend Gemini execution requires an explicit client-approved API key and is disabled for the standard server-managed flow.');
      }

      const genAI = new GoogleGenAI({ apiKey });
      
      // Handle different task types (text vs image vs video)
      if (options.taskType === 'image') {
        return await this.executeGeminiImage(genAI, options, contents);
      }

      // Orchestrate the prompt using the shared orchestrator
      const rawTextContent = typeof contents === 'string' ? contents : (Array.isArray(contents) ? contents[contents.length - 1].parts[0].text : JSON.stringify(contents));
      
      let imagePart = null;
      let textContent = rawTextContent;
      let fileContextContent = options.fileContext;
      let additionalContextContent = options.additionalContext;

      if (options.documentContextRef?.documentId) {
        try {
          const sharedDocumentContext = await fetchDocumentPromptContext({
            documentId: options.documentContextRef.documentId,
            toolId: options.toolId,
            mode: options.mode,
          });

          fileContextContent = sharedDocumentContext.fileContext || fileContextContent;

          const existingAdditionalContext =
            options.additionalContext && typeof options.additionalContext === 'object'
              ? options.additionalContext as Record<string, unknown>
              : {};
          const resolvedAdditionalContext =
            sharedDocumentContext.additionalContext &&
            typeof sharedDocumentContext.additionalContext === 'object'
              ? sharedDocumentContext.additionalContext as Record<string, unknown>
              : {};
          const existingMetadata =
            existingAdditionalContext.metadata &&
            typeof existingAdditionalContext.metadata === 'object'
              ? existingAdditionalContext.metadata as Record<string, unknown>
              : {};
          const resolvedMetadata =
            resolvedAdditionalContext.metadata &&
            typeof resolvedAdditionalContext.metadata === 'object'
              ? resolvedAdditionalContext.metadata as Record<string, unknown>
              : {};

          additionalContextContent = {
            ...existingAdditionalContext,
            ...resolvedAdditionalContext,
            metadata: {
              ...existingMetadata,
              ...resolvedMetadata,
              documentContextSource: 'shared_runtime',
            },
          };
        } catch (error) {
          console.warn('Failed to load shared document context for frontend execution', error);
        }
      }
      
      // Check for embedded image data from fileProcessors in user prompt
      const imageMatch = rawTextContent.match(/\[IMAGE_DATA:(.*?);base64,(.*?)\]/);
      if (imageMatch) {
        imagePart = {
          inlineData: {
            mimeType: imageMatch[1],
            data: imageMatch[2]
          }
        };
        textContent = rawTextContent.replace(/\[IMAGE_DATA:.*?;base64,.*?\]/, '[Attached Image]');
      }

      // Check for embedded image data in fileContext
      if (fileContextContent) {
        const fileImageMatch = fileContextContent.match(/\[IMAGE_DATA:(.*?);base64,(.*?)\]/);
        if (fileImageMatch) {
          // If we already have an image part from the prompt, we might overwrite it or we could support multiple.
          // For now, we'll just use the fileContext image if it exists.
          imagePart = {
            inlineData: {
              mimeType: fileImageMatch[1],
              data: fileImageMatch[2]
            }
          };
          fileContextContent = fileContextContent.replace(/\[IMAGE_DATA:.*?;base64,.*?\]/, '[Attached Image]');
        }
      }

      const { prompt, systemInstruction, responseSchema, finalModelId } = PromptOrchestrator.orchestrate(
        options.toolId,
        textContent,
        options.modelId,
        {
          toolId: options.toolId,
          userPreferences: options.userPreferences,
          settings: options.settings,
          fileContext: fileContextContent,
          fileName: options.fileName,
          additionalContext: additionalContextContent,
          promptTemplateGroup: context.promptTemplateGroup
        }
      );

      let finalContents = contents;
      if (Array.isArray(contents)) {
        // If it's a history, we enrich the LAST message with the orchestrated prompt (which includes settings/preferences)
        finalContents = [...contents];
        const lastIndex = finalContents.length - 1;
        const parts = [{ text: prompt }];
        if (imagePart) parts.unshift(imagePart);
        
        finalContents[lastIndex] = {
          ...finalContents[lastIndex],
          role: 'user', // Ensure it's marked as user
          parts: parts
        };
      } else {
        const parts: any[] = [{ text: prompt }];
        if (imagePart) parts.unshift(imagePart);
        finalContents = [{ role: 'user', parts: parts }];
      }

      // Default: Text Generation
      const response = await this.withTimeout(
        genAI.models.generateContent({
          // Always use orchestrator-resolved model id so compatibility fallback is honored.
          model: finalModelId,
          contents: finalContents,
          config: {
            temperature: options.temperature,
            maxOutputTokens: options.maxTokens,
            responseMimeType: options.responseMimeType || (responseSchema ? 'application/json' : undefined),
            responseSchema: options.responseSchema || responseSchema,
            systemInstruction: options.systemInstruction || systemInstruction,
            // @ts-ignore - thinkingConfig might not be in types yet
            thinkingConfig: options.providerSettings?.thinkingConfig
          }
        }),
        AI_PROVIDER_EXECUTION_TIMEOUT_MS,
        'Gemini request timed out while waiting for the model response.'
      );

      const operationId = options.observability?.operationId || traceId;
      const promptForHash = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
      const promptHash = await this.sha256Hex(promptForHash);
      await this.finalizeClientSuccessCredits({
        operationId,
        traceId,
        toolId: options.toolId,
        modelId: finalModelId,
        promptHash,
        resultTextLength: (response.text || '').length,
      });

      return { 
        text: response.text || '', 
        modelUsed: finalModelId,
        traceId
      };
    } catch (error: any) {
      console.error("Gemini Frontend Error:", error);
      throw error;
    }
  }

  private static async executeGeminiImage(genAI: any, options: AIRequestOptions, contents: any): Promise<AIResponse> {
    const rawPrompt =
      typeof contents === 'string'
        ? contents
        : (contents.prompt || contents.text || JSON.stringify(contents));
    let prompt = rawPrompt;
    let imagePart: { inlineData: { mimeType: string; data: string } } | null = null;

    const imageMatch = rawPrompt.match(/\[IMAGE_DATA:(.*?);base64,(.*?)\]/);
    if (imageMatch) {
      imagePart = {
        inlineData: {
          mimeType: imageMatch[1],
          data: imageMatch[2],
        },
      };
      prompt = rawPrompt.replace(/\[IMAGE_DATA:.*?;base64,.*?\]/, '').trim();
    }

    const contentParts = imagePart
      ? [imagePart, { text: prompt || 'Edit the provided image according to the instructions.' }]
      : [{ text: prompt }];

    const response: any = await this.withTimeout(
      genAI.models.generateContent({
        model: options.modelId,
        contents: [{ role: 'user', parts: contentParts }],
        config: {
          imageConfig: {
            imageSize: options.settings?.size || options.settings?.imageSize || "1K",
            aspectRatio: options.settings?.aspectRatio || "1:1"
          }
        }
      }),
      AI_PROVIDER_EXECUTION_TIMEOUT_MS,
      'Gemini image generation timed out while waiting for the model response.'
    );

    let imageUrl = '';
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        break;
      }
    }

    return { 
      text: imageUrl, 
      modelUsed: options.modelId
    };
  }

  /**
   * Architecture guard: domain modules emit lightweight system events and keep
   * notification rendering centralized in NotificationContext.
   */
  private static emitCreditDeductionEvent(payload: { amount: number; remaining: number | null; source: 'standard' | 'fast-access' }): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('zootopia:credit-deducted', { detail: payload }));
  }

  private static async sha256Hex(value: string): Promise<string> {
    const data = new TextEncoder().encode(value || '');
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private static async finalizeClientSuccessCredits(params: {
    operationId: string;
    traceId: string;
    toolId: string;
    modelId: string;
    promptHash: string;
    resultTextLength: number;
  }): Promise<void> {
    const token = await auth.currentUser?.getIdToken().catch(() => undefined);
    if (!token) {
      throw new Error('Authenticated session is required to finalize credits for this operation.');
    }

    const response = await fetch('/api/credits/consume-success', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const errorCode = String(payload?.error || response.statusText || 'credit-finalization-failed');
      throw new Error(errorCode);
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.success && payload?.standardCreditDebited) {
      this.emitCreditDeductionEvent({
        amount: 1,
        remaining: Number.isFinite(Number(payload?.standardCreditsRemaining)) ? Number(payload.standardCreditsRemaining) : null,
        source: 'standard',
      });
    }
    if (payload?.success && payload?.fastAccessCreditDebited) {
      this.emitCreditDeductionEvent({
        amount: 1,
        remaining: Number.isFinite(Number(payload?.fastAccessCreditsRemaining)) ? Number(payload.fastAccessCreditsRemaining) : null,
        source: 'fast-access',
      });
    }
  }

  private static async executeBackend(options: AIRequestOptions, contents: any, context: any, traceId: string): Promise<AIResponse> {
    const token = await auth.currentUser?.getIdToken().catch(() => undefined);
    const currentUserId = auth.currentUser?.uid;

    const response = await this.fetchWithTimeout('/api/ai/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-trace-id': traceId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        toolId: options.toolId,
        userPrompt: typeof contents === 'string' ? contents : JSON.stringify(contents),
        modelId: options.modelId,
        userId: currentUserId,
        operationId: options.observability?.operationId || traceId,
        userPreferences: options.userPreferences,
        selectedAssetSource: options.selectedAssetSource,
        // Keep tool prompt settings separate from transport/provider controls so
        // the backend can preserve user intent without mixing it into runtime config.
        toolSettings: options.settings,
        requestConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          responseMimeType: options.responseMimeType,
          responseSchema: options.responseSchema,
          systemInstruction: options.systemInstruction,
        },
        providerSettings: options.providerSettings,
        fileContext: options.fileContext,
        fileName: options.fileName,
        additionalContext: options.additionalContext,
        documentContextRef: options.documentContextRef,
        directFileDispatch: options.directFileDispatch,
        
        // Pass connection context to backend
        routingPath: context.routingPath,
        promptTemplateGroup: context.promptTemplateGroup,
        providerFamily: context.providerFamily
      })
    }, AI_CLIENT_EXECUTION_TIMEOUT_MS, 'The AI request timed out while waiting for the server response.');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const upstream = errorData?.errorInfo;
      const error = new Error(errorData?.error || response.statusText || 'Backend execution failed') as Error & {
        errorInfo?: StructuredAIError;
      };

      if (upstream?.category && upstream?.code) {
        error.errorInfo = upstream;
      }

      throw error;
    }

    const data = await response.json();
    if (data?.standardCreditDebited) {
      this.emitCreditDeductionEvent({
        amount: 1,
        remaining: Number.isFinite(Number(data?.standardCreditsRemaining)) ? Number(data.standardCreditsRemaining) : null,
        source: 'standard',
      });
    }
    if (data?.fastAccessCreditDebited) {
      this.emitCreditDeductionEvent({
        amount: 1,
        remaining: Number.isFinite(Number(data?.fastAccessCreditsRemaining)) ? Number(data.fastAccessCreditsRemaining) : null,
        source: 'fast-access',
      });
    }

    return { 
      text: data.text, 
      modelUsed: data.modelUsed, 
      fallbackHappened: data.fallbackHappened,
      trace: data.trace,
      traceId: data.traceId,
      errorInfo: data.errorInfo,
    };
  }

  static async executeWithFallback(options: AIRequestOptions, contents: any): Promise<AIResponse> {
    let result = await this.execute(options, contents);
    
    if (result.error) {
      if (result.errorInfo?.category === 'timeout') {
        // Timeout fallback would effectively double the wait budget for one
        // user action. Keep the shared ceiling bounded and surface the timeout.
        return result;
      }

      const fallbackPlan = getFallbackPlan({
        toolId: options.toolId,
        modelId: options.modelId,
      });

      if (!fallbackPlan.allowAutomaticFallback) {
        if (result.trace) {
          result.trace.fallback = {
            attempted: false,
            reason: 'Automatic fallback is disabled by policy for this tool.',
          };
          options.observability?.onTraceUpdate?.(result.trace);
        }
        return result;
      }

      const fallbackModelId = fallbackPlan.candidateModelIds[0];

      if (fallbackModelId) {
        console.info(`Falling back to ${fallbackModelId} for tool ${options.toolId}`);
        const fallbackOptions: AIRequestOptions = {
          ...options,
          modelId: fallbackModelId,
          observability: {
            ...options.observability,
            traceId: result.traceId || options.observability?.traceId,
            actionName: options.observability?.actionName || `${options.toolId}-fallback`,
          },
        };

        result = await this.execute(fallbackOptions, contents);
        result.fallbackHappened = !result.error;
        if (result.trace) {
          result.trace.retryCount = (result.trace.retryCount || 0) + 1;
          result.trace.fallback = {
            attempted: true,
            usedModelId: fallbackModelId,
            reason: `Primary model ${options.modelId} failed`,
          };
          options.observability?.onTraceUpdate?.(result.trace);
        }
      } else {
        console.warn(`No compatible fallback model found for tool ${options.toolId}`);
        if (result.trace) {
          result.trace.fallback = {
            attempted: true,
            reason: 'No compatible fallback model available',
          };
          options.observability?.onTraceUpdate?.(result.trace);
        }
      }
    }
    
    return result;
  }
}
