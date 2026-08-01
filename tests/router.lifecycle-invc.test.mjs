// Phase 30 / Plan 03 (TDD): INVC-05 end-to-end capability lifecycle.
// Proves the add direction of the invalidation loop end-to-end:
//   watcher -> rebuild -> coverage audit -> recompute -> re-calibrate
//   (watcher + coverage audit are covered by 30-02/30-PATTERNS and the audit
//    module; this test proves the fingerprint -> cacheKey -> recompute spine)
//
// Chain proven here:
//   1. skill add shells: rebuild bumps manifest_fingerprint F0 -> F1
//   2. a cache entry written under F0 is a MISS under F1 (route recomputed)
//   3. plugin add bumps F1 -> F2 (differs from both F0 and F1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const NODE = process.execPath;
const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));
const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { inspectDecision, cacheKey, writeCache, saveCache } = mod;

const MODE_MAP_FIXTURE = {
  entries: [],
  thresholds: { T_high: 0.591, T_low: 0.291, M: 0.191 },
};

function freshHome() {
  const root = mkdtempSync(join(tmpdir(), 'router-lifecycle-invc-'));
  mkdirSync(join(root, '.claude', 'skills'), { recursive: true });
  mkdirSync(join(root, '.claude', 'plugins'), { recursive: true });
  return root;
}

function writeSkill(home, name) {
  const dir = join(home, '.claude', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} skill\n---\n<objective>do ${name}</objective>\nbody`);
}

function writePlugin(home, name, marketplace = 'mp', version = '1.0.0') {
  const file = join(home, '.claude', 'plugins', 'installed_plugins.json');
  let ip = {};
  try { ip = JSON.parse(readFileSync(file, 'utf8') || '{}'); } catch { ip = {}; }
  if (!ip.plugins) ip.plugins = {};
  ip.plugins[`${name}@${marketplace}`] = [
    { version, scope: 'global', installPath: `/x/${name}`, installedAt: '2026-01-01T00:00:00Z' },
  ];
  writeFileSync(file, JSON.stringify(ip));
}

function runBuilder(root) {
  const out = join(root, '.claude', 'router', 'claude-inventory-manifest.json');
  const env = {
    ROUTER_CLAUDE_HOME: join(root, '.claude'),
    ROUTER_AGENTS_SKILLS_DIR: join(root, '.agents', 'skills'),
    ROUTER_SKILL_LOCK_PATH: join(root, '.agents', '.skill-lock.json'),
    ROUTER_CLAUDE_JSON: join(root, '.claude.json'),
    ROUTER_MANIFEST_OUT: out,
    ROUTER_COVERAGE_REPORT_PATH: join(root, '.claude', 'router', 'coverage-report.json'),
  };
  const r = spawnSync(NODE, [BUILDER], { env, encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0) throw new Error(`builder exited ${r.status}: ${r.stderr}`);
  return { out, fingerprint: JSON.parse(readFileSync(out, 'utf8')).manifest_fingerprint };
}

test('INVC-05: skill add bumps fingerprint F0->F1 and the F0-keyed cache entry is a miss', () => {
  const root = freshHome();
  try {
    // Seed one skill + one plugin, build -> F0.
    writeSkill(root, 'skill-a');
    writePlugin(root, 'plug-a');
    const { out, fingerprint: F0 } = runBuilder(root);
    assert.ok(F0, 'manifest_fingerprint must be present after first build');

    // A route cached under F0.
    const cachePath = join(root, 'cache.json');
    const sig0 = cacheKey('help me', [], F0);
    const cache = writeCache({ schema_version: 1, entries: {}, order: [], size: 0 }, sig0, {
      id: 'skill-a', mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
      recommended_skills: [], recommended_agents: [], args_hint: 'STALE-F0-ROUTE',
    });
    saveCache(cache, cachePath);

    // Add a second skill, rebuild -> F1.
    writeSkill(root, 'skill-b');
    const { fingerprint: F1 } = runBuilder(root);
    assert.notEqual(F1, F0, 'adding a skill must bump the fingerprint');

    // inspectDecision against the F1 manifest + F0-seeded cache -> MISS.
    const m = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(m.manifest_fingerprint, F1);
    const decision = inspectDecision('help me', {
      manifest: m,
      modeMap: MODE_MAP_FIXTURE,
      cachePath,
      mutateCache: false,
      logTelemetry: false,
    });
    assert.equal(decision.cache.status, 'miss', 'F0-keyed entry must not be served under F1');
    assert.doesNotMatch(decision.final_injected_context, /STALE-F0-ROUTE/);
    assert.equal(decision.routing_version, F1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('INVC-05: plugin add bumps F1->F2 (differs from both F0 and F1)', () => {
  const root = freshHome();
  try {
    writeSkill(root, 'skill-a');
    writePlugin(root, 'plug-a');
    const { fingerprint: F0 } = runBuilder(root);

    writeSkill(root, 'skill-b');
    const { fingerprint: F1 } = runBuilder(root);
    assert.notEqual(F1, F0);

    // Append a second plugin, rebuild -> F2.
    writePlugin(root, 'plug-b');
    const { fingerprint: F2 } = runBuilder(root);
    assert.notEqual(F2, F1, 'adding a plugin must bump the fingerprint');
    assert.notEqual(F2, F0, 'F2 must also differ from the original F0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('INVC-05: no-op rebuild (identical inputs) preserves the fingerprint', () => {
  const root = freshHome();
  try {
    writeSkill(root, 'skill-a');
    writePlugin(root, 'plug-a');
    const { fingerprint: F0 } = runBuilder(root);
    const { fingerprint: F0b } = runBuilder(root);
    assert.equal(F0b, F0, 'identical rebuild must be byte-stable (no cache invalidation)');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
