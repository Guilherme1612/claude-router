---
phase: 05-route-coverage-expansion
plan: 03
status: complete
subsystem: route-coverage
tags:
  - direct-agent
  - warn-routes
  - mode-map
  - injection
requires:
  - /Users/guilherme/.claude/router/mode-map.json
  - /Users/guilherme/.claude/hooks/router.mjs
provides:
  - tests/router.direct-agent-warn.test.mjs
affects:
  - COV-10
  - COV-11
  - COV-12
tech_stack:
  added:
    - node:test
    - node:assert/strict
  patterns:
    - direct invoke_kind route fixtures
    - mode-map warning propagation
    - mode-map-owned warn corpus entries
key_files:
  created:
    - tests/router.direct-agent-warn.test.mjs
  modified:
    - /Users/guilherme/.claude/hooks/router.mjs
    - router.calibrate.mjs
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
key_decisions:
  - Direct warn entries are scoreable as mode-map-owned corpus entries because they intentionally have no dispatch target in the manifest.
  - Route objects copy `mmEntry.warning` in both live routing and calibration dry-run so custom warning text reaches injection.
metrics:
  duration: ~12min
  completed_at: 2026-07-09T19:27:04Z
  tasks_completed: 2
  tests_added: 2
---

# Phase 05 Plan 03: Direct Agent/Warn Scoring and Warning Propagation Summary

Direct `agent` and `warn` route entries now have focused pipeline-level coverage and custom warning text propagation.

## What Changed

- Added `tests/router.direct-agent-warn.test.mjs` with direct route scoring fixtures that call `buildCorpus`, `bm25Score`, `normalize`, `confidenceTier`, `applyGuards`, `formatInjection`, and `tokenize`.
- Updated `/Users/guilherme/.claude/hooks/router.mjs` so direct warn mode-map entries can enter the scoring corpus and route objects carry `warning: mmEntry.warning || null`.
- Updated `router.calibrate.mjs` so calibration dry-run route objects carry the same `warning` field.
- Updated Phase 05 progress and marked COV-10 complete.

## Verification

```bash
node --test tests/router.direct-agent-warn.test.mjs
node --test tests/router.direct-agent-warn.test.mjs tests/router.inject.test.mjs tests/router.guards.test.mjs
```

Result: 41/41 tests passed in the combined regression run.

## Commits

| Task | Commit | Notes |
|------|--------|-------|
| Task 1: Add direct agent and warn scoring tests | 0e69be3 | Adds pipeline-level direct agent/warn tests and injection assertions. |
| Task 2: Propagate custom warning from mode-map entries | c1ad7c7 | Mirrors warning propagation in calibration and relies on live `buildCorpus` support for direct warn scoring. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Made direct warn entries scoreable**
- **Found during:** Task 2 implementation
- **Issue:** Direct `warn` mode-map entries intentionally have no `recommended_agents` target, so they could not be associated with a manifest entry by `buildCorpus()` and would not become first-class scored routes.
- **Fix:** Added mode-map-owned corpus entries for `invoke_kind: "warn"` entries in the live hook. This keeps missing-MCP warnings non-dispatching while allowing route scoring to select them directly.
- **Files modified:** `/Users/guilherme/.claude/hooks/router.mjs`, `tests/router.direct-agent-warn.test.mjs`
- **Commit:** c1ad7c7 for in-repo test alignment; global hook updated in place outside repo.

## Known Stubs

None.

## Threat Flags

None. The plan added tests and constant-time route-object field propagation. Warning text is copied as string data only; no eval, command construction, cache mutation, endpoint, auth path, file access path, or schema boundary was introduced.

## Self-Check: PASSED

- Found `tests/router.direct-agent-warn.test.mjs`.
- Found `router.calibrate.mjs`.
- Found `/Users/guilherme/.claude/hooks/router.mjs`.
- Found commit `0e69be3`.
- Found commit `c1ad7c7`.
