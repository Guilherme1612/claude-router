import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveContextAction } from '../src/context/resolve.mjs';

function capsule(overrides = {}) {
  return {
    workflow_identity: 'a'.repeat(64),
    scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'phase-15', summary: 'Context recovery' },
    position: { workflow: 'gsd-execute-phase', phase: '15', plan: '03', task: '2' },
    status: 'active',
    artifacts: [{ ref: 'docs/design.md', type: 'design', status: 'current' }],
    ...overrides,
  };
}

test('referential phrases resolve one active workflow with exact semantics', () => {
  const active = capsule();
  const rows = [
    ['continue', 'continue_workflow'],
    ['finish it', 'finish_remaining_work'],
    ['use the design', 'use_linked_design'],
  ];
  for (const [phrase, action] of rows) {
    const result = resolveContextAction({ instruction: { kind: 'referential', phrase }, capsule: active });
    assert.equal(result.outcome, 'resume');
    assert.equal(result.reason_code, `unique_${action}`);
    assert.equal(result.dispatch_eligible, true);
    assert.equal(result.action, action);
  }
});

test('zero, multiple, missing design, and terminal state clarify without dispatch', () => {
  const cases = [
    [{ instruction: { kind: 'referential', phrase: 'continue' } }, 'no_active_workflow'],
    [{ instruction: { kind: 'referential', phrase: 'continue' }, candidates: [capsule(), capsule({ workflow_identity: 'b'.repeat(64), goal: { id: 'other', summary: 'Other' } })] }, 'multiple_active_workflows'],
    [{ instruction: { kind: 'referential', phrase: 'use the design' }, capsule: capsule({ artifacts: [] }) }, 'design_reference_missing'],
    [{ instruction: { kind: 'referential', phrase: 'finish it' }, capsule: capsule({ status: 'completed' }) }, 'terminal_workflow'],
  ];
  for (const [input, reason] of cases) {
    const result = resolveContextAction(input);
    assert.equal(result.outcome, 'clarify');
    assert.equal(result.reason_code, reason);
    assert.equal(result.dispatch_eligible, false);
    assert.equal(typeof result.question, 'string');
    assert.equal('action' in result, false);
  }
});

test('complete explicit instructions override without merging old intent or raw prompt', () => {
  const result = resolveContextAction({
    capsule: capsule(),
    instruction: { kind: 'explicit', complete: true, goal_id: 'phase-16', workflow: 'gsd-plan-phase', phase: '16', action: 'plan' },
  });
  assert.equal(result.outcome, 'override');
  assert.equal(result.reason_code, 'explicit_instruction_override');
  assert.equal(result.dispatch_eligible, true);
  assert.deepEqual(result.action, { goal_id: 'phase-16', workflow: 'gsd-plan-phase', phase: '16', action: 'plan' });
  assert.deepEqual(result.supersession, { workflow_identity: 'a'.repeat(64), status: 'active', reason: 'explicit_instruction_override' });
  assert.doesNotMatch(JSON.stringify(result), /Context recovery|raw_prompt|prompt/);
});

test('materially incomplete explicit conflict clarifies and stale unique evidence refreshes', () => {
  const incomplete = resolveContextAction({ capsule: capsule(), instruction: { kind: 'explicit', complete: false, phase: '16' } });
  assert.equal(incomplete.outcome, 'clarify');
  assert.equal(incomplete.reason_code, 'explicit_instruction_incomplete');
  assert.equal(incomplete.dispatch_eligible, false);

  const refreshed = resolveContextAction({
    capsule: capsule(), instruction: { kind: 'referential', phrase: 'continue' }, freshness: 'stale',
    authoritative: { status: 'dispatchable', value: { workflow: 'gsd-execute-phase', phase: '15', plan: '03', task: '3', status: 'active', action: 'continue_workflow' } },
  });
  assert.equal(refreshed.outcome, 'refresh');
  assert.equal(refreshed.reason_code, 'authoritative_refresh_required');
  assert.equal(refreshed.dispatch_eligible, true);
  assert.equal(refreshed.refresh.position.task, '3');
});

test('resolver output is byte-stable across candidate permutations', () => {
  const a = capsule(), b = capsule({ workflow_identity: 'b'.repeat(64), goal: { id: 'other', summary: 'Other' } });
  const input = { instruction: { kind: 'referential', phrase: 'continue' } };
  assert.equal(JSON.stringify(resolveContextAction({ ...input, candidates: [a, b] })), JSON.stringify(resolveContextAction({ ...input, candidates: [b, a] })));
});
