# Phase 13: Target Safety, Hook Reconciliation, and Quarantine - Research

**Researched:** 2026-07-15
**Domain:** Deterministic registry reconciliation, fail-closed dispatch validation, and hook inventory safety
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Deleted targets and aliases
- **D-01:** When a target disappears, every alias that resolves to it becomes non-dispatchable in the same reconciliation cycle. Diagnostic history may remain, but no stale alias may remain activatable.
- **D-02:** A rename or move may transfer an old alias only when stable identity and source evidence verify that the new record is the same capability. A content fingerprint or similar name alone is insufficient; uncertain continuity is quarantined.
- **D-03:** An alias resolving to a malformed or non-invocable record fails closed. Its structured verdict identifies the alias and target identity, states the failure reason, and explains the corrective action. It must not fall back implicitly to a same-name target in another runtime or scope.
- **D-04:** Invalidation is atomic across the complete alias set for a deleted target. The system must never expose a partially updated alias set; if reconciliation cannot commit the full invalidation safely, the active registry remains unchanged.

### Agent's Discretion
- Exact verdict schema, reason-code vocabulary, diagnostic retention format, and internal alias-index representation, provided they preserve D-01 through D-04 and the roadmap's structured-verdict requirement.
- Exact policies for dependency, permission, scope, collision, ambiguity, and hook-pair verdicts were not separately discussed. Planning may use established project patterns and the phase success criteria, but must not weaken fail-closed dispatch safety or auto-register untrusted hooks.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAF-09 | Missing or deleted targets cannot remain activatable through aliases or schema exceptions. | Add a reconciliation module that resolves aliases only against canonical IDs, invalidates the complete reverse-alias set atomically, and accepts rename/move continuity only from authoritative lifecycle evidence. [VERIFIED: `.planning/REQUIREMENTS.md`, Phase 13 context, `src/registry/diff.mjs`] |
| SAF-10 | Hook files and bindings are reconciled as orphan-file, orphan-binding, or valid pairs. | Normalize hook file and binding references into explicit pair keys, classify the full outer join, and keep every orphan non-dispatchable without creating a binding or hook record. [VERIFIED: `.planning/REQUIREMENTS.md`, `src/adapters/claude.mjs`, `src/adapters/codex.mjs`] |
| MAP-02 | Unsafe or ambiguous candidates are quarantined without changing the active registry. | Make reconciliation a pure candidate gate returning verdicts and a quarantine report; compare active bytes before/after rejection and leave activation/version-pointer work to Phase 14. [VERIFIED: `.planning/ROADMAP.md`, Phase 13 context, `src/registry/build.mjs`] |
</phase_requirements>

## Summary

Phase 13 should add one standard-library-only reconciliation boundary after candidate registry assembly and lifecycle classification, but before any mapping or activation. That boundary should accept candidate registry data, lifecycle evidence, aliases, hook observations, and an explicitly supplied last-known-good active snapshot; it should return a deterministic report containing per-subject verdicts, a candidate disposition, and corrective actions. It must not write active state. [VERIFIED: Phase 13 context, `.planning/ROADMAP.md`, `src/registry/build.mjs`, `src/registry/watcher.mjs`]

The safest implementation is three cohesive slices matching the roadmap plans: alias/target reconciliation, general dispatch-safety gates plus quarantine, and hook file/binding reconciliation. All slices should share a small verdict schema and canonical sorting/serialization rules. A candidate is acceptable only when every dispatch-authority edge points to exactly one valid, invocable, in-scope record and all required dependencies/permissions are available. An ambiguous or unsafe result is diagnostic only; it cannot silently choose a same-name fallback, mutate aliases, synthesize a hook registration, or replace active bytes. [VERIFIED: Phase 13 D-01–D-04, Phase 11/12 inherited decisions, existing registry schema and build behavior]

