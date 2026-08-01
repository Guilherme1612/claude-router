// INVC-04: plugins/installed_plugins.json is the authoritative plugin add/remove
// signal feeding the manifest_fingerprint epoch. A real plugin add or remove bumps
// the fingerprint; plugin-only metadata churn (installed_at/lastUpdated/installPath)
// and complete rebuilds over identical input leave it byte-identical.
//
// Driven at the builder level: seed a temp HOME with installed_plugins.json, run
// build-manifest.mjs, and compare emitted manifest_fingerprint across edit states.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const NODE = process.execPath;
const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'router-plugins-fingerprint-'));
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

function runBuilder(root, extraEnv = {}) {
  const out = join(root, '.claude', 'router', 'claude-inventory-manifest.json');
  const env = {
    ROUTER_CLAUDE_HOME: join(root, '.claude'),
    ROUTER_AGENTS_SKILLS_DIR: join(root, '.agents', 'skills'),
    ROUTER_SKILL_LOCK_PATH: join(root, '.agents', '.skill-lock.json'),
    ROUTER_CLAUDE_JSON: join(root, '.claude.json'),
    ROUTER_MANIFEST_OUT: out,
    ...extraEnv,
  };
  const r = spawnSync(NODE, [BUILDER], { env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(r.status, 0, `builder exited ${r.status}: ${r.stderr}`);
  return JSON.parse(readFileSync(out, 'utf8')).manifest_fingerprint;
}

// One installed plugin record shaped like the real installed_plugins.json schema.
function pluginRecord(overrides = {}) {
  return {
    scope: 'user',
    installPath: '/Users/me/.claude/plugins/repos/context-mode',
    version: '3.0.0',
    installedAt: '2026-07-01T00:00:00.000Z',
    lastUpdated: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function seedPlugins(root, pluginMap) {
  const dir = join(root, '.claude', 'plugins');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'installed_plugins.json'), JSON.stringify({ plugins: pluginMap }));
}

test('identical installed_plugins.json → identical manifest_fingerprint (plugin determinism)', () => withTempDir(root => {
  seedPlugins(root, { 'context-mode@context-mode': [pluginRecord()] });
  const a = runBuilder(root);
  // Seed ignores object-key order concerns by rewriting with the same content.
  seedPlugins(root, { 'context-mode@context-mode': [pluginRecord()] });
  const b = runBuilder(root);
  assert.equal(a, b, 'identical plugin input must emit an identical fingerprint');
}));

test('plugin add bumps the fingerprint (authoritative add signal)', () => withTempDir(root => {
  seedPlugins(root, { 'context-mode@context-mode': [pluginRecord()] });
  const before = runBuilder(root);
  seedPlugins(root, {
    'context-mode@context-mode': [pluginRecord()],
    'caveman@caveman': [pluginRecord({ installPath: '/Users/me/.claude/plugins/repos/caveman', version: '1.2.0' })],
  });
  const after = runBuilder(root);
  assert.notEqual(after, before, 'adding a plugin must change the fingerprint');
}));

test('plugin remove bumps the fingerprint (authoritative remove signal)', () => withTempDir(root => {
  seedPlugins(root, {
    'context-mode@context-mode': [pluginRecord()],
    'caveman@caveman': [pluginRecord({ installPath: '/Users/me/.claude/plugins/repos/caveman', version: '1.2.0' })],
  });
  const added = runBuilder(root);
  seedPlugins(root, { 'context-mode@context-mode': [pluginRecord()] });
  const removed = runBuilder(root);
  assert.notEqual(removed, added, 'removing a plugin must change the fingerprint');
}));

test('timestamp-only edit (installedAt/lastUpdated/installPath) leaves fingerprint byte-identical', () => withTempDir(root => {
  seedPlugins(root, { 'context-mode@context-mode': [pluginRecord()] });
  const baseline = runBuilder(root);
  seedPlugins(root, {
    'context-mode@context-mode': [pluginRecord({
      installedAt: '2026-07-31T00:00:00.000Z',
      lastUpdated: '2026-07-31T00:00:00.000Z',
      installPath: '/Users/me/.claude/plugins/repos/context-mode-renamed',
    })],
  });
  const edited = runBuilder(root);
  assert.equal(edited, baseline, 'installed_at/lastUpdated/installPath must never be fingerprint inputs');
}));
