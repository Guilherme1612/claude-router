---
phase: 27-mutation-safety-infrastructure
plan: 02
subsystem: mutation-safety
tags: [latency, mode-map, manifest-builder, tdd]
requires: []
provides:
  - Strict p95<40ms and max<100ms mutation-safety regression assessment
  - Off-hot-path 30KB mode-map size guard
affects: [28-coverage-audit-guard, 29-mode-map-curation]
tech-stack:
  added: []
  patterns: [parallel safety gate, builder-time size ceiling, nearest-rank measurement reuse]
key-files:
  created: []
  modified:
    - src/evolution/perf-measure.mjs
    - tests/router.perf-calibration.test.mjs
    - build-manifest.mjs
    - tests/router.build-manifest.test.mjs
key-decisions:
  - Keep the locked 25ms canary unchanged and expose mutation safety as a separate performance-only gate.
  - Resolve the mode-map path from ROUTER_MODE_MAP_PATH with the installed Claude path as the default.
metrics:
  duration: 8m
  completed: 2026-07-29
status: complete
---

# Phase 27 Plan 02: Mutation Safety Infrastructure Summary

Strict mutation-latency ceilings and a builder-only 30KB mode-map guard now fail closed without adding prompt-hot-path work.

## Performance

- `assessMutationSafetyRegression` returns frozen pass/fail evidence with explicit 40ms p95 and 100ms max ceilings.
- The existing `assessCalibration` p95<25ms canary remains unchanged.
- The regression check reuses `CALIBRATION_CORPUS`, `measureRoutes`, and the existing isolated real-route harness.

## Mode-map Size Safety

- `build-manifest.mjs` checks the configured or installed mode-map after its atomic manifest write.
- Exactly 30,000 bytes passes; 30,001 bytes sets a non-zero exit code.
- The guard reuses the sole `fileStatSize` helper and never enters `router.mjs`.

## TDD Gate Compliance

- RED `0d052a5`: mutation-safety tests failed because the export did not exist.
- GREEN `2dee539`: the new gate made all 12 performance-calibration tests pass.
- RED `5ad71a4`: builder tests failed on overflow and the missing ceiling constant.
- GREEN `6de26af`: all 8 builder tests passed at and around the byte boundary.

## Verification

- `rtk node --test tests/router.perf-calibration.test.mjs` — 12/12 passed.
- `rtk node --test tests/router.build-manifest.test.mjs` — 8/8 passed.
- Export and source-boundary acceptance checks passed.
- Repository-wide runs reached 1,136 tests but retained pre-existing controller timing failures: 18 concurrent and 17 serial, all outside the four plan-owned files. Focused plan tests remained green.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Issues Encountered

The full suite is not currently green because installed-controller lifecycle tests exceed their fixed two-second publication timeout on this checkout. No plan-owned test or implementation failed, and changing unrelated lifecycle timing was outside this plan.

## Self-Check: PASSED

- All four modified plan files exist.
- All four TDD commits are present in git history.
- Both focused verification suites and every plan acceptance criterion pass.
