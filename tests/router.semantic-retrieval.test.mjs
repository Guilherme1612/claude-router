import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { retrieveSemanticCandidates } from '../src/registry/semantic.mjs';
import { parseSemanticIntent } from '../src/intent/semantic.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

function capability(name, semantic, roles) {
  const base = {
    ...buildClaudeHeavyProfile()[0],
    name,
    canonical_identity: `fixture/${name}`,
    dependencies: { state: 'declared', items: [] },
    semantic,
    composition: { roles, requires: [], conflicts: [], exclusive: false },
    cost: { latency: 'low', context_bytes: 256, tool_calls: 1 },
    effects: ['none'],
    risk: { level: 'low', source: 'declared' },
    authority: { ceiling: 'inspect', source: 'declared' },
  };
  const evidence = contractEvidence(base);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  evidence.authority[0].value = 'inspect';
  evidence.permissions[0].value = ['read'];
  evidence.scope[0].value = base.scope;
  evidence.cost[0].value = 'low';
  return { ...base, contract: buildCapabilityContract(base, evidence) };
}

const relationship = capability('riverstone', {
  intents: ['inspect'], subjects: ['database', 'relationship'], operations: ['inspect', 'trace'],
  outputs: ['relationships', 'report'], evidence: ['adapter'], aliases: ['data model map'],
}, ['relationship-analysis']);

const ui = capability('lantern', {
  intents: ['redesign'], subjects: ['ui'], operations: ['redesign', 'implement', 'review'],
  outputs: ['design', 'tests', 'review'], evidence: ['adapter'], aliases: ['interface overhaul'],
}, ['design-direction', 'ux-system', 'implementation', 'review']);

test('SEMR-04/05: database relationship request returns explainable eligible diagnostics', () => {
  const intent = parseSemanticIntent('examine the data model connections');
  const result = retrieveSemanticCandidates({ intent, records: [relationship, ui] });
  assert.equal(result.status, 'resolved');
  assert.equal(result.workflow_id, 'relationship-inspection');
  assert.equal(result.selected.stable_id, relationship.canonical_identity);
  assert.equal(result.selected.workflow_coverage.complete, true);
  assert.equal(result.selected.availability.available, true);
  assert.equal(result.selected.authority.value, 'inspect');
  assert.equal(result.selected.risk.value, 'low');
  assert.equal(result.selected.cost.value, 'low');
  assert.equal(result.selected.evidence.strength, 'present');
});

test('SEMR-06: substantial UI request selects a generic workflow without product names', () => {
  const intent = parseSemanticIntent('overhaul the frontend visual system and review the result');
  const result = retrieveSemanticCandidates({ intent, records: [relationship, ui] });
  assert.equal(result.status, 'resolved');
  assert.equal(result.workflow_id, 'substantial-ui-redesign');
  assert.equal(result.selected.stable_id, ui.canonical_identity);
  assert.deepEqual(result.selected.workflow_coverage.covered_roles, [
    'design-direction', 'implementation', 'review', 'ux-system',
  ]);
});

test('SEMR-05: ineligible records remain diagnostic but cannot be selected', () => {
  const unavailable = { ...relationship, enabled: false, dispatchable: false };
  const result = retrieveSemanticCandidates({
    intent: parseSemanticIntent('inspect the database relationships'),
    records: [unavailable],
  });
  assert.equal(result.status, 'unresolved');
  assert.equal(result.dispatch_eligible, false);
  assert.ok(result.candidates.length > 0);
  assert.equal(result.candidates[0].availability.available, false);
  assert.equal(result.candidates[0].eligibility.eligible, false);
  assert.ok(result.candidates[0].eligibility.reason_codes.length > 0);
});

test('SEMR-05: deterministic tie returns clarification instead of guessing', () => {
  const twin = capability('stonebridge', relationship.semantic, relationship.composition.roles);
  const result = retrieveSemanticCandidates({
    intent: parseSemanticIntent('inspect database relationships'),
    records: [relationship, twin],
  });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.dispatch_eligible, false);
  assert.equal(result.fallback.kind, 'clarification');
});
