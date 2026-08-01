// Plan 32-01 Task 2 — Wave-0 RED spec for Phase 32 cross-runtime resolve (PARITY-03/04)
// plus the ROUTE-05 tie-lint + forward-orphan resolve-list lint surface.
//
// This spec reuses the phase-26 dual-runtime shape (PROFILES = claude | codex) to model
// per-runtime capability presence, and drives each runtime by spawning a fresh node
// subprocess with `ROUTER_RUNTIME` set (same spawnSync pattern tests/router.perf.test.mjs
// and the phase-31 probeRuntime use). Because ROUTER_RUNTIME is read at module load, each
// subprocess is a distinct "active runtime".
//
// The future 32-04 surface this spec awaits:
//
//   resolveSlashRoute(entry, manifest) — resolves to the FIRST locally-present candidate
//     by capability role, considering ONLY the ACTIVE runtime's present capabilities.
//     UNDEFINED today — the undefined-import IS the RED state.
//
// The manifest below carries a `runtime_commands` map (per-runtime command presence, the
// deferred "runtime-tagged presence" from REQUIREMENTS.md). 32-04 must make the resolver
// consult only the ACTIVE runtime's slice, so the same intent resolves differently per
// runtime. This keyed-shape is centralized here so 32-04 can adapt it in one place.
//
// RED until 32-04 (runtime-conditional resolve) and 32-03 (tie-lint):
//   Group A :: PARITY-03 — only the active runtime's capabilities are considered/injected.
//   Group B :: PARITY-04 — a capability present in one runtime resolves to its local
//              equivalent in the other.
//   Group C :: ROUTE-05 — near-tie downgrades to med/suppressed; absent resolve members
//              are quarantined (flagged, never shipped).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const RUNNING = process.env.ROUTER_RUNTIME || 'claude';

// Combined manifest carrying BOTH runtimes' command presence. The resolver must consult
// only the active runtime's slice (`runtime_commands[RUNTIME]`).
const combinedManifest = {
  commands: [],
  runtime_commands: {
    claude: ['gsd-debug', 'gsd-plan-phase'],
    codex: ['systematic-debugging'],
  },
  skills: [],
  plugin_skills: [],
  agents_store_skills: [],
  agents: [],
};

const DEBUG_ROLE = {
  id: 'debug-capability',
  invoke_kind: 'slash',
  mode: 'gsd-debug',
  resolve: [
    { name: 'gsd-debug', weight: 1.0 },
    { name: 'systematic-debugging', weight: 0.9 },
  ],
  signal_patterns: ['debug'],
  recommended_skills: [],
  recommended_agents: [],
};

// probeResolve spawns a fresh subprocess under ROUTER_RUNTIME=<runtime>, imports the live
// hook, and calls the future resolveSlashRoute(entry, manifest). Today resolveSlashRoute is
// undefined -> the subprocess throws at module eval -> status != 0 -> every assertion FAILS
// (RED). When 32-04 ships it, `out` is JSON of the resolved route.
function probeResolve({ runtime, manifest, entry }) {
  const code = [
    `const m = await import(${JSON.stringify(pathToFileURL(HOOK).href)});`,
    `const manifest = ${JSON.stringify(manifest)};`,
    `const entry = ${JSON.stringify(entry)};`,
    `const out = m.resolveSlashRoute(entry, manifest);`,
    `process.stdout.write(JSON.stringify(out));`,
  ].join('\n');
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, ROUTER_RUNTIME: runtime },
    encoding: 'utf8',
    timeout: 15000,
  });
  let value = null;
  const out = (res.stdout || '').trim();
  if (out) { try { value = JSON.parse(out); } catch { value = null; } }
  return { status: res.status, out, err: (res.stderr || '').trim(), value };
}

// A slash-only fixture: gsd-debug is the ONLY candidate. Under codex (no gsd-debug) there
// is nothing resolvable for this role, so it must be silent — proving only the active
// runtime's present capabilities are considered.
const GSD_ONLY_ROLE = { ...DEBUG_ROLE, resolve: [{ name: 'gsd-debug', weight: 1.0 }] };

// --- Group A — Active-runtime-only evaluation (PARITY-03) -------------------

test('Group A: claude runtime emits its gsd-* slash suggestion', () => {
  const r = probeResolve({ runtime: 'claude', manifest: combinedManifest, entry: GSD_ONLY_ROLE });
  assert.equal(r.status, 0, `probe must not crash (${r.err})`);
  assert.ok(r.value, 'claude must resolve the gsd-debug capability role');
  assert.equal(r.value.suggested_slash, 'gsd-debug',
    'claude runtime must suggest claude-present gsd-debug');
});

