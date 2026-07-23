---
phase: 14-deterministic-mapping-activation-and-rollback
plan: "05"
subsystem: activation-verification
tags: [evidence-authentication, equivalence, calibration, deterministic-mapping, tdd]
requires:
  - phase: 14-04
    provides: installed activation authority, canonical mapping guard, and retryable recovery
provides:
  - Independent exact-input authentication of production activation verification
  - Behavioral incremental/full canonical registry equivalence
  - Deterministic Phase 14 mapping calibration with complete threshold accounting
affects: [phase-14-verification, activation-safety, calibration-release-gate]
tech-stack:
  added: []
  patterns: [canonical evidence envelope authentication, behavioral gate measurement, fixture-specific deterministic evaluator]
key-files:
  created: [tests/router.calibrate.test.mjs]
  modified: [src/registry/activate.mjs, src/registry/validate.mjs, src/registry/watcher.mjs, router.calibrate.mjs, calibration-tasks.json, tests/router.registry-activate.test.mjs, tests/router.registry-watcher.test.mjs]
key-decisions:
  - "Activation trusts only canonical non-test production envelopes with exact input, gate evidence, runner identity, freshness, and whole-envelope fingerprints."
  - "Incremental/full equivalence rebuilds both registry paths and requires both canonical outputs to equal the exact candidate bytes."
  - "Phase 14 mapping fixtures are evaluated only by mapCandidateRegistry and every fixture increments the required calibration threshold."
requirements-completed: [MAP-01, ACT-01]
coverage:
  - id: D1
    description: Production activation independently rejects substituted, test-only, stale, incomplete, unknown-runner, or non-passing evidence before publication
    requirement: ACT-01
    verification:
      - kind: unit
        ref: tests/router.registry-activate.test.mjs#activation independently rejects substituted or unauthenticated production evidence before version creation
        status: pass
      - kind: integration
        ref: tests/router.registry-activate.test.mjs#immutable activation recovery and pointer-only rollback preserve history
        status: pass
    human_judgment: false
  - id: D2
    description: Incremental/full equivalence compares deterministic canonical registry bytes against the exact candidate
    requirement: ACT-01
    verification:
      - kind: unit
        ref: tests/router.registry-watcher.test.mjs#incremental full equivalence compares canonical registry bytes not schema presence
        status: pass
    human_judgment: false
  - id: D3
    description: Every Phase 14 mapping fixture runs through the deterministic mapper and contributes to the release threshold
    requirement: MAP-01
    verification:
      - kind: unit
        ref: tests/router.calibrate.test.mjs#every Phase 14 mapping fixture is evaluated by the deterministic mapper
        status: pass
      - kind: unit
        ref: tests/router.calibrate.test.mjs#calibration threshold accounts for every Phase 14 mapping fixture
        status: pass
      - kind: integration
        ref: node router.calibrate.mjs#Phase 14 mapping subset 2 of 2
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 05: Authenticated Verification and Behavioral Gates Summary

**Activation now authenticates exact production evidence while equivalence and calibration gates measure the deterministic behaviors they claim.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-15T20:42:00Z
- **Completed:** 2026-07-15T20:50:58Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Bound activation to exact candidate, reconciliation, mapping, policy, gate evidence, known runner identities, freshness, production provenance, and canonical envelope fingerprints.
- Replaced schema-only equivalence with incremental and clean-full registry builds whose canonical bytes must both equal the candidate.
- Added a dedicated Phase 14 calibration evaluator using `mapCandidateRegistry`, including mismatch regressions and complete mapping-fixture threshold accounting.
- Updated the Phase 14 calibration fixture metadata to express explicit and intentionally unmapped mapping evidence directly.

## Task Commits

Each TDD task was committed as a failing regression followed by its implementation:

1. **Task 1 tests: Specify production evidence authentication** - `ca6b211` (test)
2. **Task 1 implementation: Authenticate production activation evidence** - `0f3371b` (fix)
3. **Task 2 tests: Specify behavioral validation gates** - `55f1c94` (test)
4. **Task 2 implementation: Make verification gates behavioral** - `2feadf7` (feat)

## Files Created/Modified

- `src/registry/activate.mjs` - Independently authenticates production verification before immutable writes and pointer replacement.
- `src/registry/validate.mjs` - Produces exact mapping fingerprints and measures behavioral registry equivalence.
- `src/registry/watcher.mjs` - Supplies exact prior acquisition, lifecycle diff, and discovery inputs to equivalence verification.
- `router.calibrate.mjs` - Evaluates Phase 14 mapping fixtures through the deterministic mapper and thresholds every result.
- `calibration-tasks.json` - Declares explicit and active-but-unmapped evidence for Phase 14 fixtures.
- `tests/router.registry-activate.test.mjs` - Covers every evidence-substitution and provenance rejection dimension.
- `tests/router.registry-watcher.test.mjs` - Disconfirms schema-only equivalence.
- `tests/router.calibrate.test.mjs` - Covers mapper evaluation, deliberate mismatch, and threshold accounting.

## Decisions Made

- `mapping_fingerprint` is the canonical hash of the complete mapping payload, not a caller-supplied report fingerprint.
- Production verification gates must appear in canonical required-ID order and identify the frozen production runner ID and version.
- Calibration fixture expectations are data assertions; they are not routed through the prompt-time classifier.

## Deviations from Plan

### Auto-fixed Issues

- **[Rule 2 - Missing critical functionality]** Updated `calibration-tasks.json` so existing Phase 14 fixtures carry the mapping metadata required by the deterministic mapper instead of deriving claims from expected answers.
- **[Rule 2 - Missing critical functionality]** Added `tests/router.calibrate.test.mjs`, referenced by the plan verification command but absent from the repository.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. T-14-05-01 through T-14-05-03 are covered by substitution, byte-equivalence, deliberate fixture mismatch, and threshold-accounting regressions.

## Verification

- `node --test tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs` - passed.
- `node --test tests/router.registry-watcher.test.mjs tests/router.registry-map.test.mjs tests/router.calibrate.test.mjs` - passed.
- `node --test tests/router.registry-map.test.mjs tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs tests/router.calibrate.test.mjs` - 41 passed, 0 failed.
- `node router.calibrate.mjs` - exited 0; 31/32 overall, threshold 23; Phase 14 mapping 2/2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 14-05 gaps are closed. Exact production evidence, behavioral equivalence, and complete mapping calibration are ready for the remaining Phase 14 gap plans and independent verification.

## Self-Check: PASSED

- All four task commits exist on `main`.
- The summary file exists and the plan-wide suite passes with 41 tests and 0 failures.
- Unrelated planning and Graphify changes were not staged or committed; `ROADMAP.md` was not modified by this execution.

---
*Phase: 14-deterministic-mapping-activation-and-rollback*
*Completed: 2026-07-15*
