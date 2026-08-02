import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { fingerprint, installRouter, restartController, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { buildFullRegistry } from '../src/registry/build.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { safeFixtureContractOverlays } from './helpers/test-mode-seam.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const INSTALLER = join(REPO_ROOT, 'install-router.mjs');

function fixture({ withSettings = true, trackControllers = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-lifecycle-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'source-router.mjs');
  const settingsPath = join(claudeRoot, 'settings.json');
  const routerPath = join(claudeRoot, 'hooks', 'router.mjs');
  const manifestPath = join(claudeRoot, 'router', 'install-manifest.json');
  const controllerChildren = [];
  writeFileSync(sourceRouter, 'export const router = true;\n');
  if (withSettings) {
    mkdirSync(claudeRoot, { recursive: true });
    writeFileSync(settingsPath, '{\n  "hooks": {},\n  "theme": "dark"\n}\n');
  }
  const options = {
    claudeRoot, codexRoot, sourceRouter, settingsPath, routerPath, manifestPath,
    nodeBinary: process.execPath,
  };
  if (trackControllers) {
    options.launchController = (binary, args, spawnOptions) => {
      const child = spawn(binary, args, spawnOptions);
      child.unref = () => child;
      controllerChildren.push(child);
      return child;
    };
  }
  return {
    root, settingsPath, routerPath, manifestPath, controllerChildren, options,
  };
}

async function stopFixtureControllers(f) {
  await Promise.all((f.controllerChildren || []).map(async child => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolveExit, rejectExit) => {
      const timeout = setTimeout(
        () => rejectExit(new Error(`fixture controller ${child.pid} did not exit after SIGTERM`)),
        5_000,
      );
      child.once('exit', () => {
        clearTimeout(timeout);
        resolveExit();
      });
      child.once('error', error => {
        clearTimeout(timeout);
        rejectExit(error);
      });
      child.kill('SIGTERM');
    });
  }));
}

async function cleanup(f) {
  try { await uninstallRouter(f.options); } catch { /* fixture may be intentionally corrupt */ }
  await stopFixtureControllers(f);
  rmSync(f.root, { recursive: true, force: true });
}

function snapshot(root) {
  if (!existsSync(root)) return null;
  const walk = (directory, relative = '') => readdirSync(directory).sort().flatMap(name => {
    const absolute = join(directory, name); const path = relative ? join(relative, name) : name;
    return statSync(absolute).isDirectory() ? [{ path, type: 'directory' }, ...walk(absolute, path)]
      : [{ path, type: 'file', bytes: readFileSync(absolute).toString('base64') }];
  });
  return walk(root);
}

function assertRelativeImportClosure(root) {
  for (const entry of snapshot(root) || []) {
    if (entry.type !== 'file' || !entry.path.endsWith('.mjs')) continue;
    const source = readFileSync(join(root, entry.path), 'utf8');
    const imports = source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g);
    for (const [, specifier] of imports) {
      assert.equal(
        existsSync(resolve(root, dirname(entry.path), specifier)),
        true,
        `${entry.path} imports missing deployed module ${specifier}`,
      );
    }
  }
}

async function waitUntil(predicate, timeoutMs = 2_000) {
  const pollMs = 25;
  const attempts = Math.ceil(timeoutMs / pollMs);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  if (predicate()) return;
  assert.fail(`condition was not met within ${timeoutMs} ms`);
}

