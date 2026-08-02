# Phase 30: Foundation — Manifest Fingerprint + Watcher Narrowing - Pattern Map

**Mapped:** 2026-07-31
**Files analyzed:** 8 (3 source, 1 builder, 4 test)
**Analogs found:** 7 / 8 exact (self-modification); 1 no-analog

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `tests/router.mjs.snapshot` (router hook, installed to `~/.claude/hooks/router.mjs`) | controller / hook | request-response | self — `cacheKey` L1639-1650, call site L2705-2733, `loadManifest` L476-479 | exact (self-mod) |
| `src/registry/fingerprint.mjs` | service / utility | transform | self — `hash` L10-12, `buildSubtreeHashes` L29-47, `scanFingerprintTree` L119-212, `saveFingerprintState` L264-282 | exact (self-mod) |
| `build-manifest.mjs` | utility / builder | batch / transform | self — `installed_plugins.json` parse L267-281, atomic manifest write L541-545 | exact (self-mod) |
| `src/lifecycle/router-lifecycle.mjs` | config | config → watcher | self — controller `roots` array L430-436; consumes `ignoredRelativePaths`/`includeRelativePaths` implemented in `src/registry/watcher.mjs` L318-329 | exact (self-mod) |
| `tests/router.cache.test.mjs` | test | test | self — mtime-fold cacheKey tests L28-52 | exact (self-mod) |
| `tests/router.mutation-safety.test.mjs` | test | test | self — SAF-01 unit L44-54 + integration L239-270 | exact (self-mod) |
| `tests/router.build-manifest.test.mjs` | test | test | self — builder spawn + `TOP_KEYS` assert L13-45 (add `manifest_fingerprint` to `TOP_KEYS`) | exact (self-mod) |
| `tests/router.registry-watcher.test.mjs` | test | test | self — watcher roots / dirty-roots tests | exact (self-mod) |

---

## Pattern Assignments

### `tests/router.mjs.snapshot` — router hook cacheKey (controller, request-response)

**IMPORTANT for planner:** the router hook's repo source is **`tests/router.mjs.snapshot`** (138,120 bytes; line-identical to the installed `~/.claude/hooks/router.mjs`). `install-router.mjs:61,64` copies `sourceRouter` (`tests/router.mjs.snapshot`) → `routerPath` (`~/.claude/hooks/router.mjs`). Tests import the INSTALLED file, so a snapshot edit is not live until re-installed. CONTEXT.md cites `router.mjs:1648` — that is the snapshot/installed line.

**Analog:** the hook itself.

**Cache key definition** (`tests/router.mjs.snapshot:1639-1650`) — the 7-position mtime fold to be replaced by a single `manifest_fingerprint` epoch slot:
```javascript
// Cache key (RTE-07 / SAF-01). sha256(normalizedPrompt + "|" + intentKeywords.join(" ")
// + "|" + modeMapMtime + "|" + manifestMtime + "|" + graphMtime + "|" + surfaceMtime
// + "|" + weightsMtime). Folding mtimes means a mode-map edit, manifest rebuild,
// graph.json rebuild for cwd, surface profile change, OR weights.json edit
// invalidates stale entries (key changes). graphMtime/surfaceMtime/weightsMtime
// default to 0 to keep older callers backward-compatible.
export function cacheKey(normalizedPrompt, intentKeywords, modeMapMtime, manifestMtime, graphMtime = 0, surfaceMtime = 0, weightsMtime = 0) {
  const np = String(normalizedPrompt || '');
  const ik = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  const joined = [np, ik, modeMapMtime, manifestMtime, graphMtime, surfaceMtime, weightsMtime].join('|');
  return createHash('sha256').update(joined).digest('hex');
}
```

