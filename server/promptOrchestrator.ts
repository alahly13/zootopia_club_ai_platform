// Backend boundary shim for prompt orchestration.
// Keeps server-side imports stable while reusing the existing orchestrator implementation.
export { PromptOrchestrator, type ToolConfig } from '../src/ai/services/promptOrchestrator';
