import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingReceipt, transitionReceipt } from '../../src/adapters/dispatch/receipt.mjs';
import {
  LEARNING_THRESHOLDS,
  applyLearningDecision,
  buildLearningCandidate,
  collectLearningEvidence,
  evaluateLearningCandidate,
  learningPartitionKey,
} from '../../src/evolution/local-learning.mjs';

const NOW = 1_800_000_000_000;

function receipt(index, overrides = {}) {
  const identity = {
    project_id: 'project-alpha', goal_id: 'goal-1', route_id: 'route-selected', action_id: `action-${index}`,
    mapping_generation: 'generation-1', capability_fingerprint: 'capability-a', authority: 'one_turn', risk: 'low',
    idempotency_key: `learning-${index}`,
  };
  let value = buildPendingReceipt({ adapter: 'fixture', runtime: overrides.runtime || 'claude', identity, intent: 'bounded fixture' });
  value = transitionReceipt(value, 'invoked', { invocation_identity: { pid: 1000 + index } });
  value = transitionReceipt(value, 'completed', {
    completion_evidence: {
      exit_code: 0,
      learning: {
        actual_route_id: overrides.actual_route_id || 'route-actual',
        observed_at_ms: overrides.observed_at_ms ?? NOW - 1_000,
        quality: overrides.quality ?? 0.91,
        latency_ms: overrides.latency_ms ?? 10,
        negative_control: overrides.negative_control ?? index < 5,
        negative_control_pass: overrides.negative_control_pass ?? index < 5,
      },
    },
  });
  value.invocation_evidence = { receipt_id: value.receipt_id, observed: true };
  value.postcondition_evidence = { receipt_id: value.receipt_id, verified: true };
  return value;
}

function partitionReceipts(count = 30, overrides = {}) {
  return Array.from({ length: count }, (_, index) => receipt(index, overrides[index] || overrides));
}

function candidateFrom(receipts, tuple = { registry: 'r2', mapping: 'm2', policy: 'p1', compiled_index: 'i2' }) {
  const corrected = receipts.find(item => item.invocation_identity?.identity?.action_id === 'action-0') || receipts[0];
  const collected = collectLearningEvidence({
    receipts,
    corrections: [{ receipt_id: corrected.receipt_id, correction_code: 'operator_correction', corrected_route_id: 'route-actual' }],
  });
  assert.equal(collected.status, 'accepted');
  assert.equal(collected.partitions.length, 1);
  return buildLearningCandidate({ partition: collected.partitions[0], proposed_tuple: tuple, now: NOW });
}

test('LEARN-01: only causally credited receipts with bounded observations enter a runtime/project partition', () => {
  const complete = receipt(1);
  const ignored = transitionReceipt(buildPendingReceipt({ adapter: 'fixture', runtime: 'claude', identity: {
    project_id: 'project-alpha', goal_id: 'goal-1', route_id: 'route-selected', action_id: 'ignored', mapping_generation: 'generation-1', capability_fingerprint: 'capability-a', idempotency_key: 'ignored',
  } }), 'recommendation_only');
  const result = collectLearningEvidence({ receipts: [complete, ignored] });
  assert.equal(result.partitions.length, 1);
  assert.equal(result.partitions[0].scope.runtime, 'claude');
  assert.equal(result.rejected[0].reason_code, 'causal_credit_required');
  assert.equal(learningPartitionKey(result.partitions[0].scope), result.partitions[0].key);
});

test('LEARN-01: runtime and capability changes cannot share a learning partition', () => {
  const result = collectLearningEvidence({ receipts: [receipt(1), receipt(2, { runtime: 'codex' }), receipt(3, { actual_route_id: 'route-other' })] });
  assert.equal(result.partitions.length, 2);
  assert.deepEqual(result.partitions.map(item => item.scope.runtime).sort(), ['claude', 'codex']);
});

