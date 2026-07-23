---
phase: 12-incremental-change-detection-and-watcher
plan: "01"
subsystem: registry
tags: [node, esm, sha256, fingerprint-tree, lifecycle-diff]
requires:
  - phase: 11-canonical-registry-and-runtime-adapters
    provides: canonical capability schema, stable identities, and portable provenance
provides:
  - Portable deterministic fingerprint-tree scans and validated atomic cache state
  - Evidence-gated lifecycle classification with one primary and ordered facets
  - CHG-01 and D-01 through D-04 executable mutation coverage
affects: [12-02-incremental-build, 12-03-watcher, registry-reconciliation]
tech-stack:
  added: []
  patterns: [standard-library-only ESM, SHA-256 over stable structured bytes, scan-state-is-cache, evidence-gated continuity]
key-files:
  created: [src/registry/fingerprint.mjs, src/registry/diff.mjs, tests/router.registry-diff.test.mjs]
  modified: []
key-decisions:
  - "Lifecycle precedence is structural, removed/added, disabled, scope, dependency, declared permission, then content."
  - "Only canonical identity, authoritative shared origin, or compatible native identity establishes continuity; similarity remains diagnostic-only."
  - "Read and access failures preserve uncertainty for the affected portable path and cannot confirm deletion or permission lifecycle change."
patterns-established:
  - "Fingerprint state validates schema, logical root set, portable containment, subtree hashes, root hashes, and document hash before reuse."
  - "One authoritative continuity pair emits one event with all remaining dimensions retained as ordered facets."
requirements-completed: [CHG-01]
coverage:
  - id: D1
    description: "Portable fingerprint trees are deterministic, path-contained, atomically persisted, and fully cache-validated."
    requirement: CHG-01
    verification:
      - kind: unit
        ref: "tests/router.registry-diff.test.mjs#portable fingerprint and state cache tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "The complete lifecycle matrix uses evidence-gated continuity, fixed precedence, and ordered facets without duplicates."
    requirement: CHG-01
    verification:
      - kind: unit
        ref: "tests/router.registry-diff.test.mjs#CHG-01 and D-01 through D-04 tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "Filesystem read denial remains a deterministic diagnostic and cannot become deletion or declared permission change."
    requirement: CHG-01
    verification:
      - kind: unit
        ref: "tests/router.registry-diff.test.mjs#access denial test"
        status: pass
    human_judgment: false
duration: 2h 4m
completed: 2026-07-15
status: complete
---

# Phase 12 Plan 01: Fingerprint Tree and Diff Engine Summary

**Portable Merkle-style fingerprint state with evidence-gated lifecycle diffs, deterministic primary/facet precedence, and uncertainty-safe access diagnostics**

## Performance

- **Duration:** 2h 4m wall time including runtime interruption
- **Started:** 2026-07-15T09:47:02Z
- **Completed:** 2026-07-15T11:50:38Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added sorted logical-root scanning with realpath containment, portable file/subtree hashes, and no absolute path or OS metadata leakage.
- Added fully validated atomic scan-state persistence that treats corrupt, incompatible, root-mismatched, path-injected, or hash-tampered state as a clean-scan request.
- Added deterministic add/edit/rename/move/disable/dependency/declared-permission/scope/delete lifecycle classification with strong continuity, weak-match diagnostics, and compound ordered facets.
- Kept OS access denial operational and path-scoped so it never masquerades as a declared permission change or confirmed deletion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Specify the portable fingerprint and complete lifecycle mutation contract** - `c999a3c` (test)
2. **Task 2: Implement deterministic fingerprint trees and evidence-gated lifecycle diffs** - `1f6cf04` (feat)

**Plan metadata:** skipped (commit_docs disabled)

## Files Created/Modified

- `src/registry/fingerprint.mjs` - Portable scanning, SHA-256 tree hashes, cache validation, and atomic state persistence.
- `src/registry/diff.mjs` - Pure evidence-gated snapshot diff with deterministic events, facets, diagnostics, and result hash.
- `tests/router.registry-diff.test.mjs` - CHG-01 mutation matrix, D-01 through D-04, portability, containment, denial, and cache recovery tests.

## Decisions Made

- Structural rename/move outranks state dimensions, and all remaining dimensions follow the fixed scope/dependency/permission/content order.
- Explicit canonical identity and authoritative shared origin may cross scope/path boundaries; compatible native identity remains scope-bound.
- Fingerprint state contains only logical roots, relative paths, entry types, stable content/subtree hashes, and deterministic diagnostics.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The managed workspace required approval for Git index writes; after the interrupted approval wait, execution resumed from the untracked RED test and committed it without losing or staging unrelated work.

## TDD Gate Compliance

- RED: `c999a3c`; focused test failed on missing `src/registry/fingerprint.mjs` before production code existed.
- GREEN: `1f6cf04`; focused lifecycle suite passed 8/8.
- Regressions: Phase 11 schema/adapter suite passed 18/18; full repository suite passed 420/420.

## Known Stubs

None. Empty accumulators are internal bounded collection state and do not represent placeholders or unwired output.

## User Setup Required

None - no packages, services, environment variables, or runtime configuration were added.

## Next Phase Readiness

Plan 12-02 can consume the portable snapshot/diff primitives to implement incremental/full-build byte equivalence. No blockers remain.

## Self-Check: PASSED

- All three planned files exist.
- RED and GREEN commits are present in Git history.
- Focused, Phase 11 regression, and full repository verification passed.

---
*Phase: 12-incremental-change-detection-and-watcher*
*Completed: 2026-07-15*