**Call site** (`tests/router.mjs.snapshot:2705-2733`) — where the mtimes are read and folded; `manifestMtime` comes from `statSync(opts.manifestPath).mtimeMs` and must become `opts.manifestFingerprint ?? manifest.manifest_fingerprint` (read via `loadManifest`):
```javascript
const manifestMtime = opts.manifestMtime ?? (Object.hasOwn(opts, 'manifest') ? 0 : statSync(opts.manifestPath).mtimeMs);
const modeMapMtime = opts.modeMapMtime ?? (Object.hasOwn(opts, 'modeMap') ? 0 : statSync(opts.modeMapPath).mtimeMs);
...
const sig = cacheKey(state.normalizedPrompt, [], modeMapMtime, manifestMtime, graphMtime, surfaceMtime, weightsMtime);
state.cache.key_prefix = sig.slice(0, 8);
state.cache.invalidation_mtimes = { mode_map: modeMapMtime, manifest: manifestMtime, graph: graphMtime, surface: surfaceMtime, weights: weightsMtime };
...
state.routing_version = `${modeMapMtime}:${manifestMtime}:${weightsMtime}`;
```

**Manifest read helper** (`tests/router.mjs.snapshot:476-479`) — the fingerprint epoch is read from the loaded manifest, never stat'd:
```javascript
export function loadManifest(path = MANIFEST) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
```
(`MANIFEST = join(ROUTER_DIR, 'claude-inventory-manifest.json')` at L76.)

**Best-effort stat-read pattern to mirror** for the composite inputs (`readWeightsMtime`, `tests/router.mjs.snapshot:1683-1690`) — mode-map/weights hashes would follow this try/catch-return-default shape:
```javascript
function readWeightsMtime(weightsPath = WEIGHTS) {
  try {
    if (!existsSync(weightsPath)) return 0;
    return statSync(weightsPath).mtimeMs;
  } catch {
    return 0;
  }
}
```

### `src/registry/fingerprint.mjs` (service/utility, transform)

**Analog:** itself. The composite-epoch hash builds on `hash()` + `buildSubtreeHashes`; the state persistence follows `saveFingerprintState`.

**Content-hash primitive** (`src/registry/fingerprint.mjs:10-12`) — the sha256-over-stableStringify pattern used everywhere:
```javascript
function hash(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
```

**Merkle subtree builder** (`src/registry/fingerprint.mjs:29-47`) — the existing live-watcher diff source; the composite epoch is a single hash over its root hashes plus mode-map/weights:
```javascript
function buildSubtreeHashes(roots, entries) {
  const nodes = [];
  for (const logicalRoot of roots) {
    ...
    nodes.push({ logical_root: logicalRoot, relative_path: relativePath, hash: hash(descendants) });
  }
  return nodes;
}
```

**Canonical payload + top-level hash** (`src/registry/fingerprint.mjs:193-211`) — how the fingerprint tree computes its final digest over the full canonical object:
```javascript
const canonical = {
  schema_version: SCHEMA_VERSION, roots, root_hashes: rootHashes,
  subtree_hashes: subtreeHashes, entries, diagnostics,
};
...
return { ...canonical, logicalRoots, hash: hash(canonical) };
```

