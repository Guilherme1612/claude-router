---
phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
plan: 03
subsystem: orchestrator
tags: [orchestrator-wiring, bundle-manifest, route-path, sibling-projection, dispatch-eligible, tok-02, orc-01, d-07, d-08]

# Dependency graph
requires:
  - phase: 16-workflow-first-orchestration-and-context-budgets
    provides: orchestrator modules (select.mjs, transitions.mjs, budget.mjs) shipped by this plan's moduleNames extension
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    provides: compiled-index tuple + loadCompiledIndex return that this plan's route path consumes
  - phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
    provides: 19-01 locked design contract (D-07/D-08/D-01/D-02/D-03) + 19-02 publish-side wiring (sibling tuple files + loadCompiledIndex additive keys)
provides:
  - Deployed bundle manifest ships orchestrator/select.mjs + transitions.mjs + budget.mjs + workflow-declarations.json (D-07)
  - Read-only route-path projection of baked closure/budget/summaryIndex siblings (D-01/D-02)
  - dispatch_eligible gate on the hot path synthesizes the existing blocked resolution for required-overflow workflows (D-03 TOK-02 closure)
  - Hook import graph unchanged (D-08 preserved) — prompt-route.mjs imports no new modules
affects: [19-04, phase-20-evo-05-canary-production-trigger]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bundle manifest extension: append orchestrator .mjs + static .json to moduleNames; the existing moduleValues loop deploys each into both runtime modules/orchestrator/ dirs automatically"
    - "Read-only sibling projection: route path reads compiledIndex.<sibling>?.by_workflow?.[workflowId] mirroring the existing compiledIndex.index.routes?.[workflowId] projection (single ?.[workflowId] read surface preserved)"
    - "Lazy sibling read gated by `projection ?` so blocked routes do NOT pay the closure/budget/summary-index read cost (Pitfall #5 mitigation, REL-01 p95 <25ms preserved)"
    - "Baked dispatch_eligible gate: publish-time required-overflow -> bakedBudget.dispatch_eligible === false -> route path synthesizes the existing blocked resolution before any capsule mutation (D-03 TOK-02 hot-path closure)"
    - "Defensive `?? null` defaults for legacy tuples missing siblings — schema-2 invalidation is the live gate; null fallback is defense-in-depth"

key-files:
  created:
    - tests/router.modulenames.orchestrator.test.mjs
    - tests/router.prompt-route.baked-sibling.test.mjs
    - .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-03-SUMMARY.md
  modified:
    - src/lifecycle/router-lifecycle.mjs
    - src/context/prompt-route.mjs

key-decisions:
  - "Implemented 19-ORCHESTRATOR-INPUT-DECISION.md D-07 + D-08 + D-01/D-02 + D-03 verbatim; no design re-decisions"
  - "Task 1 TDD: created tests/router.modulenames.orchestrator.test.mjs as the static-invariant RED gate (mirrors tests/router.test-mode-seam.test.mjs:103-110 pattern); Plan 04 extends test-mode-seam with D-09 deployed-bytes-equal-source-bytes assertions for the four new files"
  - "Task 2 TDD: created tests/router.prompt-route.baked-sibling.test.mjs with 4 tests (blocked baked budget, eligible baked budget -> siblings in compiled return, legacy missing siblings -> null fallback, D-08 static invariant)"
  - "Sibling read shape confirmed: compiledIndex.closure?.by_workflow?.[workflowId] (NOT compiledIndex.closure?.[workflowId]) — the sibling files are {schema_version, by_workflow:{...}} objects per Decision 4, so the route path must dereference by_workflow. Matches the plan's locked `compiledIndex.closure?.by_workflow?.[workflowId]` read expression."

patterns-established:
  - "Pattern: bundle manifest entries are appended (never reordered) so existing deployed-byte-equal-source-byte assertions in test-mode-seam continue to hold; new entries land at the tail of moduleNames"
  - "Pattern: route-path sibling projection rides on the additive loadCompiledIndex return (no new import); the existing `import { loadCompiledIndex } from '../prompt/compile-index.mjs'` suffices for D-08"

