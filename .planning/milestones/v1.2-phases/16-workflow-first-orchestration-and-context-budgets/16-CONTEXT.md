# Phase 16: Workflow-First Orchestration and Context Budgets - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the deterministic orchestration layer that chooses the next valid workflow transition first, derives only that workflow's compatible capability and dependency closure, and constructs a least-sufficient context load within declared budgets. Phase 17 owns compilation into the live prompt-routing hot path and telemetry-driven evolution.

</domain>

<decisions>
## Implementation Decisions

### Workflow transition precedence
- **D-01:** Resolve canonical workflow states and valid transitions from authoritative Phase 15 evidence before considering any capability.
- **D-02:** Complete explicit instructions may select a valid transition and supersede stale capsule intent, but cannot bypass gates, terminal closure, or dependency safety.
- **D-03:** If materially different transitions remain tied, return exactly one smallest clarification and keep dispatch ineligible; never break the tie lexically.
- **D-04:** Preserve gates across brainstorming/design approval, GSD progression, interrupted execution, verification gaps, and milestone boundaries. Invalid transitions fail closed with stable reasons.

### Capability and dependency closure
- **D-05:** Select one workflow first, then derive capabilities from declared workflow ownership and requirements. Lexical resemblance never independently selects MCPs or tools.
- **D-06:** Resolve a deterministic transitive closure across skills, commands, agents, MCPs, tools, models, permissions, and lifecycle requirements. Exclude unsafe or unavailable nodes and report the first stable blocker.
- **D-07:** Compatible explicit capability requests may narrow the closure; incompatible requests produce a focused non-dispatchable result rather than switching or merging workflows.
- **D-08:** Hooks remain event-bound lifecycle bindings and are never invoked as ordinary task tools.

### Least-sufficient context budgets
- **D-09:** Every workflow declares allowed source classes, per-source ceilings, a total hard budget, and required-versus-optional priority. Undeclared sources are forbidden.
- **D-10:** Load in stable priority order: transition facts, required dependencies, exact artifact summaries/references, optional diagnostics. Omit optional overflow deterministically; required overflow blocks dispatch rather than truncating meaning.
- **D-11:** Estimate tokens deterministically from canonical bytes with a documented conservative versioned formula. Report bytes, estimated tokens, included/omitted sources, ceilings, and regression deltas.
- **D-12:** Reuse summaries only when canonical identity, freshness witness, and summary-contract version match. Default routing never loads full planning trees, conversation history, complete manifests, or complete design bodies.
- **D-13:** Context planning is side-effect-free and explainable; persistence and hot-path compilation belong to later integration surfaces.

### the agent's Discretion
- Internal type names and module decomposition may follow repository conventions while preserving observable ordering, reason codes, safety, and hard budgets.
- Research may select the conservative estimation constant, but it must be deterministic, documented, versioned, and regression-tested.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Approved architecture and milestone plan
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — Approved architecture, workflow-first orchestration, prompt-path constraints, and safety boundaries.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` §Phase 16 — Named modules, behavioral matrices, and approved work packages.
- `.planning/ROADMAP.md` §Phase 16 — Authoritative goal, requirements, criteria, and boundary.
- `.planning/REQUIREMENTS.md` — ORC-01, TOK-01, and TOK-02 definitions and traceability.

### Direct dependency
- `.planning/phases/15-context-capsules-and-workflow-state-recovery/15-CONTEXT.md` — Locked identity, freshness, resume, ambiguity, override, and terminal-state decisions.
- `.planning/phases/15-context-capsules-and-workflow-state-recovery/15-VERIFICATION.md` — Verified Phase 15 behavior and runtime evidence.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/context/resolve.mjs`: Pure outcome algebra and dispatch-eligibility conventions.
- `src/context/sources.mjs`: Bounded authoritative facts, freshness witnesses, precedence, and diagnostics.
- `src/context/capsule.mjs`: Canonical workflow identity and bounded safe references.
- `src/registry/schema.mjs`: Capability dependencies, scopes, permissions, lifecycle, and dispatchability.
- `src/registry/map.mjs`: Deterministic safety/dependency checks and stable reason-code patterns.
- `src/cli/router-control.mjs`: JSON-first inspectable controller conventions.

### Established Patterns
- Pure decision modules are separated from filesystem/runtime adapters.
- Canonical serialization, stable sorting, explicit bounds, reason codes, and privacy allowlists are executable contracts.
- Unsafe, ambiguous, stale, or incomplete evidence remains non-dispatchable.
- Node.js ESM, `node:test`, standard-library-only code, and test-first commits are the norm.

### Integration Points
- Workflow selection consumes Phase 15 outcomes and registry records without mutating them.
- Capability closure reads registry dependency/provenance/lifecycle fields only after workflow selection.
- Context planning consumes capsule facts, exact witnesses, workflow contracts, and summary indexes; the controller exposes explanations.
- Phase 17 compiles these policies into the deployed hook, so Phase 16 does not edit the hook.

</code_context>

<specifics>
## Specific Ideas

- Keep the approved split: `src/orchestrator/transitions.mjs`, `src/orchestrator/select.mjs`, and `src/orchestrator/budget.mjs` with focused tests.
- Make negative guarantees executable: no capability before workflow; no lexical MCP/tool selection; no full default document loads.
- Budget reports must be stable enough for CI diffs and Phase 17 regression gates.

</specifics>

<deferred>
## Deferred Ideas

- Compiled indexes, deployed-hook integration, warm p95 measurement, telemetry canaries, and automatic evolution remain Phase 17.
- Capability-install automation remains out of scope.

</deferred>

---

*Phase: 16-workflow-first-orchestration-and-context-budgets*
*Context gathered: 2026-07-16*
