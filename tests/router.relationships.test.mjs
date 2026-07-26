import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCandidate } from '../src/registry/reconcile.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { capability, candidate } from './router.registry-reconcile.test.mjs';

const types = {
  substitute: 'explicit-substitution',
  variant: 'shared-lineage',
  prerequisite: 'dependency-declaration',
  composition: 'composition-declaration',
  conflict: 'conflict-declaration',
  fallback: 'fallback-declaration',
  implementation: 'implementation-binding',
  alias: 'explicit-alias',
};

function record(name, overrides = {}) {
  return capability({ name, canonical_identity: `router/${name}`, ...overrides });
}

function edge(type, overrides = {}) {
  return {
    id: `${type}:alpha:beta`,
    type,
    source_id: 'router/alpha',
    target_id: 'router/beta',
    confidence_basis_points: 9000,
    freshness: 'fresh',
    evidence: [{
      kind: types[type],
      provenance: 'adapter',
      confidence_basis_points: 9000,
      freshness: 'fresh',
      rule_version: 'relationship-rules-v1',
    }],
    ...overrides,
  };
}

const records = [record('alpha'), record('beta'), record('gamma')];
const relationshipsModule = import('../src/registry/relationships.mjs');

test('[phase22-red:relationships] active schema accepts exactly the eight CONT-07 types', async () => {
  const { deriveRelationships, RELATIONSHIP_TYPES } = await relationshipsModule;
  assert.deepEqual(RELATIONSHIP_TYPES, Object.keys(types).sort());
  const graph = deriveRelationships({ records, candidates: Object.keys(types).map(type => edge(type)) });
  assert.deepEqual(graph.edges.map(value => value.type).sort(), Object.keys(types).sort());
  assert.equal(graph.candidates.length, 0);
});

test('[phase22-red:relationships] typed evidence is required and weak states remain inspectable', async () => {
  const { deriveRelationships } = await relationshipsModule;
  const candidates = [
    edge('alias', { id: 'similarity', evidence: [{ kind: 'lexical-similarity', provenance: 'scanner', confidence_basis_points: 10000, freshness: 'fresh', rule_version: 'relationship-rules-v1' }] }),
    edge('substitute', { id: 'insufficient', confidence_basis_points: 8499 }),
    edge('variant', { id: 'stale', freshness: 'stale' }),
    edge('fallback', { id: 'conflicting', evidence: [...edge('fallback').evidence, { kind: 'conflict', provenance: 'adapter', confidence_basis_points: 10000, freshness: 'fresh', rule_version: 'relationship-rules-v1' }] }),
    edge('unknown', { id: 'unknown' }),
    edge('alias', { id: 'missing-target', target_id: 'router/missing' }),
  ];
  const graph = deriveRelationships({ records, candidates });
  assert.equal(graph.edges.length, 0);
  const reasons = Object.fromEntries(graph.candidates.map(value => [value.id, value.reason_codes]));
  assert.ok(reasons.conflicting.includes('relationship_conflicting_evidence'));
  assert.ok(reasons.insufficient.includes('relationship_below_threshold'));
  assert.ok(reasons['missing-target'].includes('relationship_dangling_target'));
  assert.ok(reasons.similarity.includes('relationship_similarity_only'));
  assert.ok(reasons.stale.includes('relationship_stale_evidence'));
  assert.ok(reasons.unknown.includes('relationship_unknown_type'));
  assert.ok(graph.candidates.every(value => value.validation_state === 'inactive'));
  assert.ok(graph.candidates.every(value => value.evidence.length > 0));
});

test('[phase22-red:relationships] malformed endpoints, self edges, cycles, and collection overflow fail closed', async () => {
  const { deriveRelationships } = await relationshipsModule;
  const cycle = [
    edge('prerequisite', { id: 'a-b' }),
    edge('prerequisite', { id: 'b-a', source_id: 'router/beta', target_id: 'router/alpha' }),
  ];
  const graph = deriveRelationships({
    records,
    candidates: [
      ...cycle,
      edge('conflict', { id: '0-self', target_id: 'router/alpha' }),
      edge('alias', { id: '0-bad-source', source_id: '' }),
      ...Array.from({ length: 140 }, (_, index) => edge('variant', { id: `bounded-${index}` })),
    ],
  });
  assert.equal(graph.edges.length + graph.candidates.length, 128);
  assert.ok(graph.candidates.some(value => value.reason_codes.includes('relationship_cycle')));
  assert.ok(graph.candidates.some(value => value.reason_codes.includes('relationship_self_edge')));
  assert.ok(graph.candidates.some(value => value.reason_codes.includes('relationship_malformed_endpoint')));
});

test('[phase22-red:relationships] graph bytes ignore record candidate evidence and reason input order', async () => {
  const { deriveRelationships } = await relationshipsModule;
  const values = [
    edge('alias'),
    edge('variant', {
      id: 'variant:alpha:gamma',
      target_id: 'router/gamma',
      evidence: [
        ...edge('variant').evidence,
        { kind: 'supporting-fact', provenance: 'adapter', confidence_basis_points: 9100, freshness: 'fresh', rule_version: 'relationship-rules-v1' },
      ],
    }),
  ];
  const forward = deriveRelationships({ records, candidates: values });
  const reverse = deriveRelationships({
    records: [...records].reverse(),
    candidates: [...values].reverse().map(value => ({ ...value, evidence: [...value.evidence].reverse() })),
  });
  assert.equal(stableStringify(forward), stableStringify(reverse));
});

test('[phase22-red:relationships] endpoint lifecycle invalidates direct and dependent edges before callbacks', async () => {
  const { deriveRelationships } = await relationshipsModule;
  const relationships = deriveRelationships({
    records,
    candidates: [edge('alias', { id: 'alias-edge' })],
  });
  const observed = [];
  const result = reconcileCandidate({
    candidate: candidate(records),
    lifecycle: { events: [{ canonical_id: 'router/beta', primary: 'removed' }], diagnostics: [] },
    relationships,
    references: { schema_version: 1, edges: [
      { id: 'dependent-reference', type: 'mapping', from_id: 'dependent-edge', to_id: 'alias-edge' },
    ] },
    evaluateReferences: value => observed.push(value),
  });
  assert.deepEqual(result.invalidated_ids, ['alias-edge', 'dependent-edge', 'router/beta']);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].references.edges.length, 0);
});
