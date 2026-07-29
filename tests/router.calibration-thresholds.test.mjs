import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../router.calibrate.mjs';

const current = { T_high: 0.8, T_low: 0.4, M: 0.2 };
const records = [
  { id: 'high-correct', score: 0.9, margin: 0.4, correct: true, expected_tier: 'high' },
  { id: 'high-wrong', score: 0.85, margin: 0.3, correct: false, expected_tier: 'medium' },
  { id: 'low-boundary', score: 0.45, margin: 0.25, correct: true, expected_tier: 'medium' },
  { id: 'below-low', score: 0.35, margin: 0.3, correct: false, expected_tier: 'low' },
  { id: 'margin-tie', score: 0.9, margin: 0.1, correct: true, expected_tier: 'medium' },
];

test('candidate enumeration uses observed breakpoints and current constants', () => {
  assert.equal(typeof C.enumerateThresholdCandidates, 'function');
  const candidates = C.enumerateThresholdCandidates(records, current);
  assert.ok(candidates.some((x) => x.T_high === current.T_high && x.T_low === current.T_low && x.M === current.M));
  assert.ok(candidates.some((x) => x.T_high === 0.9));
  assert.ok(candidates.some((x) => x.T_low === 0.45));
  assert.ok(candidates.some((x) => x.M === 0.1));
});

test('selection rejects every tuple that produces a wrong high-confidence route', () => {
  assert.equal(typeof C.selectThresholds, 'function');
  const selected = C.selectThresholds(records, current);
  assert.equal(selected.metrics.wrong_high, 0);
  assert.ok(selected.thresholds.T_high > 0.85 || selected.thresholds.M > 0.3);
});

test('selection follows the documented objective and deterministic stable tie-break', () => {
  const a = C.selectThresholds(records, current);
  const b = C.selectThresholds(structuredClone(records), structuredClone(current));
  assert.deepEqual(a, b);
  assert.deepEqual(
    a.objective.slice(0, 5),
    [
      -a.metrics.wrong_high,
      a.metrics.correct_routes,
      a.metrics.correct_high,
      -a.metrics.misses,
      -a.distance_from_current,
    ],
  );
});

test('labeled boundaries independently identify T_high, T_low, and M', () => {
  const selected = C.selectThresholds(records, current);
  assert.deepEqual(new Set(selected.supported_boundaries), new Set(['T_high', 'T_low', 'M']));
  assert.ok(selected.affected_samples.T_high.length > 0);
  assert.ok(selected.affected_samples.T_low.length > 0);
  assert.ok(selected.affected_samples.M.length > 0);
});

test('leave-one-out sensitivity is deterministic, reports ranges and frequency, and is pure', () => {
  assert.equal(typeof C.leaveOneOutThresholds, 'function');
  const before = structuredClone(records);
  const first = C.leaveOneOutThresholds(records, current);
  const second = C.leaveOneOutThresholds(records, current);

  assert.deepEqual(first, second);
  assert.deepEqual(records, before);
  for (const key of ['T_high', 'T_low', 'M']) {
    assert.equal(typeof first.ranges[key].min, 'number');
    assert.equal(typeof first.ranges[key].max, 'number');
    assert.ok(Object.keys(first.frequency[key]).length > 0);
  }
});
