---
phase: 26-coherent-publication-and-dual-runtime-release
plan: 05
subsystem: installer-lifecycle
tags: [dual-runtime, compatibility, installed-execution, ownership]
requires:
  - phase: 26-04
    provides: Complete-tuple activation and recovery
provides:
  - Manifest-backed Claude, Codex, and combined runtime compatibility matrix
  - Installed-byte routing evidence for command, skill, agent, workflow, MCP, and tool recommendations
affects: [release-verification, installer, runtime-activation]
tech-stack:
  added: []
  patterns: [owned-manifest evidence, installed-module execution, table-driven compatibility]
key-files:
  modified:
    - src/lifecycle/router-lifecycle.mjs
    - tests/router.phase26-dual-runtime.test.mjs
key-decisions:
  - "Keep compatibility evidence in the existing installer-owned manifest."
  - "Execute deployed orchestrator modules from isolated Claude and Codex roots instead of importing source modules."
requirements-completed: [REL-05, REL-06]
duration: 10min
completed: 2026-07-28
status: complete
---

# Phase 26 Plan 05: Dual-Runtime Lifecycle Compatibility Summary

**The existing installer now records and proves an 18-cell runtime/recommendation compatibility matrix using actual deployed Claude and Codex module bytes.**

## Performance

- **Duration:** 10 min
- **Completed:** 2026-07-28
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Recorded the three supported runtime profiles and six preserved recommendation kinds in the existing ownership manifest.
- Added table-driven execution of installed `orchestrator/select.mjs` bytes from isolated Claude-only, Codex-only, and combined roots.
- Verified the deployed dependency closure includes prompt routing, selection, tuple loading, contracts, and relationships.
- Re-ran the existing install, repair, upgrade, crash recovery, coexistence, and installed-controller lifecycle gates with unrelated-state preservation assertions.

## Task Commits

1. **Task 1 RED: Dual-runtime installed closure** - `ce808bb`
2. **Task 1 GREEN: Manifest runtime coverage** - `28fa67d`
3. **Task 2 RED: Installed six-kind route matrix** - `433c46c`
4. **Task 2 GREEN: Manifest route compatibility matrix** - `6f04e95`

## Deviations from Plan

### Reused Existing Lifecycle Coverage

`install-router.mjs` required no change: it already delegates production installation to `installRouter`, and the transitive deployed module closure was complete. Existing coexistence and autonomous lifecycle suites already cover repair, upgrade, recovery, rollback boundaries, and unrelated user-byte preservation.

## Verification

- `node --test --test-concurrency=1 tests/router.phase26-dual-runtime.test.mjs tests/router.installer-coexistence.test.mjs tests/router.autonomous-lifecycle.test.mjs`
- Result: 21 passed, 0 failed.

## Known Stubs

None.

## Security

- T-26-11: installed execution verifies manifest-owned deployed bytes.
- T-26-12: existing lifecycle matrix preserves unrelated user files byte-identically.

## Self-Check: PASSED

- All four task commits exist.
- Both modified files exist.
- The serial dual-runtime lifecycle gate passes.
