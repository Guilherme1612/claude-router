import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
  contractEvidence,
} from './helpers/inventory-fixture.mjs';
import { canonicalizeCapability, stableStringify, validateCapability } from '../src/registry/schema.mjs';

const profiles = [
  buildClaudeHeavyProfile(),
  buildCodexHeavyProfile(),
  buildMixedCustomProfile(),
  buildUnknownFutureProfile(),
];

test('[phase22-red:contracts] every profile receives complete field envelopes', async () => {
  const { CONTRACT_FIELDS, buildCapabilityContract, validateCapabilityContract } = await import('../src/registry/contract.mjs');
  for (const record of profiles.flat()) {
    const contract = buildCapabilityContract(record, contractEvidence(record));
    assert.deepEqual(Object.keys(contract.fields).sort(), [...CONTRACT_FIELDS].sort());
    for (const envelope of Object.values(contract.fields)) {
      assert.ok(['known', 'unknown'].includes(envelope.state));
      assert.ok(Array.isArray(envelope.evidence));
      assert.ok(Array.isArray(envelope.rejected_evidence));
      assert.equal(envelope.policy_version, 'contract-policy-v1');
      assert.ok(['fresh', 'stale', 'unknown'].includes(envelope.freshness));
      assert.ok(Number.isInteger(envelope.confidence_basis_points));
      assert.ok(Array.isArray(envelope.reason_codes));
    }
    assert.equal('confidence' in contract, false);
    assert.equal(validateCapabilityContract(contract), true);
  }
});

test('[phase22-red:contracts] uncertain dispatch facts remain unknown and recommendation-only', async () => {
  const { buildCapabilityContract } = await import('../src/registry/contract.mjs');
  for (const variant of ['missing', 'conflicting', 'stale', 'below-threshold']) {
    const record = buildClaudeHeavyProfile()[0];
    const contract = buildCapabilityContract(record, contractEvidence(record, variant));
    assert.equal(contract.fields.invocation_kind.state, 'unknown', variant);
    assert.equal('value' in contract.fields.invocation_kind, false, variant);
    assert.equal(contract.disposition, 'recommendation-only', variant);
    assert.ok(contract.reason_codes.includes(`invocation_kind_${variant.replace('-', '_')}`));
  }
});

test('[phase22-red:contracts] rejected evidence is inspectable but privacy safe', async () => {
  const { buildCapabilityContract } = await import('../src/registry/contract.mjs');
  const record = buildClaudeHeavyProfile()[0];
  const contract = buildCapabilityContract(record, contractEvidence(record, 'rejected'));
  const bytes = stableStringify(contract);
  assert.match(bytes, /authored_evidence_rejected/);
  assert.doesNotMatch(bytes, /SECRET|private|authored body|\/Users\//);
});

test('[phase22-red:contracts] record evidence and set permutations have canonical bytes', async () => {
  const { buildCapabilityContract } = await import('../src/registry/contract.mjs');
  const records = profiles.flat().map(record => ({
    ...record,
    contract: buildCapabilityContract(record, contractEvidence(record)),
  }));
  const permuted = records.toReversed().map(record => ({
    ...record,
    contract: {
      ...record.contract,
      fields: Object.fromEntries(Object.entries(record.contract.fields).toReversed().map(([field, envelope]) => [
        field,
        { ...envelope, evidence: envelope.evidence.toReversed(), reason_codes: envelope.reason_codes.toReversed() },
      ])),
    },
  }));
  const bytes = value => stableStringify(value.map(canonicalizeCapability)
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))));
  assert.equal(bytes(records), bytes(permuted));
  for (const record of records) assert.equal(validateCapability(record), true);
});
