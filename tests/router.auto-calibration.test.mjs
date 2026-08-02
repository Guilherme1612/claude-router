import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const {
  deriveCalibrationThresholds,
  maybeCalibrateShadow,
  rollbackEpochCalibration,
  writeEpochCalibration,
} = await import(HOOK);

const DEFAULTS = { T_high: 0.591, T_low: 0.291, M: 0.191 };
const FINGERPRINT = 'a'.repeat(64);

function rows(accepted, rejected = 0, noSignal = 0) {
  return [
    ...Array.from({ length: accepted }, (_, i) => ({
      suggestion_id: `${String(i).padStart(3, '0')}${'a'.repeat(61)}`,
      prompt_signature: `${String(i).padStart(2, '0')}${'b'.repeat(62)}`,
      suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [],
      outcome: 'accepted', runtime: 'claude', source_event: 'PostToolUse',
    })),
    ...Array.from({ length: rejected }, (_, i) => ({
      suggestion_id: `${String(i + accepted).padStart(3, '0')}${'c'.repeat(61)}`,
      prompt_signature: `${String(i + accepted).padStart(2, '0')}${'d'.repeat(62)}`,
      suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [],
      outcome: 'rejected', runtime: 'claude', source_event: 'PostToolUseFailure',
    })),
    ...Array.from({ length: noSignal }, (_, i) => ({
      suggestion_id: `${String(i + accepted + rejected).padStart(3, '0')}${'e'.repeat(61)}`,
      prompt_signature: `${String(i + accepted + rejected).padStart(2, '0')}${'f'.repeat(62)}`,
      suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [],
      outcome: 'no_signal', runtime: 'claude', source_event: 'Stop',
    })),
  ];
}

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-auto-calib-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('calibration waits for 50 accepted outcomes', () => {
  const result = deriveCalibrationThresholds(rows(49, 20));
  assert.equal(result.status, 'insufficient_evidence');
  assert.deepEqual(result.thresholds, DEFAULTS);
});

test('calibration is Bayesian, damped, clamped, and reproducible', () => {
  const evidence = rows(50, 0, 4);
  const first = deriveCalibrationThresholds(evidence);
  const second = deriveCalibrationThresholds([...evidence].reverse());
  assert.equal(first.status, 'ready');
  assert.deepEqual(first, second);
  for (const key of Object.keys(DEFAULTS)) {
    assert.ok(Math.abs(first.thresholds[key] - DEFAULTS[key]) <= 0.050001);
    assert.ok(first.thresholds[key] >= 0 && first.thresholds[key] <= 1);
  }
  assert.ok(first.thresholds.T_low <= first.thresholds.T_high);
  assert.notEqual(first.thresholds.T_high, 1);
  assert.equal(first.counts.no_signal, 4);
});

test('epoch publisher stores metadata and preserves rollback baseline', () => {
  withTempDir((dir) => {
    const shadowPath = join(dir, 'shadow-log.jsonl');
    const calibrationPath = join(dir, 'calibration.json');
    writeFileSync(shadowPath, rows(50, 0).map((row) => JSON.stringify(row)).join('\n') + '\n');
    const first = maybeCalibrateShadow({
      shadowPath, calibrationPath, manifestFingerprint: FINGERPRINT, modeMapVersion: 4, now: 10,
    });
    assert.equal(first.status, 'stored');
    assert.ok(existsSync(calibrationPath));
    const firstFile = JSON.parse(readFileSync(calibrationPath, 'utf8'));
    assert.equal(firstFile.manifest_fingerprint, FINGERPRINT);
    assert.equal(firstFile.mode_map_version, '4');
    assert.match(firstFile.corpus_hash, /^[a-f0-9]{64}$/);
    assert.deepEqual(firstFile.rollback_thresholds, DEFAULTS);

    const invalid = writeEpochCalibration({ status: 'ready', manifest_fingerprint: 'bad' }, { calibrationPath });
    assert.equal(invalid.status, 'ignored');
    assert.deepEqual(JSON.parse(readFileSync(calibrationPath, 'utf8')), firstFile);

    const rolledBack = rollbackEpochCalibration({ calibrationPath, now: 11 });
    assert.equal(rolledBack.status, 'rolled_back');
    assert.equal(rolledBack.calibration.calibration_status, 'rolled_back');
    assert.deepEqual(rolledBack.calibration.thresholds, DEFAULTS);
  });
});
