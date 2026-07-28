# Phase 21: Authoritative Personalized Inventory - Research

**Researched:** 2026-07-26
**Domain:** Local capability discovery, canonical reconciliation, identity continuity, and safe inventory inspection
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Capability Coverage
- **D-01:** Every discovered artifact receives a normalized inventory record. Commands, skills, agents, hooks, MCP servers and tools, plugins, configuration files, and instruction files are distinguished through explicit lifecycle role and dispatchability rather than separate inventories.
- **D-02:** Unknown future artifact types remain visible as opaque normalized records. Preserve native type, provenance, scope, fingerprint, and adapter evidence; use semantic category `unknown` and keep the record non-dispatchable until an adapter can interpret it safely.
- **D-03:** Semantic classification uses a small stable framework-neutral core with namespaced adapter extensions. Router core must not gain ecosystem conditionals when a runtime introduces a new type.
- **D-04:** Compound installations are represented by both their container and discovered members. A plugin or MCP server and each exposed skill, command, agent, hook, resource, or tool receive records linked by provenance.

### Reconciliation Behavior
- **D-05:** Authoritative reconciliation runs at startup, periodically on a bounded schedule, and immediately after dropped or ambiguous events, watcher restart, root replacement, or fingerprint mismatch.
- **D-06:** A partial or unreadable authoritative scan cannot replace the last complete inventory. Retain the last complete snapshot and report degraded or stale state with the affected roots and reasons.
- **D-07:** Incremental and authoritative paths must converge on a byte-identical canonical semantic snapshot: sorted normalized records, evidence, enabled state, dependencies, and affected relationship references. Exclude timestamps, event order, scan IDs, and other volatile processing metadata.
- **D-08:** Inspection exposes active and candidate generation IDs, the last complete reconciliation, trigger, pending changes, stale or unreadable roots, and a clear `current`, `reconciling`, `degraded`, or `failed` state.

### Identity and Invalidation
- **D-09:** Preserve identity across rename or move only when a valid declared stable ID proves continuity or one removed artifact uniquely matches the exact content fingerprint. Similarity is advisory evidence only.
- **D-10:** Identical content at two simultaneously live paths represents two distinct capabilities. Preserve the exact-content match as evidence for later relationship analysis; do not merge identity.
- **D-11:** Removal or required-dependency loss invalidates all transitive aliases, equivalence references, workflow references, corrections, and compiled routes within the same candidate transaction and before mapping or activation.
- **D-12:** A disabled capability remains inspectable with its identity and provenance preserved, but `enabled: false`, non-dispatchable status, and downstream dispatch references invalidated in the same transaction.
- **D-13:** A replacement is a new identity unless the D-09 continuity rule proves otherwise. Preserve replacement evidence for later relationship analysis without silently transferring trust or corrections.

### Trust, Scope, and Inspection
- **D-14:** Discovery canonicalizes paths before trust decisions. A symlink may be observed only when its resolved target remains inside the same declared and authorized root, cannot form a cycle, and is revalidated; escapes and unsafe links are excluded with diagnostics.
- **D-15:** Global, user-local, project, and worktree records remain separate identities. Runtime adapters may report native precedence as evidence, but Router core does not merge same-named records or assume one framework's precedence model.
- **D-16:** Capability-authored prose is untrusted evidence. It cannot define Router policy, grant permissions, mark itself dispatchable, override scope, or create executable invocation data except through explicitly schema-validated adapter fields.
- **D-17:** Inventory inspection shows logical root, relative source path, runtime, scope, native and semantic type, enabled and dispatchable state, lifecycle role, fingerprint, adapter/parser version, dependency state, provenance, and diagnostics. Secret values and raw instruction/configuration bodies are redacted by default.

### Portability Proof
- **D-18:** Phase verification must prove that Router works automatically for another user whose skills, commands, agents, hooks, plugins, MCP configuration, and instruction files differ from the current machine.
- **D-19:** Use isolated synthetic home and project roots for at least Claude-heavy, Codex-heavy, mixed/custom, and unknown-future-type profiles. Include add, edit, rename, move, disable, replace, dependency-loss, and removal mutations.
- **D-20:** For every profile and mutation sequence, incremental and clean authoritative reconciliation must converge to the same canonical snapshot and invalidation result.
- **D-21:** Tests must fail if discovery relies on the current user's paths or capability names, treats Claude, Codex, GSD, or another framework as the default, or requires Router-core changes merely to retain an unknown adapter-defined type.

