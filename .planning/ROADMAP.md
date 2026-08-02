# Roadmap: Claude Router

## Milestones

- ✅ **[v1.0 Claude Router MVP](milestones/v1.0-ROADMAP.md)** — Phases 1-4 (shipped 2026-07-09)
- ✅ **[v1.1 Inspectable Routing Control Layer](milestones/v1.1-ROADMAP.md)** — Phases 5-10 (shipped 2026-07-14)
- ✅ **[v1.2 Autonomous Dual-Runtime Control Plane](milestones/v1.2-ROADMAP.md)** — Phases 11-20 (shipped 2026-07-23)
- ✅ **[v1.3 Adaptive Local Capability Steward and Intent-Native Routing](milestones/v1.3-ROADMAP.md)** — Phases 21-26 (shipped 2026-07-28, ship_with_deferred)
- ✅ **[v1.4 Coverage Completeness & Auto-Skill Routing Improvement](milestones/v1.4-ROADMAP.md)** — Phases 27-29 (shipped 2026-07-31)
- ✅ **[v1.5 Framework-Neutral Adaptive Routing](milestones/v1.5-ROADMAP.md)** — Phases 30-36, 32.1, and 37.1 (shipped 2026-08-02)

## Overview

Claude Router is an always-on, self-evolving orchestration layer. It maps prompt intent to locally available capabilities across Claude and Codex, with deterministic low-latency prompt routing and guarded background discovery, reconciliation, calibration, and release publication.

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-07-09</summary>

- [x] Foundation router hook, mode-map, telemetry, and evolution

</details>

<details>
<summary>✅ v1.1 Inspectable Routing Control Layer (Phases 5-10) — SHIPPED 2026-07-14</summary>

- [x] Inspect/preview/explain, health/coverage diagnostics, calibration, privacy-safe evolution, and release gates

</details>

<details>
<summary>✅ v1.2 Autonomous Dual-Runtime Control Plane (Phases 11-20) — SHIPPED 2026-07-23</summary>

- [x] Canonical registry, runtime adapters, incremental watcher, target safety, deterministic mapping, recovery, context budgets, compiled routing, and guarded evolution

</details>

<details>
<summary>✅ v1.3 Adaptive Local Capability Steward and Intent-Native Routing (Phases 21-26) — SHIPPED 2026-07-28</summary>

- [x] Personalized inventory, conservative contracts, intent-safe execution, privacy-safe outcomes, advisory stewardship, and dual-runtime publication

</details>

<details>
<summary>✅ v1.4 Coverage Completeness & Auto-Skill Routing Improvement (Phases 27-29) — SHIPPED 2026-07-31</summary>

- [x] Mutation safety, coverage audit-guard, mode-map curation, signal-pattern expansion, and calibration evidence

</details>

<details>
<summary>✅ v1.5 Framework-Neutral Adaptive Routing (Phases 30-36 + 32.1 + 37.1) — SHIPPED 2026-08-02</summary>

- [x] Manifest fingerprint and watcher narrowing
- [x] Runtime tagging and Claude/Codex parity
- [x] Intent-first resolve lists, guard-hole closure, tie-lint, and hot-path performance
- [x] Shadow-log observer and per-install auto-calibration
- [x] Per-project routing
- [x] Live release-gate cleanup, installed lifecycle hardening, and audit closure

Full details, requirements, and audit: [v1.5-ROADMAP](milestones/v1.5-ROADMAP.md) · [v1.5-REQUIREMENTS](milestones/v1.5-REQUIREMENTS.md) · [v1.5-MILESTONE-AUDIT](milestones/v1.5-MILESTONE-AUDIT.md)

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|---|---|---:|---|---|
| 27. Mutation Safety Infrastructure | v1.4 | 2/2 | Complete | 2026-07-29 |
| 28. Coverage Audit-Guard | v1.4 | 2/2 | Complete | 2026-07-29 |
| 29. Mode-Map Curation and Signal Patterns Expansion | v1.4 | 4/4 | Complete | 2026-07-29 |
| 30. Manifest Fingerprint + Watcher Narrowing | v1.5 | 3/3 | Complete | 2026-08-01 |
| 31. Runtime Tagging | v1.5 | 3/3 | Complete | 2026-08-01 |
| 32. Intent-First Routing | v1.5 | 4/4 | Complete | 2026-08-01 |
| 32.1. Review Closure | v1.5 | 4/4 | Complete | 2026-08-01 |
| 33. Shadow-Log Observer | v1.5 | 3/3 | Complete | 2026-08-01 |
| 34. Per-Install Auto-Calibration | v1.5 | 3/3 | Complete | 2026-08-01 |
| 35. Per-Project Routing | v1.5 | 3/3 | Complete | 2026-08-01 |
| 36. Release-Gate Cleanup | v1.5 | 3/3 | Complete | 2026-08-01 |
| 37.1. Audit Gap Closure | v1.5 | 1/1 | Complete | 2026-08-02 |

## Deferred / Out of Scope

- Evolution weight tuning (FUT-05, FUT-06, FUT-07): v2; requires a larger strong-outcome corpus.
- Advanced routing (FUT-08, FUT-09, FUT-10): v2; requires more telemetry and has higher thrash risk.
- In-turn invocation tap (FUT-11): v2; only if coexistence review passes.
- Per-prompt LLM classifiers, unbounded autonomous mutation, automatic installation, and auto-dispatch without approval remain out of scope.
