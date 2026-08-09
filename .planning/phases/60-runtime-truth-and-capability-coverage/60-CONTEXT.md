# Phase 60: Runtime Truth and Capability Coverage - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Make the existing off-hot-path registry, coverage audit, reconciliation, and watcher publication provide truthful, current, runtime-local knowledge of Claude and Codex capabilities. Unavailable, stale, incompatible, excluded, project-scoped, hook-owned, missing-MCP, or otherwise non-selectable records remain inspectable with reasons but cannot become route targets.

</domain>

<decisions>
## Implementation Decisions

### Fail-closed runtime truth
- Preserve native runtime identity, provenance, locator, scope, availability, eligibility, and deterministic reason codes; equivalent display names must not merge Claude and Codex records.
- Keep coverage, reconciliation, root scanning, hashing, and watcher publication off `src/runtime/router.mjs` and the prompt hot path.
- Treat stale, incomplete, unreadable, removed, unavailable, invalid, quarantined, project-scoped, hook-owned, explicitly excluded, and missing-MCP records as visible diagnostics that are not actionable route gaps or dispatchable targets.
- Require full and incremental registry builds, watcher mutations, and activation evidence to converge on the same canonical semantics; do not retain an old dispatchable route when current root truth is unknown.

### Bounded privacy-safe evidence
- Publish only bounded counts, fingerprints/epochs, classifications, root diagnostics, reason codes, and reconciliation/activation dispositions; never persist raw prompts, capability bodies, session bodies, telemetry bodies, or unbounded logs.
- Preserve independent privacy, token-budget, reconciliation, regression, and incremental-equivalence gates.
- Represent an empty dispatchable inventory as a valid truthful zero-target state without fabricating a fallback route or installing anything automatically.

### the agent's Discretion
Use the existing registry schema, eligibility, adapters, watcher, activation, and test-fixture conventions. Make the minimum compatible changes needed to satisfy CAP-01 and CAP-02; do not add a second registry, database, daemon, network classifier, embeddings store, framework-specific route, or external installation path.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry/schema.mjs`, `eligibility.mjs`, `map.mjs`, `contract.mjs`, `activate.mjs`, and `build.mjs` already define canonical records, eligibility gates, target resolution, evidence envelopes, publication invariants, and full/incremental assembly.
- `src/coverage/audit.mjs` already owns off-hot-path inventory coverage and legacy mapped-target compatibility.
- Claude and Codex adapters provide runtime-specific observation categories and native locator shapes; existing anonymous inventory fixtures support deterministic tests.

### Established Patterns
- Keep output deterministic and byte-stable: stable identity, sorted reason codes, bounded evidence, and explicit classification/disposition fields.
- Reuse canonical eligibility and reconciliation reason codes rather than creating parallel safety authority.
- Prove behavior with focused serial Node tests, `git diff --check`, and full/incremental fixture comparisons.

### Integration Points
- Adapter observations flow through registry assembly into canonical capability identity, eligibility, coverage classification, reconciliation, watcher publication, and activation.
- Dirty-root, removal, and rename/move handling must converge with full discovery while preserving truthful active authority.
- All changes stay in registry/coverage/watcher/validation paths and their tests; prompt routing remains unchanged.

</code_context>

<specifics>
## Specific Ideas

Phase 60 uses the prepared plans `60-01` and `60-02`, covering canonical coverage/reconciliation truth first and bounded watcher publication plus incremental convergence second. Existing v1.9 live evidence establishes zero dispatchable capabilities as a valid state.

</specifics>

<deferred>
## Deferred Ideas

None — use later phases for plain-language intent recognition, workflow coordination, interaction verification, evaluation, and release work.

</deferred>
