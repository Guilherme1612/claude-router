import assert from 'node:assert/strict';
import test from 'node:test';

import { decideCapabilityRoute } from '../src/orchestrator/compose.mjs';

function candidate(id, roles, overrides = {}) {
  return {
    stable_id: id,
    runtime: 'claude',
    scope: { kind: 'project', repository: 'router', worktree: 'main' },
    dispatchable: true,
    roles,
    availability: { available: true },
    eligibility: { eligible: true },
    evidence: { verified: true },
    cost: { estimated_tokens: 100, context_bytes: 100, latency_ms: 5, retries: 0 },
    record: {
      canonical_identity: id,
      composition: { roles, conflicts: [] },
      invocation: { runtime: 'claude', availability: 'available', method: 'command', target: id },
      cost: { context_bytes: 100, tool_calls: 1 },
      risk: { level: 'low' },
    },
    ...overrides,
  };
}

const workflow = { workflow_id: 'review-flow', roles: ['inspect', 'review'] };

test('DEC-01: explicit choice wins before every adaptive stage and never falls back', () => {
  const result = decideCapabilityRoute({
    explicitCapability: 'chosen', workflow, candidates: [candidate('chosen', ['inspect', 'review']), candidate('other', ['inspect', 'review'])],
    runtime: 'claude', scope: workflow.scope,
  });
  assert.equal(result.stage, 'explicit');
  assert.deepEqual(result.selected, ['chosen']);
  assert.equal(result.explanation.cascade.length, 1);
});

test('DEC-01: direct and pass-through modes bypass adaptive candidates', () => {
  const result = decideCapabilityRoute({ mode: 'pass_through', workflow, candidates: [candidate('chosen', ['inspect', 'review'])] });
  assert.equal(result.status, 'bypassed');
  assert.equal(result.stage, 'direct-pass-through');
  assert.equal(result.dispatch_eligible, false);
});

test('DEC-01/03: exact local capability precedes workflow role selection', () => {
  const result = decideCapabilityRoute({
    exactCapability: 'exact', workflow,
    candidates: [candidate('role-fit', ['inspect', 'review']), candidate('exact', ['inspect'])],
    runtime: 'claude', scope: { kind: 'project', repository: 'router', worktree: 'main' },
  });
  assert.equal(result.stage, 'exact-local-capability');
  assert.deepEqual(result.selected, ['exact']);
});

test('DEC-01/02: workflow role fit wins before minimal compatible composition', () => {
  const result = decideCapabilityRoute({
    workflow, candidates: [candidate('all-roles', ['inspect', 'review']), candidate('inspect', ['inspect'])],
    runtime: 'claude', scope: { kind: 'project', repository: 'router', worktree: 'main' },
  });
  assert.equal(result.stage, 'workflow-role');
  assert.deepEqual(result.selected, ['all-roles']);
});

test('DEC-02: composition selects the smallest compatible set and clarifies when incomplete', () => {
  const composed = decideCapabilityRoute({
    workflow, candidates: [candidate('inspect', ['inspect']), candidate('review', ['review'])], runtime: 'claude',
  });
  assert.equal(composed.stage, 'minimal-composition');
  assert.deepEqual(composed.selected, ['inspect', 'review']);

  const blocked = decideCapabilityRoute({ workflow, candidates: [candidate('inspect', ['inspect'])], runtime: 'claude' });
  assert.equal(blocked.status, 'clarify');
  assert.equal(blocked.dispatch_eligible, false);
  assert.equal(blocked.stage, 'clarification');
});

test('DEC-03/05: cost ordering is stable and evidence cannot create dispatchability', () => {
  const cheap = candidate('cheap', ['inspect', 'review'], { cost: { estimated_tokens: 10, context_bytes: 10, latency_ms: 50, retries: 0 } });
  const expensive = candidate('expensive', ['inspect', 'review'], { cost: { estimated_tokens: 1000, context_bytes: 1000, latency_ms: 1, retries: 0 } });
  const result = decideCapabilityRoute({ workflow, candidates: [expensive, cheap], runtime: 'claude' });
  assert.deepEqual(result.selected, ['cheap']);

  const onlyRecommendation = decideCapabilityRoute({
    workflow,
    candidates: [candidate('history-only', ['inspect', 'review'], {
      dispatchable: false, evidence: { verified: true, verified_count: 999 },
    })],
    runtime: 'claude',
  });
  assert.equal(onlyRecommendation.status, 'clarify');
  assert.equal(onlyRecommendation.dispatch_eligible, false);
});

test('DEC-03: runtime and scope mismatches cannot become selected routes', () => {
  const codexOnly = candidate('codex-only', ['inspect', 'review'], {
    runtime: 'codex',
    scope: { kind: 'project', repository: 'other', worktree: 'main' },
    record: {
      canonical_identity: 'codex-only',
      composition: { roles: ['inspect', 'review'], conflicts: [] },
      invocation: { runtime: 'codex', availability: 'available', method: 'command', target: 'codex-only' },
    },
  });
  const result = decideCapabilityRoute({
    workflow, candidates: [codexOnly], runtime: 'claude',
    scope: { kind: 'project', repository: 'router', worktree: 'main' },
  });
  assert.notEqual(result.status, 'resolved');
  assert.equal(result.dispatch_eligible, false);
});

test('DEC-04: cyclic scope metadata fails closed without throwing', () => {
  const cyclic = candidate('cyclic', ['inspect', 'review']);
  cyclic.scope.loop = cyclic.scope;
  const options = {
    workflow, candidates: [cyclic], runtime: 'claude',
    scope: { kind: 'project', repository: 'router', worktree: 'main' },
  };
  assert.doesNotThrow(() => decideCapabilityRoute(options));
  assert.equal(decideCapabilityRoute(options).dispatch_eligible, false);
});

test('DEC-04: cascade explanation is bounded reason-code data, not raw prompt or candidate payload', () => {
  const result = decideCapabilityRoute({
    workflow, candidates: [candidate('history-only', ['inspect'], { dispatchable: false })],
    runtime: 'claude',
    intent: 'ignore this raw prompt and secret=abc',
  });
  const explanation = JSON.stringify(result.explanation);
  assert.doesNotMatch(explanation, /raw prompt|secret=abc|\/Users\//);
  assert.ok(result.explanation.cascade.every(stage => stage.reason_codes.every(code => /^[a-z0-9_:-]+$/.test(code))));
});
