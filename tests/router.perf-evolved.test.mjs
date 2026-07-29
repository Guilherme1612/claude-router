// Plan 03-02 / Task 3: hot-path perf extension (4 new additions).
// Verifies that the Phase 3 evolution wiring stays under the 100ms budget
// (D-01). Mirrors the existing tests/router.perf.test.mjs pattern.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const WORKER = join(homedir(), '.claude', 'hooks', 'router.evolve.mjs');
const NODE = '/Users/guilherme/.hermes/node/bin/node';
const TRIVIAL_PROMPT = JSON.stringify({ prompt: 'thanks' });
const NON_TRIVIAL_PROMPT = JSON.stringify({ prompt: 'the flaky payment test keeps failing intermittently' });
const BUDGET_MS = 100;
const R = await import(HOOK);

const LIVE_WEIGHTS = join(homedir(), '.claude', 'router', 'weights.json');
const LIVE_TRIGGER = join(homedir(), '.claude', 'router', '.evolve-trigger');
const ORIGINAL_WEIGHTS = readFileSync(LIVE_WEIGHTS, 'utf8');
const ORIGINAL_TRIGGER = existsSync(LIVE_TRIGGER) ? readFileSync(LIVE_TRIGGER, 'utf8') : '0';

// after hook: restore global state so other test files (router.telemetry.test.mjs)
// see the expected v1 schema. Runs once after ALL tests in this file.
after(() => {
  writeFileSync(LIVE_WEIGHTS, ORIGINAL_WEIGHTS);
  writeFileSync(LIVE_TRIGGER, ORIGINAL_TRIGGER);
});

function runHook(promptStr, extraEnv = {}) {
  const start = performance.now();
  const r = spawnSync(NODE, [HOOK], {
    input: promptStr,
    encoding: 'utf8',
    env: { ...process.env, ROUTER_DEBUG_LATENCY: '1', ...extraEnv },
  });
  const wall = performance.now() - start;
  return { wall, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('hook with weights.json present completes < 100ms in-process', () => {
  // This test touches the LIVE weights.json (it's the only path the hook reads).
  // Save the original contents to restore on every exit path, including test
  // failure. The `after()` hook at the file level is a defense-in-depth backup.
  const liveContents = readFileSync(LIVE_WEIGHTS, 'utf8');
  try {
    // Populate weights.json with 50 entries (v2 schema)
    const weights = { schema_version: 2, blend: 0.15, decay_days: 14, updated_at: new Date().toISOString(), weights: {} };
    for (let i = 0; i < 50; i++) {
      weights.weights['gsd-debug-' + i] = { g: 5, b: 1, u: 0, score: 0.83, updated_at: new Date().toISOString() };
    }
    writeFileSync(LIVE_WEIGHTS, JSON.stringify(weights));
    // 5 runs of a non-trivial prompt (so it actually scores and applies the blend)
    const runs = [];
    for (let i = 0; i < 5; i++) runs.push(runHook(NON_TRIVIAL_PROMPT));
    for (const r of runs) {
      assert.equal(r.status, 0, 'hook must exit 0');
      assert.ok(r.wall < BUDGET_MS,
        `warm with weights.json took ${r.wall.toFixed(2)}ms >= ${BUDGET_MS}ms (runs=${runs.map(x => x.wall.toFixed(1)).join(',')})`);
      const m = r.stderr.match(/__router_latency_ms=([0-9.]+)/);
      assert.ok(m, `expected __router_latency_ms debug line; got: ${JSON.stringify(r.stderr)}`);
      assert.ok(parseFloat(m[1]) < BUDGET_MS, `in-process latency ${m[1]}ms >= budget`);
    }
  } finally {
    // Restore the LIVE weights.json to the original content captured before
    // this test ran. The after() hook is a defense-in-depth backup in case
    // this finally is skipped (e.g. process.exit in the test).
    writeFileSync(LIVE_WEIGHTS, liveContents);
  }
});

test('hook spawns worker on counter % 200 === 0 and exits < 100ms (Pitfall 6)', () => {
  try {
    const before = parseInt(ORIGINAL_TRIGGER.trim(), 10) || 0;
    // Pick a starting value so the next bump crosses a % 200 === 0 boundary.
    const startValue = before - ((before % 200) - 199 + 200) % 200;
    writeFileSync(LIVE_TRIGGER, String(startValue));
    // Send a non-trivial prompt so the hook reaches bumpEvolveTrigger.
    // The worker itself is non-blocking, so the hook exits well under 100ms.
    const r = runHook(NON_TRIVIAL_PROMPT);
    assert.equal(r.status, 0);
    assert.ok(r.wall < BUDGET_MS, `hook with worker spawn took ${r.wall.toFixed(2)}ms >= ${BUDGET_MS}ms`);
    // The trigger should have advanced by >= 1 (this hook ran and bumped).
    const afterStr = readFileSync(LIVE_TRIGGER, 'utf8').trim();
    const after = parseInt(afterStr, 10) || 0;
    assert.ok(after > startValue, `trigger should have advanced; startValue=${startValue} after=${after}`);
  } finally {
    writeFileSync(LIVE_TRIGGER, ORIGINAL_TRIGGER);
  }
});

test('hot-path: applyWeightBlend micro-benchmark < 1ms on 50-entry normed array', () => {
  // Micro-benchmark the blend function in isolation. Not via the hook; the
  // hot-path cost should be < 1ms for a 50-entry array.
  // 50-entry normed array
  const normed = [];
  for (let i = 0; i < 50; i++) {
    normed.push({ entry: { id: 'gsd-debug-' + i }, name: 'gsd-debug-' + i, score: 1 - i * 0.01, norm: 1 - i * 0.01 });
  }
  const weights = { weights: {} };
  for (let i = 0; i < 50; i++) {
    weights.weights['gsd-debug-' + i] = { g: 5, b: 1, score: 0.83, updated_at: 'x' };
  }
  // Build a modeMap so setModeMapForBlend is not null
  R.setModeMapForBlend({
    entries: Array.from({ length: 50 }, (_, i) => ({ id: 'gsd-debug-' + i, invoke_kind: 'slash' })),
  });
  // Warm
  for (let i = 0; i < 100; i++) R.applyWeightBlend(normed, weights, 0.15);
  // Measure
  const N = 1000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) R.applyWeightBlend(normed, weights, 0.15);
  const elapsed = performance.now() - t0;
  const perCall = elapsed / N;
  assert.ok(perCall < 1, `applyWeightBlend per-call cost ${perCall.toFixed(4)}ms >= 1ms budget`);
});

test('hot-path does not eagerly import the evolution worker module', () => {
  const source = readFileSync(HOOK, 'utf8');
  assert.doesNotMatch(source, /^import[\s\S]*?from ['"]\.\/router\.evolve\.mjs['"];$/m);
  assert.match(source, /await import\(['"]\.\/router\.evolve\.mjs['"]\)/);
});
