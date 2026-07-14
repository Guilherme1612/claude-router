import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installRouter, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';

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

function cleanup(f) {
  rmSync(f.root, { recursive: true, force: true });
}

test('one command installs router, binding, Codex marker, and complete ownership manifest', () => {
  const f = fixture();
  try {
    const result = installRouter(f.options);
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
    assert.equal(manifest.files.length, 2);
  } finally { cleanup(f); }
});

test('install initializes missing settings and repeat install is idempotent', () => {
  const f = fixture({ withSettings: false });
  try {
    assert.equal(installRouter(f.options).status, 'installed');
    assert.equal(installRouter(f.options).status, 'already-installed');
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  } finally { cleanup(f); }
});

test('repeat install repairs a missing owned file without duplicating binding', () => {
  const f = fixture();
  try {
    installRouter(f.options);
    rmSync(f.routerPath);
    assert.equal(installRouter(f.options).status, 'repaired');
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  } finally { cleanup(f); }
});

test('invalid settings fail before creating router-owned state', () => {
  const f = fixture();
  try {
    writeFileSync(f.settingsPath, '{"hooks": []}\n');
    assert.throws(() => installRouter(f.options), /settings\.hooks must be an object/);
    assert.equal(existsSync(f.routerPath), false);
    assert.equal(existsSync(f.manifestPath), false);
  } finally { cleanup(f); }
});

test('install never overwrites a pre-existing router without ownership evidence', () => {
  const f = fixture();
  try {
    mkdirSync(dirname(f.routerPath), { recursive: true });
    writeFileSync(f.routerPath, 'pre-existing user router\n');
    assert.throws(() => installRouter(f.options), /not owned by this installer/);
    assert.equal(readFileSync(f.routerPath, 'utf8'), 'pre-existing user router\n');
    assert.equal(existsSync(f.manifestPath), false);
  } finally { cleanup(f); }
});

test('uninstall removes owned state and preserves settings added later', () => {
  const f = fixture();
  try {
    installRouter(f.options);
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    settings.afterInstall = { keep: true };
    writeFileSync(f.settingsPath, JSON.stringify(settings, null, 2) + '\n');
    const result = uninstallRouter(f.options);
    assert.equal(result.status, 'uninstalled');
    assert.equal(existsSync(f.routerPath), false);
    assert.equal(existsSync(f.manifestPath), false);
    const post = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.deepEqual(post.afterInstall, { keep: true });
    assert.equal(post.hooks.UserPromptSubmit, undefined);
    assert.equal(uninstallRouter(f.options).status, 'already-uninstalled');
  } finally { cleanup(f); }
});

test('uninstall retains a user-modified owned file', () => {
  const f = fixture();
  try {
    installRouter(f.options);
    writeFileSync(f.routerPath, 'user changed this\n');
    const result = uninstallRouter(f.options);
    assert.equal(existsSync(f.routerPath), true);
    assert.deepEqual(result.retained, [f.routerPath]);
  } finally { cleanup(f); }
});

test('malformed ownership manifest fails closed without mutations', () => {
  const f = fixture();
  try {
    installRouter(f.options);
    const settingsBefore = readFileSync(f.settingsPath, 'utf8');
    writeFileSync(f.manifestPath, '{broken');
    assert.throws(() => uninstallRouter(f.options), /ownership manifest/);
    assert.equal(readFileSync(f.settingsPath, 'utf8'), settingsBefore);
    assert.equal(existsSync(f.routerPath), true);
  } finally { cleanup(f); }
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

test('CLI provides symmetric install and uninstall lifecycle', () => {
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
  } finally { cleanup(f); }
});

test('CLI help leads with one-command install and uninstall', () => {
  const result = spawnSync(process.execPath, [INSTALLER, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /node install-router\.mjs\s+# install/);
  assert.match(result.stdout, /node install-router\.mjs --uninstall/);
});

test('production lifecycle stays standard-library-only and offline', () => {
  for (const relative of ['install-router.mjs', 'src/lifecycle/router-lifecycle.mjs']) {
    const source = readFileSync(join(REPO_ROOT, relative), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.ok(imports.every((specifier) => specifier.startsWith('node:') || specifier.startsWith('.')),
      `${relative} contains only Node or local imports`);
    assert.doesNotMatch(source, /https?:\/\/|\bfetch\s*\(/, `${relative} has no network path`);
  }
});

test('bundled router includes the current operator and safety surfaces', () => {
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
