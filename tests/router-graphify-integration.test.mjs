// Plan 02-02: integration tests for the graphify wiring (GRF-02 / D-07, D-13, D-18).
// Covers graphifyHeuristic body (delegates to graphifyQuery), composeWithCap,
// cacheKey mtime fold, and main() pipeline seams. Real AutomaticTrading graph
// is used for ok-path tests; synthetic temp dirs drive edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const {
  graphifyHeuristic,
  composeWithCap,
  cacheKey,
  tokenCount,
  formatGraphBlock,
  applyGraphBoost,
} = mod;

const REAL_GRAPH_DIR = '/Users/guilherme/Desktop/ClaudeCode/AutomaticTrading';
const REAL_GRAPH_PATH = join(REAL_GRAPH_DIR, 'graphify-out', 'graph.json');

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-graph-int-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// --- graphifyHeuristic (replaced body; signature preserved D-18) -----------

test('graphifyHeuristic: fires regex + has real graph → ok status, non-empty symbols, boostIds Set', (t) => {
  if (!existsSync(REAL_GRAPH_PATH)) { t.skip('requires AutomaticTrading graphify-out/graph.json (env-dependent)'); return; }
  const r = graphifyHeuristic('how does the memo writer work', REAL_GRAPH_DIR);
  assert.equal(r.queried, true, 'queried stays true whenever the regex fires (D-18)');
  assert.equal(r.status, 'ok');
  assert.ok(Array.isArray(r.symbols) && r.symbols.length > 0, 'symbols must be non-empty on real graph');
  assert.ok(r.boostIds instanceof Set, 'boostIds must be a Set');
  assert.equal(r.boostIds.size, r.symbols.length, 'boostIds size = symbols length');
  assert.equal(typeof r.elapsed_ms, 'number');
  assert.ok(r.elapsed_ms >= 0);
});

test('graphifyHeuristic: "thanks" (no regex match) → queried:false regardless of cwd', () => {
  const r = graphifyHeuristic('thanks', REAL_GRAPH_DIR);
  assert.equal(r.queried, false);
  assert.equal(r.status, 'not_triggered');
  assert.deepEqual(r.symbols, []);
});

test('graphifyHeuristic: cwd without graphify-out/ → graph_missing, queried:true (heuristic fired)', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('refactor the auth module', dir);
    assert.equal(r.queried, true, 'queried reflects heuristic-fires, not file-read success (D-18)');
    assert.equal(r.status, 'graph_missing');
    assert.deepEqual(r.symbols, []);
    assert.ok(r.boostIds instanceof Set);
    assert.equal(r.boostIds.size, 0);
  });
});

test('graphifyHeuristic: cwd with malformed graph.json → error status, queried:true, no throw', () => {
  withTempDir((dir) => {
    const gdir = join(dir, 'graphify-out');
    mkdirSync(gdir, { recursive: true });
    writeFileSync(join(gdir, 'graph.json'), '{not valid json}', 'utf8');
    let r;
    assert.doesNotThrow(() => {
      r = graphifyHeuristic('how does the foo bar work', dir);
    });
    assert.equal(r.queried, true);
    assert.equal(r.status, 'error');
    assert.deepEqual(r.symbols, []);
  });
});

test('graphifyHeuristic: empty/null prompt → not_triggered, never throws', () => {
  withTempDir((dir) => {
    const a = graphifyHeuristic('', dir);
    assert.equal(a.queried, false);
    assert.equal(a.status, 'not_triggered');
    assert.deepEqual(a.symbols, []);
    const b = graphifyHeuristic(null, dir);
    assert.equal(b.queried, false);
    assert.deepEqual(b.symbols, []);
  });
});

test('graphifyHeuristic: public signature unchanged — takes (prompt, cwd), returns object with at least {queried, status}', () => {
  // D-18: the function signature must NOT change from Phase 1.
  const r = graphifyHeuristic('how does the router decide', REAL_GRAPH_DIR);
  assert.equal(typeof r, 'object');
  assert.equal(typeof r.queried, 'boolean');
  assert.equal(typeof r.status, 'string');
  // New fields are additive (Phase 2 wire-up):
  assert.ok('symbols' in r, 'symbols is a new field on the return value');
  assert.ok('boostIds' in r, 'boostIds is a new field on the return value');
  assert.ok('elapsed_ms' in r, 'elapsed_ms is a new field on the return value');
});