test('one command installs router, binding, Codex marker, and complete ownership manifest', async () => {
  const f = fixture();
  try {
    const result = await installRouter(f.options);
    assert.equal(result.status, 'installed');
    assert.equal(result.ready, true);
    assert.equal(readFileSync(f.routerPath, 'utf8'), 'export const router = true;\n');
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.theme, 'dark');
    assert.equal(settings.hooks.UserPromptSubmit.length, 1);
    assert.match(settings.hooks.UserPromptSubmit[0].hooks[0].command, /router\.mjs/);
    assert.equal(existsSync(join(f.options.codexRoot, 'router', 'installed.json')), true);
    // Task 260723-l9s: codex router.mjs deployed + codex hooks.json UserPromptSubmit binding
    const codexRouterPath = join(f.options.codexRoot, 'hooks', 'router.mjs');
    assert.equal(existsSync(codexRouterPath), true);
    assert.equal(readFileSync(codexRouterPath, 'utf8'), 'export const router = true;\n');
    const codexHooks = JSON.parse(readFileSync(join(f.options.codexRoot, 'hooks.json'), 'utf8'));
    assert.equal(codexHooks.hooks.UserPromptSubmit.length, 1);
    assert.match(codexHooks.hooks.UserPromptSubmit[0].hooks[0].command, /router\.mjs/);
    assert.equal(codexHooks.hooks.UserPromptSubmit[0].hooks[0].timeout, 10);
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'));
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.state, 'complete');
    assert.equal(manifest.bindings.length, 6);
    // 48 base files + 8 = 4 orchestrator modules (D-07, Phase 19-03) × 2 runtime roots (claude + codex)
    // + 8 = 4 evolution modules (Phase 20-01: canary-controller, evidence, perf-measure, telemetry-bridge) × 2 roots
    // + 2 = 1 evolution module (Phase 20-02: candidate-calibration-route) × 2 roots
    // + 1 = codex router.mjs (Task 260723-l9s: codex UserPromptSubmit binding)
    // + 24 = 12 Phase 22-25 dependency-closure modules × 2 roots
    // + 2 = coverage/audit.mjs × 2 roots
    // = 93 (modules-only deploy)
    // + 92 = 46 moduleNames mirrored to src/ × 2 roots (including the complete
    //   registry, health, steward, and approval dependency closure)
    //   gate fixtures + router.calibrate.mjs `../src/...` imports resolve in production)
    // + 10 = 5 gate entrypoints (router.calibrate.mjs, calibration-tasks.json,
    //   build-manifest.mjs, coverage-baseline.json, scripts/resolve-tie-lint.mjs) × 2 roots (fresh-account onboarding: builder deployed
    //   to both owned roots, runs once for claude's ownedRoot post-readiness)
    // + 20 = 10 gate fixtures (tests/*.test.mjs) × 2 roots (Blocker-2b: production
    //   verify gates regression_suite/privacy/latency/token_budget/calibration_quality)
    // + 6 = 3 shared gate helpers (tests/helpers/*.mjs) × 2 roots
    // + 2 = fresh-install mode-map seed, one per runtime
    // = 231
    assert.equal(manifest.files.length, 231);
    assert.equal(manifest.runtime_state_inventory.immutable.owned_by_version_manifests, true);
    assert.equal(manifest.runtime_state_inventory.mutable.some(path => path.endsWith('/active.json')), true);
    const controllerConfig = JSON.parse(readFileSync(result.controllerConfigPath, 'utf8'));
    const activationRoot = join(f.options.claudeRoot, 'router');
    assert.equal(controllerConfig.activation_root, activationRoot);
    assert.equal(controllerConfig.active_path, join(activationRoot, 'active.json'));
    for (const runtimeRoot of [join(f.options.claudeRoot, 'router'), join(f.options.codexRoot, 'router')]) {
      const control = join(runtimeRoot, 'modules', 'cli', 'router-control.mjs');
      assert.equal(existsSync(control), true);
      assertRelativeImportClosure(join(runtimeRoot, 'modules'));
      const imported = await import(`${new URL(`file://${control}`).href}?fixture=${Date.now()}`);
      assert.equal(typeof imported.runRouterControl, 'function');
      for (const module of ['map.mjs', 'validate.mjs', 'activate.mjs', 'watcher.mjs']) {
        assert.equal(existsSync(join(runtimeRoot, 'modules', 'registry', module)), true);
      }
      for (const module of ['capsule.mjs', 'resolve.mjs', 'sources.mjs', 'prompt-route.mjs']) {
        assert.equal(existsSync(join(runtimeRoot, 'modules', 'context', module)), true);
      }
      for (const module of ['compile-index.mjs', 'publish-index.mjs']) {
        assert.equal(existsSync(join(runtimeRoot, 'modules', 'prompt', module)), true);
      }
      for (const helper of ['inventory-fixture.mjs', 'latency-isolated.mjs', 'test-mode-seam.mjs']) {
        assert.equal(existsSync(join(runtimeRoot, 'tests', 'helpers', helper)), true);
      }
    }
    for (const module of ['registry/fingerprint.mjs', 'registry/diff.mjs', 'registry/watcher.mjs', 'registry/reconcile.mjs', 'registry/hook-reconcile.mjs']) {
      assert.equal(existsSync(join(f.options.claudeRoot, 'router', 'modules', module)), true);
    }
    const status = JSON.parse(readFileSync(result.controllerStatusPath, 'utf8'));
    assert.equal(status.state, 'ready');
    assert.equal(status.configuration_fingerprint, result.configurationFingerprint);
    assert.equal(Number.isInteger(status.pid), true);
    assert.equal(existsSync(result.candidatePath), true);
    assert.equal(JSON.parse(readFileSync(result.reportPath, 'utf8')).summary.activated, false);
  } finally { await cleanup(f); }
});

