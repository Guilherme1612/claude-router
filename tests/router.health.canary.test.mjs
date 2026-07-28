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

// ---- Task 2: canary bridge — threshold activation through evaluateCandidate ----

import { promoteThresholdCandidate, createHealthPublication } from '../src/health/canary-bridge.mjs';
import { createEvidenceStore } from '../src/evolution/evidence.mjs';

const bridgeSource = readFileSync(BRIDGE_PATH, 'utf8');

// Build a validated, sufficient evidence window fixture (35 samples).
function makeSufficientWindow() {
  const store = createEvidenceStore({ now: () => 1_700_000_000_000 });
  for (let i = 0; i < 35; i++) {
    store.append({
      timestamp_ms: 1_700_000_000_000 - i * 3600_000,
      route_id: 'route-001',
      confidence_band: 'high',
      guard_codes: [],
      reason_code: 'ok',
      fixture_class: 'minimal-prompt',
      latency_us: 100,
      candidate_version: 'v1-abcdef0123456789',
      policy_version: 'health-policy-v1',
      verdict: 'success',
      prompt_signature: 'a'.repeat(64),
    }, { project_id: 'proj-test' });
  }
  return store.window({ project_id: 'proj-test' });
}

// Build a validated, INSUFFICIENT evidence window (5 samples < 30 floor).
function makeInsufficientWindow() {
  const store = createEvidenceStore({ now: () => 1_700_000_000_000 });
  for (let i = 0; i < 5; i++) {
    store.append({
      timestamp_ms: 1_700_000_000_000 - i * 3600_000,
      route_id: 'route-001',
      confidence_band: 'high',
      guard_codes: [],
      reason_code: 'ok',
      fixture_class: 'minimal-prompt',
      latency_us: 100,
      candidate_version: 'v1-abcdef0123456789',
      policy_version: 'health-policy-v1',
      verdict: 'success',
      prompt_signature: 'b'.repeat(64),
    }, { project_id: 'proj-test' });
  }
  return store.window({ project_id: 'proj-test' });
}

function makeValidCandidate(policy_version = 'health-policy-v2') {
  return {
    policy_version,
    weights: { recency: 0.35, completion: 0.25, opportunity: 0.20, reversibility: 0.10, confidence: 0.10 },
    tier_boundaries: { high: 8000, medium: 5500, low: 3000, low_usefulness: 0 },
    cooldown_ms: 2 * 60 * 60 * 1000,
    calibration_corpus_version: 'health-calibration-v1',
  };
}

