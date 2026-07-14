# Claude Router — Always-On, Self-Evolving Orchestration Layer

## What This Is

A global routing control layer that inventories Claude and Codex capabilities, identifies the user's goal and workflow state, and selects the most useful workflow, skills, agents, tools, and MCP integrations. It keeps prompt-time work deterministic and fast while moving discovery, reconciliation, and learning to guarded background processes.

## Core Value

The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## Current State

**v1.1 shipped and verified on 2026-07-14.** The router now provides expanded route coverage, inspect/preview/explain commands, health and coverage diagnostics, practical codebase calibration, privacy-preserving evolution proposals, and executable safety/coexistence release gates.

## Current Milestone: v1.2 Autonomous Dual-Runtime Control Plane

**Goal:** Automatically reconcile additions, edits, moves, disables, dependency changes, and deletions across `.claude` and `.codex`; then select the best workflow and least-sufficient context from prompt intent plus authoritative workflow state.

**Success means:** safe inventory changes propagate without intervention, unsafe candidates are quarantined without changing active state, minimal prompts resume the correct workflow when uniquely identifiable, and warm routing stays below the existing hard latency gate with materially lower context usage.

## Next Milestone Goals

- Build one canonical registry across `.claude` and `.codex`, with runtime-specific adapters.
- Detect capability additions, removals, and edits automatically outside the prompt hot path.
- Reconcile maps and hook registrations safely, with validation, quarantine, rollback, and last-known-good state.
- Recover project, phase, and task state so short prompts such as `continue` select the correct workflow.
- Compile compact context capsules and enforce token budgets before injection.
- Learn from outcomes through bounded, reversible changes that cannot silently weaken safety.

## Requirements

### Validated

- ✓ Always-on, fail-open, sub-100ms local prompt routing — v1.0
- ✓ Confidence-tiered workflow, skill, and agent recommendations — v1.0
- ✓ Manifest freshness, cache, telemetry privacy, graph context, and advisory evolution — v1.0
- ✓ Expanded route coverage and direct warning routes — v1.1
- ✓ Inspect, preview, explain-last, doctor, routes, unmapped, and coverage commands — v1.1
- ✓ Codebase routing calibration with preserved core fixtures — v1.1
- ✓ Missing-MCP safety, hook coexistence, and executable release gates — v1.1

### Active

- [ ] Autonomous dual-runtime registry reconciliation.
- [ ] Workflow-state-aware routing and compact context capsules.
- [ ] Guarded automatic map updates and reversible self-evolution.
- [ ] Measured token, latency, safety, and routing-quality improvements.

### Out of Scope

- Per-prompt LLM classifiers — violate latency, privacy, and token goals.
- Unbounded autonomous mutation — all changes require deterministic validation and rollback.
- Automatic installation of missing external capabilities — discovery may recommend, but installation remains an explicit operation.
- Replacing GSD, Graphify, context-mode, or existing runtime primitives — the router coordinates them.
- Invoking hooks as task tools — hooks remain event-bound lifecycle mechanisms.

## Context

The user often provides intentionally short instructions. Prompt text alone is therefore insufficient: routing must combine prompt signals with repository state, GSD phase state, recent actions, runtime availability, dependency health, and safety policy. The prompt hook must remain a compiled/read-only consumer; filesystem scanning, hashing, validation, and learning belong in an incremental background control plane.

The approved design and implementation plan are:

- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md`
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md`

## Constraints

- **Performance:** Warm prompt routing stays below 100ms.
- **Tokens:** Inject the smallest sufficient context capsule and enforce explicit budgets.
- **Safety:** Fail open at prompt time; fail closed for mutations; preserve last-known-good artifacts.
- **Compatibility:** Support both `.claude` and `.codex` without deleting or overwriting unrelated user configuration.
- **Privacy:** Do not persist raw prompts in telemetry or learning artifacts.
- **Architecture:** Heavy discovery and reconciliation run outside the prompt hook.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep the prompt hook deterministic and read-only | Protect latency and reliability | ✓ Good |
| Reuse existing workflow and discovery primitives | Avoid duplicate orchestration engines | ✓ Good |
| Treat missing MCP dependencies as warnings, never auto-dispatch targets | Prevent predictable runtime failures | ✓ Good |
| Use one canonical registry with runtime adapters | Prevent `.claude`/`.codex` mapping drift | — Pending |
| Use workflow state plus prompt intent for selection | Short prompts require more than lexical context | — Pending |
| Permit only bounded, validated, reversible evolution | Automation must not silently degrade safety | — Pending |

---
*Last updated: 2026-07-14 after v1.1 milestone closeout and v1.2 goal approval*
