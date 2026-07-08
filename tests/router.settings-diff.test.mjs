// tests/router.settings-diff.test.mjs — additive settings.json install diff audit + idempotency
//
// Runs the installer against a TEMP COPY of the live ~/.claude/settings.json so the
// real settings.json is never mutated by the test. Asserts:
//   - the ONLY delta is the new hooks.UserPromptSubmit key (additive-only)
//   - all other top-level keys + all other hooks events deep-equal pre
//   - the new entry has the absolute node binary + router path + timeout 5 + NO matcher
//   - rollback (restore backup) is clean (deep-equal to original)
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
function runInstaller(settings, backup, router = LIVE_ROUTER, nodeBinary = NODE) {
  return spawnSync(NODE, [
    INSTALLER,
    '--settings', settings,
    '--backup', backup,
    '--router', router,
    '--node-binary', nodeBinary,
  ], { encoding: 'utf8' });
}

function parse(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function setupTempCopy() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'router-settings-'));
  const settings = path.join(dir, 'settings.json');
  const backup = path.join(dir, 'settings.json.pre-router');
  copyFileSync(LIVE_SETTINGS, settings);
  return { dir, settings, backup, original: readFileSync(LIVE_SETTINGS, 'utf8') };
}

test('install adds exactly one UserPromptSubmit entry and nothing else', () => {
  const { dir, settings, backup, original } = setupTempCopy();
  try {
    const pre = parse(settings);
    const preHookKeys = Object.keys(pre.hooks).sort();
    const preEntryTotal = preHookKeys.reduce(
      (a, k) => a + (Array.isArray(pre.hooks[k]) ? pre.hooks[k].length : 0), 0);
    assert.ok(!pre.hooks.UserPromptSubmit, 'fixture must not already have UserPromptSubmit');

    const r = runInstaller(settings, backup);
    assert.equal(r.status, 0, 'installer exit 0\nstdout:\n' + r.stdout + '\nstderr:\n' + r.stderr);
    assert.match(r.stdout, /INSTALL OK/);

    // backup created
    assert.ok(existsSync(backup), 'backup file created');

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
    assert.ok(h.command.includes(LIVE_ROUTER), 'command points at router.mjs');
    assert.equal(h.timeout, 5, 'timeout is 5');

    // enabledPlugins + statusLine intact
    assert.equal(Object.keys(post.enabledPlugins).length, 4, 'enabledPlugins still 4');
    assert.ok(post.statusLine, 'statusLine intact');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rollback restores the exact pre-router state', () => {
  const { dir, settings, backup, original } = setupTempCopy();
  try {
    runInstaller(settings, backup);
    assert.ok(existsSync(backup));
    // rollback: copy backup over settings
    copyFileSync(backup, settings);
    const restored = readFileSync(settings, 'utf8');
    assert.equal(restored, original, 'rollback is byte-identical to original');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('installer is idempotent — re-running no-ops with no double entry', () => {
  const { dir, settings, backup } = setupTempCopy();
  try {
    const r1 = runInstaller(settings, backup);
    assert.equal(r1.status, 0, 'first install exit 0');
    assert.match(r1.stdout, /INSTALL OK/);
    const after1 = parse(settings);
    assert.equal(after1.hooks.UserPromptSubmit.length, 1, 'one entry after first install');

    // second run — backup already exists (skipped), UserPromptSubmit present (no-op)
    const r2 = runInstaller(settings, backup);
    assert.equal(r2.status, 0, 'second install exit 0');
    assert.match(r2.stdout, /already installed/);
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
  const { dir, settings, backup, original } = setupTempCopy();
  try {
    runInstaller(settings, backup);
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