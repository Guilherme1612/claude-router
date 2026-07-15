import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installRouter, restartController, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { buildFullRegistry } from '../src/registry/build.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const INSTALLER = join(REPO_ROOT, 'install-router.mjs');

function fixture({ withSettings = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-lifecycle-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'source-router.mjs');
  const settingsPath = join(claudeRoot, 'settings.json');
  const routerPath = join(claudeRoot, 'hooks', 'router.mjs');
  const manifestPath = join(claudeRoot, 'router', 'install-manifest.json');
  writeFileSync(sourceRouter, 'export const router = true;\n');
  if (withSettings) {
    mkdirSync(claudeRoot, { recursive: true });
    writeFileSync(settingsPath, '{\n  "hooks": {},\n  "theme": "dark"\n}\n');
  }
  return {
    root, settingsPath, routerPath, manifestPath,
    options: { claudeRoot, codexRoot, sourceRouter, settingsPath, routerPath, manifestPath, nodeBinary: process.execPath },
  };
}

async function cleanup(f) {
  try { await uninstallRouter(f.options); } catch { /* fixture may be intentionally corrupt */ }
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

async function waitUntil(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() <= deadline);
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
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'));
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.state, 'complete');
    assert.equal(manifest.files.length, 16);
    for (const module of ['registry/fingerprint.mjs', 'registry/diff.mjs', 'registry/watcher.mjs']) {
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

test('post-mutation repair failure restores every owned byte and manifest', async () => {
  const f = fixture();
  try {
    await installRouter(f.options);
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'));
    const candidate = manifest.files.find(entry => entry.path.endsWith('/candidate/registry.json')).path;
    writeFileSync(candidate, 'pre-repair custom bytes\n');
    writeFileSync(f.routerPath, 'pre-repair router bytes\n');
    const before = snapshot(f.root);
    await assert.rejects(installRouter({ ...f.options, afterMutation() { throw new Error('injected readiness failure'); } }), /injected readiness failure/);
    assert.deepEqual(snapshot(f.root), before);
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
  const f = fixture();
  try {
    await installRouter(f.options);
    const settingsBefore = readFileSync(f.settingsPath, 'utf8');
    writeFileSync(f.manifestPath, '{broken');
    await assert.rejects(uninstallRouter(f.options), /ownership manifest/);
    assert.equal(readFileSync(f.settingsPath, 'utf8'), settingsBefore);
    assert.equal(existsSync(f.routerPath), true);
  } finally { await cleanup(f); }
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
  try {
    const installed = await installRouter({ ...f.options, repairMs: 200 });
    const firstSkill = join(f.options.claudeRoot, 'skills', 'live', 'SKILL.md');
    mkdirSync(dirname(firstSkill), { recursive: true });
    writeFileSync(firstSkill, '---\nname: live-skill\ncommand: /live-skill\n---\n# live\n');
    await waitUntil(() => readFileSync(installed.candidatePath, 'utf8').includes('live-skill'));
    await waitUntil(() => JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).reconciliation?.strategy === 'incremental');
    const firstReport = JSON.parse(readFileSync(installed.reportPath, 'utf8'));
    const firstStatus = JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8'));
    assert.equal(firstStatus.reconciliation.strategy, 'incremental');
    const firstLifecycleHash = firstStatus.reconciliation.lifecycle_hash;
    const firstFull = buildFullRegistry({ claudeRoot: f.options.claudeRoot, codexRoot: f.options.codexRoot });
    assert.deepEqual(JSON.parse(readFileSync(installed.candidatePath, 'utf8')), firstFull.registry);
    assert.deepEqual({ diagnostics: firstReport.diagnostics, summary: firstReport.summary },
      { diagnostics: firstFull.diagnostics, summary: firstFull.summary });

    const status = JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8'));
    process.kill(status.pid, 'SIGTERM');
    await waitUntil(() => {
      try { process.kill(status.pid, 0); return false; } catch { return true; }
    });
    const downtimeSkill = join(f.options.codexRoot, 'skills', 'downtime', 'SKILL.md');
    mkdirSync(dirname(downtimeSkill), { recursive: true });
    writeFileSync(downtimeSkill, '---\nname: downtime-skill\ncommand: $downtime\n---\n# downtime\n');
    const restarted = await restartController({ ...f.options, repairMs: 200 });
    assert.notEqual(restarted.instanceId, status.instance_id);
    await waitUntil(() => readFileSync(installed.candidatePath, 'utf8').includes('downtime-skill'));
    await waitUntil(() => JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).reconciliation?.lifecycle_hash !== firstLifecycleHash);
    const repairedReport = JSON.parse(readFileSync(installed.reportPath, 'utf8'));
    assert.equal(JSON.parse(readFileSync(installed.controllerStatusPath, 'utf8')).reconciliation.strategy, 'incremental');
    const repairedFull = buildFullRegistry({ claudeRoot: f.options.claudeRoot, codexRoot: f.options.codexRoot });
    assert.deepEqual(JSON.parse(readFileSync(installed.candidatePath, 'utf8')), repairedFull.registry);
    assert.deepEqual({ diagnostics: repairedReport.diagnostics, summary: repairedReport.summary },
      { diagnostics: repairedFull.diagnostics, summary: repairedFull.summary });
  } finally { await cleanup(f); }
});

test('installed project ancestor watches initially absent Claude and Codex inventories', async () => {
  const f = fixture();
  const projectRoot = join(f.root, 'project');
  mkdirSync(projectRoot, { recursive: true });
  const options = { ...f.options, projectRoot, scopeId: 'fixture', repairMs: 10_000 };
  try {
    const installed = await installRouter(options);
    const config = JSON.parse(readFileSync(join(f.options.claudeRoot, 'router', 'controller', 'config.json'), 'utf8'));
    assert.equal(config.repair_ms, 10_000);
    assert.deepEqual(config.roots.filter(root => root.logicalRoot.startsWith('project:')), [
      { logicalRoot: 'project:fixture:claude', path: join(projectRoot, '.claude'), watchPath: projectRoot, includeRelativePaths: ['.claude'] },
      { logicalRoot: 'project:fixture:codex', path: join(projectRoot, '.codex'), watchPath: projectRoot, includeRelativePaths: ['.codex'] },
    ]);
    const claudeSkill = join(projectRoot, '.claude', 'skills', 'project-live', 'SKILL.md');
    mkdirSync(dirname(claudeSkill), { recursive: true });
    writeFileSync(claudeSkill, '---\nname: project-live\ncommand: /project-live\n---\n# project live\n');
    await waitUntil(() => readFileSync(installed.candidatePath, 'utf8').includes('project-live'));
    const codexSkill = join(projectRoot, '.codex', 'skills', 'project-codex', 'SKILL.md');
    mkdirSync(dirname(codexSkill), { recursive: true });
    writeFileSync(codexSkill, '---\nname: project-codex\ncommand: $project-codex\n---\n# project codex\n');
    await waitUntil(() => readFileSync(installed.candidatePath, 'utf8').includes('project-codex'));
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
