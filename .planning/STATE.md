---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Coverage Completeness & Auto-Skill Routing Improvement
status: Awaiting next milestone
stopped_at: Roadmap draft ready for review/approval
last_updated: "2026-07-31T15:57:45.793Z"
last_activity: 2026-07-31
last_activity_desc: Milestone v1.4 completed and archived
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 8
  completed_plans: 8
  percent: 100
current_phase: 29
current_phase_name: Mode-Map Curation and Signal Patterns Expansion
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-31)

**Core value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead and sub-100ms routing.
**Current focus:** Planning next milestone — v1.4 shipped and archived

## Current Position

Phase: Milestone v1.4 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-31 — Milestone v1.4 completed and archived

## Performance Metrics

**Velocity:**

- Previous milestone plans completed: 31 (v1.3)
- Current milestone plans completed: 0
- Current milestone execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 27. Mutation Safety Infrastructure | 0 | TBD | - |
| 28. Coverage Audit-Guard | 0 | TBD | - |
| 29. Mode-Map Curation and Signal Patterns Expansion | 0 | TBD | - |
| 27 | 2 | - | - |
| 28 | 2 | - | - |
| 29 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: none (v1.4 not started)
- Trend: Not started

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- [v1.4 roadmap]: Mutation safety infrastructure (Phase 27) ships before any mode-map/weights mutation — cache versioning and latency gate are prerequisites, not features.
- [v1.4 roadmap]: Coverage audit-guard (Phase 28) ships before curation — the audit's high_value_unmapped ranking tells Phase 29 which gaps to fill; curating blind risks filling the wrong gaps.
- [v1.4 roadmap]: Mode-map curation and signal_patterns expansion ship as one coupled phase (Phase 29) — new entries need patterns; patterns need collision lint + threshold re-tune on the expanded set.
- [v1.4 roadmap]: Evolution weight tuning (FUT-05..07) deferred — highest research flag; signal_patterns expansion is the safer primary lever. See REQUIREMENTS.md Future Requirements.
- [v1.4 roadmap]: Phase 29 carries a research flag — threshold re-derivation method (isotonic vs Platt vs manual) needs validation against the actual 10-task calibration set; consider `/gsd-plan-phase --research-phase 29`.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 27 planning must define the `routing_version` cache-key composition and the calibration-corpus latency regression harness shape.
- Phase 28 planning must design the `expected_*` taxonomy against the actual manifest field schema (scope, requires_mcp_not_in_manifest, hooks event-bound exclusion).
- Phase 29 planning must validate the threshold re-derivation method against the 10-task calibration set and design the collision lint over the full expanded entry set.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Evolution | FUT-05 tune-weights.mjs (Wilson + decay, disabled-default) | Future — v1.4+ | v1.4 roadmap (highest research flag) |
| Evolution | FUT-06 counterfactual shadow log + calibration regression gate | Future — v1.4+ | v1.4 roadmap |
| Evolution | FUT-07 telemetry-driven signal_patterns proposals + escape-hatch metric | Future — v1.4+ | v1.4 roadmap |
| Advanced Routing | FUT-08 confidence-tier recalibration (isotonic/Platt) | v2 | v1.4 requirements |
| Advanced Routing | FUT-09 multi-intent / clarification triggers, boundary-aware substring matching | v2 | v1.4 requirements |
| Release | BLOCKER 2 — live-install release verification stage (REL-05/06/07) | Open — v1.3.1 | v1.3 milestone audit (ship_with_deferred) |
| Release | Orphaned temp-dir watchers — kill duplicate watcher instances | Open — v1.3.1 | v1.3 milestone close |
| Release | router.safety-release live-env failures | Open — v1.3.1 | v1.3 milestone close |
| Activation | Confirm clean watcher reconcile reaches activation_status=activated | Open — v1.3.1 (user shell) | v1.3 milestone close |

## Session Continuity

Last session: 2026-07-29 — v1.4 roadmap created
Stopped at: Roadmap draft ready for review/approval
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
