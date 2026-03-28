import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyError } from '../src/utils/errorClassification.ts';

test('auth errors mentioning email are not misclassified as AI model failures', () => {
  const result = classifyError(new Error('No admin account was found with this email.'));

  assert.equal(result.category, 'auth_error');
  assert.equal(result.message, 'No admin account was found with this email.');
});

test('explicit AI/provider failures still map to model errors', () => {
  const result = classifyError(new Error('AI provider runtime failed while generating the response.'));

  assert.equal(result.category, 'model_error');
  assert.equal(result.message, 'The AI model encountered an issue. Please try again.');
});
