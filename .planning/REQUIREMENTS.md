# Requirements: Claude Router v1.9

**Defined:** 2026-08-09
**Core Value:** The user can trust that the Router release proven in isolation is the release actually operating safely in their Claude and Codex homes.

## v1 Requirements

### Live Installer Truth

- [x] **LIVE-01**: An operator can capture the current Claude and Codex manifests, hooks, controller state, active tuple, and owned mutable files before an upgrade without persisting raw prompts.
- [x] **LIVE-02**: The existing installer upgrades the current owned Router bundle into both supported runtime homes and records the exact source and installed fingerprints.
- [x] **LIVE-03**: Upgrade preserves unrelated user configuration, coexisting hooks, plugins, and user-owned files, with conflicts failing closed before mutation.
- [x] **LIVE-04**: Rollback, uninstall, interruption recovery, and last-known-good restoration pass against the live owned state without leaving orphaned Router artifacts.

### Native Runtime Health

- [ ] **HEALTH-01**: Claude and Codex controllers reach a truthful ready state with current registry, candidate, active-tuple, and reconciliation evidence after upgrade.
- [ ] **HEALTH-02**: A capability mutation is detected and reconciled under normal native watching and when native watching reports resource exhaustion, with bounded fallback behavior.
- [ ] **HEALTH-03**: Safe live-runtime smoke actions prove host-native invocation identity, completion, verification, and receipt linkage for both supported runtimes.
- [ ] **HEALTH-04**: Installed module hashes, ownership markers, manifests, active tuples, and controller projections are mutually consistent and independently inspectable.

### Outcome and Graph Observability

- [ ] **OBS-01**: Telemetry correlates runtime, selected capability, native invocation, outcome, receipt, and verification state without storing raw prompt text.
- [ ] **OBS-02**: Runtime logs distinguish selected, ignored, rejected, substituted, completed, failed, and accepted outcomes instead of emitting null outcome fields for verified smoke actions.
- [ ] **OBS-03**: Every graph-missing telemetry record is either resolved by an available local graph or classified with an actionable bounded reason and remediation state.
- [ ] **OBS-04**: Audit, telemetry, shadow, controller, and release logs remain parseable, privacy-safe, and bounded without depending on ordinary unstructured log files.

### Production Acceptance and Release Truth

- [ ] **ACC-01**: Live Claude and Codex UAT covers install, upgrade, startup, safe native invocation, reconciliation, rollback, and recovery while preserving user-owned state.
- [ ] **ACC-02**: Focused safety checks and the full serial repository suite pass after live-runtime changes, with native resource constraints included in the evidence.
- [ ] **ACC-03**: Release preflight reconciles live installed evidence, repository tests, evaluation, security, archive, roadmap, and peeled tag equality before v1.9 is claimed.
- [ ] **ACC-04**: The prompt path remains deterministic, private, and below the 100 ms hard ceiling; no LLM classifier, network service, daemon, database, embeddings store, or second Router is introduced.

## Future Requirements

### Advanced Operations

- **FUTR-01**: Automated fleet-wide deployment and remote observability across multiple machines.
- **FUTR-02**: Per-root adaptive polling or event-stream backends selected from measured fleet-scale performance.

## Out of Scope

| Feature | Reason |
|---------|--------|
| New semantic workflows or capability-ranking behavior | v1.8 routing behavior is already released; v1.9 proves live operation. |
| Remote telemetry, hosted dashboards, or external log shipping | Violates the local privacy and zero-service architecture. |
| Automatic installation of missing third-party capabilities | Installation remains an explicit owner operation. |
| Database, daemon, embeddings service, network classifier, or second watcher/router | Existing local JSON artifacts and one bounded watcher remain sufficient. |
| Unbounded automatic live mutation | Every live change must use the owned installer, backup, validation, and rollback gates. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| LIVE-01 | Phase 56 | Complete |
| LIVE-02 | Phase 56 | Complete |
| LIVE-03 | Phase 56 | Complete |
| LIVE-04 | Phase 56 | Complete |
| HEALTH-01 | Phase 57 | Pending |
| HEALTH-02 | Phase 57 | Pending |
| HEALTH-03 | Phase 57 | Pending |
| HEALTH-04 | Phase 57 | Pending |
| OBS-01 | Phase 58 | Pending |
| OBS-02 | Phase 58 | Pending |
| OBS-03 | Phase 58 | Pending |
| OBS-04 | Phase 58 | Pending |
| ACC-01 | Phase 59 | Pending |
| ACC-02 | Phase 59 | Pending |
| ACC-03 | Phase 59 | Pending |
| ACC-04 | Phase 59 | Pending |

**Coverage:**

- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-08-09*
*Last updated: 2026-08-09 after v1.9 milestone definition*
