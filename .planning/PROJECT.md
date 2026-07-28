# Claude Router — Always-On, Self-Evolving Orchestration Layer

## What This Is

A global routing control layer that inventories Claude and Codex capabilities, identifies the user's goal and workflow state, and selects the most useful workflow, skills, agents, tools, and MCP integrations. It keeps prompt-time work deterministic and fast while moving discovery, reconciliation, and learning to guarded background processes.

## Core Value

The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## Current State

**v1.2 shipped and verified on 2026-07-23.** The router is now a guarded dual-runtime control plane: a canonical Claude + Codex capability registry with evidence-gated SHA-256 identities; incremental change detection via a portable Merkle-style fingerprint tree and single-flight watcher; fail-closed target safety, hook reconciliation, and inactive quarantine; deterministic mapping through a frozen eight-gate verifier into atomic version-pointer activation with cross-process CAS and crash-recoverable rollback; privacy-safe bounded context capsules that recover authoritative workflow state; workflow-first orchestration that resolves the next valid transition before selecting capabilities and loads only least-sufficient bounded context; compiled prompt routing with safe canary evolution; and an end-to-end autonomous lifecycle proving safe propagation, recovery, coexistence, and a full release matrix tying all 20 v1.2 requirements to executable evidence.

**All 10 phases (11–20) verified.** Phases 19–20 closed the two audit BLOCKERs surfaced in re-verification: ORC-01/TOK-02 live-path wiring (orchestrator baked into publish-index as per-workflow sibling tuples, schema 1→2, prompt-route.mjs read-only projection, blanket fallback removed) and EVO-05 production trigger (telemetry→evidence bridge drives canary promote/rollback via watcher, router-control CLI, and release-runner; CR-01 path-traversal and CR-02 rollback-reason defects closed). Milestone audit passed: 20/20 requirements satisfied and WIRED end-to-end, 5/5 E2E flows COMPLETE, REL-01 latency gates pass (warm p95 15.63ms <25, max route 22.98ms <100).

**v1.3 Phase 23 complete (2026-07-27):** Intent-Safe State-Aware Execution — three additive modules over the phases 21/22 pipeline: an eight-disposition intent classifier (`execute`/`explain`/`hypothetical`/`quoted`/`negated`/`prohibited`/`preview`/`ambiguous`, no `eval`/`Function` of prompt content), a framework-neutral action mapper (contract-only `workflow_transitions` authority, `type !== 'hook'` exclusion, debug/create-phase verbs, blocked/clarify reason codes), and an approval gate (SHA-256 fingerprint binding of args/targets/effects/proposalVersion, fail-closed on stale/mismatched/missing expected token). A four-gate dispatch path promotes the three existing gates (eligible + intent_permits + state_permits + approval_grants) rather than adding alongside. Code-review CR-01 (critical fail-open in `verifyApproval`) closed; 15/15 STRIDE threats mitigated (ASVS L1, `threats_open: 0`); focused suite 72/72, 0 new full-suite regressions. Pure modules + tests only — prompt-hook wiring deferred to Phase 26 (REL-01/REL-02).

## Current Milestone: v1.3 Adaptive Local Capability Steward and Intent-Native Routing

**Goal:** Make Router framework-agnostic, lightweight, locally adaptive, and able to turn explicit natural-language intent into the correct safe action using the capabilities actually installed in each user's `.claude` and `.codex` environments.

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

### Active

- [ ] Discover and continuously reconcile personalized Claude and Codex capabilities without ecosystem-specific assumptions.
- [ ] Infer safe, correctable capability contracts and compile them into the existing capability map.
- [ ] Route explicit natural-language action intent to the correct locally available capability using authoritative workflow state.
- [ ] Prevent execution for explanatory, hypothetical, quoted, negated, prohibited, ambiguous, or unsafe requests.
- [ ] Analyze bounded local outcome signals to recommend missing, unhealthy, stale, or reusable capabilities.
- [ ] Surface only high-confidence startup observations and one prioritized `/router suggestion`.
- [ ] Preserve prompt-time determinism, latency, privacy, and guarded mutation controls.

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
*Last updated: 2026-07-27 after Phase 23 (Intent-Safe State-Aware Execution)*
