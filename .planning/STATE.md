---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Framework-Neutral Adaptive Routing
current_phase: 31
current_phase_name: runtime-tagging
status: executing
stopped_at: context exhaustion at 79% (2026-08-01)
last_updated: "2026-08-01T13:21:58.730Z"
last_activity: 2026-08-01
last_activity_desc: Phase 31 execution started
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 29
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-31)

**Core value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead and sub-100ms routing.
**Current focus:** Phase 31 — runtime-tagging

## Current Position

Phase: 31 (runtime-tagging) — EXECUTING
Plan: 1 of 3
Status: Executing Phase 31
Last activity: 2026-08-01 — Phase 31 execution started

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Previous milestone plans completed: 8 (v1.4, phases 27-29)
- Current milestone plans completed: 0
- Current milestone execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 30. Manifest Fingerprint + Watcher Narrowing | 0 | TBD | - |
| 31. Runtime Tagging | 0 | TBD | - |
| 32. Intent-First Routing | 0 | TBD | - |
| 33. Shadow-Log Observer | 0 | TBD | - |
| 34. Per-Install Auto-Calibration | 0 | TBD | - |
| 35. Release-Gate Cleanup | 0 | TBD | - |

**Recent Trend:**

- Last 5 plans: none (v1.5 not started)
- Trend: Not started

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 30-foundation-manifest-fingerprint-watcher-narrowing P2 | 12 | 2 tasks | 3 files |
| Phase 30 P3 | 14 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- [v1.5 roadmap]: Fingerprint epoch (Phase 30) ships first — it is the invalidation spine cache + calibration + resolve freshness all key off; watcher noise-narrowing fixes measured reconcile churn before any epoch feature amplifies it.
- [v1.5 roadmap]: Runtime tagging (Phase 31) precedes shadow-log and calibration — correlation needs the runtime tag; calibration needs the runtime split. Per-runtime resolve (Phase 32) and runtime tagging are independent but both need the fingerprint.
- [v1.5 roadmap]: Guard-hole closure rides with intent-first routing (Phase 32) and precedes resolve-list shipping — the schema-v4 migration and `routeTargetsExist` rewrite are inseparable from resolve lists; the fingerprint epoch makes resolve freshness safe.
- [v1.5 roadmap]: Shadow-log observer (Phase 33) ships the three-state schema + measure-only divergence report BEFORE any threshold derives; calibration (Phase 34) is deliberately last because it consumes the epoch, runtime split, resolved names, and outcomes.
- [v1.5 roadmap]: Release-gate cleanup (Phase 35) is final — it verifies the assembled system end-to-end, including cold-start defaults on a fresh account, closing the standing BLOCKER 2 from v1.3/v1.4.
- [v1.5 roadmap]: Kept shadow-log and auto-calibration as separate phases (not merged) — research's measure-only-first dependency boundary and the two distinct research flags support the split; granularity "standard" permits 6 phases.
- [Phase ?]: Watcher roots ignore sqlite/WAL + plugin-catalog caches via prefix-specific ignoredRelativePaths; bare 'plugins' prefix never used so installed_plugins.json stays the authoritative add/remove signal
- [Phase ?]: manifest_fingerprint excludes timestamps: computeCompositeEpoch hashes only name/marketplace/version/scope of installed plugins
- [Phase ?]: Calibration is epoch-keyed: fingerprint-matched calibration.json wins; mismatch/absent/corrupt -> mode-map defaults 0.591/0.291/0.191 (fail-open, never throws)
- [Phase ?]: Hardcoded startup threshold fallback bumped from 0.6/0.3/0.2 to the roadmap defaults 0.591/0.291/0.191 so the named defaults are the literal defaults
- [Phase ?]: Capability lifecycle (watcher -> rebuild -> coverage audit -> recompute -> re-calibrate) documented in docs/inventory-lifecycle.md and test-verified in the add direction (remove direction proven by 30-02)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 30 planning must pick the composite-epoch granularity (one global fingerprint vs separate map/manifest/weights epochs) and the exact hash inputs — research flag (see ROADMAP Phase 30).
- Phase 32 planning must define resolve-list per-runtime ordering + exact tie-handling/confidence-gap rule (near-tie → med), and whether forward-orphan audit semantics extend to resolve lists — research flag.
- Phase 33 planning must verify PostToolUse slash-command visibility (Skill|Agent|Task only?) and pass a coexistence review — research flag; Stop-hook transcript scan is the deferred fallback.
- Phase 34 planning must derive the exact threshold mapping formula (Wilson vs Beta/Jeffreys posterior mean; prior strength encoding shipped defaults) — research flag; overfit regression test is the guard.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Evolution | FUT-05 tune-weights.mjs (Wilson + decay, disabled-default) | v2 (needs n≥200) | v1.5 roadmap |
| Evolution | FUT-06 counterfactual shadow log + calibration regression gate | Partial — v1.5 ships capture (Phase 33); tuning rails v2 | v1.5 roadmap |
| Evolution | FUT-07 telemetry-driven signal_patterns proposals + escape-hatch metric | v2 | v1.5 roadmap |
| Advanced Routing | FUT-08 confidence-tier recalibration (isotonic/Platt) | v2 (needs ≥200) | v1.5 requirements |
| Advanced Routing | FUT-09 multi-intent / clarification triggers, boundary-aware substring matching | v2 | v1.5 requirements |
| Advanced Routing | FUT-10 per-entry calibration | v2 (needs n≥200) | v1.5 requirements |
| Advanced Routing | FUT-11 in-turn invocation tap | v2 (only if coexistence review passes) | v1.5 requirements |
| Release | BLOCKER 2 — live-install release verification (REL-08) | In scope — Phase 35 | v1.5 roadmap |
| Release | Orphaned watcher instances (REL-10) | In scope — Phase 35 | v1.5 roadmap |
| Release | router.safety-release live-env failures (REL-10) | In scope — Phase 35 | v1.5 roadmap |

## Session Continuity

Last session: 2026-08-01T13:21:58.720Z
Stopped at: context exhaustion at 79% (2026-08-01)
Resume file: None

## Operator Next Steps

- Review/approve the v1.5 roadmap, then start Phase 30 planning: `/gsd-plan-phase 30` (research-phase candidate — composite-epoch granularity).
