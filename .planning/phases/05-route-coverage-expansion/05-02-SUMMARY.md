---
phase: 05-route-coverage-expansion
plan: 02
subsystem: route-coverage
tags:
  - mode-map
  - coverage
  - direct-agent
  - warn-routes
key-files:
  - /Users/guilherme/.claude/router/mode-map.json
  - tests/router.coverage.test.mjs
  - tests/router.route-targets.test.mjs
metrics:
  tests: 10
  failures: 0
---

# Plan 05-02 Summary

## Objective

Expanded `/Users/guilherme/.claude/router/mode-map.json` with Phase 05 route clusters for debugging-adjacent test generation, review/audit, UI/design, GitHub/PR/CI, Graphify/codebase understanding, docs/spec/planning, safe direct agent dispatch, and missing-MCP warning flows.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | N/A | Updated the global router mode map outside the repo with manifest-backed slash/skill route clusters for COV-03 through COV-09. |
| Task 2 | N/A | Added direct `agent` entries for safe manifest agents and direct `warn` entries for missing-MCP agents without dispatch targets. |

The route data file is global runtime state under `~/.claude/router/`, not a git-tracked file in this throwaway planning checkout.

## Changes

- Added entries for `gsd-add-tests`, `gsd-code-review`, `gsd-audit-fix`, `gsd-ui-review`, `gsd-graphify`, `gsd-map-codebase`, `gsd-docs-update`, `gsd-spec-phase`, `gsd-plan-phase`, `review-pr`, `code-review`, `commit-push-pr`, and `design-taste-frontend`.
- Added safe direct agent entries for `gsd-codebase-mapper`, `gsd-code-reviewer`, and `gsd-debugger`.
- Added direct warning entries for blocked `gsd-planner`, `gsd-ui-researcher`, and `gsd-project-researcher` MCP dependencies.
- Preserved existing mode-map thresholds, `ralph_loop`, `graphify_heuristic`, and existing entries.

## Verification

```bash
node --test tests/router.coverage.test.mjs tests/router.route-targets.test.mjs
```

Result: 10/10 passed.

## Deviations

- The first executor attempt stopped at a sandbox checkpoint because `/Users/guilherme/.claude/router/mode-map.json` is outside the workspace write root.
- The mode-map write was completed with an approved escalated one-shot updater that validated every new skill/agent/command target against `claude-inventory-manifest.json` before writing.
- No local-only workaround was created.

## Self-Check

PASSED

