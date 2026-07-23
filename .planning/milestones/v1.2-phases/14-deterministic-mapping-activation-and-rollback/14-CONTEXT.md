# Phase 14: Deterministic Mapping, Activation, and Rollback - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase maps safe canonical-registry changes through an explainable deterministic precedence chain, publishes verified candidates as immutable versions through one atomic active-pointer change, retains recoverable known-good history, and exposes read-mostly operator controls for inspection, verification, preview, and typed-confirmed rollback. Background ambiguity resolution may propose evidence but cannot bypass deterministic validation or activate an absent, unsafe, or ambiguous target.

</domain>

<decisions>
## Implementation Decisions

### Mapping confidence and ambiguity
- **D-01:** Mapping results use structured confidence with both a normalized score and a named confidence band. Every result identifies the winning rule, ordered evidence, rejected alternatives, policy version, and any margin to the next candidate; a score without evidence is invalid.
- **D-02:** Deterministic rules run in strict order: explicit canonical alias or declared metadata, authoritative stable identity, existing route-family inheritance, then deterministic lexical/trigger signals. Later rules may fill an unresolved result but may not silently override stronger evidence.
- **D-03:** If stronger evidence sources conflict, the mapping is ambiguous and non-dispatchable until reconciled. Lexical similarity never breaks a conflict between explicit or identity-backed claims.
- **D-04:** A valid safe capability with insufficient mapping confidence remains present and active-but-unmapped. It may be submitted to the bounded background ambiguity resolver, but its proposal must re-enter the same validation pipeline before activation.
- **D-05:** Collision thresholds require both a minimum absolute confidence and a minimum winner margin. Near ties remain unmapped rather than selecting the highest score by default.

### Mapping precedence and target safety
- **D-06:** Every proposed target must resolve to an invocable record in the exact candidate registry version being evaluated, with applicable scope, permissions, and dependencies. No mapping may invent a target or resolve through stale active-version state.
- **D-07:** Route-family inheritance is allowed only from authoritative continuity or an existing mapping tied to the same stable identity. Name, description, fingerprint, or shared tokens alone do not establish inheritance.
- **D-08:** Mapping output is deterministic and byte-stable for equivalent candidate input, regardless of filesystem discovery order or background-resolver availability.
- **D-09:** Background ambiguity results are advisory evidence with explicit provenance and policy/model version. They cannot outrank explicit metadata or stable identity, loosen safety filters, or directly mutate active mappings.

### Activation and version retention
- **D-10:** A candidate that passes the complete required validation and calibration gates activates automatically; no routine operator approval is required. Any failed, incomplete, stale, or uncertain gate preserves the current active version byte-for-byte.
- **D-11:** Candidate contents are fully written and durably synchronized in a new immutable version directory before activation. Activation consists of one atomic replacement of a small `active.json` pointer; readers never observe a partially published registry.
- **D-12:** Startup and recovery treat the active pointer as authoritative only when its referenced version is complete and valid. A corrupt, missing, or incomplete target fails closed to the most recent verified known-good version and emits an actionable recovery verdict.
- **D-13:** Retain the active version, the immediately previous known-good version, and a bounded recent verified history sufficient for inspection and manual rollback. Quarantined or failed candidates use a separate bounded diagnostic retention policy and are never rollback targets.
- **D-14:** Retention is count- and age-bounded with pruning that never removes the active version, the configured last-known-good fallback, or a version currently referenced by an in-progress operation. Exact default limits are planner discretion.

