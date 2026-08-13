import assert from 'node:assert/strict';
import test from 'node:test';

import { runRouterControl } from '../src/cli/router-control.mjs';
import {
  explainAutonomy,
  prepareAutonomousExecution,
} from '../src/orchestrator/autonomy.mjs';

const READY = {
  mode: 'adaptive',
  intent: { explicit_execute: true, authority_class: 'one_turn_action', disposition: 'execute' },
  target: {
    capability_id: 'router/fix', name: 'Fix locally', runtime: 'claude',
    available: true, eligible: true, verified: true, quarantine: [],
    mapping: { runtime: 'claude', scope: 'global', provenance: { source_fingerprint: 'a'.repeat(64) } },
  },
  authority: { authGranted: true, current: true, source: 'operator' },
  risk: { safe: true, current: true, local: true, reversible: true },
  lease: { required: false, status: 'absent' },
  strategy: { status: 'planned', dispatch_eligible: true, replan_count: 0, max_replans: 1, budget: { max_calls: 2 } },
  receipt: { ready: true },
  verification: { ready: true },
};

test('AUTO-01 readiness requires every independent execution gate', () => {
  const result = prepareAutonomousExecution(READY);
  assert.equal(result.status, 'ready');
  assert.equal(result.dispatch_eligible, true);
  assert.deepEqual(result.gates.map(gate => gate.id), [
    'execute_intent', 'target', 'authority', 'risk', 'lease', 'strategy', 'receipts', 'verification',
  ]);
  assert.ok(result.gates.every(gate => gate.pass === true));
});

test('AUTO-01 preserves independent blockers instead of masking them', () => {
  const result = prepareAutonomousExecution({
    ...READY,
    intent: { ...READY.intent, explicit_execute: false },
    target: { ...READY.target, available: false },
    authority: { ...READY.authority, current: false },
    risk: { ...READY.risk, safe: false },
    strategy: { ...READY.strategy, replan_count: 2 },
    receipt: { ready: false },
    verification: { ready: false },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.dispatch_eligible, false);
  assert.deepEqual(result.blockers, [
    'execute_intent_required', 'target_unavailable', 'authority_not_current',
    'risk_not_approved', 'replan_bound_exceeded', 'receipt_contract_missing', 'verification_required',
  ]);
});

test('persistent execution requires a current active matching lease', () => {
  const result = prepareAutonomousExecution({
    ...READY,
    intent: { ...READY.intent, authority_class: 'persistent_goal_action' },
    lease: { required: true, status: 'expired', fingerprint_match: false },
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['lease_expired']);
});

test('AUTO-02 beginner and expert explanations are bounded and expose override guidance', () => {
  const decision = prepareAutonomousExecution({ ...READY, raw_prompt: 'private raw prompt /Users/private' });
  const explanation = explainAutonomy({ decision, input: { ...READY, raw_prompt: 'private raw prompt /Users/private' } });
  assert.equal(explanation.beginner.selected_capability, 'router/fix');
  assert.equal(explanation.beginner.next_action, 'execute');
  assert.equal(explanation.expert.mode, 'adaptive');
  assert.equal(explanation.expert.override.available, true);
  assert.equal(explanation.expert.override.command, 'router-control context resolve');
  assert.ok(explanation.expert.trace.length >= 8);
  assert.doesNotMatch(JSON.stringify(explanation), /private raw prompt|\/Users\/private/);
});

test('router-control exposes the explanation as read-only JSON', () => {
  const outcome = runRouterControl({
    argv: ['autonomy', 'explain', '--format', 'json', '--decision-json', JSON.stringify(READY)],
  });
  assert.equal(outcome.exitCode, 0);
  assert.equal(outcome.result.command, 'autonomy explain');
  assert.equal(outcome.result.data.beginner.next_action, 'execute');
  assert.equal(outcome.result.data.expert.override.available, true);
});
