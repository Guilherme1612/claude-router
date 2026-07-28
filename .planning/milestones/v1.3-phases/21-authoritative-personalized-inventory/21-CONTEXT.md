# Phase 21: Authoritative Personalized Inventory - Context

**Gathered:** 2026-07-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 21 makes the capabilities actually installed in a user's Claude and Codex environments discoverable as one current, safe, framework-neutral inventory. It covers normalized artifact records, incremental and authoritative reconciliation, identity continuity, removal and dependency invalidation, scope and path safety, and inspectable provenance. It preserves evidence needed by Phase 22, but does not infer capability contracts or relationship semantics, dispatch actions, analyze outcomes, or mutate installed capabilities.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope and Requirements
- `.planning/PROJECT.md` — v1.3 goals, constraints, established decisions, and framework-neutral personalization boundary.
- `.planning/REQUIREMENTS.md` — DISC-01 through DISC-08 and the milestone's explicit privacy, mutation, latency, and ecosystem constraints.
- `.planning/ROADMAP.md` — Phase 21 boundary, dependencies, and success criteria.

### Approved Architecture
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — approved canonical registry, runtime adapter, watcher, reconciliation, validation, deletion, and rename design.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — existing implementation decomposition and intended integration sequence.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/adapters/claude.mjs` and `src/adapters/codex.mjs`: shared adapter construction, native layout parsing, normalization, discovery roots, provenance, and invocation compilation.
- `src/registry/schema.mjs`: capability validation, canonicalization, stable serialization, scopes, dependencies, and provenance.
- `src/registry/diff.mjs` and `src/registry/identity.mjs`: lifecycle diff categories, fingerprints, and identity evidence.
- `src/registry/reconcile.mjs`: candidate-level validation and fail-closed reconciliation.
- `src/registry/watcher.mjs`: filesystem acquisition, fingerprint state, incremental refresh, candidate assembly, and watcher orchestration.
- `src/cli/router-control.mjs`: canonical structured output and existing registry inspection/control surface.

### Established Patterns
- Prompt-time routing remains deterministic and read-only; discovery, hashing, validation, and reconciliation stay in the background control plane.
- Candidates are canonicalized and validated before atomic activation; failures retain the last known-good active version.
- Runtime-native layout and precedence belong in adapters, while identity, validation, reconciliation, and publication remain shared.
- Dirty-worktree ownership is unrelated to installed-capability truth; tests must use isolated fixture roots rather than the developer's real home directories.

### Integration Points
- Extend adapter root discovery and normalized records to cover all DISC-01 artifact families and unknown types.
- Extend schema and canonical serialization for lifecycle role, enabled state, adapter evidence, and privacy-safe inspection fields.
- Unify incremental watcher results and clean authoritative scans at the candidate snapshot boundary.
- Apply removal, disablement, replacement, and dependency invalidation before mapping and activation.
- Extend the router-control inspection surface with generation, freshness, affected-root, provenance, and diagnostic state.

</code_context>

<specifics>
## Specific Ideas

- Portability is a release property, not an assumption: fixture installations must contain different names, counts, scopes, missing categories, custom categories, and runtime mixtures.
- Container/member provenance should make a plugin or MCP server inspectable without making the container automatically dispatchable.
- The inventory may retain relationship references and exact-match evidence needed for safe invalidation, but Phase 22 owns semantic relationship inference.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 21-authoritative-personalized-inventory*
*Context gathered: 2026-07-26*
