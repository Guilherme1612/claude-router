# Phase 19: Close gap — TOK-02 + ORC-01 — wire orchestrator {select,transitions,budget} into publish-index.mjs + prompt-route.mjs live path + deployed bundle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
**Areas discussed:** Bundle + import graph + evidence (with the four coupled decisions resolved as a set)

---

## Bundle + import graph + evidence (and the three coupled decisions)

The four open decisions (closure+budget eval point, compiled-index schema bump, publish-index fallback, bundle+hook import graph+evidence) are coupled: the eval-point choice is load-bearing and collapses the other three. Discussed as one set.

| Option | Description | Selected |
|--------|-------------|----------|
| Publish-time (lightest) | Closure + budget + summary-index baked into the immutable tuple at publish; route path stays read-only projection; <100ms preserved; hook import graph unchanged. | ✓ |
| Route-time | prompt-route calls selectCapabilities/planContextLoad live against compact tuple; reflects current state; adds route-time cost. | |
| Hybrid | Closure frozen at publish, budget plan computed at route. | |

| Schema bump | Description | Selected |
|--------|-------------|----------|
| Bump version (invalidate LKG, re-publish) | Bump COMPILED_INDEX_SCHEMA_VERSION + extend COMPILED_INDEX_COMPATIBILITY; new members as sibling files in tuple dir; index.json stays compact dispatch contract. | ✓ |
| Additive non-breaking fields | Tolerate older tuples; branch for absent fields. | |

| publish-index fallback | Description | Selected |
|--------|-------------|----------|
| Remove entirely (fail closed) | Delete publish-index.mjs:63-67; no mapped routes → throw (already at :68); ORC-01 closed. | ✓ |
| Workflow-rooted-only scoped fallback | Re-derive workflow-rootedness at publish; more code; still a fallback admission. | |

| Evidence | Description | Selected |
|--------|-------------|----------|
| Extend Phase 18 autonomous-lifecycle E2E | Reuses test_mode seam; add Flow 11 / ORC-01 / TOK-02 assertions; one extended test. | ✓ |
| Dedicated ORC-01/TOK-02 live-path integration test | New harness; redundant with the E2E seam. | |
| Both | E2E + dedicated test. | |

| ACT-01 prod-verifier test | Description | Selected |
|--------|-------------|----------|
| Defer to Phase 20 | Non-blocking audit Warning 1; natural home is EVO-05 canary production trigger phase. | ✓ |
| Fold into Phase 19 | Bloats this phase; rides with either per user framing. | |

**User's choice:** Pasted the full lightest-path recommendation (publish-time across all four; bump version; remove fallback; add orchestrator to moduleNames; hook import graph unchanged; extend Phase 18 E2E; defer ACT-01 to Phase 20), then confirmed per-prompt budget = v2.
**Notes:** Verified against source before the discussion: `router-lifecycle.mjs:308-317` moduleNames lacks orchestrator/*; `prompt-route.mjs:1-4,91-122` imports no orchestrator and only reads `compiledIndex.index.routes?.[workflowId]`; `publish-index.mjs:63-67` confirmed ORC-01 leak; `compile-index.mjs:5-6,73-75` confirmed schema version + compatibility gate; orchestrator exports confirmed. Phase 17 D-01 pre-locks route-time closure out (hot path read-only). Phase 16 D-09/D-10 justify per-prompt budget as v2 (budget governs baked loaded context; required-overflow enforceable at publish via `dispatch_eligible`).

---

## Per-prompt budget (v1 vs v2) — the load-bearing confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| v2 — publish-time, route imports none | Budget governs baked loaded context only; required-overflow enforced at publish via dispatch_eligible; route path imports NO orchestrator; per-prompt headroom deferred to v2. | ✓ |
| v1 — hybrid: route-time prompt estimate | Route-time estimateRoutingTokens against baked ceiling; +1 import; entangles route path with orchestrator. | |

**User's choice:** v2 — publish-time, route imports none.
**Notes:** This resolves the one open question in the pasted recommendation and confirms the route path stays orchestrator-free.

---

## Claude's Discretion

- Exact field names/JSON shape of sibling tuple files (closure.json, budget.json, summary-index.json) — align with existing `DEFAULT_CONTEXT_CONTRACT` / `CONTEXT_CONTRACT_VERSION` / `ESTIMATOR_VERSION`.
- Whether new tuple members surface additively in `loadCompiledIndex` return or behind a sub-object — pick whichever keeps `validRoutes` and the hot-path read surface smallest.
- Test naming and assertion granularity within the extended Phase 18 E2E.

## Deferred Ideas

- Per-prompt budget enforcement (route-time token estimate of incoming prompt) — v2 evolution; one-import pure-function call if added later; not required for v1 TOK-02.
- ACT-01 live prod-verifier integration test — Phase 20 (EVO-05 canary production trigger).
- Cross-machine registry/capsule sync, automatic third-party capability install/remove, shared multi-user policy — Future Requirements, out of scope.