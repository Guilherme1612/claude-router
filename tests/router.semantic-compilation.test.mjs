import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { contractEvidence } from './helpers/inventory-fixture.mjs';
import { capability } from './router.registry-reconcile.test.mjs';

const relationshipsModule = import('../src/registry/relationships.mjs');

function simpleRecord(name, overrides = {}) {
  return capability({
    name,
    canonical_identity: `router/${name}`,
    semantic_type: 'skill',
    invocation: { availability: 'available', runtime: 'claude', command: name, args: [] },
    ...overrides,
  });
}

function contractRecord(name, overrides = {}, evidenceOverrides = {}) {
  const base = {
    schema_version: 1,
    type: 'skill',
    native_type: 'claude:skill',
    semantic_type: 'skill',
    lifecycle: 'ready',
    lifecycle_role: 'invocable',
    name,
    canonical_identity: `router/${name}`,
    scope: { kind: 'global' },
    enabled: true,
    dispatchable: true,
    invocation: { availability: 'available', runtime: 'claude', command: 'Skill', args: [name] },
    dependencies: { state: 'declared', items: [] },
    provenance: [{
      runtime: 'claude', scope: 'global', logical_root: 'fixture_home',
      relative_path: `capabilities/${name}/manifest.md`,
      source_fingerprint: `fixture-${name}`, adapter: 'claude@fixture', parser: 'frontmatter@fixture',
    }],
    adapter_evidence: [{
      namespace: 'claude', native_type: 'claude:skill',
      adapter: 'claude@fixture', parser: 'frontmatter@fixture',
    }],
    runtime_variants: [{ runtime: 'claude', native_identity: name, native: { fixture: true } }],
    conflicts: [],
    diagnostics: [],
    ...overrides,
  };
  const evidence = contractEvidence(base);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  for (const [field, value] of Object.entries(evidenceOverrides)) {
    evidence[field][0].value = value;
  }
  return { ...base, contract: buildCapabilityContract(base, evidence) };
}

function activeEdge(type, sourceId, targetId, overrides = {}) {
  return {
    id: `${type}:${sourceId}:${targetId}`,
    type,
    source_id: sourceId,
    target_id: targetId,
    freshness: 'fresh',
    ...overrides,
  };
}

function graph(edges = []) {
  return { schema_version: 1, policy_version: 'relationship-rules-v1', edges, candidates: [] };
}

test('[42-red:semantic-compilation] rejects native-identity collision — same native_type, different stable id, no variant edge', async () => {
  const { compileRelationshipGraph } = await relationshipsModule;
  const alpha = simpleRecord('alpha', { native_type: 'claude:skill' });
  const beta = simpleRecord('beta', { native_type: 'claude:skill' });
  assert.notEqual(stableCapabilityId(alpha), stableCapabilityId(beta));
  const result = compileRelationshipGraph({
    records: [alpha, beta],
    relationships: graph(),
  });
  assert.equal(result.schema_version, 1);
  assert.equal(result.policy_version, 'compilation-rules-v1');
  assert.equal(result.compiled, false);
  assert.ok(result.diagnostics.some(d => d.reason_codes.includes('compilation_native_collision')));
});

test('[42-red:semantic-compilation] accepts same native_type when a variant edge links the records', async () => {
  const { compileRelationshipGraph } = await relationshipsModule;
  const alpha = simpleRecord('alpha', { native_type: 'claude:skill' });
  const beta = simpleRecord('beta', { native_type: 'claude:skill' });
  const variantEdge = activeEdge('variant', stableCapabilityId(alpha), stableCapabilityId(beta));
  const result = compileRelationshipGraph({
    records: [alpha, beta],
    relationships: graph([variantEdge]),
  });
  assert.ok(!result.diagnostics.some(d => d.reason_codes.includes('compilation_native_collision')));
});

test('[42-red:semantic-compilation] returns compiled true with empty diagnostics for a clean graph', async () => {
  const { compileRelationshipGraph } = await relationshipsModule;
  const alpha = simpleRecord('alpha', { native_type: 'claude:skill' });
  const result = compileRelationshipGraph({
    records: [alpha],
    relationships: graph(),
  });
  assert.equal(result.compiled, true);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.reason_codes, []);
});

test('[42-red:semantic-compilation] is non-throwing — returns diagnostics array, never throws', async () => {
  const { compileRelationshipGraph } = await relationshipsModule;
  assert.doesNotThrow(() => compileRelationshipGraph({ records: [], relationships: graph() }));
  assert.doesNotThrow(() => compileRelationshipGraph({}));
  assert.doesNotThrow(() => compileRelationshipGraph());
  const result = compileRelationshipGraph({});
  assert.ok(Array.isArray(result.diagnostics));
});

test('[42-red:semantic-compilation] rejects incompatible composition outputs — empty intersection', async () => {
  const { compileRelationshipGraph } = await relationshipsModule;
  const alpha = contractRecord('alpha', { canonical_identity: 'router/alpha' }, { outputs: ['text'] });
  const beta = contractRecord('beta', { canonical_identity: 'router/beta' }, { inputs: ['image'] });
  const compEdge = activeEdge('composition', stableCapabilityId(alpha), stableCapabilityId(beta));
  const result = compileRelationshipGraph({
    records: [alpha, beta],
    relationships: graph([compEdge]),
  });
  assert.equal(result.compiled, false);
  assert.ok(result.diagnostics.some(d => d.reason_codes.includes('compilation_incompatible_output')));
});

test('[42-red:semantic-compilation] rejects unresolvable contract — dispatch-candidate with unknown DISPATCH_FIELDS field', async () => {
  const { compileRelationshipGraph } = await relationshipsModule;
  const record = contractRecord('alpha', { canonical_identity: 'router/alpha' });
  // Tamper: set a DISPATCH_FIELDS field to unknown while keeping disposition dispatch-candidate
  const tampered = {
    ...record,
    contract: {
      ...record.contract,
      fields: {
        ...record.contract.fields,
        permissions: { ...record.contract.fields.permissions, state: 'unknown' },
      },
      disposition: 'dispatch-candidate',
    },
  };
  const result = compileRelationshipGraph({
    records: [tampered],
    relationships: graph(),
  });
  assert.equal(result.compiled, false);
  assert.ok(result.diagnostics.some(d => d.reason_codes.includes('compilation_unresolvable_contract')));
});