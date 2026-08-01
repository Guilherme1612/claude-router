// Plan 02-01: pure-function graphify primitives (GRF-02 / D-01..D-18).
// Covers the three new exports (graphifyQuery, formatGraphBlock, applyGraphBoost)
// and the internal collectGraphNodes helper. Real AutomaticTrading graph is
// used for the ok-path tests; synthetic minimal-shape graphs drive the edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { graphifyQuery, formatGraphBlock, applyGraphBoost, collectGraphNodes } = mod;

const REAL_GRAPH_DIR = '/Users/guilherme/Desktop/ClaudeCode/AutomaticTrading';

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-graph-pure-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

function writeGraph(dir, graphObj) {
  const gdir = join(dir, 'graphify-out');
  mkdirSync(gdir, { recursive: true });
  writeFileSync(join(gdir, 'graph.json'), JSON.stringify(graphObj), 'utf8');
}

// --- graphifyQuery ---------------------------------------------------------

test('graphifyQuery: "ok" status on real AutomaticTrading graph with overlapping prompt', (t) => {
  if (!existsSync(join(REAL_GRAPH_DIR, 'graphify-out', 'graph.json'))) { t.skip('requires AutomaticTrading graphify-out/graph.json (env-dependent)'); return; }
  const r = graphifyQuery('how does the memo writer work', REAL_GRAPH_DIR, 8);
  assert.equal(r.graph_status, 'ok');
  assert.equal(r.graph_queried, true);
  assert.ok(r.symbols.length > 0, 'top-K must be non-empty on the real graph');
  assert.ok(r.symbols.length <= 8, 'top-K must respect k=8');
  for (let i = 1; i < r.symbols.length; i++) {
    assert.ok(r.symbols[i - 1].score >= r.symbols[i].score, 'top-K must be score-desc');
  }
});

test('graphifyQuery: returns <= k symbols; result shape is fixed', () => {
  const r = graphifyQuery('memo writer persona', REAL_GRAPH_DIR, 4);
  assert.ok(r.symbols.length <= 4);
  const keys = Object.keys(r).sort();
  assert.deepEqual(keys, ['boostIds', 'content_hash', 'elapsed_ms', 'graph_queried', 'graph_status', 'symbols']);
  assert.match(r.content_hash, /^[0-9a-f]{64}$/);
  assert.ok(r.boostIds instanceof Set);
  assert.equal(r.boostIds.size, r.symbols.length);
});

test('graphifyQuery: "graph_missing" when cwd has no graphify-out/', () => {
  withTempDir((dir) => {
    const r = graphifyQuery('how does the auth module work', dir, 8);
    assert.equal(r.graph_status, 'graph_missing');
    assert.equal(r.graph_queried, false);
    assert.deepEqual(r.symbols, []);
  });
});

test('graphifyQuery: "error" when graph.json is malformed JSON', () => {
  withTempDir((dir) => {
    const gdir = join(dir, 'graphify-out');
    mkdirSync(gdir, { recursive: true });
    writeFileSync(join(gdir, 'graph.json'), '{not valid json}', 'utf8');
    const r = graphifyQuery('how does the foo bar baz work', dir, 8);
    assert.equal(r.graph_status, 'error');
    assert.equal(r.graph_queried, true);
    assert.deepEqual(r.symbols, []);
  });
});

test('graphifyQuery: "error" when file size > 50MB', () => {
  withTempDir((dir) => {
    const gdir = join(dir, 'graphify-out');
    mkdirSync(gdir, { recursive: true });
    const targetSize = 50 * 1024 * 1024 + 1024; // 50MB + 1KB
    const header = '{"nodes":[';
    const footer = ']}';
    const pad = ' '.repeat(targetSize - header.length - footer.length);
    writeFileSync(join(gdir, 'graph.json'), header + pad + footer, 'utf8');
    const realSize = statSync(join(gdir, 'graph.json')).size;
    assert.ok(realSize > 50 * 1024 * 1024, `sanity: file is > 50MB (got ${realSize})`);
    const r = graphifyQuery('how does the foo work', dir, 8);
    assert.equal(r.graph_status, 'error');
    assert.deepEqual(r.symbols, []);
  });
});

test('graphifyQuery: "error" when nodes.length > 20000', () => {
  withTempDir((dir) => {
    const nodes = new Array(20001);
    for (let i = 0; i < 20001; i++) {
      nodes[i] = { id: `n_${i}`, label: `node_${i}` };
    }
    writeGraph(dir, { nodes, graph: { hyperedges: [] } });
    const r = graphifyQuery('node_42', dir, 8);
    assert.equal(r.graph_status, 'error');
    assert.deepEqual(r.symbols, []);
  });
});

test('graphifyQuery: "empty" when BM25 has no token overlap with prompt', () => {
  withTempDir((dir) => {
    writeGraph(dir, {
      nodes: [
        { id: 'alpha_node', label: 'alpha symbol' },
        { id: 'beta_node', label: 'beta symbol' },
      ],
      graph: { hyperedges: [] },
    });
    const r = graphifyQuery('zzzzzzzz zzzzzzzz zzzzzzzz', dir, 8);
    assert.equal(r.graph_status, 'empty');
    assert.equal(r.graph_queried, true);
    assert.deepEqual(r.symbols, []);
  });
});