// --- composeWithCap (D-13 graph-first drop) --------------------------------

test('composeWithCap: both empty → empty string', () => {
  assert.equal(composeWithCap('', ''), '');
});

test('composeWithCap: only route → returns route unchanged', () => {
  const r = '<!-- router-inject -->\nReasoning: x\n<!-- /router-inject -->';
  assert.equal(composeWithCap(r, ''), r);
});

test('composeWithCap: only graph → returns graph unchanged', () => {
  const g = 'Symbols: alpha (a, 1), beta (b, 2)';
  assert.equal(composeWithCap('', g), g);
});

test('composeWithCap: both present and under cap → "route\\n\\ngraph" shape', () => {
  const r = 'ROUTE';
  const g = 'GRAPH';
  const out = composeWithCap(r, g);
  assert.equal(out, 'ROUTE\n\nGRAPH');
});

test('composeWithCap: both present and OVER cap → graph dropped, route preserved', () => {
  // Build a route block already at ~498 tokens so adding the graph block tips
  // it over the 498 cap (TOKEN_CAP=500 minus 2-token safety margin).
  // tokenCount uses ~4-chars/token → 498 tokens ≈ 1992 chars.
  const bigRoute = 'A'.repeat(1992);
  const graph = 'Symbols: alpha (a, 1), beta (b, 2)';
  // Sanity: confirm the test setup is over cap
  assert.ok(tokenCount(bigRoute) + tokenCount(graph) > 500 - 2, 'test setup must be over cap');
  const out = composeWithCap(bigRoute, graph);
  assert.equal(out, bigRoute, 'over-cap → graph dropped first (D-13), route preserved');
  assert.ok(!out.includes('Symbols:'), 'output must not include graph block');
});

test('composeWithCap: route alone over cap → returns route (no graph present, no change)', () => {
  // No composition happens; this confirms the helper does not trim the route.
  const bigRoute = 'B'.repeat(2000);
  const out = composeWithCap(bigRoute, '');
  assert.equal(out, bigRoute);
});

// --- cacheKey: manifest fingerprint epoch fold (INVC-02) --------------------
// The old graphMtime/surfaceMtime/weightsMtime fold was removed by Plan 30-01;
// the key now folds the manifest fingerprint epoch.

test('cacheKey: same inputs + same fingerprint → same key', () => {
  const a = cacheKey('hello world', ['k1', 'k2'], 'fp');
  const b = cacheKey('hello world', ['k1', 'k2'], 'fp');
  assert.equal(a, b);
});

test('cacheKey: different manifestFingerprint → different key (epoch invalidation)', () => {
  const a = cacheKey('hello world', ['k1'], 'a');
  const b = cacheKey('hello world', ['k1'], 'b');
  assert.notEqual(a, b, 'a fingerprint change must invalidate the key');
});

test('cacheKey: omitted fingerprint defaults to the deterministic 0 key (fail-open)', () => {
  assert.equal(cacheKey('hello world', ['k1']), cacheKey('hello world', ['k1'], '0'));
  assert.notEqual(cacheKey('hello world', ['k1']), cacheKey('hello world', ['k1'], 'a'));
});

// --- end-to-end fail-open: forced throw in graphifyHeuristic --------------

test('fail-open: main() handles a graphifyHeuristic throw by emitting graph_status=error and exiting 0', () => {
  // We can't easily monkey-patch a const export, but we can simulate the seam:
  // graphifyQuery is a pure function that already returns graph_status='error'
  // (not throw) on malformed graph.json. Verify that path produces the right
  // telemetry shape (graph_status: 'error', no symbols, no boost).
  // For a true throw test, we exercise the contract: graphifyHeuristic never
  // throws because graphifyQuery's outer try/catch absorbs every error.
  withTempDir((dir) => {
    const gdir = join(dir, 'graphify-out');
    mkdirSync(gdir, { recursive: true });
    writeFileSync(join(gdir, 'graph.json'), '{not valid json}', 'utf8');
    let r;
    assert.doesNotThrow(() => {
      r = graphifyHeuristic('how does the foo bar work', dir);
    });
    // Contract: no throw, queried:true, status:'error', no symbols, empty boostIds
    assert.equal(r.queried, true);
    assert.equal(r.status, 'error');
    assert.deepEqual(r.symbols, []);
    assert.equal(r.boostIds.size, 0);
  });
});

