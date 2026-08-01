import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  disableRouter, enableRouter, installRouter, resolveInstallGeneration,
  uninstallRouter, upgradeRouter,
} from '../src/lifecycle/router-lifecycle.mjs';
import { stubVerificationRunners, inProcessControllerLauncher } from './helpers/test-mode-seam.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE_BYTES = readFileSync(join(REPO_ROOT, 'coverage-baseline.json'));

// Five-verb coexistence matrix (install, upgrade, reinstall, disable+enable, uninstall) across
// Claude-only, Codex-only, and together fixtures. The install/upgrade/reinstall verbs route
// through the controller/activation, so they use the opt-in test_mode seam from 18-04
// (testMode:true + lightweight verificationRunners + inProcessControllerLauncher) so the installed
// controller can actually activate in-test. disable/enable/uninstall do not invoke the verifier.

function fixture({ variant = 'together' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-coexist-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'router.mjs');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });

  // Pre-install settings.json: non-router Stop hook preserved across all verbs. Formatted with
  // JSON.stringify(obj, null, 2) + '\n' so disable/enable/uninstall can restore byte-identically.
  const preSettings = { theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] } };
  writeFileSync(join(claudeRoot, 'settings.json'), JSON.stringify(preSettings, null, 2) + '\n');

  // Unrelated state: seeded in the roots the installer does NOT own. The installer creates
  // claudeRoot/router/* and codexRoot/router/*; everything else is preserved byte-identically.
  const unrelatedFiles = {
    claudeSettings: join(claudeRoot, 'settings.json'),
    codexConfig: join(codexRoot, 'config.toml'),
  };
  writeFileSync(join(codexRoot, 'config.toml'), 'model = "user-model"\n');

  if (variant === 'claude' || variant === 'together') {
    mkdirSync(join(claudeRoot, 'plugins', 'marketplace', 'other'), { recursive: true });
    writeFileSync(join(claudeRoot, 'plugins', 'marketplace', 'other', 'plugin.json'),
      JSON.stringify({ schema_version: 1, name: 'other', command: 'other' }) + '\n');
    unrelatedFiles.claudePlugin = join(claudeRoot, 'plugins', 'marketplace', 'other', 'plugin.json');
    mkdirSync(join(claudeRoot, 'skills', 'other'), { recursive: true });
    writeFileSync(join(claudeRoot, 'skills', 'other', 'alpha.json'),
      JSON.stringify({ schema_version: 1, name: 'other-skill', command: 'other-skill', mapping: { explicit_subjects: ['other-skill'] } }) + '\n');
    unrelatedFiles.claudeSkill = join(claudeRoot, 'skills', 'other', 'alpha.json');
    writeFileSync(join(claudeRoot, 'user-notes.md'), '# user notes\nseeded before install\n');
    unrelatedFiles.claudeUserNotes = join(claudeRoot, 'user-notes.md');
  }
  if (variant === 'codex' || variant === 'together') {
    mkdirSync(join(codexRoot, 'skills', 'other'), { recursive: true });
    writeFileSync(join(codexRoot, 'skills', 'other', 'codex-other.json'),
      JSON.stringify({ schema_version: 1, name: 'codex-other', command: 'codex-other', mapping: { explicit_subjects: ['codex-other'] } }) + '\n');
    unrelatedFiles.codexSkill = join(codexRoot, 'skills', 'other', 'codex-other.json');
    writeFileSync(join(codexRoot, 'user-config.toml'), '[user]\nkey = "value"\n');
    unrelatedFiles.codexUserConfig = join(codexRoot, 'user-config.toml');
  }

  writeFileSync(sourceRouter, 'export const generation = 1;\n');

  return {
    root, claudeRoot, codexRoot, sourceRouter,
    settingsPath: join(claudeRoot, 'settings.json'),
    routerPath: join(claudeRoot, 'hooks', 'router.mjs'),
    ownedRoot: join(claudeRoot, 'router'),
    codexOwnedRoot: join(codexRoot, 'router'),
    nodeBinary: process.execPath,
    unrelatedFiles,
  };
}

