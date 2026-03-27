import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_MODELS } from '../src/constants/aiModels.ts';
import {
  USER_VISIBLE_MODEL_REGISTRY,
  getModelByAnyId,
  toCanonicalModelId,
} from '../src/ai/models/modelRegistry.ts';
import { PROVIDER_REGISTRY } from '../src/ai/providers/providerRegistry.ts';
import { getCompatibleModelsForTool } from '../src/ai/modelAccess.ts';
import {
  buildToolModelStorageKey,
  resolveInitialToolModelSelection,
} from '../src/ai/toolModelSelection.ts';
import {
  resolveProviderRuntimeByModel,
  resolveQwenRuntime,
} from '../server/providerRuntime.ts';
import { getFallbackPlan } from '../src/ai/fallbackPolicy.ts';

test('text-capable selectors keep Gemini Flash first and Qwen 3.5 Plus second', () => {
  const toolIds = ['chat', 'analyze', 'quiz', 'study', 'infographic'];

  toolIds.forEach((toolId) => {
    const ordered = getCompatibleModelsForTool(toolId).map((model) => model.id);
    assert.deepEqual(
      ordered.slice(0, 2),
      ['gemini-3-flash-preview', 'qwen3.5-plus'],
      `${toolId} selector ordering drifted`
    );
  });
});

test('image-generator ordering remains limited to verified compatible image models', () => {
  const ordered = getCompatibleModelsForTool('image-generator').map((model) => model.id);
  assert.deepEqual(ordered, [
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
  ]);
});

test('image-editor ordering remains limited to verified image-editing models', () => {
  const ordered = getCompatibleModelsForTool('image-editor').map((model) => model.id);
  assert.deepEqual(ordered, [
    'gemini-2.5-flash-image',
    'gemini-3-pro-image-preview',
  ]);
});

test('provider registry contains the required canonical provider families', () => {
  const providerIds = PROVIDER_REGISTRY.map((entry) => entry.id);

  assert.deepEqual(providerIds, [
    'google-gemini-api',
    'google-imagen',
    'google-veo',
    'alibaba-model-studio/qwen',
    'alibaba-model-studio/qwen-vl',
    'alibaba-model-studio/wan',
    'alibaba-model-studio/audio',
  ]);
});

test('internal future catalog models stay hidden from user-facing selectors', () => {
  assert.ok(getModelByAnyId('wan2.6-image'));
  assert.ok(getModelByAnyId('imagen-4.0-generate-001'));
  assert.equal(USER_VISIBLE_MODEL_REGISTRY.some((model) => model.id === 'wan2.6-image'), false);
  assert.equal(USER_VISIBLE_MODEL_REGISTRY.some((model) => model.id === 'imagen-4.0-generate-001'), false);
  assert.equal(AI_MODELS.some((model) => model.id === 'wan2.6-image'), false);
  assert.equal(AI_MODELS.some((model) => model.id === 'imagen-4.0-generate-001'), false);
});

test('tool-scoped storage keys are distinct per tool', () => {
  assert.equal(
    buildToolModelStorageKey('normal:user-1', 'chat'),
    'zootopia_tool_model:normal:user-1:chat'
  );
  assert.equal(
    buildToolModelStorageKey('normal:user-1', 'analyze'),
    'zootopia_tool_model:normal:user-1:analyze'
  );
  assert.notEqual(
    buildToolModelStorageKey('normal:user-1', 'chat'),
    buildToolModelStorageKey('normal:user-1', 'analyze')
  );
});

test('selection scopes stay isolated for assessment modes and study subtools', () => {
  assert.notEqual(
    buildToolModelStorageKey('normal:user-1', 'assessment-quiz'),
    buildToolModelStorageKey('normal:user-1', 'assessment-questions')
  );
  assert.notEqual(
    buildToolModelStorageKey('normal:user-1', 'study:summary'),
    buildToolModelStorageKey('normal:user-1', 'study:flashcards')
  );
});

test('tool-scoped storage keys stay isolated across auth modes for the same uid', () => {
  assert.notEqual(
    buildToolModelStorageKey('normal:user-1', 'chat'),
    buildToolModelStorageKey('admin:user-1', 'chat')
  );
  assert.notEqual(
    buildToolModelStorageKey('normal:user-1', 'chat'),
    buildToolModelStorageKey('fast_access:user-1', 'chat')
  );
});