test('candidate dry-run is mutation-free and build failure occurs before install mutation', async () => {
  const f = fixture();
  try {
    const settingsBefore = readFileSync(f.settingsPath);
    const dry = await installRouter({ ...f.options, dryRun: true });
    assert.equal(dry.status, 'dry-run');
    assert.deepEqual(readFileSync(f.settingsPath), settingsBefore);
    assert.equal(existsSync(f.routerPath), false);
    await assert.rejects(installRouter({ ...f.options, buildRegistry() { throw new Error('injected build failure'); } }), /injected build failure/);
    assert.equal(existsSync(f.routerPath), false);
    assert.equal(existsSync(f.manifestPath), false);
    assert.deepEqual(readFileSync(f.settingsPath), settingsBefore);
  } finally { await cleanup(f); }
});

test('post-mutation failure restores exact fresh-install state', async () => {
  const f = fixture();
  try {
    const before = snapshot(f.root);
    await assert.rejects(installRouter({ ...f.options, afterMutation() { throw new Error('injected readiness failure'); } }), /injected readiness failure/);
    assert.deepEqual(snapshot(f.root), before);
  } finally { await cleanup(f); }
});

test('readiness accepts controller-owned candidate and report mutations', async () => {
  const f = fixture();
  let child;
  try {
    const candidatePath = join(f.options.claudeRoot, 'router', 'candidate', 'registry.json');
    const reportPath = join(f.options.claudeRoot, 'router', 'candidate', 'report.json');
    const statusPath = join(f.options.claudeRoot, 'router', 'controller', 'status.json');
    const result = await installRouter({
      ...f.options,
      afterMutation() {
        writeFileSync(candidatePath, '{"records":[{"id":"runtime"}],"schema_version":1}\n');
        writeFileSync(reportPath, '{"runtime_reconciliation":true}\n');
      },
      launchController(_binary, args) {
        child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        const configPath = args[args.indexOf('--config') + 1];
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        writeFileSync(statusPath, JSON.stringify({
          schema_version: 1,
          state: 'ready',
          instance_id: 'mutable-state-test',
          pid: child.pid,
          heartbeat: Date.now(),
          configuration_fingerprint: fingerprint(stableStringify(config)),
        }) + '\n');
        return child;
      },
    });
    assert.equal(result.ready, true);
  } finally {
    child?.kill('SIGTERM');
    await cleanup(f);
  }
});

