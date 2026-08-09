// Plan 31-01 Task 1 — Wave-0 RED spec for Phase 31 runtime tagging (PARITY-01/02).
//
// This spec imports the LIVE hook at ~/.claude/hooks/router.mjs (the same HOOK
// pattern tests/router.cache.test.mjs:13 uses), which is what makes the
// byte-identical mirror (src/runtime/router.mjs) load-bearing. It targets the
// Phase-31 API surface that plans 31-02 (detection + runtime-conditional dirs)
// and 31-03 (cacheKey runtime slot + telemetry runtime field) will export:
//
//   RUNTIME                -> module-level "claude" | "codex" constant (D-01/D-02/D-04)
//   RUNTIME_CONFIG_DIR     -> runtime-conditional config dir (D-03)
//   cacheKey(...)          -> gains a trailing `runtime` identity slot (D-05)
//   telemetryEntryFromState(...) -> record gains a `runtime` field (D-06)
//
// Until 31-02/31-03 land, RUNTIME / RUNTIME_CONFIG_DIR / telemetryEntryFromState
// are undefined exports (the undefined-import IS the RED state) and cacheKey has
// no runtime slot (both runtimes hash to the same key). This spec holds those
// surfaces RED so each feature task has a concrete failing target to turn GREEN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'router-runtime-tagging-'));
const HOOK = join(fixtureRoot, 'router.mjs');
writeFileSync(HOOK, readFileSync(new URL('../src/runtime/router.mjs', import.meta.url)));
writeFileSync(join(fixtureRoot, 'router.evolve.mjs'), readFileSync(new URL('../src/runtime/router.evolve.mjs', import.meta.url)));
process.on('exit', () => rmSync(fixtureRoot, { recursive: true, force: true }));
const mod = await import(HOOK);
const { RUNTIME, RUNTIME_CONFIG_DIR, cacheKey, telemetryEntryFromState } = mod;

// probeRuntime spawns a fresh node subprocess that imports the hook module and
// prints its module-load RUNTIME constant. This tests detection precedence under
// a controlled env WITHOUT running the hook's isMain() entry point (which would
// attach stdin listeners). The probe prints "undefined" today because RUNTIME is
// not yet exported — the assertion then fails, which is the RED signal.
function probeRuntime(envOverrides = {}) {
  const probe = `const m = await import(${JSON.stringify(pathToFileURL(HOOK).href)}); process.stdout.write(String(m.RUNTIME));`;
  const env = { ...process.env };
  delete env.ROUTER_RUNTIME;
  delete env.CODEX_HOME;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    env: { ...env, ...envOverrides },
    encoding: 'utf8',
    timeout: 15000,
  });
  return { status: res.status, out: (res.stdout || '').trim(), err: (res.stderr || '').trim() };
}

// --- Detection precedence (PARITY-01 / D-01 / D-02 / D-04) ------------------

test('detection: RUNTIME is exported and is one of claude|codex', () => {
  assert.ok(RUNTIME === 'claude' || RUNTIME === 'codex', `RUNTIME must be 'claude'|'codex', got ${RUNTIME}`);
});

test('detection: ROUTER_RUNTIME=codex override wins (D-04)', () => {
  const r = probeRuntime({ ROUTER_RUNTIME: 'codex' });
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, 'codex', 'ROUTER_RUNTIME=codex must yield RUNTIME=codex');
  assert.notEqual(r.out, 'claude', 'codex override must not fall back to claude');
});

test('detection: absent marker defaults to claude (fail-open)', () => {
  const r = probeRuntime({});
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, 'claude', 'no ROUTER_RUNTIME / no codex marker must default to claude');
});

test('detection: RUNTIME_CONFIG_DIR is exported as a runtime-scoped string (D-03)', () => {
  assert.equal(typeof RUNTIME_CONFIG_DIR, 'string', 'RUNTIME_CONFIG_DIR must be exported by 31-02');
  assert.ok(
    RUNTIME_CONFIG_DIR === join(homedir(), '.claude') || RUNTIME_CONFIG_DIR === join(homedir(), '.codex'),
    `RUNTIME_CONFIG_DIR must resolve to ~/.claude or ~/.codex, got ${RUNTIME_CONFIG_DIR}`,
  );
});

// --- Cache-key divergence (PARITY-02 / D-05) --------------------------------

test('cacheKey: runtime is key identity — codex !== claude (D-05)', () => {
  assert.notEqual(
    cacheKey('fix bug', ['fix'], 'fp', '', '', '', 'codex'),
    cacheKey('fix bug', ['fix'], 'fp', '', '', '', 'claude'),
    'same prompt+manifest under different runtime must produce different keys',
  );
});

test('cacheKey: deterministic within a runtime — claude === claude (D-05)', () => {
  assert.equal(
    cacheKey('x', [], 'fp', '', '', '', 'claude'),
    cacheKey('x', [], 'fp', '', '', '', 'claude'),
  );
});

// --- Telemetry runtime field (PARITY-02 / D-06) -----------------------------

test('telemetry: telemetryEntryFromState emits a runtime field in {claude, codex}', () => {
  assert.equal(typeof telemetryEntryFromState, 'function', 'telemetryEntryFromState must be exported by 31-03');
  const decision = {
    normalizedPrompt: 'fix bug',
    intentKeywords: ['fix'],
    guards_fired: [],
    tier: 'high',
    route: { mode: 'gsd-debug', recommended_skills: [], recommended_agents: [] },
    top: null,
    weights: null,
    graphify: { queried: false, status: 'not_triggered' },
    surface_status: 'unconfigured',
    cwd: process.cwd(),
    invoke_kind: 'slash',
  };
  const entry = telemetryEntryFromState(decision, process.hrtime.bigint());
  assert.ok(
    typeof entry.runtime === 'string' && ['claude', 'codex'].includes(entry.runtime),
    `runtime field must be claude|codex, got ${entry.runtime}`,
  );
  assert.equal(entry.route_id, 'gsd-debug', 'telemetry must carry the selected route anchor');
});

// --- Fail-open enum clamp (V5 input validation boundary / T-31-01) ----------

test('detection: out-of-enum ROUTER_RUNTIME clamps to claude (fail-open)', () => {
  const r = probeRuntime({ ROUTER_RUNTIME: 'bogus' });
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, 'claude', "ROUTER_RUNTIME='bogus' must clamp to claude (enum-clamped fail-open)");
});

test('detection: ambient CODEX_HOME cannot misroute the Claude hook', () => {
  const r = probeRuntime({ CODEX_HOME: '/tmp/custom-codex' });
  assert.equal(r.status, 0, r.err);
  assert.equal(r.out, 'claude');
});
