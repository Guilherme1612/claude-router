import { test } from 'node:test';
import assert from 'node:assert/strict';

// Bounded, synthetic inputs for STRAT-01..04. These remain inert until the
// strategy implementation consumes them in a later plan.
export const AUTHORIZED_WORKFLOW = Object.freeze({
  workflow_id: 'workflow-43-fixture',
  authority: 'operator-authorized',
  scope: Object.freeze(['src/orchestrator/strategy.mjs']),
  hard_constraints: Object.freeze({ safety: 'safe', correctness: 'required', quality: 'bounded' }),
});

export const TASK_FACTS = Object.freeze([
  Object.freeze({ task_id: 'task-a', depends_on: Object.freeze([]), work_units: 1 }),
  Object.freeze({ task_id: 'task-b', depends_on: Object.freeze(['task-a']), work_units: 2 }),
]);

export const RESOURCE_BOUNDS = Object.freeze({ max_wall_ms: 5000, max_tokens: 2048, max_invocations: 2 });

export const INVOCATION_RESULTS = Object.freeze({
  direct: Object.freeze({ state: 'completed', runtime: 'claude', invocation_id: 'invoke-direct-43' }),
  child: Object.freeze({ state: 'completed', runtime: 'codex', invocation_id: 'invoke-child-43' }),
});

test.todo('STRAT-01: choose direct execution for one safe work item without child fan-out');
test.todo('STRAT-02: order bounded tasks deterministically by dependency and stable identity');
test.todo('STRAT-03: reject hard-constraint violations before comparing strategy cost');
test.todo('STRAT-04: report finite resource bounds and inspectable strategy facts');

assert.deepEqual(TASK_FACTS.map(({ task_id }) => task_id), ['task-a', 'task-b']);
