---
phase: 26-coherent-publication-and-dual-runtime-release
plan: 04
subsystem: release-lifecycle
tags: [atomic-publication, rollback, crash-recovery, known-good]
requires:
  - phase: 26-03
    provides: Complete validated tuple publication and invalidation equivalence
provides:
  - Failure-isolated member and manifest publication boundaries
  - Post-activation reload validation with known-good restoration
  - Complete-tuple restart recovery through the existing lifecycle seam
affects: [release-verification, installed-controller, rollback]
tech-stack:
  added: []
  patterns: [pointer-last activation, immutable tuple recovery, fail-closed restart]
key-files:
  modified:
    - src/prompt/publish-index.mjs
    - src/lifecycle/router-lifecycle.mjs
    - tests/router.phase26-lifecycle.test.mjs
key-decisions:
  - "Reuse release-tuples/known-good.json as the sole complete-tuple recovery authority."
  - "Validate the active tuple after pointer replacement and restore verified known-good on reload failure."
requirements-completed: [REL-05, REL-08]
duration: 18min
completed: 2026-07-28
status: complete
---

# Phase 26 Plan 04: Guarded Activation and Recovery Summary

**Complete routing tuples now remain old-or-new across every publication boundary and restart repairs interrupted pointer transitions from verified immutable known-good bytes.**

## Performance

- **Duration:** 18 min
- **Completed:** 2026-07-28
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added member-specific, manifest, verification, pointer, and reload failure gates without adding a second publication controller.
- Reload-validates the activated tuple before advancing known-good and restores the prior verified tuple on failure.
- Made complete-tuple recovery distinguish committed activation from an interrupted active/known-good pointer transition.
- Invoked the existing `recoverReleaseTuple` seam before installed controller restart.

## Task Commits

1. **Task 1 RED: Complete tuple activation failures** - `6e1343d`
2. **Task 1 GREEN: Guard complete tuple activation** - `fd4d73f`
3. **Task 2 RED: Complete tuple restart recovery** - `e357717`
4. **Task 2 GREEN: Recover complete tuple on restart** - `0a2c1f6`

## Deviations from Plan

None - the existing watcher verifier and canary order already gated publication, so no watcher code change was needed.

## Verification

- `node --test --test-concurrency=1 tests/router.phase26-lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs tests/router.lifecycle-recovery.test.mjs`
- Result: 44 passed, 0 failed.

## Known Stubs

None.

## Self-Check: PASSED

- All four task commits exist.
- All modified source and test files exist.
- The serial lifecycle, watcher, activation, and recovery gate passes.
