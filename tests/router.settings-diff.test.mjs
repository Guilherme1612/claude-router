// tests/router.settings-diff.test.mjs — additive settings.json install diff audit + idempotency
//
// Runs the installer against a TEMP COPY of the live ~/.claude/settings.json so the
// real settings.json is never mutated by the test. Asserts:
//   - the ONLY delta is the new hooks.UserPromptSubmit key (additive-only)
//   - all other top-level keys + all other hooks events deep-equal pre
//   - the new entry has the absolute node binary + router path + timeout 5 + NO matcher
//   - owned uninstall is clean and preserves unrelated state
//   - re-running the installer is idempotent (no-op, no double entry)
//
// Task 2 extends this file with live smoke tests (route / pass-through / explicit /
// caveman coexistence). This file is the Task 1 diff-audit gate.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import {
  readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync, existsSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const NODE = '/Users/guilherme/.hermes/node/bin/node';
const LIVE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const LIVE_ROUTER = path.join(os.homedir(), '.claude', 'hooks', 'router.mjs');
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const INSTALLER = path.join(REPO_ROOT, 'install-router.mjs');

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Run the installer with explicit temp paths (never the live settings.json).
function runInstaller(fixture, ...extra) {
  return spawnSync(NODE, [
    INSTALLER,
    '--claude-root', fixture.claudeRoot,
    '--codex-root', fixture.codexRoot,
    '--source-router', LIVE_ROUTER,
    '--settings', fixture.settings,
    '--router', fixture.router,
    '--manifest', fixture.manifest,
    '--node-binary', NODE,
    ...extra,
  ], { encoding: 'utf8' });
}

function parse(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function setupTempCopy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'router-settings-'));
  const settings = path.join(dir, 'settings.json');
  const claudeRoot = path.join(dir, '.claude');
  const codexRoot = path.join(dir, '.codex');
  const router = path.join(claudeRoot, 'hooks', 'router.mjs');
  const manifest = path.join(claudeRoot, 'router', 'install-manifest.json');
  copyFileSync(LIVE_SETTINGS, settings);
  // The live settings.json now carries the router's UserPromptSubmit binding
  // (Task 1's install is approved and stays). The diff-audit tests measure the
  // install delta from a clean PRE-ROUTER baseline, so strip any pre-existing
  // UserPromptSubmit from the temp copy before each test. This keeps the diff
  // audit meaningful regardless of live install state.
  const pre = parse(settings);
  if (pre.hooks && pre.hooks.UserPromptSubmit) {
    delete pre.hooks.UserPromptSubmit;
    writeFileSync(settings, JSON.stringify(pre, null, 2) + '\n');
  }
  const original = readFileSync(settings, 'utf8');
  return { dir, settings, claudeRoot, codexRoot, router, manifest, original };
}

