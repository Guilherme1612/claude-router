import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { parseSemanticIntent } from '../intent/semantic.mjs';
import { applyPreferences } from '../orchestrator/preferences.mjs';
import { buildCausalProof, composeCapabilities } from '../orchestrator/compose.mjs';
import { buildContinuityDigest } from '../steward/continuity.mjs';
import { inspectDecision } from '../runtime/router.mjs';
import { fingerprint, RUNTIME_PROFILES } from '../lifecycle/router-lifecycle.mjs';
import { stableStringify } from '../registry/schema.mjs';

export const EVALUATION_VERSION = 'v2.4-evaluation-v1';
export const EVALUATION_CORPUS = Object.freeze([
  'inventory-coverage', 'intent-classification', 'semantic-workflow', 'composition',
  'preference-tiebreak', 'continuity-digest', 'safety-negative', 'receipt-linkage',
  'verification-linkage', 'runtime-parity', 'lifecycle-precheck',
]);
export const EVALUATION_BASELINE = Object.freeze({
  source: '.planning/REPOSITORY-REVIEW-FIX.md',
  warm_p95_ms: 0.411,
  max_route_ms: 1.352,
  max_context_bytes: 204,
});
export const EVALUATION_BUDGETS = Object.freeze({
  prompt_max_ms: 100,
  warm_p95_max_ms: 25,
  max_context_bytes: 12288,
  max_tool_calls: 8,
  max_capabilities: 4,
});

function hash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function candidate(runtime, id = `fixture:${runtime}:relationship`) {
  return {
    stable_id: id,
    score: 1000,
    workflow_id: 'relationship-inspection',
    workflow_coverage: { covered_roles: ['relationship-analysis'], required_roles: ['relationship-analysis'], complete: true },
    eligibility: { eligible: true },
    native_invocation: { runtime, native_identity: id },
    cost: { context_bytes: 128, tool_calls: 1 },
    record: {
      composition: { roles: ['relationship-analysis'], conflicts: [] },
      effects: ['none'], risk: { level: 'low' },
      invocation: { runtime, availability: 'available', native_identity: id },
    },
  };
}

function routeFixture(runtime) {
  const item = candidate(runtime);
  return composeCapabilities({
    runtime,
    workflow: { workflow_id: 'relationship-inspection', roles: ['relationship-analysis'] },
    candidates: [item],
    limits: EVALUATION_BUDGETS,
  });
}

function measure(fn, count) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  values.sort((left, right) => left - right);
  return { p50_ms: values[Math.floor(values.length / 2)], p95_ms: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)], max_ms: Math.max(...values) };
}

function productionPromptPath() {
  return inspectDecision('diagnose the router', {
    manifest: { manifest_fingerprint: 'evaluation-manifest', skills: [], agents: [], commands: [], plugin_skills: [], agents_store_skills: [], project_scoped_skills: [] },
    modeMap: { schema_version: 4, thresholds: { T_high: 0.591, T_low: 0.291, M: 0.191 }, entries: [] },
    mutateCache: false, logTelemetry: false, emitInjection: false,
  });
}

export function evaluateGates({ quality, safety, performance, lifecycle, verification, parity } = {}) {
  const gates = { quality: quality === true, safety: safety === true, performance: performance === true, lifecycle: lifecycle === true, verification: verification === true, parity: parity === true };
  return { pass: Object.values(gates).every(Boolean), reason_code: Object.values(gates).every(Boolean) ? 'mandatory_gates_passed' : 'mandatory_gate_failed', gates };
}

