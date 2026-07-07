// Task 2 (RED→GREEN): Per-query normalization for router.mjs (RTE-02/§3).
// s_norm(d) = score(d)/max → top = 1.0; runner-up margin = 1 - s_norm(runner_up).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { normalize } = await import(HOOK);

test('normalize: top match maps to 1.0', () => {
  const scored = [
    { entry: { id: 'a' }, name: 'a', score: 5.0 },
    { entry: { id: 'b' }, name: 'b', score: 2.5 },
    { entry: { id: 'c' }, name: 'c', score: 1.0 },
  ];
  const n = normalize(scored);
  assert.equal(n[0].norm, 1.0);
  assert.equal(n[0].name, 'a');
});

test('normalize: all scores divided by max → in (0,1]', () => {
  const scored = [
    { entry: {}, name: 'a', score: 8.0 },
    { entry: {}, name: 'b', score: 4.0 },
    { entry: {}, name: 'c', score: 2.0 },
  ];
  const n = normalize(scored);
  for (const x of n) assert.ok(x.norm > 0 && x.norm <= 1.0);
  assert.equal(n[1].norm, 0.5);
  assert.equal(n[2].norm, 0.25);
});

test('normalize: runner-up margin = 1 - s_norm(runner_up)', () => {
  const scored = [
    { entry: {}, name: 'a', score: 10.0 },
    { entry: {}, name: 'b', score: 7.0 },
  ];
  const n = normalize(scored);
  const margin = 1 - n[1].norm;
  assert.ok(Math.abs(margin - 0.3) < 1e-9, `margin should be 0.3, got ${margin}`);
});

test('normalize: preserves order (sorted descending)', () => {
  const scored = [
    { entry: {}, name: 'a', score: 3.0 },
    { entry: {}, name: 'b', score: 2.0 },
    { entry: {}, name: 'c', score: 1.0 },
  ];
  const n = normalize(scored);
  assert.ok(n[0].norm >= n[1].norm >= n[2].norm);
});

test('normalize: single entry → norm 1.0', () => {
  const n = normalize([{ entry: {}, name: 'only', score: 1.7 }]);
  assert.equal(n.length, 1);
  assert.equal(n[0].norm, 1.0);
});

test('normalize: empty input returns []', () => {
  assert.deepEqual(normalize([]), []);
  assert.deepEqual(normalize(null), []);
});

test('normalize: zero-max (all scores 0) → norms 0 (no division by zero)', () => {
  const scored = [
    { entry: {}, name: 'a', score: 0 },
    { entry: {}, name: 'b', score: 0 },
  ];
  const n = normalize(scored);
  assert.equal(n[0].norm, 0);
  assert.equal(n[1].norm, 0);
});