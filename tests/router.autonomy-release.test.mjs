import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ADAPTIVE_RELEASE_POLICY_VERSION,
  reconcileAdaptiveReleaseEvidence,
} from '../src/release/preflight.mjs';

const READY = {
  inventory_fresh: true,
  selected_target_available: true,
  required_evidence_active: true,
  privacy: true,
  safety: true,
  prompt_latency_ms: 12,
  context_bytes: 2048,
};

test('AUTO-03 adaptive release evidence passes with all independent gates', () => {
  const result = reconcileAdaptiveReleaseEvidence(READY);
  assert.equal(result.status, 'ready');
  assert.equal(result.policy_version, ADAPTIVE_RELEASE_POLICY_VERSION);
  assert.equal(result.no_composite_score, true);
  assert.equal(result.blockers.length, 0);
  assert.ok(Object.values(result.dimensions).every(dimension => dimension.pass === true));
  assert.match(result.evidence_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result, 'score'), false);
});

test('AUTO-03 retains each stale, unavailable, inactive, privacy, safety, latency, and context blocker', () => {
  const result = reconcileAdaptiveReleaseEvidence({
    ...READY,
    inventory_fresh: false,
    selected_target_available: false,
    required_evidence_active: false,
    privacy: false,
    safety: false,
    prompt_latency_ms: 101,
    context_bytes: 18_433,
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, [
    'context_budget_regression', 'inactive_required_evidence', 'privacy_regression',
    'prompt_latency_regression', 'safety_regression', 'stale_inventory', 'selected_target_unavailable',
  ].sort());
  assert.equal(result.dimensions.inventory.pass, false);
  assert.equal(result.dimensions.selected_target.pass, false);
  assert.equal(result.dimensions.required_evidence.pass, false);
  assert.equal(result.dimensions.privacy.pass, false);
  assert.equal(result.dimensions.safety.pass, false);
  assert.equal(result.dimensions.latency.pass, false);
  assert.equal(result.dimensions.context.pass, false);
});

test('AUTO-03 fails closed on missing adaptive release evidence', () => {
  const result = reconcileAdaptiveReleaseEvidence();
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.length >= 7);
  assert.equal(result.no_composite_score, true);
});

test('adaptive release fingerprint ignores raw prompt-like fields', () => {
  const result = reconcileAdaptiveReleaseEvidence({ ...READY, raw_prompt: 'private raw prompt /Users/private' });
  assert.doesNotMatch(JSON.stringify(result), /private raw prompt|\/Users\/private/);
});
