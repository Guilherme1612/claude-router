---
phase: 22-conservative-contracts-and-relationship-graph
plan: 01
subsystem: registry
tags: [contracts, canonical-json, evidence, fail-closed, node-test]

requires:
  - phase: 21-authoritative-personalized-inventory
    provides: authoritative normalized capability records and stable canonical bytes
provides:
  - Complete field-level capability contract envelopes
  - Conservative contract-policy-v1 inference and recommendation-only disposition
  - Canonical inline contract validation and serialization
affects: [22-relationships, 22-overlays, 23-intent-safe-execution]

tech-stack:
  added: []
  patterns: [integer basis-point inference, field-level evidence envelopes, visible uncertainty]

key-files:
  created: [src/registry/contract.mjs, tests/router.contracts.test.mjs]
  modified: [src/registry/schema.mjs, tests/helpers/inventory-fixture.mjs]

key-decisions:
  - "Adapter structural evidence requires exactly 10000 basis points; other inferred evidence requires at least 8500."
  - "Any conflicting dispatch claim leaves the field unknown even when another candidate is structurally trusted."
  - "Rejected evidence records expose only bounded reason and provenance tokens, never raw candidate values."

patterns-established:
  - "Every contract field uses the same independently explainable envelope."
  - "Unknown dispatch-relevant fields derive a recommendation-only disposition."

requirements-completed: [CONT-01, CONT-02, CONT-03]

coverage:
  - id: D1
    description: "All Phase 21 profiles receive complete normalized field-level contracts."
    requirement: CONT-01
    verification:
      - kind: unit
        ref: "tests/router.contracts.test.mjs#every profile receives complete field envelopes"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each field independently records evidence, provenance, freshness, rule version, reason codes, and integer confidence."
    requirement: CONT-02
    verification:
      - kind: unit
        ref: "tests/router.contracts.test.mjs#every profile receives complete field envelopes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Missing, conflicting, stale, and below-threshold dispatch facts remain unknown and recommendation-only."
    requirement: CONT-03
    verification:
      - kind: unit
        ref: "tests/router.contracts.test.mjs#uncertain dispatch facts remain unknown and recommendation-only"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-07-26
status: complete
---

# Phase 22 Plan 01: Conservative Contracts Summary

**Deterministic field-level capability contracts with privacy-safe evidence, canonical bytes, and fail-closed recommendation-only uncertainty**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-26T18:39:00Z
- **Completed:** 2026-07-26T18:44:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Defined all CONT-01 fields as uniform, independently evidenced contract envelopes across four authoritative installation profiles.
- Added contract-policy-v1 with exact structural evidence, 8500-basis-point inferred thresholds, deterministic reason codes, and bounded privacy-safe rejection records.
- Extended the Phase 21 schema boundary to validate and canonically sort inline contracts without changing legacy identity behavior.

## Task Commits

1. **Task 1: Establish the Wave 0 canonical contract oracle** - `6d5af0a` (test)
2. **Task 2: Implement deterministic field-level contracts** - `eb8e827` (feat)

## Files Created/Modified

- `src/registry/contract.mjs` - Pure contract builder, policy, envelopes, and validator.
- `src/registry/schema.mjs` - Inline contract validation and canonical set ordering.
- `tests/router.contracts.test.mjs` - Four-profile completeness, uncertainty, privacy, and permutation oracle.
- `tests/helpers/inventory-fixture.mjs` - Deterministic accepted, missing, conflicting, stale, rejected, and below-threshold evidence variants.

## Decisions Made

- Structural adapter facts require exact 10000-basis-point evidence; non-adapter inference requires at least 8500.
- Conflicting asserted values remain unknown even when one candidate would otherwise meet its confidence threshold.
- Evidence ledgers retain portable metadata only; raw evidence values never enter accepted or rejected evidence records.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The initial RED test file contained an invalid escaped path regular expression; it was corrected before the RED commit and the TAP-aware marker gate then passed.

## Known Stubs

None. Empty collections in the fixture and contract builder are intentional representations of missing evidence and bounded accumulators.

## TDD Gate Compliance

- RED: `6d5af0a` records the failing contract oracle with all expected failures marked `[phase22-red:contracts]`.
- GREEN: `eb8e827` implements the production contract module and schema integration.

## Verification

- `rtk node --test tests/router.contracts.test.mjs tests/router.registry-schema.test.mjs` — 21 tests passed, 0 failed.
- No package manifest, lockfile, DB/ORM schema, or dependency was changed.
- Threat mitigations T-22-01 through T-22-04 are covered by unknown-by-default inference, canonical permutation tests, privacy-negative assertions, and per-field explanation metadata.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The canonical contract boundary is ready for typed relationship inference, overlays, and shared dispatch eligibility in later Phase 22 plans.
- No blockers.

## Self-Check: PASSED

- Created files exist: `src/registry/contract.mjs`, `tests/router.contracts.test.mjs`.
- Task commits exist: `6d5af0a`, `eb8e827`.
- Focused verification passed: 21/21 tests.

---
*Phase: 22-conservative-contracts-and-relationship-graph*
*Completed: 2026-07-26*
