---
phase: 29-mode-map-curation-and-signal-patterns-expansion
plan: 01
subsystem: testing
tags: [node-test, routing, mode-map, calibration, tdd]
requires:
  - phase: 28-coverage-audit-guard
    provides: typed route-target and missing-MCP safety contracts
provides:
  - failing v2/v3 signal-pattern normalization and collision contracts
  - portable synthetic routing contracts for 18 lifecycle and design targets
  - deterministic safety-first threshold selection contracts
affects: [29-02, 29-03, 29-04]
tech-stack:
  added: []
  patterns: [node:test RED contracts, in-memory routing fixtures, fabricated threshold records]
key-files:
  created:
    - tests/router.mode-map-v3.test.mjs
    - tests/router.mode-map-curation.test.mjs
    - tests/router.calibration-thresholds.test.mjs
  modified: []
key-decisions:
  - "Target the public seams named by later Phase 29 plans; do not add a test-only parser or scorer."
  - "Treat expected RED failures as successful Wave 0 evidence only when existing safety regressions remain green."
patterns-established:
  - "Portable router tests inject neutral manifest and mode-map objects through inspectDecision."
  - "Threshold tests use small scored records to isolate safety, objective ordering, boundaries, and sensitivity."
requirements-completed: [MAP-01, MAP-02, MAP-03, SIG-01, SIG-02, SIG-03, SIG-04]
coverage:
  - id: D1
    description: "Executable v2/v3 normalization, cap, malformed-pattern, and collision RED contracts"
    requirement: SIG-02
    verification:
      - kind: unit
        ref: "rtk node --test tests/router.mode-map-v3.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Portable routing RED contracts for all 18 required lifecycle and design targets"
    requirement: MAP-03
    verification:
      - kind: integration
        ref: "rtk node --test tests/router.mode-map-curation.test.mjs tests/router.route-targets.test.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Safety-first deterministic threshold selection and leave-one-out RED contracts"
    requirement: SIG-04
    verification:
      - kind: unit
        ref: "rtk node --test tests/router.calibration-thresholds.test.mjs"
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-07-29
status: complete
---

# Phase 29 Plan 01: Wave 0 Routing Contracts Summary

**Three focused RED suites lock mixed pattern validation, portable 18-target routing, and safety-first threshold calibration before production changes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-29T15:44:00Z
- **Completed:** 2026-07-29T15:52:05Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Specified backward-compatible `contains` normalization, 1–6 pattern limits, deterministic malformed diagnostics, and explicit collision groups.
- Enumerated all eight lifecycle and ten design routes against neutral in-memory fixtures, with hard negatives, live-path isolation, and blocked-agent safety.
- Specified zero-wrong-high threshold selection, deterministic objective ordering, independent boundary evidence, and pure leave-one-out reporting.

## Task Commits

1. **Task 1: Specify v2/v3 normalization, cap, and collision behavior** - `7a42239` (test)
2. **Task 2: Specify portable lifecycle and design routing** - `72ac8bf` (test)
3. **Task 3: Specify deterministic threshold selection** - `f7a28b5` (test)

## Files Created/Modified

- `tests/router.mode-map-v3.test.mjs` - Mixed schema, malformed input, cap, collision, and normalized-value contracts.
- `tests/router.mode-map-curation.test.mjs` - Synthetic 18-target routing, negatives, isolation, and missing-MCP contracts.
- `tests/router.calibration-thresholds.test.mjs` - Candidate, safety objective, boundary, tie-break, and sensitivity contracts.

## Decisions Made

- Used only existing `node:test`, router imports, local fixture builders, and plain objects.
- Asserted public semantic values and diagnostic codes rather than private helper layout.
- Preserved the established route-target suite unchanged to distinguish missing Phase 29 behavior from safety regressions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The combined RED gate reports 12 expected failures: missing `normalizeSignalPattern`, missing injected fixture-object precedence, and missing threshold helper exports/behavior.
- The seven existing route-target and blocked-agent checks in the combined gate remain green.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 29-02 can implement the shared normalizer, collision diagnostics, and object injection seam against executable contracts.
- Plans 29-03 and 29-04 can curate routes and implement threshold selection without inventing alternate test-only routing logic.

## Self-Check: PASSED

- All three planned test files exist.
- Task commits `7a42239`, `72ac8bf`, and `f7a28b5` exist.
- RED failures identify absent Phase 29 contracts; existing route-target safety checks pass.

---
*Phase: 29-mode-map-curation-and-signal-patterns-expansion*
*Completed: 2026-07-29*
