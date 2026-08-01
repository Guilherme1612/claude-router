// Phase 30 / Plan 03 (TDD): Calibration epoch-keying (INVC-03).
// loadEpochCalibration gates hot-path thresholds by the manifest fingerprint:
//   - match:    calibration file whose manifest_fingerprint equals the manifest's → per-install thresholds win
//   - mismatch: different fingerprint → mode-map defaults 0.591/0.291/0.191 win, calibration ignored
//   - absent:   no calibration file → mode-map defaults win, no throw
//   - corrupt:  malformed calibration JSON → mode-map defaults win, no throw
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { inspectDecision, loadEpochCalibration } = mod;

// The named roadmap defaults (mode-map carry them; these are the literal
// fallback when modeMap.thresholds is absent too).
const DEFAULT_T = { T_high: 0.591, T_low: 0.291, M: 0.191 };
const CAL_T = { T_high: 0.8, T_low: 0.4, M: 0.25 };

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-calib-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// Minimal fake manifest carrying a manifest_fingerprint, matching the shape
// buildTargetIndexes + the epoch consult consume.
function baseManifest(fingerprint = 'fp-1') {
  return {
    manifest_fingerprint: fingerprint,
    skills: [{ name: 'impeccable' }],
    agents: [{ name: 'code-reviewer' }],
    commands: [{ name: 'gsd-debug' }],
    plugin_skills: [],
    agents_store_skills: [],
    project_scoped_skills: [],
  };
}

const modeMap = { thresholds: DEFAULT_T };

// Run inspectDecision with a temp calibration file of the given kind.
// Returns { out, calibrationPath } so tests can also assert non-mutation.
function decisionFor(kind) {
  return withTempDir((dir) => {
    const calibrationPath = join(dir, 'calibration.json');
    if (kind === 'match') {
      writeFileSync(calibrationPath, JSON.stringify({ manifest_fingerprint: 'fp-1', thresholds: CAL_T }));
    } else if (kind === 'mismatch') {
      writeFileSync(calibrationPath, JSON.stringify({ manifest_fingerprint: 'fp-2', thresholds: CAL_T }));
    } else if (kind === 'corrupt') {
      writeFileSync(calibrationPath, 'not json{');
    }
    // absent: leave the file unwritten
    const out = inspectDecision('calibrate me', {
      manifest: baseManifest('fp-1'),
      modeMap,
      calibrationPath,
      mutateCache: false,
      logTelemetry: false,
    });
    return { out, calibrationPath };
  });
}

// --- Test 1 (match): fingerprint matches → per-install thresholds win ---
test('INVC-03 match: calibration with matching manifest_fingerprint yields per-install thresholds', () => {
  const { out, calibrationPath } = decisionFor('match');
  assert.equal(out.score_debug.T_high, 0.8);
  assert.equal(out.score_debug.T_low, 0.4);
  assert.equal(out.score_debug.M, 0.25);
});

test('INVC-03 match: the calibration file is not mutated by the read', () => {
  const { out, calibrationPath } = decisionFor('match');
  const onDisk = JSON.parse(readFileSync(calibrationPath, 'utf8'));
  assert.deepEqual(onDisk, { manifest_fingerprint: 'fp-1', thresholds: CAL_T });
});

// --- Test 2 (mismatch): different fingerprint → mode-map defaults win ---
test('INVC-03 mismatch: calibration with a different fingerprint is ignored; mode-map defaults win', () => {
  const { out, calibrationPath } = decisionFor('mismatch');
  assert.equal(out.score_debug.T_high, DEFAULT_T.T_high);
  assert.equal(out.score_debug.T_low, DEFAULT_T.T_low);
  assert.equal(out.score_debug.M, DEFAULT_T.M);
});

// --- Test 3 (absent): no calibration file → mode-map defaults win, no throw ---
test('INVC-03 absent: no calibration file → mode-map defaults win, no throw', () => {
  const { out } = decisionFor('absent');
  assert.equal(out.score_debug.T_high, DEFAULT_T.T_high);
  assert.equal(out.score_debug.T_low, DEFAULT_T.T_low);
  assert.equal(out.score_debug.M, DEFAULT_T.M);
});

// --- Test 4 (corrupt): invalid JSON → mode-map defaults win, no throw ---
test('INVC-03 corrupt: malformed calibration JSON → mode-map defaults win, no throw', () => {
  const { out } = decisionFor('corrupt');
  assert.equal(out.score_debug.T_high, DEFAULT_T.T_high);
  assert.equal(out.score_debug.T_low, DEFAULT_T.T_low);
  assert.equal(out.score_debug.M, DEFAULT_T.M);
});

// --- Direct unit check of loadEpochCalibration fail-open semantics ---
test('INVC-03 unit: loadEpochCalibration never throws and returns matched:false on corrupt/absent', () => {
  const res = loadEpochCalibration('fp-1', { calibrationPath: join(tmpdir(), 'router-calib-does-not-exist.json') });
  assert.equal(res.matched, false);
  assert.equal(res.thresholds, null);
});
