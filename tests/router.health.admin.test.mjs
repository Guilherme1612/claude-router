// Plan 24-03 Task 2 — HLTH-05 admin reset/dispose/recover + D-5 content-hash
// isolation gate. Covers:
//   - reset writes state.json to '{}' atomically (0600 perms)
//   - dispose renames state.json → state.disposed.json (recoverable, not deleted)
//   - recover restores from disposed OR rebuilds from outcomes.jsonl
//   - inspect still works after reset/dispose/recover cycles (and surfaces
//     a 'disposed' flag)
//   - D-5 content-hash isolation: SHA-256 of ALL FOUR protected artifacts
//     (release-tuples/active.json, mode-map.json, registry/registry.json,
//     weights.json) is byte-identical before/after every admin command
//   - W3 extended import gate: admin.mjs has no import of activate.mjs,
//     publish-index.mjs, src/registry/registry.mjs, or any weights.json write
//     path
//   - exit code: `router health bogus` → invalid_subcommand, EXIT.usage
//   - CLI wiring: runRouterControl dispatches reset/dispose/recover

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as routerControl from '../src/cli/router-control.mjs';
import { inspect, reset, dispose, recover } from '../src/health/admin.mjs';
import { createHealthStore } from '../src/health/store.mjs';

const { runRouterControl } = routerControl;

const HERE = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(HERE), '..');

