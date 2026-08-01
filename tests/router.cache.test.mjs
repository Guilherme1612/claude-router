// Task 2 (RED→GREEN): LRU intent-signature cache for router.mjs (RTE-06/07/§8).
// Key folds the manifest fingerprint epoch (INVC-02) — a no-op rebuild keeps the
// key, any semantic inventory change bumps it; atomic temp+rename writes; only
// High-tier decisive routes cached; LRU evicts at 256 entries; cache hit returns
// the stored route and skips BM25.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { cacheKey, contentHash, cacheLookup, writeCache, loadCache, saveCache } = mod;

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-cache-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

test('cacheKey: deterministic for same inputs', () => {
  const a = cacheKey('fix bug', ['fix', 'bug'], 'fp');
  const b = cacheKey('fix bug', ['fix', 'bug'], 'fp');
  assert.equal(a, b);
});

test('cacheKey: changing manifestFingerprint produces a different key (INVC epoch invalidation)', () => {
  const a = cacheKey('fix bug', ['fix'], 'a');
  const b = cacheKey('fix bug', ['fix'], 'b');
  assert.notEqual(a, b);
});

test('cacheKey: identical fingerprint yields an identical key', () => {
  const a = cacheKey('fix bug', ['fix'], 'fp');
  const b = cacheKey('fix bug', ['fix'], 'fp');
  assert.equal(a, b);
});

// SAF-01 / INVC-02: an omitted fingerprint folds the deterministic default '0'
// key (fail-open) — never throws and never collides with a real fingerprint key.
test('cacheKey: omitted fingerprint defaults to the deterministic 0 key', () => {
  assert.equal(cacheKey('fix bug', ['fix']), cacheKey('fix bug', ['fix'], '0'));
  assert.notEqual(cacheKey('fix bug', ['fix']), cacheKey('fix bug', ['fix'], 'a'));
});

test('cacheKey: changing normalizedPrompt produces a different key', () => {
  const a = cacheKey('fix bug', ['fix'], 'fp');
  const b = cacheKey('ship pr', ['fix'], 'fp');
  assert.notEqual(a, b);
});

test('cacheKey: changing intentKeywords produces a different key', () => {
  const a = cacheKey('fix bug', ['fix'], 'fp');
  const b = cacheKey('fix bug', ['fix', 'bug'], 'fp');
  assert.notEqual(a, b);
});

// PARITY-02 / D-05: runtime is cache-key identity — claude and codex must never
// share a stale route. The trailing 7th `runtime` param does not exist yet, so
// both calls hash identically today (RED); 31-03 extends cacheKey to fold the
// runtime slot into the key tuple.
test('cacheKey: cross-runtime divergence — codex !== claude (D-05)', () => {
  const codexKey = cacheKey('fix bug', ['fix'], 'fp', '', '', '', 'codex');
  const claudeKey = cacheKey('fix bug', ['fix'], 'fp', '', '', '', 'claude');
  assert.notEqual(codexKey, claudeKey, 'same prompt+manifest under different runtime must differ');
});

test('cacheKey: deterministic within a runtime — claude === claude (D-05)', () => {
  assert.equal(
    cacheKey('fix bug', ['fix'], 'fp', '', '', '', 'claude'),
    cacheKey('fix bug', ['fix'], 'fp', '', '', '', 'claude'),
  );
});

test('cacheLookup: miss returns null', () => {
  const cache = { entries: {}, order: [], size: 0 };
  assert.equal(cacheLookup('nope', cache), null);
});

test('cacheLookup: hit returns the stored route', () => {
  const route = { mode: 'gsd-debug', tier: 'high' };
  const cache = { entries: { sig1: { route, ts: 1, hit_count: 0 } }, order: ['sig1'], size: 1 };
  const got = cacheLookup('sig1', cache);
  assert.deepEqual(got, route);
});

test('writeCache: inserts entry + appends to LRU order', () => {
  let cache = { entries: {}, order: [], size: 0 };
  cache = writeCache(cache, 's1', { mode: 'a' });
  assert.equal(cache.order.length, 1);
  assert.equal(cache.order[0], 's1');
  assert.equal(cache.size, 1);
  assert.ok(cache.entries.s1.route);
});

test('writeCache: re-inserting same sig moves it to most-recent (LRU touch)', () => {
  let cache = { entries: {}, order: [], size: 0 };
  cache = writeCache(cache, 's1', { mode: 'a' });
  cache = writeCache(cache, 's2', { mode: 'b' });
  assert.deepEqual(cache.order, ['s1', 's2']);
  cache = writeCache(cache, 's1', { mode: 'a2' });
  assert.deepEqual(cache.order, ['s2', 's1'], 's1 should move to end (most-recent)');
  assert.equal(cache.entries.s1.route.mode, 'a2');
});

test('writeCache: LRU evicts at 256 entries (pops order[0])', () => {
  let cache = { entries: {}, order: [], size: 0 };
  for (let i = 0; i < 256; i++) {
    cache = writeCache(cache, `s${i}`, { mode: `m${i}` });
  }
  assert.equal(cache.order.length, 256);
  assert.equal(cache.size, 256);
  const firstIn = 's0';
  assert.ok(cache.entries[firstIn], 's0 should still be present before eviction');
  // insert one more → evict LRU (s0)
  cache = writeCache(cache, 's256', { mode: 'm256' });
  assert.equal(cache.order.length, 256, 'size capped at 256');
  assert.equal(cache.size, 256);
  assert.ok(!cache.entries[firstIn], 'LRU (s0) evicted');
  assert.ok(cache.entries.s256, 'new entry present');
});

