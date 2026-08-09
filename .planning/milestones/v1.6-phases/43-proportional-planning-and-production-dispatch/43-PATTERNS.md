# Phase 43: Proportional Planning and Production Dispatch - Pattern Map

**Mapped:** 2026-08-08  
**Files analyzed:** 4 likely new files; 3 existing integration files reviewed  
**Analogs found:** 4 / 4 likely files (role/data-flow analogs; no exact strategy evaluator exists)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/orchestrator/strategy.mjs` | utility / planner | transform, request-response | `src/orchestrator/budget.mjs` (`planContextLoad`) | role-match, strongest |
| `src/orchestrator/strategy.mjs` replan seam | utility / planner | event-driven state transition | `src/lease/store.mjs` (`claimCheckpoint`, `mutate`) | partial |
| `tests/phase-43/strategy.test.mjs` | test | request-response / transform | `tests/phase-38/native-dispatch.test.mjs` | role-match |
| `tests/phase-43/replan.test.mjs` | test | event-driven / checkpoint | `tests/phase-38/native-dispatch.test.mjs` + lease tests | role-match |
| `src/lease/store.mjs` (only if integration is needed) | storage | CRUD / checkpoint I/O | existing `claimCheckpoint` and `mutate` | exact role |
| `src/adapters/dispatch/contract.mjs` or runtime adapter (only if integration is needed) | dispatch contract | request-response / process streaming | `preDispatchGate`, `createDispatchAdapter` | exact role |

The context contains no locked file list. Research explicitly identifies a new pure `planStrategy`/`replanStrategy` seam and two Wave 0 test files; planner should avoid creating extra persistence or adapter abstractions unless the integration tests prove they are needed.

## Pattern Assignments

### `src/orchestrator/strategy.mjs` (utility/planner, transform and request-response)

**Analog:** `src/orchestrator/budget.mjs`

**Imports and pure JSON-ready seam** (`src/orchestrator/budget.mjs:1-4,127-138`):

```js
import { stableStringify } from '../registry/schema.mjs';

export const ESTIMATOR_VERSION = 'utf8-bytes-v1-ceil-div-3';
export const CONTEXT_CONTRACT_VERSION = 'workflow-context-contract-v1';

/**
 * Produce a deterministic JSON-ready load plan from already-resolved workflow,
 * closure, contract, and bounded descriptors. This function performs no I/O.
 */
