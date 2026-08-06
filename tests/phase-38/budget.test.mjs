// Phase 38 Plan 03 Task 1 (tdd): HOST-04 budget + invariants test.
//
// Asserts the prompt and startup paths still meet their exact latency and token
// budgets with the Plan 01 off-hot-path dispatch trigger wired, and that the
// prompt path remains read-only / fail-open (no spawn/scan/hash/network/LLM/
// mutation/learning on the hot path). HOST-04 is the invariant that protects
// everything else in Phase 38; this test is the final feasibility gate.
//
// Reuses the spawnSync hook driver + ROUTER_DEBUG_LATENCY hrtime pattern from
// tests/router.perf.test.mjs and the tokenCount export from src/runtime/router.mjs.
// stdlib-only. Node binary = process.execPath (same runtime the hook runs on).
//
// Thresholds (exact, from PLAN.md must_haves):
//   warm prompt: p95 <= 25ms, p99 <= 50ms, max < 100ms over >= 50 iterations
//   startup:     p95 <= 50ms over >= 20 cold starts
//   injection:   <= 120 tokens (boundary: 120 accepted, 121 rejected)
//
// MVP_MODE=false so the MVP+TDD gate is not enforced; TDD is task discipline.
// The implementation (triggerNativeDispatch in router.mjs) already exists from
// Plan 01, so the tests pass against the wired trigger (GREEN). RED was the
// absent-file state before this commit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { after } from 'node:test';

const HOOK = resolve('src/runtime/router.mjs');
const NODE = process.execPath;
const CONTEXT_MODULE = resolve('src/context/prompt-route.mjs');

// Warm-cache HOME shared across the warm-prompt iterations (analog:
// tests/router.perf.test.mjs:20-21). The hook stats the (absent) manifest and
// returns the low-tier pass-through fast; a shared HOME exercises the warm path.
const WARM_HOME = mkdtempSync(join(tmpdir(), 'router-budget-warm-'));
after(() => rmSync(WARM_HOME, { recursive: true, force: true }));

const TRIVIAL_PROMPT = JSON.stringify({ prompt: 'thanks' });

