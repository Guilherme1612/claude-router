// Plan 02-03: Calibration harness graph-branch tests (D-15, D-16 / GRF-02).
// Covers the new codebase fixtures + dryRun graph branch + pass threshold.
// Pattern matches the existing test files (router-graphify-integration.test.mjs,
// router-graphify-pure.test.mjs): use real AutomaticTrading graph for ok-path,
// synthetic temp dirs for edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const R = mod;

const CALIBRATION_TASKS = join(process.cwd(), 'calibration-tasks.json');
const MODE_MAP = join(homedir(), '.claude', 'router', 'mode-map.json');
const MANIFEST = join(homedir(), '.claude', 'router', 'claude-inventory-manifest.json');
const REAL_GRAPH_DIR = '/Users/guilherme/Desktop/ClaudeCode/AutomaticTrading';

// --- Fixture schema + count ----------------------------------------------

test('calibration-tasks.json: total entries include originals, codebase, evolution, and Phase 05 coverage', () => {
  // Phase 3 (Plan 03-03): extended the Phase-2 13-15 set with 3-5 evolution
  // fixtures. Phase 05 adds standing COV route-coverage fixtures.
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  assert.ok(Array.isArray(tasks), 'tasks must be an array');
  assert.ok(tasks.length >= 25 && tasks.length <= 32, `expected 25-32 entries, got ${tasks.length}`);
  const phase05Count = tasks.filter((t) => String(t?.right?.edge || '').includes('COV-')).length;
  const originalCount = tasks.filter((t) => !t.codebase && !t.evolution && !String(t?.right?.edge || '').includes('COV-')).length;
  const codebaseCount = tasks.filter((t) => t.codebase === true).length;
  const evolutionCount = tasks.filter((t) => t.evolution === true).length;
  assert.equal(originalCount, 10, '10 Phase-1 originals must be preserved');
  assert.ok(codebaseCount >= 3 && codebaseCount <= 5, `expected 3-5 codebase fixtures, got ${codebaseCount}`);
  assert.ok(evolutionCount >= 3 && evolutionCount <= 5, `expected 3-5 evolution fixtures, got ${evolutionCount}`);
  assert.ok(phase05Count >= 9, `expected at least 9 Phase 05 COV fixtures, got ${phase05Count}`);
});

test('calibration-tasks.json: each codebase fixture has cwd + graph_status_expected fields', () => {
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const codebase = tasks.filter((t) => t.codebase === true);
  assert.ok(codebase.length > 0, 'must have at least one codebase fixture');
  for (const t of codebase) {
    assert.equal(typeof t.cwd, 'string', `fixture #${t.id} missing cwd`);
    assert.ok(t.cwd.length > 0, `fixture #${t.id} has empty cwd`);
    assert.ok(
      ['ok', 'empty', 'error', 'graph_missing', 'not_triggered'].includes(t.graph_status_expected),
      `fixture #${t.id} graph_status_expected=${t.graph_status_expected} not in enum`
    );
  }
});

