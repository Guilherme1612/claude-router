# Roadmap: Claude Router

**Project:** Claude Router — global `~/.claude` always-on prompt-routing framework
**Core Value:** Every user prompt routed to the right workflow mode + skills + agents automatically, in <100ms with no external API call.

## Milestones

- ✅ **v1.0 Claude Router MVP** — Phases 1-4 (shipped 2026-07-09). Full archive: [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ◆ **v1.1 Inspectable Routing Control Layer** — Phases 5-10 (planned 2026-07-09). Focus: route coverage, operator visibility, codebase calibration, health reporting, and telemetry proposal visibility.

## Phases

<details>
<summary>✅ v1.0 Claude Router MVP (Phases 1-4) — SHIPPED 2026-07-09</summary>

- [x] Phase 1: Router Core (closed loop + mode-map + calibration gate) — 6/6 plans complete
- [x] Phase 2: Graphify Integration — 3/3 plans complete
- [x] Phase 3: Evolution — 3/3 plans complete
- [x] Phase 4: Ancestor Reuse — 2/2 plans complete

</details>

### v1.1 Inspectable Routing Control Layer

**Goal:** Turn the v1 router from a working narrow auto-router into an inspectable, higher-coverage routing control layer that can explain what will route, why it routed, what is missing, and what should be fixed next.

#### Phase 5: Route Coverage Expansion

**Goal:** Audit the manifest against `mode-map.json` and add high-value route coverage across missing clusters, including direct `agent` and `warn` entries.

**Requirements:** COV-01, COV-02, COV-03, COV-04, COV-05, COV-06, COV-07, COV-08, COV-09, COV-10, COV-11, COV-12

**Success criteria:**
1. Inventory audit covers skills, plugin skills, agents, commands, hooks, and MCP servers.
2. Coverage report identifies high-value unmapped inventory before and after mode-map changes.
3. New route clusters cover debugging, tests, review/audit, UI/design, GitHub/PR/CI, Graphify/codebase, docs/spec/planning, agent dispatch, and missing-MCP warnings.
4. `agent` and `warn` route entries are tested directly, not only inferred through slash or skill routes.

**Plans:** 4 plans

Plans:
- [x] 05-01-PLAN.md — Inventory coverage audit and target validation tests.
- [ ] 05-02-PLAN.md — Data-first mode-map route cluster expansion.
- [ ] 05-03-PLAN.md — Direct agent/warn scoring and warning propagation.
- [ ] 05-04-PLAN.md — Calibration fixtures and regression gates.

#### Phase 6: Inspect and Preview Commands

**Goal:** Add prompt-level inspection tools that explain route scoring, guard decisions, cache behavior, graphify status, injected context, and pass-through reasons without mutating hot-path state.

**Requirements:** INS-01, INS-02, INS-03, INS-04

**Success criteria:**
1. `router inspect "<prompt>"` reports normalized prompt, candidates, scores, margin, selected tier, selected route, guards, cache status, graphify status, final injected context, and pass-through reason.
2. `router preview "<prompt>"` performs a dry run without cache or telemetry mutation.
3. `router explain-last` reconstructs the latest telemetry decision without exposing raw prompt text.
4. Inspect output is covered by focused tests for hits, misses, guard demotions, cache effects, and graphify decisions.

#### Phase 7: Health, Routes, Unmapped, and Coverage Utilities

**Goal:** Add operator health and inventory commands that make loaded, missing, stale, blocked, invalid, and unmapped router state visible in one pass.

**Requirements:** HLT-01, HLT-02, HLT-03, HLT-04, HLT-05

**Success criteria:**
1. `router doctor` reports manifest freshness, route coverage, high-value unmapped inventory, missing MCP servers, blocked agents, stale route targets, hook status, cache/telemetry/weights status, and last evolution status.
2. `router routes` lists routeable entries with examples.
3. `router unmapped` lists useful inventory that lacks mode-map coverage.
4. `router coverage` summarizes routeable versus discovered inventory by category and prints next-fix recommendations.

#### Phase 8: Codebase Routing Calibration

**Goal:** Treat calibration misses as first-class work and improve codebase-task routing for practical developer prompts while preserving original core fixture performance.

**Requirements:** CAL-01, CAL-02, CAL-03, CAL-04, CAL-05, CAL-06, CAL-07, CAL-08, CAL-09

**Success criteria:**
1. Calibration fixtures cover refactor, bugfix, tests, changed-code review, data-flow tracing, architecture explanation, and implementation lookup prompts.
2. Codebase calibration improves materially from the current 2/5 baseline.
3. Original core calibration fixtures remain 10/10.
4. Calibration failures produce actionable fixture, scoring, or mode-map follow-up rather than opaque pass/fail output.

#### Phase 9: Telemetry Evolution Visibility

**Goal:** Make evolution state explainable and add advisory proposal output for telemetry misses without automatically applying route mutations.

**Requirements:** EVO-01, EVO-02, EVO-03, EVO-04

**Success criteria:**
1. The reason `weight_applied` is effectively 0 is visible in doctor or evolution status output.
2. Inspect/doctor surfaces relevant evolution output and last-run status.
3. Proposal mode summarizes recent telemetry misses and suggests mode-map changes without mutating the mode map.
4. Proposal output preserves telemetry privacy constraints.

#### Phase 10: Safety, Coexistence, and Release Gates

**Goal:** Verify the expanded router control layer preserves fail-open, latency, coexistence, privacy, missing-MCP safety, and calibration gates before v1.1 is considered shipped.

**Requirements:** SAF-01, SAF-02, SAF-03, SAF-04, SAF-05, SAF-06, SAF-07, SAF-08

**Success criteria:**
1. Hot-path tests prove fail-open behavior and <100ms warm routing remain intact.
2. No per-prompt external classifier is introduced.
3. Missing-MCP agents are warned or diagnosed but not auto-dispatched.
4. Existing hooks and coexistence surfaces remain functional: caveman, GSD hooks, context-mode hooks, and ralph-loop.
5. All new commands and routing behaviors have focused tests, all existing tests pass, original calibration stays 10/10, and expanded codebase calibration improves materially.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Router Core | v1.0 | 6/6 | Complete | 2026-07-08 |
| 2. Graphify Integration | v1.0 | 3/3 | Complete | 2026-07-08 |
| 3. Evolution | v1.0 | 3/3 | Complete | 2026-07-09 |
| 4. Ancestor Reuse | v1.0 | 2/2 | Complete | 2026-07-09 |
| 5. Route Coverage Expansion | v1.1 | 1/4 | Executing | — |
| 6. Inspect and Preview Commands | v1.1 | 0/? | Planned | — |
| 7. Health, Routes, Unmapped, and Coverage Utilities | v1.1 | 0/? | Planned | — |
| 8. Codebase Routing Calibration | v1.1 | 0/? | Planned | — |
| 9. Telemetry Evolution Visibility | v1.1 | 0/? | Planned | — |
| 10. Safety, Coexistence, and Release Gates | v1.1 | 0/? | Planned | — |

---

*Roadmap updated after starting v1.1 on 2026-07-09.*
