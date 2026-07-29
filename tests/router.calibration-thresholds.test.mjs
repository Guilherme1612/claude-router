import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../router.calibrate.mjs';

const tasks = JSON.parse(readFileSync(new URL('../calibration-tasks.json', import.meta.url), 'utf8'));
const current = { T_high: 0.6, T_low: 0.3, M: 0.2 };
const records = [
  { id: 'high-correct', score: 0.9, margin: 0.4, correct: true, expected_tier: 'high' },
  { id: 'high-wrong', score: 0.85, margin: 0.3, correct: false, expected_tier: 'medium' },
  { id: 'low-boundary', score: 0.45, margin: 0.25, correct: true, expected_tier: 'medium' },
  { id: 'below-low', score: 0.35, margin: 0.3, correct: false, expected_tier: 'low' },
  { id: 'margin-tie', score: 0.9, margin: 0.1, correct: true, expected_tier: 'medium' },
];

test('Phase 29 corpus labels all curated targets plus negative, collision, and boundary evidence', () => {
  const phase29 = tasks.filter(({ phase29 }) => phase29 === true);
  const positives = phase29.filter(({ phase29_classification }) => phase29_classification === 'positive');
  const expectedTargets = new Set([
    'gsd-ship', 'gsd-new-project', 'gsd-execute-phase', 'gsd-quick',
    'gsd-validate-phase', 'gsd-verify-work', 'gsd-resume-work', 'gsd-complete-milestone',
    'brandkit', 'minimalist-ui', 'industrial-brutalist-ui', 'image-to-code',
    'imagegen-frontend-web', 'imagegen-frontend-mobile', 'redesign-existing-projects',
    'stitch-design-taste', 'excalidraw-diagram', 'gpt-taste',
  ]);

  assert.deepEqual(new Set(positives.map(({ right }) => right.mode.replace(/^\//, ''))), expectedTargets);
  assert.ok(phase29.some(({ phase29_classification }) => phase29_classification === 'negative'));
  assert.ok(phase29.some(({ phase29_classification }) => phase29_classification === 'near_collision'));
  assert.equal(phase29.filter(({ phase29_classification }) => phase29_classification === 'boundary').length, 6);
  for (const task of phase29) {
    assert.ok(['positive', 'negative', 'near_collision', 'boundary'].includes(task.phase29_classification));
    assert.ok(['route', 'pass_through'].includes(task.right.status));
    assert.ok(['low', 'medium', 'high'].includes(task.right.tier));
    if (task.right.mode) {
      assert.ok(!task.prompt.toLowerCase().includes(task.right.mode.replace(/^\//, '')));
    }
  }
});

test('legacy calibration classes and counts remain intact', () => {
  const legacy = tasks.filter(({ phase29 }) => phase29 !== true);
  const phase05Count = legacy.filter((task) => String(task?.right?.edge || '').includes('COV-')).length;
  const originalCount = legacy.filter((task) => !task.codebase && !task.evolution && !task.phase14_mapping && !String(task?.right?.edge || '').includes('COV-')).length;
  assert.equal(legacy.length, 32);
  assert.equal(originalCount, 10);
  assert.equal(legacy.filter(({ codebase }) => codebase === true).length, 8);
  assert.equal(legacy.filter(({ evolution }) => evolution === true).length, 3);
  assert.equal(legacy.filter(({ phase14_mapping }) => phase14_mapping === true).length, 2);
  assert.equal(phase05Count, 9);
});

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
