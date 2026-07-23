---
phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
reviewed: 2026-07-22T00:00:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - src/orchestrator/workflow-declarations.json
  - src/prompt/compile-index.mjs
  - src/prompt/publish-index.mjs
  - src/lifecycle/router-lifecycle.mjs
  - src/context/prompt-route.mjs
  - src/release/run-release.mjs
  - release/v1.2-matrix.json
  - tests/router.compiled-index.schema2.test.mjs
  - tests/router.publish-index.orchestrator.test.mjs
  - tests/router.modulenames.orchestrator.test.mjs
  - tests/router.prompt-route.baked-sibling.test.mjs
  - tests/router.compiled-index.test.mjs
  - tests/router.compiled-evolution.test.mjs
  - tests/router.context-prompt-integration.test.mjs
  - tests/router.lifecycle-recovery.test.mjs
  - tests/router.registry-watcher.test.mjs
  - tests/helpers/latency-isolated.mjs
  - tests/router.autonomous-lifecycle.test.mjs
  - tests/router.test-mode-seam.test.mjs
  - tests/router.v12-release.test.mjs
findings:
  critical: 0
  warning: 4
  info: 4
  total: 8
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-07-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 19 wires the Phase 16 orchestrator modules (`selectCapabilities` / `selectWorkflow` / `nextValidTransitions` / `planContextLoad`) into the publish→route path, bumps the compiled-index schema 1→2, adds three sibling tuple files (closure/budget/summary-index) with hash verification, extends the lifecycle bundle `moduleNames` with four orchestrator entries, and adds a per-label secondary evidence schema for the release matrix.

The fail-closed verification surface (`verifyTuple` hash-checking every sibling against the manifest, `compatible()` rejecting schema-1 tuples, empty-mapping publish throwing) is solid, and the test coverage of the new contracts is genuinely thorough — the schema-2 rejection, sibling tamper, pointer-bump, blocked-budget hot-path, and D-09 live-path E2E are all exercised. The D-08 isolation (no `src/orchestrator/*` imports from the hook-reachable `compile-index.mjs`/`prompt-route.mjs`) is preserved and statically asserted.

The dominant concern is a latent data-integrity bug in the publish-time orchestrator wiring: the evidence fed to `nextValidTransitions` is hardcoded with `position.state: 'planned'`, which matches exactly one transition (`gsd.execute`, `workflow_id: 'gsd-execute-phase'`). For any other `gsd-*` workflow_id that appears in a mapping, the orchestrator silently selects the `gsd.execute` transition and bakes `gsd-execute-phase`'s `selected_transition` and closure under the route's workflow_id key. v1 only wires `gsd-execute-phase`, so the bug is latent — but the code is incorrect for v2 and is not documented as a known limitation.

No Critical issues found. Four Warnings (one latent data-integrity bug, one silent sibling-size failure mode, one unbounded recovery read, one closure-reason leak into the budget sibling) and four Info items (misleading test messages, minor validation laxity).

## Warnings

### WR-01: Hardcoded orchestrator evidence selects the wrong transition for non-`gsd-execute-phase` workflows

**File:** `src/prompt/publish-index.mjs:87-92`
**Issue:** The per-workflow orchestrator sequence constructs evidence with `position.state: 'planned'` hardcoded for every route:

```js
const family = workflowId.includes('-') ? workflowId.slice(0, workflowId.indexOf('-')) : workflowId;
const evidence = {
  status: 'active', freshness: 'fresh',
  position: { family, state: 'planned' },
  gates: { plan_approved: true }, dependencies_safe: true,
};
```

In `src/orchestrator/transitions.mjs:14`, the only transition with `from: 'planned'` is `gsd.execute` (`workflow_id: 'gsd-execute-phase'`). For any other `gsd-*` workflow_id in the mapping (e.g. `gsd-discuss-phase`, `gsd-plan-phase`, `gsd-verify-work`, `gsd-resume-work`, `gsd-complete-milestone`), `nextValidTransitions` matches the same `gsd.execute` transition (family `'gsd'` is shared by all `gsd-*` ids), `selectWorkflow` selects it, and the resulting `selected.selection.workflow_id === 'gsd-execute-phase'` — not the route's workflow_id. `selectCapabilities` then looks up the declaration for `gsd-execute-phase` (via `token.workflow_id`) and resolves the closure for `router/executor` + `router/execute-command`. The result is baked into `closureByWorkflow[workflowId]` under the original route key, so e.g. `closureByWorkflow['gsd-discuss-phase'].selected_transition.workflow_id === 'gsd-execute-phase'` and the closure array contains `gsd-execute-phase`'s capabilities — semantically wrong data attributed to `gsd-discuss-phase`.

In v1 this is latent because mappings only use `gsd-execute-phase` (and tests that use synthetic ids like `'alpha'` produce `no_valid_transition` because family `'alpha'` matches nothing). But the code is incorrect, the limitation is not documented in the phase context, and v2 will silently bake mismatched closure data when it wires more workflows. The `family` extraction is also wrong for workflows whose transition family doesn't match the prefix before the first `-` (e.g. `brainstorming` → family `'brainstorming'`, but `brainstorm.approve-design` has family `'brainstorm'`; `writing-plans` → family `'writing'`, but the `writing-plans` transition has family `'brainstorm'`).

