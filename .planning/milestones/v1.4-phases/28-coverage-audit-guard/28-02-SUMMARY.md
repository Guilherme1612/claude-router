---
phase: 28-coverage-audit-guard
plan: 02
subsystem: testing
tags: [coverage, strict-gate, freshness, fail-open, node-test]
requires:
  - phase: 28-coverage-audit-guard
    provides: deterministic typed coverage reports and baseline policy
provides:
  - strict builder exit semantics after coverage report publication
  - metadata-only coverage freshness reminder in the installed prompt hook
  - subprocess regressions for strict and fail-open behavior
affects: [phase-29, mode-map-curation, prompt-hook]
tech-stack:
  added: []
  patterns: [report-before-failure, mtime-ordering, fail-open-context-composition]
key-files:
  created: []
  modified:
    - build-manifest.mjs
    - tests/router.coverage-audit.test.mjs
    - /Users/guilherme/.claude/hooks/router.mjs
    - tests/router.freshness.test.mjs
    - tests/router.coexistence.test.mjs
    - tests/router.lifecycle.test.mjs
    - tests/router.safety-release.test.mjs
key-decisions:
  - "Strict coverage fails for either forward diagnostics or unacknowledged reverse gaps, after atomic report publication."
  - "Coverage freshness uses only existence and mtime metadata and appends its reminder through the existing context composer."
  - "Trivial, invalid, and internal-error pass-throughs remain silent to preserve the established fail-open contract."
patterns-established:
  - "Build gates publish complete evidence before setting process.exitCode."
  - "Always-on freshness checks compare artifact ordering and never parse or rebuild on the prompt path."
requirements-completed: [COV-04, COV-05]
coverage:
  - id: D1
    description: "Strict coverage mode fails only for unsuppressed forward or reverse gaps and leaves a complete report."
    requirement: COV-04
    verification:
      - kind: integration
        ref: "tests/router.coverage-audit.test.mjs#strict builder matrix"
        status: pass
    human_judgment: false
  - id: D2
    description: "Missing, stale, or unreadable coverage evidence appends one fail-open reminder without replacing route context."
    requirement: COV-05
    verification:
      - kind: integration
        ref: "tests/router.freshness.test.mjs#coverage freshness and composition"
        status: pass
      - kind: integration
        ref: "tests/router.failopen.test.mjs"
        status: pass
    human_judgment: false
duration: 25min
completed: 2026-07-29
status: complete
---

# Phase 28 Plan 02: Strict Coverage and Freshness Guard Summary

**Report-before-failure strict coverage gating plus a metadata-only, fail-open freshness reminder in the installed prompt hook**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-07-29T14:44:53Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `--strict-coverage` exit semantics for forward diagnostics and unacknowledged reverse gaps without forced process termination.
- Added coverage report existence/mtime checks to the installed hook with one fixed reminder composed after valid route context.
- Proved report-before-failure, acknowledgement, stale-baseline, freshness ordering, composition, exit-zero, and no-block behavior.

## Task Commits

1. **Task 1 RED: Strict coverage gate contract** - `018c493`
2. **Task 1 GREEN: Strict builder enforcement** - `d4cb668`
3. **Task 2 RED: Coverage freshness contract** - `c8d3912`
4. **Task 2 GREEN: Fail-open hook freshness composition** - `5177718`
5. **Post-wave regression alignment** - `1d9ed47`
6. **Safety-release COV-05 allowance** - `6898da0`

## Files Created/Modified

- `build-manifest.mjs` - Applies strict exit status only after atomic report publication.
- `tests/router.coverage-audit.test.mjs` - Exercises normal/strict, baseline, forward/reverse, and report persistence cases.
- `/Users/guilherme/.claude/hooks/router.mjs` - Exports metadata-only freshness checking and composes its reminder.
- `tests/router.freshness.test.mjs` - Covers ordering, errors, route coexistence, exit zero, and no block decision.
- `tests/router.coexistence.test.mjs` - Preserves override/re-entry pass-through while accepting the independent freshness reminder.
- `tests/router.lifecycle.test.mjs` - Accounts for the six audit/baseline files added to dual-runtime ownership.
- `tests/router.safety-release.test.mjs` - Allows only the exact COV-05 reminder while continuing to reject operator diagnostics.

## Decisions Made

