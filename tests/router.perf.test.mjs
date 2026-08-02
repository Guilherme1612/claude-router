// Task 3: Performance gate — warm end-to-end < 100ms (HOOK-04 / D-06).
// Spawns the hook 5 times with a trivial prompt (so the pass-through path
// runs, including the manifest freshness stat against the real 208KB file)
// and asserts each run's wall-clock is < 100ms. The hook's own hrtime delta is
// exposed via a stderr debug line guarded by ROUTER_DEBUG_LATENCY so this test
// can also assert the in-process latency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';

const HOOK = resolve('src/runtime/router.mjs');
const CONTEXT_MODULE = resolve('src/context/prompt-route.mjs');
const NODE = process.execPath;
const TEST_HOME = mkdtempSync(join(tmpdir(), 'router-perf-home-'));
after(() => rmSync(TEST_HOME, { recursive: true, force: true }));
const TRIVIAL_PROMPT = JSON.stringify({ prompt: 'thanks' });
const BUDGET_MS = 100;
// A fresh Node subprocess includes startup and host contention. Keep the
// product gate on the hook's own clock while allowing bounded process overhead.
const WALL_BUDGET_MS = 250;

function runOnce() {
  const start = performance.now();
  const r = spawnSync(NODE, [HOOK], {
    input: TRIVIAL_PROMPT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: TEST_HOME,
      ROUTER_DEBUG_LATENCY: '1',
      ROUTER_CONTEXT_MODULE_PATH: CONTEXT_MODULE,
    },
  });
  const wall = performance.now() - start;
  return { wall, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('5/5 trivial-prompt invocations stay within the subprocess wall budget', () => {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(runOnce());
  for (const r of runs) {
    assert.equal(r.status, 0, 'hook must exit 0');
    assert.equal(r.stdout, '', 'trivial prompt must pass through with no stdout');
  }
  const walls = runs.map(r => r.wall);
  for (const w of walls) {
    assert.ok(w < WALL_BUDGET_MS,
      `pass-through took ${w.toFixed(2)}ms >= ${WALL_BUDGET_MS}ms (runs=${walls.map(x=>x.toFixed(1)).join(',')})`);
  }
});

test('hook reports its own in-process latency < 100ms via ROUTER_DEBUG_LATENCY', () => {
  const r = runOnce();
  assert.equal(r.status, 0);
  // The debug line looks like: __router_latency_ms=<number>
  const m = r.stderr.match(/__router_latency_ms=([0-9.]+)/);
  assert.ok(m, `expected __router_latency_ms debug line on stderr, got: ${JSON.stringify(r.stderr)}`);
  const ms = parseFloat(m[1]);
  assert.ok(ms < BUDGET_MS, `hook self-reported latency ${ms}ms >= ${BUDGET_MS}ms`);
});

test('wall-clock stays bounded and self-reported latency is < 100ms across 5 runs', () => {
  for (let i = 0; i < 5; i++) {
    const r = runOnce();
    assert.equal(r.status, 0);
    assert.ok(r.wall < WALL_BUDGET_MS, `run ${i+1} wall ${r.wall.toFixed(2)}ms >= budget`);
    const m = r.stderr.match(/__router_latency_ms=([0-9.]+)/);
    assert.ok(m, `run ${i+1} missing debug line`);
    assert.ok(parseFloat(m[1]) < BUDGET_MS, `run ${i+1} self-latency ${m[1]}ms >= budget`);
  }
});

// Helper-level counterpart to the e2e gate below. This isolates the pure resolver
// cost with a confident intent and an active runtime's present capabilities.
test('helper: pure resolveSlashRoute stays within budget (warm p95 < 40ms, max < 100ms)', () => {
  const entry = {
    id: 'debug-capability',
    invoke_kind: 'slash',
    mode: 'gsd-debug',
    resolve: [
      { name: 'gsd-debug', weight: 1.0 },
      { name: 'systematic-debugging', weight: 0.9 },
    ],
  };
  const manifest = {
    commands: [],
    runtime_commands: { claude: ['gsd-debug', 'gsd-plan-phase'], codex: ['systematic-debugging'] },
  };
  const ITERATIONS = 30;
  const WARMUP = 5;
  const code = [
    `const m = await import(${JSON.stringify(pathToFileURL(HOOK).href)});`,
    `const entry = ${JSON.stringify(entry)};`,
    `const manifest = ${JSON.stringify(manifest)};`,
    `for (let i = 0; i < ${WARMUP}; i++) m.resolveSlashRoute(entry, manifest);`,
    `const times = [];`,
    `for (let i = 0; i < ${ITERATIONS}; i++) { const s = performance.now(); m.resolveSlashRoute(entry, manifest); times.push(performance.now() - s); }`,
    `process.stdout.write(JSON.stringify(times));`,
  ].join('\n');
  const r = spawnSync(NODE, ['--input-type=module', '-e', code], {
    env: { ...process.env, HOME: TEST_HOME, ROUTER_RUNTIME: 'claude' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(r.status, 0, `resolve probe must exit 0 (${r.stderr})`);
  let times;
  try { times = JSON.parse(r.stdout.trim()); } catch { assert.fail(`stdout must be pure timing JSON, got: ${JSON.stringify(r.stdout)}`); }
  assert.equal(r.stdout.trim(), JSON.stringify(times), 'stdout carries only the timing JSON — no dead stdout');
  assert.ok(times.length >= 20, `expected >= 20 warm iterations, got ${times.length}`);
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const max = sorted[sorted.length - 1];
  assert.ok(p95 < 40, `resolve warm p95 ${p95.toFixed(3)}ms >= 40ms (times=${times.map(x=>x.toFixed(2)).join(',')})`);
  assert.ok(max < BUDGET_MS, `resolve max ${max.toFixed(3)}ms >= ${BUDGET_MS}ms`);
});

test('e2e: inspectDecision resolve-first hot path reaches render within budget', () => {
  const runtimeManifest = {
    commands: [{ name: 'gsd-debug', description: 'debug this issue' }],
    runtime_commands: {
      claude: ['gsd-debug'],
      codex: ['systematic-debugging'],
    },
    skills: [],
    plugin_skills: [],
    agents_store_skills: [],
    agents: [],
  };
  const modeMap = {
    schema_version: 4,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [{
      id: 'debug-capability',
      invoke_kind: 'slash',
      mode: 'gsd-debug',
      resolve: [
        { name: 'gsd-debug', weight: 1.0 },
        { name: 'systematic-debugging', weight: 0.98 },
      ],
      signal_patterns: ['debug'],
      recommended_skills: [],
      recommended_agents: [],
    }],
  };
  const ITERATIONS = 30;
  const WARMUP = 5;
  const code = [
    `const m = await import(${JSON.stringify(pathToFileURL(HOOK).href)});`,
    `const { mkdtempSync, rmSync } = await import('node:fs');`,
    `const { tmpdir } = await import('node:os');`,
    `const { join } = await import('node:path');`,
    `const manifest = ${JSON.stringify(runtimeManifest)};`,
    `const modeMap = ${JSON.stringify(modeMap)};`,
    `const cacheDir = mkdtempSync(join(tmpdir(), 'router-perf-'));`,
    `const cachePath = join(cacheDir, 'cache.json');`,
    `try {`,
    `  const options = { manifest, modeMap, weights: null, cachePath, cwd: cacheDir, mutateCache: true, logTelemetry: false, emitInjection: false, includePrompt: false };`,
    `  const assertRendered = (out) => { if (!out?.selected_route || out.selected_route.resolved_slash !== 'gsd-debug' || !out.final_injected_context?.trim() || !Array.isArray(out.guards_fired)) throw new Error('resolve-first hot path did not reach route render'); };`,
    `  const firstWarm = m.inspectDecision('debug this issue', options);`,
    `  assertRendered(firstWarm);`,
    `  if (firstWarm.cache.status !== 'miss') throw new Error('first warm iteration did not score and populate the cache');`,
    `  for (let i = 1; i < ${WARMUP}; i++) { const out = m.inspectDecision('debug this issue', options); assertRendered(out); if (out.cache.status !== 'hit') throw new Error('warmup did not reach the cache-hit path'); }`,
    `  const times = [];`,
    `  for (let i = 0; i < ${ITERATIONS}; i++) {`,
    `    const start = performance.now();`,
    `    const out = m.inspectDecision('debug this issue', options);`,
    `    times.push(performance.now() - start);`,
    `    assertRendered(out);`,
    `    if (out.cache.status !== 'hit') throw new Error('warm hot path did not use the cache');`,
    `  }`,
    `  process.stderr.write('__router_e2e_rendered=1');`,
    `  process.stdout.write(JSON.stringify(times));`,
    `} finally { rmSync(cacheDir, { recursive: true, force: true }); }`,
  ].join('\n');
  const r = spawnSync(NODE, ['--input-type=module', '-e', code], {
    env: { ...process.env, ROUTER_RUNTIME: 'claude' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(r.status, 0, `e2e hot-path probe must exit 0 (${r.stderr})`);
  assert.match(r.stderr, /__router_e2e_rendered=1/, 'probe must prove route rendering was reached');
  let times;
  try { times = JSON.parse(r.stdout.trim()); } catch { assert.fail(`stdout must be pure timing JSON, got: ${JSON.stringify(r.stdout)}`); }
  assert.equal(r.stdout.trim(), JSON.stringify(times), 'stdout carries only the timing JSON — no dead stdout');
  assert.ok(times.length >= 20, `expected >= 20 warm iterations, got ${times.length}`);
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const max = sorted[sorted.length - 1];
  assert.ok(p95 < 40, `e2e hot-path warm p95 ${p95.toFixed(3)}ms >= 40ms (times=${times.map(x => x.toFixed(2)).join(',')})`);
  assert.ok(max < BUDGET_MS, `e2e hot-path max ${max.toFixed(3)}ms >= ${BUDGET_MS}ms`);
});