test('post-mutation repair failure restores every immutable owned byte and manifest', async () => {
  const f = fixture();
  try {
    await installRouter(f.options);
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'));
    const candidate = manifest.files.find(entry => entry.path.endsWith('/candidate/registry.json')).path;
    writeFileSync(candidate, 'pre-repair custom bytes\n');
    writeFileSync(f.routerPath, 'pre-repair router bytes\n');
    const before = snapshot(f.root).filter(
      ({ path }) => path !== '.claude/router/controller/status.json',
    );
    await assert.rejects(installRouter({ ...f.options, afterMutation() { throw new Error('injected readiness failure'); } }), /injected readiness failure/);
    assert.deepEqual(
      snapshot(f.root).filter(
        ({ path }) => path !== '.claude/router/controller/status.json',
      ),
      before,
    );
  } finally { await cleanup(f); }
});

test('install initializes missing settings and repeat install is idempotent', async () => {
  const f = fixture({ withSettings: false });
  try {
    assert.equal((await installRouter(f.options)).status, 'installed');
    assert.equal((await installRouter(f.options)).status, 'already-installed');
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  } finally { await cleanup(f); }
});

test('repeat install repairs a missing owned file without duplicating binding', async () => {
  const f = fixture();
  try {
    await installRouter(f.options);
    rmSync(f.routerPath);
    assert.equal((await installRouter(f.options)).status, 'repaired');
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  } finally { await cleanup(f); }
});

test('invalid settings fail before creating router-owned state', async () => {
  const f = fixture();
  try {
    writeFileSync(f.settingsPath, '{"hooks": []}\n');
    await assert.rejects(installRouter(f.options), /settings\.hooks must be an object/);
    assert.equal(existsSync(f.routerPath), false);
    assert.equal(existsSync(f.manifestPath), false);
  } finally { await cleanup(f); }
});

test('install never overwrites a pre-existing router without ownership evidence', async () => {
  const f = fixture();
  try {
    mkdirSync(dirname(f.routerPath), { recursive: true });
    writeFileSync(f.routerPath, 'pre-existing user router\n');
    await assert.rejects(installRouter(f.options), /not owned by this installer/);
    assert.equal(readFileSync(f.routerPath, 'utf8'), 'pre-existing user router\n');
    assert.equal(existsSync(f.manifestPath), false);
  } finally { await cleanup(f); }
});

test('uninstall removes owned state and preserves settings added later', async () => {
  const f = fixture();
  try {
    await installRouter(f.options);
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    settings.afterInstall = { keep: true };
    writeFileSync(f.settingsPath, JSON.stringify(settings, null, 2) + '\n');
    const result = await uninstallRouter(f.options);
    assert.equal(result.status, 'uninstalled');
    assert.equal(existsSync(f.routerPath), false);
    assert.equal(existsSync(f.manifestPath), false);
    const post = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.deepEqual(post.afterInstall, { keep: true });
    assert.equal(post.hooks.UserPromptSubmit, undefined);
    assert.equal((await uninstallRouter(f.options)).status, 'already-uninstalled');
  } finally { await cleanup(f); }
});

test('uninstall retains a user-modified owned file', async () => {
  const f = fixture();
  try {
    await installRouter(f.options);
    writeFileSync(f.routerPath, 'user changed this\n');
    const result = await uninstallRouter(f.options);
    assert.equal(existsSync(f.routerPath), true);
    assert.deepEqual(result.retained, [f.routerPath]);
  } finally { await cleanup(f); }
});

test('malformed ownership manifest fails closed without mutations', async () => {
  const f = fixture({ trackControllers: true });
  try {
    await installRouter(f.options);
    const settingsBefore = readFileSync(f.settingsPath, 'utf8');
    writeFileSync(f.manifestPath, '{broken');
    await assert.rejects(uninstallRouter(f.options), /ownership manifest/);
    assert.equal(readFileSync(f.settingsPath, 'utf8'), settingsBefore);
    assert.equal(existsSync(f.routerPath), true);
  } finally { await cleanup(f); }
});

