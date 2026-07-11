// Plan 03-03 / Task 1: Calibration harness evolution-branch tests (D-13, D-25).
// Validates the new evolution fixtures + evolutionRight function + dryRun weights
// argument + pass threshold bump. Pattern mirrors tests/router.calibration-graph.test.mjs
// (the Phase 2 equivalent). Uses the same importable router.calibrate.mjs surface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const R = await import(HOOK);

const CALIBRATE_PATH = join(process.cwd(), 'router.calibrate.mjs');
const C = await import(pathToFileURL(CALIBRATE_PATH).href);

const CALIBRATION_TASKS = join(process.cwd(), 'calibration-tasks.json');
const MODE_MAP = join(homedir(), '.claude', 'router', 'mode-map.json');
const MANIFEST = join(homedir(), '.claude', 'router', 'claude-inventory-manifest.json');

// --- Fixture schema + count ----------------------------------------------

test('calibration-tasks.json: total entries include originals, codebase, evolution, and Phase 05 coverage', () => {
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  assert.ok(Array.isArray(tasks), 'tasks must be an array');
  assert.ok(tasks.length >= 25 && tasks.length <= 32, `expected 25-32 entries, got ${tasks.length}`);
  const phase05Count = tasks.filter((t) => String(t?.right?.edge || '').includes('COV-')).length;
  const originalCount = tasks.filter((t) => !t.codebase && !t.evolution && !String(t?.right?.edge || '').includes('COV-')).length;
  const codebaseCount = tasks.filter((t) => t.codebase === true).length;
  const evolutionCount = tasks.filter((t) => t.evolution === true).length;
  assert.equal(originalCount, 10, '10 Phase-1 originals must be preserved');
  assert.ok(codebaseCount >= 7, `expected at least 7 codebase fixtures, got ${codebaseCount}`);
  assert.ok(evolutionCount >= 3 && evolutionCount <= 5, `expected 3-5 evolution fixtures, got ${evolutionCount}`);
  assert.ok(phase05Count >= 9, `expected at least 9 Phase 05 COV fixtures, got ${phase05Count}`);
});

test('calibration-tasks.json: every evolution fixture has the documented schema', () => {
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const evolution = tasks.filter((t) => t.evolution === true);
  assert.ok(evolution.length >= 3, 'must have at least 3 evolution fixtures');
  for (const t of evolution) {
    assert.equal(t.evolution, true, `fixture #${t.id} evolution must be true`);
    assert.ok(['good', 'bad', 'unknown'].includes(t.evolution_outcome_expected),
      `fixture #${t.id} evolution_outcome_expected=${t.evolution_outcome_expected} not in enum`);
    assert.ok(Array.isArray(t.evolution_telemetry_mock) && t.evolution_telemetry_mock.length >= 2,
      `fixture #${t.id} must have evolution_telemetry_mock array (>=2 entries)`);
    assert.ok(['positive', 'negative', 'neutral'].includes(t.evolution_score_direction),
      `fixture #${t.id} evolution_score_direction=${t.evolution_score_direction} not in enum`);
    // First mock entry must have a suggested_mode (correlator skips nulls)
    assert.ok(t.evolution_telemetry_mock[0].suggested_mode != null,
      `fixture #${t.id} first mock entry must have suggested_mode (correlator skips nulls)`);
  }
});

