import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
  contractEvidence,
} from './helpers/inventory-fixture.mjs';
import { assembleRegistry } from '../src/registry/build.mjs';
import { contentFingerprint, stableCapabilityId } from '../src/registry/identity.mjs';
import { canonicalizeCapability, stableStringify, validateCapability } from '../src/registry/schema.mjs';

const profiles = [
  buildClaudeHeavyProfile(),
  buildCodexHeavyProfile(),
  buildMixedCustomProfile(),
  buildUnknownFutureProfile(),
];

test('assembleRegistry constructs and overlays every authoritative contract [phase22-red:assembly-gap]', async () => {
  const { validateCapabilityContract } = await import('../src/registry/contract.mjs');
  const observations = buildClaudeHeavyProfile();
  const acquisition = {
    claude: { observations, diagnostics: [] },
    codex: { observations: [], diagnostics: [] },
  };
  const plain = assembleRegistry(acquisition);
  assert.equal(plain.registry.records.length, observations.length);
  for (const record of plain.registry.records) {
    assert.equal(validateCapabilityContract(record.contract), true);
    for (const [field, envelope] of Object.entries(record.contract.fields)) {
      assert.equal(envelope.policy_version, 'contract-policy-v2');
      if (['authority', 'dependencies', 'risk', 'side_effects'].includes(field)) {
        assert.equal(envelope.state, 'unknown');
        assert.equal(envelope.freshness, 'unknown');
        assert.equal(envelope.confidence_basis_points, 0);
      } else {
        assert.equal(envelope.freshness, 'fresh');
        assert.equal(envelope.confidence_basis_points, 10000);
        assert.ok(envelope.evidence.every(item => item.rule_version.startsWith('adapter-')));
      }
      assert.ok(envelope.reason_codes.length);
    }
  }

  const target = observations[0];
  const overlay = {
    schema_version: 1,
    kind: 'contract-overlay-v1',
    overlay_id: 'correction:atlas-risk',
    provenance: 'correction',
    binding: {
      stable_id: stableCapabilityId(target),
      source_fingerprint: contentFingerprint(target),
      scope: target.scope,
      runtime: target.invocation.runtime,
    },
    fields: { risk: { value: 'low' } },
  };
  const enriched = assembleRegistry(acquisition, { overlays: [overlay] });
  assert.deepEqual(
    enriched.registry.records.map(record => record.id),
    plain.registry.records.map(record => record.id),
  );
  assert.equal(enriched.registry.records.length, observations.length);
  assert.equal(enriched.overlays.accepted.length, 1);
  assert.equal(
    enriched.registry.records.find(record => record.id === stableCapabilityId(target)).contract.fields.risk.value,
    'low',
  );
});

test('[phase22-red:contracts] every profile receives complete field envelopes', async () => {
  const { CONTRACT_FIELDS, buildCapabilityContract, validateCapabilityContract } = await import('../src/registry/contract.mjs');
  for (const record of profiles.flat()) {
    const contract = buildCapabilityContract(record, contractEvidence(record));
    assert.deepEqual(Object.keys(contract.fields).sort(), [...CONTRACT_FIELDS].sort());
    for (const envelope of Object.values(contract.fields)) {
      assert.ok(['known', 'unknown'].includes(envelope.state));
      assert.ok(Array.isArray(envelope.evidence));
      assert.ok(Array.isArray(envelope.rejected_evidence));
      assert.equal(envelope.policy_version, 'contract-policy-v2');
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
