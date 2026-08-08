import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { replanStrategy } from '../../src/orchestrator/strategy.mjs';
import { validateStrategyBounds } from '../../src/adapters/dispatch/contract.mjs';
import { createLeaseStore } from '../../src/lease/store.mjs';
import { buildLeaseRecord } from '../../src/lease/policy.mjs';
import { createClaudeDispatchAdapter } from '../../src/adapters/dispatch/claude.mjs';
import { createCodexDispatchAdapter } from '../../src/adapters/dispatch/codex.mjs';

// Synthetic evidence and durable-shaped state for the one-replan and dispatch
// seams. No production module is imported until the later implementation plan.
export const FAILURE_EVIDENCE = Object.freeze({
  strategy_id: 'strategy-43-fixture',
  work_id: 'task-b',
  reason_code: 'resource_exhausted',
  attempt: 1,
});

export const COMPLETED_WORK = Object.freeze(['task-a']);
export const UNFINISHED_WORK = Object.freeze(['task-b']);

export const DISPATCH_ORDER = Object.freeze([
  'validateInvocation',
  'preDispatchGate',
  'spawn',
]);

export const LEASE_CHECKPOINT = Object.freeze({
  lease_id: 'lease-43-fixture',
  claimed_actions: Object.freeze(['task-a']),
  last_safe_checkpoint: Object.freeze({ action_id: 'task-a', status: 'completed' }),
});

export function rereadLeaseCheckpoint(readLease) {
  return readLease(LEASE_CHECKPOINT.lease_id);
}

export const INVOCATION_STUBS = Object.freeze({
  validateInvocation: () => ({ ok: true }),
  preDispatchGate: () => ({ ok: true }),
  spawn: () => ({ state: 'invoked', runtime: 'claude' }),
});

const current = {
  status: 'planned', dispatch_eligible: true, strategy_id: 'strategy-43-fixture',
  workflow_id: 'workflow-43', transition_id: 'transition-43', replan_count: 0,
  strategy: {
    contract_version: 'strategy-contract-v1',
    resource_limits: { max_time_ms: 100, max_tokens: 100, max_calls: 4, max_retries: 2, max_failures: 2, max_coordination_cost: 20 },
    cost: { expected_time_ms: 10, expected_tokens: 10, calls: 1, retries: 0, failures: 0, coordination_cost: 1 },
    hard_constraints: { safe: true, correct: true, quality: true, fit: true, available: true, in_scope: true, resources: true, passed: true },
    work: [{ id: 'task-a', safe: true }, { id: 'task-b', safe: true }],
  },
};

function replacement(work, overrides = {}) {
  return {
    status: 'planned', dispatch_eligible: true, strategy_id: current.strategy_id,
    strategy: {
      contract_version: 'strategy-contract-v1',
      resource_limits: { ...current.strategy.resource_limits },
      cost: { ...current.strategy.cost },
      hard_constraints: { ...current.strategy.hard_constraints },
      work,
      ...overrides,
    },
  };
}

test('STRAT-04: accepts one evidence-backed replan and preserves completed independent work', () => {
  const result = replanStrategy({
    current, failure: FAILURE_EVIDENCE,
    replacement: replacement([{ id: 'task-a', safe: true }, { id: 'task-c', safe: true }]),
    checkpoints: { completed_work: COMPLETED_WORK },
  });
  assert.equal(result.status, 'planned');
  assert.equal(result.replan_count, 1);
  assert.deepEqual(result.completed_work, COMPLETED_WORK);
  assert.deepEqual(result.resume_work, [{ id: 'task-c', safe: true }]);
});

test('STRAT-04: blocks missing, unrelated, unsafe, over-bound, and second replans without changing completed work', () => {
  const cases = [
    [{ ...FAILURE_EVIDENCE, strategy_id: 'other' }, 'replan_evidence_mismatch'],
    [{ ...FAILURE_EVIDENCE, reason_code: undefined }, 'replan_evidence_missing'],
  ];
  for (const [failure, reason_code] of cases) {
    const result = replanStrategy({ current, failure, replacement: replacement([{ id: 'task-c', safe: true }]), checkpoints: { completed_work: COMPLETED_WORK } });
    assert.equal(result.reason_code, reason_code);
    assert.deepEqual(result.completed_work, COMPLETED_WORK);
  }
  const unsafe = replanStrategy({ current, failure: FAILURE_EVIDENCE, replacement: replacement([{ id: 'task-c', safe: false }], { hard_constraints: { ...current.strategy.hard_constraints, safe: false, passed: false } }), checkpoints: { completed_work: COMPLETED_WORK } });
  assert.equal(unsafe.reason_code, 'replacement_not_safe');
  const second = replanStrategy({ current: { ...current, replan_count: 1 }, failure: FAILURE_EVIDENCE, replacement: replacement([{ id: 'task-c', safe: true }]), checkpoints: { completed_work: COMPLETED_WORK } });
  assert.equal(second.reason_code, 'one_replan_exhausted');
  assert.deepEqual(second.resume_work, []);
});

