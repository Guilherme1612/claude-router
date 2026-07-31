# Phase 28: Coverage Audit-Guard - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/coverage/audit.mjs` | utility | transform | `src/registry/validate.mjs` and live `router.mjs` coverage helpers | exact composite |
| `build-manifest.mjs` | service / CLI | batch + file-I/O | its existing manifest publication tail | exact |
| `coverage-baseline.json` | config | transform input | `~/.claude/router/mode-map.json` | role-match |
| `coverage-report.json` | generated config / evidence | batch + file-I/O | `claude-inventory-manifest.json` publication | role/data-flow match |
| `~/.claude/hooks/router.mjs` | middleware / hook | request-response + file-I/O | existing `checkFreshness()` and `main()` composition | exact |
| `src/lifecycle/router-lifecycle.mjs` | service / installer | batch + file-I/O | its existing owned-bundle deployment and verification-fixture lists | exact |
| `tests/router.coverage-audit.test.mjs` | test | transform + subprocess | `tests/router.coverage.test.mjs`, `tests/router.route-targets.test.mjs`, and `tests/router.build-manifest.test.mjs` | exact composite |
| `tests/router.freshness.test.mjs` | test | request-response + subprocess | its existing freshness and hook subprocess cases | exact |
| `tests/router.installer-coexistence.test.mjs` | test | batch + file-I/O | its existing five-verb, dual-runtime coexistence matrix | exact |

## Pattern Assignments

### `src/coverage/audit.mjs` (utility, transform)

**Analogs:** `src/registry/validate.mjs` for a pure deterministic policy module; `~/.claude/hooks/router.mjs` for current inventory and route-target semantics.

**Imports and pure-module pattern** (`src/registry/validate.mjs`, lines 1-9):

```javascript
import { createHash } from 'node:crypto';
import { stableStringify } from './schema.mjs';

const hash = value => createHash('sha256')
  .update(typeof value === 'string' ? value : stableStringify(value))
  .digest('hex');
```

Keep the audit module free of filesystem writes and process exit behavior. Export pure functions accepting `{ manifest, modeMap, baseline }`; return stable JSON-ready records.

**Existing classification precedence seam** (`~/.claude/hooks/router.mjs`, lines 538-552):

```javascript
export function classifyInventoryEntry(category, entry, mapped = new Set()) {
  if (category === 'hooks') return 'diagnostic_only';
  if (category === 'mcp_servers' || category === 'unwired_mcp_refs') return 'dependency_only';
  if (category === 'project_scoped_skills') return 'project_scoped';
  if (category === 'agents' && hasMissingMcp(entry)) return 'blocked_missing_mcp';
  if (isProjectScoped(entry)) return 'project_scoped';
  if (['skills', 'plugin_skills', 'agents_store_skills', 'agents', 'commands'].includes(category)) {
    return isMapped(entry, mapped) ? 'routeable' : 'unmapped';
  }
  return 'excluded';
}
```

Translate this precedence to Phase 28 taxonomy: hooks → `expected_hook`; missing-MCP agents → `expected_warn_mcp`; project scope → `expected_scope_project`; valid typed targets → mapped; baseline-only categories → `expected_bm25_only` / `expected_phase_internal`; otherwise `gap`.

**Typed target indexes to reuse/extract** (`~/.claude/hooks/router.mjs`, lines 596-624):

```javascript
function namesFromEntries(entries, predicate = () => true) {
  return new Set((entries || [])
    .filter(predicate)
    .map((entry) => stripLeadingSlash(entry?.name || entry?.id))
    .filter(Boolean));
}

export function buildTargetIndexes(manifest) {
  return {
    commands: namesFromEntries(manifest?.commands),
    globalSkills: namesFromEntries(manifest?.skills),
    pluginSkills: namesFromEntries(manifest?.plugin_skills),
    globalAgentsStoreSkills: namesFromEntries(manifest?.agents_store_skills, globalAgentsStore),
    safeAgents: namesFromEntries(manifest?.agents, safeAgent),
    blockedAgents: namesFromEntries(manifest?.agents, blockedAgent),
  };
}
```

