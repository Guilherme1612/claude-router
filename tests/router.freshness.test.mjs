// Task 1 (RED): Manifest freshness pass-through for router.mjs.
// Asserts checkFreshness() returns manifest_missing | stale(+exact reminder) |
// fresh, and the hook emits the one-line HTML-comment reminder only when stale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const NODE = '/Users/guilherme/.hermes/node/bin/node';

const EXPECTED_REMINDER = '<!-- router: manifest may be stale — run: node ~/.claude/router/build-manifest.mjs -->';
const EXPECTED_COVERAGE_REMINDER = '<!-- router: coverage report may be stale — run: node ~/.claude/router/build-manifest.mjs -->';

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-freshness-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

async function importHook() {
  return await import(HOOK);
}

test('checkFreshness: missing manifest -> status manifest_missing, no reminder', async () => {
  const m = await importHook();
  withTempDir((dir) => {
    const manifest = join(dir, 'no-such-manifest.json');
    const buildScript = join(dir, 'no-such-build.py');
    const r = m.checkFreshness(manifest, buildScript);
    assert.equal(r.status, 'manifest_missing');
    assert.equal(r.reminder, undefined);
  });
});

test('checkFreshness: builder newer than manifest -> stale + exact reminder', async () => {
  const m = await importHook();
  withTempDir((dir) => {
    const manifest = join(dir, 'manifest.json');
    const buildScript = join(dir, 'build-manifest.mjs');
    writeFileSync(manifest, '{}');
    writeFileSync(buildScript, '// builder');
    const oldMs = Date.now() - 10_000;
    const newMs = Date.now();
    utimesSync(manifest, new Date(oldMs), new Date(oldMs));
    utimesSync(buildScript, new Date(newMs), new Date(newMs));
    const r = m.checkFreshness(manifest, buildScript);
    assert.equal(r.status, 'stale');
    assert.equal(r.reminder, EXPECTED_REMINDER);
  });
});

test('checkFreshness: manifest mtime older than 7 days -> stale + exact reminder', async () => {
  const m = await importHook();
  withTempDir((dir) => {
    const manifest = join(dir, 'manifest.json');
    const buildScript = join(dir, 'build-manifest.mjs');
    writeFileSync(manifest, '{}');
    writeFileSync(buildScript, '// builder');
    const veryOld = Date.now() - (8 * 24 * 3600 * 1000);
    const older = Date.now() - (9 * 24 * 3600 * 1000);
    utimesSync(manifest, new Date(veryOld), new Date(veryOld));
    utimesSync(buildScript, new Date(older), new Date(older));
    const r = m.checkFreshness(manifest, buildScript);
    assert.equal(r.status, 'stale');
    assert.equal(r.reminder, EXPECTED_REMINDER);
  });
});

test('checkFreshness: fresh manifest (recent, builder older) -> fresh, no reminder', async () => {
  const m = await importHook();
  withTempDir((dir) => {
    const manifest = join(dir, 'manifest.json');
    const buildScript = join(dir, 'build-manifest.mjs');
    writeFileSync(manifest, '{}');
    writeFileSync(buildScript, '// builder');
    const now = Date.now();
    const older = Date.now() - 100_000;
    utimesSync(manifest, new Date(now), new Date(now));
    utimesSync(buildScript, new Date(older), new Date(older));
    const r = m.checkFreshness(manifest, buildScript);
    assert.equal(r.status, 'fresh');
    assert.equal(r.reminder, undefined);
  });
});

test('checkFreshness: default args use real ~/.claude/router/ paths (smoke)', async () => {
  const m = await importHook();
  // Should not throw; returns one of the known statuses.
  const r = m.checkFreshness();
  assert.ok(['fresh', 'stale', 'manifest_missing', 'error'].includes(r.status));
});

test('checkCoverageFreshness: missing, older, equal, newer, and stat errors are fail-open', async () => {
  const m = await importHook();
  withTempDir((dir) => {
    const manifest = join(dir, 'manifest.json');
    const report = join(dir, 'coverage-report.json');
    writeFileSync(manifest, '{}');

    assert.deepEqual(m.checkCoverageFreshness(manifest, report), {
      status: 'missing', reminder: EXPECTED_COVERAGE_REMINDER,
    });

    writeFileSync(report, '{}');
    const now = Date.now();
    utimesSync(report, new Date(now - 10_000), new Date(now - 10_000));
    utimesSync(manifest, new Date(now), new Date(now));
    assert.deepEqual(m.checkCoverageFreshness(manifest, report), {
      status: 'stale', reminder: EXPECTED_COVERAGE_REMINDER,
    });

    utimesSync(report, new Date(now), new Date(now));
    assert.deepEqual(m.checkCoverageFreshness(manifest, report), { status: 'fresh' });
    utimesSync(report, new Date(now + 10_000), new Date(now + 10_000));
    assert.deepEqual(m.checkCoverageFreshness(manifest, report), { status: 'fresh' });

    assert.deepEqual(m.checkCoverageFreshness(join(dir, 'missing-manifest'), report), {
      status: 'error', reminder: EXPECTED_COVERAGE_REMINDER,
    });
  });
});

function runHook(stdinStr) {
  const r = spawnSync(NODE, [HOOK], { input: stdinStr, encoding: 'utf8', env: process.env });
  return { status: r.status, stdout: r.stdout ?? '' };
}

test('hook subprocess: stale manifest emits exactly the one-line HTML-comment reminder', () => {
  // Use ROUTER_TEST_FRESHNESS env to force a stale verdict without touching the
  // real manifest on disk. The hook honors this only for tests.
  const r = spawnSync(NODE, [HOOK], {
    input: JSON.stringify({ prompt: 'real prompt that is not trivial' }),
    encoding: 'utf8',
    env: { ...process.env, ROUTER_TEST_FRESHNESS: 'stale' },
  });
  assert.equal(r.status, 0);
  const out = r.stdout ? JSON.parse(r.stdout) : null;
  assert.ok(out, 'expected stdout when stale');
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(out.hookSpecificOutput.additionalContext, EXPECTED_REMINDER);
});

test('hook subprocess: missing manifest emits nothing (pass-through)', () => {
  const r = spawnSync(NODE, [HOOK], {
    input: JSON.stringify({ prompt: 'real prompt that is not trivial' }),
    encoding: 'utf8',
    env: { ...process.env, ROUTER_TEST_FRESHNESS: 'manifest_missing' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('hook subprocess: fresh manifest emits nothing (pass-through)', () => {
  const r = spawnSync(NODE, [HOOK], {
    input: JSON.stringify({ prompt: 'real prompt that is not trivial' }),
    encoding: 'utf8',
    env: { ...process.env, ROUTER_TEST_FRESHNESS: 'fresh' },
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('hook subprocess: stale coverage appends one reminder without blocking route context', () => {
  const r = spawnSync(NODE, [HOOK], {
    input: JSON.stringify({ prompt: 'debug this failing authentication test and find the root cause' }),
    encoding: 'utf8',
    env: {
      ...process.env,
      ROUTER_TEST_FRESHNESS: 'fresh',
      ROUTER_TEST_COVERAGE_FRESHNESS: 'stale',
    },
  });
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  const context = out.hookSpecificOutput.additionalContext;
  assert.match(context, /router-inject/);
  assert.equal(context.match(/coverage report may be stale/g)?.length, 1);
  assert.equal(out.decision, undefined);
});
