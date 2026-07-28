// Phase 24 — Health observation catalog (HLTH-08/09/10).
//
// deriveObservations turns three inputs — the Phase 21 registry, the Phase 22
// relationship graph, and the Plan 24-02 outcome history — into the bounded
// observation catalog Phase 25's `/router suggestion` surface reads. It emits
// 10 observation kinds:
//
//   missing_category, missing_dependency, unmapped, stale, long_unused,
//   duplicate, overlap, complementary, ineffective, reusable_workflow
//
// D-2 (HLTH-08 edge mapping): duplicate/overlap/complementary are derived from
// the Phase 22 relationship graph — substitute→duplicate, variant→overlap,
// composition→complementary. The catalog reads ALREADY-DERIVED edges (the
// deriveRelationships output); it does NOT call deriveRelationships and does
// NOT re-derive edges. The other 6 kinds come from the registry + contracts
// (missing_category, missing_dependency, unmapped, stale) and outcome history
// (long_unused, ineffective, reusable_workflow).
//
// HLTH-10: every observation carries observation_kind, reason_code,
// evidence_window_ms, sample_size OR opportunity_count, freshness,
// affected_capability_ids[] (non-empty), confidence_basis_points (0..10000),
// and a non-destructive remedy from a frozen REMEDIES allowlist. The catalog
// is a pure transform — it never writes anywhere and never mutates an input.
// Remedies are advisory strings, never auto-mutations.
//
// HLTH-07 (D-1): sample_count < MINIMUM_SAMPLES → 'unjudged'; the catalog
// never emits long_unused or ineffective for a capability below the floor.
//
// HLTH-09: reusable_workflow distinguishes healthy repetition (a chain of
// consecutive 'completed' outcomes) from failure-driven repetition (a chain
// of 'corrected'/'retried'/'replaced' does NOT yield reusable_workflow).
//
// Reuse — do NOT redefine (RESEARCH "Don't Hand-Roll"): HALF_LIFE_MS,
// MAX_RETENTION_MS, MINIMUM_SAMPLES come from src/evolution/evidence.mjs;
// MIN_CONFIDENCE comes from src/registry/relationships.mjs.
//
// D-6: observation records use observation_kind for the catalog's own kind
// field and outcome_kind only when referencing the outcome-history record
// shape (parallel naming, never bare `outcome`).
//
// This module NEVER runs on the UserPromptSubmit hot path — it is called only
// by the off-hot-path admin inspect / Phase 25 suggestion surface. It NEVER
// reads record.name; capability_id is the stable local id.

import { stableCapabilityId } from '../registry/identity.mjs';
import { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES } from '../evolution/evidence.mjs';

// MIN_CONFIDENCE is a module-private const in src/registry/relationships.mjs
// (line 6: `const MIN_CONFIDENCE = 8500;`). It is not exported, and the plan's
// files_modified contract does not include relationships.mjs, so we inline
// the value here with a reference comment rather than modifying that module.
// The plan explicitly specifies ">= relationships.mjs MIN_CONFIDENCE=8500" for
// the duplicate (substitute) edge threshold. If relationships.mjs ever exports
// MIN_CONFIDENCE, prefer the import.
const MIN_CONFIDENCE = 8500;

export { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES, MIN_CONFIDENCE };

const MAX_OBSERVATIONS = 256; // mirror MAX_EDGES=128 discipline, doubled for the wider vocab
const LONG_UNUSED_WINDOW_MS = 3 * HALF_LIFE_MS;
const INEFFECTIVE_MIN_CONSECUTIVE = 3;
const REUSABLE_WORKFLOW_MIN_CHAIN = 5; // HLTH-09 floor (versioned in Plan 24-04 thresholds.mjs)