test('graphifyQuery: never throws on graph_missing / malformed / overcount / falsy cwd', () => {
  withTempDir((dir) => {
    assert.doesNotThrow(() => graphifyQuery('how does x work', dir, 8));
    const gdir = join(dir, 'graphify-out');
    mkdirSync(gdir, { recursive: true });
    writeFileSync(join(gdir, 'graph.json'), '{not valid json}', 'utf8');
    assert.doesNotThrow(() => graphifyQuery('how does x work', dir, 8));
    const bigNodes = new Array(20001);
    for (let i = 0; i < 20001; i++) bigNodes[i] = { id: `n_${i}`, label: 'x' };
    writeGraph(dir, { nodes: bigNodes, graph: { hyperedges: [] } });
    assert.doesNotThrow(() => graphifyQuery('x', dir, 8));
    // Falsy cwd values fall through to process.cwd() — must not throw.
    assert.doesNotThrow(() => graphifyQuery('how does x work', '', 8));
    assert.doesNotThrow(() => graphifyQuery('how does x work', null, 8));
  });
});

test('graphifyQuery: elapsed_ms is a non-negative number', () => {
  const r = graphifyQuery('how does the memo writer work', REAL_GRAPH_DIR, 8);
  assert.equal(typeof r.elapsed_ms, 'number');
  assert.ok(r.elapsed_ms >= 0, `elapsed_ms must be ≥ 0, got ${r.elapsed_ms}`);
});

// --- formatGraphBlock ------------------------------------------------------

test('formatGraphBlock: returns "" for empty / null / undefined / non-array input', () => {
  assert.equal(formatGraphBlock([]), '');
  assert.equal(formatGraphBlock(null), '');
  assert.equal(formatGraphBlock(undefined), '');
  assert.equal(formatGraphBlock('not an array'), '');
});

test('formatGraphBlock: starts with "Symbols: " prefix and includes (id, community) tuples', () => {
  const symbols = [
    { id: 'alpha', label: 'Alpha', community: 10, score: 0.9 },
    { id: 'beta', label: 'Beta', community: 20, score: 0.8 },
  ];
  const out = formatGraphBlock(symbols);
  assert.ok(out.startsWith('Symbols: '), `expected "Symbols: " prefix, got: ${out.slice(0, 30)}`);
  assert.match(out, /\(alpha, 10\)/);
  assert.match(out, /\(beta, 20\)/);
});

test('formatGraphBlock: output length in chars / 4 <= GRAPH_TOKEN_CAP - 2 (198 tokens)', () => {
  const symbols = [];
  for (let i = 0; i < 8; i++) {
    symbols.push({
      id: `long_id_${i}_xxxxxxxxxxxxxxxxxxxxxx`,
      label: `Long label number ${i} with extra text to push char count up ${i} ${i}`,
      community: i,
      score: 1.0 - i * 0.01,
    });
  }
  const out = formatGraphBlock(symbols);
  const tokens = Math.ceil(out.length / 4);
  assert.ok(tokens <= 198, `expected <= 198 tokens, got ${tokens} (${out.length} chars)`);
});

test('formatGraphBlock: drops lowest-scored symbols when input would exceed cap', () => {
  const symbols = [];
  for (let i = 0; i < 20; i++) {
    symbols.push({
      id: `sym_${i}`,
      label: `symbol_${i}_with_some_padding_to_bump_chars`,
      community: i,
      score: 1.0 - i * 0.01,
    });
  }
  const out = formatGraphBlock(symbols);
  const matches = out.match(/\(sym_\d+, \d+\)/g) || [];
  assert.ok(matches.length < 20, `expected fewer than 20 symbols, got ${matches.length}`);
  assert.ok(matches.length >= 1, `expected at least 1 symbol in output`);
  assert.ok(out.includes('sym_0'), 'output should include top-scored sym_0');
  assert.ok(!out.includes('sym_19'), 'output should drop lowest-scored sym_19');
});

