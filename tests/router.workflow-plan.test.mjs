import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKFLOW_PLAN_LIMITS,
  planWorkflow,
  summarizeWorkflowPlan,
} from '../src/orchestrator/workflow-plan.mjs';

function intent(overrides = {}) {
  return {
    task_family: 'coordinator-workflow',
    task_family_candidates: [
      'quality-audit',
      'bug-diagnosis-fix',
      'browser-interaction-verification',
    ],
    outcome: 'coordinate',
    scope: 'repository',
    requested_autonomy: 'one-turn',
    evidence_needs: ['browser', 'report', 'tests', 'verify'],
    clarification: { needed: false, reason_codes: [] },
    ...overrides,
  };
}

function capability(capability_id, roles, overrides = {}) {
  return {
    capability_id,
    roles,
    validated: true,
    available: true,
    eligible: true,
    safety_modes: ['read-only', 'isolated-write'],
    cost: { context_bytes: 200, tool_calls: 1 },
    ...overrides,
  };
}

function inventory(overrides = {}) {
  return [
    capability('cap/inspection-cheap', ['inspection']),
    capability('cap/inspection-expensive', ['inspection'], { cost: { context_bytes: 900, tool_calls: 3 } }),
    capability('cap/audit', ['audit'], { cost: { context_bytes: 400, tool_calls: 1 } }),
    capability('cap/synthesis', ['synthesis']),
    capability('cap/implementation', ['implementation']),
    capability('cap/testing', ['testing']),
    capability('cap/browser', ['browser-verification']),
    capability('cap/reporting', ['reporting']),
    ...overrides.extra || [],
  ];
}

test('broad quality work produces the smallest applicable dependency-aware stage sequence', () => {
  const result = planWorkflow({ intent: intent(), capabilities: inventory() });
  assert.equal(result.status, 'planned');
  assert.equal(result.dispatch_eligible, false);
  assert.deepEqual(result.stages.map(stage => stage.id), [
    'baseline',
    'interaction-inventory',
    'parallel-read-only-audits',
    'synthesis',
    'isolated-fixes',
    'targeted-validation',
    'browser-uat',
    'regression-checks',
    'final-report',
  ]);
  assert.ok(result.stages.every(stage => stage.role?.capability_id));
  assert.ok(result.stages.every(stage => stage.bounds.max_context_bytes > 0));
  assert.ok(result.stages.every(stage => stage.bounds.max_tool_calls > 0));
  assert.ok(result.stages.every(stage => stage.bounds.max_concurrency > 0));
  assert.ok(result.stages.every(stage => Number.isInteger(stage.bounds.max_retries)));
});

test('stage dependencies are acyclic and parallel audits stay read-only and bounded', () => {
  const result = planWorkflow({ intent: intent(), capabilities: inventory() });
  const stages = new Map(result.stages.map(stage => [stage.id, stage]));
  for (const stage of result.stages) {
    for (const dependency of stage.depends_on) assert.ok(stages.has(dependency));
  }
  const audit = stages.get('parallel-read-only-audits');
  assert.equal(audit.safety_mode, 'read-only');
  assert.equal(audit.bounds.max_concurrency, WORKFLOW_PLAN_LIMITS.max_concurrency);
  assert.ok(audit.tasks.length <= WORKFLOW_PLAN_LIMITS.max_audit_tasks);
  assert.equal(audit.bounds.max_retries, 1);
  assert.equal(result.plan_bounds.single_workflow_composition_cap_applied, false);
  assert.ok(result.plan_bounds.max_stages >= result.stages.length);
});

test('inspection-only work omits writes and inapplicable browser stages', () => {
  const result = planWorkflow({
    intent: intent({
      task_family: 'quality-audit',
      task_family_candidates: ['quality-audit', 'bug-diagnosis-fix'],
      requested_autonomy: 'inspect',
      evidence_needs: ['report'],
    }),
    capabilities: inventory(),
  });
  assert.equal(result.status, 'planned');
  assert.equal(result.stages.some(stage => stage.id === 'isolated-fixes'), false);
  assert.equal(result.stages.some(stage => stage.id === 'browser-uat'), false);
  assert.ok(result.omitted_stages.some(stage => stage.id === 'isolated-fixes' && stage.reason_code === 'inspection_only'));
});

test('missing required roles block while unavailable optional browser roles are omitted truthfully', () => {
  const missingBaseline = planWorkflow({
    intent: intent(),
    capabilities: inventory({ extra: [capability('cap/inspection-invalid', ['inspection'], { validated: false })] })
      .filter(item => !item.roles.some(role => ['inspection', 'audit'].includes(role))),
  });
  assert.deepEqual(
    { status: missingBaseline.status, reason_code: missingBaseline.reason_code },
    { status: 'blocked', reason_code: 'required_stage_role_unavailable' },
  );

  const noBrowser = planWorkflow({
    intent: intent(),
    capabilities: inventory().filter(item => !item.roles.includes('browser-verification')),
  });
  assert.equal(noBrowser.status, 'planned');
  assert.equal(noBrowser.stages.some(stage => stage.id === 'interaction-inventory'), false);
  assert.equal(noBrowser.stages.some(stage => stage.id === 'browser-uat'), false);
  assert.ok(noBrowser.omitted_stages.every(stage => stage.reason_code === 'optional_role_unavailable'));
});

test('write stages require isolated-write safety and never fan out', () => {
  const unsafe = planWorkflow({
    intent: intent(),
    capabilities: inventory({
      extra: [capability('cap/unsafe-implementation', ['implementation'], { safety_modes: ['read-only'] })],
    }).filter(item => item.capability_id !== 'cap/implementation'),
  });
  assert.equal(unsafe.status, 'blocked');
  assert.equal(unsafe.reason_code, 'required_stage_role_unavailable');

  const safe = planWorkflow({ intent: intent(), capabilities: inventory() });
  const fixes = safe.stages.find(stage => stage.id === 'isolated-fixes');
  assert.equal(fixes.safety_mode, 'isolated-write');
  assert.equal(fixes.bounds.max_concurrency, 1);
  assert.equal(fixes.bounds.max_retries, 0);
});

test('role choice and serialized plan remain deterministic under input permutations', () => {
  const forward = planWorkflow({ intent: intent(), capabilities: inventory() });
  const reverse = planWorkflow({ intent: intent(), capabilities: [...inventory()].reverse() });
  assert.equal(JSON.stringify(forward), JSON.stringify(reverse));
  assert.equal(forward.stages.find(stage => stage.id === 'baseline').role.capability_id, 'cap/inspection-cheap');
});

test('clarification and unknown outcomes fail closed without planning', () => {
  for (const structuredIntent of [
    intent({ clarification: { needed: true, reason_codes: ['missing_factual_scope'] } }),
    intent({ task_family: 'unknown', task_family_candidates: [], outcome: 'unknown' }),
  ]) {
    const result = planWorkflow({ intent: structuredIntent, capabilities: inventory() });
    assert.equal(result.status, 'blocked');
    assert.equal(result.dispatch_eligible, false);
  }
});

test('prompt-time summary is concise, non-dispatchable, and privacy-safe', () => {
  const plan = planWorkflow({
    intent: intent({ prompt: 'private raw request', normalized_text: 'private raw request' }),
    capabilities: inventory(),
  });
  const summary = summarizeWorkflowPlan(plan);
  assert.equal(summary.status, 'planned');
  assert.equal(summary.dispatch_eligible, false);
  assert.ok(summary.message.length <= 256);
  assert.doesNotMatch(JSON.stringify(summary), /private raw request|normalized_text|cap\//);
});
