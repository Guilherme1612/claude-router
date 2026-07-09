---
status: complete
phase: 04-ancestor-reuse
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md
started: 2026-07-09T11:30:00Z
updated: 2026-07-09T13:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Surface filter drops disabled-stem entries
expected: Test 8 (`disabled-cluster integration`) in `tests/router.ancestor-reuse.test.mjs` passes: when `core_loop` is disabled in a tmpdir surface file, all 6 core_loop stems are stripped from the corpus and bm25Score top entry is not a core_loop stem.
result: pass
verified: `node --test tests/router.ancestor-reuse.test.mjs` → ok 8, `tests 9 / pass 9 / fail 0`, duration 66ms.

### 2. Fail-open on modules-missing
expected: Test 2 passes: when `surface.cjs`/`clusters.cjs` are unimportable, the helper returns the input corpus unchanged (ref equality), `surface_status='absent'`, disabled_count=0. Original prompt must still flow through.
result: pass
verified: ok 2 in test run; _setModulesUnimportableForTest accessor exercises the load-bearing fail-open path.

### 3. Fail-open on corrupt surface state
expected: Test 3 passes: when `.gsd-surface.json` is present but unparseable, `surface_status='unconfigured'`, all original corpus entries preserved (content equality), filter is a no-op.
result: pass
verified: ok 3 in test run; readSurface-based status decision (not existsSync) returns 'unconfigured' on parse error per D-08.

### 4. Unconfigured when surface file missing
expected: Test 4 passes: with no `.gsd-surface.json` in the runtimeConfigDir, `surface_status='unconfigured'`, all corpus entries preserved.
result: pass
verified: ok 4 in test run.

### 5. Pipeline order — surface filter runs between buildCorpus and bm25Score
expected: Test 5 passes: source-grep confirms `buildCorpus < applySurfaceFilter-call < bm25Score` in `router.mjs` main() pipeline. Filter is a separate pipeline slot, not bundled into buildCorpus.
result: pass
verified: ok 5 in test run; uses indexOf offset past function definition to disambiguate.

### 6. Mtime cache — warm hit reuses cached set
expected: Test 6 passes: two consecutive `applySurfaceFilter` calls on the same runtimeConfigDir with unchanged mtime return the same `Set` reference from the per-dir cache (no re-invocation of resolveSurface).
result: pass
verified: ok 6 in test run; per-dir Map<dir, cache> pattern.

### 7. Mtime cache — cold invalidation on file change
expected: Test 7 passes: after `utimesSync` +5s + file rewrite, the second call produces a DIFFERENT `Set` reference (cache invalidated by mtime change).
result: pass
verified: ok 7 in test run; mtime-keyed cache invalidates on file change.

### 8. New test file present and runnable
expected: `tests/router.ancestor-reuse.test.mjs` exists at project root, reports `tests 9 / pass 9 / fail 0` when run with `node --test tests/router.ancestor-reuse.test.mjs`.
result: pass
verified: `node --test tests/router.ancestor-reuse.test.mjs` → `tests 9 / pass 9 / fail 0`, duration 66ms.

### 9. Full test suite green
expected: Full test suite runs with 262/264 passing (2 pre-existing unrelated failures in `router.calibration-graph.test.mjs:3` and `router.telemetry.test.mjs:8` are unrelated to Phase 4). The new ancestor-reuse test file is in the passing count.
result: pass
verified: `node --test tests/*.test.mjs` → 305 pass / 2 fail of 307. The 2 failures are pre-existing: test 97 `calibration-tasks.json: every codebase fixture right.mode exists in mode-map` and test 268 `telemetry: weights.json is the empty v1 schema`. Neither is touched by Phase 4.

### 10. Calibration gate — no right-pick regression
expected: `node router.calibrate.mjs` reports `14/18 right (threshold 12)` — same as pre-Phase-4 baseline. No routing accuracy regression from the inline-discovery-swap. Exit code 0.
result: pass
verified: `node router.calibrate.mjs` → `Combined: 14 / 18 (threshold: 12)`. Same 2 wrong HIGH-confidence (#12, #13) as post-Phase-3 baseline. D-11 satisfied.

### 11. Anti-check — router never reads .gsd-surface.json directly
expected: `grep -nE "readFileSync.*gsd-surface|JSON\.parse.*gsd-surface" /Users/guilherme/.claude/hooks/router.mjs` returns no matches. All surface-state reads go through `surface.cjs:resolveSurface` and `surface.cjs:readSurface`.
result: pass
verified: grep returned exit 1 (no matches). All reads go through surface.cjs.

### 12. Anti-check — buildCorpus signature unchanged
expected: `grep -n "function buildCorpus" /Users/guilherme/.claude/hooks/router.mjs` still shows `export function buildCorpus(manifest, modeMap = null)`. No signature drift.
result: pass
verified: `509:export function buildCorpus(manifest, modeMap = null) {`. D-02 preserved.

### 13. Anti-check — no new npm dependencies
expected: `package.json` has no new entries from Phase 4. Only `node:fs.utimesSync` from stdlib was added.
result: pass
verified: `ls package.json` returned no output (no package.json in this build dir). No npm deps possible. D-10 satisfied.

### 14. Anti-check — hook contract unchanged
expected: `additionalContext` semantics, sentinel marker, `formatInjection`, guards, cache, `emit()` all untouched. `mode-map.json` shape, BM25 algorithm, and tier thresholds unchanged.
result: pass
verified: All Phase 4 changes are additive (new module-level sentinels, new exported helper, new pipeline slot, new telemetry fields, new test-only accessors). No edit to formatInjection, mode-map.json, BM25 algorithm, tier thresholds, or emit().

### 15. Telemetry — new surface_status + surface_disabled_count fields present
expected: `tests/router.ancestor-reuse.test.mjs` Test 9 (telemetry source-grep) passes: `surface_status: 'unconfigured'` and `surface_disabled_count: 0` appear in `decision` init; `decision.surface_status` and `decision.surface_disabled_count` appear in telemetry write. Fields are non-null on all early-exit paths.
result: pass
verified: ok 9 in test run; both fields present in decision init defaults AND telemetry write.

## Summary

total: 15
passed: 15
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
