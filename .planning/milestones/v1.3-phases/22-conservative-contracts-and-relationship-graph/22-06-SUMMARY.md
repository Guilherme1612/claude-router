---
phase: 22-conservative-contracts-and-relationship-graph
plan: 06
subsystem: registry
tags: [contracts, overlays, eligibility, fail-closed, node-test]
requires:
  - phase: 21
    provides: authoritative registry assembly and four-record inventory fixture
  - phase: 22
    provides: normalized contract, overlay, relationship, and eligibility primitives
provides:
  - production contract construction before overlay resolution
  - deterministic adapter-backed field evidence for authoritative records
  - fail-closed eligibility for absent contracts and required field envelopes
affects: [phase-23-dispatch, registry-mapper, contract-inspection]
tech-stack:
  added: []
  patterns: [construct-validate-enrich-evaluate, fail-closed safety evidence]
key-files:
  created: [.planning/phases/22-conservative-contracts-and-relationship-graph/22-06-SUMMARY.md]
  modified: [src/registry/contract.mjs, src/registry/build.mjs, src/registry/eligibility.mjs, tests/router.contracts.test.mjs, tests/router.contract-eligibility.test.mjs]
key-decisions:
  - "Derive missing field evidence in the existing contract builder while preserving explicitly supplied evidence, including explicit empty evidence."
  - "Treat absent contract, dependency declaration, or required field envelope as unknown rather than preserving Phase 21 fail-open compatibility."
patterns-established:
  - "Production registry order: merge and annotate, construct and validate contracts, apply exact-bound overlays, derive relationships, evaluate eligibility."
requirements-completed: [CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-08, CONT-09]
coverage:
  - id: D1
    description: Every authoritative Phase 21 fixture record receives a validated contract before an exact-bound overlay enriches it.
    requirement: CONT-01
    verification:
      - kind: integration
        ref: tests/router.contracts.test.mjs#assembleRegistry constructs and overlays every authoritative contract
        status: pass
    human_judgment: false
  - id: D2
    description: Missing contracts and required safety envelopes remain recommendation-only with stable unknown gates.
    requirement: CONT-03
    verification:
      - kind: unit
        ref: tests/router.contract-eligibility.test.mjs#missing contract safety evidence is recommendation-only
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-07-26
status: complete
---

# Phase 22 Plan 06: Production Contract Gap Closure Summary

**Validated contracts are now built for every authoritative record before exact overlays, while absent safety evidence deterministically blocks dispatch eligibility.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-26T19:08:00Z
- **Completed:** 2026-07-26T19:16:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a real `assembleRegistry()` oracle using the four-record Phase 21 Claude-heavy fixture and an exact-bound overlay.
- Reused the existing builder and validator to construct deterministic adapter-backed field envelopes before overlays.
- Removed fail-open eligibility compatibility for absent contracts, undeclared dependencies, and absent required field envelopes.

## Task Commits

1. **Task 1: Add production assembly and fail-closed regression oracles** - `ac05395` (test)
2. **Task 2: Wire contracts before overlays and make missing evidence fail closed** - `3ed4421` (feat)

## Files Created/Modified

- `tests/router.contracts.test.mjs` - Production fixture assembly and overlay ordering oracle.
- `tests/router.contract-eligibility.test.mjs` - Missing contract/envelope fail-closed oracle.
- `src/registry/contract.mjs` - Deterministic authoritative-record evidence fallback.
- `src/registry/build.mjs` - Contract construction and validation before overlays.
- `src/registry/eligibility.mjs` - Unknown results for absent contract-dependent evidence.

## Decisions Made

- Explicit caller-supplied evidence remains authoritative, including empty arrays used to test uncertainty.
- Unknown risk and reversibility values remain visible and recommendation-only even when their evidence envelope is structurally complete.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The required Phase 22/Phase 21 focused slices pass. An additional broad wildcard run included `router.registry-build.test.mjs`, whose legacy route-publication expectation assumes newly discovered records remain dispatchable without positive risk/reversibility evidence; it now fails closed as required by CONT-03/08 and was not changed outside this plan's owned files.

## Verification

- Focused Phase 22 contract, overlay, eligibility, inspection, relationship, schema, and convergence slice: **63/63 passed**.
- Focused Phase 21 inventory convergence and registry schema slice: passed within the same 63-test run.
- Additional Phase 21 wildcard: **118/119 passed**; deferred legacy dispatchability expectation described above.

## Known Stubs

None.

## Threat Flags

None - the planned trust-boundary changes reuse existing validators, exact overlay binding, and deterministic eligibility reasons.

## User Setup Required

None.

## Next Phase Readiness

Phase 23 can consume production contracts and fail-closed eligibility. The legacy mapper publication expectation should be reconciled with evidence-gated dispatch in a separately owned plan.

## Self-Check: PASSED

- All five modified implementation/test files exist.
- Task commits `ac05395` and `3ed4421` exist.
- Focused verification passed after the implementation commit.

---
*Phase: 22-conservative-contracts-and-relationship-graph*
*Completed: 2026-07-26*
