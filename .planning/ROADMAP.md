# Roadmap: Claude Router

## Milestones

- ✅ **[v1.0 Claude Router MVP](milestones/v1.0-ROADMAP.md)** — Phases 1-4 (shipped 2026-07-09)
- ✅ **[v1.1 Inspectable Routing Control Layer](milestones/v1.1-ROADMAP.md)** — Phases 5-10 (shipped 2026-07-14)
- ✅ **[v1.2 Autonomous Dual-Runtime Control Plane](milestones/v1.2-ROADMAP.md)** — Phases 11-20 (shipped 2026-07-23)
- 🚧 **v1.3 Adaptive Local Capability Steward and Intent-Native Routing** — Phases 21-26 (planned)

## Overview

Claude Router is an always-on, self-evolving orchestration layer. v1.3 makes the verified dual-runtime control plane framework-neutral and locally adaptive: the user's installed `.claude` and `.codex` capabilities become authoritative, explicit natural-language intent resolves through normalized contracts and current workflow state, and bounded local outcomes support quiet advisory stewardship. Prompt-time routing remains deterministic, read-only, local, fail-open, and below the 100ms hard ceiling while every publication continues through the existing verifier, canary, rollback, and recovery lifecycle.

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

### 🚧 v1.3 Adaptive Local Capability Steward and Intent-Native Routing

**Milestone Goal:** Make Router framework-agnostic, lightweight, locally adaptive, and able to turn explicit natural-language intent into the correct safe action using the capabilities actually installed in each user's `.claude` and `.codex` environments.

- [x] **Phase 21: Authoritative Personalized Inventory** - Discover and reconcile installed capabilities as framework-neutral local truth. (completed 2026-07-26)
- [ ] **Phase 22: Conservative Contracts and Relationship Graph** - Infer inspectable capability meaning, uncertainty, and typed relationships.
- [x] **Phase 23: Intent-Safe State-Aware Execution** - Route explicit action intent through authoritative state to one safe installed capability. (completed 2026-07-27)
- [ ] **Phase 24: Privacy-Safe Outcomes and Capability Health** - Turn bounded local outcomes into conservative, evidence-backed health observations.
- [ ] **Phase 25: Advisory Stewardship and Guarded Drafts** - Surface one useful recommendation without silently mutating personal capabilities.
- [ ] **Phase 26: Coherent Publication and Dual-Runtime Release** - Prove the complete v1.3 tuple preserves latency, compatibility, rollback, and recovery.

## Phase Details

### Phase 21: Authoritative Personalized Inventory

**Goal**: Users can rely on Router's inventory as a current, safe, framework-neutral representation of the capabilities actually installed in their Claude and Codex environments.
**Depends on**: Phase 20
**Requirements**: DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07, DISC-08
**Success Criteria** (what must be TRUE):

  1. A user can add, edit, rename, move, disable, replace, or remove a local capability and observe the candidate inventory and all affected relationships converge to the same result through incremental or authoritative reconciliation.
  2. A user can inspect each installed capability's runtime, scope, provenance, enabled state, invocation form, dependencies, and lifecycle role without GSD, Gstack, Claude, or Codex being treated as the default ecosystem.
  3. Claude-versus-Codex gaps and unknown future capability types appear by semantic category and adapter evidence rather than hard-coded framework names.
  4. Unsafe paths, scope escapes, symlinks, and capability-authored policy text cannot become trusted inventory or executable Router policy.

**Plans**: 6/6 plans complete

- [x] 21-06-PLAN.md

**Wave 1**

- [x] 21-01-PLAN.md

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 21-02-PLAN.md
- [x] 21-03-PLAN.md

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 21-04-PLAN.md

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 21-05-PLAN.md

### Phase 22: Conservative Contracts and Relationship Graph

**Goal**: Users can understand what each installed capability can safely do, why Router believes it, and whether it is eligible for dispatch.
**Depends on**: Phase 21
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-07, CONT-08, CONT-09
**Success Criteria** (what must be TRUE):

  1. A user can inspect a normalized contract for every discovered capability, including field-level evidence, provenance, inference version, confidence, permissions, effects, reversibility, risk, lifecycle role, and workflow transitions.
  2. Missing, stale, conflicting, or low-confidence dispatch fields remain visibly unknown and keep the capability recommendation-only.
  3. Optional manifests and approved corrections enrich only the exact installed capability identity and are rejected or invalidated when schema, fingerprint, or lineage evidence no longer matches.
  4. Users can distinguish substitutes, variants, prerequisites, compositions, conflicts, fallbacks, implementations, and aliases, while only fully validated targets become dispatch eligible.

**Plans**: TBD

### Phase 23: Intent-Safe State-Aware Execution

**Goal**: Users can express actions in natural language and have Router execute exactly one safe, locally available capability only when intent and authoritative workflow state permit it.
**Depends on**: Phase 22
**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, EXEC-10
**Success Criteria** (what must be TRUE):

  1. Explicit positive action requests can select one compatible installed capability, while explanations, hypotheticals, quotations, examples, negations, prohibitions, previews, conditions, ambiguity, and unsafe requests never invoke one.
  2. "Go to the next phase" reads fresh authoritative project state, identifies one valid transition, and invokes the safest compatible locally installed capability; ties, stale state, gaps, terminal states, or checkpoints produce abstention or one focused clarification.
  3. "There is a bug" or "debug this" selects the compatible installed debugging capability, and "Create a phase about X" derives current numbering and invokes the compatible installed phase-creation capability with the topic—regardless of whether that capability comes from GSD, Gstack, another collection, or a future local adapter.
  4. Destructive, external, privileged, or difficult-to-reverse actions require separately bound approval, and Router never elevates permissions, bypasses runtime restrictions, or invokes hooks as task tools.
  5. After work completes, the user receives the correct next locally available capability and a ready-to-use framework-neutral prompt, with newest explicit instructions overriding stale context.