function snapshotUnrelated(f) {
  const snapshot = {};
  for (const [key, path] of Object.entries(f.unrelatedFiles)) {
    snapshot[key] = readFileSync(path);
  }
  return snapshot;
}

function assertUnrelatedUnchanged(f, snapshot, { excludeSettings = false } = {}) {
  for (const [key, path] of Object.entries(f.unrelatedFiles)) {
    if (excludeSettings && key === 'claudeSettings') continue;
    assert.deepEqual(readFileSync(path), snapshot[key], `unrelated file ${key} changed`);
  }
}

function installOptions(f, holder) {
  return {
    claudeRoot: f.claudeRoot, codexRoot: f.codexRoot, sourceRouter: f.sourceRouter,
    settingsPath: f.settingsPath, nodeBinary: f.nodeBinary,
    debounceMs: 10, repairMs: 60_000,
    // Opt-in testability seam: the installed controller uses injected lightweight passing
    // verification runners so trusted() accepts test_only:true in-test, and the real
    // watcher→controller→compiled-index publication seam drives publication. Production
    // never sets testMode, so the hot path is unchanged.
    testMode: true, verificationRunners: stubVerificationRunners,
    launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
  };
}

// uninstallRouter's stopController would SIGTERM process.pid (the in-process controller reports
// the test process's pid). Before calling uninstallRouter, kill the in-process controller, wait
// for its async close to clear the heartbeat/control intervals and publish 'stopped', THEN
// delete the controller status file so stopController finds no live pid to signal. Deleting
// status.json before the close finishes races with the close's publish('stopped') write.
async function safeStopController(f, holder) {
  // kill() returns a promise that resolves once the controller's async close() completes
  // (heartbeat/control intervals cleared + publish('stopped') written). Await it so no async
  // publish('stopped') races with the rmSync below (ENOENT on the deleted controller dir).
  // No extra sleep is needed: close() awaits publish('stopped') internally, so once kill()
  // resolves the controller's writes are flushed and there is no background race to paper over.
  try { await holder.child?.kill(); } catch { /* already closed */ }
  try { rmSync(join(f.ownedRoot, 'controller', 'status.json'), { force: true }); } catch { /* no status */ }
}

function nonRouterHooksPreserved(f) {
  const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
  assert.ok(settings.hooks?.Stop, 'non-router Stop hook must be preserved');
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'user-hook');
  return settings;
}

function routerBindingPresent(f) {
  const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
  const groups = settings.hooks?.UserPromptSubmit || [];
  return groups.some(group => Array.isArray(group?.hooks)
    && group.hooks.some(hook => typeof hook?.command === 'string' && hook.command.includes(f.routerPath)));
}

// --- Existing three tests (retained, extended with unrelated-state byte assertions) ---------

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
  // Non-router hooks preserved after disable (user-hook Stop binding intact, router binding gone).
  assert.equal(routerBindingPresent(f), false);
  nonRouterHooksPreserved(f);
  assert.equal((await enableRouter({ ...f, skipController: true })).status, 'enabled');
  assert.equal((await enableRouter({ ...f, skipController: true })).status, 'already-enabled');
  // Non-router hooks preserved after enable; router binding restored.
  assert.equal(routerBindingPresent(f), true);
  nonRouterHooksPreserved(f);
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

// --- Five independent verb tests (one per verb) ----------------------------------------------

