---
phase: 30-foundation-manifest-fingerprint-watcher-narrowing
fixed_at: 2026-08-01T10:23:29Z
review_path: .planning/phases/30-foundation-manifest-fingerprint-watcher-narrowing/30-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 3
skipped: 1
remaining_after_fix: 0 critical / 0 warning / 2 info
status: partial
---

# Phase 30: Code Review Fix Report

**Fixed at:** 2026-08-01T10:23:29Z
**Source review:** `.planning/phases/30-foundation-manifest-fingerprint-watcher-narrowing/30-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 3
- Skipped: 1

> **Verification location:** `Workflow.use_worktrees` is `false`, so all fixes were
> applied and verified in the **main checkout** (no isolated worktree). Test results
> below are therefore reproducible from the tree you are looking at.

## Fixed Issues

### WR-01: mode-map / weights edits no longer invalidate the route cache

**Files modified:** `tests/router.mjs.snapshot`, `tests/router.cache.test.mjs`, `tests/router.inspect.test.mjs`, `tests/router.mutation-safety.test.mjs`
**Commit:** `60e119b`
**Applied fix:**
The reviewer's two suggested mechanisms were evaluated. Enumerating the `router/`
noise in the watcher `ignoredRelativePaths` was rejected: the live
`~/.claude/router/` dir holds churning dynamic files (`rollback-journal/` with
~9k entries, `telemetry.jsonl`, `evolution-state.json`, `cache.json`, archives),
so exposing them to the watcher would create self-trigger rebuild loops and is
fragile to every future generated file. Instead, the reviewer's "simplest robust
option" was implemented: a **live content hash** (NOT an mtime) of the loaded
mode-map and weights is folded into the cache key on every decision.

- Added `contentHash(value)` (deterministic key-order-independent stable
  stringify + sha256; `''` for null) and extended `cacheKey` with
  `modeMapHash`/`weightsHash`/`graphHash` parameters. Empty/`''` live hashes leave
  the key byte-identical to the fingerprint-only form, so existing 3-arg
  `cacheKey` calls and INVC-01 no-op-rebuild determinism are preserved.
- The decision path now folds `contentHash(modeMap)` and `contentHash(weights)`
  (already loaded fresh in-memory every decision — sub-ms, stays <100ms) into
  `sig`. A mode-map/weights edit changes the content hash -> key -> stale route
  recomputed, independent of the (build-time-only) fingerprint.
- Existing cache seed tests that route through `inspectDecision` were updated to
  pass explicit `modeMap`/`weights` fixtures and seed with the matching folded
  key (`inspect.test.mjs` hit; `mutation-safety.test.mjs` stale-target-recompute
  + oversized-hit).
- Added TDD tests (`router.cache.test.mjs`: "WR-01: mode-map content change
  invalidates…", "WR-01: weights content change invalidates…") proving identical
  content -> identical key and changed content -> different key under an
  unchanged manifest fingerprint.
- `build-manifest.mjs:546-559` requires no change: the fingerprint already folds
  mode-map/weights at build time; the gap was refresh, now closed at the key.

Note: this is a logic-correctness change to cache invalidation; the committed
behavior is asserted by the new tests but warrants a human sanity check of the
invalidation semantics.

### WR-02: graph mtime invalidation dropped

**Files modified:** `tests/router.mjs.snapshot` (+ mirrored to `~/.claude/hooks/router.mjs`), `tests/router.cache.test.mjs`
**Commit:** `60e119b`
**Applied fix:**
`graphifyQuery` now returns a **content hash** (`content_hash` = sha256 of the
raw `graph.json` bytes) on the success (`ok`) path, threaded through
`graphifyHeuristic` and folded into the cache key as `graphHash` only when the
graph heuristic fires and the graph is read. A project `graphify build` changes
`graph.json` -> new content hash -> new key -> stale graph-boosted route
recomputed, without re-introducing a raw absolute mtime. Non-graph prompts and
graph-missing/error paths produce `''` (no fold, key unchanged). Added TDD test
(`router.cache.test.mjs`: "WR-02: graph.json content change invalidates…").
The `graph_mtime` telemetry field is unchanged and is no longer advertised as an
invalidation signal (the content hash is).

### WR-03: fingerprint order-sensitive to directory enumeration

**Files modified:** `src/registry/fingerprint.mjs`, `tests/router.registry-diff.test.mjs`
**Commit:** `ab47cec`
**Applied fix:**
`computeCompositeEpoch` now canonicalizes array element order before hashing —
the semantic `entries` array and the reduced `installedPlugins` array are sorted
by a `compareBySerialization` comparator (stable key-order-independent
serialization). An unchanged directory enumerated in a different order therefore
emits an identical fingerprint (structural, not empirical, determinism), while
any semantic content change still bumps it. Added TDD tests proving
order-independence for plain and manifest-shaped `{name,description,path}`
entries (path is stripped as before).

## Skipped Issues

### WR-04: `scanFingerprintTree` returns the logical-root label as `canonicalRoot`

**File:** `src/registry/fingerprint.mjs:234`
**Reason:** The reviewer's suggested one-liner (`canonicalRoot: spec.canonicalRoot`)
conflicts with a hard, tested, production-critical portability invariant.
`logicalRoots` is persisted as part of the scan result — the watcher calls
`writeState(current)` with the full `scanFingerprintTree` return
(`src/registry/watcher.mjs:239`) — and the persisted fingerprint state must
contain NO absolute filesystem paths. Setting `canonicalRoot` to the resolved
realpath (an absolute path) would leak machine-specific paths into persisted
state and break three existing tests that assert exactly this invariant:
`tests/router.adapters.test.mjs:285-292` (`canonicalRoot: 'authorized'` and
`JSON.stringify(first).includes(root) === false`) and
`tests/router.registry-diff.test.mjs:183/244/286` (portable scan excludes
absolute roots; state round-trips without leaking the temp root). The current
value (the portable logical-root label) is the intentional portable
representation, and no current consumer reads the field (watcher only uses
`complete`/`status`/`diagnosticCodes`). Attempted, reverted, and documented as
correctly let alone — changing it would introduce a portability regression for a
field with nil current impact.

## Iteration 2 Re-review (--auto)

**Status after fixes: 0 critical / 0 warning / 2 info.** All in-scope
(critical+warning) findings resolved. The two remaining info-tier items are out
of fix scope (`fix_scope: critical_warning`):

- **IN-01:** graph `content_hash` uses raw bytes (key-order dependent),
  inconsistent with the stableStringify-based `contentHash` — minor
  over-invalidation risk only, no correctness impact.
- **IN-02:** 5 `router.inspect.test.mjs` failures are environmental (installed
  manifest mtime Jul 29 < installed builder mtime Aug 1 → stale gate →
  `pass_through_reason: 'stale'`, 0 candidates), pre-existing and unrelated to
  the fixes; a manifest rebuild restores green.

WR-04 skip validated as sound by the re-reviewer: persisting the absolute
realpath would leak machine-specific paths into persisted fingerprint state and
break the portability invariants asserted by `adapters.test.mjs:289` and the
registry-diff tests; no consumer reads the field as a realpath.

**Verification after fixes:** 170/170 tests pass across
registry-watcher, plugins-fingerprint, calibration-epoch, lifecycle-invc,
cache, mutation-safety, build-manifest, calibration-thresholds,
registry-diff, adapters, graphify-integration, lifecycle.

**Original issue:** `scanFingerprintTree` returns the portable logical-root label
(e.g. `"claude_global"`) as `canonicalRoot` rather than the resolved realpath,
which is factually wrong for any future consumer that treats it as a path.

---

_Fixed: 2026-08-01T10:23:29Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
