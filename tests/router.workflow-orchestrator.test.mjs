import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRANSITION_POLICY_VERSION,
  WORKFLOW_TRANSITIONS,
  nextValidTransitions,
  selectWorkflow,
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

test('one valid transition selects automatically and complete explicit intent supersedes stale intent', () => {
  const candidates = nextValidTransitions(evidence());
  const automatic = selectWorkflow(candidates);
  assert.deepEqual(automatic, {
    status: 'selected', dispatch_eligible: true, reason_code: 'unique_valid_transition',
    selection: candidates.candidates[0],
  });

  const explicit = selectWorkflow(candidates, {
    present: true, complete: true, transition_id: 'gsd.execute',
    stale_intent: 'gsd.plan', raw_prompt: 'do not expose this',
  });
  assert.equal(explicit.status, 'selected');
  assert.equal(explicit.reason_code, 'explicit_valid_transition');
  assert.equal(explicit.dispatch_eligible, true);
  assert.equal(explicit.selection.transition_id, 'gsd.execute');
  assert.doesNotMatch(JSON.stringify(explicit), /stale_intent|raw_prompt|do not expose/i);
});

test('explicit intent cannot bypass terminal, gate, or dependency safety', () => {
  const intent = { present: true, complete: true, transition_id: 'gsd.execute' };
  const rows = [
    nextValidTransitions(evidence({ status: 'completed' })),
    nextValidTransitions(evidence({ gates: {} })),
    nextValidTransitions(evidence({ dependencies_safe: false })),
  ];
  for (const transitionResult of rows) {
    const selected = selectWorkflow(transitionResult, intent);
    assert.equal(selected.status, 'blocked');
    assert.equal(selected.dispatch_eligible, false);
    assert.equal(selected.reason_code, transitionResult.reason_code);
    assert.equal('selection' in selected, false);
  }
});

test('incomplete intent and material ties yield exactly one smallest non-dispatchable question', () => {
  const tiedPolicy = [
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
    { id: 'gsd.audit', family: 'gsd', from: 'executed', to: 'audit', workflow_id: 'gsd-audit-uat', requires: ['execution_complete'] },
  ];
  const candidates = nextValidTransitions(
    evidence({ position: { family: 'gsd', state: 'executed' }, gates: { execution_complete: true } }),
    tiedPolicy,
  );
  const incomplete = selectWorkflow(candidates, { present: true, complete: false });
  assert.equal(incomplete.reason_code, 'explicit_transition_incomplete');
  assert.deepEqual(Object.keys(incomplete).filter(key => key === 'question'), ['question']);
  assert.equal(incomplete.question, 'Should I audit or verify next?');

  const tied = selectWorkflow(candidates);
  assert.equal(tied.status, 'clarification_required');
  assert.equal(tied.reason_code, 'material_transition_tie');
  assert.equal(tied.dispatch_eligible, false);
  assert.equal(tied.question, 'Should I audit or verify next?');
  assert.equal((JSON.stringify(tied).match(/\?/g) || []).length, 1);
});

test('invalid explicit selection blocks and selection is permutation-stable without input mutation', () => {
  const policy = [
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
    { id: 'gsd.audit', family: 'gsd', from: 'executed', to: 'audit', workflow_id: 'gsd-audit-uat', requires: ['execution_complete'] },
  ];
  const source = evidence({ position: { family: 'gsd', state: 'executed' }, gates: { execution_complete: true } });
  const forward = nextValidTransitions(source, policy);
  const reverse = nextValidTransitions(source, [...policy].reverse());
  const before = JSON.stringify(forward);
  const intent = { present: true, complete: true, transition_id: 'gsd.verify' };
  assert.equal(JSON.stringify(selectWorkflow(forward, intent)), JSON.stringify(selectWorkflow(reverse, intent)));
  assert.equal(JSON.stringify(forward), before);

  const invalid = selectWorkflow(forward, { present: true, complete: true, transition_id: 'gsd.execute' });
  assert.deepEqual(invalid, {
    status: 'blocked', dispatch_eligible: false, reason_code: 'explicit_transition_invalid',
  });
});
