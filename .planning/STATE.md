---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: Framework-Neutral Adaptive Routing
current_phase: null
status: Awaiting next milestone
stopped_at: Milestone v1.5 complete; archive and tag closeout finished
last_updated: "2026-08-02T12:25:52.593Z"
last_activity: 2026-08-02
last_activity_desc: Milestone v1.5 completed and archived
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 27
  completed_plans: 27
  percent: 100
current_phase_name: "Milestone v1.5 complete"
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-02)

**Core value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead and sub-100ms routing.
**Current focus:** v1.5 milestone complete; define the next milestone with `gsd-new-milestone`

## Current Position

Phase: Milestone v1.5 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-08-02 — Milestone v1.5 completed and archived

## Performance Metrics

**Velocity:**

- Previous milestone plans completed: 8 (v1.4, phases 27-29)
- Current milestone plans completed: 27
- Current milestone execution time: autonomous closeout completed 2026-08-02

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 30. Manifest Fingerprint + Watcher Narrowing | 3 | 3 | complete |
| 31. Runtime Tagging | 3 | 3 | complete |
| 32. Intent-First Routing | 4 | 4 | complete |
| 32.1. Review Closure | 4 | 4 | complete |
| 33. Shadow-Log Observer | 3 | 3 | complete |
| 34. Per-Install Auto-Calibration | 3 | 3 | complete |
| 35. Per-Project Routing | 3 | 3 | complete |
| 36. Release-Gate Cleanup | 3 | 3 | complete |
| 37.1. Audit Gap Closure | 1 | 1 | complete |
| 31 | 3 | - | - |
| 32.1 | 4 | - | - |

**Recent Trend:**

- Last 5 plans: 33-03, 34-01, 34-02, 34-03, 36-03
- Trend: Complete

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 30-foundation-manifest-fingerprint-watcher-narrowing P2 | 12 | 2 tasks | 3 files |
| Phase 30 P3 | 14 | 2 tasks | 3 files |
| Phase 32 P01 | 25m | 2 tasks | 3 files |
| Phase 32 P02 | 25 | 3 tasks | 3 files |
| Phase 32-intent-first-routing-mode-map-schema-v4-guard-hole-closure P03 | 720 | 3 tasks | 7 files |
| Phase 32-intent-first-routing-mode-map-schema-v4-guard-hole-closure P04 | 35 | 3 tasks | 4 files |
| Phase 32.1 P01 | 8 | 2 tasks | 3 files |
| Phase 32.1 P03 | 10 | 3 tasks | 4 files |
| Phase 32.1 P02 | 10 | 3 tasks | 3 files |
| Phase 32.1 P04 | 2min | 2 tasks | 1 files |

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
- [Phase ?]: resolveSlashRoute(entry, manifest, opts?) is the future resolve-first helper; undefined-import is the RED state
- [Phase ?]: Cross-runtime manifest carries a per-runtime runtime_commands slice selected by ROUTER_RUNTIME
- [Phase ?]: resolveSlashRoute exported framework-neutral; guard hole closed at both snapshot sites; schema_version no longer makes slash routes intentional
- [Phase ?]: Resolve-aware audit closure at audit.mjs:142 (blanket schema_version pass removed); forward-orphan quarantine aligns audit and validateRouteTargets
- [Phase ?]: ROUTE-04 generic fallback uses a fixed constant string, never derived from entry id or candidates (anti-fabrication)
- [Phase ?]: ROUTE-05 tie-lint: near-tie within 0.05 (or rank tie) downgrades to med; absent resolve members quarantined; stdlib-only, framework-neutral
- [Phase 32.1]: Use a non-empty runtime_commands[RUNTIME] slice for command indexes, with flat commands fallback for pre-runtime and empty-slice manifests.
- [Phase 32.1]: Expose the active runtime on each built index for attribution without changing existing inventory set shapes.
- [Phase 32.1]: Near-tie violations always fail strict coverage; stale resolve members fail only when no active command candidate resolves the route.
- [Phase 32.1]: Resolvable routes retain absent optional members in quarantined_diagnostics while excluding them from forward_diagnostics and strict failure.
- [Phase 32.1]: The sandbox fixture maps both present commands through typed routes so clean strict cases isolate tie-lint behavior.
- [Phase 32.1]: Resolve slash routes from the raw manifest immediately before guards so runtime_commands[RUNTIME] controls emitted modes.
- [Phase 32.1]: Propagate resolver tier to emitted routes so near-ties cannot remain high-confidence or enter the high-tier cache path.
- [Phase 32.1]: Use stable weight-only sorting because the insertion-ordered candidate Map preserves authored mode and resolve-list order.
- [Phase 32.1]: Render at most one fixed generic native fallback line with no slash mode when high-tier resolution has no present candidate.
- [Phase 32.1]: Use the live hook in a stdlib subprocess with in-memory runtime fixtures and a temporary cache path to measure the real resolve-first route path without home-directory writes.
- [Phase 32.1]: Keep the pure resolveSlashRoute benchmark as a separately named helper-level perf gate alongside the end-to-end render gate.

### Pending Todos

None yet.

### Blockers/Concerns

- The verified active release tuple remains authoritative when the current recommendation-only candidate has no safe dispatch targets; no unsafe promotion is attempted.
- Calibration corpus carries two known low-tier misses; thresholds remain unchanged and sensitivity is recorded in Phase 36 evidence.

### Roadmap Evolution

- Phase 32.1 inserted after Phase 32: Phase-32 review closure: wire resolver into production hot path, runtime_commands parity on index path, tie-lint build gate, real hot-path perf test (URGENT)
- Phase 37 added: Close v1.5 audit gaps: live Codex, watcher lifecycle, strict release gate, requirements evidence
- Phase 37.1 inserted after Phase 37: Close v1.5 audit gaps: live Codex, watcher lifecycle, strict release gate, requirements evidence (URGENT)
- Phase 37 removed: empty placeholder phase was reconciled into the completed 37.1 audit closure

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
| Release | BLOCKER 2 — live-install release verification (REL-08) | Complete — Phase 37.1 | v1.5 roadmap |
| Release | Orphaned watcher instances (REL-10) | Complete — Phase 37.1 | v1.5 roadmap |
| Release | router.safety-release live-env failures (REL-10) | Complete — Phase 37.1 | v1.5 roadmap |

## Session Continuity

Last session: 2026-08-02T13:05:00+01:00
Stopped at: Milestone v1.5 complete; archive and tag closeout finished
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
