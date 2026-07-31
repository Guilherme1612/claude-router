---
phase: 28-coverage-audit-guard
plan: 01
subsystem: routing-coverage
tags: [node-test, manifest, coverage-audit, atomic-write]
requires:
  - phase: 27-mutation-safety-infrastructure
    provides: deterministic manifest builder and lifecycle deployment seams
provides:
  - deterministic typed manifest coverage audit
  - atomic coverage-report publication after manifest writes
  - dual-runtime audit module and baseline deployment
affects: [28-02, 29-mode-map-curation]
tech-stack:
  added: []
  patterns: [pure stdlib audit, category-plus-id identity, temp-file atomic rename]
key-files:
  created:
    - src/coverage/audit.mjs
    - coverage-baseline.json
    - tests/router.coverage-audit.test.mjs
  modified:
    - build-manifest.mjs
    - src/lifecycle/router-lifecycle.mjs
    - tests/router.build-manifest.test.mjs
    - tests/router.installer-coexistence.test.mjs
key-decisions:
  - "Keep the canonical baseline empty until a present capability requires an explicit policy acknowledgement."
  - "Use typed mode, skill, and agent references; route IDs never count as reverse coverage."
patterns-established:
  - "Coverage reports contain identities, classifications, diagnostics, counts, and fingerprints only."
requirements-completed: [COV-01, COV-02, COV-03]
coverage:
  - id: D1
    description: Deterministic typed coverage classification and orphan detection
    requirement: COV-02
    verification:
      - kind: unit
        ref: tests/router.coverage-audit.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: Atomic coverage report publication after manifest publication
    requirement: COV-01
    verification:
      - kind: integration
        ref: tests/router.build-manifest.test.mjs#COV-01
        status: pass
    human_judgment: false
  - id: D3
    description: Audit module and baseline deployment to Claude and Codex owned roots
    requirement: COV-03
    verification:
      - kind: integration
        ref: tests/router.installer-coexistence.test.mjs#install verb
        status: pass
    human_judgment: false
status: complete
duration: 10m
completed: 2026-07-29
---

# Phase 28 Plan 01: Coverage Audit Publication Summary

**Deterministic typed coverage auditing with baseline-safe orphan diagnostics and atomic report publication at the manifest build seam**

## Performance

- **Duration:** 10 min
- **Completed:** 2026-07-29T14:37:23Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added a pure stdlib audit that classifies mapped, expected, and gap records by category plus ID.
- Added baseline validation that cannot suppress forward failures or acknowledge stale/disallowed entries.
- Published byte-stable reports after manifest rename and deployed the audit inputs to both owned runtimes.

## Task Commits

1. **Task 1: Specify the typed audit and baseline contract** - `8c52c0d`
2. **Task 2: Implement deterministic typed coverage auditing** - `a44d9ee`
3. **Task 3 RED: Add coverage publication tests** - `100a0ff`
4. **Task 3 GREEN: Publish audit after atomic manifest write** - `0f5a674`

## Files Created/Modified

- `src/coverage/audit.mjs` - Pure classification, typed mapping, baseline validation, diagnostics, and fingerprints.
- `coverage-baseline.json` - Versioned explicit policy baseline.
- `build-manifest.mjs` - Post-manifest atomic report publication and fixture path overrides.
- `src/lifecycle/router-lifecycle.mjs` - Dual-runtime audit/baseline deployment and generated-report cleanup.
- `tests/router.coverage-audit.test.mjs` - Taxonomy, identity, baseline, privacy, ordering, and orphan tests.
- `tests/router.build-manifest.test.mjs` - Report path, malformed input, and byte stability tests.
- `tests/router.installer-coexistence.test.mjs` - Owned-root deployment and default-path onboarding assertions.

## Decisions Made

- The baseline starts with no entries because no policy-only acknowledgement was proven necessary by the scoped fixtures.
- One skill target maps same-named skill capabilities in distinct skill collections while preserving their category-specific records.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The initial privacy assertion matched safe capability values containing the word `prompt`; it was narrowed to assert the persisted record schema instead.

## Known Stubs

None.

## Verification

- `rtk node --test tests/router.coverage-audit.test.mjs tests/router.build-manifest.test.mjs` — 15/15 passed.
- `rtk node --test tests/router.coverage.test.mjs tests/router.route-targets.test.mjs tests/router.failopen.test.mjs` — 23/23 passed.
- Task 3 integration matrix — 30/30 passed.

## User Setup Required

None.

## Next Phase Readiness

- Plan 28-02 can add strict gating and fail-open freshness reminders over the canonical report.
- No blockers.

## Self-Check: PASSED

- All seven scoped source/test artifacts exist.
- Commits `8c52c0d`, `a44d9ee`, `100a0ff`, and `0f5a674` exist.

---
*Phase: 28-coverage-audit-guard*
*Completed: 2026-07-29*
