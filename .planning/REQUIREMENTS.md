# Requirements: Claude Router v1.2

**Defined:** 2026-07-14
**Core Value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## v1.2 Requirements

### Canonical Registry

- [ ] **REG-01**: One canonical schema represents Claude and Codex capabilities with stable identities.
- [ ] **REG-02**: Full rebuilds discover supported skills, plugin skills, agents, commands, hooks, bindings, scopes, and dependencies.
- [ ] **REG-03**: Incremental and full rebuilds produce identical canonical registries.

### Runtime Adapters

- [ ] **ADP-01**: The Claude adapter covers global, plugin, agents-store, and project-scoped inventory.
- [ ] **ADP-02**: The Codex adapter covers skills, plugins, agents, hooks, configuration, and project scope.

### Change Detection

- [ ] **CHG-01**: Add, edit, rename, move, disable, dependency-change, and delete events are classified correctly.
- [ ] **CHG-02**: Filesystem changes are detected within 2 seconds and missed events within 5 minutes.

### Safety and Reconciliation

- [ ] **SAF-09**: Missing or deleted targets cannot remain activatable through aliases or schema exceptions.
- [ ] **SAF-10**: Hook files and bindings are reconciled as orphan-file, orphan-binding, or valid pairs.

### Mapping and Activation

- [ ] **MAP-01**: Deterministic mapping runs before any background ambiguity resolver.
- [ ] **MAP-02**: Unsafe or ambiguous candidates are quarantined without changing the active registry.
- [ ] **ACT-01**: Passing candidates activate through an atomic version pointer and support rollback.

### Context Recovery

- [ ] **CTX-01**: Context capsules persist the active goal, workflow position, artifacts, blockers, and freshness without raw prompt history.
- [ ] **CTX-02**: Minimal prompts such as `continue` resume a uniquely identifiable workflow without restating context.

### Workflow Orchestration

- [ ] **ORC-01**: Workflow selection precedes skill, command, agent, MCP, and tool selection.
- [ ] **ORC-02**: Explicit user instructions override stale or conflicting capsule state.

### Token Efficiency

- [ ] **TOK-01**: Default routing loads no full manifest, planning directory, conversation history, or complete design document.
- [ ] **TOK-02**: Each workflow enforces a declared context budget and reuses unchanged artifact summaries.

### Evolution and Reliability

- [ ] **EVO-05**: Privacy-safe telemetry canary-tests weight and signal changes and rolls back regressions.
- [ ] **REL-01**: Warm routing p95 is below 25ms and every measured route remains below 100ms.

## Future Requirements

- Cross-machine synchronization of canonical registries and context capsules.
- Automatic installation or removal of third-party capabilities.
- Shared multi-user policy and approval workflows.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-prompt external LLM classifier | Violates latency, privacy, and token constraints |
| Unbounded self-modification | Evolution must remain canary-tested and reversible |
| Automatic third-party installation | Discovery and recommendation do not imply installation authority |
| Full prompt-history persistence | Context capsules store structured state, not raw conversation text |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REG-01 | Phase 11 | Pending |
| REG-02 | Phase 11 | Pending |
| ADP-01 | Phase 11 | Pending |
| ADP-02 | Phase 11 | Pending |
| REG-03 | Phase 12 | Pending |
| CHG-01 | Phase 12 | Pending |
| CHG-02 | Phase 12 | Pending |
| SAF-09 | Phase 13 | Pending |
| SAF-10 | Phase 13 | Pending |
| MAP-02 | Phase 13 | Pending |
| MAP-01 | Phase 14 | Pending |
| ACT-01 | Phase 14 | Pending |
| CTX-01 | Phase 15 | Pending |
| CTX-02 | Phase 15 | Pending |
| ORC-02 | Phase 15 | Pending |
| ORC-01 | Phase 16 | Pending |
| TOK-01 | Phase 16 | Pending |
| TOK-02 | Phase 16 | Pending |
| EVO-05 | Phase 17 | Pending |
| REL-01 | Phase 17 | Pending |

**Coverage:**
- v1.2 requirements: 20 total
- Mapped to primary implementation phases: 20
- Cross-phase verification: Phase 18 covers all 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-14*
*Last updated: 2026-07-14 after approved design and implementation plan*
