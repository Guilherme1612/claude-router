---
phase: 22-conservative-contracts-and-relationship-graph
plan: 04
subsystem: registry
tags: [eligibility, fail-closed, contracts, relationships, node-test]

requires:
  - phase: 22-01
    provides: normalized evidence-backed capability contracts
  - phase: 22-02
    provides: exact-bound contract overlays
  - phase: 22-03
    provides: validated typed relationship graph
provides:
  - One canonical fail-closed eligibility evaluator
  - Derived dispatchable compatibility field and canonical gate reasons
  - Complete passed, failed, and unknown eligibility matrix
affects: [23-intent-safe-execution, registry-publication, contract-inspection]

tech-stack:
  added: []
  patterns: [single eligibility authority, bounded iterative dependency closure, canonical gate ordering]

key-files:
  created: [src/registry/eligibility.mjs, tests/router.contract-eligibility.test.mjs]
  modified: [src/registry/build.mjs, src/registry/schema.mjs]

key-decisions:
  - "Eligibility ignores authored dispatch authority and is derived once after overlay and relationship resolution."
  - "Legacy Phase 21 records without contracts retain compatibility through authoritative registry facts; present Phase 22 contracts must satisfy every evidence gate."
  - "Reason codes follow the locked gate order instead of caller or object insertion order."

patterns-established:
  - "Every non-passed eligibility gate produces recommendation-only."
  - "Dependency traversal is iterative, visited-set bounded, and conflict aware."

requirements-completed: [CONT-03, CONT-08]

coverage:
  - id: D1
    description: "Central fail-closed evaluator covers all ten dispatch eligibility gates."
    requirement: "CONT-08"
    verification:
      - kind: unit
        ref: "tests/router.contract-eligibility.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unknown, unsafe, or low-confidence contract facts remain recommendation-only with stable reasons."
    requirement: "CONT-03"
    verification:
      - kind: integration
        ref: "rtk node --test tests/router.contract-eligibility.test.mjs tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.relationships.test.mjs tests/router.registry-schema.test.mjs"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-26
status: complete
---

# Phase 22 Plan 04: Conservative Dispatch Eligibility Summary

**One bounded evaluator now derives all dispatch gates, rejects authored authority, and preserves visible recommendation-only reasons for every unsafe or unknown state.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-26T18:53:20Z
- **Completed:** 2026-07-26T18:57:05Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added passed, failed, and unknown coverage for all ten eligibility gates plus canonical multi-failure ordering.
- Wired one evaluator into canonical assembly after overlays and validated relationships.
- Added schema invariants tying `dispatchable` to derived eligibility and rejecting malformed gate/reason combinations.

## Task Commits

1. **Task 1: Establish the Wave 0 fail-closed gate matrix** - `0c01b62` (test)
2. **Task 2: Implement and wire the sole eligibility evaluator** - `98ac1cd` (feat)

## Files Created/Modified

- `src/registry/eligibility.mjs` - Pure bounded eligibility evaluator.
- `src/registry/build.mjs` - Sole assembly call and authored-authority replacement.
- `src/registry/schema.mjs` - Canonical eligibility and dispatchable invariants.
- `tests/router.contract-eligibility.test.mjs` - Full gate, graph, ordering, and authority oracle.

## Decisions Made

- Kept the compatibility seam inside the evaluator: Phase 21 records without a Phase 22 contract use authoritative normalized facts, while records with contracts must pass their evidence gates.
- Used the existing relationship graph directly; no graph library, alternate validator, or execution logic was added.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The specified registry build regression has one confirmed pre-existing failure: `mode-map stamping seeds record mapping.explicit_subjects so the mapper publishes dispatch routes` ends in `tuple_validation_failed`. The identical test fails from clean base commit `8cbab7b` with `BASE_EXIT=1`. Plan-owned eligibility, contract, overlay, relationship, and schema coverage passes 52/52.

## Known Stubs

None.

## TDD Gate Compliance

- RED: `0c01b62` contains only intentional `[phase22-red:eligibility]` failures.
- GREEN: `98ac1cd` implements the evaluator and makes the owned oracle pass.

## Verification

- `rtk node --test tests/router.contract-eligibility.test.mjs tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.relationships.test.mjs` — 34/34 pass.
- `rtk node --test tests/router.contract-eligibility.test.mjs tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.relationships.test.mjs tests/router.registry-schema.test.mjs` — 52/52 pass.
- `rtk node --test tests/router.registry-schema.test.mjs tests/router.registry-build.test.mjs` — 23/24 pass; sole failure reproduced at base `8cbab7b`.

## Self-Check: PASSED

- Created files exist: `src/registry/eligibility.mjs`, `tests/router.contract-eligibility.test.mjs`.
- Task commits exist: `0c01b62`, `98ac1cd`.
- Owned focused verification passes, and the only specified regression failure is confirmed pre-existing with clean-base evidence.
