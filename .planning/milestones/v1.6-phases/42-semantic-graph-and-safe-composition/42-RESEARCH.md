# Phase 42: Semantic Graph and Safe Composition - Research

**Researched:** 2026-08-08
**Domain:** Semantic capability resolution, relationship graph compilation, contract-compatible substitution, safe composition
**Confidence:** HIGH

## Summary

Phase 42 builds the semantic resolution and safe composition layer on top of the Phase 41 trust-hardened contract surface. The codebase already has a sophisticated relationship graph (`src/registry/relationships.mjs`) with 8 typed relationship edges (substitute, variant, prerequisite, composition, conflict, fallback, implementation, alias), a contract envelope with 18 fields including inputs/outputs/dependencies (`src/registry/contract.mjs`), an eligibility evaluator with 10 gates plus quarantine disposition (`src/registry/eligibility.mjs`), and a workflow-declaration-based capability selector (`src/orchestrator/select.mjs`). Phase 42 extends these to resolve capabilities by semantic contract rather than by named-framework declaration, compile the relationship graph strictly before activation, and substitute failed routes to contract-compatible candidates within unchanged authority/risk/scope/resource bounds.

The four SEM requirements map to specific extensions: SEM-01 adds a semantic outcome resolver that matches capabilities by contract fields (requires/produces/inputs/outputs) and relationship edges without requiring a workflow_id declaration; SEM-02 extends the CLI inspection surface to expose versioned requires/produces/conflicts/substitutions/compositions/lifecycle evidence explaining why a capability fits; SEM-03 adds a strict compilation gate that rejects ambiguous ties, native-identity collisions, stale targets, missing dependencies, incompatible outputs, unsafe compositions, and unresolvable contracts before activation; SEM-04 adds a substitution resolver that finds a contract-compatible fallback when a selected capability fails, validates it stays within unchanged bounds, and retains both routes for attribution. All new logic runs at build time or dispatch time — NEVER on the prompt hot path.

**Primary recommendation:** Add two new stdlib-only modules — `src/registry/semantic.mjs` (SEM-01 semantic resolver + SEM-03 strict compilation) and `src/registry/substitute.mjs` (SEM-04 substitution resolver) — and extend `src/registry/relationships.mjs` with compilation checks and `src/cli/router-control.mjs` with a `semanticProjection` for SEM-02 inspection. Reuse the existing `evaluateEligibility`, `classifyEvidence`, `evaluateAuthorityPolicy`, and `deriveRelationships` functions as-is — Phase 42 does not create new authority, permission, or trust paths.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions — CONTEXT.md was auto-generated with discuss skipped per `workflow.skip_discuss`.

