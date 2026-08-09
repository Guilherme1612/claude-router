# Claude Router — Always-On, Self-Evolving Orchestration Layer

## What This Is

A global routing control layer that inventories Claude and Codex capabilities, identifies the user's goal and workflow state, and selects the most useful workflow, skills, agents, tools, and MCP integrations. It keeps prompt-time work deterministic and fast while moving discovery, reconciliation, and learning to guarded background processes.

## Core Value

The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## Current Milestone: v1.7 Runtime Safety and Release Truth (SHIPPED 2026-08-09)

**Goal:** Make the v1.6 control-plane capabilities real, bounded, reproducible, and releasable in installed Claude and Codex runtimes.

**Target features:**
- Dispatch and storage safety — atomically claim work, enforce resource bounds, contain lease/receipt paths, and preserve durable at-most-once behavior in both runtimes
- Production integration — wire and deploy proportional planning, causal learning, migration, dispatch, and their transitive dependencies to Claude and Codex
- Validation and release integrity — repair deterministic regressions, complete Nyquist evidence, prove installed-runtime behavior, and make archive/tag state reproducible

**v1.7 completed and release-verified on 2026-08-09.** Phases 47-49 passed their safety, production-integration, validation, installed-runtime, audit, archive, and release gates. All 15 v1.7 requirements are satisfied; external publication remains owner-controlled.

## Current State

**v1.4 shipped and verified on 2026-07-31.** Router closes the mode-map coverage gap: cache versioning folds `weightsMtime`, `routeTargetsExist` guards every cache hit against stale targets, and `capRouteRender` hard-caps injection counts before any curation could poison a cached route or creep latency (Phase 27, SAF-01..04); every manifest rebuild produces a typed coverage report classifying every capability into an `expected_*` taxonomy with bi-directional orphan detection, report-before-failure strict CI gating, and a fail-open freshness reminder in the hook (Phase 28, COV-01..05); and the curated schema-v3 mode-map ships 18 lifecycle/design skill routes with output-type-anchored signal patterns, canonical collision lint, and a zero-wrong-high 0.591/0.291/0.191 confidence tuple re-derived from an expanded 58-record calibration set (Phase 29, MAP-01..03, SIG-01..04).

**All 3 phases (27–29) verified passed — 16/16 requirements satisfied, 101/101 milestone-focused tests pass, integration checker PASS, Nyquist fully compliant.** Milestone audit verdict `passed`. Remaining items are bounded maintenance risks (reverse-gap baseline maintenance, T_high sensitivity re-run on corpus change) plus pre-existing Phase 26 environment issues (lifecycle readiness timeout on real-home checkout, reinstall-verb teardown race, flaky perf suites under load, manifest hook-count drift). Evolution weight tuning (FUT-05..07) remains deferred — `signal_patterns` expansion was the safer primary lever and shipped.

**v1.5 completed and release-verified on 2026-08-02.** Phases 30–36, 32.1, and 37.1 passed their review, security, Nyquist, verification, integration, and release gates. The installed controller is ready with one owned watcher, the active and known-good release tuple is healthy, and recommendation-only candidates are never promoted without safe dispatch targets.

**v1.6 "Autonomous Control Plane" shipped and verified on 2026-08-08.** Phases 38–43 establish native Claude/Codex dispatch, independent authority and risk gates, durable scoped leases, trusted capability contracts, semantic composition, and proportionate production dispatch. Phases 44–46 add stable causal receipts, truthful outcome credit, isolated deterministic local learning with exact calibrated thresholds and reversible canaries, plus fail-closed v1.5 migration and dual-runtime release evidence. All 42 v1.6 requirements are satisfied; the milestone audit found no critical gaps. Repository-wide baseline lifecycle/install/recovery/performance/watcher failures remain tracked as technical debt.

## Last Milestone: v1.4 Coverage Completeness & Auto-Skill Routing Improvement (SHIPPED 2026-07-31)

**Goal:** No manifest skill/command/agent goes unnoticed by the router, and the right skill is auto-suggested more often — dropping rework from mis-routed tasks further.

