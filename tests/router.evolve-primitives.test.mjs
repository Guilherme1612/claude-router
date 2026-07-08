// Plan 03-01 / Task 2: 12 pure evolve primitives — unit tests in isolation.
// Each test uses a tempdir + minimal fixture inputs. No live ~/.claude/router/
// data is touched. Pattern mirrors tests/router-graphify-pure.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createGzip, gunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';

const E = await import('/Users/guilherme/.claude/hooks/router.evolve.mjs');
const {
  correlateOutcomes,
  aggregatePerEntry,
  decayScores,
  proposeAdditions,
  proposeEdits,
  proposePrunes,
  applyMutation,
  revertMutation,
  rotateTelemetry,
  readEvolutionState,
  writeEvolutionState,
  writeWeights,
  GOOD_COMMANDS,
  BAD_COMMANDS,
  GOOD_PHRASES,
  BAD_PHRASES,
} = E;

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-evolve-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const cleanup = () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  try {
    const r = fn(dir);
    if (r && typeof r.then === 'function') {
      return r.finally(cleanup);
    }
    cleanup();
    return r;
  } catch (e) {
    cleanup();
    throw e;
  }
}

// --- 1. correlateOutcomes --------------------------------------------------

test('correlateOutcomes: marks "good" when next event is a GOOD_COMMANDS slash', () => {
  const t = [
    { ts: 1000, prompt_signature: 'a', suggested_mode: 'gsd-debug', cwd: '/p' },
    { ts: 1100, prompt_signature: 'b', suggested_mode: 'gsd-verify', cwd: '/p' },
  ];
  const out = correlateOutcomes(t);
  assert.equal(out[0].outcome, 'good');
  assert.equal(out[0].downstream_event, 'gsd-verify');
});

test('correlateOutcomes: marks "bad" when next event is a BAD_PHRASES match', () => {
  const t = [
    { ts: 1000, prompt_signature: 'a', suggested_mode: 'gsd-debug', cwd: '/p' },
    { ts: 1100, prompt_signature: 'b', suggested_mode: null, cwd: '/p', prompt: 'actually that is wrong, redo it' },
  ];
  const out = correlateOutcomes(t);
  assert.equal(out[0].outcome, 'bad');
});

test('correlateOutcomes: marks "unknown" when no qualifying event in window', () => {
  const t = [
    { ts: 1000, prompt_signature: 'a', suggested_mode: 'gsd-debug', cwd: '/p' },
    { ts: 1000 + 31 * 60 * 1000, prompt_signature: 'b', suggested_mode: 'gsd-verify', cwd: '/p' }, // >30min
  ];
  const out = correlateOutcomes(t);
  assert.equal(out[0].outcome, 'unknown');
  assert.equal(out[0].downstream_event, null);
});

test('correlateOutcomes: respects loose cwd match (null on either side is OK)', () => {
  const t = [
    { ts: 1000, prompt_signature: 'a', suggested_mode: 'gsd-debug', cwd: null },
    { ts: 1100, prompt_signature: 'b', suggested_mode: null, cwd: '/p', prompt: 'thanks, looks good' },
  ];
  const out = correlateOutcomes(t);
  assert.equal(out[0].outcome, 'good');
});

test('correlateOutcomes: skips pass-throughs (suggested_mode === null)', () => {
  // First entry is a pass-through (no correlation). The second entry IS
  // routable, but has no forward event -> produces one 'unknown' outcome.
  const t = [
    { ts: 1000, prompt_signature: 'a', suggested_mode: null, cwd: '/p' },
    { ts: 1100, prompt_signature: 'b', suggested_mode: 'gsd-debug', cwd: '/p' },
  ];
  const out = correlateOutcomes(t);
  assert.equal(out.length, 1, 'only the routable entry is correlated');
  assert.equal(out[0].suggested_mode, 'gsd-debug');
  assert.equal(out[0].outcome, 'unknown');
});

// --- 2. aggregatePerEntry ---------------------------------------------------

