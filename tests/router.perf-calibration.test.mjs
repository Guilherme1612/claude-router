import assert from 'node:assert/strict';
import test from 'node:test';

const perfUrl = new URL('../src/evolution/perf-measure.mjs', import.meta.url);

test('D-13/D-15 calibration corpus is byte-locked and covers all seven classes', async () => {
  const { CALIBRATION_CORPUS, CALIBRATION_CORPUS_FINGERPRINT, CALIBRATION_CORPUS_VERSION } = await import(perfUrl);
  assert.equal(CALIBRATION_CORPUS_VERSION, 'router-calibration-v1');
  assert.equal(CALIBRATION_CORPUS_FINGERPRINT, '7bc53e0215dd75fdd98cb6a4b4c0df77a9360ab3194b1ccb26ae89a85e2b677d');
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
