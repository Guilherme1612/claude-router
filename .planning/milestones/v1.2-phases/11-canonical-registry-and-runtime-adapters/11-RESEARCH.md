# Phase 11: Canonical Registry and Runtime Adapters - Research

**Researched:** 2026-07-14
**Domain:** Deterministic dual-runtime capability inventory and normalization
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Cross-runtime identity
- **D-01:** Merge Claude and Codex artifacts under one canonical capability ID only when authoritative shared-origin metadata, an explicit canonical identity, or equivalent declared evidence links them. Matching names, descriptions, or content alone never establishes identity.
- **D-02:** Explicitly linked runtime variants retain one canonical identity even when their native metadata differs. Preserve each runtime's native fields separately and report disagreements explicitly.
- **D-03:** Renames and moves preserve the canonical ID while authoritative origin evidence remains. Names and paths are mutable provenance; former values are retained as rename or move evidence.
- **D-04:** Capabilities without a cross-runtime identity link use a readable deterministic ID shaped as `runtime:type:native-identity`.

### Scope collisions
- **D-05:** Global and project-scoped variants are separate canonical records with separate identities. Do not collapse them into one scope-polymorphic record.
- **D-06:** Within a matching workspace, a valid project-scoped record takes precedence. The global record is the fallback only when no applicable project-scoped record exists.
- **D-07:** If the preferred project record is unusable, preserve both records diagnostically, mark the project record non-dispatchable with the reason, and identify the global record as the available fallback. Later safety phases decide activation behavior.
- **D-08:** Stable project scope identity combines the canonical repository root with distinct worktree identity. Resolve symlinks and retain repository-origin metadata when available.

### Incomplete artifacts and dependencies
- **D-09:** A recognizable capability with metadata that cannot be fully parsed becomes a diagnostic, non-dispatchable record. Preserve identity, logical source location, parse diagnostics, and only metadata that was extracted safely.
- **D-10:** A valid artifact missing optional metadata remains usable when required invocation data is valid. Represent absent optional fields explicitly as unknown; never invent descriptions or dependency declarations.
- **D-11:** A supported runtime file that matches no known capability type or schema version produces a build-level diagnostic, not a generic canonical capability record. Include its path, runtime, detected format or version, and rejection reason.
- **D-12:** Undeclared dependencies remain neutral and unknown. Dependencies that are declared but unavailable make the capability non-dispatchable and carry precise diagnostics.

### Provenance and conflicts
- **D-13:** Each record carries compact structured provenance: runtime, scope, logical source root and relative path, origin or package identity, source fingerprint, and adapter/version. Verbose native metadata is referenced externally.
- **D-14:** Conflicts are typed and include the field, sources, competing values or fingerprints, conflict type, and severity. Severity levels are informational, dispatch-blocking, and build-blocking.
- **D-15:** Portable registry bytes use logical roots such as `claude_global`, `codex_home`, or `project:<scope-id>` plus normalized relative paths. Absolute paths are restricted to local diagnostics outside portable registry bytes.
- **D-16:** Full builds return a deterministic diagnostic summary with the candidate registry and a complete machine-readable report sorted by canonical identity and source.

### Lightweight installation and operation
- **D-17:** The project must remain lightweight and quick to download. Prefer the existing Node.js runtime and standard-library capabilities; do not introduce heavyweight services, databases, containers, background platforms, or large dependency trees for registry construction.
- **D-18:** A fresh user must be able to install and configure the complete router with one documented command. That command detects supported Claude and Codex locations, deploys the required files, builds the initial canonical registry, wires supported runtime integration, and verifies readiness automatically.
- **D-19:** The one-command setup must be safe and repeatable: rerunning it is idempotent, preserves unrelated user configuration, reports exact changes, and leaves a usable diagnosis instead of a partially configured system when a step cannot complete.
- **D-20:** Normal use requires no manual registry editing, path wiring, or multi-step bootstrap. Advanced overrides may exist, but the default path must work automatically with sensible local defaults and concise output.

