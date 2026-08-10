import assert from 'node:assert/strict';
import test from 'node:test';

import { executeWorkflowPlan } from '../src/orchestrator/workflow-execution.mjs';

function stage(id, capability_id, role, overrides = {}) {
  return {
    id,
    kind: overrides.kind || id,
    depends_on: overrides.depends_on || [],
    role: { capability_id, role },
    context: { sources: ['bounded-stage-context'] },
    bounds: {
      max_context_bytes: 2048,
      max_tool_calls: 2,
      max_concurrency: 1,
      max_retries: 0,
      ...overrides.bounds,
    },
    safety_mode: overrides.safety_mode || 'read-only',
    evidence: { required: overrides.evidence || ['stage-evidence'] },
    ...(overrides.tasks ? { tasks: overrides.tasks } : {}),
  };
}

function plan(stages) {
  return {
    schema_version: 1,
    policy_version: 'workflow-plan-v1',
    status: 'planned',
    dispatch_eligible: false,
    plan_id: 'workflow-plan:test:repository',
    workflow_id: 'coordinator-workflow',
    stages,
  };
}

function capability(capability_id, overrides = {}) {
  return {
    capability_id,
    validated: true,
    available: true,
    eligible: true,
    runtime: 'local',
    safety_modes: ['read-only', 'isolated-write'],
    action: { action_id: capability_id + ':action', safety_mode: 'read-only', side_effects: ['read-only'] },
    async invoke() {
      return {
        actual: { capability_id, role: 'actual-role', runtime: 'local' },
        observation: { runtime_observed: true, reference: 'observation-ref' },
        verdict: 'passed',
        evidence: { reference: 'evidence-ref' },
      };
    },
    ...overrides,
  };
}

const AUTH = { approved: true, runtime_gates: true, read_only: true, write: true };

test('validated read-only tasks fan out within the stage concurrency bound', async () => {
  let active = 0;
  let maxActive = 0;
  const audit = capability('cap/audit', {
    async invoke({ task }) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, task.task_id === 'one' ? 8 : 2));
      active -= 1;
      return {
        actual: { capability_id: 'cap/audit', role: 'audit', runtime: 'local' },
        observation: { runtime_observed: true, task_id: task.task_id },
        verdict: 'passed',
        evidence: { reference: task.task_id + '-evidence' },
      };
    },
  });
  const result = await executeWorkflowPlan({
    plan: plan([
      stage('parallel-read-only-audits', 'cap/audit', 'audit', {
        tasks: [{ task_id: 'one' }, { task_id: 'two' }, { task_id: 'three' }],
        bounds: { max_concurrency: 2 },
      }),
    ]),
    capabilities: [audit],
    authorization: AUTH,
  });
  assert.equal(result.status, 'completed');
  assert.equal(maxActive, 2);
  assert.equal(result.stage_results[0].task_count, 3);
  assert.equal(result.receipts.length, 3);
});

test('isolated writes execute serially and require write authorization', async () => {
  let active = 0;
  let maxActive = 0;
  const write = capability('cap/write', {
    action: { action_id: 'write', safety_mode: 'isolated-write', side_effects: ['isolated-write'] },
    async invoke() {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 3));
      active -= 1;
      return { actual: { capability_id: 'cap/write', role: 'implementation' }, verdict: 'passed' };
    },
  });
  const stages = [
    stage('fix-one', 'cap/write', 'implementation', { safety_mode: 'isolated-write' }),
    stage('fix-two', 'cap/write', 'implementation', { safety_mode: 'isolated-write', depends_on: ['fix-one'] }),
  ];
  const result = await executeWorkflowPlan({ plan: plan(stages), capabilities: [write], authorization: AUTH });
  assert.equal(result.status, 'completed');
  assert.equal(maxActive, 1);

  const denied = await executeWorkflowPlan({
    plan: plan([stages[0]]),
    capabilities: [write],
    authorization: { approved: true, runtime_gates: true, read_only: true, write: false },
  });
  assert.equal(denied.status, 'blocked');
  assert.equal(denied.reason_code, 'write_authorization_required');
});

