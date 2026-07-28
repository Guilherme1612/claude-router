---
phase: 21-authoritative-personalized-inventory
plan: 04
subsystem: registry
tags: [inventory, convergence, watcher, reconciliation, last-known-good]
requires:
  - phase: 21-02
    provides: exhaustive portable inventory and complete-root evidence
  - phase: 21-03
    provides: exact continuity and transitive invalidation
provides:
  - Canonical semantic snapshot and invalidation convergence comparison
  - Complete-baseline watcher authority with explicit operational inspection state
  - Immediate authoritative anomaly triggers and bounded five-minute repair
affects: [21-05, phase-22-contracts, phase-26-publication]
tech-stack:
  added: []
  patterns: [semantic-operational state separation, last-complete retention, single-flight authoritative repair]
key-files:
  created:
    - tests/router.inventory-convergence.test.mjs
  modified:
    - tests/router.registry-watcher.test.mjs
    - src/registry/watcher.mjs
    - src/registry/validate.mjs
key-decisions:
  - "Watcher events remain hints; filename-less and explicit anomaly signals trigger immediate authoritative reconciliation."
  - "Operational generations, timestamps, triggers, and recovery metadata are excluded from canonical semantic comparisons."
  - "Incomplete scans expose degraded state and retain the last complete fingerprint and semantic authority."
metrics:
  duration: 12min
  completed: 2026-07-26
status: complete
---

# Phase 21 Plan 04: Authoritative Inventory Convergence Summary

**Byte-exact semantic convergence now separates watcher operations from complete inventory authority, retaining last-known-good state across incomplete scans and failed reconciliation.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-26
- **Completed:** 2026-07-26
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added a deterministic four-profile, eight-mutation convergence matrix covering missed, duplicated, coalesced, reordered, filename-less, restart, root-replacement, and fingerprint-mismatch scenarios.
- Added an exact semantic comparator that canonicalizes snapshot and invalidation ordering while excluding operational metadata.
- Added watcher inspection with the only permitted `current`, `reconciling`, `degraded`, and `failed` states, complete-baseline retention, generation IDs, stable reasons, affected roots, and recovery actions.
- Made filename-less and explicit authoritative anomaly triggers immediate while preserving debounce, maximum-latency, single-flight, and rerun coalescing behavior.
- Prevented incomplete scans from writing fingerprint state or replacing last-complete authority.

## Task Commits

1. **Task 1: Specify event-permutation convergence and last-complete retention** - `2020834` (test)
2. **Task 2: Implement complete-snapshot authority and convergence gating** - `bee69bd` (feat)

**Plan metadata:** skipped (`commit_docs` disabled and `.planning/` is gitignored)

## Files Created/Modified

- `tests/router.inventory-convergence.test.mjs` - Repeated profile, mutation, anomaly, invalidation, and operational-metadata byte oracle.
- `tests/router.registry-watcher.test.mjs` - Immediate trigger, operational state, complete-baseline retention, and single-flight assertions.
- `src/registry/watcher.mjs` - Authoritative trigger scheduling, operational inspection plane, generation tracking, incomplete-scan degradation, and last-complete retention.
- `src/registry/validate.mjs` - Canonical semantic snapshot and invalidation comparison used by the incremental/full activation gate.

## Decisions Made

- The watcher advances its fingerprint baseline only after scan completeness, reconciliation, and state persistence succeed.
- Operational metadata is stripped only at the semantic envelope boundary so meaningful nested fields such as dependency `state` remain authoritative.
- The existing `assembleRegistry` seam remains the single full/incremental semantic assembler; no duplicate builder was introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test oracle] Updated legacy filename-less debounce expectation**
- **Found during:** Task 2
- **Issue:** A pre-existing watcher test expected filename-less events to wait for debounce, conflicting with D-05 immediate ambiguous-event reconciliation.
- **Fix:** Updated the assertion to require immediate authoritative work while retaining flood coalescing and maximum-latency coverage.
- **Files modified:** `tests/router.registry-watcher.test.mjs`
- **Verification:** Focused convergence/watcher/activation suite passes 33/33.
- **Committed in:** `bee69bd`

**2. [Rule 3 - Verification path] Used the repository's actual activation test filename**
- **Found during:** Overall verification
- **Issue:** PLAN.md names `tests/router.registry-activation.test.mjs`, which does not exist; the maintained suite is `tests/router.registry-activate.test.mjs`.
- **Fix:** Ran the actual activation suite and recorded the plan typo.
- **Files modified:** None.
- **Verification:** `router.registry-activate.test.mjs` passes as part of the 33-test focused slice.
- **Committed in:** N/A

**Total deviations:** 2 (1 Rule 1 test-oracle correction, 1 Rule 3 verification-path correction). **Impact:** Behavior now matches D-05 and verification uses the repository's maintained activation suite without scope expansion.

## Issues Encountered

- `tests/router.registry-build.test.mjs` has one pre-existing failure in “mode-map stamping seeds record mapping.explicit_subjects so the mapper publishes dispatch routes”: `tuple_validation_failed` in `publishCompiledIndex`. The other 6 build tests pass, including the full/incremental single-assembler and mutation byte-identity contracts. The failing publication module is outside Plan 21-04 ownership and was not changed.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

Plan 21-05 can consume explicit freshness and degraded-root state while relying on exact semantic convergence and last-complete authority. The separate pre-existing tuple-publication regression should be handled by its owning publication plan.

## Self-Check: PASSED

- Created convergence test and all four modified implementation/test artifacts exist.
- Task commits `2020834` and `bee69bd` exist.
- Convergence/watcher/actual activation suite: 33/33 passed.
- Registry build suite: 6/7 passed; the unrelated pre-existing tuple-publication failure is documented above.

---
*Phase: 21-authoritative-personalized-inventory*
*Completed: 2026-07-26*
