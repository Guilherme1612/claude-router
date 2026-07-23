# Phase 11: Canonical Registry and Runtime Adapters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 11-canonical-registry-and-runtime-adapters
**Areas discussed:** Cross-runtime identity, Scope collisions, Incomplete artifacts, Provenance and conflicts, Lightweight installation and operation

---

## Cross-runtime identity

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Merge evidence | Explicit origin/declared identity; content fingerprint; heuristic match | Explicit origin/declared identity |
| Divergent linked variants | One identity with runtime variants; split identities; prefer one runtime | One identity with runtime variants |
| Rename/move behavior | Preserve ID; change on rename; preserve moves only | Preserve ID |
| Unlinked ID format | `runtime:type:native-identity`; opaque content hash; shared type/name | `runtime:type:native-identity` |

**User's choice:** Selected the recommended conservative identity rule for all four decisions.
**Notes:** Names, descriptions, and matching content are insufficient cross-runtime identity evidence.

---

## Scope collisions

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Record shape | Separate scoped records; one record with variants; project replaces global | Separate scoped records |
| Applicable-record precedence | Project first; explicit selection; global first | Project first |
| Unusable project variant | Expose both with diagnostics; silently use global; block both | Expose both with diagnostics |
| Project identity | Repository root plus worktree; absolute path; repository identity only | Repository root plus worktree |

**User's choice:** Selected the recommended isolated-scope model for all four decisions.
**Notes:** Project precedence does not erase the global fallback or hide an unusable project record.

---

## Incomplete artifacts

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Recognizable malformed capability | Diagnostic record; exclude completely; best-effort active | Diagnostic record |
| Optional metadata gaps | Explicit unknowns; inferred metadata; diagnostic-only | Explicit unknowns |
| Unknown format/schema | Build diagnostic; generic unknown record; fail build | Build diagnostic |
| Dependency state | Separate unknown and missing; both missing; both usable | Separate unknown and missing |

**User's choice:** Selected the recommended explicit diagnostic model for all four decisions.
**Notes:** Metadata must never be invented, and declared missing dependencies prevent dispatch.

---

## Provenance and conflicts

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Inline provenance | Structured summary plus external details; full native metadata; minimal pointer | Structured summary plus external details |
| Conflict model | Typed with severity; single warning; resolve to winner | Typed with severity |
| Portable paths | Logical root plus relative path; absolute path; fingerprint only | Logical root plus relative path |
| Build diagnostics | Deterministic summary plus structured report; record-only; human log only | Deterministic summary plus structured report |

**User's choice:** Selected the recommended portable and deterministic reporting model for all four decisions.
**Notes:** Absolute paths remain local diagnostics and do not enter portable canonical registry bytes.

## the agent's Discretion

- Exact schema field names, internal structures, hashing algorithm, and diagnostic serialization format. Dependencies are constrained by the lightweight distribution requirement.

## Lightweight installation and operation

**User's direction:** Keep this a light project that anyone can download and use quickly and simply. One command must perform setup automatically.

**Locked interpretation:**
- Reuse the existing Node.js and standard-library-first architecture; avoid heavyweight infrastructure and dependency growth.
- Provide one idempotent setup command that discovers Claude and Codex, deploys files, builds the initial registry, wires supported integrations, and verifies readiness.
- Preserve unrelated user configuration and fail with actionable diagnostics rather than leaving partial setup.
- Require no manual registry or path configuration for the default workflow.

## Deferred Ideas

- None.
