# Roadmap: Claude Router

## Milestones

- ✅ **[v1.0 Claude Router MVP](milestones/v1.0-ROADMAP.md)** - Phases 1-4 (shipped 2026-07-09)
- ✅ **[v1.1 Inspectable Routing Control Layer](milestones/v1.1-ROADMAP.md)** - Phases 5-10 (shipped 2026-07-14)
- 🚧 **v1.2 Autonomous Dual-Runtime Control Plane** - Phases 11-18 (active)

## Overview

v1.2 turns the verified prompt router into a guarded dual-runtime control plane. The work first establishes a canonical Claude/Codex inventory, then adds incremental detection, fail-closed reconciliation, atomic activation, compact workflow-state recovery, workflow-first orchestration, token-bounded prompt routing, safe evolution, and an end-to-end autonomous release gate. Prompt-time routing remains deterministic, local, fail-open, and below the existing 100-ms hard ceiling throughout.

## Phases

- [x] **Phase 11: Canonical Registry and Runtime Adapters** - Normalize Claude and Codex capabilities into one stable registry. (completed 2026-07-14)
- [x] **Phase 12: Incremental Change Detection and Watcher** - Detect inventory changes quickly and repair missed events deterministically. (completed 2026-07-15)
- [x] **Phase 13: Target Safety, Hook Reconciliation, and Quarantine** - Prevent unsafe, deleted, or inconsistent targets from becoming active. (completed 2026-07-15)
- [x] **Phase 14: Deterministic Mapping, Activation, and Rollback** - Map safe changes and publish immutable versions atomically. (completed 2026-07-15)
- [x] **Phase 15: Context Capsules and Workflow-State Recovery** - Recover authoritative workflow state from compact privacy-safe capsules. (completed 2026-07-16)
- [x] **Phase 16: Workflow-First Orchestration and Context Budgets** - Select the workflow first and load only its least-sufficient context. (completed 2026-07-16)
- [x] **Phase 17: Compiled Prompt Routing and Safe Evolution** - Connect compiled state to the hot path and canary routing improvements. (completed 2026-07-16)
- [x] **Phase 18: Autonomous Lifecycle and Release Gates** - Prove safe intervention-free lifecycle behavior across both runtimes. (completed 2026-07-17)

## Phase Details

### Phase 11: Canonical Registry and Runtime Adapters

**Goal**: Users get one stable, runtime-neutral view of available Claude and Codex capabilities without losing native invocation or scope details.
**Depends on**: Nothing
**Requirements**: REG-01, REG-02, ADP-01, ADP-02
**Success Criteria** (what must be TRUE):

  1. The same capability keeps a stable canonical identity across deterministic rebuilds and supported runtime layouts.
  2. Claude inventory includes global, plugin, agents-store, and project-scoped skills, agents, commands, hooks, bindings, scopes, and dependencies.
  3. Codex inventory includes skills, plugins, agents, hooks, configuration, project scope, and dependency metadata.
  4. A full build reports provenance and conflicts without changing the active router or unrelated runtime configuration.

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 11-01: Canonical schema and stable identity

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-02: Claude and Codex adapter contracts

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 11-03: Full canonical build parity

### Phase 12: Incremental Change Detection and Watcher

**Goal**: Users see additions, edits, moves, disables, dependency changes, and deletions reflected promptly with full-build-equivalent results.
**Depends on**: Phase 11
**Requirements**: REG-03, CHG-01, CHG-02
**Success Criteria** (what must be TRUE):

  1. Add, edit, rename, move, disable, dependency-change, permission-change, scope-change, and delete events receive the correct lifecycle classification.
  2. Normal filesystem changes are observed within 2 seconds without duplicate processing.
  3. Missed events are repaired within 5 minutes, including after controller restart.
  4. After every supported mutation sequence, incremental and clean full rebuilds produce identical canonical registry bytes.

**Plans**: 3/7 plans complete

Plans:

