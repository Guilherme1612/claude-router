# Phase 16: Workflow-First Orchestration and Context Budgets - Research

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- Compiled indexes, deployed-hook integration, warm p95 measurement, telemetry canaries, and automatic evolution remain Phase 17.
- Capability-install automation remains out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORC-01 | Workflow selection precedes skill, command, agent, MCP, and tool selection. | A two-stage API makes a resolved, dispatch-eligible workflow outcome a required input to capability selection. [VERIFIED: `.planning/REQUIREMENTS.md`, `16-CONTEXT.md`] |
| TOK-01 | Default routing loads no full manifest, planning directory, conversation history, or complete design document. | Source-class allowlists and summary/reference-only contracts make broad sources unrepresentable in a default context plan. [VERIFIED: `.planning/REQUIREMENTS.md`, approved design] |
| TOK-02 | Each workflow enforces a declared context budget and reuses unchanged artifact summaries. | A pure budget planner enforces per-source and total ceilings and validates summary identity, freshness witness, and contract version before reuse. [VERIFIED: `.planning/REQUIREMENTS.md`, `16-CONTEXT.md`] |
</phase_requirements>

**Researched:** 2026-07-16  
**Domain:** Deterministic workflow orchestration, dependency closure, and bounded context planning  
**Confidence:** HIGH

## Summary

Phase 16 should add three pure, standard-library-only modules under `src/orchestrator/`: transition policy, workflow-first capability selection, and least-sufficient context planning. This is the exact split approved by the architecture and implementation plan, and it matches the repository's existing separation between pure decision logic and runtime/filesystem adapters. [VERIFIED: `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md`, `16-CONTEXT.md`]

The critical architectural rule is an API boundary, not merely an ordering convention: capability selection must reject any input that is not a single resolved, dispatch-eligible workflow outcome. Dependency closure then walks only declared ownership and dependency edges from that workflow, in stable order, while applying existing registry lifecycle, safety, scope, permission, and availability facts. Context planning is a separate pure pass over a declared workflow contract and bounded source descriptors; it never reads files or persists caches. [VERIFIED: `src/context/resolve.mjs`, `src/registry/schema.mjs`, `16-CONTEXT.md`]

The conservative token estimator should be versioned as `utf8-bytes-v1-ceil-div-3`: `estimated_tokens = ceil(canonical_utf8_bytes / 3)`. This deliberately overestimates typical English/code input relative to common four-bytes-per-token heuristics, is deterministic across machines, requires no tokenizer dependency, and can be regression-tested exactly. The value is a planning estimate rather than a claim about provider billing. [ASSUMED: conservative constant selected under D-11 discretion]

**Primary recommendation:** Implement and test the three modules in dependency order—`transitions.mjs`, `select.mjs`, then `budget.mjs`—and make every intermediate result a stable JSON-ready outcome with `status`, `dispatch_eligible`, and `reason_code`. [VERIFIED: approved Phase 16 plan and repository outcome conventions]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Canonical workflow transition policy | `src/orchestrator/transitions.mjs` | Phase 15 resolver outcomes | Owns valid states, gates, tie handling, and stable transition reasons without reading runtime state. [VERIFIED: approved plan] |
| Workflow selection | `src/orchestrator/select.mjs` | `transitions.mjs` | Converts transition candidates plus explicit intent into exactly one eligible workflow or one non-dispatchable explanation. [VERIFIED: D-01–D-04] |
| Capability and dependency closure | `src/orchestrator/select.mjs` | canonical registry | Runs only after workflow resolution and walks declared edges across capability kinds. [VERIFIED: D-05–D-08] |
| Context contract enforcement | `src/orchestrator/budget.mjs` | Phase 15 capsule/source descriptors | Produces an explainable load plan; it does not perform I/O. [VERIFIED: D-09–D-13] |
| Authoritative state reads | `src/context/sources.mjs` | `src/context/resolve.mjs` | Phase 15 already supplies bounded facts, freshness, precedence, and dispatch eligibility. [VERIFIED: codebase] |
| Registry safety facts | `src/registry/schema.mjs` and existing validation outputs | `select.mjs` | Existing records carry dependencies, scopes, permissions, lifecycle, and dispatchability. [VERIFIED: codebase] |
| Operator explanation | `src/cli/router-control.mjs` | orchestrator outcomes | JSON-first controller conventions can expose decisions later without coupling policy to CLI I/O. [VERIFIED: codebase] |
| Compiled prompt routing and persistence | Phase 17 | deployed hook | Explicitly outside Phase 16. [VERIFIED: `16-CONTEXT.md`, ROADMAP Phase 17] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM | Repository runtime | Pure orchestration modules | All current source and tests use `.mjs`; no new runtime is needed. [VERIFIED: codebase inventory] |
| `node:test` | Node built-in | Behavioral matrices and negative guarantees | Existing focused tests use the built-in runner. [VERIFIED: `tests/*.test.mjs`] |
| Node `Buffer.byteLength` | Node built-in | Canonical UTF-8 byte accounting | Deterministic byte counts without tokenizer or network dependencies. [VERIFIED: Node built-in API and existing capsule byte bounds] |
| Existing stable canonicalization helpers | Repository-local | Stable sorting/stringification/fingerprints | Reuse repository conventions instead of introducing competing serialization. [VERIFIED: `src/registry/schema.mjs`, `src/context/capsule.mjs`] |

