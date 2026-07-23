---
phase: 14-deterministic-mapping-activation-and-rollback
plan: "01"
subsystem: registry
tags: [mapping, deterministic, evidence, candidate-safety, calibration]
requires:
  - phase: 13-target-safety-hook-reconciliation-and-quarantine
    provides: eligible exact-candidate reconciliation and portable safety verdicts
provides:
  - Pure deterministic candidate mapping with non-overriding authority tiers
  - Canonical confidence and evidence reports for mapped, unmapped, and ambiguous subjects
  - Exact-candidate target safety and bounded advisory re-entry
  - Append-only Phase 14 calibration fixtures with preserved legacy thresholds
affects: [14-02, 14-03, registry-activation, router-control]
tech-stack:
  added: []
  patterns: [integer basis-point policy, canonical evidence ledger, exact-candidate join]
key-files:
  created:
    - src/registry/map.mjs
    - tests/router.registry-map.test.mjs
  modified:
    - calibration-tasks.json
    - router.calibrate.mjs
    - tests/router.calibration-graph.test.mjs
    - tests/router.calibration-evolution.test.mjs
    - tests/router.safety-release.test.mjs
key-decisions:
  - "Mapping authority is explicit metadata, stable identity, authoritative inheritance, lexical evidence, then bounded advisory re-entry."
  - "Every target is revalidated solely against the supplied candidate before a mapping can become dispatchable."
  - "Confidence uses integer basis points and requires both an absolute score and winner margin."
patterns-established:
  - "Mapping reports canonicalize and fingerprint policy, subjects, evidence, alternatives, requests, and summaries."
  - "Unresolved safe subjects remain active registry members and emit bounded advisory requests without gaining dispatch authority."
requirements-completed: [MAP-01]
coverage:
  - id: D1
    description: Deterministic non-overriding mapping policy produces explainable mapped, unmapped, or ambiguous results.
    requirement: MAP-01
    verification:
      - kind: unit
        ref: tests/router.registry-map.test.mjs#D-01 through D-09 mapping matrix
        status: pass
    human_judgment: false
  - id: D2
    description: Existing calibration baselines remain preserved while Phase 14 mapping cases are appended.
    requirement: MAP-01
    verification:
      - kind: integration
        ref: node router.calibrate.mjs --dry-run
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-07-15
status: complete
---

# Phase 14 Plan 01: Deterministic Mapping Boundary Summary

**A pure byte-stable mapper now resolves eligible registry subjects through strict authority tiers while preserving exact-candidate safety and advisory isolation.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-15T19:57:41Z
- **Completed:** 2026-07-15T20:02:57Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a schema-versioned, fingerprinted integer basis-point policy with explicit, identity, inheritance, lexical, and advisory tiers.
- Added canonical per-subject confidence, ordered evidence, alternatives, margin, resolver requests, summaries, and report fingerprints.
- Reapplied lifecycle, dispatchability, invocation, scope, permission, dependency, and collision checks against only the exact candidate records.
- Proved D-01 through D-09 behavior, purity, portability, advisory subordination, and collection permutation stability.
- Extended calibration append-only and taught legacy calibration gates to recognize the Phase 14 subset without changing established thresholds.

## Task Commits

1. **Task 1: Lock the mapping policy and failing deterministic evidence matrix** - `e4ffb1b` (test)
2. **Task 2: Implement exact-candidate non-overriding deterministic mapping** - `e7dc99b` (feat)

## Files Created/Modified

- `src/registry/map.mjs` - Pure deterministic policy, target-safety join, evidence ledger, confidence, advisory requests, and fingerprints.
- `tests/router.registry-map.test.mjs` - MAP-01 and D-01 through D-09 contract and permutation suite.
- `calibration-tasks.json` - Two append-only Phase 14 mapping fixtures.
- `router.calibrate.mjs` - Dedicated Phase 14 fixture classification that preserves legacy calibration counts.
- `tests/router.calibration-graph.test.mjs` - Legacy original-count compatibility with Phase 14 fixtures.
- `tests/router.calibration-evolution.test.mjs` - Legacy original-count compatibility with Phase 14 fixtures.
- `tests/router.safety-release.test.mjs` - Release calibration count recognizes the new append-only subset.

## Decisions Made

- Record-owned mapping metadata is the deterministic source for explicit subjects, identity subjects, route families, declared subjects, aliases, and triggers.
- Advisory evidence is capped below strong authority, reduced to portable provenance fields, and passed through the same exact-candidate safety check.
- Strong explicit or identity conflicts terminate as ambiguous; weak evidence cannot break them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated legacy calibration subset classification for append-only Phase 14 fixtures**
- **Found during:** Task 2 repository calibration verification
- **Issue:** The calibration harness classified every new non-codebase fixture as a Phase-1 original and rejected the required append-only entries.
- **Fix:** Added a dedicated `phase14_mapping` subset marker to the harness and affected regression assertions while preserving all legacy counts and the threshold of 21.
- **Files modified:** `router.calibrate.mjs`, `tests/router.calibration-graph.test.mjs`, `tests/router.calibration-evolution.test.mjs`, `tests/router.safety-release.test.mjs`
- **Verification:** Calibration reports 10/10 originals, 8/8 codebase fixtures, 2/3 evolution fixtures, and 30/32 overall against threshold 21.
- **Committed in:** `e7dc99b`

**Total deviations:** 1 auto-fixed (1 Rule 3)
**Impact on plan:** Required compatibility support only; no mapping authority or legacy threshold was weakened.

## Issues Encountered

- A broader safety-release run passed 70 tests before one unrelated live-runtime test was sandbox-blocked from writing `~/.claude/router/.evolve-trigger`. All plan-specified suites and calibration compatibility suites passed.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `node --test tests/router.registry-map.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-diff.test.mjs tests/router.route-targets.test.mjs` - 42 passed, 0 failed.
- `node --test tests/router.calibration-graph.test.mjs tests/router.calibration-evolution.test.mjs` - 15 passed, 0 failed.
- `node router.calibrate.mjs --dry-run` - 30/32 right, threshold 21; original baseline 10/10 preserved.
- `git diff --check` - passed.

## Next Phase Readiness

- Plan 14-02 can invoke `mapCandidateRegistry` immediately after eligible reconciliation and persist its canonical report inside immutable activation versions.
- No mapper or calibration blocker remains.

## Self-Check: PASSED

- Created files verified: `src/registry/map.mjs`, `tests/router.registry-map.test.mjs`, and this summary.
- Task commits verified: `e4ffb1b` and `e7dc99b`.
- No unexpected file deletions, unresolved stubs, or unplanned threat surface were introduced.

---
*Phase: 14-deterministic-mapping-activation-and-rollback*
*Completed: 2026-07-15*
