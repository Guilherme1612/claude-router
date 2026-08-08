import { createHash } from 'node:crypto';
import { outcomeCredit } from '../adapters/dispatch/receipt.mjs';

export const LEARNING_THRESHOLDS = Object.freeze({
  min_samples: 30,
  min_consistency: 0.95,
  max_age_ms: 7 * 24 * 60 * 60 * 1000,
  min_negative_controls: 5,
  min_quality_improvement: 0.01,
  max_quality_regression: 0,
  max_latency_regression_ms: 0,
});

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROTECTED_KEYS = new Set(['authority', 'effect_risk', 'privacy', 'export', 'permission', 'permissions']);

function stable(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('learning input must be finite JSON');
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map(item => stable(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key], seen)]));
  seen.delete(value);
  return result;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function token(value, label) {
  if (!TOKEN.test(value ?? '')) throw new TypeError(`invalid ${label}`);
  return value;
}

function containsProtectedMutation(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => PROTECTED_KEYS.has(key.toLowerCase()) || containsProtectedMutation(child));
}

function scopeFromReceipt(receipt) {
  const identity = receipt?.identity || receipt?.invocation_identity?.identity || {};
  const runtime = receipt?.runtime || receipt?.invocation_identity?.runtime || identity.runtime;
  const scope = {
    runtime: token(runtime, 'runtime'),
    project_id: token(identity.project_id, 'project_id'),
    capability_fingerprint: token(identity.capability_fingerprint, 'capability_fingerprint'),
    mapping_generation: token(identity.mapping_generation, 'mapping_generation'),
  };
  return Object.freeze(scope);
}

export function learningPartitionKey(scope) {
  const value = stable({
    runtime: token(scope?.runtime, 'runtime'),
    project_id: token(scope?.project_id, 'project_id'),
    capability_fingerprint: token(scope?.capability_fingerprint, 'capability_fingerprint'),
    mapping_generation: token(scope?.mapping_generation, 'mapping_generation'),
  });
  return `partition-${hash(value)}`;
}

function observationFromReceipt(receipt) {
  const observation = receipt?.completion_evidence?.learning || receipt?.attribution?.learning;
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return null;
  const route_id = observation.actual_route_id || receipt?.actual?.route_id || receipt?.identity?.route_id;
  if (!TOKEN.test(route_id ?? '')) return null;
  if (!Number.isSafeInteger(observation.observed_at_ms) || observation.observed_at_ms < 0) return null;
  if (typeof observation.quality !== 'number' || observation.quality < 0 || observation.quality > 1) return null;
  if (!Number.isFinite(observation.latency_ms) || observation.latency_ms < 0) return null;
  return {
    receipt_id: token(receipt.receipt_id, 'receipt_id'),
    actual_route_id: token(route_id, 'actual_route_id'),
    observed_at_ms: observation.observed_at_ms,
    quality: observation.quality,
    latency_ms: observation.latency_ms,
    negative_control: observation.negative_control === true,
    negative_control_pass: observation.negative_control_pass === true,
  };
}

function correctionForReceipt(correction, receipt) {
  if (!correction || typeof correction !== 'object' || correction.receipt_id !== receipt.receipt_id) return null;
  if (!TOKEN.test(correction.correction_code ?? '')) return null;
  return {
    receipt_id: receipt.receipt_id,
    correction_code: correction.correction_code,
    corrected_route_id: TOKEN.test(correction.corrected_route_id ?? '') ? correction.corrected_route_id : null,
  };
}

export function collectLearningEvidence({ receipts = [], corrections = [] } = {}) {
  if (!Array.isArray(receipts) || !Array.isArray(corrections)) return { status: 'denied', reason_code: 'invalid_learning_input' };
  const byId = new Map(receipts.map(receipt => [receipt?.receipt_id, receipt]));
  const correctionMap = new Map();
  for (const correction of corrections) {
    const receipt = byId.get(correction?.receipt_id);
    const normalized = receipt && correctionForReceipt(correction, receipt);
    if (normalized) correctionMap.set(normalized.receipt_id, normalized);
  }
  const partitions = new Map();
  const rejected = [];
  for (const receipt of receipts) {
    if (!outcomeCredit(receipt) || receipt?.completion_evidence?.state !== 'completed') {
      rejected.push({ receipt_id: receipt?.receipt_id ?? null, reason_code: 'causal_credit_required' });
      continue;
    }
    let scope;
    try { scope = scopeFromReceipt(receipt); } catch { rejected.push({ receipt_id: receipt?.receipt_id ?? null, reason_code: 'invalid_learning_scope' }); continue; }
    const observation = observationFromReceipt(receipt);
    if (!observation) { rejected.push({ receipt_id: receipt.receipt_id, reason_code: 'learning_observation_required' }); continue; }
    const key = learningPartitionKey(scope);
    if (!partitions.has(key)) partitions.set(key, { key, scope, observations: [], corrections: [] });
    const partition = partitions.get(key);
    partition.observations.push(observation);
    const correction = correctionMap.get(receipt.receipt_id);
    if (correction) partition.corrections.push(correction);
  }
  return freeze({
    status: 'accepted',
    partitions: [...partitions.values()].map(partition => ({
      ...partition,
      observations: partition.observations.sort((a, b) => a.receipt_id.localeCompare(b.receipt_id)),
      corrections: partition.corrections.sort((a, b) => a.receipt_id.localeCompare(b.receipt_id)),
    })),
    rejected,
  });
}