No third-party package is required, so package legitimacy and environment installation checks are not applicable. [VERIFIED: approved module design]

## Architecture Patterns

### System Architecture Diagram

```text
current prompt + Phase 15 resolved evidence + transition policy
                         |
                         v
              nextValidTransitions(...)
                         |
             +-----------+-----------+
             |                       |
       exactly one valid       none / tied / invalid
             |                       |
             v                       v
      resolved workflow       blocked or one smallest
      dispatch eligible       clarification; no dispatch
             |
             v
 selectCapabilities(resolvedWorkflow, registry, explicitRequest?)
             |
             v
 resolveDependencies(declared roots only, stable registry edges)
             |
     +-------+--------+
     |                |
 safe closure     first stable blocker
     |                |
     v                v
 planContextLoad(workflow contract, capsule refs, summary index)
     |
     +--> required overflow => blocked, never semantic truncation
     +--> optional overflow => deterministic omission report
     +--> valid plan => included refs + accounting + regression delta
```

[VERIFIED: D-01–D-13 and approved Workflow Orchestrator design]

### Recommended Project Structure

```text
src/orchestrator/
├── transitions.mjs  # states, gates, valid-transition outcomes
├── select.mjs       # workflow selection and declared dependency closure
└── budget.mjs       # context contracts, summary reuse, byte/token reports
tests/
├── router.workflow-orchestrator.test.mjs
└── router.context-budget.test.mjs
```

[VERIFIED: approved implementation plan]

### Pattern 1: Resolved Workflow as a Capability-Selection Token

**What:** `selectCapabilities` accepts only a workflow result shaped like `{status:'selected', dispatch_eligible:true, workflow_id, transition_id, ...}`. Missing, ambiguous, blocked, or terminal outcomes return a stable non-dispatchable reason before registry inspection. [VERIFIED: D-01, D-03, existing `dispatch_eligible` convention]

**Why:** This makes ORC-01 testable and prevents future callers from accidentally selecting skills/tools directly from prompt text. [VERIFIED: ORC-01]

```js
const workflow = selectWorkflow({ explicit, transitionOutcome });
if (!workflow.dispatch_eligible) return workflow;
const selected = selectCapabilities({ workflow, registry, explicitCapability });
```

### Pattern 2: Data-Driven Transition Matrix with Gate Predicates

**What:** Represent canonical states and transitions as frozen records with stable IDs, `from`, `to`, required evidence, forbidden terminal states, and gate predicates. Return sorted candidate outcomes rather than mutating capsule state. [VERIFIED: D-01–D-04]

Recommended fixture families are brainstorming→design approval→implementation plan, GSD discuss→plan→execute→verify, interrupted execution resume, verification-gap closure, and milestone closeout. [VERIFIED: approved Plan 16-01]

