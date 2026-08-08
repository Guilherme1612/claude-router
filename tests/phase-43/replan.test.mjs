import { test } from 'node:test';
import assert from 'node:assert/strict';

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

test.todo('STRAT-04: accept one evidence-backed replan and preserve completed independent work');
test.todo('STRAT-04: block a second replan attempt with an explicit terminal reason code');
test.todo('dispatch ordering: validateInvocation → preDispatchGate → spawn for Claude and Codex');
test.todo('lease/checkpoint: re-read durable completed claims from a separate store instance');

assert.deepEqual(DISPATCH_ORDER, ['validateInvocation', 'preDispatchGate', 'spawn']);