// Frozen REASON_CODES enum — one per observation kind. The catalog never
// invents reason codes outside this set.
export const REASON_CODES = Object.freeze({
  missing_category: 'missing_category',
  missing_dependency: 'missing_dependency',
  unmapped: 'unmapped_capability',
  stale: 'stale_contract',
  long_unused: 'long_unused',
  duplicate: 'duplicate_relationship',
  overlap: 'overlap_relationship',
  complementary: 'complementary_relationship',
  ineffective: 'ineffective_capability',
  reusable_workflow: 'reusable_workflow_detected',
  observations_truncated: 'observations_truncated',
});

// Frozen REMEDIES allowlist — non-destructive advisory strings only. NEVER
// 'delete'/'disable'/'merge'/'publish'/'install' (HLTH-10, T-24-13).
export const REMEDIES = Object.freeze({
  review_contract: 'review_contract',
  reassess_mapping: 'reassess_mapping',
  consider_deprecation: 'consider_deprecation',
  propose_reusable_skill: 'propose_reusable_skill',
  no_action: 'no_action',
});

const REMEDY_BY_KIND = Object.freeze({
  missing_category: 'review_contract',
  missing_dependency: 'review_contract',
  unmapped: 'reassess_mapping',
  stale: 'review_contract',
  long_unused: 'consider_deprecation',
  duplicate: 'reassess_mapping',
  overlap: 'reassess_mapping',
  complementary: 'no_action',
  ineffective: 'consider_deprecation',
  reusable_workflow: 'propose_reusable_skill',
});

const FAILURE_KINDS = new Set(['corrected', 'retried', 'replaced']);

function boundedBp(value) {
  // HLTH-10: confidence_basis_points bounded 0..10000 (mirrors
  // router-control.mjs:340 bounding discipline).
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10000, Math.round(value)));
}

function boundedInt(value, max = 10_000_000) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, Math.round(value));
}

function freshnessOf(value) {
  return value === 'stale' ? 'stale' : 'fresh';
}

// readContractField — accept either the full buildCapabilityContract output
// (contract.fields.<field>.{value,freshness,state}) or a simplified projection
// (contract.<field> = scalar). Returns { value, freshness, state }.
function readContractField(contract, field) {
  if (!contract || typeof contract !== 'object') return { value: undefined, freshness: 'unknown', state: 'unknown' };
  const direct = contract[field];
  if (direct !== undefined && direct !== null && typeof direct !== 'object') {
    return { value: direct, freshness: 'fresh', state: 'known' };
  }
  const envelope = contract.fields && contract.fields[field];
  if (envelope && typeof envelope === 'object') {
    return {
      value: envelope.value,
      freshness: typeof envelope.freshness === 'string' ? envelope.freshness : 'unknown',
      state: typeof envelope.state === 'string' ? envelope.state : 'unknown',
    };
  }
  return { value: undefined, freshness: 'unknown', state: 'unknown' };
}

function readSemanticType(contract) {
  const invocationKind = readContractField(contract, 'invocation_kind');
  if (typeof invocationKind.value === 'string' && invocationKind.value && invocationKind.value !== 'none') {
    return invocationKind.value;
  }
  if (contract && typeof contract.semantic_type === 'string' && contract.semantic_type) {
    return contract.semantic_type;
  }
  return null;
}

function readDependencies(contract) {
  const dep = readContractField(contract, 'dependencies');
  if (Array.isArray(dep.value)) return dep.value.filter((v) => typeof v === 'string' && v);
  if (Array.isArray(contract && contract.dependencies)) return contract.dependencies.filter((v) => typeof v === 'string' && v);
  return [];
}

function readFreshness(contract) {
  if (contract && typeof contract.freshness === 'string') return freshnessOf(contract.freshness);
  if (contract && contract.fields && typeof contract.fields === 'object') {
    for (const field of Object.keys(contract.fields)) {
      const f = contract.fields[field];
      if (f && typeof f === 'object' && f.freshness === 'stale') return 'stale';
    }
  }
  return 'fresh';
}