test('unavailable roles produce a safe truthful fallback and never install or invoke', async () => {
  let invoked = false;
  const unavailable = capability('cap/missing', {
    available: false,
    async invoke() { invoked = true; },
  });
  const result = await executeWorkflowPlan({
    plan: plan([stage('baseline', 'cap/missing', 'inspection')]),
    capabilities: [unavailable],
    authorization: AUTH,
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.reason_code, 'capability_unavailable');
  assert.equal(invoked, false);
  assert.equal(result.stage_results[0].fallback, 'safe_noop');
  assert.doesNotMatch(JSON.stringify(result), /install|auto.?install/i);
});

test('authority, adapter, runtime, and forbidden-effect gates fail closed before invocation', async () => {
  let invoked = false;
  const dangerous = capability('cap/danger', {
    action: { action_id: 'publish', safety_mode: 'read-only', side_effects: ['publish'] },
    async invoke() { invoked = true; },
  });
  const result = await executeWorkflowPlan({
    plan: plan([stage('publish', 'cap/danger', 'reporting')]),
    capabilities: [dangerous],
    authorization: AUTH,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'forbidden_effect');
  assert.equal(invoked, false);

  const unapproved = await executeWorkflowPlan({
    plan: plan([stage('baseline', 'cap/danger', 'inspection')]),
    capabilities: [capability('cap/danger')],
    authorization: { approved: false, runtime_gates: true, read_only: true },
  });
  assert.equal(unapproved.reason_code, 'authority_not_approved');
});

test('browser UAT requires actual interaction and runtime observation, not planning artifacts', async () => {
  const artifactOnly = capability('cap/browser', {
    async invoke() {
      return {
        actual: { capability_id: 'cap/browser', role: 'browser-verification', runtime: 'local' },
        observation: { artifact_ref: 'plan-screenshot', runtime_observed: false, actual_interaction: false },
        verdict: 'passed',
        evidence: { artifact_ref: 'planning-artifact' },
      };
    },
  });
  const failed = await executeWorkflowPlan({
    plan: plan([stage('browser-uat', 'cap/browser', 'browser-verification', {
      kind: 'browser-uat', evidence: ['browser-observation'],
    })]),
    capabilities: [artifactOnly],
    authorization: AUTH,
  });
  assert.equal(failed.status, 'partial');
  assert.equal(failed.stage_results[0].verified, false);
  assert.equal(failed.stage_results[0].reason_code, 'actual_interaction_required');

  const actual = capability('cap/browser', {
    async invoke() {
      return {
        actual: { capability_id: 'cap/browser-actual', role: 'browser-verification', runtime: 'local' },
        observation: { runtime_observed: true, actual_interaction: true, verification_ref: 'real-browser-ref' },
        verdict: 'passed',
        evidence: { verification_ref: 'real-browser-ref' },
      };
    },
  });
  const verified = await executeWorkflowPlan({
    plan: plan([stage('browser-uat', 'cap/browser', 'browser-verification', {
      kind: 'browser-uat', evidence: ['browser-observation'],
    })]),
    capabilities: [actual],
    authorization: AUTH,
  });
  assert.equal(verified.status, 'completed');
  assert.equal(verified.stage_results[0].verified, true);
});

test('receipts link selected and actual capability evidence without raw prompt or output', async () => {
  const result = await executeWorkflowPlan({
    plan: plan([stage('baseline', 'cap/selected', 'inspection')]),
    capabilities: [capability('cap/selected', {
      async invoke() {
        return {
          actual: { capability_id: 'cap/actual', role: 'inspection', runtime: 'local' },
          observation: { runtime_observed: true, stdout: 'private output', env: 'secret' },
          verdict: 'passed',
          evidence: { reference: 'bounded-ref' },
        };
      },
    })],
    authorization: AUTH,
    prompt: 'private raw prompt must never be copied',
  });
  const receipt = result.receipts[0];
  assert.equal(receipt.selected.capability_id, 'cap/selected');
  assert.equal(receipt.actual.capability_id, 'cap/actual');
  assert.equal(receipt.invocation_evidence.action_id, 'baseline');
  assert.equal(receipt.postcondition_evidence.verdict, 'passed');
  assert.doesNotMatch(JSON.stringify(receipt), /private raw prompt|private output|secret|stdout|env/);
});

test('required stage failure stops downstream execution and preserves stage order', async () => {
  let downstreamInvoked = false;
  const fail = capability('cap/fail', {
    async invoke() {
      return { actual: { capability_id: 'cap/fail', role: 'inspection' }, verdict: 'failed', evidence: { reason_code: 'test_failure' } };
    },
  });
  const downstream = capability('cap/downstream', {
    async invoke() { downstreamInvoked = true; },
  });
  const result = await executeWorkflowPlan({
    plan: plan([
      stage('baseline', 'cap/fail', 'inspection'),
      stage('final-report', 'cap/downstream', 'reporting', { depends_on: ['baseline'] }),
    ]),
    capabilities: [fail, downstream],
    authorization: AUTH,
  });
  assert.equal(result.status, 'partial');
  assert.equal(downstreamInvoked, false);
  assert.deepEqual(result.stage_results.map(stageResult => stageResult.stage_id), ['baseline', 'final-report']);
  assert.equal(result.stage_results[1].status, 'blocked');
});