requirements-completed:
  - ORC-01  # read-side closure: route path is a read-only projection of baked siblings (never calls an orchestrator function); D-07 bundle ships the orchestrator modules the controller imports. Plan 04 D-09 E2E closes the phase-level requirement.
  - TOK-02  # hot-path closure: baked dispatch_eligible flag observed in prompt-route.mjs -> blocked resolution for required-overflow workflows. Plan 04 D-09 E2E closes the phase-level requirement.

coverage:
  - id: D1
    description: "router-lifecycle.mjs moduleNames array extended with 4 entries: 'orchestrator/select.mjs', 'orchestrator/transitions.mjs', 'orchestrator/budget.mjs', 'orchestrator/workflow-declarations.json'; moduleValues unchanged (existing loop deploys all four into both runtime modules/orchestrator/ dirs); existing entries not removed or reordered"
    requirement: ORC-01
    verification:
      - kind: automated
        ref: "node --test tests/router.modulenames.orchestrator.test.mjs (5/5 pass) + node --test tests/router.test-mode-seam.test.mjs (3/3 pass, no regression); grep checks: 'orchestrator/select.mjs'=1, 'orchestrator/transitions.mjs'=1, 'orchestrator/budget.mjs'=1, 'orchestrator/workflow-declarations.json'=1; git diff shows only 2 new lines in moduleNames array"
        status: pass
      - kind: other
        ref: "moduleValues deployment loop unchanged (readFileSync(join(sourceRoot, name)) resolves to src/orchestrator/<name> for each new entry; destination is <runtimeRoot>/modules/orchestrator/<name>)"
        status: pass
    human_judgment: false
  - id: D2
    description: "prompt-route.mjs routeContextPrompt body extended: (1) baked dispatch_eligible gate after the existing compiled_workflow_missing gate and before the save/refresh block — when compiledIndex.budget?.by_workflow?.[workflowId].dispatch_eligible === false, synthesize the existing blocked resolution with bakedBudget.reason_code; (2) compiled return field extended with closure/budget/summaryIndex sibling projections (compiledIndex.<sibling>?.by_workflow?.[workflowId] ?? null) behind the existing `projection ?` gate; (3) NO new imports (D-08 preserved)"
    requirement: TOK-02
    verification:
      - kind: automated
        ref: "node --test tests/router.prompt-route.baked-sibling.test.mjs (4/4 pass); grep checks: from '../orchestrator=0 (D-08 preserved), compiledIndex.closure=1, compiledIndex.budget=2, compiledIndex.summaryIndex=1, bakedBudget.dispatch_eligible === false=2, ?? null=4; git diff shows changes only inside routeContextPrompt body — no import line added, no helper modified"
        status: pass
      - kind: other
        ref: "loadCompiledIndex call at :91 byte-identical to pre-edit version (no new args, no new fs override); validRoutes() not touched (D-05 dispatch surface preserved)"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-21
status: complete
---

# Phase 19 Plan 03: Bundle orchestrator modules + wire prompt-route.mjs as read-only sibling projection Summary

**Extended the deployed bundle manifest with the three orchestrator .mjs modules + workflow-declarations.json (D-07) and extended prompt-route.mjs as a read-only projection consumer of the baked closure/budget/summaryIndex siblings with a baked dispatch_eligible gate (D-03 TOK-02 hot-path closure) — all against the 19-ORCHESTRATOR-INPUT-DECISION.md locked contract verbatim, with zero new imports on the hook import graph (D-08 preserved).**

## Performance

- **Duration:** 4 min
- **Tasks:** 2 (both TDD: RED -> GREEN)
- **Files modified:** 2 production files (router-lifecycle.mjs, prompt-route.mjs)
- **Files created:** 2 test files + this SUMMARY

## Task Commits

Each task was committed atomically with the TDD RED/GREEN cycle:

1. **Task 1: router-lifecycle.mjs moduleNames +4 entries (D-07 + workflow-declarations.json)** — `7370725` (feat)
   - RED: wrote `tests/router.modulenames.orchestrator.test.mjs` with 5 static-invariant tests (one per new literal + existing-entries-preserved). 4/5 failed (RED confirmed).
   - GREEN: appended 4 entries to the moduleNames array (`'orchestrator/select.mjs'`, `'orchestrator/transitions.mjs'`, `'orchestrator/budget.mjs'`, `'orchestrator/workflow-declarations.json'`). The existing `moduleValues` loop deploys all four into both `<ownedRoot>/modules/orchestrator/` and `<codexOwnedRoot>/modules/orchestrator/` automatically — no moduleValues change needed. 5/5 pass. Existing `tests/router.test-mode-seam.test.mjs` still passes 3/3 (no regression).

