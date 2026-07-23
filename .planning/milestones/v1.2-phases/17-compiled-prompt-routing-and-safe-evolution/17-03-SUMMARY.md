---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: 03
subsystem: safe-evolution
tags: [canary, rollback, calibration, latency, node-test]
requires:
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    plan: 01
    provides: immutable compiled prompt state and bounded hot-path routing
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    plan: 02
    provides: privacy-safe evidence and independent hard-gate canary verdicts
provides:
  - journaled atomic canary promotion and automatic known-good rollback
  - byte-locked seven-class calibration corpus with exact version evidence
  - independent quality, context-budget, warm-p95, and per-route latency gates
affects: [phase-17-verification, evolution-publication, release-calibration]
tech-stack:
  added: []
  patterns: [single publication authority, recovery-before-mutation, nearest-rank percentile, independent hard gates]
key-files:
  created: [src/evolution/perf-measure.mjs, tests/router.perf-calibration.test.mjs, tests/router.compiled-evolution.test.mjs]
  modified: [src/evolution/canary-controller.mjs, tests/router.evolution-canary.test.mjs]
key-decisions:
  - "Canary mutation delegates exclusively to registry activation, rollback preview/execution, and recovery primitives."
  - "Neutral speed improvements preserve known-good authority; promotion requires demonstrated benefit or a justified safety correction."
  - "Calibration records exact candidate, compiled-index, policy, corpus fingerprint, and baseline latency deltas."
requirements-completed: [EVO-05, REL-01]
coverage:
  - id: D-11-D-12
    description: Hard regressions reject or roll back through durable atomic registry publication and recovery.
    requirement: EVO-05
    verification:
      - kind: integration
        ref: tests/router.compiled-evolution.test.mjs#EVO-05 lifecycle
        status: pass
    human_judgment: false
  - id: D-13-D-15
    description: A fixed seven-class corpus independently protects semantic outcomes, context budgets, and latency ceilings.
    requirement: REL-01
    verification:
      - kind: unit
        ref: tests/router.perf-calibration.test.mjs
        status: pass
    human_judgment: false
  - id: D-16
    description: Only demonstrated benefit or a justified safety correction can promote a correct candidate.
    requirement: EVO-05
    verification:
      - kind: integration
        ref: tests/router.compiled-evolution.test.mjs#D-16
        status: pass
    human_judgment: false
duration: 16min
completed: 2026-07-16
status: complete
---

# Phase 17 Plan 03: Safe Evolution Publication and Calibration Summary

**Canary candidates now promote and roll back through one durable atomic authority, guarded by a byte-locked seven-class corpus and independent REL-01 latency ceilings.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-16T22:25:00Z
- **Completed:** 2026-07-16T22:41:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added recovery-first canary publication that rejects unpublished hard regressions and automatically restores known-good authority after published quality or latency regressions.
- Added a frozen, SHA-256-identified calibration corpus covering minimal prompts, explicit overrides, stale context, ambiguity, terminal state, dependencies, and context budgets.
- Added monotonic cold/warm measurement with warmup exclusion, deterministic nearest-rank percentiles, exact evaluated versions, corpus identity, and baseline deltas.
- Proved beneficial promotion, neutral preservation, automatic rollback, independent quality/budget/latency gates, and inherited Phase 16 workflow behavior.

## Task Commits

1. **Task 1: Wire promotion and automatic rollback** - `dbbc486` (test), `3201531` (feat)
2. **Task 2: Establish fixed calibration and latency harness** - `c34481c` (test), `5c7d3d8` (feat)
3. **Task 3: Prove compiled evolution end to end** - `9bb0380` (test), `bdcce91` (feat)

## Files Created/Modified

- `src/evolution/canary-controller.mjs` - Recovery-first promotion, rejection, preservation, and automatic rollback coordinator.
- `src/evolution/perf-measure.mjs` - Fixed corpus, exact-version evaluation, bounded monotonic measurement, percentiles, and independent gates.
- `tests/router.evolution-canary.test.mjs` - Publication, rollback, recovery, and D-16 benefit semantics.
- `tests/router.perf-calibration.test.mjs` - Corpus lock, deterministic outcomes, measurement, and REL-01 gate independence.
- `tests/router.compiled-evolution.test.mjs` - Real registry promotion/rollback lifecycle and combined calibration proof.

## Decisions Made

- Kept all active-version mutation in `src/registry/activate.mjs`; the canary controller only coordinates its existing public primitives.
- Required recovery to establish healthy publication authority before any promotion or rollback mutation.
- Used strict `< 25 ms` warm p95 and `< 100 ms` maximum route latency as gates independent from semantic quality and context budgets.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added reproducible corpus identity and baseline deltas**
- **Found during:** Task 3 end-to-end lifecycle proof
- **Issue:** The initial measurement output recorded exact versions but omitted the byte-locked corpus fingerprint and signed baseline latency deltas required by D-15.
- **Fix:** Added `corpus_fingerprint` and `baseline_delta` to bounded measurement output.
- **Files modified:** `src/evolution/perf-measure.mjs`, `tests/router.compiled-evolution.test.mjs`
- **Verification:** Focused lifecycle suite and complete router suite pass.
- **Committed in:** `bdcce91`

**Total deviations:** 1 auto-fixed (Rule 2: 1)
**Impact on plan:** The correction completes reproducibility evidence without adding a second publication or measurement architecture.

## Issues Encountered

- The plan's focused registry filename used `router.registry-activation.test.mjs`; the repository's actual test is `router.registry-activate.test.mjs`, which was run directly.

## User Setup Required

None - no external services or packages are required.

## Next Phase Readiness

- Phase 17 implementation is ready for the independent phase verifier.
- Focused verification passed 37/37 tests; the complete router suite passed 585/585 tests.

## Self-Check: PASSED

- All five implementation and test files exist.
- All six TDD commit hashes exist in history.
- Focused and complete verification suites passed completely.

---
*Phase: 17-compiled-prompt-routing-and-safe-evolution*
*Completed: 2026-07-16*
