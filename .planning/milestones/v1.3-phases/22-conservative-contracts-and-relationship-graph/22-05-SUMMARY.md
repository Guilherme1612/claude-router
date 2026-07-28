---
phase: 22-conservative-contracts-and-relationship-graph
plan: 05
subsystem: cli
tags: [contract-inspection, privacy, relationships, deterministic-cli, node-test]

requires:
  - phase: 22-01
    provides: evidence-backed capability contracts
  - phase: 22-02
    provides: exact-bound overlays and privacy-safe rejections
  - phase: 22-03
    provides: validated typed relationship graph
  - phase: 22-04
    provides: canonical eligibility gates and reasons
provides:
  - Bounded read-only contract list and detail inspection
  - Bounded active and inactive relationship inspection
  - Deterministic privacy-safe text and JSON projections
  - Canonical persistence of non-empty relationship and rejected-overlay inspection metadata
affects: [23-intent-safe-execution, operator-cli, registry-publication]

tech-stack:
  added: []
  patterns: [strict projection allowlist, last-complete immutable reads, bounded deterministic pagination]

key-files:
  created: [tests/router.contract-inspection.test.mjs]
  modified:
    - src/cli/router-control.mjs
    - src/registry/build.mjs
    - src/registry/map.mjs
    - src/registry/reconcile.mjs
    - tests/router.control-cli.test.mjs

key-decisions:
  - "Contract inspection exposes evidence metadata and decisions, never raw authored field values."
  - "Only non-empty relationship and rejected-overlay metadata extends canonical registry bytes, preserving legacy empty-registry equivalence."
  - "The contract command reads verified active registry bytes and has no discovery, correction, execution, or mutation path."

requirements-completed: [CONT-09]
duration: 8min
completed: 2026-07-26
status: complete
---

# Phase 22 Plan 05: Contract and Relationship Inspection Summary

**The existing router CLI now explains bounded contract evidence, uncertainty, rejected overlays, typed relationships, eligibility, and correction paths without exposing authored values or mutating active state.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-26T18:58:01Z
- **Completed:** 2026-07-26T19:06:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added deterministic `contract`, `contract --id`, and `contract relationships` text/JSON views with shared pagination metadata.
- Added strict allowlisted projections for field evidence, rejected evidence/overlays, eligibility gates/reasons, typed edges, and correction paths.
- Preserved non-empty inspection metadata through canonical registry assembly, reconciliation, mapping, and immutable activation.
- Proved all success and error paths leave active registry and operational state bytes unchanged.

## Task Commits

1. **Task 1: Establish the Wave 0 inspection and privacy oracle** - `155877a` (test)
2. **Task 2: Implement contract and relationship inspection** - `80e47a5` (feat)

## Files Created/Modified

- `tests/router.contract-inspection.test.mjs` - boundedness, parity, privacy, persistence, and relationship oracle.
- `tests/router.control-cli.test.mjs` - parser, dispatcher, invalid-input, and byte-level read-only coverage.
- `src/cli/router-control.mjs` - contract projections, text rendering, parser dispatch, and active-registry inspection.
- `src/registry/build.mjs` - canonical non-empty inspection metadata persistence.
- `src/registry/map.mjs` - mapping preserves canonical inspection metadata.
- `src/registry/reconcile.mjs` - reconciliation preserves canonical inspection metadata.

## Decisions Made

- Raw normalized contract values remain outside the inspection boundary because authored values may contain instructions or secrets; state, provenance, rule, freshness, confidence, and reason codes provide the safe explanation.
- Empty relationship and rejection collections are omitted from canonical bytes for backward-compatible registry equivalence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Preserved inspection metadata in canonical active state**
- **Found during:** Task 2
- **Issue:** Plans 22-02 and 22-03 returned rejected overlays and relationships beside `registry`, while activation persisted only `built.registry`; production inspection could not read those decisions from last-complete state.
- **Fix:** Persist non-empty safe metadata in the canonical registry and preserve it through reconciliation and mapping.
- **Files modified:** `src/registry/build.mjs`, `src/registry/map.mjs`, `src/registry/reconcile.mjs`
- **Commit:** `80e47a5`

## Verification

- `rtk node --test tests/router.contract-inspection.test.mjs tests/router.control-cli.test.mjs tests/router.inventory-security.test.mjs` - 21/21 passed.
- `rtk node --test tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.relationships.test.mjs tests/router.contract-eligibility.test.mjs` - 35/35 passed.
- `rtk node --test tests/router.registry-watcher.test.mjs` - 20/20 passed.
- `rtk node --test tests/*.test.mjs` - 773 passed, 31 failed, 1 skipped. The 31 failures match the proven pre-existing repository baseline documented by Plans 22-02 and 22-04, including `tuple_validation_failed`, installed-controller fixture failures, and deleted historical Phase 10 verification artifacts.

## Known Stubs

None.

## Self-Check: PASSED

- Created and modified files exist.
- Task commits `155877a` and `80e47a5` exist.
- No task commit deleted tracked files.
- Plan-owned focused, privacy, registry-equivalence, and Phase 22 regression checks pass.

---
*Phase: 22-conservative-contracts-and-relationship-graph*
*Completed: 2026-07-26*
