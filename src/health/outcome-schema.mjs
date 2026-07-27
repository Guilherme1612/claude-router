// Phase 24 — Privacy-Safe Outcomes and Capability Health.
// Frozen outcome-record schema + envelope validator. The allowlist and the
// OUTCOME_KINDS enum are the persistence contract every later wave builds on.
//
// D-6 (name collision, RESEARCH Pitfall 2): the persisted field is
// `outcome_kind`, NEVER `outcome` — the v1 telemetry record already carries
// `outcome: null` and the rollback journal uses `outcome: 'completed'|
// 'not_committed'`. A bare `outcome` field in a Phase 24 record would collide
// silently with both.
//
// Analog: src/evolution/evidence.mjs lines 6-53 (FIELDS allowlist,
// validateEvidenceEnvelope, privacy_signature_forbidden). boundedToken is
// re-imported so path-escape defense stays shared, not redefined.

import { boundedToken } from '../evolution/evidence.mjs';

// PRIVACY_GUARDS is not exported by evidence.mjs; mirror the set verbatim so
// the privacy_signature_forbidden rule stays in lockstep with the evidence
// envelope. Guard codes that mark a record as privacy-denied (deny_filtered
// / secret_detected / content_detected / privacy_guard) force
// prompt_signature === null.
const PRIVACY_GUARDS = new Set(['privacy_guard', 'deny_filtered', 'secret_detected', 'content_detected']);

// Pitfall 3 guard: capability_id must never carry a framework prefix. gsd-,
// gstack-, codex- are the known prefixes; stableCapabilityId() is
// framework-neutral but a stale caller could still pass record.name here.
const FRAMEWORK_PREFIXES = Object.freeze(['gsd-', 'gstack-', 'codex-']);

// HLTH-04 allowlist. This set is final for v1 — adding a field later requires a
// policy_version bump and a migration (plan reversibility: costly).
export const OUTCOME_FIELDS = Object.freeze(new Set([
  'timestamp_ms', 'capability_id', 'outcome_kind', 'prompt_signature',
  'route_id', 'confidence_band', 'guard_codes', 'reason_code',
  'evidence_window_ms', 'sample_size', 'opportunity_count', 'freshness',
  'policy_version', 'fingerprint',
]));

// HLTH-03: the bounded outcome schema distinguishes exactly 9 dispositions.
export const OUTCOME_KINDS = Object.freeze(new Set([
  'selected', 'actually_used', 'completed', 'corrected', 'retried',
  'replaced', 'abandoned', 'overridden', 'helpful_reuse',
]));

// Named enum for callers that want a single import surface.
export const OUTCOME_KIND = Object.freeze({
  SELECTED: 'selected',
  ACTUALLY_USED: 'actually_used',
  COMPLETED: 'completed',
  CORRECTED: 'corrected',
  RETRIED: 'retried',
  REPLACED: 'replaced',
  ABANDONED: 'abandoned',
  OVERRIDDEN: 'overridden',
  HELPFUL_REUSE: 'helpful_reuse',
});

function deny(reason_code) {
  return { status: 'denied', reason_code };
}

function hasFrameworkPrefix(value) {
  return typeof value === 'string' && FRAMEWORK_PREFIXES.some((prefix) => value.startsWith(prefix));
}

// validateOutcomeEnvelope is the trust boundary between the observer and the
// persistent store (T-24-01). Every record crosses this boundary; any field
// not in OUTCOME_FIELDS is rejected with 'forbidden_outcome_field' BEFORE any
// disk write. Privacy-denied records (guard_codes intersect PRIVACY_GUARDS)
// must carry prompt_signature === null; non-denied records must carry a
// 64-hex-char sha256 prompt_signature.
export function validateOutcomeEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return deny('invalid_outcome_envelope');
  if (Object.keys(input).some((field) => !OUTCOME_FIELDS.has(field))) return deny('forbidden_outcome_field');
  if (!OUTCOME_KINDS.has(input.outcome_kind)) return deny('invalid_outcome_kind');
  if (!boundedToken(input.capability_id)) return deny('invalid_capability_id');
  if (hasFrameworkPrefix(input.capability_id)) return deny('invalid_capability_id');
  if (!boundedToken(input.route_id)) return deny('invalid_route_id');
  if (!Number.isSafeInteger(input.timestamp_ms) || input.timestamp_ms < 0) return deny('invalid_timestamp');
  if (!Array.isArray(input.guard_codes) || input.guard_codes.length > 16 || input.guard_codes.some((code) => !boundedToken(code, 64))) return deny('invalid_guard_codes');

  const privacyDenied = input.guard_codes.some((code) => PRIVACY_GUARDS.has(code));
  if (privacyDenied && input.prompt_signature !== null) return deny('privacy_signature_forbidden');
  if (!privacyDenied && !/^[a-f0-9]{64}$/.test(input.prompt_signature ?? '')) return deny('invalid_prompt_signature');

  return { status: 'accepted', signal: Object.freeze({ ...input, guard_codes: Object.freeze([...input.guard_codes]) }) };
}