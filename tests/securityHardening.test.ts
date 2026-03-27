import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentSecurityPolicy } from '../server/securityHeaders.ts';
import { buildProviderSecuritySummary } from '../server/providerSecuritySummary.ts';

test('production CSP disables object embedding and restricts framing', () => {
  const csp = buildContentSecurityPolicy({ isProduction: true });

  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /upgrade-insecure-requests/);
});

test('provider security summary exposes safe runtime metadata without secrets', () => {
  const summary = buildProviderSecuritySummary({
    GEMINI_API_KEY: 'gemini-secret-value',
    DASHSCOPE_API_KEY: 'dashscope-secret-value',
    ALIBABA_MODEL_STUDIO_REGION: 'us-virginia',
    ALIBABA_MODEL_STUDIO_BASE_URL: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
  });

  assert.equal(summary.clientSecretsAllowed, false);
  assert.equal(summary.sourceMapsEnabled, false);
  assert.equal(summary.assetDeliveryMode, 'authenticated-proxy');
  assert.equal(summary.providers.google.configured, true);
  assert.equal(summary.providers.google.envKeyName, 'GEMINI_API_KEY');
  assert.equal(summary.providers.alibabaModelStudio.configured, true);
  assert.equal(summary.providers.alibabaModelStudio.region, 'us-virginia');
  assert.equal(
    summary.providers.alibabaModelStudio.baseUrl,
    'https://dashscope-us.aliyuncs.com/compatible-mode/v1'
  );

  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('gemini-secret-value'), false);
  assert.equal(serialized.includes('dashscope-secret-value'), false);
});
