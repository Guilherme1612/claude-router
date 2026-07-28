// Fresh-account onboarding: install runs the inventory manifest builder once
// post-readiness so a brand-new account (empty ~/.claude / ~/.codex) is fully
// ready to route. The builder is an injectable seam (options.manifestBuilder,
// mirroring options.launchController); this test stubs it to write a minimal
// valid manifest so the install test stays fast + decoupled from the real
// spawn. tests/router.build-manifest.test.mjs covers the real builder port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { stubVerificationRunners, inProcessControllerLauncher } from './helpers/test-mode-seam.mjs';

// Minimal valid inventory manifest (matches build-manifest.mjs top-level shape
// with all-zero counts). The router reads these keys; the stub writes them so
// the test asserts the install seam wires the builder output to the right path.
const MINIMAL_MANIFEST = {
  generated_at_runtime_note: 'test stub',
  registry_scope: {},
  skills: [], plugin_skills: [], agents_store_skills: [], project_scoped_skills: [],
  agents: [], hooks: [], commands: [], mcp_servers: [], unwired_mcp_refs: {},
  plugins_enabled: [], installed_plugins: [], plugin_manifests: [], marketplaces: [],
  project_config: {}, plugin_hooks: [], settings: {}, claude_md: null,
  counts: {
    skills: 0, plugin_skills: 0, agents_store_skills: 0, project_scoped_skills: 0,
    agents: 0, hooks: 0, hook_bindings: 0, commands: 0, mcp_servers: 0,
    unwired_mcp_refs: 0, plugins_enabled: 0, installed_plugins: 0, plugin_manifests: 0,
    marketplaces: 0, plugin_hooks: 0, project_mcp_servers: 0,
  },
};

const MANIFEST_TOP_KEYS = [
  'skills', 'plugin_skills', 'agents_store_skills', 'project_scoped_skills',
  'agents', 'hooks', 'commands', 'mcp_servers', 'unwired_mcp_refs', 'counts',
];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-fresh-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'router.mjs');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  const preSettings = { theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] } };
  writeFileSync(join(claudeRoot, 'settings.json'), JSON.stringify(preSettings, null, 2) + '\n');
  writeFileSync(sourceRouter, 'export const generation = 1;\n');
  return {
    root, claudeRoot, codexRoot, sourceRouter,
    settingsPath: join(claudeRoot, 'settings.json'),
    routerPath: join(claudeRoot, 'hooks', 'router.mjs'),
    ownedRoot: join(claudeRoot, 'router'),
    manifestPath: join(claudeRoot, 'router', 'claude-inventory-manifest.json'),
    nodeBinary: process.execPath,
  };
}

async function safeStopController(holder) {
  try { await holder.child?.kill(); } catch { /* already closed */ }
}

test('fresh-account install: builder seam writes inventory manifest and reports manifestBuilt', async () => {
  const f = fixture();
  const holder = {};
  let builderInvoked = false;
  // Stub the manifest builder: write a minimal valid manifest to the env-var
  // output path and return a zero-exit spawn-shaped result. Asserts the seam is
  // called with claude's ownedRoot build-manifest.mjs + ROUTER_MANIFEST_OUT env.
  const manifestBuilder = (nodeBinary, scriptPath, env) => {
    builderInvoked = true;
    assert.equal(scriptPath, join(f.ownedRoot, 'build-manifest.mjs'),
      'builder must run claude ownedRoot build-manifest.mjs (codex shares claude manifest)');
    assert.equal(env.ROUTER_MANIFEST_OUT, f.manifestPath,
      'builder must write to claude ownedRoot claude-inventory-manifest.json');
    assert.equal(env.ROUTER_CLAUDE_HOME, f.claudeRoot, 'builder env must target the fresh claude root');
    mkdirSync(join(f.ownedRoot), { recursive: true });
    writeFileSync(env.ROUTER_MANIFEST_OUT, JSON.stringify(MINIMAL_MANIFEST, null, 2));
    return { status: 0 };
  };
  try {
    const result = await installRouter({
      claudeRoot: f.claudeRoot, codexRoot: f.codexRoot, sourceRouter: f.sourceRouter,
      settingsPath: f.settingsPath, nodeBinary: f.nodeBinary,
      debounceMs: 10, repairMs: 60_000,
      testMode: true, verificationRunners: stubVerificationRunners,
      launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
      manifestBuilder,
    });
    assert.ok(result.status === 'installed' || result.status === 'repaired', `unexpected status: ${result.status}`);
    assert.equal(builderInvoked, true, 'manifest builder seam must be invoked post-readiness');
    assert.equal(result.manifestBuilt, true, 'manifestBuilt must be true on zero-exit builder run');
    assert.equal(existsSync(f.manifestPath), true, 'inventory manifest must exist after install');
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'));
    for (const key of MANIFEST_TOP_KEYS) {
      assert.ok(key in manifest, `manifest missing top-level key: ${key}`);
    }
    assert.deepEqual(manifest.counts.skills, 0, 'stub manifest counts must be present');
  } finally {
    await safeStopController(holder);
    rmSync(f.root, { recursive: true, force: true });
  }
});