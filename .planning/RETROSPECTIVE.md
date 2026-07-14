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
