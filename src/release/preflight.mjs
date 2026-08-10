import { createHash } from 'node:crypto';

import { stableStringify } from '../registry/schema.mjs';

export const RELEASE_POLICY_VERSION = 'release-preflight-v1';
export const SUPPORTED_RUNTIMES = Object.freeze(['claude', 'codex']);

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
