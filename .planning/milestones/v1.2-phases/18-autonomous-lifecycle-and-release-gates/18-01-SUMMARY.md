---
phase: 18-autonomous-lifecycle-and-release-gates
plan: 01
subsystem: lifecycle
tags: [filesystem-watcher, atomic-publication, compiled-routing, claude, codex]
requires:
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    provides: Strict bounded compiled-index reader and prompt route seam
provides:
  - Immutable verified registry and compiled-index release tuples
  - Installed Claude and Codex seven-event lifecycle matrix
  - Tuple-authoritative registry and prompt routing reads
affects: [18-02-recovery, 18-03-release-gates]
tech-stack:
  added: []
  patterns: [durable immutable payloads with one atomic tuple pointer, bounded tuple-first hot-path validation]
key-files:
  created: [src/prompt/publish-index.mjs, tests/router.autonomous-lifecycle.test.mjs]
  modified: [src/prompt/compile-index.mjs, src/registry/watcher.mjs, src/context/prompt-route.mjs, src/lifecycle/router-lifecycle.mjs, src/adapters/claude.mjs]
key-decisions:
  - "One release-tuples/active.json pointer is the public authority for mutually verified registry and compiled bytes."
  - "Unsafe lifecycle candidates preserve the prior tuple; safe native metadata retains deterministic mapping evidence."
patterns-established:
  - "Tuple publication writes and fsyncs both payloads and a manifest before atomically replacing authority."
  - "Installed-controller lifecycle tests poll observable state within two seconds and compare safe candidates with clean full builds."
requirements-completed: [REG-01, REG-02, REG-03, ADP-01, ADP-02, CHG-01, CHG-02, SAF-09, MAP-01]
coverage:
  - id: D1
    description: Registry and compiled prompt state publish and load as one verified immutable tuple.
    requirement: REG-03
    verification:
      - kind: integration
        ref: tests/router.compiled-index.test.mjs#publisher commits one verified registry and compiled release tuple
        status: pass
    human_judgment: false
  - id: D2
    description: Claude and Codex installed controllers observe all seven filesystem lifecycle operations.
    requirement: CHG-01
    verification:
      - kind: e2e
        ref: tests/router.autonomous-lifecycle.test.mjs#installed controller observes the seven-event lifecycle matrix
        status: pass
    human_judgment: false
duration: 24min
completed: 2026-07-17
status: complete
---

# Phase 18 Plan 01: Autonomous Lifecycle and Release Tuple Summary

**Dual-runtime filesystem changes now flow through installed controllers into full-build-equivalent registry state and mutually verified registry/compiled release tuples.**

## Performance

- **Duration:** 24 min
- **Completed:** 2026-07-17
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added a standard-library-only durable publisher that binds registry bytes, compiled routes, fingerprints, compatibility, and verification evidence in one immutable tuple.
- Made watcher registry reads and prompt dispatch resolve and validate the same tuple, with verified known-good fallback and fail-closed mismatch behavior.
- Exercised add, edit, rename, move, disable, dependency-change, and delete for both installed Claude and Codex controllers with bounded polling and full-build equivalence.

## Task Commits

1. **Task 1 RED:** `634f983`
2. **Task 1 GREEN:** `d8ab415`
3. **Task 2 RED:** `1eb401f`
4. **Task 2 GREEN:** `5385e96`

## Decisions Made

- Registry activation may retain its private immutable history, but public readers accept only a mutually verified release tuple.
- A corrupt active tuple may fall back only to a complete, hash-valid known-good tuple.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Native mapping metadata was discarded during adapter normalization.**
- **Found during:** Task 2
- **Fix:** Preserve bounded mapping metadata so deterministic mapping evidence reaches activation and compiled publication.
- **Files modified:** `src/adapters/claude.mjs`
- **Verification:** Dual-runtime 14-cell event matrix and registry build suite.
- **Committed in:** `5385e96`

**Total deviations:** 1 auto-fixed (Rule 2).

## Issues Encountered

- Unsafe dependency changes correctly publish quarantined candidate evidence without replacing the prior dispatch tuple; the matrix treats that preservation as the expected disable result.

## User Setup Required

None.

## Next Phase Readiness

Plan 18-02 can exercise crash recovery and last-known-good repair against the tuple authority. No blockers found.

---
*Phase: 18-autonomous-lifecycle-and-release-gates*
*Completed: 2026-07-17*