Do not reuse `mappedTargets()` unchanged: lines 515-530 include route `id`, which can falsely cover a manifest capability. Use typed references only: `mode` → command, `recommended_skills` → skill, `recommended_agents` → agent.

**Forward orphan validation pattern** (`~/.claude/hooks/router.mjs`, lines 636-689):

```javascript
const routeIds = new Set((modeMap?.entries || [])
  .map((entry) => stripLeadingSlash(entry?.id)).filter(Boolean));

if (entry.invoke_kind === 'slash') {
  const mode = stripLeadingSlash(entry.mode);
  const id = stripLeadingSlash(entry.id);
  const intentionalRouteAlias = mode && mode !== id && routeIds.has(mode);
  const intentionalSchemaRoute = mode && mode === id && modeMap?.schema_version;
  if (!mode || (!indexes.commands.has(mode) && !intentionalRouteAlias && !intentionalSchemaRoute)) {
    rows.push(routeDiagnostic(entry, 'stale_target', mode || '<mode>',
      'slash mode must match a manifest command or intentional mode-map route id'));
  }
}
```

Preserve the existing alias/schema exceptions and blocked-agent checks. Baselines must never suppress these forward diagnostics.

**Deterministic transform pattern** (`src/registry/validate.mjs`, lines 69-97):

```javascript
for (const key of Object.keys(value).sort()) {
  output[key] = canonicalSemanticValue(value[key], key, depth + 1);
}
return {
  passed,
  reason_code: passed ? 'passed' : 'semantic_bytes_mismatch',
  semantic_bytes: candidateBytes,
  candidate_fingerprint: hash(candidateBytes),
};
```

Sort report records by category then ID, and diagnostics by code/route/target before returning. Use `{ category, id }` as identity; serialize `category:id` only for baseline lookup or display.

**Validation/error handling:** malformed inputs should produce explicit diagnostics or safe empty collections; no throw should escape for optional baseline data. Do not let a malformed baseline convert a real gap into acknowledged coverage.

---

### `build-manifest.mjs` (service/CLI, batch + file-I/O)

**Analog:** existing builder configuration, tolerant JSON reads, and atomic publication.

**Environment override pattern** (lines 29-39):

```javascript
const CLAUDE = process.env.ROUTER_CLAUDE_HOME || join(HOME, '.claude');
const OUT = process.env.ROUTER_MANIFEST_OUT || join(SCRIPT_DIR, 'claude-inventory-manifest.json');
const MODE_MAP_PATH = process.env.ROUTER_MODE_MAP_PATH || join(CLAUDE, 'router', 'mode-map.json');
```

Add sibling `ROUTER_COVERAGE_REPORT_PATH` and `ROUTER_COVERAGE_BASELINE_PATH` overrides for isolated subprocess tests. Parse `process.argv.includes('--strict-coverage')` once.

**Tolerant JSON input pattern** (lines 41-44):

```javascript
function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
```

Use this for optional mode-map/baseline reads, while making malformed baseline state visible in report diagnostics.

**Atomic publication seam** (lines 532-545):

```javascript
mkdirSync(dirname(OUT), { recursive: true });
const tmp = `${OUT}.tmp.${process.pid}`;
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
renameSync(tmp, OUT);

if (modeMapSize > MODE_MAP_SIZE_CEILING) {
  console.error(`mode-map.json exceeds 30KB: ${modeMapSize} bytes`);
  process.exitCode = 1;
}
```

Immediately after `renameSync(tmp, OUT)`, audit the exact in-memory `manifest`, atomically write the report with the same temp-plus-rename pattern, then apply strict exit status. Always publish the report before setting `process.exitCode = 1`; never call `process.exit(1)`.

---

### `coverage-baseline.json` (config, transform input)

**Analog:** `~/.claude/router/mode-map.json`.

**Versioned deterministic JSON pattern** (`mode-map.json`, lines 1-7, 36-65):

