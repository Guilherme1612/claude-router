import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { inspectDecision, observeShadowEvent, rollbackEpochCalibration } = await import(HOOK);
const FINGERPRINT = 'b'.repeat(64);

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-auto-calib-life-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

function acceptedRow(i) {
  return {
    schema_version: 1,
    timestamp_ms: 100 + i,
    suggestion_id: `${String(i).padStart(3, '0')}${'c'.repeat(61)}`,
    prompt_signature: `${String(i).padStart(2, '0')}${'d'.repeat(62)}`,
    suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [],
    invocation_signature: `${'e'.repeat(64)}`,
    outcome: 'accepted', runtime: 'claude', source_event: 'PostToolUse',
  };
}

test('shadow settlement publishes calibration at the accepted floor', () => {
  withTempDir((dir) => {
    const telemetryPath = join(dir, 'telemetry.jsonl');
    const shadowPath = join(dir, 'shadow-log.jsonl');
    const statePath = join(dir, 'shadow-state.json');
    const calibrationPath = join(dir, 'calibration.json');
    const now = Date.now();
    const promptSignature = 'f'.repeat(64);
    const suggestionId = '1'.repeat(64);
    const telemetry = {
      ts: now - 1000, prompt_signature: promptSignature, suggestion_id: suggestionId,
      suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [],
      cache_hit: false, cache_status: 'miss', runtime: 'claude',
    };
    writeFileSync(telemetryPath, JSON.stringify(telemetry) + '\n');
    writeFileSync(shadowPath, Array.from({ length: 49 }, (_, i) => JSON.stringify(acceptedRow(i))).join('\n') + '\n');

    const result = observeShadowEvent({
      hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'gsd-debug' },
    }, {
      telemetryPath, shadowPath, statePath, calibrationPath,
      manifestFingerprint: FINGERPRINT, modeMapVersion: 4, now,
    });
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.calibration_status, 'stored');
    assert.ok(existsSync(calibrationPath));
    const file = JSON.parse(readFileSync(calibrationPath, 'utf8'));
    assert.equal(file.manifest_fingerprint, FINGERPRINT);
    assert.equal(file.mode_map_version, '4');
    assert.equal(file.evidence.accepted, 50);
  });
});

test('mode-map version mismatch falls back to defaults without mutating calibration', () => {
  withTempDir((dir) => {
    const calibrationPath = join(dir, 'calibration.json');
    const file = {
      schema_version: 1, manifest_fingerprint: FINGERPRINT, mode_map_version: '3',
      corpus_hash: 'a'.repeat(64), thresholds: { T_high: 0.641, T_low: 0.341, M: 0.241 },
    };
    writeFileSync(calibrationPath, JSON.stringify(file));
    const out = inspectDecision('debug this router issue', {
      manifest: { manifest_fingerprint: FINGERPRINT, skills: [{ name: 'gsd-debug' }], agents: [], commands: [], plugin_skills: [], agents_store_skills: [], project_scoped_skills: [] },
      modeMap: { schema_version: 4, thresholds: { T_high: 0.591, T_low: 0.291, M: 0.191 }, entries: [] },
      calibrationPath, mutateCache: false, logTelemetry: false,
    });
    assert.deepEqual(out.score_debug, { ...out.score_debug, T_high: 0.591, T_low: 0.291, M: 0.191 });
    assert.deepEqual(JSON.parse(readFileSync(calibrationPath, 'utf8')), file);
  });
});

test('rollback marks the calibration inactive and routing returns to defaults', () => {
  withTempDir((dir) => {
    const calibrationPath = join(dir, 'calibration.json');
    writeFileSync(calibrationPath, JSON.stringify({
      schema_version: 1, manifest_fingerprint: FINGERPRINT, mode_map_version: '4',
      corpus_hash: 'a'.repeat(64), thresholds: { T_high: 0.641, T_low: 0.341, M: 0.241 },
      calibration_status: 'active', rollback_thresholds: { T_high: 0.591, T_low: 0.291, M: 0.191 },
    }));
    const result = rollbackEpochCalibration({ calibrationPath, now: 20 });
    assert.equal(result.status, 'rolled_back');
    const out = inspectDecision('debug this router issue', {
      manifest: { manifest_fingerprint: FINGERPRINT, skills: [{ name: 'gsd-debug' }], agents: [], commands: [], plugin_skills: [], agents_store_skills: [], project_scoped_skills: [] },
      modeMap: { schema_version: 4, thresholds: { T_high: 0.591, T_low: 0.291, M: 0.191 }, entries: [] },
      calibrationPath, mutateCache: false, logTelemetry: false,
    });
    assert.equal(out.score_debug.T_high, 0.591);
    assert.equal(out.score_debug.T_low, 0.291);
    assert.equal(out.score_debug.M, 0.191);
  });
});