test('formatGraphBlock: label truncated to 50 chars with ellipsis suffix when original > 50 chars', () => {
  const longLabel = 'a'.repeat(80);
  const symbols = [{ id: 'id_x', label: longLabel, community: 5, score: 1.0 }];
  const out = formatGraphBlock(symbols);
  const m = out.match(/Symbols: (.+?) \(/);
  assert.ok(m, 'output should contain a label between "Symbols: " and " ("');
  const label = m[1];
  assert.ok(label.length <= 50, `truncated label should be <= 50 chars, got ${label.length}`);
  assert.ok(label.endsWith('…') || label.length < 50, 'truncated label should end with …');
});

test('formatGraphBlock: does NOT include source_file (D-06) and does NOT mutate input', () => {
  const symbols = [
    { id: 'src_thing', label: 'source thing label', community: 7, score: 0.9, source_file: 'pmacs/secret.py' },
  ];
  const before = JSON.stringify(symbols);
  const out = formatGraphBlock(symbols);
  const after = JSON.stringify(symbols);
  assert.equal(before, after, 'formatGraphBlock must not mutate the input array');
  assert.ok(!out.includes('source_file'), 'output should not include source_file key');
  assert.ok(!out.includes('pmacs/secret.py'), 'output should not include file paths');
});

// --- applyGraphBoost -------------------------------------------------------

test('applyGraphBoost: does not mutate input and returns a new array', () => {
  const scored = [
    { name: 'a', score: 0.5 },
    { name: 'b', score: 0.4 },
  ];
  const before = JSON.stringify(scored);
  const out = applyGraphBoost(scored, ['a'], new Set(['a']), 0.15);
  const after = JSON.stringify(scored);
  assert.equal(before, after);
  assert.notEqual(out, scored, 'output should be a new array, not the input reference');
});

test('applyGraphBoost: adds amount only to entries in the BOTH (topK ∩ manifestIdSet) intersection', () => {
  const scored = [
    { name: 'a', score: 0.5 },
    { name: 'b', score: 0.4 },
    { name: 'c', score: 0.3 },
  ];
  // a is in both → boosted
  // b is in topK only → unchanged
  // c is in manifestIdSet only → unchanged
  const out = applyGraphBoost(scored, ['a', 'b'], new Set(['a', 'c']), 0.15);
  const map = Object.fromEntries(out.map((s) => [s.name, s.score]));
  assert.equal(map.a, 0.65, 'a is in both → +0.15');
  assert.equal(map.b, 0.4, 'b is in topK only → unchanged');
  assert.equal(map.c, 0.3, 'c is in manifestIdSet only → unchanged');
});

test('applyGraphBoost: case-insensitive matching; default amount = 0.15', () => {
  const scored = [
    { name: 'Aardvark', score: 0.5 },
    { name: 'BADGER', score: 0.4 },
  ];
  const out = applyGraphBoost(scored, ['AARDVARK', 'badger'], new Set(['aardvark', 'BADGER']));
  const map = Object.fromEntries(out.map((s) => [s.name, s.score]));
  assert.equal(map.Aardvark, 0.65, 'case-insensitive match boosts Aardvark');
  assert.equal(map.BADGER, 0.55, 'case-insensitive match boosts BADGER');
});

test('applyGraphBoost: empty/non-array scored returns []', () => {
  assert.deepEqual(applyGraphBoost([], ['a'], new Set(['a']), 0.15), []);
  assert.deepEqual(applyGraphBoost(null, ['a'], new Set(['a']), 0.15), []);
  assert.deepEqual(applyGraphBoost(undefined, ['a'], new Set(['a']), 0.15), []);
});

// --- collectGraphNodes (private helper; exported for test reachability) ---

test('collectGraphNodes: indexes both nodes and graph.hyperedges; hyperedge community = -1', () => {
  const graph = {
    nodes: [
      { id: 'n1', label: 'node one', community: 5 },
      { id: 'n2', label: 'node two', community: 7 },
    ],
    graph: {
      hyperedges: [
        { id: 'he1', label: 'hyperedge one', nodes: ['n1', 'n2'] },
      ],
    },
  };
  const out = collectGraphNodes(graph);
  assert.equal(out.length, 3);
  const ids = out.map((r) => r.id).sort();
  assert.deepEqual(ids, ['he1', 'n1', 'n2']);
  const he = out.find((r) => r.id === 'he1');
  assert.equal(he.community, -1, 'hyperedge must get community = -1');
  const n = out.find((r) => r.id === 'n1');
  assert.equal(n.community, 5);
});

test('collectGraphNodes: returns [] for null/undefined/non-object; falls back to id for missing label', () => {
  assert.deepEqual(collectGraphNodes(null), []);
  assert.deepEqual(collectGraphNodes(undefined), []);
  assert.deepEqual(collectGraphNodes(42), []);
  // Missing label → fall back to id. Missing community → default to -1.
  const graph = { nodes: [{ id: 'n1' }], graph: { hyperedges: [] } };
  const out = collectGraphNodes(graph);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'n1', 'label should fall back to id');
  assert.equal(out[0].community, -1, 'community should default to -1 when missing');
});

test('collectGraphNodes: ignores top-level hyperedges and links (per RESEARCH.md §2)', () => {
  const graph = {
    nodes: [{ id: 'n1', label: 'node one', community: 1 }],
    hyperedges: [{ id: 'legacy_he', label: 'should be ignored' }], // legacy duplicate
    links: [{ source: 'n1', target: 'n1' }],
    graph: {
      hyperedges: [{ id: 'he1', label: 'canonical hyperedge', nodes: ['n1'] }],
    },
  };
  const out = collectGraphNodes(graph);
  const ids = out.map((r) => r.id).sort();
  assert.deepEqual(ids, ['he1', 'n1']);
  assert.ok(!ids.includes('legacy_he'), 'must NOT index top-level legacy hyperedges');
});