### the agent's Discretion
- After the user selected the recommended options for the first eleven decisions, they explicitly authorized the recommended choice for every remaining decision. Planners retain discretion over internal module boundaries, exact field names, scan intervals, and diagnostic codes as long as D-01 through D-21 remain true.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DISC-01 | Discover user- and project-scoped commands, skills, agents, hooks, MCP servers, tools, plugins, and instruction files from actual Claude and Codex installations. | Extend adapter layout/root declarations into exhaustive known-family plus opaque fallback discovery; prove with synthetic profiles. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/adapters/claude.mjs`, `src/adapters/codex.mjs`] |
| DISC-02 | Record runtime, scope, provenance, enabled state, invocation form, dependencies, and lifecycle role without ecosystem-name assumptions. | Evolve the canonical schema with explicit semantic/native type, lifecycle role, enabled state, adapter evidence, and optional validated invocation. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/registry/schema.mjs`] |
| DISC-03 | Mutations update the candidate registry and every affected relationship. | Introduce candidate-transaction invalidation before mapping/publication and model disabled artifacts as retained records. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/registry/reconcile.mjs`, `src/registry/watcher.mjs`] |
| DISC-04 | Incremental and authoritative reconciliation converge byte-identically despite filesystem event loss/reordering. | Use one canonical snapshot assembler for both paths, retain a complete-scan baseline, and compare semantic bytes in mutation-sequence tests. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/registry/validate.mjs`, `src/registry/watcher.mjs`] |
| DISC-05 | Removal or dependency loss transitively invalidates all downstream references before activation. | Add deterministic graph closure over aliases, equivalence/workflow references, corrections, mappings, and compiled routes inside reconciliation. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/registry/reconcile.mjs`] |
| DISC-06 | Identify Claude-versus-Codex gaps semantically and without a default runtime. | Produce availability projections from framework-neutral semantic categories after normalization; keep runtime-specific interpretation in adapters. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/adapters/claude.mjs`, `src/adapters/codex.mjs`] |
| DISC-07 | Retain unknown future types through adapter boundaries without Router-core conditionals. | Normalize unrecognized adapter observations as `semantic_type: unknown`, preserve namespaced native type/evidence, and force non-dispatchability. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/adapters/claude.mjs`, `src/adapters/codex.mjs`] |
| DISC-08 | Canonicalize paths, reject escapes/unsafe symlinks, and treat authored text as untrusted evidence. | Reuse fingerprint realpath/containment handling, close adapter traversal gaps, and schema-gate every field that can influence dispatch or policy. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/registry/fingerprint.mjs`, `src/adapters/claude.mjs`] |
</phase_requirements>

## Summary

Phase 21 should extend the existing v1.2 adapter → acquisition → assembly → reconciliation → mapping → verification → activation pipeline. The project already has deterministic serialization, SHA-256 fingerprints, scope-separated identities, incremental filesystem watching, authoritative tree scans, last-known-good activation, and an incremental/full equivalence gate. The safest plan is to evolve these seams rather than create another inventory database or discovery daemon. [VERIFIED: `src/registry/schema.mjs`, `src/registry/fingerprint.mjs`, `src/registry/watcher.mjs`, `src/registry/validate.mjs`, `src/registry/activate.mjs`]

The highest-risk work is semantic correctness, not file enumeration. Current layouts return `null` for unknown paths, current normalized records lack explicit `enabled` and lifecycle-role fields, fallback identity derives from runtime/type/native name, and reconciliation only directly checks aliases and declared dependencies. Current watcher status also exposes `ready`/`error`, records every reconciliation as `strategy: incremental`, and writes the new fingerprint baseline after any successful callback even when the scan contains unreadable-root diagnostics. These gaps conflict directly with D-02, D-06 through D-13, and D-17. [VERIFIED: `src/adapters/claude.mjs`, `src/adapters/codex.mjs`, `src/registry/identity.mjs`, `src/registry/reconcile.mjs`, `src/registry/watcher.mjs`]

The plan should therefore proceed in dependency order: schema/canonical snapshot contract; adapter coverage and untrusted-input boundary; complete-scan authority state; identity continuity; transaction-wide invalidation; inspection; then portability/convergence matrices. This preserves the existing publication safety boundary and makes each later task testable against stable bytes. [VERIFIED: `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md`, `src/registry/watcher.mjs`]

