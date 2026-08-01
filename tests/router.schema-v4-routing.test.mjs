// Plan 32-01 Task 1 — Wave-0 RED spec for Phase 32 schema-v4 resolve-first routing.
//
// This spec imports the LIVE hook at ~/.claude/hooks/router.mjs (same HOOK pattern
// tests/router.cache.test.mjs:13 and tests/router.coverage-audit.test.mjs:15 use),
// which keeps the byte-identical mirror (tests/router.mjs.snapshot) load-bearing.
// It targets the Phase-32 API surface that 32-02/32-03 will export:
//
//   resolveSlashRoute(entry, manifest, opts?)  -> the future resolve-first route
//        decision. UNDEFINED until 32-02 ships it — the undefined-import IS the RED
//        state (same convention as RUNTIME/resolveSlashRoute in phase-31 specs).
//
// The `entry.resolve` field (array of `{ name, weight? }`) and the
// `indexes.commands` presence set referenced below do not exist yet.
//
// RED until 32-02 (resolve-first + guard-hole closure) and 32-03 (generic fallback):
//   Group A :: GUARD-HOLE CLOSURE. validateRouteTargets must flag gsd-* entries as
//              `stale_target` when the manifest has NO gsd-* commands and no resolve
//              member is present. TODAY the schema_version truthy branch
//              (intentionalSchemaRoute at router.mjs:721/806) passes them as
//              intentional -> this assertion FAILS (proves the hole is real).
//   Group B :: RESOLVE-FIRST PRESENCE. resolveSlashRoute picks the highest-ranked
//              PRESENT candidate and is framework-neutral (the candidate set comes
//              only from entry.mode + entry.resolve — never a hardcoded `gsd-` prefix).
//   Group C :: FALLBACK. top-absent falls back to next-present; zero-resolvable is
//              silent-low (no injection); empty-resolve emits at most ONE generic
//              native-capability fallback line (no fabricated capability name).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
// `resolveSlashRoute` is undefined today (32-01 RED). `validateRouteTargets` and
// `buildTargetIndexes` already exist and are exported from the mirror.
const { validateRouteTargets, buildTargetIndexes, resolveSlashRoute } = mod;

// Framework-neutral capability-role fixture. The mode + resolve list are the ONLY
// candidate sources; no hardcoded `gsd-` prefix may appear in the matcher.
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

const baseManifest = (commands = []) => ({
  commands,
  skills: [],
  plugin_skills: [],
  agents_store_skills: [],
  agents: [],
});

// --- Group A — Guard-hole closure (ROUTE-02) --------------------------------

test('Group A: schema_version-SET map with NO gsd-* commands must flag every gsd entry stale_target', () => {
  const manifest = baseManifest([]); // zero commands present
  const modeMap = {
    schema_version: 4, // SET — the hole is only exercised when schema_version is truthy
    entries: [
      { ...DEBUG_ROLE, id: 'gsd-debug', mode: 'gsd-debug' },
      { ...DEBUG_ROLE, id: 'gsd-ship', mode: 'gsd-ship', signal_patterns: ['ship'] },
    ],
  };
  const indexes = buildTargetIndexes(manifest);
  // The current `intentionalSchemaRoute = mode && mode === id && modeMap?.schema_version`
  // branch (router.mjs:721/806) treats every id===mode gsd entry as intentional even
  // though NO gsd-* command exists. Once 32-02 replaces the blanket schema_version pass
  // with a real resolve check, every one of these must surface as stale_target.
  const stale = validateRouteTargets(manifest, modeMap, indexes)
    .filter((d) => d.status === 'stale_target');

  assert.equal(stale.length, 2,
    `zero gsd-* commands present => every gsd entry must be stale_target (got ${stale.length}: ${JSON.stringify(stale)})`);
});

test('Group A: schema_version-UNSET map with no gsd-* commands already flags stale_target (control)', () => {
  const manifest = baseManifest([]);
  const modeMap = {
    // schema_version omitted -> intentionalSchemaRoute is falsy -> stale_target today.
    entries: [
      { ...DEBUG_ROLE, id: 'gsd-debug', mode: 'gsd-debug' },
    ],
  };
  const stale = validateRouteTargets(manifest, modeMap, buildTargetIndexes(manifest))
    .filter((d) => d.status === 'stale_target');
  assert.equal(stale.length, 1,
    'control: without schema_version the gsd entry must already be stale_target today');
});

// Group A must FAIL today because the schema_version-SET case still leaks (stale.length === 0),
// while the UNSET control passes — proving the hole is real, untested, and schema_version-conditional.

// --- Group B — Resolve-first presence (ROUTE-01) ----------------------------

