# Phase 11: Canonical Registry and Runtime Adapters - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce a deterministic, read-only candidate registry that normalizes supported Claude and Codex capabilities into one runtime-neutral model while preserving native invocation, provenance, dependencies, and scope. Phase 11 covers canonical schema and identity, Claude and Codex adapter contracts, and clean full builds. Filesystem watching, incremental reconciliation, quarantine enforcement, mapping, activation, rollback, context recovery, and prompt-time consumption remain in later phases.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved v1.2 design and implementation
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — Defines the canonical capability model, adapter ownership boundary, lifecycle architecture, safety constraints, and acceptance criteria.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — Defines the Phase 11 module boundaries, adapter interface, test targets, and three-plan delivery decomposition.

### Project and phase contracts
- `.planning/PROJECT.md` — Defines the v1.2 goal, constraints, architecture, and milestone-level decisions.
- `.planning/REQUIREMENTS.md` — Defines REG-01, REG-02, ADP-01, and ADP-02 and assigns them to Phase 11.
- `.planning/ROADMAP.md` — Defines the Phase 11 boundary, success criteria, and separation from Phases 12-18.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `install-router.mjs`: Existing deployment and settings-preservation surface; Phase 11 extends it to deploy registry modules while retaining exact unrelated runtime configuration bytes.
- `router.calibrate.mjs`: Existing importable dry-run and calibration harness; later phases can consume canonical registry versions without replacing the verified routing evaluation path.
- `tests/router.mjs.snapshot`: Captures current manifest categories, corpus construction, dependency filtering, fail-open behavior, and optional `capability-registry.cjs` integration semantics that adapter/build parity must preserve.
- `tests/router.settings-diff.test.mjs`: Existing guard for safe installer changes and unrelated-settings preservation.

### Established Patterns
- The prompt router remains deterministic, local, read-only, and fail-open; registry discovery and normalization belong outside the prompt hot path.
- Current inventory categories include skills, plugin skills, agents-store skills, agents, and commands. Phase 11 expands coverage without silently dropping current manifest categories.
- Optional or malformed supporting state currently fails open. The new candidate builder must report diagnostics without mutating active router state.
- Tests use Node's built-in test runner and temporary runtime roots; adapters must not read outside explicitly supplied fixture roots.
- The repository already uses a small Node-based installer and built-in test runner. Phase 11 should extend that path instead of adding a second installer, package manager workflow, daemon framework, or external service.

### Integration Points
- New canonical schema and identity modules live under `src/registry/`.
- Runtime-specific discovery, parsing, normalization, and invocation compilation live under `src/adapters/`.
- `src/registry/build.mjs` combines adapter output into deterministic candidate registry and diagnostic artifacts.
- `install-router.mjs` deploys the new modules without activating candidate state or rewriting unrelated Claude/Codex configuration.
- `install-router.mjs` is the one-command setup entry point: runtime discovery, safe deployment, initial full registry build, supported integration wiring, and readiness verification must compose behind this single command.

</code_context>

<specifics>
## Specific Ideas

- Prefer readable IDs such as `claude:skill:gsd-plan-phase` for unlinked native capabilities.
- Keep portable registry bytes machine-independent through logical roots and relative paths.
- Treat diagnostic visibility and dispatchability as separate concerns: broken records remain explainable without becoming invocable.
- Optimize for immediate adoption: download the project, run one command, and use it. No manual registry construction or runtime-specific setup should be required on the default path.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-canonical-registry-and-runtime-adapters*
*Context gathered: 2026-07-14*
