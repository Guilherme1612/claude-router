# Roadmap: Claude Router

## Milestones

- ✅ **[v1.0 Claude Router MVP](milestones/v1.0-ROADMAP.md)** — Phases 1-4 (shipped 2026-07-09)
- ✅ **[v1.1 Inspectable Routing Control Layer](milestones/v1.1-ROADMAP.md)** — Phases 5-10 (shipped 2026-07-14)
- ✅ **[v1.2 Autonomous Dual-Runtime Control Plane](milestones/v1.2-ROADMAP.md)** — Phases 11-20 (shipped 2026-07-23)
- 📋 **v1.3** — not yet planned (run `/gsd-new-milestone`)

## Overview

Claude Router is an always-on, self-evving orchestration layer: a global `UserPromptSubmit` hook that inventories Claude and Codex capabilities, classifies each prompt + goal, and attaches the most efficient workflow mode + skills + agents — then evolves over time. v1.2 turned the verified prompt router into a guarded dual-runtime control plane: a canonical registry, incremental change detection, fail-closed reconciliation, atomic activation, compact workflow-state recovery, workflow-first orchestration, token-bounded prompt routing, safe canary evolution, and an end-to-end autonomous release gate. Prompt-time routing remains deterministic, local, fail-open, and below the 100ms hard ceiling throughout.

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED 2026-07-09</summary>

- [x] Phase 1-4: Foundation router hook, mode-map, telemetry, evolution — see [v1.0-ROADMAP](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v1.1 Inspectable Routing Control Layer (Phases 5-10) — SHIPPED 2026-07-14</summary>

- [x] Phases 5-10: Inspect/preview/explain, health/coverage diagnostics, codebase calibration, privacy-preserving evolution proposals, release gates — see [v1.1-ROADMAP](milestones/v1.1-ROADMAP.md)

</details>

<details>
<summary>✅ v1.2 Autonomous Dual-Runtime Control Plane (Phases 11-20) — SHIPPED 2026-07-23</summary>

- [x] Phase 11: Canonical Registry and Runtime Adapters (6 plans) — completed 2026-07-14
- [x] Phase 12: Incremental Change Detection and Watcher (4 plans) — completed 2026-07-15
- [x] Phase 13: Target Safety, Hook Reconciliation, and Quarantine (3 plans) — completed 2026-07-15
- [x] Phase 14: Deterministic Mapping, Activation, and Rollback (7 plans) — completed 2026-07-16
- [x] Phase 15: Context Capsules and Workflow-State Recovery (3 plans) — completed 2026-07-16
- [x] Phase 16: Workflow-First Orchestration and Context Budgets (4 plans) — completed 2026-07-16
- [x] Phase 17: Compiled Prompt Routing and Safe Evolution (5 plans) — completed 2026-07-16
- [x] Phase 18: Autonomous Lifecycle and Release Gates (5 plans) — completed 2026-07-17
- [x] Phase 19: Close gap TOK-02 + ORC-01 — wire orchestrator into publish-index + prompt-route live path (4 plans) — completed 2026-07-22
- [x] Phase 20: Close gap EVO-05 — add production trigger for canary-controller (5 plans) — completed 2026-07-22

Full phase details, decisions, and tech debt: [v1.2-ROADMAP](milestones/v1.2-ROADMAP.md) · [v1.2-MILESTONE-AUDIT](milestones/v1.2-MILESTONE-AUDIT.md)

</details>

### 📋 v1.3 (Not yet planned)

Run `/gsd-new-milestone` to define the next milestone (questioning → research → requirements → roadmap).

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-4 | v1.0 | 14/14 | Complete | 2026-07-09 |
| 5-10 | v1.1 | 23/23 | Complete | 2026-07-14 |
| 11. Canonical Registry and Runtime Adapters | v1.2 | 6/6 | Complete | 2026-07-14 |
| 12. Incremental Change Detection and Watcher | v1.2 | 4/4 | Complete | 2026-07-15 |
| 13. Target Safety, Hook Reconciliation, and Quarantine | v1.2 | 3/3 | Complete | 2026-07-15 |
| 14. Deterministic Mapping, Activation, and Rollback | v1.2 | 7/7 | Complete | 2026-07-16 |
| 15. Context Capsules and Workflow-State Recovery | v1.2 | 3/3 | Complete | 2026-07-16 |
| 16. Workflow-First Orchestration and Context Budgets | v1.2 | 4/4 | Complete | 2026-07-16 |
| 17. Compiled Prompt Routing and Safe Evolution | v1.2 | 5/5 | Complete | 2026-07-16 |
| 18. Autonomous Lifecycle and Release Gates | v1.2 | 5/5 | Complete | 2026-07-17 |
| 19. Close gap TOK-02 + ORC-01 | v1.2 | 4/4 | Complete | 2026-07-22 |
| 20. Close gap EVO-05 | v1.2 | 5/5 | Complete | 2026-07-22 |

---
*Roadmap reorganized 2026-07-23 after v1.2 milestone completion. Prior content archived to milestones/v1.2-ROADMAP.md.*