**Primary recommendation:** Build one versioned canonical semantic snapshot and make both incremental refresh and full authoritative acquisition produce it before any invalidation, mapping, verification, or activation. [VERIFIED: `src/registry/build.mjs`, `src/registry/watcher.mjs`, `src/registry/validate.mjs`]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Root enumeration and native parsing | Runtime adapters | Filesystem acquisition | Claude/Codex layout knowledge already lives in adapters and must not leak into core. [VERIFIED: `src/adapters/claude.mjs`, `src/adapters/codex.mjs`] |
| Path/symlink trust | Filesystem acquisition | Runtime adapters | `scanFingerprintTree` already owns realpath, containment, cycle, and read diagnostics; adapters must apply the same boundary when parsing. [VERIFIED: `src/registry/fingerprint.mjs`, `src/adapters/claude.mjs`] |
| Canonical semantic record | Registry schema/assembly | Runtime adapters | Adapters supply native evidence; core validates and sorts framework-neutral fields. [VERIFIED: `src/registry/schema.mjs`, `src/registry/build.mjs`] |
| Identity continuity | Registry identity/diff | Runtime adapters | Core enforces stable-ID/exact-fingerprint rules; adapters expose declared IDs and source evidence. [VERIFIED: `src/registry/identity.mjs`, `src/registry/diff.mjs`] |
| Complete-scan authority | Watcher/control plane | Fingerprint scanner | The watcher schedules and publishes state while the scanner reports root completeness. [VERIFIED: `src/registry/watcher.mjs`, `src/registry/fingerprint.mjs`] |
| Transitive invalidation | Candidate reconciliation | Mapping/compiler | Invalid references must be removed or blocked before mapping and compiled publication. [VERIFIED: `src/registry/reconcile.mjs`, `src/registry/map.mjs`, `src/prompt/publish-index.mjs`] |
| Inventory inspection | Control CLI | Watcher status/candidate files | CLI already owns bounded canonical output and active registry inspection. [VERIFIED: `src/cli/router-control.mjs`, `src/registry/watcher.mjs`] |

## Project Constraints (from AGENTS.md)

- Prefix shell commands with `rtk`; the repository-level `AGENTS.md` imports `/Users/guilherme/.codex/RTK.md`. [VERIFIED: `AGENTS.md`, `/Users/guilherme/.codex/RTK.md`]
- Preserve the current dirty worktree and avoid unrelated edits; Phase 21 planning artifacts coexist with pre-existing modified milestone/planning files. [VERIFIED: `git status --short` on 2026-07-26]
- Use the existing GSD workflow for planning/execution and retain fail-open prompt-time behavior; discovery and reconciliation remain background control-plane work. [VERIFIED: `.claude/CLAUDE.md`, `.planning/PROJECT.md`]
- There are no repository-local `.codex/skills` or `.agents/skills` directories, so no additional project skill rules apply. [VERIFIED: filesystem inspection on 2026-07-26]

## Standard Stack

### Core

| Library / Module | Version | Purpose | Why Standard |
|------------------|---------|---------|--------------|
| Node.js ESM + stdlib | v22.22.3 available; project requires Node-compatible `.mjs` | Filesystem, hashing, path canonicalization, atomic JSON | Existing implementation is dependency-free ESM and uses `node:fs`, `node:path`, and `node:crypto`. [VERIFIED: `node --version`, `src/registry/*.mjs`] |
| `src/adapters/{claude,codex}.mjs` | internal adapter versions (`claude-adapter/3`, `codex-adapter/3`) | Native layouts, parsing, root discovery, normalization | Existing framework boundary and correct owner of native type extensions. [VERIFIED: adapter source] |
| `src/registry/schema.mjs` | schema v1, to evolve compatibly/version explicitly | Validation, canonicalization, stable serialization | `stableStringify` and set-like sorting already define deterministic bytes. [VERIFIED: `src/registry/schema.mjs`] |
| `src/registry/fingerprint.mjs` | fingerprint state v1 | Authoritative tree scan and safe realpath traversal | Already provides SHA-256 tree state, diagnostics, containment, and cycle handling. [VERIFIED: `src/registry/fingerprint.mjs`] |
| `src/registry/{diff,identity,reconcile}.mjs` | internal | Lifecycle evidence, identity, candidate safety | These are the existing pre-mapping correctness seams. [VERIFIED: named source files] |
| `src/registry/watcher.mjs` | internal | Startup, event debounce, periodic repair, acquisition, publication | Already owns the single-flight background pipeline and status heartbeat. [VERIFIED: `src/registry/watcher.mjs`] |
| `src/cli/router-control.mjs` | internal | Privacy-safe inspection | Already emits canonical structured/text results for status/diff/explain. [VERIFIED: `src/cli/router-control.mjs`] |

