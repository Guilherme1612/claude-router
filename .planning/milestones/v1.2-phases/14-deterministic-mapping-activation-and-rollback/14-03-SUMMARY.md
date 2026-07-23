---
phase: 14-deterministic-mapping-activation-and-rollback
plan: "03"
subsystem: registry-control
tags: [cli, rollback, deterministic-output, dual-runtime, ownership]
requires:
  - phase: 14-01
    provides: deterministic mapping evidence and exact-candidate safety
  - phase: 14-02
    provides: immutable versions, verification, atomic pointer activation, and rollback primitives
provides:
  - Deterministic read-only status, diff, explain, and registry verification controls
  - Preview-first rollback with exact destination confirmation and shared mutation authority
  - Importable Phase 14 control/module closure in both Claude and Codex owned roots
affects: [phase-14-verification, operator-control, lifecycle-installer]
tech-stack:
  added: []
  patterns: [canonical command results, shared text-json renderers, exact-confirmed pointer-only rollback, dual-runtime owned deployment]
key-files:
  created: [src/cli/router-control.mjs, tests/router.control-cli.test.mjs]
  modified: [src/registry/activate.mjs, src/lifecycle/router-lifecycle.mjs, tests/router.lifecycle.test.mjs, install-router.mjs]
key-decisions:
  - "All operator renderers consume one canonical result with stable reason codes and exit taxonomy."
  - "Rollback confirmation is the exact immutable destination ID and execution delegates solely to executeRollback."
  - "Claude and Codex receive the same importable owned module closure while mutable authority remains rooted in the controller-owned store."
requirements-completed: [MAP-01, ACT-01]
coverage:
  - id: D1
    description: Read-only deterministic controls and explainable version comparisons
    requirement: MAP-01
    verification:
      - kind: integration
        ref: tests/router.control-cli.test.mjs#read-only controls and diff/explain subprocess matrix
        status: pass
    human_judgment: false
  - id: D2
    description: Preview-first exact-confirmed race-resistant rollback
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.control-cli.test.mjs#rollback confirmation and verification-to-pointer replacement tests
        status: pass
    human_judgment: false
  - id: D3
    description: Owned importable Phase 14 control surface for Claude and Codex roots
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.lifecycle.test.mjs#one command installs complete ownership manifest
        status: pass
    human_judgment: false
duration: 18min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 03: Deterministic Registry Control and Dual-Runtime Deployment Summary

**Stable read-only registry inspection and exact-confirmed rollback now share one canonical control surface deployed as fingerprint-owned modules for Claude and Codex.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-15T19:58:00Z
- **Completed:** 2026-07-15T20:16:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added stable text and JSON status, diff, explain, verification, and rollback results with bounded inputs, portable evidence, reason codes, and meaningful exits.
- Added preview-first rollback disclosure, exact interactive/non-interactive destination confirmation, stale/integrity revalidation, TOCTOU injection coverage, and pointer-only execution through the activation primitive.
- Deployed the complete Phase 14 module closure and importable control entrypoint under both Claude and Codex router-owned roots with transactional repair/uninstall ownership.
- Identified immutable version-manifest ownership separately from mutable candidate, pointer, audit, and controller state in the install manifest.

## Task Commits

1. **Task 1 RED: Specify deterministic registry controls** - `c7fca17` (test)
2. **Task 1 GREEN: Add deterministic registry control CLI** - `268ac73` (feat)
3. **Task 2: Deploy dual-runtime control surface** - `5951dc1` (feat)

## Files Created/Modified

- `src/cli/router-control.mjs` - Pure command orchestration, stable renderers, inspection controls, and typed-confirmed rollback.
- `tests/router.control-cli.test.mjs` - Subprocess determinism, byte-preservation, exit, privacy, confirmation, and TOCTOU matrix.
- `src/registry/activate.mjs` - Carries the existing test-only named I/O injection through rollback execution to the sole pointer primitive.
- `src/lifecycle/router-lifecycle.mjs` - Installs and owns the full module closure under both runtime roots and classifies runtime state.
- `tests/router.lifecycle.test.mjs` - Proves both installed control surfaces import and their Phase 14 dependencies exist.
- `install-router.mjs` - Reports installed registry-control entrypoints.

## Decisions Made

- Text is a deterministic projection of the same canonical object serialized as stable JSON; there is no prose-only result path.
- The CLI never writes versions, audit files, or `active.json`; rollback mutation remains inside `executeRollback` and `replaceActivePointer`.
- Installed Codex modules mirror the Claude module closure, while controller candidate and active authority remain explicit mutable state rather than being confused with installation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Forwarded the named rollback TOCTOU injection through the shared activation API**
- **Found during:** Task 1 rollback race coverage
- **Issue:** `executeRollback` did not forward the existing named I/O seam to `replaceActivePointer`, preventing direct verification of replacement between initial verification and pointer publication.
- **Fix:** Added the optional test-only `io` pass-through and a destination replacement test proving the active pointer remains byte-identical.
- **Files modified:** `src/registry/activate.mjs`, `tests/router.control-cli.test.mjs`
- **Verification:** Focused Phase 14 suite passed 28 tests.
- **Committed in:** `268ac73`

**Total deviations:** 1 auto-fixed (1 Rule 2)
**Impact on plan:** The change exposes no production mutation authority; it makes the planned race defense directly testable through the existing primitive.

## Issues Encountered

- The supplied `AGENTS.md` directive referenced `RTK.md`, but neither file exists in this checkout. No contradictory repository-local instruction was available.
- Live `~/.claude` deployment was intentionally not performed. All installation, readiness, repair, rollback, and uninstall verification used isolated temporary runtime roots.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: local-control-cli | src/cli/router-control.mjs | New bounded local file-inspection and rollback control boundary covered by T-14-13 through T-14-18 tests. |

## Verification

- Task 1 exact command: 28 tests passed.
- Task 2 exact command: 35 tests passed.
- Wave 3 Phase 13/14 regression command: 78 tests passed.
- Full repository suite: 484 tests passed, 0 failed.
- `git diff --check`: passed.
- No live runtime mutation was attempted.

## User Setup Required

None - no external services or live-home changes are required.

## Next Phase Readiness

- Phase 14 implementation is ready for independent verification and phase completion.
- Live owned-runtime deployment remains an operator action outside this sandboxed plan execution.

## Self-Check: PASSED

- Created files and all three task commits were verified.
- Full suite and focused suites passed with no unexpected tracked-file deletion.
- No unresolved stubs or unrelated worktree changes were included in task commits.

---
*Phase: 14-deterministic-mapping-activation-and-rollback*
*Completed: 2026-07-15*
