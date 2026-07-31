---
phase: 29-mode-map-curation-and-signal-patterns-expansion
plan: 04
subsystem: routing
tags: [calibration, thresholds, sensitivity, coverage, node-test]
requires:
  - phase: 29-mode-map-curation-and-signal-patterns-expansion
    provides: schema-v3 normalization and 18 curated lifecycle/design routes
provides:
  - production-inspected Phase 29 calibration corpus
  - deterministic threshold selection and leave-one-out sensitivity
  - evidence-derived installed confidence tuple and strict coverage report
affects: [routing-confidence, release-gates, installed-runtime]
tech-stack:
  added: []
  patterns: [observed-breakpoint grid search, zero-wrong-high rejection, fixture-object production inspection]
key-files:
  created:
    - coverage-report.json
  modified:
    - calibration-tasks.json
    - router.calibrate.mjs
    - tests/router.calibration-thresholds.test.mjs
    - tests/router.mjs.snapshot
    - /Users/guilherme/.claude/router/mode-map.json
key-decisions:
  - "Publish the independently selected tuple T_high=0.591, T_low=0.291, M=0.191."
  - "Use Phase 27's implemented perf-calibration and build-manifest gates because the two filenames named by Plan 29-04 do not exist."
patterns-established:
  - "Threshold candidates come only from observed breakpoints, their immediate upper boundary, and current constants."
  - "Handled context recovery bypasses normal scoring to prevent duplicate routing injections."
requirements-completed: [MAP-01, MAP-02, MAP-03, SIG-04]
coverage:
  - id: D1
    description: "All 18 curated routes plus negatives, near-collisions, and independent confidence boundaries are labeled and production-inspected."
    requirement: SIG-04
    verification:
      - kind: integration
        ref: "tests/router.calibration-thresholds.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "The selected zero-wrong-high tuple and leave-one-out sensitivity are deterministic."
    requirement: SIG-04
    verification:
      - kind: unit
        ref: "router.calibrate.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Strict coverage, latency, size, full serial suite, and installed gsd-ship/image-to-code assertions pass."
    requirement: MAP-03
    verification:
      - kind: e2e
        ref: "rtk node --test --test-concurrency=1 tests/*.test.mjs"
        status: pass
      - kind: e2e
        ref: "installed router inspect JSON assertions"
        status: pass
    human_judgment: false
duration: 21min
completed: 2026-07-29
status: complete
---

# Phase 29 Plan 04: Threshold Calibration and Release Gates Summary

**Production-inspected 58-record calibration with a zero-wrong-high 0.591/0.291/0.191 confidence tuple, deterministic sensitivity evidence, and green installed-runtime release gates**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-29T16:06:37Z
- **Completed:** 2026-07-29T16:27:01Z
- **Tasks:** 3
- **Files modified:** 11 repository files plus 3 installed-runtime files

## Accomplishments

- Added 26 distinct Phase 29 records: 18 positives, a family negative, a sibling near-collision, and six independent boundary fixtures while preserving all 32 legacy records.
- Routed supplied manifest/mode-map objects through `inspectDecision`, rejected wrong-high candidates, and reported affected samples plus leave-one-out ranges/frequencies.
- Published `T_high=0.591`, `T_low=0.291`, and `M=0.191`; regenerated strict repository and installed coverage evidence.
- Passed 41 focused checks, 22 performance/size checks, 1178/1178 serial tests, and exact installed `gsd-ship` and `image-to-code` JSON assertions.

## Task Commits

1. **Task 1: Add expanded labeled calibration evidence** - `f01e8ac` (test)
2. **Task 2: Select thresholds through production decisions** - `714557d` (feat)
3. **Task 3: Publish evidence-derived constants and close phase gates** - `f6eeab5` (fix)

## Files Created/Modified

- `calibration-tasks.json` - Phase 29 positives, negative/collision evidence, and six confidence boundary records.
- `router.calibrate.mjs` - Injected-object dry runs, candidate evaluation, selection, sensitivity, and CLI evidence.
- `tests/router.calibration-thresholds.test.mjs` - Corpus, objective, boundary, purity, and real-corpus contracts.
- `coverage-report.json` - Strict post-curation coverage evidence.
- `tests/router.mjs.snapshot` - Context-handled routing short-circuit parity with the installed hook.
- `/Users/guilherme/.claude/router/mode-map.json` - Installed evidence-derived confidence tuple.
- `/Users/guilherme/.claude/router/coverage-report.json` - Fresh installed coverage evidence.

## Decisions Made

- Selected the numerically smaller evidence optimum rather than retaining the old constants: `0.591/0.291/0.191`.
- Kept calibration standard-library-only and reused the production inspector; no model fitting, dependency, or parallel scorer was added.
- Preserved the historical 23-record release threshold while separately requiring every Phase 29 boundary and route contract in the selector tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used canonical Phase 27 gate filenames**
- **Found during:** Task 3
- **Issue:** `tests/router.performance.test.mjs` and `tests/router.mode-map-size.test.mjs` do not exist.
- **Fix:** Ran the implemented Phase 27 gates in `router.perf-calibration.test.mjs` and `router.build-manifest.test.mjs`.
- **Verification:** 22/22 tests passed.
- **Committed in:** No source change required.

**2. [Rule 1 - Bug] Prevented duplicate routing after handled context recovery**
- **Found during:** Task 3 full serial suite
- **Issue:** Lower thresholds exposed that handled context prompts still entered normal scoring and emitted a second injection.
- **Fix:** `main` now skips scoring only when `routeContextPrompt` reports `handled: true`.
- **Files modified:** `/Users/guilherme/.claude/hooks/router.mjs`, `tests/router.mjs.snapshot`, `tests/router.context-prompt-integration.test.mjs`
- **Verification:** Focused context tests and 1178/1178 serial tests pass.
- **Committed in:** `f6eeab5`

**3. [Rule 3 - Blocking] Updated legacy fixture/freshness assertions**
- **Found during:** Task 3 full serial suite
- **Issue:** Old tests assumed exactly 32 calibration records or depended on ambient stale coverage state.
- **Fix:** Preserved legacy counts explicitly, added the 26-record Phase 29 class, and made freshness fixtures deterministic.
- **Files modified:** calibration graph/evolution, coexistence, inspect, safety-release, and context integration tests.
- **Verification:** Focused suites and 1178/1178 serial tests pass.
- **Committed in:** `f01e8ac`, `f6eeab5`

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking issues).
**Impact on plan:** All fixes were required for deterministic release verification; no new dependency or routing layer was added.

## Issues Encountered

- The initial full suite reported five failures from stale installed coverage, a legacy fixed corpus count, and the context double-route bug. Installed coverage was rebuilt and all regressions were closed.
- Leave-one-out sensitivity is stable for `T_low` and `M` after publication; omitting one high-boundary sample lowers `T_high` to `0.301`, so the CLI reports that range explicitly.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: routing-control-flow | `/Users/guilherme/.claude/hooks/router.mjs` | Handled context recovery now bypasses normal confidence scoring to prevent duplicate instructions. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 29 release gates are green with the installed tuple and fresh coverage evidence.
- The `T_high` leave-one-out range should remain visible in future recalibration reviews; it is evidence sensitivity, not a release blocker.

## Self-Check: PASSED

- All planned repository artifacts and installed runtime files exist.
- Task commits `f01e8ac`, `714557d`, and `f6eeab5` exist.
- Focused, calibration, strict coverage, performance/size, installed JSON, and 1178-test serial gates pass.

---
*Phase: 29-mode-map-curation-and-signal-patterns-expansion*
*Completed: 2026-07-29*
