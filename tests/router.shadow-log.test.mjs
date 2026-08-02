import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const {
  buildShadowDivergenceReport,
  observeShadowEvent,
  readShadowOutcomes,
} = await import(HOOK);
import {
  existsSync, mkdtempSync, readFileSync, writeFileSync,
} from 'node:fs';

const SIG_A = 'a'.repeat(64);
const SIG_B = 'b'.repeat(64);
const SIG_C = 'c'.repeat(64);
const SIG_CACHE = 'd'.repeat(64);

function fixture({ cacheOnly = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-shadow-log-'));
  const telemetryPath = join(root, 'telemetry.jsonl');
  const shadowPath = join(root, 'shadow-log.jsonl');
  const statePath = join(root, 'shadow-state.json');
  const now = 1_800_000_000_000;
  const rows = [
    { ts: now - 3_000, prompt_signature: SIG_A, suggested_mode: 'debug', suggested_skills: ['gsd-debug'], suggested_agents: [], runtime: 'claude', cache_hit: false, cache_status: 'miss' },
    { ts: now - 2_000, prompt_signature: SIG_B, suggested_mode: 'verify', suggested_skills: ['gsd-verify'], suggested_agents: [], runtime: 'claude', cache_hit: false, cache_status: 'miss' },
    { ts: now - 1_000, prompt_signature: SIG_C, suggested_mode: 'ship', suggested_skills: ['gsd-ship'], suggested_agents: [], runtime: 'claude', cache_hit: false, cache_status: 'miss' },
    { ts: now - 500, prompt_signature: SIG_CACHE, suggested_mode: 'cached', suggested_skills: ['gsd-cached'], suggested_agents: [], runtime: 'claude', cache_hit: true, cache_status: 'hit' },
    { ts: now - 100, prompt_signature: 'e'.repeat(64), suggested_mode: 'other-runtime', suggested_skills: ['codex-only'], suggested_agents: [], runtime: 'codex', cache_hit: false, cache_status: 'miss' },
  ];
  writeFileSync(telemetryPath, (cacheOnly ? rows.slice(3, 4) : rows).map(JSON.stringify).join('\n') + '\n');
  return { root, telemetryPath, shadowPath, statePath, now };
}

function options(f) {
  return {
    telemetryPath: f.telemetryPath,
    shadowPath: f.shadowPath,
    statePath: f.statePath,
    runtime: 'claude',
    now: f.now,
    maxAgeMs: 10_000,
  };
}

test('shadow observer records accepted, rejected, and no_signal once for fresh suggestions', () => {
  const f = fixture();
  const accepted = observeShadowEvent({
    hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'gsd-debug' },
  }, options(f));
  const rejected = observeShadowEvent({
    hook_event_name: 'PostToolUseFailure', tool_name: 'Skill', tool_input: { skill: 'gsd-verify' },
  }, options(f));
  const noSignal = observeShadowEvent({
    hook_event_name: 'Stop', stop_hook_active: false,
  }, options(f));
  assert.equal(accepted.outcome, 'accepted');
  assert.equal(rejected.outcome, 'rejected');
  assert.equal(noSignal.outcome, 'no_signal');
  assert.equal(observeShadowEvent({ hook_event_name: 'Stop', stop_hook_active: false }, options(f)).status, 'ignored');

  const rows = readShadowOutcomes({ shadowPath: f.shadowPath });
  assert.deepEqual(rows.map((row) => row.outcome), ['accepted', 'rejected', 'no_signal']);
  assert.equal(rows.every((row) => row.runtime === 'claude'), true);
  assert.equal(rows.every((row) => /^[a-f0-9]{64}$/.test(row.suggestion_id)), true);
  assert.equal(rows.every((row) => /^[a-f0-9]{64}$/.test(row.invocation_signature) || row.invocation_signature === null), true);
  const persisted = readFileSync(f.shadowPath, 'utf8');
  assert.doesNotMatch(persisted, /command_args|tool_input|tool_response|transcript_path/);
});

test('cache-hit and other-runtime suggestions are excluded', () => {
  const f = fixture({ cacheOnly: true });
  const result = observeShadowEvent({
    hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'gsd-cached' },
  }, options(f));
  assert.equal(result.status, 'ignored');
  assert.equal(result.reason_code, 'no_fresh_suggestion');
  assert.equal(existsSync(f.shadowPath), false);
});

test('divergence report is deterministic and calibration remains disabled', () => {
  const f = fixture();
  observeShadowEvent({ hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill: 'gsd-debug' } }, options(f));
  observeShadowEvent({ hook_event_name: 'PostToolUseFailure', tool_name: 'Skill', tool_input: { skill: 'gsd-verify' } }, options(f));
  observeShadowEvent({ hook_event_name: 'Stop', stop_hook_active: false }, options(f));
  const one = buildShadowDivergenceReport({ shadowPath: f.shadowPath });
  const two = buildShadowDivergenceReport({ shadowPath: f.shadowPath });
  assert.deepEqual(one, two);
  assert.equal(one.schema_version, 1);
  assert.equal(one.calibration_enabled, false);
  assert.deepEqual(one.by_mode.debug, { accepted: 1, rejected: 0, no_signal: 0 });
  assert.deepEqual(one.by_mode.verify, { accepted: 0, rejected: 1, no_signal: 0 });
  assert.deepEqual(one.by_mode.ship, { accepted: 0, rejected: 0, no_signal: 1 });
});
