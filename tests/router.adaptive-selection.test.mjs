import assert from 'node:assert/strict';
import test from 'node:test';

import { decideCapabilityRoute, rankSelectionCandidates } from '../src/orchestrator/select.mjs';

function candidate(stable_id, overrides = {}) {
  return {
    stable_id,
    runtime: 'claude',
    scope: { kind: 'project', project_id: 'demo' },
    dispatchable: true,
    roles: ['review'],
    availability: { available: true },
    eligibility: { eligible: true },
    evidence: { strength: 'verified' },
    cost: { value: 'low', latency_ms: 10 },
    ...overrides,
  };
}

test('adaptive selection is deterministic and uses independent precedence gates', () => {
  const input = [
    candidate('zeta', { cost: { value: 'low', latency_ms: 1 } }),
    candidate('alpha', { cost: { value: 'low', latency_ms: 1 } }),
    candidate('codex-match', { runtime: 'codex' }),
    candidate('unavailable', { availability: { available: false } }),
  ];
  const first = rankSelectionCandidates({ candidates: input, runtime: 'claude', scope: { kind: 'project', project_id: 'demo' }, requiredRoles: ['review'] });
  const second = rankSelectionCandidates({ candidates: [...input].reverse(), runtime: 'claude', scope: { kind: 'project', project_id: 'demo' }, requiredRoles: ['review'] });
  assert.equal(first.status, 'resolved');
  assert.equal(first.selected.stable_id, 'alpha');
  assert.equal(second.selected.stable_id, first.selected.stable_id);
  assert.deepEqual(first.selection_order.slice(0, 6), ['explicit', 'runtime', 'scope', 'availability', 'eligibility', 'dispatchability']);
  assert.equal(Object.hasOwn(first, 'authority_score'), false);
});

test('explicit choice never silently falls back and direct modes bypass', () => {
  const unavailable = candidate('explicit', { availability: { available: false } });
  const blocked = rankSelectionCandidates({ candidates: [unavailable, candidate('fallback')], explicitCapability: 'explicit' });
  assert.equal(blocked.selected, null);
  assert.deepEqual(blocked.reason_codes, ['explicit_capability_unavailable']);

  const bypass = rankSelectionCandidates({ candidates: [candidate('one')], mode: 'pass_through' });
  assert.equal(bypass.status, 'bypassed');
  assert.deepEqual(bypass.candidates, []);
  assert.deepEqual(bypass.reason_codes, ['pass_through_mode_bypass']);
});

test('candidate and context budgets are explicit and bounded', () => {
  const result = rankSelectionCandidates({
    candidates: Array.from({ length: 3 }, (_, index) => candidate(`cap-${index}`)),
    maxCandidates: 2,
    maxContextBytes: 2048,
  });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.omitted_candidate_count, 1);
  assert.deepEqual(result.budget, { max_candidates: 2, max_context_bytes: 2048 });
});

test('malformed selection input fails closed without throwing', () => {
  assert.doesNotThrow(() => rankSelectionCandidates(null));
  const result = rankSelectionCandidates(null);
  assert.equal(result.status, 'unresolved');
  assert.equal(result.dispatch_eligible, false);
});

test('malformed composition hook fails closed without throwing', () => {
  const candidateValue = candidate('composition-fallback', { roles: undefined });
  candidateValue.record = { canonical_identity: 'composition-fallback', composition: { roles: ['review'] } };
  assert.doesNotThrow(() => decideCapabilityRoute({
    workflow: { roles: ['review'] }, candidates: [candidateValue], compose: null,
  }));
  assert.equal(decideCapabilityRoute({
    workflow: { roles: ['review'] }, candidates: [candidateValue], compose: null,
  }).reason_code, 'composition_unavailable');
});
