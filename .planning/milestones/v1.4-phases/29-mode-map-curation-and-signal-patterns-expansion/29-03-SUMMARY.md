---
phase: 29-mode-map-curation-and-signal-patterns-expansion
plan: 03
subsystem: routing
tags: [mode-map, bm25, node-test, synthetic-manifest, route-safety]
requires:
  - phase: 29-mode-map-curation-and-signal-patterns-expansion
    provides: shared schema-v3 pattern normalization, collision lint, and injected inspection fixtures
provides:
  - eight implicit lifecycle skill routes
  - ten implicit design skill routes
  - portable 18-target routing and missing-MCP warning-only evidence
affects: [29-04, threshold-calibration, global-router]
tech-stack:
  added: []
  patterns: [output-anchored contains signals, six-pattern cap, fixture-owned typed targets]
key-files:
  created: []
  modified:
    - /Users/guilherme/.claude/router/mode-map.json
    - tests/router.mode-map-curation.test.mjs
    - tests/router.route-targets.test.mjs
key-decisions:
  - "Use one typed skill route for each of the 18 enumerated targets; do not add commands, agents, or another routing layer."
  - "Remove the generated skill-name-only route and make every remaining pattern unique, so no collision metadata is needed."
patterns-established:
  - "Curated route evidence names the requested artifact or state transition and stays within one to six contains patterns."
  - "Portable route tests use production map entries with neutral manifest descriptions."
requirements-completed: [MAP-01, MAP-02, MAP-03, SIG-01, SIG-03]
coverage:
  - id: D1
    description: "Eight lifecycle intents select their typed skill targets without sibling collisions."
    requirement: MAP-01
    verification:
      - kind: integration
        ref: "tests/router.mode-map-curation.test.mjs#lifecycle outcome prompts and hard negatives"
        status: pass
    human_judgment: false
  - id: D2
    description: "Ten design intents select distinct typed skill targets with no undeclared canonical collision."
    requirement: MAP-02
    verification:
      - kind: integration
        ref: "tests/router.mode-map-curation.test.mjs#design outcome prompts, hard negatives, and collision lint"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 18 routes remain portable across neutral and live inventories while missing-MCP agents stay warning-only."
    requirement: MAP-03
    verification:
      - kind: integration
        ref: "tests/router.route-targets.test.mjs#missing-MCP agent remains warning-only despite strong prompt overlap"
        status: pass
    human_judgment: false
duration: 5min
completed: 2026-07-29
status: complete
---

# Phase 29 Plan 03: Curated Lifecycle and Design Routes Summary

**Schema-v3 mode-map with 18 portable lifecycle/design skill routes, unique output-anchored evidence, and warning-only missing-MCP safety**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-29T15:59:57Z
- **Completed:** 2026-07-29T16:05:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Curated exactly eight lifecycle and ten design skill routes from implicit outcome language.
- Pruned the full installed map to at most six unique contains patterns per entry and removed the generated skill-name-only route.
- Proved all 18 production entries against a neutral synthetic inventory and kept strongly overlapping missing-MCP agents out of candidates and dispatch targets.

## Task Commits

1. **Task 1: Curate lifecycle routes and prune the existing map** - `ac5dc1f` (test), `836d4bd` (feat)
2. **Task 2: Curate design routes and declare the real collision** - `f87e854` (test), `3ac8315` (feat)
3. **Task 3: Validate live and synthetic target safety** - `fbbbda4` (test)

## Files Created/Modified

- `/Users/guilherme/.claude/router/mode-map.json` - Installed schema-v3 map with 46 capped entries and exactly 18 new curated routes.
- `tests/router.mode-map-curation.test.mjs` - Production-entry positives, family hard negatives, cap/collision checks, and neutral 18-target fixture.
- `tests/router.route-targets.test.mjs` - Live target validation plus adversarial missing-MCP overlap evidence.

## Decisions Made

- Used strings for all contains patterns because the curated map has no genuine duplicate requiring a collision group.
- Kept the installed map as the production data source and injected only neutral manifest objects, so fixture descriptions cannot supply routing evidence.
- Preserved the existing calibration corpus while replacing broad and skill-name signals with the smallest output-specific set that retained behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial pruning weakened five legacy calibration fixtures. The capped pattern sets were tightened around their existing artifact/outcome language; the final calibration returned to 10/10 original fixtures and 30/32 overall.
- The installed mode map is global runtime data outside the repository, so its verified change is not represented by a Git blob; repository tests and this summary record its contract.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 29-04 can re-derive thresholds on the expanded route corpus.
- Pre-recalibration evidence is green at 30/32 with the existing thresholds; no threshold was changed here.

## Self-Check: PASSED

- Installed map and both modified test files exist.
- Task commits `ac5dc1f`, `836d4bd`, `f87e854`, `3ac8315`, and `fbbbda4` exist.
- Full plan verification passes 37/37 tests and calibration exits 0.

---
*Phase: 29-mode-map-curation-and-signal-patterns-expansion*
*Completed: 2026-07-29*
