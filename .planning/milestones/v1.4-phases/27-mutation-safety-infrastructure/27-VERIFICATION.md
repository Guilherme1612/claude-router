---
phase: 27-mutation-safety-infrastructure
verified: 2026-07-29T13:57:38Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 27: Mutation Safety Infrastructure Verification Report

**Phase Goal:** Mutations to the previously-stable mode-map and weights cannot poison cached routes or creep latency — the safety rails exist before any curation ships.
**Verified:** 2026-07-29T13:57:38Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | A mode-map or weights mtime change invalidates a previously cached route. | ✓ VERIFIED | Installed `/Users/guilherme/.claude/hooks/router.mjs`: `cacheKey` hashes both mtimes; the production call reads and passes `weightsMtime`; focused cache tests prove both inputs change the key. |
| 2 | A cached route with a target absent from the current manifest is recomputed and never injected. | ✓ VERIFIED | Installed hook calls `routeTargetsExist(cached, manifest, modeMap)` before the hit branch. An independent temp-cache spot-check returned `stale_target_recompute`, emitted `cache:stale_target`, and did not select the poisoned `ghost` route. |
| 3 | Calibration-corpus warm p95 remains below 40ms and every route remains below 100ms. | ✓ VERIFIED | Isolated live measurement: warm p95 `16.044ms`, max `16.973ms`. `assessMutationSafetyRegression` enforces strict `<40`/`<100`; boundary tests at exactly 40ms and 100ms pass by rejecting. Existing `<25ms` canary remains unchanged. |
| 4 | Injection rendering is capped at 1 mode, 3 skills, 2 agents, and 1 reasoning line; mode-map stays at or below 30KB. | ✓ VERIFIED | Both cache-hit and fresh-route paths call `capRouteRender` before `formatInjection`; focused integration tests prove no more than 3 skill and 2 agent lines. Builder rejects 30001 bytes and accepts 30000. Installed mode-map is 15304 bytes. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `/Users/guilherme/.claude/hooks/router.mjs` | Installed cache invalidation, stale-target guard, render cap, observability | ✓ VERIFIED | Substantive and invoked by the production `inspectDecision` hot path. |
| `tests/router.mutation-safety.test.mjs` | SAF-01/02/04 behavior and boundary coverage | ✓ VERIFIED | 19 focused tests passed as part of the 58-test run. |
| `tests/router.cache.test.mjs` | Weights-mtime key invalidation regression | ✓ VERIFIED | 19 cache tests passed. |
| `src/evolution/perf-measure.mjs` | Parallel mutation-safety latency gate | ✓ VERIFIED | Exports strict `<40ms` p95 and `<100ms` max assessment without altering `assessCalibration`. |
| `tests/router.perf-calibration.test.mjs` | Boundary and full-corpus latency checks | ✓ VERIFIED | 12 tests passed, including isolated full-corpus measurement. |
| `build-manifest.mjs` | Off-hot-path 30000-byte mode-map guard | ✓ VERIFIED | Reuses the sole `fileStatSize` helper and sets a failing exit code only above the ceiling. |
| `tests/router.build-manifest.test.mjs` | Size-boundary behavior | ✓ VERIFIED | 8 tests passed, including 30000/30001-byte boundary cases. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `readWeightsMtime` | `cacheKey` | Production `inspectDecision` call | ✓ WIRED | Real weights mtime is passed as the seventh key component. |
| Cache lookup | Manifest | `routeTargetsExist(cached, manifest, modeMap)` | ✓ WIRED | False result skips hit injection and continues through recomputation. |
| Cached/fresh route | Injection | `capRouteRender` then `formatInjection` | ✓ WIRED | Both production branches use the capped copy and strip the internal flag. |
| `measureRoutes` | Mutation gate | `performance.warm.p95_ms/max_ms` | ✓ WIRED | Full-corpus test passes measured output into `assessMutationSafetyRegression`. |
| Mode-map file | Builder guard | Existing `fileStatSize` | ✓ WIRED | Guard executes after manifest build, outside router hot path. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| Installed hook | Cache signature | Live mode-map, manifest, and weights mtimes | Yes | ✓ FLOWING |
| Installed hook | Cached route target validity | Current manifest and mode map | Yes | ✓ FLOWING |
| Installed hook | Injected route lists | Cached or freshly scored route | Yes, capped before render | ✓ FLOWING |
| Performance gate | Warm p95/max | `measureRoutes` over `CALIBRATION_CORPUS` | Yes | ✓ FLOWING |
| Builder guard | Mode-map byte size | `statSync(...).size` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Focused Phase 27 suite | `rtk node --test --test-concurrency=1` on the four Phase 27 test files | 58/58 passed | ✓ PASS |
| Poisoned cached route recomputes | Inline `inspectDecision` temp-cache check | `stale_target_recompute`; stale trace present; ghost route not served | ✓ PASS |
| Current calibration latency | `rtk node tests/helpers/latency-isolated.mjs` | p95 16.044ms; max 16.973ms | ✓ PASS |
| Installed size state | `stat` mode-map and weights | mode-map 15304 bytes; weights 8029 bytes | ✓ PASS |

### Probe Execution

No Phase 27 probe scripts are declared or present.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| SAF-01 | 27-01 | Cache version includes mode-map, manifest, and weights changes | ✓ SATISFIED | Production key wiring, derived `routing_version`, and key-difference tests. |
| SAF-02 | 27-01 | Stale cached capability targets are never served | ✓ SATISFIED | Production guard plus independent poisoned-cache recomputation check. |
| SAF-03 | 27-02 | Warm p95 `<40ms`, every route `<100ms` | ✓ SATISFIED | Strict gate, boundary tests, and live 16.044/16.973ms measurement. |
| SAF-04 | 27-01, 27-02 | Render cap and mode-map below 30KB | ✓ SATISFIED | Both render paths capped; 30000/30001 boundary tests; current file 15304 bytes. |

All requirement IDs declared by both PLAN frontmatters are accounted for. `REQUIREMENTS.md` maps exactly SAF-01 through SAF-04 to Phase 27; no orphaned Phase 27 requirements exist.

### Anti-Patterns Found

No unreferenced `TBD`, `FIXME`, or `XXX` markers, placeholder implementations, duplicate stat helper, hot-path full-map validator, hot-path size guard, or exact-hash assertions were found in Phase 27 files. Legacy fail-open empty returns in the installed hook are substantive error handling, not stubs.

### Human Verification Required

None.

### Gaps Summary

No blocking or uncertain gaps. The code, installed hook wiring, focused behavioral tests, live latency measurement, and current file sizes establish the phase goal.

---

_Verified: 2026-07-29T13:57:38Z_
_Verifier: the agent (gsd-verifier)_
