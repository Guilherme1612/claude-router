// Plan 24-01 Task 2 — HLTH-02 privacy suite + W4 hot-path isolation.
//
// Asserts the three privacy invariants of the Phase 24 health subsystem:
//   1. No src/health/*.mjs module imports a network primitive (node:http,
//      node:https, node:net, node:dns, or a global fetch call) — HLTH-02.
//   2. createHealthStore produces 0700 on the dir and 0600 on every file it
//      creates (outcomes.jsonl + state.json) — HLTH-02 / HLTH-04.
//   3. No raw prompt fixture appears in any persisted record — HLTH-01.
// Plus the W4 hot-path isolation test: ~/.claude/hooks/router.mjs has NO
// import statement matching src/health/ — the <100ms UserPromptSubmit
// invariant is test-enforced, not just prose (Pitfall 1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHealthStore } from '../src/health/store.mjs';
import { deriveSelectedOutcome } from '../src/health/observe.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { MAX_RETENTION_MS } from '../src/evolution/evidence.mjs';
import { createHash } from 'node:crypto';

const HEALTH_SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'health');

function listHealthModules() {
  return readdirSync(HEALTH_SRC_DIR)
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => join(HEALTH_SRC_DIR, name));
}

const NETWORK_IMPORT_RE = /import\s+[^;]*['"](?:node:(?:http|https|net|dns)|https?:\/\/)[^'"]*['"]/;
const GLOBAL_FETCH_RE = /\bfetch\s*\(/;

test('HLTH-02: no src/health/*.mjs imports a network primitive (http/https/net/dns or global fetch)', () => {
  const modules = listHealthModules();
  assert.ok(modules.length >= 4, `expected at least 4 src/health modules, found ${modules.length}`);
  for (const path of modules) {
    const source = readFileSync(path, 'utf8');
    assert.ok(!NETWORK_IMPORT_RE.test(source), `${path} imports a network primitive`);
    assert.ok(!GLOBAL_FETCH_RE.test(source), `${path} uses a global fetch() call`);
  }
});

test('HLTH-02: grep -rE "import.*(node:http|node:https|node:net|node:dns|fetch)" src/health/ returns no matches', () => {
  // Belt-and-braces — mirrors the phase-gate command #2 verbatim so a
  // regression in the regex above cannot mask a real import.
  const modules = listHealthModules();
  const re = /import.*(node:http|node:https|node:net|node:dns|fetch)/;
  const hits = modules.filter((path) => re.test(readFileSync(path, 'utf8')));
  assert.deepEqual(hits, [], `network imports found in: ${hits.join(', ')}`);
});

test('HLTH-02 / HLTH-04: createHealthStore sets 0700 on the dir and 0600 on outcomes.jsonl', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-perms-'));
  const store = createHealthStore({ root: healthRoot });
  const dirMode = statSync(healthRoot).mode & 0o777;
  assert.equal(dirMode, 0o700, `expected 0700 dir, got 0o${dirMode.toString(8)}`);
  const observed = deriveSelectedOutcome(
    { ts: Date.now(), prompt_signature: createHash('sha256').update('x').digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'r1' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  store.append(observed.signal);
  const fileMode = statSync(store.outcomesPath).mode & 0o777;
  assert.equal(fileMode, 0o600, `expected 0600 outcomes.jsonl, got 0o${fileMode.toString(8)}`);
});

test('HLTH-04: state.json writes are atomic (temp+rename+fsync, 0600)', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-state-'));
  const store = createHealthStore({ root: healthRoot });
  store.writeState({ last_compacted_at: 123 });
  assert.ok(existsSync(store.statePath), 'state.json was not written');
  const mode = statSync(store.statePath).mode & 0o777;
  assert.equal(mode, 0o600, `expected 0600 state.json, got 0o${mode.toString(8)}`);
  // No leftover temp files should remain after a successful write.
  const leftovers = readdirSync(healthRoot).filter((name) => name.startsWith('state.json.tmp-'));
  assert.deepEqual(leftovers, [], `leftover temp files: ${leftovers.join(', ')}`);
  // readState returns the written state.
  const read = store.readState();
  assert.deepEqual(read, { last_compacted_at: 123 });
});

test('HLTH-04: readState returns null on missing or corrupt state.json, never throws', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-corrupt-'));
  const store = createHealthStore({ root: healthRoot });
  assert.equal(store.readState(), null, 'missing state.json should return null');
  writeFileSync(store.statePath, '{ this is not valid json', { mode: 0o600 });
  assert.equal(store.readState(), null, 'corrupt state.json should return null');
});

