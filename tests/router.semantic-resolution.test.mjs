import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const semanticModule = import('../src/registry/semantic.mjs');

function contractRecord(overrides = {}, evidenceOverrides = {}) {
  const base = {
    ...buildClaudeHeavyProfile()[0],
    dependencies: { state: 'declared', items: [] },
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

function emptyRelationships() {
  return { schema_version: 1, policy_version: 'relationship-rules-v1', edges: [], candidates: [] };
}

test('[42-red:semantic-resolution] resolves a record whose outputs match outcome.requires without workflow_id', async () => {
  const { resolveSemanticOutcome } = await semanticModule;
  const record = contractRecord(
    { name: 'alpha', canonical_identity: 'router/alpha' },
    { outputs: ['text'], inputs: ['prompt'] },
  );
  const result = resolveSemanticOutcome({
    outcome: { requires: ['text'] },
    records: [record],
    relationships: emptyRelationships(),
  });
  assert.equal(result.schema_version, 1);
  assert.equal(result.policy_version, 'semantic-resolution-v1');
  assert.equal(result.status, 'resolved');
  assert.equal(result.match.stable_id, stableCapabilityId(record));
  assert.deepEqual(result.match.contract_fields.outputs, ['text']);
  assert.deepEqual(result.reason_codes, []);
});

test('[42-red:semantic-resolution] filters out records with disposition recommendation-only', async () => {
  const { resolveSemanticOutcome } = await semanticModule;
  const evidence = contractEvidence({
    ...buildClaudeHeavyProfile()[0],
    name: 'alpha',
    canonical_identity: 'router/alpha',
    dependencies: { state: 'declared', items: [] },
  });
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  evidence.outputs[0].value = ['text'];
  delete evidence.permissions;
  const base = {
    ...buildClaudeHeavyProfile()[0],
    name: 'alpha',
    canonical_identity: 'router/alpha',
    dependencies: { state: 'declared', items: [] },
  };
  const record = { ...base, contract: buildCapabilityContract(base, evidence) };
  assert.equal(record.contract.disposition, 'recommendation-only');
  const result = resolveSemanticOutcome({
    outcome: { requires: ['text'] },
    records: [record],
    relationships: emptyRelationships(),
  });
  assert.equal(result.status, 'unresolved');
  assert.ok(result.reason_codes.includes('no_semantic_match'));
});

test('[42-red:semantic-resolution] filters out matches where evaluateEligibility returns eligible false (Pitfall 2 backstop)', async () => {
  const { resolveSemanticOutcome } = await semanticModule;
  const record = contractRecord(
    { name: 'alpha', canonical_identity: 'router/alpha', enabled: false },
    { outputs: ['text'], inputs: ['prompt'] },
  );
  assert.equal(record.contract.disposition, 'dispatch-candidate');
  const result = resolveSemanticOutcome({
    outcome: { requires: ['text'] },
    records: [record],
    relationships: emptyRelationships(),
  });
  assert.equal(result.status, 'unresolved');
  assert.ok(result.reason_codes.includes('no_semantic_match'));
});

test('[42-red:semantic-resolution] surfaces ambiguous ties — two records with identical contract fit', async () => {
  const { resolveSemanticOutcome } = await semanticModule;
  const alpha = contractRecord(
    { name: 'alpha', canonical_identity: 'router/alpha' },
    { outputs: ['text'], inputs: ['prompt'] },
  );
  const beta = contractRecord(
    { name: 'beta', canonical_identity: 'router/beta' },
    { outputs: ['text'], inputs: ['prompt'] },
  );
  const result = resolveSemanticOutcome({
    outcome: { requires: ['text'] },
    records: [alpha, beta],
    relationships: emptyRelationships(),
  });
  assert.equal(result.status, 'ambiguous');
  const ids = [stableCapabilityId(alpha), stableCapabilityId(beta)].sort();
  assert.deepEqual(result.candidates, ids);
});