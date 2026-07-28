---
phase: 22-conservative-contracts-and-relationship-graph
plan: 02
subsystem: registry
tags: [contract-overlays, exact-binding, reconciliation, deterministic-security]
requires:
  - phase: 22-01
    provides: canonical field-level capability contracts
provides:
  - Optional contract-overlay-v1 validation and exact installed-record binding
  - Deterministic accepted and privacy-safe rejected overlay projections
  - Correction-reference invalidation before reconciliation callbacks
affects: [22-04, 22-05, 23-intent-safe-execution]
tech-stack:
  added: []
  patterns: [explicit-input overlays, exact tuple binding, reverse-edge invalidation]
key-files:
  created: [tests/router.contract-overlays.test.mjs]
  modified: [src/registry/contract.mjs, src/registry/build.mjs, src/registry/reconcile.mjs]
key-decisions:
  - "Overlays enter only through the assembler options object; no ambient discovery root was added."
  - "Rejected overlays expose only stable reason and provenance tokens, never authored values."
  - "Rename carryover requires one explicit exact lineage tuple matching old and new fingerprints."
patterns-established:
  - "Overlay authority: resolve an installed stable ID before applying any correction."
  - "Correction lifecycle: model accepted overlays as correction references in the existing invalidation closure."
requirements-completed: [CONT-04, CONT-05, CONT-06]
coverage:
  - id: D1
    description: "Optional overlays enrich only exact installed capabilities and cannot author identity or eligibility."
    requirement: CONT-04
    verification:
      - kind: integration
        ref: "tests/router.contract-overlays.test.mjs#exact optional overlay enriches only an installed capability"
        status: pass
    human_judgment: false
  - id: D2
    description: "Malformed, unsafe, stale, or mismatched overlays remain bounded, inspectable, and inert."
    requirement: CONT-05
    verification:
      - kind: unit
        ref: "tests/router.contract-overlays.test.mjs#malformed unsafe and authority-bearing overlays are rejected and inert"
        status: pass
    human_judgment: false
  - id: D3
    description: "Lifecycle changes invalidate corrections before callbacks, with exact-lineage-only rename carryover."
    requirement: CONT-06
    verification:
      - kind: integration
        ref: "tests/router.contract-overlays.test.mjs#reconciliation invalidates corrections before callbacks"
        status: pass
      - kind: integration
        ref: "tests/router.inventory-mutations.test.mjs"
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-07-26
status: complete
---

# Phase 22 Plan 02: Exact-Bound Contract Overlays Summary

**Versioned optional overlays now correct only exact installed contracts, while unsafe or stale inputs remain deterministic, privacy-safe, and inert.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-26T18:46:00Z
- **Completed:** 2026-07-26T18:51:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added strict `contract-overlay-v1` validation, exact ID/fingerprint/scope/runtime binding, and safe field application.
- Kept overlays API-only and optional, preserving byte-compatible no-overlay assembler output.
- Routed accepted corrections through existing reverse-reference invalidation before downstream callbacks.
- Covered adversarial inputs, ordering, edit/replace/remove drift, dependency loss, and exact rename lineage.

## Task Commits

1. **Task 1: Establish the Wave 0 overlay trust and mutation oracle** - `1116a2b` (test)
2. **Task 2: Implement exact-bound overlays in the canonical pipeline** - `8cbab7b` (feat)

## Files Created/Modified

- `tests/router.contract-overlays.test.mjs` - Overlay authority, security, determinism, and lifecycle oracle.
- `src/registry/contract.mjs` - Overlay validation, resolution, application, rejection, and lineage policy.
- `src/registry/build.mjs` - Optional explicit overlay input after authoritative assembly.
- `src/registry/reconcile.mjs` - Accepted overlay correction references in invalidation closure.

## Decisions Made

- Used existing schema, identity, canonicalization, assembler, and reconciliation functions; added no dependency or discovery mechanism.
- Derived contract disposition after corrections instead of accepting an authored dispatch flag.
- Sorted accepted/rejected projections and overlay application order by canonical bytes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The owned focused suite passed 23/23.
- The requested contract/build regression slice passed 10/11. The remaining pre-existing `router.registry-build.test.mjs` mode-map case fails with `tuple_validation_failed` on the Wave 1 base (`5a2981f`) before Plan 22-02 implementation.
- The broad suite passed 762/794; its 31 additional failures are pre-existing lifecycle/planning-artifact failures in unrelated files, including intentionally deleted historical verification artifacts. They were not modified.

## Known Stubs

None.

## TDD Gate Compliance

- RED: `1116a2b` contains only the failing `[phase22-red:overlays]` oracle.
- GREEN: `8cbab7b` implements the overlay behavior and passes the owned focused suite.

## Verification

- `rtk node --test tests/router.contract-overlays.test.mjs tests/router.inventory-mutations.test.mjs tests/router.registry-reconcile.test.mjs` — 23 passed, 0 failed.
- `rtk node --test tests/router.contracts.test.mjs tests/router.registry-build.test.mjs` — 10 passed, 1 pre-existing failure.
- `rtk node --test tests/*.test.mjs` — 762 passed, 31 pre-existing failures.

## User Setup Required

None.

## Next Phase Readiness

Plan 22-04 can consume exact-bound enriched contracts and the accepted/rejected overlay projection. No Plan 22-02 blocker remains.

## Self-Check: PASSED

- Created test and summary files exist.
- Modified registry files exist.
- Task commits `1116a2b` and `8cbab7b` exist.
- Owned focused verification passes.

---
*Phase: 22-conservative-contracts-and-relationship-graph*
*Completed: 2026-07-26*
