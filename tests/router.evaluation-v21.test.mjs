import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V21_VERSION,
  ROUTING_MODES,
  V21_CASES,
  createV21Capabilities,
  runV21Benchmark,
} from '../src/evaluation/v21.mjs';

const NOW = 1_800_000_000_000;

test('v2.1 runs one unchanged corpus across both runtimes and all routing modes', async () => {
  const report = await runV21Benchmark({ cases: V21_CASES.slice(0, 1), now: NOW });
  assert.equal(report.evaluation_version, EVALUATION_V21_VERSION);
  assert.deepEqual(report.matrix.runtimes, ['claude', 'codex']);
  assert.deepEqual(report.matrix.routing_modes, ROUTING_MODES);
  assert.equal(report.case_results.length, 8);
  assert.equal(new Set(report.case_results.map(row => row.prompt_signature)).size, 1);
  assert.equal(new Set(report.case_results.map(row => row.case_id)).size, 1);
  assert.equal(report.mandatory_gates.no_composite_score, true);
});

test('v2.1 report exposes independent metric dimensions and signed baselines', async () => {
  const report = await runV21Benchmark({ cases: V21_CASES.slice(0, 1), now: NOW });
  for (const name of [
    'prompt_overhead', 'token_evidence', 'context_bytes', 'latency',
    'injected_bytes', 'composition', 'tool_calls', 'cache_behavior', 'baseline_delta',
    'mapping', 'availability', 'receipts', 'verification', 'privacy',
    'safety',
  ]) {
    assert.ok(report.dimensions[name], name);
    assert.equal(typeof report.dimensions[name].pass, 'boolean', name);
  }
  const row = report.case_results[0];
  assert.ok(row.metrics.latency.p50_ms >= 0);
  assert.ok(row.metrics.latency.p95_ms >= row.metrics.latency.p50_ms);
  assert.ok(row.metrics.latency.max_ms >= row.metrics.latency.p95_ms);
  assert.ok(Object.hasOwn(row.metrics, 'baseline_delta'));
});

test('v2.1 rows retain selected/actual evidence and redact raw prompt/output/path content', async () => {
  const report = await runV21Benchmark({ cases: V21_CASES.slice(0, 1), now: NOW });
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /audit the whole repository|private raw prompt|\/Users\/|[A-Za-z]:\\\\/);
  assert.ok(report.case_results.every(row => /^[a-f0-9]{64}$/.test(row.prompt_signature)));
  assert.ok(report.case_results.every(row => Object.hasOwn(row, 'selected')));
  assert.ok(report.case_results.every(row => Object.hasOwn(row, 'actual')));
  assert.ok(report.case_results.every(row => Object.hasOwn(row, 'mapping')));
  assert.ok(report.case_results.every(row => Object.hasOwn(row, 'policy_guards')));
  assert.ok(report.case_results.every(row => Object.hasOwn(row, 'receipts')));
  assert.ok(report.case_results.every(row => Object.hasOwn(row, 'verification')));
});

test('unavailable runtime-local capabilities remain visible as independent gaps', async () => {
  const codex = createV21Capabilities('codex').filter(capability => (
    !capability.roles.includes('browser-verification')
  ));
  const report = await runV21Benchmark({
    cases: V21_CASES.filter(testCase => testCase.browser_required).slice(0, 1),
    variants: [
      { runtime: 'claude', capabilities: createV21Capabilities('claude') },
      { runtime: 'codex', capabilities: codex },
    ],
    now: NOW,
  });
  assert.equal(report.dimensions.availability.pass, false);
  assert.ok(report.dimensions.availability.failures.some(failure => failure.runtime === 'codex'));
  assert.equal(report.dimensions.mapping.pass, false);
  assert.ok(report.case_results.some(row => row.runtime === 'codex' && row.availability_gaps.length > 0));
});

test('fixed inputs produce byte-stable v2.1 evaluation fingerprints', async () => {
  const first = await runV21Benchmark({ cases: V21_CASES.slice(0, 1), now: NOW });
  const second = await runV21Benchmark({ cases: V21_CASES.slice(0, 1), now: NOW });
  assert.equal(first.evaluation_fingerprint, second.evaluation_fingerprint);
  assert.deepEqual(
    first.case_results.map(row => [row.case_id, row.prompt_signature, row.runtime, row.routing_mode, row.selected, row.actual, row.execution_status]),
    second.case_results.map(row => [row.case_id, row.prompt_signature, row.runtime, row.routing_mode, row.selected, row.actual, row.execution_status]),
  );
});
