---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: 02
subsystem: safe-evolution
tags: [privacy, evidence, canary, sha256, node-test]
requires:
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    plan: 01
    provides: immutable compiled-index identity and compatibility metadata
provides:
  - strict content-free evidence validation before hashing or persistence
  - isolated project and aggregate evidence windows with deterministic decay
  - immutable content-addressed candidates and independent hard-gate verdicts
affects: [phase-17-calibration, evolution-publication, registry-activation]
tech-stack:
  added: []
  patterns: [deny-before-hash, scoped evidence windows, deep-frozen content addressing, independent hard gates]
key-files:
  created: [src/evolution/evidence.mjs, src/evolution/canary-controller.mjs, tests/router.evolution-canary.test.mjs]
  modified: []
key-decisions:
  - "Evidence validation rejects unknown and unbounded fields before hashing or persistence, and privacy-denied signals cannot carry prompt signatures."
  - "Project evidence and explicitly eligible aggregate evidence occupy separate scopes with seven-day retention, 24-hour half-life, and a 30-sample floor."
  - "Candidate promotion is a verdict only: every independent hard gate must pass and active publication authority remains untouched."
requirements-completed: [EVO-05]
coverage:
  - id: D-05-D-06
    description: Only bounded content-free evidence reaches storage and forbidden content produces zero writes.
    requirement: EVO-05
    verification:
      - kind: unit
        ref: tests/router.evolution-canary.test.mjs#D-05-D-06
        status: pass
    human_judgment: false
  - id: D-07-D-08
    description: Evidence is scope-isolated, retained and decayed deterministically, and requires 30 eligible observations.
    requirement: EVO-05
    verification:
      - kind: unit
        ref: tests/router.evolution-canary.test.mjs#D-07-D-08
        status: pass
    human_judgment: false
  - id: D-09-D-10
    description: Reproducible candidates are immutable and promotion requires evidence plus all independent hard gates.
    requirement: EVO-05
    verification:
      - kind: unit
        ref: tests/router.evolution-canary.test.mjs#D-09-D-10
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-07-16
status: complete
---

# Phase 17 Plan 02: Privacy-Safe Evidence and Canary Evaluation Summary

**Content-free, scope-isolated evidence now feeds immutable SHA-256 candidates whose promotion verdict requires sufficient samples and every independent safety gate.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-16T22:19:06Z
- **Completed:** 2026-07-16T22:24:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added a D-05/D-06 allowlisted telemetry envelope that rejects raw or unknown content before hashing and persistence and suppresses signatures after privacy denial.
- Added explicit project and aggregate scopes with deterministic seven-day retention, 24-hour exponential decay, and a 30-observation promotion floor.
- Added deeply immutable content-addressed candidates binding source evidence, policy, compiled-index, and calibration inputs to one reproducible identity.
- Added deterministic canary verdicts requiring safety, privacy, quality, context-budget, compatibility, and latency gates independently; no weighted score can compensate for failure.

## Task Commits

Each task followed TDD and was committed atomically:

1. **Task 1: Enforce the content-free telemetry envelope before persistence** - `3242e00` (test), `64e4003` (feat)
2. **Task 2: Add scoped, decaying evidence windows with minimum samples** - `c1a385a` (test), `7fd509a` (feat)
3. **Task 3: Create immutable candidates and deterministic promotion evaluation** - `d7db4c5` (test), `64b5179` (feat)

## Files Created/Modified

- `src/evolution/evidence.mjs` - Bounded privacy guard, scoped evidence journal/store, retention, decay, and sample sufficiency.
- `src/evolution/canary-controller.mjs` - Stable content addressing, deep immutability, integrity checks, and independent promotion gates.
- `tests/router.evolution-canary.test.mjs` - Privacy, scoping, decay, sample-floor, immutability, and gate matrix.

## Decisions Made

- Used standard-library SHA-256 only after envelope validation, so forbidden content cannot enter a hash or write side channel.
- Kept aggregate eligibility explicit at append time and omitted project identity from aggregate scope records.
- Treated canary evaluation as read-only decision evidence; publication and active-pointer changes remain downstream responsibilities.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external services or packages are required.

## Known Stubs

None. Empty arrays/objects identified by the mechanical scan are intentional bounded accumulators, default options, or test fixtures and do not flow as placeholder UI data.

## Next Phase Readiness

- The privacy-safe evidence window and immutable canary verdict are ready for Phase 17 performance calibration and publication integration.
- Focused verification passed 9/9 tests; the complete router suite passed 573/573 tests.

## Self-Check: PASSED

- All three created files exist.
- All six TDD task commit hashes exist in git history.
- Focused and wave-boundary verification both passed completely.

---
*Phase: 17-compiled-prompt-routing-and-safe-evolution*
*Completed: 2026-07-16*
