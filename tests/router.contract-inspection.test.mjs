import assert from 'node:assert/strict';
import test from 'node:test';

import * as control from '../src/cli/router-control.mjs';
import { assembleRegistry } from '../src/registry/build.mjs';
import { buildCapabilityContract, CONTRACT_FIELDS } from '../src/registry/contract.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const secret = 'SECRET-authored-body';
const evidence = {
  provenance: 'manifest',
  rule_version: 'contract-overlay-v1',
  freshness: 'fresh',
  confidence_basis_points: 9000,
  accepted: true,
  reason_code: 'purpose_accepted',
  raw_body: secret,
  absolute_path: '/Users/private-user/project',
};

function record(id = 'router/alpha') {
  return {
    id,
    stable_id: id,
    contract: {
      schema_version: 1,
      policy_version: 'contract-policy-v1',
      disposition: 'recommendation-only',
      reason_codes: ['risk_missing'],
      fields: {
        purpose: {
          state: 'known',
          value: `authored ${secret}`,
          evidence: [evidence],
          rejected_evidence: [{ ...evidence, accepted: false, reason_code: 'authored_evidence_rejected' }],
          provenance: ['manifest'],
          policy_version: 'contract-policy-v1',
          freshness: 'fresh',
          confidence_basis_points: 9000,
          reason_codes: ['purpose_accepted'],
        },
        risk: {
          state: 'unknown',
          evidence: [],
          rejected_evidence: [],
          provenance: [],
          policy_version: 'contract-policy-v1',
          freshness: 'unknown',
          confidence_basis_points: 0,
          reason_codes: ['risk_missing'],
        },
      },
    },
    eligibility: {
      schema_version: 1,
      policy_version: 'eligibility-policy-v1',
      eligible: false,
      recommendation_only: true,
      gates: { target_existence: 'passed', risk: 'unknown' },
      reason_codes: ['risk_unknown'],
    },
  };
}

const relationships = {
  schema_version: 1,
  policy_version: 'relationship-rules-v1',
  edges: [{
    id: 'relationship:alias:router/alpha:router/beta',
    type: 'alias',
    source_id: 'router/alpha',
    target_id: 'router/beta',
    confidence_basis_points: 10000,
    freshness: 'fresh',
    evidence: [{ kind: 'explicit-alias', provenance: 'manifest', confidence_basis_points: 10000, freshness: 'fresh', rule_version: 'relationship-rules-v1', raw_body: secret }],
    validation_state: 'active',
    reason_codes: [],
  }],
  candidates: [{
    id: 'relationship:alias:router/alpha:router/missing',
    type: 'alias',
    source_id: 'router/alpha',
    target_id: 'router/missing',
    confidence_basis_points: 4000,
    freshness: 'unknown',
    evidence: [],
    validation_state: 'inactive',
    reason_codes: ['relationship_dangling_target'],
  }],
};

test('[phase22-red:inspection] contract list and detail are bounded deterministic and privacy safe', () => {
  assert.equal(typeof control.contractListProjection, 'function');
  assert.equal(typeof control.contractDetailProjection, 'function');
  const records = [record('router/zeta'), record('router/alpha')];
  const list = control.contractListProjection({ records, limit: 1, offset: 1 });
  assert.deepEqual(list, {
    total: 2, returned: 1, truncated: false, limit: 1, offset: 1, next_offset: null,
    contracts: [{
      stable_id: 'router/zeta',
      disposition: 'recommendation-only',
      reason_codes: ['risk_missing'],
      eligible: false,
      recommendation_only: true,
      eligibility_reason_codes: ['risk_unknown'],
    }],
  });
  const detail = control.contractDetailProjection(record());
  assert.deepEqual(Object.keys(detail.fields), ['purpose', 'risk']);
  assert.equal(detail.fields.risk.state, 'unknown');
  assert.equal('value' in detail.fields.purpose, false);
  assert.doesNotMatch(JSON.stringify(detail), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(detail), /\/Users\/private-user|raw_body|absolute_path/);
});

test('[phase22-red:inspection] relationship view keeps active and inactive reasons with bounded parity', () => {
  assert.equal(typeof control.relationshipProjection, 'function');
  const result = control.relationshipProjection({ relationships, limit: 1, offset: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.returned, 1);
  assert.equal(result.relationships[0].validation_state, 'inactive');
  assert.deepEqual(result.relationships[0].reason_codes, ['relationship_dangling_target']);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
});

test('[phase22-red:inspection] contract text has JSON semantics without ANSI or controls', () => {
  assert.equal(typeof control.renderContractText, 'function');
  const data = control.contractDetailProjection(record());
  const result = {
    command: 'contract',
    ok: true,
    reason_code: 'contract_detail_ready',
    data,
    warnings: [],
  };
  const text = control.renderContractText(result);
  for (const [key, value] of Object.entries(data).sort(([left], [right]) => left.localeCompare(right))) {
    assert.match(text, new RegExp(`^${key.toUpperCase()} ${escapeRegExp(typeof value === 'object' ? stableStringify(value) : String(value))}$`, 'm'));
  }
  assert.doesNotMatch(text, /\u001b|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
});

test('[phase22-red:inspection] assembly preserves safe inspection state in the canonical registry', () => {
  const source = buildClaudeHeavyProfile()[0];
  const installed = { ...source, contract: buildCapabilityContract(source, contractEvidence(source)) };
  const built = assembleRegistry({
    claude: { observations: [installed], diagnostics: [] },
    codex: { observations: [], diagnostics: [] },
  }, {
    overlays: [{
      schema_version: 1,
      kind: 'contract-overlay-v1',
      overlay_id: '../unsafe',
      provenance: 'correction',
      binding: {},
      fields: {},
    }],
    relationshipCandidates: [{
      id: 'relationship:missing',
      type: 'alias',
      source_id: 'missing',
      target_id: 'also-missing',
      confidence_basis_points: 0,
      freshness: 'unknown',
      evidence: [],
    }],
  });
  assert.deepEqual(built.registry.relationships, built.relationships);
  assert.deepEqual(built.registry.rejected_overlays, built.overlays.rejected);
  assert.equal(built.registry.rejected_overlays[0].reason_code, 'overlay_id_unsafe');
});

test('[phase41:trust] contract detail projects evidence_class and new fields for every CONTRACT_FIELDS entry', () => {
  const source = buildClaudeHeavyProfile()[0];
  const contract = buildCapabilityContract(source, contractEvidence(source));
  const rec = {
    stable_id: 'router/atlas',
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
  const detail = control.contractDetailProjection(rec);
  assert.deepEqual(Object.keys(detail.fields).sort(), [...CONTRACT_FIELDS].sort());
  for (const [field, value] of Object.entries(detail.fields)) {
    assert.ok(
      ['explicit', 'inferred', 'conflicting', 'unknown'].includes(value.evidence_class),
      `${field} has valid evidence_class`,
    );
  }
  for (const field of ['action', 'cost', 'completion', 'native_invocation']) {
    assert.ok(field in detail.fields, `${field} projected`);
  }
  for (const value of Object.values(detail.fields)) {
    for (const item of [...value.evidence, ...value.rejected_evidence]) {
      assert.equal('value' in item, false, 'evidence item must not expose raw value');
    }
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
