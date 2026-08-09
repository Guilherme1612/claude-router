# Phase 43: Proportional Planning and Production Dispatch - Research

**Researched:** 2026-08-08
**Domain:** Deterministic strategy selection and bounded native dispatch
**Confidence:** MEDIUM

## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at the agent's discretion. Use the ROADMAP goal, success criteria, and existing codebase conventions to guide decisions.

### the agent's Discretion
All implementation choices are at the agent's discretion. Use the ROADMAP goal, success criteria, and existing codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STRAT-01 | A small single-path correction uses no child agents unless measured specialist value is required for correctness or verification. | Add a deterministic direct strategy for one safe path; existing agent recommendations are only candidates, not proof of need. |
| STRAT-02 | A larger task selects sequential work, parallel work, specialists, or compositions from explicit dependencies, verification needs, capability fit, risk, and coordination cost rather than a fixed agent count. | Reuse resolved dependency closures and capability eligibility as inputs to a bounded strategy evaluator. |
| STRAT-03 | Strategy selection treats safety and correctness as hard constraints, then required outcome quality, and optimizes total expected time, tokens, calls, retries, failures, and coordination cost only inside those constraints. | Keep planning separate from dispatch; trust and permission gates remain mandatory at dispatch time. |
| STRAT-04 | Resource exhaustion or repeated failure permits one evidence-backed replan before blocking, while completed independent dependencies remain checkpointed and only unfinished safe work can resume. | Reuse durable lease claims/checkpoints and encode a single replan transition with explicit evidence and terminal block. |

## Summary

Phase 43 should add the smallest deterministic planning seam that converts an already-authorized, semantically compiled workflow into a strategy contract, then passes that contract to the existing native adapter path. [VERIFIED: codebase grep] The current code has deterministic dependency closure and capability selection in `src/orchestrator/select.mjs`, bounded context planning in `src/orchestrator/budget.mjs`, and dispatch-time invocation/trust validation in `src/adapters/dispatch/contract.mjs`; it does not expose a proportional strategy evaluator or replan state. [VERIFIED: codebase grep]

Use direct execution as the default for a small single-path correction. Select sequential, parallel, specialist, or composed execution only from explicit task/dependency descriptors and hard safety/correctness/quality constraints; score cost only after hard constraints pass. [CITED: .planning/ROADMAP.md; VERIFIED: codebase grep] Do not add an agent-count heuristic or a second capability/permission system.

**Primary recommendation:** Implement a pure, deterministic `planStrategy`/`replanStrategy` seam that emits an inspectable strategy and bounded resource contract, then enforce that contract through existing lease claims and dispatch gates.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Strategy selection | API / Backend | Database / Storage | Planning must evaluate structured workflow facts before invocation; durable strategy/checkpoint state may be persisted with lease state. [VERIFIED: codebase grep] |
| Dependency and capability fit | API / Backend | — | `resolveDependencies` and `selectCapabilities` already own deterministic closure and eligibility. [VERIFIED: codebase grep] |
| Native production invocation | API / Backend | — | Claude/Codex adapters own spawn, observe, pause/resume, and dispatch-time validation. [VERIFIED: codebase grep] |
| Resource bounds and resume | Database / Storage | API / Backend | Lease records expose resource bounds and claimed actions; the planner must consume them and preserve completed checkpoints. [VERIFIED: codebase grep] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-ins | project runtime | Pure planning, JSON contracts, filesystem-backed lease/checkpoint integration | Existing dispatch and lease modules are ESM and stdlib-only. [VERIFIED: codebase grep] |
| Existing `src/orchestrator/select.mjs` | repository | Dependency closure and capability selection | Already provides deterministic ordering, scope, lifecycle, permission, conflict, and availability checks. [VERIFIED: codebase grep] |
| Existing `src/orchestrator/budget.mjs` | repository | Bounded context/resource accounting | Already validates source classes, per-source maxima, total bytes, deterministic ordering, and optional omission. [VERIFIED: codebase grep] |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `src/lease/store.mjs` | Durable action claims and lease resource bounds | Every production strategy execution and resume path. [VERIFIED: codebase grep] |
| `src/adapters/dispatch/contract.mjs` | Invocation, timeout, retry, output, completion, and runtime-scope gates | Immediately before native spawn; never replace with planner checks. [VERIFIED: codebase grep] |

**Installation:** None. This phase should not install external packages. [VERIFIED: codebase grep]

## Architecture Patterns

### Strategy pipeline