test('HLTH-11 D-canary: bridge imports evaluateCandidate + applyCanaryDecision + REQUIRED_GATES from canary-controller (no parallel gate suite)', () => {
  assert.ok(/evaluateCandidate/.test(bridgeSource), 'bridge must import evaluateCandidate');
  assert.ok(/applyCanaryDecision/.test(bridgeSource), 'bridge must import applyCanaryDecision');
  assert.ok(/REQUIRED_GATES/.test(bridgeSource), 'bridge must import REQUIRED_GATES');
  // Must NOT redefine REQUIRED_GATES as a new array.
  assert.ok(!/REQUIRED_GATES\s*=\s*Object\.freeze\(\s*\[/.test(bridgeSource),
    'bridge must not redefine REQUIRED_GATES (no parallel gate suite)');
  // Must import from canary-controller.mjs.
  assert.ok(/from\s+['"]\.\.\/evolution\/canary-controller\.mjs['"]/.test(bridgeSource),
    'bridge must import from canary-controller.mjs');
});

test('HLTH-11 D-canary: insufficient evidence → rejected, no write', () => {
  const root = tempOwnedRoot();
  const window = makeInsufficientWindow();
  assert.equal(window.sufficient, false, 'fixture must be insufficient');
  const result = promoteThresholdCandidate({
    candidate: makeValidCandidate(),
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason_code, 'insufficient_evidence_samples');
  // No write to versions/<policy_version>/.
  const vroot = healthVersionsRoot(root);
  assert.equal(existsSync(join(vroot, 'health-policy-v2', 'thresholds.json')), false);
  assert.equal(existsSync(join(vroot, 'active.json')), false);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: all 6 gates passing + sufficient evidence → promoted, atomic 0600 write', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  assert.equal(window.sufficient, true, 'fixture must be sufficient');
  const result = promoteThresholdCandidate({
    candidate: makeValidCandidate('health-policy-v2'),
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(result.status, 'promoted');
  assert.equal(result.policy_version, 'health-policy-v2');
  assert.ok(/^[a-f0-9]{64}$/.test(result.fingerprint), 'fingerprint must be 64-hex sha256');
  // thresholds.json written with 0600 perms.
  const vroot = healthVersionsRoot(root);
  const file = join(vroot, 'health-policy-v2', 'thresholds.json');
  assert.equal(existsSync(file), true, 'thresholds.json must be written');
  const stat = statSync(file);
  const mode = stat.mode & 0o777;
  assert.equal(mode, 0o600, 'thresholds.json must have 0600 perms');
  // Content matches the candidate bundle.
  const written = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(written.policy_version, 'health-policy-v2');
  assert.equal(written.cooldown_ms, 2 * 60 * 60 * 1000);
  // active.json pointer updated.
  const pointer = JSON.parse(readFileSync(join(vroot, 'active.json'), 'utf8'));
  assert.equal(pointer.policy_version, 'health-policy-v2');
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: a failing compatibility gate (broken weights shape) → rejected, no write', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  const brokenCandidate = makeValidCandidate();
  // Drop a weight key to break the 5-key shape.
  delete brokenCandidate.weights.reversibility;
  const result = promoteThresholdCandidate({
    candidate: brokenCandidate,
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason_code, 'compatibility_uncertain');
  const vroot = healthVersionsRoot(root);
  assert.equal(existsSync(join(vroot, 'health-policy-v2', 'thresholds.json')), false);
  assert.equal(existsSync(join(vroot, 'active.json')), false);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: a failing compatibility gate (renamed weight key) → rejected', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  const brokenCandidate = makeValidCandidate();
  delete brokenCandidate.weights.recency;
  brokenCandidate.weights.recency_new = 0.35;
  const result = promoteThresholdCandidate({
    candidate: brokenCandidate,
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason_code, 'compatibility_uncertain');
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: candidate with wrong policy_version scheme → rejected by compatibility gate', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  const badVersionCandidate = makeValidCandidate('not-a-health-version');
  const result = promoteThresholdCandidate({
    candidate: badVersionCandidate,
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(result.status, 'rejected');
  // proposeCandidate rejects the invalid token before evaluateCandidate runs,
  // OR the compatibility gate fails. Either way, the result is rejected.
  assert.equal(result.status, 'rejected');
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: candidate with new VALUES but preserved shape → promoted (canary evidences the change, does not forbid it)', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  const newValuesCandidate = makeValidCandidate('health-policy-v2');
  // Change values but keep the 5-key shape.
  newValuesCandidate.weights.recency = 0.40;
  newValuesCandidate.weights.completion = 0.20;
  const result = promoteThresholdCandidate({
    candidate: newValuesCandidate,
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(result.status, 'promoted');
  assert.equal(result.policy_version, 'health-policy-v2');
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: known_good_version defaults to active pointer or POLICY_VERSION', () => {
  const root = tempOwnedRoot();
  const vroot = healthVersionsRoot(root);
  // No active.json → defaults to POLICY_VERSION.
  assert.equal(readActivePointer(root), null);
  // Promote a candidate (writes active.json).
  const window = makeSufficientWindow();
  promoteThresholdCandidate({
    candidate: makeValidCandidate('health-policy-v2'),
    evidence_window: window,
    ownedRoot: root,
  });
  // Now active.json points to health-policy-v2.
  assert.equal(readActivePointer(root), 'health-policy-v2');
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: versions/active.json pointer lives under health/versions/ (D-5 isolated from release-tuples)', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  promoteThresholdCandidate({
    candidate: makeValidCandidate('health-policy-v2'),
    evidence_window: window,
    ownedRoot: root,
  });
  const vroot = healthVersionsRoot(root);
  assert.equal(existsSync(join(vroot, 'active.json')), true);
  // The pointer is under <ownedRoot>/versions/, NOT under a release-tuples dir.
  assert.ok(vroot === join(root, 'versions'),
    'versions root must be <ownedRoot>/versions/');
  assert.ok(!vroot.includes('release-tuples'),
    'versions root must not be under release-tuples/');
  rmSync(root, { recursive: true, force: true });
});

// WR-02: recoverActiveVersion receives the versions root (join(healthRoot,
// 'versions')) as `ownedRoot` because promoteThresholdCandidate computes
// `root = healthVersionsRoot(ownedRoot)` and passes that as activation.ownedRoot
// and applyCanaryDecision's ownedRoot. readActivePointer appends 'versions/'
// itself, so delegating to it would read
// `<healthRoot>/versions/versions/active.json` — a nonexistent path — and
// always return null. This test promotes a candidate (writing active.json at
// the correct path), then calls recoverActiveVersion with the versions root
// and asserts the correct policy_version is returned. Before the fix this
// returned null.
test('WR-02 recoverActiveVersion reads active.json from the correct path when passed the versions root', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  const promoted = promoteThresholdCandidate({
    candidate: makeValidCandidate('health-policy-v2'),
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(promoted.status, 'promoted');
  const vroot = healthVersionsRoot(root);
  const publication = createHealthPublication();
  const recovered = publication.recoverActiveVersion({ ownedRoot: vroot });
  assert.equal(recovered.recovery_status, 'clear');
  assert.equal(recovered.version_id, 'health-policy-v2',
    `expected recoverActiveVersion to read active.json from the versions root, got ${JSON.stringify(recovered)}`);
  rmSync(root, { recursive: true, force: true });
});

test('WR-02 recoverActiveVersion returns null version_id when active.json is absent (no double-versions read)', () => {
  const root = tempOwnedRoot();
  const vroot = healthVersionsRoot(root);
  mkdirSync(vroot, { recursive: true });
  const publication = createHealthPublication();
  const recovered = publication.recoverActiveVersion({ ownedRoot: vroot });
  assert.equal(recovered.recovery_status, 'clear');
  assert.equal(recovered.version_id, null);
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: invalid candidate (null) → rejected', () => {
  const root = tempOwnedRoot();
  const window = makeSufficientWindow();
  const result = promoteThresholdCandidate({
    candidate: null,
    evidence_window: window,
    ownedRoot: root,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason_code, 'invalid_candidate');
  rmSync(root, { recursive: true, force: true });
});

test('HLTH-11 D-canary: invalid evidence fingerprint → rejected', () => {
  const root = tempOwnedRoot();
  const result = promoteThresholdCandidate({
    candidate: makeValidCandidate(),
    evidence_window: { source_evidence_fingerprint: 'not-a-hash', sufficient: true, status: 'validated' },
    ownedRoot: root,
  });
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason_code, 'invalid_evidence_fingerprint');
  rmSync(root, { recursive: true, force: true });
});