Do not encode a universal linear workflow: gate evidence determines whether a transition is currently valid, and terminal closure forbids resurrection even under explicit instruction. [VERIFIED: D-02, D-04]

### Pattern 3: Stable Declared-Edge Closure

**What:** Seed closure from the chosen workflow's declared owners/requirements, then traverse registry dependency IDs in a fixed kind-and-ID order. Track `visiting` and `visited` IDs, detect cycles, and apply safety/availability checks at each node. [VERIFIED: D-05–D-08; cycle handling is an implementation recommendation]

Recommended kind precedence for deterministic reports: `skill`, `command`, `agent`, `mcp`, `tool`, `model`, `permission`, `hook`, then canonical ID. Hooks may appear only as lifecycle requirements and must never enter the invokable capability list. [ASSUMED: stable kind precedence chosen under internal decomposition discretion]

The first blocker is the first failing node in this canonical traversal, not the incidental order of input objects. [VERIFIED: D-06]

### Pattern 4: Contract-First Context Planning

**What:** A workflow contract declares `allowed_sources`, source `required` priority, `max_bytes`, and `total_max_bytes`. Candidate descriptors contain references or bounded summaries, canonical identity, witness, and summary contract version. The planner validates descriptors and returns a load plan; adapters execute it later. [VERIFIED: D-09–D-13]

Stable priority is fixed by D-10: transition facts, required dependencies, artifact summaries/references, optional diagnostics. Within a class, sort by declared priority then canonical source ID. [VERIFIED: D-10]

Undeclared source classes must produce `source_class_forbidden`, not be silently ignored. Required overflow must produce `required_source_budget_exceeded`; optional overflow is omitted with `optional_source_budget_exceeded`. [ASSUMED: reason-code names; behavior verified by D-09/D-10]

### Pattern 5: Versioned Conservative Estimator and Regression Report

```js
export const TOKEN_ESTIMATOR_VERSION = 'utf8-bytes-v1-ceil-div-3';
export function estimateTokens(canonicalValue) {
  const bytes = Buffer.byteLength(stableStringify(canonicalValue), 'utf8');
  return { bytes, estimated_tokens: Math.ceil(bytes / 3) };
}
```

The report should include estimator version, total bytes/tokens, per-source actual and ceiling, included and omitted source IDs with reasons, hard budget, and delta against an explicitly supplied baseline. Absence of a baseline should report `regression_delta: null`, never infer one from persisted state. [VERIFIED: D-11, D-13; estimator constant ASSUMED]

### Pattern 6: Exact Summary-Reuse Key

Use a reuse key composed of canonical artifact identity, freshness witness kind/value, and summary contract version. All three must match exactly; otherwise report a cache miss and require a bounded refresh path outside the pure planner. [VERIFIED: D-12]

Do not use pathname alone, mtime alone without identity, or content summary text as the key. Phase 15 already supports `mtime`, `sha256`, `version`, and `generation` witnesses and canonical workflow identity. [VERIFIED: `src/context/capsule.mjs`]

## Component Responsibilities

| File/API | Inputs | Outputs | Must Not Do |
|----------|--------|---------|-------------|
| `nextValidTransitions(capsule, policy)` | Canonical Phase 15 evidence and frozen policy | Stable candidate list or invalid reason | Read files, inspect capability names, mutate capsule. [VERIFIED: D-01/D-13] |
| `selectWorkflow(...)` | Transition result and complete explicit instruction | One selected workflow, one clarification, or blocked outcome | Lexically break material ties or bypass gates. [VERIFIED: D-02/D-03] |
| `selectCapabilities(...)` | Dispatch-eligible workflow, registry, optional explicit capability | Declared root capabilities or incompatible request result | Select MCP/tool by prompt resemblance or merge workflows. [VERIFIED: D-05/D-07] |
| `resolveDependencies(...)` | Selected roots and registry | Deterministic safe closure or first stable blocker | Install missing nodes; invoke hooks. [VERIFIED: D-06/D-08] |
| `planContextLoad(...)` | Workflow contract, capsule refs, summary index, baseline | Pure include/omit/block report | Perform I/O, persist summaries, compile hot-path state, silently truncate required meaning. [VERIFIED: D-10/D-13] |

