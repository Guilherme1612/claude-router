import { createHash } from 'node:crypto';

import { stableStringify } from '../registry/schema.mjs';

export const RELEASE_POLICY_VERSION = 'release-preflight-v1';
export const SUPPORTED_RUNTIMES = Object.freeze(['claude', 'codex']);
export const ADAPTIVE_RELEASE_POLICY_VERSION = 'adaptive-release-preflight-v1';
export const ADAPTIVE_RELEASE_LIMITS = Object.freeze({ prompt_latency_ms: 100, context_bytes: 18_432 });
export const AUTONOMOUS_RELEASE_POLICY_VERSION = 'autonomous-release-preflight-v1';

function digest(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function runtimeBlockers(runtime, evidence) {
  const blockers = [];
  if (evidence?.pass !== true) blockers.push(`installed_${runtime}_evidence_missing`);
  if (!evidence?.ownership_ledger) blockers.push(`installed_${runtime}_ownership_missing`);
  const safeEmptyActive = evidence?.safe_empty_active === true
    && evidence?.candidate_disposition === 'eligible'
    && evidence?.verification_passing === true
    && evidence?.active_tuple_absent === true
    && evidence?.dispatchable_count === 0;
  if (!evidence?.semantic_active && !safeEmptyActive) blockers.push(`installed_${runtime}_semantic_missing`);
  if (!evidence?.continuity) blockers.push(`installed_${runtime}_continuity_missing`);
  if (!evidence?.native_invocation_identity) blockers.push(`installed_${runtime}_native_evidence_missing`);
  if (!evidence?.receipt_verification) blockers.push(`installed_${runtime}_receipt_verification_missing`);
  if (!evidence?.tuple_integrity) blockers.push(`installed_${runtime}_tuple_integrity_missing`);
  return blockers;
}

export function reconcileReleaseEvidence(evidence = {}) {
  const blockers = [];
  const installed = evidence.installed || {};
  for (const runtime of SUPPORTED_RUNTIMES) blockers.push(...runtimeBlockers(runtime, installed[runtime]));
  const required = [
    ['repository_tests', 'repository_tests_missing'],
    ['independent_evaluation', 'independent_evaluation_missing'],
    ['security', 'security_evidence_missing'],
    ['nyquist', 'nyquist_evidence_missing'],
    ['milestone_audit', 'milestone_audit_missing'],
    ['roadmap', 'roadmap_evidence_missing'],
    ['archive', 'archive_evidence_missing'],
    ['tag', 'tag_evidence_missing'],
  ];
  for (const [field, blocker] of required) if (evidence[field] !== true) blockers.push(blocker);
  for (const runtime of Array.isArray(evidence.unsupported) ? evidence.unsupported : []) {
    if (runtime?.recommendation_only !== true) blockers.push('unsupported_runtime_dispatchable');
  }
  const uniqueBlockers = [...new Set(blockers)].sort();
  return {
    schema_version: 1,
    policy_version: RELEASE_POLICY_VERSION,
    status: uniqueBlockers.length ? 'blocked' : 'ready',
    supported_runtimes: SUPPORTED_RUNTIMES,
    evidence_fingerprint: digest(evidence),
    blockers: uniqueBlockers,
    no_composite_score: true,
  };
}

export const V20_RELEASE_EVIDENCE_POLICY_VERSION = 'v2.0-release-evidence-v1';

/**
 * Reconcile v2.1 adaptive release evidence as independent fail-closed gates.
 * The input is a bounded projection from runtime/benchmark evidence; raw
 * prompts, outputs, and paths are deliberately ignored.
 */
export function reconcileAdaptiveReleaseEvidence(evidence = {}, limits = ADAPTIVE_RELEASE_LIMITS) {
  const maxLatency = Number.isSafeInteger(limits?.prompt_latency_ms)
    ? limits.prompt_latency_ms : ADAPTIVE_RELEASE_LIMITS.prompt_latency_ms;
  const maxContext = Number.isSafeInteger(limits?.context_bytes)
    ? limits.context_bytes : ADAPTIVE_RELEASE_LIMITS.context_bytes;
  const dimensions = {
    inventory: { pass: evidence.inventory_fresh === true, reason_code: 'stale_inventory' },
    selected_target: { pass: evidence.selected_target_available === true, reason_code: 'selected_target_unavailable' },
    required_evidence: { pass: evidence.required_evidence_active === true, reason_code: 'inactive_required_evidence' },
    privacy: { pass: evidence.privacy === true, reason_code: 'privacy_regression' },
    safety: { pass: evidence.safety === true, reason_code: 'safety_regression' },
    latency: { pass: Number.isFinite(evidence.prompt_latency_ms) && evidence.prompt_latency_ms <= maxLatency, reason_code: 'prompt_latency_regression' },
    context: { pass: Number.isSafeInteger(evidence.context_bytes) && evidence.context_bytes <= maxContext, reason_code: 'context_budget_regression' },
  };
  const blockers = Object.values(dimensions).filter(dimension => !dimension.pass).map(dimension => dimension.reason_code).sort();
  return {
    schema_version: 1,
    policy_version: ADAPTIVE_RELEASE_POLICY_VERSION,
    status: blockers.length ? 'blocked' : 'ready',
    dimensions,
    blockers,
    evidence_fingerprint: digest({
      policy_version: ADAPTIVE_RELEASE_POLICY_VERSION,
      dimensions: Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, value.pass])),
      limits: { prompt_latency_ms: maxLatency, context_bytes: maxContext },
    }),
    no_composite_score: true,
  };
}