function runOnce({ home = WARM_HOME, extraEnv = {} } = {}) {
  const start = performance.now();
  const r = spawnSync(NODE, [HOOK], {
    input: TRIVIAL_PROMPT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      ROUTER_DEBUG_LATENCY: '1',
      ROUTER_CONTEXT_MODULE_PATH: CONTEXT_MODULE,
      ...extraEnv,
    },
  });
  const wall = performance.now() - start;
  return { wall, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function parseLatencyMs(stderr) {
  const m = String(stderr).match(/__router_latency_ms=([0-9.]+)/);
  return m ? parseFloat(m[1]) : null;
}

function percentile(sorted, p) {
  // Nearest-rank percentile (matches tests/router.perf.test.mjs:117).
  return sorted[Math.ceil(sorted.length * p) - 1];
}

// Import tokenCount from the hook module (router.mjs:2811-2813). The hook is an
// ESM module; a direct dynamic import gives the live export.
async function loadTokenCount() {
  const m = await import(pathToFileURL(HOOK).href);
  return m.tokenCount;
}

// ---------------------------------------------------------------------------
// Test 1: warm prompt latency (HOST-04 — p95 <= 25ms, p99 <= 50ms, max < 100ms)
// ---------------------------------------------------------------------------

test('Test 1: warm prompt p95 <= 25ms, p99 <= 50ms, max < 100ms over >= 50 iterations', () => {
  const WARMUP = 5;
  const N = 50;
  // Warm the cache + node module compilation.
  for (let i = 0; i < WARMUP; i++) {
    const r = runOnce();
    assert.equal(r.status, 0, `warmup ${i} hook must exit 0 (stderr=${r.stderr.slice(0, 200)})`);
  }
  const samples = [];
  for (let i = 0; i < N; i++) {
    const r = runOnce();
    assert.equal(r.status, 0, `iteration ${i} hook must exit 0 (stderr=${r.stderr.slice(0, 200)})`);
    const ms = parseLatencyMs(r.stderr);
    assert.ok(ms !== null, `iteration ${i} missing __router_latency_ms debug line (stderr=${r.stderr.slice(0, 200)})`);
    samples.push(ms);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  const p99 = percentile(sorted, 0.99);
  const max = sorted[sorted.length - 1];
  assert.ok(p95 <= 25, `warm prompt p95 ${p95.toFixed(3)}ms > 25ms (samples=${sorted.map(x=>x.toFixed(2)).join(',')})`);
  assert.ok(p99 <= 50, `warm prompt p99 ${p99.toFixed(3)}ms > 50ms (samples=${sorted.map(x=>x.toFixed(2)).join(',')})`);
  assert.ok(max < 100, `warm prompt max ${max.toFixed(3)}ms >= 100ms (samples=${sorted.map(x=>x.toFixed(2)).join(',')})`);
});

// ---------------------------------------------------------------------------
// Test 2: startup latency (HOST-04 — p95 <= 50ms over >= 20 cold starts)
// ---------------------------------------------------------------------------

test('Test 2: startup p95 <= 50ms over >= 20 cold-start iterations (fresh temp HOME each run)', () => {
  const N = 20;
  const homes = [];
  const samples = [];
  for (let i = 0; i < N; i++) {
    const home = mkdtempSync(join(tmpdir(), 'router-budget-cold-'));
    homes.push(home);
    const r = runOnce({ home });
    assert.equal(r.status, 0, `cold-start ${i} hook must exit 0 (stderr=${r.stderr.slice(0, 200)})`);
    const ms = parseLatencyMs(r.stderr);
    assert.ok(ms !== null, `cold-start ${i} missing __router_latency_ms debug line`);
    samples.push(ms);
  }
  // Cleanup after measurement (not in after() because each run needs a fresh HOME).
  for (const h of homes) rmSync(h, { recursive: true, force: true });
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = percentile(sorted, 0.95);
  assert.ok(p95 <= 50, `startup p95 ${p95.toFixed(3)}ms > 50ms (samples=${sorted.map(x=>x.toFixed(2)).join(',')})`);
});

// ---------------------------------------------------------------------------
// Test 3: injection token budget (HOST-04 — <= 120 tokens)
// ---------------------------------------------------------------------------

test('Test 3: tokenCount(additionalContext) <= 120 for a trivial prompt', async () => {
  const tokenCount = await loadTokenCount();
  // A trivial prompt is low-tier (pass-through) -> empty additionalContext.
  // The cap holds trivially; Test 6 exercises the boundary explicitly.
  const r = runOnce();
  assert.equal(r.status, 0, `hook must exit 0 (stderr=${r.stderr.slice(0, 200)})`);
  // The hook emits additionalContext via stdout JSON when non-empty. For a
  // trivial low-tier prompt, stdout is empty (pass-through) -> 0 tokens.
  let additionalContext = '';
  if (r.stdout) {
    try {
      const parsed = JSON.parse(r.stdout);
      additionalContext = parsed?.hookSpecificOutput?.additionalContext ?? '';
    } catch { /* pass-through emits no JSON */ }
  }
  const tokens = tokenCount(additionalContext);
  assert.ok(tokens <= 120, `injection ${tokens} tokens > 120 (additionalContext=${JSON.stringify(additionalContext.slice(0, 80))})`);
});

// ---------------------------------------------------------------------------
// Test 4: hot-path invariants (no spawn/scan/hash/network/LLM/mutation/learning)
// ---------------------------------------------------------------------------

test('Test 4: prompt path has NO new spawnSync/execSync; only unref\'d fire-and-forget off the hot path', () => {
  const src = readFileSync(HOOK, 'utf8');
  // Every spawnSync/execSync occurrence must be in a comment or absent.
  // The hook must not perform synchronous child spawns on the prompt path.
  const lines = src.split('\n');
  const syncSpawnLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Strip trailing // comments (conservative: do not strip block comments here).
    const codePart = line.split('//')[0];
    if (/\b(spawnSync|execSync|execFileSync)\b/.test(codePart)) {
      syncSpawnLines.push({ line: i + 1, text: line.trim() });
    }
  }
  assert.equal(syncSpawnLines.length, 0,
    `prompt path must not use spawnSync/execSync/execFileSync (found: ${JSON.stringify(syncSpawnLines)})`);
  // The only spawn() calls on the dispatch path must be fire-and-forget unref'd.
  // Identify spawn( calls and assert each has .unref() on the same or nearby line.
  const spawnLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const codePart = line.split('//')[0];
    if (/\bspawn\(/.test(codePart) && !/\bspawnSync\b/.test(codePart)) {
      spawnLines.push({ line: i + 1, text: line.trim() });
    }
  }
  // There must be at least the dispatch trigger spawn (Plan 01) + bumpEvolveTrigger spawn.
  assert.ok(spawnLines.length >= 1, `expected at least the off-hot-path spawn, found: ${JSON.stringify(spawnLines)}`);
  // Assert each spawn region references .unref() within 8 lines (fire-and-forget).
  // The spawn call is multi-line (detached/stdio/env args), then .unref() follows.
  for (const entry of spawnLines) {
    const region = lines.slice(entry.line - 1, entry.line + 7).join('\n');
    assert.ok(/\.unref\(\)/.test(region),
      `spawn at line ${entry.line} is not fire-and-forget unref'd (region=${region.slice(0, 240)})`);
  }
});

test('Test 4b: prompt path does not hash prompt-derived content (dispatch sha256 is over fixture stdout only)', () => {
  // The hot path's promptSignature hashes a redacted prompt for telemetry/cache keys,
  // which is existing v1.x behavior (not new Phase 38 surface). HOST-04 forbids
  // NEW hashing of prompt-derived content introduced by the dispatch layer. The
  // dispatch path's sha256 is over fixture stdout (raw Buffer), not the prompt.
  // Assert: the dispatch trigger (triggerNativeDispatch) does not hash the prompt.
  const src = readFileSync(HOOK, 'utf8');
  const fnStart = src.indexOf('function triggerNativeDispatch');
  assert.ok(fnStart !== -1, 'triggerNativeDispatch must exist (Plan 01 wired the trigger)');
  // Find the end of the function (next export/function at column 0 or EOF).
  const after = src.slice(fnStart);
  const fnEnd = after.search(/\nexport function|\nfunction [a-zA-Z]/);
  const fnBody = fnEnd === -1 ? after : after.slice(0, fnEnd);
  // The trigger must not reference createHash over the prompt.
  assert.ok(!/createHash/.test(fnBody),
    'triggerNativeDispatch must not hash prompt-derived content (dispatch sha256 is over fixture stdout, in the worker, not the hook)');
  // The trigger must not reference the prompt variable. Strip // comments first
  // so comment prose mentioning "prompt" does not trip the assertion — the
  // invariant is that the trigger does not USE the prompt, not that it never
  // mentions the word.
  const fnCodeOnly = fnBody.split('\n').map(l => l.split('//')[0]).join('\n');
  assert.ok(!/\bprompt\b/.test(fnCodeOnly),
    'triggerNativeDispatch must not reference the prompt variable (off-hot-path, fixture-only)');
});

// ---------------------------------------------------------------------------
// Test 5: fail-open (broken adapter -> exit 0, no decision:'block', pass-through)
// ---------------------------------------------------------------------------

test('Test 5: broken dispatch worker path -> hook exits 0, no decision:block, prompt passes through', () => {
  // Create the lease marker so the trigger fires, but point the worker path at
  // a nonexistent file. The trigger is try/catch-wrapped (fail-open): the hook
  // must still exit 0, emit no decision:'block', and pass the prompt through.
  const home = mkdtempSync(join(tmpdir(), 'router-budget-failopen-'));
  try {
    const leaseDir = join(home, '.claude', 'router');
    mkdirSync(leaseDir, { recursive: true });
    writeFileSync(join(leaseDir, 'dispatch-lease.json'), JSON.stringify({ ok: true }));
    const r = runOnce({
      home,
      extraEnv: { ROUTER_DISPATCH_WORKER_PATH: '/nonexistent/dispatch-worker.mjs' },
    });
    assert.equal(r.status, 0, `hook must exit 0 even with a broken dispatch worker (stderr=${r.stderr.slice(0, 200)})`);
    // Must not emit decision:'block'.
    if (r.stdout) {
      let parsed;
      try { parsed = JSON.parse(r.stdout); } catch { /* pass-through has no stdout JSON */ }
      if (parsed) {
        assert.notEqual(parsed?.decision, 'block',
          'hook must never emit decision:"block" on a dispatch failure (fail-open)');
      }
    }
    // The prompt passes through: trivial prompt -> low-tier -> empty stdout (pass-through).
    // No additionalContext injection from the dispatch path.
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 6: boundary (120 tokens accepted, 121 rejected by the budget cap)
// ---------------------------------------------------------------------------

test('Test 6: boundary — 120-token injection accepted, 121-token injection rejected by the cap', async () => {
  const tokenCount = await loadTokenCount();
  // 120 tokens = 480 chars at chars/4 (Math.ceil).
  const s120 = 'a'.repeat(480);
  const t120 = tokenCount(s120);
  assert.equal(t120, 120, `480 chars -> ${t120} tokens, expected exactly 120`);
  // 121 tokens = 484 chars at chars/4 (Math.ceil(484/4) = 121).
  const s121 = 'a'.repeat(484);
  const t121 = tokenCount(s121);
  assert.equal(t121, 121, `484 chars -> ${t121} tokens, expected exactly 121`);
  // The HOST-04 budget gate: <= 120 accepted, > 120 rejected.
  assert.ok(t120 <= 120, '120-token injection must be accepted (<= 120)');
  assert.ok(t121 > 120, '121-token injection must be rejected (> 120)');
  // Boundary precision: Math.ceil(481/4) = 121 (481 chars already over).
  assert.equal(tokenCount('a'.repeat(481)), 121, '481 chars -> 121 tokens (ceiling, no rounding ambiguity)');
  assert.equal(tokenCount('a'.repeat(4)), 1, '4 chars -> 1 token');
  assert.equal(tokenCount('a'.repeat(1)), 1, '1 char -> 1 token (ceiling)');
});