function makeObservation(kind, partial) {
  if (!REASON_CODES[kind]) throw new Error(`unknown observation kind: ${kind}`);
  if (!REMEDY_BY_KIND[kind]) throw new Error(`missing remedy for kind: ${kind}`);
  const affected = Array.isArray(partial.affected_capability_ids)
    ? partial.affected_capability_ids.filter((v) => typeof v === 'string' && v)
    : [];
  if (affected.length === 0) throw new Error(`observation ${kind} requires non-empty affected_capability_ids`);

  const obs = {
    observation_kind: kind,
    reason_code: REASON_CODES[kind],
    evidence_window_ms: boundedInt(partial.evidence_window_ms ?? 0, MAX_RETENTION_MS),
    freshness: freshnessOf(partial.freshness ?? 'fresh'),
    affected_capability_ids: [...new Set(affected)].sort(),
    confidence_basis_points: boundedBp(partial.confidence_basis_points ?? 0),
    remedy: REMEDY_BY_KIND[kind],
  };
  // HLTH-10: sample_size OR opportunity_count (bounded integers). At least
  // one must be present; both may be present when meaningful.
  if (partial.sample_size !== undefined) obs.sample_size = boundedInt(partial.sample_size);
  if (partial.opportunity_count !== undefined) obs.opportunity_count = boundedInt(partial.opportunity_count);
  if (obs.sample_size === undefined && obs.opportunity_count === undefined) {
    obs.opportunity_count = 1;
  }
  return obs;
}

