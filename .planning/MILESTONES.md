# Milestones

## v1.4 Coverage Completeness & Auto-Skill Routing Improvement (Shipped: 2026-07-31)

**Phases completed:** 3 phases, 8 plans, 19 tasks

**Key accomplishments:**

- SAF-01/02/04 hot-path guards wired: cacheKey folds weightsMtime, routeTargetsExist guards cache hits against stale targets, capRouteRender hard-caps render counts before formatInjection — all observable via routing_version telemetry and decision_trace
- Deterministic typed coverage auditing with baseline-safe orphan diagnostics and atomic report publication at the manifest build seam
- Report-before-failure strict coverage gating plus a metadata-only, fail-open freshness reminder in the installed prompt hook
- Three focused RED suites lock mixed pattern validation, portable 18-target routing, and safety-first threshold calibration before production changes
- One contains-only v2/v3 normalizer now feeds BM25, validation, proposals, injected inspection fixtures, and build-audit diagnostics
- Schema-v3 mode-map with 18 portable lifecycle/design skill routes, unique output-anchored evidence, and warning-only missing-MCP safety
- Production-inspected 58-record calibration with a zero-wrong-high 0.591/0.291/0.191 confidence tuple, deterministic sensitivity evidence, and green installed-runtime release gates

---

## v1.3 Adaptive Local Capability Steward and Intent-Native Routing (Shipped: 2026-07-28)

**Phases completed:** 6 phases, 31 plans, 57 tasks

**Key accomplishments:**

- Framework-neutral inventory records now preserve native evidence, scope, lifecycle, dependency, and compound provenance while preventing inert or unknown artifacts from gaining invocation authority.
- Claude and Codex adapters now enumerate personalized known and future capability types through a shared inert normalization boundary, with cycle-safe canonical traversal and portable per-root completeness evidence.
- Path-separated identities, exact one-to-one continuity, and deterministic reference closure now prevent stale dispatch authority across every required inventory mutation.
- Byte-exact semantic convergence now separates watcher operations from complete inventory authority, retaining last-known-good state across incomplete scans and failed reconciliation.
- Bounded read-only inventory inspection now exposes exact operational state, safe stable-ID provenance, and framework-neutral semantic availability through matching plain-text and canonical JSON contracts.
- Portable full-path fallback identities and exact-source continuity assertions now match the approved Phase 21 identity contract without changing production code.
- Deterministic field-level capability contracts with privacy-safe evidence, canonical bytes, and fail-closed recommendation-only uncertainty
- Versioned optional overlays now correct only exact installed contracts, while unsafe or stale inputs remain deterministic, privacy-safe, and inert.
- Bounded canonical relationship edges with type-specific evidence gates and lifecycle-safe reverse invalidation.
- One bounded evaluator now derives all dispatch gates, rejects authored authority, and preserves visible recommendation-only reasons for every unsafe or unknown state.
- The existing router CLI now explains bounded contract evidence, uncertainty, rejected overlays, typed relationships, eligibility, and correction paths without exposing authored values or mutating active state.
- Validated contracts are now built for every authoritative record before exact overlays, while absent safety evidence deterministically blocks dispatch eligibility.
- 8-layer dispatch tracer (intent → action → state → transition → capability → approval → closure → next-prompt) shipped as four framework-neutral stdlib-only modules with a 14-test green suite, plus the full 8-disposition intent classifier matrix
- Adversarial intent corpus (minimal pairs, nested quotes, multilingual abstention, unsafe targets) + action mapper expanded to debug/create-phase verbs with the full blocked/clarify reason-code vocabulary, all framework-neutral via contract-only authority
- Approval gate wired (needsApproval / bindApproval / verifyApproval with three-leg fail-closed: missing → stale → mismatch → bound) and the full EXEC-05/06/09/10 dispatch matrix composed at the boundary — destructive-with-approval dispatches, destructive-without/stale/mismatch fail closed, post-work next-prompt re-reads fresh state, all framework-neutral (grep gsd- = 0)
- 1. [Rule 1 - Bug] Fixed `syncSync` is not a `node:fs` export
- 1. [Rule 2 - Missing critical functionality] Added `priorWorkflowState` to the cursor shape
- 1. [Rule 3 - Blocking] Inlined MIN_CONFIDENCE=8500 rather than exporting it from relationships.mjs
- 1. [Rule 1 - Bug] passed published_version: null to applyCanaryDecision (not activePolicyVersion)
- Deterministic one-item advisory selection with stable semantic identity and atomic private interaction state
- Fresh exact approval creates one immutable private draft and only then reveals the complete remediation preview, without install or publication authority
- One canonical suggestion command family with exact-fingerprint interactions and approval-gated, preview-only draft creation
- Atomic off-path suggestion availability with one fixed bounded startup read and one approved metadata-free notice
- 1. [Rule 1 - Bug] Corrected the regression fixture at the actual trust boundary
- All v1.3 decision artifacts now publish under one content identity while the real prompt path consumes one hash-bound, read-only projection.
- Registry reconciliation now invalidates all decision dependencies deterministically while full and incremental builds publish the same pre-validated tuple value.
- Complete routing tuples now remain old-or-new across every publication boundary and restart repairs interrupted pointer transitions from verified immutable known-good bytes.
- The existing installer now records and proves an 18-cell runtime/recommendation compatibility matrix using actual deployed Claude and Codex module bytes.
- A deterministic 312-record registry now proves installed Claude and Codex routing across all six recommendation kinds with strict isolated latency and context budgets.
- One matrix-driven runner now proves all nine v1.3 requirements with fresh installed-runtime, lifecycle, authority, regression, latency, and context evidence while preserving v1.2 compatibility.

