---
phase: 11-canonical-registry-and-runtime-adapters
plan: "02"
subsystem: runtime-adapters
tags: [node, esm, claude, codex, filesystem, tdd]
requires:
  - 11-01 canonical schema and identity
provides:
  - Explicit-root Claude capability discovery and normalization
  - Explicit-root Codex capability discovery and normalization
  - Portable provenance, native invocation, and deterministic diagnostics
affects: [phase-11-registry-build, installer]
tech-stack:
  added: []
  patterns: [standard-library-only ESM, realpath containment before reads, diagnostic partial observations]
key-files:
  created: [src/adapters/claude.mjs, src/adapters/codex.mjs, tests/router.adapters.test.mjs]
  modified: []
key-decisions:
  - "Adapter discovery requires supplied runtime roots and never falls back to ambient homes."
  - "Project provenance uses caller-provided or logical scope IDs while absolute paths remain outside portable observations."
requirements-completed: [ADP-01, ADP-02]
duration: 12min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 02: Claude and Codex Runtime Adapters Summary

**Deterministic explicit-root runtime inventory with realpath containment, portable provenance, native invocation preservation, and complete malformed-artifact diagnostics**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-07-14
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added identical four-operation Claude and Codex adapter contracts for discovery, parsing, normalization, and invocation compilation.
- Covered Claude skills, plugin skills, agents-store skills, agents, commands, hooks, bindings, dependencies, and project inventory.
- Covered Codex skills, plugins, agents, hooks, config metadata, MCP, tools, models, permissions, dependencies, and project inventory.
- Preserved malformed recognizable artifacts as non-dispatchable observations, rejected unsupported schemas diagnostically, and blocked declared unavailable dependencies.
- Prevented symlink escapes before artifact reads and emitted only logical roots and relative paths in canonical observations.

## Task Commits

1. **Task 1: Specify complete isolated runtime adapter matrices** - `effc9d1` (test)
2. **Task 2: Implement Claude and Codex native adapters** - `bae40d5` (feat)

## Files Created/Modified

- `tests/router.adapters.test.mjs` - Isolated Claude/Codex category, containment, diagnostic, invocation, and determinism contract.
- `src/adapters/claude.mjs` - Claude adapter plus shared standard-library adapter mechanics.
- `src/adapters/codex.mjs` - Codex category mapping and explicit-root discovery surface.

## Decisions Made

- JSON descriptors with schema version 1 are the inert native record boundary; unsupported categories/formats remain build diagnostics.
- Project scope identifiers are logical and portable, with an optional explicit `scopeId` for repository/worktree identity.
- Missing optional descriptions and undeclared dependencies remain explicitly unknown instead of being inferred.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- macOS temporary paths may resolve from `/var` to `/private/var`; containment and category inference now use the canonical realpath consistently.

## TDD Gate Compliance

- RED: `effc9d1` failed because both adapter modules were absent.
- GREEN: `bae40d5` implemented both adapter contracts.
- Focused verification: 16 tests passed.
- Full repository verification: 405 tests passed.

## Known Stubs

None. Empty arrays in the adapter implementation are bounded traversal/diagnostic accumulators, not user-facing placeholders.

## User Setup Required

None - no packages, services, environment variables, or runtime mutations were added.

## Next Phase Readiness

Plan 11-03 can combine both adapter outputs into the deterministic candidate registry and installer lifecycle.

## Self-Check: PASSED

- All three planned files exist.
- RED and GREEN commits are present in git history.
- Focused and full-suite verification passed.

---
*Phase: 11-canonical-registry-and-runtime-adapters*
*Completed: 2026-07-14*
