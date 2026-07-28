// Plan 24-04 — HLTH-11 canary guard + versioned thresholds.
//
// Task 1: thresholds.mjs exports POLICY_VERSION, COOLDOWN_MS,
// CALIBRATION_CORPUS_VERSION, VERSIONED_WEIGHTS, TIER_BOUNDARIES and re-exports
// the evidence.mjs decay constants. loadThresholds / loadCalibrationCorpus
// return defaults on missing/corrupt. score.mjs imports its weights from
// thresholds.mjs (no inline weight numbers).
//
// Task 2: promoteThresholdCandidate delegates to canary-controller
// evaluateCandidate + applyCanaryDecision (no parallel gate suite).
// Insufficient evidence → rejected, no write. All 6 gates passing → promoted
// with atomic 0600 write. A failing gate → rejected.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  POLICY_VERSION,
  COOLDOWN_MS,
  CALIBRATION_CORPUS_VERSION,
  VERSIONED_WEIGHTS,
  TIER_BOUNDARIES,
  HALF_LIFE_MS,
  MAX_RETENTION_MS,
  MINIMUM_SAMPLES,
  loadThresholds,
  loadCalibrationCorpus,
  readActivePointer,
  healthVersionsRoot,
} from '../src/health/thresholds.mjs';
import { scoreCapability } from '../src/health/score.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCORE_PATH = join(__dirname, '..', 'src', 'health', 'score.mjs');
const BRIDGE_PATH = join(__dirname, '..', 'src', 'health', 'canary-bridge.mjs');
const scoreSource = readFileSync(SCORE_PATH, 'utf8');

function tempOwnedRoot() {
  return mkdtempSync(join(tmpdir(), 'health-canary-'));
}

// ---- Task 1: versioned thresholds module ----

test('HLTH-11 thresholds exports POLICY_VERSION (health-policy-v1, D-6: never bare version)', () => {
  assert.equal(POLICY_VERSION, 'health-policy-v1');
});

test('HLTH-11 thresholds exports COOLDOWN_MS default 1h', () => {
  assert.equal(COOLDOWN_MS, 60 * 60 * 1000);
});

test('HLTH-11 thresholds exports CALIBRATION_CORPUS_VERSION (health-calibration-v1, D-calibration)', () => {
  assert.equal(CALIBRATION_CORPUS_VERSION, 'health-calibration-v1');
});

test('HLTH-11 VERSIONED_WEIGHTS has the 5 score weights, frozen', () => {
  assert.deepEqual(Object.keys(VERSIONED_WEIGHTS).sort(),
    ['completion', 'confidence', 'opportunity', 'recency', 'reversibility']);
  assert.equal(VERSIONED_WEIGHTS.recency, 0.30);
  assert.equal(VERSIONED_WEIGHTS.completion, 0.25);
  assert.equal(VERSIONED_WEIGHTS.opportunity, 0.20);
  assert.equal(VERSIONED_WEIGHTS.reversibility, 0.15);
  assert.equal(VERSIONED_WEIGHTS.confidence, 0.10);
  assert.equal(Object.isFrozen(VERSIONED_WEIGHTS), true);
});

test('HLTH-11 TIER_BOUNDARIES has the 4 tier boundaries, frozen', () => {
  assert.equal(TIER_BOUNDARIES.high, 7500);
  assert.equal(TIER_BOUNDARIES.medium, 5000);
  assert.equal(TIER_BOUNDARIES.low, 2500);
  assert.equal(TIER_BOUNDARIES.low_usefulness, 0);
  assert.equal(Object.isFrozen(TIER_BOUNDARIES), true);
});