- Used the existing audit result directly; no second coverage engine or CI provider configuration was added.
- Kept stale baseline entries warning-only while forward diagnostics remain unsuppressible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Preserved silent fail-open paths**
- **Found during:** Task 2 regression verification
- **Issue:** Appending a missing-report reminder to trivial, invalid, or internal-error prompts broke the established no-output fail-open contract.
- **Fix:** Suppressed only the coverage reminder for those three terminal pass-through reasons; actionable routing still receives the reminder.
- **Files modified:** `/Users/guilherme/.claude/hooks/router.mjs`
- **Verification:** `tests/router.failopen.test.mjs` and `tests/router.freshness.test.mjs`
- **Committed in:** `5177718`

### Post-wave Regression Fixes

**2. [Rule 1 - Test regression] Updated stale coexistence assertions**
- **Found during:** Independent post-wave full-suite verification
- **Issue:** Explicit override and sentinel re-entry tests still expected empty stdout even though COV-05 independently appends freshness context.
- **Fix:** Assert the exact one-line reminder, exit zero, and absence of a block decision.
- **Files modified:** `tests/router.coexistence.test.mjs`
- **Verification:** `rtk node --test tests/router.coexistence.test.mjs`
- **Committed in:** `1d9ed47`

**3. [Rule 1 - Test regression] Updated lifecycle ownership accounting**
- **Found during:** Independent post-wave full-suite verification
- **Issue:** The fixed file-count assertion omitted four mirrored audit-module files and two baseline files.
- **Fix:** Updated the documented ownership arithmetic from 215 to 221.
- **Files modified:** `tests/router.lifecycle.test.mjs`
- **Verification:** `rtk node --test tests/router.lifecycle.test.mjs`
- **Committed in:** `1d9ed47`

**4. [Rule 1 - Test regression] Distinguished COV-05 from operator diagnostics**
- **Found during:** Serial safety-release verification
- **Issue:** The safety regex treated the word `coverage` in the exact staleness reminder as forbidden operator diagnostics.
- **Fix:** Require exactly one fixed reminder, remove only its byte-exact text, then apply the unchanged diagnostics prohibition to the remaining context.
- **Files modified:** `tests/router.safety-release.test.mjs`
- **Verification:** `rtk node --test tests/router.safety-release.test.mjs`
- **Committed in:** `6898da0`

**Total deviations:** 4 auto-fixed (Rule 1: 3, Rule 2: 1). **Impact:** Tests now describe the shipped artifact set and COV-05 behavior; production logic, fail-open behavior, and latency ceilings were unchanged.

## Issues Encountered

- The live runtime builder predates Plan 28-01 deployment and therefore did not generate `coverage-report.json`; the hook correctly treats that runtime evidence as missing. This does not affect the source builder strict gate or the reminder tests.
- A concurrent full-suite run inflated SAF-03 warm p95. Its dedicated isolated test passed 12/12, confirming load interference rather than a hot-path regression; no performance code or threshold was changed.

## Known Stubs

None.

## Verification

- `rtk node --test tests/router.coverage-audit.test.mjs tests/router.freshness.test.mjs tests/router.build-manifest.test.mjs` — 27/27 passed.
- `rtk node --test tests/router.coverage.test.mjs tests/router.route-targets.test.mjs tests/router.failopen.test.mjs` — 23/23 passed.
- `rtk node --test tests/*.test.mjs` — 723/723 passed.
- `rtk node --test tests/router.coexistence.test.mjs tests/router.lifecycle.test.mjs` — 37/37 passed.
- `rtk node --test tests/router.perf-calibration.test.mjs` — 12/12 passed with SAF-03 ceilings unchanged.
- Final `rtk node --test tests/*.test.mjs` — exit status 0.
- `rtk node --test tests/router.safety-release.test.mjs` — 14/14 passed.
- Phase 28 focused regression suite — 113/113 passed.
- Final serial `rtk node --test --test-concurrency=1 tests/*.test.mjs` — exit status 0.

## User Setup Required

None.

## Next Phase Readiness

- Phase 29 can use strict coverage as its deterministic curation regression gate.
- The runtime installer must deploy the Plan 28-01 builder/audit bundle before the live report can become fresh; the hook remains safely fail-open until then.

## Self-Check: PASSED

- All four scoped implementation/test artifacts exist.
- Commits `018c493`, `d4cb668`, `c8d3912`, `5177718`, `1d9ed47`, and `6898da0` exist.
- COV-04 and COV-05 verification commands pass.

---
*Phase: 28-coverage-audit-guard*
*Completed: 2026-07-29*