**Primary recommendation:** Implement `src/registry/reconcile.mjs` as a pure deterministic safety gate with explicit alias, target, collision, scope, permission, dependency, ambiguity, and hook-pair verdicts; integrate it into the watcher publication path so rejected candidates publish only a portable quarantine report while active state remains byte-identical. [VERIFIED: local architecture and phase boundary]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Alias and target validation | Background control plane / registry domain | Runtime adapters | Canonical records and lifecycle evidence are registry-owned; adapters only supply normalized native evidence. [VERIFIED: `src/registry/build.mjs`, `src/registry/diff.mjs`] |
| Dependency, permission, scope, collision, and ambiguity gates | Background control plane / registry domain | Schema validation | Cross-record safety needs a whole-candidate view; schema validation continues enforcing single-record invariants. [VERIFIED: `src/registry/schema.mjs`, `src/registry/build.mjs`] |
| Hook file/binding pairing | Background control plane / reconciliation | Claude/Codex adapters | Adapters discover native artifacts; reconciliation relates normalized records without modifying runtime configuration. [VERIFIED: adapter sources and Phase 13 context] |
| Quarantine and last-known-good preservation | Background control plane / publication boundary | Phase 14 activation (later) | Phase 13 decides candidate disposition and proves no active mutation; Phase 14 owns pointer changes and rollback. [VERIFIED: roadmap phase boundary] |

## Project Constraints (from AGENTS.md and project guidance)

- The supplied `AGENTS.md` directive imports `@RTK.md`, but neither `AGENTS.md` nor `RTK.md` exists in this workspace. Do not import the unrelated sibling `AutomaticTrading/RTK.md`. [VERIFIED: workspace file check and orchestrator instruction]
- Follow `.claude/CLAUDE.md`: keep prompt-time routing deterministic, read-only, fail-open, local, and under its latency budget; reconciliation belongs in the background control plane. [VERIFIED: `.claude/CLAUDE.md`]
- Preserve existing hook bindings and coexistence; never auto-register or rewrite runtime hook configuration in this phase. [VERIFIED: `.claude/CLAUDE.md`, Phase 13 context]
- Use Node.js ESM and standard-library APIs only; no package install is needed. [VERIFIED: `.claude/CLAUDE.md`, Phase 11/12 architecture]
- Portable registry and diagnostic bytes must exclude machine-local absolute paths and remain deterministically serialized. [VERIFIED: `src/registry/schema.mjs`, `src/registry/build.mjs`]
- File writes must use native editing tools, and implementation/tests must preserve unrelated dirty-worktree changes. [VERIFIED: project/orchestrator instructions]
- No project-defined `.claude/skills`, `.agents/skills`, or `.codex/skills` directory was found, so there are no additional project-skill rules to apply. [VERIFIED: workspace discovery]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM | v22.22.3 recorded by the Phase 12 validation baseline | Reconciliation implementation and tests | Existing registry, adapters, watcher, and tests use ESM on Node with no external runtime dependencies. [VERIFIED: source imports and `12-VALIDATION.md`] |
| Node standard library | Built into Node | `Map`/`Set`, cloning, hashing, paths, filesystem test fixtures | Preserves the project's zero-dependency and lightweight installation contract. [VERIFIED: `.claude/CLAUDE.md` and current source] |
| `node:test` + `node:assert/strict` | Built into Node | Unit and integration verification | Existing authoritative test style across registry phases. [VERIFIED: `tests/router.registry-*.test.mjs`] |
| Existing `stableStringify` / canonicalization | Repository-local | Deterministic verdict bytes, reports, fingerprints, and equality | Already defines object-key and set-like ordering semantics and rejects unsafe values. [VERIFIED: `src/registry/schema.mjs`] |
| Existing stable identity and lifecycle diff | Repository-local | Canonical target lookup and evidence-gated continuity | Already separates authoritative continuity from non-authoritative `possible_match` diagnostics. [VERIFIED: `src/registry/identity.mjs`, `src/registry/diff.mjs`] |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `assembleRegistry` / incremental acquisition | Build the candidate that reconciliation judges | Preserve the shared full/incremental assembly seam; do not duplicate adapter acquisition. [VERIFIED: `src/registry/build.mjs`] |
| Watcher reconciler publication transaction | Publish candidate/report only after successful processing | Extend it to publish quarantine diagnostics without advancing active registry state. [VERIFIED: `src/registry/watcher.mjs`, watcher tests] |
| Adapter `runtime_variants` and portable provenance | Match explicit hook references and explain verdicts | Use as evidence; never infer a trusted pair from basename similarity alone. [VERIFIED: adapter/schema sources] |

