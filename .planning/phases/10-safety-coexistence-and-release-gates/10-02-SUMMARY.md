---
phase: 10-safety-coexistence-and-release-gates
plan: 02
subsystem: router-safety
tags: [coexistence, missing-mcp, release-gates, diagnostics]
requirements_completed: [SAF-04, SAF-05, SAF-06, SAF-07]
completed: 2026-07-14
---

# Phase 10 Plan 02: Coexistence and Missing-MCP Safety Summary

Live hook coexistence and missing-MCP routing boundaries are now locked by focused release tests. The suite parses the deployed settings JSON, verifies all existing hook/plugin surfaces remain present, and proves blocked agents can be reported but never become dispatch targets.

## Tasks Completed

### Task 1: Add live hook coexistence release audit

- Added a live JSON settings audit covering the router `UserPromptSubmit` command, GSD hook entries, and enabled context-mode, caveman, and ralph-loop plugins.
- Added a live `router doctor --json` assertion for installed-hook detection.
- Fixed the diagnostic-only hook path detector to use `fileURLToPath(import.meta.url)` instead of applying `pathToFileURL()` to an already-formed URL.
- Forced the existing live routing smoke fixture through the documented freshness seam so elapsed wall time cannot turn a route assertion into a stale-manifest reminder assertion.
- Preserved live settings without deletion or rewrite.

Commit: `5293e0c`

### Task 2: Lock missing-MCP warn and diagnostic-only behavior

- Added aggregate release coverage proving every doctor-reported missing-MCP agent has `classification: blocked_missing_mcp` and `routeability: blocked`.
- Proved blocked agents are absent from all live `agent` route targets.
- Proved live `warn` routes carry no recommended agents and no `Dispatch agent` wording.
- Reused the existing direct warn formatter and route-target validation contracts for no slash instruction, no dispatch text, and rejected blocked targets.

Commit: `385de26`

## Verification

- Task 1 gate: `node --test tests/router.coexistence.test.mjs tests/router.settings-diff.test.mjs tests/router.inject.test.mjs tests/router.safety-release.test.mjs` — 44/44 passed.
- Task 2 gate: `node --test tests/router.direct-agent-warn.test.mjs tests/router.route-targets.test.mjs tests/router.health.test.mjs tests/router.safety-release.test.mjs` — 27/27 passed.
- Combined release gate across all seven files — 62/62 passed.
- Live doctor evidence after fix: `hook.exists=true`, `hook.status=ok`, 8 blocked agents, all with `routeability=blocked`.
- Ralph-loop safeguards remain covered by injection tests requiring a real task and verbatim completion promise.
- Router/caveman sentinel lexical distinctness remains covered by coexistence tests.

## Deviations from Plan

### [Rule 1 - Bug] Correct live hook diagnostic false negative

- Found during: Task 1
- Issue: `diagnoseRouterState()` called `pathToFileURL(import.meta.url).pathname`, converting an existing file URL as though it were a filesystem path and reporting the deployed hook as missing.
- Fix: Resolve the module filename with `fileURLToPath(import.meta.url)`.
- Files modified: `/Users/guilherme/.claude/hooks/router.mjs`, `tests/router.safety-release.test.mjs`
- Verification: Live doctor reports the hook present and the focused coexistence gate passes.
- Commit: Runtime file is deployed outside the throwaway planning repository; test contract committed in `5293e0c`.

### [Rule 1 - Bug] Stabilize live smoke routing against legitimate freshness aging

- Found during: Task 1 verification
- Issue: The pre-existing smoke test expected a routed sentinel but the live manifest had legitimately crossed the stale threshold, producing the documented stale reminder instead.
- Fix: Set `ROUTER_TEST_FRESHNESS=fresh` only in the test subprocess, using the existing deterministic test seam.
- Files modified: `tests/router.settings-diff.test.mjs`
- Verification: The live routing/caveman smoke tests pass without changing production freshness behavior.
- Commit: `5293e0c`

**Total deviations:** 2 auto-fixed bugs. **Impact:** Diagnostic and test determinism only; no routing channel, settings registration, or dispatch behavior changed.

## Files Modified

- `tests/router.safety-release.test.mjs` — live coexistence, hook health, and blocked-agent release assertions.
- `tests/router.settings-diff.test.mjs` — deterministic freshness for live route smoke tests.
- `/Users/guilherme/.claude/hooks/router.mjs` — correct diagnostic module-path conversion.

## Self-Check: PASSED

- All declared test artifacts exist.
- Both task commits exist in git history.
- All task acceptance criteria and plan-level verification commands pass.
- SAF-04, SAF-05, SAF-06, and SAF-07 have direct automated evidence.
