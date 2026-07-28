// Phase 24 — Per-capability usefulness scorer (HLTH-06, HLTH-07).
//
// scoreCapability weights recency (exponential half-life), reversibility,
// confidence, and opportunity exposure — NOT frequency alone. A capability
// invoked once with high completion + high reversibility outscores one invoked
// 100 times with all 'abandoned' (HLTH-06).
//
// HLTH-07 (D-1 conservative baseline): a capability with sample_count <
// MINIMUM_SAMPLES (30, imported from evidence.mjs) is classified 'unjudged' and
// never receives a 'long_unused' or 'ineffective' reason_code. Phase 24 does
// NOT read any structured role enum beyond what the contract envelope already
// exposes — the unjudged tier is the only HLTH-07 protection. Deeper
// classification of uncommon capability roles is deferred to a future
// contracts phase per the CONTEXT.md Deferred Items table.
//
// Reuse — do NOT redefine (RESEARCH "Don't Hand-Roll"): HALF_LIFE_MS,
// MINIMUM_SAMPLES, computeWeightedSamples come from src/evolution/evidence.mjs.
//
// D-6: the persisted field is `outcome_kind`, never `outcome`.
//
// This module NEVER runs on the UserPromptSubmit hot path — it is called only
// by the off-hot-path observer / admin inspect / Phase 25 suggestion surface.
// It NEVER reads record.name or a framework-specific field; capability_id is
// the stable local id (Plan 24-01 invariant).

import { computeWeightedSamples } from '../evolution/evidence.mjs';
import {
  HALF_LIFE_MS,
  MINIMUM_SAMPLES,
  VERSIONED_WEIGHTS,
  TIER_BOUNDARIES,
} from './thresholds.mjs';

export { HALF_LIFE_MS, MINIMUM_SAMPLES };

// The 5 score weights + tier boundaries are versioned in thresholds.mjs
// (POLICY_VERSION='health-policy-v1', HLTH-11). Plan 24-04 moved the inline
// constants here; the scorer is unchanged behaviorally. Value changes flow
// through the canary bridge (src/health/canary-bridge.mjs), not by direct edit.
const DEFAULT_WEIGHTS = VERSIONED_WEIGHTS;

const REVERSIBILITY_FACTOR = Object.freeze({
  reversible: 1.0,
  unknown: 0.7,
  irreversible: 0.4,
});

const DEFAULT_CONFIDENCE_BASIS_POINTS = 5000;

// readReversibility — read the contract envelope's reversibility field. The
// contract envelope (src/registry/contract.mjs buildCapabilityContract output)
// stores it at contract.fields.reversibility.value (when state='known'). A
// simplified projection ({ reversibility: 'reversible' }) is also accepted for
// test ergonomics. A missing or unknown contract defaults to 'unknown'.
function readReversibility(contract) {
  if (!contract) return 'unknown';
  if (typeof contract.reversibility === 'string') {
    return REVERSIBILITY_FACTOR[contract.reversibility] !== undefined ? contract.reversibility : 'unknown';
  }
  const field = contract && contract.fields ? contract.fields.reversibility : null;
  if (field && field.state === 'known' && typeof field.value === 'string'
      && REVERSIBILITY_FACTOR[field.value] !== undefined) {
    return field.value;
  }
  return 'unknown';
}

// readConfidence — read the contract envelope's confidence_basis_points (bounded
// 0..10000). A simplified projection ({ confidence_basis_points: 9000 }) is
// accepted; otherwise the reversibility field's per-field confidence is used;
// a missing contract defaults to 5000.
function readConfidence(contract) {
  if (!contract) return DEFAULT_CONFIDENCE_BASIS_POINTS;
  if (Number.isInteger(contract.confidence_basis_points)) {
    return Math.max(0, Math.min(10000, contract.confidence_basis_points));
  }
  const field = contract && contract.fields ? contract.fields.reversibility : null;
  if (field && Number.isInteger(field.confidence_basis_points)) {
    return Math.max(0, Math.min(10000, field.confidence_basis_points));
  }
  return DEFAULT_CONFIDENCE_BASIS_POINTS;
}