**Installation:** None. This phase should add no external packages. [VERIFIED: project stack and phase domain]

## Architecture Patterns

### System Architecture Diagram

```text
Filesystem scan / watcher hint
          |
          v
Adapter acquisition -> candidate assembly -> lifecycle diff
                                              |
                                              v
                                  deterministic reconciliation
                              /               |                \
                   alias/target gates   safety gates     hook full-outer-join
                              \               |                /
                                              v
                                    canonical verdict report
                                     /                  \
                                  PASS                QUARANTINE
                                    |                      |
                          eligible for Phase 14     corrective diagnostics only
                          activation/mapping        active bytes unchanged
```

[VERIFIED: current build/watcher composition and roadmap Phase 13/14 boundary]

### Recommended Project Structure

```text
src/registry/
├── reconcile.mjs          # Pure candidate gate, verdict schema, alias/target validation
├── hook-reconcile.mjs     # Normalized hook-file/binding pairing and orphan classification
├── schema.mjs             # Extend only for reusable validated portable verdict shapes if needed
├── build.mjs              # Candidate assembly remains authoritative
└── watcher.mjs            # Calls reconciliation and publishes candidate/quarantine report transactionally
tests/
├── router.registry-reconcile.test.mjs
├── router.hook-reconcile.test.mjs
├── router.registry-watcher.test.mjs
└── router.route-targets.test.mjs
```

This split keeps the general safety gate separate from native hook reference extraction while retaining one shared verdict format. [VERIFIED: existing module boundaries; recommended structure is a local architectural inference grounded in them]

### Pattern 1: Pure Verdict-Producing Gate

