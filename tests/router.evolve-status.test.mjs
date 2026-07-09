// Plan 03-03 / Task 2: status subcommand tests (D-26).
// Verifies `node ~/.claude/hooks/router.evolve.mjs status` prints a one-screen
// JSON summary that is both machine-parseable (JSON.parse) and human-readable
// (a human can read it as a summary). All 3-4 tests use spawnSync against the
// canonical install path so the subcommand's own dispatch logic is exercised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.evolve.mjs');
const HOOK_URL = pathToFileURL(HOOK).href;
const NODE = process.execPath; // /Users/guilherme/.hermes/node/bin/node in user setup

// Required D-26 fields — must appear in every status output (live + sandboxed).
const REQUIRED_KEYS = [
  'total_prompts_in_last_calibration',
  'right_pick_rate',
  'weight_blend',
  'last_mutation_at',
  'mutations_applied',
  'mutations_reverted',
  'per_entry_outcomes',
  'decay_days',
];

function invokeStatus() {
  // Pass ROUTER_EVOLVE_PROJECT_DIR so the worker's path resolver falls through
  // to the real Router-build dir (which has calibration-tasks.json + manifest).
  // We rely on the live install at ~/.claude/hooks/router.evolve.mjs.
  return spawnSync(NODE, [HOOK, 'status'], {
    env: { ...process.env, ROUTER_EVOLVE_PROJECT_DIR: process.cwd() },
    encoding: 'utf8',
    timeout: 10000,
  });
}

test('status subcommand: exits 0 and prints valid JSON (live install)', () => {
  const r = invokeStatus();
  assert.equal(r.status, 0, `expected exit 0, got ${r.status} stderr=${r.stderr}`);
  // stdout must be parseable as JSON
  const trimmed = (r.stdout || '').trim();
  assert.ok(trimmed.length > 0, 'stdout must not be empty');
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    assert.fail(`status output is not valid JSON: ${trimmed.slice(0, 200)}`);
  }
  assert.equal(typeof parsed, 'object');
  assert.notEqual(parsed, null);
});

test('status subcommand: includes the documented D-26 fields (live install)', () => {
  const r = invokeStatus();
  const parsed = JSON.parse((r.stdout || '').trim());
  for (const key of REQUIRED_KEYS) {
    assert.ok(key in parsed, `status output missing required key: ${key}`);
  }
  // Spot-check field types (D-26: every field has a documented value/null/zero default)
  assert.equal(typeof parsed.total_prompts_in_last_calibration, 'number');
  // right_pick_rate is null when total=0 OR a number 0..1
  if (parsed.right_pick_rate !== null) {
    assert.equal(typeof parsed.right_pick_rate, 'number');
    assert.ok(parsed.right_pick_rate >= 0 && parsed.right_pick_rate <= 1,
      `right_pick_rate must be 0..1, got ${parsed.right_pick_rate}`);
  }
  assert.equal(typeof parsed.weight_blend, 'number');
  // last_mutation_at is an iso8601 string OR null (fresh install)
  if (parsed.last_mutation_at !== null) {
    assert.equal(typeof parsed.last_mutation_at, 'string');
  }
  assert.equal(typeof parsed.mutations_applied, 'number');
  assert.equal(typeof parsed.mutations_reverted, 'number');
  assert.equal(typeof parsed.per_entry_outcomes, 'object');
  assert.notEqual(parsed.per_entry_outcomes, null);
  assert.equal(typeof parsed.decay_days, 'number');
});

test('status subcommand: output is human-readable as a summary (key labels)', () => {
  const r = invokeStatus();
  const stdout = r.stdout || '';
  // The status output is a pretty-printed JSON (JSON.stringify(_, null, 2)) —
  // humans can read the keys. Assert the keys appear in the rendered text.
  for (const key of REQUIRED_KEYS) {
    assert.ok(stdout.includes(`"${key}"`), `human-readable summary missing key label: ${key}`);
  }
  // No error/warning log lines mixed into the output (clean one-screen view)
  const lines = stdout.split('\n').filter((l) => l.trim().length > 0);
  for (const l of lines) {
    // Pretty JSON lines start with `{`, `"`, `}`, `,`, or whitespace — no
    // log noise like "ERROR" / "WARN" / "FATAL".
    assert.ok(!/^(ERROR|WARN|FATAL|!!)/.test(l.trim()),
      `status output contains log noise: ${l}`);
  }
});

test('status subcommand: printStatus via import on a fresh sandbox returns nulls/zeros', async () => {
  // Use the imported `printStatus` against an empty sandbox — verifies the
  // fail-open contract: missing weights.json + missing evolution-state.json
  // → still valid JSON with documented null/zero defaults.
  const dir = mkdtempSync(join(tmpdir(), 'router-status-fresh-'));
  try {
    const mod = await import(HOOK_URL);
    const summary = await mod.printStatus({
      weights: join(dir, 'no-weights.json'),
      state: join(dir, 'no-state.json'),
      hook: join(homedir(), '.claude', 'hooks', 'router.mjs'),
    });
    assert.ok(summary);
    assert.equal(typeof summary, 'object');
    // All keys present even when files are missing
    for (const key of REQUIRED_KEYS) {
      assert.ok(key in summary, `fresh-install summary missing key: ${key}`);
    }
    // Fresh install defaults: total=0, right_pick_rate=null, mutations applied/reverted=0
    assert.equal(summary.total_prompts_in_last_calibration, 0);
    assert.equal(summary.right_pick_rate, null);
    assert.equal(summary.mutations_applied, 0);
    assert.equal(summary.mutations_reverted, 0);
    assert.equal(summary.last_mutation_at, null);
    // weight_blend defaults to 0.15 even without weights.json (the default blend)
    assert.equal(summary.weight_blend, 0.15);
    // decay_days defaults to 14
    assert.equal(summary.decay_days, 14);
    // per_entry_outcomes is an empty object
    assert.deepEqual(summary.per_entry_outcomes, {});
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});