function countKinds(outcomes) {
  const counts = {};
  for (const o of outcomes) {
    if (!o || typeof o !== 'object') continue;
    const k = o.outcome_kind;
    if (typeof k === 'string') counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

// scoreCapability — HLTH-06/07. Returns {
//   capability_id, usefulness_basis_points, tier, sample_count,
//   signal_breakdown, reason_codes }.
//
// outcomes: array of persisted outcome records for one capability_id (shape
//   from validateOutcomeEnvelope's accepted.signal — must carry timestamp_ms
//   and outcome_kind).
// contract: the contract envelope (src/registry/contract.mjs
//   buildCapabilityContract output) for that capability, or null/undefined if
//   no contract is available (defaults conservatively).
// now: ms epoch; defaults to Date.now().
export function scoreCapability({ outcomes, contract, now = Date.now() } = {}) {
  if (!Array.isArray(outcomes)) throw new TypeError('outcomes must be an array');
  if (!Number.isSafeInteger(now)) throw new TypeError('now must be an integer ms epoch');

  const sample_count = outcomes.length;
  const outcome_kind_counts = countKinds(outcomes);

  // HLTH-07 (D-1): below the sample floor → 'unjudged'. Never attach
  // 'long_unused' or 'ineffective' — the conservative baseline defers deeper
  // rare-role classification to a future contracts phase.
  if (sample_count < MINIMUM_SAMPLES) {
    const capability_id = deriveCapabilityId(outcomes, contract);
    return {
      capability_id,
      usefulness_basis_points: null,
      tier: 'unjudged',
      sample_count,
      signal_breakdown: { outcome_kind_counts },
      reason_codes: ['insufficient_samples'],
    };
  }

  // Recency — exponential half-life via the shared computeWeightedSamples
  // (RESEARCH "Don't Hand-Roll"). The function expects records shaped like
  // { signal: { timestamp_ms } }; we adapt our persisted outcome shape.
  const observations = outcomes.map((o) => ({ signal: { timestamp_ms: o.timestamp_ms } }));
  const weighted_samples = computeWeightedSamples(observations, { now, halfLifeMs: HALF_LIFE_MS });
  const recency_weight = weighted_samples / sample_count;

  const completion_rate = (outcome_kind_counts.completed || 0) / sample_count;

  // Opportunity exposure — what fraction of opportunities this capability
  // actually addressed (vs. abandoned or overridden). actually_used and
  // helpful_reuse fold into sample_count (they ARE evidence the capability was
  // dispatched), so they do not appear in the denominator's "missed" bucket.
  const abandoned_count = outcome_kind_counts.abandoned || 0;
  const overridden_count = outcome_kind_counts.overridden || 0;
  const opportunity_exposure = sample_count / (sample_count + abandoned_count + overridden_count);

  const reversibility_value = readReversibility(contract);
  const reversibility_factor = REVERSIBILITY_FACTOR[reversibility_value];
  const confidence_basis_points = readConfidence(contract);
  const confidence_factor = confidence_basis_points / 10000;

  // Penalty — failure-driven outcomes reduce the score (corrected/retried/
  // replaced). Bounded by sample_count so penalty/sample_count ∈ [0, 1].
  const penalty = (outcome_kind_counts.corrected || 0)
    + (outcome_kind_counts.retried || 0)
    + (outcome_kind_counts.replaced || 0);

  const w = DEFAULT_WEIGHTS;
  const composite = (w.recency * recency_weight)
    + (w.completion * completion_rate)
    + (w.opportunity * opportunity_exposure)
    + (w.reversibility * reversibility_factor)
    + (w.confidence * confidence_factor);
  const penaltyFactor = 1 - (penalty / sample_count);
  const raw = composite * penaltyFactor;
  const usefulness_basis_points = Math.max(0, Math.min(10000, Math.round(10000 * raw)));

  // Tier mapping (versioned, canary-guarded in Wave 4). 'unjudged' short-
  // circuits before this mapping.
  let tier;
  const reason_codes = [];
  if (usefulness_basis_points >= TIER_BOUNDARIES.high) tier = 'high';
  else if (usefulness_basis_points >= TIER_BOUNDARIES.medium) tier = 'medium';
  else if (usefulness_basis_points >= TIER_BOUNDARIES.low) tier = 'low';
  else { tier = 'low_usefulness'; reason_codes.push('low_usefulness'); }

  return {
    capability_id: deriveCapabilityId(outcomes, contract),
    usefulness_basis_points,
    tier,
    sample_count,
    signal_breakdown: {
      recency_weight,
      completion_rate,
      opportunity_exposure,
      reversibility_factor,
      confidence_factor,
      penalty_count: penalty,
      outcome_kind_counts,
    },
    reason_codes,
  };
}

// deriveCapabilityId — the stable local id. All outcomes for one capability
// share the id; fall back to a contract-provided id if outcomes is empty.
// Never reads record.name.
function deriveCapabilityId(outcomes, contract) {
  for (const o of outcomes) {
    if (o && typeof o === 'object' && typeof o.capability_id === 'string') return o.capability_id;
  }
  if (contract && typeof contract.capability_id === 'string') return contract.capability_id;
  return null;
}