## Don't Hand-Roll

- Do not add a tokenizer package. Phase 16 needs a deterministic conservative estimator, not provider-exact billing tokenization. [VERIFIED: D-11; implementation recommendation]
- Do not create a second registry or capability schema. Consume canonical registry records and existing safety/lifecycle fields. [VERIFIED: `src/registry/schema.mjs`]
- Do not recreate authoritative context readers. Phase 15 already provides bounded state, roadmap, artifact, execution, git, freshness, and precedence logic. [VERIFIED: `src/context/sources.mjs`]
- Do not compile indexes, edit the deployed hook, persist context plans, measure warm p95, or add telemetry evolution. Those are Phase 17 responsibilities. [VERIFIED: deferred boundary]
- Do not treat hooks as callable dependencies. Preserve event-bound lifecycle semantics. [VERIFIED: D-08]
- Do not resolve ambiguity by lexical ordering, loading broader context speculatively, or combining workflows. Return exactly one minimal question. [VERIFIED: D-03]

## Common Pitfalls

### Capability inspection before workflow resolution
Even reading/scoring registry names before a single eligible workflow exists violates ORC-01 and risks lexical MCP/tool selection. Test with a prompt containing an MCP/tool-like word while the chosen workflow declares no such dependency. [VERIFIED: ORC-01, D-05]

### Explicit instruction treated as a gate bypass
Explicit instructions outrank stale capsule intent but do not override missing design approval, terminal completion, dependency safety, or milestone gates. Build separate fixtures for override and bypass attempts. [VERIFIED: D-02/D-04]

### Input-order-dependent blocker reporting
Object/array input order can make the reported blocker unstable. Canonicalize roots and dependency edges before traversal and assert permutation invariance. [VERIFIED: D-06; repository stable-order conventions]

### Hook leakage into invokable closure
Registry dependency traversal may encounter hook records. Keep lifecycle bindings in a separate output field and assert they never occur in `invokable_capabilities`. [VERIFIED: D-08]

### Required context silently truncated
Byte slicing can preserve syntax while removing semantics. Required overflow blocks the context plan; only optional sources may be omitted. [VERIFIED: D-10]

### Cache reuse on partial identity
A matching path or witness is insufficient. Require identity + witness + contract version and expose the miss reason. [VERIFIED: D-12]

### Byte accounting on noncanonical values
Property order and Unicode encoding can create unstable reports. Stable-stringify first and use UTF-8 byte length, with test fixtures for reordered keys and multibyte text. [VERIFIED: repository canonicalization convention; test recommendation]

### Phase-boundary creep
Avoid modifying `install-router.mjs`, the live router hook, calibration tasks, or evolution modules in Phase 16. The deliverable is policy/control-plane behavior and focused tests. [VERIFIED: Phase 17 boundary]

## Code Examples

### Non-dispatchable tie

```js
{
  status: 'clarification_required',
  dispatch_eligible: false,
  reason_code: 'material_transition_tie',
  clarification: 'Continue implementation or verify the completed work?'
}
```

[ASSUMED: field/reason names; semantics verified by D-03]

### Dependency blocker

```js
{
  status: 'blocked',
  dispatch_eligible: false,
  reason_code: 'dependency_unavailable',
  blocker: { kind: 'mcp', canonical_id: 'mcp:example' },
  closure: []
}
```

[ASSUMED: field/reason names; semantics verified by D-06]

### Budget contract

```js
{
  workflow_id: 'gsd.execute-phase',
  total_max_bytes: 12288,
  sources: [
    { class: 'transition_facts', required: true, max_bytes: 2048, priority: 10 },
    { class: 'dependency_facts', required: true, max_bytes: 2048, priority: 20 },
    { class: 'artifact_summary', required: true, max_bytes: 6144, priority: 30 },
    { class: 'diagnostic', required: false, max_bytes: 2048, priority: 40 }
  ]
}
```

[RESOLVED: canonical Phase 16 maximum ceilings selected under D-09/D-10 discretion; workflows may declare stricter limits]

