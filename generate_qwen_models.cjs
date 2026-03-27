import fs from 'fs';

const qwenImageModels = [
  'qwen-image-2.0-2026-03-03',
  'qwen-image-2.0-pro-2026-03-03',
  'qwen-image-max-2025-12-30',
  'qwen-image-edit-max-2026-01-16',
  'z-image-turbo',
  'qwen3-vl-plus-2025-12-19',
  'wan2.6-t2i',
  'wan2.6-image'
];

const qwenVideoModels = [
  'wan2.6-r2v-flash',
  'wan2.6-i2v-flash',
  'wan2.6-t2v'
];

const qwenAudioModels = [
  'qwen-voice-design',
  'qwen3-tts-vd-realtime-2026-01-15',
  'qwen3-tts-vc-realtime-2026-01-15',
  'qwen3-livetranslate-flash',
  'qwen-voice-enrollment',
  'fun-asr-realtime-2025-11-07',
  'cosyvoice-v3-plus',
  'qwen3-tts-vc-2026-01-22'
];

const qwenTextModels = [
  'qwen3.5-plus',
  'qwen3.5-397b-a17b',
  'qwen3.5-122b-a10b',
  'qwen3.5-27b',
  'qwen3.5-35b-a3b',
  'qwen-plus',
  'qwen-plus-2025-12-01',
  'qwen-plus-2025-09-11',
  'qwen-plus-2025-07-28',
  'qwen3-235b-a22b',
  'qwen3-235b-a22b-instruct-2507',
  'qwen3-235b-a22b-thinking-2507',
  'qwen3-30b-a3b',
  'qwen3-30b-a3b-instruct-2507',
  'qwen3-30b-a3b-thinking-2507',
  'qwen3-32b',
  'qwen3-14b',
  'qwen3-8b',
  'qwen3-next-80b-a3b-instruct',
  'qwen3-next-80b-a3b-thinking',
  'qwen3-max',
  'qwen3-max-preview'
];

const qwenOcrModels = [
  'qwen-vl-ocr',
  'qwen-vl-ocr-2025-11-20',
  'qwen3-vl-plus',
  'qwen3-vl-flash',
  'qwen3-vl-flash-2026-01-22-us',
  'qwen3-vl-flash-us',
  'qwen3-vl-8b-instruct',
  'qwen3-vl-8b-thinking',
  'qwen3-vl-32b-instruct',
  'qwen3-vl-32b-thinking',
  'qwen3-vl-30b-a3b-instruct',
  'qwen3-vl-30b-a3b-thinking',
  'qwen3-vl-235b-a22b-instruct',
  'qwen3-vl-235b-a22b-thinking'
];

let priority = 10;
const generateModel = (id, type) => {
  priority++;
  let toolCompatibility = [];
  let routingPath = '';
  let promptTemplateGroup = '';
  let supportsImageGeneration = false;
  let supportsImageEditing = false;
  let supportsVideoGeneration = false;
  let supportsAudioGeneration = false;
  let supportsSpeechRecognition = false;
  let supportsTranslation = false;
  let supportsOCR = false;
  let supportsVisualReasoning = false;
  let supportsTextReasoning = false;
  let supportsLongContext = false;
  let supportsRealtime = false;
  let category = 'Balanced';
  let badge = '';

  if (type === 'image') {
    toolCompatibility = ['image-generator', 'infographic'];
    routingPath = 'qwen/image';
    promptTemplateGroup = 'qwen-image';
    supportsImageGeneration = true;
    if (id.includes('edit')) supportsImageEditing = true;
    badge = 'Image';
  } else if (type === 'video') {
    toolCompatibility = ['video-generator'];
    routingPath = 'qwen/video';
    promptTemplateGroup = 'qwen-video';
    supportsVideoGeneration = true;
    badge = 'Video';
  } else if (type === 'audio') {
    toolCompatibility = ['live-voice', 'study'];
    routingPath = 'qwen/audio';
    promptTemplateGroup = 'qwen-audio';
    supportsAudioGeneration = id.includes('tts') || id.includes('voice');
    supportsSpeechRecognition = id.includes('asr') || id.includes('realtime');
    supportsTranslation = id.includes('translate');
    supportsRealtime = id.includes('realtime');
    badge = 'Audio';
  } else if (type === 'text') {
    toolCompatibility = ['chat', 'analyze', 'quiz', 'study'];
    routingPath = 'qwen/text';
    promptTemplateGroup = 'qwen-text';
    supportsTextReasoning = true;
    if (id.includes('thinking')) {
      promptTemplateGroup = 'qwen-thinking';
    }
    if (id.includes('max') || id.includes('plus') || id.includes('397b') || id.includes('235b')) {
      category = 'Advanced';
      supportsLongContext = true;
    }
    badge = 'Text';
  } else if (type === 'ocr') {
    toolCompatibility = ['analyze', 'infographic', 'study'];
    routingPath = 'qwen/vision';
    promptTemplateGroup = 'qwen-vision';
    supportsOCR = true;
    supportsVisualReasoning = true;
    supportsTextReasoning = true;
    if (id.includes('thinking')) {
      promptTemplateGroup = 'qwen-vision-thinking';
    }
    badge = 'Vision';
  }

  return `  {
    id: '${id}',
    displayName: '${id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}',
    provider: 'qwen',
    modelId: '${id}',
    category: '${category}',
    description: 'Qwen model optimized for ${type} tasks.',
    speedRating: 4,
    costRating: 3,
    contextSize: 'Varies',
    status: 'Ready',
    tags: ['Qwen', '${type.charAt(0).toUpperCase() + type.slice(1)}'],
    isEnabled: true,
    toolCompatibility: ${JSON.stringify(toolCompatibility)},
    routingPath: '${routingPath}',
    promptTemplateGroup: '${promptTemplateGroup}',
    supportsPreview: true,
    supportsExport: true,
    supportsPrint: true,
    supportsImageGeneration: ${supportsImageGeneration},
    supportsImageEditing: ${supportsImageEditing},
    supportsVideoGeneration: ${supportsVideoGeneration},
    supportsAudioGeneration: ${supportsAudioGeneration},
    supportsSpeechRecognition: ${supportsSpeechRecognition},
    supportsTranslation: ${supportsTranslation},
    supportsOCR: ${supportsOCR},
    supportsVisualReasoning: ${supportsVisualReasoning},
    supportsTextReasoning: ${supportsTextReasoning},
    supportsLongContext: ${supportsLongContext},
    supportsRealtime: ${supportsRealtime},
    priority: ${priority},
    badge: '${badge}'
  }`;
};

const allModels = [
  ...qwenImageModels.map(id => generateModel(id, 'image')),
  ...qwenVideoModels.map(id => generateModel(id, 'video')),
  ...qwenAudioModels.map(id => generateModel(id, 'audio')),
  ...qwenTextModels.map(id => generateModel(id, 'text')),
  ...qwenOcrModels.map(id => generateModel(id, 'ocr'))
];

const output = `
  // ==========================================================================
  // QWEN MODELS
  // ==========================================================================
${allModels.join(',\n')}
];

export const getModelById = (id: string) => MODEL_REGISTRY.find(m => m.id === id);
export const getModelsByProvider = (provider: string) => MODEL_REGISTRY.filter(m => m.provider === provider);
`;

const existingContent = fs.readFileSync('src/ai/models/modelRegistry.ts', 'utf8');
const newContent = existingContent.replace('];\n\nexport const getModelById', output);
fs.writeFileSync('src/ai/models/modelRegistry.ts', newContent);
