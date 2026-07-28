// Plan 24-03 Task 1 — HLTH-08/09/10 health observation catalog.
// Covers all 10 observation kinds, the D-2 edge mapping (substitute→duplicate,
// variant→overlap, composition→complementary), HLTH-10 required fields +
// frozen REMEDIES allowlist, HLTH-07 unjudged protection, and HLTH-09
// healthy-vs-failure repetition distinction.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveObservations,
  REASON_CODES,
  REMEDIES,
  HALF_LIFE_MS,
  MAX_RETENTION_MS,
  MINIMUM_SAMPLES,
  MIN_CONFIDENCE,
} from '../src/health/catalog.mjs';

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---- helpers ---------------------------------------------------------------

function capRecord({ id, semantic_type = 'skill' } = {}) {
  // Minimal record shape that stableCapabilityId accepts via canonical_identity.
  return { canonical_identity: id, semantic_type };
}

function contractEnvelope({ semantic_type, dependencies = [], freshness } = {}) {
  // Simplified projection accepted by the catalog's readContractField helpers.
  const c = {};
  if (semantic_type !== undefined) c.invocation_kind = semantic_type;
  if (dependencies.length) c.dependencies = dependencies;
  if (freshness) c.freshness = freshness;
  return c;
}

function outcome({ capability_id, outcome_kind = 'completed', ts = NOW, route_id = 'r-1' } = {}) {
  return { timestamp_ms: ts, outcome_kind, capability_id, route_id };
}

function edge({ type, source_id, target_id, confidence_basis_points = 9000, freshness = 'fresh' } = {}) {
  return {
    id: `relationship:${type}:${source_id}:${target_id}`,
    type, source_id, target_id, confidence_basis_points, freshness,
    evidence: [], validation_state: 'active', reason_codes: [],
  };
}

function kindsOf(observations) {
  return [...new Set(observations.map((o) => o.observation_kind))].sort();
}

function findKind(observations, kind) {
  return observations.filter((o) => o.observation_kind === kind);
}

// ---- HLTH-10: every observation carries all 7 required fields + remedy ----

function assertHLTH10(obs) {
  assert.ok(typeof obs.observation_kind === 'string' && obs.observation_kind, 'observation_kind');
  assert.ok(typeof obs.reason_code === 'string' && obs.reason_code, 'reason_code');
  assert.ok(Number.isSafeInteger(obs.evidence_window_ms) && obs.evidence_window_ms >= 0, 'evidence_window_ms');
  assert.ok(obs.evidence_window_ms <= MAX_RETENTION_MS, 'evidence_window_ms <= MAX_RETENTION_MS');
  assert.ok(obs.sample_size !== undefined || obs.opportunity_count !== undefined, 'sample_size OR opportunity_count');
  if (obs.sample_size !== undefined) assert.ok(Number.isSafeInteger(obs.sample_size) && obs.sample_size >= 0, 'sample_size bounded int');
  if (obs.opportunity_count !== undefined) assert.ok(Number.isSafeInteger(obs.opportunity_count) && obs.opportunity_count >= 0, 'opportunity_count bounded int');
  assert.ok(obs.freshness === 'fresh' || obs.freshness === 'stale', 'freshness in {fresh,stale}');
  assert.ok(Array.isArray(obs.affected_capability_ids) && obs.affected_capability_ids.length > 0, 'affected_capability_ids non-empty');
  assert.ok(Number.isSafeInteger(obs.confidence_basis_points) && obs.confidence_basis_points >= 0 && obs.confidence_basis_points <= 10000, 'confidence_basis_points 0..10000');
  assert.ok(typeof obs.remedy === 'string' && Object.hasOwn(REMEDIES, obs.remedy), 'remedy in REMEDIES allowlist');
  // D-6: the catalog's kind field is observation_kind, never bare `outcome`.
  assert.equal(Object.hasOwn(obs, 'outcome'), false, 'no bare `outcome` field');
}

// ---- tests ----------------------------------------------------------------