test('install verb: fresh install into empty Claude and Codex homes installs the router and preserves unrelated state', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  const preSnapshot = snapshotUnrelated(f);
  try {
    const result = await installRouter(installOptions(f, holder));
    assert.ok(result.status === 'installed' || result.status === 'repaired', `unexpected status: ${result.status}`);
    // Router hook is installed at the managed path.
    assert.equal(existsSync(f.routerPath), true);
    // Codex marker exists (codex installation is manifest-backed).
    assert.equal(existsSync(join(f.codexOwnedRoot, 'installed.json')), true);
    for (const root of [f.ownedRoot, f.codexOwnedRoot]) {
      assert.equal(existsSync(join(root, 'modules', 'coverage', 'audit.mjs')), true);
      assert.equal(existsSync(join(root, 'src', 'coverage', 'audit.mjs')), true);
      assert.deepEqual(readFileSync(join(root, 'coverage-baseline.json')), BASELINE_BYTES);
    }
    assert.equal(existsSync(join(f.ownedRoot, 'coverage-report.json')), true,
      'onboarding builder must consume the deployed baseline at its default path');
    // Router binding is present and non-router hooks are preserved.
    assert.equal(routerBindingPresent(f), true);
    nonRouterHooksPreserved(f);
    // Unrelated files are byte-identical to the pre-install snapshot.
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('upgrade verb: generation N to N+1 selects the new generation and preserves unrelated state', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  const preSnapshot = snapshotUnrelated(f);
  try {
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    writeFileSync(f.sourceRouter, 'export const generation = 2;\n');
    const upgraded = await upgradeRouter({ ...f, skipController: true });
    assert.equal(upgraded.status, 'upgraded');
    const gen = resolveInstallGeneration(f);
    assert.ok(/^g1-[a-f0-9]{16}$/.test(gen.generationId));
    // Unrelated files preserved byte-identically across upgrade.
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
    // Non-router hooks preserved after upgrade.
    nonRouterHooksPreserved(f);
    assert.equal(routerBindingPresent(f), true);
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('reinstall verb: uninstall followed by install with same source produces a fresh install transaction and preserves unrelated state', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  // reinstallHolder is declared at the top scope so the finally block can clean it up
  // unconditionally even if an assertion in the try block fails before the in-try
  // safeStopController call runs (otherwise the leaked controller's heartbeat keeps
  // the event loop alive and can recreate the deleted controller dir).
  let reinstallHolder = null;
  const preSnapshot = snapshotUnrelated(f);
  // Pre-install settings.json bytes — uninstall must restore byte-identical.
  const preSettingsBytes = readFileSync(f.settingsPath);
  try {
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    assert.equal(existsSync(f.routerPath), true);

    // Uninstall: only router-owned artifacts removed; settings.json restored to pre-install bytes.
    const uninstalled = await uninstallRouter(f);
    assert.equal(uninstalled.status, 'uninstalled');
    assert.equal(existsSync(f.ownedRoot), false);
    // After uninstall, settings.json is byte-identical to the pre-install snapshot (router binding
    // removed, non-router hooks preserved).
    assert.deepEqual(readFileSync(f.settingsPath), preSettingsBytes);
    assert.equal(routerBindingPresent(f), false);
    // Unrelated files preserved byte-identically across uninstall.
    assertUnrelatedUnchanged(f, preSnapshot);

    // Reinstall with the same source: fresh install transaction, router re-installed, controller
    // activates in-test. The install status is 'installed' (fresh transaction, not 'repaired').
    reinstallHolder = {};
    const result = await installRouter(installOptions(f, reinstallHolder));
    assert.ok(result.status === 'installed', `reinstall should install fresh: ${result.status}`);
    assert.equal(existsSync(f.routerPath), true);
    assert.equal(existsSync(join(f.codexOwnedRoot, 'installed.json')), true);
    // Router binding restored; non-router hooks still preserved.
    assert.equal(routerBindingPresent(f), true);
    nonRouterHooksPreserved(f);
    // Unrelated files preserved byte-identically across reinstall.
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
    await safeStopController(f, reinstallHolder);
    reinstallHolder = null;
  } finally {
    if (reinstallHolder) await safeStopController(f, reinstallHolder);
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('disable+enable verb: binding transitions are exact and non-router hooks are byte-identical at every transition', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  // Setup: install + upgrade so disableRouter/enableRouter's resolveInstallGeneration finds a
  // verified generation pointer (install alone does not create a generation; upgrade does).
  try {
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    await upgradeRouter({ ...f, skipController: true });
    const postUpgradeSettings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(routerBindingPresent(f), true);
    // Disable: router entry removed, non-router Stop hook preserved.
    await disableRouter({ ...f, skipController: true });
    assert.equal(routerBindingPresent(f), false);
    nonRouterHooksPreserved(f);
    // Re-enable: router entry restored, non-router Stop hook preserved.
    await enableRouter({ ...f, skipController: true });
    assert.equal(routerBindingPresent(f), true);
    nonRouterHooksPreserved(f);
    // The post-enable settings.json has the same shape as post-upgrade settings (router + Stop).
    const postEnableSettings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.deepEqual(postEnableSettings, postUpgradeSettings);
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('uninstall verb: owned root removed and settings.json byte-identical to pre-install snapshot', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  const preSnapshot = snapshotUnrelated(f);
  const preSettingsBytes = readFileSync(f.settingsPath);
  try {
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    const result = await uninstallRouter(f);
    assert.equal(result.status, 'uninstalled');
    // Owned root is removed.
    assert.equal(existsSync(f.ownedRoot), false);
    // settings.json is byte-identical to the pre-install snapshot (no router binding, all user
    // hooks preserved).
    assert.deepEqual(readFileSync(f.settingsPath), preSettingsBytes);
    // Unrelated files preserved byte-identically across uninstall.
    assertUnrelatedUnchanged(f, preSnapshot);
    // Idempotent: a second uninstall reports already-uninstalled.
    const second = await uninstallRouter(f);
    assert.equal(second.status, 'already-uninstalled');
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

// --- Together-mode isolation test -----------------------------------------------------------

test('together-mode isolation: Claude and Codex installations remain independent across all five verbs', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  const preSnapshot = snapshotUnrelated(f);
  try {
    // Install: both Claude and Codex owned roots are distinct directories.
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    // Quiesce trailing controller writes so uninstall's recursive remove never races them.
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.notEqual(f.ownedRoot, f.codexOwnedRoot);
    assert.equal(existsSync(f.ownedRoot), true);
    assert.equal(existsSync(f.codexOwnedRoot), true);
    // Codex marker is independent of Claude's install state.
    const codexMarker = JSON.parse(readFileSync(join(f.codexOwnedRoot, 'installed.json'), 'utf8'));
    assert.equal(codexMarker.managed_by, 'claude-router');

    // Upgrade: generation advances; codex marker unaffected.
    writeFileSync(f.sourceRouter, 'export const generation = 2;\n');
    await upgradeRouter({ ...f, skipController: true });
    const claudeActive = JSON.parse(readFileSync(join(f.ownedRoot, 'install-state', 'active.json'), 'utf8'));
    assert.ok(/^g1-[a-f0-9]{16}$/.test(claudeActive.generation_id));
    assert.deepEqual(JSON.parse(readFileSync(join(f.codexOwnedRoot, 'installed.json'), 'utf8')), codexMarker);

    // Disable: Claude binding removed; Codex marker unaffected.
    await disableRouter({ ...f, skipController: true });
    assert.equal(routerBindingPresent(f), false);
    assert.deepEqual(JSON.parse(readFileSync(join(f.codexOwnedRoot, 'installed.json'), 'utf8')), codexMarker);

    // Enable: Claude binding restored; Codex marker unaffected.
    await enableRouter({ ...f, skipController: true });
    assert.equal(routerBindingPresent(f), true);
    assert.deepEqual(JSON.parse(readFileSync(join(f.codexOwnedRoot, 'installed.json'), 'utf8')), codexMarker);

    // Unrelated files preserved byte-identically across the whole sequence.
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });

    // Uninstall: Claude owned root removed; codex owned root removed too (manifest lists both).
    await uninstallRouter(f);
    assert.equal(existsSync(f.ownedRoot), false);
    assert.equal(existsSync(f.codexOwnedRoot), false);
    // Unrelated files STILL preserved byte-identically after uninstall.
    assertUnrelatedUnchanged(f, preSnapshot);
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

// --- Post-pointer crash sampling ------------------------------------------------------------
// upgradeRouter supports crashAt: 'before-active-pointer' and 'after-active-pointer'. Install
// and reinstall do not crash-inject, but we sample the same boundaries via the upgrade step
// that drives generation advancement for all three verbs.

test('crash sampling: upgrade before-active-pointer leaves prior generation selected and unrelated state preserved', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  const preSnapshot = snapshotUnrelated(f);
  try {
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    await upgradeRouter({ ...f, skipController: true });
    const first = resolveInstallGeneration(f);
    writeFileSync(f.sourceRouter, 'export const generation = 2;\n');
    // before-active-pointer: generation directory is committed but active.json still points to
    // the prior generation. resolveInstallGeneration must return the prior generation.
    await assert.rejects(upgradeRouter({ ...f, skipController: true, crashAt: 'before-active-pointer' }), /injected crash/);
    assert.equal(resolveInstallGeneration(f).generationId, first.generationId);
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('crash sampling: upgrade after-active-pointer commits new generation and preserves unrelated state', async () => {
  const f = fixture({ variant: 'together' });
  const holder = {};
  const preSnapshot = snapshotUnrelated(f);
  try {
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    await upgradeRouter({ ...f, skipController: true });
    const first = resolveInstallGeneration(f);
    writeFileSync(f.sourceRouter, 'export const generation = 2;\n');
    // after-active-pointer: active.json has been committed to the new generation, but known-good
    // has not. resolveInstallGeneration reads active.json and verifies the new generation.
    await assert.rejects(upgradeRouter({ ...f, skipController: true, crashAt: 'after-active-pointer' }), /injected crash/);
    const resolved = resolveInstallGeneration(f);
    assert.notEqual(resolved.generationId, first.generationId);
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('crash sampling: reinstall boundary samples both before-active-pointer and after-active-pointer via the upgrade step', async () => {
  // reinstall = uninstall + install with same source. The install step does not crash-inject,
  // but the same generation-advancement seam is exercised by an upgrade on the reinstalled
  // root. Sample both boundaries to prove the reinstall+upgrade sequence preserves unrelated
  // state and selects the complete old-or-new generation at every crash boundary.
  const f = fixture({ variant: 'together' });
  const holder = {};
  const preSnapshot = snapshotUnrelated(f);
  const preSettingsBytes = readFileSync(f.settingsPath);
  try {
    await installRouter(installOptions(f, holder));
    await safeStopController(f, holder);
    await upgradeRouter({ ...f, skipController: true });
    const first = resolveInstallGeneration(f);
    // Uninstall then reinstall (fresh install transaction with same source).
    await uninstallRouter(f);
    assert.deepEqual(readFileSync(f.settingsPath), preSettingsBytes);
    const reinstallHolder = {};
    await installRouter(installOptions(f, reinstallHolder));
    await safeStopController(f, reinstallHolder);
    await upgradeRouter({ ...f, skipController: true });
    assert.equal(resolveInstallGeneration(f).generationId, first.generationId);
    // Advance via upgrade and crash before active pointer: prior generation selected.
    writeFileSync(f.sourceRouter, 'export const generation = 2;\n');
    await assert.rejects(upgradeRouter({ ...f, skipController: true, crashAt: 'before-active-pointer' }), /injected crash/);
    assert.equal(resolveInstallGeneration(f).generationId, first.generationId);
    // Advance via upgrade and crash after active pointer: new generation selected.
    await assert.rejects(upgradeRouter({ ...f, skipController: true, crashAt: 'after-active-pointer' }), /injected crash/);
    assert.notEqual(resolveInstallGeneration(f).generationId, first.generationId);
    // Unrelated state preserved byte-identically across the entire reinstall+crash sequence.
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
  } finally {
    await safeStopController(f, holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});

// --- Fixture-variant coverage (Claude-only, Codex-only, together) ---------------------------

for (const variant of ['claude', 'codex', 'together']) {
  test(`install verb across ${variant} fixture: install + uninstall preserves unrelated state`, async () => {
    const f = fixture({ variant });
    const holder = {};
    const preSnapshot = snapshotUnrelated(f);
    const preSettingsBytes = readFileSync(f.settingsPath);
    try {
      await installRouter(installOptions(f, holder));
      await safeStopController(f, holder);
      assert.equal(routerBindingPresent(f), true);
      nonRouterHooksPreserved(f);
      assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
      await uninstallRouter(f);
      assert.equal(existsSync(f.ownedRoot), false);
      assert.deepEqual(readFileSync(f.settingsPath), preSettingsBytes);
      assertUnrelatedUnchanged(f, preSnapshot);
    } finally {
      await safeStopController(f, holder);
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}