```json
{
  "schema_version": 2,
  "entries": [
    {
      "id": "gsd-debug",
      "mode": "gsd-debug",
      "invoke_kind": "slash",
      "recommended_skills": ["systematic-debugging"],
      "recommended_agents": []
    }
  ]
}
```

Use a small versioned object with a sorted `entries` array. Each acknowledgement needs category, ID, one allowed `expected_*` classification, and a non-empty reason. No blanket ignored-name list.

---

### `coverage-report.json` (generated evidence, batch + file-I/O)

**Analog:** manifest generation in `build-manifest.mjs`, lines 127-154 and 509-536.

```javascript
const manifest = {
  generated_at_runtime_note: 'static snapshot ...',
  skills: [],
  agents: [],
  counts: {},
};

manifest.counts = {
  skills: manifest.skills.length,
  agents: manifest.agents.length,
};
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
renameSync(tmp, OUT);
```

Follow the same top-level shape convention: schema/version metadata, deterministic record arrays, diagnostics, counts, and `unacknowledged_gaps`. Persist IDs/categories/reasons/fingerprints only—not full manifest records, raw descriptions, prompts, or secrets.

---

### `~/.claude/hooks/router.mjs` (middleware/hook, request-response + file-I/O)

**Analog:** existing fail-open freshness helper and final context composer.

**Freshness helper pattern** (lines 396-412):

```javascript
export function checkFreshness(manifestPath = MANIFEST, buildScriptPath = BUILD_SCRIPT) {
  try {
    if (!existsSync(manifestPath)) return { status: 'manifest_missing' };
    const manifestMtime = statSync(manifestPath).mtimeMs;
    if (builderNewer) return { status: 'stale', reminder: STALE_REMINDER };
    return { status: 'fresh' };
  } catch {
    return { status: 'error' };
  }
}
```

Add a separate exported coverage-report freshness helper or extend this result without changing manifest-age semantics. It should perform only existence/stat checks and return the same fixed one-line reminder for missing, older-than-manifest, or stat error. It must not parse JSON or run the audit on the prompt path.

**Composition pattern** (lines 2800-2814):

```javascript
const decision = inspectDecision(prompt, { /* existing options */ });
const composed = [decision.final_injected_context, additionalContext]
  .filter(Boolean).join('\n\n');
if (composed) emit(composed);
return { additionalContext: composed };
```

Append the coverage reminder through this existing composition channel. Do not early-return and replace a valid route/context block solely because coverage evidence is stale.

**Fail-open boundary** (lines 2793-2797):

```javascript
} catch {
  state.tier = 'error';
  state.passThroughReason = 'error';
  return finish();
}
```

Coverage freshness errors must remain non-blocking, exit 0, and never emit `decision: "block"`.

---

### `tests/router.coverage-audit.test.mjs` (test, transform + subprocess)

**Analogs:** existing coverage fixtures, route-target fixtures, and builder subprocess harness.

