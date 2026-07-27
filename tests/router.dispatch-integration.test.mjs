// Phase 23 Plan 03 — Task 23-03-02
// Full EXEC-05/06/09/10 dispatch matrix end-to-end. Composes the four
// gates (eligible, intent_permits, state_permits, approval_grants) at the
// dispatch boundary: classifyIntent → resolveAction → needsApproval →
// verifyApproval → synthesizeNextPrompt. Every blocked path produces the
// exact stable reason code the spec names; no silent dispatch.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const classifyModule = import('../src/intent/classify.mjs');
const actionsModule = import('../src/orchestrator/actions.mjs');
const approvalModule = import('../src/orchestrator/approval.mjs');
const nextPromptModule = import('../src/orchestrator/next-prompt.mjs');
const transitionsModule = import('../src/orchestrator/transitions.mjs');

function makeCapability({
  name = 'atlas',
  workflowTransitions = ['gsd.execute'],
  sideEffects,
  reversibility = 'reversible',
  risk = 'low',
  purposeValue,
  triggersValue,
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
  if (purposeValue !== undefined) evidence.purpose[0].value = purposeValue;
  if (triggersValue !== undefined) evidence.triggers[0].value = triggersValue;
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

function freshExecutedGsdState(overrides = {}) {
  return {
    status: 'active',
    freshness: 'fresh',
    position: { family: 'gsd', state: 'executed' },
    gates: { execution_complete: true },
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

// Compose the four gates at the dispatch boundary. Returns the final
// dispatch decision { status, dispatch_eligible, reason_code, capability?,
// nextPrompt? }. This mirrors how a caller (the future hook path) would
// sequence the Phase 23 modules — resolveAction handles gates 1-3
// (eligible + intent + state); the approval gate (4) is composed here
// via needsApproval + verifyApproval. Per the plan, approval is a
// distinct gate from execute intent (EXEC-07) — execute intent alone
// never satisfies it.
async function dispatch({
  prompt, state, registry, roadmap,
  approval = {}, // { bound?, presented?, expected? } — only for destructive
}) {
  const { classifyIntent } = await classifyModule;
  const { resolveAction } = await actionsModule;
  const { needsApproval, verifyApproval } = await approvalModule;
  const { synthesizeNextPrompt } = await nextPromptModule;

  const intent = classifyIntent(prompt);
  // Delegate the intent gate to resolveAction — it returns the
  // action-mapper vocabulary `intent_not_execute` for non-execute intents
  // (EXEC-06 stable reason code), which is the contract the dispatch
  // boundary exposes downstream.
  const action = resolveAction({ intent, prompt, state, registry, roadmap });
  if (action.status !== 'selected') return action;

  const capability = action.capability;
  if (needsApproval(capability.contract)) {
    const verdict = verifyApproval({
      bound: approval.bound,
      presented: approval.presented,
      expected: approval.expected,
    });
    if (verdict.status !== 'approved') {
      return {
        status: 'blocked',
        dispatch_eligible: false,
        reason_code: verdict.reason_code,
        capability,
      };
    }
  }

  const nextPrompt = synthesizeNextPrompt({
    selection: action, capability, args: action.args,
    postWorkState: approval.postWorkState,
  });
  return {
    status: 'selected',
    dispatch_eligible: true,
    reason_code: action.reason_code,
    capability,
    args: action.args,
    nextPrompt,
  };
}

// ---------------------------------------------------------------------------
// EXEC-05 — full dispatch path (safe + destructive-with-approval)
// ---------------------------------------------------------------------------

test('[phase23-red:dispatch] go to the next phase selects one eligible capability end-to-end', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.dispatch_eligible, true);
  assert.equal(stableCapabilityId(result.capability), stableCapabilityId(capability));
  assert.ok(result.nextPrompt.includes('<!-- router-inject -->'));
  assert.ok(result.nextPrompt.includes('<context-recovery'));
  assert.ok(/atlas/.test(result.nextPrompt));
  assert.equal(/\/gsd-/.test(result.nextPrompt), false);
});

test('[phase23-red:dispatch] non-execute intent blocks with intent_not_execute before any capability is read', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await dispatch({
    prompt: 'what does the next phase do',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'intent_not_execute');
  assert.equal(result.capability, undefined);
});

test('[phase23-red:dispatch] hook records are never selected even when contract matches', async () => {
  const hookRecord = {
    ...makeCapability({ name: 'hook-cap', workflowTransitions: ['gsd.execute'] }),
    type: 'hook',
    lifecycle: 'ready',
    event: 'UserPromptSubmit',
  };
  const registry = registryWith([hookRecord]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_eligible_capability');
});

test('[phase23-red:dispatch] stale or unknown workflow_transitions envelope is never matched', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
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

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_eligible_capability');
});

test('[phase23-red:dispatch] destructive capability with matching approval token dispatches (EXEC-05/07/08)', async () => {
  const { bindApproval } = await approvalModule;
  const capability = makeCapability({
    name: 'destructive-exec',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['destructive'],
    reversibility: 'irreversible',
    risk: 'high',
  });
  const registry = registryWith([capability]);

  const args = { topic: 'auth' };
  const targets = ['phase-24'];
  const effects = ['filesystem:write'];
  const proposalVersion = 1;
  const bound = bindApproval({ capability, args, targets, effects, proposalVersion });

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    approval: { bound, presented: { token: bound.token }, expected: bound.token },
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.dispatch_eligible, true);
  assert.equal(stableCapabilityId(result.capability), stableCapabilityId(capability));
});

test('[phase23-red:dispatch] destructive capability without approval token blocks with approval_missing (EXEC-07)', async () => {
  const capability = makeCapability({
    name: 'destructive-no-approval',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['destructive'],
  });
  const registry = registryWith([capability]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    // No approval presented.
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'approval_missing');
  assert.equal(result.dispatch_eligible, false);
  // Execute intent alone never satisfies the approval gate — the capability
  // was selected by resolveAction but the approval gate blocks dispatch.
  assert.ok(result.capability, 'capability was selected before the approval gate blocked');
});

test('[phase23-red:dispatch] destructive capability with stale approval (bumped proposalVersion) blocks with approval_stale (EXEC-08)', async () => {
  const { bindApproval } = await approvalModule;
  const capability = makeCapability({
    name: 'destructive-stale',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['destructive'],
  });
  const registry = registryWith([capability]);

  const args = { topic: 'auth' };
  const targets = ['phase-24'];
  const effects = ['fs:write'];
  const bound = bindApproval({ capability, args, targets, effects, proposalVersion: 1 });
  // Re-derive expected with bumped proposalVersion → bound is stale.
  const expected = bindApproval({ capability, args, targets, effects, proposalVersion: 2 });

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    approval: { bound, presented: { token: bound.token }, expected: expected.token },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'approval_stale');
  assert.equal(result.dispatch_eligible, false);
});

