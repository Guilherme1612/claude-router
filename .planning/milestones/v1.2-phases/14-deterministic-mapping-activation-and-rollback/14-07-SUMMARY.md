---
phase: 14-deterministic-mapping-activation-and-rollback
plan: "07"
subsystem: operator-control
tags: [bounded-diff, rollback-preview, corrupt-active, canonical-output, fail-closed]
requires:
  - phase: 14-06
    provides: semantic known-good verification, cross-process pointer authority, and durable rollback journal
provides:
  - Deterministic completeness metadata for bounded diff and rollback preview results
  - Stable corrupt-active verdicts and recovery guidance before projection
  - Canonical text and JSON parity for counts, bounds, reason codes, and next actions
affects: [phase-14-verification, operator-cli, rollback-inspection]
tech-stack:
  added: []
  patterns: [canonical bounded-result envelope, active-source preflight, shared renderer data]
key-files:
  created: []
  modified: [src/cli/router-control.mjs, tests/router.control-cli.test.mjs]
key-decisions:
  - "Bounded collections always publish total, returned, truncated, limit, and next_offset metadata after deterministic full-change ordering."
  - "Implicit diff, explain, status, and rollback preflight semantic active authority before any projection."
  - "Unsafe active history uses invalid_active_version with the underlying source verdict and run_registry_recovery action in both renderers."
requirements-completed: [ACT-01]
coverage:
  - id: D1
    description: Large diff and rollback preview results expose deterministic bounds totals and continuation metadata in text and JSON
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.control-cli.test.mjs#large diff and rollback preview expose deterministic bounded totals in JSON and text
        status: pass
    human_judgment: false
  - id: D2
    description: Corrupt manifest registry and semantic active versions fail closed before projection with stable recovery guidance
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.control-cli.test.mjs#corrupt active history returns stable recovery guidance before projection
        status: pass
    human_judgment: false
  - id: D3
    description: Rollback remains semantic preview-first and exact-destination confirmed through the hardened operator boundary
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.control-cli.test.mjs#rollback is detailed preview-first and exact confirmation is mandatory
        status: pass
      - kind: integration
        ref: tests/router.registry-activate.test.mjs#rollback journal reports truthful outcomes before and after pointer publication
        status: pass
    human_judgment: false
duration: 6min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 07: Complete and Fail-Closed Operator Inspection Summary

**Operator diff and rollback inspection now disclose deterministic bounds and reject unsafe active history before projection in both text and JSON.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-15T21:01:00Z
- **Completed:** 2026-07-15T21:06:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced silent 256-entry slicing with stable full-change ordering plus explicit total, returned, truncation, limit, and continuation-offset metadata.
- Propagated identical bounded metadata through canonical diff results, rollback previews, JSON rendering, and human-readable rendering.
- Added semantic active-source preflight to status, implicit diff, explain, and rollback before any registry or mapping projection.
- Added manifest, registry, and integrity-valid semantic corruption regressions with stable nonzero exits and deterministic recovery actions.

## Task Commits

1. **Task 1 tests: Specify bounded operator results** - `6c26c4c` (test)
2. **Task 1 implementation: Disclose bounded operator results** - `fb20f47` (feat)
3. **Task 2 tests: Specify corrupt active verdicts** - `d390424` (test)
4. **Task 2 implementation: Reject corrupt active projections** - `c9f11e9` (fix)

## Files Created/Modified

- `src/cli/router-control.mjs` - Adds bounded-result metadata and centralized semantic active-source preflight.
- `tests/router.control-cli.test.mjs` - Covers 300-entry histories, renderer parity, deterministic output, and three corrupt-active dimensions.

## Decisions Made

- Change totals count actual changed rows after complete deterministic comparison, not merely examined identifiers.
- Explicit two-version diff remains independent of active authority; implicit active diff fails closed if active history is unsafe.
- Unsafe active results retain the underlying semantic verdict inside `source_verdict` while exposing the stable top-level `invalid_active_version` taxonomy.

## Deviations from Plan

None - followed the plan as specified.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. T-14-07-01 through T-14-07-03 are covered by bounded metadata, renderer parity, byte-stability, and pre-projection corrupt-source regressions.

## Verification

- `node --test tests/router.control-cli.test.mjs` - passed.
- `node --test tests/router.control-cli.test.mjs tests/router.registry-activate.test.mjs` - 17 passed, 0 failed.
- `git diff --check` - passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All seven Phase 14 plans and the full gap-closure sequence are implemented. Phase 14 is ready for independent verification and completion routing; no execution plan remains.

## Self-Check: PASSED

- All four task commits exist on `main`.
- The summary exists and the complete plan verification suite passes with 17 tests and 0 failures.
- Unrelated planning and Graphify changes remain unstaged; `ROADMAP.md` was not modified by this execution.

---
*Phase: 14-deterministic-mapping-activation-and-rollback*
*Completed: 2026-07-15*