test('tool-scoped selection does not leak a chat model into image generation', () => {
  const resolved = resolveInitialToolModelSelection({
    toolId: 'image-generator',
    models: AI_MODELS,
    user: null,
    persistedModelId: 'qwen3.5-plus',
  });

  assert.equal(resolved, 'gemini-2.5-flash-image');
});

test('tool-scoped selection does not leak a text model into image editing', () => {
  const resolved = resolveInitialToolModelSelection({
    toolId: 'image-editor',
    models: AI_MODELS,
    user: null,
    persistedModelId: 'qwen3.5-plus',
  });

  assert.equal(resolved, 'gemini-2.5-flash-image');
});

test('legacy aliases resolve to canonical model ids', () => {
  assert.equal(toCanonicalModelId('gemini-3.1-pro-preview'), 'gemini-3-pro-preview');
  assert.equal(toCanonicalModelId('qwen-plus-2025-12-01'), 'qwen-plus');
  assert.equal(toCanonicalModelId('qwen3-vl-flash-us'), 'qwen3-vl-flash');
});

test('display labels are not accepted as execution identifiers', () => {
  assert.equal(getModelByAnyId('Qwen 3.5 Plus'), undefined);
  assert.equal(getModelByAnyId('Gemini Flash'), undefined);
});

test('qwen runtime resolves official region endpoint and env credentials', () => {
  const runtime = resolveProviderRuntimeByModel({
    modelId: 'qwen3.5-plus',
    env: {
      DASHSCOPE_API_KEY: 'test-key',
      ALIBABA_MODEL_STUDIO_REGION: 'us-virginia',
      ALIBABA_MODEL_STUDIO_BASE_URL: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
    },
  });

  assert.equal(runtime.provider, 'qwen');
  assert.equal(runtime.providerId, 'alibaba-model-studio/qwen');
  assert.equal(runtime.family, 'qwen3.5');
  assert.equal(runtime.transport, 'alibaba-openai-compatible');
  assert.equal(runtime.envKeyName, 'DASHSCOPE_API_KEY');
  assert.equal(runtime.region, 'us-virginia');
  assert.equal(runtime.endpoint, 'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.equal(runtime.credentialResolved, true);
  assert.equal(runtime.usesEnvCredentials, true);
});

test('qwen runtime defaults to official US Virginia when only DashScope credentials are present', () => {
  const runtime = resolveQwenRuntime({
    env: {
      DASHSCOPE_API_KEY: 'test-key',
    },
  });

  assert.equal(runtime.region, 'us-virginia');
  assert.equal(runtime.endpoint, 'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions');
});

test('qwen runtime rejects mismatched official region/base-url combinations', () => {
  assert.throws(() => {
    resolveQwenRuntime({
      env: {
        DASHSCOPE_API_KEY: 'test-key',
        ALIBABA_MODEL_STUDIO_REGION: 'us-virginia',
        ALIBABA_MODEL_STUDIO_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    });
  }, /ALIBABA_MODEL_STUDIO_REGION_BASE_URL_MISMATCH/);
});

test('qwen vl runtime stays on the official OpenAI-compatible Alibaba path', () => {
  const runtime = resolveProviderRuntimeByModel({
    modelId: 'qwen3-vl-plus',
    env: {
      DASHSCOPE_API_KEY: 'test-key',
      ALIBABA_MODEL_STUDIO_REGION: 'us-virginia',
      ALIBABA_MODEL_STUDIO_BASE_URL: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
    },
  });

  assert.equal(runtime.providerId, 'alibaba-model-studio/qwen-vl');
  assert.equal(runtime.family, 'qwen-vl');
  assert.equal(runtime.transport, 'alibaba-openai-compatible');
  assert.equal(runtime.endpoint, 'https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions');
});

test('fallback plan is explicit and does not automatically cross providers', () => {
  const plan = getFallbackPlan({
    toolId: 'chat',
    modelId: 'qwen3.5-plus',
  });

  assert.equal(plan.provider, 'qwen');
  assert.equal(plan.allowAutomaticFallback, false);
  assert.deepEqual(plan.candidateModelIds, ['qwen-plus']);
});
