import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const substituteModule = import('../src/registry/substitute.mjs');
const dispatchContractModule = import('../src/adapters/dispatch/contract.mjs');

function safeRecord(overrides = {}) {
  const record = {
    ...buildClaudeHeavyProfile()[0],
    dependencies: { state: 'declared', items: [] },
    ...overrides,
  };
  const evidence = contractEvidence(record);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  evidence.permissions[0].value = ['read'];
  evidence.scope[0].value = record.scope;
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}

function substituteRecord(original, overrides = {}) {
  const record = {
    ...original,
    name: `${original.name}-sub`,
    canonical_identity: `${original.canonical_identity || original.name}-sub`,
    ...overrides,
  };
  const evidence = contractEvidence(record);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  evidence.permissions[0].value = ['read'];
  evidence.scope[0].value = record.scope;
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}

function edge(type, sourceId, targetId, overrides = {}) {
  return {
    id: `${type}:${sourceId}:${targetId}`,
    type,
    source_id: sourceId,
    target_id: targetId,
    confidence_basis_points: 9000,
    freshness: 'fresh',
    evidence: [{
      kind: type === 'substitute' ? 'explicit-substitution' : 'fallback-declaration',
      provenance: 'adapter',
      confidence_basis_points: 9000,
      freshness: 'fresh',
      rule_version: 'relationship-rules-v1',
    }],
    ...overrides,
  };
}

function graph(edges = []) {
  return { schema_version: 1, policy_version: 'relationship-rules-v1', edges, candidates: [] };
}

function withField(record, field, envelope) {
  return {
    ...record,
    contract: {
      ...record.contract,
      fields: {
        ...record.contract.fields,
        [field]: { ...record.contract.fields[field], ...envelope },
      },
    },
  };
}

test('[42-red:semantic-substitution] zero substitute/fallback edges returns blocked with no_compatible_substitute', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  const result = resolveSubstitution({ failedRecord: original, records: [original], relationships: graph() });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_compatible_substitute');
});

test('[42-red:semantic-substitution] one compatible candidate within bounds returns substituted', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  const sub = substituteRecord(original);
  const originalId = stableCapabilityId(original);
  const subId = stableCapabilityId(sub);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub],
    relationships: graph([edge('substitute', originalId, subId)]),
  });
  assert.equal(result.status, 'substituted');
  assert.equal(result.bounds_unchanged, true);
  assert.equal(result.original_route, originalId);
  assert.equal(result.substitute_route, subId);
});

test('[42-red:semantic-substitution] multiple compatible candidates returns ambiguous with sorted candidates', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  const sub1 = substituteRecord(original, { name: `${original.name}-sub1`, canonical_identity: `${original.name}-sub1` });
  const sub2 = substituteRecord(original, { name: `${original.name}-sub2`, canonical_identity: `${original.name}-sub2` });
  const originalId = stableCapabilityId(original);
  const sub1Id = stableCapabilityId(sub1);
  const sub2Id = stableCapabilityId(sub2);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub1, sub2],
    relationships: graph([
      edge('substitute', originalId, sub1Id),
      edge('substitute', originalId, sub2Id),
    ]),
  });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.reason_code, 'ambiguous_substitute');
  assert.deepEqual(result.candidates, [sub1Id, sub2Id].sort());
});

test('[42-red:semantic-substitution] substitute with broader permissions than original is not selected', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  const sub = withField(substituteRecord(original), 'permissions', { state: 'known', value: ['read', 'write'] });
  const originalId = stableCapabilityId(original);
  const subId = stableCapabilityId(sub);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub],
    relationships: graph([edge('substitute', originalId, subId)]),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_compatible_substitute');
});

test('[42-red:semantic-substitution] substitute with higher risk than original is not selected', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  const sub = withField(substituteRecord(original), 'risk', { state: 'known', value: 'high' });
  const originalId = stableCapabilityId(original);
  const subId = stableCapabilityId(sub);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub],
    relationships: graph([edge('substitute', originalId, subId)]),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_compatible_substitute');
});

test('[42-red:semantic-substitution] substitute with different scope than original is not selected', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord({ scope: { kind: 'global' } });
  const sub = substituteRecord(original, { scope: { kind: 'user', identity: 'someone' } });
  const originalId = stableCapabilityId(original);
  const subId = stableCapabilityId(sub);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub],
    relationships: graph([edge('substitute', originalId, subId)]),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_compatible_substitute');
});

test('[42-red:semantic-substitution] substitute with less-safe reversibility than original is not selected', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  const sub = withField(substituteRecord(original), 'reversibility', { state: 'known', value: 'irreversible' });
  const originalId = stableCapabilityId(original);
  const subId = stableCapabilityId(sub);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub],
    relationships: graph([edge('substitute', originalId, subId)]),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_compatible_substitute');
});

test('[42-red:semantic-substitution] unknown-reversibility substitute for reversible original is not selected (bound violation)', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  // original reversibility is 'reversible' (set in safeRecord). Substitute with
  // 'unknown' reversibility must NOT pass bounds: 'reversible' is safest, and an
  // unverified-unknown substitute cannot stand in for a known-reversible original.
  const sub = withField(substituteRecord(original), 'reversibility', { state: 'known', value: 'unknown' });
  const originalId = stableCapabilityId(original);
  const subId = stableCapabilityId(sub);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub],
    relationships: graph([edge('substitute', originalId, subId)]),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_compatible_substitute');
});

test('[42-red:semantic-substitution] both routes retained as stableCapabilityId strings', async () => {
  const { resolveSubstitution } = await substituteModule;
  const original = safeRecord();
  const sub = substituteRecord(original);
  const originalId = stableCapabilityId(original);
  const subId = stableCapabilityId(sub);
  const result = resolveSubstitution({
    failedRecord: original,
    records: [original, sub],
    relationships: graph([edge('substitute', originalId, subId)]),
  });
  assert.equal(typeof result.original_route, 'string');
  assert.equal(typeof result.substitute_route, 'string');
  assert.equal(result.original_route, originalId);
  assert.equal(result.substitute_route, subId);
});

test('semantic-substitution: RECEIPT_STATES includes the current substituted transition', async () => {
  const { RECEIPT_STATES } = await dispatchContractModule;
  assert.ok(RECEIPT_STATES.includes('substituted'));
});

test('[42-red:semantic-substitution] resolveSubstitution is non-throwing for invalid/missing failedRecord', async () => {
  const { resolveSubstitution } = await substituteModule;
  const result1 = resolveSubstitution({ failedRecord: null, records: [], relationships: graph() });
  assert.equal(result1.status, 'blocked');
  assert.equal(result1.reason_code, 'no_compatible_substitute');
  const result2 = resolveSubstitution({ failedRecord: undefined, records: [], relationships: graph() });
  assert.equal(result2.status, 'blocked');
  assert.equal(result2.reason_code, 'no_compatible_substitute');
  const result3 = resolveSubstitution({ records: [], relationships: graph() });
  assert.equal(result3.status, 'blocked');
  assert.equal(result3.reason_code, 'no_compatible_substitute');
});
