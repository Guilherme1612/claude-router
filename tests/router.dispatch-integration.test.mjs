import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const classifyModule = import('../src/intent/classify.mjs');
const actionsModule = import('../src/orchestrator/actions.mjs');
const nextPromptModule = import('../src/orchestrator/next-prompt.mjs');

function readyCapability(overrides = {}) {
  const record = {
    ...buildClaudeHeavyProfile()[0],
    dependencies: { state: 'declared', items: [] },
    ...overrides,
  };
  const evidence = contractEvidence(record, 'workflow-transitions');
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}

function freshPlannedGsdState(overrides = {}) {
  return {
    status: 'active',
    freshness: 'fresh',
    position: { family: 'gsd', state: 'planned' },
    gates: { plan_approved: true },
    dependencies_safe: true,
    ...overrides,
  };
}

function registryWith(records, eligibilityById = null) {
  const eligibility = eligibilityById ?? Object.fromEntries(
    records.map(record => {
      let id;
      try { id = stableCapabilityId(record); } catch { id = ''; }
      return [id, { schema_version: 1, policy_version: 'eligibility-policy-v1', eligible: true, recommendation_only: false, gates: {}, reason_codes: ['eligibility_all_gates_passed'] }];
    })
  );
  return { records, eligibility };
}

test('[phase23-red:dispatch] go to the next phase selects one eligible capability end-to-end', async () => {
  const { classifyIntent } = await classifyModule;
  const { resolveAction } = await actionsModule;
  const { synthesizeNextPrompt } = await nextPromptModule;

  const capability = readyCapability();
  const registry = registryWith([capability]);

  const intent = classifyIntent('go to the next phase');
  assert.equal(intent.disposition, 'execute');
  assert.equal(intent.dispatch_eligible, true);

  const action = resolveAction({ intent, state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'selected');
  assert.equal(action.reason_code, 'unique_eligible_capability');
  assert.equal(stableCapabilityId(action.capability), stableCapabilityId(capability));

  const prompt = synthesizeNextPrompt({ selection: action, capability: action.capability });
  assert.ok(prompt.includes('<!-- router-inject -->'));
  assert.ok(prompt.includes('<context-recovery'));
  assert.ok(/atlas/.test(prompt));
  assert.equal(/\/gsd-/.test(prompt), false);
});

test('[phase23-red:dispatch] non-execute intent blocks with intent_not_execute before any capability is read', async () => {
  const { classifyIntent } = await classifyModule;
  const { resolveAction } = await actionsModule;

  const capability = readyCapability();
  const registry = registryWith([capability]);

  const intent = classifyIntent('what does the next phase do');
  assert.notEqual(intent.disposition, 'execute');
  assert.equal(intent.dispatch_eligible, false);

  const action = resolveAction({ intent, state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'intent_not_execute');
  assert.equal(action.capability, undefined);
});

test('[phase23-red:dispatch] hook records are never selected even when contract matches', async () => {
  const { classifyIntent } = await classifyModule;
  const { resolveAction } = await actionsModule;

  const hookRecord = {
    ...readyCapability(),
    type: 'hook',
    lifecycle: 'ready',
    event: 'UserPromptSubmit',
  };
  const registry = registryWith([hookRecord]);

  const intent = classifyIntent('go to the next phase');
  const action = resolveAction({ intent, state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'no_eligible_capability');
});

test('[phase23-red:dispatch] stale or unknown workflow_transitions envelope is never matched', async () => {
  const { classifyIntent } = await classifyModule;
  const { resolveAction } = await actionsModule;

  const capability = readyCapability();
  // Force the workflow_transitions envelope to unknown (no accepted value).
  capability.contract.fields.workflow_transitions = {
    state: 'unknown',
    evidence: [],
    rejected_evidence: [],
    provenance: [],
    policy_version: capability.contract.policy_version,
    freshness: 'unknown',
    confidence_basis_points: 0,
    reason_codes: ['workflow_transitions_missing'],
  };
  const registry = registryWith([capability]);

  const intent = classifyIntent('go to the next phase');
  const action = resolveAction({ intent, state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'no_eligible_capability');
});