# Phase 19: Close gap — TOK-02 + ORC-01 — wire orchestrator {select,transitions,budget} into publish-index.mjs + prompt-route.mjs live path + deployed bundle - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the existing Phase 16 orchestrator modules (`src/orchestrator/select.mjs` `selectCapabilities`/`resolveDependencies`, `src/orchestrator/transitions.mjs` `selectWorkflow`/`nextValidTransitions`, `src/orchestrator/budget.mjs` `planContextLoad`/`estimateRoutingTokens`/`validateContextContract`) into the live publish→route path and the deployed bundle, closing two gaps left by milestone v1.2:

- **ORC-01 leak** — `src/prompt/publish-index.mjs:63-67` blanket-admits ANY `dispatchable && lifecycle==='ready'` registry record as a route when no mapped subjects exist (`reason_code:'canonical_record'`). Workflow selection does not actually precede capability selection in the live path; the fallback dispatches capabilities without a workflow-rooted route.
- **TOK-02 gap** — `src/context/prompt-route.mjs` reads only the compact route projection (`compiledIndex.index.routes?.[workflowId]`); no context-budget contract is published or enforced on the live path.

The orchestrator modules already exist and are tested (Phase 16). This phase does NOT rebuild them — it wires their output into publication and their files into the deployed bundle, and removes the unsafe fallback. Phase 20 (EVO-05 canary production trigger) depends on this phase.

</domain>

<decisions>
## Implementation Decisions

### Closure + budget eval point
- **D-01:** `selectCapabilities` (capability/dependency closure), `selectWorkflow`/`nextValidTransitions` (workflow transition), and `planContextLoad` (context budget plan + summary-index ref) run **at publish time** inside `publishCompiledIndex` (`src/prompt/publish-index.mjs`). Their output is frozen into the immutable compiled tuple. The route path stays a read-only projection — it never calls orchestrator functions live.
- **D-02:** Route-time closure computation is **locked out** by Phase 17 D-01 (hot path must not scan inventories, compile registries, replay history, or call an external model). Closure is registry-derived, so it cannot run on the hot path. This is not an open choice — it is inherited.
- **D-03:** Per-prompt budget enforcement (token-estimating the incoming prompt against the ceiling) is **deferred to v2 evolution**, not a v1 hard requirement. Phase 16 D-09/D-10 govern *loaded context* budgets, and all loaded context (transition facts, required dependencies, artifact summaries/references) is canonical bytes known at publish. Required-overflow is therefore enforceable at publish via the `dispatch_eligible` flag; the route path reads that flag and does not estimate the prompt. The incoming prompt is the trigger, not loaded context.

### Compiled index schema + tuple shape
- **D-04:** Bump `COMPILED_INDEX_SCHEMA_VERSION` (1 → 2) and extend `COMPILED_INDEX_COMPATIBILITY` in `src/prompt/compile-index.mjs`. This invalidates prior LKG tuples and forces a re-publish — consistent with the Phase 14/17 immutable-version model. The existing `compatible()` gate (`compile-index.mjs:73-75`) already checks `router_contract`, `policy_version`, `capsule_schema_version`; extend it to cover the new members. Recovery remains automatic via watcher re-publish + LKG.
- **D-05:** `routes[]` stays the compact dispatch contract — `validRoutes()` and `routeContextPrompt`'s read surface are unchanged. Closure, context-budget plan, and summary-index ref are added as **sibling files in the tuple version directory** (e.g. `closure.json`, `budget.json`, `summary-index.json`), not inline keys in `index.json`. `index.json` remains the dispatch surface the hot path reads; the new members are versioned alongside it. Recovery/LKG tuple shape is unchanged (still a version dir with registry.json + index.json + manifest + siblings).

### publish-index fallback (ORC-01)
- **D-06:** **Remove the blanket fallback entirely** — delete `src/prompt/publish-index.mjs:63-67`. When no mapped subjects produce routes, `routes` is empty and `:68` throws `TypeError('compiled index requires at least one dispatch route')` (already present). No workflow-rooted route → publish fails closed → no route. This is the ORC-01 closure. A workflow-rooted-only scoped fallback is rejected: it is more code and still admits dispatch without an explicit mapping.