test('uninstall rejects outside-root files, forged bindings, and symlink entries atomically', async () => {
  for (const forge of ['outside-file', 'binding', 'symlink']) {
    const f = fixture({ trackControllers: true });
    try {
      await installRouter(f.options);
      const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'));
      const unrelated = join(f.root, 'keep.txt');
      writeFileSync(unrelated, 'keep');
      if (forge === 'outside-file') manifest.files.push({ path: unrelated, fingerprint: fingerprint('keep') });
      if (forge === 'binding') manifest.bindings[0].settings_path = unrelated;
      if (forge === 'symlink') {
        const link = join(f.options.claudeRoot, 'router', 'forged-link');
        symlinkSync(unrelated, link);
        manifest.files.push({ path: link, fingerprint: fingerprint('keep') });
      }
      writeFileSync(f.manifestPath, JSON.stringify(manifest));
      const settingsBefore = readFileSync(f.settingsPath, 'utf8');
      await assert.rejects(uninstallRouter(f.options), /ownership manifest is invalid/);
      assert.equal(readFileSync(unrelated, 'utf8'), 'keep');
      assert.equal(readFileSync(f.settingsPath, 'utf8'), settingsBefore);
      assert.equal(existsSync(f.routerPath), true);
    } finally { await cleanup(f); }
  }
});

function runCli(f, ...extra) {
  return spawnSync(process.execPath, [
    INSTALLER,
    '--claude-root', f.options.claudeRoot,
    '--codex-root', f.options.codexRoot,
    '--source-router', f.options.sourceRouter,
    '--settings', f.settingsPath,
    '--router', f.routerPath,
    '--manifest', f.manifestPath,
    '--node-binary', process.execPath,
    ...extra,
  ], { encoding: 'utf8' });
}

test('CLI provides symmetric install and uninstall lifecycle', async () => {
  const f = fixture();
  try {
    const install = runCli(f);
    assert.equal(install.status, 0, install.stderr);
    assert.match(install.stdout, /INSTALL OK/);
    const reinstall = runCli(f);
    assert.equal(reinstall.status, 0, reinstall.stderr);
    assert.match(reinstall.stdout, /ALREADY INSTALLED/);
    const uninstall = runCli(f, '--uninstall');
    assert.equal(uninstall.status, 0, uninstall.stderr);
    assert.match(uninstall.stdout, /UNINSTALL OK/);
    const secondUninstall = runCli(f, '--uninstall');
    assert.equal(secondUninstall.status, 0, secondUninstall.stderr);
    assert.match(secondUninstall.stdout, /ALREADY UNINSTALLED/);
  } finally { await cleanup(f); }
});

test('owned controller restarts cooperatively with a new ready instance', async () => {
  const f = fixture();
  try {
    const installed = await installRouter(f.options);
    const restarted = await restartController(f.options);
    assert.notEqual(restarted.instanceId, installed.controllerInstanceId);
    assert.equal(restarted.ready, true);
    assert.equal(JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).instance_id, restarted.instanceId);
  } finally { await cleanup(f); }
});