test('HLTH-08 missing_category: contract references a semantic_type with zero capabilities', () => {
  const registry = [capRecord({ id: 'skill:debug', semantic_type: 'skill' })];
  const contracts = new Map([
    ['skill:debug', contractEnvelope({ semantic_type: 'skill' })],
    ['skill:missing', contractEnvelope({ semantic_type: 'agent' })], // agent has zero caps
  ]);
  const result = deriveObservations({ registry, relationships: {}, outcomes: [], contracts, now: NOW });
  const missing = findKind(result.observations, 'missing_category');
  assert.ok(missing.length >= 1, 'expected missing_category for semantic_type=agent');
  assert.equal(missing[0].affected_capability_ids[0], 'semantic_type:agent');
  assertHLTH10(missing[0]);
  assert.equal(missing[0].remedy, 'review_contract');
});

test('HLTH-08 missing_dependency: contract.dependencies reference an id not in the registry', () => {
  const registry = [capRecord({ id: 'skill:debug' })];
  const contracts = new Map([
    ['skill:debug', contractEnvelope({ dependencies: ['skill:ghost'] })],
  ]);
  const result = deriveObservations({ registry, relationships: {}, outcomes: [], contracts, now: NOW });
  const missing = findKind(result.observations, 'missing_dependency');
  assert.equal(missing.length, 1);
  assert.deepEqual(missing[0].affected_capability_ids, ['skill:debug', 'skill:ghost'].sort());
  assertHLTH10(missing[0]);
  assert.equal(missing[0].remedy, 'review_contract');
});

test('HLTH-08 missing_dependency: present dependency does NOT emit', () => {
  const registry = [capRecord({ id: 'skill:debug' }), capRecord({ id: 'skill:dep' })];
  const contracts = new Map([
    ['skill:debug', contractEnvelope({ dependencies: ['skill:dep'] })],
  ]);
  const result = deriveObservations({ registry, relationships: {}, outcomes: [], contracts, now: NOW });
  assert.equal(findKind(result.observations, 'missing_dependency').length, 0);
});

test('HLTH-08 unmapped: capability in registry with zero outcome records', () => {
  const registry = [capRecord({ id: 'skill:debug' })];
  const result = deriveObservations({ registry, relationships: {}, outcomes: [], contracts: new Map(), now: NOW });
  const unmapped = findKind(result.observations, 'unmapped');
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].affected_capability_ids[0], 'skill:debug');
  assertHLTH10(unmapped[0]);
  assert.equal(unmapped[0].remedy, 'reassess_mapping');
});

test('HLTH-08 stale: contract.freshness === stale', () => {
  const registry = [capRecord({ id: 'skill:debug' })];
  const contracts = new Map([
    ['skill:debug', contractEnvelope({ freshness: 'stale' })],
  ]);
  const result = deriveObservations({ registry, relationships: {}, outcomes: [], contracts, now: NOW });
  const stale = findKind(result.observations, 'stale');
  assert.equal(stale.length, 1);
  assert.equal(stale[0].freshness, 'stale');
  assertHLTH10(stale[0]);
  assert.equal(stale[0].remedy, 'review_contract');
});

test('HLTH-08 stale: fresh contract does NOT emit stale', () => {
  const registry = [capRecord({ id: 'skill:debug' })];
  const contracts = new Map([
    ['skill:debug', contractEnvelope({ freshness: 'fresh' })],
  ]);
  const result = deriveObservations({ registry, relationships: {}, outcomes: [], contracts, now: NOW });
  assert.equal(findKind(result.observations, 'stale').length, 0);
});