### Bundle + hook import graph + evidence
- **D-07:** Add `orchestrator/select.mjs`, `orchestrator/transitions.mjs`, `orchestrator/budget.mjs` to the `moduleNames` array in `src/lifecycle/router-lifecycle.mjs:308-317` so they ship in the deployed bundle. This is **required** by D-01: publish-time orchestrator calls run in the bundled controller/watcher, so the files must be present in `modules/`.
- **D-08:** The installed `~/.claude/hooks/router.mjs` import graph is **unchanged**. The hook imports only `context/prompt-route.mjs`, which reads the pre-baked tuple and calls no orchestrator. Only the controller (lifecycle/publish) needs the orchestrator, and D-07 covers that. No route-path import entanglement — this is the payoff of choosing publish-time.
- **D-09:** Prove Flow 11 flips to PASS by **extending the Phase 18 autonomous-lifecycle E2E** (`tests/router.autonomous-lifecycle.test.mjs` + `tests/router.test-mode-seam.test.mjs`), which already drives watcher→controller→publishCompiledIndex via the opt-in test_mode seam. Add assertions: closure + budget + summary-index present in the published tuple; ORC-01 no-fallback admission (empty mapping → blocked, no route); TOK-02 budget accounting (required-overflow → non-dispatchable); Flow 11 `dispatch_eligible` flips to PASS. One extended test covers all three — reuses the existing seam, no new harness. A dedicated standalone ORC-01/TOK-02 live-path integration test is rejected as redundant.
- **D-10:** **Defer the ACT-01 live prod-verifier integration test to Phase 20.** It is a non-blocking audit Warning (Warning 1) and folding it here bloats this phase. Phase 20 (EVO-05 canary production trigger) is the natural home for production-trigger-adjacent verifier wiring.

### Claude's Discretion
- Exact field names and JSON shape of the sibling tuple files (`closure.json`, `budget.json`, `summary-index.json`) — researcher/planner may align these with the existing `DEFAULT_CONTEXT_CONTRACT` / `CONTEXT_CONTRACT_VERSION` / `ESTIMATOR_VERSION` shapes in `src/orchestrator/budget.mjs`.
- Whether to expose the new tuple members through `loadCompiledIndex`'s return shape additively or behind a sub-object — pick whichever keeps `validRoutes` and the hot-path read surface smallest.
- Test naming and assertion granularity within the extended Phase 18 E2E.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Inherited phase decisions (locked — the constraints this phase operates under)
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md` — D-01 locks the hot path to read-only compact immutable index (no inventory scan / registry compile / replay / external model); D-02 locks fail-closed to verified compatible known-good; D-09..D-12 lock immutable candidates, gates, rollback, journal/LKG reuse. **The schema bump (D-04) and read-only route path (D-01) inherit directly from here.**
- `.planning/phases/16-workflow-first-orchestration-and-context-budgets/16-CONTEXT.md` — D-05..D-08 lock workflow-first selection + deterministic closure; D-09..D-13 lock least-sufficient context budgets, stable load order, deterministic token estimation, summary-reuse contract, and D-13 "context planning is side-effect-free; persistence and hot-path compilation belong to later integration surfaces." **This phase is that later integration surface.**
- `.planning/phases/18-autonomous-lifecycle-and-release-gates/18-CONTEXT.md` — D-04..D-06 lock fail-closed recovery, idempotent LKG, and the watcher→controller→publishCompiledIndex seam driven by the opt-in test_mode seam. **D-09 evidence extends this E2E.**
- `.planning/phases/14-deterministic-mapping-activation-and-rollback/14-CONTEXT.md` — immutable versions, atomic activation, known-good retention, rollback safety.
- `.planning/phases/13-target-safety-hook-reconciliation-and-quarantine/13-CONTEXT.md` — fail-closed target safety, hook reconciliation, quarantine.

### Approved architecture and milestone contract
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` — approved architecture, workflow-first orchestration, prompt-path constraints, safety boundaries.
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` — named modules, behavioral matrices, approved work packages.
- `.planning/ROADMAP.md` §Phase 19 (line 324) — authoritative phase title/goal/dependency (Phase 20 depends on this phase).
- `.planning/REQUIREMENTS.md` — ORC-01 and TOK-02 definitions and traceability (Traceability table currently marks both Complete in Phase 16; this phase closes the live-path gap that marking did not cover).

### Live code to modify (the wiring targets)
- `src/prompt/publish-index.mjs` — `publishCompiledIndex` (`:54`), `routeFor` (`:24`), blanket fallback (`:63-67`), tuple write (`:74-89`).
- `src/prompt/compile-index.mjs` — `COMPILED_INDEX_SCHEMA_VERSION` (`:5`), `COMPILED_INDEX_COMPATIBILITY` (`:6`), `compatible()` (`:73-75`), `loadCompiledIndex` (`:106`).
- `src/context/prompt-route.mjs` — `routeContextPrompt` (`:84`), compiled-index read (`:91-122`).
- `src/lifecycle/router-lifecycle.mjs` — `moduleNames` bundle list (`:308-317`).
- `src/orchestrator/{select,transitions,budget}.mjs` — the modules being wired in (exports verified: `selectCapabilities`, `resolveDependencies`, `selectWorkflow`, `nextValidTransitions`, `WORKFLOW_TRANSITIONS`, `planContextLoad`, `estimateRoutingTokens`, `validateContextContract`, `DEFAULT_CONTEXT_CONTRACT`, `CONTEXT_CONTRACT_VERSION`, `ESTIMATOR_VERSION`).
- `tests/router.autonomous-lifecycle.test.mjs`, `tests/router.test-mode-seam.test.mjs` — the E2E seam D-09 extends.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/orchestrator/{select,transitions,budget}.mjs` — already built and tested in Phase 16; this phase consumes their exports, does not rewrite them.
- `src/prompt/publish-index.mjs` `durableWrite` / `sha256` / `json` / `recoverReleaseTuple` — existing durable tuple-write + recovery primitives; new sibling files reuse `durableWrite`.
- `src/prompt/compile-index.mjs` `loadCompiledIndex` / `compatible()` / `verifyVersion` — existing compatibility gate; extend, do not replace.
- `src/lifecycle/router-lifecycle.mjs` `moduleNames` bundle mechanism (`:308-320`) — additive extension point for deployed bundle.
- Phase 18 test_mode seam (`test_mode`, `verification_runners` in `controllerConfig`) — drives the real watcher→controller→publishCompiledIndex flow without fixtures; D-09 evidence rides this seam.