test('live mutation reconciles within two seconds and stopped-controller mutation repairs on restart', async () => {
  const f = fixture();
  const liveBytes = '---\nname: live-skill\ncanonical_identity: router/live-skill\ncommand: /live-skill\ndependencies: []\n---\n# live\n';
  const downtimeBytes = '---\nname: downtime-skill\ncanonical_identity: router/downtime-skill\ncommand: $downtime\ndependencies: []\n---\n# downtime\n';
  const contractOverlays = safeFixtureContractOverlays({
    claudeRoot: f.options.claudeRoot,
    codexRoot: f.options.codexRoot,
    artifacts: [
      { runtime: 'claude', relativePath: 'skills/live/SKILL.md', bytes: liveBytes },
      { runtime: 'codex', relativePath: 'skills/downtime/SKILL.md', bytes: downtimeBytes },
    ],
  });
  const options = { ...f.options, repairMs: 300_000, contractOverlays };
  try {
    const installed = await installRouter(options);
    const firstSkill = join(f.options.claudeRoot, 'skills', 'live', 'SKILL.md');
    mkdirSync(dirname(firstSkill), { recursive: true });
    writeFileSync(firstSkill, liveBytes);
    await waitUntil(() => readFileSync(installed.candidatePath, 'utf8').includes('live-skill'));
    await waitUntil(() => JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).watcher?.trigger === 'filesystem-event');
    assert.equal(JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).state, 'reconciling');
    await waitUntil(() => JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).reconciliation?.trigger === 'filesystem-event');
    const firstReport = JSON.parse(readFileSync(installed.reportPath, 'utf8'));
    const firstStatus = JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8'));
    assert.equal(firstStatus.reconciliation.strategy, 'incremental');
    assert.equal(firstStatus.reconciliation.trigger, 'filesystem-event');
    const firstLifecycleHash = firstStatus.reconciliation.lifecycle_hash;
    const firstFull = buildFullRegistry({ claudeRoot: f.options.claudeRoot, codexRoot: f.options.codexRoot, overlays: contractOverlays });
    const inactiveCandidate = JSON.parse(readFileSync(installed.candidatePath, 'utf8'));
    assert.equal(inactiveCandidate.activated, false);
    assert.equal(inactiveCandidate.disposition, 'eligible');
    assert.equal(inactiveCandidate.schema_version, firstFull.registry.schema_version);
    assert.deepEqual(inactiveCandidate.records, firstFull.registry.records);
    assert.deepEqual({ diagnostics: firstReport.diagnostics, summary: firstReport.summary },
      { diagnostics: firstFull.diagnostics, summary: firstFull.summary });
    await waitUntil(() => JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).watcher?.state === 'current', 60_000);

    const status = JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8'));
    writeFileSync(join(f.options.claudeRoot, 'router', 'controller', 'request.json'), JSON.stringify({
      schema_version: 1,
      action: 'shutdown',
      instance_id: status.instance_id,
      configuration_fingerprint: installed.configurationFingerprint,
    }) + '\n');
    await waitUntil(() => JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).state === 'stopped');
    const downtimeSkill = join(f.options.codexRoot, 'skills', 'downtime', 'SKILL.md');
    mkdirSync(dirname(downtimeSkill), { recursive: true });
    writeFileSync(downtimeSkill, downtimeBytes);
    const restarted = await restartController(options);
    assert.notEqual(restarted.instanceId, status.instance_id);
    await waitUntil(() => readFileSync(installed.candidatePath, 'utf8').includes('downtime-skill'));
    await waitUntil(() => JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).reconciliation?.lifecycle_hash !== firstLifecycleHash);
    const repairedReport = JSON.parse(readFileSync(installed.reportPath, 'utf8'));
    assert.equal(JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).reconciliation.strategy, 'incremental');
    const repairedFull = buildFullRegistry({ claudeRoot: f.options.claudeRoot, codexRoot: f.options.codexRoot, overlays: contractOverlays });
    const repairedCandidate = JSON.parse(readFileSync(installed.candidatePath, 'utf8'));
    assert.equal(repairedCandidate.activated, false);
    assert.equal(repairedCandidate.disposition, 'eligible');
    assert.equal(repairedCandidate.schema_version, repairedFull.registry.schema_version);
    assert.deepEqual(repairedCandidate.records, repairedFull.registry.records);
    assert.deepEqual({ diagnostics: repairedReport.diagnostics, summary: repairedReport.summary },
      { diagnostics: repairedFull.diagnostics, summary: repairedFull.summary });
  } finally { await cleanup(f); }
});

