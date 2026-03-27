import { getModelByAnyId, MODEL_REGISTRY } from '../models/modelRegistry';
import { AIModelMetadata, AIProviderId } from '../types';
import { getCompatibleModelsForTool, isModelCompatibleWithTool } from '../modelAccess';

export interface ConnectionContext {
  toolId: string;
  modelId: string;
  providerFamily: AIProviderId;
  capabilities: Partial<AIModelMetadata>;
  routingPath: string;
  promptTemplateGroup: string;
  resultRenderingPipeline: string;
  exportCapabilities: {
    preview: boolean;
    export: boolean;
    print: boolean;
  };
}

export class MasterConnectionSystem {
  private static normalizeToolId(toolId: string): string {
    return (toolId || '').trim();
  }

  /**
   * Resolves the full connection context for a given tool and model.
   * This is the master orchestration layer that determines how a request
   * should be routed, formatted, and handled based on the model's capabilities.
   */
  static resolveConnection(toolId: string, modelId: string): ConnectionContext {
    const normalizedToolId = this.normalizeToolId(toolId);
    const model = getModelByAnyId(modelId);
    
    if (!model) {
      throw new Error(`Model ${modelId} not found in registry.`);
    }

    // Validate tool compatibility
    if (!isModelCompatibleWithTool(model, normalizedToolId)) {
      console.warn(`Model ${modelId} is not explicitly compatible with tool ${normalizedToolId}. Proceeding with caution.`);
    }

    // Determine result rendering pipeline based on tool and capabilities
    let resultRenderingPipeline = 'default-text';
    if (normalizedToolId === 'image-generator' || model.supportsImageGeneration) {
      resultRenderingPipeline = 'image-render';
    } else if (normalizedToolId === 'video-generator' || model.supportsVideoGeneration) {
      resultRenderingPipeline = 'video-render';
    } else if (normalizedToolId === 'live-voice' || model.supportsAudioGeneration) {
      resultRenderingPipeline = 'audio-render';
    } else if (normalizedToolId === 'quiz') {
      resultRenderingPipeline = 'quiz-render';
    } else if (normalizedToolId === 'infographic') {
      resultRenderingPipeline = 'infographic-render';
    }

    return {
      toolId: normalizedToolId,
      modelId: model.modelId,
      providerFamily: model.provider,
      capabilities: {
        supportsImageGeneration: model.supportsImageGeneration,
        supportsImageEditing: model.supportsImageEditing,
        supportsVideoGeneration: model.supportsVideoGeneration,
        supportsAudioGeneration: model.supportsAudioGeneration,
        supportsSpeechRecognition: model.supportsSpeechRecognition,
        supportsTranslation: model.supportsTranslation,
        supportsOCR: model.supportsOCR,
        supportsVisualReasoning: model.supportsVisualReasoning,
        supportsTextReasoning: model.supportsTextReasoning,
        supportsLongContext: model.supportsLongContext,
        supportsRealtime: model.supportsRealtime,
      },
      routingPath: model.routingPath,
      promptTemplateGroup: model.promptTemplateGroup,
      resultRenderingPipeline,
      exportCapabilities: {
        preview: model.supportsPreview,
        export: model.supportsExport,
        print: model.supportsPrint,
      }
    };
  }

  /**
   * Validates if a model can handle a specific type of request payload
   */
  static validatePayloadCapabilities(context: ConnectionContext, payload: any): boolean {
    if (payload.image && !context.capabilities.supportsVisualReasoning && !context.capabilities.supportsOCR) {
      throw new Error(`Model ${context.modelId} does not support visual reasoning or OCR.`);
    }
    if (payload.audio && !context.capabilities.supportsSpeechRecognition) {
      throw new Error(`Model ${context.modelId} does not support speech recognition.`);
    }
    if (payload.video && !context.capabilities.supportsVideoGeneration && !context.capabilities.supportsVisualReasoning) {
      throw new Error(`Model ${context.modelId} does not support video processing.`);
    }
    return true;
  }

  /**
   * Returns a list of model IDs that are compatible with a given tool.
   */
  static getCompatibleModels(toolId: string): string[] {
    return getCompatibleModelsForTool(this.normalizeToolId(toolId), MODEL_REGISTRY).map((m: AIModelMetadata) => m.id);
  }
}
