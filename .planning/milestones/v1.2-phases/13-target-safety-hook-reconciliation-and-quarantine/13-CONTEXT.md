# Phase 13: Target Safety, Hook Reconciliation, and Quarantine - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Prevent missing, deleted, ambiguous, invalid, or untrusted Claude and Codex capabilities from becoming dispatchable. Reconcile hook files with bindings, quarantine unsafe candidates without changing the active registry, and emit actionable non-dispatchable verdicts. Deterministic mapping, activation pointers, and rollback mechanics remain Phase 14 work.

</domain>

<decisions>
## Implementation Decisions

### Deleted targets and aliases
- **D-01:** When a target disappears, every alias that resolves to it becomes non-dispatchable in the same reconciliation cycle. Diagnostic history may remain, but no stale alias may remain activatable.
- **D-02:** A rename or move may transfer an old alias only when stable identity and source evidence verify that the new record is the same capability. A content fingerprint or similar name alone is insufficient; uncertain continuity is quarantined.
- **D-03:** An alias resolving to a malformed or non-invocable record fails closed. Its structured verdict identifies the alias and target identity, states the failure reason, and explains the corrective action. It must not fall back implicitly to a same-name target in another runtime or scope.
- **D-04:** Invalidation is atomic across the complete alias set for a deleted target. The system must never expose a partially updated alias set; if reconciliation cannot commit the full invalidation safely, the active registry remains unchanged.

### Agent's Discretion
- Exact verdict schema, reason-code vocabulary, diagnostic retention format, and internal alias-index representation, provided they preserve D-01 through D-04 and the roadmap's structured-verdict requirement.
- Exact policies for dependency, permission, scope, collision, ambiguity, and hook-pair verdicts were not separately discussed. Planning may use established project patterns and the phase success criteria, but must not weaken fail-closed dispatch safety or auto-register untrusted hooks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone requirements and phase boundary
- `.planning/ROADMAP.md` §Phase 13 — Goal, success criteria, and the three planned safety slices.
- `.planning/REQUIREMENTS.md` §Safety and Reconciliation and §Mapping and Activation — SAF-09, SAF-10, and MAP-02 requirements; Phase 14 boundary for MAP-01 and ACT-01.
- `.planning/PROJECT.md` §Current Milestone — Last-known-good, quarantine, lightweight-runtime, and automatic-reconciliation goals.

### Inherited registry and change-detection decisions
- `.planning/phases/11-canonical-registry-and-runtime-adapters/11-CONTEXT.md` — Stable identity, separate scope records, project precedence, provenance, deterministic bytes, and lightweight implementation constraints.
- `.planning/phases/12-incremental-change-detection-and-watcher/12-CONTEXT.md` — Lifecycle classification, identity continuity, full/incremental equivalence, watcher repair, and diagnostic boundaries inherited by reconciliation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry/diff.mjs`: Already classifies confirmed removals, renames, moves, and uncertain possible matches using canonical identity, shared origin, or native identity evidence. Its non-authoritative `possible_match` diagnostic is the natural boundary for quarantine instead of alias transfer.
- `src/registry/schema.mjs`: Already enforces lifecycle, dispatchability, dependency availability, portable provenance, conflict severities, and deterministic canonical serialization.
- `src/registry/build.mjs`: Already merges runtime variants, synthesizes conflicts, applies scope precedence annotations, and computes deterministic registry fingerprints.
- `src/registry/identity.mjs`: Provides stable scope-aware capability identity and canonical content fingerprints.
- `tests/router.route-targets.test.mjs`: Existing fail-closed route-target tests cover missing dependencies and warning routes that must not imply dispatch.

### Established Patterns
- Registry assembly is deterministic and uses stable serialization and fingerprints; reconciliation must preserve byte-for-byte active-state checks.
- Full and incremental builds share the same assembly path, while dirty roots are refreshed through bounded adapter discovery.
- Missing dependency and invalid invocation states are represented as non-dispatchable rather than repaired through implicit fallback.
- Global, project, and worktree identities remain distinct; applicable project records may take precedence without collapsing identity.

### Integration Points
- Add reconciliation after lifecycle diff and candidate registry construction, before any Phase 14 mapping or activation step.
- Alias validation must consume canonical IDs and lifecycle evidence from `src/registry/diff.mjs`, then gate all route-target resolution surfaces atomically.
- Structured quarantine diagnostics should extend the existing portable diagnostics model while excluding machine-local paths from canonical bytes.
- Hook reconciliation will connect adapter-discovered hook files and bindings, but must classify orphan files and orphan bindings without synthesizing trusted registrations.

</code_context>

<specifics>
## Specific Ideas

- Treat verified stable-identity continuity plus source evidence as the only automatic bridge across rename or move events.
- Preserve diagnostic history for removed aliases while removing all dispatch authority immediately.
- Make the corrective action part of every fail-closed alias verdict so quarantine is operationally useful, not merely a rejection label.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 13-Target Safety, Hook Reconciliation, and Quarantine*
*Context gathered: 2026-07-15*
