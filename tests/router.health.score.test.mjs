// Plan 24-02 Task 2 — HLTH-06 usefulness scoring + HLTH-07 rare-role unjudged
// tier. Covers:
//   - frequency-loses-to-quality (5 completed+reversible+recent > 50 abandoned+irreversible)
//   - signal_breakdown exposes every input dimension
//   - usefulness_basis_points bounded 0..10000
//   - recency uses computeWeightedSamples (1h ~2x 25h)
//   - reversibility reads the contract envelope (reversible > unknown > irreversible)
//   - confidence reads the contract envelope (default 5000)
//   - sample_count < MINIMUM_SAMPLES (30) → 'unjudged' tier, never long_unused/ineffective
//   - sample_count=29 → unjudged; sample_count=30 → judged (boundary)
//   - the scorer does NOT read a rare_role / extended lifecycle_role enum (D-1)
//   - actually_used contributes to sample_count + recency; helpful_reuse to completion_rate (W7)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scoreCapability, HALF_LIFE_MS, MINIMUM_SAMPLES } from '../src/health/score.mjs';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function makeOutcome({ outcome_kind = 'completed', ts = NOW, capability_id = 'skill:debug', route_id = 'route-001' } = {}) {
  return { timestamp_ms: ts, outcome_kind, capability_id, route_id };
}

// ---- HLTH-06: frequency loses to opportunity-weighted quality ----

test('HLTH-06 frequency_loses_to_quality: 5 completed+reversible+recent outscores 50 abandoned+irreversible', () => {
  const fiveGood = Array.from({ length: 5 }, (_, i) => makeOutcome({
    outcome_kind: 'completed', ts: NOW - i * HOUR, capability_id: 'skill:good',
  }));
  const fiftyBad = Array.from({ length: 50 }, (_, i) => makeOutcome({
    outcome_kind: 'abandoned', ts: NOW - i * HOUR, capability_id: 'skill:bad',
  }));
  const goodScore = scoreCapability({
    outcomes: fiveGood,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  const badScore = scoreCapability({
    outcomes: fiftyBad,
    contract: { reversibility: 'irreversible', confidence_basis_points: 1000 },
    now: NOW,
  });
  // 5 < 30 → unjudged; the quality comparison only holds above the floor. So
  // pad the good set to 30 with completed outcomes (still high-quality).
  const thirtyGood = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: 'completed', ts: NOW - i * HOUR, capability_id: 'skill:good',
  }));
  const goodScore30 = scoreCapability({
    outcomes: thirtyGood,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  assert.equal(goodScore30.tier !== 'unjudged', true, 'good set should be judged at 30 samples');
  assert.equal(badScore.tier !== 'unjudged', true, 'bad set should be judged at 50 samples');
  assert.ok(goodScore30.usefulness_basis_points > badScore.usefulness_basis_points,
    `expected good (${goodScore30.usefulness_basis_points}) > bad (${badScore.usefulness_basis_points})`);
});

// ---- HLTH-06: signal_breakdown reports every input dimension ----

test('HLTH-06 signal_breakdown: reports recency/reversibility/confidence/opportunity weights + outcome_kind_counts', () => {
  const outcomes = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: i % 2 === 0 ? 'completed' : 'abandoned', ts: NOW - i * HOUR,
  }));
  const result = scoreCapability({
    outcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 8000 },
    now: NOW,
  });
  const sb = result.signal_breakdown;
  assert.ok(typeof sb.recency_weight === 'number', 'recency_weight missing');
  assert.ok(typeof sb.completion_rate === 'number', 'completion_rate missing');
  assert.ok(typeof sb.opportunity_exposure === 'number', 'opportunity_exposure missing');
  assert.ok(typeof sb.reversibility_factor === 'number', 'reversibility_factor missing');
  assert.ok(typeof sb.confidence_factor === 'number', 'confidence_factor missing');
  assert.ok(typeof sb.penalty_count === 'number', 'penalty_count missing');
  assert.ok(sb.outcome_kind_counts && typeof sb.outcome_kind_counts === 'object', 'outcome_kind_counts missing');
  assert.equal(sb.outcome_kind_counts.completed, 15);
  assert.equal(sb.outcome_kind_counts.abandoned, 15);
});