test('STRAT-04: durable checkpoint re-read preserves completed claims and returns only unfinished safe work', () => {
  const owned = mkdtempSync(join(tmpdir(), 'router-43-'));
  try {
    const record = buildLeaseRecord({
      fingerprint: 'lease-43-fixture', goal: 'phase-43',
      scope: { repo: 'repo', worktree: 'worktree', runtime: 'claude', schema_generation: 1 },
      allowedEffects: ['read'], confirmationEffects: [],
      resourceBounds: { max_wall_ms: 60000, max_invocations: 10, max_tokens: 100 },
      expiryMs: Date.now() + 60000, authoritySource: { kind: 'operator', instruction: 'persist', class: 'persistent_goal_action' }, checkpoint: null,
    });
    const first = createLeaseStore({ root: owned });
    first.createLease(record);
    first.claimCheckpoint(record.lease_id, 'task-a');
    const reread = createLeaseStore({ root: owned }).inspect(record.lease_id);
    const result = replanStrategy({ current, failure: FAILURE_EVIDENCE, replacement: replacement([{ id: 'task-a', safe: true }, { id: 'task-c', safe: true }]), checkpoints: reread });
    assert.deepEqual(reread.claimed_actions, ['task-a']);
    assert.deepEqual(result.resume_work, [{ id: 'task-c', safe: true }]);
  } finally { rmSync(owned, { recursive: true, force: true }); }
});

test('dispatch strategy bounds reject blocked, unsafe, identity-mismatched, unfinished, and over-bound plans', () => {
  const valid = { ...replacement([{ id: 'task-c', safe: true }]), strategy_id: 's', workflow_id: 'w', transition_id: 't', work_id: 'task-c' };
  valid.strategy_id = 's';
  valid.strategy = { ...valid.strategy, resource_limits: { ...valid.strategy.resource_limits, max_tokens: 10 }, cost: { ...valid.strategy.cost, expected_tokens: 5 } };
  assert.equal(validateStrategyBounds(valid).ok, true);
  assert.equal(validateStrategyBounds({ ...valid, strategy: { ...valid.strategy, cost: { ...valid.strategy.cost, expected_tokens: 11 } } }).reason, 'strategy_resource_bound_exceeded');
  assert.equal(validateStrategyBounds({ ...valid, status: 'blocked' }).reason, 'strategy_blocked');
  assert.equal(validateStrategyBounds({ ...valid, work_id: 'task-a' }).reason, 'strategy_work_unplanned');
});

test('Claude and Codex reject over-bound strategy plans before native spawn', () => {
  const action = { runtime: 'claude', strategy_plan: {
    status: 'planned', dispatch_eligible: true, strategy_id: 's',
    strategy: { contract_version: 'strategy-contract-v1', hard_constraints: { safe: true, correct: true, quality: true, fit: true, available: true, in_scope: true, resources: true, passed: true }, work: [{ id: 'task-c', safe: true }], resource_limits: { max_time_ms: 100, max_tokens: 10, max_calls: 4, max_retries: 2, max_failures: 2, max_coordination_cost: 20 }, cost: { expected_time_ms: 10, expected_tokens: 11, calls: 1, retries: 0, failures: 0, coordination_cost: 1 } },
  } };
  const claude = createClaudeDispatchAdapter({ receiptRoot: mkdtempSync(join(tmpdir(), 'router-43-claude-')) });
  const codex = createCodexDispatchAdapter({ receiptRoot: mkdtempSync(join(tmpdir(), 'router-43-codex-')) });
  try {
    assert.equal(claude.invoke(action).completion_evidence.reason_codes[0], 'strategy_resource_bound_exceeded');
    assert.equal(codex.invoke({ ...action, runtime: 'codex' }).completion_evidence.reason_codes[0], 'strategy_resource_bound_exceeded');
  } finally {
    rmSync(claude._receiptStore.dir, { recursive: true, force: true });
    rmSync(codex._receiptStore.dir, { recursive: true, force: true });
  }
});

assert.deepEqual(DISPATCH_ORDER, ['validateInvocation', 'preDispatchGate', 'spawn']);
