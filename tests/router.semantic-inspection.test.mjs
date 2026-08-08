import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const controlModule = import('../src/cli/router-control.mjs');

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

function withEligibility(record, eligible = true, gates = {}) {
  return {
    ...record,
    eligibility: {
      eligible,
      recommendation_only: !eligible,
      gates: Object.fromEntries(Object.entries(gates).sort(([l], [r]) => l.localeCompare(r))),
    },
  };
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

test('[42-red:semantic-inspection] semanticProjection returns requires, produces, and relationship sections for a record with contract fields', async () => {
  const { semanticProjection } = await controlModule;
  const record = withEligibility(safeRecord(), true, { target_existence: 'passed', invocation_shape: 'passed' });
  const subjectId = stableCapabilityId(record);
  const other = safeRecord({ name: 'other', canonical_identity: 'other' });
  const otherId = stableCapabilityId(other);
  const relationships = graph([edge('substitute', subjectId, otherId)]);
  const result = semanticProjection({ record, relationships });
  assert.ok(Array.isArray(result.semantic));
  const kinds = result.semantic.map(item => item.kind);
  assert.ok(kinds.includes('requires'));
  assert.ok(kinds.includes('produces'));
  assert.ok(kinds.includes('relationship'));
});

test('[42-red:semantic-inspection] semanticProjection returns lifecycle section with enabled, lifecycle, eligible, and eligibility_gates fields', async () => {
  const { semanticProjection } = await controlModule;
  const record = withEligibility(safeRecord(), true, { target_existence: 'passed', risk: 'passed' });
  const result = semanticProjection({ record, relationships: graph() });
  assert.ok(typeof result.lifecycle === 'object');
  assert.equal(result.lifecycle.enabled, true);
  assert.equal(typeof result.lifecycle.lifecycle, 'string');
  assert.equal(result.lifecycle.eligible, true);
  assert.ok(typeof result.lifecycle.eligibility_gates === 'object');
});

test('[42-red:semantic-inspection] semanticProjection respects limit and offset — total, returned, truncated, next_offset match boundedResult convention', async () => {
  const { semanticProjection } = await controlModule;
  const record = withEligibility(safeRecord());
  const result = semanticProjection({ record, relationships: graph(), limit: 1, offset: 0 });
  assert.equal(typeof result.total, 'number');
  assert.equal(typeof result.returned, 'number');
  assert.equal(result.returned, 1);
  assert.equal(result.truncated, result.total > 1);
  assert.equal(result.limit, 1);
  assert.equal(result.offset, 0);
  if (result.truncated) {
    assert.equal(result.next_offset, 1);
  }
});

test('[42-red:semantic-inspection] semanticProjection filters relationship edges to those where source_id or target_id matches the record stable_id', async () => {
  const { semanticProjection } = await controlModule;
  const record = withEligibility(safeRecord());
  const subjectId = stableCapabilityId(record);
  const otherA = safeRecord({ name: 'a', canonical_identity: 'a' });
  const otherB = safeRecord({ name: 'b', canonical_identity: 'b' });
  const otherC = safeRecord({ name: 'c', canonical_identity: 'c' });
  const aId = stableCapabilityId(otherA);
  const bId = stableCapabilityId(otherB);
  const cId = stableCapabilityId(otherC);
  // edge involving subjectId, and an edge between two unrelated records
  const relationships = graph([
    edge('substitute', subjectId, aId),
    edge('fallback', bId, cId),
  ]);
  const result = semanticProjection({ record, relationships });
  const relItems = result.semantic.filter(item => item.kind === 'relationship');
  assert.equal(relItems.length, 1);
  assert.equal(relItems[0].source_id, subjectId);
});

test('[42-red:semantic-inspection] semanticProjection throws TypeError invalid_contract_record for a record without a contract object', async () => {
  const { semanticProjection } = await controlModule;
  assert.throws(() => semanticProjection({ record: { name: 'no-contract' }, relationships: {} }), {
    constructor: TypeError,
    message: 'invalid_contract_record',
  });
});

test('[42-red:semantic-inspection] semanticProjection uses safeToken fallback unknown for unsafe tokens — no raw record text echoed', async () => {
  const { semanticProjection } = await controlModule;
  const record = withEligibility(safeRecord());
  const result = semanticProjection({ record, relationships: graph() });
  // All surfaced strings in semantic and lifecycle must not contain control chars or raw paths
  const serialized = stableStringify(result);
  assert.ok(!serialized.includes('\\u0000'));
  assert.ok(!serialized.includes('/Users/'));
});

test('[42-red:semantic-inspection] semanticProjection returns canonical result shape with total, returned, truncated, limit, offset, next_offset, semantic, lifecycle keys', async () => {
  const { semanticProjection } = await controlModule;
  const record = withEligibility(safeRecord());
  const result = semanticProjection({ record, relationships: graph() });
  for (const key of ['total', 'returned', 'truncated', 'limit', 'offset', 'next_offset', 'semantic', 'lifecycle']) {
    assert.ok(Object.hasOwn(result, key), `result missing key: ${key}`);
  }
});