### Supporting

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/registry/build.mjs` | Acquire and assemble normalized adapter observations | Make both refresh strategies terminate at the same assembly contract. [VERIFIED: `src/registry/build.mjs`] |
| `src/registry/validate.mjs` | Incremental/full byte-equivalence and activation gates | Extend the equivalence fixture inputs, not the gate ordering. [VERIFIED: `src/registry/validate.mjs`] |
| `src/registry/activate.mjs` | Immutable last-known-good publication and rollback | Preserve unchanged as the authority boundary after Phase 21 candidate checks. [VERIFIED: `src/registry/activate.mjs`] |
| Node test runner | 76 existing `.test.mjs` files | Add focused unit/mutation tests without introducing a test dependency. [VERIFIED: tracked test file inventory] |

**Installation:** No external package installation is required. [VERIFIED: repository has no `package.json`; implementation imports Node stdlib and local modules]

## Architecture Patterns

### System Architecture Diagram

```text
Declared authorized roots
        |
        v
realpath + bounded authoritative scan ---- unreadable/escape/cycle ----> diagnostics
        | complete
        v
runtime adapters (native parse + opaque fallback + schema-gated evidence)
        |
        v
canonical semantic snapshot assembler <---- incremental refresh
        |                                  (events are hints only)
        +---- clean authoritative rebuild
        |
        v
identity continuity + mutation classification
        |
        v
candidate transaction:
  enabled/dependency resolution -> transitive reference invalidation
        |
        v
candidate reconciliation -> mapping -> verifier -> immutable activation
        |
        +---- inspection projection (redacted records, generations, freshness)
```

[VERIFIED: derived from `src/registry/watcher.mjs`, `src/registry/build.mjs`, `src/registry/reconcile.mjs`, and locked D-05 through D-17]

### Recommended Project Structure

```text
src/
├── adapters/
│   ├── claude.mjs              # Claude roots/native observations
│   ├── codex.mjs               # Codex roots/native observations
│   └── shared discovery seam   # optional extraction if adapters outgrow createAdapter
├── registry/
│   ├── schema.mjs              # canonical semantic record/snapshot
│   ├── fingerprint.mjs         # complete root scan + authority diagnostics
│   ├── identity.mjs            # declared-ID/exact-content continuity
│   ├── diff.mjs                # deterministic mutation classification
│   ├── reconcile.mjs           # closure invalidation and candidate verdict
│   ├── build.mjs               # common incremental/full snapshot assembly
│   └── watcher.mjs             # triggers, generations, freshness/state
└── cli/
    └── router-control.mjs       # redacted inventory/status inspection