**Plans**: 3/3 plans executed
**Wave 1**

- [x] 23-01-PLAN.md — Tracer: end-to-end "go to next phase" through all 8 layers + intent classifier 8-disposition matrix

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 23-02-PLAN.md — Adversarial intent corpus (INT-03/06) + action mapper debug/create-phase verbs (EXEC-01/02/03/04/06/10)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 23-03-PLAN.md — Approval gate (EXEC-07/08/09) + full dispatch integration matrix (EXEC-05/06/09/10)

### Phase 24: Privacy-Safe Outcomes and Capability Health

**Goal**: Users receive trustworthy local capability-health observations without Router retaining sensitive prompt content or penalizing capabilities on weak evidence.
**Depends on**: Phase 23
**Requirements**: HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-05, HLTH-06, HLTH-07, HLTH-08, HLTH-09, HLTH-10, HLTH-11
**Success Criteria** (what must be TRUE):

  1. A user can inspect bounded local outcome records and confirm that raw prompts, transcripts, secrets, source documents, arbitrary outputs, and unbounded arguments are neither stored nor sent off-machine.
  2. A user can inspect, reset, dispose of, and recover health state without changing authoritative capability definitions or the active routing map.
  3. Health observations distinguish missing, unavailable, stale, unused, duplicate, overlapping, complementary, repeatedly ineffective, and reusable-workflow opportunities with reason codes, evidence windows, opportunity counts, freshness, confidence, and non-destructive remedies.
  4. Rare or new recovery, incident, release, and migration capabilities remain unjudged when evidence is insufficient, while versioned thresholds, decay, cooldown, and multilingual calibration are testable and canary-guarded.

**Plans**: 4 plans

**Wave 1**

- [ ] 24-01-PLAN.md — Tracer: outcome schema + privacy boundary + minimal observer + inspect, end-to-end

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 24-02-PLAN.md — Full 9-kind observation capture (HLTH-03) + usefulness scoring (HLTH-06) + rare-role unjudged tier (HLTH-07)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 24-03-PLAN.md — Health observation catalog: 10 kinds + HLTH-10 required fields (HLTH-08/09/10) + admin reset/dispose/recover (HLTH-05)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 24-04-PLAN.md — Versioned thresholds + canary-guarded activation + multilingual calibration plumbing (HLTH-11)

### Phase 25: Advisory Stewardship and Guarded Drafts

**Goal**: Users receive at most one high-value capability recommendation and can safely inspect or prepare changes without Router mutating personal capabilities.
**Depends on**: Phase 24
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09
**Success Criteria** (what must be TRUE):

  1. Startup stays silent unless one novel, actionable, high-confidence observation exists; when shown, it is compact, non-blocking, deduplicated, cooldown-controlled, and directs the user to `/router suggestion`.
  2. `/router suggestion` returns exactly one prioritized action plus a compact health overview and exposes its evidence, confidence, affected capabilities, expected benefit, risk, and safe next step.
  3. A user can inspect, dismiss, snooze, or correct a suggestion without silently changing capability definitions or routing policy.
  4. Missing-capability remediation requires explicit approval before a draft and preview, shows exact paths, semantic changes, dependencies, conflicts, route effects, verification and rollback implications, and never automatically installs or publishes the result.
  5. Router presents no dashboard, timeline, per-session summary, unranked finding dump, or maintenance-command suite.

**Plans**: TBD
**UI hint**: yes

### Phase 26: Coherent Publication and Dual-Runtime Release

**Goal**: Users retain fast, compatible, recoverable routing when every v1.3 decision artifact is activated and exercised across installed Claude and Codex capabilities.
**Depends on**: Phase 25
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06, REL-07, REL-08, REL-09
**Success Criteria** (what must be TRUE):

  1. Prompt submission remains a bounded read-only projection with no discovery, parsing, history analysis, health calculation, graph traversal, mutation, network request, or additional model call.
  2. Registry, contracts, relationships, intent policy, workflow routes, health policy, and suggestion references activate and roll back as one immutable version-consistent tuple through the existing verifier, canary, last-known-good, and recovery lifecycle.
  3. Full and incremental builds are byte-identical, invalidation affects every dependent tuple member atomically, and failed or partial background work cannot alter active routing.
  4. Existing command, skill, agent, workflow, MCP, and tool recommendations remain compatible across installed Claude and Codex environments, including recommendation-only fail-open behavior and approval-gated mutations.
  5. Release evidence shows warm routing p95 below 25ms, every measured route below 100ms, bounded injected context, and safe publish/rollback/recovery under realistic large local registries.

**Plans**: TBD

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
| 21. Authoritative Personalized Inventory | v1.3 | 6/6 | Complete    | 2026-07-26 |
| 22. Conservative Contracts and Relationship Graph | v1.3 | 0/TBD | Not started | - |
| 23. Intent-Safe State-Aware Execution | v1.3 | 3/3 | Complete    | 2026-07-27 |
| 24. Privacy-Safe Outcomes and Capability Health | v1.3 | 0/TBD | Not started | - |
| 25. Advisory Stewardship and Guarded Drafts | v1.3 | 0/TBD | Not started | - |
| 26. Coherent Publication and Dual-Runtime Release | v1.3 | 0/TBD | Not started | - |

---
*Roadmap updated 2026-07-23 for v1.3 planning. Prior milestone details are archived under `.planning/milestones/`.*