### the agent's Discretion
- Exact schema field names, module-internal data structures, hashing algorithm, and diagnostic file format are left to research and planning, provided they preserve the decisions above and deterministic serialization. Any new dependency requires clear justification against the lightweight, one-command-install constraint.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-01 | One canonical schema represents Claude and Codex capabilities with stable identities. | Schema invariants, evidence-gated identity, logical provenance, deterministic serialization, and collision tests. |
| REG-02 | Full rebuilds discover supported skills, plugin skills, agents, commands, hooks, bindings, scopes, and dependencies. | Adapter discovery matrix and full-build coverage/parity tests. |
| ADP-01 | Claude adapter covers global, plugin, agents-store, and project-scoped inventory. | Claude fixture matrix with explicit roots and native invocation preservation. |
| ADP-02 | Codex adapter covers skills, plugins, agents, hooks, configuration, and project scope. | Codex fixture matrix with explicit roots, config metadata, and native invocation preservation. |
</phase_requirements>

## Summary

Phase 11 should implement a zero-dependency Node.js ESM control-plane slice: `schema.mjs` and `identity.mjs` define validated canonical records and stable bytes; Claude and Codex adapters own native discovery/parsing/normalization/invocation; `build.mjs` combines their output into a deterministic candidate registry plus diagnostics without touching active routing state. [VERIFIED: repository approved design, implementation plan, and phase context]

The key implementation risk is accidental conflation. Names, descriptions, and content fingerprints are discovery evidence, not sufficient cross-runtime identity. Scope is part of identity, native variants stay separately represented, and portable output never embeds machine-specific absolute roots. Malformed recognizable artifacts remain diagnostic records; unsupported formats remain build diagnostics. [VERIFIED: 11-CONTEXT.md D-01 through D-16]

**Primary recommendation:** Implement the approved three-plan sequence with test-first temporary homes, canonical stable serialization, evidence-gated identity, and a read-only candidate builder integrated into the existing idempotent installer.

## Project Constraints (from AGENTS.md)