test('installed project ancestor repairs initially absent Claude and Codex inventories', async () => {
  const f = fixture();
  const projectRoot = join(f.root, 'project');
  mkdirSync(projectRoot, { recursive: true });
  const claudeBytes = '---\nname: project-live\ncanonical_identity: router/project-live\ncommand: /project-live\ndependencies: []\n---\n# project live\n';
  const codexBytes = '---\nname: project-codex\ncanonical_identity: router/project-codex\ncommand: $project-codex\ndependencies: []\n---\n# project codex\n';
  const contractOverlays = safeFixtureContractOverlays({
    claudeRoot: f.options.claudeRoot,
    codexRoot: f.options.codexRoot,
    projectRoot,
    scopeId: 'fixture',
    artifacts: [
      { runtime: 'claude', rootPath: join(projectRoot, '.claude'), relativePath: 'skills/project-live/SKILL.md', bytes: claudeBytes },
      { runtime: 'codex', rootPath: join(projectRoot, '.codex'), relativePath: 'skills/project-codex/SKILL.md', bytes: codexBytes },
    ],
  });
  const options = {
    ...f.options, projectRoot, scopeId: 'fixture', repairMs: 300_000, controlPollMs: 25, contractOverlays,
  };
  try {
    const installed = await installRouter(options);
    const config = JSON.parse(readFileSync(join(f.options.claudeRoot, 'router', 'controller', 'config.json'), 'utf8'));
    assert.equal(config.repair_ms, 300_000);
    assert.deepEqual(config.roots.filter(root => root.logicalRoot.startsWith('project:')), [
      { logicalRoot: 'project:fixture:claude', path: join(projectRoot, '.claude'), watchPath: projectRoot, includeRelativePaths: ['.claude'] },
      { logicalRoot: 'project:fixture:codex', path: join(projectRoot, '.codex'), watchPath: projectRoot, includeRelativePaths: ['.codex'] },
    ]);
    const claudeSkill = join(projectRoot, '.claude', 'skills', 'project-live', 'SKILL.md');
    mkdirSync(dirname(claudeSkill), { recursive: true });
    writeFileSync(claudeSkill, claudeBytes);
    const codexSkill = join(projectRoot, '.codex', 'skills', 'project-codex', 'SKILL.md');
    mkdirSync(dirname(codexSkill), { recursive: true });
    writeFileSync(codexSkill, codexBytes);
    await waitUntil(() => {
      const candidate = readFileSync(installed.candidatePath, 'utf8');
      return candidate.includes('project-live') && candidate.includes('project-codex');
    });
    await waitUntil(() => JSON.parse(
      readFileSync(installed.controllerStatusPath, 'utf8'),
    ).reconciliation?.trigger === 'filesystem-event');
  } finally { await cleanup({ ...f, options }); }
});

test('controller launch failure rolls back exact bytes and leaves no child', async () => {
  const f = fixture();
  try {
    const before = snapshot(f.root);
    await assert.rejects(installRouter({
      ...f.options,
      launchController() { return { pid: 999999, kill() {} }; },
      readinessTimeoutMs: 10,
    }), /controller readiness/);
    assert.deepEqual(snapshot(f.root), before);
  } finally { await cleanup(f); }
});

test('prompt hook source has no watcher, scan, or registry build work', async () => {
  const source = readFileSync(join(REPO_ROOT, 'tests/router.mjs.snapshot'), 'utf8');
  assert.doesNotMatch(source, /fs\.watch|scanFingerprintTree|buildFullRegistry|createRegistryWatcher/);
});

test('CLI help leads with one-command install and uninstall', async () => {
  const result = spawnSync(process.execPath, [INSTALLER, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /node install-router\.mjs\s+# install/);
  assert.match(result.stdout, /node install-router\.mjs --uninstall/);
});

test('production lifecycle stays standard-library-only and offline', async () => {
  for (const relative of ['install-router.mjs', 'src/lifecycle/router-lifecycle.mjs', 'src/registry/watcher.mjs']) {
    const source = readFileSync(join(REPO_ROOT, relative), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.ok(imports.every((specifier) => specifier.startsWith('node:') || specifier.startsWith('.')),
      `${relative} contains only Node or local imports`);
    assert.doesNotMatch(source, /https?:\/\/|\bfetch\s*\(/, `${relative} has no network path`);
  }
});

test('bundled router includes the current operator and safety surfaces', async () => {
  const source = readFileSync(join(REPO_ROOT, 'tests/router.mjs.snapshot'), 'utf8');
  for (const surface of [
    'export function validateRouteTargets',
    'export function buildTelemetryProposals',
    'export function inspectDecision',
    'function runCli',
  ]) assert.match(source, new RegExp(surface), `bundled router must include ${surface}`);
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/,
    'doctor must resolve the installed hook from its file URL');
});
