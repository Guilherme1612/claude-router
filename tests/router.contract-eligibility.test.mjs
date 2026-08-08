import assert from 'node:assert/strict';
import test from 'node:test';

import { assembleRegistry } from '../src/registry/build.mjs';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { deriveRelationships } from '../src/registry/relationships.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const eligibilityModule = import('../src/registry/eligibility.mjs');

function safeRecord(overrides = {}) {
  const record = {
    ...buildClaudeHeavyProfile()[0],
    dependencies: { state: 'declared', items: [] },
    ...overrides,
  };
  const evidence = contractEvidence(record);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}

function graph(overrides = {}) {
  return { schema_version: 1, policy_version: 'relationship-rules-v1', edges: [], candidates: [], ...overrides };
}

function evaluate(record, overrides = {}) {
  return eligibilityModule.then(({ evaluateEligibility }) => evaluateEligibility({
    record,
    records: [record],
    relationships: graph(),
    ...overrides,
  }));
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

test('[phase22-red:eligibility] all passed gates are eligible through one evaluator', async () => {
  const result = await evaluate(safeRecord());
  assert.equal(result.eligible, true);
  assert.equal(result.recommendation_only, false);
  assert.deepEqual(Object.values(result.gates), Array(10).fill('passed'));
  assert.deepEqual(result.reason_codes, ['eligibility_all_gates_passed']);
});

test('[41-03:quarantine] a safe record is not quarantined', async () => {
  const result = await evaluate(safeRecord());
  assert.equal(result.quarantined, false);
  assert.deepEqual(result.quarantine_reasons, []);
});

test('missing contract safety evidence is recommendation-only [phase22-red:eligibility-gap]', async () => {
  const complete = safeRecord();
  const cases = [
    { ...complete, contract: undefined },
    {
      ...complete,
      contract: {
        ...complete.contract,
        fields: Object.fromEntries(
          Object.entries(complete.contract.fields).filter(([field]) => field !== 'permissions'),
        ),
      },
    },
  ];
  for (const record of cases) {
    const result = await evaluate(record);
    assert.equal(result.eligible, false);
    assert.equal(result.recommendation_only, true);
    assert.ok(!result.reason_codes.includes('eligibility_all_gates_passed'));
    assert.ok(result.reason_codes.includes('permission_unknown'));
    assert.ok(result.reason_codes.includes('field_confidence_unknown'));
  }
});

test('[phase22-red:eligibility] every gate has passed failed and unknown coverage', async () => {
  const base = safeRecord();
  const id = stableCapabilityId(base);
  const cases = {
    target_existence: {
      failed: { records: [] },
      unknown: { record: { ...base, id: '' }, records: [] },
    },
    invocation_shape: {
      failed: { record: { ...base, invocation: { availability: 'unavailable', reason: 'disabled' } } },
      unknown: { record: { ...base, invocation: {} } },
    },
    adapter: {
      failed: { record: { ...base, adapter_evidence: [{ ...base.adapter_evidence[0], native_type: 'other:skill' }] } },
      unknown: { record: { ...base, adapter_evidence: [] } },
    },
    dependency_closure: {
      failed: { record: { ...base, dependencies: { state: 'declared', items: [{ id: 'missing', available: false }] } } },
      unknown: { record: { ...base, dependencies: { state: 'unknown', items: [] } } },
    },
    permission: {
      failed: { record: withField(base, 'permissions', { value: ['denied'] }) },
      unknown: { record: withField(base, 'permissions', { state: 'unknown', value: undefined }) },
    },
    scope: {
      failed: { record: withField(base, 'scope', { value: { kind: 'user', identity: 'other' } }) },
      unknown: { record: withField(base, 'scope', { state: 'unknown', value: undefined }) },
    },
    side_effects: {
      failed: { record: withField(base, 'side_effects', { value: ['destructive'] }) },
      unknown: { record: withField(base, 'side_effects', { state: 'unknown', value: undefined }) },
    },
    reversibility: {
      failed: { record: withField(base, 'reversibility', { value: 'irreversible' }) },
      unknown: { record: withField(base, 'reversibility', { value: 'unknown' }) },
    },
    risk: {
      failed: { record: withField(base, 'risk', { value: 'high' }) },
      unknown: { record: withField(base, 'risk', { value: 'unknown' }) },
    },
    field_confidence: {
      failed: { record: withField(base, 'workflow_transitions', { confidence_basis_points: 8499 }) },
      unknown: { record: withField(base, 'workflow_transitions', { state: 'unknown', value: undefined }) },
    },
  };

  for (const [gate, states] of Object.entries(cases)) {
    for (const [state, changes] of Object.entries(states)) {
      const record = changes.record || base;
      const result = await evaluate(record, {
        records: changes.records ?? [record],
        relationships: graph(),
      });
      assert.equal(result.gates[gate], state, `${gate}:${state}`);
      assert.equal(result.eligible, false, `${gate}:${state}`);
      assert.equal(result.recommendation_only, true, `${gate}:${state}`);
      assert.ok(result.reason_codes.includes(`${gate}_${state}`), `${gate}:${state}`);
    }
  }
  assert.ok(id);
});

test('[phase22-red:eligibility] dependency cycles conflicts disabled targets and missing endpoints fail closed', async () => {
  const base = safeRecord();
  const id = stableCapabilityId(base);
  const other = safeRecord({ name: 'other', canonical_identity: 'router/other' });
  const relationshipCases = [
    graph({ candidates: [{ id: 'cycle', type: 'prerequisite', source_id: id, target_id: stableCapabilityId(other), validation_state: 'inactive', reason_codes: ['relationship_cycle'] }] }),
    graph({ edges: [{ id: 'conflict', type: 'conflict', source_id: id, target_id: stableCapabilityId(other), validation_state: 'active', reason_codes: [] }] }),
    graph({ edges: [{ id: 'missing', type: 'prerequisite', source_id: id, target_id: 'router/missing', validation_state: 'active', reason_codes: [] }] }),
  ];
  for (const relationships of relationshipCases) {
    const result = await evaluate(base, { records: [base, other], relationships });
    assert.notEqual(result.gates.dependency_closure, 'passed');
    assert.equal(result.recommendation_only, true);
  }
  const disabled = { ...base, enabled: false };
  assert.equal((await evaluate(disabled, { records: [disabled] })).gates.target_existence, 'failed');
});

test('[phase22:eligibility] inactive overflow cannot hide prerequisite uncertainty', async () => {
  const base = safeRecord();
  const other = safeRecord({ name: 'other', canonical_identity: 'router/other' });
  const third = safeRecord({ name: 'third', canonical_identity: 'router/third' });
  const prerequisite = (id, source, target) => ({
    id,
    type: 'prerequisite',
    source_id: stableCapabilityId(source),
    target_id: stableCapabilityId(target),
    confidence_basis_points: 9000,
    freshness: 'stale',
    evidence: [{
      kind: 'dependency-declaration',
      provenance: 'adapter',
      confidence_basis_points: 9000,
      freshness: 'fresh',
      rule_version: 'relationship-rules-v1',
    }],
  });
  const relationships = deriveRelationships({
    records: [base, other, third],
    candidates: [
      ...Array.from({ length: 128 }, (_, index) => prerequisite(
        `000-unrelated-${String(index).padStart(3, '0')}`,
        other,
        third,
      )),
      prerequisite('zzz-relevant', base, other),
    ],
  });
  assert.ok(relationships.reason_codes.includes('relationship_inactive_overflow'));
  assert.equal(relationships.candidates.some(value => value.id === 'zzz-relevant'), false);
  const result = await evaluate(base, { records: [base, other, third], relationships });
  assert.equal(result.gates.dependency_closure, 'unknown');
  assert.equal(result.eligible, false);
});

test('[phase22-red:eligibility] multiple failures have canonical gate and reason order', async () => {
  const base = safeRecord();
  const unsafe = withField(
    withField(base, 'risk', { value: 'high' }),
    'permissions',
    { value: ['denied'] },
  );
  const forward = await evaluate(unsafe, { records: [unsafe] });
  const reverse = await evaluate({
    ...unsafe,
    contract: {
      ...unsafe.contract,
      fields: Object.fromEntries(Object.entries(unsafe.contract.fields).reverse()),
    },
  });
  assert.equal(stableStringify(forward), stableStringify(reverse));
  assert.deepEqual(forward.reason_codes, ['permission_failed', 'risk_failed']);
});

test('[phase22-red:eligibility] authored authority fields and precomputed eligibility are inert', async () => {
  const record = {
    ...safeRecord(),
    dispatchable: false,
    eligibility: { eligible: false, reason_codes: ['authored'] },
    dispatch_eligible: false,
  };
  const result = await evaluate(record);
  assert.equal(result.eligible, true);
  assert.doesNotMatch(stableStringify(result), /authored/);
});

test('[phase22-red:eligibility] assembly replaces authored eligibility and dispatchable together', () => {
  const record = {
    ...safeRecord(),
    dispatchable: false,
    eligibility: {
      schema_version: 1,
      policy_version: 'eligibility-policy-v1',
      eligible: false,
      recommendation_only: true,
      gates: Object.fromEntries([
        'target_existence', 'invocation_shape', 'adapter', 'dependency_closure',
        'permission', 'scope', 'side_effects', 'reversibility', 'risk', 'field_confidence',
      ].map(gate => [gate, gate === 'risk' ? 'failed' : 'passed'])),
      reason_codes: ['risk_failed'],
    },
  };
  const built = assembleRegistry({
    claude: { observations: [record], diagnostics: [] },
    codex: { observations: [], diagnostics: [] },
  }, { relationships: graph() });
  const derived = built.registry.records[0];
  assert.equal(derived.dispatchable, false);
  assert.equal(derived.eligibility.eligible, false);
  assert.ok(derived.eligibility.reason_codes.includes('risk_unknown'));
});
