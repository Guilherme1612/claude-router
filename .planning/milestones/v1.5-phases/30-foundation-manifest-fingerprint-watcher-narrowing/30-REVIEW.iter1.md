---
phase: 30-foundation-manifest-fingerprint-watcher-narrowing
reviewed: 2026-08-01T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - build-manifest.mjs
  - docs/inventory-lifecycle.md
  - src/lifecycle/router-lifecycle.mjs
  - src/registry/fingerprint.mjs
  - tests/router-graphify-integration.test.mjs
  - tests/router.build-manifest.test.mjs
  - tests/router.cache.test.mjs
  - tests/router.calibration-epoch.test.mjs
  - tests/router.inspect.test.mjs
  - tests/router.lifecycle-invc.test.mjs
  - tests/router.mjs.snapshot
  - tests/router.mutation-safety.test.mjs
  - tests/router.plugins-fingerprint.test.mjs
  - tests/router.registry-watcher.test.mjs
findings:
  critical: 0
  warning: 4
  info: 0
  total: 4
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-08-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the Phase 30 "Foundation — Manifest Fingerprint + Watcher Narrowing" work
at standard depth: the content-addressed `manifest_fingerprint` epoch
(INVC-01/INVC-02), the watcher noise-ignore prefixes (INVC-04), and the
epoch-gated calibration read (INVC-03/INVC-05).

Key verifications that PASSED:
- `tests/router.mjs.snapshot` is byte-identical to the deployed
  `~/.claude/hooks/router.mjs` (verified via `diff` — the mirror constraint is
  satisfied).
- `computeCompositeEpoch` (fingerprint.mjs) correctly strips `path` from entries
  and reduces installed plugins to `{name, marketplace, version, scope}`, so
  `installed_at`/`lastUpdated`/`installPath` never perturb the fingerprint —
  confirmed by `router.plugins-fingerprint.test.mjs`.
- `loadEpochCalibration` is genuinely fail-open (never throws, never mutates),
  and the mismatch/absent/corrupt → mode-map-defaults path is proven by
  `router.calibration-epoch.test.mjs`.
- The INVC-04 ignore lists are prefix-specific and do NOT include a bare
  `plugins` prefix, so `plugins/installed_plugins.json` stays visible to the
  watcher (authoritative plugin signal) — correct in both
  `router-lifecycle.mjs` and `router.registry-watcher.test.mjs`.

The findings below concern fresh behavioral consequences of replacing the
7-position mtime fold with the single static fingerprint: inputs that the old
live key invalidated on (mode-map, weights, graph mtime, surface) are now folded
in at *rebuild* time only, and the watcher is configured to IGNORE the directory
that holds mode-map.json and weights.json. This creates stale-cache gaps the old
code did not have.

## Warnings

### WR-01: mode-map / weights edits no longer invalidate the route cache (fingerprint never refreshes)

**File:** `src/lifecycle/router-lifecycle.mjs:438-460` and `build-manifest.mjs:546-559`
**Issue:** The old cache key folded `modeMapMtime` and `weightsMtime` *live* on
every decision, so editing `mode-map.json` or `weights.json` immediately changed
the key and invalidated cached routes. INVC-02 replaces that fold with
`manifest.manifest_fingerprint`. But mode-map and weights only enter the
fingerprint when `build-manifest.mjs` actually re-runs (they are read at build
time via `readJson(MODE_MAP_PATH, ...)` / `readJson(WEIGHTS_PATH, ...)`,
build-manifest.mjs:546-559), and the watcher's `ignoredRelativePaths` for both
`claude_global` and `codex_home` include the entire `'router'` prefix
(router-lifecycle.mjs:439, 451). `mode-map.json` and `weights.json` live under
`~/.claude/router/`, so their edits are explicitly ignored and never trigger a
rebuild. The manifest is a static snapshot rebuilt only at install/manual/
staleness-reminder (which reminds but does not rebuild). Result: after a
mode-map or weights edit, the hook reads the new mode-map/weights fresh (so
thresholds/logic change) but the cache key stays on the old fingerprint, so
previously-cached routes computed under the old mode-map are still served as
HITs. This is a correctness regression versus the prior mtime fold for the
router's most important routing input. Note `routeTargetsExist` only guards
against removed targets, not changed mode-map routing, so it does not cover this.
**Fix:** Either fold a live mode-map/weights content hash (not mtime) into the
key in addition to the manifest fingerprint, or have the watcher treat
`router/mode-map.json` and `router/weights.json` (and `router/calibration.json`)
as dirtying signals so a rebuild + fingerprint refresh occurs, or trigger a
built-manifest re-run when mode-map/weights change. Simplest robust option:
```
const sig = cacheKey(state.normalizedPrompt, [], manifestFingerprint,
                     modeMapContentHash, weightsContentHash);
```