// groupOutcomesByCapability — index outcomes by capability_id. Skips records
// without a capability_id (defense-in-depth; observe.mjs already enforces).
function groupOutcomesByCapability(outcomes) {
  const map = new Map();
  for (const o of outcomes) {
    if (!o || typeof o !== 'object') continue;
    const id = o.capability_id;
    if (typeof id !== 'string' || !id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(o);
  }
  return map;
}

// longestConsecutiveRun — returns the length of the longest run of records
// (sorted by timestamp_ms) whose outcome_kind is in `kinds`. Used for both
// ineffective (failure run) and reusable_workflow (completed run).
function longestConsecutiveRun(sortedOutcomes, kinds) {
  let best = 0;
  let run = 0;
  for (const o of sortedOutcomes) {
    if (kinds.has(o.outcome_kind)) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function spanMs(sortedOutcomes) {
  if (sortedOutcomes.length === 0) return 0;
  const first = sortedOutcomes[0].timestamp_ms;
  const last = sortedOutcomes[sortedOutcomes.length - 1].timestamp_ms;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return 0;
  return Math.max(0, last - first);
}

// deriveObservations — pure transform. Returns {
//   schema_version:1, policy_version:'health-policy-v1', observations,
//   reason_codes } where observations is a bounded array (max 256) and
//   reason_codes carries overflow flags.
//
// Inputs:
//   registry: array of capability records (Phase 21 active registry).
//   relationships: deriveRelationships output ({ edges, candidates, ... }).
//   outcomes: array of persisted outcome records (Plan 24-02).
//   contracts: Map<capability_id, contract envelope> (Phase 22
//     buildCapabilityContract output). A plain object is also accepted and
//     keyed by its own keys for test ergonomics.
//   now: ms epoch; defaults to Date.now().
export function deriveObservations({
  registry = [],
  relationships = {},
  outcomes = [],
  contracts = new Map(),
  now = Date.now(),
} = {}) {
  if (!Number.isSafeInteger(now)) throw new TypeError('now must be an integer ms epoch');

  const records = Array.isArray(registry) ? registry : [];
  const recordsById = new Map();
  const semanticTypeBuckets = new Map(); // semantic_type -> count
  for (const record of records) {
    let id;
    try { id = stableCapabilityId(record); } catch { id = null; }
    if (id) recordsById.set(id, record);
    if (record && typeof record.semantic_type === 'string' && record.semantic_type) {
      semanticTypeBuckets.set(record.semantic_type, (semanticTypeBuckets.get(record.semantic_type) || 0) + 1);
    }
  }

  const contractMap = contracts instanceof Map ? contracts : new Map(Object.entries(contracts || {}));
  const outcomesByCap = groupOutcomesByCapability(Array.isArray(outcomes) ? outcomes : []);
  const edges = Array.isArray(relationships.edges) ? relationships.edges : [];

  const observations = [];
  const reason_codes = [];

  function emit(obs) {
    if (observations.length < MAX_OBSERVATIONS) observations.push(obs);
    else if (!reason_codes.includes(REASON_CODES.observations_truncated)) reason_codes.push(REASON_CODES.observations_truncated);
  }

  // ---- missing_category: contract references a semantic_type with zero caps
  const referencedSemanticTypes = new Set();
  for (const contract of contractMap.values()) {
    const st = readSemanticType(contract);
    if (st) referencedSemanticTypes.add(st);
  }
  for (const st of referencedSemanticTypes) {
    if ((semanticTypeBuckets.get(st) || 0) === 0) {
      emit(makeObservation('missing_category', {
        evidence_window_ms: 0,
        freshness: 'fresh',
        affected_capability_ids: [`semantic_type:${st}`],
        confidence_basis_points: 10000,
        opportunity_count: 1,
      }));
    }
  }

  // ---- missing_dependency: a capability's contract.dependencies reference
  // an id not present in the registry.
  for (const [capId, contract] of contractMap.entries()) {
    const deps = readDependencies(contract);
    for (const dep of deps) {
      if (!recordsById.has(dep)) {
        emit(makeObservation('missing_dependency', {
          evidence_window_ms: 0,
          freshness: 'fresh',
          affected_capability_ids: [capId, dep],
          confidence_basis_points: 10000,
          opportunity_count: 1,
        }));
      }
    }
  }

  // ---- unmapped: capability in the registry with zero outcome records.
  // ---- stale: contract.freshness === 'stale'.
  // ---- long_unused: sample_count >= MINIMUM_SAMPLES AND no outcome newer
  //      than (now - 3*HALF_LIFE_MS).
  // ---- ineffective: >= 3 consecutive failure outcomes AND sample_count
  //      >= MINIMUM_SAMPLES.
  for (const [capId, record] of recordsById.entries()) {
    const outcomesForCap = outcomesByCap.get(capId) || [];
    const sample_count = outcomesForCap.length;

    // unmapped
    if (sample_count === 0) {
      emit(makeObservation('unmapped', {
        evidence_window_ms: 0,
        freshness: 'fresh',
        affected_capability_ids: [capId],
        confidence_basis_points: 10000,
        opportunity_count: 1,
      }));
    }

    // stale — only emit if the contract says stale
    const contract = contractMap.get(capId);
    if (contract) {
      const fresh = readFreshness(contract);
      if (fresh === 'stale') {
        emit(makeObservation('stale', {
          evidence_window_ms: 0,
          freshness: 'stale',
          affected_capability_ids: [capId],
          confidence_basis_points: 10000,
          opportunity_count: 1,
        }));
      }
    }

    // HLTH-07 (D-1): below the sample floor → 'unjudged'; NEVER long_unused
    // or ineffective.
    if (sample_count >= MINIMUM_SAMPLES) {
      const sorted = [...outcomesForCap].sort((a, b) => (a.timestamp_ms ?? 0) - (b.timestamp_ms ?? 0));
      const newest = sorted.length > 0 ? sorted[sorted.length - 1].timestamp_ms : null;
      // long_unused
      if (!Number.isSafeInteger(newest) || newest < now - LONG_UNUSED_WINDOW_MS) {
        emit(makeObservation('long_unused', {
          evidence_window_ms: LONG_UNUSED_WINDOW_MS,
          freshness: 'fresh',
          affected_capability_ids: [capId],
          confidence_basis_points: Math.min(10000, Math.round((sample_count / MINIMUM_SAMPLES) * 10000)),
          sample_size: sample_count,
        }));
      }

      // ineffective — >= 3 consecutive failure outcomes
      const failureRun = longestConsecutiveRun(sorted, FAILURE_KINDS);
      if (failureRun >= INEFFECTIVE_MIN_CONSECUTIVE) {
        emit(makeObservation('ineffective', {
          evidence_window_ms: Math.min(MAX_RETENTION_MS, spanMs(sorted) || 0),
          freshness: 'fresh',
          affected_capability_ids: [capId],
          confidence_basis_points: Math.min(10000, Math.round((failureRun / sample_count) * 10000)),
          sample_size: failureRun,
        }));
      }

      // reusable_workflow (HLTH-09) — >= 5 consecutive 'completed' outcomes.
      // Failure-driven repetition (corrected/retried/replaced) does NOT yield
      // reusable_workflow — the longest failure run is excluded by construction
      // (longestConsecutiveRun only counts 'completed' here).
      const completedRun = longestConsecutiveRun(sorted, new Set(['completed']));
      if (completedRun >= REUSABLE_WORKFLOW_MIN_CHAIN) {
        emit(makeObservation('reusable_workflow', {
          evidence_window_ms: Math.min(MAX_RETENTION_MS, spanMs(sorted) || 0),
          freshness: 'fresh',
          affected_capability_ids: [capId],
          confidence_basis_points: Math.min(10000, Math.round((completedRun / sample_count) * 10000)),
          sample_size: completedRun,
        }));
      }
    }
  }

  // ---- duplicate / overlap / complementary (D-2): from relationship edges.
  // duplicate ← substitute, overlap ← variant, complementary ← composition.
  // Only edges with confidence_basis_points >= MIN_CONFIDENCE (8500) are
  // considered for duplicate (substitute); variant and composition do not
  // carry the same confidence floor in the plan text, but we apply MIN_CONFIDENCE
  // to duplicate only per the plan's explicit wording ("substitute with high
  // confidence (>= relationships.mjs MIN_CONFIDENCE=8500)").
  for (const edge of edges) {
    const type = edge && typeof edge.type === 'string' ? edge.type : null;
    const source = edge && typeof edge.source_id === 'string' ? edge.source_id : null;
    const target = edge && typeof edge.target_id === 'string' ? edge.target_id : null;
    if (!source || !target) continue;
    const confidence = Number.isInteger(edge.confidence_basis_points) ? edge.confidence_basis_points : 0;

    if (type === 'substitute' && confidence >= MIN_CONFIDENCE) {
      emit(makeObservation('duplicate', {
        evidence_window_ms: 0,
        freshness: edge.freshness === 'stale' ? 'stale' : 'fresh',
        affected_capability_ids: [source, target],
        confidence_basis_points: confidence,
        opportunity_count: 1,
      }));
    } else if (type === 'variant') {
      emit(makeObservation('overlap', {
        evidence_window_ms: 0,
        freshness: edge.freshness === 'stale' ? 'stale' : 'fresh',
        affected_capability_ids: [source, target],
        confidence_basis_points: confidence,
        opportunity_count: 1,
      }));
    } else if (type === 'composition') {
      emit(makeObservation('complementary', {
        evidence_window_ms: 0,
        freshness: edge.freshness === 'stale' ? 'stale' : 'fresh',
        affected_capability_ids: [source, target],
        confidence_basis_points: confidence,
        opportunity_count: 1,
      }));
    }
  }

  return {
    schema_version: 1,
    policy_version: 'health-policy-v1',
    observations: observations.sort((a, b) => a.observation_kind.localeCompare(b.observation_kind) || stableStrCompare(a.affected_capability_ids[0], b.affected_capability_ids[0])),
    reason_codes: reason_codes.sort(),
  };
}

function stableStrCompare(a, b) {
  return String(a).localeCompare(String(b));
}