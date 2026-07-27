// Phase 23: Approval gate — distinct from execute intent (EXEC-07).
// Plan 01 ships the safe-only path: needsApproval returns false for the
// safe fixture, so verifyApproval is not invoked on the tracer. The module
// is complete (bind/verify with stale/mismatch fail-closed) and Plan 03
// wires the destructive dispatch path.

import { createHash } from 'node:crypto';
import { contentFingerprint, stableCapabilityId } from '../registry/identity.mjs';
import { stableStringify } from '../registry/schema.mjs';
import { validateContractFieldValue } from '../registry/contract.mjs';

export const APPROVAL_POLICY_VERSION = 'approval-policy-v1';
export const APPROVAL_SCHEMA_VERSION = 1;

// Same token vocabulary as eligibility.mjs:165-175 — destructive/privileged
// surface requires a separately bound approval token.
const DESTRUCTIVE_SIDE_EFFECTS = new Set(['destructive', 'unbounded', 'external', 'privileged']);
const IRREVERSIBLE = new Set(['irreversible']);
const HIGH_RISK = new Set(['high', 'critical', 'unacceptable']);

function field(record, name) {
  return record?.contract?.fields?.[name];
}

function knownValue(record, name) {
  const envelope = field(record, name);
  if (!envelope || envelope.state !== 'known') return null;
  if (validateContractFieldValue(name, envelope.value)) return null;
  return envelope.value;
}

function tokenMatches(value, vocabulary) {
  const text = stableStringify(value).toLowerCase();
  return vocabulary.some(token => text.includes(token));
}

/**
 * Does this capability's contract surface declare destructive/privileged
 * effects that require a separately bound approval token? Reads only the
 * contract envelope (state=known gate) — does NOT re-check eligibility
 * (Anti-Pattern: re-checking eligibility drifts Phase 22 authority).
 */
export function needsApproval(contract) {
  const record = { contract };
  const sideEffects = knownValue(record, 'side_effects');
  if (sideEffects !== null && tokenMatches(sideEffects, [...DESTRUCTIVE_SIDE_EFFECTS])) {
    return true;
  }
  const reversibility = knownValue(record, 'reversibility');
  if (reversibility !== null && tokenMatches(reversibility, [...IRREVERSIBLE])) {
    return true;
  }
  const risk = knownValue(record, 'risk');
  if (risk !== null && tokenMatches(risk, [...HIGH_RISK])) {
    return true;
  }
  return false;
}

/**
 * Bind a capability+args+targets+effects+proposalVersion to an opaque
 * approval token via SHA-256 fingerprinting. Reuses contentFingerprint for
 * the capability leg (identity.mjs:37-51). Never hand-roll hashing (ASVS V6).
 */
export function bindApproval({ capability, args, targets, effects, proposalVersion } = {}) {
  if (!capability) throw new TypeError('bindApproval requires a capability');
  const capFingerprint = contentFingerprint(capability);
  const capId = (() => { try { return stableCapabilityId(capability); } catch { return ''; } })();
  const canonical = stableStringify({
    capability_fingerprint: capFingerprint,
    capability_id: capId,
    args: args ?? null,
    targets: Array.isArray(targets) ? [...targets].sort() : null,
    effects: effects ?? null,
    proposal_version: String(proposalVersion ?? ''),
  });
  const token = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return {
    schema_version: APPROVAL_SCHEMA_VERSION,
    policy_version: APPROVAL_POLICY_VERSION,
    token,
    capability_fingerprint: capFingerprint,
    capability_id: capId,
  };
}

// Strict extractor — `expected` is MANDATORY. Returns the token string when
// `expected` is a non-empty string or a { token: <non-empty string> } object,
// and null for any other shape (omitted, number, empty string, malformed
// object). The caller MUST treat null as fail-closed (CR-01): a missing or
// malformed `expected` disables staleness anchoring, so the gate cannot
// prove the bound token is fresh — it must block, never approve.
function requireExpectedToken(expected) {
  if (typeof expected === 'string' && expected.length > 0) return expected;
  if (expected && typeof expected === 'object'
      && typeof expected.token === 'string' && expected.token.length > 0) {
    return expected.token;
  }
  return null;
}

/**
 * Verify a presented approval token against the bound one. Fail-closed on
 * missing/stale/mismatch (RESEARCH Pattern 3). Returns a blocked shape on
 * any failure so the dispatcher gates destructive actions without exception.
 *
 * Three legs checked in order (EXEC-08):
 *   1. bound + presented must both carry a non-empty token (else approval_missing)
 *   2. `expected` MUST be supplied as a non-empty hex string or
 *      { token: <hex> } — it is re-derived via `bindApproval` over the
 *      CURRENT args/targets/effects/proposalVersion so the stale check is
 *      anchored to fresh state, not a cached value. A missing or malformed
 *      `expected` fails CLOSED with `approval_expected_missing` (CR-01):
 *      the gate cannot prove the bound token is fresh, so it must block.
 *      When `expected` is present, bound.token must equal it
 *      (else approval_stale — the bound token was minted against a prior
 *      proposal/args set)
 *   3. presented.token must equal bound.token (else approval_mismatch)
 */
export function verifyApproval({ bound, presented, expected } = {}) {
  if (!bound || typeof bound !== 'object') {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_missing' };
  }
  if (!presented || typeof presented !== 'object') {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_missing' };
  }
  if (typeof bound.token !== 'string' || !bound.token) {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_missing' };
  }
  if (typeof presented.token !== 'string' || !presented.token) {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_missing' };
  }
  const expectedToken = requireExpectedToken(expected);
  // CR-01: `expected` is mandatory. When it is absent or malformed the
  // staleness leg cannot be anchored to fresh state — fail CLOSED with a
  // distinct `approval_expected_missing` reason_code (never approve).
  if (expectedToken === null) {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_expected_missing' };
  }
  if (bound.token !== expectedToken) {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_stale' };
  }
  if (presented.token !== bound.token) {
    return { status: 'blocked', dispatch_eligible: false, reason_code: 'approval_mismatch' };
  }
  return {
    status: 'approved',
    dispatch_eligible: true,
    reason_code: 'approval_bound',
    token: bound.token,
  };
}