test('Group A: codex runtime does NOT evaluate/inject the claude-only gsd-* candidate', () => {
  const r = probeResolve({ runtime: 'codex', manifest: combinedManifest, entry: GSD_ONLY_ROLE });
  assert.equal(r.status, 0, `probe must not crash (${r.err})`);
  assert.ok(
    r.value === null || (r.value && r.value.tier === 'low' && !r.value.suggested_slash),
    'codex runtime must not emit a gsd-* slash suggestion (only active-runtime capabilities)',
  );
  assert.notEqual(r.value?.suggested_slash, 'gsd-debug',
    'codex must never inject the claude-only gsd-debug candidate');
});

test('Group A: resolve evaluation is runtime-conditional — same intent, ROUTER_RUNTIME drives the outcome', () => {
  const claude = probeResolve({ runtime: 'claude', manifest: combinedManifest, entry: GSD_ONLY_ROLE });
  const codex = probeResolve({ runtime: 'codex', manifest: combinedManifest, entry: GSD_ONLY_ROLE });
  assert.equal(claude.status, 0, claude.err);
  assert.equal(codex.status, 0, codex.err);
  assert.notDeepEqual(claude.value, codex.value,
    'the same intent must resolve differently under claude vs codex when only claude has gsd-*');
});

// --- Group B — Cross-runtime equivalent resolution (PARITY-04) --------------

test('Group B: claude resolves the capability role to gsd-debug', () => {
  const r = probeResolve({ runtime: 'claude', manifest: combinedManifest, entry: DEBUG_ROLE });
  assert.equal(r.status, 0, r.err);
  assert.equal(r.value?.suggested_slash, 'gsd-debug',
    'claude: framework-neutral role resolves to the locally-present gsd-* command');
});

test('Group B: codex resolves the SAME capability role to its local equivalent', () => {
  const r = probeResolve({ runtime: 'codex', manifest: combinedManifest, entry: DEBUG_ROLE });
  assert.equal(r.status, 0, r.err);
  assert.equal(r.value?.suggested_slash, 'systematic-debugging',
    'codex: a capability present in claude (gsd-debug) must resolve to its codex-local present equivalent');
});

// --- Group C — Tie-lint + forward-orphan quarantine (ROUTE-05) --------------

test('Group C: a near-tie in the resolve list downgrades the route to med (or suppresses it)', () => {
  const manifest = { ...combinedManifest, runtime_commands: { claude: ['a', 'b'], codex: [] } };
  const nearTie = {
    ...DEBUG_ROLE,
    mode: 'a',
    resolve: [
      { name: 'a', weight: 1.0 },
      { name: 'b', weight: 0.98 }, // within 0.05 of the top -> near-tie
    ],
  };
  const r = probeResolve({ runtime: 'claude', manifest, entry: nearTie });
  assert.equal(r.status, 0, r.err);
  assert.ok(
    r.value === null || (r.value && r.value.tier !== 'high'),
    'a near-tie must never ship at a confident (high) tier — downgrade to med or suppress',
  );
  if (r.value && r.value.suggested_slash) {
    assert.equal(r.value.tier, 'med', 'near-tie route must be downgraded to `med`');
  }
});

test('Group C: an absent resolve member is quarantined (flagged), never injected', () => {
  const manifest = { ...combinedManifest, runtime_commands: { claude: ['gsd-debug'], codex: [] } };
  const entry = {
    ...DEBUG_ROLE,
    resolve: [
      { name: 'gsd-debug', weight: 1.0 },
      { name: 'ghost-capability', weight: 0.9 }, // absent from the active manifest
    ],
  };
  const r = probeResolve({ runtime: 'claude', manifest, entry });
  assert.equal(r.status, 0, r.err);
  assert.ok(r.value, 'a route with one present candidate must resolve');
  assert.ok(
    Array.isArray(r.value.quarantined) && r.value.quarantined.includes('ghost-capability'),
    `the absent resolve member must be flagged/quarantined (got ${JSON.stringify(r.value && r.value.quarantined)})`,
  );
  assert.notEqual(r.value.suggested_slash, 'ghost-capability',
    'a quarantined absent resolve member must never be injected as a slash suggestion');
});