```text
authorized workflow
  -> semantic selection + dependency closure
  -> task facts (size, dependencies, verification, risk, fit, bounds)
  -> hard constraint validation
       ├─ fail: blocked with reason
       └─ pass: deterministic cost comparison
              -> direct | sequential | parallel | specialist | composed plan
              -> durable action claims/checkpoints
              -> existing preDispatchGate + runtime adapter
              -> completion/failure evidence
                    ├─ success: preserve checkpoints
                    └─ exhaustion/repeated failure: one evidence-backed replan, then block
```

The planner should be pure and JSON-ready like `planContextLoad`; inputs must be explicit rather than inferred from prompt text. [VERIFIED: codebase grep] Strategy output should include a stable strategy kind, ordered work items, dependency edges, hard-constraint result, resource limits, and a reason/cost report sufficient for inspection and tests. [ASSUMED]

### Direct-first proportionality

Represent a one-path correction as one work item with no child-agent requirement. Add specialist or parallel work only when a structured fact says it is needed for correctness/verification and the candidate remains compatible, safe, scoped, and within bounds. [CITED: .planning/REQUIREMENTS.md]

### Bounded replan

Treat replanning as a state transition, not an unbounded retry loop: accept only a failure/resource observation tied to the current strategy, preserve completed independent work, invalidate or replace only unfinished safe work, increment a replan count, and block after the single allowed replan. [CITED: .planning/ROADMAP.md; VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dependency ordering and safety | A new graph walker or fixed agent-count rule | `resolveDependencies` / `selectCapabilities` | Existing code already handles cycles, missing/unavailable/unsafe/out-of-scope/conflicting nodes deterministically. [VERIFIED: codebase grep] |
| Invocation safety | Planner-only shell/path/permission checks | `validateInvocation` and `preDispatchGate` at dispatch time | The existing contract validates typed args, containment, cwd, wrappers, metacharacters, destructive targets, runtime, timeout, retry, output, and completion. [VERIFIED: codebase grep] |
| Resume idempotency | In-memory retry bookkeeping | Lease store checkpoint claims | Durable claims provide the existing at-most-once resume primitive and resource-bound fields. [VERIFIED: codebase grep] |
| Cost model with uncalibrated predictions | LLM scoring or opaque historical-success learning | Deterministic bounded descriptors and explicit conservative costs | Phase 45 owns calibrated learning; Phase 43 needs explainable planning. [CITED: .planning/ROADMAP.md; ASSUMED] |

## Common Pitfalls

### Fixed agent counts
**What goes wrong:** Small corrections pay coordination and token overhead without specialist value. **Why:** Agent recommendations in `router.mjs` are routing candidates, not a production strategy contract. **How to avoid:** direct strategy is the deterministic baseline; require explicit measured specialist value. **Warning signs:** child agents appear for one independent action or strategy changes only because a count threshold changed. [VERIFIED: codebase grep; CITED: .planning/REQUIREMENTS.md]

### Optimizing before hard gates
**What goes wrong:** A faster strategy can bypass safety, correctness, quality, scope, or resource constraints. **How to avoid:** reject invalid candidates before comparing cost. [CITED: .planning/REQUIREMENTS.md]

### Replanning as retry multiplication
**What goes wrong:** repeated failures consume unbounded calls/tokens and obscure the real block. **How to avoid:** one evidence-backed replan, then a truthful blocked result; do not reset completed claims. [CITED: .planning/ROADMAP.md]

### Dispatching from untrusted plan data
**What goes wrong:** planner output widens authority or escapes runtime/path scope. **How to avoid:** treat plan facts as untrusted input and retain existing dispatch-time validation and authority gates. [VERIFIED: codebase grep]

## Code Examples

```js
// Shape only; preserve the repository's pure JSON-ready seam style.
export function planStrategy({ workflow, closure, tasks, bounds, evidence } = {}) {
  // validate authorized workflow, closure, task identities, hard constraints
  // choose direct first, then deterministic eligible alternatives by cost
  // return { status, strategy, work, constraints, report, replan_count }
}
```

The implementation should follow `planContextLoad`'s pure-function pattern and `resolveDependencies`' deterministic sorting/reason-code pattern. [VERIFIED: codebase grep]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Lease JSON records and receipt JSON records are runtime state; lease records include claimed actions/checkpoints and resource bounds. [VERIFIED: codebase grep] | Use the existing lease/checkpoint store for strategy and replan state; extend its compatible record shape if needed, do not create a second durable store, and do not rewrite prior receipts. |
| Live service config | None identified in the requested source/config inspection. [ASSUMED] | Confirm only if production dispatch integration reveals an external orchestrator. |
| OS-registered state | Native adapter workers are launched by existing runtime hooks; no phase-43 registration was found. [VERIFIED: codebase grep] | Reuse existing adapter lifecycle. |
| Secrets/env vars | No phase-43-specific secret or environment contract found. [ASSUMED] | Keep strategy data free of secrets; use existing runtime scope. |
| Build artifacts / installed packages | No new package or artifact requirement identified. [VERIFIED: codebase grep] | No install step. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js / ESM | Existing source and targeted tests | ✓ | Not probed per bounded input rule | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` (repository tests use ESM `.mjs`). [VERIFIED: codebase grep] |
| Config file | `package.json` / existing test files; no new framework needed. [VERIFIED: codebase grep] |
| Quick run command | `node --test tests/<phase-43-test>.mjs` |
| Full suite command | Existing configured suite; not run for this research. |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STRAT-01 | One safe correction selects direct/no-child strategy | unit | `node --test tests/phase-43/strategy.test.mjs` | ❌ Wave 0 |
| STRAT-02 | Explicit dependencies and facts select deterministic strategy | unit | `node --test tests/phase-43/strategy.test.mjs` | ❌ Wave 0 |
| STRAT-03 | Unsafe/incorrect/low-quality candidates cannot win on cost | unit | `node --test tests/phase-43/strategy.test.mjs` | ❌ Wave 0 |
| STRAT-04 | One evidence-backed replan preserves completed work then blocks | unit/integration | `node --test tests/phase-43/replan.test.mjs` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] Add focused Phase 43 strategy tests.
- [ ] Add focused replan/checkpoint tests.
- [ ] Add only the smallest test fixture for task facts and resource exhaustion.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Reuse existing authority/lease resolution; planning cannot create authority. [VERIFIED: codebase grep] |
| V3 Session Management | yes | Bind plan execution to existing lease/project/runtime identity and expiry. [VERIFIED: codebase grep] |
| V4 Access Control | yes | Preserve capability permissions, scope, effect risk, and pre-dispatch gates. [VERIFIED: codebase grep] |
| V5 Input Validation | yes | Validate bounded strategy/task descriptors before planning; reuse invocation validation before spawn. [VERIFIED: codebase grep] |
| V6 Cryptography | yes | Reuse existing stable identities/fingerprints and receipt/lease mechanisms; do not invent cryptography. [VERIFIED: codebase grep] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Strategy output should be a new pure JSON-ready contract. | Architecture Patterns | Planner may target a different existing seam or require persistence. |
| A2 | No external orchestrator/service configuration is needed. | Runtime State Inventory | Production dispatch integration may require an additional owner-controlled dependency. |
| A3 | Conservative deterministic cost descriptors are sufficient before Phase 45 learning. | Don't Hand-Roll | Poor cost estimates could select a suboptimal but still safe strategy. |

## Resolved Decisions

1. Task facts use a minimal validated schema: each task has a valid bounded `id`, finite bounded non-negative `size`, `verification_need`, `specialist_value`, `quality_required`, `coordination_cost`, `risk`, `available`, `in_scope`, and `safe`/`correct` facts, plus a finite bounded resource descriptor; dependency IDs must be declared task IDs. Unknown fields, non-finite values, negative values, missing hard-constraint facts, undeclared dependency references, and values outside the declared bounds are rejected before selection or cost comparison. This keeps the contract JSON-ready and prevents callers from smuggling unbounded planner inputs.
2. Strategy and replan state use the existing lease/checkpoint store, including its durable claims and compatible lease-scoped fields. No second durable store or in-memory authority is created; completed claims remain authoritative across re-read/restart, and receipts remain unchanged.

## Sources

### Primary (HIGH confidence)
- `src/orchestrator/select.mjs` — deterministic capability/dependency closure and reason codes. [VERIFIED: codebase grep]
- `src/orchestrator/budget.mjs` — bounded deterministic planning/accounting pattern. [VERIFIED: codebase grep]
- `src/adapters/dispatch/contract.mjs` — dispatch-time invocation and contract gates. [VERIFIED: codebase grep]
- `src/lease/store.mjs` — durable claims, expiry, and checkpoint primitives. [VERIFIED: codebase grep]

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` Phase 43 — goal and success criteria. [CITED: .planning/ROADMAP.md]
- `.planning/REQUIREMENTS.md` STRAT-01..04 — requirement behavior. [CITED: .planning/REQUIREMENTS.md]
- `43-CONTEXT.md` — implementation discretion and phase boundary. [CITED: .planning/phases/43-proportional-planning-and-production-dispatch/43-CONTEXT.md]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing repository modules and stdlib patterns inspected.
- Architecture: MEDIUM — existing boundaries are clear, but Phase 43's new strategy contract is not yet implemented.
- Pitfalls: MEDIUM — requirements and adjacent safety/checkpoint implementations provide direct constraints; Phase 43 deliberately uses explicit bounded facts rather than calibrated learning.

**Research date:** 2026-08-08
**Valid until:** 2026-09-07 for repository structure; shorter if preceding phases change.