---

## v1.2 Autonomous Dual-Runtime Control Plane (Shipped: 2026-07-23)

**Phases completed:** 10 phases, 46 plans, 93 tasks

**Key accomplishments:**

- Canonical dual-runtime registry (Claude + Codex) with evidence-gated identities, SHA-256 fingerprints, bounded native YAML/TOML parsing, and versioned plugin-cache discovery — one stable runtime-neutral inventory. (Phase 11)
- Incremental change detection: portable Merkle-style fingerprint tree + single-flight watcher drive inactive reconciliation with deterministic repair/restart/rollback; incremental builds byte-identical to clean full builds. (Phase 12)
- Target safety + hook reconciliation via exact portable full-outer-join; unsafe alias sets invalidated atomically; shared inactive quarantine boundary never touches last-known-good active state. (Phase 13)
- Deterministic mapping, frozen eight-gate verifier, atomic version-pointer activation, cross-process CAS, crash-recoverable rollback journal; prod-verifier E2E exercised. (Phase 14)
- Privacy-safe bounded context capsules recover authoritative workflow state; minimal referential prompts resume exactly one active workflow, clarify ambiguity, honor explicit overrides. (Phase 15)
- Workflow-first orchestration resolves the next valid transition before any capability; pure workflow-gated context planner enforces hard byte ceilings, versioned token estimates, three-witness summary reuse. (Phase 16)
- Compiled prompt routing + safe canary evolution: SHA-256 verified immutable projections gate the live seam; REL-01 latency gates pass (warm p95 15.63ms <25, max route 22.98ms <100). (Phase 17)
- Autonomous lifecycle + release gates: five-verb coexistence (install/upgrade/reinstall/disable+enable/uninstall), D-04/05/06 recovery matrix, release-runner gate_results; one command proves all 20 v1.2 requirements from executable evidence. (Phase 18)
- ORC-01/TOK-02 live-path closure: orchestrator {select, transitions, budget} baked into publish-index as per-workflow sibling tuples (schema 1→2); prompt-route.mjs read-only projection with dispatch_eligible gate; blanket ORC-01 fallback removed. (Phase 19)
- EVO-05 production trigger: telemetry→evidence bridge drives canary promote/rollback via watcher (primary), router-control CLI, and release-runner; CR-01 path-traversal + CR-02 rollback-reason defects closed. (Phase 20)