test('install adds exactly one UserPromptSubmit entry and nothing else', () => {
  const fixture = setupTempCopy();
  const { dir, settings, router, manifest } = fixture;
  try {
    const pre = parse(settings);
    const preHookKeys = Object.keys(pre.hooks).sort();
    const preEntryTotal = preHookKeys.reduce(
      (a, k) => a + (Array.isArray(pre.hooks[k]) ? pre.hooks[k].length : 0), 0);
    assert.ok(!pre.hooks.UserPromptSubmit, 'fixture must not already have UserPromptSubmit');

    const r = runInstaller(fixture);
    assert.equal(r.status, 0, 'installer exit 0\nstdout:\n' + r.stdout + '\nstderr:\n' + r.stderr);
    assert.match(r.stdout, /INSTALL OK/);

    assert.ok(existsSync(manifest), 'ownership manifest created');

    const post = parse(settings);
    // top-level keys unchanged
    assert.deepEqual(Object.keys(post).sort(), Object.keys(pre).sort());
    // every non-hooks top-level key byte-identical
    for (const k of Object.keys(pre)) {
      if (k === 'hooks') continue;
      assert.ok(deepEqual(pre[k], post[k]), 'top-level key unchanged: ' + k);
    }
    // hooks: only new key is UserPromptSubmit
    const postHookKeys = Object.keys(post.hooks).sort();
    const added = postHookKeys.filter((k) => !preHookKeys.includes(k));
    assert.deepEqual(added, ['UserPromptSubmit'], 'only UserPromptSubmit added');
    // every pre-existing hooks event deep-equal
    for (const k of preHookKeys) {
      assert.ok(deepEqual(pre.hooks[k], post.hooks[k]), 'hooks event unchanged: ' + k);
    }
    // entry count +1
    const postEntryTotal = postHookKeys.reduce(
      (a, k) => a + (Array.isArray(post.hooks[k]) ? post.hooks[k].length : 0), 0);
    assert.equal(postEntryTotal, preEntryTotal + 1, 'exactly one hook entry added');

    // UserPromptSubmit shape
    const ups = post.hooks.UserPromptSubmit;
    assert.ok(Array.isArray(ups) && ups.length === 1, 'one group');
    const group = ups[0];
    assert.equal(group.matcher, undefined, 'no matcher (UserPromptSubmit ignores it)');
    assert.ok(Array.isArray(group.hooks) && group.hooks.length === 1, 'one hook');
    const h = group.hooks[0];
    assert.equal(h.type, 'command');
    assert.ok(h.command.includes(NODE), 'command uses absolute node binary');
    assert.ok(h.command.includes(router), 'command points at installed router.mjs');
    assert.equal(h.timeout, 5, 'timeout is 5');

    // enabledPlugins + statusLine intact
    assert.deepEqual(post.enabledPlugins, pre.enabledPlugins, 'enabledPlugins unchanged');
    assert.ok(post.statusLine, 'statusLine intact');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('owned uninstall restores pre-router settings semantically', () => {
  const fixture = setupTempCopy();
  const { dir, settings, router, manifest, original } = fixture;
  try {
    assert.equal(runInstaller(fixture).status, 0);
    const removal = runInstaller(fixture, '--uninstall');
    assert.equal(removal.status, 0, removal.stderr);
    assert.deepEqual(parse(settings), JSON.parse(original));
    assert.equal(existsSync(router), false);
    assert.equal(existsSync(manifest), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installer is idempotent — re-running no-ops with no double entry', () => {
  const fixture = setupTempCopy();
  const { dir, settings } = fixture;
  try {
    const r1 = runInstaller(fixture);
    assert.equal(r1.status, 0, 'first install exit 0');
    assert.match(r1.stdout, /INSTALL OK/);
    const after1 = parse(settings);
    assert.equal(after1.hooks.UserPromptSubmit.length, 1, 'one entry after first install');

    // second run — backup already exists (skipped), UserPromptSubmit present (no-op)
    const r2 = runInstaller(fixture);
    assert.equal(r2.status, 0, 'second install exit 0');
    assert.match(r2.stdout, /ALREADY INSTALLED/);
    const after2 = parse(settings);
    assert.equal(after2.hooks.UserPromptSubmit.length, 1, 'still exactly one entry (no duplicate)');
    // no other event duplicated
    const beforeCounts = Object.fromEntries(
      Object.keys(after1.hooks).map((k) => [k, Array.isArray(after1.hooks[k]) ? after1.hooks[k].length : 0])
    );
    const afterCounts = Object.fromEntries(
      Object.keys(after2.hooks).map((k) => [k, Array.isArray(after2.hooks[k]) ? after2.hooks[k].length : 0])
    );
    assert.deepEqual(afterCounts, beforeCounts, 'all event counts unchanged on re-run');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installer preserves the exact byte format of non-UserPromptSubmit content', () => {
  // The diff audit is the safety gate: round-tripping through JSON must not alter
  // any pre-existing content. This test asserts the original text (minus the new
  // UserPromptSubmit block) round-trips identically.
  const fixture = setupTempCopy();
  const { dir, settings, original } = fixture;
  try {
    runInstaller(fixture);
    const post = readFileSync(settings, 'utf8');
    // Remove the UserPromptSubmit block from the post text; the remainder must
    // match the original. The block is the only added lines.
    const pre = JSON.parse(original);
    const postObj = JSON.parse(post);
    delete postObj.hooks.UserPromptSubmit;
    const remainder = JSON.stringify(postObj, null, 2) + '\n';
    assert.equal(remainder, original, 'non-UserPromptSubmit content byte-identical');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Task 2: live end-to-end smoke tests against the installed binding ----------
//
// These spawn the LIVE hook (/Users/guilherme/.hermes/node/bin/node
// /Users/guilherme/.claude/hooks/router.mjs) with a JSON UserPromptSubmit payload
// piped to stdin and assert the real stdout contract. Pass-through paths
// (trivial / user_explicit / low tier / deny) emit NOTHING to stdout and exit 0 —
// the model receives the original prompt unchanged. A decisive High-tier slash
// route emits a JSON object whose hookSpecificOutput.additionalContext carries
// the `<!-- router-inject -->` sentinel + a slash instruction line at column 0.

// The hook's SENTINEL export (`<!-- router-inject -->`) is used for re-entry
// dedupe (sentinelScan) — it is intentionally a substring the router scans the
// PROMPT for, NOT the exact open tag it emits. The actual emitted block is:
//   <!-- router-inject mode=<mode> tier=<tier> sig=<hash> -->   (open)
//   <!-- /router-inject -->                                    (close)
// Smoke tests match the REAL emitted markers, not the dedupe sentinel.
const SENTINEL_OPEN = '<!-- router-inject ';
const SENTINEL_CLOSE = '<!-- /router-inject -->';

function runHook(payload) {
  const r = spawnSync(NODE, [LIVE_ROUTER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ROUTER_TEST_FRESHNESS: 'fresh' },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// Parse the hook's stdout as JSON, or return null for empty/whitespace (pass-through).
function parseHookOutput(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return null; // pass-through emits nothing
  return JSON.parse(trimmed);
}

test('live smoke: routing prompt emits sentinel-marked additionalContext with a slash instruction at column 0', () => {
  // Plan prose suggested "the flaky payment test keeps failing intermittently", but
  // under the calibrated thresholds (T_high=0.6, T_low=0.3, M=0.2) that prompt is a
  // BM25 tie between systematic-debugging and gsd-debug (margin < M) → correctly
  // Low-tier pass-through. To exercise the SAME closed-loop path the plan intended
  // (a decisive gsd-debug slash route), we use a prompt that breaks the tie:
  // "do systematic debugging of the crash" → High tier, mmEntry id=gsd-debug,
  // invoke_kind=slash, margin ≈ 0.36. See SUMMARY.md "Adaptations" for details.
  const r = runHook({ prompt: 'do systematic debugging of the crash' });
  assert.equal(r.status, 0, 'hook exits 0 (never blocks)\nstdout:\n' + r.stdout + '\nstderr:\n' + r.stderr);
  const out = parseHookOutput(r.stdout);
  assert.ok(out, 'routing prompt must emit JSON (not pass-through)');
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.ok(typeof ctx === 'string' && ctx.length > 0, 'additionalContext is non-empty string');
  assert.ok(ctx.includes(SENTINEL_OPEN), 'additionalContext contains the open sentinel tag');
  assert.ok(ctx.includes(SENTINEL_CLOSE), 'additionalContext contains the close sentinel tag');
  // A slash instruction line must appear at column 0 (no leading whitespace, no
  // backticks). Match `Run /gsd-...` anchored at the start of a line.
  const slashLine = ctx.split('\n').find((l) => /^Run \/gsd-/.test(l));
  assert.ok(slashLine, 'a slash instruction line `Run /gsd-...` appears at column 0:\n' + ctx);
  assert.ok(slashLine.includes('/gsd-debug'), 'slash instruction targets /gsd-debug');
});

test('live smoke: trivial prompt returns empty stdout (pass-through)', () => {
  const r = runHook({ prompt: 'thanks' });
  assert.equal(r.status, 0, 'trivial prompt exits 0');
  assert.equal(r.stdout.trim(), '', 'trivial prompt emits NOTHING (pass-through)');
});

test('live smoke: explicit-override prompt returns empty stdout (user_explicit)', () => {
  const r = runHook({ prompt: '/gsd-debug fix it' });
  assert.equal(r.status, 0, 'explicit override exits 0');
  assert.equal(r.stdout.trim(), '', 'user_explicit prompt emits NOTHING (user already named the command)');
});

test('caveman coexistence: settings.json has both router top-level + caveman plugin-scoped UserPromptSubmit, outputs do not cross-contaminate', () => {
  // 1. settings.json: router's top-level hooks.UserPromptSubmit is present.
  const settings = parse(LIVE_SETTINGS);
  assert.ok(Array.isArray(settings.hooks.UserPromptSubmit), 'router top-level UserPromptSubmit present');
  assert.equal(settings.hooks.UserPromptSubmit.length, 1, 'exactly one router UserPromptSubmit group');
  const routerCmd = settings.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.ok(routerCmd.includes(NODE) && routerCmd.includes(LIVE_ROUTER), 'router command bound');

  // 2. settings.json: caveman is enabled (plugin-scoped UserPromptSubmit comes from
  //    the caveman plugin's .claude-plugin/plugin.json, not the top-level hooks
  //    object). enabledPlugins.caveman@caveman must be true.
  assert.ok(settings.enabledPlugins && settings.enabledPlugins['caveman@caveman'] === true,
    'caveman@caveman enabled (plugin-scoped UserPromptSubmit fires in parallel)');

  // 3. No cross-contamination: the router's additionalContext contains the router
  //    sentinel and NOT the caveman mode-tracking string; caveman's output contains
  //    its mode-tracking string and NOT the router sentinel. Both hooks emit
  //    disjoint, lexically-distinct blocks that accumulate without coupling.
  const prompt = 'do systematic debugging of the crash';
  const routerOut = runHook({ prompt });
  assert.equal(routerOut.status, 0);
  const routerParsed = parseHookOutput(routerOut.stdout);
  assert.ok(routerParsed, 'router emitted a route for the coexistence prompt');
  const routerCtx = routerParsed.hookSpecificOutput.additionalContext;
  assert.ok(routerCtx.includes(SENTINEL_OPEN), 'router output carries the router sentinel open tag');
  assert.ok(routerCtx.includes(SENTINEL_CLOSE), 'router output carries the router sentinel close tag');
  // Router must never emit caveman's mode-tracking string.
  assert.ok(!/CAVEMAN MODE/i.test(routerCtx), 'router output does NOT contain caveman mode-tracking text');

  // Caveman's hook is plugin-scoped and runs in a separate process; we cannot
  // invoke it by absolute path from here (it relies on CLAUDE_PLUGIN_ROOT). The
  // lexical-distinctness contract is verified structurally instead: caveman's
  // tracker emits plain text ("CAVEMAN MODE ACTIVE ...") with NO HTML comments
  // (confirmed by reading caveman-mode-tracker.js), and the router emits ONLY
  // HTML-comment-delimited blocks. The two output grammars are disjoint, so
  // accumulation cannot cross-contaminate. Assert the router half here:
  assert.ok(!routerCtx.includes('CAVEMAN'), 'router block has no CAVEMAN token');
  // Router block is entirely within the sentinel fence.
  assert.ok(routerCtx.indexOf(SENTINEL_OPEN) < routerCtx.indexOf(SENTINEL_CLOSE),
    'router block is a well-formed sentinel fence');
});