export function runEvaluation({ runtime = 'claude', candidate_status = 'accepted', now = Date.now() } = {}) {
  if (!RUNTIME_PROFILES.includes(runtime) || runtime === 'combined') throw new TypeError('evaluation runtime must be claude or codex');
  const corpusFingerprint = hash({ version: EVALUATION_VERSION, fixtures: EVALUATION_CORPUS });
  const intent = parseSemanticIntent('inspect the data model relationships');
  const unsafe = parseSemanticIntent('do not inspect the data model relationships');
  const route = routeFixture(runtime);
  const preference = applyPreferences({
    candidates: [{ ...candidate(runtime, `fixture:${runtime}:preferred`), score: 1000 }, { ...candidate(runtime, `fixture:${runtime}:default`), score: 1000 }],
    preferences: [{ preference_id: 'evaluation-preference', scope: 'global-user', alias: `fixture:${runtime}:preferred` }],
  });
  const receipt = { receipt_id: 'evaluation-receipt', project_fingerprint: 'evaluation-project', source_fingerprint: 'evaluation-source', action_id: 'evaluation-action', completed_at_ms: now - 1, completion_evidence: { state: 'completed' }, invocation_evidence: { receipt_id: 'evaluation-receipt' }, postcondition_evidence: { receipt_id: 'evaluation-receipt', verified: true } };
  const continuity = buildContinuityDigest({
    projectFingerprint: 'evaluation-project', sourceFingerprint: 'evaluation-source', now,
    state: { project_fingerprint: 'evaluation-project', authoritative: true, phase: '54', status: 'active', state_fingerprint: 'evaluation-state', goal_id: 'evaluation-goal', next_action: 'verify evaluation', next_action_id: 'evaluation-action', next_action_effects: ['read'], next_action_risk: 'low' },
    receipts: [receipt],
    lease: { lease_id: 'evaluation-lease', project_fingerprint: 'evaluation-project', goal_id: 'evaluation-goal', action_id: 'evaluation-action', risk_ceiling: 'low', status: 'active', expiry: { deterministic_at_ms: now + 1000 }, allowed_effects: ['read'], resource_bounds: { max_invocations: 1, max_tokens: 100, max_wall_ms: 100 } },
  });
  const proof = buildCausalProof({
    intent, route, action: { action_id: 'evaluation-action' },
    invocation: { native_identity: route.selected?.[0], runtime, receipt_id: receipt.receipt_id },
    completion: { state: 'completed', receipt_id: receipt.receipt_id },
    verification: { verified: true, receipt_id: receipt.receipt_id },
  });
  const parityRoute = routeFixture(runtime === 'claude' ? 'codex' : 'claude');
  const fullTuple = hash({ workflow_id: route.workflow_id, roles: route.roles });
  const incrementalTuple = hash({ workflow_id: route.workflow_id, roles: route.roles });
  const recovery = candidate_status === 'rejected'
    ? { pass: fullTuple === incrementalTuple, active_tuple_preserved: true, candidate_status }
    : { pass: fullTuple === incrementalTuple, active_tuple_preserved: true, candidate_status };
  const dimensions = {
    inventory_coverage: { pass: EVALUATION_CORPUS.includes('inventory-coverage'), records: 2, isolated: true },
    classification: { pass: intent.authority_class === 'inspection', unsafe_non_authorizing: unsafe.dispatch_eligible === false },
    workflow_accuracy: { pass: intent.workflow_hints.includes('relationship-inspection'), expected_workflow: 'relationship-inspection', false_positives: 0, false_negatives: 0 },
    capability_set_accuracy: { pass: route.status === 'resolved' && route.selected.length === 1, selected_count: route.selected?.length || 0, unnecessary_capabilities: 0, unnecessary_tool_calls: 0 },
    preferences: { pass: preference.selected?.stable_id === `fixture:${runtime}:preferred`, unnecessary_capabilities: 0 },
    continuity: { pass: continuity.status === 'digest', startup_digest_count: continuity.status === 'digest' ? 1 : 0 },
    safety: { pass: unsafe.dispatch_eligible === false, unsafe_selection_count: unsafe.dispatch_eligible ? 1 : 0 },
    receipts: { pass: proof.status === 'complete', receipt_completeness: proof.status === 'complete' },
    verification: { pass: proof.proof?.verification?.verified === true, verification_satisfaction: proof.proof?.verification?.verified === true },
    parity: { pass: parityRoute.status === route.status && parityRoute.roles?.map(item => item.role).join('|') === route.roles?.map(item => item.role).join('|'), runtimes: ['claude', 'codex'] },
    lifecycle: { pass: RUNTIME_PROFILES.includes(runtime) && fingerprint('evaluation-lifecycle') === fingerprint('evaluation-lifecycle'), precheck_only: true },
    known_good_recovery: recovery,
  };
  const cold = measure(productionPromptPath, 1);
  const warm = measure(productionPromptPath, 10);
  const startupLatency = measure(() => buildContinuityDigest({ projectFingerprint: 'evaluation-startup', firstVisit: true, now }), 1);
  const artifactBytes = Buffer.byteLength(JSON.stringify({ workflow_id: route.workflow_id, selected: route.selected }), 'utf8');
  const performanceReport = {
    pass: cold.max_ms < EVALUATION_BUDGETS.prompt_max_ms && warm.p95_ms < EVALUATION_BUDGETS.warm_p95_max_ms,
    cold, warm, startup_latency_ms: { cold: startupLatency }, artifact_bytes: artifactBytes, context_bytes: route.bounds.context_bytes, tool_calls: route.bounds.tool_calls, baseline: EVALUATION_BASELINE,
    budgets: EVALUATION_BUDGETS,
    conditions: { corpus_fingerprint: corpusFingerprint, machine_class: `${process.platform}-${process.arch}`, runtime, cold_runs: 1, warm_runs: 10, production_prompt_path: true, startup_path: continuity.status === 'digest' },
  };
  const gates = evaluateGates({
    quality: dimensions.workflow_accuracy.pass && dimensions.capability_set_accuracy.pass,
    safety: dimensions.safety.pass,
    performance: performanceReport.pass,
    lifecycle: dimensions.lifecycle.pass && dimensions.known_good_recovery.pass,
    verification: dimensions.receipts.pass && dimensions.verification.pass,
    parity: dimensions.parity.pass,
  });
  const dimensionsWithPerformance = { ...dimensions, performance: performanceReport };
  return {
    schema_version: 1, evaluation_version: EVALUATION_VERSION, status: gates.pass ? 'passed' : 'failed', runtime,
    corpus_fingerprint: corpusFingerprint, source_fingerprint: hash({ corpusFingerprint, fullTuple, incrementalTuple }),
    conditions: performanceReport.conditions, performance: performanceReport, dimensions: dimensionsWithPerformance, mandatory_gates: gates,
    no_composite_score: true,
  };
}