tests/
├── router.inventory-*.test.mjs # Phase 21 focused units
└── fixtures/inventory-profiles # synthetic homes/projects and mutations
```

[VERIFIED: structure follows existing module ownership; new exact fixture path is planner discretion]

### Pattern 1: Events Are Hints; Snapshots Are Truth

**What:** Use filesystem events only to select dirty roots and schedule work. Re-scan/re-parse authoritative content, then derive lifecycle changes by comparing canonical snapshots. [VERIFIED: `createRegistryWatcher` already debounces dirty roots and scans before diffing]

**When to use:** Every add/edit/rename/move/disable/remove/replace path, especially filename-less, duplicated, reordered, and coalesced events. [VERIFIED: D-05, D-07, D-20]

### Pattern 2: Complete Snapshot Promotion

**What:** Maintain `lastCompleteFingerprintState` and `lastCompleteSemanticSnapshot`. A scan with unreadable or uncertain roots may publish diagnostics and freshness state, but cannot replace either complete baseline. [VERIFIED: D-06; current `diffFingerprintTrees` already identifies access/read/scan uncertainty]

**When to use:** Startup, scheduled repair, watcher restart, root replacement, fingerprint mismatch, and any ambiguous event. [VERIFIED: D-05]

### Pattern 3: Adapter Evidence, Core Semantics

**What:** Adapters emit a native observation with namespaced native type, parser version, validated fields, and opaque evidence. Core maps it to a small semantic category and never branches on Claude/Codex/GSD names. [VERIFIED: D-02, D-03, D-07; existing `createAdapter` pattern]

**When to use:** Known artifact families, compound container/member discovery, and unknown future types. [VERIFIED: D-01 through D-04]

### Pattern 4: Candidate-Local Invalidation Closure

**What:** Construct a deterministic reference graph from candidate records and retained relationship/correction/route references; seed invalidation with removed, disabled, replaced, or dependency-unhealthy identities; traverse all outgoing dependents; emit sorted invalidation evidence and prevent affected nodes from mapping. [VERIFIED: D-11 through D-13; current reconciliation only performs direct checks]

**When to use:** Before `mapCandidateRegistry` on every candidate transaction. [VERIFIED: `createRegistryReconciler` currently calls evaluate before mapper]

### Anti-Patterns to Avoid

- **Adding another manifest format:** It would split authority from the existing candidate/active pipeline. Extend the canonical snapshot instead. [VERIFIED: existing `candidate_path`, report, mapping, and activation pipeline in `watcher.mjs`]
- **Treating `fs.watch` delivery as a mutation log:** Events can be missing, duplicated, coalesced, or filename-less. [VERIFIED: existing watcher tests already cover filename-less hints; D-04 requires all event anomalies]
- **Advancing baseline after a partial scan:** This can turn unknown removals into authoritative removals on later runs. Retain the last complete baseline. [VERIFIED: D-06; current `reconcileDirty` writes current state unconditionally after callback success]
- **Using content similarity as identity:** Exact fingerprint is allowed only for a unique removed→added match; simultaneous duplicates remain distinct. [VERIFIED: D-09, D-10]
- **Making every normalized artifact invocable:** Containers, config, instructions, hooks, and unknown types must remain inspectable without becoming task-dispatch targets. [VERIFIED: D-01, D-02, D-04, D-16]
- **Parsing prose into policy fields in core:** Capability-authored text is evidence, never authority. [VERIFIED: D-16, DISC-08]
- **Hard-coding a capability-gap matrix by runtime name:** Compute semantic availability from records; runtime labels are projection dimensions, not defaults. [VERIFIED: DISC-06, D-15]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stable JSON bytes | Ad hoc recursive sorter per feature | `stableStringify` and canonicalization in `schema.mjs` | Existing set-like sorting and unsupported-value rejection are already tested. [VERIFIED: `src/registry/schema.mjs`] |
| Path trust | String-prefix-only security checks | `realpath` + `path.relative`/containment + cycle tracking from `fingerprint.mjs` | Symlinks and missing-root ancestors require canonical filesystem identity. [VERIFIED: `src/registry/fingerprint.mjs`] |
| Background scheduling | A second timer/daemon | `createRegistryWatcher` single-flight debounce and repair scheduling | Existing code handles reruns, bounded latency, close, and root grouping. [VERIFIED: `src/registry/watcher.mjs`] |
| Publication safety | Mutable active inventory file | Existing immutable version, verifier, CAS, rollback, recovery lifecycle | v1.2 already establishes last-known-good authority. [VERIFIED: `src/registry/activate.mjs`, `.planning/PROJECT.md`] |
| Framework gap logic | Claude-vs-Codex conditional tables | Semantic-category projection over normalized records | Required to remain framework-neutral and future-proof. [VERIFIED: DISC-06, DISC-07] |
| Transitive invalidation | Repeated special-case loops for aliases/routes | One deterministic graph-closure function | D-11 enumerates several reference families that must invalidate atomically. [VERIFIED: D-11] |

**Key insight:** Phase 21's correctness comes from one authoritative semantic transaction, not from adding more watchers or parsers. [VERIFIED: D-05 through D-13 and existing pipeline ordering]

## Common Pitfalls

### Pitfall 1: Schema Requires Invocation for Non-Dispatchable Records

**What goes wrong:** The current schema requires a non-empty invocation command for every capability, encouraging fake commands for configs, instructions, containers, and unknown types. [VERIFIED: `validateCapability` in `schema.mjs`]

**How to avoid:** Make invocation optional/explicitly unavailable for non-dispatchable lifecycle roles, while preserving strict invocation validation when dispatchable is true. [VERIFIED: D-01, D-02, D-16]

### Pitfall 2: Unknown Types Disappear

**What goes wrong:** Both adapter layout functions return `null`, and discovery ignores paths for which `layout(rel)` is falsy. [VERIFIED: `claudeLayout`, Codex `layout`, and `discover` in adapter sources]

**How to avoid:** Define authorized-root inclusion/exclusion policy and an opaque fallback observation. Do not blindly retain dependency trees, VCS metadata, caches, or arbitrary user project files. [VERIFIED: current adapter walk exclusions; D-02]

### Pitfall 3: Rename Continuity Is Too Weak or Too Broad

**What goes wrong:** Native identity/name changes currently produce remove+add; `weaklySimilar` only emits advisory matches, while `stableCapabilityId` accepts adapter-declared canonical/shared IDs. Unique exact-fingerprint continuity is not yet implemented as an authoritative pairing rule. [VERIFIED: `identity.mjs`, `diff.mjs`]

**How to avoid:** Pair by validated declared stable ID first, then unique exact content among removed/added sets; reject ambiguous N×M matches and never merge two live duplicates. [VERIFIED: D-09, D-10]

### Pitfall 4: Partial Scan Corrupts Authority

**What goes wrong:** `reconcileDirty` currently calls reconciliation, writes `current`, and assigns `baseline = current` without a completeness gate. [VERIFIED: `createRegistryWatcher` in `watcher.mjs`]

**How to avoid:** Classify root completeness before diff/publication and advance the authoritative baseline only for complete scans. Publish degraded/stale diagnostics separately. [VERIFIED: D-06, D-08]

### Pitfall 5: Direct Dependency Checks Masquerade as Closure

**What goes wrong:** `wholeCandidateVerdicts` checks declared dependencies and aliases directly, but does not invalidate equivalence/workflow/correction/mapping/compiled-route references transitively. [VERIFIED: `reconcile.mjs`]

**How to avoid:** Centralize reference extraction and closure before mapping; assert that evaluation callbacks never observe stale references. [VERIFIED: D-11; existing alias callback test pattern in `router.registry-reconcile.test.mjs`]

### Pitfall 6: Volatile State Breaks Byte Equality

**What goes wrong:** Generation IDs, timestamps, scan IDs, trigger names, or event order included in the semantic snapshot make equivalent reconciliations differ. [VERIFIED: D-07]

**How to avoid:** Split semantic snapshot bytes from operational inspection state. Hash and compare only sorted records/evidence/enabled/dependency/reference state. [VERIFIED: D-07, D-08]

### Pitfall 7: Inspection Leaks Authored Content or Secrets

**What goes wrong:** Dumping parsed config/frontmatter or raw instruction bodies can expose secrets and promote untrusted prose to trusted-looking output. [VERIFIED: D-16, D-17]

**How to avoid:** Build an allowlisted projection and redact raw bodies/secret values by default; expose fingerprints, parser evidence, and diagnostics instead. [VERIFIED: D-17; `portable()` pattern in `reconcile.mjs`]

### Pitfall 8: Tests Accidentally Validate This Machine

**What goes wrong:** Fixtures using `/Users/guilherme`, current capability names, or current counts can pass while portability is broken. [VERIFIED: D-18 through D-21]

**How to avoid:** Generate isolated synthetic homes/projects with intentionally different names, missing families, custom types, scopes, and mixtures; add negative assertions against known framework names and absolute developer paths. [VERIFIED: D-19, D-21]

## Code Examples

Verified patterns from the current codebase:

### Canonical semantic bytes

```js
// Source: src/registry/schema.mjs and src/registry/reconcile.mjs
const records = candidate.records
  .map(record => ({ id: stableCapabilityId(record), ...canonicalizeCapability(record) }))
  .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