## Validation Architecture

Nyquist validation is enabled because `.planning/config.json` does not explicitly disable `workflow.nyquist_validation`. [VERIFIED: `.planning/config.json`]

### Test Infrastructure

The repository uses Node ESM test files under `tests/` and the built-in `node --test` runner. Focused Phase 16 tests should remain standard-library-only and follow existing deterministic, JSON-outcome, and negative-case patterns. [VERIFIED: codebase]

### Requirement-to-Test Map

| Requirement | Behavioral proof | Primary test |
|-------------|------------------|--------------|
| ORC-01 | Registry/capability access cannot affect the result before one workflow is selected; tied/invalid transitions remain non-dispatchable. | `tests/router.workflow-orchestrator.test.mjs` |
| ORC-01 | MCP/tool lexical coincidence never seeds selection; explicit incompatible capability does not switch workflows. | `tests/router.workflow-orchestrator.test.mjs` |
| TOK-01 | Default plans reject/omit full manifest, planning tree, conversation history, and design body source classes. | `tests/router.context-budget.test.mjs` |
| TOK-02 | Per-source and total ceilings are enforced; required overflow blocks and optional overflow omits deterministically. | `tests/router.context-budget.test.mjs` |
| TOK-02 | Summary reuse requires exact identity+witness+contract version; changed witness/version is a reported miss. | `tests/router.context-budget.test.mjs` |
| TOK-02 | Canonical byte/token accounting and regression deltas are stable across object ordering and repeated runs. | `tests/router.context-budget.test.mjs` |

### Wave 0 Recommendations

No framework installation or shared fixture framework is missing. [VERIFIED: existing `node:test` suite]

Create the two approved test files before implementation: `tests/router.workflow-orchestrator.test.mjs` and `tests/router.context-budget.test.mjs`. Add small local fixture builders for Phase 15 outcomes, workflow policies, canonical registry records, workflow context contracts, and summary descriptors. [VERIFIED: approved implementation plan; fixture-builder detail is a recommendation]

The initial failing matrix should cover:

1. Every locked D-01–D-13 decision at least once. [VERIFIED: `16-CONTEXT.md`]
2. Permuted transition/dependency/source input orders produce byte-equivalent outcomes. [VERIFIED: stable-order repository convention]
3. Terminal, gated, ambiguous, stale, unsafe, unavailable, cyclic, and missing-dependency negatives remain non-dispatchable. [VERIFIED: Phase 15 conventions and D-02–D-06]
4. Forbidden broad context source classes cannot enter a default plan. [VERIFIED: TOK-01]
5. UTF-8 multibyte byte estimation, exact-ceiling cases, required-overflow-by-one, and optional-overflow-by-one. [ASSUMED: recommended boundary fixtures]
6. Reuse hit plus identity, witness, and contract-version miss cases. [VERIFIED: D-12]

### Verification Commands

```bash
node --test tests/router.workflow-orchestrator.test.mjs
node --test tests/router.context-budget.test.mjs
node --test tests/router.context-*.test.mjs tests/router.workflow-orchestrator.test.mjs
node --test tests/*.test.mjs
git diff --check
```

[VERIFIED: repository test runner and approved focused test names]

### Phase Completion Evidence

Verification should include focused test output, full-suite output, a requirement-to-test mapping, and inspection proving Phase 16 did not modify live hook/deployment or evolution surfaces. Passing tests alone should not replace the independent Phase 16 verifier and phase-completion workflow. [VERIFIED: repository GSD completion convention and Phase 17 boundary]

## Recommended Plan Decomposition

### Plan 16-01 — Workflow Transition Policy

Create `transitions.mjs` and the workflow test matrix. Deliver canonical states, valid transitions, gate and terminal checks, explicit-instruction precedence, stable invalid reasons, and exactly-one clarification outcomes. This plan must not import or inspect registry capabilities. [VERIFIED: approved Plan 16-01 and D-01–D-04]

### Plan 16-02 — Capability and Dependency Selection

