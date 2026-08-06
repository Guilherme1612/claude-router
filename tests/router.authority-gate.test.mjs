// Phase 39 Plan 02 — Task 1 (RED)
// AUTH-04/05 authority-gate integration tests. Composes
//   resolveAction → evaluateAuthorityPolicy → gateAction
// over the existing action-mapper vocabulary. gateAction is a thin
// post-processor that maps the policy decision onto the existing
// proceed/paused/clarify/blocked status vocabulary; it never
// re-implements resolveAction.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const actionsModule = import('../src/orchestrator/actions.mjs');
const approvalModule = import('../src/orchestrator/approval.mjs');
const authorityModule = import('../src/intent/authority.mjs');
const classifyModule = import('../src/intent/classify.mjs');

function makeCapability({
  name = 'atlas',
  workflowTransitions = ['gsd.execute'],
  sideEffects,
  reversibility = 'reversible',
  risk = 'low',
  ...rest
} = {}) {
  const base = buildClaudeHeavyProfile()[0];
  const record = {
    ...base,
    name,
    canonical_identity: `router/${name}`,
    dependencies: { state: 'declared', items: [] },
    ...rest,
  };
  const evidence = contractEvidence(record, 'workflow-transitions');
  evidence.reversibility[0].value = reversibility;
  evidence.risk[0].value = risk;
  evidence.workflow_transitions[0].value = workflowTransitions;
  if (sideEffects !== undefined) evidence.side_effects[0].value = sideEffects;
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
      return [id, {
        schema_version: 1, policy_version: 'eligibility-policy-v1',
        eligible: true, recommendation_only: false, gates: {},
        reason_codes: ['eligibility_all_gates_passed'],
      }];
    }),
  );
  return { records, eligibility };
}

// Compose resolveAction → evaluateAuthorityPolicy → gateAction exactly as
// the future router.mjs hot path will. Returns the final gate decision.
async function gate({
  prompt, state, registry, roadmap,
  confidence = 'medium',
  authority = { authGranted: true, protected_: false },
  risk = { reversible: true, local: true },
  compatibility = { eligible: true, disposition: 'dispatch-candidate' },
  approval = null, // { capability, args, targets, effects, proposalVersion }
}) {
  const { resolveAction, gateAction } = await actionsModule;
  const { classifyIntent } = await classifyModule;
  const { evaluateAuthorityPolicy } = await authorityModule;
  const approvalMod = await approvalModule;

  const intent = classifyIntent(prompt);
  const resolved = resolveAction({ intent, prompt, state, registry, roadmap });
  const policy = evaluateAuthorityPolicy({ confidence, authority, risk, compatibility });
  const approvalBinding = approvalMod;
  return gateAction({
    resolved,
    policy,
    approval: approval
      ? { bind: ({ capability }) => approvalMod.bindApproval({ capability, ...approval }) }
      : null,
  });
}

test('[phase39:authority-gate] AUTH-04 medium+explicit+reversible+local+fit → proceed without repeating the command', async () => {
  const capability = makeCapability({ name: 'safe-cap', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'medium',
    authority: { authGranted: true, protected_: false },
    risk: { reversible: true, local: true },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
  });

  assert.equal(result.status, 'proceed');
  assert.equal(result.dispatch_eligible, true);
  assert.equal(result.reason_code, 'reversible_local_authorized');
  assert.equal(result.policy.decision, 'proceed');
  assert.ok(result.capability, 'proceed must carry the selected capability');
});

test('[phase39:authority-gate] AUTH-04 low confidence + authority + reversible + local → ask (clarify)', async () => {
  const capability = makeCapability({ name: 'low-conf-cap', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'low',
    authority: { authGranted: true, protected_: false },
    risk: { reversible: true, local: true },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
  });

  assert.equal(result.status, 'clarify');
  assert.equal(result.dispatch_eligible, false);
  assert.equal(result.reason_code, 'low_confidence_clarify');
});

test('[phase39:authority-gate] AUTH-05 protected effect → paused with a bound non-empty approval token', async () => {
  const capability = makeCapability({
    name: 'deploy-cap',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['deploy'],
  });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'high',
    authority: { authGranted: true, protected_: true },
    risk: { reversible: false, local: false },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
    approval: {
      args: { topic: 'deploy' },
      targets: ['phase-40'],
      effects: ['filesystem:write'],
      proposalVersion: 1,
    },
  });

  assert.equal(result.status, 'paused');
  assert.equal(result.dispatch_eligible, false);
  assert.equal(result.reason_code, 'protected_effect_requires_confirmation');
  assert.equal(typeof result.approval_token, 'string');
  assert.ok(result.approval_token && result.approval_token.length > 0, 'paused must bind a non-empty approval token');
});

