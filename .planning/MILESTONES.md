# Milestones

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
