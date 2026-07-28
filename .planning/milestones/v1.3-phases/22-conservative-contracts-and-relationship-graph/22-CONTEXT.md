# Phase 22: Conservative Contracts and Relationship Graph - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn every authoritative Phase 21 capability record into an inspectable, evidence-backed normalized contract and typed relationship graph. This phase decides whether a known installed capability is recommendation-only or dispatch eligible; natural-language intent classification and execution remain Phase 23 work.

</domain>

<decisions>
## Implementation Decisions

### Contract evidence and confidence
- Track evidence, provenance, inference-rule version, freshness, and confidence independently for every inferred field rather than assigning one confidence score to a whole capability.
- Represent missing, stale, conflicting, or below-threshold dispatch fields explicitly as `unknown`; never fill safety-relevant gaps with optimistic defaults.
- Use deterministic, versioned inference rules with integer basis-point confidence so identical authoritative inputs produce byte-identical contracts.
- Preserve rejected evidence and reason codes in inspectable output while excluding sensitive authored content and local secrets.

### Manifest and correction trust
- Treat manifests and approved corrections as optional overlays on an already discovered capability; an overlay cannot create a new installed identity.
- Validate overlays against a versioned schema and bind them to the exact stable capability ID, exact-source fingerprint, scope, and runtime.
- Invalidate corrections on identity or fingerprint change; carry them across a rename only when explicit, exact lineage evidence proves continuity.
- Keep invalid, stale, or mismatched overlays visible as rejected candidates with deterministic reason codes and no effect on dispatch eligibility.

### Relationship classification
- Store only the eight required typed edges: substitute, variant, prerequisite, composition, conflict, fallback, implementation, and alias.
- Require type-specific evidence; lexical or name similarity may propose a relationship but cannot by itself establish equivalence or aliasing.
- Model edges deterministically with source/target IDs, evidence, provenance, confidence, freshness, and validation state; invalidate dependent and transitive edges when an endpoint changes or disappears.
- Keep ambiguous or conflicting candidates inspectable and inactive rather than collapsing them into an untyped similarity link.

### Dispatch eligibility and inspection
- Compute dispatch eligibility fail-closed from one shared validator covering target existence, invocation shape, adapter support, dependency closure, permission, scope, side effects, reversibility, risk, and contract-field confidence.
- Eligibility is derived, never authored directly by a manifest or correction; any failed or unknown gate yields recommendation-only with stable reason codes.
- Expose normalized contracts, per-field evidence, rejected overlays, typed relationships, and correction paths through deterministic machine-readable output that the existing CLI can render.
- Extend the Phase 21 canonical registry and identity pipeline rather than introducing a parallel registry or framework-specific contract store.

### the agent's Discretion
- Exact module boundaries, filenames, compact output formatting, and confidence thresholds are at the agent's discretion, provided thresholds are versioned, deterministic, tested, and conservative.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry/schema.mjs` already validates canonical capability records, scopes, invocation availability, dependencies, provenance, diagnostics, and non-dispatchable inert types.
- `src/registry/map.mjs` already provides deterministic canonical collections, privacy-safe portable output, integer basis-point policy thresholds, evidence records, and fail-closed target safety reason codes.
- Phase 21 supplies stable capability IDs, exact-source fingerprints, normalized inventory, mutation invalidation, and byte-identical reconciliation as the authoritative input.

### Established Patterns
- Registry artifacts use versioned schemas, canonical ordering, bounded collections, stable serialization, and deterministic reason codes.
- Safety decisions fail closed: unavailable invocation, non-ready lifecycle, missing dependencies, scope mismatch, or blocking conflicts prevent dispatch.
- Authored capability text is untrusted evidence and privacy-safe CLI output uses explicit allowlists rather than dumping registry records.

### Integration Points
- Extend the registry schema/build/map/reconcile flow so contracts and edges are derived from the activated authoritative candidate map.
- Reuse Phase 21 identity and fingerprint continuity for overlay binding and invalidation.
- Add focused `node:test` coverage beside existing registry/inventory tests and expose inspection through the existing router control/registry CLI boundary.

</code_context>

<specifics>
## Specific Ideas

Prefer boring canonical JSON artifacts and existing registry helpers. The central invariant is visible uncertainty: Router must explain why a target is recommendation-only without guessing missing safety facts.

</specifics>

<deferred>
## Deferred Ideas

- Natural-language intent classification, state-aware selection, and actual invocation belong to Phase 23.
- Outcome learning and capability-health scoring belong to Phase 24.
- Advisory recommendations and draft capability changes belong to Phase 25.

</deferred>
