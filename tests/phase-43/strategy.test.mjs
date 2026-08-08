import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStrategy } from '../../src/orchestrator/strategy.mjs';

const workflow = {
  status: 'selected', dispatch_eligible: true,
  selection: { workflow_id: 'workflow-43', transition_id: 'transition-43', family: 'repair', from: 'ready', to: 'done' },
};
const closure = { status: 'resolved', dispatch_eligible: true, workflow_id: 'workflow-43', transition_id: 'transition-43' };
const resources = (time = 10, tokens = 20) => ({ expected_time_ms: time, expected_tokens: tokens, calls: 1, retries: 0, failures: 0, coordination_cost: 0 });
const task = (id, overrides = {}) => ({
  id, depends_on: [], size: 1, verification_need: 0, specialist_value: 0, quality_required: 1, coordination_cost: 0, risk: 0,
  safe: true, correct: true, fit: true, available: true, in_scope: true, resources: resources(), ...overrides,
});
const validTask = value => value;

test('STRAT-01: chooses direct execution without child fan-out for one safe correction', () => {
  const result = planStrategy({ workflow, closure, tasks: [validTask(task('fix-one'))] });
  assert.equal(result.status, 'planned');
  assert.equal(result.strategy.kind, 'direct');
  assert.equal(result.strategy.child_agents, false);
  assert.deepEqual(result.strategy.work, [{ id: 'fix-one', depends_on: [] }]);
});

test('STRAT-02: orders dependencies deterministically and remains byte-stable', () => {
  const tasks = [
    validTask(task('b', { depends_on: ['a'], verification_need: 1, specialist_value: 5 })),
    validTask(task('a')),
  ];
  const candidates = [
    { id: 'parallel-work', kind: 'parallel', task_ids: ['a', 'b'], child_agents: true, specialist_required: true },
    { id: 'sequential-work', kind: 'sequential', task_ids: ['a', 'b'], child_agents: false },
  ];
  const first = planStrategy({ workflow, closure, tasks, candidates });
  const second = planStrategy({ workflow, closure, tasks: [...tasks].reverse(), candidates: [...candidates].reverse() });
  assert.equal(first.status, 'planned');
  assert.deepEqual(first.strategy.work, [{ id: 'a', depends_on: [] }, { id: 'b', depends_on: ['a'] }]);
  assert.deepEqual(first, second);
  assert.equal(first.strategy.kind, 'parallel');
});

test('STRAT-03: rejects unsafe low-cost candidates before cost comparison', () => {
  const result = planStrategy({
    workflow, closure, tasks: [validTask(task('safe-work'))],
    candidates: [
      { id: 'unsafe-cheap', kind: 'direct', task_ids: ['safe-work'], child_agents: false, hard_constraints: { safe: false, correct: true, quality: true, fit: true, available: true, in_scope: true }, cost: { ...resources(1, 1) } },
      { id: 'valid', kind: 'direct', task_ids: ['safe-work'], child_agents: false, cost: { ...resources(10, 20) } },
    ],
  });
  assert.equal(result.status, 'planned');
  assert.equal(result.strategy.kind, 'direct');
  assert.equal(result.strategy.candidates.find(candidate => candidate.id === 'unsafe-cheap').hard_constraints.passed, false);
  assert.equal(result.strategy.candidates.find(candidate => candidate.id === 'valid').hard_constraints.passed, true);
});

test('STRAT-03: blocks malformed identities, dependencies, costs, resources, and missing facts', () => {
  const cases = [
    [{ ...validTask(task('bad id')), id: 'bad id' }, 'task_identity_invalid'],
    [validTask(task('bad-dependency', { depends_on: ['missing'] })), 'task_dependency_unknown'],
    [validTask(task('bad-cost', { resources: resources(Number.NaN) })), 'task_resource_invalid'],
    [{ ...validTask(task('missing-fact')), safe: undefined }, 'task_hard_constraint_missing'],
  ];
  for (const [badTask, reason] of cases) assert.equal(planStrategy({ workflow, closure, tasks: [badTask] }).reason_code, reason);
});

test('STRAT-03: reports bounded costs, limits, constraints, and measured facts without prompt/history fields', () => {
  const result = planStrategy({ workflow, closure, bounds: { max_time_ms: 100, max_tokens: 100, max_calls: 2, max_retries: 1, max_failures: 1, max_coordination_cost: 10 }, tasks: [validTask(task('report-me', { verification_need: 1, specialist_value: 2 }))] });
  assert.equal(result.status, 'planned');
  assert.deepEqual(Object.keys(result.strategy.cost).sort(), ['calls', 'coordination_cost', 'expected_time_ms', 'expected_tokens', 'failures', 'retries', 'within_bounds']);
  assert.deepEqual(result.strategy.resource_limits, { max_time_ms: 100, max_tokens: 100, max_calls: 2, max_retries: 1, max_failures: 1, max_coordination_cost: 10 });
  assert.equal(result.strategy.hard_constraints.passed, true);
  assert.equal('prompt' in result, false);
  assert.equal('history' in result, false);
});