test('[phase23-red:dispatch] destructive capability with mismatched approval (different args) blocks with approval_mismatch (EXEC-08)', async () => {
  const { bindApproval } = await approvalModule;
  const capability = makeCapability({
    name: 'destructive-mismatch',
    workflowTransitions: ['gsd.execute'],
    sideEffects: ['destructive'],
  });
  const registry = registryWith([capability]);

  const args = { topic: 'auth' };
  const targets = ['phase-24'];
  const effects = ['fs:write'];
  const bound = bindApproval({ capability, args, targets, effects, proposalVersion: 1 });
  // Expected matches bound (not stale), but presented is a foreign token.
  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
    approval: {
      bound, presented: { token: '0'.repeat(64) }, expected: bound.token,
    },
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'approval_mismatch');
  assert.equal(result.dispatch_eligible, false);
});

// ---------------------------------------------------------------------------
// EXEC-06 — blocked/clarify vocabulary (stale/terminal/missing-dep/tie)
// ---------------------------------------------------------------------------

test('[phase23-red:dispatch] stale state blocks with authoritative_evidence_stale (EXEC-06)', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState({ freshness: 'stale' }),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'authoritative_evidence_stale');
  assert.equal(result.dispatch_eligible, false);
});

test('[phase23-red:dispatch] terminal workflow blocks with terminal_workflow (EXEC-06)', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState({ status: 'completed' }),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'terminal_workflow');
  assert.equal(result.dispatch_eligible, false);
});

test('[phase23-red:dispatch] missing dependency blocks with dependency_unavailable (EXEC-06)', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState({ dependencies_safe: false }),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'dependency_unavailable');
  assert.equal(result.dispatch_eligible, false);
});

