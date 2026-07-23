# Claude Router — Always-On, Self-Evolving Orchestration Layer

## What This Is

A global routing control layer that inventories Claude and Codex capabilities, identifies the user's goal and workflow state, and selects the most useful workflow, skills, agents, tools, and MCP integrations. It keeps prompt-time work deterministic and fast while moving discovery, reconciliation, and learning to guarded background processes.

## Core Value

The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## Current State

**v1.2 shipped and verified on 2026-07-23.** The router is now a guarded dual-runtime control plane: a canonical Claude + Codex capability registry with evidence-gated SHA-256 identities; incremental change detection via a portable Merkle-style fingerprint tree and single-flight watcher; fail-closed target safety, hook reconciliation, and inactive quarantine; deterministic mapping through a frozen eight-gate verifier into atomic version-pointer activation with cross-process CAS and crash-recoverable rollback; privacy-safe bounded context capsules that recover authoritative workflow state; workflow-first orchestration that resolves the next valid transition before selecting capabilities and loads only least-sufficient bounded context; compiled prompt routing with safe canary evolution; and an end-to-end autonomous lifecycle proving safe propagation, recovery, coexistence, and a full release matrix tying all 20 v1.2 requirements to executable evidence.

**All 10 phases (11–20) verified.** Phases 19–20 closed the two audit BLOCKERs surfaced in re-verification: ORC-01/TOK-02 live-path wiring (orchestrator baked into publish-index as per-workflow sibling tuples, schema 1→2, prompt-route.mjs read-only projection, blanket fallback removed) and EVO-05 production trigger (telemetry→evidence bridge drives canary promote/rollback via watcher, router-control CLI, and release-runner; CR-01 path-traversal and CR-02 rollback-reason defects closed). Milestone audit passed: 20/20 requirements satisfied and WIRED end-to-end, 5/5 E2E flows COMPLETE, REL-01 latency gates pass (warm p95 15.63ms <25, max route 22.98ms <100).

## Next Milestone Goals

v1.3 not yet planned. Run `/gsd-new-milestone` to define the next milestone.

Candidate backlog from v1.2 tech debt (not committed):

- v2 per-prompt source descriptors (Phase 19 deferred — `dispatch_eligible` carries the blocked result in v1).
- WR-01: `publish-index.mjs:87-92` hardcodes `position.state='planned'` — latent v2 data-integrity bug; v1 only wires gsd-execute-phase.
- Serialize parallel install/lifecycle test suites (concurrency races; `--test-concurrency=1` workaround).
- Re-sync stale installed hook snapshot (`~/.claude/hooks/router.mjs`, Jul 16) via `install-router.mjs`.

## Requirements

### Validated

- ✓ Always-on, fail-open, sub-100ms local prompt routing — v1.0
- ✓ Confidence-tiered workflow, skill, and agent recommendations — v1.0
- ✓ Manifest freshness, cache, telemetry privacy, graph context, and advisory evolution — v1.0
- ✓ Expanded route coverage and direct warning routes — v1.1
- ✓ Inspect, preview, explain-last, doctor, routes, unmapped, and coverage commands — v1.1
- ✓ Codebase routing calibration with preserved core fixtures — v1.1
- ✓ Missing-MCP safety, hook coexistence, and executable release gates — v1.1
- ✓ Canonical registry and native Claude/Codex runtime adapters — v1.2 (Phase 11)
- ✓ Incremental change detection and watcher publication — v1.2 (Phase 12)
- ✓ Target safety, hook reconciliation, and quarantine — v1.2 (Phase 13)
- ✓ Deterministic mapping, atomic activation, compatible recovery, and durable rollback — v1.2 (Phase 14)
- ✓ Bounded context capsules and deterministic workflow-state recovery — v1.2 (Phase 15)
- ✓ Autonomous dual-runtime registry reconciliation — v1.2 (Phases 11–18)
- ✓ Workflow-first capability selection and least-sufficient context budgets — v1.2 (Phases 16, 19)
- ✓ Guarded automatic map updates and reversible self-evolution — v1.2 (Phases 17, 20)
- ✓ Measured token, latency, safety, and routing-quality improvements — v1.2 (Phase 17, REL-01 gates: warm p95 15.63ms, max route 22.98ms)

### Active

(None — v1.3 not yet planned. Run `/gsd-new-milestone`.)

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
| Use one canonical registry with runtime adapters | Prevent `.claude`/`.codex` mapping drift | ✓ Good |
| Use workflow state plus prompt intent for selection | Short prompts require more than lexical context | ✓ Good |
| Permit only bounded, validated, reversible evolution | Automation must not silently degrade safety | ✓ Good |

---
*Last updated: 2026-07-23 after v1.2 milestone completion*
