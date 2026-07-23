---
phase: 14-deterministic-mapping-activation-and-rollback
plan: "02"
subsystem: registry
tags: [activation, immutable-versions, rollback, watcher, durability]
requires:
  - phase: 14-01
    provides: deterministic candidate mapping and policy fingerprints
provides:
  - Frozen eight-gate activation verification producer
  - Immutable manifest-complete versions and atomic active pointer replacement
  - Recovery, protected retention, preview-bound rollback, and private audit evidence
  - Live reconciliation to mapping to verification to activation orchestration
affects: [14-03, registry-control, lifecycle-installer]
tech-stack:
  added: []
  patterns: [fail-closed gate evidence, content-derived versions, manifest-last publication, pointer-only rollback]
key-files:
  created: [src/registry/validate.mjs, src/registry/activate.mjs, tests/router.registry-activate.test.mjs]
  modified: [src/registry/watcher.mjs, tests/router.registry-watcher.test.mjs, src/lifecycle/router-lifecycle.mjs, tests/router.lifecycle.test.mjs]
key-decisions:
  - "Only the frozen eight-gate producer can create trusted activation evidence; test overrides use an explicit test-only factory."
  - "Immutable version identity derives from the full canonical bundle digest and active authority changes only through active.json replacement."
  - "Safe unmapped candidates remain eligible for activation while ambiguous mappings preserve prior authority."
requirements-completed: [ACT-01]
duration: 15min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 02: Verified Immutable Activation Summary

**Complete, fresh, fingerprint-bound candidates now flow through a frozen eight-gate verifier into manifest-complete immutable versions and one durable active-pointer replacement.**

## Accomplishments

- Added canonical complete/non-passing verification evidence for all eight production gates with fixed in-process and repository-owned subprocess boundaries.
- Added content-derived immutable versions, manifest/file verification, sequence-bound pointer replacement, deterministic recovery, protected retention, preview-bound rollback, and bounded local audit evidence.
- Added live watcher ordering for reconciliation, deterministic mapping, verification, and activation, including safe-unmapped activation and ambiguity preservation.
- Deployed the watcher module dependency closure through the existing owned lifecycle installer.

## Task Commits

1. `32af5d7` — test(14-02): specify trusted immutable activation
2. `92a766a` — feat(14-02): add trusted immutable activation
3. `17c0e3f` — feat(14-02): activate eligible watcher candidates
4. `58ee36e` — fix(14-02): deploy activation controller modules

## Verification

- Task 1 exact command: 43 tests passed after deployment dependency closure.
- Task 2 exact command: 59 tests passed.
- Task 3 exact command: 43 tests passed.
- `git diff --check` passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed the watcher activation dependency closure**
- **Found during:** Final Task 1 command
- **Issue:** Installed controllers copied `watcher.mjs` but not its new mapping, validation, and activation imports, so child controllers exited before readiness.
- **Fix:** Added the three modules to lifecycle-owned deployment and updated the exact ownership-manifest assertion.
- **Files modified:** `src/lifecycle/router-lifecycle.mjs`, `tests/router.lifecycle.test.mjs`
- **Commit:** `58ee36e`

## Known Stubs

None.

## Self-Check: PASSED

- Created source and test files exist.
- All four task/deviation commits exist.
- No unexpected tracked-file deletions were introduced.
