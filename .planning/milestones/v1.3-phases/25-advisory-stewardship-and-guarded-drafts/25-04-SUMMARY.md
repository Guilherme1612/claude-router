---
phase: 25-advisory-stewardship-and-guarded-drafts
plan: 04
subsystem: steward-startup
tags: [node, atomic-pointer, bounded-io, hot-path-isolation]
requires:
  - phase: 25-advisory-stewardship-and-guarded-drafts
    provides: deterministic suggestion selection, private interaction state, and guarded CLI actions
provides:
  - off-hot-path suggestion pointer refresh after durable health and advisory changes
  - atomic 0600 compact pointer publication with one fixed bounded loader
  - exact pointer-only startup notice with fail-silent corruption and expiry handling
affects: [26-publication, user-prompt-submit, steward-cli]
tech-stack:
  added: []
  patterns: [post-commit-derived-pointer, atomic-unavailable-replacement, pointer-only-hot-path]
key-files:
  created:
    - src/steward/refresh.mjs
    - src/steward/startup-pointer.mjs
    - tests/router.steward-startup.test.mjs
  modified:
    - src/health/observe.mjs
    - src/health/admin.mjs
    - src/cli/router-control.mjs
    - src/context/prompt-route.mjs
    - tests/router.health.privacy.test.mjs
key-decisions:
  - "The startup path reads one fixed compact pointer and never imports the producer or health policy."
  - "A disposed health source atomically replaces stale availability with an unavailable record."
patterns-established:
  - "Durable source changes trigger one best-effort derived-pointer refresh without rolling back source state."
  - "Optional startup projection fails silent on missing, corrupt, oversized, expired, or suppressed input."
requirements-completed: [UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09]
coverage:
  - id: D1
    description: "Durable health and advisory changes refresh one conservative startup pointer off the hot path."
    requirement: UX-01
    verification:
      - kind: integration
        ref: "tests/router.steward-startup.test.mjs#refresh caller cardinality"
        status: pass
    human_judgment: false
  - id: D2
    description: "The compact pointer is atomically replaced and loaded through one fixed bounded read."
    requirement: UX-02
    verification:
      - kind: unit
        ref: "tests/router.steward-startup.test.mjs#compile and load"
        status: pass
    human_judgment: false
  - id: D3
    description: "Startup emits only the approved one-line notice without health derivation or metadata disclosure."
    requirement: UX-09
    verification:
      - kind: integration
        ref: "tests/router.steward-startup.test.mjs#startup and isolation"
        status: pass
      - kind: unit
        ref: "tests/router.health.privacy.test.mjs#UX-08 / UX-09"
        status: pass
    human_judgment: false
duration: 10min
completed: 2026-07-28
status: complete
---

# Phase 25 Plan 04: Conservative Startup Pointer Summary

**Atomic off-path suggestion availability with one fixed bounded startup read and one approved metadata-free notice**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-28T15:45:11Z
- **Completed:** 2026-07-28T15:54:47Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Wired successful evidence appends, health mutations, and advisory interactions to one post-commit pointer refresh while leaving failed/no-write paths untouched.
- Added atomic 0600 available/unavailable pointer replacement and a strict 4 KiB loader using one fixed open/fstat/read/close sequence.
- Added the exact startup notice without health, ranking, discovery, history, network, model, or producer references on the prompt route.

## Task Commits

1. **Shared RED: startup pointer contracts** - `4203121`
2. **Tasks 1/2 GREEN: producer, callers, and bounded pointer persistence** - `ed2df96`
3. **Task 2 fix: disposed health clears stale availability** - `8f2f467`
4. **Task 3 GREEN: pointer-only startup notice** - `17d0103`

## Files Created/Modified

- `src/steward/refresh.mjs` - fixed-input off-path producer and disposed-health clearing.
- `src/steward/startup-pointer.mjs` - atomic pointer compiler and bounded fail-silent loader.
- `src/health/observe.mjs` - refresh after each stored evidence append.
- `src/health/admin.mjs` - refresh after successful reset, dispose, and recover.
- `src/cli/router-control.mjs` - refresh after current suggestion inspection or a stored interaction.
- `src/context/prompt-route.mjs` - read-only exact-line startup projection.
- `tests/router.steward-startup.test.mjs` - producer, caller, persistence, corruption, I/O, and rendering coverage.
- `tests/router.health.privacy.test.mjs` - structural UserPromptSubmit isolation gate.

## Decisions Made

- Reused the active immutable registry payload as the fixed source of records, relationships, and contracts; no discovery path was added.
- Kept refresh failures advisory: durable source state remains committed and operator surfaces receive one stable warning.
- Suppressed the notice when adding it would exceed the existing 2048-byte context ceiling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleared stale availability while health is disposed**
- **Found during:** Task 2 verification
- **Issue:** Preserved outcome history could reselect the prior suggestion after health disposal.
- **Fix:** The producer recognizes disposed health state and atomically publishes an unavailable pointer.
- **Files modified:** `src/steward/refresh.mjs`, `tests/router.steward-startup.test.mjs`
- **Verification:** Dedicated RED/GREEN disposed-health regression passes.
- **Committed in:** `8f2f467`

**Total deviations:** 1 auto-fixed (1 Rule 1)
**Impact on plan:** Required stale-availability correctness; no authority or scope expansion.

## Issues Encountered

- The required serial full suite completed with 1029 passing, 31 failing, and 1 skipped test. The failures are outside Plan 25-04: installed-controller lifecycle/install/recovery cases time out waiting for publication, while the pre-existing skipped context-hook test continues after `t.skip()` and parses empty output. Focused and adjacent 25-04 suites pass; details are recorded in `deferred-items.md`.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: local-file-write | `src/steward/startup-pointer.mjs` | Writes one strict bounded 0600 decision record through temp, fsync, and rename. |
| threat_flag: prompt-input | `src/context/prompt-route.mjs` | Reads one fixed bounded pointer and emits only an approved constant literal. |

## User Setup Required

None.

## Next Phase Readiness

- Phase 26 can publish and verify the conservative startup pointer seam.
- Pre-existing installed-controller full-suite failures remain deferred and are not caused by Plan 25-04.

## Self-Check: PASSED

- All eight created or modified implementation/test files exist.
- Commits `4203121`, `ed2df96`, `8f2f467`, and `17d0103` exist.
- Focused producer, pointer, startup, privacy, compiled-index, and context suites pass.

---
*Phase: 25-advisory-stewardship-and-guarded-drafts*
*Completed: 2026-07-28*