test('Group B: resolveSlashRoute picks the highest-ranked PRESENT candidate (GSD fixture)', () => {
  assert.equal(typeof resolveSlashRoute, 'function',
    'resolveSlashRoute must be exported by 32-02 (undefined-import is the RED state)');
  const manifest = baseManifest(['gsd-debug']); // only gsd-debug present
  const result = resolveSlashRoute(DEBUG_ROLE, manifest);
  assert.ok(result, 'a resolvable capability role must return a route, not null');
  assert.equal(result.suggested_slash, 'gsd-debug',
    'highest-ranked PRESENT candidate, not a lower one, must be suggested');
});

test('Group B: same capability role resolves to its local framework-neutral equivalent (superpowers fixture)', () => {
  assert.equal(typeof resolveSlashRoute, 'function',
    'resolveSlashRoute must be exported by 32-02');
  // No `gsd-*` command present; the framework-neutral equivalent IS present.
  const manifest = baseManifest(['systematic-debugging']);
  const result = resolveSlashRoute(DEBUG_ROLE, manifest);
  assert.ok(result, 'the capability role is satisfiable via its local present equivalent');
  assert.equal(result.suggested_slash, 'systematic-debugging',
    'a capability present under a different framework must resolve to its local equivalent');
  assert.notEqual(result.suggested_slash, 'gsd-debug',
    'an absent gsd-* command must never be fabricated just because the mode is gsd-debug');
});

test('Group B: candidate set comes only from mode + resolve — no hardcoded gsd- prefix in the matcher', () => {
  assert.equal(typeof resolveSlashRoute, 'function', 'resolveSlashRoute must be exported by 32-02');
  // A custom-framework manifest with an unlisted-but-present capability: the resolver
  // must NOT invent a gsd-* slug, it must only ever consider the entry's own candidate set.
  const manifest = baseManifest(['acme-custom-debug']);
  const result = resolveSlashRoute(DEBUG_ROLE, manifest);
  assert.ok(
    result === null
    || (result.suggested_slash && result.suggested_slash.startsWith('acme-') === false
        && result.suggested_slash.match(/gsd-/i) === null),
    'a non-listed custom capability must not be fabricated into a gsd-* slash suggestion',
  );
});

// --- Group C — Fallback + generic fallback (ROUTE-03 / ROUTE-04) ------------

test('Group C: top-ranked candidate absent but lower-ranked resolve member present -> falls back to next-present', () => {
  assert.equal(typeof resolveSlashRoute, 'function', 'resolveSlashRoute must be exported by 32-02');
  // mode (gsd-debug) is ABSENT; the lower-weighted resolve member IS present.
  const manifest = baseManifest(['gsd-plan-phase']);
  const entry = {
    ...DEBUG_ROLE,
    mode: 'gsd-debug',
    resolve: [
      { name: 'gsd-debug', weight: 1.0 },     // absent
      { name: 'gsd-plan-phase', weight: 0.8 }, // present but lower-ranked
    ],
  };
  const result = resolveSlashRoute(entry, manifest);
  assert.ok(result, 'a present lower-ranked candidate must produce a route (not silence)');
  assert.equal(result.suggested_slash, 'gsd-plan-phase',
    'must fall back to the next-best PRESENT entry, not the absent top candidate');
  assert.notEqual(result.tier, 'low', 'a successful fallback must not be reported as silent-low');
});

test('Group C: no resolve member nor mode present -> null / silent-low, never a dead injection', () => {
  assert.equal(typeof resolveSlashRoute, 'function', 'resolveSlashRoute must be exported by 32-02');
  const manifest = baseManifest([]); // nothing resolvable at all
  const entry = { ...DEBUG_ROLE, resolve: [] };
  const result = resolveSlashRoute(entry, manifest);
  assert.ok(
    result === null || (result && result.tier === 'low' && !result.suggested_slash),
    'zero-resolvable intent must be silent (null or tier=low with no slash injection)',
  );
});

test('Group C: high-confidence empty-resolve emits at most ONE generic native fallback line, never a fabricated capability name', () => {
  assert.equal(typeof resolveSlashRoute, 'function', 'resolveSlashRoute must be exported by 32-02');
  const manifest = baseManifest([]); // empty resolve set AND no mode candidate present
  const entry = { ...DEBUG_ROLE, resolve: [] };
  const result = resolveSlashRoute(entry, manifest, { tier: 'high' });
  assert.ok(result, 'a high-confidence intent must still produce a generic fallback shape');
  const lines = Array.isArray(result.fallback_lines) ? result.fallback_lines : [];
  assert.ok(lines.length <= 1,
    `at most one generic native-capability fallback line allowed (got ${lines.length})`);
  for (const line of lines) {
    assert.ok(!/\/?(gsd|command)-/i.test(line),
      `generic fallback must not fabricate a framework capability name: ${line}`);
  }
});