### Claude's Discretion
All implementation choices are at the agent's discretion. Use the ROADMAP goal, success criteria, and existing codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEM-01 | An operator can request a semantic outcome and resolve a compatible installed public, private, proprietary, plugin, service, native, or previously unknown capability without a named-framework source branch | The existing `selectCapabilities` in `select.mjs` resolves via workflow declarations (owners/requirements/compatible) — this IS the named-framework path. Phase 42 adds a semantic resolver that matches by contract fields (inputs, outputs, dependencies, action) + relationship edges (substitute, fallback, composition) without requiring a workflow_id. The contract envelope already has `inputs`, `outputs`, `dependencies`, `action`, `invocation_kind` fields. The relationship graph has `substitute` and `fallback` edge types. |
| SEM-02 | An operator can inspect why a capability fits through versioned requires, produces, conflicts-with, substitutes-for, composes-with, and lifecycle relationships derived from bounded authoritative evidence | The existing `relationshipProjection` in `router-control.mjs` projects relationship edges with type/source/target/evidence/freshness. The existing `contractDetailProjection` projects contract fields with state/evidence/provenance. Phase 42 adds a unified `semanticProjection` that combines: contract fields (requires=inputs+dependencies, produces=outputs), relationship edges (conflicts/substitutions/compositions), and lifecycle evidence (lifecycle + enabled + eligibility gates) into a single "why this fits" view. |
| SEM-03 | Strict compilation rejects ambiguous ties, native-identity collisions, stale targets, missing dependencies, incompatible outputs, unsafe compositions, and unresolvable action contracts before activation | The existing `deriveRelationships` already rejects: unknown types, malformed endpoints, self-edges, dangling source/target, inactive source/target, below-threshold, stale evidence, conflicting evidence, cycles, overflow. Phase 42 adds a strict compilation gate that additionally rejects: ambiguous ties (multiple equally-ranked semantic matches), native-identity collisions (two records with same `native_type` but different `stableCapabilityId`), incompatible outputs (composition where producer `outputs` don't match consumer `inputs`), unsafe compositions (composition violating authority/risk/scope bounds), unresolvable contracts (dispatch fields with state='unknown'). |
| SEM-04 | A failed selected capability can be substituted only by a contract-compatible candidate that stays inside unchanged authority, risk, scope, and resource bounds, with both routes preserved in attribution evidence | The existing relationships have `substitute` and `fallback` types. The existing eligibility has quarantine with fallback eligibility. Phase 42 adds a substitution resolver that: when a selected capability fails (quarantined/ineligible/dispatch-failed), traverses substitute/fallback edges to find a contract-compatible candidate, validates it via `evaluateEligibility` within the same authority/risk/scope/resource bounds (using `evaluateAuthorityPolicy` from `authority.mjs`), and produces a substitution record retaining both the original and substitute route. The `RECEIPT_STATES` array does not yet include 'substituted' — Phase 44 (RCPT-02) formalizes that state; Phase 42 produces the attribution evidence record. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Stdlib-only, no npm dependencies**: The hook is a single file with no `node_modules`. All Phase 42 modules must use only `node:crypto`, `node:fs`, `node:path`, `node:os`. No new packages.
- **Performance**: Router hook must return within ~100ms, fail-open, never block. Semantic resolution and compilation run at build time (registry assembly) or dispatch time, NEVER on the prompt hot path.
- **Fail-open**: On any exception in the hook, pass through the original prompt unchanged. Semantic modules loaded via top-level await with null sentinel (mirrors `authority.mjs` pattern).
- **No permission laundering**: Substitution must NOT expand authority, risk, scope, or resource bounds. Reuse `evaluateAuthorityPolicy` and `evaluateEligibility` as-is — Phase 42 does not create new authority or permission paths.
- **No framework privilege**: Semantic resolution must not grant capabilities beyond their contract. A capability's `contract.disposition` must be `dispatch-candidate` to be semantically resolved.
- **Coexistence**: Must not break existing hook bindings. New modules deploy via `moduleNames` flatMap in `router-lifecycle.mjs` (dual-runtime: ownedRoot + codexOwnedRoot).
- **Deny rules**: No secret leakage via injection. Contract fields must not expose raw values (enforced by `validateCapabilityContract`).
- **File writes via native tools**: Semantic modules are read-only w.r.t. user code; only data files are written.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Semantic outcome resolution (SEM-01) | Registry (build time) | Orchestrator (dispatch time) | Resolution queries the registry's contract fields + relationship graph at build time; the orchestrator consumes the resolved semantic match at dispatch time. NOT on the prompt hot path. |
| Semantic inspection projection (SEM-02) | CLI (inspection) | Registry (data source) | The `router-control.mjs` CLI projects contract + relationship data; the registry provides the underlying records and graph. |
| Strict compilation gate (SEM-03) | Registry (build time) | — | Compilation runs during `assembleRegistry` after relationships are derived and before records are activated. Failures produce inactive records with reason codes, not exceptions. |
| Contract-compatible substitution (SEM-04) | Registry (dispatch time) | Orchestrator (trigger) | The substitution resolver traverses the relationship graph at dispatch time when a selected capability fails; the orchestrator triggers substitution and retains both routes for attribution. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib (`node:crypto`, `node:fs`, `node:path`) | built-in | All semantic resolution and compilation logic | Zero dependencies. Matches all existing `src/` modules. No new packages. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` + `node:assert/strict` | built-in | Test framework | All 156 existing test files use this; no external test runner |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `src/registry/semantic.mjs` for semantic resolution | Extend `src/orchestrator/select.mjs` | `select.mjs` is the workflow-declaration path (named-framework). Semantic resolution is a fundamentally different resolution mode (contract-based, not declaration-based). A separate module keeps the two paths cleanly separated and testable. |
| New `src/registry/substitute.mjs` for substitution | Extend `src/registry/eligibility.mjs` | Eligibility is per-capability (quarantine disposition); substitution is per-route (traversing the relationship graph to find an alternative). Different granularity. A separate module preserves the per-capability invariant of eligibility. |
| Extend `relationships.mjs` with compilation checks | New `compile.mjs` module | The compilation checks (ambiguous ties, native-identity collisions, incompatible outputs, unsafe compositions) operate ON the derived relationship graph — they are post-derivation validation. Extending `relationships.mjs` with a `compileRelationshipGraph` function keeps derivation + compilation in one module. A separate module would need to re-import the derived graph. |

**Installation:**
```bash
# No npm install. Zero dependencies. Stdlib-only.
```

**Version verification:** Not applicable — no external packages. All modules are stdlib-only Node.js ESM `.mjs` files.

## Package Legitimacy Audit

This phase installs no external packages. All code is stdlib-only Node.js ESM `.mjs`. No npm registry lookups, no `package.json` additions, no supply-chain surface.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    BUILD TIME (off hot path)
                    ========================
  assembleRegistry()
         |
         v
  buildCapabilityContract() ──> resolveContractOverlays() ──> applyContractOverlays()
         |                                                           |
         v                                                           v
  deriveRelationships()                                    overlaidRecords
  (8 edge types, cycle detection,                         + contracts
   evidence validation)
         |
         v
  +------ NEW: compileRelationshipGraph() (SEM-03) ------+
  |  rejects: ambiguous ties, native-identity collisions,  |
  |  incompatible outputs, unsafe compositions,             |
  |  unresolvable contracts, stale targets, missing deps    |
  +------+--------------------------------------------------+
         |
         v
  evaluateEligibility() ──> enrichedRecords (dispatchable = eligible)
         |
         v
  +------ NEW: resolveSemanticOutcome() (SEM-01) ------+
  |  matches by contract fields (inputs/outputs/         |
  |  dependencies/action) + relationship edges           |
  |  WITHOUT requiring a workflow_id declaration         |
  +------+-----------------------------------------------+
         |
         v
  registry { records, relationships, semanticMatches? }


                    DISPATCH TIME (off hot path)
                    ========================
  selectCapabilities() (workflow-declaration path)
         |
         | selected capability fails?
         v
  +------ NEW: resolveSubstitution() (SEM-04) ------+
  |  traverses substitute/fallback edges              |
  |  validates via evaluateEligibility               |
  |  checks authority/risk/scope/resource bounds     |
  |  retains both original + substitute route         |
  +------+-------------------------------------------+
         |
         v
  substitution record { original_route, substitute_route,
                         bounds_unchanged: true }


                    INSPECTION (CLI, off hot path)
                    ========================
  router-control.mjs
         |
  +------ NEW: semanticProjection() (SEM-02) ------+
  |  combines: contract fields (requires/produces)   |
  |  + relationship edges (conflicts/substitutions/  |
  |    compositions) + lifecycle evidence             |
  |  = "why this capability fits"                    |
  +------+-------------------------------------------+
```

### Recommended Project Structure
```
src/
├── registry/
│   ├── semantic.mjs       # NEW: SEM-01 resolver + SEM-03 compilation gate
│   ├── substitute.mjs     # NEW: SEM-04 substitution resolver
│   ├── relationships.mjs  # EXTENDED: add compileRelationshipGraph()
│   ├── contract.mjs       # UNCHANGED (18 CONTRACT_FIELDS, envelope, overlays)
│   ├── trust.mjs          # UNCHANGED (classifyEvidence, AUTHORITY_CRITICAL_FIELDS)
│   ├── eligibility.mjs    # UNCHANGED (10 gates, quarantine disposition)
│   ├── schema.mjs         # UNCHANGED (validateCapability, SEMANTIC_TYPES)
│   ├── identity.mjs       # UNCHANGED (stableCapabilityId, contentFingerprint)
│   └── build.mjs          # EXTENDED: wire compileRelationshipGraph + resolveSemanticOutcome
├── cli/
│   └── router-control.mjs # EXTENDED: add semanticProjection()
├── lifecycle/
│   └── router-lifecycle.mjs # EXTENDED: add new modules to moduleNames
└── orchestrator/
    └── select.mjs         # UNCHANGED (workflow-declaration path stays)
```

### Pattern 1: Semantic Resolution by Contract Match (SEM-01)
**What:** Resolve a capability by matching its contract fields (inputs, outputs, dependencies, action) against a semantic outcome specification, without requiring a workflow_id declaration.
**When to use:** When an operator requests an outcome that no named workflow declares, but installed capabilities have compatible contracts.
**Example:**
```javascript
// Source: derived from existing contract.mjs field structure [VERIFIED: src/registry/contract.mjs:5-24]
// and relationships.mjs edge types [VERIFIED: src/registry/relationships.mjs:7-16]

// The 18 CONTRACT_FIELDS available for semantic matching:
// purpose, triggers, inputs, outputs, preconditions, dependencies,
// permissions, side_effects, reversibility, risk, invocation_kind,
// lifecycle_role, scope, workflow_transitions, action, cost,
// completion, native_invocation

// The 8 RELATIONSHIP_TYPES for graph traversal:
// substitute, variant, prerequisite, composition, conflict,
// fallback, implementation, alias

// Semantic resolver pseudocode:
export function resolveSemanticOutcome({ outcome, records, relationships }) {
  // 1. Match by contract fields: find records whose outputs ⊇ outcome.requires
  //    and whose inputs ⊆ outcome.provides
  // 2. Filter by disposition === 'dispatch-candidate' (contract complete)
  // 3. Filter by eligibility.eligible === true (passes all 10 gates)
  // 4. Traverse substitute/fallback edges for alternatives
  // 5. Return ranked candidates with fit evidence
  // NEVER: grant authority, expand risk, or bypass evaluateEligibility
}
```

### Pattern 2: Strict Compilation Gate (SEM-03)
**What:** A post-derivation validation gate that rejects ambiguous ties, native-identity collisions, incompatible outputs, unsafe compositions, and unresolvable contracts before activation.
**When to use:** During `assembleRegistry`, after `deriveRelationships` and before `evaluateEligibility`.
**Example:**
```javascript
// Source: derived from existing deriveRelationships rejection pattern
// [VERIFIED: src/registry/relationships.mjs:57-85] (reasonsFor function)
// and schema.mjs native_type validation [VERIFIED: src/registry/schema.mjs:256-258]

// Existing rejection reasons in deriveRelationships:
// relationship_unknown_type, relationship_malformed_endpoint,
// relationship_self_edge, relationship_dangling_source,
// relationship_dangling_target, relationship_source_inactive,
// relationship_target_inactive, relationship_below_threshold,
// relationship_stale_evidence, relationship_conflicting_evidence,
// relationship_similarity_only, relationship_insufficient_evidence,
// relationship_cycle

// NEW compilation rejection reasons (SEM-03):
// compilation_ambiguous_tie       — multiple equally-ranked semantic matches
// compilation_native_collision    — same native_type, different stableCapabilityId
// compilation_incompatible_output — composition producer outputs ≠ consumer inputs
// compilation_unsafe_composition  — composition violates authority/risk/scope bounds
// compilation_unresolvable_contract — dispatch fields with state='unknown'
// compilation_stale_target        — relationship target freshness='stale'
// compilation_missing_dependency  — prerequisite dependency not in records
```

### Pattern 3: Contract-Compatible Substitution (SEM-04)
**What:** When a selected capability fails (quarantined, ineligible, or dispatch-failed), find a contract-compatible substitute via the relationship graph that stays within unchanged authority, risk, scope, and resource bounds.
**When to use:** At dispatch time, after `selectCapabilities` returns a selected capability that then fails eligibility or dispatch validation.
**Example:**
```javascript
// Source: derived from existing evaluateEligibility quarantine pattern
// [VERIFIED: src/registry/eligibility.mjs:194-248] and relationship types
// [VERIFIED: src/registry/relationships.mjs:7-16]

// Substitution resolver pseudocode:
export function resolveSubstitution({ failedRecord, records, relationships, authorityBounds }) {
  // 1. Traverse substitute/fallback edges from failedRecord
  // 2. For each candidate:
  //    a. Check contract compatibility (inputs/outputs/action match)
  //    b. Check evaluateEligibility === eligible
  //    c. Check authority bounds unchanged (risk <= failedRecord.risk,
  //       scope === failedRecord.scope, permissions ⊆ failedRecord.permissions)
  // 3. If exactly one candidate passes: return substitution record
  //    { original_route, substitute_route, bounds_unchanged: true }
  // 4. If zero or multiple: return { status: 'blocked', reason: 'no_compatible_substitute'
  //    or 'ambiguous_substitute' }
  // 5. Both routes retained for attribution (Phase 44 formalizes receipt state)
}
```

### Anti-Patterns to Avoid
- **Permission laundering via substitution:** Substituting a capability with one that has broader permissions, higher risk, or wider scope than the original. This violates SEM-04's "unchanged authority, risk, scope, and resource bounds." Always validate the substitute's `permissions`, `risk`, `reversibility`, and `scope` contract fields are within the original's bounds.
- **Framework privilege via semantic resolution:** Resolving a capability that has `contract.disposition === 'recommendation-only'` as if it were dispatchable. Semantic resolution must respect the contract disposition — only `dispatch-candidate` capabilities can be semantically resolved for dispatch.
- **Hot-path compilation:** Running `compileRelationshipGraph` or `resolveSemanticOutcome` inside the router hook. These are build-time operations that run during `assembleRegistry`. The hook only reads the pre-compiled registry.
- **Bypassing eligibility for semantic matches:** Resolving a semantically compatible capability without running it through `evaluateEligibility`. Contract field compatibility is NOT eligibility — a capability can have compatible outputs but fail the `dependency_closure` or `permission` gate.
- **Silent substitution:** Substituting a failed route without retaining the original route in attribution evidence. SEM-04 requires "both routes preserved" — the substitution record must include both `original_route` and `substitute_route`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relationship graph traversal | Custom graph walker | `deriveRelationships` + `relationshipReferences` in `relationships.mjs` | Already handles 8 edge types, cycle detection, evidence validation, acyclic type enforcement. Reuse the derived graph. |
| Contract field compatibility check | Custom field comparison | `validateContractFieldValue` + `CONTRACT_FIELDS` in `contract.mjs` | Already validates all 18 field types (string-list, enum, object). Reuse the canonical field set. |
| Eligibility evaluation | Custom eligibility logic | `evaluateEligibility` in `eligibility.mjs` | Already has 10 gates + quarantine disposition. Semantic resolution must not bypass this. |
| Authority/risk/scope bound checking | Custom bound comparison | `evaluateAuthorityPolicy` in `authority.mjs` + contract field envelopes | Authority policy is the sealed evaluator from Phase 39. Substitution must feed it the same inputs, not create a parallel path. |
| Evidence classification | Custom trust classification | `classifyEvidence` in `trust.mjs` | Already classifies provenance as trusted/untrusted and enforces structural minimums for authority-critical fields. |
| Capability identity | Custom ID generation | `stableCapabilityId` in `identity.mjs` | Already handles canonical_identity, shared_origin, and path-based fallback IDs with scope suffixes. |
| CLI projection | Custom formatting | `boundedResult` + `safeToken` + `safeIdentifier` in `router-control.mjs` | Existing projection helpers handle bounds, token validation, and identifier safety. |

**Key insight:** Phase 42 is a composition layer over existing Phase 39-41 primitives. The semantic resolver, compilation gate, and substitution resolver all reuse the contract envelope, eligibility evaluator, relationship graph, and authority policy as-is. The new code orchestrates these existing primitives — it does not reimplement them.

## Common Pitfalls

### Pitfall 1: Substitution Expanding Authority Bounds
**What goes wrong:** A substitute capability has broader permissions, higher risk, or wider scope than the failed original. The substitution "launders" authority by replacing a constrained capability with a less-constrained one.
**Why it happens:** The substitution resolver checks contract compatibility (inputs/outputs) but forgets to check that the substitute's authority-critical fields (`permissions`, `side_effects`, `risk`, `reversibility`) are within the original's bounds.
**How to avoid:** After finding a contract-compatible substitute, explicitly validate: `substitute.risk <= original.risk`, `stableStringify(substitute.scope) === stableStringify(original.scope)`, `substitute.permissions ⊆ original.permissions`, `substitute.reversibility` is at least as safe. Use the existing `AUTHORITY_CRITICAL_FIELDS` set from `trust.mjs` as the check list.
**Warning signs:** A substitution record where `bounds_unchanged: false` or where the substitute's `risk` field is `'high'` while the original's was `'low'`.

### Pitfall 2: Semantic Resolution Bypassing Eligibility
**What goes wrong:** A capability is semantically resolved (its contract fields match the outcome) but it fails eligibility (e.g., `dependency_closure` gate fails because a prerequisite is unavailable). The resolver dispatches an ineligible capability.
**Why it happens:** The semantic resolver checks contract field compatibility but forgets to run `evaluateEligibility` on the matched capability.
**How to avoid:** Every semantically resolved candidate MUST pass `evaluateEligibility` before being returned as a match. Contract field compatibility is necessary but not sufficient. The `contract.disposition === 'dispatch-candidate'` check is a fast-path pre-filter, but `evaluateEligibility` is the authoritative gate.
**Warning signs:** A semantic match where `record.eligibility.eligible === false` or `record.dispatchable === false`.

### Pitfall 3: Ambiguous Ties in Semantic Resolution
**What goes wrong:** Two capabilities have identical contract field compatibility for a semantic outcome. The resolver picks one arbitrarily, masking an ambiguity that should be surfaced.
**Why it happens:** The resolver sorts by a single criterion (e.g., confidence_basis_points) and two candidates tie. Without a deterministic tiebreaker, the result is non-deterministic or silently picks the first.
**How to avoid:** SEM-03 requires strict compilation to reject ambiguous ties. The resolver must detect when two candidates have identical semantic fit scores and either: (a) apply a deterministic tiebreaker (e.g., `stableCapabilityId` lexicographic order) and document it, or (b) return `status: 'ambiguous'` with both candidates. The strict compilation gate (SEM-03) must reject ambiguous ties before activation.
**Warning signs:** Two records with identical `confidence_basis_points` and identical contract field values for `inputs`/`outputs`/`action`.

### Pitfall 4: Native-Identity Collisions
**What goes wrong:** Two capabilities have the same `native_type` (e.g., `claude:skill`) but different `stableCapabilityId` values (because they come from different scopes or provenance). The semantic resolver treats them as the same capability.
**Why it happens:** The resolver matches by `native_type` instead of `stableCapabilityId`. `native_type` is namespaced (`runtime:type`) but not unique across scopes — two `claude:skill` records from different projects have the same `native_type`.
**How to avoid:** Always use `stableCapabilityId` as the unique capability identity. `native_type` is a classification, not an identity. The strict compilation gate (SEM-03) must reject records where `native_type` collides but `stableCapabilityId` differs, UNLESS they are explicitly linked by a `variant` relationship edge (which declares shared lineage).
**Warning signs:** Two records with `record.native_type === 'claude:skill'` but different `record.scope.kind` values and no `variant` edge between them.

### Pitfall 5: Composition Output Incompatibility
**What goes wrong:** A composition edge declares that capability A `composes-with` capability B, but A's `outputs` contract field doesn't match B's `inputs` contract field. The composition is structurally invalid.
**Why it happens:** The relationship graph accepts composition edges with evidence but doesn't validate that the producer's outputs are consumable by the consumer's inputs. The existing `deriveRelationships` checks evidence freshness/confidence but not I/O compatibility.
**How to avoid:** The strict compilation gate (SEM-03) must validate composition edges: for each `composition` edge, check that `source.contract.fields.outputs.value` and `target.contract.fields.inputs.value` have non-empty intersection (or one is a wildcard). If the contract fields are `state: 'unknown'`, the composition is unresolvable.
**Warning signs:** A composition edge where `source.contract.fields.outputs.state === 'unknown'` or `target.contract.fields.inputs.state === 'unknown'`.

### Pitfall 6: Hot-Path Compilation
**What goes wrong:** `compileRelationshipGraph` or `resolveSemanticOutcome` is called inside the router hook (`router.mjs`), blowing the <100ms budget.
**Why it happens:** The developer wires the semantic resolver into the hot path thinking it needs to run per-prompt.
**How to avoid:** All semantic resolution and compilation runs at build time inside `assembleRegistry`. The hook only reads the pre-compiled registry. If semantic resolution is needed at dispatch time, it runs inside `invokeImpl` (off the hot path), mirroring the `validateInvocation` + `preDispatchGate` pattern from Phase 41.
**Warning signs:** A function call to `resolveSemanticOutcome` or `compileRelationshipGraph` in `router.mjs` or any file imported by the hot path.

## Code Examples

### Existing Relationship Types and Evidence Rules (the extension point for SEM-03)
```javascript
// Source: src/registry/relationships.mjs:7-17 [VERIFIED]
const RULES = Object.freeze({
  substitute: 'explicit-substitution',
  variant: 'shared-lineage',
  prerequisite: 'dependency-declaration',
  composition: 'composition-declaration',
  conflict: 'conflict-declaration',
  fallback: 'fallback-declaration',
  implementation: 'implementation-binding',
  alias: 'explicit-alias',
});
const ACYCLIC_TYPES = new Set(['prerequisite', 'composition', 'fallback', 'implementation']);
export const RELATIONSHIP_TYPES = Object.freeze(Object.keys(RULES).sort());
```

### Existing Contract Fields (the semantic matching surface for SEM-01)
```javascript
// Source: src/registry/contract.mjs:5-24 [VERIFIED]
export const CONTRACT_FIELDS = Object.freeze([
  'purpose',
  'triggers',
  'inputs',
  'outputs',
  'preconditions',
  'dependencies',
  'permissions',
  'side_effects',
  'reversibility',
  'risk',
  'invocation_kind',
  'lifecycle_role',
  'scope',
  'workflow_transitions',
  'action',
  'cost',
  'completion',
  'native_invocation',
]);
```

### Existing Eligibility Gates (the gate SEM-01 must NOT bypass)
```javascript
// Source: src/registry/eligibility.mjs:5-16 [VERIFIED]
export const ELIGIBILITY_GATES = Object.freeze([
  'target_existence',
  'invocation_shape',
  'adapter',
  'dependency_closure',
  'permission',
  'scope',
  'side_effects',
  'reversibility',
  'risk',
  'field_confidence',
]);
```

### Existing Authority-Critical Fields (the SEM-04 bound checklist)
```javascript
// Source: src/registry/trust.mjs:3-9 [VERIFIED]
export const AUTHORITY_CRITICAL_FIELDS = Object.freeze(new Set([
  'permissions',
  'side_effects',
  'risk',
  'reversibility',
  'invocation_kind',
]));
export const TRUSTED_PROVENANCE = Object.freeze(new Set([
  'adapter',
  'correction',
]));
```

### Existing Receipt States (the extension point for SEM-04 attribution)
```javascript
// Source: src/adapters/dispatch/contract.mjs:36-40 [VERIFIED]
export const RECEIPT_STATES = Object.freeze([
  'pending', 'invoked', 'paused', 'completed', 'failed', 'recommendation_only',
  'blocked',
  'quarantined',
]);
// SEM-04 retains both routes in a substitution record. Phase 44 (RCPT-02)
// formalizes the 'substituted' receipt state. Phase 42 produces the
// attribution evidence record but does NOT add 'substituted' to RECEIPT_STATES.
```

### Existing Semantic Types (the capability classification for SEM-01)
```javascript
// Source: src/registry/schema.mjs:8-19 [VERIFIED]
const SEMANTIC_TYPES = [
  'command',
  'skill',
  'agent',
  'hook',
  'tool',
  'resource',
  'container',
  'configuration',
  'instruction',
  'unknown',
];
```

### Existing Registry Assembly Flow (the integration point for SEM-01/03)
```javascript
// Source: src/registry/build.mjs:334-358 [VERIFIED]
// Contract construction → overlays → relationships → eligibility → dispatchable
for (const record of records) {
  record.contract = buildCapabilityContract(record);
  validateCapabilityContract(record.contract);
}
const overlayResolution = options.overlays === undefined
  ? null
  : resolveContractOverlays(records, options.overlays, { lineage: options.overlayLineage });
const overlaidRecords = overlayResolution ? applyContractOverlays(records, overlayResolution) : records;
const relationships = options.relationships || deriveRelationships({
  records: overlaidRecords,
  candidates: options.relationshipCandidates,
});
// NEW (SEM-03): compileRelationshipGraph(overlaidRecords, relationships)
// NEW (SEM-01): resolveSemanticOutcome for each record (optional pre-computation)
const enrichedRecords = overlaidRecords.map(record => {
  const { eligibility: _authoredEligibility, dispatch_eligible: _authoredDispatchEligible, ...authoritative } = record;
  const eligibility = evaluateEligibility({
    record: authoritative,
    records: overlaidRecords,
    relationships,
  });
  return { ...authoritative, dispatchable: eligibility.eligible, eligibility };
});
```

### Existing Deploy Module List (the integration point for new modules)
```javascript
// Source: src/lifecycle/router-lifecycle.mjs:384-431 [VERIFIED]
const moduleNames = [
  'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
  'registry/fingerprint.mjs', 'registry/diff.mjs', 'registry/watcher.mjs',
  'registry/map.mjs', 'registry/validate.mjs', 'registry/activate.mjs',
  'registry/reconcile.mjs', 'registry/hook-reconcile.mjs',
  'registry/contract.mjs', 'registry/eligibility.mjs', 'registry/relationships.mjs',
  'registry/trust.mjs',
  // ... (other modules)
];
// NEW (SEM-01/03/04): add 'registry/semantic.mjs', 'registry/substitute.mjs'
// Deployed to BOTH ownedRoot and codexOwnedRoot via moduleValues flatMap.
```

### Existing Relationship Projection (the extension point for SEM-02)
```javascript
// Source: src/cli/router-control.mjs:493-509 [VERIFIED]
export function relationshipProjection({ relationships = {}, limit = MAX_DIFF, offset = 0 } = {}) {
  const values = [
    ...(Array.isArray(relationships?.edges) ? relationships.edges : []),
    ...(Array.isArray(relationships?.candidates) ? relationships.candidates : []),
  ].map(relationshipItemProjection)
    .sort((left, right) => left.id.localeCompare(right.id) || stableStringify(left).localeCompare(stableStringify(right)));
  const bounded = boundedResult(values, { limit, offset });
  return {
    total: bounded.meta.total,
    returned: bounded.meta.returned,
    truncated: bounded.meta.truncated,
    limit: bounded.meta.limit,
    offset: bounded.meta.offset,
    next_offset: bounded.meta.next_offset,
    relationships: bounded.values,
  };
}
// NEW (SEM-02): semanticProjection combines contract fields + relationship
// edges + lifecycle evidence into a unified "why this fits" view.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workflow-declaration-only capability selection | Semantic contract resolution without named framework | Phase 42 (this phase) | Unfamiliar/proprietary capabilities can be resolved without a workflow_id |
| Relationship derivation with cycle/evidence validation | Strict compilation with ambiguous-tie/native-collision/I/O-compat rejection | Phase 42 (this phase) | Unsafe compositions and ambiguous matches fail before activation |
| Quarantine with fallback eligibility (per-capability) | Contract-compatible substitution with bound preservation (per-route) | Phase 42 (this phase) | Failed routes get attributed substitutes within unchanged bounds |
| Contract + relationship inspection (separate projections) | Unified semantic projection (requires/produces/conflicts/compositions/lifecycle) | Phase 42 (this phase) | Operators see "why this fits" in one view |

**Deprecated/outdated:**
- `selectCapabilities` in `select.mjs` is NOT deprecated — it remains the workflow-declaration path. Phase 42 adds a parallel semantic resolution path. Both coexist; the orchestrator chooses which path based on whether a workflow declaration exists.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The semantic resolver should be a new `src/registry/semantic.mjs` module rather than extending `select.mjs` | Architecture Patterns | If the semantic resolution logic is small enough to inline in `select.mjs`, the separate module adds import overhead. Mitigation: start with a separate module for testability; the two paths are fundamentally different (contract-based vs declaration-based). |
| A2 | The substitution resolver should be a new `src/registry/substitute.mjs` module rather than extending `eligibility.mjs` | Architecture Patterns | If substitution is per-capability (not per-route), it could be an eligibility extension. Mitigation: SEM-04 says "both routes preserved" — this is per-route, not per-capability. Different granularity. |
| A3 | Phase 42 should NOT add 'substituted' to RECEIPT_STATES — that is Phase 44's RCPT-02 responsibility | Code Examples | If Phase 42 needs the receipt state for attribution, it must coordinate with Phase 44. Mitigation: Phase 42 produces a substitution record (attribution evidence) without formalizing the receipt state. |
| A4 | The strict compilation gate runs during `assembleRegistry` after `deriveRelationships` and before `evaluateEligibility` | Architecture Patterns | If compilation needs to run after eligibility (to check eligibility results), the ordering changes. Mitigation: compilation checks the relationship graph + contract fields, not eligibility results — it can run before eligibility. |
| A5 | Semantic resolution pre-computation is optional at build time; the primary resolution can happen at dispatch time | Architecture Patterns | If pre-computation is required for performance, the build-time step is mandatory. Mitigation: at 186 records, semantic resolution is sub-millisecond — pre-computation is optional but not required. |
| A6 | The `native_type` field on records is the correct field for native-identity collision detection | Code Examples, Pitfalls | If `native_type` is not unique per scope (e.g., two `claude:skill` records from different projects), the collision check may flag false positives. Mitigation: only flag collisions when no `variant` edge links the records (shared lineage declared). |

## Open Questions (RESOLVED)

1. **Should semantic resolution pre-compute matches at build time or resolve on-demand at dispatch time?**
   - What we know: At 186 records, semantic resolution is sub-millisecond. Build-time pre-computation stores matches in the registry; on-demand resolution runs at dispatch time.
   - What's unclear: Whether the orchestrator needs matches available before dispatch (e.g., for strategy selection in Phase 43).
   - RESOLVED: Phase 42 implements `resolveSemanticOutcome` as an on-demand pure-function library available off the hot path. It is NOT wired into `assembleRegistry` (no registry schema change). `compileRelationshipGraph` IS wired into `assembleRegistry` (build-time only). Phase 43 may wire `resolveSemanticOutcome` into the orchestrator's dispatch path or strategy selection if needed.

2. **Should the substitution resolver be wired into the orchestrator's dispatch path in Phase 42, or only provide the function for Phase 43/44 to wire?**
   - What we know: SEM-04 requires "a failed selected capability can be substituted." The existing dispatch path (`selectCapabilities` → `resolveDependencies`) doesn't have a substitution hook.
   - What's unclear: Whether Phase 42 should wire the substitution resolver into the dispatch flow or just provide the function.
   - RESOLVED: Phase 42 provides `resolveSubstitution` as a pure-function library with full bounds checking and attribution retention. It is NOT wired into the orchestrator's dispatch path — the existing dispatch flow (`selectCapabilities` → `resolveDependencies`) is unchanged. Phase 43 (Proportional Planning and Production Dispatch) wires the substitution resolver into the dispatch path as part of strategy selection and fallback. Phase 44 (RCPT-02) formalizes the `'substituted'` receipt state. This divergence from the original "wire it in" recommendation is deliberate: Phase 42's scope is the semantic graph and safe composition primitives, while Phase 43 owns dispatch strategy wiring.

3. **Should the strict compilation gate produce inactive records or throw exceptions?**
   - What we know: The existing `deriveRelationships` produces inactive edges with reason codes (non-throwing). The existing `validateCapability` throws `TypeError` for invalid records.
   - What's unclear: Whether compilation failures should be soft (inactive records with reasons) or hard (exceptions that halt the build).
   - RESOLVED: Follow the `deriveRelationships` pattern — `compileRelationshipGraph` produces diagnostics with reason codes (`compilation_*`) and a `compiled: boolean` flag, and lets the build continue. The diagnostics are conditionally spread into the assembled registry (only when non-empty). Exceptions are reserved for structural validation (schema violations) via `TypeError`, matching `validateCapabilityContract`.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — all code is stdlib-only Node.js ESM `.mjs`, no external tools, services, or runtimes required beyond the existing Node.js binary at `/Users/guilherme/.hermes/node/bin/node`)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in Node test runner, stdlib-only) |
| Config file | none — existing `test/` layout; per-module `*.test.mjs` files |
| Quick run command | `node --test tests/router.relationships.test.mjs tests/router.contract-eligibility.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |
| Estimated runtime | ~25 seconds |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEM-01 | Semantic outcome resolves compatible capability without workflow_id declaration | unit | `node --test tests/router.semantic-resolution.test.mjs` | ❌ Wave 0 |
| SEM-02 | Inspect versioned requires/produces/conflicts/substitutions/compositions/lifecycle evidence | unit | `node --test tests/router.semantic-inspection.test.mjs` | ❌ Wave 0 |
| SEM-03 | Strict compilation rejects ambiguous ties, native collisions, incompatible outputs, unsafe compositions, unresolvable contracts | unit | `node --test tests/router.semantic-compilation.test.mjs` | ❌ Wave 0 |
| SEM-04 | Failed route substitutes to contract-compatible candidate within unchanged bounds, both routes retained | unit | `node --test tests/router.semantic-substitution.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test tests/<phase-42-touched-module>.test.mjs`
- **Per wave merge:** `rtk node --test tests/*.test.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/router.semantic-resolution.test.mjs` — covers SEM-01 semantic outcome resolution
- [ ] `tests/router.semantic-inspection.test.mjs` — covers SEM-02 semantic projection inspection
- [ ] `tests/router.semantic-compilation.test.mjs` — covers SEM-03 strict compilation gate
- [ ] `tests/router.semantic-substitution.test.mjs` — covers SEM-04 contract-compatible substitution
- [ ] Extend `tests/router.relationships.test.mjs` — compilation check coverage (SEM-03 integration)

*(Existing test infrastructure: node:test, stdlib-only, 156 test files. Only per-module stubs are added.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A — semantic resolution does not authenticate; it resolves capabilities |
| V3 Session Management | no | N/A — no session state in semantic resolution |
| V4 Access Control | yes | `evaluateEligibility` (10 gates) + `evaluateAuthorityPolicy` — semantic resolution must not bypass these. Substitution must stay within unchanged authority bounds (SEM-04). |
| V5 Input Validation | yes | `validateContractFieldValue` + `CONTRACT_FIELDS` validation — semantic outcome specifications are validated against the canonical contract field set. Untrusted evidence is rejected by `classifyEvidence` in `trust.mjs`. |
| V6 Cryptography | no | N/A — no cryptographic operations in semantic resolution (uses existing `stableCapabilityId` for identity, which uses `node:crypto` internally) |

### Known Threat Patterns for Semantic Graph

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Permission laundering via substitution | Elevation of privilege | Substitute's `permissions`, `risk`, `reversibility`, `scope` must be within original's bounds (SEM-04). Check `AUTHORITY_CRITICAL_FIELDS`. |
| Framework privilege via semantic resolution | Elevation of privilege | Only `dispatch-candidate` disposition capabilities can be semantically resolved. `recommendation-only` capabilities cannot. |
| Native-identity collision spoofing | Spoofing | Strict compilation rejects same `native_type` + different `stableCapabilityId` without a `variant` edge (SEM-03). |
| Composition output injection | Tampering | Strict compilation validates composition I/O compatibility — producer outputs must match consumer inputs (SEM-03). |
| Ambiguous tie exploitation | Repudiation | Strict compilation rejects ambiguous ties — multiple equally-ranked matches fail before activation (SEM-03). |
| Untrusted evidence in semantic matching | Information spoofing | `classifyEvidence` in `trust.mjs` rejects `authored` provenance for authority-critical fields. Semantic matching uses only trusted contract field values. |
| Hot-path latency violation | Denial of service | All semantic resolution and compilation runs at build time or dispatch time — NEVER on the prompt hot path (Pitfall 6). |

## Sources

### Primary (HIGH confidence)
- `src/registry/relationships.mjs` — read directly: 8 RELATIONSHIP_TYPES, deriveRelationships, cycle detection, evidence validation, relationshipReferences
- `src/registry/contract.mjs` — read directly: 18 CONTRACT_FIELDS, envelope(), buildCapabilityContract, resolveContractOverlays, applyContractOverlays, validateCapabilityContract, hasUnsafeAuthoredContent
- `src/registry/trust.mjs` — read directly: classifyEvidence, AUTHORITY_CRITICAL_FIELDS, TRUSTED_PROVENANCE
- `src/registry/eligibility.mjs` — read directly: 10 ELIGIBILITY_GATES, evaluateEligibility, quarantine disposition (injection_bearing, scope_escaping, stale_unavailable), isQuarantined
- `src/registry/schema.mjs` — read directly: validateCapability, 10 SEMANTIC_TYPES, LIFECYCLE_ROLES, stableStringify, canonicalizeCapability
- `src/registry/identity.mjs` — read directly: stableCapabilityId, contentFingerprint
- `src/registry/build.mjs` — read directly: assembleRegistry flow (contracts → overlays → relationships → eligibility → dispatchable)
- `src/adapters/dispatch/contract.mjs` — read directly: validateInvocation, preDispatchGate, RECEIPT_STATES, buildReceipt, createDispatchAdapter
- `src/orchestrator/select.mjs` — read directly: selectCapabilities (workflow-declaration path), resolveDependencies (closure)
- `src/cli/router-control.mjs` — read directly: relationshipProjection, contractDetailProjection, fieldProjection, contractListProjection
- `src/lifecycle/router-lifecycle.mjs` — read directly: moduleNames deploy list, moduleValues flatMap over [ownedRoot, codexOwnedRoot]
- `.planning/REQUIREMENTS.md` — SEM-01..04 requirement text
- `.planning/ROADMAP.md` — Phase 42 goal, success criteria, dependency on Phase 41
- `.planning/phases/41-manifest-vnext-and-trust-hardening/41-RESEARCH.md` — Phase 41 patterns and established conventions
- `.planning/phases/41-manifest-vnext-and-trust-hardening/41-03-SUMMARY.md` — quarantine disposition patterns (per-capability, validate-if-present)
- `tests/router.relationships.test.mjs` — test conventions for relationship graph (edge/candidate/record fixtures)

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — Phase 41 key decisions (quarantine as disposition not gate, hasUnsafeAuthoredContent export, validate-if-present pattern)

### Tertiary (LOW confidence)
- None — all findings verified by reading source files directly this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, verified by reading all existing source modules
- Architecture: HIGH — derived from existing assembleRegistry flow, module deploy pattern, and CLI projection pattern
- Pitfalls: HIGH — derived from SEM-04 constraint analysis and existing quarantine/eligibility patterns
- Security: HIGH — ASVS categories mapped to existing trust/eligibility/authority modules

**Research date:** 2026-08-08
**Valid until:** 2026-09-08 (30 days — stable codebase, no external dependencies)