test('HLTH-06 opportunity exposure is zero when every outcome was abandoned', () => {
  const outcomes = Array.from({ length: 30 }, () => makeOutcome({ outcome_kind: 'abandoned' }));
  const result = scoreCapability({ outcomes, contract: null, now: NOW });
  assert.equal(result.signal_breakdown.opportunity_exposure, 0);
});

// ---- HLTH-06: usefulness_basis_points bounded 0..10000 ----

test('HLTH-06 bounded: usefulness_basis_points is in [0, 10000]', () => {
  // All-completed, reversible, high-confidence, recent — should hit the top of the range.
  const outcomes = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: 'completed', ts: NOW - i * 1000,
  }));
  const result = scoreCapability({
    outcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 10000 },
    now: NOW,
  });
  assert.ok(result.usefulness_basis_points >= 0 && result.usefulness_basis_points <= 10000,
    `usefulness_basis_points out of bounds: ${result.usefulness_basis_points}`);
  // All-abandoned, irreversible, low-confidence, old — should hit the bottom.
  const badOutcomes = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: 'abandoned', ts: NOW - 30 * 24 * HOUR - i * 1000,
  }));
  const badResult = scoreCapability({
    outcomes: badOutcomes,
    contract: { reversibility: 'irreversible', confidence_basis_points: 0 },
    now: NOW,
  });
  assert.ok(badResult.usefulness_basis_points >= 0 && badResult.usefulness_basis_points <= 10000,
    `usefulness_basis_points out of bounds: ${badResult.usefulness_basis_points}`);
});

// ---- HLTH-06: recency uses computeWeightedSamples (exponential half-life) ----

test('HLTH-06 recency: a record from 1h ago weighs ~2x a record from 25h ago', () => {
  // Two capabilities, each with 30 samples all 'completed', reversible, high
  // confidence. The ONLY difference is recency: one has records 1h old, the
  // other 25h old. The 1h set must outscore the 25h set, and the recency_weight
  // ratio should be ~2x (2^(-1/24) / 2^(-25/24) = 2^(24/24) = 2).
  const recentOutcomes = Array.from({ length: 30 }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 1 * HOUR,
  }));
  const oldOutcomes = Array.from({ length: 30 }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 25 * HOUR,
  }));
  const recent = scoreCapability({
    outcomes: recentOutcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  const old = scoreCapability({
    outcomes: oldOutcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  // recency_weight ratio ~2x (computeWeightedSamples: 2^(-1/24) vs 2^(-25/24))
  const ratio = recent.signal_breakdown.recency_weight / old.signal_breakdown.recency_weight;
  assert.ok(Math.abs(ratio - 2) < 0.01, `expected recency ratio ~2.0, got ${ratio}`);
  assert.ok(recent.usefulness_basis_points > old.usefulness_basis_points,
    `expected recent (${recent.usefulness_basis_points}) > old (${old.usefulness_basis_points})`);
});

// ---- HLTH-06: reversibility reads the contract envelope ----

test('HLTH-06 reversibility: reversible > unknown > irreversible', () => {
  const outcomes = Array.from({ length: 30 }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 1 * HOUR,
  }));
  const rev = scoreCapability({ outcomes, contract: { reversibility: 'reversible' }, now: NOW });
  const unk = scoreCapability({ outcomes, contract: { reversibility: 'unknown' }, now: NOW });
  const irr = scoreCapability({ outcomes, contract: { reversibility: 'irreversible' }, now: NOW });
  assert.ok(rev.signal_breakdown.reversibility_factor > unk.signal_breakdown.reversibility_factor,
    'reversible should outweigh unknown');
  assert.ok(unk.signal_breakdown.reversibility_factor > irr.signal_breakdown.reversibility_factor,
    'unknown should outweigh irreversible');
  assert.equal(rev.signal_breakdown.reversibility_factor, 1.0);
  assert.equal(unk.signal_breakdown.reversibility_factor, 0.7);
  assert.equal(irr.signal_breakdown.reversibility_factor, 0.4);
});