**Built-in test/import convention** (`tests/router.coverage.test.mjs`, lines 4-17):

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  mappedTargets,
  classifyInventoryEntry,
  auditInventoryCoverage,
} = await import(HOOK);
```

For the new pure module, import it from a repository-relative URL rather than importing the installed hook.

**Typed fixture pattern** (`tests/router.route-targets.test.mjs`, lines 29-39):

```javascript
return {
  skills: [{ id: 'systematic-debugging', name: 'systematic-debugging', scope: 'global' }],
  commands: [{ id: 'gsd-debug', name: 'gsd-debug' }],
  agents: [
    { id: 'safe-agent', name: 'safe-agent', requires_mcp_not_in_manifest: [] },
    { id: 'blocked-agent', name: 'blocked-agent', requires_mcp_not_in_manifest: ['context7'] },
  ],
};
```

Use compact fixtures covering every taxonomy value, a route-ID collision, typed forward/reverse orphans, stale baseline entries, and stable sort order.

**Builder subprocess pattern** (`tests/router.build-manifest.test.mjs`, lines 37-49):

```javascript
function runBuilder(root, extraEnv = {}) {
  const env = {
    ROUTER_CLAUDE_HOME: join(root, '.claude'),
    ROUTER_MANIFEST_OUT: out,
    ...extraEnv,
  };
  const r = spawnSync(NODE, [BUILDER], { env, encoding: 'utf8', timeout: 30_000 });
  return { r, out };
}
```

Extend this shape with isolated mode-map, baseline, and report paths. Assert the report exists even when `--strict-coverage` returns non-zero.

**Idempotence assertion** (`tests/router.build-manifest.test.mjs`, lines 135-145):

```javascript
const bytes1 = readFileSync(out, 'utf8');
runBuilder(root);
const bytes2 = readFileSync(out, 'utf8');
assert.equal(bytes1, bytes2, 'idempotent re-run must produce identical bytes');
```

Apply the same byte comparison to `coverage-report.json`; avoid volatile timestamps in deterministic content or isolate them from the compared payload.

---

### `tests/router.freshness.test.mjs` (test, request-response + subprocess)

**Analog:** the file's existing mtime fixtures and hook invocation.

**mtime fixture pattern** (lines 38-52):

```javascript
writeFileSync(manifest, '{}');
writeFileSync(buildScript, '// builder');
utimesSync(manifest, new Date(oldMs), new Date(oldMs));
utimesSync(buildScript, new Date(newMs), new Date(newMs));
const r = m.checkFreshness(manifest, buildScript);
assert.equal(r.status, 'stale');
assert.equal(r.reminder, EXPECTED_REMINDER);
```

Add report missing, report older, equal/newer, and stat-error cases using the same temp-directory and `utimesSync` approach.

**Hook subprocess contract** (lines 104-113):

```javascript
const r = spawnSync(NODE, [HOOK], {
  input: JSON.stringify({ prompt: 'real prompt that is not trivial' }),
  encoding: 'utf8',
  env: { ...process.env, ROUTER_TEST_FRESHNESS: 'stale' },
});
assert.equal(r.status, 0);
assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
assert.equal(out.hookSpecificOutput.additionalContext, EXPECTED_REMINDER);
```

Add a route-producing case and assert the coverage reminder appears exactly once alongside—not instead of—the route context.

---

### `src/lifecycle/router-lifecycle.mjs` (service/installer, batch + file-I/O)

**Analog:** the file's existing explicit production-bundle lists, two-runtime expansion, preflight verification, and ownership protections.

**Preflight-before-mutation and ownership pattern** (lines 294-335):

```javascript
if (!existsSync(p.sourceRouter) || !statSync(p.sourceRouter).isFile()) {
  throw new Error(`router source missing: ${p.sourceRouter}`);
}