### WR-02: graph mtime invalidation dropped — project `graphify build` no longer invalidates cached routes

**File:** `tests/router.mjs.snapshot:1681-1686, 2726-2741`
**Issue:** The prior cache key folded `graphMtime` (a project-side
`graphify-out/graph.json` rebuild invalidated stale graph-aware routes). INVC-02
drops it; the key is now `sha256(np | ik | fingerprint)`. The hook still reads
`graphMtime` and attaches it to `state.graphify.graph_mtime` (line 2727) purely
for telemetry, but it no longer participates in the key. A project graph rebuild
therefore leaves the cache warm and a previously-cached route whose
skills/agents were boost-ordered by the OLD graph symbols is served stale. This
is acknowledged in a test comment as intentional (router-graphify-integration
test:146), so it is a deliberate tradeoff rather than an accident — but the
consequence (stale graph-boosted routing) is observable and the retained
`graph_mtime` in state suggests orphaned intent. If the graph is meant to stay
cache-relevant, fold a graph content hash (not the raw mtime) into the key.
**Fix:** Fold a stable `graph.json` content hash into the cache key when the
graph is present, or document explicitly that graph-aware routes are no longer
invalidated on graph rebuild and stop advertising `graph_mtime` as an
invalidation signal.

### WR-03: fingerprint is order-sensitive to directory enumeration — "identical rebuild → identical fingerprint" is not structurally guaranteed

**File:** `build-manifest.mjs:168-229, 337-355` and `src/registry/fingerprint.mjs:21-39`
**Issue:** `computeCompositeEpoch` hashes the `entries` array with element order
preserved (it maps, it does not sort), and `stableStringify` sorts object keys
but not array elements. The manifest arrays (`skills`, `plugin_skills`,
`agents`, `agents_store_skills`, `commands`) are populated in `readdirSync`
enumeration order via `safeReaddir` (build-manifest.mjs:99-101) and `walkFiles`,
which are not sorted. The headline guarantee — an identical rebuild emits an
identical fingerprint and does not invalidate the cache — therefore rests on
APFS/macOS returning stable enumeration order for unchanged directories. That
holds empirically today (the INVC-01/INVC-05 determinism tests pass), but it is
not a platform contract: a different filesystem, or a directory whose entries
were added/removed and re-added (shifting inode flood order), can yield a
different fingerprint for semantically identical content, causing spurious cache
invalidation — the exact failure INVC-01 is meant to prevent.
**Fix:** Deterministically sort the semantic entry arrays before hashing in
`computeCompositeEpoch` (e.g. `.map(...).sort()` on a stable key), so the epoch
is canonical regardless of enumeration order.

### WR-04: `scanFingerprintTree` returns the logical-root label as `canonicalRoot`

**File:** `src/registry/fingerprint.mjs:234`
**Issue:** In the `logicalRoots` map, the object sets
`canonicalRoot: spec.logicalRoot` — i.e., the returned "canonical root" is the
portable logical root *label* (e.g. `"claude_global"`), not the resolved real
path `spec.canonicalRoot`. Compare to line 160-184 where `spec.canonicalRoot`
holds the resolved `realpath`. No current consumer in `src/registry/watcher.mjs`
(which reads only `complete` / `diagnosticCodes`) depends on this field, so the
impact is currently nil, but the value is factually wrong and any future consumer
that treats it as a path will compute against an invalid location (and the 
`root_hashes`/`subtree_hashes` use `logical_root` correctly, making the 
inconsistency easy to copy).
**Fix:**
```js
canonicalRoot: spec.canonicalRoot,
```

---

_Reviewed: 2026-08-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
