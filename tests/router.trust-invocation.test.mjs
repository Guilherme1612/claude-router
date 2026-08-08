// tests/router.trust-invocation.test.mjs — Phase 41 TRUST-03 invocation validation.
//
// Pure-function tests for validateInvocation(action, adapter). No real spawn.
// validateInvocation checks typed args, entrypoint identity, path containment,
// cwd, wrappers, quoting, destructive targets, and runtime scope before spawn.
// It returns { ok: false, reason: '<reason_code>' } on failure, { ok: true } on pass.

import assert from 'node:assert/strict';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateInvocation, RECEIPT_STATES } from '../src/adapters/dispatch/contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURE = join(REPO_ROOT, 'tests', 'phase-38', 'fixtures', 'harmless.mjs');
const ALLOWED_ROOTS = [REPO_ROOT];

function mockAdapter(overrides = {}) {
  return {
    runtime: 'claude',
    allowedRoots: ALLOWED_ROOTS,
    fixture: FIXTURE,
    ...overrides,
  };
}

// Test 1: path with '..' → path_escape
test('validateInvocation rejects a path with ".." → path_escape', () => {
  const adapter = mockAdapter({ fixture: '../escape.mjs' });
  const result = validateInvocation({}, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'path_escape');
});

// Test 2: fixture outside allowed roots → path_escape
test('validateInvocation rejects a fixture path outside allowed roots → path_escape', () => {
  const adapter = mockAdapter({ fixture: '/etc/hosts' });
  const result = validateInvocation({}, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'path_escape');
});

// Test 3: non-existent fixture → fixture_not_found
test('validateInvocation rejects a non-existent fixture → fixture_not_found', () => {
  const adapter = mockAdapter({ fixture: join(REPO_ROOT, 'nonexistent-fixture.mjs') });
  const result = validateInvocation({}, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'fixture_not_found');
});

// Test 4: non-file path → not_a_file
test('validateInvocation rejects a non-file path → not_a_file', () => {
  const adapter = mockAdapter({ fixture: REPO_ROOT }); // a directory, not a file
  const result = validateInvocation({}, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_a_file');
});

// Test 5: cwd outside allowed roots → cwd_escape
test('validateInvocation rejects a cwd outside allowed roots → cwd_escape', () => {
  const adapter = mockAdapter();
  const result = validateInvocation({ cwd: '/etc' }, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cwd_escape');
});

// Test 6: args with shell metacharacters → unquoted_metachar
test('validateInvocation rejects args with shell metacharacters → unquoted_metachar', () => {
  const adapter = mockAdapter();
  const result = validateInvocation({ args: ['hello;world'] }, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unquoted_metachar');
});

// Test 7: destructive target patterns → destructive_target
test('validateInvocation rejects destructive target patterns → destructive_target', () => {
  const adapter = mockAdapter();
  const result = validateInvocation({ args: ['rm -rf /'] }, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'destructive_target');
});

// Test 8: runtime mismatch → runtime_scope_mismatch
test('validateInvocation rejects runtime mismatch → runtime_scope_mismatch', () => {
  const adapter = mockAdapter({ runtime: 'claude' });
  const result = validateInvocation({ runtime: 'codex' }, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'runtime_scope_mismatch');
});

// Test 9: args with wrong types → arg_type_invalid
test('validateInvocation rejects args with wrong types → arg_type_invalid', () => {
  const adapter = mockAdapter();
  const result = validateInvocation({ args: ['ok', 123] }, adapter);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'arg_type_invalid');
});

// Test 10: valid invocation passes
test('validateInvocation passes a valid invocation (typed args, contained paths, safe targets, matching runtime)', () => {
  const adapter = mockAdapter(); // fixture = harmless.mjs (real file), runtime = claude
  const result = validateInvocation({
    args: ['--flag', 'value'],
    runtime: 'claude',
  }, adapter);
  assert.equal(result.ok, true);
});

// Test 11: claude.mjs invokeImpl calls validateInvocation before spawn — failed validation returns blocked receipt with no spawn
test('claude.mjs invokeImpl calls validateInvocation before spawn — failed validation returns blocked receipt with no spawn', async () => {
  const { createClaudeDispatchAdapter } = await import('../src/adapters/dispatch/claude.mjs');
  const adapter = createClaudeDispatchAdapter();
  const action = {
    lease_id: 'trust-03-block-test',
    idempotency_key: 'trust-03-block-key',
    runtime: 'codex', // mismatch → runtime_scope_mismatch → blocked, no spawn
  };
  const receipt = adapter.invoke(action);
  assert.equal(receipt.completion_evidence.state, 'blocked');
  assert.ok(receipt.completion_evidence.reason_codes?.includes('runtime_scope_mismatch'));
  assert.equal(receipt.invocation_identity.pid, null); // no spawn
});

// RECEIPT_STATES contains 'blocked'
test('RECEIPT_STATES contains "blocked"', () => {
  assert.ok(RECEIPT_STATES.includes('blocked'));
});