import { DOCUMENT_DIRECT_FILE_MODE_ENABLED } from './config.js';
import { DocumentProcessingStrategyResolution } from './types.js';

const TOOL_DIRECT_FILE_CAPABILITIES: Record<string, boolean> = {
  analyze: true,
  quiz: true,
  chat: true,
  infographic: true,
  summary: true,
  flashcards: true,
  mindmap: true,
  concepts: true,
  notes: true,
  diagrams: true,
};

export function resolveDocumentProcessingStrategy(input: {
  toolId: string;
  requestedPathway?: 'local_extraction' | 'direct_file_to_model' | null;
}): DocumentProcessingStrategyResolution {
  const normalizedToolId = String(input.toolId || '').trim();
  const toolSupportsDirectFileMode = TOOL_DIRECT_FILE_CAPABILITIES[normalizedToolId] === true;
  const requestedPathway = input.requestedPathway || 'local_extraction';

  if (
    requestedPathway === 'direct_file_to_model' &&
    DOCUMENT_DIRECT_FILE_MODE_ENABLED &&
    toolSupportsDirectFileMode
  ) {
    return {
      pathway: 'direct_file_to_model',
      strategyId: 'direct_file_to_model',
      directModeEnabled: true,
      toolSupportsLocalExtraction: true,
      toolSupportsDirectFileMode: true,
    };
  }

  return {
    pathway: 'local_extraction',
    strategyId: 'local_extraction',
    directModeEnabled: DOCUMENT_DIRECT_FILE_MODE_ENABLED,
    toolSupportsLocalExtraction: true,
    toolSupportsDirectFileMode,
  };
}
