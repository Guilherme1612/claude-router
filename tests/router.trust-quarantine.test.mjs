import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { validateEligibility } from '../src/registry/schema.mjs';
import { RECEIPT_STATES } from '../src/adapters/dispatch/contract.mjs';
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
  return {
    schema_version: 1,
    policy_version: 'relationship-rules-v1',
    edges: [],
    candidates: [],
    ...overrides,
  };
}

async function evaluate(record, overrides = {}) {
  const { evaluateEligibility } = await eligibilityModule;
  return evaluateEligibility({
    record,
    records: [record],
    relationships: graph(),
    ...overrides,
  });
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

const REASON_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

// --- Task 1: TRUST-05 quarantine disposition ---

test('a quarantined record has quarantined===true and quarantine_reasons is a non-empty array', async () => {
  const base = safeRecord();
  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });
  const result = await evaluate(injectionRecord);
  assert.equal(result.quarantined, true);
  assert.ok(Array.isArray(result.quarantine_reasons));
  assert.ok(result.quarantine_reasons.length > 0);
});

test('a quarantined record has eligible===false and recommendation_only===true', async () => {
  const base = safeRecord();
  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });
  const result = await evaluate(injectionRecord);
  assert.equal(result.eligible, false);
  assert.equal(result.recommendation_only, true);
});

test('an independent valid fallback with same semantic_type but different stableCapabilityId remains eligible', async () => {
  const base = safeRecord();
  const sibling = safeRecord({ canonical_identity: 'router/beacon' });
  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });

  const quarantinedResult = await evaluate(injectionRecord, { records: [injectionRecord, sibling] });
  const siblingResult = await evaluate(sibling, { records: [injectionRecord, sibling] });

  assert.equal(quarantinedResult.quarantined, true);
  assert.equal(siblingResult.eligible, true);
  assert.equal(siblingResult.quarantined, false);
});

test('an injection-bearing capability is quarantined with reason_code injection_bearing', async () => {
  const base = safeRecord();
  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });
  const result = await evaluate(injectionRecord);
  assert.equal(result.quarantined, true);
  assert.ok(result.quarantine_reasons.includes('injection_bearing'));
});

test('a scope-escaping capability is quarantined with reason_code scope_escaping', async () => {
  const base = safeRecord();
  // invocation_kind.value='agent' but record.semantic_type='skill' → scope escape
  const scopeEscapeRecord = withField(base, 'invocation_kind', { value: 'agent' });
  const result = await evaluate(scopeEscapeRecord);
  assert.equal(result.quarantined, true);
  assert.ok(result.quarantine_reasons.includes('scope_escaping'));
});

test('a valid non-quarantined record has quarantined===false and quarantine_reasons===[]', async () => {
  const result = await evaluate(safeRecord());
  assert.equal(result.quarantined, false);
  assert.deepEqual(result.quarantine_reasons, []);
});

test('validateEligibility accepts quarantined and quarantine_reasons fields without throwing', async () => {
  const { ELIGIBILITY_GATES } = await eligibilityModule;
  const quarantinedEligibility = {
    schema_version: 1,
    policy_version: 'eligibility-policy-v1',
    eligible: false,
    recommendation_only: true,
    gates: Object.fromEntries(ELIGIBILITY_GATES.map(gate => [gate, 'passed'])),
    reason_codes: ['eligibility_all_gates_passed'],
    quarantined: true,
    quarantine_reasons: ['injection_bearing'],
  };
  // Should not throw
  validateEligibility(quarantinedEligibility);
  assert.ok(true);
});

test('validateEligibility accepts a non-quarantined eligibility without quarantined fields', () => {
  // Existing pre-TRUST-05 eligibility objects do not have quarantined/quarantine_reasons.
  // validateEligibility must still accept them (validate-if-present).
  const { ELIGIBILITY_GATES } = {
    ELIGIBILITY_GATES: [
      'target_existence', 'invocation_shape', 'adapter', 'dependency_closure',
      'permission', 'scope', 'side_effects', 'reversibility', 'risk', 'field_confidence',
    ],
  };
  const legacyEligibility = {
    schema_version: 1,
    policy_version: 'eligibility-policy-v1',
    eligible: true,
    recommendation_only: false,
    gates: Object.fromEntries(ELIGIBILITY_GATES.map(gate => [gate, 'passed'])),
    reason_codes: ['eligibility_all_gates_passed'],
  };
  validateEligibility(legacyEligibility);
  assert.ok(true);
});

test('RECEIPT_STATES includes quarantined', () => {
  assert.ok(RECEIPT_STATES.includes('quarantined'));
});

test('quarantine reason tokens match the reason-code convention', async () => {
  const base = safeRecord();
  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });
  const result = await evaluate(injectionRecord);
  for (const reason of result.quarantine_reasons) {
    assert.match(reason, REASON_TOKEN);
  }
});

// --- Task 2: fallback eligibility + isQuarantined helper ---

test('quarantine does not propagate to other records in the same evaluateEligibility call', async () => {
  const base = safeRecord();
  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });
  // evaluateEligibility operates per-record: quarantining one does not affect the other
  const quarantinedResult = await evaluate(injectionRecord, { records: [injectionRecord, base] });
  const validResult = await evaluate(base, { records: [injectionRecord, base] });
  assert.equal(quarantinedResult.quarantined, true);
  assert.equal(validResult.quarantined, false);
  assert.equal(validResult.eligible, true);
});

test('a capability eligible before quarantine becomes quarantined after injection-bearing overlay', async () => {
  const base = safeRecord();
  const before = await evaluate(base);
  assert.equal(before.quarantined, false);
  assert.equal(before.eligible, true);

  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });
  const after = await evaluate(injectionRecord);
  assert.equal(after.quarantined, true);
  assert.equal(after.eligible, false);
});

test('isQuarantined is exported from eligibility.mjs', async () => {
  const { isQuarantined } = await eligibilityModule;
  assert.equal(typeof isQuarantined, 'function');
  const base = safeRecord();
  assert.equal(isQuarantined(base), false);
  const injectionRecord = withField(base, 'purpose', { value: '/etc/passwd' });
  assert.equal(isQuarantined(injectionRecord), true);
});