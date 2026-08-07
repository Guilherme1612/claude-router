// src/lease/policy.mjs — Phase 40, Plan 01 (LEASE-02).
//
// Creation gate + 9-field lease record builder. Pure functions: no fs, no
// os, no I/O, no spawn. Imports the frozen authority vocabulary
// (AUTHORITY_CLASSES) from ../intent/authority.mjs — does NOT redefine the
// enum or PERSISTENT_GOAL_MARKERS (frozen-vocabulary rule).
//
// Privacy contract (Pitfall 5, T-40-02): the `goal` field is a short
// structured OPERATOR-DECLARED label (e.g. 'ship-router-v1'), NEVER the raw
// prompt. buildLeaseRecord does not hash a prompt-derived field because no
// prompt-derived field is stored. If a future field ever needs prompt
// provenance, it MUST use hashPromptDerived (redact-then-hash) from
// ../adapters/dispatch/receipt.mjs — never the raw prompt string.

import { AUTHORITY_CLASSES } from '../intent/authority.mjs';

// Re-export so callers that want the sealed vocabulary can import it from the
// lease module surface without reaching into intent/authority.mjs. Same
// frozen array reference, not a copy.
export { AUTHORITY_CLASSES };

export const LEASE_POLICY_VERSION = 'lease-policy-v1';

const AUTHORITY_CLASS_SET = new Set(AUTHORITY_CLASSES);

/**
 * LEASE-02 creation gate. Returns true ONLY when:
 *   authority_class === 'persistent_goal_action' AND explicitInstruction === true.
 * All other classes (advice, inspection, one_turn_action,
 * non_authorizing_discussion) and explicitInstruction:false → false. Unknown
 * authority_class → false (fail-closed gate, T-40-04 elevation-of-privilege
 * mitigation). Pure function.
 */
export function shouldCreateLease({ authority_class, explicitInstruction } = {}) {
  if (!AUTHORITY_CLASS_SET.has(authority_class)) return false;
  if (authority_class !== 'persistent_goal_action') return false;
  return explicitInstruction === true;
}

/**
 * LEASE-03 record builder. Assembles the full lease record with EXACTLY the
 * schema keys in declaration order. Pure function — receives every field as
 * an argument; does not read the clock (freshness_evidence.lease_mtime_ms is
 * Date.now() at build time and is the only non-deterministic field).
 *
 * The 9 inspection fields (in order):
 *   goal, scope, allowed_effects, confirmation_effects, resource_bounds,
 *   status, expiry, authority_source, last_safe_checkpoint,
 *   freshness_evidence
 *
 * `goal` is a short structured operator-declared label, NOT raw prompt text.
 * Prompt-derived fields, if ever needed, MUST use hashPromptDerived from
 * receipt.mjs (redact-then-hash) — never the raw prompt string.
 */
export function buildLeaseRecord({
  fingerprint,
  goal,
  scope,
  allowedEffects,
  confirmationEffects,
  resourceBounds,
  expiryMs,
  authoritySource,
  checkpoint,
} = {}) {
  return {
    schema_version: 1,
    policy_version: LEASE_POLICY_VERSION,
    lease_id: fingerprint,
    project_fingerprint: fingerprint,
    goal,
    scope: {
      repo: scope && scope.repo,
      worktree: scope && scope.worktree,
      runtime: scope && scope.runtime,
      schema_generation: scope && scope.schema_generation,
    },
    allowed_effects: Array.isArray(allowedEffects) ? [...allowedEffects] : [],
    confirmation_effects: Array.isArray(confirmationEffects) ? [...confirmationEffects] : [],
    resource_bounds: {
      max_wall_ms: resourceBounds && resourceBounds.max_wall_ms,
      max_invocations: resourceBounds && resourceBounds.max_invocations,
      max_tokens: resourceBounds && resourceBounds.max_tokens,
    },
    status: 'active',
    expiry: { deterministic_at_ms: expiryMs, tz: 'UTC' },
    authority_source: {
      kind: authoritySource && authoritySource.kind,
      instruction: authoritySource && authoritySource.instruction,
      class: authoritySource && authoritySource.class,
    },
    last_safe_checkpoint: checkpoint && checkpoint.receipt_id
      ? {
          receipt_id: checkpoint.receipt_id,
          action_id: checkpoint.action_id,
          state: checkpoint.state,
          at_ms: checkpoint.at_ms,
        }
      : null,
    freshness_evidence: {
      lease_mtime_ms: Date.now(),
      fingerprint_match: true,
    },
    claimed_actions: [],
  };
}