import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const perfUrl = new URL('../src/evolution/perf-measure.mjs', import.meta.url);
const latencyHelper = new URL('./helpers/latency-isolated.mjs', import.meta.url);

test('D-13/D-15 calibration corpus is byte-locked and covers all seven classes', async () => {
  const { CALIBRATION_CORPUS, CALIBRATION_CORPUS_FINGERPRINT, CALIBRATION_CORPUS_VERSION } = await import(perfUrl);
  assert.equal(CALIBRATION_CORPUS_VERSION, 'router-calibration-v1');
  assert.equal(CALIBRATION_CORPUS_FINGERPRINT, '3ea61ea5a997a93e1341120657d3be3c9d9b3437379390ea6c8f4b1367f3ac5f');
  assert.deepEqual(CALIBRATION_CORPUS.map(fixture => fixture.fixture_class), [
    'minimal_prompt', 'explicit_override', 'stale_context', 'ambiguity', 'terminal_state', 'dependency', 'context_budget',
  ]);
  assert.equal(Object.isFrozen(CALIBRATION_CORPUS), true);
});

test('fixed corpus evaluates deterministic quality and context-budget outcomes', async () => {
  const { CALIBRATION_CORPUS, evaluateCalibrationCorpus } = await import(perfUrl);
  const result = evaluateCalibrationCorpus({
    corpus: CALIBRATION_CORPUS,
    route: fixture => fixture.expected,
    versions: { candidate: 'candidate-v1', compiled_index: 'compiled-v1', policy: 'policy-v1' },
  });
  assert.equal(result.quality.pass, true);
  assert.equal(result.context_budget.pass, true);
  assert.equal(result.fixtures.length, 7);
  assert.deepEqual(result.versions, {
    candidate: 'candidate-v1', compiled_index: 'compiled-v1', policy: 'policy-v1', corpus: 'router-calibration-v1',
  });
});

test('F-03 context budget is measured from UTF-8 output, never self-attested', async () => {
  const { evaluateCalibrationCorpus } = await import(perfUrl);
  const corpus = [{ id: 'oversized', fixture_class: 'context_budget', expected: { context: 'x'.repeat(100_000), context_within_budget: true }, max_context_bytes: 2048 }];
  const result = evaluateCalibrationCorpus({ corpus, route: fixture => fixture.expected, versions: { candidate: 'c', compiled_index: 'i', policy: 'p' } });
  assert.equal(result.quality.pass, true);
  assert.equal(result.context_budget.pass, false);
  assert.equal(result.fixtures[0].measured_context_bytes, 100_000);

  const utf8 = evaluateCalibrationCorpus({ corpus: [{ id: 'utf8', fixture_class: 'context_budget', expected: { context: 'é' }, max_context_bytes: 16 }], route: fixture => fixture.expected, versions: { candidate: 'c', compiled_index: 'i', policy: 'p' } });
  assert.equal(utf8.fixtures[0].measured_context_bytes, Buffer.byteLength('é', 'utf8'));
});

test('D-14 monotonic measurement excludes warmup and computes deterministic nearest-rank percentiles', async () => {
  const { measureRoutes, percentile } = await import(perfUrl);
  assert.equal(percentile([9, 1, 5, 3], 0.5), 3);
  let clock = 0;
  const durations = [50, 10, 20, 30, 40];
  const result = measureRoutes({
    fixtures: [{ id: 'one' }], warmup_runs: 1, measured_runs: 4,
    route: () => {},
    now: () => { const value = clock; clock += durations.shift() ?? 0; return value; },
    versions: { candidate: 'c', compiled_index: 'i', policy: 'p', corpus: 'router-calibration-v1' },
  });
  assert.equal(result.samples.length, 4);
  assert.equal(result.warm.p95_ms, 40);
  assert.equal(result.warm.max_ms, 40);
});

test('REL-01 quality and latency are independent hard gates', async () => {
  const { assessCalibration } = await import(perfUrl);
  const passingQuality = { quality: { pass: true }, context_budget: { pass: true } };
  const slow = assessCalibration({ evaluation: passingQuality, performance: { warm: { p95_ms: 25, max_ms: 99 } } });
  assert.equal(slow.quality.pass, true);
  assert.equal(slow.latency.pass, false);
  assert.equal(slow.latency.reason_code, 'warm_p95_ceiling_exceeded');

  const wrong = assessCalibration({ evaluation: { quality: { pass: false }, context_budget: { pass: true } }, performance: { warm: { p95_ms: 1, max_ms: 2 } } });
  assert.equal(wrong.quality.pass, false);
  assert.equal(wrong.latency.pass, true);
  assert.equal(wrong.pass, false);
});

test('SAF-03 mutation-safety gate passes below both strict ceilings', async () => {
  const { assessMutationSafetyRegression } = await import(perfUrl);
  assert.deepEqual(
    assessMutationSafetyRegression({ performance: { warm: { p95_ms: 39, max_ms: 99 } } }),
    { pass: true, reason_code: 'mutation_safety_pass', ceilings: { p95_ms: 40, max_ms: 100 } },
  );
});

test('SAF-03 mutation-safety gate rejects the 40ms p95 boundary', async () => {
  const { assessMutationSafetyRegression } = await import(perfUrl);
  assert.equal(
    assessMutationSafetyRegression({ performance: { warm: { p95_ms: 40, max_ms: 90 } } }).reason_code,
    'mutation_safety_p95_exceeded',
  );
});

test('SAF-03 mutation-safety gate rejects the 100ms max boundary', async () => {
  const { assessMutationSafetyRegression } = await import(perfUrl);
  assert.equal(
    assessMutationSafetyRegression({ performance: { warm: { p95_ms: 35, max_ms: 100 } } }).reason_code,
    'mutation_safety_max_exceeded',
  );
});

test('SAF-03 mutation-safety result publishes its ceilings', async () => {
  const { assessMutationSafetyRegression } = await import(perfUrl);
  assert.deepEqual(assessMutationSafetyRegression({}).ceilings, { p95_ms: 40, max_ms: 100 });
});

test('SAF-03 mutation-safety gate fails closed when performance is missing', async () => {
  const { assessMutationSafetyRegression } = await import(perfUrl);
  assert.equal(assessMutationSafetyRegression({}).pass, false);
});

test('SAF-03 leaves the stricter 25ms canary gate unchanged', async () => {
  const { assessCalibration } = await import(perfUrl);
  const evaluation = { quality: { pass: true }, context_budget: { pass: true } };
  assert.equal(assessCalibration({ evaluation, performance: { warm: { p95_ms: 25, max_ms: 99 } } }).pass, false);
});

test('SAF-03 isolated full-corpus route measurement passes mutation-safety ceilings', async () => {
  const { assessMutationSafetyRegression } = await import(perfUrl);
  const run = spawnSync(process.execPath, [fileURLToPath(latencyHelper)], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 0, run.stderr);
  const { measured } = JSON.parse(run.stdout);
  assert.ok(measured.warm.p95_ms < 40, `warm p95 ${measured.warm.p95_ms}ms`);
  assert.ok(measured.warm.max_ms < 100, `warm max ${measured.warm.max_ms}ms`);
  assert.equal(assessMutationSafetyRegression({ performance: measured }).pass, true);
});