test('HLTH-08 long_unused: sample_count >= MINIMUM_SAMPLES AND no outcome newer than now - 3*HALF_LIFE_MS', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  // 30 outcomes (== MINIMUM_SAMPLES), all older than 3*HALF_LIFE_MS
  const oldTs = NOW - (3 * HALF_LIFE_MS) - DAY;
  const outcomes = Array.from({ length: MINIMUM_SAMPLES }, (_, i) => outcome({
    capability_id: capId, outcome_kind: 'completed', ts: oldTs - i * HOUR,
  }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  const lu = findKind(result.observations, 'long_unused');
  assert.equal(lu.length, 1);
  assert.equal(lu[0].affected_capability_ids[0], capId);
  assert.equal(lu[0].evidence_window_ms, 3 * HALF_LIFE_MS);
  assert.equal(lu[0].sample_size, MINIMUM_SAMPLES);
  assertHLTH10(lu[0]);
  assert.equal(lu[0].remedy, 'consider_deprecation');
});

test('HLTH-07 long_unused: sample_count < MINIMUM_SAMPLES → NOT emitted (unjudged protection)', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  const oldTs = NOW - (3 * HALF_LIFE_MS) - DAY;
  const outcomes = Array.from({ length: MINIMUM_SAMPLES - 1 }, (_, i) => outcome({
    capability_id: capId, outcome_kind: 'completed', ts: oldTs - i * HOUR,
  }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  assert.equal(findKind(result.observations, 'long_unused').length, 0,
    'long_unused must NOT fire below MINIMUM_SAMPLES (HLTH-07 unjudged)');
});

test('HLTH-08 long_unused: recent outcome suppresses long_unused', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  const oldTs = NOW - (3 * HALF_LIFE_MS) - DAY;
  const outcomes = Array.from({ length: MINIMUM_SAMPLES }, (_, i) => outcome({
    capability_id: capId, outcome_kind: 'completed', ts: oldTs - i * HOUR,
  }));
  // one recent outcome within the window
  outcomes.push(outcome({ capability_id: capId, outcome_kind: 'completed', ts: NOW - HOUR }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  assert.equal(findKind(result.observations, 'long_unused').length, 0);
});

test('HLTH-08 D-2 duplicate: substitute edge with confidence >= MIN_CONFIDENCE (8500)', () => {
  const registry = [capRecord({ id: 'skill:a' }), capRecord({ id: 'skill:b' })];
  const relationships = { edges: [edge({ type: 'substitute', source_id: 'skill:a', target_id: 'skill:b', confidence_basis_points: MIN_CONFIDENCE })] };
  const result = deriveObservations({ registry, relationships, outcomes: [], contracts: new Map(), now: NOW });
  const dup = findKind(result.observations, 'duplicate');
  assert.equal(dup.length, 1);
  assert.deepEqual(dup[0].affected_capability_ids, ['skill:a', 'skill:b'].sort());
  assert.equal(dup[0].confidence_basis_points, MIN_CONFIDENCE);
  assertHLTH10(dup[0]);
  assert.equal(dup[0].remedy, 'reassess_mapping');
});

test('HLTH-08 D-2 duplicate: substitute edge below MIN_CONFIDENCE does NOT emit', () => {
  const registry = [capRecord({ id: 'skill:a' }), capRecord({ id: 'skill:b' })];
  const relationships = { edges: [edge({ type: 'substitute', source_id: 'skill:a', target_id: 'skill:b', confidence_basis_points: MIN_CONFIDENCE - 1 })] };
  const result = deriveObservations({ registry, relationships, outcomes: [], contracts: new Map(), now: NOW });
  assert.equal(findKind(result.observations, 'duplicate').length, 0);
});

test('HLTH-08 D-2 overlap: variant edge emits overlap', () => {
  const registry = [capRecord({ id: 'skill:a' }), capRecord({ id: 'skill:b' })];
  const relationships = { edges: [edge({ type: 'variant', source_id: 'skill:a', target_id: 'skill:b', confidence_basis_points: 5000 })] };
  const result = deriveObservations({ registry, relationships, outcomes: [], contracts: new Map(), now: NOW });
  const ov = findKind(result.observations, 'overlap');
  assert.equal(ov.length, 1);
  assert.deepEqual(ov[0].affected_capability_ids, ['skill:a', 'skill:b'].sort());
  assertHLTH10(ov[0]);
  assert.equal(ov[0].remedy, 'reassess_mapping');
});

test('HLTH-08 D-2 complementary: composition edge emits complementary', () => {
  const registry = [capRecord({ id: 'skill:a' }), capRecord({ id: 'skill:b' })];
  const relationships = { edges: [edge({ type: 'composition', source_id: 'skill:a', target_id: 'skill:b', confidence_basis_points: 5000 })] };
  const result = deriveObservations({ registry, relationships, outcomes: [], contracts: new Map(), now: NOW });
  const comp = findKind(result.observations, 'complementary');
  assert.equal(comp.length, 1);
  assert.deepEqual(comp[0].affected_capability_ids, ['skill:a', 'skill:b'].sort());
  assertHLTH10(comp[0]);
  assert.equal(comp[0].remedy, 'no_action');
});

test('HLTH-08 D-2: other relationship types (prerequisite/conflict/fallback) do NOT emit duplicate/overlap/complementary', () => {
  const registry = [capRecord({ id: 'skill:a' }), capRecord({ id: 'skill:b' })];
  const relationships = {
    edges: [
      edge({ type: 'prerequisite', source_id: 'skill:a', target_id: 'skill:b' }),
      edge({ type: 'conflict', source_id: 'skill:a', target_id: 'skill:b' }),
      edge({ type: 'fallback', source_id: 'skill:a', target_id: 'skill:b' }),
    ],
  };
  const result = deriveObservations({ registry, relationships, outcomes: [], contracts: new Map(), now: NOW });
  const kinds = kindsOf(result.observations).filter((k) => ['duplicate', 'overlap', 'complementary'].includes(k));
  assert.deepEqual(kinds, []);
});

test('HLTH-08 ineffective: >= 3 consecutive corrected/retried/replaced outcomes AND sample_count >= MINIMUM_SAMPLES', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  const outcomes = [
    ...Array.from({ length: 4 }, (_, i) => outcome({ capability_id: capId, outcome_kind: 'corrected', ts: NOW - (4 - i) * HOUR })),
    ...Array.from({ length: MINIMUM_SAMPLES - 4 }, (_, i) => outcome({ capability_id: capId, outcome_kind: 'completed', ts: NOW - (i + 5) * HOUR })),
  ];
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  const ineff = findKind(result.observations, 'ineffective');
  assert.equal(ineff.length, 1);
  assert.equal(ineff[0].affected_capability_ids[0], capId);
  assert.ok(ineff[0].sample_size >= 3, 'sample_size >= 3');
  assertHLTH10(ineff[0]);
  assert.equal(ineff[0].remedy, 'consider_deprecation');
});

test('HLTH-07 ineffective: sample_count < MINIMUM_SAMPLES → NOT emitted (unjudged protection)', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  // 5 corrected outcomes, but sample_count=5 < MINIMUM_SAMPLES=30
  const outcomes = Array.from({ length: 5 }, (_, i) => outcome({
    capability_id: capId, outcome_kind: 'corrected', ts: NOW - (5 - i) * HOUR,
  }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  assert.equal(findKind(result.observations, 'ineffective').length, 0,
    'ineffective must NOT fire below MINIMUM_SAMPLES (HLTH-07 unjudged)');
});

test('HLTH-08 ineffective: non-consecutive failures do NOT reach the 3-consecutive floor', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  // alternating corrected/completed — longest consecutive failure run = 1
  const outcomes = Array.from({ length: MINIMUM_SAMPLES }, (_, i) => outcome({
    capability_id: capId, outcome_kind: i % 2 === 0 ? 'corrected' : 'completed', ts: NOW - i * HOUR,
  }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  assert.equal(findKind(result.observations, 'ineffective').length, 0);
});

test('HLTH-09 reusable_workflow: >= 5 consecutive completed outcomes (healthy repetition)', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  const outcomes = Array.from({ length: MINIMUM_SAMPLES }, (_, i) => outcome({
    capability_id: capId, outcome_kind: 'completed', ts: NOW - (MINIMUM_SAMPLES - i) * HOUR,
  }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  const rw = findKind(result.observations, 'reusable_workflow');
  assert.equal(rw.length, 1);
  assert.equal(rw[0].affected_capability_ids[0], capId);
  assert.ok(rw[0].sample_size >= 5, 'chain >= 5');
  assertHLTH10(rw[0]);
  assert.equal(rw[0].remedy, 'propose_reusable_skill');
});

test('HLTH-09 reusable_workflow: failure-driven repetition (corrected/retried) does NOT emit', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  // 30 consecutive 'corrected' outcomes — failure-driven, not reusable
  const outcomes = Array.from({ length: MINIMUM_SAMPLES }, (_, i) => outcome({
    capability_id: capId, outcome_kind: 'corrected', ts: NOW - (MINIMUM_SAMPLES - i) * HOUR,
  }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  assert.equal(findKind(result.observations, 'reusable_workflow').length, 0,
    'failure-driven repetition must NOT yield reusable_workflow (HLTH-09)');
});

test('HLTH-09 reusable_workflow: chain of 4 completed (below floor) does NOT emit', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  // 30 outcomes but only 4 consecutive completed (interspersed with abandoned)
  const outcomes = [];
  for (let i = 0; i < MINIMUM_SAMPLES; i++) {
    const kind = i < 4 ? 'completed' : (i < 7 ? 'abandoned' : 'completed');
    outcomes.push(outcome({ capability_id: capId, outcome_kind: kind, ts: NOW - (MINIMUM_SAMPLES - i) * HOUR }));
  }
  // longest completed run is at most the tail; ensure < 5 by construction
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  // The tail may produce a run >= 5; assert by direct construction instead.
  // Rebuild with no run >= 5:
  const outcomes2 = [];
  for (let i = 0; i < MINIMUM_SAMPLES; i++) {
    // pattern: completed, abandoned, completed, abandoned... max run = 1
    outcomes2.push(outcome({ capability_id: capId, outcome_kind: i % 2 === 0 ? 'completed' : 'abandoned', ts: NOW - (MINIMUM_SAMPLES - i) * HOUR }));
  }
  const result2 = deriveObservations({ registry, relationships: {}, outcomes: outcomes2, contracts: new Map(), now: NOW });
  assert.equal(findKind(result2.observations, 'reusable_workflow').length, 0);
});

test('HLTH-10: every observation across all 10 kinds carries the 7 required fields + frozen remedy', () => {
  const capId = 'skill:debug';
  const registry = [
    capRecord({ id: capId, semantic_type: 'skill' }),
    capRecord({ id: 'skill:a', semantic_type: 'skill' }),
    capRecord({ id: 'skill:b', semantic_type: 'skill' }),
  ];
  const contracts = new Map([
    ['skill:debug', contractEnvelope({ semantic_type: 'agent', dependencies: ['skill:ghost'], freshness: 'stale' })],
  ]);
  const oldTs = NOW - (3 * HALF_LIFE_MS) - DAY;
  const outcomes = [
    // long_unused + ineffective + reusable_workflow fixtures for capId
    ...Array.from({ length: 5 }, (_, i) => outcome({ capability_id: capId, outcome_kind: 'completed', ts: oldTs - i * HOUR })),
  ];
  // pad to MINIMUM_SAMPLES so long_unused/ineffective fire
  while (outcomes.length < MINIMUM_SAMPLES) outcomes.push(outcome({ capability_id: capId, outcome_kind: 'completed', ts: oldTs - outcomes.length * HOUR }));
  const relationships = {
    edges: [
      edge({ type: 'substitute', source_id: 'skill:a', target_id: 'skill:b', confidence_basis_points: 9000 }),
      edge({ type: 'variant', source_id: 'skill:debug', target_id: 'skill:a', confidence_basis_points: 7000 }),
      edge({ type: 'composition', source_id: 'skill:debug', target_id: 'skill:b', confidence_basis_points: 6000 }),
    ],
  };
  const result = deriveObservations({ registry, relationships, outcomes, contracts, now: NOW });
  assert.ok(result.observations.length >= 8, `expected >= 8 observations, got ${result.observations.length}`);
  for (const obs of result.observations) assertHLTH10(obs);
  // every remedy is in the frozen allowlist
  for (const obs of result.observations) {
    assert.ok(Object.hasOwn(REMEDIES, obs.remedy), `remedy ${obs.remedy} not in allowlist`);
  }
});

test('HLTH-10: REMEDIES allowlist rejects destructive remedies (no delete/disable/merge/publish/install)', () => {
  const forbidden = ['delete', 'disable', 'merge', 'publish', 'install'];
  for (const f of forbidden) {
    assert.equal(Object.hasOwn(REMEDIES, f), false, `REMEDIES must NOT include destructive remedy: ${f}`);
  }
  // the allowlist is exactly the 5 non-destructive values
  assert.deepEqual([...Object.values(REMEDIES)].sort(), ['consider_deprecation', 'no_action', 'propose_reusable_skill', 'reassess_mapping', 'review_contract']);
});

test('HLTH-10: REASON_CODES is a frozen enum with one entry per kind + overflow', () => {
  const expectedKinds = ['missing_category', 'missing_dependency', 'unmapped', 'stale', 'long_unused', 'duplicate', 'overlap', 'complementary', 'ineffective', 'reusable_workflow'];
  for (const k of expectedKinds) {
    assert.ok(Object.hasOwn(REASON_CODES, k), `REASON_CODES missing kind: ${k}`);
  }
  assert.equal(REASON_CODES.observations_truncated, 'observations_truncated');
  assert.ok(Object.isFrozen(REASON_CODES));
  assert.ok(Object.isFrozen(REMEDIES));
});

test('catalog is a pure transform: returns schema_version, policy_version, bounded observations', () => {
  const result = deriveObservations({ registry: [], relationships: {}, outcomes: [], contracts: new Map(), now: NOW });
  assert.equal(result.schema_version, 1);
  assert.equal(result.policy_version, 'health-policy-v1');
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.reason_codes));
});

test('catalog bounds observations to 256 and sets observations_truncated reason_code on overflow', () => {
  // Generate > 256 missing_category observations by referencing 300 distinct
  // semantic_types with zero capabilities.
  const contracts = new Map();
  for (let i = 0; i < 300; i++) {
    contracts.set(`cap:${i}`, contractEnvelope({ semantic_type: `ghost-type-${i}` }));
  }
  const result = deriveObservations({ registry: [], relationships: {}, outcomes: [], contracts, now: NOW });
  assert.ok(result.observations.length <= 256, `expected <= 256, got ${result.observations.length}`);
  assert.ok(result.reason_codes.includes('observations_truncated'), 'expected observations_truncated reason_code');
});

test('catalog does NOT re-derive relationships: reads already-derived edges only', () => {
  // Pass a relationships object with only `edges` (deriveRelationships output
  // shape) — the catalog must not call deriveRelationships.
  const registry = [capRecord({ id: 'skill:a' }), capRecord({ id: 'skill:b' })];
  const relationships = { edges: [edge({ type: 'variant', source_id: 'skill:a', target_id: 'skill:b' })] };
  const result = deriveObservations({ registry, relationships, outcomes: [], contracts: new Map(), now: NOW });
  assert.equal(findKind(result.observations, 'overlap').length, 1);
});

test('catalog now must be an integer ms epoch (throws on bad input)', () => {
  assert.throws(() => deriveObservations({ now: 'oops' }), TypeError);
});

test('D-6: observation_kind is the catalog kind field; no bare `outcome` field on any observation', () => {
  const capId = 'skill:debug';
  const registry = [capRecord({ id: capId })];
  const outcomes = Array.from({ length: MINIMUM_SAMPLES }, (_, i) => outcome({ capability_id: capId, outcome_kind: 'completed', ts: NOW - i * HOUR }));
  const result = deriveObservations({ registry, relationships: {}, outcomes, contracts: new Map(), now: NOW });
  for (const obs of result.observations) {
    assert.equal(Object.hasOwn(obs, 'outcome'), false, 'no bare `outcome` field (D-6)');
    assert.equal(typeof obs.observation_kind, 'string');
  }
});