test('[phase39:authority-gate] AUTH-05 paused gate is recoverable — matching presented token → approved', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const capability = makeCapability({
    name: 'recoverable-cap',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['push'],
  });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'high',
    authority: { authGranted: true, protected_: true },
    risk: { reversible: false, local: false },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
    approval: {
      args: { topic: 'ship' },
      targets: ['phase-40'],
      effects: ['git:push'],
      proposalVersion: 1,
    },
  });

  assert.equal(result.status, 'paused');
  // Re-derive the expected fresh token over the same args.
  const expected = bindApproval({
    capability: result.capability,
    args: { topic: 'ship' },
    targets: ['phase-40'],
    effects: ['git:push'],
    proposalVersion: 1,
  });
  const verdict = verifyApproval({
    bound: { token: result.approval_token },
    presented: { token: result.approval_token },
    expected: expected.token,
  });
  assert.equal(verdict.status, 'approved');
  assert.equal(verdict.reason_code, 'approval_bound');
});

test('[phase39:authority-gate] AUTH-05 mismatched presented token → approval_mismatch (fail-closed)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const capability = makeCapability({
    name: 'mismatch-cap',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['credentialed'],
  });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'high',
    authority: { authGranted: true, protected_: true },
    risk: { reversible: false, local: false },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
    approval: { args: { topic: 'x' }, targets: ['p'], effects: ['fs:write'], proposalVersion: 1 },
  });

  assert.equal(result.status, 'paused');
  const expected = bindApproval({
    capability: result.capability, args: { topic: 'x' },
    targets: ['p'], effects: ['fs:write'], proposalVersion: 1,
  });
  const verdict = verifyApproval({
    bound: { token: result.approval_token },
    presented: { token: '0'.repeat(64) },
    expected: expected.token,
  });
  assert.equal(verdict.status, 'blocked');
  assert.equal(verdict.reason_code, 'approval_mismatch');
});

test('[phase39:authority-gate] AUTH-04 resolveAction blocked → gateAction passes through unchanged', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  // A non-execute intent → resolveAction returns blocked intent_not_execute.
  const result = await gate({
    prompt: 'what does the next phase do',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'intent_not_execute');
  // Pass-through: policy attached for telemetry, status/reason_code unchanged.
  assert.ok(result.policy, 'policy attached to the pass-through result');
});

test('[phase39:authority-gate] AUTH-04 resolveAction clarify (material tie) → gateAction passes through', async () => {
  const a = makeCapability({ name: 'cap-a', workflowTransitions: ['gsd.execute'] });
  const b = makeCapability({ name: 'cap-b', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([a, b]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'clarify');
  assert.equal(result.reason_code, 'material_capability_tie');
});

test('[phase39:authority-gate] AUTH-05 non-reversible + authorized + local → paused (non_reversible_or_external_requires_confirmation)', async () => {
  const capability = makeCapability({
    name: 'external-cap',
    workflowTransitions: ['gsd.execute'],
    reversibility: 'irreversible',
  });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'high',
    authority: { authGranted: true, protected_: false },
    risk: { reversible: false, local: true },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
    approval: { args: { topic: 'x' }, targets: ['p'], effects: ['fs:write'], proposalVersion: 1 },
  });

  assert.equal(result.status, 'paused');
  assert.equal(result.reason_code, 'non_reversible_or_external_requires_confirmation');
  assert.ok(result.approval_token, 'non-reversible pause must bind an approval token');
});

test('[phase39:authority-gate] AUTH-03 independence: weights never grant permission — high confidence + no authority → block', async () => {
  const capability = makeCapability({ name: 'no-auth-cap', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'high',
    authority: { authGranted: false, protected_: false },
    risk: { reversible: true, local: true },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'authority_not_granted');
});

test('[phase39:authority-gate] AUTH-03 protected fires before authority_not_granted regardless of confidence', async () => {
  const capability = makeCapability({
    name: 'protected-noauth-cap',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['destructive'],
  });
  const registry = registryWith([capability]);

  const result = await gate({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    confidence: 'high',
    authority: { authGranted: false, protected_: true },
    risk: { reversible: false, local: false },
    compatibility: { eligible: true, disposition: 'dispatch-candidate' },
    approval: { args: { topic: 'x' }, targets: ['p'], effects: ['fs:write'], proposalVersion: 1 },
  });

  // Protected leg wins over authority_not_granted: pause, not block.
  assert.equal(result.status, 'paused');
  assert.equal(result.reason_code, 'protected_effect_requires_confirmation');
});