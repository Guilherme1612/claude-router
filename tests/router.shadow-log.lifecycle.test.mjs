import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installRouter, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-shadow-lifecycle-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const settingsPath = join(claudeRoot, 'settings.json');
  const sourceRouter = join(REPO_ROOT, 'src/runtime/router.mjs');
  const sourceEvolve = join(REPO_ROOT, 'src/runtime/router.evolve.mjs');
  const routerPath = join(claudeRoot, 'hooks/router.mjs');
  const manifestPath = join(claudeRoot, 'router/install-manifest.json');
  mkdirSync(claudeRoot, { recursive: true });
  const original = {
    hooks: {
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: '/existing/gsd-context-monitor' }] }],
      UserPromptExpansion: [{ hooks: [{ type: 'command', command: '/existing/ralph-loop' }] }],
      PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: '/existing/context-monitor' }] }],
      Stop: [{ hooks: [{ type: 'command', command: '/existing/ralph-loop-stop' }] }],
    },
    theme: 'preserve-me',
  };
  writeFileSync(settingsPath, JSON.stringify(original, null, 2) + '\n');
  return {
    root, settingsPath, original,
    options: {
      claudeRoot, codexRoot, sourceRouter, sourceEvolve, settingsPath, routerPath, manifestPath,
      nodeBinary: process.execPath,
      launchController(binary, args, options) {
        const child = spawn(binary, args, options);
        child.unref();
        return child;
      },
      readinessTimeoutMs: 5_000,
      readinessPollMs: 10,
    },
  };
}

test('install adds observer bindings without replacing existing hook groups', async () => {
  const f = fixture();
  try {
    const result = await installRouter(f.options);
    assert.ok(['installed', 'repaired', 'already-installed'].includes(result.status));
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.theme, 'preserve-me');
    assert.equal(settings.hooks.UserPromptSubmit.some((group) => group.hooks.some((hook) => hook.command.includes('/hooks/router.mjs'))), true);
    assert.equal(settings.hooks.UserPromptExpansion.some((group) => group.hooks.some((hook) => hook.command.includes('/hooks/router.mjs'))), true);
    assert.equal(settings.hooks.PostToolUse.some((group) => group.matcher === 'Write|Edit'), true);
    assert.equal(settings.hooks.PostToolUse.some((group) => group.matcher === 'Skill|Agent|Task'), true);
    assert.equal(settings.hooks.PostToolUseFailure.some((group) => group.matcher === 'Skill|Agent|Task'), true);
    assert.equal(settings.hooks.Stop.some((group) => group.hooks.some((hook) => hook.command.includes('/hooks/router.mjs'))), true);
  } finally {
    try { await uninstallRouter(f.options); } catch {}
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('uninstall removes only router-owned observer bindings', async () => {
  const f = fixture();
  try {
    await installRouter(f.options);
    await uninstallRouter(f.options);
    assert.equal(existsSync(f.settingsPath), true);
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.deepEqual(settings.hooks.UserPromptExpansion, f.original.hooks.UserPromptExpansion);
    assert.deepEqual(settings.hooks.PostToolUse, f.original.hooks.PostToolUse);
    assert.deepEqual(settings.hooks.Stop, f.original.hooks.Stop);
    assert.equal(settings.theme, 'preserve-me');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
