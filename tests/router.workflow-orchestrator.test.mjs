import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRANSITION_POLICY_VERSION,
  WORKFLOW_TRANSITIONS,
  nextValidTransitions,
} from '../src/orchestrator/transitions.mjs';

function evidence(overrides = {}) {
  return {
    status: 'active',
    freshness: 'fresh',
    position: { family: 'gsd', state: 'planned' },
    gates: { plan_approved: true },
    dependencies_safe: true,
    ...overrides,
  };
}

test('canonical transition policy is frozen, versioned, and covers every workflow family', () => {
  assert.equal(TRANSITION_POLICY_VERSION, 'workflow-transitions-v1');
  assert.equal(Object.isFrozen(WORKFLOW_TRANSITIONS), true);
  assert.deepEqual(
    [...new Set(WORKFLOW_TRANSITIONS.map(row => row.family))].sort(),
    ['brainstorm', 'gsd', 'interrupted', 'milestone', 'verification-gap'],
  );

  const rows = [
    [evidence({ position: { family: 'brainstorm', state: 'design_approved' }, gates: { design_approved: true } }), 'brainstorm.plan-implementation'],
    [evidence(), 'gsd.execute'],
    [evidence({ position: { family: 'interrupted', state: 'interrupted' }, gates: { resumable_execution: true } }), 'interrupted.resume'],
    [evidence({ position: { family: 'verification-gap', state: 'gaps_found' }, gates: { gap_plan_ready: true } }), 'verification-gap.close'],
    [evidence({ position: { family: 'milestone', state: 'verified' }, gates: { milestone_verified: true } }), 'milestone.close'],
  ];
  for (const [input, transitionId] of rows) {
    const result = nextValidTransitions(input);
    assert.equal(result.status, 'candidates_available');
    assert.equal(result.reason_code, 'valid_transitions');
    assert.equal(result.dispatch_eligible, false);
    assert.deepEqual(result.candidates.map(row => row.transition_id), [transitionId]);
  }
});

test('invalid, stale, terminal, unsafe, gated, and unknown states fail closed', () => {
  const rows = [
    [{}, 'invalid_authoritative_evidence'],
    [evidence({ freshness: 'stale' }), 'authoritative_evidence_stale'],
    [evidence({ status: 'completed' }), 'terminal_workflow'],
    [evidence({ dependencies_safe: false }), 'dependency_unsafe'],
    [evidence({ gates: {} }), 'required_gate_missing'],
    [evidence({ position: { family: 'gsd', state: 'unknown' } }), 'no_valid_transition'],
  ];
  for (const [input, reason] of rows) {
    const result = nextValidTransitions(input);
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason_code, reason);
    assert.equal(result.dispatch_eligible, false);
    assert.deepEqual(result.candidates, []);
  }
});

test('candidate outcomes are byte-stable across policy permutations and semantic duplicates', () => {
  const custom = [
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
    { id: 'gsd.audit', family: 'gsd', from: 'executed', to: 'audit', workflow_id: 'gsd-audit-uat', requires: ['execution_complete'] },
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
  ];
  const input = evidence({ position: { family: 'gsd', state: 'executed' }, gates: { execution_complete: true } });
  assert.equal(
    JSON.stringify(nextValidTransitions(input, custom)),
    JSON.stringify(nextValidTransitions(input, [...custom].reverse())),
  );
  assert.equal(nextValidTransitions(input, custom).candidates.length, 2);
});

test('transition evaluation never observes capability, registry, tool, MCP, hook, or prompt fields', () => {
  const forbidden = ['capabilities', 'registry', 'tools', 'mcps', 'hooks', 'prompt', 'raw_prompt'];
  const input = evidence();
  for (const key of forbidden) {
    Object.defineProperty(input, key, { enumerable: true, get() { throw new Error(`observed ${key}`); } });
  }
  const result = nextValidTransitions(input);
  assert.deepEqual(result.candidates.map(row => row.transition_id), ['gsd.execute']);
  assert.doesNotMatch(JSON.stringify(result), /capabilit|registry|\btool\b|mcp|hook|prompt/i);
});
