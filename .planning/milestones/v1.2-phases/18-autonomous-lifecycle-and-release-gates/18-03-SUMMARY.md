---
phase: 18-autonomous-lifecycle-and-release-gates
plan: 03
subsystem: release-authority
tags: [release-matrix, staged-runner, latency, privacy, deterministic-evidence]
requires:
  - phase: 18-01
    provides: Autonomous dual-runtime lifecycle and verified release tuples
  - phase: 18-02
    provides: Immutable installation generations, coexistence, and tuple recovery
provides:
  - Unique-primary executable ownership matrix for all 20 v1.2 requirements
  - One sequential release command with latency isolated in its final child
  - Atomic deterministic privacy-safe release report bound to immutable versions
affects: [v1.2-verification, milestone-closeout]
tech-stack:
  added: []
  patterns: [allowlisted executable evidence, staged child gates, canonical atomic authority]
key-files:
  created: [release/v1.2-matrix.json, src/release/run-release.mjs, tests/router.v12-release.test.mjs]
  modified: [.gitignore, tests/router.compiled-evolution.test.mjs]
key-decisions:
  - "Primary requirement ownership remains inherited from Phases 11 through 17; Phase 18 evidence is explicitly secondary."
  - "Latency executes only after every correctness stage and emits measured warm p95 and hard-route values from the real compiled-route calibration."
  - "Release authority contains only allowlisted canonical fields and excludes raw child output, paths, environment values, prompts, and volatile process data."
requirements-completed: [CTX-01, CTX-02, ORC-01, ORC-02, TOK-01, TOK-02, EVO-05, REL-01]
duration: 18min
completed: 2026-07-17
status: complete
---

# Phase 18 Plan 03: Executable v1.2 Release Authority Summary

**One command now proves all 20 v1.2 requirements from current executable evidence and publishes independently verifiable release authority only after every hard gate passes.**

## Performance

- **Duration:** 18 min
- **Completed:** 2026-07-17
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added an exact 20-row machine-readable release matrix with one inherited primary owner per requirement and labeled Phase 18 secondary lifecycle evidence.
- Added strict validation for incomplete, unknown, duplicate, skipped, unsafe, missing, circular, or version-mismatched evidence before execution.
- Added one sequential runner covering regression, calibration/canary, privacy, coexistence, recovery, context/orchestration/token, and an isolated final latency stage.
- Added canonical atomic report publication with exact matrix hash, registry/index/policy/corpus versions, commands, gates, thresholds, and measured latency values.
- Added independent verification and adversarial coverage for tampering, privacy sentinels, child failure, timeout, missing evidence, skips, threshold failure, and prior-authority preservation.

## Task Commits

1. **Task 1 RED:** `11c5b07`
2. **Task 1 GREEN:** `0158c44`
3. **Task 2 RED:** `72fda90`
4. **Task 2 GREEN:** `4683982`
5. **Task 3 RED:** `9c492fc`
6. **Task 3 GREEN:** `f68cc51`

## Decisions Made

- Matrix commands are constrained to repository-owned Node test files and cannot use the release contract itself as sole primary behavioral evidence.
- Child stdout and diagnostics are never copied into release authority; only allowlisted gate reason codes and exact latency measurements cross the child/report boundary.
- The generated default report is runtime evidence and is ignored by git; the canonical matrix, runner, and verifier remain source-controlled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Real-route latency measurements were not machine-readable.**
- **Found during:** Task 2
- **Fix:** Added a release-only TAP diagnostic carrying exact warm p95 and maximum route measurements from the existing compiled-route calibration.
- **Files modified:** `tests/router.compiled-evolution.test.mjs`
- **Committed in:** `4683982`

**2. [Rule 1 - Bug] TAP zero-skip summary was classified as a skipped test.**
- **Found during:** Task 3 real one-command verification
- **Fix:** Restricted skip detection to explicit skipped test records or a nonzero TAP skip summary.
- **Files modified:** `src/release/run-release.mjs`
- **Committed in:** `f68cc51`

## Verification

- `node --test tests/router.v12-release.test.mjs` — 7/7 pass.
- `node --test tests/router.v12-release.test.mjs tests/router.privacy.test.mjs tests/router.compiled-evolution.test.mjs tests/router.context-budget.test.mjs` — 32/32 pass.
- `node src/release/run-release.mjs` — all seven stages pass: regression, calibration, privacy, coexistence, recovery, context-token, latency.

## Known Stubs

None.

## Self-Check: PASSED

- All three canonical artifacts exist.
- All six RED/GREEN commits are reachable.
- The real release command produced and independently revalidated atomic release evidence.

## Next Phase Readiness

Phase 18 implementation is complete and ready for independent phase verification and milestone closeout. No blockers found.

---
*Phase: 18-autonomous-lifecycle-and-release-gates*
*Completed: 2026-07-17*