// Complete preflight before the first mutation.
const sourceBytes = readFileSync(p.sourceRouter);
const sourceFingerprint = fingerprint(sourceBytes);
const settings = validatedSettings(p.settingsPath);
const codexSettings = validatedSettings(p.codexHooksPath);
const existingManifest = readJson(p.manifestPath, null, 'ownership manifest');
if (!existingManifest && (
  existsSync(p.routerPath) || existsSync(p.codexRouterPath) || existsSync(p.codexMarkerPath)
)) {
  throw new Error('existing router artifact is not owned by this installer; refusing to overwrite it');
}
const routerHealthy = fileMatches(p.routerPath, sourceFingerprint);
const codexRouterHealthy = fileMatches(p.codexRouterPath, sourceFingerprint);
```

Read and fingerprint every new deployable coverage artifact before the first write. Preserve the existing refusal to overwrite unowned runtime files; coverage deployment must remain inside installer-owned roots.

**Explicit bundle allowlist pattern** (lines 352-381):

```javascript
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(sourceRoot, '..');
const moduleNames = [
  'registry/build.mjs',
  'registry/validate.mjs',
  'prompt/compile-index.mjs',
  'prompt/publish-index.mjs',
];
const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
  moduleNames.map(name => [
    join(runtimeRoot, 'modules', name),
    readFileSync(join(sourceRoot, name)),
  ])
));
```

Add `coverage/audit.mjs` to `moduleNames`; do not create a second deployment loop. This automatically deploys the shared audit module to both Claude and Codex owned bundles and to the existing `src/` compatibility mirror.

**Gate entry and verification fixture pattern** (lines 382-420):

```javascript
const gateEntryNames = [
  'router.calibrate.mjs',
  'calibration-tasks.json',
  'build-manifest.mjs',
];
const gateFixtureNames = [
  'tests/router.route-targets.test.mjs',
  'tests/router.privacy.test.mjs',
];
const gateFixtureValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => [
  ...gateEntryNames.map(name => [join(runtimeRoot, name), readFileSync(join(repoRoot, name))]),
  ...gateFixtureNames.map(name => [join(runtimeRoot, name), readFileSync(join(repoRoot, name))]),
  ...moduleNames.map(name => [join(runtimeRoot, 'src', name), readFileSync(join(sourceRoot, name))]),
]);
```

Add the Phase 28 verification test to `gateFixtureNames` only if production verification invokes it. Keep `build-manifest.mjs` in `gateEntryNames`; its new relative import of `src/coverage/audit.mjs` resolves through the already-deployed `src/` mirror.

**Atomic, fingerprinted generation verification pattern** (lines 94-124):

```javascript
const routerBytes = readFileSync(p.sourceRouter);
const generationId = `g1-${fingerprint(routerBytes).slice(0, 16)}`;
durableAtomicWrite(join(stagingRoot, 'router.mjs'), routerBytes);
durableAtomicWrite(join(stagingRoot, 'manifest.json'), JSON.stringify({
  schema_version: 1,
  state: 'complete',
  generation_id: generationId,
  files: [{ path: 'router.mjs', fingerprint: fingerprint(routerBytes) }],
}, null, 2) + '\n');
renameSync(stagingRoot, finalRoot);
if (!verifiedGeneration(p, { schema_version: 1, generation_id: generationId })) {
  throw new Error('generation verification failed');
}
```

Coverage files that become installer-owned bundle inputs must be included in the same manifest/fingerprint verification path rather than copied opportunistically after activation.

---

### `tests/router.installer-coexistence.test.mjs` (test, batch + file-I/O)

**Analog:** the file's existing dual-runtime fixtures, unrelated-byte snapshots, install verification, and lifecycle matrix.

**Dual-runtime owned/unowned fixture pattern** (lines 18-70):

```javascript
const root = mkdtempSync(join(tmpdir(), 'router-coexist-'));
const claudeRoot = join(root, '.claude');
const codexRoot = join(root, '.codex');
const unrelatedFiles = {
  claudeSettings: join(claudeRoot, 'settings.json'),
  codexConfig: join(codexRoot, 'config.toml'),
};