export function planContextLoad(options = {}) {
  const token = workflowToken(options.workflow);
  if (!token) return blocked('workflow_not_dispatch_eligible');
  if (!safeClosure(options.closure, token)) return blocked('dependency_closure_not_dispatch_eligible');
```

Copy the conventions: ESM, Node built-ins/existing local helpers only, explicit options object, no prompt parsing or I/O, stable JSON output, version constants, and `{ status: 'blocked', dispatch_eligible: false, reason_code, ...facts }` for failures.

**Validation and hard-gate ordering** (`src/orchestrator/budget.mjs:46-68,131-161`):

```js
export function validateContextContract(contract) {
  if (!contract || typeof contract !== 'object' || !validId(contract.workflow_id)) {
    return { valid: false, reason_code: 'context_contract_invalid' };
  }
  if (!positiveInteger(contract.total_max_bytes)) return { valid: false, reason_code: 'total_budget_invalid' };
  // ...validate every bounded source before planning...
  return { valid: true, reason_code: 'context_contract_valid' };
}

const validation = validateContextContract(options.contract);
if (!validation.valid) return blocked(validation.reason_code);
```

For Phase 43, validate workflow identity, task identities, dependency references, hard safety/correctness/quality constraints, and finite resource descriptors before comparing strategy costs. Direct execution should be the default for one safe work item. Return ordered work, dependency edges, selected strategy kind, hard-constraint evidence, resource limits, and an inspectable cost report.

**Dependency and capability inputs** (`src/orchestrator/select.mjs:63-139`):

```js
export function resolveDependencies({ roots = [], registry, requestedScope } = {}) {
  if (!registry || !Array.isArray(registry.records)) return blocked('registry_invalid', { closure: [] });
  // ...cycle, missing, unavailable, unsafe, scope, permission, and conflict checks...
  return {
    status: 'resolved', dispatch_eligible: true, reason_code: 'dependency_closure_safe',
    closure: canonical.map(facts),
    invokable_capabilities: canonical.filter(record => !['hook', 'model', 'permission'].includes(record.type)).map(facts),
  };
}
```

Consume `resolveDependencies`/`selectCapabilities` results; do not add a second graph walker, capability system, or fixed agent-count heuristic. Preserve deterministic sorting and reason codes.

### `src/orchestrator/strategy.mjs` replan transition (utility, event-driven)

**Analog:** `src/lease/store.mjs`

**Durable mutation/checkpoint pattern** (`src/lease/store.mjs:197-221,267-278`):

```js
function claimCheckpoint(leaseId, actionId) {
  if (!actionId) return { claimed: true, changed: false, reason: 'no_op' };
  if (!leaseId) return { claimed: true, changed: false, reason: 'no_lease' };
  return mutate(leaseId, (lease) => {
    if (!Array.isArray(lease.claimed_actions)) lease.claimed_actions = [];
    if (lease.claimed_actions.includes(actionId)) {
      return { changed: false, data: { claimed: false, changed: false, reason: 'already_claimed' } };
    }
    lease.claimed_actions.push(actionId);
    return { changed: true, data: { claimed: true, changed: true } };
  });
}
```

`replanStrategy` should remain pure if possible: accept the current strategy plus failure/resource evidence, allow exactly one transition, preserve completed independent work, replace only unfinished safe work, and return a terminal blocked result on a second replan. If durable state must be extended, reuse `createLeaseStore().mutate` and `claimed_actions`; do not create an in-memory retry counter as the authority.

### Production dispatch integration (modified only if required)

**Analog:** `src/adapters/dispatch/contract.mjs`

**Dispatch-time safety boundary** (`src/adapters/dispatch/contract.mjs:248-310`):

```js
export function preDispatchGate(action, adapter, context) {
  // ...dependency availability and permission/effect checks...
  if (!Number.isInteger(action?.timeout) || action.timeout <= 0) {
    return { ok: false, reason: 'missing_timeout' };
  }
  if (!action?.output_bounds || typeof action.output_bounds !== 'object') {
    return { ok: false, reason: 'missing_output_bounds' };
  }
  if (!action?.completion_contract || typeof action.completion_contract !== 'object') {
    return { ok: false, reason: 'missing_completion_contract' };
  }
  return { ok: true };
}
```

Strategy output cannot widen authority or replace dispatch validation. Keep `validateInvocation` and `preDispatchGate` immediately before spawn. Runtime adapters already return recommendation-only/blocked receipts for invalid or unavailable actions (`src/adapters/dispatch/claude.mjs:275-297`); preserve that behavior.

### `tests/phase-43/strategy.test.mjs` (test, deterministic transform)

**Analog:** `tests/phase-38/native-dispatch.test.mjs`

**Imports/isolation/assertion style** (`tests/phase-38/native-dispatch.test.mjs:13-27,44-83`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('...', () => {
  const result = planStrategy(/* explicit fixture */);
  assert.equal(result.status, 'planned');
  assert.equal(result.strategy.kind, 'direct');
});
```

Use built-in `node:test`, strict assertions, explicit fixtures, and one test per STRAT requirement. Verify direct/no-child selection, deterministic ordering, hard constraints beating lower cost, and bounded resource reporting. No new test framework or broad fixture factory.

### `tests/phase-43/replan.test.mjs` (test, event/checkpoint behavior)

**Analogs:** `tests/phase-38/native-dispatch.test.mjs:86-142` and lease checkpoint behavior (`src/lease/store.mjs:210-220`).

Use `mkdtempSync(join(tmpdir(), 'router-43-...'))` with `try/finally` and `rmSync(..., { recursive: true, force: true })` when exercising the real lease store. Assert that completed independent work remains present, only unfinished safe work is replanned, the first evidence-backed replan is accepted, and the second attempt is `blocked` with a reason code. Test checkpoint persistence by reading the store again, not only by checking an in-memory object.

## Shared Patterns

### Determinism and explainability

**Sources:** `src/orchestrator/select.mjs:20-32,117-139`, `src/orchestrator/budget.mjs:163-210`  
**Apply to:** strategy planner and both test files.

Canonicalize IDs, sort by stable semantic order then ID, and expose `reason_code`, measured facts, constraints, and cost fields. Never use prompt text, wall-clock randomness, LLM scoring, or uncalibrated historical learning. Phase 45 owns calibrated learning.

### Hard constraints before cost

**Sources:** `src/orchestrator/budget.mjs:136-161,171-186`, `src/adapters/dispatch/contract.mjs:265-310`  
**Apply to:** planner and dispatch integration.

Reject unsafe, incorrect, insufficient-quality, unavailable, out-of-scope, or over-bound candidates before comparing expected time/tokens/calls/retries/failures/coordination cost. Re-check invocation authority, path, runtime, timeout, retry, output, and completion contracts at dispatch time.

### Durable safe resume

**Sources:** `src/lease/store.mjs:43-53,197-235`, `src/adapters/dispatch/claude.mjs:425-453`  
**Apply to:** replan/resume integration.

Use lease-scoped durable claims as the at-most-once primitive. A missing/blocked claim must not permit a re-spawn; preserve completed checkpoints across restart and do not release the authoritative durable claim during controlled resume.

### Receipt/file I/O boundary

**Source:** `src/adapters/dispatch/receipt.mjs:71-117`  
**Apply to:** any production dispatch modification.

Reuse atomic temp+rename publication and fail-open `read()`/append conventions. Do not store raw prompts, secrets, environment, or file contents; Phase 44 owns richer causal receipt attribution.

## No Exact Analog Found

| File / Symbol | Role | Data Flow | Gap |
|---|---|---|---|
| `src/orchestrator/strategy.mjs` / `planStrategy()` | planner utility | transform | No existing proportional strategy evaluator or cost comparison seam. |
| `src/orchestrator/strategy.mjs` / `replanStrategy()` | planner state transition | event-driven | Existing lease checkpoints provide persistence, but no one-replan policy exists. |
| `tests/phase-43/strategy.test.mjs` | test | transform | New focused coverage required by RESEARCH.md. |
| `tests/phase-43/replan.test.mjs` | test | event-driven/checkpoint | New focused coverage required by RESEARCH.md. |

## Metadata

**Analog search scope:** `.planning/`, `src/orchestrator/`, `src/lease/`, `src/adapters/dispatch/`, `src/registry/`, `tests/phase-38/`, adjacent `tests/` integration suites, `README.md`, and milestone design docs.  
**Files scanned:** 11 primary analog/source/test files plus planning/docs references.  
**Pattern extraction date:** 2026-08-08
