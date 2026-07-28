# Phase 22: Conservative Contracts and Relationship Graph - Research

**Researched:** 2026-07-26  
**Domain:** Deterministic capability contracts, trusted overlays, typed relationships, and fail-closed dispatch eligibility  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- Natural-language intent classification, state-aware selection, and actual invocation belong to Phase 23.
- Outcome learning and capability-health scoring belong to Phase 24.
- Advisory recommendations and draft capability changes belong to Phase 25.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONT-01 | Every discovered capability receives a normalized contract covering purpose, triggers, inputs, outputs, preconditions, dependencies, permissions, side effects, reversibility, risk, invocation kind, lifecycle role, scope, and workflow transitions. | Add one contract projection to every canonical Phase 21 record; use explicit field-state envelopes rather than nullable loose metadata. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/registry/schema.mjs`] |
| CONT-02 | Every inferred contract field records its evidence, provenance, inference rule version, and confidence independently. | Use a uniform per-field envelope containing state, value, evidence, provenance, rule version, freshness, and integer basis-point confidence. [VERIFIED: `22-CONTEXT.md`, `src/registry/map.mjs`] |
| CONT-03 | Missing, conflicting, stale, or low-confidence dispatch-relevant fields remain `unknown` and make the capability recommendation-only. | Centralize eligibility in one validator; unknown or failed gates emit stable reason codes and cannot be overridden. [VERIFIED: `22-CONTEXT.md`, `src/registry/map.mjs`] |
| CONT-04 | Optional local manifests can enrich or correct inferred fields without being required and without inventing capabilities absent from the authoritative installation. | Join overlays only after resolving an existing stable capability ID; unmatched overlays remain rejected inspection records. [VERIFIED: `22-CONTEXT.md`, `src/registry/reconcile.mjs`] |
| CONT-05 | Manifest enrichment and user-approved corrections are schema-validated, versioned, inspectable, and bound to the exact capability identity and fingerprint. | Validate a versioned overlay schema and require stable ID, exact-source fingerprint, runtime, and scope tuple equality before application. [VERIFIED: `22-CONTEXT.md`, `src/registry/identity.mjs`] |
| CONT-06 | Renamed, replaced, or modified capabilities invalidate stale corrections unless exact lineage evidence permits safe carryover. | Reuse Phase 21 lifecycle events and reverse-edge invalidation closure; corrections are reference nodes dependent on the bound capability. [VERIFIED: `src/registry/reconcile.mjs`, `tests/router.inventory-mutations.test.mjs`] |
| CONT-07 | Router classifies relationships as substitute, variant, prerequisite, composition, conflict, fallback, implementation, or alias instead of assuming equivalence from name similarity. | Introduce a strict eight-value relationship schema with type-specific evidence and inactive candidate states. [VERIFIED: `22-CONTEXT.md`] |
| CONT-08 | Only contracts passing target-existence, invocation-shape, adapter, dependency-closure, permission, scope, and side-effect validation can become dispatch eligible. | Derive eligibility after contract, overlay, relationship, and invalidation processing; never persist an authored eligibility bit as authority. [VERIFIED: `22-CONTEXT.md`, `src/registry/map.mjs`] |
| CONT-09 | Users can inspect inferred contracts, evidence, confidence, rejected candidates, relationships, and correction paths without editing Router core. | Extend the existing read-only `inventory` CLI projections with bounded allowlisted contract and relationship views in text and canonical JSON. [VERIFIED: `src/cli/router-control.mjs`, `tests/router.inventory-security.test.mjs`] |
</phase_requirements>

## Summary

Phase 22 should be an additive enrichment pass over Phase 21’s activated canonical registry, not a new registry. Phase 21 already supplies stable IDs, exact-source fingerprints, deterministic canonical bytes, lifecycle events, transitive reference invalidation, last-known-good retention, and privacy-safe inspection. [VERIFIED: Phase 21 summaries and verification; `src/registry/{schema,identity,reconcile,watcher}.mjs`] The smallest safe design is therefore: normalize each authoritative record into a contract, apply validated overlays, derive typed edges, run one eligibility validator, and publish the enriched data through the same immutable registry/CLI path. [VERIFIED: `22-CONTEXT.md`]

The central modeling decision is to make uncertainty a first-class value. Every contract field should be an independently canonicalized envelope, and every safety gate should consume those envelopes rather than loose record fields. [VERIFIED: `22-CONTEXT.md`] A field with missing, conflicting, stale, rejected, or below-policy evidence remains `unknown`; a dispatch-relevant unknown deterministically produces recommendation-only. [VERIFIED: `22-CONTEXT.md`] Keep all confidence values as integers from 0–10000 and reuse the existing policy fingerprint/version pattern. [VERIFIED: `src/registry/map.mjs`]

No external package is needed. Node.js stdlib, the existing registry helpers, and `node:test` cover hashing, cloning, validation, canonical JSON, CLI rendering, and tests. [VERIFIED: codebase grep; Node.js crypto and test documentation]

**Primary recommendation:** Add one canonical contract/relationship enrichment stage to the Phase 21 registry pipeline, with a single fail-closed eligibility validator and bounded CLI projections. [VERIFIED: `22-CONTEXT.md`]

## Project Constraints (from AGENTS.md)

- Prefix shell commands with `rtk`. [VERIFIED: `/Users/guilherme/.codex/RTK.md`]
- Use context-mode for commands that inspect, search, test, build, or may emit large output. [VERIFIED: context-mode project instruction]
- Preserve the dirty worktree and do not revert unrelated or concurrent edits. [VERIFIED: orchestrator task]
- Follow existing code patterns because project-specific conventions and project skills are not otherwise defined. [VERIFIED: `.claude/CLAUDE.md`]
- Keep prompt-time routing under the project’s approximately 100 ms warm-path budget; heavy enrichment belongs outside the prompt hook. [VERIFIED: `.planning/PROJECT.md`, `.claude/CLAUDE.md`]
- Fail open at prompt time, fail closed for mutations/dispatch authority, and preserve last-known-good artifacts. [VERIFIED: `.planning/PROJECT.md`]
- Support both Claude and Codex installations without framework-preference assumptions. [VERIFIED: `.planning/PROJECT.md`, Phase 21 verification]
- Do not persist or expose raw prompts, authored secrets, absolute paths, or unrelated local configuration through inspection. [VERIFIED: `.planning/PROJECT.md`, `tests/router.inventory-security.test.mjs`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Contract inference and normalization | API / Backend (local registry pipeline) | Database / Storage (immutable registry artifact) | It transforms authoritative records outside the prompt hook and persists canonical output. [VERIFIED: `src/registry/build.mjs`, `22-CONTEXT.md`] |
| Manifest/correction overlay validation | API / Backend | Database / Storage | Trust checks and exact identity binding are registry-domain logic; accepted/rejected overlays are persisted evidence. [VERIFIED: `22-CONTEXT.md`] |
| Relationship graph derivation | API / Backend | Database / Storage | Typed edges are derived from canonical records/evidence and stored beside registry semantics. [VERIFIED: `src/registry/reconcile.mjs`, `22-CONTEXT.md`] |
| Dispatch eligibility | API / Backend | — | Eligibility is a derived safety decision and must not be authored by client or overlay input. [VERIFIED: `22-CONTEXT.md`] |
| Contract/relationship inspection | Browser / Client (CLI presentation) | API / Backend (allowlisted projection) | CLI renders bounded projections; privacy filtering stays at the projection boundary. [VERIFIED: `src/cli/router-control.mjs`] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM + stdlib | 22.22.3 available locally | Registry transforms, hashing, JSON, filesystem, CLI | The repository is `.mjs` and already uses `node:crypto`, `node:path`, filesystem APIs, and `structuredClone`. [VERIFIED: environment probe; codebase grep] |
| Existing registry schema helpers | repository-local | Validation, canonicalization, stable serialization | `validateCapability`, `canonicalizeCapability`, and `stableStringify` already enforce the repository’s deterministic artifact rules. [VERIFIED: `src/registry/schema.mjs`] |
| Existing identity helpers | repository-local | Stable ID and exact-source fingerprint binding | `stableCapabilityId` and `contentFingerprint` implement Phase 21 continuity rules. [VERIFIED: `src/registry/identity.mjs`] |
| Existing reconciliation closure | repository-local | Lifecycle and transitive invalidation | `reconcileCandidate` already canonicalizes reference graphs and invalidates reverse dependencies before callbacks. [VERIFIED: `src/registry/reconcile.mjs`] |
| `node:test` + `node:assert/strict` | built into Node 22 | Unit and integration verification | The repo uses this framework throughout; Node documents `node:test` as stable and supports focused `--test-name-pattern` runs. [CITED: https://nodejs.org/api/test.html] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` `createHash('sha256')` | built in | Policy, evidence, contract, and graph fingerprints | Reuse the exact hashing pattern already present in identity, map, and reconcile modules. [VERIFIED: `src/registry/{identity,map,reconcile}.mjs`; CITED: https://nodejs.org/api/crypto.html] |
| Existing CLI projection helpers | repository-local | Safe tokens, bounded results, deterministic text/JSON | Use for CONT-09; do not serialize raw contract records directly. [VERIFIED: `src/cli/router-control.mjs`] |

### Alternatives Considered

No alternative framework or dependency should be planned because CONTEXT.md locks this phase to the existing Phase 21 registry/CLI pipeline, and stdlib plus existing helpers cover the work. [VERIFIED: `22-CONTEXT.md`; codebase grep]

**Installation:** None. [VERIFIED: codebase and environment inspection]

## Architecture Patterns

### System Architecture Diagram

```text
Activated Phase 21 canonical registry
             |
             v
  Contract inference rules (versioned)
             |
             +----> per-field accepted evidence
             +----> per-field rejected evidence + reason codes
             v
 Optional overlays (manifest/correction)
             |
     schema + exact binding gate
        | accepted       | rejected/stale/mismatched
        v                v
 merged field state   inspection-only candidate
             |
             v
 Typed relationship derivation (8 edge types only)
             |
      endpoint + evidence validation
        | active          | ambiguous/invalid
        v                 v
 live edge graph       inspection-only candidate
             |
             v
 Shared dispatch eligibility validator
        | all gates pass  | failed/unknown gate
        v                 v
 dispatch eligible    recommendation-only + reasons
             |
             v
 canonical immutable registry artifact
             |
             v
 bounded allowlisted CLI text / JSON inspection
```

This flow keeps inference and mutation outside prompt-time routing and makes eligibility a final derived value. [VERIFIED: `.planning/PROJECT.md`, `22-CONTEXT.md`]

### Recommended Project Structure

```text
src/registry/
├── schema.mjs          # extend canonical record validation/canonicalization
├── contract.mjs        # field envelopes, inference, overlay validation/application
├── relationships.mjs   # strict typed-edge derivation/validation
├── eligibility.mjs     # one shared fail-closed eligibility validator
├── build.mjs           # invoke enrichment in full/incremental single assembler
└── reconcile.mjs       # lifecycle/reference invalidation integration
src/cli/
└── router-control.mjs  # bounded contract/relationship projections and rendering
tests/
├── router.contracts.test.mjs
├── router.relationships.test.mjs
├── router.contract-overlays.test.mjs
├── router.contract-eligibility.test.mjs
└── router.contract-inspection.test.mjs
```

Four focused modules/tests are enough to separate validation boundaries without introducing a service layer, class hierarchy, graph engine, or schema package. [VERIFIED: existing flat functional module pattern; ASSUMED]

### Pattern 1: Uniform Per-Field Envelope

**What:** Represent every normalized contract field with the same state and evidence shape. [VERIFIED: `22-CONTEXT.md`]

```javascript
// Source: repository stableStringify/canonical policy patterns
{
  state: 'known', // or 'unknown'
  value: ['filesystem:read'],
  evidence: [{
    source: 'adapter',
    source_fingerprint: '…',
    rule_version: 'contract-rules-v1',
    confidence_basis_points: 10000,
    freshness: 'current'
  }],
  rejected: []
}
```

Use `unknown` as an explicit state, not an omitted property, `null`, empty string, or optimistic default. [VERIFIED: `22-CONTEXT.md`] Bound and canonical-sort evidence arrays exactly as existing set-like collections are sorted. [VERIFIED: `src/registry/schema.mjs`]

### Pattern 2: Deterministic Evidence Precedence

**What:** Resolve each field from a fixed policy order, retaining losing/conflicting candidates. [VERIFIED: `22-CONTEXT.md`, `src/registry/map.mjs`]

Recommended order:

1. Adapter/native structural evidence.
2. Schema-valid exact-bound approved correction.
3. Schema-valid exact-bound local manifest.
4. Deterministic inference from canonical metadata.
5. Otherwise `unknown`.

Corrections may correct inferred fields but cannot override immutable identity, target existence, adapter support, or derived eligibility. [VERIFIED: `22-CONTEXT.md`] The policy object should include `schema_version`, `policy_version`, integer thresholds, collection bounds, and a fingerprint, mirroring `DEFAULT_MAPPING_POLICY`. [VERIFIED: `src/registry/map.mjs`]

### Pattern 3: Overlays as Dependent References

**What:** Treat each overlay as a versioned, fingerprinted dependent record referencing one installed capability. [VERIFIED: `22-CONTEXT.md`]

```javascript
{
  schema_version: 1,
  overlay_id: 'correction:…',
  kind: 'approved-correction',
  binding: {
    stable_id: 'path:…',
    source_fingerprint: '…',
    runtime: 'codex',
    scope: { kind: 'user', identity: '…' }
  },
  fields: { risk: { value: 'low', evidence: 'user-approved' } }
}
```

Feed overlay dependencies into the existing reference invalidation closure so removal, replacement, disablement, dependency loss, and unsafe lineage invalidate them transitively. [VERIFIED: `src/registry/reconcile.mjs`, `tests/router.inventory-mutations.test.mjs`]

### Pattern 4: Strict Typed Edge State

**What:** Store exactly the eight locked edge types and separate active edges from rejected candidates. [VERIFIED: `22-CONTEXT.md`]

Each edge needs a deterministic ID, type, source ID, target ID, evidence, provenance, confidence basis points, freshness, validation state, and reason code. [VERIFIED: `22-CONTEXT.md`] Validate endpoints against the same candidate registry before edge activation. [VERIFIED: existing `canonicalReferences` pattern in `src/registry/reconcile.mjs`]

Type-specific minimum evidence should be explicit:

- `alias`: declared identity or exact authoritative alias evidence; never lexical similarity alone. [VERIFIED: `22-CONTEXT.md`]
- `prerequisite`: declared dependency evidence with a resolved target. [VERIFIED: CONT-07/08]
- `composition`: explicit container/member or workflow composition evidence. [VERIFIED: Phase 21 compound provenance]
- `conflict`: explicit conflict evidence with severity. [VERIFIED: `src/registry/schema.mjs`]
- `implementation`: explicit container/member or adapter-native implementation evidence. [VERIFIED: Phase 21 normalized schema]
- `substitute`, `variant`, `fallback`: require explicit structured evidence; lexical similarity may only create an inactive candidate. [VERIFIED: `22-CONTEXT.md`]

### Pattern 5: One Eligibility Function

**What:** Return `{ dispatch_eligible, reason_codes, gates }` from one pure validator after all enrichment. [VERIFIED: `22-CONTEXT.md`]

Gate order should be deterministic:

1. target exists and identity/fingerprint are current;
2. lifecycle is ready and enabled;
3. invocation shape is available and valid;
4. adapter/parser evidence is supported;
5. dependency/prerequisite closure is complete;
6. permission and scope fields are known and allowed;
7. side effects, reversibility, and risk are known and policy-acceptable;
8. all dispatch-relevant field confidences meet the versioned threshold;
9. no active blocking conflict exists.

Return all stable failure/unknown reasons rather than short-circuiting at the first gate; canonical-sort the reasons for byte identity and better inspection. [VERIFIED: existing verdict/evidence patterns in `src/registry/map.mjs` and `src/registry/reconcile.mjs`]

### Anti-Patterns to Avoid

- **Second registry or framework-specific contract store:** it breaks Phase 21 authority and creates divergence. [VERIFIED: `22-CONTEXT.md`]
- **Capability-level confidence:** it hides which dispatch-relevant field is weak. [VERIFIED: `22-CONTEXT.md`]
- **Falsy unknowns:** `null`, empty arrays, or omitted keys are ambiguous; use explicit `unknown`. [VERIFIED: `22-CONTEXT.md`]
- **Authored `dispatch_eligible`:** eligibility must be derived and overlays cannot grant it. [VERIFIED: `22-CONTEXT.md`]
- **Name similarity as alias/equivalence:** lexical evidence may propose only an inactive candidate. [VERIFIED: `22-CONTEXT.md`]
- **Raw registry serialization at CLI:** use strict allowlisted projections to avoid secrets, control characters, and paths. [VERIFIED: `src/cli/router-control.mjs`, Phase 21 verification]
- **Graph library or database:** the graph is bounded canonical JSON with deterministic reverse-edge closure already implemented locally. [VERIFIED: `src/registry/reconcile.mjs`]
- **Prompt-hook enrichment:** contract/graph work belongs in build/reconcile; prompt-time routing consumes published artifacts. [VERIFIED: `.planning/PROJECT.md`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stable JSON serialization | A second canonical JSON encoder | `stableStringify` and `canonicalizeCapability` | Existing semantics already sort keys, reject unsupported/cyclic values, and exclude operational fields. [VERIFIED: `src/registry/schema.mjs`] |
| Capability identity | New contract IDs | `stableCapabilityId` | It already encodes declared identity/shared origin/fallback provenance plus scope. [VERIFIED: `src/registry/identity.mjs`] |
| Exact-source binding | Ad hoc mtime/path checks | `contentFingerprint` plus canonical provenance fingerprint | Existing continuity separates semantic bytes from exact-source evidence. [VERIFIED: `src/registry/identity.mjs`, Phase 21 verification] |
| Transitive invalidation | A new graph traversal engine | Existing canonical reference graph and reverse closure | It is deterministic, cycle-safe, validates dangling targets, and preserves active bytes on failure. [VERIFIED: `src/registry/reconcile.mjs`] |
| Confidence representation | Floating-point scores | Existing integer basis points and policy fingerprint pattern | Current mapping policy validates 0–10000 integers and emits bands deterministically. [VERIFIED: `src/registry/map.mjs`] |
| CLI sanitization | Generic object dumping/redaction | Existing allowlisted projections, safe token/fingerprint helpers, bounded pagination | Phase 21 verified text/JSON parity and privacy behavior. [VERIFIED: `src/cli/router-control.mjs`, Phase 21 verification] |
| Test framework | Jest/Vitest/custom harness | `node:test` and `node:assert/strict` | Already used throughout and built into the available runtime. [VERIFIED: tests grep; CITED: https://nodejs.org/api/test.html] |

**Key insight:** Phase 22 is mainly new schema/policy data and one enrichment flow; the difficult identity, canonicalization, invalidation, publication, and inspection primitives already exist. [VERIFIED: Phase 21 verification and source inspection]

## Common Pitfalls

### Pitfall 1: Contract Fields Exist but Lack Independent Evidence

**What goes wrong:** A complete-looking contract passes despite one field being guessed or stale. [VERIFIED: CONT-02/03 threat model]  
**Why it happens:** Implementers attach provenance/confidence to the contract as a whole. [VERIFIED: `22-CONTEXT.md`]  
**How to avoid:** Validate the uniform envelope on every field and test mixed-confidence contracts. [VERIFIED: locked decision]  
**Warning signs:** Top-level `confidence`, raw scalar safety fields, or absent field states. [ASSUMED]

### Pitfall 2: Overlay Self-Authorization

**What goes wrong:** A local manifest invents an installed capability or marks itself dispatch eligible. [VERIFIED: CONT-04/05/08]  
**Why it happens:** Overlay parsing occurs before authoritative registry resolution. [ASSUMED]  
**How to avoid:** Resolve the installed stable ID first, validate exact binding second, then apply only permitted field changes. [VERIFIED: `22-CONTEXT.md`]  
**Warning signs:** Overlay-only IDs in canonical records or an overlay-owned eligibility field. [VERIFIED: locked decisions]

### Pitfall 3: Fingerprint Drift Leaves Corrections Active

**What goes wrong:** Edited or replaced capability content retains old corrections. [VERIFIED: CONT-06]  
**Why it happens:** Binding uses only name or stable ID. [VERIFIED: `22-CONTEXT.md`]  
**How to avoid:** Bind ID + exact-source fingerprint + runtime + scope and register correction dependencies in invalidation closure. [VERIFIED: `src/registry/identity.mjs`, `src/registry/reconcile.mjs`]  
**Warning signs:** Replace/edit tests preserve an accepted correction without explicit lineage evidence. [VERIFIED: `tests/router.inventory-mutations.test.mjs` pattern]

### Pitfall 4: Relationship Candidates Become Authority

**What goes wrong:** Similar names become aliases/substitutes and influence dispatch. [VERIFIED: CONT-07]  
**Why it happens:** A lexical score is confused with type-specific evidence. [VERIFIED: `22-CONTEXT.md`]  
**How to avoid:** Store lexical matches as inactive candidates with a reason; activate only from structured evidence. [VERIFIED: locked decision]  
**Warning signs:** Edge creation from token overlap alone or an untyped `related` edge. [VERIFIED: locked decision]

### Pitfall 5: Duplicate Eligibility Logic

**What goes wrong:** CLI, registry build, and future Phase 23 selection disagree. [ASSUMED]  
**Why it happens:** Each caller recomputes a subset of gates. [ASSUMED]  
**How to avoid:** Export one pure validator and persist its canonical result/reasons. [VERIFIED: `22-CONTEXT.md`]  
**Warning signs:** More than one module checks permission/scope/side effects independently. [ASSUMED]

### Pitfall 6: Semantic Collections Lose Byte Determinism

**What goes wrong:** Equivalent inputs produce different registry bytes due to evidence/edge/reason ordering. [VERIFIED: Phase 21 convergence experience]  
**Why it happens:** New arrays are not added to canonical set-like handling or explicitly sorted. [VERIFIED: `src/registry/schema.mjs`]  
**How to avoid:** Define which arrays are ordered versus set-like, canonical-sort set-like arrays, and add permutation tests. [VERIFIED: Phase 21 test patterns]  
**Warning signs:** Full and incremental builds differ only in array order. [VERIFIED: `tests/router.inventory-convergence.test.mjs`]

### Pitfall 7: Inspection Leaks Authored Evidence

**What goes wrong:** Rejected evidence exposes local paths, manifest prose, secrets, or control characters. [VERIFIED: CONT-09 and Phase 21 privacy contract]  
**Why it happens:** Inspect output serializes evidence objects directly. [ASSUMED]  
**How to avoid:** Project only evidence type, source class, safe fingerprint, rule version, confidence, freshness, state, and reason code. [VERIFIED: `src/cli/router-control.mjs` pattern]  
**Warning signs:** `JSON.stringify(contract)` at the CLI boundary. [ASSUMED]

### Pitfall 8: Scope Creep into Phase 23

**What goes wrong:** This phase adds prompt classification, routing selection, or invocation. [VERIFIED: deferred decisions]  
**How to avoid:** Stop at contract/edge derivation, eligibility, and inspection. [VERIFIED: `22-CONTEXT.md`]

## Code Examples

### Canonical Field Resolution

```javascript
// Source pattern: src/registry/map.mjs evidence ledger + stable policy
export function resolveContractField(candidates, policy) {
  const ordered = [...candidates].sort(
    (a, b) => policy.precedence.indexOf(a.tier) - policy.precedence.indexOf(b.tier)
      || b.confidence_basis_points - a.confidence_basis_points
      || stableStringify(a).localeCompare(stableStringify(b)),
  );
  const accepted = ordered.find(item =>
    item.freshness === 'current'
    && item.confidence_basis_points >= policy.minimum_confidence_basis_points
  );
  return accepted
    ? { state: 'known', value: accepted.value, evidence: [accepted], rejected: ordered.filter(item => item !== accepted) }
    : { state: 'unknown', value: null, evidence: [], rejected: ordered };
}
```

The planner should adapt this pattern to retain explicit conflict reason codes instead of treating every losing candidate identically. [VERIFIED: `22-CONTEXT.md`]

### Fail-Closed Eligibility Result

```javascript
// Source pattern: src/registry/map.mjs safety() and src/registry/reconcile.mjs verdict()
export function validateDispatchEligibility(contract, graph, policy) {
  const gates = evaluateAllGates(contract, graph, policy)
    .sort((a, b) => a.id.localeCompare(b.id));
  const reason_codes = gates
    .filter(gate => gate.state !== 'passed')
    .map(gate => gate.reason_code)
    .sort();
  return {
    policy_version: policy.policy_version,
    dispatch_eligible: reason_codes.length === 0,
    gates,
    reason_codes,
  };
}
```

### Overlay Exact Binding

```javascript
// Source pattern: src/registry/identity.mjs and Phase 21 exact continuity rules
function bindingMatches(overlay, record) {
  return overlay.binding.stable_id === record.id
    && overlay.binding.source_fingerprint === contentFingerprint(record)
    && overlay.binding.runtime === record.invocation.runtime
    && stableStringify(overlay.binding.scope) === stableStringify(record.scope);
}
```

The implementation must compare the same exact-source fingerprint representation that Phase 21 publishes, rather than accidentally recomputing a semantic fingerprint. [VERIFIED: Phase 21 verification]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Whole-capability confidence | Per-field evidence, provenance, freshness, rule version, and basis-point confidence | Locked for Phase 22 | Weak safety fields remain visible and block eligibility. [VERIFIED: `22-CONTEXT.md`] |
| Untyped/equivalence-by-name relationships | Eight explicit relationship types with type-specific evidence | Locked for Phase 22 | Ambiguous candidates stay inactive and inspectable. [VERIFIED: `22-CONTEXT.md`] |
| Authored `dispatchable` metadata as sufficient | One derived eligibility validator over all safety gates | Locked for Phase 22 | Overlays cannot self-authorize dispatch. [VERIFIED: `22-CONTEXT.md`] |
| Registry records without complete contract semantics | Canonical Phase 21 record enriched with normalized contract and edges | Phase 22 | Phase 23 can consume deterministic eligibility without doing heavy inference on the prompt path. [VERIFIED: phase boundary] |

**Deprecated/outdated:**

- The Phase 21 `dispatchable` boolean alone is not enough for Phase 22 eligibility; preserve it as an input gate, not the final authority. [VERIFIED: CONT-08 and current schema]
- The generic Phase 21 `equivalence` reference type should not become a Phase 22 relationship type; Phase 22 permits only the locked eight types. Existing generic references may remain an internal invalidation mechanism. [VERIFIED: `src/registry/reconcile.mjs`, `22-CONTEXT.md`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Four small focused implementation modules are the best boundary. | Recommended Project Structure | Planner may choose fewer modules if existing file ownership makes that safer. |
| A2 | Overlay self-authorization commonly results from parsing before authoritative resolution. | Pitfall 2 | Root cause wording may differ; required gate order remains locked. |
| A3 | Duplicate eligibility logic will cause future caller disagreement. | Pitfall 5 | Low; central validator is independently locked by CONTEXT. |
| A4 | Direct object serialization is the likely cause of inspection leaks. | Pitfall 7 | Low; allowlisted projection remains required regardless of cause. |

## Open Questions (RESOLVED)

1. **Exact confidence thresholds**
   - What we know: thresholds must be deterministic, versioned, tested, conservative, and expressed as integer basis points. Existing mapping bands define high at 8500, medium at 6500, and low at 5000. [VERIFIED: `22-CONTEXT.md`, `src/registry/map.mjs`]
   - What's unclear: CONTEXT intentionally leaves the contract-field threshold to implementation discretion.
   - Recommendation: reuse `8500` as the minimum for inferred dispatch-relevant fields, while structural adapter facts and overlay bindings require exact/10000 evidence; encode this in `contract-policy-v1` and tests. [ASSUMED]
   - **RESOLVED:** Adopt the recommendation. Dispatch-relevant inferred fields require 8500 basis points; exact structural and overlay bindings require 10000.

2. **Overlay file discovery location**
   - What we know: overlays are optional local inputs and cannot create capabilities. [VERIFIED: CONT-04/05]
   - What's unclear: CONTEXT does not lock filenames or roots.
   - Recommendation: accept overlays through the registry build API first and add filesystem discovery only through already-authorized Claude/Codex roots; never scan a new ambient root. [ASSUMED]
   - **RESOLVED:** Accept overlays through the registry build API only in Phase 22. No new filesystem discovery root is added.

3. **Publication shape**
   - What we know: contracts and edges must extend the canonical registry and be inspectable. [VERIFIED: `22-CONTEXT.md`]
   - What's unclear: whether contracts live inline on records or in top-level maps.
   - Recommendation: store `contract` inline per record and a top-level sorted `relationships.edges` collection; this makes target existence and CLI detail projection direct while keeping graph traversal bounded. [ASSUMED]
   - **RESOLVED:** Store each contract inline on its canonical record and publish typed edges in a top-level, canonically sorted `relationships.edges` collection.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | implementation and tests | ✓ | 22.22.3 | — [VERIFIED: environment probe] |
| npm | optional repository tooling only | ✓ | 10.9.8 | Not needed for Phase 22 [VERIFIED: environment probe; no `package.json`] |
| `rtk` | required project command wrapper | ✓ | command used successfully | — [VERIFIED: command execution] |
| External database/service | none | n/a | — | Canonical JSON artifacts remain local [VERIFIED: architecture and phase scope] |

**Missing dependencies with no fallback:** None. [VERIFIED: environment audit]

**Missing dependencies with fallback:** Context7 CLI was unavailable, so official Node.js and OWASP documentation was verified directly. [VERIFIED: environment probe and documentation lookup]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test`, runtime 22.22.3 [VERIFIED: tests grep; environment probe] |
| Config file | none; tests are direct `.test.mjs` files [VERIFIED: repository scan] |
| Quick run command | `rtk node --test tests/router.contracts.test.mjs tests/router.relationships.test.mjs tests/router.contract-overlays.test.mjs tests/router.contract-eligibility.test.mjs tests/router.contract-inspection.test.mjs` [ASSUMED] |
| Full suite command | `rtk node --test tests/*.test.mjs` [VERIFIED: Phase 21 verification] |

Node’s test runner supports filtering by regular-expression test names with `--test-name-pattern`, so each plan can retain a sub-30-second focused check when files grow. [CITED: https://nodejs.org/api/test.html]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONT-01 | Every Phase 21 record gets all normalized fields with explicit state | unit + profile matrix | `rtk node --test tests/router.contracts.test.mjs` | ❌ Wave 0 |
| CONT-02 | Every field independently records evidence/provenance/rule/freshness/confidence | unit + permutation | `rtk node --test tests/router.contracts.test.mjs` | ❌ Wave 0 |
| CONT-03 | Missing/conflicting/stale/low-confidence field stays unknown and blocks dispatch | unit matrix | `rtk node --test tests/router.contract-eligibility.test.mjs` | ❌ Wave 0 |
| CONT-04 | Optional overlays enrich existing records but cannot create identities | unit + integration | `rtk node --test tests/router.contract-overlays.test.mjs` | ❌ Wave 0 |
| CONT-05 | Overlay schema and exact binding are validated and inspectable | unit + security | `rtk node --test tests/router.contract-overlays.test.mjs tests/router.contract-inspection.test.mjs` | ❌ Wave 0 |
| CONT-06 | edit/rename/replace/remove invalidates correction unless exact lineage allows carryover | mutation matrix | `rtk node --test tests/router.contract-overlays.test.mjs tests/router.inventory-mutations.test.mjs` | Partial: mutation fixture exists |
| CONT-07 | Only eight typed edges activate; lexical-only candidates remain inactive | unit + permutation | `rtk node --test tests/router.relationships.test.mjs` | ❌ Wave 0 |
| CONT-08 | All eligibility gates are centralized and fail closed | unit matrix + integration | `rtk node --test tests/router.contract-eligibility.test.mjs` | ❌ Wave 0 |
| CONT-09 | CLI exposes bounded safe text/JSON inspection without mutation | CLI + privacy integration | `rtk node --test tests/router.contract-inspection.test.mjs tests/router.inventory-security.test.mjs` | Partial: inventory security infrastructure exists |

### Required Test Matrices

- Reuse all four Phase 21 synthetic installation profiles so Claude-heavy, Codex-heavy, mixed/custom, and unknown-future capabilities receive contracts. [VERIFIED: `tests/helpers/inventory-fixture.mjs`]
- Reuse add/edit/rename/move/disable/replace/dependency-loss/removal mutations for correction and edge invalidation. [VERIFIED: `tests/router.inventory-mutations.test.mjs`]
- Permute input record, evidence, overlay, relationship, and reason ordering and assert byte-identical output. [VERIFIED: Phase 21 convergence pattern]
- Test every eligibility gate in passed, failed, and unknown states, plus multiple simultaneous failures with canonical reason ordering. [VERIFIED: CONT-08]
- Test malicious overlay bodies, traversal paths, absolute paths, control characters, secret-like fields, oversized collections, malformed cycles, and dangling edge endpoints. [VERIFIED: Phase 21 security patterns; OWASP validation/data-protection guidance]
- Assert inspection is read-only and text/JSON expose equivalent semantic fields. [VERIFIED: Phase 21 CLI tests]

### Sampling Rate

- **Per task commit:** the owned Phase 22 test file(s) plus the closest Phase 21 regression file. [VERIFIED: established project workflow]
- **Per wave merge:** all Phase 22 files plus `router.registry-schema`, `router.registry-reconcile`, `router.inventory-mutations`, `router.inventory-convergence`, and `router.inventory-security`. [VERIFIED: identified integration seams]
- **Phase gate:** full suite, with any pre-existing failures reconciled against the recorded Phase 21 baseline rather than silently ignored. [VERIFIED: Phase 21 verification]

### Wave 0 Gaps

- [ ] `tests/router.contracts.test.mjs` — CONT-01/02/03 canonical contract oracle.
- [ ] `tests/router.contract-overlays.test.mjs` — CONT-04/05/06 trust and mutation oracle.
- [ ] `tests/router.relationships.test.mjs` — CONT-07 typed graph oracle.
- [ ] `tests/router.contract-eligibility.test.mjs` — CONT-03/08 fail-closed gate matrix.
- [ ] `tests/router.contract-inspection.test.mjs` — CONT-09 CLI parity/privacy/read-only oracle.
- [ ] No framework install or fixture framework is needed; extend `tests/helpers/inventory-fixture.mjs`. [VERIFIED: existing test infrastructure]

## Security Domain

Security enforcement is enabled at ASVS Level 1 in project config. [VERIFIED: `.planning/config.json`]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No remote/user authentication boundary is introduced in this local registry phase. [VERIFIED: phase scope] |
| V3 Session Management | no | No session mechanism is introduced. [VERIFIED: phase scope] |
| V4 Access Control | yes | Only approved corrections bound to exact installed identity/fingerprint/runtime/scope may influence fields; no overlay may author eligibility. [VERIFIED: CONT-05/08; CITED: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html] |
| V5 Input Validation | yes | Versioned manual schema validation, bounded strings/collections, strict enums, portable-path checks, cycle rejection, and dangling-endpoint rejection. [VERIFIED: existing schema/reconcile patterns; CITED: https://devguide.owasp.org/en/11-security-gap-analysis/01-guides/02-asvs/] |
| V6 Cryptography | yes | Reuse Node `createHash('sha256')`; do not implement hashing. [VERIFIED: existing identity/map/reconcile code; CITED: https://nodejs.org/api/crypto.html] |
| V7 Error Handling/Logging | yes | Emit stable safe reason codes and rejected-candidate metadata without authored bodies or secrets. [CITED: https://cornucopia.owasp.org/taxonomy/asvs-4.0.3/07-error-handling-and-logging/01-log-content] |
| V8 Data Protection | yes | Allowlist inspection fields; exclude raw authored text, secrets, absolute paths, and unrelated config. [VERIFIED: Phase 21 privacy contract; CITED: https://devguide.owasp.org/en/11-security-gap-analysis/01-guides/02-asvs/] |

### Known Threat Patterns for Local Contract Overlays

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Manifest self-authorizes dispatch | Elevation of Privilege | Derive eligibility only in shared validator; ignore authored eligibility. [VERIFIED: CONT-08] |
| Overlay targets another capability/scope | Spoofing / Elevation of Privilege | Exact stable ID + fingerprint + runtime + scope binding. [VERIFIED: CONT-05] |
| Edited capability retains stale correction | Tampering | Fingerprint invalidation and exact lineage-only carryover. [VERIFIED: CONT-06] |
| Lexical similarity forges alias/substitute | Spoofing | Type-specific evidence; lexical-only candidate inactive. [VERIFIED: CONT-07] |
| Malformed/dangling/cyclic relationship graph | Denial of Service / Tampering | Bounded schema, endpoint validation, deterministic closure, preserve last-known-good bytes on error. [VERIFIED: `src/registry/reconcile.mjs`] |
| Inspection exposes secret/path/authored content | Information Disclosure | Strict allowlisted projection, safe fingerprints/tokens, bounds, text/JSON parity tests. [VERIFIED: Phase 21 security verification] |
| Conflicting evidence order changes outcome | Tampering | Fixed precedence, stable sort, integer scores, policy fingerprint, permutation tests. [VERIFIED: `src/registry/map.mjs`, Phase 21 convergence tests] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/22-conservative-contracts-and-relationship-graph/22-CONTEXT.md` — locked decisions, phase boundary, integration points, and deferred scope. [VERIFIED: codebase read]
- `.planning/REQUIREMENTS.md` — CONT-01 through CONT-09 and phase traceability. [VERIFIED: codebase read]
- `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/config.json` — project constraints, phase state, Nyquist/security settings. [VERIFIED: codebase read]
- Phase 21 summaries and `21-VERIFICATION.md` — delivered identity, discovery, invalidation, convergence, inspection, and known full-suite baseline. [VERIFIED: codebase read]
- `src/registry/schema.mjs` — validation, normalization, canonicalization, stable serialization. [VERIFIED: codebase read]
- `src/registry/identity.mjs` — stable IDs and exact-source continuity fingerprints. [VERIFIED: codebase read]
- `src/registry/map.mjs` — integer basis-point policy/evidence and target safety. [VERIFIED: codebase read]
- `src/registry/reconcile.mjs` — canonical references and transitive invalidation closure. [VERIFIED: codebase read]
- `src/registry/build.mjs`, `src/registry/watcher.mjs` — full/incremental assembly and last-complete authority. [VERIFIED: codebase grep]
- `src/cli/router-control.mjs` — bounded privacy-safe inventory projection and rendering. [VERIFIED: codebase read]
- Phase 21 registry/inventory test files — executable patterns and mutation/profile matrices. [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)

- https://nodejs.org/api/crypto.html — official `node:crypto` hashing API. [CITED: https://nodejs.org/api/crypto.html]
- https://nodejs.org/api/test.html — official stable `node:test` API and focused name filtering. [CITED: https://nodejs.org/api/test.html]
- https://devguide.owasp.org/en/11-security-gap-analysis/01-guides/02-asvs/ — official OWASP ASVS category guidance. [CITED: https://devguide.owasp.org/en/11-security-gap-analysis/01-guides/02-asvs/]
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html — official OWASP authorization guidance. [CITED: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html]

### Tertiary (LOW confidence)

- Assumptions A1–A4 and the proposed 8500 threshold/overlay input/publication shape require planner or implementation confirmation. [ASSUMED]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; runtime and local helpers were directly inspected. [VERIFIED: environment and codebase]
- Architecture: HIGH — locked CONTEXT explicitly names the existing Phase 21 registry and CLI integration points. [VERIFIED: `22-CONTEXT.md`]
- Pitfalls: HIGH for trust, uncertainty, relationship, determinism, and privacy pitfalls; MEDIUM for causal wording marked assumed. [VERIFIED: requirements, code, tests]
- Validation: HIGH — test framework and Phase 21 matrices already exist; Phase 22 test filenames are recommendations. [VERIFIED: tests grep]

**Research date:** 2026-07-26  
**Valid until:** 2026-08-25 (stable local architecture; re-check if Phase 21 registry contracts change). [ASSUMED]
