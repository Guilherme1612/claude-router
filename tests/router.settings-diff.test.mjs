// Synthetic settings diff audit for the public framework-neutral installer.
// No developer home, live runtime, plugin, or personal hook is read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NODE = process.execPath;
const REPO_ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const INSTALLER = join(REPO_ROOT, 'install-router.mjs');

function parse(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-settings-neutral-'));
  const claudeRoot = join(root, 'claude');
  const codexRoot = join(root, 'codex');
  const stateRoot = join(root, 'state');
  const settings = join(claudeRoot, 'settings.json');
  const codexHooks = join(codexRoot, 'hooks.json');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  writeFileSync(settings, JSON.stringify({
    theme: 'synthetic',
    hooks: { Stop: [{ managed_by: 'unrelated', hooks: [{ type: 'command', command: 'keep-me' }] }] },
  }, null, 2) + '\n');
  writeFileSync(codexHooks, JSON.stringify({ hooks: { UserPromptSubmit: [{ managed_by: 'unrelated' }] } }, null, 2) + '\n');
  return { root, claudeRoot, codexRoot, stateRoot, settings, codexHooks };
}

function runInstaller(fixture, ...extra) {
  return spawnSync(NODE, [
    INSTALLER,
    '--claude-root', fixture.claudeRoot,
    '--codex-root', fixture.codexRoot,
    '--state-root', fixture.stateRoot,
    '--node-binary', NODE,
    ...extra,
  ], { encoding: 'utf8' });
}

function cleanup(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

test('install changes only explicit runtime bindings and neutral state', () => {
  const f = fixture();
  try {
    const before = parse(f.settings);
    const result = runInstaller(f);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /INSTALL OK/);
    const after = parse(f.settings);
    assert.equal(after.theme, before.theme);
    assert.deepEqual(after.hooks.Stop[0], before.hooks.Stop[0]);
    assert.equal(after.hooks.UserPromptSubmit.length, 1);
    assert.equal(after.hooks.SessionStart.length, 1);
    assert.equal(after.hooks.Stop.length, 2);
    assert.equal(existsSync(join(f.claudeRoot, 'router')), false);
    assert.equal(existsSync(join(f.codexRoot, 'router')), false);
    assert.equal(existsSync(join(f.stateRoot, 'install-manifest.json')), true);
    assert.equal(existsSync(join(f.claudeRoot, 'hooks', 'router-neutral.mjs')), true);
    assert.equal(existsSync(join(f.codexRoot, 'hooks', 'router-neutral.mjs')), true);
  } finally {
    cleanup(f);
  }
});

test('neutral installer is idempotent and does not duplicate bindings', () => {
  const f = fixture();
  try {
    assert.equal(runInstaller(f).status, 0);
    const first = parse(f.settings);
    assert.equal(runInstaller(f).status, 0);
    const second = parse(f.settings);
    for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact']) {
      assert.equal(second.hooks[event].length, first.hooks[event].length, event);
    }
    assert.equal(second.hooks.Stop.filter(group => group.managed_by === 'unrelated').length, 1);
  } finally {
    cleanup(f);
  }
});

test('neutral uninstall restores unrelated settings and retains event history', () => {
  const f = fixture();
  try {
    const original = parse(f.settings);
    assert.equal(runInstaller(f).status, 0);
    const removal = runInstaller(f, '--uninstall');
    assert.equal(removal.status, 0, removal.stderr);
    assert.deepEqual(parse(f.settings), original);
    assert.equal(existsSync(join(f.claudeRoot, 'hooks', 'router-neutral.mjs')), false);
    assert.equal(existsSync(join(f.stateRoot, 'events.jsonl')), false);
    assert.equal(existsSync(join(f.stateRoot, 'install-manifest.json')), false);
  } finally {
    cleanup(f);
  }
});

test('neutral installer preserves exact non-hook settings values', () => {
  const f = fixture();
  try {
    const before = parse(f.settings);
    assert.equal(runInstaller(f).status, 0);
    const after = parse(f.settings);
    assert.deepEqual(after.theme, before.theme);
    assert.deepEqual(after.hooks.Stop[0], before.hooks.Stop[0]);
    assert.deepEqual(parse(f.codexHooks).hooks.UserPromptSubmit[0], { managed_by: 'unrelated' });
  } finally {
    cleanup(f);
  }
});