/**
 * Reconcile workflow-specific release truth independently from the broader
 * installed-runtime/archive gate. No dimension can be hidden by a score.
 */
export function reconcileV20ReleaseEvidence(evidence = {}) {
  const blockers = [];
  const dimensions = {
    coverage: evidence.coverage_fresh === true,
    availability: evidence.expected_roles_available === true,
    browser_runtime: evidence.browser_required !== true || evidence.browser_runtime_evidence === true,
    prompt_privacy: evidence.prompt_privacy === true,
    safety: evidence.safety === true,
    latency: evidence.prompt_latency_pass === true
      && Number.isFinite(evidence.prompt_latency_ms)
      && evidence.prompt_latency_ms <= 100,
  };
  if (!dimensions.coverage) blockers.push('stale_coverage');
  if (!dimensions.availability) blockers.push('expected_roles_unavailable');
  if (!dimensions.browser_runtime) blockers.push('browser_runtime_evidence_missing');
  if (!dimensions.prompt_privacy) blockers.push('prompt_privacy_regression');
  if (!dimensions.safety) blockers.push('safety_regression');
  if (!dimensions.latency) blockers.push('prompt_latency_regression');
  return {
    schema_version: 1,
    policy_version: V20_RELEASE_EVIDENCE_POLICY_VERSION,
    status: blockers.length ? 'blocked' : 'ready',
    dimensions,
    blockers: [...new Set(blockers)].sort(),
    no_composite_score: true,
  };
}

/** Reconcile final autonomous-release evidence without hiding a failed dimension. */
export function reconcileAutonomousReleaseEvidence(evidence = {}) {
  const installed = evidence.installed || {};
  const adaptiveCount = Number.isSafeInteger(evidence.dispatchable_count) ? evidence.dispatchable_count : 0;
  const dimensions = {
    source_install_parity: { pass: evidence.source_install_parity === true, reason_code: 'source_install_parity_missing' },
    mapping: { pass: evidence.mapping === true, reason_code: 'mapping_evidence_missing' },
    feedback: { pass: evidence.feedback === true, reason_code: 'feedback_evidence_missing' },
    privacy: { pass: evidence.privacy === true, reason_code: 'privacy_evidence_missing' },
    safety: { pass: evidence.safety === true, reason_code: 'safety_evidence_missing' },
    token: { pass: evidence.token === true, reason_code: 'token_evidence_missing' },
    latency: { pass: evidence.latency === true, reason_code: 'latency_evidence_missing' },
    claude: { pass: installed.claude?.pass === true, reason_code: 'installed_claude_evidence_missing' },
    codex: { pass: installed.codex?.pass === true, reason_code: 'installed_codex_evidence_missing' },
    adaptive_release: {
      pass: adaptiveCount > 0 ? evidence.adaptive_release === true : evidence.direct_pass_through_usable === true,
      reason_code: adaptiveCount > 0 ? 'adaptive_release_evidence_missing' : 'safe_empty_direct_pass_through_missing',
    },
    repository: { pass: evidence.repository_tests === true && evidence.security === true && evidence.audit === true, reason_code: 'repository_release_evidence_missing' },
  };
  const blockers = Object.values(dimensions).filter(value => !value.pass).map(value => value.reason_code).sort();
  return {
    schema_version: 1,
    policy_version: AUTONOMOUS_RELEASE_POLICY_VERSION,
    status: blockers.length ? 'blocked' : 'ready',
    dimensions,
    blockers,
    dispatchable_count: adaptiveCount,
    direct_pass_through_usable: evidence.direct_pass_through_usable === true,
    evidence_fingerprint: digest(Object.fromEntries(Object.entries(dimensions).map(([key, value]) => [key, value.pass]))),
    no_composite_score: true,
  };
}
