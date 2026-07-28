---
phase: 26-coherent-publication-and-dual-runtime-release
plan: 03
subsystem: release
tags: [invalidation, equivalence, atomic-publication, sha256]
requires:
  - phase: 26-02
    provides: Complete immutable decision tuple and bounded prompt projection
provides:
  - Eight-class transitive invalidation descriptors
  - Canonical complete build tuple identity
  - Pre-pointer tuple validation and failure isolation
affects: [26-04, release-lifecycle, registry-watcher]
tech-stack:
  added: []
  patterns: [canonical member fingerprints, pointer-last validation, authoritative watcher projections]
key-files:
  modified:
    - src/registry/reconcile.mjs
    - src/registry/build.mjs
    - src/registry/watcher.mjs
    - src/prompt/publish-index.mjs
    - tests/router.phase26-invalidation.test.mjs
    - tests/router.phase26-equivalence.test.mjs
key-decisions:
  - "Use one ordered eight-class invalidation vocabulary and hash the complete transitive closure."
  - "Validate the immutable candidate tuple through the production loader before replacing active.json."
requirements-completed: [REL-04, REL-08]
duration: 12min
completed: 2026-07-28
status: complete
---

# Phase 26 Plan 03: Invalidation and Full/Incremental Equivalence Summary

**Registry reconciliation now invalidates all decision dependencies deterministically while full and incremental builds publish the same pre-validated tuple value.**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-07-28
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added deterministic node, edge, dependency, adapter, inference-rule, manifest, correction, and negative-evidence invalidation coverage with a closure fingerprint.
- Exposed one canonical complete tuple value and identity from both full and incremental assembly.
- Routed authoritative background projections into publication and validated the candidate tuple before atomic pointer replacement.
- Proved build, member, manifest, verification, and pointer-boundary failures preserve the exact active pointer bytes.

## Task Commits

1. **Task 1: Extend invalidation to every dependency class and tuple sibling** - `519726b`
2. **Task 2: Prove complete full/incremental byte equivalence and pre-pointer crash safety** - `01e9650`

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `node --test --test-concurrency=1 tests/router.phase26-invalidation.test.mjs tests/router.phase26-equivalence.test.mjs tests/router.registry-reconcile.test.mjs tests/router.phase26-tuple.test.mjs tests/router.lifecycle-recovery.test.mjs`
- Result: 29 passed, 0 failed.

## Known Stubs

None.

## Self-Check: PASSED

- Both task commits exist.
- All modified source and test files exist.
- Serial focused and adjacent release tests pass.
