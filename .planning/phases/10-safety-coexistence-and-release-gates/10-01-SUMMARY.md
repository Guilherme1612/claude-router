---
phase: 10-safety-coexistence-and-release-gates
plan: 01
subsystem: testing
tags: [node-test, router, safety, fail-open, latency]

requires:
  - phase: 06-inspect-and-preview-commands
    provides: shared inspectDecision dry-run helper and operator CLI boundary
  - phase: 09-telemetry-evolution-visibility
    provides: evolved hot-path worker trigger and proposal helper surface
provides:
  - Phase 10 aggregate safety release matrix for SAF-01, SAF-02, SAF-03, SAF-06, and SAF-07
  - Static no-external-classifier and operator-boundary gates for live router hot-path files
  - Warm and evolved worker-trigger latency gates under the 100ms budget
affects: [router-hot-path, release-gates, safety-tests]

tech-stack:
  added: []
  patterns:
    - Node stdlib node:test subprocess release gates against the live hook
    - Static source-boundary scans for hot-path safety requirements

key-files:
  created:
    - tests/router.safety-release.test.mjs
  modified:
    - tests/router.safety-release.test.mjs

key-decisions:
  - "Plan 10-01 required no production hook edits; existing router behavior already satisfied the new safety contracts."
  - "The aggregate release matrix allows the existing detached local evolution worker spawn while rejecting external classifier/network paths."

patterns-established:
  - "Safety matrix tests name SAF requirement IDs directly in node:test descriptions."
  - "Evolved latency checks save and restore the live .evolve-trigger state around subprocess execution."

requirements-completed: [SAF-01, SAF-02, SAF-03, SAF-06, SAF-07]

coverage:
  - id: D1
    description: "SAF-01 fail-open matrix for malformed stdin, missing prompt, non-string prompt, whitespace-only prompt, and forced internal throw."
    requirement: SAF-01
    verification:
      - kind: unit
        ref: "node --test tests/router.safety-release.test.mjs tests/router.failopen.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "SAF-03 static gate rejects per-prompt external classifier, hosted model SDK, HTTP request, and classifier shell patterns in hot-path files."
    requirement: SAF-03
    verification:
      - kind: unit
        ref: "tests/router.safety-release.test.mjs#SAF-03/SAF-07: hot-path files have no per-prompt external classifier or hosted-model call path"
        status: pass
    human_judgment: false
  - id: D3
    description: "SAF-06 source-boundary gate keeps operator diagnostics behind runCli rather than main(payload)."
    requirement: SAF-06
    verification:
      - kind: unit
        ref: "tests/router.safety-release.test.mjs#SAF-06/SAF-07: operator diagnostics are reachable from runCli, not main(payload)"
        status: pass
    human_judgment: false
  - id: D4
    description: "SAF-02 latency gates cover warm pass-through and evolved worker-trigger hot path under 100ms."
    requirement: SAF-02
    verification:
      - kind: unit
        ref: "node --test tests/router.perf.test.mjs tests/router.perf-evolved.test.mjs tests/router.safety-release.test.mjs"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-07-11
status: complete
---

# Phase 10 Plan 01: Safety Release Matrix Summary

**Node test release matrix proving router fail-open behavior, hot-path latency, no external classifier path, and operator CLI isolation.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-11T18:38:00Z
- **Completed:** 2026-07-11T18:57:43Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added `tests/router.safety-release.test.mjs` with focused SAF-01, SAF-02, SAF-03, SAF-06, and SAF-07 assertions.
- Reused the live hook subprocess pattern to prove malformed input, invalid prompts, and `ROUTER_TEST_THROW=1` fail open with exit 0 and empty stdout.
- Added static source gates rejecting external classifier/network call paths while allowing the existing detached local evolution worker spawn.
- Added operator-boundary and evolved-worker latency checks so CLI diagnostics remain outside `main(payload)` and the worker-trigger path stays under 100ms.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add SAF hot-path release safety matrix** - `764797d` (test)
2. **Task 2: Reconfirm warm latency and evolved hot-path budget** - `9e204ce` (test)

**Plan metadata:** pending at summary commit time

## Files Created/Modified

- `tests/router.safety-release.test.mjs` - Phase 10 aggregate safety release matrix for fail-open, no-classifier, operator-boundary, and latency gates.

## Decisions Made

- No production router edits were needed because the live hook already satisfied the newly formalized contracts.
- The SAF-03 scan explicitly permits the existing local `node:child_process` worker spawn only when it targets `router.evolve.mjs` via `process.execPath`; classifier shell-outs remain forbidden.
- The evolved worker-trigger test mirrors the existing perf-evolved live-state save/restore pattern because the trigger path is intentionally production-global.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test Harness Bug] Fixed URL path handling in the new safety matrix**
- **Found during:** Task 1
- **Issue:** The initial SAF-03 scan passed a `URL` object to `basename`, causing `ERR_INVALID_ARG_TYPE`.
- **Fix:** Converted `router.calibrate.mjs` URL to a filesystem path via `fileURLToPath`.
- **Files modified:** `tests/router.safety-release.test.mjs`
- **Verification:** `node --test tests/router.safety-release.test.mjs tests/router.failopen.test.mjs` passed.
- **Committed in:** `764797d`

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** The fix corrected the new test harness only; router behavior and scope stayed unchanged.

## Issues Encountered

None beyond the auto-fixed test harness path conversion noted above.

## Known Stubs

None.

## Threat Flags

None. The only new surface is a local Node test file; it adds no network endpoint, auth path, file-access boundary, or schema change beyond reading already-planned live router files and saving/restoring the existing evolution trigger during tests.

## User Setup Required

None - no external service configuration required.

## Verification

- `node --test tests/router.safety-release.test.mjs tests/router.failopen.test.mjs` - passed.
- `node --test tests/router.perf.test.mjs tests/router.perf-evolved.test.mjs` - passed.
- `node --test tests/router.perf.test.mjs tests/router.perf-evolved.test.mjs tests/router.safety-release.test.mjs` - passed.
- `node --test tests/router.safety-release.test.mjs tests/router.failopen.test.mjs tests/router.perf.test.mjs tests/router.perf-evolved.test.mjs` - passed, 26/26 tests.

## Next Phase Readiness

Plan 10-02 can build on the established safety matrix for coexistence, missing-MCP, privacy, or live-state release gates without reworking the hot-path fail-open and latency contracts.

## Self-Check: PASSED

- Created summary file exists at `.planning/phases/10-safety-coexistence-and-release-gates/10-01-SUMMARY.md`.
- Task commits exist: `764797d`, `9e204ce`.
- Required verification command passed: `node --test tests/router.safety-release.test.mjs tests/router.failopen.test.mjs tests/router.perf.test.mjs tests/router.perf-evolved.test.mjs`.

---
*Phase: 10-safety-coexistence-and-release-gates*
*Completed: 2026-07-11*