test('aggregatePerEntry: rolls up {g,b,u} per entry id', () => {
  const outcomes = [
    { prompt_signature: 'a', ts: 1, cwd: null, suggested_mode: 'gsd-debug', outcome: 'good', downstream_event: null },
    { prompt_signature: 'b', ts: 2, cwd: null, suggested_mode: 'gsd-debug', outcome: 'bad', downstream_event: null },
    { prompt_signature: 'c', ts: 3, cwd: null, suggested_mode: 'gsd-debug', outcome: 'unknown', downstream_event: null },
    { prompt_signature: 'd', ts: 4, cwd: null, suggested_mode: 'gsd-ship', outcome: 'good', downstream_event: null },
  ];
  const modeMap = { entries: [{ id: 'gsd-debug' }, { id: 'gsd-ship' }] };
  const m = aggregatePerEntry(outcomes, modeMap);
  assert.deepEqual(m.get('gsd-debug'), { g: 1, b: 1, u: 1 });
  assert.deepEqual(m.get('gsd-ship'), { g: 1, b: 0, u: 0 });
});

test('aggregatePerEntry: ignores outcomes whose mode is not in the mode-map', () => {
  const outcomes = [
    { prompt_signature: 'a', ts: 1, cwd: null, suggested_mode: 'unknown-mode', outcome: 'good', downstream_event: null },
  ];
  const modeMap = { entries: [{ id: 'gsd-debug' }] };
  const m = aggregatePerEntry(outcomes, modeMap);
  assert.equal(m.size, 0);
});

// --- 3. decayScores ---------------------------------------------------------

test('decayScores: fresh entry (updated_at = now) is unchanged', () => {
  const now = Date.now();
  const w = { weights: { 'gsd-debug': { g: 10, b: 2, score: 10 / 12, updated_at: new Date(now).toISOString() } } };
  const out = decayScores(w, now, 14);
  assert.equal(out.weights['gsd-debug'].g, 10);
  assert.equal(out.weights['gsd-debug'].b, 2);
  assert.equal(out.weights['gsd-debug'].score, 10 / 12);
});

test('decayScores: old entry (updated_at > 14d ago) has g and b halved, score recomputed', () => {
  const now = Date.now();
  const oldIso = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const w = { weights: { 'gsd-debug': { g: 10, b: 2, score: 10 / 12, updated_at: oldIso } } };
  const out = decayScores(w, now, 14);
  assert.equal(out.weights['gsd-debug'].g, 5); // 10/2
  assert.equal(out.weights['gsd-debug'].b, 1); // 2/2
  assert.equal(out.weights['gsd-debug'].score, 5 / 6);
});

// --- 4. proposeAdditions ----------------------------------------------------

test('proposeAdditions: returns [] when no cluster >= 5', () => {
  const outcomes = [
    { prompt_signature: 'a', ts: 1, cwd: null, suggested_mode: 'gsd-debug', outcome: 'unknown', downstream_event: 'foo' },
    { prompt_signature: 'b', ts: 2, cwd: null, suggested_mode: 'gsd-debug', outcome: 'unknown', downstream_event: 'bar' },
  ];
  const out = proposeAdditions(outcomes, { entries: [{ id: 'gsd-debug', signal_patterns: [] }] });
  assert.equal(out.length, 0);
});

