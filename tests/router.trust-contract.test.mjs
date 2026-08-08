import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract, CONTRACT_FIELDS } from '../src/registry/contract.mjs';
import * as control from '../src/cli/router-control.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

function recordWithContract(record, evidence) {
  const contract = buildCapabilityContract(record, evidence);
  return {
    stable_id: `router/${record.name}`,
    contract,
    eligibility: {
      schema_version: 1,
      policy_version: 'eligibility-policy-v1',
      eligible: true,
      recommendation_only: false,
      gates: {},
      reason_codes: ['eligibility_all_gates_passed'],
    },
  };
}

test('[phase41:trust-contract] adapter-provenance evidence yields evidence_class=explicit', () => {
  const record = buildClaudeHeavyProfile()[0];
  const contract = buildCapabilityContract(record, contractEvidence(record));
  assert.equal(contract.fields.purpose.evidence_class, 'explicit');
});

test('[phase41:trust-contract] manifest-provenance evidence at inferred threshold yields evidence_class=inferred', () => {
  const record = buildClaudeHeavyProfile()[0];
  const evidence = contractEvidence(record);
  evidence.purpose = [{
    value: record.name,
    provenance: 'manifest',
    confidence_basis_points: 9000,
    freshness: 'fresh',
    rule: 'manifest-purpose-v1',
  }];
  const contract = buildCapabilityContract(record, evidence);
  assert.equal(contract.fields.purpose.evidence_class, 'inferred');
});

test('[phase41:trust-contract] two distinct asserted values yield evidence_class=conflicting (not unknown)', () => {
  const record = buildClaudeHeavyProfile()[0];
  const contract = buildCapabilityContract(record, contractEvidence(record, 'conflicting'));
  assert.equal(contract.fields.invocation_kind.evidence_class, 'conflicting');
  assert.notEqual(contract.fields.invocation_kind.evidence_class, 'unknown');
});

test('[phase41:trust-contract] no eligible evidence yields evidence_class=unknown', () => {
  const record = buildClaudeHeavyProfile()[0];
  const contract = buildCapabilityContract(record, contractEvidence(record, 'missing'));
  assert.equal(contract.fields.invocation_kind.evidence_class, 'unknown');
});

test('[phase41:trust-contract] CONTRACT_FIELDS contains action cost completion native_invocation', () => {
  for (const field of ['action', 'cost', 'completion', 'native_invocation']) {
    assert.ok(CONTRACT_FIELDS.includes(field), `${field} in CONTRACT_FIELDS`);
  }
});

test('[phase41:trust-contract] contractDetailProjection includes evidence_class for each projected field', () => {
  const record = buildClaudeHeavyProfile()[0];
  const rec = recordWithContract(record, contractEvidence(record));
  const detail = control.contractDetailProjection(rec);
  assert.deepEqual(Object.keys(detail.fields).sort(), [...CONTRACT_FIELDS].sort());
  for (const [field, value] of Object.entries(detail.fields)) {
    assert.ok(
      ['explicit', 'inferred', 'conflicting', 'unknown'].includes(value.evidence_class),
      `${field} has valid evidence_class`,
    );
  }
});

test('[phase41:trust-contract] no evidence item in projection exposes a raw value key', () => {
  const record = buildClaudeHeavyProfile()[0];
  const rec = recordWithContract(record, contractEvidence(record));
  const detail = control.contractDetailProjection(rec);
  for (const value of Object.values(detail.fields)) {
    for (const item of [...value.evidence, ...value.rejected_evidence]) {
      assert.equal('value' in item, false, 'evidence item must not expose raw value');
    }
  }
});