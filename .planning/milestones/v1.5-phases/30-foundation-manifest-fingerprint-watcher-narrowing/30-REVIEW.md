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
  warning: 0
  info: 2
  total: 2
status: issues_found
---

# Phase 30: Code Review Report (Iteration 2 — WR re-check)

**Reviewed:** 2026-08-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Iteration 2 re-review of the Phase 30 manifest-fingerprint + watcher-narrowing work, focused on verifying the WR-01/WR-02/WR-03 fixes (commits 60e119b + ab47cec) and re-examining the WR-04 skip.

**Verdict on the iterative fixes:**

- **WR-01 (mode-map/weights content-hash fold into cache key) — correctly applied, no new issues.** `cacheKey(normalizedPrompt, intentKeywords, manifestFingerprint, modeMapHash, weightsHash, graphHash)` folds live content hashes (`contentHash()` over stableStringify output) into the key. `main()` computes `contentHash(modeMap)` / `contentHash(weights)` per decision and passes them through. Fail-open is preserved: all-empty/omitted live hashes leave the key byte-identical to the fingerprint-only form, and a missing manifest fingerprint defaults to `'0'`. Verified by the WR-01 tests in `router.cache.test.mjs` (identical content → identical key; content edit → different key; `''` == omitted) — all pass.
- **WR-02 (graph content-hash fold) — correctly applied, no new issues.** `graphifyQuery` returns `content_hash` (sha256 over graph.json bytes) on the `ok` path, `graphifyHeuristic` propagates it, and `main()` folds `graph.content_hash` into the key. Verified by the WR-02 test in `router-graphify-integration.test.mjs` and by full-file byte-identity of the snapshot vs the installed hook.
- **WR-03 (canonical array-order sort before hashing) — correctly applied, no new issues.** `compareBySerialization` + `sortedSemantic`/`sortedPluginIds` in `computeCompositeEpoch` make the epoch independent of `readdir`/`Object.entries` enumeration order. The comparator is a total order over the canonical serialization; equal-serialization elements are interchangeable for the hash, so the sort is structurally deterministic. Verified by the no-op-rebuild stability tests in `router.plugins-fingerprint.test.mjs` and `router.lifecycle-invc.test.mjs` — all pass.
- **WR-04 (canonicalRoot returning logical-root label) — skip rationale SOUND, confirmed as an acceptable skip. Do not re-flag.** `src/registry/fingerprint.mjs:251` sets `canonicalRoot: spec.logicalRoot` in the returned `logicalRoots[]`. Persisting the absolute realpath here would leak machine-specific paths into persisted fingerprint state and break the portability invariants asserted by `adapters.test.mjs:289` (`canonicalRoot: 'authorized'`, a label) and the registry-diff portability tests. No consumer reads this field as a realpath; containment is enforced at scan time via the in-memory `spec.canonicalRoot`. The label is the intentional portable representation.

**Constraint verification (all satisfied):**

1. **Fingerprint = content-sha256 over semantic inputs only, no timestamps/absolute paths.** `computeCompositeEpoch` destructures `path` out of each entry and reduces installed plugins to `{name, marketplace, version, scope}`, excluding `install_path` and `installed_at`. No mtimes, no counts, no `registry_scope`. Confirmed by the plugins-fingerprint test (timestamp/installPath-only edit leaves the fingerprint byte-identical).
2. **Hook <100ms, fail-open, stdlib-only.** All new code uses `node:crypto`/`node:fs`; `contentHash`/`cacheKey` are deterministic pure functions; every new default is fail-open (`''` live hashes, `'0'` fingerprint).
3. **Snapshot byte-identical to `~/.claude/hooks/router.mjs`.** `diff tests/router.mjs.snapshot ~/.claude/hooks/router.mjs` → exit 0, zero lines.
4. **`installed_plugins.json` never ignored.** Watcher ignore prefixes (`router-lifecycle.mjs:438-447`, `451-459`) are prefix-specific (`plugins/plugin-catalog-cache.json`, `plugins/known_marketplaces.json`, `plugins/cache`, `plugins/data`, `plugins/marketplaces`); a bare `plugins` prefix is never used, so `plugins/installed_plugins.json` remains visible and is folded into the fingerprint via `installedPlugins`.

**Test status:** 49/49 pass across `router.cache`, `router.plugins-fingerprint`, `router.calibration-epoch`, `router.lifecycle-invc`, `router.build-manifest`. `router-graphify-integration`, `router.mutation-safety`, and `router.registry-watcher` pass. `router.inspect.test.mjs` has 5 environmental failures (see IN-02) unrelated to the fixes.

The previous iteration's 4 warnings are all resolved (WR-01/02/03 fixed in code; WR-04 confirmed as an acceptable skip). Remaining observations are Info-level only.

## Info

### IN-01: graphifyQuery content_hash is key-order dependent (inconsistent with contentHash)

**File:** `tests/router.mjs.snapshot:2012` (installed hook — and by byte-identity `~/.claude/hooks/router.mjs`)
**Issue:** WR-02 computes the graph signature over the raw JSON bytes: `createHash('sha256').update(raw, 'utf8').digest('hex')`. The mode-map/weights fold (WR-01) uses `contentHash()`, which hashes `stableStringify(value)` and is therefore key-order independent. A graph.json rewrite that only reorders JSON keys (e.g., a rebuild that re-emits the same semantic graph in a different key order) would change the raw bytes, produce a new `content_hash`, and spuriously invalidate the graph-aware cache key — even though the parsed symbols are identical. This is over-invalidation, not a correctness bug (a stale graph-boosted route is recomputed at worst), and graph.json is machine-generated so key reordering in practice accompanies a real rebuild. Flagged only because it is inconsistent with the WR-01 determinism guarantee stated in the same comment block.
**Fix:** Hash `contentHash(graphJson)` (or `stableStringify(collectGraphNodes(graphJson))`) instead of the raw bytes, so semantically identical graphs share a signature. Optional alignment; not required for correctness.

### IN-02: router.inspect.test.mjs failures are environmental (stale installed manifest), not caused by the fixes

**File:** `tests/router.inspect.test.mjs:139,155,170` and the graph/preview tests
**Issue:** 5 tests fail on the `candidates.length > 0` shape assertion in the live environment. Root cause is environmental: the installed `~/.claude/router/claude-inventory-manifest.json` (mtime Jul 29 20:25) is older than the installed builder `~/.claude/router/build-manifest.mjs` (mtime Aug 1 09:26), so the hook's pre-existing staleness gate fires, `inspectDecision` returns `pass_through_reason: 'stale'` with zero candidates, and the shape assertions fail. Reproduced directly: `inspectDecision('fix the flaky router inspect test', …)` → `candidates: 0`, `cache.status: 'miss'`, `pass_through_reason: 'stale'`. This is not a regression from the WR-01/02/03 changes (they do not touch candidate generation or the staleness gate), and `router.mutation-safety.test.mjs` passes when run alone.
**Fix:** Rebuild the real manifest (`node ~/.claude/router/build-manifest.mjs`) and re-run `router.inspect.test.mjs` to restore green. No code change required. If these tests must pass in CI without a fresh real-world manifest, they should seed a synthetic manifest/cache under a controlled HOME instead of depending on the live install.

---

_Reviewed: 2026-08-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
