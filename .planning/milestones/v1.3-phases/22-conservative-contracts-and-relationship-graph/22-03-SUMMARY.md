---
phase: 22-conservative-contracts-and-relationship-graph
plan: 03
subsystem: registry
tags: [relationships, canonical-json, invalidation, fail-closed, node-test]

requires:
  - phase: 21-authoritative-personalized-inventory
    provides: stable capability IDs and deterministic reverse-reference invalidation
provides:
  - Conservative eight-type relationship graph
  - Inspectable inactive relationship candidates with stable reasons
  - Relationship endpoint participation in lifecycle invalidation
affects: [22-eligibility, 22-inspection, 23-intent-safe-execution]

tech-stack:
  added: []
  patterns: [typed evidence gates, bounded deterministic graph, shared invalidation closure]

key-files:
  created: [src/registry/relationships.mjs, tests/router.relationships.test.mjs]
  modified: [src/registry/reconcile.mjs]

key-decisions:
  - "Relationship authority requires type-specific fresh evidence at 8500 basis points or higher."
  - "Lexical similarity remains an inactive candidate signal and never activates an edge."
  - "Both active and inspectable relationship endpoints reuse the existing reverse-reference invalidation closure."

patterns-established:
  - "Relationship candidates are canonicalized once into active edges or inspectable inactive records."
  - "Graph traversal is bounded and iterative; no general graph engine is introduced."

requirements-completed: [CONT-07]

coverage:
  - id: D1
    description: "Exactly eight relationship types activate only with live endpoints and type-specific evidence."
    requirement: CONT-07
    verification:
      - kind: unit
        ref: "tests/router.relationships.test.mjs#active schema accepts exactly the eight CONT-07 types"
        status: pass
      - kind: unit
        ref: "tests/router.relationships.test.mjs#typed evidence is required and weak states remain inspectable"
        status: pass
    human_judgment: false
  - id: D2
    description: "Cycles, dangling endpoints, weak evidence, and oversized input fail closed with deterministic output."
    requirement: CONT-07
    verification:
      - kind: unit
        ref: "tests/router.relationships.test.mjs#malformed endpoints self edges cycles and collection overflow fail closed"
        status: pass
      - kind: unit
        ref: "tests/router.relationships.test.mjs#graph bytes ignore input ordering"
        status: pass
    human_judgment: false
  - id: D3
    description: "Endpoint lifecycle changes invalidate direct and dependent relationship references before callbacks."
    requirement: CONT-07
    verification:
      - kind: integration
        ref: "tests/router.relationships.test.mjs#endpoint lifecycle invalidates direct and dependent edges before callbacks"
        status: pass
      - kind: integration
        ref: "rtk node --test tests/router.relationships.test.mjs tests/router.registry-reconcile.test.mjs tests/router.inventory-mutations.test.mjs"
        status: pass
    human_judgment: false

duration: 2min
completed: 2026-07-26
status: complete
---

# Phase 22 Plan 03: Typed Relationship Graph Summary

**Bounded canonical relationship edges with type-specific evidence gates and lifecycle-safe reverse invalidation.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-26T18:45:26Z
- **Completed:** 2026-07-26T18:47:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Defined exactly eight active relationship types with independent evidence, confidence, freshness, provenance, and stable validation reasons.
- Preserved weak, stale, conflicting, malformed, and dangling candidates for inspection without granting authority.
- Integrated relationship endpoints into the existing deterministic invalidation closure before consumer callbacks.

## Task Commits

1. **Task 1: Establish the Wave 0 typed-relationship oracle** - `fc57f6b` (test)
2. **Task 2: Implement strict typed edges and invalidation** - `5a2981f` (feat)

## Files Created/Modified

- `src/registry/relationships.mjs` - Bounded typed-edge derivation, validation, cycle handling, and reference projection.
- `src/registry/reconcile.mjs` - Merges relationship endpoint references into canonical invalidation.
- `tests/router.relationships.test.mjs` - Eight-type, adversarial, permutation, bound, and lifecycle oracle.

## Decisions Made

- Reused the existing 8500 high-confidence boundary rather than introducing a relationship-specific scoring system.
- Reused `stableStringify` and the Phase 21 reference closure; no graph dependency, class hierarchy, or fuzzy matcher was added.
- Applied cycle rejection only to directional dependency-style types; evidence still remains inspectable when rejected.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## TDD Gate Compliance

- RED: `fc57f6b` recorded five marker-only relationship failures before implementation.
- GREEN: `5a2981f` implemented the graph and reconciliation integration.
- REFACTOR: No separate refactor was needed.

## Verification

- `rtk node --test tests/router.relationships.test.mjs` — 18/18 passed.
- `rtk node --test tests/router.relationships.test.mjs tests/router.registry-reconcile.test.mjs tests/router.inventory-mutations.test.mjs` — 34/34 passed.
- No tracked file deletions or owned-path residue remained after the implementation commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Typed relationship state is ready for the shared eligibility and inspection plans.
- No blockers.

## Self-Check: PASSED

- Created files exist: `src/registry/relationships.mjs`, `tests/router.relationships.test.mjs`.
- Modified file exists: `src/registry/reconcile.mjs`.
- Task commits exist: `fc57f6b`, `5a2981f`.
- Focused and integration verification passed: 18/18 and 34/34 tests.

---
*Phase: 22-conservative-contracts-and-relationship-graph*
*Completed: 2026-07-26*