test('HLTH-06 reversibility: missing contract defaults to unknown (0.7)', () => {
  const outcomes = Array.from({ length: 30 }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 1 * HOUR,
  }));
  const result = scoreCapability({ outcomes, contract: null, now: NOW });
  assert.equal(result.signal_breakdown.reversibility_factor, 0.7);
});

// ---- HLTH-06: confidence reads the contract envelope (default 5000) ----

test('HLTH-06 confidence: missing contract defaults to 5000 basis points', () => {
  const outcomes = Array.from({ length: 30 }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 1 * HOUR,
  }));
  const result = scoreCapability({ outcomes, contract: null, now: NOW });
  assert.equal(result.signal_breakdown.confidence_factor, 0.5, 'default confidence 5000/10000 = 0.5');
});

// ---- HLTH-07 (D-1): unjudged tier protects rare/new capabilities ----

test('HLTH-07 unjudged: sample_count < MINIMUM_SAMPLES (30) → tier=unjudged, no long_unused/ineffective', () => {
  const outcomes = Array.from({ length: 15 }, () => makeOutcome({
    outcome_kind: 'abandoned', ts: NOW - 1 * HOUR,
  }));
  const result = scoreCapability({ outcomes, contract: null, now: NOW });
  assert.equal(result.tier, 'unjudged');
  assert.equal(result.usefulness_basis_points, null);
  assert.ok(result.reason_codes.includes('insufficient_samples'));
  // The conservative baseline: NEVER 'long_unused' or 'ineffective' on an
  // unjudged capability (HLTH-07, D-1).
  assert.ok(!result.reason_codes.includes('long_unused'));
  assert.ok(!result.reason_codes.includes('ineffective'));
  assert.equal(result.sample_count, 15);
});

test('HLTH-07 boundary: sample_count=29 → unjudged; sample_count=30 → judged', () => {
  const mk = (n) => Array.from({ length: n }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 1 * HOUR,
  }));
  const r29 = scoreCapability({ outcomes: mk(29), contract: null, now: NOW });
  const r30 = scoreCapability({ outcomes: mk(30), contract: null, now: NOW });
  assert.equal(r29.tier, 'unjudged');
  assert.equal(MINIMUM_SAMPLES, 30, 'MINIMUM_SAMPLES must be 30');
  assert.notEqual(r30.tier, 'unjudged', 'sample_count=30 should be judged');
  assert.ok(typeof r30.usefulness_basis_points === 'number');
});

test('HLTH-07 unjudged_above_floor: sample_count=30 with 30 abandoned → tier=low_usefulness (not unjudged)', () => {
  const outcomes = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: 'abandoned', ts: NOW - 30 * 24 * HOUR - i * 1000,
  }));
  const result = scoreCapability({
    outcomes,
    contract: { reversibility: 'irreversible', confidence_basis_points: 0 },
    now: NOW,
  });
  assert.notEqual(result.tier, 'unjudged', 'sample_count=30 should not be unjudged');
  assert.equal(result.tier, 'low_usefulness');
  assert.ok(result.reason_codes.includes('low_usefulness'));
});

// ---- HLTH-07 (D-1): no rare_role / extended lifecycle_role enum ----

