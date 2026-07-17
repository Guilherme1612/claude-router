import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disableRouter, enableRouter, resolveInstallGeneration, upgradeRouter } from '../src/lifecycle/router-lifecycle.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-generation-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'router.mjs');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  writeFileSync(join(claudeRoot, 'settings.json'), JSON.stringify({ theme: 'dark', hooks: { Stop: [{ hooks: [{ command: 'user-hook' }] }] } }));
  writeFileSync(join(codexRoot, 'config.toml'), 'model = "user-model"\n');
  writeFileSync(sourceRouter, 'export const generation = 1;\n');
  return { root, claudeRoot, codexRoot, sourceRouter, settingsPath: join(claudeRoot, 'settings.json'),
    routerPath: join(claudeRoot, 'hooks', 'router.mjs'), ownedRoot: join(claudeRoot, 'router'),
    launchController: () => ({ exitCode: null, unref() {}, kill() {} }), readinessTimeoutMs: 1 };
}

test('upgrade selects complete immutable generations with one pointer and preserves unrelated homes', async () => {
  const f = fixture();
  const claudeUnrelated = readFileSync(f.settingsPath);
  const codexUnrelated = readFileSync(join(f.codexRoot, 'config.toml'));
  const first = await upgradeRouter({ ...f, skipController: true });
  writeFileSync(f.sourceRouter, 'export const generation = 2;\n');
  const second = await upgradeRouter({ ...f, skipController: true });
  assert.notEqual(first.generationId, second.generationId);
  assert.equal(resolveInstallGeneration(f).generationId, second.generationId);
  assert.equal(existsSync(join(f.ownedRoot, 'install-state', 'generations', first.generationId)), true);
  assert.deepEqual(readFileSync(join(f.codexRoot, 'config.toml')), codexUnrelated);
  const settings = JSON.parse(readFileSync(f.settingsPath));
  assert.equal(settings.theme, JSON.parse(claudeUnrelated).theme);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'user-hook');
});

test('disable and enable are exact idempotent binding transitions', async () => {
  const f = fixture();
  await upgradeRouter({ ...f, skipController: true });
  assert.equal((await disableRouter({ ...f, skipController: true })).status, 'disabled');
  assert.equal((await disableRouter({ ...f, skipController: true })).status, 'already-disabled');
  assert.equal((await enableRouter({ ...f, skipController: true })).status, 'enabled');
  assert.equal((await enableRouter({ ...f, skipController: true })).status, 'already-enabled');
});

test('failed pre-pointer upgrade leaves old generation selected and startup repairs corrupt pointer', async () => {
  const f = fixture();
  const first = await upgradeRouter({ ...f, skipController: true });
  writeFileSync(f.sourceRouter, 'export const generation = 2;\n');
  await assert.rejects(upgradeRouter({ ...f, skipController: true, crashAt: 'before-active-pointer' }), /injected crash/);
  assert.equal(resolveInstallGeneration(f).generationId, first.generationId);
  writeFileSync(join(f.ownedRoot, 'install-state', 'active.json'), '{bad');
  assert.equal(resolveInstallGeneration(f, { repair: true }).generationId, first.generationId);
});