**Target features:**
- Coverage audit-guard — automated check that flags any manifest skill/command/agent with no mode-map entry; rerun on manifest rebuild to prevent drift
- Curate high-value unmapped modes — add mode-map entries for unmapped gsd-* workflow modes (ship, new-project, execute-phase, quick, validate-phase, verify-work, resume-work, complete-milestone, etc.) and design skills (brandkit, minimalist-ui, industrial-brutalist-ui, image-to-code, imagegen-frontend-*, redesign-existing-projects, stitch-design-taste, excalidraw-diagram, gpt-taste)
- Signal_patterns expansion — broaden trigger keywords on existing and new mode-map entries so prompt signals match canonical modes more reliably
- Evolution tuning — telemetry-driven weights adjustment so repeated/similar prompts route sharper over time

**Delivered:** Mutation safety infrastructure (SAF-01..04), deterministic coverage audit-guard (COV-01..05), and mode-map curation + signal-pattern expansion (MAP-01..03, SIG-01..04) — 8 plans, 19 tasks, all verified. Audit verdict `passed`. See [v1.4-MILESTONE-AUDIT](milestones/v1.4-MILESTONE-AUDIT.md).

**Next milestone goals:** address remaining tech debt — deterministic reverse-gap baseline maintenance, T_high sensitivity re-run on corpus change, and the deferred v1.3.1 release-gate hardening items (BLOCKER 2 live-install release verification, orphaned temp-dir watchers, router.safety-release live-env failures, watcher-reconcile activation confirmation). Start with `/gsd-new-milestone` after fresh requirements.

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
- ✓ Mutation safety infrastructure — cache versioning folds mode-map/manifest/weights mtimes, stale cached targets never served, warm p95 <40ms / every route <100ms, injection render + mode-map size caps — v1.4 (Phase 27, SAF-01..04)
- ✓ Coverage audit-guard — atomic post-manifest typed coverage report, bi-directional orphan detection, strict CI failure with explicit baseline, fail-open one-line stale reminder — v1.4 (Phase 28, COV-01..05)
- ✓ Mode-map curation — 18 lifecycle/design routes with live+synthetic validation and missing-MCP warning-only safety — v1.4 (Phase 29, MAP-01..03)
- ✓ Signal patterns expansion — output-type-anchored patterns (1-6/entry), schema v3 contains semantics, canonical collision lint with explicit groups, thresholds re-derived to 0.591/0.291/0.191 — v1.4 (Phase 29, SIG-01..04)
- ✓ Intent-first framework-neutral resolve lists and guard-hole closure — v1.5 (ROUTE-01..05)
- ✓ Content-addressed inventory epochs, cache/calibration invalidation, and watcher noise narrowing — v1.5 (INVC-01..05)
- ✓ Per-install calibration and privacy-safe suggestion outcomes — v1.5 (CALIB-01..05)
- ✓ Claude/Codex runtime parity and runtime-local resolution — v1.5 (PARITY-01..04)
- ✓ Cwd-scoped project routing and fingerprint participation — v1.5 (PROJ-01..03)
- ✓ Live install, cold-start, lifecycle, and release-gate hardening — v1.5 (REL-08..10)
- ✓ Cross-runtime native dispatch feasibility — real native invocation + attributable completion receipt on Claude and Codex via a router-owned adapter off the prompt hot path (fire-and-forget unref), cross-runtime equivalence with byte-identical stdout_sha256, truthful recommendation-only fallback (no silent downgrade), warm p95 <25ms / max <100ms prompt budget, read-only/fail-open invariants, dispatch layer shipped in the deploy bundle — v1.6 (Phase 38, HOST-01..04)
- ✓ Intent/authority/risk invocation policy — advice, inspection, one-turn action, persistent-goal action, and non-authorizing discussion distinguished before capability execution; quotations/examples/negations/hypotheticals/audits/policy discussion never widen authority (incl. autonomous wording); confidence/authority/risk/compatibility shown independent (confidence/history never grant permission); explicitly-authorized reversible local action proceeds after fit validation without a repeated command while conflicting/low-fit evidence blocks or asks; protected/external/privileged/destructive/credentialed/costly/published/deployed/scope-expanding effects pause for host-mediated confirmation — v1.6 (Phase 39, AUTH-01..05)
- ✓ Project identity, leases, continuity, and safe resume — v1.6 (Phase 40, LEASE-01..06)
- ✓ Manifest trust, typed invocation validation, pre-dispatch contracts, and quarantine — v1.6 (Phase 41, TRUST-01..05)
- ✓ Semantic graph resolution and contract-compatible substitution — v1.6 (Phase 42, SEM-01..04)
- ✓ Proportional planning and production dispatch — v1.6 (Phase 43, STRAT-01..04)
- ✓ Causal receipts and compact selected-versus-actual attribution — v1.6 (Phase 44, RCPT-01..05)
- ✓ Deterministic local learning with calibrated evidence gates and reversible rollback — v1.6 (Phase 45, LEARN-01..04)
- ✓ Atomic migration, lifecycle scope, and dual-runtime release verification — v1.6 (Phase 46, MIG-01..05)

