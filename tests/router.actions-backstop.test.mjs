// Phase 23 backstop tests — close two verification gaps the planner marked
// `verification: backstop` and the verifier routed to human_needed:
//   1. create-phase at the last-phase boundary must BLOCK (terminal_workflow),
//      never produce an off-by-one next_number. The hard gate in
//      nextValidTransitions (TERMINAL_STATUSES) + TRANSITION_REASON_MAP handles
//      this before deriveNextNumber is reached; this test asserts the gate
//      holds for the create_phase verb specifically (the existing terminal
//      test only covered the next_phase verb, and the existing misnamed
//      "boundary" test actually asserted a selected status with next_number=24).
//   2. Idempotent create-phase read: the same prompt twice on the SAME frozen
//      roadmap fixture must produce byte-identical next_number + structured
//      args + capability selection (proves the read is non-mutating / pure).
//
// Both are test-only — no production bug found. The hard-gate + pure-function
// read already behave correctly; these tests pin the claim.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const classifyModule = import('../src/intent/classify.mjs');
const actionsModule = import('../src/orchestrator/actions.mjs');

function makeCapability({
  name = 'atlas',
  canonical_identity,
  workflowTransitions = ['gsd.execute'],
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
  return { ...record, contract: buildCapabilityContract(record, evidence) };
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

function registryWith(records) {
  const eligibility = Object.fromEntries(
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

test('[phase23-backstop:actions] create-phase at last-phase boundary blocks with terminal_workflow, not an off-by-one next number (SC3)', async () => {
  const planCap = makeCapability({ name: 'plan-phase-cap', workflowTransitions: ['gsd.plan'] });
  const registry = registryWith([planCap]);
  // Boundary fixture: the workflow is at its terminal/last phase (status
  // 'completed' is in TERMINAL_STATUSES). The roadmap's current_max_phase is
  // 23 — the "last phase". The create_phase verb MUST hit the hard gate and
  // block with `terminal_workflow`, NOT reach deriveNextNumber and silently
  // emit an off-by-one next_number=24.
  const action = await resolve('create a phase about finalization', {
    state: freshDiscussedGsdState({ status: 'completed' }),
    registry,
    roadmap: { current_max_phase: 23 },
  });
  assert.equal(action.status, 'blocked', 'create_phase at terminal workflow must block, not select');
  assert.equal(action.reason_code, 'terminal_workflow');
  assert.equal(action.dispatch_eligible, false);
  assert.equal(action.capability, undefined, 'must not surface a capability at the terminal boundary');
  assert.equal(action.args, undefined, 'must not derive an off-by-one next_number at the boundary');
});

test('[phase23-backstop:actions] create-phase is idempotent on a frozen roadmap — same prompt twice yields identical next_number + args + capability (SC3)', async () => {
  const planCap = makeCapability({ name: 'plan-phase-cap', workflowTransitions: ['gsd.plan'] });
  const registry = registryWith([planCap]);
  // A frozen roadmap fixture: no mutation between the two calls. The same
  // prompt is dispatched twice to prove deriveNextNumber is a pure read over
  // its argument (no internal state, no file system, no mutation of the
  // roadmap object). Both invocations must return byte-identical structured
  // args and select the same capability.
  const frozenRoadmap = Object.freeze({ current_max_phase: 23 });
  const frozenState = Object.freeze(freshDiscussedGsdState());

  const first = await resolve('create a phase about authentication', {
    state: frozenState, registry, roadmap: frozenRoadmap,
  });
  const second = await resolve('create a phase about authentication', {
    state: frozenState, registry, roadmap: frozenRoadmap,
  });

  assert.equal(first.status, 'selected');
  assert.equal(second.status, 'selected');
  assert.equal(first.args.next_number, second.args.next_number, 'next_number must be identical across calls (idempotent read)');
  assert.equal(first.args.next_number, 24);
  assert.equal(first.args.topic, second.args.topic, 'topic must be identical for the same prompt');
  assert.equal(first.args.topic, 'authentication');
  assert.equal(first.reason_code, second.reason_code, 'reason_code must be identical');
  assert.equal(stableCapabilityId(first.capability), stableCapabilityId(second.capability), 'capability selection must be identical');
  assert.equal(stableCapabilityId(first.capability), stableCapabilityId(planCap));
  // The frozen roadmap must not have been mutated by either call.
  assert.deepEqual(frozenRoadmap, { current_max_phase: 23 }, 'frozen roadmap object must remain unchanged');
});