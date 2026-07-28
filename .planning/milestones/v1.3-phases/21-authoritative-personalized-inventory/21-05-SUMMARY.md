---
phase: 21-authoritative-personalized-inventory
plan: 05
subsystem: cli
tags: [inventory, cli, privacy, provenance, semantic-availability]
requires:
  - phase: 21-04
    provides: last-complete inventory authority and four-state operational metadata
provides:
  - Read-only bounded inventory summary and stable-ID record inspection
  - Framework-neutral semantic-category availability grouped before runtime and scope
  - Strict privacy-safe projection with ANSI-free text and canonical JSON parity
affects: [phase-22-contracts, phase-24-health, phase-26-publication]
tech-stack:
  added: []
  patterns: [strict projection allowlist, category-first availability, side-effect-free inspection]
key-files:
  created:
    - tests/router.inventory-gaps.test.mjs
    - tests/router.inventory-security.test.mjs
  modified:
    - tests/router.control-cli.test.mjs
    - src/cli/router-control.mjs
key-decisions:
  - "Inventory inspection reads immutable active registry bytes and optional watcher state without starting discovery or reconciliation."
  - "Capability-authored values cross the CLI boundary only through a strict scalar, path, fingerprint, dependency, provenance, and diagnostic allowlist."
  - "Availability is grouped by semantic type before runtime and scope, with runtime names treated as labels rather than preference."
metrics:
  duration: 4min
  completed: 2026-07-26
status: complete
---

# Phase 21 Plan 05: Privacy-Safe Inventory Inspection Summary

**Bounded read-only inventory inspection now exposes exact operational state, safe stable-ID provenance, and framework-neutral semantic availability through matching plain-text and canonical JSON contracts.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-26T16:42:44Z
- **Completed:** 2026-07-26T16:46:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `router inventory` summary, `--id` record detail, and `--availability` comparison with bounded `--limit`/`--offset` continuation metadata.
- Preserved exact `current`, `reconciling`, `degraded`, and `failed` operational state plus canonical generation, reconciliation, trigger, pending-change, and affected-root fields.
- Added deterministic semantic-category/runtime/scope/stable-ID/path ordering without any default, preferred, primary, or baseline runtime.
- Added strict allowlisted projections for identity, provenance, invocation, fingerprints, dependency state, container/member evidence, continuity, and diagnostics.
- Prevented raw authored bodies, self-authorizing prose, secret/config values, absolute paths, traversal paths, and terminal control characters from reaching text or JSON output.
- Kept inspection side-effect-free by reading active immutable registry bytes and optional persisted/injected watcher state only.

## Task Commits

1. **Task 1: Specify semantic gaps, UI grammar, and adversarial inspection safety** - `3a63552` (test)
2. **Task 2: Implement privacy-safe inventory inspection and category-first gaps** - `c1f0dcc` (feat)

**Plan metadata:** skipped (`commit_docs` disabled; `.planning/` remains outside task commits)

## Files Created/Modified

- `tests/router.inventory-gaps.test.mjs` - Category-first grouping, deterministic filtering, and runtime-label permutation oracle.
- `tests/router.inventory-security.test.mjs` - Secret, authored-policy, absolute-path, traversal, symlink diagnostic, and terminal-control disclosure corpus.
- `tests/router.control-cli.test.mjs` - Exact field order, text/JSON parity, four-state copy, malformed-state failure, bounded detail, and no-mutation assertions.
- `src/cli/router-control.mjs` - Inventory parser/dispatcher, summary/detail/availability projections, strict sanitization, and inventory-specific text renderer.

## Decisions Made

- Existing `canonical` and `boundedResult` remain the command-envelope and continuation primitives; no dashboard, TUI, refresh command, or second UI subsystem was added.
- Legacy active records without the full Phase 21 metadata remain inspectable using safe `unknown`/`unavailable` fallbacks rather than failing open or exposing arbitrary source fields.
- Diagnostic messages are not projected because they may contain authored prose, absolute paths, or secrets; stable codes, logical roots, safe relative paths, and retained-baseline evidence are sufficient.
- A malformed or noncanonical operational state fails with `unsafe_inventory_projection` and no stack trace or local path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test oracle] Allowed the required safe parser version**
- **Found during:** Task 2 GREEN verification
- **Issue:** The initial disclosure assertion rejected the word `frontmatter` anywhere, including the required allowlisted parser version `frontmatter@fixture`.
- **Fix:** Narrowed the assertion to reject a raw `"frontmatter"` object key while retaining the parser-version contract.
- **Files modified:** `tests/router.inventory-security.test.mjs`
- **Verification:** Focused inspection suite passes 19/19.
- **Committed in:** `c1f0dcc`

**Total deviations:** 1 auto-fixed test-oracle bug. **Impact:** The privacy boundary remains strict while required adapter/parser provenance stays visible.

## Issues Encountered

- The broader Phase 21 regression slice passes 86/88. Two untouched `router.registry-schema.test.mjs` expectations fail against the already-present schema implementation: equal-name identity fallback and semantic invocation/preference fingerprint behavior.
- The full repository suite reports 741 passed, 21 failed, and 3 skipped out of 765 tests. The failures are in untouched autonomous lifecycle, live prompt hook, recovery/controller, ancestor watch, registry build/schema, release safety, install, and test-mode seam areas. None involve the four Plan 21-05 owned files; the focused Plan 21-05 suite passes completely.

## Known Stubs

None. Null and empty collection defaults are explicit representations of unavailable optional provenance, no pending operational work, or no matching inventory records.

## User Setup Required

None.

## Next Phase Readiness

Phase 22 can consume stable, privacy-safe inventory records and category availability without introducing ecosystem-default assumptions. Existing unrelated controller/schema/release regressions remain visible for their owning phases.

## Self-Check: PASSED

- Created test files and all four owned implementation/test artifacts exist.
- Task commits `3a63552` and `c1f0dcc` exist in git history.
- Focused inspection suite: 19/19 passed.
- Broader Phase 21 slice: 86/88 passed; both failures are in untouched schema files and documented above.
- Full repository suite: 741 passed, 21 failed, 3 skipped; all failures are outside Plan 21-05 ownership and documented above.

---
*Phase: 21-authoritative-personalized-inventory*
*Completed: 2026-07-26*