2. **Task 2: prompt-route.mjs read-only sibling projection (D-01/D-02) + dispatch_eligible gate (D-03) + no new imports (D-08)** — `c888463` (feat)
   - RED: wrote `tests/router.prompt-route.baked-sibling.test.mjs` with 4 tests: (a) dispatch_eligible:false baked budget -> blocked resolution with baked reason_code (D-03); (b) dispatch_eligible:true baked budget -> compiled return includes closure/budget/summaryIndex siblings (D-01/D-02); (c) legacy tuple missing siblings -> ?? null fallback without throwing; (d) D-08 static invariant (no `from '../orchestrator'` import in source). 3/4 failed (RED confirmed; the D-08 invariant test already passed because no new import was added yet).
   - GREEN: added the baked dispatch_eligible gate after the existing `compiled_workflow_missing` gate and before the save/refresh block; extended the `compiled` return field with `closure`/`budget`/`summaryIndex` sibling projections (each `compiledIndex.<sibling>?.by_workflow?.[workflowId] ?? null`) behind the existing `projection ?` gate. NO new imports. 4/4 pass.

## Files Created/Modified

### Modified
- `src/lifecycle/router-lifecycle.mjs` — `moduleNames` array extended with 4 entries (appended; existing entries not removed or reordered). `moduleValues` deployment loop unchanged — the existing `[p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))]))` resolves each new entry to `src/orchestrator/<name>` and deploys into `<runtimeRoot>/modules/orchestrator/<name>` for both runtime roots.
- `src/context/prompt-route.mjs` — `routeContextPrompt` body extended in exactly two places: (1) a new `bakedBudget` dispatch_eligible gate between the existing `compiled_workflow_missing` gate and the save/refresh block; (2) three new sibling keys (`closure`, `budget`, `summaryIndex`) added to the `compiled` return field behind the existing `projection ?` gate. NO new imports. NO other helpers modified.

### Created
- `tests/router.modulenames.orchestrator.test.mjs` — 5 static-invariant tests for the moduleNames extension (RED then GREEN). Plan 04 extends `tests/router.test-mode-seam.test.mjs` with D-09 deployed-bytes-equal-source-bytes assertions for the four new files.
- `tests/router.prompt-route.baked-sibling.test.mjs` — 4 tests covering the read-only sibling projection + dispatch_eligible gate + legacy fallback + D-08 static invariant (RED then GREEN).

## Decisions Made

