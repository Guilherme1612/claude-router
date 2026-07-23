---
phase: 12-incremental-change-detection-and-watcher
plan: "02"
subsystem: registry
tags: [node, esm, incremental-build, canonical-assembly, lifecycle-diff]
requires:
  - phase: 12-01
    provides: portable fingerprint snapshots and evidence-gated lifecycle diffs
provides:
  - Shared canonical assembly for full and incremental registry construction
  - Validated dirty-root observation replacement driven by lifecycle evidence
  - Complete-return REG-03 parity across deterministic mutation sequences
affects: [12-03-watcher, registry-reconciliation, inactive-candidate-build]
tech-stack:
  added: []
  patterns: [acquisition-only incrementality, shared semantic oracle, complete-return byte parity]
key-files:
  created: []
  modified: [src/registry/build.mjs, tests/router.registry-build.test.mjs]
key-decisions:
  - "Full and incremental builds differ only at acquisition; both delegate every canonical semantic to assembleRegistry."
  - "Incremental acquisition accepts complete per-runtime observations, verifies lifecycle diff hashes, and replaces only logical-root slices named by authoritative evidence."
requirements-completed: [REG-03, CHG-01]
coverage:
  - id: D1
    description: "Every supported mutation yields byte-identical complete full and incremental returns."
    requirement: REG-03
    verification:
      - kind: integration
        ref: "tests/router.registry-build.test.mjs#REG-03 incremental return remains byte-identical after every supported mutation"
        status: pass
    human_judgment: false
  - id: D2
    description: "Lifecycle removal, replacement, weak-match, declared-permission, and access-denial evidence drive bounded inactive rebuilding."
    requirement: CHG-01
    verification:
      - kind: integration
        ref: "tests/router.registry-build.test.mjs#mutation sequence and tests/router.registry-diff.test.mjs"
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-07-15
status: complete
---

# Phase 12 Plan 02: Incremental Registry Equivalence Summary

**Validated dirty-root acquisition now feeds the exact canonical assembler used by clean full builds, proving byte-identical registry, diagnostics, summary, and fingerprints after every supported mutation.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-15T11:56:08Z
- **Completed:** 2026-07-15T12:01:09Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Extracted `assembleRegistry` as the single validation, grouping, conflict, precedence, sorting, diagnostic normalization, count, and fingerprint path.
- Kept `buildFullRegistry` as the clean discovery oracle and added `buildIncrementalRegistry` with validated prior acquisition and lifecycle diff contracts.
- Replaced only observations and diagnostics belonging to lifecycle-dirty logical roots before canonical assembly, while retaining `activated: false` and portable output.
- Added complete-return parity after add, edit, strong and weak rename, compound edit/rename, disable/dependency, declared permission, project precedence, delete, malformed transitions, and access denial.

## Task Commits

1. **Task 1: Extend the registry suite with per-step full/incremental equivalence** - `8a826db` (test, RED)
2. **Task 2: Refactor to one canonical assembler and implement incremental acquisition** - `550abd8` (feat, GREEN)

**Plan metadata:** skipped (commit_docs disabled)

## Files Created/Modified

- `src/registry/build.mjs` - Shared assembler, injectable full acquisition, validated incremental lifecycle acquisition, and dirty-root replacement.
- `tests/router.registry-build.test.mjs` - Deterministic REG-03 mutation sequence and full-return portability/order parity.

## Decisions Made

- The prior incremental state is a complete per-runtime acquisition containing observations and diagnostics; the canonical registry return remains unchanged and portable.
- Lifecycle diff hashes are verified when present, unknown logical roots fail closed, and acquisition seams remain explicit and read-only.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- RED: `8a826db` failed because `buildIncrementalRegistry` was intentionally absent.
- GREEN: `550abd8` introduced shared assembly and incremental acquisition; the mutation suite and all regressions pass.

## Verification

- Planned focused/parity/lifecycle command: 44/44 passed.
- Complete repository suite: 421/421 passed.
- Serialized incremental outputs contain no temporary absolute roots and preserve inactive candidate semantics.

## Known Stubs

None. Empty arrays and maps are bounded internal accumulators or valid empty lifecycle state, not unwired output.

## User Setup Required

None - no packages, services, environment variables, or runtime activation were added.

## Next Phase Readiness

Plan 12-03 can use the validated incremental entry point from its background watcher/reconciliation controller. No blockers remain.

## Self-Check: PASSED

- Both modified files and this summary exist.
- Commits `8a826db` and `550abd8` exist in repository history.
- Focused and full repository verification pass.

---
*Phase: 12-incremental-change-detection-and-watcher*
*Completed: 2026-07-15*