return {
  root, claudeRoot, codexRoot, sourceRouter,
  ownedRoot: join(claudeRoot, 'router'),
  codexOwnedRoot: join(codexRoot, 'router'),
  unrelatedFiles,
};
```

Seed the Phase 28 source module/baseline inputs in the repository fixture seam, then assert installed outputs under both owned roots. Do not place generated coverage artifacts among unrelated user files.

**Byte-identical coexistence assertion** (lines 73-85):

```javascript
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
```

Use byte comparisons, not existence alone, to prove coverage deployment does not alter settings, plugins, skills, notes, or Codex configuration.

**Installer activation seam** (lines 88-99):

```javascript
return {
  claudeRoot: f.claudeRoot,
  codexRoot: f.codexRoot,
  sourceRouter: f.sourceRouter,
  testMode: true,
  verificationRunners: stubVerificationRunners,
  launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
};
```

Keep installer coverage checks on the existing in-process verification seam. Do not bypass activation or add a separate fake installer path.

**Installed-bundle verification pattern** (lines 176-195):

```javascript
const result = await installRouter(installOptions(f, holder));
assert.ok(result.status === 'installed' || result.status === 'repaired');
assert.equal(existsSync(f.routerPath), true);
assert.equal(existsSync(join(f.codexOwnedRoot, 'installed.json')), true);
assert.equal(routerBindingPresent(f), true);
nonRouterHooksPreserved(f);
assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
```

Extend this assertion block to verify `modules/coverage/audit.mjs` and its `src/coverage/audit.mjs` compatibility mirror exist in both `ownedRoot` and `codexOwnedRoot`. If the baseline is installer-owned, verify its exact installed path and bytes too.

**Lifecycle/coexistence matrix pattern** (lines 459-479):

```javascript
for (const variant of ['claude', 'codex', 'together']) {
  test(`install verb across ${variant} fixture: install + uninstall preserves unrelated state`, async () => {
    await installRouter(installOptions(f, holder));
    assertUnrelatedUnchanged(f, preSnapshot, { excludeSettings: true });
    await uninstallRouter(f);
    assert.equal(existsSync(f.ownedRoot), false);
    assert.deepEqual(readFileSync(f.settingsPath), preSettingsBytes);
    assertUnrelatedUnchanged(f, preSnapshot);
  });
}
```

Apply coverage bundle assertions across Claude-only, Codex-only, and combined fixtures. Verify install/reinstall restores the files, upgrade replaces them through the normal transaction, and uninstall removes only owned copies.

## Shared Patterns

### Stable Identity and Ordering

**Sources:** `src/registry/validate.mjs` lines 69-97; builder idempotence test lines 135-145.  
**Apply to:** audit module, baseline, report, coverage tests.

Use composite `{ category, id }` identity and explicit sorting before serialization. Do not depend on filesystem traversal or `Set` insertion order.

### Input Validation

**Source:** `~/.claude/hooks/router.mjs` lines 641-649.

```javascript
if (!entry?.id) shapeErrors.push(['<entry>', 'missing id']);
if (!Array.isArray(entry?.recommended_skills)) {
  shapeErrors.push(['recommended_skills', 'must be an array']);
}
```

Validate baseline classifications/reasons and mode-map target shapes. A baseline may acknowledge reverse gaps only; it cannot suppress malformed or stale forward targets.

### Atomic File Publication

**Source:** `build-manifest.mjs` lines 532-536.

```javascript
mkdirSync(dirname(OUT), { recursive: true });
const tmp = `${OUT}.tmp.${process.pid}`;
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
renameSync(tmp, OUT);
```

Apply to manifest and coverage-report writes. The manifest is renamed first; the report is computed from that in-memory manifest and renamed second.

### Strict Gate Error Handling

**Source:** `build-manifest.mjs` lines 541-545.

```javascript
if (modeMapSize > MODE_MAP_SIZE_CEILING) {
  console.error(`mode-map.json exceeds 30KB: ${modeMapSize} bytes`);
  process.exitCode = 1;
}
```

Strict coverage sets `process.exitCode = 1` only when `unacknowledged_gaps` is non-empty, after report publication.

### Hook Fail-Open and Context Coexistence

**Sources:** `~/.claude/hooks/router.mjs` lines 396-412 and 2800-2814; `tests/router.failopen.test.mjs` lines 70-86.  
**Apply to:** hook modification and freshness tests.

Catch filesystem errors, return a reminder status, emit through the single existing `additionalContext` composer, and retain exit 0/no-block behavior.

## No Analog Found

None. Every proposed file has an exact or strong role/data-flow analog. The precise Phase 28 taxonomy and baseline schema are new policy, but their implementation shape should copy the pure validation, versioned JSON, deterministic ordering, and fixture patterns above.

## Metadata

**Analog search scope:** repository `src/`, `tests/`, root builder; installed `~/.claude/hooks/router.mjs` and `~/.claude/router/mode-map.json`  
**Strong analog files read:** 10  
**Pattern extraction date:** 2026-07-29
