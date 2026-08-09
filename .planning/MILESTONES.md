# Milestones

## v1.8 Adaptive Semantic Routing and Continuity (Shipped: 2026-08-09)

**Phases completed:** 6 phases, 12 plans, 5 tasks

**Key accomplishments:**

- Anonymous Claude/Codex inventory scenarios now materialize into validated temporary roots and prove explicit runtime-local discovery without live-home leakage or equal-count assumptions.
- Declared-first portable capability contracts now fail closed on critical unknowns and classify every retained Claude/Codex record exactly once.
- Structured semantic workflows, least-sufficient composition, scoped preferences, truthful continuity, and causal native receipts now run through one bounded production route.
- Claude and Codex independent evaluators pass, the current-source isolated installer is byte-parity clean across both runtimes, and the native serial repository gate passes 1593/1593.
- Resource-exhaustion watcher recovery now uses fingerprint polling for EMFILE/ENOSPC; release preflight reconciles native evidence without a composite score.

**Known follow-up:** The live Claude installation is stale, the live Codex home has no current install manifest, telemetry outcomes are null, and graph-missing records remain observable. These are deployment/observability follow-ups, not hidden release claims.

---

## v1.7 Runtime Safety and Release Truth (Shipped: 2026-08-09)

**Phases completed:** 3 phases, 9 plans, 0 tasks

**Key accomplishments:**

- Dispatch and storage safety: durable at-most-once claims, bounded workers, and private path containment.
- Production integration: strategy, learning, migration, and dual-runtime dispatch closure.
- Validation and release integrity: serial full-corpus proof, installed parity, audit, archive, and tag gates.

---

## v1.6 Autonomous Control Plane (Shipped: 2026-08-08)

**Phases completed:** 9 phases, 20 plans, 11 tasks

**Key accomplishments:**

- 1. [Rule 1 - Bug] Worker entrypoint isMain() used fileURLToPath instead of pathToFileURL
- 1. [Rule 1 - Bug] pause/resume idempotency blocked resume (claude.mjs + codex.mjs)
- 1. [Rule 3 - Blocking] Lifecycle test deployed-file count assertion broke (231 -> 259)
- Pure-function authority.mjs shipping AUTH-01 5-class taxonomy + AUTH-02 framing guard + AUTH-03 sealed-input policy evaluator, layered over classifyIntent without editing it, deployed to both runtimes via the lifecycle bundle
- gateAction composing over resolveAction + shared PROTECTED_EFFECT_TOKENS + router.mjs hot-path policy wiring + dispatch receipt field threading — AUTH-04/05 enforced at the dispatch boundary and observable on the suggestion path, fail-open preserved
- Contract envelope extended with provenance-class evidence states (explicit/inferred/conflicting/unknown) + 4 new fields, and a trust.mjs untrusted-evidence policy that prevents manifest/plugin/private/learned provenance from populating authority-critical fields
- validateInvocation (TRUST-03) and preDispatchGate (TRUST-04) added to dispatch/contract.mjs, wired into both claude.mjs and codex.mjs invokeImpl before spawn — blocked invocations return no-spawn receipts with attributable reason codes
- Per-capability quarantine disposition in evaluateEligibility with injection_bearing/scope_escaping/stale_unavailable reason codes, validateEligibility extended, RECEIPT_STATES gains 'quarantined' — independent valid fallbacks remain eligible (Pitfall 5 backstop)
- 1. [Rule 1 - Bug] Fixed non-deterministic diagnostic ordering breaking REG-03 byte-identical test
- 1. [Rule 1 - Bug] Fixed edge matching subjectId computation in semanticProjection
- Pure deterministic `planStrategy()` now selects bounded proportional execution strategies from authorized structured facts, with hard constraints evaluated before cost.

---

## v1.5 Framework-Neutral Adaptive Routing (Shipped: 2026-08-02)

**Phases completed:** 9 phases, 27 plans, 21 tasks

**Key accomplishments:**

- Content-sha256 manifest_fingerprint over semantic routing inputs (skills/agents/commands/plugins/mode-map/weights, timestamps excluded) emitted by build-manifest.mjs and folded into the hook's cacheKey as a fingerprint epoch — replacing the 7-position mtime fold so a no-op rebuild never invalidates the route cache while any semantic inventory change recomputes it.
- Task 1 — Noise ignore prefixes on watcher roots.
- Closed the calibration epoch-keying gap (INVC-03) with a fail-open `loadEpochCalibration()` that lets fingerprint-matched per-install thresholds win and mode-map defaults (0.591/0.291/0.191) win on every mismatch/absence/corruption, and documented + test-verified the full add/update/remove capability lifecycle (INVC-05) end-to-end.
- Wave-0 RED test infrastructure for Phase 31: runtime detection precedence spec, cross-runtime cacheKey divergence, telemetry runtime field, the 16-field OUTCOME_FIELDS bump guard, and the snapshot↔live-hook mirror-desync guard — holding every Phase-31 feature surface RED until plans 31-02/31-03 export the API.
- Tracer-first vertical slice that proves runtime detection end-to-end: the hook resolves its active runtime (claude|codex) once at module load with zero hot-path IO, and every data path (ROUTER_DIR, HOOKS_DIR, SURFACE_FILE, GSD_CORE_DIR and all children) now derives from a single runtime-conditional root instead of the hardcoded `.claude` — plus the install/builder honors a `ROUTER_RUNTIME` pin for Codex homes.
- PARITY-02 completion: the runtime is folded into the cache-key hashed identity (so a Claude-served route is never returned to a Codex session and vice versa), every telemetry record carries its active runtime field, and runtime/epoch land in the evidence schema via a deliberate 14→16 OUTCOME_FIELDS policy-version bump (HEALTH_POLICY_VERSION → v2) wired through the telemetry ingest — never a silent schema add (ROADMAP criterion 3).
- Runtime-scoped command indexes now feed resolver guard paths, with Claude/Codex isolation and flat-manifest fallback tests.
- Production slash injection now emits the active runtime's resolved capability, preserves authored tie order, and fails open on dead candidates.
- Strict coverage now enforces resolve-list hygiene while preserving resolvable routes with quarantined optional fallbacks.
- Live resolve-first performance coverage now measures route scoring, cache, guards, runtime resolution, and rendered injection, while retaining a distinct resolver microbenchmark.

---

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