- [x] 12-01-PLAN.md
- [x] 12-02-PLAN.md
- [x] 12-03-PLAN.md

**Wave 1**

- [x] 12-01: Fingerprint tree and diff engine

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 12-02: Incremental build equivalence

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 12-03: Debounced watcher and periodic repair

### Phase 13: Target Safety, Hook Reconciliation, and Quarantine

**Goal**: Users can trust that missing, deleted, ambiguous, or invalid capabilities never become dispatchable and never displace last-known-good state.
**Depends on**: Phase 12
**Requirements**: SAF-09, SAF-10, MAP-02
**Success Criteria** (what must be TRUE):

  1. Deleted commands, skills, agents, and cross-runtime targets cannot remain activatable through stale aliases or schema exceptions.
  2. Missing dependencies, denied permissions, scope leakage, identity collisions, and ambiguous mappings produce structured non-dispatchable verdicts.
  3. Hook inventory distinguishes valid file/binding pairs, orphan files, and orphan bindings without auto-registering untrusted hooks.
  4. A quarantined candidate leaves the active registry byte-for-byte unchanged and explains the required corrective action.

**Plans**: 4/5 plans complete

Plans:

- [x] 13-01-PLAN.md
- [x] 13-02-PLAN.md
- [x] 13-03-PLAN.md

**Wave 1**

- [x] 13-01: Deleted-target and alias safety

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 13-02: Dependency, scope, and collision gates

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 13-03: Hook file and binding reconciliation

### Phase 14: Deterministic Mapping, Activation, and Rollback

**Goal**: Users get explainable automatic mappings for safe changes and can atomically activate or restore verified registry versions.
**Depends on**: Phase 13
**Requirements**: MAP-01, ACT-01
**Success Criteria** (what must be TRUE):

  1. Explicit aliases, stable identities, route-family inheritance, and deterministic signals are evaluated before any background ambiguity resolver.
  2. Every proposed mapping exposes evidence and confidence and never references a target absent from the candidate registry.
  3. Passing candidates activate through one atomic version-pointer change, while crashes or failed validation preserve the prior active version.
  4. Operators can inspect status, diff, evidence, verification, and rollback previews, and can restore a known-good version with typed confirmation.

**Plans**: 3/3 plans complete

Plans:

- [x] 14-01-PLAN.md
- [x] 14-02-PLAN.md
- [x] 14-03-PLAN.md
- [x] 14-04-PLAN.md
- [x] 14-05-PLAN.md
- [x] 14-06-PLAN.md
- [x] 14-07-PLAN.md

**Wave 1**

- [x] 14-01: Deterministic mapping engine

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-02: Versioned activation and rollback

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-03: Registry control CLI

**Wave 4** *(gap closure; blocked on Wave 3 completion)*

- [ ] 14-04: Installed fail-closed activation orchestration

**Wave 5** *(blocked on Wave 4 completion)*

- [ ] 14-05: Authentic production verification and behavioral gates

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 14-06: Cross-process CAS, known-good recovery, and durable rollback audit

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 14-07: Complete large-history and corrupt-state operator controls

### Phase 15: Context Capsules and Workflow-State Recovery

**Goal**: Users can resume a uniquely identifiable active workflow with minimal referential prompts and no raw prompt-history persistence.
**Depends on**: Phase 14
**Requirements**: CTX-01, CTX-02, ORC-02
**Success Criteria** (what must be TRUE):

  1. A bounded capsule persists the active goal, workflow position, artifact references, blockers, and freshness without raw prompts or full documents.
  2. `continue`, `finish it`, and `use the design` recover the uniquely valid next workflow from authoritative project and execution state.
  3. A stale or corrupt capsule is detected and refreshed from bounded authoritative sources rather than trusted silently.
  4. A new explicit instruction overrides conflicting capsule state, while an ambiguous continuation asks one focused question.

**Plans**: 1/3 plans executed

Plans:

- [x] 15-01-PLAN.md
- [x] 15-02-PLAN.md
- [x] 15-03-PLAN.md

**Wave 1**

- [x] 15-01: Capsule schema, privacy, and persistence

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 15-02: Authoritative context sources

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 15-03: Resume and refresh behavior

### Phase 16: Workflow-First Orchestration and Context Budgets

**Goal**: Users get the best valid workflow first, followed only by compatible capabilities, dependencies, and context within declared budgets.
**Depends on**: Phase 15
**Requirements**: ORC-01, TOK-01, TOK-02
**Success Criteria** (what must be TRUE):

  1. The router resolves the next valid workflow transition before selecting skills, commands, agents, MCPs, tools, models, permissions, or lifecycle hooks.
  2. MCPs and tools are selected because the chosen workflow requires them, not because their names resemble prompt text.
  3. Default routing loads no full manifest, planning directory, conversation history, or complete design document.
  4. Every workflow enforces a declared context budget, reuses unchanged artifact summaries, and reports token regressions.

**Plans**: 3/3 plans complete

Plans:

- [x] 16-01-PLAN.md
- [x] 16-02-PLAN.md
- [x] 16-03-PLAN.md

**Wave 1**

- [x] 16-01: Workflow transition policy

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 16-02: Capability and dependency selection

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 16-03: Least-sufficient-context contracts

### Phase 17: Compiled Prompt Routing and Safe Evolution

**Goal**: Users receive fast compiled routing that can improve from privacy-safe telemetry without risking prompt latency or silent regressions.
**Depends on**: Phase 16
**Requirements**: EVO-05, REL-01
**Success Criteria** (what must be TRUE):

  1. Prompt routing reads only compact versioned indexes and fresh capsules, with no inventory scan, registry build, or external model call.
  2. Warm routing p95 remains below 25 ms and every measured route remains below 100 ms.
  3. Minimal-prompt, explicit-override, stale-context, and ambiguity fixtures meet routing-quality and context-budget gates.
  4. Privacy-safe signal or weight candidates run through canaries and automatically roll back when quality regresses.

**Plans**: 5/5 plans complete

Plans:

- [x] 17-01-PLAN.md
- [x] 17-02-PLAN.md
- [x] 17-03-PLAN.md
- [x] 17-04-PLAN.md — Harden compiled publication, evidence provenance, and measured context bytes
- [x] 17-05-PLAN.md — Exercise real compiled routing for quality, emitted-byte, and latency gates

**Wave 1**

- [x] 17-01: Compact compiled indexes

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 17-02: Canary evolution and rollback

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 17-03: Minimal-prompt calibration and performance

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 17-04: Verification hardening for compiled routing and safe evolution

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 17-05: Real-route calibration gap closure

### Phase 18: Autonomous Lifecycle and Release Gates

**Goal**: Users can add, change, disable, move, or remove Claude and Codex capabilities and receive safe automatic propagation without intervention.
**Depends on**: Phase 17
**Requirements**: Cross-cutting verification of all v1.2 requirements; no duplicate primary assignment
**Success Criteria** (what must be TRUE):

  1. Safe add, edit, rename, move, disable, dependency-change, and delete events propagate across temporary Claude and Codex homes without user action.
  2. Unsafe candidates, controller crashes, corrupt indexes, and missed events preserve or recover a verified last-known-good active version.
  3. Install, upgrade, reinstall, disable, and uninstall preserve unrelated Claude and Codex settings, hooks, and plugins.
  4. The full release matrix ties every v1.2 requirement to executable evidence and passes regression, calibration, privacy, coexistence, recovery, latency, and token gates.

**Plans**: 4/5 plans executed

Plans:

- [x] 18-04-PLAN.md
- [x] 18-05-PLAN.md

**Wave 1**

- [x] 18-01-PLAN.md
- [x] 18-01: Dual-runtime lifecycle E2E

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-02-PLAN.md
- [x] 18-02: Installer, coexistence, and recovery gates

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 18-03-PLAN.md
- [x] 18-03: Final autonomous release matrix