### Active

- Dispatch work is atomically claimed once and bounded by enforced time/output/resource contracts.
- Lease and receipt state is private, contained, race-safe, and cross-runtime equivalent.
- Strategy, learning, migration, and dispatch have production callers and ship in both installed runtime bundles.
- Learning and migration use unique, protected, durable evidence rather than caller-attested booleans.
- Repository, installed-runtime, Nyquist, audit, roadmap, archive, and tag evidence agree before release.

### Out of Scope

- Per-prompt LLM classifiers — violate latency, privacy, and token goals.
- Unbounded autonomous mutation — all changes require deterministic validation and rollback.
- Automatic installation of missing external capabilities — discovery may recommend, but installation remains an explicit operation.
- Replacing users' preferred frameworks — GSD, Gstack, Graphify, context-mode, and other collections are examples or discoverable capabilities, never required Router assumptions.
- Invoking hooks as task tools — hooks remain event-bound lifecycle mechanisms.

## Context

The user often provides intentionally short instructions. Prompt text alone is therefore insufficient: routing must combine prompt signals with repository state, GSD phase state, recent actions, runtime availability, dependency health, and safety policy. The prompt hook must remain a compiled/read-only consumer; filesystem scanning, hashing, validation, and learning belong in an incremental background control plane.

The approved design and implementation plan are:

- `docs/superpowers/specs/2026-08-09-router-v1.7-runtime-safety-release-truth-design.md`
- `docs/superpowers/specs/2026-08-02-router-v1.6-autonomous-control-plane-design.md`
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
| Ship mutation safety rails before any mode-map/weights mutation | Cache poisoning and latency creep must be impossible before curation ships | ✓ Good |
| Ship coverage audit-guard before curation | The audit's high_value_unmapped ranking tells curation which gaps to fill | ✓ Good |
| Couple mode-map curation with signal_patterns expansion in one phase | New entries need patterns; patterns need collision lint + threshold re-tune on the expanded set | ✓ Good |
| Defer evolution weight tuning (FUT-05..07) | Highest research flag; signal_patterns expansion is the safer primary lever | ✓ Good |
| Keep all v1.4 mutation work off the hot path (builder + curated mode-map overlay) | Hot path stays semantically unchanged; fail-open, <100ms, no-API-call intact | ✓ Good |
| Make runtime-aware resolve the sole production suggestion source | Prevent foreign or dead runtime capabilities from reaching injected context | ✓ Good |
| Enforce tie/stale resolve-list lint at strict build time | Keep near-ties and unresolvable routes from shipping silently | ✓ Good |
| Measure the live resolve-first hook path separately from the resolver helper | Ensure the latency gate certifies rendered production behavior, not only helper speed | ✓ Good |
| Preserve a verified release tuple when a recommendation-only candidate has no safe dispatch target | Safety beats forced activation; the last-known-good compiled route remains authoritative | ✓ Good |
| Treat deployed gate fixtures and helper-directory cleanup as installer-owned lifecycle state | Installed release evidence must be executable and uninstall must remove all owned artifacts | ✓ Good |
| gateAction composes OVER resolveAction (thin post-processor); blocked/clarify pass through unchanged with policy attached for telemetry | Preserve the 22 existing actions tests; keep the authority gate additive rather than re-implementing the dispatch gate | ✓ Good |
| authority.mjs loaded via top-level await with fail-open null sentinel; router never emits decision:'block' (block policies produce no hint) | Hot path stays <100ms, read-only, fail-open; a missing/stale policy module never blocks a prompt | ✓ Good |

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
*Last updated: 2026-08-09 after v1.7 milestone closeout*