### Established Patterns
- Immutable versioned tuple + atomic pointer + LKG recovery (Phase 14/17) — new sibling files inherit this; no new recovery mechanism.
- Fail-closed: missing/stale/corrupt/incompatible → verified compatible known-good, else bounded non-dispatchable diagnostic (Phase 17 D-02/D-03) — the fallback removal (D-06) follows this.
- Read-only hot path (Phase 17 D-01) — the route path stays a projection read; orchestrator never runs there.

### Integration Points
- Publish seam: `publishCompiledIndex` calls `selectCapabilities` + `planContextLoad` + transition selection, bakes results into sibling tuple files, writes via `durableWrite`.
- Route seam: `routeContextPrompt` reads the baked closure/budget/summary-index from the loaded compiled index and surfaces them (alongside the existing route projection) without calling orchestrator functions.
- Bundle seam: `router-lifecycle.mjs:308-317` `moduleNames` extended by 3 entries; `moduleValues` at `:318-320` then deploys them into both `claude` and `codex` runtime `modules/` dirs.
- Test seam: Phase 18 autonomous-lifecycle E2E (`test_mode` opt-in) drives the wired publish path end-to-end; D-09 assertions attach here.

</code_context>

<specifics>
## Specific Ideas

- Keep `routes[]` as the compact dispatch contract and put closure/budget/summary-index in sibling files — preserves `validRoutes()` and the hot-path read surface, keeps the dispatch contract and the planning contract decoupled, and leaves recovery/LKG tuple shape unchanged.
- One open question was resolved during discussion: per-prompt budget is **v2**, justified by Phase 16 D-09/D-10 (budget governs baked loaded context; required-overflow enforceable at publish via `dispatch_eligible`; the incoming prompt is the trigger, not loaded context). Recorded so downstream agents do not re-litigate.

</specifics>

<deferred>
## Deferred Ideas

- Per-prompt budget enforcement (route-time token estimate of the incoming prompt against the baked ceiling) — v2 evolution. If added later, it is a one-import pure-function call (`estimateRoutingTokens`) and is Phase 17 D-01-permitted, but it is not required for v1 TOK-02.
- ACT-01 live prod-verifier integration test — non-blocking audit Warning 1; deferred to Phase 20 (EVO-05 canary production trigger), the natural home for production-trigger-adjacent verifier wiring.
- Cross-machine registry/capsule sync, automatic third-party capability install/remove, shared multi-user policy workflows — Future Requirements (REQUIREMENTS.md), out of scope for this milestone.

</deferred>

---

*Phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions*
*Context gathered: 2026-07-17*