const semanticSnapshot = { schema_version: 2, records };
const bytes = `${stableStringify(semanticSnapshot)}\n`;
```

[VERIFIED: existing canonical candidate implementation; schema version shown is an implementation option, not a locked value]

### Complete-scan guard

```js
// Recommended extension of src/registry/watcher.mjs using diagnostics already
// emitted by src/registry/fingerprint.mjs.
const incompleteRoots = classifyIncompleteRoots(current.diagnostics);
if (incompleteRoots.length > 0) {
  await publishOperationalState({
    state: 'degraded',
    stale_roots: incompleteRoots,
    candidate_generation_id: pendingGeneration,
  });
  return; // do not replace lastCompleteFingerprintState/semanticSnapshot
}
```

[VERIFIED: D-06/D-08 behavior; helper names are planner discretion]

### Unique exact-fingerprint continuity

```js
// Recommended extension of src/registry/diff.mjs.
for (const fingerprint of sortedFingerprints) {
  const oldMatches = removedByFingerprint.get(fingerprint) || [];
  const newMatches = addedByFingerprint.get(fingerprint) || [];
  if (oldMatches.length === 1 && newMatches.length === 1) {
    pairAsContinuity(oldMatches[0], newMatches[0], 'unique_exact_fingerprint');
  }
}
```

[VERIFIED: direct transcription of D-09/D-10 rule into deterministic pairing]

## State of the Art

| Existing Approach | Phase 21 Approach | Impact |
|-------------------|-------------------|--------|
| Known layouts only; unknown paths ignored | Known semantic mappings plus opaque adapter observations | Future types stay visible without core changes. [VERIFIED: current adapters; D-02/D-07] |
| Native-name fallback identity | Declared stable ID, otherwise path identity with unique exact-content move continuity | Safe rename/move handling without duplicate merging. [VERIFIED: current `identity.mjs`; D-09/D-10] |
| Direct alias/dependency verdicts | Candidate-wide transitive invalidation closure | No stale downstream route survives mutation. [VERIFIED: current `reconcile.mjs`; D-11] |
| Periodic repair scan labeled incremental | Explicit authoritative triggers and separate operational state | Inspection can distinguish current/reconciling/degraded/failed. [VERIFIED: current `watcher.mjs`; D-05/D-08] |
| Candidate schema conflates artifact and dispatch target | Explicit lifecycle role, enabled state, dispatchability, native/semantic type | Configs, hooks, containers, instructions, and unknowns remain inspectable safely. [VERIFIED: current schema; D-01/D-02] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A schema-version bump may be preferable to silently broadening v1 invocation semantics. [ASSUMED] | Code Examples / planning sequence | Planner could instead implement a backward-compatible optional-field evolution; compatibility tests decide. |
| A2 | A dedicated internal module for reference-graph invalidation may be clearer than keeping all logic in `reconcile.mjs`. [ASSUMED] | Recommended Project Structure | Exact file boundary is discretionary and does not change required behavior. |

## Open Questions

1. **Which installed files qualify for opaque fallback discovery?**
   - What we know: Unknown adapter-defined artifact types must remain visible, but dependency trees/VCS metadata are already intentionally pruned. [VERIFIED: D-02; `walk` exclusions in `claude.mjs`]
   - Recommendation: Define adapter-owned allowlisted roots plus explicit exclusions; opaque fallback applies inside those capability roots, not to every file under user/project homes. [VERIFIED: D-03/D-07 boundary]

2. **Where are Phase 22 relationship references persisted today?**
   - What we know: Phase 21 must preserve and invalidate aliases, equivalence/workflow references, corrections, and compiled routes, while semantic relationship inference is deferred. Existing reconciliation accepts aliases/mappings, and compiled routes are derived later. [VERIFIED: D-11; `reconcile.mjs`, `watcher.mjs`]
   - Recommendation: Define a versioned generic `references` input/output contract now, without inferring new edges; adapt existing aliases/mappings and any correction store into it. [ASSUMED]

3. **What bounded authoritative interval should ship?**
   - What we know: Current default repair interval is 300,000 ms and full acquisition is additionally forced after 500 cumulative lifecycle events. [VERIFIED: `watcher.mjs`]
   - Recommendation: Keep interval configurable and test scheduling semantics rather than wall-clock duration; the exact default remains planner discretion under D-05. [VERIFIED: CONTEXT discretion]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runtime and tests | ✓ | v22.22.3 | Project's configured Node runtime [VERIFIED: `node --version`] |
| Filesystem watch support | Incremental hints | ✓ through Node stdlib | Node v22 API | Periodic authoritative scan is correctness fallback [VERIFIED: `watcher.mjs`] |
| Git | fixture/test source tracking | ✓ | repository active | — [VERIFIED: `git status`] |
| External services/packages | none | n/a | — | stdlib/local modules only [VERIFIED: source imports] |

**Missing dependencies with no fallback:** None. [VERIFIED: environment audit]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` [VERIFIED: existing test imports] |
| Config file | none [VERIFIED: repository root inspection] |
| Quick run command | `node --test tests/router.adapters.test.mjs tests/router.registry-schema.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-watcher.test.mjs` [VERIFIED: files exist] |
| Full suite command | `node --test tests/*.test.mjs` [VERIFIED: 76 tracked test files] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | All families and scopes discovered from synthetic roots | integration | `node --test tests/router.adapters.test.mjs tests/router.inventory-portability.test.mjs` | Existing adapter test + ❌ Wave 0 portability |
| DISC-02 | Complete normalized fields and non-dispatchable lifecycle roles | unit | `node --test tests/router.registry-schema.test.mjs` | ✅ extend |
| DISC-03 | Mutation sequences update candidate and affected references | integration | `node --test tests/router.inventory-mutations.test.mjs` | ❌ Wave 0 |
| DISC-04 | Event permutations and clean scans yield identical bytes | property/matrix | `node --test tests/router.inventory-convergence.test.mjs` | ❌ Wave 0 |
| DISC-05 | Multi-hop invalidation precedes mapper callback | unit/integration | `node --test tests/router.registry-reconcile.test.mjs` | ✅ extend |
| DISC-06 | Semantic gap projection is runtime-neutral | unit | `node --test tests/router.inventory-gaps.test.mjs` | ❌ Wave 0 |
| DISC-07 | Unknown native types retained without core edit | integration | `node --test tests/router.adapters.test.mjs tests/router.inventory-portability.test.mjs` | ✅ extend + ❌ Wave 0 |
| DISC-08 | Escape/symlink/prose-policy adversarial cases rejected | security | `node --test tests/router.registry-diff.test.mjs tests/router.adapters.test.mjs tests/router.inventory-security.test.mjs` | Existing coverage + ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Run the focused files owning the edited seam. [VERIFIED: existing tests are independently runnable]
- **Per wave merge:** Run the Phase 21 quick suite plus all new `router.inventory-*.test.mjs` files. [ASSUMED]
- **Phase gate:** `node --test tests/*.test.mjs` plus a deterministic repeated portability matrix must be green before `$gsd-verify-work`. [VERIFIED: D-18 through D-21]

