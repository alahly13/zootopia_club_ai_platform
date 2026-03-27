import { MODEL_REGISTRY } from './src/ai/models/modelRegistry.ts';
const modelId = 'gemini-3-flash-preview';
const toolId = 'analyze';
const model = MODEL_REGISTRY.find(m => m.id === modelId || m.modelId === modelId);
console.log('Model found:', model ? model.id : 'undefined');
if (model) {
  console.log('toolCompatibility:', model.toolCompatibility);
  console.log('toolCompatibility includes analyze:', model.toolCompatibility.includes(toolId));
}
