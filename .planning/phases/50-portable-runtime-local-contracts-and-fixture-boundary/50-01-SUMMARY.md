---
phase: 50-portable-runtime-local-contracts-and-fixture-boundary
plan: 01
subsystem: testing
tags: [node-test, runtime-adapters, fixtures, portability, privacy]
requires:
  - phase: 49-runtime-proof-release-and-lifecycle-integrity
    provides: Claude and Codex runtime-local adapter discovery
provides:
  - Four anonymous declarative Claude/Codex inventory scenarios
  - Validated temporary-root inventory materializer with idempotent cleanup
  - Portable explicit-root discovery, privacy, and asymmetric parity tests
affects: [50-02, semantic-routing-evaluation, runtime-parity]
tech-stack:
  added: []
  patterns: [declarative runtime fixtures, explicit-root adapter tests, symbolic provenance assertions]
key-files:
  created:
    - tests/fixtures/v1.8/empty-claude.json
    - tests/fixtures/v1.8/minimal-codex.json
    - tests/fixtures/v1.8/asymmetric-runtimes.json
    - tests/fixtures/v1.8/conflicting-invalid.json
    - tests/router.v18-contracts.test.mjs
  modified:
    - tests/helpers/inventory-fixture.mjs
key-decisions:
  - "Represent workflow-shaped inventory through an accepted skill layout plus an explicit anonymous fixture-kind marker."
  - "Validate every scenario path and content value before creating its temporary parent."
patterns-established:
  - "Portable scenarios: runtime-relative files only; project files materialize beneath one shared synthetic project root."
  - "Runtime parity: assert each adapter inventory independently instead of requiring matching counts."
requirements-completed: [CVRG-01, CVRG-05, CVRG-06]
coverage:
  - id: D1
    description: Four anonymous scenarios cover empty, minimal, renamed, asymmetric, conflicting, invalid, stale, project-scoped, plugin-heavy, and unknown-future inventories.
    requirement: CVRG-06
    verification:
      - kind: unit
        ref: "rtk node -e fixture JSON parse and privacy scan"
        status: pass
    human_judgment: false
  - id: D2
    description: A validated materializer creates isolated Claude, Codex, and optional project roots and removes their common parent idempotently.
    requirement: CVRG-01
    verification:
      - kind: integration
        ref: "tests/router.v18-contracts.test.mjs#v1.8 scenario materializer rejects escaping paths and cleans one temporary parent"
        status: pass
    human_judgment: false
  - id: D3
    description: Explicit-root adapter tests prove runtime-local discovery, portable provenance, privacy, and independent asymmetric inventories.
    requirement: CVRG-05
    verification:
      - kind: integration
        ref: "tests/router.v18-contracts.test.mjs#v1.8 scenarios discover runtime-local inventories without outside or live-home fallthrough"
        status: pass
      - kind: integration
        ref: "rtk node --test tests/router.v18-contracts.test.mjs tests/router.registry-build.test.mjs"
        status: pass
    human_judgment: false
duration: 5 min
completed: 2026-08-09
status: complete
---

# Phase 50 Plan 01: Portable Runtime-Local Contracts and Fixture Boundary Summary

**Anonymous Claude/Codex inventory scenarios now materialize into validated temporary roots and prove explicit runtime-local discovery without live-home leakage or equal-count assumptions.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-09T13:33:13Z
- **Completed:** 2026-08-09T13:38:03Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added four anonymous JSON inventory scenarios spanning all locked fixture shapes and six capability kinds.
- Extended the existing fixture helper with pre-write trust-boundary validation, one temporary parent, explicit runtime/project roots, and idempotent cleanup.
- Added runtime-local contract tests for traversal rejection, poisoned outside inventory exclusion, portable provenance, privacy, stale/future visibility, and asymmetric runtime assertions.

## Task Commits

1. **Task 1: Add anonymous declarative runtime inventory scenarios** - `e6ea613` (test)
2. **Task 2 RED: Add failing runtime-local contract tests** - `b9e5ae4` (test)
3. **Task 2 GREEN: Materialize isolated roots and prove runtime-local discovery** - `dde925b` (feat)

**Plan metadata:** skipped (`commit_docs` disabled)

## Files Created/Modified

- `tests/fixtures/v1.8/*.json` - Anonymous portable inventory declarations.
- `tests/helpers/inventory-fixture.mjs` - Validated temporary-root materializer.
- `tests/router.v18-contracts.test.mjs` - Runtime-local discovery, privacy, and provenance contracts.

## Decisions Made

- Reused accepted skill layouts for workflow-shaped fixtures and carried an explicit `fixture_kind` marker, avoiding an adapter or schema change reserved for Plan 50-02.
- Validated the entire scenario before calling `mkdtemp`, so invalid input cannot leave a partial fixture tree.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first GREEN run exposed an assertion coupled to adapter sort order; the test now compares independently sorted runtime names.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- Portable fixture and discovery boundaries are ready for Plan 50-02 contract/classification source changes.
- No Plan 50-02 production source was modified in this wave.

## Self-Check: PASSED

- All six created/modified implementation artifacts and this summary exist.
- Task commits `e6ea613`, `b9e5ae4`, and `dde925b` are present in git history.

---
*Phase: 50-portable-runtime-local-contracts-and-fixture-boundary*
*Completed: 2026-08-09*
