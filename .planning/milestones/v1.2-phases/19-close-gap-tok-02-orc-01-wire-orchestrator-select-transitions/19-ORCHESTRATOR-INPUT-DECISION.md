# Phase 19 — Orchestrator-Input Sourcing Decision (Q1/Q2 Resolution)

**Authored:** 2026-07-17
**Status:** LOCKED — Plans 02, 03, 04 implement against this contract verbatim.
**Scope:** Resolves RESEARCH.md Open Questions Q1 (workflowDeclarations + evidence source) and Q2 (transition bake scope). Q3 (v1.2-matrix.json secondary entry) is resolved by Plan 04 at execution time and is NOT touched here.

This is a design-spike decision document, not production code. No file under `src/` is modified by this decision. The document records the load-bearing design choices that were left to Claude's Discretion by `19-CONTEXT.md` so that the wiring executors (Plans 02, 03, 04) can implement against a fixed contract rather than re-deciding during execution.

Per the planning context contract, decisions sourced from Claude's Discretion are flagged `[ASSUMED]` so the plan-checker and the user can surface them. Items 1, 2, and 3 below are `[ASSUMED]`. Items 4–10 are mechanical implementations of CONTEXT.md locked decisions (D-04/D-05) or security requirements (V6) and are NOT flagged `[ASSUMED]`.

---

## Decision 1 — `workflowDeclarations` source `[ASSUMED]`

**Chosen option:** A NEW static file `src/orchestrator/workflow-declarations.json` containing an array of `{ workflow_id, owners, requirements, compatible }` records, one per workflow family present in the v1.2 workflow set.

**Deployment:** The file ships in the deployed bundle via the `moduleNames` extension. Plan 03 adds `'orchestrator/workflow-declarations.json'` to the `moduleNames` array in `src/lifecycle/router-lifecycle.mjs:308-317` alongside the three D-07 `.mjs` entries (`'orchestrator/select.mjs'`, `'orchestrator/transitions.mjs'`, `'orchestrator/budget.mjs'`). The existing `moduleValues` deployment loop at `:318-320` then deploys it into both `<ownedRoot>/modules/orchestrator/workflow-declarations.json` and `<codexOwnedRoot>/modules/orchestrator/workflow-declarations.json`.

**Read path inside `publishCompiledIndex`:**

```javascript
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inside publishCompiledIndex (Plan 02 adds this):
const declarationsPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'orchestrator',
  'workflow-declarations.json'
);
const workflowDeclarations = JSON.parse(readFileSync(declarationsPath, 'utf8'));
```

This relative path resolves correctly in BOTH layouts:
- Source layout: `src/prompt/publish-index.mjs` → `src/orchestrator/workflow-declarations.json`
- Deployed layout: `modules/prompt/publish-index.mjs` → `modules/orchestrator/workflow-declarations.json`

**No new `publishCompiledIndex` parameter is added.** The watcher call site at `src/registry/watcher.mjs:338-343` is NOT extended. The declarations file is controller-owned static data, read by the publisher from its own module neighborhood.

**Rejected alternatives:**

- **(a) New `publishCompiledIndex` parameter passed by the watcher.** Rejected because it would require extending the watcher config and the watcher has no declarations source either — the declarations would still need a home, and that home would be this same static file plus a plumbing layer that adds nothing but indirection. The watcher already provides `built.registry` + `mapping`; the declarations are a static contract, not per-reconcile input.
- **(b) Derive declarations from registry records.** Rejected because grep confirms registry records carry no `owners`/`requirements`/`declarations` fields. The registry is the capability inventory; workflow ownership is a separate concern that lives in `WORKFLOW_TRANSITIONS` (`src/orchestrator/transitions.mjs:9-19`) and the static declarations file — not in the registry.

