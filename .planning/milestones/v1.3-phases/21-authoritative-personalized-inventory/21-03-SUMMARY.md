---
phase: 21-authoritative-personalized-inventory
plan: 03
subsystem: registry
tags: [identity, lifecycle, reconciliation, invalidation, deterministic-graphs]

requires:
  - phase: 21-01
    provides: framework-neutral canonical inventory records and portable mutation fixtures
provides:
  - Path- and scope-separated fallback capability identity
  - Declared-ID and unique exact-fingerprint continuity classification
  - Versioned typed reference graph with deterministic transitive invalidation
  - Four-profile D-19 mutation and callback-ordering oracle
affects: [21-04, 21-05, relationship-graph, mapping, activation]

tech-stack:
  added: []
  patterns:
    - Unique one-to-one exact-fingerprint continuity after declared stable identity
    - Sorted reverse-edge fixed-point invalidation before downstream callbacks

key-files:
  created:
    - tests/router.inventory-mutations.test.mjs
  modified:
    - tests/router.registry-diff.test.mjs
    - tests/router.registry-reconcile.test.mjs
    - src/registry/identity.mjs
    - src/registry/diff.mjs
    - src/registry/reconcile.mjs

key-decisions:
  - "Fallback identity includes portable source path and scope so equal live content never collapses across installations."
  - "Only declared stable identity or a unique removed-to-added exact fingerprint pair can transfer lifecycle continuity."
  - "Typed references are invalidated by candidate-local reverse-edge closure before mapper or evaluator callbacks."

patterns-established:
  - "Continuity authority: stable declared ID first, unique exact bytes second, similarity diagnostic only."
  - "Invalidation authority: lifecycle and dependency seeds traverse a canonical typed graph to a deterministic fixed point."

requirements-completed: [DISC-03, DISC-05]

coverage:
  - id: D1
    description: "Deterministic identity continuity across add, edit, rename, move, disable, replace, dependency loss, and removal."
    requirement: DISC-03
    verification:
      - kind: unit
        ref: "tests/router.inventory-mutations.test.mjs#D-19 mutation matrix"
        status: pass
    human_judgment: false
  - id: D2
    description: "Transitive typed-reference invalidation completes before downstream callbacks."
    requirement: DISC-05
    verification:
      - kind: unit
        ref: "tests/router.registry-reconcile.test.mjs#typed reference closure"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-26
status: complete
---

# Phase 21 Plan 03: Mutation Identity and Invalidation Summary

**Path-separated identities, exact one-to-one continuity, and deterministic reference closure now prevent stale dispatch authority across every required inventory mutation.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-26T16:31:00Z
- **Completed:** 2026-07-26T16:35:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added a four-profile D-19 mutation matrix covering all eight required mutations, simultaneous duplicates, replacements, partial scans, and deterministic permutations.
- Made portable source path and scope part of fallback identity while restricting move continuity to declared identity or a unique exact-fingerprint pair.
- Added a versioned generic reference graph whose sorted reverse-edge closure invalidates alias, equivalence, workflow, correction, mapping, and compiled-route references before callbacks.
- Preserved active bytes on malformed graphs, unsafe dangling edges, and callback failures.

## Task Commits

Each task was committed atomically:

1. **Task 1: Specify mutation identity and transitive invalidation outcomes** - `1c746fd` (test)
2. **Task 2: Implement exact continuity and candidate-local invalidation closure** - `46b53e5` (feat)

**Plan metadata:** skipped (commit_docs disabled)

## Files Created/Modified

- `tests/router.inventory-mutations.test.mjs` - Complete portable mutation and invalidation matrix.
- `tests/router.registry-diff.test.mjs` - Exact continuity, ambiguous duplicate, path identity, and partial-scan contracts.
- `tests/router.registry-reconcile.test.mjs` - Typed graph closure, callback ordering, permutation, and fail-closed contracts.
- `src/registry/identity.mjs` - Portable path/scope fallback IDs and semantic exact fingerprints.
- `src/registry/diff.mjs` - Stable-ID pairing followed by unique exact-fingerprint pairing.
- `src/registry/reconcile.mjs` - Canonical typed references and deterministic invalidation closure.

## Decisions Made

- Simultaneously live equal-content records remain separate because fallback identity is source-path based.
- Native identity and weak similarity are not continuity authority.
- Non-invocable inert records are retained without becoming invalidation seeds unless disabled, lifecycle-unhealthy, or dependency-unhealthy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test oracle] Aligned legacy similarity expectations with D-09 exact continuity**
- **Found during:** Task 2
- **Issue:** A pre-existing diff test classified equal semantic bytes as weak similarity even though Plan 21-03 makes unique exact fingerprints authoritative.
- **Fix:** Updated the assertion to require exact-fingerprint continuity while retaining advisory-only treatment for merely similar evidence.
- **Files modified:** `tests/router.registry-diff.test.mjs`
- **Verification:** Focused 28-test matrix passes.
- **Committed in:** `46b53e5`

**2. [Rule 1 - Test fixture] Avoided treating already-inert records as newly disabled**
- **Found during:** Task 2
- **Issue:** The unknown-future profile starts non-dispatchable, so replaying disable is intentionally a no-op rather than a lifecycle event.
- **Fix:** Made the mutation oracle distinguish retained inert evidence from a new disable transition.
- **Files modified:** `tests/router.inventory-mutations.test.mjs`
- **Verification:** All four profiles and eight mutations pass deterministically.
- **Committed in:** `46b53e5`

**Total deviations:** 2 auto-fixed (2 Rule 1 test-oracle corrections). **Impact:** Both corrections keep the tests aligned with the approved D-09/D-12 semantics; no scope expansion.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 21 can now build authoritative scan/watcher convergence on stable mutation identity and fully invalidated candidate snapshots. No blockers.

## Self-Check: PASSED

- All six implementation/test artifacts exist.
- Task commits `1c746fd` and `46b53e5` exist.
- Focused mutation/diff/reconcile suite: 28/28 passed.
- Route-target regression suite: 5/5 passed.

---
*Phase: 21-authoritative-personalized-inventory*
*Completed: 2026-07-26*