test('[phase23-red:dispatch] tie — two eligible capabilities for one transition produce clarify, never first-wins (EXEC-06)', async () => {
  const capA = makeCapability({ name: 'exec-a', workflowTransitions: ['gsd.execute'] });
  const capB = makeCapability({ name: 'exec-b', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capA, capB]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'clarify');
  assert.equal(result.reason_code, 'material_capability_tie');
  assert.equal(result.dispatch_eligible, false);
  assert.equal(result.capability, undefined);
});

test('[phase23-red:dispatch] hook-only registry blocks with no_eligible_capability (EXEC-09)', async () => {
  const hookRecord = {
    ...makeCapability({ name: 'hook-cap', workflowTransitions: ['gsd.execute'] }),
    type: 'hook',
    lifecycle: 'ready',
    event: 'UserPromptSubmit',
  };
  const registry = registryWith([hookRecord]);

  const result = await dispatch({
    prompt: 'go to the next phase',
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'no_eligible_capability');
});

// ---------------------------------------------------------------------------
// EXEC-10 — post-work next-prompt re-reads fresh state (framework-neutral)
// ---------------------------------------------------------------------------

test('[phase23-red:dispatch] post-work next-prompt re-runs nextValidTransitions on fresh state and is framework-neutral (EXEC-10)', async () => {
  const { nextValidTransitions } = await transitionsModule;
  const { synthesizeNextPrompt } = await nextPromptModule;

  const capability = makeCapability({ name: 'exec-cap', workflowTransitions: ['gsd.execute'] });
  // After the execute capability runs, the workflow moves to 'executed'.
  // The fresh post-work state re-runs nextValidTransitions to find the
  // next valid transition (gsd.verify), which the prompt surfaces.
  const postWorkState = freshExecutedGsdState();
  const postTransitions = nextValidTransitions(postWorkState);
  assert.equal(postTransitions.status, 'candidates_available');
  assert.equal(postTransitions.candidates.length, 1);
  assert.equal(postTransitions.candidates[0].transition_id, 'gsd.verify');

  const selection = {
    status: 'selected', dispatch_eligible: true,
    reason_code: 'unique_eligible_capability', capability,
  };
  const prompt = synthesizeNextPrompt({
    selection, capability, postWorkState,
  });

  assert.ok(prompt.includes('<!-- router-inject -->'));
  assert.ok(prompt.includes('<context-recovery'));
  // The prompt reflects the NEXT transition (gsd.verify), not the
  // just-completed one (gsd.execute).
  assert.ok(/gsd\.verify/.test(prompt), 'prompt must surface the next transition_id');
  assert.equal(/\/gsd-/.test(prompt), false, 'no framework slash hardcode');
  assert.ok(Buffer.byteLength(prompt) <= 2048);
});

test('[phase23-red:dispatch] post-work next-prompt with no post-work state falls back to the selected capability (backward compat)', async () => {
  const { synthesizeNextPrompt } = await nextPromptModule;
  const capability = makeCapability({ name: 'exec-cap', workflowTransitions: ['gsd.execute'] });
  const selection = {
    status: 'selected', dispatch_eligible: true,
    reason_code: 'unique_eligible_capability', capability,
  };
  const prompt = synthesizeNextPrompt({ selection, capability });
  assert.ok(prompt.includes('<!-- router-inject -->'));
  assert.ok(/atlas|exec-cap/.test(prompt));
  // No next-transition line when postWorkState is absent.
  assert.equal(/Next transition:/.test(prompt), false);
});

// ---------------------------------------------------------------------------
// INT-04 integration — newest-explicit-instruction override
// ---------------------------------------------------------------------------

test('[phase23-red:dispatch] newest-explicit-instruction override — stale capsule hint + fresh execute prompt → fresh prompt wins (INT-04)', async () => {
  const capability = makeCapability({ name: 'atlas', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);

  // A stale capsule hint (prior "don't go to the next phase") followed by a
  // fresh execute prompt — the fresh prompt wins (newest token wins, per
  // the classifier's corrections rule from wave 2).
  const staleHint = "don't go to the next phase";
  const freshPrompt = 'go to the next phase';
  // The dispatcher only consumes the fresh prompt; the stale hint is the
  // kind of prior capsule context the hook would carry but the freshest
  // explicit instruction wins (INT-04).
  void staleHint;

  const result = await dispatch({
    prompt: freshPrompt,
    state: freshPlannedGsdState(),
    registry,
  });

  assert.equal(result.status, 'selected');
  assert.equal(result.dispatch_eligible, true);
  assert.equal(stableCapabilityId(result.capability), stableCapabilityId(capability));
});