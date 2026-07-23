# Milestone Retrospectives

## v1.1 — Inspectable Routing Control Layer

**Shipped:** 2026-07-14  
**Scope:** Phases 5–10, 23 plans, 42 requirements

### What Worked

- Operator commands made routing decisions, coverage gaps, blocked dependencies, and evolution state directly inspectable.
- Shared dry-run routing logic reduced drift between live routing, calibration, and diagnostic output.
- Focused safety tests turned fail-open, latency, privacy, coexistence, and missing-MCP behavior into executable release gates.
- Independent phase verification and the milestone audit closed planning-state drift before archival.

### What Could Improve

- Inventory freshness still depends on explicit rebuilds; additions and removals are not reconciled automatically.
- Claude and Codex inventories do not yet share one canonical schema or lifecycle.
- Short prompts such as `continue` need durable workflow-state recovery, not prompt-only matching.
- Advisory evolution does not yet apply validated, reversible changes automatically.

### Decisions Carried Forward

- Keep prompt-time routing deterministic, local, and under 100ms.
- Move scanning, hashing, reconciliation, and learning to a background controller.
- Require validation, quarantine, rollback, and last-known-good artifacts for every automatic mutation.
- Measure token cost and workflow success, not only route-match accuracy.

### Next Milestone

Build the Autonomous Dual-Runtime Control Plane described in the approved design and implementation plan, continuing at Phase 11.

## v1.2 — Autonomous Dual-Runtime Control Plane

**Shipped:** 2026-07-23
**Scope:** Phases 11–20, 46 plans, 93 tasks, 20 requirements
**Timeline:** 2026-07-14 → 2026-07-22 (8 days, 214 commits)

### What Was Built

- Canonical dual-runtime registry (Claude + Codex) with evidence-gated SHA-256 identities and bounded native parsing.
- Incremental change detection: Merkle fingerprint tree + single-flight watcher → inactive reconciliation, byte-identical to clean builds.
- Fail-closed target safety, hook full-outer-join reconciliation, inactive quarantine.
- Deterministic mapping, eight-gate verifier, atomic activation, cross-process CAS, crash-recoverable rollback.
- Privacy-safe context capsules + workflow-state recovery for short prompts (`continue`).
- Workflow-first orchestration: transition resolved before capabilities; least-sufficient bounded context.
- Compiled prompt routing + canary evolution; REL-01 gates pass (warm p95 15.63ms, max 22.98ms).
- Autonomous lifecycle: five-verb coexistence, recovery matrix, release-runner gates.
- Phase 19: ORC-01/TOK-02 live-path closure (orchestrator baked into publish, read-only route projection).
- Phase 20: EVO-05 production trigger (telemetry→evidence → canary promote/rollback).

### What Worked

- Re-verification caught two false-positive "passed" audits (EVO-05 telemetry-bridge orphaned, ACT-01 prod-verifier E2E missing) and forced real gap-closure phases (19, 20) instead of shipping on stale evidence.
- Locked design contracts (19-ORCHESTRATOR-INPUT-DECISION.md, workflow-declarations.json) let Plans 02/03/04 implement against a frozen tuple shape without re-deciding mid-execution.
- The opt-in `test_mode` seam kept the production hot path untouched while lifecycle tests drove the real watcher→controller→publishCompiledIndex flow.
- Three-source cross-reference for requirements (REQUIREMENTS.md ↔ VERIFICATION.md ↔ SUMMARY frontmatter) made coverage gaps unhideable.

### What Was Inefficient

- Re-audit cycle: the audit's integration checker ran against stale code state, forcing a superseding re-audit after the fix landed. Audit evidence should be regenerated against current HEAD before verdict.
- Parallel-install-test flakiness across 5 lifecycle suites from node:test concurrency races — required `--test-concurrency=1` workaround rather than a root cause fix.
- Installed hook snapshot drifted (Jul 16) ahead of Phase 17–20 commits, producing 14/720 pre-v1.2 full-suite failures that were env-drift, not code defects — re-sync step is manual.
- Plan one-liner extraction pulled junk rows (dates, review-rule labels) into MILESTONES.md, requiring manual curation.

### Patterns Established

- Decimal/closure phases (19, 20) inserted after cross-cutting Phase 18 to close audit BLOCKERs — keep phase numbering continuous, never restart.
- Per-workflow sibling tuple files (closure.json/budget.json/summary-index.json) frozen at publish time; route path is a read-only projection, never re-derives.
- `dispatch_eligible` flag carries blocked results forward in v1 rather than blocking the budget — v2 deferral pattern that preserves v1 correctness.
- Telemetry→evidence→canary is the canonical evolution trigger surface (watcher primary, CLI operator, release-runner).

### Key Lessons

- A "passed" audit is only as good as the code state it ran against — re-run integration checks against current HEAD before milestone close.
- Test concurrency races masquerade as flaky product code; isolate lifecycle/install suites that share a controller.
- Keeping the hook import graph closed (zero new imports, inlined version constants) is a hard constraint worth the manual-sync hazard it costs.
- Re-verification is a feature: surfacing false positives late is cheaper than shipping orphaned wiring.

### Tech Debt Carried Forward

- v2 per-prompt source descriptors (Phase 19).
- WR-01: `publish-index.mjs:87-92` hardcodes `position.state='planned'` (latent v2).
- `compile-index.mjs:5-6` inlined `CONTEXT_CONTRACT_VERSION` (manual sync, D-08).
- Serialize parallel install/lifecycle test suites.
- Re-sync `~/.claude/hooks/router.mjs` via `install-router.mjs`.

### Next Milestone

v1.3 not yet planned. Run `/gsd-new-milestone`.
