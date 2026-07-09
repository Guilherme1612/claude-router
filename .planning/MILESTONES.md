# Milestones

## v1.0 Claude Router MVP (Shipped: 2026-07-09)

**Phases completed:** 4 phases, 14 plans, 19 tasks

**Key accomplishments:**

- Installed a pure-stdlib global `UserPromptSubmit` router hook that fails open, respects explicit overrides, coexists with caveman, and keeps warm routing under the v1 latency target.
- Shipped the reviewed `mode-map.json` and confidence-tiered injection path for gsd workflows, skills, agents, MCP warnings, and ralph-loop guardrails.
- Added graphify-aware routing for codebase prompts, including graph context formatting, route+graph token caps, and graph mtime cache invalidation.
- Added telemetry-driven evolution: weight blending, outcome correlation, mutation proposals, calibration gates, status reporting, and bounded telemetry rotation.
- Reused `gsd-surface` as the authoritative surface/profile primitive and closed the cache invalidation advisory by folding surface profile mtime into the route cache key.

---