Use an API shaped like `reconcileCandidate({ candidate, active, lifecycle, aliases, hookInventory }) -> { disposition, verdicts, candidateFingerprint, activeFingerprint }`. Inputs are cloned/read-only; outputs contain portable data only. `disposition` is `eligible` only when no dispatch-blocking/build-blocking verdict exists; otherwise it is `quarantined`. [VERIFIED: existing pure build/diff patterns; exact API is Agent's Discretion]

Every verdict should contain at least: stable `code`, `severity`, `dispatchable: false` for rejected subjects, `subject` (kind plus canonical ID/alias/pair key), portable `evidence`, human-readable `reason`, and concrete `corrective_action`. Sort verdicts by subject key, then code, then stable evidence bytes. [VERIFIED: roadmap structured-verdict requirement and deterministic project conventions; exact names are discretionary]

### Pattern 2: Reverse Alias Index and Atomic Set Invalidation

Build a reverse index `targetId -> sorted aliases[]` before evaluating changes. A confirmed removal or invalid target produces verdicts for the target and every alias in that precomputed set in a single pure result. Never mutate the caller's alias map during traversal. If continuity is proven by canonical/shared-origin/native identity evidence, transfer as one complete set; if evidence is only `possible_match`, quarantine the entire proposed transfer. [VERIFIED: D-01–D-04 and `src/registry/diff.mjs`]

### Pattern 3: Whole-Candidate Safety Matrix

Evaluate each dispatch authority edge against explicit conditions: target exists; schema/lifecycle/invocation valid; all declared dependencies available; required permission grants present and no deny applies; target scope is applicable to the requesting project/worktree; canonical identity resolves uniquely; no dispatch-blocking/build-blocking conflict; mapping is unambiguous. One failed condition yields a non-dispatchable structured verdict; none may trigger fallback to a same-name record. [VERIFIED: success criterion 2, schema/build constraints, D-03]

### Pattern 4: Hook Full Outer Join

Adapters should expose enough normalized hook identity to compare each discovered hook file with each explicit binding reference. Reconciliation performs a deterministic full outer join:

- one trusted file + one explicit matching binding -> `valid_pair`;
- file without a binding -> `orphan_file`, non-dispatchable;
- binding without a discovered valid file -> `orphan_binding`, non-dispatchable;
- multiple plausible files/bindings, malformed references, scope/runtime mismatch, or path escape -> ambiguous/invalid and quarantined.

Never synthesize the missing side. A valid pair proves inventory consistency, not permission to install, enable, or activate it. [VERIFIED: SAF-10, Phase 13 success criterion 3, adapter discovery behavior]

### Pattern 5: Last-Known-Good Invariant at the Publication Boundary

Reconciliation should not need write access to active state. The caller captures canonical active bytes/fingerprint before evaluation; quarantine publishes only candidate/report artifacts and proves the active bytes/fingerprint remain equal afterward. Candidate publication must not be treated as activation (`summary.activated` already remains false). Atomic activation pointers are explicitly deferred to Phase 14. [VERIFIED: `src/registry/build.mjs`, MAP-02, Phase 14 boundary]

### Anti-Patterns to Avoid

- **Name-based fallback:** Never pick another runtime/scope record because it has the same display name. Identities are deliberately separate without authoritative evidence. [VERIFIED: identity/schema tests and D-03]
- **Content-fingerprint alias transfer:** Fingerprints establish content similarity, not capability continuity. [VERIFIED: D-02 and lifecycle diff design]
- **Per-alias mutation:** Updating aliases in a loop can expose partial state on failure. Compute and validate the complete result first. [VERIFIED: D-04]
- **Schema exceptions that restore dispatchability:** Validation failures, malformed invocation, unavailable dependencies, or dispatch-blocking conflicts cannot be overridden downstream. [VERIFIED: schema/build behavior and SAF-09]
- **Hook pairing by basename or command substring:** Explicit normalized binding evidence is required; otherwise quarantine. [VERIFIED: SAF-10 and no-auto-registration constraint]
- **Quarantine by overwriting active state:** Quarantine is a rejected candidate/report, not a new active registry version. [VERIFIED: MAP-02 and Phase 14 boundary]
- **Machine-local path leakage:** Keep local paths only in noncanonical local diagnostics; strip them from portable verdict bytes. [VERIFIED: current build behavior]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canonical serialization | A second JSON sorter | `stableStringify` and schema-owned canonicalization | The repository already defines deterministic set/order semantics and unsupported-value rejection. [VERIFIED: `schema.mjs`] |
| Capability identity | Name/scope concatenation in reconciliation | `stableCapabilityId` plus lifecycle continuity evidence | Prevents identity drift and unsafe cross-runtime collapse. [VERIFIED: identity and diff tests] |
| Change/rename inference | A second rename detector | `diffFingerprintTrees` events and diagnostics | Keeps one precedence order and preserves `possible_match` as diagnostic-only. [VERIFIED: `diff.mjs`] |
| Candidate construction | Re-discovery inside reconciliation | Existing full/incremental acquisition and `assembleRegistry` | Full/incremental byte equivalence is already proven. [VERIFIED: build tests] |
| Hook installation or binding repair | Auto-writing settings/config | Structured orphan verdict plus corrective action | Installation authority is out of scope and untrusted hooks must not be registered. [VERIFIED: project requirements and out-of-scope table] |
| Activation/rollback | Phase 13 pointer/version machinery | Defer to Phase 14 | Prevents boundary creep and lets MAP-02 be proven independently. [VERIFIED: roadmap]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Candidate registry/report and watcher acquisition/fingerprint state are file-backed; no database is used by this control-plane slice. [VERIFIED: registry/watcher source and Phase 11 research] | Add new report fields/versioning compatibly; no data migration. Never reinterpret an old report as dispatch authority. |
| Live service config | Claude `settings.json` hook bindings and Codex hook/config artifacts are runtime-owned inputs, not Phase 13 write targets. [VERIFIED: adapters and project constraints] | Read through bounded adapters; emit corrective guidance only. No automatic binding edits. |
| OS-registered state | No launchd/systemd/Task Scheduler hook registration is part of the canonical adapter contract. The watcher controller is already lifecycle-managed but Phase 13 does not rename it. [VERIFIED: repository source inventory] | None for Phase 13; do not infer OS registration from a hook file. |
| Secrets/env vars | No new secret or environment-variable names are required. Permission/deny metadata must remain data and must not expose secret contents. [VERIFIED: phase scope and project deny constraints] | Test deny verdicts using synthetic fixtures only. |
| Build artifacts / installed packages | No new package or compiled artifact. Installed watcher composition may need the new reconciliation module copied by the existing installer path. [VERIFIED: current installation architecture] | Ensure installer/lifecycle tests prove deployed composition invokes the gate; no package migration. |

## Common Pitfalls

### Pitfall 1: Treating Candidate Publication as Activation
**What goes wrong:** A quarantined candidate replaces last-known-good state even though no version pointer exists yet. **How to avoid:** Keep candidate/report paths distinct from active state; assert active bytes before/after rejection. **Warning signs:** reconciliation returns or writes `activated: true`, or watcher tests only inspect candidate output. [VERIFIED: current summary contract and roadmap]

### Pitfall 2: Partial Alias Revocation
**What goes wrong:** An exception midway through alias iteration leaves some stale aliases dispatchable. **How to avoid:** construct a complete reverse index and immutable next-state/verdict set, validate it, then return once. **Warning signs:** in-place `delete`/`set` while evaluating aliases. [VERIFIED: D-01 and D-04]

### Pitfall 3: Weak Continuity Becomes Authority
**What goes wrong:** Similar names/content or `possible_match` transfer aliases to a different capability. **How to avoid:** accept only lifecycle events carrying authoritative canonical/shared-origin/native identity continuity; quarantine diagnostics never authorize transfer. **Warning signs:** string similarity, basename matching, or content hash used as the sole bridge. [VERIFIED: D-02 and `diff.mjs`]

### Pitfall 4: Scope Leakage Through Fallback
**What goes wrong:** An unusable project target silently dispatches a global or other-worktree same-name capability. **How to avoid:** verdicts retain requested scope and target ID; precedence annotations are diagnostic, not dispatch permission. **Warning signs:** lookup by `type:name` after canonical-ID failure. [VERIFIED: scope identity tests, D-03]

### Pitfall 5: Hook String Parsing Is Too Loose
**What goes wrong:** A command string containing a hook filename is accepted as an exact pair, or arguments/quoting make a valid binding look orphaned. **How to avoid:** normalize adapter-native binding structures into explicit runtime/event/command/args evidence with bounded parsing and preserve the original portable native structure diagnostically. **Warning signs:** substring tests, shell execution, or basename-only matching. [VERIFIED: current adapter binding shapes; normalization recommendation is inferred]

### Pitfall 6: Reconciliation Duplicates Schema Logic Inconsistently
**What goes wrong:** A record passes one layer but fails another, or an exception accidentally permits dispatch. **How to avoid:** schema owns single-record validity; reconciliation adds cross-record and authority-edge rules. Any thrown validation error becomes a fail-closed verdict at the candidate boundary. **Warning signs:** different dependency/conflict enums in multiple modules. [VERIFIED: current schema/build boundary]

### Pitfall 7: Portable Diagnostics Leak Absolute Paths
**What goes wrong:** Quarantine evidence includes home/workspace paths and changes across machines. **How to avoid:** store logical roots and relative paths in canonical reports and strip `local_path` as build already does. **Warning signs:** tests find temp-root strings in stable output. [VERIFIED: build and adapter tests]

## Code Examples

### Deterministic Fail-Closed Verdict Shape

```javascript
// Pattern derived from repository stable serialization and Phase 13 decisions.
const verdict = {
  schema_version: 1,
  code: 'alias_target_removed',
  severity: 'dispatch-blocking',
  dispatchable: false,
  subject: { kind: 'alias', id: alias, target_id: targetId },
  evidence: { lifecycle_primary: 'removed' },
  reason: 'The canonical target was removed.',
  corrective_action: 'Remove or explicitly remap the alias to a verified canonical target.',
};
```

[VERIFIED: exact fields are discretionary; semantics come from D-01/D-03 and existing diagnostic conventions]

### Atomic Alias Evaluation

```javascript
// Compute first; never mutate active aliases while evaluating.
const aliasesByTarget = buildReverseAliasIndex(aliases);
const verdicts = evaluateTargets({ aliasesByTarget, candidateById, lifecycle });
const disposition = verdicts.some(v => v.severity !== 'informational')
  ? 'quarantined'
  : 'eligible';
return canonicalizeReconciliation({ disposition, verdicts });
```

[VERIFIED: pattern follows D-04 and current pure deterministic modules]

### Hook Pair Classification

```javascript
// Pair only normalized explicit references; unmatched sides remain diagnostics.
for (const key of [...new Set([...files.keys(), ...bindings.keys()])].sort()) {
  const file = files.get(key);
  const binding = bindings.get(key);
  pairs.push(classifyPair(key, file, binding));
}
```

[VERIFIED: full-outer-join behavior comes from SAF-10; exact implementation is discretionary]

## State of the Art

| Existing Approach | Phase 13 Approach | Impact |
|-------------------|-------------------|--------|
| Schema blocks unavailable declared dependencies within a record. | Reconciliation also gates aliases and cross-record dependency/permission/scope/collision/ambiguity relationships. | Schema exceptions cannot restore dispatch authority. [VERIFIED: schema and success criterion 2] |
| Build emits deterministic inactive candidates and typed conflicts. | Candidate receives an explicit eligible/quarantined disposition and corrective verdicts. | MAP-02 becomes testable without Phase 14 activation. [VERIFIED: build summary and roadmap] |
| Diff marks uncertain rename/move as `possible_match`. | `possible_match` is a quarantine boundary, never alias-transfer evidence. | Weak continuity cannot hijack aliases. [VERIFIED: diff behavior and D-02] |
| Adapters discover hook and binding records independently. | Reconciliation classifies valid pairs and both orphan directions. | Inventory inconsistency is visible without automatic repair. [VERIFIED: adapters and SAF-10] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A dedicated `hook-reconcile.mjs` is preferable to keeping all pairing logic in `reconcile.mjs`. | Recommended Project Structure | Low; planner may combine modules while preserving contracts and tests. |
| A2 | Installed watcher composition will be the immediate integration point for quarantine report publication. | Architecture Patterns | Medium; installer topology may instead introduce a separate coordinator, but active-state invariants remain unchanged. |
| A3 | Binding normalization can produce an explicit stable pair key from current Claude/Codex native structures without executing shell syntax. | Hook Pattern | Medium; fixtures must drive the exact supported grammar and unsupported forms must quarantine. |

## Open Questions

1. **Where is the authoritative alias source for the v1.2 canonical registry?**
   - What we know: current route mode-map target validation exists, but the new registry modules do not yet expose a canonical alias collection. [VERIFIED: local source search]
   - What's unclear: whether Phase 13 should define alias input schema only, adapt the existing mode map, or both.
   - Recommendation: Plan 13-01 should first establish an explicit injected alias contract and adapters for any existing route-target aliases; do not read global live files implicitly in the pure gate.

2. **What exact native hook reference grammars are supported?**
   - What we know: Claude settings produce nested event bindings; discovered hook JSON and Codex hook JSON expose event/command/args-like metadata. [VERIFIED: adapter source and fixtures]
   - What's unclear: the complete installed command/argument representations across both runtimes.
   - Recommendation: derive a bounded normalization matrix from representative fixtures; unsupported or multi-match structures get structured ambiguous/invalid verdicts.

3. **Where will active registry bytes live before Phase 14?**
   - What we know: candidate/report publication exists and `activated` is false; Phase 14 owns immutable versions and active pointers. [VERIFIED: build/watcher and roadmap]
   - What's unclear: whether a pre-Phase-14 fixture-only active snapshot or an existing live router registry is the authoritative comparison target.
   - Recommendation: keep reconciliation's `active` input explicit and test byte preservation in memory/filesystem fixtures; do not invent the Phase 14 pointer early.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` on the recorded Node v22.22.3 baseline [VERIFIED: Phase 12 validation] |
| Config file | None; direct test files [VERIFIED: repository layout] |
| Quick run command | `node --test tests/router.registry-reconcile.test.mjs tests/router.hook-reconcile.test.mjs` |
| Full suite command | `node --test tests/*.test.mjs` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAF-09 | Deleted/missing/invalid targets invalidate every alias atomically; strong rename may transfer; weak match quarantines; no cross-runtime/scope fallback | unit/integration | `node --test tests/router.registry-reconcile.test.mjs tests/router.route-targets.test.mjs` | New reconciliation file needed; route-target file exists |
| SAF-10 | Valid pair, orphan file, orphan binding, malformed/ambiguous pair, scope/runtime mismatch, and no auto-registration | unit/integration | `node --test tests/router.hook-reconcile.test.mjs tests/router.adapters.test.mjs` | New hook file needed; adapter file exists |
| MAP-02 | Dependency, permission, scope, collision, and ambiguity verdict matrix; rejected candidate leaves active bytes unchanged and gives corrective action | unit/integration | `node --test tests/router.registry-reconcile.test.mjs tests/router.registry-watcher.test.mjs` | New reconciliation file needed; watcher file exists |

### Required Test Matrix

- Alias set sizes 0, 1, and many; injected failure during evaluation; reversed input order; duplicate alias declarations; target removed, missing, invalid, non-invocable, and unavailable dependency.
- Strong rename/move via canonical identity/shared origin/compatible native identity versus content/name-only `possible_match`.
- Permission grant missing, explicit deny, project-to-global/worktree leakage, dispatch-blocking/build-blocking collision, and multiple candidate ambiguity.
- Hook valid pair for each runtime, orphan file, orphan binding, malformed file, malformed binding, duplicate files, duplicate bindings, event mismatch, scope mismatch, path escape, and order permutation.
- Portable-byte assertions: no temporary root or home path in verdict/report output.
- Active-state assertions: snapshot bytes and fingerprint before quarantine, inject candidate/report publication failures, and prove no active write/callback occurred.
- Full/incremental parity: same acquired state and lifecycle diff produce identical reconciliation bytes regardless of build path.

### Sampling Rate

- **Per task commit:** Run the focused new/modified test file plus its closest existing regression file.
- **Per wave merge:** `node --test tests/router.registry-schema.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-build.test.mjs tests/router.registry-reconcile.test.mjs tests/router.hook-reconcile.test.mjs tests/router.registry-watcher.test.mjs tests/router.adapters.test.mjs tests/router.route-targets.test.mjs`
- **Phase gate:** `node --test tests/*.test.mjs` must be green before verification.

### Wave 0 Gaps

- [ ] `tests/router.registry-reconcile.test.mjs` — SAF-09 and MAP-02 target/alias/safety/quarantine matrix.
- [ ] `tests/router.hook-reconcile.test.mjs` — SAF-10 pair/orphan/ambiguity matrix for Claude and Codex.
- [ ] Extend `tests/router.registry-watcher.test.mjs` — deployed gate wiring, quarantine report transaction, active-byte preservation, and failure baseline behavior.
- [ ] Extend `tests/router.adapters.test.mjs` — representative normalized hook-file and binding evidence needed by pairing.
- [ ] Extend `tests/router.route-targets.test.mjs` — canonical alias resolution and no same-name fallback across runtime/scope.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | No | No user authentication surface in this phase. [VERIFIED: phase scope] |
| V3 Session Management | No | No session state introduced. [VERIFIED: phase scope] |
| V4 Access Control | Yes | Fail-closed permission/scope/dependency gates; explicit authority edges; no implicit fallback or auto-registration. [VERIFIED: success criteria and context] |
| V5 Input Validation | Yes | Existing bounded adapter parsers and canonical schema validation; unsupported or malformed input becomes non-dispatchable/quarantined. [VERIFIED: adapters/schema] |
| V6 Cryptography | No new cryptography | Use existing `node:crypto` SHA-256 only for deterministic fingerprints, not as identity continuity proof or a security boundary. [VERIFIED: current source and D-02] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stale alias activates deleted capability | Elevation of Privilege | Reverse alias index, complete-set invalidation, canonical-ID resolution. [VERIFIED: D-01/D-04] |
| Same-name cross-runtime/scope substitution | Spoofing / Elevation of Privilege | Evidence-gated identity, exact scope applicability, no fallback. [VERIFIED: D-02/D-03] |
| Crafted hook file is auto-registered | Elevation of Privilege / Tampering | Inventory-only reconciliation, explicit binding evidence, orphan verdict, no writes. [VERIFIED: SAF-10] |
| Ambiguous collision picks attacker-controlled variant | Spoofing | Dispatch-blocking collision/ambiguity verdict and quarantine. [VERIFIED: success criterion 2] |
| Absolute path or secret metadata leaks in report | Information Disclosure | Portable logical provenance, local-path stripping, synthetic test fixtures. [VERIFIED: build/schema patterns] |
| Candidate/report failure advances unsafe baseline | Tampering | Transactional publication and preserve prior acquisition/active fingerprints on failure. [VERIFIED: watcher precedent and MAP-02] |
| Hash-equal content treated as identity | Spoofing | Hash is diagnostic/content evidence only; require stable identity plus source evidence. [VERIFIED: D-02] |

## Package Legitimacy Audit

No external packages are recommended or installed, so the package legitimacy gate does not apply. [VERIFIED: standard stack]

## Environment Availability

Step 2.6: SKIPPED — this is a code/config-only phase using the already-established Node.js runtime and built-in test runner; no new external tool or service is required. [VERIFIED: repository stack]

## Sources

### Primary (HIGH confidence)

- `.planning/phases/13-target-safety-hook-reconciliation-and-quarantine/13-CONTEXT.md` — locked decisions, phase boundary, integration insights.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` — SAF-09, SAF-10, MAP-02, success criteria, and Phase 14 boundary.
- `.planning/phases/11-canonical-registry-and-runtime-adapters/11-CONTEXT.md` and Phase 11 research/patterns — inherited identity, scope, provenance, conflict, and zero-dependency constraints.
- `.planning/phases/12-incremental-change-detection-and-watcher/12-CONTEXT.md` and verification — authoritative lifecycle evidence, full/incremental equivalence, watcher transaction behavior.
- `src/registry/schema.mjs`, `identity.mjs`, `diff.mjs`, `build.mjs`, and `watcher.mjs` — current implementation contracts.
- `src/adapters/claude.mjs` and `src/adapters/codex.mjs` — current hook/binding discovery and normalized record shapes.
- Existing `tests/router.registry-*.test.mjs`, `tests/router.adapters.test.mjs`, and `tests/router.route-targets.test.mjs` — test conventions and current guarantees.
- `.claude/CLAUDE.md` — project constraints and runtime architecture.

### Secondary (MEDIUM confidence)

- None required. The phase is an internal architecture extension whose authoritative behavior is fully specified by local requirements, decisions, code, and tests.

### Tertiary (LOW confidence)

- None. Architectural placement assumptions are isolated in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — directly verified against current source and prior phase validation.
- Architecture: HIGH — phase placement and safety boundaries are explicit in context/roadmap and current module seams.
- Pitfalls: HIGH — derived from locked decisions, existing regressions, and current schema/diff/watcher invariants.
- Hook normalization details: MEDIUM — adapter shapes are verified, but the complete supported native binding grammar must be fixture-driven during planning/implementation.

**Research date:** 2026-07-15
**Valid until:** 2026-08-14 (stable internal architecture; refresh if Phase 12/13 registry or adapter contracts change)
