---
phase: 05-route-coverage-expansion
plan: 04
status: complete
subsystem: route-coverage
tags:
  - calibration
  - route-coverage
  - regression-gates
  - phase-05
requires:
  - calibration-tasks.json
  - router.calibrate.mjs
  - /Users/guilherme/.claude/router/mode-map.json
provides:
  - tests/router.calibration-coverage.test.mjs
affects:
  - COV-03
  - COV-04
  - COV-05
  - COV-06
  - COV-07
  - COV-08
  - COV-09
  - COV-10
  - COV-11
  - COV-12
tech_stack:
  added:
    - node:test
    - node:assert/strict
    - node:child_process spawnSync
  patterns:
    - calibration fixture COV edge markers
    - subprocess calibration gate
    - category-aware fixture threshold
key_files:
  created:
    - tests/router.calibration-coverage.test.mjs
    - .planning/phases/05-route-coverage-expansion/05-04-SUMMARY.md
  modified:
    - calibration-tasks.json
    - router.calibrate.mjs
    - tests/router.calibration-graph.test.mjs
    - tests/router.calibration-evolution.test.mjs
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
key_decisions:
  - Phase 05 route coverage fixtures are identified by COV edge text and counted separately from original, codebase, and evolution fixtures.
  - The calibration threshold now requires all Phase 05 COV fixtures to pass while preserving the original 10/10 core gate and existing codebase/evolution gates.
metrics:
  duration: ~35min
  completed_at: 2026-07-09T20:05:00Z
  tasks_completed: 3
  tests_added: 4
---

# Phase 05 Plan 04: Calibration Fixtures and Regression Gates Summary

Phase 05 route coverage now has standing calibration fixtures and a focused regression gate that preserves original core routing behavior.

## What Changed

- Appended calibration fixtures 19-27 for COV-03 through COV-12: debug, tests, review, UI, GitHub/PR, Graphify, docs/spec/planning, direct agent dispatch, and missing-MCP warn routing.
- Updated `router.calibrate.mjs` to count Phase 05 COV fixtures separately and include every Phase 05 fixture in the pass threshold.
- Added `tests/router.calibration-coverage.test.mjs` to assert original fixture ids 1-10 remain represented, all Phase 05 clusters have COV edge text, and the calibration subprocess exits 0.
- Updated older calibration graph/evolution tests so their fixture-count and threshold checks understand the expanded Phase 05 fixture subset.
- Updated Phase 05 planning state and marked COV-03 through COV-09 complete.

## Verification

```bash
node --test tests/router.calibration-coverage.test.mjs
node --test tests/router.calibration-evolution.test.mjs
node router.calibrate.mjs
node --test tests/router.coverage.test.mjs tests/router.route-targets.test.mjs tests/router.direct-agent-warn.test.mjs tests/router.calibration-coverage.test.mjs && node router.calibrate.mjs && node --test tests/*.test.mjs
```

Results:
- Targeted Phase 05 route tests: 16/16 passed.
- Calibration: 23/27 right, threshold 21; original 10/10 preserved; Phase 05 fixtures all passed.
- Full suite: 324/324 passed after rerunning with global router file write permission for existing perf-evolution tests.
- Performance gate: existing warm routing tests passed under the configured 100ms target.

## Commits

| Task | Commit | Notes |
|------|--------|-------|
| Task 1: Add Phase 05 calibration fixtures | 760f9dd | Appended COV-03 through COV-12 fixtures and made the calibration threshold include Phase 05 coverage. |
| Task 2: Add calibration coverage regression test | 6f1bf94 | Added the focused coverage test and aligned graph calibration fixture-count assertions. |
| Task 3: Run Phase 05 and full regression gates | cd2aa7b | Aligned evolution calibration fixture-count assertions discovered during the full-suite gate. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Updated calibration harness count guard**
- **Found during:** Task 1 verification
- **Issue:** `router.calibrate.mjs` rejected 27 fixtures because it still enforced the Phase 3-only 16-20 fixture range.
- **Fix:** Counted Phase 05 fixtures by COV edge text, preserved original/codebase/evolution counts, and required all Phase 05 fixtures in the pass threshold.
- **Files modified:** `router.calibrate.mjs`
- **Commit:** 760f9dd

**2. [Rule 3 - Blocking Issue] Updated stale calibration count tests**
- **Found during:** Task 2 and Task 3 verification
- **Issue:** Existing graph/evolution calibration tests still assumed the pre-Phase-05 fixture range and threshold.
- **Fix:** Updated both tests to count Phase 05 COV fixtures separately and mirror the new threshold.
- **Files modified:** `tests/router.calibration-graph.test.mjs`, `tests/router.calibration-evolution.test.mjs`
- **Commit:** 6f1bf94, cd2aa7b

## Known Stubs

None. Stub-pattern scan hits were comments or fixture text about `mode=null` and the historical placeholder regression, not active placeholder behavior.

## Threat Flags

None. The plan added calibration data and tests only. No new network endpoint, auth path, file access path, schema boundary, external classifier, or missing-MCP dispatch behavior was introduced.

## Self-Check: PASSED

- Found `calibration-tasks.json`.
- Found `tests/router.calibration-coverage.test.mjs`.
- Found commit `760f9dd`.
- Found commit `6f1bf94`.
- Found commit `cd2aa7b`.
