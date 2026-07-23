# Phase 15: Context Capsules and Workflow-State Recovery - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds a bounded, privacy-safe context capsule that records enough structured state to identify and resume one active workflow. Minimal referential prompts recover the next valid workflow step from capsule evidence plus authoritative project and execution state; stale, corrupt, conflicting, or ambiguous state is refreshed or surfaced through one focused question. This phase does not persist raw prompt history, choose the broader workflow/capability stack planned for Phase 16, or add cross-machine synchronization.

</domain>

<decisions>
## Implementation Decisions

### Capsule contents and bounds

- **D-01:** Use a versioned, deterministic structured capsule with stable workflow identity, active goal summary, current workflow/phase/step, status, bounded artifact references, blocker summaries, freshness metadata, and provenance. Store references and compact facts, never raw prompts, full documents, transcripts, secrets, credentials, or arbitrary tool output.
- **D-02:** Treat the capsule as a resumability index, not a second source of truth. Every artifact entry carries a relative path or stable identifier, a compact type/status, and a freshness witness such as mtime, content fingerprint, version, or generation marker; full artifact contents remain at their authoritative location.
- **D-03:** Enforce explicit per-field and total size/count limits. Use deterministic truncation with a machine-readable `truncated`/`omitted_count` signal; never silently spill into unbounded history. Prefer the newest unresolved blockers and the artifacts needed for the next step.
- **D-04:** Persist one local capsule per project/workspace scope using schema validation and atomic replace. Preserve a last-known-good capsule only for recovery from a torn/corrupt write; retention is small and bounded rather than an event history.

### Workflow identity and ambiguity

- **D-05:** A workflow is uniquely resumable only when stable project/workspace scope, workflow kind, active goal identity, phase/plan/task position, and current status resolve to exactly one valid next action. Human-readable labels alone are not sufficient identity.
- **D-06:** Referential prompts such as `continue`, `finish it`, and `use the design` may resume automatically only when capsule evidence and authoritative state converge on one eligible workflow. Resolution must be deterministic and explainable with source precedence and a reason code.
- **D-07:** If zero or multiple eligible workflows remain after bounded reconciliation, do not guess. Ask exactly one focused question that names the smallest distinguishing choice; do not request the user to restate already-known context.
- **D-08:** Resume semantics follow the workflow state: `continue` advances the next incomplete valid step, `finish it` selects the remaining terminal work of the uniquely active workflow, and `use the design` requires one uniquely referenced design artifact connected to that workflow. These phrases do not broaden authorization or revive completed/abandoned work.

### Freshness and recovery

- **D-09:** Validate schema version, required identities, enum/state transitions, bounds, artifact reference safety, and freshness witnesses before trusting a capsule. Parse or validation failure marks the capsule corrupt; mismatched witnesses, superseded status, or changed authoritative artifacts mark it stale.
- **D-10:** Refresh from a bounded precedence chain: explicit current instruction, live execution/workflow state, authoritative phase/project state and referenced artifacts, then the last valid capsule as a hint. The capsule never overrides newer authoritative state.
- **D-11:** Rebuild only the fields needed to identify the next workflow action and rewrite the capsule atomically. Missing optional sources degrade with structured diagnostics; missing/conflicting identity-critical sources yield a focused question rather than speculative recovery.
- **D-12:** Recovery is read-bounded and local: targeted state/artifact summaries and fingerprints are allowed, but no full planning-directory scan, complete design-document load, conversation-history replay, network classifier, or background model call is required on the prompt hot path.

### Explicit override behavior

- **D-13:** A new explicit instruction has highest precedence over capsule intent whenever it names a different goal, phase, workflow, artifact, or requested action. The router follows the new instruction and updates/replaces the active capsule rather than trying to reconcile it into the stale workflow.
- **D-14:** Preserve displaced state only as a bounded supersession reference (previous workflow identity, status, and reason), sufficient for diagnostics or deliberate return. Do not merge incompatible goals or retain the prior raw request.
- **D-15:** An explicit instruction that changes scope or target but lacks one material discriminator asks one focused clarification. Safe read-only validation may run first; no state-changing workflow step is dispatched until the conflict is resolved.
- **D-16:** Completion, cancellation, and supersession are terminal capsule states. Minimal continuation must not reopen them unless the user explicitly identifies that prior workflow; otherwise the resolver uses the current uniquely active workflow or asks the focused question.