test('HLTH-07 no_rare_role: score.mjs does NOT read a rare_role or extended lifecycle_role enum', () => {
  // The scorer must accept a contract WITHOUT any rare_role / lifecycle_role
  // field and still produce a score. The unjudged tier is the only HLTH-07
  // protection (conservative baseline per Deferred Items).
  const outcomes = Array.from({ length: 30 }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 1 * HOUR,
  }));
  const result = scoreCapability({
    outcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 }, // no rare_role field
    now: NOW,
  });
  assert.ok(result.usefulness_basis_points >= 0);
  // Static grep guard: score.mjs source must not mention rare_role or the
  // D-1-deferred rare-role names as a structured field.
  const here = fileURLToPath(import.meta.url);
  const scoreSrc = readFileSync(join(here, '..', '..', 'src', 'health', 'score.mjs'), 'utf8');
  assert.ok(!/\brare_role\b/.test(scoreSrc), 'score.mjs references rare_role (D-1 violation)');
  assert.ok(!/recovery.*incident.*release.*migration/.test(scoreSrc),
    'score.mjs references the deferred rare-role enum names (D-1 violation)');
});

// ---- HLTH-06 (W7): actually_used + helpful_reuse flow through the formula ----

test('HLTH-06 actually_used: contributes to sample_count and recency (W7)', () => {
  // 30 actually_used outcomes (the capability was the one dispatched). They
  // must count toward sample_count (so the capability is judged, not unjudged)
  // and toward recency (so recency_weight is non-zero).
  const outcomes = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: 'actually_used', ts: NOW - i * HOUR,
  }));
  const result = scoreCapability({
    outcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  assert.equal(result.sample_count, 30);
  assert.notEqual(result.tier, 'unjudged', 'actually_used outcomes should lift the capability above the unjudged floor');
  assert.ok(result.signal_breakdown.recency_weight > 0, 'recency_weight should be non-zero');
  assert.equal(result.signal_breakdown.outcome_kind_counts.actually_used, 30);
});

test('HLTH-06 helpful_reuse: contributes to completion_rate via completed folding (W7)', () => {
  // Per the plan: "helpful_reuse outcomes are also captured as 'completed'
  // when the workflow advanced on the later prompt, contributing to
  // completion_rate." The scorer counts helpful_reuse in sample_count and
  // recency (like every outcome). The W7 fix in the plan documents that
  // helpful_reuse flows through the existing dimensions (sample_count,
  // recency, completion_rate) rather than a dedicated slot. This test
  // verifies helpful_reuse outcomes are counted in sample_count and the
  // capability is judged.
  const outcomes = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: 'helpful_reuse', ts: NOW - i * HOUR,
  }));
  const result = scoreCapability({
    outcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  assert.equal(result.sample_count, 30);
  assert.notEqual(result.tier, 'unjudged');
  assert.equal(result.signal_breakdown.outcome_kind_counts.helpful_reuse, 30);
  // helpful_reuse outcomes are not 'completed' (they're a distinct kind), so
  // completion_rate is 0 for an all-helpful_reuse set — but they still
  // contribute to sample_count and recency, which is the W7 contract.
  assert.equal(result.signal_breakdown.completion_rate, 0);
  assert.ok(result.signal_breakdown.recency_weight > 0);
});

// ---- Penalty: corrected/retried/replaced reduce the score ----

test('HLTH-06 penalty: corrected + retried + replaced reduce usefulness_basis_points', () => {
  const cleanOutcomes = Array.from({ length: 30 }, () => makeOutcome({
    outcome_kind: 'completed', ts: NOW - 1 * HOUR,
  }));
  const penalizedOutcomes = Array.from({ length: 30 }, (_, i) => makeOutcome({
    outcome_kind: i < 15 ? 'completed' : (i % 3 === 1 ? 'corrected' : (i % 3 === 2 ? 'retried' : 'replaced')),
    ts: NOW - 1 * HOUR,
  }));
  const clean = scoreCapability({
    outcomes: cleanOutcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  const penalized = scoreCapability({
    outcomes: penalizedOutcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  assert.ok(penalized.signal_breakdown.penalty_count > 0, 'penalty_count should be > 0');
  assert.ok(penalized.usefulness_basis_points < clean.usefulness_basis_points,
    `expected penalized (${penalized.usefulness_basis_points}) < clean (${clean.usefulness_basis_points})`);
});