test('calibration-tasks.json: every codebase fixture right.mode exists in mode-map', () => {
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const modeMap = JSON.parse(readFileSync(MODE_MAP, 'utf8'));
  const codebase = tasks.filter((t) => t.codebase === true && t.right.status === 'route');
  const modeMapModes = new Set((modeMap.entries || []).map((e) => (e.mode || '').replace(/^\//, '')));
  for (const t of codebase) {
    const rightMode = (t.right.mode || '').replace(/^\//, '');
    if (rightMode === '') {
      // Skill-only edge (mode=null is allowed for skill-only routes — fixture #7,
      // #14). A skill may be surfaced by mode-map recommendations or directly
      // from the manifest skill inventory.
      const skills = t.right.skills || [];
      const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
      const manifestSkillNames = new Set([
        ...(manifest.skills || []).map((s) => s.name),
        ...(manifest.plugin_skills || []).map((s) => s.name),
      ]);
      const skillInMap = skills.some((s) =>
        (modeMap.entries || []).some((e) => (e.recommended_skills || []).includes(s))
      );
      const skillInManifest = skills.some((s) => manifestSkillNames.has(s));
      assert.ok(
        skillInMap || skillInManifest,
        `fixture #${t.id} skill-only edge: no skill [${skills.join(',')}] in mode-map or manifest`
      );
    } else {
      assert.ok(modeMapModes.has(rightMode), `fixture #${t.id} right.mode=${rightMode} not in mode-map`);
    }
  }
});

// --- dryRun graph branch --------------------------------------------------

test('dryRun (Phase 2): with cwd=AutomaticTrading + codebase prompt returns graph_status in valid enum', () => {
  const manifest = R.loadManifest(MANIFEST);
  const modeMap = JSON.parse(readFileSync(MODE_MAP, 'utf8'));
  // The harness dryRun is not exported, so emulate its graph branch via the
  // hook exports: graphifyHeuristic + applyGraphBoost.
  const prompt = 'how does the memo writer persona work? what calls it?';
  const graph = R.graphifyHeuristic(prompt, REAL_GRAPH_DIR);
  assert.ok(
    ['ok', 'empty', 'error', 'graph_missing', 'not_triggered'].includes(graph.status),
    `graph.status must be in enum, got ${graph.status}`
  );
  // dryRun return shape (as exposed by the harness) carries graph_status + symbols.
  // We don't import the harness, but we can verify the underlying primitives.
  assert.ok(Array.isArray(graph.symbols));
  assert.ok(graph.boostIds instanceof Set);
  // Sanity: the manifest is real and the buildCorpus is callable.
  const corpus = R.buildCorpus(manifest, modeMap);
  assert.ok(corpus.length > 0, 'corpus must be non-empty for the manifest');
});

test('dryRun (Phase 2): return shape includes graph_status, graph_symbols, elapsed_ms', () => {
  // Verify the underlying primitives carry the same fields the harness wires
  // into dryRun's return. graphifyHeuristic is the source of graph_status;
  // applyGraphBoost requires the shape {name, score} and the boostIds Set.
  const prompt = 'refactor the typed-confirm modal to be reusable across the operator gates';
  const graph = R.graphifyHeuristic(prompt, REAL_GRAPH_DIR);
  assert.equal(typeof graph.status, 'string', 'graph.status must be a string');
  assert.ok(Array.isArray(graph.symbols), 'graph.symbols must be an array');
  assert.ok(graph.boostIds instanceof Set, 'graph.boostIds must be a Set');
  assert.equal(typeof graph.elapsed_ms, 'number', 'graph.elapsed_ms must be a number');
  assert.ok(graph.elapsed_ms >= 0, 'graph.elapsed_ms must be non-negative');
  // applyGraphBoost never throws on any input (even when boostIds is empty)
  const fake = [{ name: 'foo', score: 1.0 }, { name: 'bar', score: 0.5 }];
  const out = R.applyGraphBoost(fake, graph.boostIds, new Set(['foo']), 0.15);
  assert.equal(out.length, 2);
  assert.equal(typeof out[0].score, 'number');
});

test('dryRun (Phase 2): trivial prompt (cwd with graph) → graph_status=not_triggered, never throws', () => {
  const prompt = 'thanks, that is great';
  const graph = R.graphifyHeuristic(prompt, REAL_GRAPH_DIR);
  assert.equal(graph.queried, false);
  assert.equal(graph.status, 'not_triggered');
  assert.deepEqual(graph.symbols, []);
  assert.equal(graph.boostIds.size, 0);
});

// --- Pass threshold computation ------------------------------------------

test('pass threshold: originalCount + 1 (D-16) + 1 (D-25 evolution) + Phase 05 coverage', () => {
  // Phase 3 (Plan 03-03): pass threshold bumped to N + 2 to require at least
  // 1 codebase + 1 evolution fixture to be right (in addition to the 10
  // Phase-1 originals). Phase 05 also requires every COV fixture to pass.
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const phase05Count = tasks.filter((t) => String(t?.right?.edge || '').includes('COV-')).length;
  const originalCount = tasks.filter((t) => !t.codebase && !t.evolution && !String(t?.right?.edge || '').includes('COV-')).length;
  const codebaseCount = tasks.filter((t) => t.codebase === true).length;
  const evolutionCount = tasks.filter((t) => t.evolution === true).length;
  // Mirror the harness's threshold computation: originalCount + 1 + 1 + phase05Count.
  const expectedThreshold = originalCount + 1 + 1 + phase05Count;
  // Sanity: must be > originalCount (so at least 1 codebase + 1 evolution right is required)
  assert.ok(expectedThreshold > originalCount);
  // Sanity: must be <= total fixture count
  assert.ok(expectedThreshold <= tasks.length, `threshold ${expectedThreshold} > total ${tasks.length}`);
  // Sanity: codebase + evolution subsets each >= 1
  assert.ok(codebaseCount >= 1);
  assert.ok(evolutionCount >= 1);
  assert.ok(phase05Count >= 9);
});
