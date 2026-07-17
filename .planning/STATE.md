---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Autonomous Dual-Runtime Control Plane
current_phase: 18
status: completed
stopped_at: context exhaustion at 81% (2026-07-17)
last_updated: "2026-07-17T19:21:22.690Z"
last_activity: 2026-07-17
last_activity_desc: Phase 18 complete
progress:
  total_phases: 10
  completed_phases: 7
  total_plans: 41
  completed_plans: 37
current_phase_name: autonomous-lifecycle-and-release-gates
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-14)

**Core value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead and sub-100ms routing.
**Current focus:** Phase 18 — autonomous-lifecycle-and-release-gates

## Current Position

Phase: 18
Plan: Not started
Status: All phases complete
Last activity: 2026-07-17 — Phase 18 complete

Progress: [██████████] 97%

## Performance Metrics

**Velocity:**

- Total plans completed: 37
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

### Pending Todos

None yet.

### Blockers/Concerns

None. v1.1 closeout must remain committed before Phase 11 implementation begins.

### Roadmap Evolution

- Phase 19 added: Close gap: TOK-02 + ORC-01 — wire orchestrator {select,transitions,budget} into publish-index.mjs + prompt-route.mjs live path and deployed bundle
- Phase 20 added: Close gap: EVO-05 — add production trigger for canary-controller (watcher/CLI/release-runner) so telemetry drives canary promotion + rollback

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Future | Cross-machine registry and capsule synchronization | Deferred | v1.2 planning |
| Future | Automatic third-party capability installation/removal | Out of scope | v1.2 planning |

## Session Continuity

Last session: 2026-07-17T19:21:22.682Z
Stopped at: context exhaustion at 81% (2026-07-17)
Resume file: .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-CONTEXT.md
