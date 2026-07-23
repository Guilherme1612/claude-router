# Phase 19: Close gap — TOK-02 + ORC-01 — wire orchestrator {select,transitions,budget} into publish-index.mjs + prompt-route.mjs live path + deployed bundle - Research

**Researched:** 2026-07-17
**Domain:** Publish-time orchestrator wiring + compiled-index schema evolution + deployed-bundle extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Closure + budget eval point**
- **D-01:** `selectCapabilities` (capability/dependency closure), `selectWorkflow`/`nextValidTransitions` (workflow transition), and `planContextLoad` (context budget plan + summary-index ref) run **at publish time** inside `publishCompiledIndex` (`src/prompt/publish-index.mjs`). Their output is frozen into the immutable compiled tuple. The route path stays a read-only projection — it never calls orchestrator functions live.
- **D-02:** Route-time closure computation is **locked out** by Phase 17 D-01 (hot path must not scan inventories, compile registries, replay history, or call an external model). Closure is registry-derived, so it cannot run on the hot path. This is not an open choice — it is inherited.
- **D-03:** Per-prompt budget enforcement (token-estimating the incoming prompt against the ceiling) is **deferred to v2 evolution**, not a v1 hard requirement. Required-overflow is enforceable at publish via the `dispatch_eligible` flag; the route path reads that flag and does not estimate the prompt.

**Compiled index schema + tuple shape**
- **D-04:** Bump `COMPILED_INDEX_SCHEMA_VERSION` (1 → 2) and extend `COMPILED_INDEX_COMPATIBILITY` in `src/prompt/compile-index.mjs`. Invalidate prior LKG tuples, force re-publish. Extend `compatible()` (`compile-index.mjs:73-75`) to cover new members. Recovery remains automatic via watcher re-publish + LKG.
- **D-05:** `routes[]` stays the compact dispatch contract — `validRoutes()` and `routeContextPrompt`'s read surface are unchanged. Closure, context-budget plan, and summary-index ref are added as **sibling files in the tuple version directory** (e.g. `closure.json`, `budget.json`, `summary-index.json`), not inline keys in `index.json`. Recovery/LKG tuple shape is unchanged (still a version dir with registry.json + index.json + manifest + siblings).

**publish-index fallback (ORC-01)**
- **D-06:** **Remove the blanket fallback entirely** — delete `src/prompt/publish-index.mjs:63-67`. When no mapped subjects produce routes, `routes` is empty and `:68` throws `TypeError('compiled index requires at least one dispatch route')`. No workflow-rooted route → publish fails closed → no route. A workflow-rooted-only scoped fallback is rejected.

**Bundle + hook import graph + evidence**
- **D-07:** Add `orchestrator/select.mjs`, `orchestrator/transitions.mjs`, `orchestrator/budget.mjs` to the `moduleNames` array in `src/lifecycle/router-lifecycle.mjs:308-317` so they ship in the deployed bundle. Required by D-01: publish-time orchestrator calls run in the bundled controller/watcher.
- **D-08:** The installed `~/.claude/hooks/router.mjs` import graph is **unchanged**. The hook imports only `context/prompt-route.mjs`, which reads the pre-baked tuple and calls no orchestrator. Only the controller (lifecycle/publish) needs the orchestrator.
- **D-09:** Prove Flow 11 flips to PASS by **extending the Phase 18 autonomous-lifecycle E2E** (`tests/router.autonomous-lifecycle.test.mjs` + `tests/router.test-mode-seam.test.mjs`), which already drives watcher→controller→publishCompiledIndex via the opt-in test_mode seam. Add assertions: closure + budget + summary-index present in the published tuple; ORC-01 no-fallback admission (empty mapping → blocked, no route); TOK-02 budget accounting (required-overflow → non-dispatchable); Flow 11 `dispatch_eligible` flips to PASS. One extended test covers all three — reuses the existing seam, no new harness. A dedicated standalone ORC-01/TOK-02 live-path integration test is rejected as redundant.
- **D-10:** **Defer the ACT-01 live prod-verifier integration test to Phase 20.** Non-blocking audit Warning; Phase 20 is the natural home.

### Claude's Discretion
- Exact field names and JSON shape of the sibling tuple files (`closure.json`, `budget.json`, `summary-index.json`) — may align with existing `DEFAULT_CONTEXT_CONTRACT` / `CONTEXT_CONTRACT_VERSION` / `ESTIMATOR_VERSION` shapes in `src/orchestrator/budget.mjs`.
- Whether to expose the new tuple members through `loadCompiledIndex`'s return shape additively or behind a sub-object — pick whichever keeps `validRoutes` and the hot-path read surface smallest.
- Test naming and assertion granularity within the extended Phase 18 E2E.

### Deferred Ideas (OUT OF SCOPE)
- Per-prompt budget enforcement (route-time token estimate of the incoming prompt against the baked ceiling) — v2 evolution. If added later, it is a one-import pure-function call (`estimateRoutingTokens`) and is Phase 17 D-01-permitted, but it is not required for v1 TOK-02.
- ACT-01 live prod-verifier integration test — non-blocking audit Warning 1; deferred to Phase 20 (EVO-05 canary production trigger).
- Cross-machine registry/capsule sync, automatic third-party capability install/remove, shared multi-user policy workflows — Future Requirements, out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORC-01 | Workflow selection precedes skill, command, agent, MCP, and tool selection. | Orchestrator modules (`select.mjs`, `transitions.mjs`) already enforce workflow-first ordering (`selectCapabilities` requires a resolved workflow token before closure — `select.mjs:160-165`). Phase 19 wires them into the live publish path so the published tuple carries workflow-rooted closure. The blanket fallback (`publish-index.mjs:63-67`) is the live-path leak that admitted capabilities without a workflow-rooted route; D-06 removes it. |
| TOK-02 | Each workflow enforces a declared context budget and reuses unchanged artifact summaries. | `planContextLoad` (`budget.mjs:131-211`) enforces `DEFAULT_CONTEXT_CONTRACT` ceilings and emits `required_source_budget_exceeded` (non-dispatchable) on overflow. Phase 19 bakes the budget plan into a sibling tuple file at publish; the route path reads `dispatch_eligible` and the baked budget. Per-prompt estimation is deferred (D-03); required-overflow is enforceable at publish because all loaded context is canonical bytes known at publish. |
</phase_requirements>

## Summary

Phase 19 is a **wiring phase, not a build phase**. The orchestrator modules (`src/orchestrator/{select,transitions,budget}.mjs`) were built and unit-tested in Phase 16, but never connected to live data — `workflowDeclarations` (the owners/requirements/compatible map that `selectCapabilities` consumes) appears **only in unit-test fixtures** (`tests/router.workflow-orchestrator.test.mjs`), nowhere in production code. This phase closes that gap by running the orchestrator inside `publishCompiledIndex`, freezing its output into sibling tuple files, extending the deployed bundle, removing the ORC-01 blanket fallback, and proving the live path via the Phase 18 test_mode E2E seam.

