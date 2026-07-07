// Task 2 (RED→GREEN): Confidence tier decision for router.mjs (RTE-05/D-09).
// High = top ≥ T_high AND margin ≥ M; Low = top < T_low OR tie (margin < M);
// Medium = everything else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { confidenceTier } = await import(HOOK);

const T = { T_high: 0.6, T_low: 0.3, M: 0.2 };

test('tier: s = T_high with decisive margin → high', () => {
  assert.equal(confidenceTier(0.6, 0.1, T), 'high');
});

test('tier: s = T_high - ε (decisive margin) → medium', () => {
  // top just below T_high but well above runner-up → medium
  assert.equal(confidenceTier(0.59, 0.1, T), 'medium');
});

test('tier: s = T_low - ε → low', () => {
  assert.equal(confidenceTier(0.29, 0.0, T), 'low');
});

test('tier: top-2 within M tie (margin < M) → low', () => {
  // top = 0.9, runner = 0.85, margin = 0.05 < M=0.2 → tie → low
  assert.equal(confidenceTier(0.9, 0.85, T), 'low');
});

test('tier: top ≥ T_high but margin < M → low (tie rule wins over T_high)', () => {
  // top = 0.7, runner = 0.6, margin = 0.1 < M=0.2 → top-2 within tie margin → low.
  // The tie rule takes precedence: a decisive-but-moderate score that is NOT
  // clearly separated from its runner-up is not safe to auto-inject.
  assert.equal(confidenceTier(0.7, 0.6, T), 'low');
});

test('tier: T_low ≤ top < T_high with decisive margin → medium', () => {
  assert.equal(confidenceTier(0.4, 0.1, T), 'medium');
  assert.equal(confidenceTier(0.5, 0.05, T), 'medium');
});

test('tier: top = 1.0, runner = 0.0 (only one match) → high', () => {
  assert.equal(confidenceTier(1.0, 0.0, T), 'high');
});

test('tier: top = 0.0 (no pattern matched) → low', () => {
  assert.equal(confidenceTier(0.0, 0.0, T), 'low');
});

test('tier: default thresholds when none provided', () => {
  // defaults: T_high=0.6, T_low=0.3, M=0.2
  assert.equal(confidenceTier(0.8, 0.1), 'high');
  assert.equal(confidenceTier(0.1, 0.0), 'low');
});

test('tier: margin clearly above M (decisive) → high or medium by top score', () => {
  // margin = 0.3 > M=0.2 (avoid float-precision exact-boundary): top < T_high → medium
  assert.equal(confidenceTier(0.5, 0.2, T), 'medium');
  // margin = 0.4 > M; top ≥ T_high → high
  assert.equal(confidenceTier(0.7, 0.3, T), 'high');
});

test('tier: margin just below M (tie) → low (strict < M)', () => {
  // margin = 0.15 < M=0.2 → tie → low
  assert.equal(confidenceTier(0.9, 0.75, T), 'low');
});

test('tier: runner-up undefined defaults to 0 (decisive)', () => {
  assert.equal(confidenceTier(0.7, undefined, T), 'high');
  assert.equal(confidenceTier(0.2, undefined, T), 'low');
});