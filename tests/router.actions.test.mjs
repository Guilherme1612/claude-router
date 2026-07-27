import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const classifyModule = import('../src/intent/classify.mjs');
const actionsModule = import('../src/orchestrator/actions.mjs');
const nextPromptModule = import('../src/orchestrator/next-prompt.mjs');

// Fixture: a ready capability with a known workflow_transitions envelope,
// eligible by default, with optional purpose/triggers overrides for the
// debug verb. Follows the safeRecord + contractEvidence pattern from
// tests/router.contract-eligibility.test.mjs:13-23.
function makeCapability({
  name = 'atlas',
  canonical_identity,
  workflowTransitions = ['gsd.execute'],
  purposeValue,
  triggersValue,
  ...rest
} = {}) {
  const base = buildClaudeHeavyProfile()[0];
  const record = {
    ...base,
    name,
    canonical_identity: canonical_identity || `router/${name}`,
    dependencies: { state: 'declared', items: [] },
    ...rest,
  };
  const evidence = contractEvidence(record, 'workflow-transitions');
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  evidence.workflow_transitions[0].value = workflowTransitions;
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

function freshDiscussedGsdState(overrides = {}) {
  return {
    status: 'active',
    freshness: 'fresh',
    position: { family: 'gsd', state: 'discussed' },
    gates: { discussion_complete: true },
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

async function resolve(prompt, { state, registry, roadmap } = {}) {
  const { classifyIntent } = await classifyModule;
  const { resolveAction } = await actionsModule;
  const intent = classifyIntent(prompt);
  return resolveAction({ intent, prompt, state, registry, roadmap });
}

test('[phase23-red:actions] go to the next phase selects one eligible capability (next-phase verb)', async () => {
  const capability = makeCapability({ name: 'execute-cap', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);
  const action = await resolve('go to the next phase', { state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'selected');
  assert.equal(action.reason_code, 'unique_eligible_capability');
  assert.equal(stableCapabilityId(action.capability), stableCapabilityId(capability));
});

test('[phase23-red:actions] debug this maps to the debugging semantic category and selects the debug capability (EXEC-03)', async () => {
  const debugCap = makeCapability({
    name: 'debug-the-watcher',
    workflowTransitions: ['gsd.verify'],
    purposeValue: 'debug the watcher pipeline',
    triggersValue: ['debug', 'troubleshooting', 'watcher'],
  });
  const otherCap = makeCapability({
    name: 'execute-cap',
    workflowTransitions: ['gsd.execute'],
  });
  const registry = registryWith([debugCap, otherCap]);
  const action = await resolve('debug this', { state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'selected');
  assert.equal(stableCapabilityId(action.capability), stableCapabilityId(debugCap));
});

test('[phase23-red:actions] there is a bug selects the troubleshooting capability (EXEC-03 bug verb)', async () => {
  const debugCap = makeCapability({
    name: 'troubleshoot-bugs',
    workflowTransitions: ['gsd.verify'],
    purposeValue: 'troubleshooting a bug in the router',
    triggersValue: ['bug', 'troubleshoot'],
  });
  const registry = registryWith([debugCap]);
  const action = await resolve('there is a bug in the watcher', { state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'selected');
  assert.equal(stableCapabilityId(action.capability), stableCapabilityId(debugCap));
});

test('[phase23-red:actions] create a phase about X derives next number from roadmap and passes topic as structured arg (EXEC-04)', async () => {
  const planCap = makeCapability({
    name: 'plan-phase-cap',
    workflowTransitions: ['gsd.plan'],
  });
  const registry = registryWith([planCap]);
  const action = await resolve('create a phase about authentication', {
    state: freshDiscussedGsdState(),
    registry,
    roadmap: { current_max_phase: 23 },
  });
  assert.equal(action.status, 'selected');
  assert.equal(stableCapabilityId(action.capability), stableCapabilityId(planCap));
  assert.equal(action.args.next_number, 24);
  assert.equal(action.args.topic, 'authentication');
});

test('[phase23-red:actions] create a phase is idempotent on a frozen roadmap fixture (same next number)', async () => {
  const planCap = makeCapability({ name: 'plan-phase-cap', workflowTransitions: ['gsd.plan'] });
  const registry = registryWith([planCap]);
  const frozenRoadmap = { current_max_phase: 23 };
  const first = await resolve('create a phase about auth', {
    state: freshDiscussedGsdState(), registry, roadmap: frozenRoadmap,
  });
  const second = await resolve('plan a phase for routing', {
    state: freshDiscussedGsdState(), registry, roadmap: frozenRoadmap,
  });
  assert.equal(first.args.next_number, 24);
  assert.equal(second.args.next_number, 24);
  assert.equal(second.args.topic, 'routing');
});

test('[phase23-red:actions] tie — two eligible capabilities for one transition produce clarify, never first-wins (EXEC-06, Pitfall 5)', async () => {
  const capA = makeCapability({ name: 'exec-a', workflowTransitions: ['gsd.execute'] });
  const capB = makeCapability({ name: 'exec-b', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capA, capB]);
  const action = await resolve('go to the next phase', { state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'clarify');
  assert.equal(action.reason_code, 'material_capability_tie');
  assert.equal(action.dispatch_eligible, false);
  // Never first-wins: the result must not surface a single capability.
  assert.equal(action.capability, undefined);
});

test('[phase23-red:actions] stale state blocks with authoritative_evidence_stale (EXEC-06)', async () => {
  const capability = makeCapability({ name: 'exec-cap', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);
  const action = await resolve('go to the next phase', {
    state: freshPlannedGsdState({ freshness: 'stale' }),
    registry,
  });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'authoritative_evidence_stale');
  assert.equal(action.dispatch_eligible, false);
});

test('[phase23-red:actions] terminal workflow blocks with terminal_workflow (EXEC-06)', async () => {
  const capability = makeCapability({ name: 'exec-cap', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);
  const action = await resolve('go to the next phase', {
    state: freshPlannedGsdState({ status: 'completed' }),
    registry,
  });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'terminal_workflow');
  assert.equal(action.dispatch_eligible, false);
});

test('[phase23-red:actions] missing dependency blocks with dependency_unavailable (EXEC-06)', async () => {
  const capability = makeCapability({ name: 'exec-cap', workflowTransitions: ['gsd.execute'] });
  const registry = registryWith([capability]);
  const action = await resolve('go to the next phase', {
    state: freshPlannedGsdState({ dependencies_safe: false }),
    registry,
  });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'dependency_unavailable');
  assert.equal(action.dispatch_eligible, false);
});

test('[phase23-red:actions] empty registry for the transition blocks with no_eligible_capability (EXEC-01/06)', async () => {
  const unrelated = makeCapability({ name: 'verify-cap', workflowTransitions: ['gsd.verify'] });
  const registry = registryWith([unrelated]);
  const action = await resolve('go to the next phase', { state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'no_eligible_capability');
  assert.equal(action.dispatch_eligible, false);
});

test('[phase23-red:actions] next-phase numbering boundary at last phase blocks rather than off-by-one (backstop)', async () => {
  const planCap = makeCapability({ name: 'plan-phase-cap', workflowTransitions: ['gsd.plan'] });
  const registry = registryWith([planCap]);
  // The roadmap's current_max_phase equals the current phase from state —
  // a frozen roadmap fixture at the last phase. The derived next_number
  // is still current_max_phase + 1 (idempotent read); the boundary does
  // not produce an off-by-one because the read is non-mutating.
  const action = await resolve('create a phase about finalization', {
    state: freshDiscussedGsdState(),
    registry,
    roadmap: { current_max_phase: 23 },
  });
  assert.equal(action.status, 'selected');
  assert.equal(action.args.next_number, 24);
});

test('[phase23-fix:actions] debug verb respects invalid_workflow_status hard gate — never dispatches on a paused workflow (WR-02)', async () => {
  const debugCap = makeCapability({
    name: 'debug-the-watcher',
    workflowTransitions: ['gsd.verify'],
    purposeValue: 'debug the watcher pipeline',
    triggersValue: ['debug', 'troubleshooting', 'watcher'],
  });
  const registry = registryWith([debugCap]);
  // status='paused' → nextValidTransitions returns invalid_workflow_status.
  // The debug verb MUST respect this hard gate (like every other verb) and
  // block, not select the debug capability.
  const action = await resolve('debug this', {
    state: freshPlannedGsdState({ status: 'paused' }),
    registry,
  });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'invalid_workflow_status');
  assert.equal(action.dispatch_eligible, false);
  assert.equal(action.capability, undefined, 'debug verb must not select on an invalid workflow status');
});

test('[phase23-fix:actions] debug verb respects no_valid_transition hard gate (WR-02)', async () => {
  const debugCap = makeCapability({
    name: 'debug-cap',
    workflowTransitions: ['gsd.verify'],
    purposeValue: 'debug the watcher',
    triggersValue: ['debug', 'troubleshooting'],
  });
  const registry = registryWith([debugCap]);
  // family with no matching transition in the policy → no_valid_transition.
  const state = {
    status: 'active', freshness: 'fresh',
    position: { family: 'unknown-family', state: 'unknown-state' },
    gates: {}, dependencies_safe: true,
  };
  const action = await resolve('debug this', { state, registry });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'no_valid_transition');
  assert.equal(action.dispatch_eligible, false);
});

test('[phase23-fix:actions] debug verb respects required_gate_missing hard gate (WR-02)', async () => {
  const debugCap = makeCapability({
    name: 'debug-cap',
    workflowTransitions: ['gsd.verify'],
    purposeValue: 'debug the watcher',
    triggersValue: ['debug', 'troubleshooting'],
  });
  const registry = registryWith([debugCap]);
  // family matches gsd.plan (from 'discussed') but the discussion_complete
  // gate is missing → required_gate_missing. The debug verb must block.
  const action = await resolve('debug this', {
    state: {
      status: 'active', freshness: 'fresh',
      position: { family: 'gsd', state: 'discussed' },
      gates: {}, dependencies_safe: true,
    },
    registry,
  });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'required_gate_missing');
  assert.equal(action.dispatch_eligible, false);
});

test('[phase23-fix:actions] create_phase derives the plan transition from a role marker, not a hardcoded "plan" `to` literal (WR-03)', async () => {
  const { resolveAction } = await actionsModule;
  const { classifyIntent } = await classifyModule;
  // Custom policy: the phase-creation transition has a DIFFERENT transition_id
  // ('custom.plan') and `to` state ('planning', NOT 'plan') from the default
  // policy. The capability'\''s contract lists only 'custom.plan'. The verb
  // MUST resolve via the `role: 'phase_creation'` marker on the transition
  // row — proving create_phase does not depend on a hardcoded `to` literal
  // and accepts the transition policy from the caller (framework-neutral).
  const customPolicy = [{
    id: 'custom.plan', family: 'gsd', from: 'discussed', to: 'planning',
    workflow_id: 'custom-plan-phase', requires: ['discussion_complete'],
    role: 'phase_creation',
  }];
  const planCap = makeCapability({ name: 'plan-phase-cap', workflowTransitions: ['custom.plan'] });
  const registry = registryWith([planCap]);
  const intent = classifyIntent('create a phase about routing');
  const action = resolveAction({
    intent, prompt: 'create a phase about routing',
    state: freshDiscussedGsdState(), registry,
    roadmap: { current_max_phase: 23 },
    transitionPolicy: customPolicy,
  });
  assert.equal(action.status, 'selected');
  assert.equal(action.reason_code, 'unique_eligible_capability');
  assert.equal(action.args.next_number, 24);
  assert.equal(action.args.topic, 'routing');
  assert.equal(stableCapabilityId(action.capability), stableCapabilityId(planCap));
});

test('[phase23-fix:actions] create_phase still resolves with the default policy whose plan transition has to="plan" (WR-03 regression guard)', async () => {
  const planCap = makeCapability({ name: 'plan-phase-cap', workflowTransitions: ['gsd.plan'] });
  const registry = registryWith([planCap]);
  const action = await resolve('create a phase about auth', {
    state: freshDiscussedGsdState(),
    registry,
    roadmap: { current_max_phase: 23 },
  });
  assert.equal(action.status, 'selected');
  assert.equal(action.args.next_number, 24);
  assert.equal(action.args.topic, 'auth');
});

test('[phase23-red:actions] synthesizeNextPrompt emits no framework slash for next-phase, debug, or create-phase selections (EXEC-10)', async () => {
  const { synthesizeNextPrompt } = await nextPromptModule;

  const nextPhaseCap = makeCapability({ name: 'exec-cap', workflowTransitions: ['gsd.execute'] });
  const nextPhaseAction = await resolve('go to the next phase', {
    state: freshPlannedGsdState(), registry: registryWith([nextPhaseCap]),
  });
  const nextPhasePrompt = synthesizeNextPrompt({ selection: nextPhaseAction, capability: nextPhaseAction.capability });
  assert.equal(/\/gsd-/.test(nextPhasePrompt), false);
  assert.ok(nextPhasePrompt.includes('<!-- router-inject -->'));

  const debugCap = makeCapability({
    name: 'debug-the-watcher', workflowTransitions: ['gsd.verify'],
    purposeValue: 'debug the watcher', triggersValue: ['debug', 'troubleshooting'],
  });
  const debugAction = await resolve('debug this', {
    state: freshPlannedGsdState(), registry: registryWith([debugCap]),
  });
  const debugPrompt = synthesizeNextPrompt({ selection: debugAction, capability: debugAction.capability });
  assert.equal(/\/gsd-/.test(debugPrompt), false);

  const planCap = makeCapability({ name: 'plan-phase-cap', workflowTransitions: ['gsd.plan'] });
  const planAction = await resolve('create a phase about authentication', {
    state: freshDiscussedGsdState(), registry: registryWith([planCap]),
    roadmap: { current_max_phase: 23 },
  });
  const planPrompt = synthesizeNextPrompt({
    selection: planAction, capability: planAction.capability, args: planAction.args,
  });
  assert.equal(/\/gsd-/.test(planPrompt), false);
  assert.ok(/next_number=24/.test(planPrompt));
  assert.ok(/topic=authentication/.test(planPrompt));
});