The work splits into four surgical edits: (1) `publish-index.mjs` — call orchestrator, write sibling files, delete fallback (`:63-67`); (2) `compile-index.mjs` — bump schema 1→2, extend `COMPILED_INDEX_COMPATIBILITY` and `compatible()`, extend `loadCompiledIndex` to surface siblings; (3) `router-lifecycle.mjs` — add 3 entries to `moduleNames` (`:308-317`); (4) extend the two Phase 18 E2E tests with D-09 assertions. The route path (`prompt-route.mjs`) stays read-only — it reads baked siblings from the loaded compiled index, never calls an orchestrator function.

**Primary recommendation:** Resolve the orchestrator-input sourcing question first (see Open Questions Q1 — `workflowDeclarations` and authoritative `evidence` have no production source yet). The planner must decide whether these become new `publishCompiledIndex` parameters passed from the watcher (which would require the watcher/config to carry declarations + per-workflow evidence), or are derived from registry records + mapping metadata inside `publishCompiledIndex`. This is the load-bearing design decision; everything else is mechanical wiring.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workflow transition selection (`selectWorkflow`/`nextValidTransitions`) | Publish-time (controller/watcher) | — | D-01 locks closure to publish; transition selection produces the workflow token that gates capability closure. Must run where the registry + mapping are available, i.e. inside `publishCompiledIndex` invoked by the watcher reconciler (`watcher.mjs:338`). |
| Capability/dependency closure (`selectCapabilities`/`resolveDependencies`) | Publish-time (controller/watcher) | — | Closure is registry-derived (D-02); the hot path is forbidden from scanning inventories. Runs once per publish, frozen into `closure.json`. |
| Context-budget plan (`planContextLoad`) | Publish-time (controller/watcher) | — | Pure function over already-resolved workflow + closure + contract + descriptors (`budget.mjs:131`). No I/O. Output frozen into `budget.json`. |
| Tuple persistence + atomic pointer + LKG recovery | Publish-time (`publishCompiledIndex` / `durableWrite`) | — | Existing Phase 14/17 immutable-version mechanism; new sibling files reuse `durableWrite`. |
| Route projection (read closure/budget/summary-index from tuple) | Hot path (`prompt-route.mjs`) | — | Read-only projection per D-01/D-02. Reads `loadCompiledIndex` return shape; calls no orchestrator. |
| Bundle deployment (orchestrator `.mjs` into `modules/`) | Installer (`router-lifecycle.mjs`) | — | D-07: `moduleNames` array extension; `moduleValues` deploys into both claude and codex runtime `modules/` dirs. |
| E2E evidence (D-09) | Test seam (Phase 18 `test_mode`) | — | Extends existing `stubVerificationRunners` + `inProcessControllerLauncher` harness; no new harness. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib (`node:crypto`, `node:fs`, `node:path`) | built-in (Node ≥18, verified v22.22.3 on this machine) | All I/O, hashing, JSON, durable writes | Zero dependencies — project constraint (CLAUDE.md: "Node.js stdlib only", "No npm dependency at all in v1"). `[VERIFIED: codebase — package.json absent; all imports are `node:*` or local `.mjs`]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/orchestrator/select.mjs` | existing (Phase 16) | `selectCapabilities` / `resolveDependencies` — capability closure | Consume as-is; do NOT rewrite (CONTEXT.md Reusable Assets). Exports verified by grep. `[VERIFIED: codebase]` |
| `src/orchestrator/transitions.mjs` | existing (Phase 16) | `selectWorkflow` / `nextValidTransitions` / `WORKFLOW_TRANSITIONS` — workflow transition selection | Consume as-is. `[VERIFIED: codebase]` |
| `src/orchestrator/budget.mjs` | existing (Phase 16) | `planContextLoad` / `estimateRoutingTokens` / `validateContextContract` / `DEFAULT_CONTEXT_CONTRACT` / `CONTEXT_CONTRACT_VERSION` / `ESTIMATOR_VERSION` — context budget plan | Consume as-is. `[VERIFIED: codebase]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Publish-time orchestrator execution | Route-time orchestrator execution | Rejected by D-01/D-02 (Phase 17 D-01 locks hot path to read-only; closure is registry-derived so cannot run on hot path). |
| Inline closure/budget keys in `index.json` | Sibling tuple files (`closure.json`, `budget.json`, `summary-index.json`) | D-05 locks siblings — preserves `validRoutes()` and the hot-path read surface, keeps dispatch contract and planning contract decoupled, leaves recovery/LKG tuple shape unchanged. |
| Dedicated standalone ORC-01/TOK-02 integration test | Extend Phase 18 E2E | D-09 rejects the standalone test as redundant — the Phase 18 test_mode seam already drives the real watcher→controller→publishCompiledIndex flow. |

**Installation:**
```bash
# No npm install. No dependencies. Stdlib-only project.
# Deliverables are plain .mjs files already in src/.
```

**Version verification:** No external packages. All modules are local `.mjs` files verified present via `ls src/orchestrator/{select,transitions,budget}.mjs`. Node v22.22.3 verified on this machine via `node --version`.

## Package Legitimacy Audit

> **No external packages installed in this phase.** This is a stdlib-only wiring phase per CLAUDE.md ("No npm dependency at all in v1"). All code edits consume existing local `src/orchestrator/*.mjs` modules and Node stdlib. The Package Legitimacy Gate protocol is **skipped — no packages to audit**.

## Architecture Patterns

### System Architecture Diagram

```
                    PUBLISH PATH (controller/watcher — runs orchestrator)
                    ────────────────────────────────────────────────────
  filesystem event ─→ watcher.mjs reconcile()
                         │  acquires registry (built.registry)
                         │  maps candidate → mapping (subjects[])
                         │  activates → activation.version_id
                         ▼
                    publishCompiledIndex({ ownedRoot, registry, registryVersionId, mapping, ... })
                         │
                         │  ┌─ D-01 NEW: for each mapped subject (workflow_id):
                         │  │    1. build evidence + workflowDeclarations  ← OPEN QUESTION Q1 (source?)
                         │  │    2. nextValidTransitions(evidence) → selectWorkflow → workflow token
                         │  │    3. selectCapabilities({ workflow, workflowDeclarations, registry }) → closure
                         │  │    4. planContextLoad({ workflow, closure, contract, sources, summaryIndex }) → budget
                         │  └─ D-06: REMOVE blanket fallback (:63-67) — empty mapping → throw at :68
                         │
                         ▼  write tuple version dir (immutable)
                    release-tuples/versions/<tupleVersionId>/
                         ├── registry.json        (existing)
                         ├── index.json           (existing — routes[] unchanged, the dispatch surface)
                         ├── manifest.json        (existing — extended compatibility)
                         ├── closure.json         (NEW sibling — D-05)
                         ├── budget.json           (NEW sibling — D-05)
                         └── summary-index.json   (NEW sibling — D-05)
                         │
                         ▼  atomic pointer replace (active.json, known-good.json)
                    loadCompiledIndex verification (schema 2, compatible())

                    ────────────────────────────────────────────────────
                    ROUTE PATH (hot path — read-only projection, D-01/D-02)
                    ────────────────────────────────────────────────────
  user prompt ─→ routeContextPrompt({ prompt, ownedRoot, projectRoot })
                         │
                         │  loadCompiledIndex({ ownedRoot }) → { index, closure, budget, summaryIndex, ... }
                         │  (NO orchestrator calls — reads baked siblings only)
                         ▼
                    compiledIndex.index.routes?.[workflowId]  → projection (unchanged)
                    compiledIndex.closure / .budget / .summaryIndex → read-only surface (NEW)
                         │
                         ▼  dispatch_eligible flag gates (required-overflow → false at publish)
                    injection(resolution) → additionalContext

                    ────────────────────────────────────────────────────
                    DEPLOYED BUNDLE (installer — D-07)
                    ────────────────────────────────────────────────────
  installRouter() ─→ router-lifecycle.mjs moduleNames[] (extend +3 entries)
                         │  moduleValues deploys bytes into:
                         │    <ownedRoot>/modules/orchestrator/{select,transitions,budget}.mjs
                         │    <codexOwnedRoot>/modules/orchestrator/{select,transitions,bust}.mjs
                         ▼
                    bundled controller imports orchestrator at publish time (D-01 requires files present)
```

### Recommended Project Structure
```
src/
├── orchestrator/          # Phase 16 modules — CONSUME, do not rewrite
│   ├── select.mjs         # selectCapabilities, resolveDependencies
│   ├── transitions.mjs    # selectWorkflow, nextValidTransitions, WORKFLOW_TRANSITIONS
│   └── budget.mjs         # planContextLoad, estimateRoutingTokens, validateContextContract, DEFAULT_CONTEXT_CONTRACT
├── prompt/
│   ├── publish-index.mjs  # MODIFY: orchestrator calls + sibling writes + fallback removal
│   └── compile-index.mjs  # MODIFY: schema bump 1→2, compatible() extension, loadCompiledIndex siblings
├── context/
│   └── prompt-route.mjs   # MODIFY (minimal): read baked siblings from loadCompiledIndex return
└── lifecycle/
    └── router-lifecycle.mjs  # MODIFY: moduleNames +3 entries (:308-317)
tests/
├── router.autonomous-lifecycle.test.mjs  # EXTEND (D-09)
└── router.test-mode-seam.test.mjs         # EXTEND (D-09)
```

### Pattern 1: Publish-time closure baked into sibling tuple files
**What:** The orchestrator runs once at publish, its JSON output is written as a sibling file in the immutable tuple version directory via `durableWrite` (atomic temp+fsync+rename). The route path reads it via `loadCompiledIndex`.
**When to use:** Whenever registry-derived data (closure, budget) must be available on the hot path without re-deriving it. This is the D-01/D-02 pattern — the only way to get registry-derived data onto the read-only hot path.
**Example:**
```javascript
// Source: src/prompt/publish-index.mjs (existing durableWrite pattern, :10-14)
function durableWrite(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
// NEW (D-05): sibling files reuse durableWrite, sit alongside index.json/registry.json
durableWrite(join(tupleRoot, 'closure.json'), json(closureResult));
durableWrite(join(tupleRoot, 'budget.json'), json(budgetResult));
durableWrite(join(tupleRoot, 'summary-index.json'), json(summaryIndexRef));
```

### Pattern 2: Schema bump invalidates prior tuples, forces re-publish
**What:** Bumping `COMPILED_INDEX_SCHEMA_VERSION` (1→2) and extending `COMPILED_INDEX_COMPATIBILITY` makes `compatible()` reject prior tuples. The watcher's recovery path (`loadCompiledIndex` → falls through to `known-good.json` → also incompatible → `blocked()`) triggers a re-publish from authoritative disk state. This is the Phase 14/17 immutable-version model.
**When to use:** Whenever the tuple shape gains new members that old readers cannot safely interpret.
**Example:**
```javascript
// Source: src/prompt/compile-index.mjs:5-10, :72-76 (existing)
export const COMPILED_INDEX_SCHEMA_VERSION = 1; // → 2
export const COMPILED_INDEX_COMPATIBILITY = Object.freeze({
  router_contract: 'prompt-route-v1',
  policy_version: 'workflow-transitions-v1',
  capsule_schema_version: 1,
  // NEW: extend with orchestrator contract markers, e.g.
  // orchestrator_contract_version: 'workflow-first-v1',
  // context_contract_version: CONTEXT_CONTRACT_VERSION,
});
function compatible(value) {
  return value?.router_contract === COMPILED_INDEX_COMPATIBILITY.router_contract
    && value?.policy_version === COMPILED_INDEX_COMPATIBILITY.policy_version
    && value?.capsule_schema_version === COMPILED_INDEX_COMPATIBILITY.capsule_schema_version;
    // NEW: && value?.orchestrator_contract_version === ... && value?.context_contract_version === ...
}
```

### Pattern 3: Fail-closed fallback removal (ORC-01 closure)
**What:** Delete the blanket fallback that admitted ANY `dispatchable && lifecycle==='ready'` record as a route when no mapped subjects exist. The existing throw at `:68` becomes the only path — empty mapping → publish fails → no route.
**When to use:** When a fallback admits capabilities without a workflow-rooted mapping, violating workflow-first ordering (ORC-01).
**Example:**
```javascript
// Source: src/prompt/publish-index.mjs:63-67 (TO DELETE per D-06)
// REMOVE:
//   if (!Object.keys(routes).length) {
//     for (const record of registry.records.filter(value => value.dispatchable && value.lifecycle === 'ready')) {
//       routes[record.name] = routeFor({ subject_id: record.name, reason_code: 'canonical_record' }, record);
//     }
//   }
// :68 remains: if (!Object.keys(routes).length) throw new TypeError('compiled index requires at least one dispatch route');
```

### Anti-Patterns to Avoid
- **Route-time orchestrator calls:** Calling `selectCapabilities`/`planContextLoad` from `prompt-route.mjs` violates Phase 17 D-01 (hot path must not scan inventories/compile registries) and D-02 (registry-derived closure cannot run on hot path). The route path reads baked siblings only.
- **Inlining closure/budget into `index.json`:** Violates D-05 — bloats the dispatch surface, couples dispatch contract to planning contract, changes `validRoutes()` validation. Keep them as sibling files.
- **Touching the hook import graph:** D-08 locks `~/.claude/hooks/router.mjs` imports unchanged. Only the controller/watcher (bundled) needs the orchestrator; the hook never imports it.
- **Rebuilding orchestrator modules:** CONTEXT.md Reusable Assets — consume `src/orchestrator/{select,transitions,budget}.mjs` as-is; do not rewrite or "improve" them.
- **Workflow-rooted-only scoped fallback:** D-06 explicitly rejects this — "more code and still admits dispatch without an explicit mapping."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Capability/dependency closure | Custom graph traversal over registry | `selectCapabilities` / `resolveDependencies` (`select.mjs:64-190`) | Already built + tested in Phase 16; handles cycles, missing deps, permission checks, scope filtering, deterministic ordering. |
| Workflow transition selection | Custom state-machine over workflow positions | `selectWorkflow` / `nextValidTransitions` (`transitions.mjs:69-183`) | Already built + tested; handles authoritative evidence validation, gate checks, material-tie clarification, explicit-intent narrowing. |
| Context budget planning | Custom byte/token accounting | `planContextLoad` (`budget.mjs:131-211`) | Already built + tested; enforces `DEFAULT_CONTEXT_CONTRACT` ceilings, required-overflow blocking, optional-overflow omission in semantic+canonical order, summary reuse, regression deltas. |
| Durable tuple writes | Custom fsync/rename logic | Existing `durableWrite` (`publish-index.mjs:10-14`) + `replacePointer` (`:16-24`) | Atomic temp+fsync+rename with dir fsync; reused by new sibling files. |
| Tuple compatibility gating | Custom version check | Existing `compatible()` + `verifyVersion` + `verifyTuple` (`compile-index.mjs:72-176`) | Bounded reader with size limits, O_NOFOLLOW, hash verification; extend, don't replace. |
| E2E test harness | New integration test harness | Phase 18 `test_mode` seam (`tests/helpers/test-mode-seam.mjs`: `stubVerificationRunners`, `inProcessControllerLauncher`) | D-09: reuses the existing seam that drives real watcher→controller→publishCompiledIndex. |

**Key insight:** Every hard problem in this phase was already solved in Phase 16 (orchestrator) or Phase 14/17 (durable tuples, compatibility gating, recovery). This phase is wiring — the only novel work is sourcing the orchestrator inputs (Q1) and the schema-bump churn management.

## Runtime State Inventory

> This phase modifies the compiled-index tuple shape (schema 1→2). Existing on-disk tuples at `~/.claude/router/release-tuples/versions/` and `known-good.json` will be **invalidated by the compatibility gate**. This is intentional (D-04) and self-healing: the watcher's recovery path re-publishes from authoritative disk state on the next reconciliation.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | On-disk release tuples at `<ownedRoot>/release-tuples/versions/<t1-*>` (schema 1) — incompatible after bump | **Auto-recovered by watcher re-publish** (D-04). No manual migration — `loadCompiledIndex` returns `blocked()` for old tuples, watcher reconciles from authoritative disk state and publishes a schema-2 tuple. `[VERIFIED: codebase — watcher.mjs:288-302 recovery path + compile-index.mjs:118-154 verifyTuple incompatible path]` |
| Live service config | `~/.claude/settings.json` `UserPromptSubmit` binding — **unchanged** | None. D-08: hook import graph unchanged. `[VERIFIED: codebase — publish-index.mjs + compile-index.mjs are controller-side, not hook-side]` |
| OS-registered state | None — no OS-level registrations touched by this phase | None. |
| Secrets/env vars | None — no secret keys or env var names changed | None. |
| Build artifacts | Deployed bundle `modules/orchestrator/{select,transitions,budget}.mjs` — NEW files added by D-07 | **Re-install required** to deploy the 3 new module files into `<ownedRoot>/modules/` and `<codexOwnedRoot>/modules/`. The `installRouter` flow handles this via `moduleNames` extension. Existing bundled modules are untouched. |

**Nothing found in category:** OS-registered state and secrets/env vars — verified by grep over `src/` (no OS registration, no env var name changes in this phase's edit surface).

## Common Pitfalls

### Pitfall 1: Schema bump breaks existing tests and on-disk tuples
**What goes wrong:** Bumping `COMPILED_INDEX_SCHEMA_VERSION` 1→2 and extending `COMPILED_INDEX_COMPATIBILITY` makes `compatible()` reject schema-1 tuples. Every test that hardcodes `schema_version: 1` or constructs a tuple with the old compatibility shape will fail. On-disk tuples at `~/.claude/router/release-tuples/` are invalidated.
**Why it happens:** The compatibility gate is strict by design (Phase 17 D-02/D-03). At least 10 test files reference `schema_version: 1` or `COMPILED_INDEX_SCHEMA_VERSION` (verified via grep: `router.evolution-visibility`, `router.registry-watcher`, `router.evolve-proposal`, `router.registry-diff`, `router.weights-blend`, `router.evolve-integration`, `router.lifecycle-recovery`, `router.context-prompt-integration`, `router.registry-schema`, `router.autonomous-lifecycle`).
**How to avoid:** Audit all test files referencing schema version 1 / the old compatibility shape. Update fixtures to schema 2 + new compatibility members. The planner should include a test-fixture-update wave. For on-disk tuples, rely on automatic watcher re-publish (no manual migration).
**Warning signs:** Tests failing with `no_compatible_compiled_index` or `compiled_index_active` falling through to `blocked()`.

### Pitfall 2: Orchestrator inputs have no production source (THE critical design gap)
**What goes wrong:** `selectCapabilities` requires `workflowDeclarations` (an array of `{ workflow_id, owners, requirements, compatible }`), and `nextValidTransitions` requires `evidence` (`{ status, freshness, position: { family, state }, gates, dependencies_safe }`). Neither exists in production code — they appear **only in unit-test fixtures** (`tests/router.workflow-orchestrator.test.mjs:workflowDeclaration()`, `:evidence()`). The current `publishCompiledIndex` signature is `{ ownedRoot, registry, registryVersionId, mapping, policyFingerprint, now, crashAt }` — no declarations, no evidence.
**Why it happens:** Phase 16 built the orchestrator as pure functions with test-only inputs. The live-path integration was deferred to "the later integration surface" (Phase 16 D-13: "context planning is side-effect-free; persistence and hot-path compilation belong to later integration surfaces"). Phase 19 is that surface, but CONTEXT.md did not lock where declarations/evidence come from.
**How to avoid:** The planner MUST resolve Q1 (Open Questions) before implementation. Options: (a) add `workflowDeclarations` + per-workflow `evidence` as new `publishCompiledIndex` parameters, sourced from the watcher/config/registry metadata; (b) derive declarations from registry records (if workflow records carry owners/requirements) — but grep shows the registry has no `owners`/`requirements`/`declarations` fields on records; (c) introduce a static declarations source file. This is Claude's Discretion per CONTEXT.md, but it is the load-bearing decision.
**Warning signs:** Implementation starts without a clear declarations/evidence source; orchestrator calls produce `workflow_declaration_invalid` or `invalid_authoritative_evidence` blocks for every route.

### Pitfall 3: Per-route vs per-tuple orchestrator execution scope
**What goes wrong:** `publishCompiledIndex` builds routes in a loop over `mapping.subjects` (`:59-62`), one route per `subject.subject_id` (which becomes `workflow_id`). The orchestrator produces closure + budget **per workflow token**, but a single tuple contains many routes. If the orchestrator runs once globally, the closure won't match each route's workflow_id. If it runs per-subject, the sibling files need per-workflow namespacing (or an aggregate shape).
**Why it happens:** `selectCapabilities` takes a single `workflow` token and returns one closure; `planContextLoad` takes one `workflow` + one `closure` and returns one budget. The tuple is one version dir with one `closure.json` / one `budget.json`. The shape of "one tuple, many workflows" vs "one tuple, one closure per workflow" is not specified by CONTEXT.md.
**How to avoid:** The planner must decide the sibling file shape: a map keyed by `workflow_id` (e.g. `closure.json = { "<workflow_id>": { closure, ... }, ... }`) or a flat array. This is Claude's Discretion ("exact field names and JSON shape of the sibling tuple files"). The route path then reads `compiledIndex.closure?.[workflowId]` — mirroring the existing `compiledIndex.index.routes?.[workflowId]` projection.
**Warning signs:** Sibling files hold a single closure but the tuple has N routes; route path can't find the closure for `workflowId`.

### Pitfall 4: Fallback removal breaks tests relying on canonical_record admission
**What goes wrong:** Deleting `publish-index.mjs:63-67` means any test that publishes with an empty `mapping.subjects` (or a mapping where no subject is `disposition: 'mapped'`) will hit the `:68` throw instead of getting `canonical_record` routes. Tests at `tests/router.lifecycle-recovery.test.mjs` and `tests/router.compiled-index.test.mjs` call `publishCompiledIndex` directly and may rely on the fallback.
**Why it happens:** The fallback was the ORC-01 leak — it admitted dispatch without workflow-rooted mapping. Removing it is the closure, but existing tests may have implicitly depended on it.
**How to avoid:** Audit `tests/router.lifecycle-recovery.test.mjs` and `tests/router.compiled-index.test.mjs` for empty-mapping publish calls. Ensure every publish path provides at least one mapped subject. The D-09 E2E assertion "empty mapping → blocked, no route" codifies the new behavior.
**Warning signs:** Tests failing with `compiled index requires at least one dispatch route`.

### Pitfall 5: Route-path read surface bloat
**What goes wrong:** Extending `loadCompiledIndex`'s return shape with closure/budget/summary-index could tempt the route path to read more than it needs, growing the hot-path I/O or coupling the route path to planning internals.
**Why it happens:** `loadCompiledIndex` reads all tuple files; adding siblings means more reads. The `boundedJson` limit (`COMPILED_INDEX_LIMITS.payload_bytes: 64KB`) may need a separate limit for siblings.
**How to avoid:** D-05 keeps `index.json` as the dispatch surface — `validRoutes()` is unchanged. Sibling reads should be bounded by their own size limits (planner discretion, per CONTEXT.md). The route path reads siblings **only when it needs them** (e.g. when a dispatch-eligible route exists), not on every prompt. `prompt-route.mjs` already lazily reads `compiledIndex.index.routes?.[workflowId]`; apply the same projection pattern to siblings.
**Warning signs:** Hot-path latency regression (REL-01: p95 <25ms); `loadCompiledIndex` reading 4 files when 1 suffices for a blocked route.

## Code Examples

### The publish call site (watcher.mjs:338-343 — the integration surface)
```javascript
// Source: src/registry/watcher.mjs:338-343 (existing, the ONLY call site of publishCompiledIndex)
const publication = await publishIndex({
  ownedRoot: config.activation_root, registry: built.registry,
  registryVersionId: activation.version_id, mapping,
  policyFingerprint: verification.policy_fingerprint, now: verification.generated_at || Date.now(),
});
// D-01: orchestrator calls run INSIDE publishCompiledIndex (not here). The watcher already
// provides built.registry + mapping — the orchestrator can derive closure/budget from these.
// Q1 OPEN: workflowDeclarations + per-workflow evidence are NOT in this call. Either extend
// this call site to pass them, or derive them inside publishCompiledIndex from registry+mapping.
```

### The orchestrator signatures (what publishCompiledIndex must call)
```javascript
// Source: src/orchestrator/transitions.mjs:69, :143 (verified)
nextValidTransitions(evidence, policy = WORKFLOW_TRANSITIONS)
// evidence = { status: 'active', freshness: 'fresh', position: { family, state }, gates: {...}, dependencies_safe: true }
// → { status: 'candidates_available', candidates: [...] } OR blocked

selectWorkflow(transitionResult, explicitIntent)
// → { status: 'selected', dispatch_eligible: true, selection: { transition_id, workflow_id, family, from, to } } OR blocked/clarification

// Source: src/orchestrator/select.mjs:160 (verified)
selectCapabilities({ workflow, workflowDeclarations, registry, requestedScope, explicitCapability })
// workflow = the selectWorkflow result; workflowDeclarations = [{ workflow_id, owners, requirements, compatible }]
// → { status: 'resolved', dispatch_eligible: true, closure: [...], invokable_capabilities, required_models, required_permissions, lifecycle_bindings } OR blocked

// Source: src/orchestrator/budget.mjs:131 (verified)
planContextLoad({ workflow, closure, contract, sources, summaryIndex, baseline })
// contract = DEFAULT_CONTEXT_CONTRACT or stricter; sources = [{ class, canonical_id, value/identity/witness/summary_contract_version }]
// → { status: 'planned', dispatch_eligible: true, report: { contract_version, estimator_version, total_max_bytes, canonical_bytes, estimated_tokens, included_sources, omitted_sources, regression_delta } } OR blocked
```

### The bundle extension point (router-lifecycle.mjs:308-317)
```javascript
// Source: src/lifecycle/router-lifecycle.mjs:308-317 (verified)
const moduleNames = [
  'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
  'registry/fingerprint.mjs', 'registry/diff.mjs', 'registry/watcher.mjs',
  'registry/map.mjs', 'registry/validate.mjs', 'registry/activate.mjs',
  'registry/reconcile.mjs', 'registry/hook-reconcile.mjs',
  'adapters/claude.mjs', 'adapters/codex.mjs',
  'cli/router-control.mjs',
  'context/capsule.mjs', 'context/resolve.mjs', 'context/sources.mjs',
  'context/prompt-route.mjs', 'prompt/compile-index.mjs', 'prompt/publish-index.mjs',
  // D-07 NEW: add these 3 entries so the bundled controller can import the orchestrator at publish time
  'orchestrator/select.mjs', 'orchestrator/transitions.mjs', 'orchestrator/budget.mjs',
];
// moduleValues at :318-320 deploys each into both <ownedRoot>/modules/ and <codexOwnedRoot>/modules/
```

### The route-path read surface (prompt-route.mjs:91-122 — stays read-only)
```javascript
// Source: src/context/prompt-route.mjs:91, :104, :120-125 (existing, MINIMAL change)
const compiledIndex = loadCompiledIndex({ ownedRoot, now, ...(compiledFs ? { fs: compiledFs } : {}) });
// D-01/D-02: NO orchestrator calls here. The route path reads baked siblings:
const projection = compiledIndex.index.routes?.[workflowId]; // unchanged dispatch surface
// NEW (D-05): read baked closure/budget/summaryIndex from the loaded tuple — read-only projection
// compiledIndex.closure?.[workflowId], compiledIndex.budget?.[workflowId], compiledIndex.summaryIndex
// These extend the `compiled` return field at :120-125 additively, behind the same dispatch_eligible gate.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Schema 1 tuples (no closure/budget siblings) | Schema 2 tuples with `closure.json` + `budget.json` + `summary-index.json` siblings | Phase 19 (D-04/D-05) | Prior tuples auto-invalidated; watcher re-publishes. Recovery/LKG shape unchanged (siblings are additive). |
| Blanket fallback admits any dispatchable ready record as a route (`publish-index.mjs:63-67`) | No fallback — empty mapping → publish fails closed (`:68` throw) | Phase 19 (D-06) | ORC-01 closed: no capability dispatch without workflow-rooted mapping. Tests relying on `canonical_record` must provide mapped subjects. |
| Orchestrator modules built but unwired (Phase 16) | Orchestrator wired into publish path + deployed bundle | Phase 19 (D-01/D-07) | ORC-01 + TOK-02 live-path gap closed. `workflowDeclarations` moves from test-only to production. |
| `loadCompiledIndex` returns `{ index, registry, manifest, ... }` | Returns same + `closure`, `budget`, `summaryIndex` (additive) | Phase 19 (D-05) | Route path gains read-only projection of baked closure/budget. `validRoutes()` unchanged. |

**Deprecated/outdated:**
- `reason_code: 'canonical_record'` (`publish-index.mjs:65`) — removed by D-06. No route should carry this reason code after Phase 19.

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `workflowDeclarations` and per-workflow `evidence` will be sourced from a new `publishCompiledIndex` parameter passed by the watcher (option a), OR derived from registry/mapping metadata inside `publishCompiledIndex` (option b/c). The exact source is NOT locked by CONTEXT.md — it is Claude's Discretion. | Architecture Patterns (Q1), Common Pitfalls #2 | HIGH — if the source doesn't exist or can't be derived, the orchestrator calls block every route (`workflow_declaration_invalid` / `invalid_authoritative_evidence`), and the phase cannot close ORC-01. The planner MUST resolve this before implementation. `[ASSUMED]` |
| A2 | The sibling tuple files will be per-workflow keyed maps (e.g. `closure.json = { "<workflow_id>": {...} }`) to match the per-route projection pattern of `routes?.[workflowId]`. The exact shape is Claude's Discretion. | Common Pitfalls #3 | MEDIUM — if the shape is a single global closure, the route path can't project per-workflow. Planner must decide map-vs-array shape. `[ASSUMED]` |
| A3 | The watcher call site (`watcher.mjs:338`) may need extending to pass `workflowDeclarations`/evidence if option (a) is chosen. This is a new parameter on `publishCompiledIndex` and possibly on the watcher config. | Code Examples (publish call site) | MEDIUM — if the watcher can't source declarations, option (a) is infeasible and the planner must derive inside `publishCompiledIndex` or introduce a static source. `[ASSUMED]` |
| A4 | The v1.2 release matrix (`release/v1.2-matrix.json`) ORC-01/TOK-02 primary evidence (Phase 16 unit tests) remains valid; Phase 19 adds secondary live-path evidence via the extended Phase 18 E2E. The matrix itself may not need editing. | Validation Architecture | LOW — if the matrix needs a Phase 19 secondary entry, it's an additive JSON edit. `[ASSUMED]` |
| A5 | Existing tests referencing `schema_version: 1` / old `COMPILED_INDEX_COMPATIBILITY` will need fixture updates to schema 2. The count is ~10 test files (verified via grep). | Common Pitfalls #1 | MEDIUM — underestimating the churn could leave tests red. Planner should include a fixture-update wave. `[VERIFIED: codebase grep — count is approximate; planner must audit each]` |

## Open Questions

1. **Where do `workflowDeclarations` and authoritative `evidence` come from at publish time?** (THE load-bearing question) (RESOLVED — see 19-ORCHESTRATOR-INPUT-DECISION.md)
   - What we know: `selectCapabilities` requires `workflowDeclarations` (array of `{ workflow_id, owners, requirements, compatible }`). `nextValidTransitions` requires `evidence` (`{ status: 'active', freshness: 'fresh', position: { family, state }, gates: {...}, dependencies_safe: true }`). Both appear only in unit-test fixtures (`tests/router.workflow-orchestrator.test.mjs`), nowhere in production. The registry records (verified via grep over `src/registry/*.mjs`) have no `owners`/`requirements`/`declarations` fields. The current `publishCompiledIndex` signature has no declarations/evidence parameter.
   - What's unclear: Whether to (a) add new `publishCompiledIndex` params sourced from watcher config/registry metadata, (b) derive declarations from registry records (would require workflow records to carry owners/requirements — they currently don't), or (c) introduce a static declarations file bundled with the controller. Also unclear: what `evidence.position.state` should be at publish time (publish bakes for all workflows, not one live capsule position — so evidence may need to be per-workflow-family synthetic, or the transition selection may need to bake all valid transitions for the family rather than one selected transition).
   - Recommendation: The planner should present this as the first task — a design spike that produces a one-page decision: declarations source + evidence shape + per-workflow vs per-tuple orchestrator scope. CONTEXT.md marks field names/shapes as Claude's Discretion, so the planner can lock this without re-discussing. This question blocks all other implementation tasks.

2. **Does the transition selection bake one selected transition per workflow, or all valid transitions for the workflow family?** (RESOLVED — see 19-ORCHESTRATOR-INPUT-DECISION.md)
   - What we know: `selectWorkflow` picks ONE transition from `nextValidTransitions` candidates based on `explicitIntent` or uniqueness. At publish time there is no live capsule position, so `evidence.position.state` is ambiguous. The route path at runtime HAS a capsule (position/state) and needs to know which transition applies.
   - What's unclear: Whether publish bakes (a) one transition per route assuming a canonical state, or (b) the full `nextValidTransitions` candidate set per family so the route path filters by capsule position at read time (a pure read, not an orchestrator call — D-01/D-02 compliant).
   - Recommendation: Option (b) is more aligned with "route path is a read-only projection" — bake the candidate set, let the route path filter by capsule position. But this means the route path does transition filtering, which is close to "calling an orchestrator." The planner must clarify the boundary: is reading a baked candidate list and filtering by position considered "calling an orchestrator" (forbidden) or "reading a projection" (allowed)?

3. **Does the v1.2 release matrix need a Phase 19 secondary evidence entry for ORC-01/TOK-02?**
   - What we know: The matrix (`release/v1.2-matrix.json`) currently maps ORC-01 primary to Phase 16 `tests/router.workflow-orchestrator.test.mjs` and TOK-02 primary to Phase 16 `tests/router.token-budget.test.mjs tests/router.context-budget.test.mjs`, both with secondary `phase-18-cross-cutting` → `tests/router.compiled-evolution.test.mjs`. CONTEXT.md D-09 says extend the Phase 18 E2E but does not mention editing the matrix.
   - What's unclear: Whether the extended Phase 18 E2E should be added as a new secondary evidence entry (label `phase-19-live-path`) for ORC-01 and TOK-02.
   - Recommendation: Add the secondary entry — it's an additive JSON edit that closes the traceability gap (the matrix is the authoritative release gate per Phase 18 D-10/D-11).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (≥18) | Hook runtime, test runner, all stdlib I/O | ✓ | v22.22.3 (verified `node --version`) | — |
| `node --test` | Test runner (Phase 18 E2E extension, D-09) | ✓ | built-in (Node 22) | — |
| `node:crypto` / `node:fs` / `node:path` | All publish/route/bundle operations | ✓ | built-in | — |
| No external tools/services | — | — | — | This phase has no external dependencies — pure code/config changes. Step 2.6: no external probes needed. |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — this is a code-only wiring phase with no external tool dependencies.

## Validation Architecture

> Nyquist validation is enabled (`.planning/config.json` `workflow.nyquist_validation: true`). This section feeds Dimension 8 of the plans.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node 22) + `node:assert/strict` |
| Config file | none — tests are standalone `.mjs` files run via `node --test tests/<name>.test.mjs` |
| Quick run command | `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.test-mode-seam.test.mjs` |
| Full suite command | `node --test tests/*.test.mjs` (65 test files) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORC-01 | No capability dispatch without workflow-rooted mapping (fallback removed); closure baked from workflow token | E2E (extends Phase 18 seam) | `node --test tests/router.autonomous-lifecycle.test.mjs` | ✅ exists — EXTEND per D-09 |
| ORC-01 | Empty mapping → publish fails closed (no route, throw at `:68`) | E2E (extends Phase 18 seam) | `node --test tests/router.test-mode-seam.test.mjs` | ✅ exists — EXTEND per D-09 |
| TOK-02 | Budget plan baked into tuple sibling; required-overflow → `dispatch_eligible: false` at publish | E2E (extends Phase 18 seam) | `node --test tests/router.autonomous-lifecycle.test.mjs` | ✅ exists — EXTEND per D-09 |
| TOK-02 | Route path reads baked budget (read-only projection, no orchestrator call) | E2E (extends Phase 18 seam) | `node --test tests/router.test-mode-seam.test.mjs` | ✅ exists — EXTEND per D-09 |
| D-04 | Schema 2 tuples: prior schema-1 tuples rejected by `compatible()`; watcher re-publishes | unit + E2E | `node --test tests/router.compiled-index.test.mjs tests/router.autonomous-lifecycle.test.mjs` | ✅ exists — UPDATE fixtures to schema 2 |
| D-07 | Orchestrator modules deployed in bundle (`modules/orchestrator/*.mjs`) | E2E | `node --test tests/router.autonomous-lifecycle.test.mjs` | ✅ exists — EXTEND with bundle-presence assertion |

### Sampling Rate
- **Per task commit:** `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.test-mode-seam.test.mjs tests/router.compiled-index.test.mjs tests/router.workflow-orchestrator.test.mjs` (the directly-touched + orchestrator suites; <30s).
- **Per wave merge:** `node --test tests/*.test.mjs` (full 65-file suite — catches schema-bump churn across all files referencing `schema_version: 1`).
- **Phase gate:** Full suite green before `/gsd-verify-work`. The v1.2 release gate (`tests/router.v12-release.test.mjs` via `src/release/run-release.mjs`) must also pass — ORC-01/TOK-02 evidence entries must remain or gain a Phase 19 secondary.

### Wave 0 Gaps
- [ ] `tests/router.autonomous-lifecycle.test.mjs` — add D-09 assertions (closure/budget/summary-index present; empty mapping → blocked; required-overflow → non-dispatchable; Flow 11 `dispatch_eligible` PASS).
- [ ] `tests/router.test-mode-seam.test.mjs` — add D-09 assertions (bundle presence of orchestrator modules; baked closure readable from tuple).
- [ ] Audit + update ~10 test files referencing `schema_version: 1` / old `COMPILED_INDEX_COMPATIBILITY` shape (schema-bump churn — Common Pitfall #1).
- [ ] `tests/router.lifecycle-recovery.test.mjs` + `tests/router.compiled-index.test.mjs` — audit for empty-mapping publish calls that relied on the `canonical_record` fallback (Common Pitfall #4).
- [ ] If Q3 resolved as "add matrix entry": `release/v1.2-matrix.json` — add Phase 19 secondary evidence for ORC-01 + TOK-02.

*(Framework install: none — `node:test` is built-in.)*

## Security Domain

> Security enforcement is enabled (absent in config = enabled). This phase touches publish-time closure and tuple persistence — relevant to ASVS V5 (input validation) and V6 (cryptography/integrity).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surfaces touched (publish is controller-internal, not externally invoked). |
| V3 Session Management | no | No session surfaces touched. |
| V4 Access Control | no | Publish runs in the trusted controller; no new access surface. |
| V5 Input Validation | yes | Orchestrator inputs (`workflowDeclarations`, `evidence`, `sources`) must be validated by the existing orchestrator functions (`selectCapabilities` checks `validId`, `declarationFor` rejects ambiguous matches; `nextValidTransitions` validates evidence fields; `planContextLoad` validates contract via `validateContextContract`). The sibling tuple files are JSON-validated on read by the existing `boundedJson` + `verifyTuple` path. `[CITED: src/orchestrator/select.mjs:5-7, :64-72, :142-153; src/orchestrator/transitions.mjs:25-37, :69-100; src/orchestrator/budget.mjs:46-69]` |
| V6 Cryptography | yes | Existing `sha256` integrity (registry hash, compiled hash, tuple version id) is unchanged. New sibling files MUST be hashed into the manifest or verified on read — the planner must decide whether `closure.json`/`budget.json`/`summary-index.json` get their own manifest entries (extending `manifest.compiled` or adding `manifest.closure`/`manifest.budget`/`manifest.summary_index` payload_sha256 fields). This is required for the fail-closed integrity gate (Phase 17 D-02). `[CITED: src/prompt/publish-index.mjs:85-91 manifest shape; src/prompt/compile-index.mjs:121-132 verifyTuple hash checks]` |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Tuple tampering (sibling file swapped on disk) | Tampering | Existing `boundedJson` + `O_NOFOLLOW` + size limits + hash verification (`compile-index.mjs:34-52, :121-132`). New siblings MUST be added to the manifest hash set or verified independently. `[CITED: compile-index.mjs:34-52]` |
| Orchestrator input injection (malicious workflowDeclarations) | Tampering | Orchestrator functions validate all inputs (`validId`, `positiveInteger`, `canonicalIds`); rejected inputs return `blocked` with reason codes, never dispatch. `[CITED: select.mjs:5-7, :64-72; budget.mjs:32-69]` |
| Schema-downgrade attack (old schema-1 tuple re-injected) | Spoofing | `compatible()` gate rejects schema-1 after bump (D-04). `loadCompiledIndex` falls through to `blocked()` for incompatible tuples. `[CITED: compile-index.mjs:72-76, :118-154]` |
| Secrets in tuple siblings | Information disclosure | Sibling files contain only registry-derived closure/budget — no prompt text, no secrets. Existing privacy constraints (Phase 17 D-06: no raw prompts, no reversible text) are inherited. `[CITED: 17-CONTEXT.md D-06]` |

## Sources

### Primary (HIGH confidence)
- `src/prompt/publish-index.mjs` — read directly; verified `publishCompiledIndex` signature (`:54`), blanket fallback (`:63-67`), throw (`:68`), `durableWrite` (`:10-14`), tuple write (`:74-89`), `recoverReleaseTuple` (`:40-52`).
- `src/prompt/compile-index.mjs` — read directly; verified `COMPILED_INDEX_SCHEMA_VERSION` (`:5`), `COMPILED_INDEX_COMPATIBILITY` (`:6-10`), `compatible()` (`:72-76`), `validRoutes()` (`:57-70`), `loadCompiledIndex` (`:106-177`), `verifyTuple` hash checks (`:118-132`).
- `src/context/prompt-route.mjs` — read directly; verified `routeContextPrompt` (`:84`), `loadCompiledIndex` call (`:91`), route projection (`:104`), `compiled` return field (`:120-125`).
- `src/orchestrator/select.mjs` — read directly; verified `selectCapabilities` (`:160-190`), `resolveDependencies` (`:64-140`), `workflowDeclarations` consumption (`:164-165`).
- `src/orchestrator/transitions.mjs` — read directly; verified `nextValidTransitions` (`:69-100`), `selectWorkflow` (`:143-183`), `WORKFLOW_TRANSITIONS` (`:9-19`), evidence shape requirements (`:73-83`).
- `src/orchestrator/budget.mjs` — read directly; verified `planContextLoad` (`:131-211`), `estimateRoutingTokens` (`:36-44`), `validateContextContract` (`:46-69`), `DEFAULT_CONTEXT_CONTRACT` (`:21-30`), `CONTEXT_CONTRACT_VERSION` (`:4`), `ESTIMATOR_VERSION` (`:3`).
- `src/lifecycle/router-lifecycle.mjs:308-320` — read directly; verified `moduleNames` array + `moduleValues` deployment into both runtime `modules/` dirs.
- `src/registry/watcher.mjs:338-343` — read directly; verified the single `publishCompiledIndex` call site and its args.
- `tests/router.autonomous-lifecycle.test.mjs` + `tests/router.test-mode-seam.test.mjs` — read directly; verified the test_mode seam (`stubVerificationRunners`, `inProcessControllerLauncher`, `testMode: true`) and the `waitUntil`/`tupleId` helpers D-09 extends.
- `tests/router.workflow-orchestrator.test.mjs` — read directly; verified `workflowDeclaration()` / `evidence()` fixtures are test-only (the only place `workflowDeclarations` appears).
- `.planning/REQUIREMENTS.md` — read directly; verified ORC-01 + TOK-02 definitions and traceability (both marked Complete in Phase 16).
- `.planning/phases/19-.../19-CONTEXT.md` — read directly; all D-01..D-10 locked decisions, discretion areas, deferred ideas.
- `.planning/phases/17-.../17-CONTEXT.md` — read directly; D-01 (read-only hot path), D-02 (fail-closed to compatible known-good).
- `.planning/phases/18-.../18-CONTEXT.md` — read directly; D-04..D-06 (watcher→controller→publishCompiledIndex seam + recovery).
- `release/v1.2-matrix.json` — verified ORC-01/TOK-02 primary (Phase 16) + secondary (`phase-18-cross-cutting`) evidence entries.
- `node --version` → v22.22.3 (verified on this machine).

### Secondary (MEDIUM confidence)
- Codebase grep for `workflowDeclarations` / `owners` / `requirements` / `declarations` — confirmed these have NO production source, only test fixtures. `[VERIFIED: codebase grep]`
- Codebase grep for `schema_version: 1` / `COMPILED_INDEX_SCHEMA_VERSION` in tests — ~10 test files reference the old schema; fixture-update wave needed. `[VERIFIED: codebase grep]`

### Tertiary (LOW confidence)
- None — all findings verified against codebase or official project docs.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, no external packages; all modules verified present in codebase.
- Architecture: HIGH — publish-time closure pattern is D-01 locked; sibling files are D-05 locked; fallback removal is D-06 locked. All verified against existing code.
- Pitfalls: HIGH — all pitfalls verified against codebase (schema bump churn via grep, fallback removal via read, orchestrator input gap via grep).
- Open Questions: the orchestrator-input sourcing (Q1) is the single load-bearing uncertainty — flagged `[ASSUMED]` and routed to the planner as a design spike.

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 (30 days — stable internal codebase wiring, no external API surface)