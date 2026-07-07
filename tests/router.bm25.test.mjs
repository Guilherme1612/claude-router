// Task 2 (RED→GREEN): Okapi BM25 (k1=1.5, b=0.75) for router.mjs (RTE-01/§3).
// Verifies the formula against hand-computed values, hooks[] exclusion, and
// the summary→name+description fallback for commands/plugin_skills.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { buildCorpus, bm25Score, tokenize } = mod;

const k1 = 1.5, b = 0.75;

// Independent reference implementation of Okapi BM25 for cross-checking.
function refBM25(query, corpus) {
  const N = corpus.length;
  const df = new Map();
  for (const c of corpus) for (const t of c.tokens.keys()) df.set(t, (df.get(t) || 0) + 1);
  const avgdl = corpus.reduce((s, c) => s + c.dl, 0) / (N || 1);
  return corpus.map((c) => {
    let score = 0;
    for (const t of query) {
      const tf = c.tokens.get(t);
      if (!tf) continue;
      const dft = df.get(t) || 0;
      const idf = Math.log(1 + (N - dft + 0.5) / (dft + 0.5));
      const denom = tf + k1 * (1 - b + (b * c.dl) / (avgdl || 1));
      score += idf * ((tf * (k1 + 1)) / (denom || 1));
    }
    return score;
  });
}

// Build a 3-entry fixture corpus whose BM25 values are hand-computable.
// All entries are commands (no `summary`) → summary falls back to name+description.
function fixture() {
  const manifest = {
    commands: [
      { id: 'aa', name: 'aa', description: 'bug fix' },
      { id: 'bb', name: 'bb', description: 'bug plan' },
      { id: 'cc', name: 'cc', description: 'review ship' },
    ],
  };
  return buildCorpus(manifest);
}

test('buildCorpus: returns 3 entries with token Map + dl', () => {
  const c = fixture();
  assert.equal(c.length, 3);
  for (const e of c) {
    assert.ok(e.tokens instanceof Map, 'tokens should be a Map');
    assert.ok(e.dl > 0, 'dl should be positive');
  }
});

test('buildCorpus: name weighted 3× (name tokens appear 3+ times in tf)', () => {
  const c = fixture();
  const aa = c.find((e) => e.name === 'aa');
  // doc text = "aa aa aa bug fix aa bug fix" → aa appears 4 times (3 name + 1 fallback)
  assert.equal(aa.tokens.get('aa'), 4);
  assert.equal(aa.tokens.get('bug'), 2);
  assert.equal(aa.tokens.get('fix'), 2);
  assert.equal(aa.dl, 8);
});

test('bm25Score: fixture matches independent reference implementation', () => {
  const corpus = fixture();
  const q = tokenize('fix bug');
  const got = bm25Score(q, corpus, k1, b);
  const ref = refBM25(q, corpus);
  // compare scores in sorted order
  const gotScores = got.map((g) => g.score).sort((a, b) => b - a);
  const refSorted = [...ref].sort((a, b) => b - a);
  for (let i = 0; i < refSorted.length; i++) {
    assert.ok(Math.abs((gotScores[i] || 0) - refSorted[i]) < 1e-9, `score ${i} mismatch`);
  }
});

test('bm25Score: top match is "aa" for query "fix bug" (it has fix+bug)', () => {
  const corpus = fixture();
  const got = bm25Score(tokenize('fix bug'), corpus, k1, b);
  assert.equal(got[0].name, 'aa');
  // aa has both fix and bug; bb has only bug.
  assert.ok(got[1].name === 'bb');
  assert.ok(got[0].score > got[1].score);
  // cc has no query terms → excluded (score 0 dropped)
  assert.equal(got.length, 2);
});

test('bm25Score: hand-computed IDF values (df=1 vs df=2) order correctly', () => {
  const corpus = fixture();
  const got = bm25Score(tokenize('fix bug'), corpus, k1, b);
  // IDF(fix): df=1 → ln(1 + 2.5/1.5) ≈ 0.980829 (rarer, higher IDF)
  // IDF(bug): df=2 → ln(1 + 1.5/2.5) ≈ 0.470004
  // aa score = IDF(fix)*term + IDF(bug)*term; bb score = IDF(bug)*term only
  // Therefore aa beats bb by more than IDF(fig)*term.
  assert.ok(got[0].score > 2 * got[1].score, 'aa should dominate bb (has extra rare term)');
});

test('bm25Score: empty query or empty corpus returns []', () => {
  assert.deepEqual(bm25Score([], fixture()), []);
  assert.deepEqual(bm25Score(tokenize('fix'), [], k1, b), []);
});

test('buildCorpus: hooks[] EXCLUDED (no description field)', () => {
  const manifest = {
    skills: [{ id: 's', name: 'sk', description: 'd', summary: 's' }],
    hooks: [
      { id: 'h', name: 'hook.mjs', path: '/x', size: 10, type: 'node' }, // no description
    ],
  };
  const c = buildCorpus(manifest);
  assert.equal(c.length, 1, 'hooks should be excluded');
  assert.equal(c[0].name, 'sk');
});

test('buildCorpus: commands/plugin_skills use name+description fallback (no summary)', () => {
  const manifest = {
    commands: [{ id: 'cmd', name: 'cmd', description: 'do thing' }],
    plugin_skills: [{ id: 'ps', name: 'ps', description: 'plug thing' }],
  };
  const c = buildCorpus(manifest);
  assert.equal(c.length, 2);
  const cmd = c.find((e) => e.name === 'cmd');
  // summary absent → fallback "cmd do thing"; doc = name×3 + desc + fallback
  // = "cmd cmd cmd do thing cmd do thing" → cmd appears 4 times (3 name-weight + 1 fallback)
  assert.equal(cmd.tokens.get('cmd'), 4);
  assert.ok(cmd.tokens.get('do') >= 2, 'fallback description tokens included');
});

test('buildCorpus: skills with scope==="project" excluded (GRD-02)', () => {
  const manifest = {
    skills: [
      { id: 'g', name: 'global', description: 'd', summary: 's', scope: 'global' },
      { id: 'p', name: 'proj', description: 'd', summary: 's', scope: 'project' },
    ],
  };
  const c = buildCorpus(manifest);
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'global');
});

test('buildCorpus: agents_store_skills scope "agents-store (not globally symlinked)" excluded', () => {
  const manifest = {
    agents_store_skills: [
      { id: 'a', name: 'agentstore', description: 'd', summary: 's', scope: 'agents-store (not globally symlinked)' },
      { id: 'g', name: 'globalsymlinked', description: 'd', summary: 's', scope: 'global' },
    ],
  };
  const c = buildCorpus(manifest);
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'globalsymlinked');
});

test('bm25Score: real manifest corpus builds and scores a debug prompt (>0 results)', () => {
  const { loadManifest } = mod;
  const manifest = loadManifest();
  if (!manifest) { assert.skip('manifest not available on this machine'); return; }
  const corpus = buildCorpus(manifest);
  assert.ok(corpus.length > 100, `corpus should be ~233 entries, got ${corpus.length}`);
  const got = bm25Score(tokenize('fix the flaky failing test'), corpus, k1, b);
  assert.ok(got.length > 0, 'debug-ish prompt should match some corpus entries');
  assert.ok(got[0].score > 0);
});