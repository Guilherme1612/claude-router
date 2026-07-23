---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: 05
subsystem: testing
tags: [compiled-routing, calibration, utf8, latency]
requires:
  - phase: 17-04
    provides: Compiled routing and calibration verification primitives
provides:
  - End-to-end fixed-corpus routing through routeContextPrompt
  - Exact emitted-context UTF-8 budget evidence
  - Real warm compiled-route p95 and maximum latency gates
affects: [phase-17-verification, REL-01]
tech-stack:
  added: []
  patterns: [hermetic compiled-index fixtures, non-enumerable measurement evidence]
key-files:
  created: [.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-05-SUMMARY.md]
  modified: [tests/router.compiled-evolution.test.mjs, tests/router.perf-calibration.test.mjs, src/evolution/perf-measure.mjs]
key-decisions:
  - "Calibration expectations use the canonical resolver outcomes resume and clarify rather than unreachable continue and blocked labels."
patterns-established:
  - "Quality objects expose only observed router resolution fields while emitted context remains directly measurable but non-enumerable."
requirements-completed: [REL-01]
coverage:
  - id: D1
    description: Real compiled prompt routing supplies every fixed-corpus quality result and emitted-context byte measurement.
    requirement: REL-01
    verification:
      - kind: integration
        ref: tests/router.compiled-evolution.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Warm real-route p95 remains below 25 ms and every measured route remains below 100 ms.
    requirement: REL-01
    verification:
      - kind: integration
        ref: node --test tests/router.compiled-evolution.test.mjs tests/router.perf-calibration.test.mjs tests/router.context-prompt-integration.test.mjs
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-07-17
status: complete
---

# Phase 17 Plan 05: Compiled Prompt Routing and Safe Evolution Summary

**The fixed calibration corpus now exercises the real compiled prompt router, measures its exact emitted UTF-8 context, and enforces both REL-01 latency ceilings.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-16T23:31:00Z
- **Completed:** 2026-07-16T23:40:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Built isolated compiled-index and capsule state for all seven calibration fixture classes.
- Proved routing quality comes from `routeContextPrompt` and that context budgets use exact emitted UTF-8 bytes.
- Measured repeated warm calls to the real adapter with p95 below 25 ms and every sample below 100 ms.

## Task Commits

1. **Task 1: Build a real compiled-routing adapter for the fixed corpus** - `af22199`
2. **Task 2: Prove routing quality and exact emitted-context byte ceilings** - `bfe8040`
3. **Task 3: Measure real warm compiled-routing latency and enforce both hard ceilings** - `7f0192e`

## Files Created/Modified

- `tests/router.compiled-evolution.test.mjs` - Hermetic real-route quality, byte, and latency integration evidence.
- `src/evolution/perf-measure.mjs` - Corrected fixed-corpus outcome labels to canonical resolver semantics.
- `tests/router.perf-calibration.test.mjs` - Updated the byte-locked corpus fingerprint after the correctness repair.

## Decisions Made

- Preserved the adopted Phase 15/17 router semantics: unique referential prompts resolve as `resume`, while terminal workflows yield non-dispatchable `clarify` results.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unreachable fixed-corpus expectations**
- **Found during:** Task 1
- **Issue:** The corpus expected `continue` for active referential routing and `blocked` for terminal routing, but the canonical resolver and its regression tests require `resume` and `clarify`. Exact observed output could never pass the stale corpus.
- **Fix:** Aligned the frozen corpus expectations and fingerprint with the adopted resolver contract; no production routing behavior changed.
- **Files modified:** `src/evolution/perf-measure.mjs`, `tests/router.perf-calibration.test.mjs`
- **Verification:** Targeted suites and all 590 repository tests pass.
- **Committed in:** `af22199`

**Total deviations:** 1 auto-fixed bug.
**Impact on plan:** Required to make end-to-end evaluation measure truthful router outcomes instead of translating or copying expected values.

## Issues Encountered

- `routeContextPrompt` does not accept a candidate list. The ambiguity fixture therefore supplies conflicting stale authoritative identity evidence, exercising the real focused non-dispatchable ambiguity path without changing the production API.

## User Setup Required

None.

## Verification

- Targeted integration suite: 14/14 passed.
- Wave-boundary suite: 590/590 passed.
- No shortcut callbacks remain in the compiled-evolution integration test.
- Temporary fixture roots are registered with `t.after` and removed recursively.

## Self-Check: PASSED

- Summary and all modified files exist.
- Task commits `af22199`, `bfe8040`, and `7f0192e` exist.
- No blocking stubs or new threat surfaces were introduced.
