---
phase: 18-autonomous-lifecycle-and-release-gates
plan: 02
subsystem: lifecycle-recovery
tags: [immutable-generations, atomic-pointer, lkg-recovery, coexistence]
requires:
  - phase: 18-01
    provides: Verified registry and compiled release tuples
provides:
  - Complete immutable installation generations selected by one durable pointer
  - Reversible idempotent router binding lifecycle
  - Durable verified release-tuple recovery with crash-boundary evidence
affects: [18-03-release-gates]
tech-stack:
  added: []
  patterns: [stage-verify-rename-pointer, validate-before-repair]
key-files:
  created: [tests/router.installer-coexistence.test.mjs, tests/router.lifecycle-recovery.test.mjs]
  modified: [src/lifecycle/router-lifecycle.mjs, src/prompt/publish-index.mjs, src/prompt/compile-index.mjs]
key-decisions:
  - "Installation authority is one active generation pointer over complete immutable generation manifests."
  - "Release tuple repair validates known-good bytes through the bounded tuple reader before replacing active authority."
requirements-completed: [SAF-10, MAP-02, ACT-01]
duration: 10min
completed: 2026-07-17
status: complete
---

# Phase 18 Plan 02: Immutable Lifecycle and Recovery Summary

**Router upgrades now publish complete immutable installation generations through one atomic pointer, while corrupt release authority is durably repaired only from a fully verified tuple.**

## Performance

- **Duration:** 10 min
- **Completed:** 2026-07-17
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added staged, fsynced, hash-verified installation generations and one active-generation pointer with startup staging cleanup and known-good repair.
- Added exact idempotent disable/enable binding transitions that preserve unrelated Claude hooks, Claude settings, and Codex configuration.
- Added tuple publication crash injection around the authority switch and validate-before-repair recovery from durable known-good state.
- Proved a recovered tuple can subsequently advance to a strictly newer verified registry/index pair.

## Task Commits

1. **Task 1 RED:** `4566121`
2. **Task 1 GREEN:** `910f6da`
3. **Task 2 RED:** `8b3695b`
4. **Task 2 GREEN:** `2f6c45e`

## Decisions Made

- Stable bootstrap binding is independent of generation payload identity; only the active pointer selects a complete generation.
- Recovery candidates use the same bounded manifest, component hash, compatibility, and route validation as active readers before pointer repair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrupt tuple JSON bypassed known-good recovery.**
- **Found during:** Task 2 focused verification
- **Issue:** The hot-path loader intentionally failed closed on malformed active JSON and did not expose a safe mutation API for repair.
- **Fix:** Added an explicit recovery-candidate validation seam and durable `recoverReleaseTuple` operation.
- **Files modified:** `src/prompt/compile-index.mjs`, `src/prompt/publish-index.mjs`
- **Commit:** `2f6c45e`

## Verification

- `node --test tests/router.installer-coexistence.test.mjs tests/router.lifecycle.test.mjs tests/router.coexistence.test.mjs` — pass
- Wave boundary: 73/73 tests pass across installer, recovery, lifecycle, coexistence, activation, watcher, and compiled-index suites.

## Known Stubs

None.

## Self-Check: PASSED

- Both new test artifacts exist.
- All four RED/GREEN task commits are reachable.
- Focused and wave-boundary verification passed.

## Next Phase Readiness

Plan 18-03 can enforce release closeout gates over executable generation, coexistence, and tuple-recovery evidence.
