import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyEvidence, AUTHORITY_CRITICAL_FIELDS, TRUSTED_PROVENANCE } from '../src/registry/trust.mjs';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

test('[phase41:trust-evidence] manifest provenance for authority-critical field is untrusted', () => {
  const result = classifyEvidence('permissions', { provenance: 'manifest', confidence_basis_points: 10000 });
  assert.equal(result.trusted, false);
  assert.equal(result.reason_code, 'untrusted_evidence_rejected');
});

test('[phase41:trust-evidence] adapter provenance for authority-critical field is trusted', () => {
  const result = classifyEvidence('permissions', { provenance: 'adapter', confidence_basis_points: 10000 });
  assert.equal(result.trusted, true);
  assert.equal(result.reason_code, '');
});

test('[phase41:trust-evidence] correction provenance for authority-critical field is trusted', () => {
  const result = classifyEvidence('permissions', { provenance: 'correction', confidence_basis_points: 10000 });
  assert.equal(result.trusted, true);
  assert.equal(result.reason_code, '');
});

test('[phase41:trust-evidence] informational field accepts inferred manifest evidence', () => {
  const result = classifyEvidence('purpose', { provenance: 'manifest', confidence_basis_points: 8500 });
  assert.equal(result.trusted, true);
  assert.equal(result.reason_code, '');
});

test('[phase41:trust-evidence] manifest permissions claim does not reach envelope value', () => {
  const record = buildClaudeHeavyProfile()[0];
  const evidence = contractEvidence(record);
  evidence.permissions = [{
    value: ['elevated'],
    provenance: 'manifest',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    rule: 'manifest-permissions-v1',
  }];
  const contract = buildCapabilityContract(record, evidence);
  assert.equal(contract.fields.permissions.state, 'unknown');
  assert.equal('value' in contract.fields.permissions, false);
  const rejected = contract.fields.permissions.rejected_evidence;
  assert.ok(
    rejected.some(item => item.reason_code === 'untrusted_evidence_rejected'),
    'rejected_evidence carries untrusted_evidence_rejected',
  );
});

test('[phase41:trust-evidence] plugin private and learned provenance for side_effects are rejected', () => {
  for (const provenance of ['plugin', 'private', 'learned']) {
    const result = classifyEvidence('side_effects', { provenance, confidence_basis_points: 10000 });
    assert.equal(result.trusted, false, `${provenance} not trusted`);
    assert.equal(result.reason_code, 'untrusted_evidence_rejected', `${provenance} reason code`);
  }
});

test('[phase41:trust-evidence] untrusted evidence for risk yields unknown state and class', () => {
  const record = buildClaudeHeavyProfile()[0];
  const evidence = contractEvidence(record);
  evidence.risk = [{
    value: 'high',
    provenance: 'manifest',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    rule: 'manifest-risk-v1',
  }];
  const contract = buildCapabilityContract(record, evidence);
  assert.equal(contract.fields.risk.state, 'unknown');
  assert.equal(contract.fields.risk.evidence_class, 'unknown');
  assert.equal('value' in contract.fields.risk, false);
});

test('[phase41:trust-evidence] AUTHORITY_CRITICAL_FIELDS and TRUSTED_PROVENANCE are frozen sets', () => {
  assert.ok(AUTHORITY_CRITICAL_FIELDS instanceof Set);
  assert.ok(TRUSTED_PROVENANCE instanceof Set);
  for (const field of ['permissions', 'side_effects', 'risk', 'reversibility', 'invocation_kind']) {
    assert.ok(AUTHORITY_CRITICAL_FIELDS.has(field), `${field} is authority-critical`);
  }
  for (const provenance of ['adapter', 'correction']) {
    assert.ok(TRUSTED_PROVENANCE.has(provenance), `${provenance} is trusted`);
  }
});