test('proposeAdditions: returns ONE add-proposal when 5+ cluster on same mode', () => {
  const outcomes = [];
  for (let i = 0; i < 6; i++) {
    outcomes.push({ prompt_signature: 'a' + i, ts: i, cwd: null, suggested_mode: 'gsd-debug', outcome: 'unknown', downstream_event: 'trace stack overflow exception in worker' });
  }
  const out = proposeAdditions(outcomes, { entries: [{ id: 'gsd-debug', signal_patterns: [] }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'add');
  assert.equal(out[0].entry.mode, 'gsd-debug');
  assert.equal(out[0].entry.initial_tier, 'low'); // D-17
  // signal_patterns must not be the verbatim prompt text.
  for (const sp of out[0].entry.signal_patterns) {
    assert.ok(typeof sp === 'string' && sp.length > 0);
    assert.ok(!sp.includes('trace stack overflow'), 'no verbatim prompt text in signal_patterns');
  }
});

// --- 5. proposeEdits --------------------------------------------------------

test('proposeEdits: returns edit when b > 2*g + 5', () => {
  const perEntry = new Map([['gsd-debug', { g: 1, b: 8, u: 0 }]]); // 8 > 2*1+5 = 7
  const modeMap = { entries: [{ id: 'gsd-debug', signal_patterns: ['bug'] }] };
  const outcomes = [];
  for (let i = 0; i < 8; i++) {
    outcomes.push({ prompt_signature: 'a' + i, ts: i, cwd: null, suggested_mode: 'gsd-debug', outcome: 'bad', downstream_event: 'reset session token expired' });
  }
  const out = proposeEdits(perEntry, modeMap, outcomes);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'edit');
  assert.equal(out[0].id, 'gsd-debug');
});

test('proposeEdits: HIGH-tier entry requires b > 5*g + 10 (sustained)', () => {
  // 8 > 2*1+5=7 (would trigger as low-tier); but 8 > 5*1+10=15 does NOT.
  const perEntry = new Map([['gsd-debug', { g: 1, b: 8, u: 0 }]]);
  const modeMap = { entries: [{ id: 'gsd-debug', signal_patterns: ['bug'], initial_tier: 'high' }] };
  const outcomes = [];
  for (let i = 0; i < 8; i++) {
    outcomes.push({ prompt_signature: 'a' + i, ts: i, cwd: null, suggested_mode: 'gsd-debug', outcome: 'bad', downstream_event: 'reset session token expired' });
  }
  const out = proposeEdits(perEntry, modeMap, outcomes);
  assert.equal(out.length, 0, 'HIGH-tier entry must NOT be edited under the low-tier ratio');
});

// --- 6. proposePrunes -------------------------------------------------------

test('proposePrunes: returns prune for never-top in 30d entry (not pinned)', () => {
  const now = Date.now();
  const outcomes = [
    { prompt_signature: 'a', ts: now - 5 * 24 * 3600 * 1000, cwd: null, suggested_mode: 'gsd-ship', outcome: 'good', downstream_event: null },
  ];
  const modeMap = { entries: [{ id: 'gsd-debug' }, { id: 'gsd-ship' }] };
  const out = proposePrunes(outcomes, modeMap, now, 30);
  const ids = out.map((p) => p.id);
  assert.ok(ids.includes('gsd-debug'));
  assert.ok(!ids.includes('gsd-ship'));
});

test('proposePrunes: skips pinned entries', () => {
  const now = Date.now();
  const modeMap = { entries: [{ id: 'gsd-debug', pinned: true }] };
  const out = proposePrunes([], modeMap, now, 30);
  assert.equal(out.length, 0);
});

// --- 7. applyMutation -------------------------------------------------------

test('applyMutation: deep-clones + bumps schema_version to 2 + returns pid path', () => {
  const modeMap = { entries: [{ id: 'gsd-debug', signal_patterns: ['x'] }], schema_version: 1 };
  const mutation = { kind: 'add', entry: { id: 'auto-new', mode: 'gsd-debug', signal_patterns: ['y'] } };
  const { proposedMap, path } = applyMutation(modeMap, mutation, '/tmp/x.json');
  assert.equal(proposedMap.schema_version, 2);
  assert.equal(proposedMap.entries.length, 2);
  // Original must not be mutated.
  assert.equal(modeMap.entries.length, 1);
  assert.equal(modeMap.schema_version, 1);
  // Path is pid-suffixed.
  assert.match(path, /\.tmp\.\d+$/);
  assert.ok(path.includes('x.json'));
});

test('applyMutation: edit mutation splices signal_patterns of matching entry', () => {
  const modeMap = { entries: [{ id: 'gsd-debug', signal_patterns: ['x'] }] };
  const mutation = { kind: 'edit', id: 'gsd-debug', signal_patterns: ['x', 'y', 'z'] };
  const { proposedMap } = applyMutation(modeMap, mutation, '/tmp/x.json');
  assert.deepEqual(proposedMap.entries[0].signal_patterns, ['x', 'y', 'z']);
});

test('applyMutation: prune mutation removes the matching entry', () => {
  const modeMap = { entries: [{ id: 'gsd-debug' }, { id: 'gsd-ship' }] };
  const mutation = { kind: 'prune', id: 'gsd-debug' };
  const { proposedMap } = applyMutation(modeMap, mutation, '/tmp/x.json');
  assert.equal(proposedMap.entries.length, 1);
  assert.equal(proposedMap.entries[0].id, 'gsd-ship');
});

// --- 8. revertMutation ------------------------------------------------------

test('revertMutation: returns input mode-map unchanged + same path as applyMutation', () => {
  const modeMap = { entries: [{ id: 'gsd-debug' }], schema_version: 1 };
  const mutation = { kind: 'prune', id: 'gsd-debug' };
  const { proposedMap, path } = revertMutation(modeMap, mutation, '/tmp/x.json');
  assert.strictEqual(proposedMap, modeMap, 'revert must return the same reference, unchanged');
  assert.match(path, /\.tmp\.\d+$/);
});

// --- 9. rotateTelemetry -----------------------------------------------------

test('rotateTelemetry: small file returns rotated:false', async () => {
  await withTempDir(async (dir) => {
    const t = join(dir, 'telemetry.jsonl');
    const a = join(dir, 'archive');
    writeFileSync(t, JSON.stringify({ ts: Date.now(), x: 1 }) + '\n');
    const out = await rotateTelemetry(t, a);
    assert.equal(out.rotated, false);
    assert.equal(out.archivePath, null);
  });
});

test('rotateTelemetry: 5MB+ fixture rotates, gzip archive created, telemetry truncated', async () => {
  await withTempDir(async (dir) => {
    const t = join(dir, 'telemetry.jsonl');
    const a = join(dir, 'archive');
    mkdirSync(a, { recursive: true });
    // Write ~5.5MB of JSONL (one big line per chunk).
    const chunk = 'x'.repeat(1024);
    const line = JSON.stringify({ ts: Date.now(), big: chunk });
    const targetSize = 5.5 * 1024 * 1024;
    let written = 0;
    let fd = null;
    const fs = await import('node:fs');
    fd = fs.openSync(t, 'w');
    while (written < targetSize) {
      const buf = line + '\n';
      fs.writeSync(fd, buf);
      written += buf.length;
    }
    fs.closeSync(fd);
    const beforeSize = statSync(t).size;
    assert.ok(beforeSize >= 5 * 1024 * 1024, `sanity: file is >= 5MB (got ${beforeSize})`);

    const out = await rotateTelemetry(t, a, { sizeBytes: 5 * 1024 * 1024, decayDays: 0 });
    assert.equal(out.rotated, true);
    assert.ok(out.archivePath.endsWith('.jsonl.gz'), `archive should be .jsonl.gz; got ${out.archivePath}`);
    assert.ok(existsSync(out.archivePath), 'archive must exist on disk');
    // Telemetry file is now empty.
    assert.equal(statSync(t).size, 0, 'telemetry.jsonl must be empty after rotation');
    assert.equal(out.linesLost, 0);
  });
});

test('rotateTelemetry: disk-budget prune when archive dir > 100MB', async () => {
  await withTempDir(async (dir) => {
    const t = join(dir, 'telemetry.jsonl');
    const a = join(dir, 'archive');
    mkdirSync(a, { recursive: true });
    // Pre-populate archive dir with three ~50MB gzipped archives of pseudo-random
    // data (random bytes don't compress; uniform bytes do).
    const crypto = await import('node:crypto');
    for (let i = 0; i < 3; i++) {
      const inp = join(a, `in${i}.bin`);
      const bigGz = join(a, `telemetry-archive-pre${i}.jsonl.gz`);
      // Write 50MB of pseudo-random bytes; gzip won't compress them.
      const buf = crypto.randomBytes(50 * 1024 * 1024);
      writeFileSync(inp, buf);
      await pipeline(createReadStream(inp), createGzip(), createWriteStream(bigGz));
      rmSync(inp);
    }
    // Sanity: confirm archives exceed 100MB combined (otherwise the test is meaningless).
    const totalBefore = (await import('node:fs')).readdirSync(a)
      .filter((f) => f.startsWith('telemetry-archive-'))
      .reduce((acc, f) => acc + statSync(join(a, f)).size, 0);
    assert.ok(totalBefore > 100 * 1024 * 1024, `sanity: archives total > 100MB (got ${totalBefore})`);

    // Write a tiny telemetry file (force-rotate via decayDays=0).
    writeFileSync(t, JSON.stringify({ ts: Date.now() - 100 * 24 * 3600 * 1000, x: 1 }) + '\n');
    const out = await rotateTelemetry(t, a, { sizeBytes: 1024 * 1024 * 1024, decayDays: 0, diskBudgetBytes: 100 * 1024 * 1024 });
    assert.equal(out.rotated, true);
    assert.ok(out.prunedArchives.length >= 1, `should have pruned at least one archive; got ${out.prunedArchives.length}`);
  });
});

// --- 10. readEvolutionState + 11. writeEvolutionState ----------------------

test('readEvolutionState: returns null on missing file', () => {
  assert.equal(readEvolutionState('/nonexistent/path/state.json'), null);
});

test('readEvolutionState: returns null on malformed JSON (fail-open)', () => {
  withTempDir((dir) => {
    const p = join(dir, 'state.json');
    writeFileSync(p, '{not valid');
    assert.equal(readEvolutionState(p), null);
  });
});

test('readEvolutionState: returns parsed object on valid JSON', () => {
  withTempDir((dir) => {
    const p = join(dir, 'state.json');
    const obj = { last_run: 12345, last_decay: '2026-01-01', pending_mutations: [] };
    writeFileSync(p, JSON.stringify(obj));
    const out = readEvolutionState(p);
    assert.deepEqual(out, obj);
  });
});

test('writeEvolutionState: atomic temp+rename; valid JSON written; survives re-read', () => {
  withTempDir((dir) => {
    const p = join(dir, 'state.json');
    const ok = writeEvolutionState(p, { last_run: 999 });
    assert.equal(ok, true);
    assert.deepEqual(readEvolutionState(p), { last_run: 999 });
  });
});

// --- 12. writeWeights ------------------------------------------------------

test('writeWeights: writes valid JSON and survives re-read', () => {
  withTempDir((dir) => {
    const p = join(dir, 'weights.json');
    const w = { weights: { 'gsd-debug': { g: 10, b: 2, score: 0.833, updated_at: new Date().toISOString() } } };
    const ok = writeWeights(p, w);
    assert.equal(ok, true);
    const back = JSON.parse(readFileSync(p, 'utf8'));
    assert.deepEqual(back, w);
  });
});

// --- Exports contract sanity checks -----------------------------------------

test('exports: 12 named functions + 4 allowlist constants present', () => {
  const names = ['correlateOutcomes', 'aggregatePerEntry', 'decayScores',
    'proposeAdditions', 'proposeEdits', 'proposePrunes',
    'applyMutation', 'revertMutation', 'rotateTelemetry',
    'readEvolutionState', 'writeEvolutionState', 'writeWeights'];
  for (const n of names) assert.strictEqual(typeof E[n], 'function', `${n} must be a function`);
  assert.ok(GOOD_COMMANDS instanceof Set);
  assert.ok(BAD_COMMANDS instanceof Set);
  assert.ok(GOOD_PHRASES instanceof RegExp);
  assert.ok(BAD_PHRASES instanceof RegExp);
});
