---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Autonomous Dual-Runtime Control Plane
status: Awaiting next milestone
stopped_at: context exhaustion at 77% (2026-07-23)
last_updated: "2026-07-23T14:13:26.222Z"
last_activity: 2026-07-23
last_activity_desc: Milestone v1.2 completed and archived
progress:
  total_phases: 10
  completed_phases: 10
  total_plans: 37
  completed_plans: 37
current_phase: 20
current_phase_name: close-gap-evo-05-add-production-trigger-for-canary-controlle
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-14)

**Core value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead and sub-100ms routing.
**Current focus:** Phase 20 — close-gap-evo-05-add-production-trigger-for-canary-controlle

## Current Position

Phase: Milestone v1.2 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-23 - Completed quick task 260723-l9s: Codex router binding + v1.2 gate 6 fix + test/snapshot/WR-01/housekeeping/push batch

## Performance Metrics

**Velocity:**

- Total plans completed: 46
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 11. Canonical Registry and Runtime Adapters | 0 | 3 | - |
| 11 | 6 | - | - |
| 12 | 4 | - | - |
| 13 | 3 | - | - |
| 14 | 7 | - | - |
| 15 | 3 | - | - |
| 16 | 4 | - | - |
| 17 | 5 | - | - |
| 18 | 5 | - | - |
| 19 | 4 | - | - |
| 20 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: none
- Trend: Not started

| Phase 11 P06 | 3min | 2 tasks | 3 files |
| Phase 12 P01 | 124min | 2 tasks | 3 files |
| Phase 12 P02 | 5min | 2 tasks | 2 files |
| Phase 12 P03 | 31min | 2 tasks | 6 files |
| Phase 13 P01 | 8min | 2 tasks | 3 files |
| Phase 13 P02 | 7min | 2 tasks | 4 files |
| Phase 13 P03 | 14min | 2 tasks | 9 files |
| Phase 14 P01 | 5min | 2 tasks | 7 files |
| Phase 14 P02 | 15min | 3 tasks | 7 files |
| Phase 14 P03 | 18min | 2 tasks | 6 files |
| Phase 15 P01 | 12min | 2 tasks | 2 files |
| Phase 16 P01 | 3min | 2 tasks | 2 files |
| Phase 16 P02 | 8min | 2 tasks | 2 files |
| Phase 16 P03 | 4min | 2 tasks | 2 files |
| Phase 17 P01 | 6min | 3 tasks | 4 files |
| Phase 17 P02 | 5min | 3 tasks | 3 files |
| Phase 17 P03 | 16min | 3 tasks | 5 files |
| Phase 17 P03 | 16 | 3 tasks | 5 files |
| Phase 17 P05 | 9min | 3 tasks | 3 files |
| Phase 18 P02 | 10min | 2 tasks | 5 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 18 P04 | ~90m | 3 tasks | 7 files |
| Phase 18 P05 | 120m | 2 tasks | 10 files |
| Phase 19 P01 | 2min | 2 tasks | 4 files |
| Phase 19 P02 | 7min | 2 tasks | 5 files |
| Phase 19 P03 | 4min | 2 tasks | 4 files |
| Phase 19 P04 | 95min | 4 tasks | 11 files |
| Phase 20 P01 | ~20min | 3 tasks | 6 files |
| Phase 20 P02 | ~25min | 3 tasks | 5 files |
| Phase 20 P02 | 36min | 3 tasks | 6 files |
| Phase 20 P04 | ~2min | 1 tasks | 2 files |
| Phase 20 P05 | 8min | 1 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md and the approved design.