test('HLTH-11 import-source: thresholds.mjs re-exports HALF_LIFE_MS/MAX_RETENTION_MS/MINIMUM_SAMPLES from evidence.mjs (not redefined)', () => {
  const thresholdsSource = readFileSync(join(__dirname, '..', 'src', 'health', 'thresholds.mjs'), 'utf8');
  // Must import from evidence.mjs.
  assert.ok(/from\s+['"]\.\.\/evolution\/evidence\.mjs['"]/.test(thresholdsSource),
    'thresholds.mjs must import decay constants from evidence.mjs');
  // Must NOT redefine the constants as new values.
  assert.ok(!/export\s+const\s+HALF_LIFE_MS\s*=\s*\d/.test(thresholdsSource),
    'thresholds.mjs must not redefine HALF_LIFE_MS');
  assert.ok(!/export\s+const\s+MAX_RETENTION_MS\s*=\s*\d/.test(thresholdsSource),
    'thresholds.mjs must not redefine MAX_RETENTION_MS');
  assert.ok(!/export\s+const\s+MINIMUM_SAMPLES\s*=\s*\d/.test(thresholdsSource),
    'thresholds.mjs must not redefine MINIMUM_SAMPLES');
  // Values must match evidence.mjs.
  assert.equal(HALF_LIFE_MS, 24 * 60 * 60 * 1000);
  assert.equal(MAX_RETENTION_MS, 7 * HALF_LIFE_MS);
  assert.equal(MINIMUM_SAMPLES, 30);
});

test('HLTH-11 loadThresholds returns defaults when the versioned file is missing', () => {
  const root = tempOwnedRoot();
  const bundle = loadThresholds('health-policy-v1', { ownedRoot: root });
  assert.equal(bundle.policy_version, 'health-policy-v1');
  assert.equal(bundle.cooldown_ms, COOLDOWN_MS);
  assert.equal(bundle.calibration_corpus_version, CALIBRATION_CORPUS_VERSION);
  assert.deepEqual(bundle.weights, VERSIONED_WEIGHTS);
  assert.deepEqual(bundle.tier_boundaries, TIER_BOUNDARIES);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 loadThresholds reads a versioned thresholds.json when present', () => {
  const root = tempOwnedRoot();
  const vroot = healthVersionsRoot(root);
  const dir = join(vroot, 'health-policy-v2');
  mkdirSync(dir, { recursive: true });
  const custom = {
    policy_version: 'health-policy-v2',
    cooldown_ms: 2 * 60 * 60 * 1000,
    calibration_corpus_version: 'health-calibration-v2',
    weights: { recency: 0.35, completion: 0.25, opportunity: 0.20, reversibility: 0.10, confidence: 0.10 },
    tier_boundaries: { high: 8000, medium: 5500, low: 3000, low_usefulness: 0 },
  };
  writeFileSync(join(dir, 'thresholds.json'), JSON.stringify(custom), { mode: 0o600 });
  const bundle = loadThresholds('health-policy-v2', { ownedRoot: root });
  assert.equal(bundle.policy_version, 'health-policy-v2');
  assert.equal(bundle.cooldown_ms, 2 * 60 * 60 * 1000);
  assert.equal(bundle.weights.recency, 0.35);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 loadThresholds returns null on corrupt thresholds.json (never throws)', () => {
  const root = tempOwnedRoot();
  const vroot = healthVersionsRoot(root);
  const dir = join(vroot, 'health-policy-v1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'thresholds.json'), '{not valid json', { mode: 0o600 });
  const bundle = loadThresholds('health-policy-v1', { ownedRoot: root });
  assert.equal(bundle, null);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 loadCalibrationCorpus returns English-only v1 corpus on missing dir (D-calibration)', () => {
  const root = tempOwnedRoot();
  const corpus = loadCalibrationCorpus('health-policy-v1', { ownedRoot: root });
  assert.equal(corpus.corpus_version, CALIBRATION_CORPUS_VERSION);
  assert.deepEqual(corpus.languages, ['en']);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 loadCalibrationCorpus reads a manifest when present', () => {
  const root = tempOwnedRoot();
  const vroot = healthVersionsRoot(root);
  const dir = join(vroot, 'health-policy-v1', 'calibration');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'),
    JSON.stringify({ corpus_version: 'health-calibration-v1', languages: ['en'] }),
    { mode: 0o600 });
  const corpus = loadCalibrationCorpus('health-policy-v1', { ownedRoot: root });
  assert.equal(corpus.corpus_version, 'health-calibration-v1');
  assert.deepEqual(corpus.languages, ['en']);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 loadCalibrationCorpus returns English-only default on corrupt manifest (never throws)', () => {
  const root = tempOwnedRoot();
  const vroot = healthVersionsRoot(root);
  const dir = join(vroot, 'health-policy-v1', 'calibration');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), 'not json', { mode: 0o600 });
  const corpus = loadCalibrationCorpus('health-policy-v1', { ownedRoot: root });
  assert.deepEqual(corpus.languages, ['en']);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 score.mjs imports VERSIONED_WEIGHTS from thresholds.mjs (no inline weight numbers)', () => {
  // The grep guard from the plan's verification section.
  assert.ok(!/0\.30|0\.25|0\.20/.test(scoreSource),
    'score.mjs must not contain inline weight numbers 0.30/0.25/0.20');
  assert.ok(/from\s+['"]\.\/thresholds\.mjs['"]/.test(scoreSource),
    'score.mjs must import from thresholds.mjs');
  assert.ok(/VERSIONED_WEIGHTS/.test(scoreSource),
    'score.mjs must reference VERSIONED_WEIGHTS');
  assert.ok(/TIER_BOUNDARIES/.test(scoreSource),
    'score.mjs must reference TIER_BOUNDARIES');
});

test('HLTH-11 regression: score.mjs behavioral no-op — all Plan 24-02 score tests still pass (smoke)', () => {
  // Smoke-check the scorer still produces a judged tier for 30 completed
  // outcomes. The full regression is tests/router.health.score.test.mjs.
  const NOW = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;
  const outcomes = Array.from({ length: 30 }, (_, i) => ({
    timestamp_ms: NOW - i * HOUR,
    outcome_kind: 'completed',
    capability_id: 'skill:debug',
    route_id: 'route-001',
  }));
  const result = scoreCapability({
    outcomes,
    contract: { reversibility: 'reversible', confidence_basis_points: 9000 },
    now: NOW,
  });
  assert.equal(result.tier, 'high');
  assert.ok(result.usefulness_basis_points >= TIER_BOUNDARIES.high);
});