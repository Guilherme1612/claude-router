---
phase: 14-deterministic-mapping-activation-and-rollback
plan: "06"
subsystem: activation-authority
tags: [cross-process-cas, known-good, recovery, rollback-journal, crash-consistency]
requires:
  - phase: 14-05
    provides: exact production verification authentication and behavioral activation gates
provides:
  - Controller-owned cross-process pointer mutation lock with sequence CAS
  - Semantic policy-compatible known-good verification and immutable recovery ordering
  - Durable privacy-safe rollback intent/completion journal with restart reconciliation
affects: [phase-14-verification, activation, recovery, rollback, operator-control]
tech-stack:
  added: []
  patterns: [atomic directory lock, semantic immutable history verification, operation-record journaling]
key-files:
  created: []
  modified: [src/registry/activate.mjs, tests/router.registry-activate.test.mjs, tests/router.control-cli.test.mjs]
key-decisions:
  - "One owned mutation lock spans active pointer reread, expected-sequence comparison, rename, and directory fsync for activation and rollback."
  - "Known-good history requires both bundle integrity and current production verification semantics; manifest created_at and stable version ID define recovery order."
  - "Rollback intent is durable before publication and completion is recoverable by comparing pending operations with active pointer sequence and destination."
requirements-completed: [ACT-01]
coverage:
  - id: D1
    description: Separate processes racing the same active pointer sequence produce exactly one successful CAS writer
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.registry-activate.test.mjs#cross-process pointer CAS has exactly one winner for an expected sequence
        status: pass
    human_judgment: false
  - id: D2
    description: Recovery and rollback select only semantic production-compatible known-good versions in immutable deterministic order
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.registry-activate.test.mjs#recovery and rollback reject integrity-valid versions that are not semantic known-good
        status: pass
      - kind: unit
        ref: tests/router.registry-activate.test.mjs#recovery orders equally dated known-good versions by stable version id never mutable mtime
        status: pass
    human_judgment: false
  - id: D3
    description: Rollback pending and completion outcomes remain durable truthful and restart-recoverable across injected failures
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.registry-activate.test.mjs#rollback journal reports truthful outcomes before and after pointer publication
        status: pass
      - kind: integration
        ref: tests/router.control-cli.test.mjs#rollback is detailed preview-first and exact confirmation is mandatory
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 06: Cross-Process Authority and Durable Rollback Summary

**Pointer authority is now a lock-protected cross-process CAS backed by semantic known-good history and a crash-recoverable rollback journal.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-15T20:51:00Z
- **Completed:** 2026-07-15T21:01:06Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added an atomically acquired controller-owned mutation lock with bounded dead-owner recovery around the complete pointer transition.
- Extended immutable version verification to authenticate embedded production evidence and removed mutable directory mtime from recovery authority.
- Added a privacy-safe per-operation rollback journal whose pending intent precedes publication and whose completed or not-committed outcome can be reconciled after restart.
- Preserved operator CLI coverage by replacing obsolete test-only activation fixtures with production-valid evidence envelopes.

## Task Commits

1. **Task 1 tests: Specify cross-process pointer CAS** - `8a1b4fb` (test)
2. **Task 1 implementation: Serialize pointer publication** - `92f9cd8` (fix)
3. **Task 2 tests: Specify semantic known-good recovery** - `4b20cdd` (test)
4. **Task 2 implementation: Enforce semantic known-good history** - `f3d6524` (fix)
5. **Task 3 tests: Specify durable rollback journal** - `cfdf22b` (test)
6. **Task 3 implementation: Journal truthful rollback outcomes** - `901f2ad` (feat)
7. **Regression repair: Use production-valid control fixtures** - `2a16c08` (test)

## Files Created/Modified

- `src/registry/activate.mjs` - Adds mutation locking, semantic history verification, deterministic recovery, and rollback journaling.
- `tests/router.registry-activate.test.mjs` - Covers multi-process CAS, unsafe historical bundles, immutable ordering, failure injection, and restart recovery.
- `tests/router.control-cli.test.mjs` - Uses production-authentic fixtures so operator surfaces exercise the hardened known-good boundary.

## Decisions Made

- Lock ownership is recorded with a random token, PID, and bounded start time; only the matching token may release the lock.
- Equal manifest creation times resolve by ascending stable version ID.
- A completion-journal failure after pointer publication returns `committed_recovery_required`, never an unchanged-state failure.
- Journal records contain only operation ID, source, destination, time, outcome, safe reason, and expected sequence.

## Deviations from Plan

### Auto-fixed Issues

- **[Rule 1 - Bug]** Updated `tests/router.control-cli.test.mjs` after the new semantic known-good verifier correctly rejected its obsolete test-only activation fixtures. Production-valid envelopes preserve the intended operator regressions without weakening runtime policy.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. T-14-06-01 through T-14-06-03 are covered by real process races, semantic unsafe-history fixtures, immutable-order manipulation, and rollback journal failure injection.

## Verification

- `node --test tests/router.registry-activate.test.mjs` - 8 passed, 0 failed.
- `node --test tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs tests/router.control-cli.test.mjs` - 32 passed, 0 failed.
- `git diff --check` - passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 14-06 closes the remaining ACT-01 cross-process authority, semantic history, recovery-order, and rollback durability gaps. The implementation is ready for the final Phase 14 gap plan and independent verification.

## Self-Check: PASSED

- All seven plan and regression commits exist on `main`.
- The summary exists and the full plan verification suite passes with 32 tests and 0 failures.
- Unrelated planning and Graphify changes remain unstaged; `ROADMAP.md` was not modified by this execution.

---
*Phase: 14-deterministic-mapping-activation-and-rollback*
*Completed: 2026-07-15*
