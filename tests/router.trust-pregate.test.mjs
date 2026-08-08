// tests/router.trust-pregate.test.mjs — Phase 41 TRUST-04 pre-dispatch gate.
//
// Pure-function tests for preDispatchGate(action, adapter, context). No real
// spawn. preDispatchGate validates the invocation contract (not the capability
// record): dependency availability, permission/effect class, timeout, retry
// policy, output bounds, and completion contract before the adapter receives
// the invocation. Returns { ok: false, reason: '<reason_code>' } on failure,
// { ok: true } on pass.

import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { preDispatchGate } from '../src/adapters/dispatch/contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURE = join(REPO_ROOT, 'tests', 'phase-38', 'fixtures', 'harmless.mjs');

function mockAdapter(overrides = {}) {
  return {
    runtime: 'claude',
    allowedRoots: [REPO_ROOT],
    fixture: FIXTURE,
    ...overrides,
  };
}

function validInvocation(overrides = {}) {
  return {
    timeout: 30000,
    retry: 2,
    output_bounds: { max_bytes: 1048576 },
    completion_contract: { evidence_type: 'exit_code' },
    ...overrides,
  };
}

// Test 1: missing timeout → missing_timeout
test('preDispatchGate blocks an invocation with no timeout declared → missing_timeout', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ timeout: undefined });
  const result = preDispatchGate(action, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_timeout');
});

// Test 2: unbounded retry → unbounded_retry
test('preDispatchGate blocks an invocation with unbounded retry (Infinity) → unbounded_retry', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ retry: Infinity });
  const result = preDispatchGate(action, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unbounded_retry');
});

// Test 3: missing output bounds → missing_output_bounds
test('preDispatchGate blocks an invocation with no output bounds declared → missing_output_bounds', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ output_bounds: undefined });
  const result = preDispatchGate(action, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_output_bounds');
});

// Test 4: missing completion contract → missing_completion_contract
test('preDispatchGate blocks an invocation with no completion contract declared → missing_completion_contract', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ completion_contract: undefined });
  const result = preDispatchGate(action, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_completion_contract');
});

// Test 5: missing dependency → dependency_missing
test('preDispatchGate blocks an invocation with missing dependency → dependency_missing', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ dependencies: ['nonexistent-dep'] });
  const context = { dependencies: { 'other-dep': true } };
  const result = preDispatchGate(action, adapter, context);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'dependency_missing');
});

// Test 6: disallowed permission/effect → permission_effect_disallowed
test('preDispatchGate blocks an invocation with disallowed permission/effect class → permission_effect_disallowed', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ permission_effect: 'elevated' });
  const context = { permission_effect: ['read', 'write'] };
  const result = preDispatchGate(action, adapter, context);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission_effect_disallowed');
});

// Test 7: valid invocation passes
test('preDispatchGate passes a valid invocation with all contracts declared', () => {
  const adapter = mockAdapter();
  const action = validInvocation({
    dependencies: ['dep-1'],
    permission_effect: 'read',
  });
  const context = {
    dependencies: { 'dep-1': true },
    permission_effect: ['read', 'write'],
  };
  const result = preDispatchGate(action, adapter, context);
  assert.equal(result.ok, true);
});

// Test 8: retry: -1 → unbounded_retry
test('preDispatchGate blocks an invocation with retry: -1 → unbounded_retry', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ retry: -1 });
  const result = preDispatchGate(action, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unbounded_retry');
});

// Test 9: timeout not a positive number → missing_timeout
test('preDispatchGate blocks an invocation with timeout: 0 → missing_timeout', () => {
  const adapter = mockAdapter();
  const action = validInvocation({ timeout: 0 });
  const result = preDispatchGate(action, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_timeout');
});

// Test 10: no context → skips dependency/permission checks, still validates contracts
test('preDispatchGate without context skips dependency/permission checks but validates timeout/retry/output/completion', () => {
  const adapter = mockAdapter();
  const action = validInvocation();
  const result = preDispatchGate(action, adapter);
  assert.equal(result.ok, true);
});

// Test 11: claude.mjs invokeImpl calls preDispatchGate after validateInvocation — failed gate returns blocked receipt with no spawn
test('claude.mjs invokeImpl calls preDispatchGate after validateInvocation — failed gate returns blocked receipt with no spawn', async () => {
  const { createClaudeDispatchAdapter } = await import('../src/adapters/dispatch/claude.mjs');
  const adapter = createClaudeDispatchAdapter();
  // An action with runtime matching (passes validateInvocation) but no
  // timeout (fails preDispatchGate) → blocked receipt, no spawn.
  const action = {
    lease_id: 'trust-04-pregate-test',
    idempotency_key: 'trust-04-pregate-key',
    runtime: 'claude',
    // No timeout → missing_timeout → blocked
  };
  const receipt = adapter.invoke(action);
  assert.equal(receipt.completion_evidence.state, 'blocked');
  assert.ok(receipt.completion_evidence.reason_codes?.includes('missing_timeout'));
  assert.equal(receipt.invocation_identity.pid, null); // no spawn
});