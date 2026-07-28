# Claude Router — Always-On, Self-Evolving Orchestration Layer

## What This Is

A global routing control layer that inventories Claude and Codex capabilities, identifies the user's goal and workflow state, and selects the most useful workflow, skills, agents, tools, and MCP integrations. It keeps prompt-time work deterministic and fast while moving discovery, reconciliation, and learning to guarded background processes.

## Core Value

The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## Current State

**v1.3 shipped and verified on 2026-07-28.** Router is now a framework-neutral, locally adaptive control plane: installed `.claude` and `.codex` capabilities are authoritative local truth (Phase 21) with conservative capability contracts and typed relationship graphs (Phase 22); explicit natural-language intent resolves through authoritative workflow state to one safe installed capability via a four-gate dispatch path — eligible + intent_permits + state_permits + approval_grants (Phase 23); bounded private outcomes drive conservative capability-health observations (Phase 24); advisory stewardship surfaces one high-confidence recommendation with approval-gated, preview-only drafts and no silent mutation (Phase 25); and coherent publication proves the v1.3 tuple publishes byte-identical, atomic, recoverable artifacts across full and incremental paths with a fail-closed dual-runtime release matrix (Phase 26).

**All 6 phases (21–26) verified — 27/27 phase success criteria met, 1102/1102 tests pass.** Milestone audit verdict `ship_with_deferred`: BLOCKER 2 (live-install release verification stage) deferred to v1.3.1 as release-gate hardening, not a phase blocker. PR #1 merged to main (c109a16). v1.3.1 follow-ups open: live-install release gate, orphaned temp-dir watchers, router.safety-release live-env failures, and watcher-reconcile activation confirmation (see STATE.md Deferred Items).

## Last Milestone: v1.3 Adaptive Local Capability Steward and Intent-Native Routing (SHIPPED 2026-07-28)

**Goal:** Make Router framework-agnostic, lightweight, locally adaptive, and able to turn explicit natural-language intent into the correct safe action using the capabilities actually installed in each user's `.claude` and `.codex` environments.

**Next milestone goals:** v1.3.1 release-gate hardening — close BLOCKER 2 (live-install release verification), kill orphaned temp-dir watchers, fix router.safety-release live-env failures, and confirm watcher-reconcile activation. Start with `/gsd-new-milestone` after fresh requirements.

**Target features:**
- Personalized discovery of commands, skills, agents, hooks, MCPs, tools, and their relationships
- Inferred normalized capability contracts with optional manifest enrichment
- Intent-native routing for actions, explanations, hypotheticals, quotations, prohibitions, and workflow-state-aware next steps
- Automatic selection of locally available equivalent commands and agents without assuming GSD, Gstack, or any other framework
- Fully local asynchronous capability-health analysis using bounded privacy-safe outcomes rather than raw prompts
- Confidence-ranked detection of missing, stale, unused, overlapping, duplicated, and ineffective capabilities
- Quiet high-confidence startup guidance and one primary `/router suggestion` interface
- Approval-gated draft and preview flows with no automatic installation, deletion, merging, archival, or rewriting
- Preservation of the deterministic compiled prompt-time hot path and guarded verify/publish/rollback/canary lifecycle

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
- ✓ Discover and continuously reconcile personalized Claude and Codex capabilities without ecosystem-specific assumptions — v1.3 (Phase 21)
- ✓ Infer safe, correctable capability contracts and compile them into the existing capability map — v1.3 (Phase 22)
- ✓ Route explicit natural-language action intent to the correct locally available capability using authoritative workflow state — v1.3 (Phase 23)
- ✓ Prevent execution for explanatory, hypothetical, quoted, negated, prohibited, ambiguous, or unsafe requests — v1.3 (Phase 23, eight-disposition classifier + approval gate)
- ✓ Analyze bounded local outcome signals to recommend missing, unhealthy, stale, or reusable capabilities — v1.3 (Phase 24)
- ✓ Surface only high-confidence startup observations and one prioritized `/router suggestion` — v1.3 (Phase 25)
- ✓ Preserve prompt-time determinism, latency, privacy, and guarded mutation controls — v1.3 (Phase 26, warm p95 <25ms, max route <100ms, context 194B <2048B)

### Active

(None — v1.3 requirements shipped. v1.3.1 release-gate hardening items are tracked in STATE.md Deferred Items; fresh requirements will be defined via `/gsd-new-milestone`.)

### Out of Scope

- Per-prompt LLM classifiers — violate latency, privacy, and token goals.
- Unbounded autonomous mutation — all changes require deterministic validation and rollback.
- Automatic installation of missing external capabilities — discovery may recommend, but installation remains an explicit operation.
- Replacing users' preferred frameworks — GSD, Gstack, Graphify, context-mode, and other collections are examples or discoverable capabilities, never required Router assumptions.
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
| Treat each user's installed `.claude` and `.codex` capabilities as authoritative | Router must work with personalized and unknown future setups | — Pending |
| Resolve natural-language actions through inferred contracts, not hard-coded command names | Equivalent workflows may use different commands, agents, or frameworks | — Pending |
| Allow automatic dispatch only for explicit execute intent after state and safety checks | Convenience must not turn explanations, examples, negations, or uncertainty into actions | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-28 after v1.3 milestone ship*