Create `select.mjs` after Plan 16-01. Require a dispatch-eligible workflow token, select declared owners, validate compatible explicit narrowing, compute stable transitive closure, separate lifecycle hooks, and return first stable safety/availability blocker. [VERIFIED: approved Plan 16-02 and D-05–D-08]

### Plan 16-03 — Least-Sufficient Context Contracts

Create `budget.mjs` and its focused tests after the workflow outcome contract is stable. Implement source allowlists, ceilings, required/optional ordering, exact summary reuse, versioned byte/token estimates, omission/block reports, and regression deltas. Keep the module pure and leave persistence/hot-path compilation to Phase 17. [VERIFIED: approved Plan 16-03 and D-09–D-13]

## Open Questions (RESOLVED)

- **Canonical IDs:** Workflow and state IDs use lowercase ASCII kebab-case matching `^[a-z][a-z0-9-]{0,63}$`. Transition records carry an explicit stable ID shaped as `<workflow-id>:<from-state>-><to-state>`; IDs are policy data, never derived from prompt text or display labels. The initial policy must define and test the five required families `brainstorm-design`, `gsd-phase`, `execution-resume`, `verification-gap`, and `milestone-closeout`. Canonical ordering is workflow ID, then transition ID by code-point order. Executors may choose more precise state names within this grammar, but tests must lock every shipped ID, meaning, and ordering before implementation is accepted. [RESOLVED: bounded executor discretion under D-01/D-04]
- **Estimator interpretation:** The Phase 16 estimator is exactly `utf8-bytes-v1-ceil-div-3`, computed as `Math.ceil(Buffer.byteLength(canonicalBytes, 'utf8') / 3)`. It is a conservative routing-context budget estimate only, not provider tokenizer output, API usage, or billing parity. Reports must always include estimator version, canonical byte count, and estimated token count so a later formula change requires a new version and explicit regression comparison. [RESOLVED: enforceable policy under D-11]
- **Exact byte ceilings:** The canonical Phase 16 default contract is `transition_facts=2048`, `dependency_facts=2048`, `artifact_summary=6144`, and optional `diagnostic=2048` bytes, with `total_max_bytes=12288`. All values count canonical UTF-8 bytes. A workflow may declare stricter positive-integer ceilings, but may not exceed these phase maxima without a later versioned policy change and regression evidence. Tests must cover each exact ceiling plus required-overflow-by-one and optional-overflow-by-one. These are routing-plan descriptor budgets; they do not authorize loading full source bodies. [RESOLVED: enforceable bounded defaults under D-09/D-10]

## Sources

### Primary repository sources

- `.planning/phases/16-workflow-first-orchestration-and-context-budgets/16-CONTEXT.md` — locked decisions and boundary. [VERIFIED: codebase]
- `.planning/ROADMAP.md` Phase 16 and `.planning/REQUIREMENTS.md` ORC-01/TOK-01/TOK-02 — authoritative scope and acceptance. [VERIFIED: codebase]
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — approved architecture and routing/context constraints. [VERIFIED: codebase]
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` Phase 16 — approved files and work packages. [VERIFIED: codebase]
- `.planning/phases/15-context-capsules-and-workflow-state-recovery/15-CONTEXT.md` and `15-VERIFICATION.md` — direct dependency contracts and verified behavior. [VERIFIED: codebase]
- `src/context/{capsule,sources,resolve}.mjs`, `src/registry/{schema,map}.mjs`, and existing tests — reusable APIs and repository conventions. [VERIFIED: codebase]

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Approved plan and repository agree on Node ESM, `node:test`, and standard-library-only modules. [VERIFIED: codebase] |
| Architecture | HIGH | D-01–D-13 and approved design prescribe ordering, boundaries, and named modules. [VERIFIED: codebase] |
| Integration | HIGH | Phase 15 interfaces and registry fields already exist and are verified. [VERIFIED: codebase] |
| Token estimator constant | HIGH | The versioned conservative routing-budget formula is now an enforceable Phase 16 policy and explicitly does not claim provider-token or billing parity. [RESOLVED] |
| Pitfalls and validation | HIGH | Negative guarantees map directly to requirements and locked decisions. [VERIFIED: codebase] |
