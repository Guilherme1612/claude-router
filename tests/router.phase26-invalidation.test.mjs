import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCandidate } from '../src/registry/reconcile.mjs';
import { deriveInvalidationInput } from '../src/registry/watcher.mjs';

test('reconciliation reports complete tuple invalidation for all eight change classes', () => {
  const result = reconcileCandidate({
    active: { schema_version: 1, records: [] },
    candidate: { schema_version: 1, records: [] },
    aliases: [],
    references: { schema_version: 1, edges: [] },
  });
  assert.deepEqual(result.invalidation_classes, [
    'node', 'edge', 'dependency', 'adapter', 'inference-rule', 'manifest', 'correction', 'negative-evidence',
  ], 'PHASE26_INVALIDATION_INCOMPLETE');
  assert.match(result.invalidation_fingerprint, /^[a-f0-9]{64}$/);
});

test('production invalidation descriptors preserve every change class and transitive reference', () => {
  const classes = [
    ['node', 'registry'],
    ['edge', 'relationships'],
    ['dependency', 'registry'],
    ['adapter', 'contracts'],
    ['inference-rule', 'intent_policy'],
    ['manifest', 'workflows'],
    ['correction', 'contracts'],
    ['negative-evidence', 'health_policy'],
  ];
  for (const [changeClass, tupleMember] of classes) {
    const lifecycle = { events: [{
      primary: 'content_changed',
      facets: [],
      canonical_id: 'fixture/base',
      change_class: changeClass,
      affected_tuple_member: tupleMember,
      references: [{
        id: `${changeClass}:dependent`,
        type: changeClass === 'node' || changeClass === 'edge' ? 'relationship' : changeClass,
        from_id: 'fixture/dependent',
        to_id: 'fixture/base',
      }],
    }], diagnostics: [] };
    const descriptors = deriveInvalidationInput({
      registry: { schema_version: 1, records: [] },
      relationships: { schema_version: 1, edges: [], candidates: [] },
      overlays: { accepted: [] },
    }, lifecycle);
    assert.equal(descriptors.lifecycle.events[0].change_class, changeClass);
    assert.equal(descriptors.lifecycle.events[0].affected_tuple_member, tupleMember);
    assert.deepEqual(descriptors.references.edges, lifecycle.events[0].references);
  }
});
