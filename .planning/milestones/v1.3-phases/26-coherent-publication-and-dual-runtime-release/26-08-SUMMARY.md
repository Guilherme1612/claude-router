---
phase: 26-coherent-publication-and-dual-runtime-release
plan: 08
subsystem: release
tags: [node-test, release-matrix, fail-closed, dual-runtime]
requires:
  - phase: 26-07
    provides: installed large-registry performance evidence and RELEASE_METRICS
provides:
  - exact REL-01 through REL-09 v1.3 release matrix
  - generic v1.2-compatible release runner
  - verified atomic v1.3 release report
affects: [milestone-verification, release]
tech-stack:
  added: []
  patterns: [matrix-driven release stages, fail-closed structured evidence]
key-files:
  created: [release/v1.3-matrix.json, release/v1.3-report.json]
  modified: [src/release/run-release.mjs, tests/router.phase26-release.test.mjs, tests/router.safety-release.test.mjs]
key-decisions:
  - "v1.3 supplies requirements, stages, and thresholds to the existing runner while v1.2 retains its exact defaults."
  - "Archived safety proof comes from the canonical v1.1 milestone audit, and Ralph coexistence comes from authoritative live route health."
patterns-established:
  - "Release matrices own stage definitions; one runner parses, validates, and atomically publishes every milestone report."
requirements-completed: [REL-01, REL-02, REL-03, REL-04, REL-05, REL-06, REL-07, REL-08, REL-09]
coverage:
  - id: D1
    description: Exact complete v1.3 release evidence is validated and atomically published.
    requirement: REL-01
    verification:
      - kind: integration
        ref: "node src/release/run-release.mjs --matrix=release/v1.3-matrix.json --output=release/v1.3-report.json"
        status: pass
    human_judgment: false
  - id: D2
    description: Phase 26 and repository compatibility gates pass serially without skips.
    requirement: REL-09
    verification:
      - kind: integration
        ref: "node --test --test-concurrency=1 tests/*.test.mjs"
        status: pass
    human_judgment: false
duration: 17min
completed: 2026-07-28
status: complete
---

# Phase 26 Plan 08: Coherent v1.3 Release Summary

**One matrix-driven runner now proves all nine v1.3 requirements with fresh installed-runtime, lifecycle, authority, regression, latency, and context evidence while preserving v1.2 compatibility.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-28T17:09:18Z
- **Completed:** 2026-07-28T17:26:39Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added exact REL-01 through REL-09 ownership and six executable v1.3 stages to the existing release system.
- Published and independently verified `release/v1.3-report.json`; focused, lifecycle, compatibility, authority, regression, and isolated latency stages all passed.
- Preserved v1.2 behavior: the combined v1.3/v1.2 release suite passed 22/22.
- Closed the repository gate at 1096/1096 tests, zero failures, zero skips.

## Task Commits

1. **Task 1 RED:** `4625344` (`test(26-08): add v1.3 release RED gates`)
2. **Task 1 GREEN:** `6276f73` (`feat(26-08): add coherent v1.3 release matrix`)
3. **Task 2 safety evidence:** `1ba5880` (`fix(26-08): follow canonical safety evidence`)
4. **Task 2 metrics:** `273af6a` (`fix(26-08): normalize Phase 26 benchmark metrics`)
5. **Task 2 regressions:** `8117c87` (`fix(26-08): align release regressions with live contracts`)
6. **Task 2 report:** `30de5ee` (`test(26-08): publish passing v1.3 release evidence`)

## Files Created/Modified

- `release/v1.3-matrix.json` - Exact requirement ownership, stages, and thresholds.
- `release/v1.3-report.json` - Deterministic verified release evidence.
- `src/release/run-release.mjs` - Matrix-driven stages and milestone-aware report verification.
- `tests/router.phase26-release.test.mjs` - v1.3 completeness, tamper, failure, metric, and compatibility gates.
- `tests/router.safety-release.test.mjs` - Canonical archived safety and live capability evidence.
- `tests/router.settings-diff.test.mjs` - Exact preservation of the current plugin map.
- `tests/router.steward-startup.test.mjs` - Production startup-pointer path coverage.
- `tests/router.test-mode-seam.test.mjs` - Dispatchable conservative-contract fixture and readiness synchronization.
- `tests/helpers/test-mode-seam.mjs` - Awaitable in-process controller readiness.

## Decisions Made

- Reused the existing parser, validator, subprocess runner, and atomic publisher; v1.3 adds data, not a parallel release framework.
- Kept report metrics canonical as `max_route_ms` while accepting the isolated benchmark's `max_ms` source field.
- Replaced deleted Phase 10 working-path evidence with the tracked v1.1 milestone audit rather than restoring user-owned cleanup.
- Verified Ralph through live framework-neutral route health rather than a stale Claude plugin setting.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Canonical safety evidence followed a deleted phase path**
- **Found during:** Task 2 authority gate
- **Fix:** Read the tracked v1.1 milestone audit and authoritative live Ralph route health.
- **Files modified:** `tests/router.safety-release.test.mjs`
- **Verification:** Authority gate passed 38/38.
- **Committed in:** `1ba5880`

**2. [Rule 1 - Bug] Isolated benchmark used `max_ms` while the report expects `max_route_ms`**
- **Found during:** Task 2 release runner
- **Fix:** Normalize the source measurement before gate and report validation.
- **Files modified:** `src/release/run-release.mjs`, `tests/router.phase26-release.test.mjs`
- **Verification:** Release compatibility passed 22/22; real v1.3 runner passed.
- **Committed in:** `273af6a`

**3. [Rule 3 - Blocking] Three repository tests encoded stale live-state and pre-contract assumptions**
- **Found during:** Task 2 full repository gate
- **Fix:** Preserve the actual plugin map, use the production startup pointer, await controller readiness, and make the fixture contract-dispatchable with explicit dependencies.
- **Files modified:** `tests/router.settings-diff.test.mjs`, `tests/router.steward-startup.test.mjs`, `tests/router.test-mode-seam.test.mjs`, `tests/helpers/test-mode-seam.mjs`
- **Verification:** Focused regression passed 23/23; full serial suite passed 1096/1096.
- **Committed in:** `8117c87`

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking issue)
**Impact on plan:** Required release evidence was strengthened without weakening any gate or changing authority.

## Verification

| Gate | Result |
|---|---:|
| Tuple + hot path | 3/3 |
| Invalidation + equivalence + reconcile | 16/16 |
| Lifecycle + recovery | 44/44 |
| Dual runtime + installed lifecycle | 21/21 |
| Authority + approval + safety | 38/38 |
| Isolated performance | 3/3, p95 0.323 ms, max 0.688 ms, context 194 bytes |
| v1.3 + v1.2 release compatibility | 22/22 |
| Phase 26 aggregate | 124/124 |
| Full repository serial | 1096/1096, 0 skipped |
| Canonical v1.3 release runner | PASS, 6/6 stages |

## Known Stubs

None.

## Threat Flags

None. The release matrix and child-output boundaries use exact schemas, readable test allowlists, structured gate IDs, fixed thresholds, and atomic report replacement.

## User Setup Required

None.

## Next Phase Readiness

Phase 26 is ready for independent verification, security audit, and milestone closeout.

## Self-Check: PASSED

- All created files exist.
- All six task commits exist.
- The canonical v1.3 report verifies against the committed matrix.
- The final full serial suite exits zero.

---
*Phase: 26-coherent-publication-and-dual-runtime-release*
*Completed: 2026-07-28*
