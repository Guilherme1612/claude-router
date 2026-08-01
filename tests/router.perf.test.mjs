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
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const NODE = '/Users/guilherme/.hermes/node/bin/node';
const TRIVIAL_PROMPT = JSON.stringify({ prompt: 'thanks' });
const BUDGET_MS = 100;

function runOnce() {
  const start = performance.now();
  const r = spawnSync(NODE, [HOOK], {
    input: TRIVIAL_PROMPT,
    encoding: 'utf8',
    env: { ...process.env, ROUTER_DEBUG_LATENCY: '1' },
  });
  const wall = performance.now() - start;
  return { wall, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('5/5 trivial-prompt invocations complete in < 100ms wall-clock', () => {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(runOnce());
  for (const r of runs) {
    assert.equal(r.status, 0, 'hook must exit 0');
    assert.equal(r.stdout, '', 'trivial prompt must pass through with no stdout');
  }
  const walls = runs.map(r => r.wall);
  for (const w of walls) {
    assert.ok(w < BUDGET_MS,
      `warm pass-through took ${w.toFixed(2)}ms >= ${BUDGET_MS}ms (runs=${walls.map(x=>x.toFixed(1)).join(',')})`);
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

test('wall-clock and self-reported latency are both < 100ms across 5 runs (combined gate)', () => {
  for (let i = 0; i < 5; i++) {
    const r = runOnce();
    assert.equal(r.status, 0);
    assert.ok(r.wall < BUDGET_MS, `run ${i+1} wall ${r.wall.toFixed(2)}ms >= budget`);
    const m = r.stderr.match(/__router_latency_ms=([0-9.]+)/);
    assert.ok(m, `run ${i+1} missing debug line`);
    assert.ok(parseFloat(m[1]) < BUDGET_MS, `run ${i+1} self-latency ${m[1]}ms >= budget`);
  }
});

// T-32-15 resolve-first hot-path budget (ROADMAP criterion 5). The gate above only
// measures the trivial pass-through path. This gate exercises the RESOLVE path: it
// imports the shipped hook and calls resolveSlashRoute with a confident intent that
// drives a resolve-list decision (a slash entry + framework-neutral resolve list that
// resolves against the active runtime's present capabilities, per 32-02/32-03). At
// least 20 warm iterations; assert warm p95 < 40ms and every run's max < 100ms, with
// exit 0 and stdout carrying ONLY the pure timing JSON (no dead/foreign stdout).
test('resolve-heavy: resolve-first hot path stays within budget (warm p95 < 40ms, max < 100ms)', () => {
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
    env: { ...process.env, ROUTER_RUNTIME: 'claude' },
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