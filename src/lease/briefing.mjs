// src/lease/briefing.mjs — Phase 40, Plan 03 (LEASE-06).
//
// Continuity briefing composer. Pure w.r.t. its inputs (no fs/os import —
// every dependency arrives as the leaseStore argument); wrapped in a single
// try/catch so a store error never escapes and never blocks a prompt.
//
// LEASE-06 hard constraint (the operator-visible continuity contract):
//   - First Router visit is SILENT: a fingerprint with no lease record yields
//     null — no injection on a fresh project.
//   - A returning project (a fingerprint with at least one prior lease record)
//     receives AT MOST ONE evidence-backed briefing, and only when the lease
//     is active, non-expired, non-revoked, and fingerprint-matching.
//   - The eight invalid states — completed, blocked, expired, revoked,
//     corrupt, stale, unauthorized, foreign — NEVER auto-run and NEVER emit a
//     briefing; each maps to a distinct internal briefing_status but all
//     return null.
//   - The briefing references receipt IDs from last_safe_checkpoint so the
//     operator inspects via `router-control leases show <id>`; it never
//     inlines raw prompt text or full receipt bodies (CLAUDE.md <=120 token
//     injection constraint).
//
// composeBriefing only returns the structured payload — the caller (router
// startup path) renders the additionalContext string. No daemon, no
// subprocess (Out-of-Scope: independent autonomous daemon).

export const BRIEFING_POLICY_VERSION = 'briefing-policy-v1';

// The eight invalid continuity states. Each maps to a distinct internal
// briefing_status for telemetry/diagnostics, but ALL return null (no
// injection, no auto-run). Object.freeze so the set cannot be mutated at
// runtime (T-40-09 tampering mitigation).
const INVALID = Object.freeze(['completed', 'blocked', 'expired', 'revoked', 'corrupt', 'stale', 'unauthorized', 'foreign']);
const INVALID_SET = new Set(INVALID);

/**
 * Compose the continuity briefing for a project fingerprint.
 *
 * @param {object} args
 * @param {string} args.projectFingerprint — the six-axis lease fingerprint.
 * @param {object} args.leaseStore — a createLeaseStore() surface (read-only
 *   use of findByFingerprint + isExpired).
 * @param {number} [args.now] — injection point for the clock (tests).
 * @returns {{
 *   briefing: true, lease_id: string, evidence: object|null,
 *   briefing_status: 'active', policy_version: string
 * } | null} — null on first visit, every invalid state, and any throw.
 */
export function composeBriefing({ projectFingerprint, leaseStore, now = Date.now() } = {}) {
  try {
    if (!projectFingerprint || !leaseStore) return null;
    const lease = leaseStore.findByFingerprint(projectFingerprint);
    // First Router visit: no lease record for this fingerprint → silent.
    // A "returning project" is a fingerprint with at least one prior lease
    // record; the absence of any lease record IS the first visit (not the
    // absence of any Router activity).
    if (!lease) return null;

    // Derive the internal briefing_status. Each of the eight invalid states
    // maps to a distinct status string (for telemetry) but all return null.
    let briefing_status;
    if (INVALID_SET.has(lease.status)) {
      briefing_status = lease.status;
    } else if (leaseStore.isExpired(lease, now)) {
      briefing_status = 'expired';
    } else if (!lease.freshness_evidence || lease.freshness_evidence.fingerprint_match !== true) {
      briefing_status = 'foreign';
    } else {
      briefing_status = 'active';
    }

    // Only an active, non-expired, non-revoked, fingerprint-matching lease
    // produces a briefing. Everything else is silent (no auto-run).
    if (briefing_status !== 'active') return null;

    // The evidence references receipt IDs from last_safe_checkpoint so the
    // operator inspects via `router-control leases show <id>`. Never inline
    // raw prompt text or full receipt bodies.
    return {
      briefing: true,
      lease_id: lease.lease_id,
      evidence: lease.last_safe_checkpoint,
      briefing_status: 'active',
      policy_version: BRIEFING_POLICY_VERSION,
    };
  } catch {
    // Fail-open: a briefing-store error never blocks a prompt. The operator
    // still has the CLI (`router-control leases`) for out-of-band inspection.
    return null;
  }
}

export { INVALID as BRIEFING_INVALID_STATES };