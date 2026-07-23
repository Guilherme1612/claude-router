---
phase: 14-deterministic-mapping-activation-and-rollback
plan: "04"
subsystem: registry-activation
tags: [installed-controller, canonical-mapping, recovery, fail-closed, tdd]
requires:
  - phase: 14-03
    provides: dual-runtime owned module deployment and shared mutable controller authority
provides:
  - Installed controller configuration for one shared immutable activation store and active pointer
  - Canonical mapping-shape enforcement at watcher and production verification boundaries
  - Retryable fail-closed startup recovery that preserves prior active authority
affects: [phase-14-verification, lifecycle-installer, registry-watcher, activation-safety]
tech-stack:
  added: []
  patterns: [shared controller-owned activation authority, canonical schema guard, retryable recovery gate]
key-files:
  created: []
  modified: [src/lifecycle/router-lifecycle.mjs, src/registry/watcher.mjs, src/registry/validate.mjs, tests/router.lifecycle.test.mjs, tests/router.registry-watcher.test.mjs]
key-decisions:
  - "Claude and Codex deployments share the Claude controller-owned activation root; runtime mirrors remain read-only module deployments."
  - "Only canonical mapping reports with a complete zero-ambiguity summary and mapped or unmapped subjects may enter production verification."
  - "A blocked startup recovery does not advance the recovered latch and is retried on the next reconciliation."
requirements-completed: [MAP-01, ACT-01]
coverage:
  - id: D1
    description: Installed dual-runtime controllers use one owned activation root and publish an immutable version through active.json
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.lifecycle.test.mjs#one command installs router binding Codex marker and complete ownership manifest
        status: pass
      - kind: integration
        ref: tests/router.registry-watcher.test.mjs#installed activation paths bootstrap one immutable version and active pointer
        status: pass
    human_judgment: false
  - id: D2
    description: Real and malformed ambiguous canonical mappings stop before production verification or activation
    requirement: MAP-01
    verification:
      - kind: integration
        ref: tests/router.registry-watcher.test.mjs#real canonical ambiguous mapping stops before verification and activation
        status: pass
      - kind: unit
        ref: tests/router.registry-watcher.test.mjs#ambiguous canonical subject fails closed despite optimistic or malformed summary
        status: pass
    human_judgment: false
  - id: D3
    description: Blocked startup recovery preserves prior authority and retries before later activation
    requirement: ACT-01
    verification:
      - kind: integration
        ref: tests/router.registry-watcher.test.mjs#blocked recovery preserves authority and is retried before later activation
        status: pass
    human_judgment: false
duration: 15min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 04: Installed Activation and Fail-Closed Recovery Summary

**Installed controllers now reach the shared immutable activation pipeline while canonical ambiguity and blocked recovery preserve prior authority.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-15T20:27:00Z
- **Completed:** 2026-07-15T20:42:13Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added deterministic `activation_root` and `active_path` values to the installed controller configuration, rooted in the single shared controller-owned store.
- Made active-authority reads resolve immutable version registries through `active.json`, with a safe empty bootstrap path for first activation.
- Replaced legacy ambiguity checks with one canonical mapping safety predicate shared by the watcher and production `mapping_integrity` gate.
- Prevented blocked or uncertain startup recovery from reaching mapping, verification, or activation while keeping recovery retryable.

## Task Commits

Each TDD task was committed as a failing regression followed by its implementation:

1. **Task 1 tests: Specify installed activation paths** - `d656460` (test)
2. **Task 1 implementation: Enable installed activation authority** - `df767c9` (feat)
3. **Task 2 tests: Specify ambiguity and recovery guards** - `95715f5` (test)
4. **Task 2 implementation: Fail closed on mapping and recovery** - `eee4d1f` (fix)

## Files Created/Modified

- `src/lifecycle/router-lifecycle.mjs` - Configures and reports the shared installed activation authority.
- `src/registry/watcher.mjs` - Resolves active immutable registry bytes and gates ambiguity and recovery.
- `src/registry/validate.mjs` - Defines the canonical mapping safety predicate used by the production gate.
- `tests/router.lifecycle.test.mjs` - Proves installer-owned activation configuration.
- `tests/router.registry-watcher.test.mjs` - Proves installed activation, real ambiguity rejection, malformed summary rejection, and recovery retry.

## Decisions Made

- Fresh installations with no active pointer use an empty read-only baseline and may bootstrap their first verified immutable version.
- Existing authority must complete healthy or successful recovery before reconciliation may map, verify, or activate.
- Malformed mapping output is treated as unsafe at the same boundary as explicit ambiguity.

## Deviations from Plan

### Auto-fixed Issues

- **[Rule 2 - Missing critical functionality]** Extended the watcher active reader during Task 1 so the newly configured `active_path` resolves the immutable registry referenced by `active.json` and safely handles a missing first-install pointer. Without this, installed controllers failed before reaching activation.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None. T-14-04-01 through T-14-04-03 are covered by shared-root configuration, canonical mapping rejection, and retryable recovery tests.

## Verification

- `node --test tests/router.lifecycle.test.mjs tests/router.registry-watcher.test.mjs` - passed.
- `node --test tests/router.registry-map.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs` - passed.
- `node --test tests/router.registry-map.test.mjs tests/router.registry-watcher.test.mjs tests/router.lifecycle.test.mjs tests/router.registry-activate.test.mjs` - 57 passed, 0 failed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 14-04 gaps are closed. Installed activation, canonical ambiguity enforcement, and retryable blocked recovery are ready for the remaining Phase 14 gap plans and independent verification.

## Self-Check: PASSED

- All four task commits exist on `main`.
- The summary file exists and the plan-wide focused suite passes with 57 tests and 0 failures.
- Unrelated planning and Graphify worktree changes were not staged or committed.

---
*Phase: 14-deterministic-mapping-activation-and-rollback*
*Completed: 2026-07-15*