- **Implemented 19-ORCHESTRATOR-INPUT-DECISION.md D-07 + D-08 + D-01/D-02 + D-03 verbatim** — no design re-decisions. The four moduleNames entries, the sibling read shape (`compiledIndex.<sibling>?.by_workflow?.[workflowId]`), the dispatch_eligible gate, and the no-new-imports constraint are all locked-contract implementations.
- **Sibling read shape confirmed against Plan 02:** the sibling files are `{schema_version, by_workflow: {...}}` objects per Decision 4 (baked by publish-index.mjs in Plan 02). The route path must dereference `by_workflow` to project per-workflow — `compiledIndex.closure?.by_workflow?.[workflowId]`, NOT `compiledIndex.closure?.[workflowId]`. This matches the plan's locked read expression and the schema2 test's `loaded.closure.by_workflow` shape.
- **Lazy sibling read preserved:** siblings are only read inside the existing `projection ?` gate, so a blocked route (no projection) pays zero sibling-read cost. The new `bakedBudget` gate is also gated by `projection &&` so a missing projection never triggers the baked-budget blocked path (the earlier `compiled_workflow_missing` gate handles that case). REL-01 p95 <25ms preserved (Pitfall #5 mitigated).

## Deviations from Plan

None - plan executed exactly as written. Both tasks landed as TDD RED -> GREEN with no auto-fixes required. The known_state note about ~35 pre-existing schema-1 fixture failures in the broader test suite is Plan 04 Wave 0 scope; this plan's own new tests (12/12 across the three suites) all pass, and the existing test-mode-seam test still passes 3/3 with no regression.

## Issues Encountered

- **Pre-existing schema-1 fixture failures in the broader suite** (~35 tests in `router.compiled-index.test.mjs`, `router.context-prompt-integration.test.mjs`, and related suites that hardcode schema-1 fixtures) are NOT addressed here. They are the designed consequence of Plan 02's schema 1->2 bump and the D-06 fallback removal, and Plan 04 (Wave 4) is the dedicated sweep that bumps those fixtures to schema 2. Per the known_state directive, these failures are expected and deferred — out of scope for Plan 03.

## User Setup Required

None — no external services, env vars, or manual steps. The four new moduleNames entries ship in the deployed bundle via the existing `moduleValues` deployment loop. No npm installs (stdlib-only per CLAUDE.md).

## Next Phase Readiness

- **Plan 04 (Wave 0 + E2E evidence)** can now:
  - Extend `tests/router.test-mode-seam.test.mjs` with D-09 deployed-bytes-equal-source-bytes assertions for the four new files (`<ownedRoot>/modules/orchestrator/select.mjs`, `transitions.mjs`, `budget.mjs`, `workflow-declarations.json` + the `<codexOwnedRoot>/...` counterparts).
  - Extend `tests/router.autonomous-lifecycle.test.mjs` with D-09 E2E assertions that closure + budget + summary-index are present in the published tuple, empty mapping throws (ORC-01), budget blocks on required-overflow (TOK-02), and Flow 11 `dispatch_eligible` flips to PASS.
  - Sweep the ~35 schema-1 fixture failures to schema 2 (extend `CONTRACT` with the two new compatibility members, bump pointer to schema 2, add sibling files to `writeVersion`/`writePointer`-equivalents or migrate to the release-tuple shape used by `tests/router.compiled-index.schema2.test.mjs`).
  - Add the Phase 19 secondary evidence entry for ORC-01 + TOK-02 to `v1.2-matrix.json` (Q3 resolution at execution time).
- **D-08 preserved:** the hook (~/.claude/hooks/router.mjs) imports `context/prompt-route.mjs`; prompt-route.mjs imports only `./capsule.mjs`, `./resolve.mjs`, `./sources.mjs`, `../prompt/compile-index.mjs` (unchanged). The new sibling keys ride on the existing `loadCompiledIndex` return. The hook import graph is byte-identical to the pre-Plan-03 graph.
- **D-07 satisfied:** the deployed bundle ships the three orchestrator .mjs modules and workflow-declarations.json. The deployed controller (`publish-index.mjs`, already in moduleNames) imports from `../orchestrator/*` (Plan 02 wiring); those imports now resolve inside the deployed `modules/orchestrator/` dir.
- **No blockers.** Phase 19 is ready to advance to Plan 04.

## Self-Check

- FOUND: `src/lifecycle/router-lifecycle.mjs` (modified — 4 new moduleNames entries)
- FOUND: `src/context/prompt-route.mjs` (modified — dispatch_eligible gate + 3 sibling projections)
- FOUND: `tests/router.modulenames.orchestrator.test.mjs`
- FOUND: `tests/router.prompt-route.baked-sibling.test.mjs`
- FOUND: commit `7370725` (Task 1)
- FOUND: commit `c888463` (Task 2)
- grep checks (all pass): 'orchestrator/select.mjs'=1, 'orchestrator/transitions.mjs'=1, 'orchestrator/budget.mjs'=1, 'orchestrator/workflow-declarations.json'=1, from '../orchestrator in prompt-route=0 (D-08 preserved), compiledIndex.closure=1, compiledIndex.budget=2, compiledIndex.summaryIndex=1, bakedBudget.dispatch_eligible === false=2, ?? null=4
- Test suites: `router.modulenames.orchestrator.test.mjs` 5/5 pass, `router.prompt-route.baked-sibling.test.mjs` 4/4 pass, `router.test-mode-seam.test.mjs` 3/3 pass (no regression). 12/12 across the plan's three verification suites.
- git diff `src/lifecycle/router-lifecycle.mjs`: only 2 new lines in the moduleNames array literal (no other lines changed)
- git diff `src/context/prompt-route.mjs`: only inside the `routeContextPrompt` body (no import line added, no helper modified, loadCompiledIndex call byte-identical)

## Self-Check: PASSED

---
*Phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions*
*Completed: 2026-07-21*