**Atomic state persistence** (`src/registry/fingerprint.mjs:264-282`) — temp+rename with pid+hash8 suffix and fsync; the pattern to reuse if the composite epoch is persisted:
```javascript
export async function saveFingerprintState(path, state) {
  const error = validateState(state, state?.roots || []);
  if (error) throw new TypeError(`cannot save fingerprint state: ${error}`);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${process.pid}.${createHash('sha256').update(path).digest('hex').slice(0, 8)}`;
  try {
    const handle = await open(temporary, 'w');
    try { await handle.writeFile(`${stableStringify(state)}\n`, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, path);
  } catch (error) { await rm(temporary, { force: true }); throw error; }
}
```

**Noise-file ignore already supported** in the walker (`src/registry/fingerprint.mjs:73-75`) — `ignoredRelativePaths` prefix filtering, so the watcher-noise narrowing only needs new ignore prefixes in the roots config:
```javascript
if ((options.ignoredRelativePaths || []).some(prefix => (
  relativePath === prefix || relativePath.startsWith(`${prefix}/`)
))) continue;
```

### `build-manifest.mjs` (utility/builder, batch/transform)

**Analog:** itself. Emit `manifest_fingerprint` as a new top-level key right before the atomic write.

**installed_plugins.json parsing** (`build-manifest.mjs:267-281`) — already authoritative; plugin add/remove feeds the fingerprint but must NOT dirty watcher roots:
```javascript
// INSTALLED PLUGINS — plugins/installed_plugins.json
const ip = readJson(join(CLAUDE, 'plugins', 'installed_plugins.json'), {}) || {};
const installedPlugins = [];
for (const [key, records] of Object.entries(ip.plugins || {})) {
  const r = (records && records[0]) || {};
  installedPlugins.push({
    name: key.split('@')[0],
    marketplace: key.split('@').slice(1).join('@'),
    version: r.version || '',
    scope: r.scope || '',
    install_path: r.installPath || '',
    installed_at: r.installedAt || '',
  });
}
manifest.installed_plugins = installedPlugins;
```
NOTE: `installed_at` (line 278) is a timestamp — the composite fingerprint MUST exclude it (timestamps excluded), e.g. hash only `name`/`marketplace`/`version`/`scope`.

**Emission point** (`build-manifest.mjs:541-545`) — atomic write; insert the fingerprint computation just before (hash over semantic fields only: skills/agents/commands/installed_plugins identities, excluding `path`, `installed_at`, `counts`, `generated_at_runtime_note`):
```javascript
// Atomic write (tmp + rename).
mkdirSync(dirname(OUT), { recursive: true });
const tmp = `${OUT}.tmp.${process.pid}`;
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
renameSync(tmp, OUT);
```

**Counts/diagnostic summary block** (`build-manifest.mjs:575-583`) — where the build echoes output; add the emitted fingerprint here for test assertions:
```javascript
console.log(JSON.stringify(manifest.counts, null, 2));
console.log(`manifest written: ${OUT}`);
```

**Mode-map read for hashing** (`build-manifest.mjs:547`) — the builder already reads mode-map (`readJson(MODE_MAP_PATH, null)`); reuse the same pattern to hash mode-map + weights into the composite epoch:
```javascript
const coverageModeMap = readJson(MODE_MAP_PATH, null);
```

### `src/lifecycle/router-lifecycle.mjs` (config, config → watcher)

**Analog:** itself. This is where watcher scan roots live; the noise ignore-list (sqlite/WAL, plugin-catalog caches) is added to each root's `ignoredRelativePaths`.

**Watcher roots definition** (`src/lifecycle/router-lifecycle.mjs:425-437`) — extend the existing `ignoredRelativePaths: ['router']` entries:
```javascript
roots: [
  { logicalRoot: 'claude_global', path: p.claudeRoot, ignoredRelativePaths: ['router'] },
  { logicalRoot: 'codex_home', path: p.codexRoot, ignoredRelativePaths: ['router'] },
  ...(options.projectRoot ? [
    { logicalRoot: `project:${options.scopeId || 'project'}:claude`, path: join(resolve(options.projectRoot), '.claude'), watchPath: resolve(options.projectRoot), includeRelativePaths: ['.claude'] },
    { logicalRoot: `project:${options.scopeId || 'project'}:codex`, path: join(resolve(options.projectRoot), '.codex'), watchPath: resolve(options.projectRoot), includeRelativePaths: ['.codex'] },
  ] : []),
],
```

**Noise filtering already enforced** in the watcher event path (`src/registry/watcher.mjs:318-329`) — the per-root `ignoredRelativePaths` filter is live; only new prefix values are needed, no watcher core change:
```javascript
const matched = watchedRoots.filter(root => {
  if (relative === null) return true;
  const included = !(root.includeRelativePaths || []).length
    || root.includeRelativePaths.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`));
  const ignored = (root.ignoredRelativePaths || []).some(prefix => (
    relative === prefix || relative.startsWith(`${prefix}/`)
  ));
  return included && !ignored;
}).map(root => root.logicalRoot);
if (matched.length) markDirty(matched, relative === null, relative === null ? 'ambiguous-event' : 'filesystem-event');
```

### `tests/router.cache.test.mjs` (test)

**Analog:** itself (L28-52). Translate each mtime-fold assertion 1:1 to a fingerprint-epoch assertion (same input → same key; changed fingerprint → different key; deterministic; missing fingerprint → default).

**Import + module seam** (`tests/router.cache.test.mjs:12-14`) — tests import the INSTALLED hook, so SAF-01 epoch tests stay black-box:
```javascript
const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { cacheKey, cacheLookup, writeCache, loadCache, saveCache } = mod;
```

**The mtime-fold assertions to translate** (`tests/router.cache.test.mjs:28-52`):
```javascript
test('cacheKey: changing manifestMtime produces a different key (RTE-07 invalidation)', () => {
  const a = cacheKey('fix bug', ['fix'], 1000, 2000);
  const b = cacheKey('fix bug', ['fix'], 1000, 2001);
  assert.notEqual(a, b);
});

test('cacheKey: changing weightsMtime produces a different key (SAF-01 weights-mtime invalidation)', () => {
  const a = cacheKey('fix bug', ['fix'], 1000, 2000, 3000, 4000, 5000);
  const b = cacheKey('fix bug', ['fix'], 1000, 2000, 3000, 4000, 5001);
  assert.notEqual(a, b);
});
```

### `tests/router.mutation-safety.test.mjs` (test)

**Analog:** itself. SAF-01 unit tests (L44-54) become fingerprint-epoch tests; the SAF-01 integration test (L239-270) swaps the explicit mtime options for a fingerprint option.

**SAF-01 unit tests to translate** (`tests/router.mutation-safety.test.mjs:42-54`):
```javascript
// --- SAF-01: cacheKey folds weightsMtime as 7th positional component ---
test('SAF-01: cacheKey changing weightsMtime produces a different key (weights-mtime invalidation)', () => {
  const a = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0, 5000);
  const b = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0, 5001);
  assert.notEqual(a, b);
});

test('SAF-01 Pitfall 2: non-zero weightsMtime produces a different key from the default-0 key', () => {
  const defaultKey = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0);
  const realKey = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0, 5000);
  assert.notEqual(defaultKey, realKey);
});
```

**SAF-01 integration seam** (`tests/router.mutation-safety.test.mjs:239-265`) — `inspectDecision` accepts explicit mtime options; a fingerprint epoch option (`manifest_fingerprint`) replaces `manifestMtime`:
```javascript
test('SAF-01 integration: a weights mtime change prevents the old cached route from being served', () => withTempDir(dir => {
  const cachePath = join(dir, 'cache.json');
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(fakeManifest({ commands: ['gsd-debug'] })));
  const staleSig = cacheKey('fix cached bug', [], 1, 2, 0, 0, 10);
  const cache = writeCache({ schema_version: 1, entries: {}, order: [], size: 0 }, staleSig, { /* poisoned route */ });
  saveCache(cache, cachePath);
  const out = inspectDecision('fix cached bug', {
    cachePath, manifestPath,
    modeMapMtime: 1, manifestMtime: 2, graphMtime: 0, surfaceMtime: 0, weightsMtime: 11,
    mutateCache: false, logTelemetry: false,
  });
  assert.equal(out.cache.status, 'miss');
  assert.equal(out.cache.scoring_skipped, false);
  assert.doesNotMatch(out.final_injected_context, /POISONED-CACHE-ENTRY/);
}));
```

### `tests/router.build-manifest.test.mjs` (test)

**Analog:** itself. Add `manifest_fingerprint` to `TOP_KEYS` and assert determinism: identical rebuild → identical fingerprint; add/update/remove a skill/plugin/agent → different fingerprint.

**Builder spawn seam** (`tests/router.build-manifest.test.mjs:13-45`) — env-var HOME override; reuse for a second-run determinism assertion:
```javascript
const NODE = process.execPath;
const BUILDER = fileURLToPath(new URL('../build-manifest.mjs', import.meta.url));
const TOP_KEYS = [
  'skills', 'plugin_skills', 'agents_store_skills', 'project_scoped_skills',
  'agents', 'hooks', 'commands', 'mcp_servers', 'unwired_mcp_refs',
  'plugins_enabled', 'installed_plugins', 'plugin_manifests', 'marketplaces',
  'project_config', 'plugin_hooks', 'settings', 'claude_md', 'counts',
  'registry_scope', 'generated_at_runtime_note',
];
function runBuilder(root, extraEnv = {}) {
  const out = join(root, '.claude', 'router', 'claude-inventory-manifest.json');
  const env = {
    ROUTER_CLAUDE_HOME: join(root, '.claude'),
    ROUTER_AGENTS_SKILLS_DIR: join(root, '.agents', 'skills'),
    ...
  };
  return spawnSync(NODE, [BUILDER], { env: { ...process.env, ...env, ...extraEnv }, encoding: 'utf8' });
}
```

### `tests/router.registry-watcher.test.mjs` (test)

**Analog:** itself. Add cases: a noise file (sqlite/WAL, plugin-catalog cache) under a root does NOT mark the root dirty / does not change the fingerprint; `installed_plugins.json` change IS the authoritative plugin add/remove signal.

---

## Shared Patterns

### Content-address sha256 over stableStringify
**Source:** `src/registry/fingerprint.mjs:10-12`, `src/registry/diff.mjs:10-12`, `src/registry/watcher.mjs:25-27`
**Apply to:** composite epoch in fingerprint.mjs/build-manifest.mjs, cacheKey epoch slot
```javascript
function hash(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
```
`stableStringify` comes from `./schema.mjs` (imported as `import { stableStringify } from './schema.mjs';`).

### Atomic temp+rename write (pid-suffixed tmp)
**Source:** `build-manifest.mjs:541-545` (`${OUT}.tmp.${process.pid}`), `src/registry/fingerprint.mjs:264-282`, `src/registry/watcher.mjs:372-377`
**Apply to:** manifest fingerprint emission, any persisted epoch file
```javascript
mkdirSync(dirname(OUT), { recursive: true });
const tmp = `${OUT}.tmp.${process.pid}`;
writeFileSync(tmp, JSON.stringify(manifest, null, 2));
renameSync(tmp, OUT);
```

### Hook test import (installed path, not repo path)
**Source:** `tests/router.cache.test.mjs:12-14`, `tests/router.mutation-safety.test.mjs:11-21`
**Apply to:** all SAF-01 epoch tests
```javascript
const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
```
(Repo source is `tests/router.mjs.snapshot`; re-run install-router.mjs to stage.)

### withTempDir test harness
**Source:** `tests/router.cache.test.mjs:16-20`, `tests/router.mutation-safety.test.mjs:23-27`
**Apply to:** any epoch/SAF-01 integration test
```javascript
function withTempDir(fn) {
  const dir = join(tmpdir(), `router-cache-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}
```

### Best-effort read with try/catch default (no throw in hot path)
**Source:** `tests/router.mjs.snapshot:1655-1690` (`readGraphMtime`, `readSurfaceMtime`, `readWeightsMtime`)
**Apply to:** reading mode-map/weights hashes for the composite epoch in the hook — fail-open to a default epoch, never throw
```javascript
function readWeightsMtime(weightsPath = WEIGHTS) {
  try {
    if (!existsSync(weightsPath)) return 0;
    return statSync(weightsPath).mtimeMs;
  } catch {
    return 0;
  }
}
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Composite-epoch function over heterogeneous inputs (capability identities + `installed_plugins.json` hash + mode-map + weights) | service / utility | transform | No existing code hashes across multiple source files at once. Closest partial matches: `buildSubtreeHashes` (hashes homogeneous entry sets) and the builder's `readJson(MODE_MAP_PATH, null)` (single extra input). Recommend implementing in `src/registry/fingerprint.mjs` (reuse `hash`) with emission in `build-manifest.mjs`. |
| Calibration epoch-keyed threshold read (success criterion 4: fingerprint mismatch → mode-map defaults 0.591/0.291/0.191 win) | config | request-response | Threshold sources live in `src/health/thresholds.mjs` / `src/health/score.mjs`; no existing epoch-guarded threshold read exists. Planner should stub the fingerprint→thresholds wiring as a follow-on plan since RESEARCH.md was skipped — the composite epoch output must be plumbed before this is implementable. |

## Metadata

**Analog search scope:** `src/registry/`, `src/lifecycle/`, repo root (`build-manifest.mjs`, `install-router.mjs`), `tests/` (`router.*.test.mjs`, `router.mjs.snapshot`), installed `/Users/guilherme/.claude/hooks/router.mjs`
**Files scanned:** 16 (8 primary, 8 supporting)
**Pattern extraction date:** 2026-07-31