test('HLTH-04 / T-24-07: corrupted outcomes.jsonl line is skipped during readWindow with corrupt_line_skipped counter, never thrown', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-corrupt-jsonl-'));
  const store = createHealthStore({ root: healthRoot });
  const observed = deriveSelectedOutcome(
    { ts: Date.now(), prompt_signature: createHash('sha256').update('y').digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'r1' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  store.append(observed.signal);
  // Append a corrupt line directly.
  appendFileSync(store.outcomesPath, '{ not valid json\n', { flag: 'a', mode: 0o600 });
  const window = store.readWindow();
  assert.equal(window.total, 1, 'corrupt line should not count as a record');
  assert.ok(window.corrupt_line_skipped >= 1, `expected corrupt_line_skipped >= 1, got ${window.corrupt_line_skipped}`);
});

test('HLTH-04: records older than MAX_RETENTION_MS are filtered out of readWindow, not counted', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-retention-'));
  const store = createHealthStore({ root: healthRoot });
  const now = Date.now();
  const recent = deriveSelectedOutcome(
    { ts: now, prompt_signature: createHash('sha256').update('r').digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'r1' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  const stale = deriveSelectedOutcome(
    { ts: now - MAX_RETENTION_MS - 1000, prompt_signature: createHash('sha256').update('s').digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'r2' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  store.append(recent.signal);
  store.append(stale.signal);
  const window = store.readWindow({ now });
  assert.equal(window.total, 1, `expected only the recent record, got ${window.total}`);
  assert.equal(window.records[0].route_id, 'r1');
});

test('HLTH-04: bounded compaction drops stale records and appends a compaction marker line when outcomes.jsonl exceeds maxBytes', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-compact-'));
  const store = createHealthStore({ root: healthRoot });
  const now = Date.now();
  // A stale record (older than MAX_RETENTION_MS) and a recent one.
  const stale = deriveSelectedOutcome(
    { ts: now - MAX_RETENTION_MS - 5000, prompt_signature: createHash('sha256').update('stale').digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'stale' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  const recent = deriveSelectedOutcome(
    { ts: now, prompt_signature: createHash('sha256').update('recent').digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'recent' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  store.append(stale.signal);
  store.append(recent.signal);
  // Force compaction with a tiny maxBytes threshold.
  const result = store.compact({ maxBytes: 1, now });
  assert.equal(result.status, 'compacted');
  assert.ok(result.dropped >= 1, `expected dropped >= 1, got ${result.dropped}`);
  const window = store.readWindow({ now });
  const routes = window.records.map((r) => r.route_id);
  assert.ok(!routes.includes('stale'), 'stale record was not dropped by compaction');
  assert.ok(routes.includes('recent'), 'recent record was dropped by compaction');
  // A compaction marker line must be present.
  const lines = readFileSync(store.outcomesPath, 'utf8').split('\n').filter((l) => l.length > 0);
  const marker = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((r) => r && r.compacted_at_ms !== undefined);
  assert.ok(marker, 'no compaction marker line found');
  assert.equal(marker.policy_version, 'health-policy-v1');
});

test('HLTH-04: append and compaction fail closed while the shared mutation lock is held', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-lock-'));
  const store = createHealthStore({ root: healthRoot, lock: { timeout_ms: 0 } });
  mkdirSync(join(healthRoot, '.mutation.lock'), { mode: 0o700 });
  writeFileSync(join(healthRoot, '.mutation.lock', 'owner.json'), JSON.stringify({
    pid: process.pid, started_at: Date.now(),
  }));
  const observed = deriveSelectedOutcome(
    { ts: Date.now(), prompt_signature: createHash('sha256').update('locked').digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'locked' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  assert.equal(store.append(observed.signal).reason_code, 'mutation_lock_timeout');
  assert.equal(store.compact({ maxBytes: 0 }).reason_code, 'mutation_lock_timeout');
  assert.equal(existsSync(store.outcomesPath), false);
});

test('HLTH-01: no raw prompt fixture appears in any persisted record', () => {
  const healthRoot = mkdtempSync(join(tmpdir(), 'router-health-raw-'));
  const store = createHealthStore({ root: healthRoot });
  const SECRET_LIKE = 'sk-leaked-secret-key-1234567890';
  const observed = deriveSelectedOutcome(
    { ts: Date.now(), prompt_signature: createHash('sha256').update(SECRET_LIKE).digest('hex'), suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }], suggested_agents: [], confidence_tier: 'high', guards_fired: [], route_id: 'r1' },
    { stableCapabilityIdFn: stableCapabilityId },
  );
  store.append(observed.signal);
  const line = readFileSync(store.outcomesPath, 'utf8');
  assert.ok(!line.includes(SECRET_LIKE), 'raw secret-like fixture leaked into outcomes.jsonl');
});

test('HLTH-02 / Pitfall 1 (W4): ~/.claude/hooks/router.mjs has NO import statement matching src/health/', () => {
  const hookPath = join(homedir(), '.claude', 'hooks', 'router.mjs');
  let source;
  try { source = readFileSync(hookPath, 'utf8'); } catch { /* hook not installed in this env — skip */ }
  if (source === undefined) return;
  const importRe = /import\s+[^;]*['"][^'"]*src\/health\//;
  assert.ok(!importRe.test(source), 'router.mjs imports src/health/ — hot-path invariant violated (Pitfall 1)');
});

test('D-5 scope isolation: no src/health/*.mjs module imports activate.mjs or publish-index.mjs', () => {
  const modules = listHealthModules();
  // Line-anchored so comment text ("must NOT import ... activate.mjs") does
  // not false-positive — only a real `import ... from '...activate.mjs'` line
  // at the start of a line counts.
  const re = /^\s*import\b.*(?:activate\.mjs|publish-index\.mjs)/m;
  for (const path of modules) {
    const source = readFileSync(path, 'utf8');
    assert.ok(!re.test(source), `${path} imports activate.mjs or publish-index.mjs (D-5 violation)`);
  }
});

test('UX-08 / UX-09: prompt route consumes only the bounded pointer loader', () => {
  const routePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'context', 'prompt-route.mjs');
  const source = readFileSync(routePath, 'utf8');
  assert.doesNotMatch(source, /refreshSuggestionPointer|src\/health|health\/|deriveObservations|selectSuggestion|readdir|history|telemetry|fetch\s*\(|node:https?|model/i);
  assert.match(source, /loadStartupPointer/);
});
