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
  if (!evidence?.semantic_active) blockers.push(`installed_${runtime}_semantic_missing`);
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
