import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V20_VERSION,
  createEvaluationCapabilities,
  runV20Evaluation,
  V20_CASES,
} from '../src/evaluation/v20.mjs';

test('v2.0 evaluation proves complete family workflows, evidence, parity, and budgets', async () => {
  const report = await runV20Evaluation({ now: 1_800_000_000_000 });
  assert.equal(report.status, 'passed');
  assert.equal(report.evaluation_version, EVALUATION_V20_VERSION);
  assert.ok(V20_CASES.length >= 18);
  assert.ok(report.dimensions.full_workflow_selection.pass);
  assert.ok(report.dimensions.task_family_coverage.pass);
  assert.equal(report.dimensions.task_family_coverage.covered_families.length, 6);
  assert.ok(report.dimensions.runtime_parity.pass);
  assert.ok(report.dimensions.selected_actual_evidence.pass);
  assert.ok(report.dimensions.browser_runtime_evidence.pass);
  assert.ok(report.dimensions.safety_negatives.pass);
  assert.ok(report.dimensions.availability.pass);
  assert.ok(report.dimensions.planning_efficiency.pass);
  assert.ok(report.dimensions.prompt_overhead.pass);
  assert.equal(report.mandatory_gates.no_composite_score, true);
  assert.equal(Object.hasOwn(report, 'score'), false);
  assert.match(report.evaluation_fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(report), /audit the repository quality|private raw prompt/);
});

test('evaluation fingerprint and selection evidence are deterministic', async () => {
  const first = await runV20Evaluation({ now: 1_800_000_000_000 });
  const second = await runV20Evaluation({ now: 1_800_000_000_000 });
  assert.equal(first.evaluation_fingerprint, second.evaluation_fingerprint);
  assert.deepEqual(
    first.case_results.map(row => [row.case_id, row.runtime, row.stage_ids, row.negative_pass]),
    second.case_results.map(row => [row.case_id, row.runtime, row.stage_ids, row.negative_pass]),
  );
});

test('asymmetric inventory fails availability, parity, and required browser evidence independently', async () => {
  const codex = createEvaluationCapabilities('codex').filter(capability => (
    !capability.roles.includes('browser-verification')
  ));
  const report = await runV20Evaluation({
    variants: [
      { runtime: 'claude', capabilities: createEvaluationCapabilities('claude') },
      { runtime: 'codex', capabilities: codex },
    ],
    now: 1_800_000_000_000,
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.dimensions.availability.pass, false);
  assert.equal(report.dimensions.runtime_parity.pass, false);
  assert.equal(report.dimensions.browser_runtime_evidence.pass, false);
  assert.ok(report.dimensions.availability.failures.length > 0);
  assert.equal(report.mandatory_gates.no_composite_score, true);
});

test('negative corpus members never become planned workflows', async () => {
  const report = await runV20Evaluation({
    cases: V20_CASES.filter(testCase => testCase.negative),
    now: 1_800_000_000_000,
  });
  assert.equal(report.status, 'passed');
  assert.equal(report.dimensions.safety_negatives.pass, true);
  assert.ok(report.case_results.every(row => row.negative_pass === true && row.stage_ids.length === 0));
});