### Planner's Discretion

- Exact module boundaries, filenames, JSON field names, schema-version representation, byte/count thresholds, reason-code vocabulary, and last-known-good retention count, provided they preserve D-01 through D-16 and are covered by deterministic tests.
- Exact focused-question wording and compact diagnostic format, provided only one material distinction is requested and no raw prompt content is persisted.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved design and implementation contract
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — Defines the approved v1.2 architecture, context-capsule role, prompt-path separation, privacy, and lightweight-operation constraints.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — Defines the implementation sequence and intended Phase 15 integration with the dual-runtime control plane.

### Project and phase contracts
- `.planning/ROADMAP.md` §Phase 15 — Defines the goal, dependency, success criteria, and the three planned slices.
- `.planning/REQUIREMENTS.md` §Context Recovery and §Workflow Orchestration — Defines CTX-01, CTX-02, ORC-02, and the explicit prohibition on full prompt-history persistence.
- `.planning/PROJECT.md` — Defines minimal-prompt routing, privacy, deterministic prompt-time behavior, local-first state, and performance constraints.
- `.planning/phases/14-deterministic-mapping-activation-and-rollback/14-CONTEXT.md` — Locks deterministic precedence, ambiguity handling, immutable versioning, atomic pointer changes, and structured operator diagnostics inherited by capsule recovery.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry/schema.mjs`: Reusable versioned validation, canonical serialization, and bounded structured-record patterns for the capsule schema.
- `src/registry/identity.mjs`: Stable scope-aware identity and fingerprint primitives suitable for project, workflow, goal, and artifact continuity witnesses.
- `src/registry/activate.mjs`: Existing immutable-version, atomic-pointer, last-known-good, and crash-safe persistence patterns to adapt for capsule writes and recovery.
- `src/registry/diff.mjs`: Ordered lifecycle/continuity classification patterns that can distinguish current, superseded, and uncertain workflow state.
- `src/registry/map.mjs`: Existing sensitive-key filtering, deterministic precedence, explicit-over-inferred behavior, structured confidence, and ambiguity patterns.
- `src/registry/reconcile.mjs`: Structured verdict, reason, and corrective-action patterns for stale/corrupt/conflicting capsules.

### Established Patterns
- Deterministic explicit-first precedence: Explicit metadata and stable identity outrank inheritance and lexical inference; conflicts remain non-dispatchable.
- Atomic guarded persistence: Validate a complete candidate before one atomic pointer/replace operation, retain a bounded last-known-good version, and never expose partial state.
- Privacy by construction: Remove sensitive/raw prompt fields before persistence and preserve compact evidence/provenance rather than source payloads.
- Fail-safe ambiguity: Unsafe, stale, or conflicting state produces structured diagnostics and no speculative dispatch.

### Integration Points
- Add capsule schema/identity/persistence modules beside the existing `src/registry/` control-plane primitives while keeping capsule reads bounded and separate from registry payload loading.
- Feed live phase/plan/task and artifact state from `.planning/STATE.md`, `.planning/ROADMAP.md`, phase artifacts, and execution checkpoints through targeted adapters rather than directory-wide prompt-time ingestion.
- Integrate the resolver before referential-prompt routing so explicit user intent can override capsule state and ambiguous continuation can return one focused clarification.
- Extend focused unit and integration tests for schema/privacy bounds, atomic persistence, unique resume, stale/corrupt refresh, explicit override, terminal-state handling, and ambiguous one-question behavior.

</code_context>

<specifics>
## Specific Ideas

- Recommended options were approved for every discussed area.
- Recovery should feel invisible when identity is unique, but visibly cautious when one material ambiguity remains.
- Capsule diagnostics should explain which authoritative witness invalidated or refreshed stored state without exposing prompt content.

</specifics>

<deferred>
## Deferred Ideas

- Cross-machine capsule synchronization remains a future requirement.
- Workflow-first capability selection and declared context-budget enforcement remain Phase 16 scope.
- Shared multi-user policy and approval workflows remain out of scope for v1.2.

</deferred>

---

*Phase: 15-context-capsules-and-workflow-state-recovery*
*Context gathered: 2026-07-16*