### Wave 0 Gaps

- [ ] `tests/router.inventory-portability.test.mjs` with Claude-heavy, Codex-heavy, mixed/custom, and unknown-type synthetic profiles. [VERIFIED: D-18/D-19]
- [ ] `tests/router.inventory-mutations.test.mjs` for add/edit/rename/move/disable/replace/dependency-loss/remove. [VERIFIED: D-19]
- [ ] `tests/router.inventory-convergence.test.mjs` for missed/duplicate/coalesced/reordered/filename-less event sequences versus clean authoritative scans. [VERIFIED: DISC-04/D-20]
- [ ] `tests/router.inventory-gaps.test.mjs` for semantic availability projection without runtime defaults. [VERIFIED: DISC-06]
- [ ] `tests/router.inventory-security.test.mjs` for root escape, in-root and escaping symlinks, cycles, malicious frontmatter/prose, secret redaction, and absolute-path leakage. [VERIFIED: DISC-08/D-14/D-16/D-17]
- [ ] Shared fixture builder for isolated home/project/worktree roots and byte-stable mutation playback. [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local filesystem inventory has no authentication boundary in this phase. [VERIFIED: phase boundary] |
| V3 Session Management | no | No session state is introduced. [VERIFIED: phase boundary] |
| V4 Access Control | yes | Declared authorized roots, exact scope identity, existing permission/activation gates. [VERIFIED: D-14/D-15; `reconcile.mjs`] |
| V5 Input Validation | yes | Schema validation, realpath containment, safe parser fields, portable relative provenance. [VERIFIED: `schema.mjs`, `fingerprint.mjs`, adapters] |
| V6 Cryptography | yes | Node `crypto` SHA-256 for fingerprints; no custom cryptography. [VERIFIED: registry sources] |

### Known Threat Patterns for Local Discovery

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Symlink/path traversal escapes authorized root | Elevation of Privilege / Information Disclosure | Canonicalize before trust, containment check, cycle detection, revalidate target. [VERIFIED: D-14] |
| Malicious capability prose claims permissions/policy | Elevation of Privilege / Tampering | Treat prose as untrusted evidence; accept dispatch fields only through schema-validated adapter fields. [VERIFIED: D-16] |
| Partial scan falsely removes capability | Tampering / Denial of Service | Preserve last complete snapshot and mark degraded/stale roots. [VERIFIED: D-06] |
| Stale dependent route survives removal | Tampering | Transaction-wide transitive invalidation before mapping/activation. [VERIFIED: D-11/D-12] |
| Inspection reveals secret values or raw instructions | Information Disclosure | Allowlisted redacted projection; fingerprints and diagnostics instead of bodies. [VERIFIED: D-17] |
| Same-name cross-scope capability is merged | Spoofing | Scope is part of identity; no core precedence assumption. [VERIFIED: D-15; `identity.mjs`] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/21-authoritative-personalized-inventory/21-CONTEXT.md` — locked decisions D-01 through D-21 and phase boundary.
- `.planning/REQUIREMENTS.md` — DISC-01 through DISC-08.
- `.planning/ROADMAP.md` — goal and success criteria.
- `.planning/PROJECT.md` and `.planning/STATE.md` — established v1.2 control-plane architecture and v1.3 constraints.
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — approved registry/watcher/reconciliation architecture.
- `src/adapters/claude.mjs`, `src/adapters/codex.mjs` — current discovery and normalization behavior.
- `src/registry/schema.mjs`, `identity.mjs`, `diff.mjs`, `fingerprint.mjs`, `reconcile.mjs`, `build.mjs`, `watcher.mjs`, `validate.mjs`, `activate.mjs` — current implementation seams.
- `src/cli/router-control.mjs` — existing inspection/control surface.
- Focused registry, adapter, and watcher tests under `tests/` — executable existing contracts.

### Secondary (MEDIUM confidence)

- None required; this phase is an internal architecture extension and all critical findings were verified against locked project artifacts and live source.

### Tertiary (LOW confidence)

- Two discretionary module/schema-boundary suggestions are explicitly listed in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; current runtime and modules inspected directly.
- Architecture: HIGH — locked context aligns with existing v1.2 pipeline seams.
- Pitfalls: HIGH — each major gap is observable in current source and tied to a locked decision.
- Validation: HIGH — existing test infrastructure and required missing matrices are explicit.

**Graph note:** `.planning/graphs/graph.json` was 73 hours old and 8 commits behind; three capability queries returned no nodes, so no semantic graph claims were used. [VERIFIED: `gsd-tools graphify status/query` on 2026-07-26]

**Research date:** 2026-07-26
**Valid until:** 2026-08-25
