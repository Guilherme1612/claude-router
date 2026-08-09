import assert from 'node:assert/strict';
import test from 'node:test';

import { EVALUATION_VERSION, evaluateGates, runEvaluation } from '../src/evaluation/v18.mjs';

test('EVAL-01/02/04/05/07: isolated evaluation returns fingerprinted independent dimensions', () => {
  const report = runEvaluation({ runtime: 'claude', now: 1_800_000_000_000 });
  assert.equal(report.status, 'passed');
  assert.equal(report.evaluation_version, EVALUATION_VERSION);
  assert.match(report.corpus_fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(report.dimensions.inventory_coverage.pass);
  assert.ok(report.dimensions.workflow_accuracy.pass);
  assert.equal(report.dimensions.workflow_accuracy.false_positives, 0);
  assert.equal(report.dimensions.workflow_accuracy.false_negatives, 0);
  assert.ok(report.dimensions.capability_set_accuracy.pass);
  assert.equal(report.dimensions.capability_set_accuracy.unnecessary_tool_calls, 0);
  assert.ok(report.dimensions.safety.pass);
  assert.ok(report.dimensions.receipts.pass);
  assert.ok(report.dimensions.verification.pass);
  assert.ok(report.dimensions.parity.pass);
  assert.ok(report.dimensions.lifecycle.pass);
  assert.ok(report.performance.conditions.corpus_fingerprint);
  assert.ok(Number.isSafeInteger(report.performance.context_bytes));
  assert.ok(Number.isSafeInteger(report.performance.artifact_bytes));
  assert.ok(Number.isFinite(report.performance.startup_latency_ms.cold.max_ms));
  assert.ok(report.performance.budgets.prompt_max_ms <= 100);
  assert.equal(JSON.stringify(report).includes('inspect database relationships'), false);
});

test('EVAL-03: a mandatory regression cannot be offset by other dimensions', () => {
  const result = evaluateGates({
    quality: true, safety: false, performance: true, lifecycle: true, verification: true,
  });
  assert.equal(result.pass, false);
  assert.equal(result.reason_code, 'mandatory_gate_failed');
  assert.equal(Object.hasOwn(result, 'score'), false);
});

test('EVAL-06: rejected candidates preserve the last-known-good semantic tuple', () => {
  const report = runEvaluation({ runtime: 'codex', candidate_status: 'rejected', now: 1_800_000_000_000 });
  assert.equal(report.dimensions.known_good_recovery.pass, true);
  assert.equal(report.dimensions.known_good_recovery.active_tuple_preserved, true);
});