test('writeCache: custom maxSize respected', () => {
  let cache = { entries: {}, order: [], size: 0 };
  for (let i = 0; i < 3; i++) cache = writeCache(cache, `s${i}`, { mode: `m${i}` }, 2);
  assert.equal(cache.order.length, 2);
  assert.ok(!cache.entries.s0, 's0 evicted at maxSize=2');
});

test('saveCache + loadCache: round-trip through disk', () => {
  withTempDir((dir) => {
    const path = join(dir, 'cache.json');
    let cache = { entries: {}, order: [], size: 0 };
    cache = writeCache(cache, 'sig', { mode: 'gsd-debug', tier: 'high' });
    saveCache(cache, path);
    assert.ok(existsSync(path), 'cache file written');
    const loaded = loadCache(path);
    assert.equal(loaded.entries.sig.route.mode, 'gsd-debug');
    assert.deepEqual(loaded.order, ['sig']);
  });
});

test('saveCache: atomic write — no .tmp file left after save', () => {
  withTempDir((dir) => {
    const path = join(dir, 'cache.json');
    const cache = writeCache({ entries: {}, order: [], size: 0 }, 'sig', { mode: 'x' });
    saveCache(cache, path);
    const leftover = existsSync(`${path}.tmp.${process.pid}`);
    assert.equal(leftover, false, 'temp file should be renamed away (atomic)');
  });
});

test('loadCache: missing file returns a fresh empty cache', () => {
  withTempDir((dir) => {
    const c = loadCache(join(dir, 'no-such.json'));
    assert.deepEqual(c.entries, {});
    assert.deepEqual(c.order, []);
    assert.equal(c.size, 0);
  });
});

test('loadCache: corrupted file returns a fresh empty cache (fail-open)', () => {
  withTempDir((dir) => {
    const path = join(dir, 'cache.json');
    writeFileSync(path, 'not json{');
    const c = loadCache(path);
    assert.deepEqual(c.entries, {});
  });
});

test('integration: cache hit returns stored route and skips BM25 (simulated)', () => {
  // Simulate the main() cache flow: compute key → miss → write → reload → hit.
  withTempDir((dir) => {
    const path = join(dir, 'cache.json');
    const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high' };
    const sig = cacheKey('fix the flaky test', ['fix', 'flaky', 'test'], 'fp');
    let cache = loadCache(path);
    assert.equal(cacheLookup(sig, cache), null); // miss
    cache = writeCache(cache, sig, route);
    saveCache(cache, path);
    const reloaded = loadCache(path);
    const hit = cacheLookup(sig, reloaded); // hit
    assert.deepEqual(hit, route);
  });
});

test('only High-tier routes are cached (Medium/Low not cached) — contract check', () => {
  // The decision to cache is made in main(); here we verify the writeCache
  // helper itself is neutral and the contract is: callers only invoke
  // writeCache when tier === 'high'. We simulate by writing a high-tier route
  // and confirming a medium-tier prompt (different key) would miss.
  let cache = { entries: {}, order: [], size: 0 };
  const highSig = cacheKey('fix flaky test', ['fix'], 'fp');
  cache = writeCache(cache, highSig, { mode: 'gsd-debug', tier: 'high' });
  assert.ok(cacheLookup(highSig, cache));
  // a different (medium-tier) prompt has a different key → miss (not cached)
  const medSig = cacheKey('redesign the dashboard', ['redesign'], 'fp');
  assert.equal(cacheLookup(medSig, cache), null);
});

// --- WR-01 / WR-02: live content-hash fold restores edit-invalidation ----------

test('WR-01: mode-map content change invalidates the key under an unchanged manifest fingerprint', () => {
  const fp = 'same-manifest-fingerprint';
  const modeA = { entries: [], thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 } };
  const modeB = { entries: [], thresholds: { T_high: 0.7, T_low: 0.25, M: 0.15 } };
  const keyA = cacheKey('help me', [], fp, contentHash(modeA), 'w');
  const keySameA = cacheKey('help me', [], fp, contentHash(modeA), 'w');
  const keyB = cacheKey('help me', [], fp, contentHash(modeB), 'w');
  assert.equal(keyA, keySameA, 'identical mode-map content -> identical key (no spurious invalidation)');
  assert.notEqual(keyA, keyB, 'a mode-map content edit must invalidate the cached route despite an unchanged fingerprint');
  // Omitted/'' live hashes leave the key fingerprint-only (back-compat determinism).
  assert.equal(cacheKey('help me', [], fp, '', ''), cacheKey('help me', [], fp, ''));
});

test('WR-01: weights content change invalidates the key under an unchanged manifest fingerprint', () => {
  const fp = 'same-manifest-fingerprint';
  const wA = { blend: 0.15, weights: { a: 1 } };
  const wB = { blend: 0.15, weights: { a: 2 } };
  const keyA = cacheKey('route me', [], fp, contentHash({ entries: [] }), contentHash(wA));
  const keyB = cacheKey('route me', [], fp, contentHash({ entries: [] }), contentHash(wB));
  assert.notEqual(keyA, keyB, 'a weights edit must invalidate the cached route'),
  // digest is hex64
  assert.match(keyA, /^[0-9a-f]{64}$/);
});

test('WR-02: graph.json content change invalidates the key (content hash, not mtime)', () => {
  const fp = 'same-manifest-fingerprint';
  const graphA = { nodes: [{ id: 'src/a.js' }] };
  const graphB = { nodes: [{ id: 'src/a.js' }, { id: 'src/b.js' }] };
  const keyA = cacheKey('how does the graph work', [], fp, '', '', contentHash(graphA));
  const keyB = cacheKey('how does the graph work', [], fp, '', '', contentHash(graphB));
  assert.equal(contentHash(graphA), contentHash(structuredClone(graphA)), 'content hash must be deterministic');
  assert.notEqual(keyA, keyB, 'a graph rebuild (content change) must invalidate graph-aware routes');
});