### Rollback and operator CLI
- **D-15:** `status`, `diff`, `explain`, and `registry verify` are read-only by default and support deterministic human-readable output plus stable machine-readable JSON. Automation receives structured reason codes and meaningful nonzero exit statuses for invalid, unsafe, or unverifiable states.
- **D-16:** Rollback is always preview-first. The preview identifies source and destination versions, timestamps, fingerprints, mapping/record changes, verification state, safety warnings, and the exact pointer-only mutation that would occur.
- **D-17:** Rollback accepts only an immutable version that still passes integrity and compatibility verification. It changes the active pointer atomically; it does not copy, rebuild, edit, or reinterpret historical version contents.
- **D-18:** Interactive rollback requires typing the exact destination version identifier shown in the preview. Non-interactive use requires an explicit confirmation argument containing that same identifier; a generic `--yes` is insufficient.
- **D-19:** A successful rollback preserves the displaced version in history and records a local audit event with source, destination, time, outcome, and reason, without raw prompts or secrets. A failed rollback leaves the active pointer unchanged.
- **D-20:** `explain` presents the deterministic rule chain, evidence, confidence, rejected candidates, filters, and final disposition. `diff` defaults to active versus candidate/latest and also permits two explicit immutable versions.

### the agent's Discretion
- Exact confidence scale, confidence-band names, lexical scoring formula, collision thresholds, version naming format, retention counts/ages, CLI formatting, command aliases, and audit-event schema are left to research and planning, provided they preserve D-01 through D-20 and the lightweight Node.js constraint.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved design and implementation contract
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — Defines deterministic mapping order, validation gates, immutable version activation, last-known-good behavior, and rollback architecture.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — Defines Phase 14 module boundaries, focused tests, CLI commands, and the three-plan decomposition.

### Project and phase contracts
- `.planning/ROADMAP.md` §Phase 14 — Defines the phase goal, success criteria, dependency, and planned slices.
- `.planning/REQUIREMENTS.md` §Mapping and Activation — Defines MAP-01 and ACT-01 and records MAP-02 as the inherited Phase 13 safety prerequisite.
- `.planning/PROJECT.md` — Defines guarded automatic activation, rollback, lightweight installation, privacy, and prompt-path separation constraints.
- `.planning/phases/13-target-safety-hook-reconciliation-and-quarantine/13-CONTEXT.md` — Locks deletion invalidation, authoritative alias transfer, malformed-target failure, and atomic candidate reconciliation inherited by this phase.
- `.planning/phases/12-incremental-change-detection-and-watcher/12-CONTEXT.md` — Locks lifecycle continuity and deterministic full/incremental equivalence feeding candidate mapping.
- `.planning/phases/11-canonical-registry-and-runtime-adapters/11-CONTEXT.md` — Locks canonical identity, scope precedence, provenance, deterministic portable bytes, and lightweight operation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry/reconcile.mjs`: Produces deterministic eligible/quarantined dispositions, structured evidence and corrective verdicts, candidate fingerprints, and unchanged active bytes on failure.
- `src/registry/diff.mjs`: Supplies ordered lifecycle changes and authoritative continuity evidence for route-family inheritance and version diffs.
- `src/registry/hook-reconcile.mjs`: Establishes structured dispatch-blocking verdict and fail-closed classification patterns.
- `src/registry/schema.mjs` and `src/registry/identity.mjs`: Provide canonical validation, stable serialization, fingerprints, and stable identities required by mapping and immutable versions.

### Established Patterns
- Registry outputs are deterministic, portable, and ordered; diagnostics use structured reason/evidence/corrective-action records.
- Candidate reconciliation separates candidate eligibility from the active bytes and preserves the active fingerprint on every quarantine or failure path.
- Runtime-owned files and unrelated settings are not mutated; control-plane changes remain outside the prompt-time routing path.

### Integration Points
- Add deterministic mapping in `src/registry/map.mjs` after canonical diff/reconciliation and before any background ambiguity resolver.
- Add immutable persistence and pointer management in `src/registry/activate.mjs` after all validation gates pass.
- Add operator surfaces in `src/cli/router-control.mjs`, deployed through `install-router.mjs` for both runtimes without changing unrelated configuration.
- Extend `calibration-tasks.json` and focused mapping, activation, and CLI test suites to prove precedence, crash safety, verification, preview, and rollback behavior.

</code_context>

<specifics>
## Specific Ideas

- The user selected all identified gray areas and explicitly requested the recommended safe defaults.
- Prefer automatic operation for fully verified safe changes, but make ambiguity, activation evidence, version history, and rollback consequences directly inspectable.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-deterministic-mapping-activation-and-rollback*
*Context gathered: 2026-07-15*