test('LEARN-02: thresholds are explicit and insufficient evidence remains shadowed', () => {
  assert.deepEqual(LEARNING_THRESHOLDS, {
    min_samples: 30,
    min_consistency: 0.95,
    max_age_ms: 604800000,
    min_negative_controls: 5,
    min_quality_improvement: 0.01,
    max_quality_regression: 0,
    max_latency_regression_ms: 0,
  });
  const candidate = candidateFrom(partitionReceipts(29));
  const evaluation = evaluateLearningCandidate({ candidate, baseline: { quality: 0.89, latency_ms: 10 }, now: NOW });
  assert.equal(evaluation.status, 'shadowed');
  assert.ok(evaluation.failed_gates.includes('samples'));
});

test('LEARN-02/03: exact boundaries pass, while contradictory, stale, and negative-control gaps fail closed', () => {
  const exact = candidateFrom(partitionReceipts());
  const passing = evaluateLearningCandidate({ candidate: exact, baseline: { quality: 0.90, latency_ms: 10 }, now: NOW });
  assert.equal(passing.status, 'canary_ready');
  assert.equal(passing.promotable, true);

  const contradictory = candidateFrom(partitionReceipts(30, {
    0: { actual_route_id: 'route-other' },
    1: { actual_route_id: 'route-other' },
  }));
  const contradictionResult = evaluateLearningCandidate({ candidate: contradictory, baseline: { quality: 0.89, latency_ms: 10 }, now: NOW });
  assert.ok(contradictionResult.failed_gates.includes('consistency'));

  const stale = candidateFrom(partitionReceipts(30, { observed_at_ms: NOW - LEARNING_THRESHOLDS.max_age_ms - 1 }));
  const staleResult = evaluateLearningCandidate({ candidate: stale, baseline: { quality: 0.89, latency_ms: 10 }, now: NOW });
  assert.ok(staleResult.failed_gates.includes('freshness'));

  const controls = candidateFrom(partitionReceipts(30, { negative_control: true, negative_control_pass: false }));
  const controlResult = evaluateLearningCandidate({ candidate: controls, baseline: { quality: 0.89, latency_ms: 10 }, now: NOW });
  assert.ok(controlResult.failed_gates.includes('negative_controls'));
});

test('LEARN-03/04: shadow, canary, promotion, and complete known-good rollback are deterministic', () => {
  const knownGood = { registry: 'r1', mapping: 'm1', policy: 'p1', compiled_index: 'i1', leases: [], receipts: [] };
  const candidate = candidateFrom(partitionReceipts());
  const evaluation = evaluateLearningCandidate({ candidate, baseline: { quality: 0.90, latency_ms: 10 }, now: NOW });
  assert.equal(applyLearningDecision({ candidate, evaluation, known_good_tuple: knownGood }).status, 'canary');
  const promoted = applyLearningDecision({ candidate, evaluation: evaluateLearningCandidate({ candidate, baseline: { quality: 0.90, latency_ms: 10 }, now: NOW, canary: { passed: true } }), known_good_tuple: knownGood, canary: { passed: true } });
  assert.equal(promoted.status, 'promoted');
  assert.deepEqual(promoted.active_tuple, candidate.proposed_tuple);
  const rolledBack = applyLearningDecision({ candidate, evaluation, known_good_tuple: knownGood, canary: { passed: false } });
  assert.equal(rolledBack.status, 'rolled_back');
  assert.deepEqual(rolledBack.active_tuple, knownGood);
});

test('LEARN-03: proposed mappings cannot mutate authority, permission, risk, privacy, or export fields', () => {
  const collected = collectLearningEvidence({ receipts: partitionReceipts(1) });
  const denied = buildLearningCandidate({
    partition: collected.partitions[0],
    proposed_tuple: { mapping: 'm2', permissions: { network: true } },
    now: NOW,
  });
  assert.deepEqual(denied, { status: 'denied', reason_code: 'protected_field_mutation' });
});

test('LEARN-04: candidate identity is byte-stable for equivalent receipt ordering', () => {
  const first = candidateFrom(partitionReceipts());
  const second = candidateFrom(partitionReceipts().reverse());
  assert.equal(first.candidate_id, second.candidate_id);
});