- The user supplied an `AGENTS.md` instruction that delegates to `@RTK.md`; neither physical `AGENTS.md` nor `RTK.md` exists in the repository at research time. Treat the user-supplied delegation as authoritative, but no additional on-disk directives could be loaded. [VERIFIED: repository filesystem check]
- Do not read or mutate real runtime homes in adapter tests; use explicitly supplied temporary roots. [VERIFIED: phase context and existing test pattern]
- Preserve unrelated user configuration and existing uncommitted changes. [VERIFIED: installer tests and task boundary]
- Use Node's built-in test runner and standard-library production dependencies. [VERIFIED: existing lifecycle implementation and approved plan]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Canonical schema and identity | Background control plane | Storage/filesystem | Shared logic owns runtime-neutral validation and deterministic bytes. |
| Claude/Codex discovery and parsing | Runtime adapters | Filesystem | Adapters alone understand native layouts and invocation contracts. |
| Candidate registry assembly | Background control plane | Runtime adapters | Builder merges normalized output and diagnostics without activation. |
| Initial registry build during install | Installer/lifecycle | Background control plane | Existing one-command lifecycle composes deployment, build, and readiness checks. |
| Prompt routing | Prompt-time data plane | — | Explicitly unchanged in Phase 11; candidate state is not activated or consumed. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM | v22.22.3 installed | Runtime/module system | Existing project runtime and approved architecture. [VERIFIED: local runtime and repository] |
| `node:fs`, `node:path`, `node:crypto` | Node built-in | Discovery, logical paths, SHA-256 fingerprints | Zero-install, offline, already used by lifecycle code. [VERIFIED: src/lifecycle/router-lifecycle.mjs] |
| `node:test` + `node:assert/strict` | Node built-in | Unit/integration fixtures | Existing repository-wide test convention. [VERIFIED: tests/*.test.mjs] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:os` | Node built-in | Temporary-home tests and default home discovery | Tests/default root resolution only. |
| `node:url` | Node built-in | Stable ESM module-relative paths | Installer and fixture resource resolution. |

No external packages are required or recommended. Therefore no package legitimacy audit or installation command applies. [VERIFIED: D-17 and approved implementation plan]

## Architecture Patterns

### System Architecture Diagram

```text
explicit Claude roots ─→ Claude adapter ─┐
                                        ├─→ normalized observations
explicit Codex roots ──→ Codex adapter ─┘        │
                                                  ▼
                                        identity/schema boundary
                                                  │
                                  ┌───────────────┴──────────────┐
                                  ▼                              ▼
                         canonical candidate              sorted diagnostics
                                  │                              │
                                  └──────── installer report ───┘
                                               │
                                      no active-state mutation
```

### Recommended Project Structure

```text
src/
├── registry/
│   ├── schema.mjs      # validation, canonicalization, stable serialization
│   ├── identity.mjs    # evidence-gated IDs and content fingerprints
│   └── build.mjs       # deterministic full candidate build and reports
├── adapters/
│   ├── claude.mjs      # Claude roots, parsing, normalization, invocation
│   └── codex.mjs       # Codex roots, parsing, normalization, invocation
└── lifecycle/
    └── router-lifecycle.mjs # existing ownership/idempotency boundary
```

### Pattern 1: Pure adapter contract

Use `discoverRoots(options)`, `parseArtifact(path, options)`, `normalizeArtifact(nativeRecord)`, and `compileInvocation(record)`. Discovery accepts roots instead of consulting ambient homes, parsing returns structured success/diagnostics, normalization removes native layout assumptions, and invocation compilation preserves runtime-native execution fields. [VERIFIED: approved implementation plan]

### Pattern 2: Canonical bytes before hashing

Recursively sort object keys, preserve array order only where semantic, explicitly sort set-like arrays at the owning schema field, reject unsupported values, serialize once, then hash UTF-8 bytes with SHA-256. Never sort every array generically because invocation order and precedence may be semantic. [VERIFIED: existing SHA-256 lifecycle pattern; deterministic requirement from D-16]

### Pattern 3: Evidence-gated merge

Group variants only by explicit canonical ID or authoritative shared origin. Otherwise emit separate `runtime:type:native-identity` records. A content fingerprint supports change/diagnostic evidence but cannot independently merge Claude and Codex records. [VERIFIED: D-01 through D-04]

### Pattern 4: Diagnostics as first-class output

Return `{ registry, diagnostics, summary }`; sort records by canonical ID and diagnostics by canonical ID/source. Keep absolute paths only in local diagnostic output. Candidate construction never updates active pointers, mode maps, hooks, or runtime-owned sources. [VERIFIED: D-11, D-15, D-16 and phase boundary]

### Anti-Patterns to Avoid

- **Name-based merging:** identical names across runtimes are not identity evidence.
- **Ambient home reads:** tests and APIs must not silently traverse the user's real `.claude` or `.codex`.
- **Absolute paths in portable output:** they break deterministic cross-machine bytes and disclose local layout.
- **Invented metadata:** absent optional fields are `unknown`, not guessed empty declarations.
- **Activation during build:** Phase 11 creates candidate artifacts only.
- **Generic catch-all records:** unsupported schema/files become build diagnostics, not dispatchable capabilities.
- **JSON round-trip assumptions:** canonical serialization must define ordering and unsupported-value behavior explicitly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cryptographic content identity | Custom checksum | `node:crypto` SHA-256 | Stable, available, collision-resistant. |
| Test framework | Custom harness | `node:test` | Existing fixtures, isolation, and assertions already established. |
| Atomic installer writes | New deployment subsystem | Existing lifecycle preflight/temp-file/rename/ownership manifest pattern | Preserves idempotency and unrelated settings. |
| Runtime-neutral parser | One universal heuristic parser | Two native adapters behind a common interface | Native layouts and invocation semantics differ. |

## Runtime State Inventory

This is a registry refactor/migration foundation, so runtime state was audited even though Phase 11 must not mutate it.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | No database/datastore dependency in the repository; current inventory is file-based JSON and source snapshots. Verified by repository file inventory and standard-library lifecycle code. | No data migration in Phase 11. Candidate output is new state, not an in-place migration. |
| Live service config | Claude `settings.json` hook bindings and Codex configuration/plugin state exist outside git on user machines. | Read through supplied roots/adapters only; do not rewrite during candidate build. Installer changes remain ownership-scoped and additive. |
| OS-registered state | No launchd/systemd/pm2/container registration is used by the current repository. Verified by repository search and approved architecture. | None. Do not introduce a daemon or OS registration in Phase 11. |
| Secrets/env vars | No registry-specific secret or required environment variable is defined in the phase contracts. Runtime home overrides may be options, not secrets. | None; avoid persisting environment contents or raw config beyond required normalized metadata. |
| Build artifacts / installed packages | Live installed router hook, install ownership manifest, Codex installed marker, and current Claude inventory manifest may exist outside git. | Preserve them; Phase 11 installer deployment may add owned modules/candidate output but cannot overwrite unrelated or active state. |

## Common Pitfalls

### Pitfall 1: Stable ID depends on a mutable path
**What goes wrong:** Moves/renames produce a new identity. **How to avoid:** prefer explicit identity/shared origin; keep path as provenance and former-value evidence. **Warning signs:** IDs change when only fixture paths change.

### Pitfall 2: Project/global scope collapse
**What goes wrong:** a project capability leaks globally or masks fallback diagnostics. **How to avoid:** include canonical repository root plus worktree identity in project scope and create separate records. **Warning signs:** fixture count decreases when both scopes contain the same native name.

### Pitfall 3: Parser failure drops evidence
**What goes wrong:** broken artifacts disappear, making inventory falsely clean. **How to avoid:** emit recognizable non-dispatchable records with safe partial metadata; unsupported formats become build diagnostics. **Warning signs:** malformed fixtures produce neither record nor diagnostic.

### Pitfall 4: Nondeterministic traversal
**What goes wrong:** filesystem order changes registry bytes. **How to avoid:** normalize logical paths and sort roots, observations, records, conflicts, and summaries at explicit boundaries. **Warning signs:** repeated clean builds differ.

### Pitfall 5: Installer broadens ownership
**What goes wrong:** registry deployment rewrites unrelated settings or assumes ownership of pre-existing files. **How to avoid:** complete preflight before mutation, atomic writes, fingerprinted ownership manifest, exact-change reporting, and temporary-home tests. **Warning signs:** settings diff contains formatting/content beyond owned additions.

## Code Examples

### Deterministic content fingerprint

```js
import { createHash } from 'node:crypto';

export function contentFingerprint(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
```

Source: existing `src/lifecycle/router-lifecycle.mjs` SHA-256 pattern plus approved Phase 11 API. [VERIFIED: repository]

### Explicit-root adapter fixture

```js
const records = await discoverRoots({
  claudeRoot: fixture.claudeRoot,
  projectRoots: [fixture.projectRoot],
});
assert.ok(records.every((record) => record.provenance.logical_root));
```

Source: existing temporary-runtime-root tests and Phase 11 adapter contract. [VERIFIED: repository]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude-only category manifest consumed by prompt hook | Runtime-neutral candidate registry with Claude/Codex variants | Phase 11 / v1.2 | Enables shared inventory without changing prompt-time routing yet. |
| Paths/names as practical native identifiers | Explicit/shared-origin identity with mutable provenance | Phase 11 / v1.2 | Moves and linked variants retain stable identity safely. |
| Optional/malformed state primarily fail-open | Structured diagnostic records and build diagnostics | Phase 11 / v1.2 | Fail-open prompt behavior remains while build defects become inspectable. |

## Assumptions Log

All implementation recommendations are grounded in the approved repository design, plan, context, or current source/tests. No training-only claims or external packages are used.

## Open Questions (RESOLVED)

1. **Exact native layout fixtures for every installed Claude/Codex version**
   - What we know: required inventory categories and adapter ownership are locked.
   - What's unclear: future/unknown native schema versions cannot be exhaustively enumerated from this repository.
   - Recommendation: make supported layouts explicit and versioned; unknown schemas produce D-11 diagnostics, never heuristic records.
   - **RESOLVED:** Adopt the recommendation. Supported native layouts are explicit and versioned; any unknown schema produces deterministic D-11 diagnostics and does not become a heuristic capability record.

2. **Installer candidate output location**
   - What we know: one command must build the initial candidate and preserve active state.
   - What's unclear: exact logical/installed path is left to planning.
   - Recommendation: place it under the router-owned directory, include it in the ownership manifest, and keep it distinct from any active pointer reserved for Phase 14.
   - **RESOLVED:** Adopt the recommendation. Candidate registry and report artifacts live in a router-owned location covered by the ownership manifest, distinct from active state and from activation pointers reserved for Phase 14.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runtime and tests | ✓ | v22.22.3 | None needed |
| npm | Existing environment only; no install planned | ✓ | 10.9.8 | Not required for Phase 11 production |
| Git | Repository/worktree scope identity and development | ✓ | repository active | Explicit supplied project root when git metadata is absent |

**Missing dependencies with no fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` on Node v22.22.3 |
| Config file | none |
| Quick run command | `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-build.test.mjs tests/router.settings-diff.test.mjs` |
| Full suite command | `node --test tests/*.test.mjs` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REG-01 | Stable canonical schema/IDs and deterministic bytes | unit | `node --test tests/router.registry-schema.test.mjs` | ❌ Wave 0 |
| REG-02 | Full build covers all supported categories with diagnostics | integration | `node --test tests/router.registry-build.test.mjs` | ❌ Wave 0 |
| ADP-01 | Claude global/plugin/agents-store/project inventory | integration | `node --test tests/router.adapters.test.mjs` | ❌ Wave 0 |
| ADP-02 | Codex skills/plugins/agents/hooks/config/project inventory | integration | `node --test tests/router.adapters.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** focused new test file plus `tests/router.lifecycle.test.mjs` when installer code changes.
- **Per wave merge:** the four-file Phase 11 quick command.
- **Phase gate:** `node --test tests/*.test.mjs` green before verification.

### Wave 0 Gaps
- [ ] `tests/router.registry-schema.test.mjs` — REG-01 invariants and identity evidence.
- [ ] `tests/router.adapters.test.mjs` — ADP-01/ADP-02 temporary-home matrices and no out-of-root reads.
- [ ] `tests/router.registry-build.test.mjs` — REG-02 deterministic full-build parity and read-only behavior.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local inventory build has no authentication boundary. |
| V3 Session Management | no | No sessions are introduced. |
| V4 Access Control | yes | Explicit allowed roots, canonical project/worktree scope, no cross-project reads. |
| V5 Input Validation | yes | Strict native parsing, canonical schema validation, unsupported-version diagnostics, safe partial extraction. |
| V6 Cryptography | yes | `node:crypto` SHA-256 for fingerprints; no custom cryptography. |

### Known Threat Patterns for Node filesystem adapters

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Symlink/path traversal outside supplied roots | Elevation / Information Disclosure | Resolve and containment-check roots and artifacts; retain logical provenance. |
| Malicious capability metadata or prompt-like text | Tampering | Treat file content as data, parse only known fields, never execute during discovery. |
| Absolute-path leakage in portable registry | Information Disclosure | Logical roots plus normalized relative paths; local paths only in diagnostics. |
| Crafted duplicate/shared-origin metadata | Spoofing | Evidence-gated identity, typed conflicts, dispatch-blocking diagnostics. |
| Partial installer mutation | Tampering / Denial of Service | Preflight, atomic rename, ownership fingerprints, rollback/usable diagnosis. |
| Dependency declaration interpreted as authority to install | Elevation | Record availability only; no automatic third-party installation. |

## Sources

### Primary (HIGH confidence)
- `.planning/phases/11-canonical-registry-and-runtime-adapters/11-CONTEXT.md` — locked identity, scope, diagnostics, provenance, lightweight-install decisions.
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — approved control/data plane and canonical model.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — approved module boundaries, APIs, tests, and plan decomposition.
- `src/lifecycle/router-lifecycle.mjs` — current SHA-256, preflight, atomic write, ownership, and idempotency patterns.
- `tests/router.lifecycle.test.mjs`, `tests/router.settings-diff.test.mjs`, `tests/router.mjs.snapshot` — existing temporary-home, preservation, inventory-category, and fail-open patterns.

### Secondary (MEDIUM confidence)
- None required; this is a repository-defined architecture phase.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — current runtime and approved zero-dependency architecture verified locally.
- Architecture: HIGH — locked context plus approved design and implementation plan agree.
- Pitfalls: HIGH — derived directly from locked decisions and existing installer/test invariants.

**Research date:** 2026-07-14
**Valid until:** 2026-08-13, or until the approved Phase 11 contracts change.
