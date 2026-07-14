# Milestones

## v1.1 Inspectable Routing Control Layer (Shipped: 2026-07-14)

**Phases completed:** 6 phases, 23 plans, 30 tasks

**Key accomplishments:**

- 1. [Rule 1 - Bug] Avoided MCP/plugin skill name-collision false positive
- 1. [Rule 2 - Missing Critical Functionality] Made direct warn entries scoreable
- 1. [Rule 3 - Blocking Issue] Updated calibration harness count guard
- Node test contract for router inspect, preview, cache/graph diagnostics, and privacy-preserving explain-last behavior.
- Shared router inspectDecision helper with read-only dry-run defaults and JSON inspect/preview adapters.
- Inspect and preview CLI dispatch hardened with JSON usage errors, explicit dry-run mutation metadata, and deterministic preview mutation tests.
- `router explain-last` now reports the latest valid telemetry decision with structured route metadata and an explicit raw-prompt-unavailable privacy contract.
- Inspect/preview diagnostics now expose every INS-04 debugging branch, and calibration uses the shared dry-run helper through a narrow adapter.
- Phase 07 RED contract tests now lock the helper export and JSON CLI behavior for router health, routes, unmapped inventory, and coverage utilities.
- Runtime coverage and route-target diagnostics now come from exported router helpers instead of duplicated test-local logic.
- Routes and unmapped operator commands now expose stable read-only JSON for route health, ranked useful gaps, and next-fix guidance.
- `router doctor` and `router coverage` now provide read-only operator health JSON with category coverage, blocked runtime dependencies, metadata-only telemetry status, and concrete next fixes.
- Phase 07 health, routes, unmapped, and coverage utilities validated with focused tests, full suite, calibration, and hot-path performance gates.
- Executable CAL-01 through CAL-09 codebase-routing contract with explicit 5/7 target enforcement and structured miss taxonomy output
- Final Phase 08 validation confirmed expanded codebase routing at 8/8 while preserving original 10/10 calibration and hot-path performance.
- Failing-first Node test coverage now locks evolution visibility, proposal privacy, and read-only advisory behavior for EVO-01 through EVO-04.
- Read-only telemetry proposal mode now returns advisory mode-map suggestions from metadata without mutating router data or leaking prompt/downstream text.
- Node test release matrix proving router fail-open behavior, hot-path latency, no external classifier path, and operator CLI isolation.

---

## v1.0 Claude Router MVP (Shipped: 2026-07-09)

**Phases completed:** 4 phases, 14 plans, 19 tasks

**Key accomplishments:**

- Installed a pure-stdlib global `UserPromptSubmit` router hook that fails open, respects explicit overrides, coexists with caveman, and keeps warm routing under the v1 latency target.
- Shipped the reviewed `mode-map.json` and confidence-tiered injection path for gsd workflows, skills, agents, MCP warnings, and ralph-loop guardrails.
- Added graphify-aware routing for codebase prompts, including graph context formatting, route+graph token caps, and graph mtime cache invalidation.
- Added telemetry-driven evolution: weight blending, outcome correlation, mutation proposals, calibration gates, status reporting, and bounded telemetry rotation.
- Reused `gsd-surface` as the authoritative surface/profile primitive and closed the cache invalidation advisory by folding surface profile mtime into the route cache key.

---