## Progress

**Execution Order:** 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 11. Canonical Registry and Runtime Adapters | v1.2 | 6/6 | Complete    | 2026-07-14 |
| 12. Incremental Change Detection and Watcher | v1.2 | 4/4 | Complete    | 2026-07-15 |
| 13. Target Safety, Hook Reconciliation, and Quarantine | v1.2 | 3/3 | Complete    | 2026-07-15 |
| 14. Deterministic Mapping, Activation, and Rollback | v1.2 | 7/7 | Complete    | 2026-07-16 |
| 15. Context Capsules and Workflow-State Recovery | v1.2 | 3/3 | Complete    | 2026-07-16 |
| 16. Workflow-First Orchestration and Context Budgets | v1.2 | 4/4 | Complete    | 2026-07-16 |
| 17. Compiled Prompt Routing and Safe Evolution | v1.2 | 5/5 | Complete    | 2026-07-16 |
| 18. Autonomous Lifecycle and Release Gates | v1.2 | 5/5 | Complete    | 2026-07-17 |

### Phase 19: Close gap: TOK-02 + ORC-01 — wire orchestrator {select,transitions,budget} into publish-index.mjs + prompt-route.mjs live path and deployed bundle

**Goal:** Wire the already-built orchestrator functions (selectCapabilities, selectWorkflow/nextValidTransitions, planContextLoad) into the publish-time path (publishCompiledIndex in src/prompt/publish-index.mjs) so their output is frozen into the immutable compiled tuple, extend compile-index.mjs (schema 1→2 + compatibility gate + sibling loaders), extend the route path (prompt-route.mjs) as a read-only projection consumer of the frozen tuple, extend the deployed bundle manifest (router-lifecycle.mjs moduleNames +3 + workflow-declarations.json), remove the blanket fallback, and extend the Phase 18 E2E tests with D-09 evidence — closing the live-path gap for ORC-01 and TOK-02 that the Phase 16 traceability marking did not cover.
**Requirements**: ORC-01, TOK-02
**Depends on:** Phase 18
**Plans:** 4/4 plans executed

Plans:
**Wave 1**

- [x] 19-01-PLAN.md — Q1 design spike (orchestrator-input source + sibling/manifest/compatibility shape lock) + 19-VALIDATION.md scaffold (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-02-PLAN.md — compile-index.mjs schema bump 1→2 + publish-index.mjs orchestrator wiring + sibling writes + fallback :63-67 removal + workflow-declarations.json (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-03-PLAN.md — router-lifecycle.mjs moduleNames +4 bundle extension + prompt-route.mjs read-only sibling projection + dispatch_eligible gate (Wave 2, parallel with 19-02)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 19-04-PLAN.md — schema-bump fixture sweep (~10-17 test files) + D-09 E2E evidence in autonomous-lifecycle + test-mode-seam + v1.2-matrix.json phase-19-live-path secondary entry (Wave 3)

### Phase 20: Close gap: EVO-05 — add production trigger for canary-controller (watcher/CLI/release-runner) so telemetry drives canary promotion + rollback

**Goal:** Privacy-safe telemetry canary-tests drive canary-controller promotion and rollback from the watcher and operator CLI, closing audit BLOCKER 2 (evolution library no longer orphaned; production trigger wired).
**Requirements**: EVO-05
**Depends on:** Phase 19
**Plans:** 3 plans

Plans:
**Wave 1**

- [ ] 20-01-PLAN.md — Telemetry→evidence bridge + persistent evidence store + deployed-bundle inclusion (Wave 1 foundation)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 20-02-PLAN.md — Watcher canary trigger wiring (Wave 2 automatic trigger)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 20-03-PLAN.md — CLI canary subcommands status/promote/rollback (Wave 3 operator trigger)

---
*Roadmap initialized: 2026-07-14 for v1.2 Autonomous Dual-Runtime Control Plane*
