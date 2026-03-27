import test from 'node:test';
import assert from 'node:assert/strict';
import { mapToolUnlockRedeemError } from '../src/services/toolUnlockErrorMap.ts';
import { applyGrantTransition } from '../server/toolEntitlementService.ts';

test('maps known redeem-tool-code backend error codes', () => {
  assert.equal(mapToolUnlockRedeemError('expired'), 'This code has expired.');
  assert.equal(mapToolUnlockRedeemError('wrong-purpose'), 'This code is not an unlock code for tools.');
  assert.equal(mapToolUnlockRedeemError('code-status-revoked'), 'This code has been revoked by admin.');
  assert.equal(mapToolUnlockRedeemError('wrong-tool'), 'This code does not unlock this tool.');
});

test('falls back to original backend message for unknown errors', () => {
  assert.equal(mapToolUnlockRedeemError('backend-custom-error'), 'backend-custom-error');
});

test('uses safe fallback when error payload is empty', () => {
  assert.equal(mapToolUnlockRedeemError(''), 'Failed to redeem code.');
});

test('payment grant adds tool + mapped pages', () => {
  const result = applyGrantTransition({
    toolId: 'quiz',
    source: 'payment',
    referenceId: 'sess_1',
    unlockedTools: [],
    unlockedPages: [],
    previousEntitlement: null,
  });

  assert.deepEqual(result.unlockedTools, ['quiz']);
  assert.deepEqual(result.unlockedPages, ['generate']);
  assert.equal(result.alreadyApplied, false);
  assert.equal(result.idempotentReplay, false);
});

test('replayed verified payment session is idempotent', () => {
  const result = applyGrantTransition({
    toolId: 'infographic',
    source: 'payment',
    referenceId: 'sess_42',
    unlockedTools: ['infographic'],
    unlockedPages: ['infographic'],
    previousEntitlement: {
      active: true,
      lastSource: 'payment',
      lastReferenceId: 'sess_42',
    },
  });

  assert.equal(result.alreadyApplied, true);
  assert.equal(result.idempotentReplay, true);
  assert.deepEqual(result.unlockedTools, ['infographic']);
  assert.deepEqual(result.unlockedPages, ['infographic']);
});

test('invalid tool id is rejected', () => {
  assert.throws(() => {
    applyGrantTransition({
      toolId: 'videos',
      source: 'payment',
      referenceId: 'sess_bad',
      unlockedTools: [],
      unlockedPages: [],
      previousEntitlement: null,
    });
  }, /invalid-tool-id/);
});
