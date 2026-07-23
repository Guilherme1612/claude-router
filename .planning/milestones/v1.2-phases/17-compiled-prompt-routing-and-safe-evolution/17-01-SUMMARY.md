---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: 01
subsystem: prompt-routing
tags: [compiled-index, sha256, fail-closed, node-test]
requires:
  - phase: 16-workflow-first-orchestration-and-context-budgets
    provides: workflow-first selection, dispatch semantics, and bounded capsule contracts
provides:
  - bounded verified compiled-index loading with explicit known-good fallback
  - live prompt routing gated on immutable compiled projections and fresh capsules
  - executable scan-free and forbidden-slow-path regression contracts
affects: [phase-17-evolution, prompt-route, registry-activation, routing-performance]
tech-stack:
  added: []
  patterns: [explicit-address bounded reads, metadata-and-fingerprint validation, fail-closed routing]
key-files:
  created: [src/prompt/compile-index.mjs, tests/router.compiled-index.test.mjs]
  modified: [src/context/prompt-route.mjs, tests/router.context-prompt-integration.test.mjs]
key-decisions:
  - "Compiled state uses an explicit active pointer, immutable version metadata and payload, and a bounded ordered known-good list."
  - "Prompt routing returns a bounded non-dispatchable diagnostic when no compatible compiled projection exists."
patterns-established:
  - "Hot-path state is addressed directly; version directories are never enumerated."
  - "Schema, freshness, compatibility, lifecycle state, and SHA-256 payload identity are all required before dispatch."
requirements-completed: [REL-01]
coverage:
  - id: D1
    description: Verified active and known-good compiled projections are selected through bounded reads.
    requirement: REL-01
    verification:
      - kind: unit
        ref: tests/router.compiled-index.test.mjs#bounded loader and fallback matrix
        status: pass
    human_judgment: false
  - id: D2
    description: Live prompt routing consumes compiled state plus a fresh selected capsule and fails closed without compatible state.
    requirement: REL-01
    verification:
      - kind: integration
        ref: tests/router.compiled-index.test.mjs#live contextual routing
        status: pass
      - kind: integration
        ref: tests/router.workflow-orchestrator.test.mjs
        status: pass
    human_judgment: false
  - id: D3
    description: The prompt hot path performs no inventory scan, registry build, history replay, or external model call.
    requirement: REL-01
    verification:
      - kind: unit
        ref: tests/router.compiled-index.test.mjs#hot path negative contracts
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-07-16
status: complete
---

# Phase 17 Plan 01: Compiled Prompt Routing Summary

**SHA-256 verified immutable routing projections now gate the live prompt seam through exact bounded reads, with verified known-good recovery and no uncompiled slow path.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-16T22:09:14Z
- **Completed:** 2026-07-16T22:15:33Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added a compact compiled-index loader validating lifecycle, schema, freshness, compatibility, and payload identity without directory enumeration.
- Integrated verified compiled projections and selected fresh capsules into contextual prompt routing while preserving override, stale, ambiguity, and terminal reason codes.
- Made missing or invalid compiled state deterministically non-dispatchable, with exact-read and forbidden-dependency tests proving REL-01's compact hot-path contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the bounded compiled-index loader** - `b70830c` (test), `a76fd23` (feat)
2. **Task 2: Integrate compiled state and fresh capsules into the live prompt seam** - `50101a8` (test), `22b7374` (feat)
3. **Task 3: Prove the hot path remains compact and scan-free** - `700ef04` (test)

Additional compatibility fix: `542e833` (test)

## Files Created/Modified

- `src/prompt/compile-index.mjs` - Exact-address compiled pointer, metadata, payload, and known-good validation.
- `src/context/prompt-route.mjs` - Live compiled-state gate and bounded failure diagnostics.
- `tests/router.compiled-index.test.mjs` - Active, fallback, corruption, integration, and forbidden-hot-path matrix.
- `tests/router.context-prompt-integration.test.mjs` - Phase 15 fixtures provisioned with verified compiled state.

## Decisions Made

- Used JSON projections under `compiled-index/versions/<version>/` with separate bounded metadata and payload files so compatibility can be proven without a registry rebuild.
- Limited fallback authority to at most eight explicitly ordered known-good entries; candidate, quarantined, incomplete, stale, corrupt, and incompatible versions remain ineligible.
- Kept compiled workflow lookup ahead of capsule mutation so an absent workflow projection cannot partially apply an explicit override.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Provisioned compiled state in inherited prompt integration fixtures**
- **Found during:** Wave-boundary full-suite verification
- **Issue:** Phase 15 integration fixtures created only a context capsule, so the newly required compiled gate correctly returned a non-dispatchable result and two legacy assertions failed.
- **Fix:** Added a verified compact index fixture instead of weakening production fail-closed behavior.
- **Files modified:** `tests/router.context-prompt-integration.test.mjs`
- **Verification:** Focused integration suite and all 564 router tests pass.
- **Committed in:** `542e833`

---

**Total deviations:** 1 auto-fixed (1 Rule 1)
**Impact on plan:** Test-only compatibility repair; production scope and fail-closed guarantees are unchanged.

## Issues Encountered

- Initial full-suite run exposed two expected legacy-fixture failures; both were resolved by publishing valid compiled state in those fixtures.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- The compact immutable prompt projection seam is ready for Phase 17 canary/evolution control-plane work.
- No blockers remain; all 564 router tests pass.

## Self-Check: PASSED

- All four created or modified files exist.
- All six task and compatibility commit hashes exist in git history.
- Focused verification passed 29/29 tests; wave-boundary verification passed 564/564 tests.

---
*Phase: 17-compiled-prompt-routing-and-safe-evolution*
*Completed: 2026-07-16*