**Fix:** Drive the evidence from the workflow's own declaration instead of a hardcoded state. Either look up the declaration first and use its declared `family` + a real `from` state, or filter `WORKFLOW_TRANSITIONS` by `workflow_id === workflowId` (not by family+state) so a route can only select its own transition. At minimum, after `selectWorkflow`, assert `selected.selection.workflow_id === workflowId` and skip-to-blocked on mismatch so no cross-workflow data is ever baked:

```js
const selected = selectWorkflow(transitionResult, undefined);
if (selected.status !== 'selected' || selected.selection.workflow_id !== workflowId) {
  closureByWorkflow[workflowId] = {
    selected_transition: null, candidates: transitionResult.candidates, closure: [],
    invokable_capabilities: [], required_models: [], required_permissions: [],
    lifecycle_bindings: [], dispatch_eligible: false,
    reason_code: selected.status !== 'selected' ? selected.reason_code : 'transition_workflow_mismatch',
  };
  budgetByWorkflow[workflowId] = { report: null, dispatch_eligible: false, reason_code: 'transition_workflow_mismatch' };
  summaryIndexByWorkflow[workflowId] = null;
  continue;
}
```

### WR-02: Sibling size limits enforced at read but not at write — publish fails with opaque `tuple_validation_failed`

**File:** `src/prompt/compile-index.mjs:27-30, 138-140` and `src/prompt/publish-index.mjs:186-205`
**Issue:** `COMPILED_INDEX_LIMITS` defines `closure_bytes: 64 * 1024`, `budget_bytes: 32 * 1024`, `summary_index_bytes: 16 * 1024`. `verifyTuple` enforces these via `boundedJson` and rejects the tuple when any sibling exceeds its bound. `publishCompiledIndex` writes the siblings via `durableWrite` without checking the byte length, then calls `loadCompiledIndex` at the end and throws `tuple_validation_failed` if verification fails. When a registry's closure grows past 64 KB (plausible for a registry with many records and rich provenance), the publish throws `tuple_validation_failed` with no indication that `closure.json` exceeded `closure_bytes`. The fail-closed behavior is correct; the diagnostics are not — an operator cannot distinguish sibling-overflow from a real tamper bug.

**Fix:** Check the byte length before `durableWrite` and throw a typed error naming the offending sibling:

```js
const closureBytes = json({ schema_version: 1, by_workflow: closureByWorkflow });
if (Buffer.byteLength(closureBytes) > COMPILED_INDEX_LIMITS.closure_bytes) {
  throw new RangeError(`closure.json exceeds closure_bytes limit (${Buffer.byteLength(closureBytes)} > ${COMPILED_INDEX_LIMITS.closure_bytes})`);
}
// repeat for budgetBytes / summaryIndexBytes
```

(Import `COMPILED_INDEX_LIMITS` from `./compile-index.mjs` alongside the existing `COMPILED_INDEX_COMPATIBILITY`/`COMPILED_INDEX_SCHEMA_VERSION` imports.)

### WR-03: `recoverReleaseTuple` reads `known-good.json` with unbounded `readFileSync`

**File:** `src/prompt/publish-index.mjs:49`
**Issue:** `loadCompiledIndex` disciplines every sibling read through `boundedJson` (size-capped, `O_NOFOLLOW`, `contained()` traversal check). `recoverReleaseTuple` bypasses that discipline for the `known-good.json` pointer:

```js
let pointer;
try { pointer = JSON.parse(readFileSync(join(root, 'release-tuples', 'known-good.json'), 'utf8')); } catch { pointer = null; }
```

`readFileSync` is unbounded and follows symlinks. The file is normally a tiny pointer written by `replacePointer`, but the recovery path runs against the same on-disk state an attacker with write access to the owned root could tamper with. A hostile `known-good.json` (or a symlink target) of arbitrary size would be read into memory and JSON-parsed before `loadCompiledIndex({ releaseTuplePointer: pointer })` re-validates it. Low-likelihood (recovery path, trusted root), but inconsistent with the bounded-I/O discipline everywhere else in this module.

**Fix:** Read through `boundedJson` with `COMPILED_INDEX_LIMITS.pointer_bytes` (4 KB), matching how `loadCompiledIndex` reads the same file. Either export a small helper from `compile-index.mjs` or inline the same `openSync`/`fstatSync`/`readSync` pattern.

### WR-04: Closure-stage `reason_code` is leaked into the budget sibling, misattributing the block on the hot path

**File:** `src/prompt/publish-index.mjs:94-127`
**Issue:** When `nextValidTransitions`, `selectWorkflow`, or `selectCapabilities` blocks, the code writes the same `transitionResult.reason_code` / `selected.reason_code` / `closureResult.reason_code` into BOTH `closureByWorkflow[workflowId].reason_code` AND `budgetByWorkflow[workflowId].reason_code`:

```js
if (transitionResult.status !== 'candidates_available') {
  ...
  budgetByWorkflow[workflowId] = { report: null, dispatch_eligible: false, reason_code: transitionResult.reason_code };
  ...
}
```

The hot-path gate in `src/context/prompt-route.mjs:117-123` synthesizes a blocked resolution using `bakedBudget.reason_code`:

```js
if (resolution.dispatch_eligible && projection && bakedBudget && bakedBudget.dispatch_eligible === false) {
  const blockedResolution = {
    ...,
    reason_code: bakedBudget.reason_code || 'required_context_overflow',
    ...
```

So when closure blocks (e.g. `dependency_missing`), the route path reports `reason_code: 'dependency_missing'` as a *budget* reason. A caller inspecting telemetry sees a budget-block attributed to a missing dependency, which is a closure concern. The same applies to `no_valid_transition` / `workflow_declaration_invalid` / `workflow_not_dispatch_eligible` — none of these are budget-stage reasons but they are surfaced under the budget gate. This corrupts the diagnostic story and makes TOK-02 telemetry misleading.

**Fix:** Give the budget sibling a distinct reason when the upstream stage blocked:

```js
if (transitionResult.status !== 'candidates_available') {
  ...
  budgetByWorkflow[workflowId] = { report: null, dispatch_eligible: false, reason_code: 'upstream_transition_blocked' };
  ...
}
// similarly for the selectWorkflow and selectCapabilities blocked branches
```

Or have the hot-path gate prefer `closure.reason_code` when the closure is the blocked stage.

## Info

### IN-01: Misleading assertion message in D-09 E2E test

**File:** `tests/router.autonomous-lifecycle.test.mjs:198`
**Issue:** The assertion message says `v1 budget blocks (required_source_class_missing); v2 will flip dispatch_eligible, true`, but the published workflow_id is `'alpha'` (from `artifact('alpha')`), which is not in `workflow-declarations.json`. The orchestrator path blocks at `nextValidTransitions` with `no_valid_transition` (family `'alpha'` matches no transition), not at `planContextLoad` with `required_source_class_missing`. The assertion only checks `dispatch_eligible === false`, so it passes, but the message and the v2-flip commentary describe a different code path than the one exercised.

**Fix:** Either update the message to reflect the actual reason (`no_valid_transition` for non-declared workflows), or seed a `gsd-execute-phase` route in this test so the documented `required_source_class_missing` path is actually the one that blocks.

### IN-02: `phase-19-live-path` validation accepts `phase >= 18`, not `phase === 19`

**File:** `src/release/run-release.mjs:87`
**Issue:** The label name is `phase-19-live-path` but the validator only requires `Number.isInteger(secondary.phase) || secondary.phase < 18` to throw — i.e. it accepts 18, 19, 20, … . A `phase-19-live-path` entry with `phase: 18` would pass. The label name and the phase field are decoupled. Minor, but a tampered or fat-fingered matrix would not be caught here.

**Fix:** Tighten to `secondary.phase !== 19` for the `phase-19-live-path` label, or rename the validation intent to "phase at least 18" if cross-phase evidence is expected.

### IN-03: Legacy compiled-index path bypasses the TOK-02 budget gate (documented)

**File:** `src/context/prompt-route.mjs:116-124`
**Issue:** When `loadCompiledIndex` resolves via the legacy `verifyVersion` path (no tuple siblings), the return has no `budget` key. `bakedBudget` is `undefined`, so the `dispatch_eligible && projection && bakedBudget && bakedBudget.dispatch_eligible === false` gate is skipped and a dispatch-eligible resolution proceeds without the budget check. The `?? null` fallback is documented as a legacy defense, but the security implication (pre-Phase-19 tuples skip the budget gate entirely) is not called out. Acceptable as a deliberate transitional behavior, but worth a code comment so the bypass is explicit rather than implicit.

**Fix:** Add a one-line comment at the `bakedBudget` guard noting that legacy tuples without a budget sibling intentionally skip the TOK-02 gate (and that this is removed once all installs have a Phase-19 tuple).

### IN-04: `routeFor` will throw on a record missing `invocation`

**File:** `src/prompt/publish-index.mjs:30-42`
**Issue:** `routeFor` dereferences `record.invocation.command` unconditionally. A registry record without an `invocation` object (e.g. a malformed or partial record that nonetheless matched `subject.target_id` via `id`/`canonical_identity`/`name`) would throw a `TypeError` at publish time. The throw happens before any `durableWrite`, so there is no on-disk corruption, but the error message is opaque and doesn't identify which record was malformed. The registry is assumed well-formed because it comes from `buildFullRegistry`, so this is a robustness nit, not a live bug.

**Fix:** Guard with `record.invocation?.command` and throw a typed error naming the offending `target_id` when missing, so a future registry shape change fails with an actionable diagnostic.

---

_Reviewed: 2026-07-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_