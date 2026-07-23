# Phase 12: Incremental Change Detection and Watcher - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect and classify additions, edits, renames, moves, disables, dependency changes, permission changes, scope changes, and deletions across supported Claude and Codex inventory roots. Produce deterministic incremental registry builds that are byte-equivalent to clean full builds, observe normal filesystem changes within two seconds without duplicate processing, and repair missed events within five minutes including after controller restart. Target validation, quarantine, mapping, activation, rollback, context recovery, and prompt-time consumption remain in later phases.

</domain>

<decisions>
## Implementation Decisions

### Lifecycle classification and identity continuity
- **D-01:** When strong identity evidence proves continuity across a rename or move, emit one explicit `renamed` or `moved` lifecycle event. Preserve the canonical capability ID and carry both old and new provenance.
- **D-02:** When a single mutation changes both path and content while strong identity evidence remains, emit one compound rename or move event with `content_changed` details rather than duplicate ordered events.
- **D-03:** When rename or move evidence is too weak to preserve identity, classify deterministically as remove-plus-add. Retain the weak correlation only as a non-authoritative possible-match diagnostic; it must not establish continuity.
- **D-04:** When one observation changes multiple lifecycle dimensions, emit one event with a deterministic primary classification and ordered secondary facets. Preserve every changed dimension without duplicate processing.

### Planner's Discretion
- Exact primary-classification precedence, facet field names, diagnostic shape, fingerprint algorithm, and internal diff representation are left to research and planning, provided they preserve D-01 through D-04 and deterministic serialization.
- Incremental merge mechanics, watcher implementation details, and persisted scan-state format remain open within the approved timing, equivalence, restart, lightweight Node.js, and prompt-hook separation constraints.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved v1.2 design and implementation
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — Defines filesystem watching, periodic fingerprint repair, diff categories, strong rename evidence, control-plane separation, and incremental/full-build equivalence.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — Defines the Phase 12 module boundaries, focused tests, 250 ms debounce, five-minute repair interval, and three-plan decomposition.

### Project and phase contracts
- `.planning/PROJECT.md` — Defines the v1.2 goals, prompt-time separation, performance, safety, compatibility, privacy, and lightweight architecture constraints.
- `.planning/REQUIREMENTS.md` — Defines REG-03, CHG-01, and CHG-02 and assigns them to Phase 12.
- `.planning/ROADMAP.md` — Defines the Phase 12 boundary, success criteria, dependencies, and separation from Phases 13-18.
- `.planning/phases/11-canonical-registry-and-runtime-adapters/11-CONTEXT.md` — Locks identity continuity, provenance, deterministic portable bytes, scope separation, diagnostics, and lightweight installation decisions inherited by Phase 12.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry/build.mjs`: Existing deterministic `buildFullRegistry(options)` orchestration, stable serialization, registry fingerprinting, diagnostics, and adapter-output merge; Phase 12 extends this surface with incremental construction.
- `src/registry/identity.mjs`: Existing stable identity and content-fingerprint primitives; the diff engine should reuse its identity contract rather than create a second continuity model.
- `src/registry/schema.mjs`: Existing canonical validation and lifecycle-state schema; incremental results must remain valid and serialize identically through this contract.
- `src/adapters/claude.mjs` and `src/adapters/codex.mjs`: Existing bounded discovery, parsing, normalization, source fingerprints, logical roots, and provenance used to create observed inventory snapshots.
- `src/lifecycle/router-lifecycle.mjs`: Existing atomic writes, file-fingerprint checks, dry-run/install lifecycle, and full-registry build integration provide reusable operational patterns without placing work in prompt hooks.
- `tests/router.registry-build.test.mjs`, `tests/router.adapters.test.mjs`, and `tests/router.registry-schema.test.mjs`: Existing temporary-root fixtures and deterministic byte assertions form the Phase 12 regression base.

### Established Patterns
- Tests use Node's built-in test runner, temporary roots, and dependency injection; watcher timing should be verified with fake clocks or controllable scheduling rather than slow wall-clock sleeps.
- Portable registry bytes contain logical roots and normalized relative paths, not machine-specific absolute paths.
- Discovery and reconciliation run in the background control plane. The prompt router remains deterministic, read-only, local, and fail-open.
- Candidate construction and diagnostics do not activate router state; safety validation and atomic activation belong to Phases 13 and 14.
- The project favors Node.js standard-library capabilities and a small install surface over daemon frameworks, databases, or heavyweight dependency trees.

### Integration Points
- Add `src/registry/fingerprint.mjs` for deterministic directory fingerprints and persisted scan state.
- Add `src/registry/diff.mjs` for lifecycle classification and identity-continuity evidence.
- Extend `src/registry/build.mjs` with incremental merge and removal semantics that remain byte-equivalent to `buildFullRegistry`.
- Add `src/registry/watcher.mjs` for debounced events, duplicate suppression, shutdown, restart recovery, and periodic repair.
- Extend `install-router.mjs` only for background watcher/controller configuration; do not add synchronous prompt-hook scanning.

</code_context>

<specifics>
## Specific Ideas

- Prefer a single explainable lifecycle event over multiple synthetic events for one observed mutation.
- Preserve weak rename correlations for diagnostics without allowing them to change canonical identity.
- Model compound changes as a primary classification plus deterministically ordered facets so downstream processing runs once while explanations remain complete.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-incremental-change-detection-and-watcher*
*Context gathered: 2026-07-15*