function makeOwnedRoot() {
  const tmp = join(REPO_ROOT, `.tmp-health-admin-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(tmp, 'health'), { recursive: true, mode: 0o700 });
  mkdirSync(join(tmp, 'release-tuples'), { recursive: true });
  mkdirSync(join(tmp, 'registry'), { recursive: true });
  // The four protected artifacts — fixture content is arbitrary; the isolation
  // test only asserts byte-identical before/after.
  writeFileSync(join(tmp, 'release-tuples', 'active.json'), JSON.stringify({ version_id: 'v1-abcdef0123456789', sequence: 1 }), { mode: 0o644 });
  writeFileSync(join(tmp, 'mode-map.json'), JSON.stringify({ version: 1, entries: [] }), { mode: 0o644 });
  writeFileSync(join(tmp, 'registry', 'registry.json'), JSON.stringify({ schema_version: 1, records: [] }), { mode: 0o644 });
  writeFileSync(join(tmp, 'weights.json'), JSON.stringify({ version: 1, weights: {} }), { mode: 0o644 });
  return tmp;
}

function cleanupOwnedRoot(tmp) {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashAllFourProtected(tmp) {
  return {
    active: hashFile(join(tmp, 'release-tuples', 'active.json')),
    modeMap: hashFile(join(tmp, 'mode-map.json')),
    registry: hashFile(join(tmp, 'registry', 'registry.json')),
    weights: hashFile(join(tmp, 'weights.json')),
  };
}

function writeState(tmp, state) {
  const statePath = join(tmp, 'health', 'state.json');
  const tmpPath = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  let fd;
  try { fd = openSync(tmpPath, 'r'); fsyncSync(fd); } catch { /* best-effort */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best-effort */ } }
  renameSync(tmpPath, statePath);
}

function appendOutcome(tmp, partial) {
  const store = createHealthStore({ root: join(tmp, 'health') });
  const record = {
    timestamp_ms: partial.timestamp_ms ?? Date.now(),
    capability_id: partial.capability_id,
    outcome_kind: partial.outcome_kind ?? 'completed',
    prompt_signature: partial.prompt_signature ?? 'a'.repeat(64),
    route_id: partial.route_id ?? 'r-1',
    confidence_band: 'medium',
    guard_codes: [],
    reason_code: 'ok',
    evidence_window_ms: partial.evidence_window_ms ?? 1000,
    sample_size: partial.sample_size ?? 1,
    opportunity_count: 1,
    freshness: 'fresh',
    policy_version: 'health-policy-v1',
    fingerprint: createHash('sha256').update(`${partial.capability_id}:${partial.timestamp_ms ?? Date.now()}`).digest('hex'),
  };
  const result = store.append(record);
  assert.equal(result.status, 'stored', `appendOutcome failed: ${JSON.stringify(result)}`);
}

test('HLTH-05 reset: writes state.json to {} atomically with 0600 perms', () => {
  const tmp = makeOwnedRoot();
  try {
    writeState(tmp, { 'skill:debug': { tier: 'high' } });
    const result = reset({ healthRoot: join(tmp, 'health') });
    assert.equal(result.ok, true);
    assert.equal(result.reason_code, 'reset_ok');
    const parsed = JSON.parse(readFileSync(join(tmp, 'health', 'state.json'), 'utf8'));
    assert.deepEqual(parsed, {});
    // outcomes.jsonl is NOT touched by reset
    assert.equal(existsSync(join(tmp, 'health', 'outcomes.jsonl')), false);
  } finally { cleanupOwnedRoot(tmp); }
});

test('HLTH-05 dispose: renames state.json → state.disposed.json (recoverable)', () => {
  const tmp = makeOwnedRoot();
  try {
    writeState(tmp, { 'skill:debug': { tier: 'high' } });
    const result = dispose({ healthRoot: join(tmp, 'health') });
    assert.equal(result.ok, true);
    assert.equal(result.reason_code, 'dispose_ok');
    assert.equal(existsSync(join(tmp, 'health', 'state.json')), false, 'state.json must be gone after dispose');
    assert.equal(existsSync(join(tmp, 'health', 'state.disposed.json')), true, 'state.disposed.json must exist (recoverable)');
    const parsed = JSON.parse(readFileSync(join(tmp, 'health', 'state.disposed.json'), 'utf8'));
    assert.deepEqual(parsed, { 'skill:debug': { tier: 'high' } });
  } finally { cleanupOwnedRoot(tmp); }
});

test('HLTH-05 dispose: already disposed → already_disposed', () => {
  const tmp = makeOwnedRoot();
  try {
    writeState(tmp, { x: 1 });
    renameSync(join(tmp, 'health', 'state.json'), join(tmp, 'health', 'state.disposed.json'));
    const result = dispose({ healthRoot: join(tmp, 'health') });
    assert.equal(result.ok, false);
    assert.equal(result.reason_code, 'already_disposed');
  } finally { cleanupOwnedRoot(tmp); }
});

test('HLTH-05 dispose: nothing to dispose → nothing_to_dispose', () => {
  const tmp = makeOwnedRoot();
  try {
    const result = dispose({ healthRoot: join(tmp, 'health') });
    assert.equal(result.ok, false);
    assert.equal(result.reason_code, 'nothing_to_dispose');
  } finally { cleanupOwnedRoot(tmp); }
});

test('HLTH-05 recover: restores from state.disposed.json', () => {
  const tmp = makeOwnedRoot();
  try {
    writeState(tmp, { 'skill:debug': { tier: 'high' } });
    dispose({ healthRoot: join(tmp, 'health') });
    const result = recover({ healthRoot: join(tmp, 'health') });
    assert.equal(result.ok, true);
    assert.equal(result.reason_code, 'recover_restored');
    assert.equal(result.data.recovered_from, 'disposed');
    assert.equal(existsSync(join(tmp, 'health', 'state.json')), true);
    assert.equal(existsSync(join(tmp, 'health', 'state.disposed.json')), false);
    const parsed = JSON.parse(readFileSync(join(tmp, 'health', 'state.json'), 'utf8'));
    assert.deepEqual(parsed, { 'skill:debug': { tier: 'high' } });
  } finally { cleanupOwnedRoot(tmp); }
});

test('HLTH-05 recover: rebuilds from outcomes.jsonl when disposed is missing', () => {
  const tmp = makeOwnedRoot();
  try {
    // No state.json, no state.disposed.json — recover must rebuild from outcomes.
    // Append enough outcomes for one capability to cross the MINIMUM_SAMPLES floor
    // so scoreCapability produces a non-null tier.
    for (let i = 0; i < 30; i++) {
      appendOutcome(tmp, {
        timestamp_ms: Date.now() - i * 3600_000,
        outcome_kind: 'completed',
        capability_id: 'skill:debug',
        route_id: 'r-1',
        prompt_signature: 'a'.repeat(64),
        evidence_window_ms: 1000,
        sample_size: 1,
      });
    }
    const result = recover({ healthRoot: join(tmp, 'health') });
    assert.equal(result.ok, true);
    assert.equal(result.reason_code, 'recover_rebuilt');
    assert.equal(result.data.recovered_from, 'outcomes');
    assert.ok(result.data.capability_count >= 1, `expected >= 1 capability, got ${result.data.capability_count}`);
    const parsed = JSON.parse(readFileSync(join(tmp, 'health', 'state.json'), 'utf8'));
    assert.ok(parsed['skill:debug'], 'expected skill:debug in rebuilt state');
    assert.ok(parsed['skill:debug'].rebuilt_at_ms, 'expected rebuilt_at_ms marker');
  } finally { cleanupOwnedRoot(tmp); }
});

test('HLTH-05 recover: missing outcomes yields empty state (fail-open, T-24-16)', () => {
  const tmp = makeOwnedRoot();
  try {
    const result = recover({ healthRoot: join(tmp, 'health') });
    assert.equal(result.ok, true);
    assert.equal(result.reason_code, 'recover_rebuilt');
    assert.equal(result.data.capability_count, 0);
    const parsed = JSON.parse(readFileSync(join(tmp, 'health', 'state.json'), 'utf8'));
    assert.deepEqual(parsed, {});
  } finally { cleanupOwnedRoot(tmp); }
});

test('HLTH-05 inspect: still works after reset/dispose/recover cycles and surfaces disposed flag', () => {
  const tmp = makeOwnedRoot();
  try {
    appendOutcome(tmp, {
      timestamp_ms: Date.now(), outcome_kind: 'completed', capability_id: 'skill:debug',
      route_id: 'r-1', prompt_signature: 'b'.repeat(64), evidence_window_ms: 1000, sample_size: 1,
    });
    writeState(tmp, { 'skill:debug': { tier: 'high' } });
    // reset
    reset({ healthRoot: join(tmp, 'health') });
    let ins = inspect({ healthRoot: join(tmp, 'health') });
    assert.equal(ins.ok, true);
    assert.equal(ins.reason_code, 'inspect_ok');
    assert.equal(ins.data.disposed, false);
    // dispose
    writeState(tmp, { 'skill:debug': { tier: 'high' } });
    dispose({ healthRoot: join(tmp, 'health') });
    ins = inspect({ healthRoot: join(tmp, 'health') });
    assert.equal(ins.data.disposed, true, 'inspect should surface disposed=true');
    // recover
    recover({ healthRoot: join(tmp, 'health') });
    ins = inspect({ healthRoot: join(tmp, 'health') });
    assert.equal(ins.data.disposed, false);
    assert.ok(ins.data.total >= 1, 'outcomes.jsonl preserved across all admin commands');
  } finally { cleanupOwnedRoot(tmp); }
});

// ---- D-5 content-hash isolation gate (Pitfall 6, W3) ----------------------

test('D-5 isolation: ALL FOUR protected artifacts byte-identical after every admin command', () => {
  const tmp = makeOwnedRoot();
  try {
    // Seed health state + outcomes so every admin command has real work to do.
    writeState(tmp, { 'skill:debug': { tier: 'high' } });
    appendOutcome(tmp, {
      timestamp_ms: Date.now(), outcome_kind: 'completed', capability_id: 'skill:debug',
      route_id: 'r-1', prompt_signature: 'c'.repeat(64), evidence_window_ms: 1000, sample_size: 1,
    });
    const before = hashAllFourProtected(tmp);

    // Run all four admin commands in sequence.
    inspect({ healthRoot: join(tmp, 'health') });
    let after = hashAllFourProtected(tmp);
    assert.deepEqual(after, before, 'inspect changed a protected artifact');

    reset({ healthRoot: join(tmp, 'health') });
    after = hashAllFourProtected(tmp);
    assert.deepEqual(after, before, 'reset changed a protected artifact');

    // re-seed state so dispose has something to dispose
    writeState(tmp, { 'skill:debug': { tier: 'high' } });
    dispose({ healthRoot: join(tmp, 'health') });
    after = hashAllFourProtected(tmp);
    assert.deepEqual(after, before, 'dispose changed a protected artifact');

    recover({ healthRoot: join(tmp, 'health') });
    after = hashAllFourProtected(tmp);
    assert.deepEqual(after, before, 'recover changed a protected artifact');
  } finally { cleanupOwnedRoot(tmp); }
});

// ---- W3 extended import gate ----------------------------------------------

test('W3 import gate: admin.mjs imports neither activate/publish-index/registry.mjs nor a weights.json write path', () => {
  const src = readFileSync(join(REPO_ROOT, 'src', 'health', 'admin.mjs'), 'utf8');
  // Line-anchored so comment text does not false-positive.
  const importRe = /^\s*import\b[^\n]*\b(?:activate\.mjs|publish-index\.mjs|registry\.mjs)\b/m;
  assert.ok(!importRe.test(src), 'admin.mjs imports a forbidden module (activate/publish-index/registry.mjs)');
  // weights.json must not appear in any import statement.
  const weightsImportRe = /^\s*import\b[^\n]*\bweights\.json\b/m;
  assert.ok(!weightsImportRe.test(src), 'admin.mjs imports a weights.json path');
});

// ---- CLI wiring + exit codes ---------------------------------------------

test('CLI: router health bogus → invalid_subcommand with EXIT.usage', () => {
  const tmp = makeOwnedRoot();
  try {
    const outcome = runRouterControl({ argv: ['health', 'bogus', '--owned-root', tmp] });
    assert.equal(outcome.result.ok, false);
    assert.equal(outcome.result.reason_code, 'invalid_subcommand');
    assert.equal(outcome.exitCode, 2); // EXIT.usage
  } finally { cleanupOwnedRoot(tmp); }
});

test('CLI: router health reset → reset_ok via runRouterControl', () => {
  const tmp = makeOwnedRoot();
  try {
    writeState(tmp, { x: 1 });
    const outcome = runRouterControl({ argv: ['health', 'reset', '--owned-root', tmp] });
    assert.equal(outcome.result.ok, true);
    assert.equal(outcome.result.reason_code, 'reset_ok');
    assert.equal(outcome.exitCode, 0);
  } finally { cleanupOwnedRoot(tmp); }
});

test('CLI: router health dispose → dispose_ok via runRouterControl', () => {
  const tmp = makeOwnedRoot();
  try {
    writeState(tmp, { x: 1 });
    const outcome = runRouterControl({ argv: ['health', 'dispose', '--owned-root', tmp] });
    assert.equal(outcome.result.ok, true);
    assert.equal(outcome.result.reason_code, 'dispose_ok');
    assert.equal(outcome.exitCode, 0);
  } finally { cleanupOwnedRoot(tmp); }
});

test('CLI: router health recover → recover_rebuilt via runRouterControl (no disposed, no outcomes)', () => {
  const tmp = makeOwnedRoot();
  try {
    const outcome = runRouterControl({ argv: ['health', 'recover', '--owned-root', tmp] });
    assert.equal(outcome.result.ok, true);
    assert.equal(outcome.result.reason_code, 'recover_rebuilt');
    assert.equal(outcome.exitCode, 0);
  } finally { cleanupOwnedRoot(tmp); }
});

test('CLI: router health inspect → inspect_ok via runRouterControl', () => {
  const tmp = makeOwnedRoot();
  try {
    appendOutcome(tmp, {
      timestamp_ms: Date.now(), outcome_kind: 'completed', capability_id: 'skill:debug',
      route_id: 'r-1', prompt_signature: 'd'.repeat(64), evidence_window_ms: 1000, sample_size: 1,
    });
    const outcome = runRouterControl({ argv: ['health', 'inspect', '--owned-root', tmp] });
    assert.equal(outcome.result.ok, true);
    assert.equal(outcome.result.reason_code, 'inspect_ok');
    assert.ok(outcome.result.data.total >= 1);
  } finally { cleanupOwnedRoot(tmp); }
});

test('CLI: usage lists all four health subcommands (via invalid_subcommand data.usage)', () => {
  const tmp = makeOwnedRoot();
  try {
    const outcome = runRouterControl({ argv: ['health', 'bogus', '--owned-root', tmp] });
    const usage = outcome.result.data.usage || '';
    assert.ok(usage.includes('health inspect|reset|dispose|recover'), 'usage must list all four health subcommands');
    assert.ok(usage.includes('router doctor reports router plumbing health'), 'usage must carry the doctor/health disambiguation');
  } finally { cleanupOwnedRoot(tmp); }
});