import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessRouteCost, measureRouteCost } from '../src/evolution/route-cost.mjs';

function route(fixture) {
  return {
    additional_context: `minimum context for ${fixture.id}`,
    metrics: {
      filesystem_reads: 2,
      root_rescans: 0,
      manifest_load_ms: 1,
      snapshot_load_ms: 0.5,
      candidates_before: 12,
      candidates_after: 2,
      tool_calls: 1,
      retries: 0,
      downstream_ms: 3,
    },
    outcome_evidence: { class: fixture.evidence_class, verified: fixture.verified, quality: fixture.verified ? 'pass' : 'unknown' },
  };
}

test('PERF-01/02/03: measures cold and warm end-to-end route cost independently', () => {
  let clock = 0;
  const measurement = measureRouteCost({ fixtures: [{ id: 'evaluation', evidence_class: 'evaluation', verified: true }, { id: 'live', evidence_class: 'live', verified: true }], route, cold_runs: 1, warmup_runs: 1, measured_runs: 3, now: () => clock++ });
  assert.equal(measurement.measurement_kind, 'end_to_end_route');
  for (const phase of [measurement.cold, measurement.warm]) {
    assert.equal(phase.latency.count > 0, true);
    for (const key of ['p50', 'p95', 'p99', 'max']) assert.equal(typeof phase.latency[key], 'number');
    assert.equal(phase.metrics.candidates_before.max, 12);
    assert.equal(phase.metrics.candidates_after.max, 2);
    assert.equal(phase.metrics.injected_bytes.max > 0, true);
    assert.equal(phase.metrics.estimated_tokens.max > 0, true);
  }
  assert.equal(measurement.warm.evidence_classes.live > 0, true);
  assert.equal(measurement.warm.outcome_quality.pass_rate, 1);
});

test('PERF-04: independent budgets pass only with verified outcome evidence', () => {
  const measurement = measureRouteCost({ fixtures: [{ id: 'verified', evidence_class: 'installed', verified: true }], route, warmup_runs: 0, measured_runs: 2, now: (() => { let value = 0; return () => value++; })() });
  const pass = assessRouteCost({ measurement, budgets: { cold_p95_ms: 2, warm_p95_ms: 2, warm_p99_ms: 2, warm_max_ms: 2, max_filesystem_reads: 2, max_root_rescans: 0, max_injected_bytes: 100, max_estimated_tokens: 100, max_tool_calls: 1, max_retries: 0, max_downstream_ms: 3, max_candidates_after: 2, min_verified_outcomes: 1, min_outcome_pass_rate: 1 } });
  assert.equal(pass.pass, true);
  const fail = assessRouteCost({ measurement, budgets: { warm_p95_ms: 0, max_filesystem_reads: 1, min_verified_outcomes: 3, min_outcome_pass_rate: 1 } });
  assert.equal(fail.pass, false);
  assert.equal(fail.checks.warm_p95_ms.status, 'fail');
  assert.equal(fail.checks.filesystem_reads.status, 'fail');
  assert.equal(fail.checks.verified_outcomes.status, 'fail');
});

test('PERF-04: absent cost or outcome evidence remains unknown rather than passing', () => {
  const measurement = measureRouteCost({ fixtures: [{ id: 'unknown', evidence_class: 'unknown', verified: false }], route: () => ({ additional_context: 'context only' }), warmup_runs: 0, measured_runs: 1, now: (() => { let value = 0; return () => value++; })() });
  const assessed = assessRouteCost({ measurement, budgets: { max_filesystem_reads: 0, min_verified_outcomes: 1, min_outcome_pass_rate: 1 } });
  assert.equal(assessed.pass, false);
  assert.equal(assessed.checks.filesystem_reads.status, 'unknown');
  assert.equal(assessed.checks.verified_outcomes.status, 'unknown');
  assert.equal(measurement.warm.outcome_quality.pass_rate, null);
});