- [v1.2]: Keep prompt-time routing deterministic and read-only; run discovery, reconciliation, and learning in the background control plane.
- [v1.2]: Use one canonical registry with Claude and Codex adapters, immutable versions, quarantine, and rollback.
- [v1.2]: Select workflow before capabilities and inject only least-sufficient bounded context.
- [Phase 11]: Installed YAML and TOML subsets use bounded deterministic standard-library grammars. — Preserves the zero-dependency contract while accepting representative native artifacts.
- [Phase 11]: Versioned plugin provenance is derived from portable logical relative paths only. — Prevents absolute path disclosure while preserving origin, package, and version evidence.
- [Phase 12]: Lifecycle precedence is structural, removed/added, disabled, scope, dependency, declared permission, then content.
- [Phase 12]: Only canonical identity, authoritative shared origin, or compatible native identity establishes continuity; similarity remains diagnostic-only.
- [Phase 12]: Read and access failures preserve uncertainty for the affected portable path and cannot confirm deletion or permission lifecycle change.
- [Phase 12]: Full and incremental registry builds share assembleRegistry and differ only at acquisition. — Prevents canonical merge, precedence, diagnostic, and fingerprint drift.
- [Phase 12]: Incremental acquisition verifies lifecycle diff integrity and replaces only evidence-named logical-root slices. — Fails closed on tampered lifecycle inputs while preserving bounded read-only rebuilding.
- [Phase 12]: Filesystem notifications are hints only; complete portable scans remain the persisted baseline authority. — Prevents partial or notification-derived state from replacing deterministic scan truth.
- [Phase 12]: Controller readiness requires matching configuration fingerprint, fresh heartbeat, live PID, and ready state. — Spawn success alone cannot prove that the installed owned controller is operational or correctly configured.
- [Phase 13]: Reconciliation canonicalizes and hashes candidates without writing or activating them.
- [Phase 13]: Alias continuity requires stable identity plus compatible portable source evidence.
- [Phase 13]: Any malformed candidate or incomplete alias-set evaluation quarantines while preserving exact active bytes and fingerprint.
- [Phase 13]: Whole-candidate gates inspect every record rather than only changed lifecycle records.
- [Phase 13]: Required permissions are satisfied only by explicit grants; ambient or undeclared authority is rejected.
- [Phase 13]: The watcher publishes only inactive candidates and reports while active bytes remain read-only evidence.
- [Phase 13]: Hook pair identity is exact runtime, scope, event, and contained portable target reference.
- [Phase 13]: Only bounded tokenized command forms are normalized; arbitrary shell syntax is rejected rather than interpreted.
- [Phase 13]: A valid pair is inactive inventory consistency evidence and never registration or activation authority.
- [Phase 14]: Mapping authority is explicit metadata, stable identity, authoritative inheritance, lexical evidence, then bounded advisory re-entry.
- [Phase 14]: Every mapping target is revalidated solely against the exact supplied candidate before dispatch.
- [Phase 14]: Only the frozen eight-gate producer can create trusted activation evidence; test overrides use an explicit test-only factory. — Prevents caller-fabricated production gate outcomes.
- [Phase 14]: Immutable version identity derives from the full canonical bundle digest and active authority changes only through active.json replacement. — Keeps history immutable and makes authority atomic.
- [Phase 14]: All operator renderers consume one canonical result with stable reason codes and exit taxonomy. — Keeps human and automation output semantically identical.
- [Phase 14]: Rollback requires the exact immutable destination ID and delegates solely to executeRollback. — Preserves one mutation authority and rejects blanket confirmation.
- [Phase 14]: Claude and Codex receive the same importable owned module closure while mutable authority stays in controller-owned state. — Provides dual-runtime controls without treating installation as activation.
- [Phase 15]: Workflow identity excludes human-readable labels. — Stable continuity derives from canonical scope, goal identity, position, and status.
- [Phase 15]: Capsule retention is active plus one validated LKG. — Corrupt bytes remain private and event history is not recovery state.
- [Phase 16]: Workflow transitions are frozen data records evaluated only from bounded authoritative evidence.
- [Phase 16]: Explicit intent narrows already-valid transitions and can never manufacture or reopen one.
- [Phase 16]: Material ties remain non-dispatchable and produce one bounded deterministic question.
- [Phase 16]: Capability and registry traversal requires one complete dispatch-eligible workflow token.
- [Phase 16]: Workflow owners and requirements are the only closure roots; lexical prompt resemblance is never an edge.
- [Phase 16]: Hooks remain lifecycle bindings while models and permissions are reported separately from invokable capabilities.
- [Phase 16]: Canonical Phase 16 source maxima are enforced as policy ceilings; workflow contracts may only be stricter. — Locked Phase 16 least-sufficient context contract.
- [Phase 16]: Required overflow blocks without truncation while optional overflow is omitted in semantic priority and canonical identity order. — Locked Phase 16 least-sufficient context contract.
- [Phase 16]: Summary reuse requires exact canonical identity, freshness witness, and summary-contract version equality. — Locked Phase 16 least-sufficient context contract.
- [Phase 17]: Compiled prompt state uses exact-address active and bounded known-good metadata with full compatibility and SHA-256 validation. — Preserves deterministic bounded reads without inventory enumeration.
- [Phase 17]: Missing compatible compiled state is non-dispatchable and never invokes an uncompiled slow path. — Fails closed while preserving stable structured routing outcomes.
- [Phase 17]: Evidence rejects forbidden fields before hashing or persistence and suppresses signatures after privacy denial. — Prevents content from crossing the bounded evolution boundary through storage or digest side channels.
- [Phase 17]: Project and aggregate evidence remain isolated with seven-day retention, 24-hour decay, and a 30-sample floor. — Prevents cross-project contamination, stale dominance, and low-volume promotion.
- [Phase 17]: Canary evaluation requires every independent hard gate and never mutates publication authority. — A weighted score cannot compensate for a safety regression and evaluation remains reproducible.
- [Phase 17]: Calibration expectations use canonical resume and clarify resolver outcomes rather than unreachable labels. — Keeps fixed-corpus quality evidence truthful to the adopted Phase 15 and Phase 17 routing contract.
- [Phase 18]: Installation authority is one active generation pointer over complete immutable generation manifests. — Prevents mixed-version bootstrap and controller observations.
- [Phase 18]: Release tuple repair validates known-good bytes through the bounded tuple reader before replacing active authority. — Corrupt durable state never becomes dispatch authority.
- [Phase ?]: Opt-in test_mode/verification_runners seam is default-off; production hot path unchanged when seam not engaged
- [Phase ?]: In-process controller launcher reattaches function-valued verification_runners from on-disk config (functions cannot cross process boundaries via JSON)
- [Phase ?]: D-06 startup repair uses parseable-but-unverifiable active.json pointer so the release-tuples branch falls back to known-good without broadening the hot-path I/O footprint
- [Phase ?]: [Phase 19 P01]: workflowDeclarations source = new static file src/orchestrator/workflow-declarations.json read via relative path from publishCompiledIndex (no new param, watcher call site unchanged) [ASSUMED]
- [Phase ?]: [Phase 19 P01]: Per-workflow synthetic evidence shape {status:active,freshness:fresh,position:{family,state:planned},gates:{plan_approved:true},dependencies_safe:true} copied verbatim from tests/router.workflow-orchestrator.test.mjs:12-21 [ASSUMED]
- [Phase ?]: [Phase 19 P01]: Bake BOTH nextValidTransitions candidate set AND selectWorkflow selected transition per family; route path filters candidates by live capsule position.state via pure read [ASSUMED]
- [Phase ?]: [Phase 19 P01]: Sibling tuple shape = {schema_version:1, by_workflow:{<workflow_id>:{...}}} per-workflow keyed maps mirroring routes?.[workflowId] projection surface
- [Phase ?]: [Phase 19 P01]: Manifest extended with closure/budget/summary_index payload_sha256 (V6 integrity gate); verifyTuple hash-checks siblings to close T-19-01 tampering threat
- [Phase ?]: [Phase 19 P01]: COMPILED_INDEX_COMPATIBILITY extended with orchestrator_contract_version + context_contract_version; schema 1->2 invalidates prior tuples (watcher re-publishes via recovery)
- [Phase ?]: [Phase 19 P01]: Per-prompt budget estimation (estimateRoutingTokens on hot path) DEFERRED to v2 per D-03; dispatch_eligible flag baked at publish from planContextLoad result
- [Phase ?]: Plan 02 implemented 19-ORCHESTRATOR-INPUT-DECISION.md verbatim: compile-index schema 1->2 with sibling hash verification (T-19-01), publish-index orchestrator wiring baking closure/budget/summary-index siblings, D-06 fallback deletion (ORC-01), D-03 dispatch_eligible baking (TOK-02)
- [Phase ?]: [Rule 1] Fixed plan step 4e bug: planContextLoad closure arg was closureResult.closure (array) instead of closureResult (object); safeClosure expected the object shape
- [Phase ?]: Phase 19 P03: bundle manifest ships orchestrator/select.mjs+transitions.mjs+budget.mjs+workflow-declarations.json (D-07); prompt-route.mjs is read-only sibling projection (D-01/D-02) with baked dispatch_eligible gate (D-03 TOK-02 hot-path closure); D-08 preserved (no new hook imports)
- [Phase ?]: Phase 19 P03: sibling read shape = compiledIndex.<sibling>?.by_workflow?.[workflowId] (sibling files are {schema_version, by_workflow:{...}} objects per Decision 4; route path must dereference by_workflow to project per-workflow)
- [Phase ?]: Flow 11 dispatch_eligible PASS infeasible in v1 (sources:[] hardcoded); v2 backstop documented
- [Phase ?]: TOK-02 required-overflow E2E variant deferred to Phase 20/v2 (requires per-prompt source descriptors)
- [Phase ?]: Extended release-matrix validator with per-label secondary evidence schema (Rule 3: plan's verbatim acceptance criteria required both grep and validator pass)
- [Phase ?]: Privacy-denied telemetry records skipped BEFORE envelope construction (deny_filtered tier OR PRIVACY_GUARDS code in guards_fired) — not just signature-nullied.
- [Phase ?]: Extracted computeWeightedSamples as shared helper across in-memory + persistent evidence stores to prevent decay-math divergence (D-07/D-08 contract).
- [Phase ?]: verdict hardcoded to 'success' v1 (telemetry outcome is null; regression detected by calibration gates, not per-record verdicts).
- [Phase ?]: test_mode bypasses canary evidence gate so lifecycle tests exercise the real seam without evidence infrastructure; production canary gate fully active.
- [Phase ?]: D-05 demonstrated_benefit derived via evaluateCalibrationCorpus on candidate + known-good; strict-improve on quality OR context_budget; latency hard gate; never promote on parity.
- [Phase ?]: 20-02: Watcher eligible-activation routes through canary-controller with D-04 helper + D-05 derivation + D-06 compatible() export (EVO-05 production trigger; audit BLOCKER 2 closed for watcher surface).
- [Phase ?]: 20-02: test_mode bypasses the canary evidence gate (production never sets test_mode; fail-closed contract preserved in production) so lifecycle/recovery seam tests exercise the watcher->controller->compiled-index path.
- [Phase ?]: CR-01 closed: reset recovered flag per reconcile call (moved declaration into reconcile body) so the watcher's production canary trigger runs on EVERY eligible reconcile, not just the first.
- [Phase ?]: Replaced the dead-code line-337 ternary (both branches null) with a plain let knownGood = null; initializer — the recovery block populates knownGood correctly.
- [Phase ?]: Added Test 8 multi-reconcile regression test: calls reconcile() TWICE and asserts applyCanaryDecision runs on both calls — the canonical CR-01 guard that single-call tests cannot catch.
- [Phase ?]: 20-05: CR-02a canary promote --execute gates on window.sufficient before applyDecision (insufficient evidence preserves, no surprise rollback); CR-02b passes rollback_reason='canary_rollback' to applyCanaryDecision so audit trail distinguishes canary rollback from registry rollback

### Pending Todos

None yet.

### Blockers/Concerns

None. v1.1 closeout must remain committed before Phase 11 implementation begins.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260723-l9s | Codex router binding + v1.2 gate 6 fix + test/snapshot/WR-01/housekeeping/push batch | 2026-07-23 | 9e045a1 | [260723-l9s-codex-wiring-gate6](./quick/260723-l9s-codex-wiring-gate6/) |

### Roadmap Evolution

- Phase 19 added: Close gap: TOK-02 + ORC-01 — wire orchestrator {select,transitions,budget} into publish-index.mjs + prompt-route.mjs live path and deployed bundle
- Phase 20 added: Close gap: EVO-05 — add production trigger for canary-controller (watcher/CLI/release-runner) so telemetry drives canary promotion + rollback

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Future | Cross-machine registry and capsule synchronization | Deferred | v1.2 planning |
| Future | Automatic third-party capability installation/removal | Out of scope | v1.2 planning |

## Session Continuity

Last session: 2026-07-23T14:13:26.203Z
Stopped at: context exhaustion at 77% (2026-07-23)
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