**Verification:** 20/20 requirements satisfied and WIRED end-to-end; 5/5 E2E flows COMPLETE; cross-phase integration 20/20. Audit passed (re-audit HEAD 9868298). Tech debt: v2 per-prompt source descriptors deferred, WR-01 latent v2 publish-index bug, parallel-install-test flakiness (serialize with --test-concurrency=1), stale installed hook snapshot (re-run install-router.mjs).

---

## v1.1 Inspectable Routing Control Layer (Shipped: 2026-07-14)

**Phases completed:** 6 phases, 23 plans, 30 tasks

**Key accomplishments:**

- 1. [Rule 1 - Bug] Avoided MCP/plugin skill name-collision false positive
- 1. [Rule 2 - Missing Critical Functionality] Made direct warn entries scoreable
- 1. [Rule 3 - Blocking Issue] Updated calibration harness count guard
- Node test contract for router inspect, preview, cache/graph diagnostics, and privacy-preserving explain-last behavior.
- Shared router inspectDecision helper with read-only dry-run defaults and JSON inspect/preview adapters.
- Inspect and preview CLI dispatch hardened with JSON usage errors, explicit dry-run mutation metadata, and deterministic preview mutation tests.
- `router explain-last` now reports the latest valid telemetry decision with structured route metadata and an explicit raw-prompt-unavailable privacy contract.
- Inspect/preview diagnostics now expose every INS-04 debugging branch, and calibration uses the shared dry-run helper through a narrow adapter.
- Phase 07 RED contract tests now lock the helper export and JSON CLI behavior for router health, routes, unmapped inventory, and coverage utilities.
- Runtime coverage and route-target diagnostics now come from exported router helpers instead of duplicated test-local logic.
- Routes and unmapped operator commands now expose stable read-only JSON for route health, ranked useful gaps, and next-fix guidance.
- `router doctor` and `router coverage` now provide read-only operator health JSON with category coverage, blocked runtime dependencies, metadata-only telemetry status, and concrete next fixes.
- Phase 07 health, routes, unmapped, and coverage utilities validated with focused tests, full suite, calibration, and hot-path performance gates.
- Executable CAL-01 through CAL-09 codebase-routing contract with explicit 5/7 target enforcement and structured miss taxonomy output
- Final Phase 08 validation confirmed expanded codebase routing at 8/8 while preserving original 10/10 calibration and hot-path performance.
- Failing-first Node test coverage now locks evolution visibility, proposal privacy, and read-only advisory behavior for EVO-01 through EVO-04.
- Read-only telemetry proposal mode now returns advisory mode-map suggestions from metadata without mutating router data or leaking prompt/downstream text.
- Node test release matrix proving router fail-open behavior, hot-path latency, no external classifier path, and operator CLI isolation.

---

## v1.0 Claude Router MVP (Shipped: 2026-07-09)

**Phases completed:** 4 phases, 14 plans, 19 tasks

**Key accomplishments:**

- Installed a pure-stdlib global `UserPromptSubmit` router hook that fails open, respects explicit overrides, coexists with caveman, and keeps warm routing under the v1 latency target.
- Shipped the reviewed `mode-map.json` and confidence-tiered injection path for gsd workflows, skills, agents, MCP warnings, and ralph-loop guardrails.
- Added graphify-aware routing for codebase prompts, including graph context formatting, route+graph token caps, and graph mtime cache invalidation.
- Added telemetry-driven evolution: weight blending, outcome correlation, mutation proposals, calibration gates, status reporting, and bounded telemetry rotation.
- Reused `gsd-surface` as the authoritative surface/profile primitive and closed the cache invalidation advisory by folding surface profile mtime into the route cache key.

---