export function buildLearningCandidate({ partition, proposed_tuple, now = Date.now() } = {}) {
  if (!partition?.key || !Array.isArray(partition.observations) || !proposed_tuple || !Number.isSafeInteger(now)) {
    return { status: 'denied', reason_code: 'invalid_learning_candidate' };
  }
  if (containsProtectedMutation(proposed_tuple)) return { status: 'denied', reason_code: 'protected_field_mutation' };
  const content = stable({
    schema_version: 1,
    partition: partition.key,
    scope: partition.scope,
    observations: partition.observations,
    corrections: partition.corrections || [],
    proposed_tuple,
    created_at_ms: now,
  });
  return freeze({
    status: 'proposed',
    candidate_id: `learning-${hash(content)}`,
    ...content,
  });
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function evaluateLearningCandidate({ candidate, baseline, now = Date.now(), canary = null } = {}) {
  if (!candidate || candidate.status !== 'proposed' || !Array.isArray(candidate.observations)) {
    return { status: 'rejected', reason_code: 'invalid_learning_candidate', promotable: false };
  }
  const observations = candidate.observations;
  const counts = new Map();
  for (const observation of observations) counts.set(observation.actual_route_id, (counts.get(observation.actual_route_id) || 0) + 1);
  const consistency = observations.length ? Math.max(...counts.values()) / observations.length : 0;
  const newestAge = observations.length ? Math.max(...observations.map(item => now - item.observed_at_ms)) : Infinity;
  const negative_controls = observations.filter(item => item.negative_control && item.negative_control_pass).length;
  const quality = observations.length ? mean(observations.map(item => item.quality)) : 0;
  const latency = observations.length ? mean(observations.map(item => item.latency_ms)) : Infinity;
  const baselineQuality = Number.isFinite(baseline?.quality) ? baseline.quality : 0;
  const baselineLatency = Number.isFinite(baseline?.latency_ms) ? baseline.latency_ms : Infinity;
  const gates = {
    samples: observations.length >= LEARNING_THRESHOLDS.min_samples,
    consistency: consistency >= LEARNING_THRESHOLDS.min_consistency,
    freshness: newestAge >= 0 && newestAge <= LEARNING_THRESHOLDS.max_age_ms,
    negative_controls: negative_controls >= LEARNING_THRESHOLDS.min_negative_controls,
    improvement: quality - baselineQuality >= LEARNING_THRESHOLDS.min_quality_improvement,
    quality_regression: baselineQuality - quality <= LEARNING_THRESHOLDS.max_quality_regression,
    latency_regression: latency - baselineLatency <= LEARNING_THRESHOLDS.max_latency_regression_ms,
  };
  const metrics = { sample_count: observations.length, consistency, newest_age_ms: newestAge, negative_controls, quality, latency, baseline_quality: baselineQuality, baseline_latency_ms: baselineLatency };
  const failed = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => name);
  if (failed.length) return freeze({ status: 'shadowed', promotable: false, candidate_id: candidate.candidate_id, reason_code: failed.includes('quality_regression') || failed.includes('latency_regression') ? 'regression_detected' : 'insufficient_or_inconsistent_evidence', failed_gates: failed, gates, metrics });
  if (canary && canary.passed !== true) return freeze({ status: 'rollback_required', promotable: false, candidate_id: candidate.candidate_id, reason_code: 'canary_failed', gates, metrics });
  return freeze({ status: canary ? 'promotable' : 'canary_ready', promotable: true, candidate_id: candidate.candidate_id, reason_code: canary ? 'canary_passed' : 'evidence_gates_passed', gates, metrics });
}

export function applyLearningDecision({ candidate, evaluation, known_good_tuple, canary = null } = {}) {
  if (!candidate || !evaluation || !known_good_tuple || typeof known_good_tuple !== 'object') return { status: 'rejected', reason_code: 'invalid_learning_decision' };
  const knownGood = stable(known_good_tuple);
  if (evaluation.status === 'rollback_required' || canary?.passed === false) {
    return freeze({ status: 'rolled_back', candidate_id: candidate.candidate_id, reason_code: evaluation.reason_code || 'canary_failed', active_tuple: knownGood });
  }
  if (!evaluation.promotable) return freeze({ status: 'shadowed', candidate_id: candidate.candidate_id, reason_code: evaluation.reason_code, active_tuple: knownGood });
  if (!canary) return freeze({ status: 'canary', candidate_id: candidate.candidate_id, reason_code: 'awaiting_canary', active_tuple: knownGood });
  return freeze({ status: 'promoted', candidate_id: candidate.candidate_id, reason_code: 'canary_passed', active_tuple: stable(candidate.proposed_tuple) });
}