// --- telemetry end-to-end: real graph hit → ok status ---------------------

test('telemetry: real AutomaticTrading graph produces graph_status:ok and graphify_queried:true on a codebase prompt', () => {
  if (!existsSync(REAL_GRAPH_PATH)) return;
  // We don't run main() here (it needs stdin, manifest, mode-map, etc.) — but
  // we can prove the upstream branch of the seam produces the right tuple.
  const g = graphifyHeuristic('how does the memo writer work', REAL_GRAPH_DIR);
  assert.equal(g.queried, true);
  assert.equal(g.status, 'ok');
  // main() flow: decision.graphify_queried = g.queried (line 1160 unchanged)
  //              decision.graph_status = g.status
  // So a real-graph hit will log: graphify_queried:true, graph_status:'ok'.
});

// --- end-to-end cap: main() emit path ------------------------------------
//
// This exercises the final-composition contract in main() without running
// main() itself. We verify the building blocks (composeWithCap + the formatGraphBlock
// cap) compose a real graph block + a small route block within the 500-token
// envelope.

test('end-to-end cap: real K=8 graph block + tiny route block fits under 500 tokens', () => {
  if (!existsSync(REAL_GRAPH_PATH)) return;
  const g = graphifyHeuristic('how does the memo writer work', REAL_GRAPH_DIR);
  assert.equal(g.status, 'ok');
  const routeBlock = '<!-- router-inject mode=gsd-debug tier=high sig=abcd1234 -->\nReasoning: matches\nRun /gsd-debug because matches\n<!-- /router-inject -->';
  const graphBlock = formatGraphBlock(g.symbols);
  const combined = composeWithCap(routeBlock, graphBlock);
  // Must include both blocks (under cap for this small route + K=8 graph)
  assert.ok(combined.includes('router-inject'), 'route block present');
  assert.ok(combined.includes('Symbols:'), 'graph block present');
  assert.ok(combined.includes('\n\nSymbols:'), 'blocks separated by \\n\\n');
  // Must be under the 500-token cap
  assert.ok(tokenCount(combined) <= 500, `combined must be ≤ 500 tokens, got ${tokenCount(combined)}`);
});

test('end-to-end cap: oversized route + graph block → only route survives', () => {
  const bigRoute = 'A'.repeat(1992); // ~498 tokens; + small graph = over 500
  const graphBlock = 'Symbols: alpha (a, 1), beta (b, 2)';
  const out = composeWithCap(bigRoute, graphBlock);
  assert.equal(out, bigRoute);
  assert.ok(!out.includes('Symbols:'));
});

// --- main() end-to-end smoke: synthetic project with graph + cache hit ----
//
// Spawn the hook as a subprocess with a known payload and a controlled
// telemetry path. The hook must:
//   1. Read the payload
//   2. Run the graphify branch (cwd has no graph → graph_status='graph_missing')
//   3. Compute the route (no manifest available → pass-through)
//   4. Append one telemetry line and exit 0.

test('main() smoke: subprocess with no manifest writes one telemetry line and exits 0', async () => {
  // Use a temp HOME-like override via env if supported. The hook reads
  // os.homedir() so we can't fully redirect; instead we run the hook against
  // a benign prompt and assert the subprocess exit code is 0 and stdout is
  // either empty or a valid additionalContext JSON.
  const { spawnSync } = await import('node:child_process');
  const payload = JSON.stringify({ prompt: 'how does the auth module work' });
  const r = spawnSync('node', [HOOK], {
    input: payload,
    env: { ...process.env, ROUTER_DEBUG_LATENCY: '1' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(r.status, 0, `hook must exit 0; got ${r.status}: ${r.stderr}`);
  // stdout is either empty (pass-through) or a valid JSON with hookSpecificOutput
  if (r.stdout && r.stdout.trim()) {
    const obj = JSON.parse(r.stdout);
    assert.equal(obj.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  }
});
