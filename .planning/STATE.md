---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Adaptive Semantic Routing and Continuity
status: planning
last_updated: "2026-08-09T12:18:13.654Z"
last_activity: 2026-08-09
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-09)

**Core value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.
**Current focus:** Phase 50 — Portable Runtime-Local Contracts and Fixture Boundary

## Current Position

Phase: 50 of 55 (Portable Runtime-Local Contracts and Fixture Boundary)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-08-09 — v1.8 roadmap created with 43/43 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Previous milestone: v1.7 completed 9 plans across Phases 47-49
- Current milestone: 0 plans completed across 6 planned phases

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 50. Portable Runtime-Local Contracts and Fixture Boundary | TBD | Not started |
| 51. Structured Intent, Generic Workflows, and Semantic Retrieval | TBD | Not started |
| 52. Least-Sufficient Composition and Single-Path Semantic Cutover | TBD | Not started |
| 53. Scoped Preferences and Truthful Startup Continuity | TBD | Not started |
| 54. Independent Evaluation and Hot-Path Budgets | TBD | Not started |
| 55. Installer, Native Parity, and Release Truth | TBD | Not started |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- [v1.8 roadmap]: Establish portable runtime-local typed contracts and anonymous fixture boundaries before semantic retrieval.
- [v1.8 roadmap]: Resolve generic workflow roles before selecting the least sufficient compatible capability set through one production path.
- [v1.8 roadmap]: Freeze independent production-path budgets before installer migration and installed-runtime release proof.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 51 retrieval thresholds and held-out paraphrase families require calibration without maintainer-prompt leakage.
- Phase 52 composition ceilings must be fixed and measured; use bounded enumeration unless evidence requires more.
- Phase 53 must define exact project/worktree identity, staleness, acknowledgement, and host startup semantics.
- Phase 54 numeric budgets must come from matched v1.7 production-path baselines, not roadmap estimates.
- Phase 55 still requires actual installed Claude and Codex native smoke evidence after isolated lifecycle tests.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Architecture | Database, daemon, embeddings, second watcher/router, or prompt-time classifier | Out of scope | v1.8 design |
| Runtimes | Additional runtimes beyond Claude and Codex | Future | v1.8 design |
| Capabilities | Automatic third-party capability installation | Out of scope | v1.8 design |
| Delivery | External publication or deployment automation | Owner-controlled | v1.8 design |

## Session Continuity

Last session: 2026-08-09 Europe/Lisbon
Stopped at: v1.8 roadmap created; Phase 50 is ready for planning
Resume file: None

## Operator Next Steps

- Plan Phase 50 with `$gsd-plan-phase 50`
