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