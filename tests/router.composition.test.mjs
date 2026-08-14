import assert from 'node:assert/strict';
import test from 'node:test';

import { composeCapabilities, buildCausalProof } from '../src/orchestrator/compose.mjs';

function candidate(id, roles, score = 7000, overrides = {}) {
  return {
    stable_id: id,
    score,
    eligibility: { eligible: true, reason_codes: [] },
    workflow_coverage: { covered_roles: roles, required_roles: ['design', 'ux', 'implementation', 'review'], complete: false },
    cost: { context_bytes: 100, tool_calls: 1 },
    risk: { value: 'low' },
    record: {
      canonical_identity: id,
      composition: { roles, conflicts: [] },
      effects: ['none'],
      risk: { level: 'low' },
      cost: { context_bytes: 100, tool_calls: 1 },
      invocation: { runtime: 'claude', command: 'Skill', args: [id], availability: 'available' },
    },
    ...overrides,
  };
}

const workflow = { workflow_id: 'substantial-ui-redesign', roles: ['design', 'ux', 'implementation', 'review'] };

test('COMP-01/02/07: one capability covering all roles wins over redundant composition', () => {
  const result = composeCapabilities({
    workflow,
    candidates: [candidate('all-in-one', ['design', 'ux', 'implementation', 'review'], 6000), candidate('design-only', ['design'], 9000)],
    runtime: 'claude',
  });
  assert.equal(result.status, 'resolved');
  assert.equal(result.reason_code, 'single_capability_sufficient');
  assert.deepEqual(result.selected, ['all-in-one']);
  assert.equal(result.bounds.max_capabilities, 4);
});

test('COMP-01/02: distinct uncovered roles compose in deterministic role order and union bounds', () => {
  const result = composeCapabilities({
    workflow,
    candidates: [
      candidate('review', ['review'], 5000),
      candidate('design-ux', ['design', 'ux'], 7000),
      candidate('implementation', ['implementation'], 6000),
    ],
    runtime: 'claude',
  });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.selected, ['design-ux', 'implementation', 'review']);
  assert.equal(result.bounds.context_bytes, 300);
  assert.equal(result.bounds.tool_calls, 3);
});

test('COMP-03: missing roles and native runtime mismatch fail closed', () => {
  const missing = composeCapabilities({ workflow, candidates: [candidate('design', ['design'])] });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.reason_code, 'required_workflow_role_missing');
  const mismatch = composeCapabilities({ workflow, candidates: [candidate('all', ['design', 'ux', 'implementation', 'review'], 7000, {
    record: { ...candidate('all', []).record, invocation: { runtime: 'codex', availability: 'available' } },
  })], runtime: 'claude' });
  assert.equal(mismatch.reason_code, 'native_runtime_mismatch');
});

test('COMP-03: malformed candidates are ignored without throwing during composition', () => {
  const malformed = candidate('malformed', ['design']);
  delete malformed.stable_id;
  const malformedAgain = candidate('malformed-again', ['design']);
  delete malformedAgain.stable_id;
  assert.doesNotThrow(() => composeCapabilities({ workflow, candidates: [malformed, malformedAgain] }));
  assert.equal(composeCapabilities({ workflow, candidates: [malformed, malformedAgain] }).status, 'blocked');
});

test('COMP-03: malformed composition limits fail closed to bounded defaults', () => {
  const result = composeCapabilities({ workflow, candidates: [candidate('all', ['design', 'ux', 'implementation', 'review'])], limits: null });
  assert.equal(result.status, 'resolved');
  assert.equal(result.bounds.max_capabilities, 4);
});

test('COMP-03/05: null composition and proof inputs fail closed without throwing', () => {
  assert.doesNotThrow(() => composeCapabilities(null));
  assert.equal(composeCapabilities(null).reason_code, 'workflow_roles_missing');
  assert.doesNotThrow(() => buildCausalProof(null));
  assert.equal(buildCausalProof(null).reason_code, 'route_unresolved');
});

test('COMP-05/06: causal proof requires actual native invocation, completion, and verification linkage', () => {
  const route = composeCapabilities({ workflow, candidates: [candidate('all', ['design', 'ux', 'implementation', 'review'])] });
  const incomplete = buildCausalProof({ route, invocation: { native_identity: 'wrong' }, completion: { state: 'completed', receipt_id: 'r1' }, verification: { verified: true, receipt_id: 'r1' } });
  assert.equal(incomplete.status, 'incomplete');
  const complete = buildCausalProof({
    intent: { policy_version: 'semantic-intent-v1', workflow_hints: [workflow.workflow_id] }, route, workflow,
    action: { action_id: 'a1' }, lease: { lease_id: 'l1', project_id: 'p1', goal_id: 'g1', action_id: 'a1' },
    invocation: { native_identity: 'all', runtime: 'claude', receipt_id: 'r1' },
    completion: { state: 'completed', receipt_id: 'r1' }, verification: { verified: true, receipt_id: 'r1' },
  });
  assert.equal(complete.status, 'complete');
  assert.equal(complete.proof.complete, true);
});