**Threat surface (T-19-02):** The static declarations file is controller-owned (deployed via `moduleNames` into `ownedRoot/modules/`). The controller process is the trusted publisher. Tampering would require controller compromise, at which point the attacker already controls publication. The bundled file is verified by the existing `installRouter` integrity path. Disposition: `accept` (per the plan's `<threat_model>`).

---

## Decision 2 — Per-workflow `evidence` shape `[ASSUMED]`

**Chosen shape:** At publish time, for each mapped subject whose `subject.subject_id` becomes the `workflow_id`, `publishCompiledIndex` constructs synthetic evidence:

```javascript
{
  status: 'active',
  freshness: 'fresh',
  position: {
    family: <family derived from workflow_id prefix before first '-' or the full workflow_id if no '-'>,
    state: 'planned'
  },
  gates: { plan_approved: true },
  dependencies_safe: true
}
```

**Why this shape:** It matches the `evidence()` fixture template in `tests/router.workflow-orchestrator.test.mjs:12-21` verbatim, which is the only existing concrete template for what `nextValidTransitions` consumes. `nextValidTransitions` validates evidence fields per `src/orchestrator/transitions.mjs:25-37` (validString checks on `status`, `freshness`, `position.family`, `position.state`, `gates`, `dependencies_safe`), and the synthetic shape above satisfies every check.

**`position.state: 'planned'` is the canonical publish-time state.** Publish bakes for workflows, not for one live capsule position. The `'planned'` state is the entry state for the canonical gsd-family transitions (`gsd.discuss` requires `phase_available`, `gsd.plan` requires `discussion_complete`, `gsd.execute` requires `plan_approved` — see `WORKFLOW_TRANSITIONS` at `transitions.mjs:9-19`). When the route path later observes a live capsule in a different state, it filters the baked candidate set by `position.state` (see Decision 3) — a pure read, not an orchestrator call.

**`family` derivation rule:** `<workflow_id prefix before first '-'>` yields `'gsd'` for `'gsd-execute-phase'`, `'brainstorm'` for `'brainstorming'` (no `-`, so the full id is the family), `'interrupted'` for `'interrupted.resume-work'`, etc. This aligns with the `family` column in `WORKFLOW_TRANSITIONS`.

---

## Decision 3 — Q2 resolution: bake candidate set AND selected transition per family `[ASSUMED]`

**Chosen option:** At publish time, for each mapped subject, `publishCompiledIndex` runs:

1. `nextValidTransitions(evidence, WORKFLOW_TRANSITIONS)` — produces the candidate set for the family (per `transitions.mjs:69-100`).
2. `selectWorkflow(candidates, undefined)` — picks one selected transition per family using the uniqueness-based selection path (`transitions.mjs:143-183`), with no `explicitIntent` (undefined) so the default uniqueness narrowing applies.

Both results are baked into the closure sibling. The route path reads the **selected transition** for the canonical case (when the live capsule `position.state` matches the selected transition's `from` state), and filters the **candidate set** by the live capsule `position.state` when the capsule state does not match the selected transition's `from` state.

**Why both:** This filtering is a pure read over baked data — D-01/D-02 compliant (no orchestrator call on the hot path).

**Rejected alternatives:**

- **Bake only the selected transition.** Rejected because the route path would be unable to route from a non-`planned` capsule state. The selected transition is the `planned → execute` canonical case; a live capsule at state `executed` needs the `executed → verify` transition, which only appears in the candidate set.
- **Bake only candidates.** Rejected because it loses the canonical default, forcing the route path to re-implement `selectWorkflow` (an orchestrator function) on the hot path — violating D-01/D-02.

---

## Decision 4 — Sibling tuple file shape (per D-05, per Pitfall #3, per CONTEXT.md Claude's Discretion)

**Chosen shape:** Per-workflow keyed maps mirroring the existing `index.routes?.[workflowId]` projection at `src/context/prompt-route.mjs:104`. This keeps the hot-path read surface a single `?.[workflowId]` projection, identical in shape to the existing dispatch projection.

### `closure.json`

```json
{
  "schema_version": 1,
  "by_workflow": {
    "<workflow_id>": {
      "selected_transition": { "transition_id": "...", "workflow_id": "...", "family": "...", "from": "...", "to": "..." },
      "candidates": [ { "transition_id": "...", "workflow_id": "...", "family": "...", "from": "...", "to": "..." } ],
      "closure": [ { "canonical_id": "...", "type": "...", ... } ],
      "invokable_capabilities": [ { "canonical_id": "...", ... } ],
      "required_models": [ "..." ],
      "required_permissions": [ "..." ],
      "lifecycle_bindings": [ { "canonical_id": "...", "event": "..." } ],
      "dispatch_eligible": true,
      "reason_code": "dependency_closure_safe"
    }
  }
}
```

Inner fields aligned with the `selectCapabilities` return at `src/orchestrator/select.mjs:128-139` (`closure`, `invokable_capabilities`, `required_models`, `required_permissions`, `lifecycle_bindings`) plus the transition results (`selected_transition`, `candidates` from Decisions 2/3).

### `budget.json`

```json
{
  "schema_version": 1,
  "by_workflow": {
    "<workflow_id>": {
      "report": {
        "contract_version": "workflow-context-contract-v1",
        "estimator_version": "utf8-bytes-v1-ceil-div-3",
        "total_max_bytes": 12288,
        "canonical_bytes": 4096,
        "estimated_tokens": 1366,
        "included_sources": [ { "canonical_id": "...", "class": "...", ... } ],
        "omitted_sources": [ { "canonical_id": "...", "class": "...", ... } ],
        "regression_delta": null
      },
      "dispatch_eligible": true,
      "reason_code": "context_load_planned"
    }
  }
}
```

Inner `report` aligned with the `planContextLoad` report at `src/orchestrator/budget.mjs:200-209` (`contract_version`, `estimator_version`, `total_max_bytes`, `canonical_bytes`, `estimated_tokens`, `included_sources`, `omitted_sources`, `regression_delta`).

### `summary-index.json`

```json
{
  "schema_version": 1,
  "by_workflow": {
    "<workflow_id>": "<summary_index_ref or null>"
  }
}
```

### Blocked / non-dispatchable entries

When an orchestrator call returns `blocked` or `dispatch_eligible: false` for a workflow, bake that `dispatch_eligible: false` + `reason_code` into the per-workflow entry. **Do NOT throw.** This is the D-03 pattern: required-overflow at publish → non-dispatchable at publish → route path observes the flag and synthesizes the existing blocked resolution at `src/context/prompt-route.mjs:105-110`.

---

## Decision 5 — Manifest extension (Security V6 — required for Phase 17 D-02 fail-closed integrity gate)

**Chosen shape:** Extend the manifest at `src/prompt/publish-index.mjs:85-91` with three new payload_sha256 fields alongside the existing `registry` and `compiled` entries:

```javascript
const manifest = {
  schema_version: 1, state: 'verified', tuple_version_id: tupleVersionId,
  registry: { version_id: registryVersionId, payload_sha256: registryHash },
  compiled: { version_id: compiledVersionId, payload_sha256: compiledHash },
  // NEW (V6):
  closure:       { payload_sha256: sha256(closureBytes) },
  budget:        { payload_sha256: sha256(budgetBytes) },
  summary_index: { payload_sha256: sha256(summaryIndexBytes) },
  policy_fingerprint: policyFingerprint || sha256('{}'),
  mapping_fingerprint: mappingFingerprint,
  compatibility: COMPILED_INDEX_COMPATIBILITY,
  verification: { disposition: 'passing', complete: true },
  created_at: now, expires_at: now + 30 * 24 * 60 * 60 * 1000
};
```

**`verifyTuple` extension (Plan 02):** The existing `verifyTuple` at `src/prompt/compile-index.mjs:121-132` is extended to read each sibling via `boundedJson`, compute `sha256(siblingBytes)`, and compare against the manifest field — rejecting the tuple if any sibling hash mismatches or is missing. This closes the T-19-01 tampering threat (sibling file swapped on disk → tuple rejected → `blocked()`).

---

## Decision 6 — `compatible()` extension (per D-04)

**Chosen shape:** Extend `COMPILED_INDEX_COMPATIBILITY` at `src/prompt/compile-index.mjs:6-10` with two new members:

```javascript
import { CONTEXT_CONTRACT_VERSION } from '../orchestrator/budget.mjs';

export const COMPILED_INDEX_COMPATIBILITY = Object.freeze({
  router_contract: 'prompt-route-v1',
  policy_version: 'workflow-transitions-v1',
  capsule_schema_version: 1,
  // NEW (D-04):
  orchestrator_contract_version: 'workflow-first-v1',
  context_contract_version: CONTEXT_CONTRACT_VERSION,  // 'workflow-context-contract-v1' per budget.mjs:4
});
```

Extend `compatible()` at `:72-76` to check both new members equal the frozen constants:

```javascript
function compatible(value) {
  return value?.router_contract === COMPILED_INDEX_COMPATIBILITY.router_contract
    && value?.policy_version === COMPILED_INDEX_COMPATIBILITY.policy_version
    && value?.capsule_schema_version === COMPILED_INDEX_COMPATIBILITY.capsule_schema_version
    && value?.orchestrator_contract_version === COMPILED_INDEX_COMPATIBILITY.orchestrator_contract_version
    && value?.context_contract_version === COMPILED_INDEX_COMPATIBILITY.context_contract_version;
}
```

**Effect:** This invalidates all schema-1 tuples. The watcher recovery path re-publishes from authoritative disk state (D-04). Recovery remains automatic.

---

## Decision 7 — `COMPILED_INDEX_LIMITS` extension (per Pitfall #5)

**Chosen shape:** Add three size limits to `COMPILED_INDEX_LIMITS` at `src/prompt/compile-index.mjs:11-18`:

```javascript
export const COMPILED_INDEX_LIMITS = Object.freeze({
  pointer_bytes: 4 * 1024,
  known_good_bytes: 16 * 1024,
  metadata_bytes: 8 * 1024,
  payload_bytes: 64 * 1024,
  known_good_versions: 8,
  maximum_age_ms: 30 * 24 * 60 * 60 * 1000,
  // NEW (Pitfall #5):
  closure_bytes: 64 * 1024,
  budget_bytes: 32 * 1024,
  summary_index_bytes: 16 * 1024,
});
```

**Why independent limits:** Siblings are bounded independently so a blocked route does not pay the closure/budget read cost. The route path reads siblings lazily — only when a dispatch-eligible projection exists (`prompt-route.mjs:104` already gates on `projection ?`). A blocked route reads only `index.json` and stops; a dispatch-eligible route reads `closure.json` + `budget.json` + `summary-index.json` for that workflow's projection.

---

## Decision 8 — Pointer `schema_version` bump

**Chosen shape:** The active.json / known-good.json pointer `schema_version` bumps `1 → 2` alongside the tuple schema bump. `verifyTuple`'s pointer check at `src/prompt/compile-index.mjs:121` updates from `pointer?.schema_version !== 1` to `pointer?.schema_version !== 2`.

**Rationale:** The pointer schema is coupled to the tuple schema. Bumping only the `index.json` `schema_version` would leave a mismatched pointer, so an old pointer would still point at a new tuple (or vice versa) without a clear rejection signal. Bumping both keeps the contract uniform.

---

## Decision 9 — `loadCompiledIndex` return shape (per D-05, Claude's Discretion)

**Chosen shape:** Additive flat keys. The `ready` return at `src/prompt/compile-index.mjs:137-152` gains `closure`, `budget`, `summaryIndex` keys (the parsed sibling JSON, already hash-verified by `verifyTuple`):

```javascript
if (verified) return {
  status: 'ready', dispatch_eligible: true, reason_code: 'release_tuple_active',
  tuple_version_id: tupleActive.tuple_version_id,
  version_id: verified.manifest.compiled.version_id,
  registry_version_id: verified.manifest.registry.version_id,
  source: 'active',
  registry: verified.registry, index: verified.index,
  // NEW (D-05):
  closure: verified.closure,
  budget: verified.budget,
  summaryIndex: verified.summaryIndex,
};
```

**Why flat keys:** Sub-object grouping was considered and rejected. Flat keys keep `validRoutes()` and the hot-path read surface smallest — the route path reads `compiledIndex.closure?.[workflowId]` mirroring the existing `compiledIndex.index.routes?.[workflowId]` projection at `prompt-route.mjs:104`. A sub-object would force a second dereference (`compiledIndex.siblings.closure?.[workflowId]`) with no benefit and a slightly larger hot-path surface.

---

## Decision 10 — `dispatch_eligible` flag (per D-03)

**Chosen shape:** The per-workflow budget sibling entry carries `dispatch_eligible` baked from the `planContextLoad` result. Required-overflow at publish → `dispatch_eligible: false` → the route path observes it and synthesizes the existing blocked resolution at `src/context/prompt-route.mjs:105-110`.

**Per-prompt budget estimation is DEFERRED to v2 (D-03).** Do NOT add `estimateRoutingTokens` to the route path in this phase. The incoming prompt is the trigger, not loaded context; all loaded context is canonical bytes known at publish, so required-overflow is enforceable at publish via the `dispatch_eligible` flag. Per-prompt estimation, if added in v2, is a one-import pure-function call and is Phase 17 D-01-permitted — but it is not required for v1 TOK-02.

---

## Assumptions Register

The `[ASSUMED]` tag marks decisions sourced from Claude's Discretion per `19-CONTEXT.md`. The plan-checker and the user can surface these; they are not silently absorbed.

| # | RESEARCH.md Ref | Resolution | Tag | Risk if Wrong |
|---|-----------------|------------|-----|----------------|
| A1 | Open Question Q1 (declarations + evidence source) | Decision 1: new static file `src/orchestrator/workflow-declarations.json`, read via relative path from `publishCompiledIndex`; Decision 2: synthetic per-workflow evidence with `position.state: 'planned'`. | `[ASSUMED]` | HIGH — if the static file shape or the evidence shape does not satisfy the orchestrator's validators (`selectCapabilities` `declarationFor`, `nextValidTransitions` evidence checks), every route blocks. Mitigation: the evidence shape is copied verbatim from the only existing template (`tests/router.workflow-orchestrator.test.mjs:12-21`), and the declarations shape matches `declarationFor` at `select.mjs:142-153`. |
| A2 | Open Question Q2 (bake one selected transition or full candidate set) | Decision 3: bake BOTH. Route path reads selected transition for the canonical case and filters candidates by live capsule `position.state` otherwise. | `[ASSUMED]` | MEDIUM — if the candidate-set filtering at read time is considered "calling an orchestrator" (forbidden by D-01/D-02), the route path would have to read only the selected transition and re-bake per capsule state. Mitigation: the filtering is a pure equality check on a baked list — it does not invoke `nextValidTransitions` or `selectWorkflow`. It is a projection read, D-01/D-02-compliant. |
| A3 | Assumption A3 (watcher call site may need extending) | Decision 1: watcher call site at `watcher.mjs:338-343` is NOT extended. Declarations are read from the static file inside `publishCompiledIndex`. | `[ASSUMED]` | LOW — the watcher has no declarations source and does not need one; plumbing would be pure indirection. |
| A4 | Assumption A4 (v1.2 release matrix secondary entry) | Deferred to Plan 04 — Plan 04 adds the Phase 19 secondary evidence entry for ORC-01 + TOK-02 at execution time (Q3 resolution). | (not tagged) | LOW — additive JSON edit. |
| A5 | Assumption A5 (~10 test files reference schema_version: 1) | Wave 0 (Plan 04): audit + update fixture schema_version to 2 and extend compatibility objects. | (not tagged) | MEDIUM — underestimating churn leaves tests red. Mitigation: RESEARCH.md Pitfall #1 enumerated the files; Plan 04's Wave 0 audit covers them. |

---

## Locked Contracts for Plans 02 / 03 / 04

The following symbols and shapes appear first in this document and are implemented verbatim by Plans 02, 03, 04. Downstream plan-review-convergence source-grounding excludes these from drift verification (they are declared here, not in earlier source).

| Contract | Owner Plan | Concrete Value |
|----------|-----------|----------------|
| Static file path | Plan 03 (bundle) | `src/orchestrator/workflow-declarations.json` |
| Bundle `moduleNames` entry | Plan 03 | `'orchestrator/workflow-declarations.json'` (added alongside the three D-07 .mjs entries) |
| Sibling tuple file names | Plan 02 (publish) | `closure.json`, `budget.json`, `summary-index.json` |
| `COMPILED_INDEX_SCHEMA_VERSION` | Plan 02 | `2` (bumped from 1) |
| Pointer `schema_version` | Plan 02 | `2` (bumped from 1) |
| `COMPILED_INDEX_COMPATIBILITY` new members | Plan 02 | `orchestrator_contract_version: 'workflow-first-v1'`, `context_contract_version: CONTEXT_CONTRACT_VERSION` |
| `COMPILED_INDEX_LIMITS` new members | Plan 02 | `closure_bytes: 64 * 1024`, `budget_bytes: 32 * 1024`, `summary_index_bytes: 16 * 1024` |
| Manifest new fields | Plan 02 | `closure.payload_sha256`, `budget.payload_sha256`, `summary_index.payload_sha256` |
| `loadCompiledIndex` return keys | Plan 02 | `closure`, `budget`, `summaryIndex` (additive flat keys) |
| Per-workflow sibling shape | Plan 02 | `{ schema_version: 1, by_workflow: { "<workflow_id>": { ... } } }` |
| `dispatch_eligible` flag | Plan 02 (bake) + Plan 03 (observe) | per-workflow budget sibling entry; route path synthesizes blocked resolution when `false` |
| `reason_code: 'canonical_record'` removal | Plan 02 | delete `publish-index.mjs:63-67` (D-06) |

---

## Verification (this document)

- Contains literal `workflow-declarations.json` (Decision 1).
- Contains literal `[ASSUMED]` (Decisions 1, 2, 3 + Assumptions Register A1, A2, A3).
- Contains literal `orchestrator_contract_version`, `context_contract_version`, `closure.payload_sha256`, `budget.payload_sha256`, `summary_index.payload_sha256` (Decisions 5, 6).
- Contains literal `closure_bytes`, `budget_bytes`, `summary_index_bytes` (Decision 7).
- Contains literal `by_workflow` (Decision 4).
- Contains literal `dispatch_eligible` (Decisions 4, 10).
- No production code under `src/` is modified by this decision document.

---

*Phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions*
*Decision authored: 2026-07-17*