test('calibration-tasks.json: every evolution fixture right.mode (if set) exists in mode-map', () => {
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const modeMap = JSON.parse(readFileSync(MODE_MAP, 'utf8'));
  const modeMapModes = new Set((modeMap.entries || []).map((e) => (e.mode || '').replace(/^\//, '')));
  const evolution = tasks.filter((t) => t.evolution === true && t.right.status === 'route');
  for (const t of evolution) {
    const rightMode = (t.right.mode || '').replace(/^\//, '');
    if (rightMode === '') {
      // null mode is allowed for pass_through (E5)
      assert.equal(t.right.status, 'pass_through',
        `fixture #${t.id} mode=null but status is not pass_through`);
    } else {
      assert.ok(modeMapModes.has(rightMode),
        `fixture #${t.id} right.mode=${rightMode} not in mode-map.json`);
    }
  }
});

// --- Pass threshold computation ------------------------------------------

test('pass threshold: originalCount + 1 codebase + 1 evolution + Phase 05 coverage', () => {
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const phase05Count = tasks.filter((t) => String(t?.right?.edge || '').includes('COV-')).length;
  const originalCount = tasks.filter((t) => !t.codebase && !t.evolution && !String(t?.right?.edge || '').includes('COV-')).length;
  const codebaseCount = tasks.filter((t) => t.codebase === true).length;
  const evolutionCount = tasks.filter((t) => t.evolution === true).length;
  const expectedThreshold = originalCount + 1 + 1 + phase05Count;
  // Sanity: threshold > originalCount (forces at least 1 codebase + 1 evolution right)
  assert.ok(expectedThreshold > originalCount,
    `threshold must exceed originalCount; got threshold=${expectedThreshold} original=${originalCount}`);
  // Sanity: threshold <= total fixture count
  assert.ok(expectedThreshold <= tasks.length,
    `threshold ${expectedThreshold} > total ${tasks.length}`);
  // Sanity: codebase + evolution subsets each >= 1
  assert.ok(codebaseCount >= 1, `need >= 1 codebase fixture, got ${codebaseCount}`);
  assert.ok(evolutionCount >= 1, `need >= 1 evolution fixture, got ${evolutionCount}`);
  assert.ok(phase05Count >= 9, `need >= 9 Phase 05 fixtures, got ${phase05Count}`);
});

// --- evolutionRight shape + behavior -------------------------------------

test('evolutionRight: returns {ok, detail: {outcome_actual, score_actual, weight_applied}}', async () => {
  const tasks = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const evolution = tasks.filter((t) => t.evolution === true);
  assert.ok(evolution.length >= 1, 'need at least 1 evolution fixture');
  const manifest = R.loadManifest(MANIFEST);
  const modeMap = R.loadModeMap(MODE_MAP);
  // Empty weights — evolutionRight builds syntheticWeights from the mock itself
  const weights = { schema_version: 2, blend: 0.15, decay_days: 14, weights: {} };
  for (const task of evolution) {
    const result = await C.evolutionRight(task, manifest, modeMap, weights);
    assert.equal(typeof result, 'object', 'evolutionRight must return an object');
    assert.equal(typeof result.ok, 'boolean', 'result.ok must be boolean');
    assert.equal(typeof result.detail, 'object', 'result.detail must be object');
    // detail fields: outcome_actual is the correlator's verdict on the mock
    assert.ok(['good', 'bad', 'unknown'].includes(result.detail.outcome_actual),
      `result.detail.outcome_actual=${result.detail.outcome_actual} not in enum`);
    // score_actual is a number (the weight applied by the blend; 0 when no entry matches)
    assert.equal(typeof result.detail.score_actual, 'number',
      `result.detail.score_actual must be number, got ${typeof result.detail.score_actual}`);
    // topEntry is the top entry picked by dryRun (or null for pass_through)
    if (result.detail.topEntry !== null) {
      assert.equal(typeof result.detail.topEntry, 'string');
    }
  }
});

test('evolutionRight: mock with downstream "gsd-debug" prompt -> outcome_actual=bad', async () => {
  // Build a synthetic fixture with a known-bad mock and verify the correlator
  // labels it bad (independent of the fixture file's contents).
  const manifest = R.loadManifest(MANIFEST);
  const modeMap = R.loadModeMap(MODE_MAP);
  const t0 = Date.now();
  const task = {
    id: 999,
    prompt: 'synthetic bad-outcome test',
    cwd: process.cwd(),
    evolution: true,
    evolution_outcome_expected: 'bad',
    evolution_score_direction: 'negative',
    evolution_telemetry_mock: [
      { ts: t0, prompt_signature: 'sig-A', suggested_mode: '/gsd-debug', suggested_skills: [], suggested_agents: [], cwd: process.cwd(), prompt: '/gsd-debug something' },
      { ts: t0 + 5 * 60 * 1000, prompt_signature: 'sig-B', suggested_mode: '/gsd-debug', suggested_skills: [], suggested_agents: [], cwd: process.cwd(), prompt: 'no, that is wrong' },
    ],
    right: { mode: '/gsd-debug', skills: ['systematic-debugging'], agents: [], tier: 'high', status: 'route' },
  };
  const weights = { schema_version: 2, blend: 0.15, decay_days: 14, weights: {} };
  const result = await C.evolutionRight(task, manifest, modeMap, weights);
  assert.equal(result.detail.outcome_actual, 'bad',
    `expected outcome=bad, got ${result.detail.outcome_actual}`);
});

test('evolutionRight: mock with downstream "looks good" phrase -> outcome_actual=good', async () => {
  const manifest = R.loadManifest(MANIFEST);
  const modeMap = R.loadModeMap(MODE_MAP);
  const t0 = Date.now();
  const task = {
    id: 998,
    prompt: 'synthetic good-outcome test',
    cwd: process.cwd(),
    evolution: true,
    evolution_outcome_expected: 'good',
    evolution_score_direction: 'positive',
    evolution_telemetry_mock: [
      { ts: t0, prompt_signature: 'sig-A', suggested_mode: '/gsd-debug', suggested_skills: [], suggested_agents: [], cwd: process.cwd(), prompt: '/gsd-debug thing' },
      { ts: t0 + 5 * 60 * 1000, prompt_signature: 'sig-B', suggested_mode: '/gsd-debug', suggested_skills: [], suggested_agents: [], cwd: process.cwd(), prompt: 'looks good, thanks' },
    ],
    right: { mode: '/gsd-debug', skills: ['systematic-debugging'], agents: [], tier: 'high', status: 'route' },
  };
  const weights = { schema_version: 2, blend: 0.15, decay_days: 14, weights: {} };
  const result = await C.evolutionRight(task, manifest, modeMap, weights);
  assert.equal(result.detail.outcome_actual, 'good',
    `expected outcome=good, got ${result.detail.outcome_actual}`);
});

// --- dryRun weights argument (integration check) -------------------------

test('dryRun: with weights argument applies the blend (weight_applied reflects learned score)', () => {
  // Call dryRun with a strong positive weight on gsd-debug. dryRun should return
  // a route whose top entry has weight_applied populated when there's a match.
  const manifest = R.loadManifest(MANIFEST);
  const modeMap = R.loadModeMap(MODE_MAP);
  // Build a weights object with a strong positive score on gsd-debug
  const weights = {
    schema_version: 2,
    blend: 0.15,
    decay_days: 14,
    weights: { 'gsd-debug': { score: 0.95, g: 10, b: 1, u: 0 } },
  };
  // Use a prompt that BM25 routes to gsd-debug via systematic-debugging skill
  // (the skill→mode mapping in dryRun resolves the top skill to its mode-map entry)
  const out = C.dryRun('fix the failing test that is broken', manifest, modeMap, process.cwd(), weights);
  assert.ok(out, 'dryRun must return an object');
  assert.equal(typeof out.tier, 'string');
  assert.ok(out.route, 'dryRun with weights must produce a route');
  assert.equal(out.route.mode, 'gsd-debug',
    `expected gsd-debug route; got ${out.route.mode} (top3=${(out.top3 || []).map(s => s.name).join(',')})`);
  // weight_applied reflects the blend; for the top entry which is the skill
  // 'systematic-debugging' (not 'gsd-debug'), the blend is a no-op (the weights
  // map is keyed by mode-map entry id, not by skill name). So we expect null
  // on the route. The contract is that dryRun never throws on weights, and
  // the route shape includes weight_applied=null as the no-blend default.
  assert.equal(out.route.weight_applied, null,
    `weight_applied should be null on the route (top entry is a skill, not a mode-map id); got ${out.route.weight_applied}`);
  // Fallback case: dryRun with empty weights should NOT throw and should NOT set weight_applied
  const out2 = C.dryRun('fix the failing test that is broken', manifest, modeMap, process.cwd(), null);
  assert.ok(out2, 'dryRun must return an object with null weights');
  if (out2.route) {
    assert.equal(out2.route.weight_applied, null,
      'weight_applied should be null when no weights are provided');
  }
  // Edge case: dryRun with weights that target a SKILL id directly (where the
  // mode-map entry's id matches a skill name) — the blend DOES kick in.
  const skillWeights = {
    schema_version: 2,
    blend: 0.15,
    decay_days: 14,
    weights: { 'systematic-debugging': { score: 0.7, g: 5, b: 0, u: 0 } },
  };
  const out3 = C.dryRun('fix the failing test that is broken', manifest, modeMap, process.cwd(), skillWeights);
  assert.ok(out3 && out3.route);
  assert.equal(out3.route.weight_applied, 0.7,
    `weight_applied should be 0.7 for skill-keyed weights; got ${out3.route.weight_applied}`);
});
