---
phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
plan: 02
subsystem: orchestrator
tags: [orchestrator-wiring, compiled-index, schema-bump, sibling-tuple, manifest-integrity, publish-path, tok-02, orc-01]

# Dependency graph
requires:
  - phase: 16-workflow-first-orchestration-and-context-budgets
    provides: orchestrator modules (select.mjs, transitions.mjs, budget.mjs) consumed by the publish path
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    provides: compiled-index tuple + compatibility gate + manifest integrity (V6) that the sibling shape extends
  - phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
    provides: 19-01 design contract (19-ORCHESTRATOR-INPUT-DECISION.md) implemented verbatim
provides:
  - compile-index.mjs schema 2 with extended compatible() gate, sibling hash verification (T-19-01 mitigation), and loadCompiledIndex additive closure/budget/summaryIndex keys
  - publish-index.mjs orchestrator wiring (nextValidTransitions/selectWorkflow/selectCapabilities/planContextLoad) baking per-workflow siblings
  - src/orchestrator/workflow-declarations.json static declarations source
  - Three new-behavior test scaffolds (schema2 + publish-path) covering the locked contract
  - D-06 ORC-01 closure (blanket fallback deleted) and D-03 TOK-02 closure (dispatch_eligible baked from planContextLoad)
affects: [19-03, 19-04, phase-20-evo-05-canary-production-trigger]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Publish-time orchestrator execution baked into immutable sibling tuple files via durableWrite (D-01/D-05)"
    - "Per-workflow keyed sibling maps mirror routes?.[workflowId] projection — hot path keeps the single ?.[workflowId] read surface"
    - "Manifest payload_sha256 extension to every sibling closes T-19-01 (V6 fail-closed integrity extended to siblings)"
    - "Blocked orchestrator results bake dispatch_eligible:false + reason_code instead of throwing — a single blocked workflow never aborts publish"
    - "CONTEXT_CONTRACT_VERSION inlined as a literal in compile-index.mjs to preserve the D-08 hook import graph (no src/orchestrator/* import on the hook side)"

key-files:
  created:
    - src/orchestrator/workflow-declarations.json
    - tests/router.compiled-index.schema2.test.mjs
    - tests/router.publish-index.orchestrator.test.mjs
    - .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/deferred-items.md
    - .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-02-SUMMARY.md
  modified:
    - src/prompt/compile-index.mjs
    - src/prompt/publish-index.mjs

key-decisions:
  - "Implemented 19-ORCHESTRATOR-INPUT-DECISION.md verbatim (Decisions 1-10); no design re-decisions"
  - "[Rule 1 - Bug] Plan step 4e said `closure: closureResult.closure` (the facts array) but planContextLoad's safeClosure expects the full closure result object; fixed to pass `closureResult` and documented as a deviation"
  - "v1 budget behavior: with sources:[] + DEFAULT_CONTEXT_CONTRACT (3 required source classes), planContextLoad blocks with 'required_source_class_missing' for every workflow — the dispatch_eligible flag carries that result (D-03 TOK-02 closure). Plan 04 / v2 wires per-prompt source descriptors so the budget can actually be planned"

patterns-established:
  - "Pattern: publish-time orchestrator output is frozen into sibling tuple files keyed by workflow_id (mirrors routes?.[workflowId])"
  - "Pattern: in v1, blocked budget results still produce a published tuple — non-dispatchability is per-workflow via the baked dispatch_eligible flag, not tuple-level"
  - "Pattern: schema-bump invalidation (D-04) deliberately breaks prior schema-1 fixtures; the fixture churn is owned by a later plan (Plan 04 Wave 0), not the wiring plan"

requirements-completed:
  - ORC-01  # closed: blanket canonical_record fallback deleted (D-06); empty mapping -> throw -> no route
  - TOK-02  # closed: planContextLoad dispatch_eligible baked per workflow into budget.json sibling (D-03)

coverage:
  - id: D1
    description: "compile-index.mjs schema bumped 1->2; COMPILED_INDEX_COMPATIBILITY +2 members (orchestrator_contract_version, context_contract_version); COMPILED_INDEX_LIMITS +3 sibling bounds; compatible() extended; verifyTuple reads + hash-verifies closure/budget/summary-index siblings and rejects on missing/mismatched hash (T-19-01); pointer schema_version check bumped to 2; loadCompiledIndex ready-returns gain closure/budget/summaryIndex flat keys; validRoutes() unchanged"
    requirement: ORC-01
    verification:
      - kind: automated
        ref: "node --test tests/router.compiled-index.schema2.test.mjs (13/13 pass); grep checks: COMPILED_INDEX_SCHEMA_VERSION = 2 (1), orchestrator_contract_version (2), context_contract_version (2), closure_bytes/budget_bytes/summary_index_bytes (6), closure.json (1), manifest.closure?.payload_sha256 (1), pointer?.schema_version !== 2 (1), closure: verified.closure/fallback.closure (3), from '../orchestrator (0)"
      - kind: other
        ref: "validRoutes() hunk empty in git diff (routes[] dispatch surface preserved)"
        status: pass
    human_judgment: false
  - id: D2
    description: "publish-index.mjs wires nextValidTransitions/selectWorkflow/selectCapabilities/planContextLoad per mapped workflow_id; writes closure.json/budget.json/summary-index.json siblings via durableWrite; extends manifest with closure/budget/summary_index payload_sha256; bumps pointer schema_version to 2; deletes blanket fallback at :63-67 (D-06 ORC-01 closure); blocked results bake dispatch_eligible:false (D-03 TOK-02 closure)"
    requirement: TOK-02
    verification:
      - kind: automated
        ref: "node --test tests/router.publish-index.orchestrator.test.mjs (11/11 pass) + node --test tests/router.workflow-orchestrator.test.mjs (no regression); grep checks: canonical_record (0), selectCapabilities (3), nextValidTransitions (3), planContextLoad (5), closure.json (1), budget.json (1), summary-index.json (1), closure: { payload_sha256 (1), schema_version: 2 (1), from '../orchestrator (3)"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-07-21
status: complete
---

# Phase 19 Plan 02: Wire orchestrator {select, transitions, budget} into publish-index + compile-index schema 2 Summary

**Wired the Phase 16 orchestrator modules into `publishCompiledIndex`, froze their output into per-workflow sibling tuple files (closure.json/budget.json/summary-index.json), bumped the compiled-index schema 1->2 with the extended compatibility gate, extended the manifest + verifyTuple with sibling hash verification (T-19-01 mitigation), and removed the ORC-01 blanket fallback — all against the 19-ORCHESTRATOR-INPUT-DECISION.md locked contract verbatim.**

## Performance

- **Duration:** 7 min
- **Tasks:** 2 (both TDD: RED -> GREEN)
- **Files modified:** 2 production files (compile-index.mjs, publish-index.mjs)
- **Files created:** 1 production file (workflow-declarations.json) + 2 test files + 1 deferred-items.md + this SUMMARY

## Task Commits

Each task was committed atomically with the TDD RED/GREEN cycle:

1. **Task 1: compile-index.mjs schema bump 1->2, compatible() +2 members, COMPILED_INDEX_LIMITS +3 sibling limits, verifyTuple +3 sibling hash checks, loadCompiledIndex +3 return keys, pointer schema_version 1->2** — `9392353` (feat)
   - RED: wrote `tests/router.compiled-index.schema2.test.mjs` with 13 tests covering schema bump, compatible() new members, sibling hash checks (tamper + missing hash), ready return keys, pointer schema bump, recovery/known-good paths, D-08 import-graph invariant. 9/13 failed (RED confirmed).
   - GREEN: extended compile-index.mjs per the locked contract — schema 1->2, +2 compatibility members, +3 limits, compatible() +2 checks, verifyTuple reads+hash-verifies 3 siblings + pointer schema 2, 3 ready-returns +3 keys, CONTEXT_CONTRACT_VERSION inlined (no orchestrator import). 13/13 pass.

2. **Task 2: publish-index.mjs orchestrator wiring (D-01), sibling durableWrite (D-05), manifest +3 payload_sha256 (T-19-01), fallback :63-67 delete (D-06), workflow-declarations.json static file** — `29eaabb` (feat)
   - RED: wrote `tests/router.publish-index.orchestrator.test.mjs` with 11 tests covering sibling shape, manifest hashes, loadCompiledIndex return keys, empty-mapping throw (D-06), orchestrator wiring grep, declarations file, pointer bump, routes[] unchanged, budget blocked (v1 required sources missing), closure blocked. 10/11 failed (RED confirmed).
   - GREEN: added 3 orchestrator imports, loaded workflow-declarations.json via relative path, deleted the blanket fallback, ran the 4-step orchestrator sequence per mapped workflow_id baking blocked/dispatch_eligible flags, wrote 3 sibling files via durableWrite, extended the manifest with 3 payload_sha256 fields, bumped pointer to schema 2, created workflow-declarations.json (8 workflow families). 11/11 pass.
   - **[Rule 1 - Bug] deviation:** Plan step 4e said `closure: closureResult.closure` (the facts array) but `planContextLoad`'s `safeClosure` expects the full closure result object (with `.status`, `.dispatch_eligible`, `.workflow_id`, `.transition_id`, `.closure`, `.lifecycle_bindings`). Passing the array made `safeClosure` return false and every workflow blocked with `dependency_closure_not_dispatch_eligible`. Fixed to pass `closureResult` (the object). Documented inline in the publish-index.mjs comment.

## Files Created/Modified

### Modified
- `src/prompt/compile-index.mjs` — schema bumped 1->2; +2 compatibility members; +3 sibling size limits; compatible() +2 checks; verifyTuple reads + hash-verifies closure.json/budget.json/summary-index.json against manifest.<field>.payload_sha256 (T-19-01 mitigation); pointer schema_version check bumped to 2; 3 ready-returns (active/known-good/recovery) gain `closure`/`budget`/`summaryIndex` flat keys; CONTEXT_CONTRACT_VERSION inlined as a literal (no src/orchestrator/* import — D-08 preserved); validRoutes() byte-identical (D-05 dispatch surface preserved).
- `src/prompt/publish-index.mjs` — +3 orchestrator imports (select.mjs, transitions.mjs, budget.mjs) + fileURLToPath; workflow-declarations.json read via relative path (fail-closed TypeError on missing); blanket fallback :63-67 deleted (D-06); per-mapped-workflow_id orchestrator sequence (nextValidTransitions -> selectWorkflow -> selectCapabilities -> planContextLoad) with blocked-result baking; 3 sibling durableWrite calls (closure.json/budget.json/summary-index.json); manifest +3 payload_sha256 fields; pointer schema_version bumped to 2.

### Created
- `src/orchestrator/workflow-declarations.json` — `{ schema_version: 1, _meta: {...}, declarations: [8 records] }`. gsd-execute-phase carries the owners/compatible set from the existing `tests/router.workflow-orchestrator.test.mjs:workflowDeclaration()` template; other v1.2 workflow families (brainstorming, writing-plans, gsd-discuss-phase, gsd-plan-phase, gsd-verify-work, gsd-resume-work, gsd-complete-milestone) have empty owners/requirements/compatible arrays — `declarationFor` in select.mjs tolerates empty arrays.
- `tests/router.compiled-index.schema2.test.mjs` — 13 tests covering the schema-2 contract (RED then GREEN).
- `tests/router.publish-index.orchestrator.test.mjs` — 11 tests covering the publish-path wiring (RED then GREEN).
- `deferred-items.md` — logs the 5 expected legacy `router.compiled-index.test.mjs` failures (schema-1 fixtures) as Plan 04 Wave 0 scope, not Plan 02 scope.

## Decisions Made

- **Implemented 19-ORCHESTRATOR-INPUT-DECISION.md verbatim** — all 10 locked decisions (workflowDeclarations source, evidence shape, candidate+selected bake, sibling tuple shape, manifest extension, compatible() extension, COMPILED_INDEX_LIMITS extension, pointer schema bump, loadCompiledIndex return shape, dispatch_eligible flag) were implemented as written. No design re-decisions.
- **v1 budget behavior accepted:** with `sources:[]` + `DEFAULT_CONTEXT_CONTRACT` (3 required source classes), `planContextLoad` blocks with `required_source_class_missing` for every workflow in v1. The dispatch_eligible flag carries that result (D-03 TOK-02 closure). Per-prompt source descriptors are v2 per D-03; Plan 04 / v2 wires them. The tuple still publishes (per-workflow dispatch flag is the gate, not tuple-level).
- **Pointer schema coupled to tuple schema:** Decision 8 bumped pointer `schema_version` 1->2 alongside the tuple schema bump, keeping the contract uniform. A schema-1 pointer now falls through to the legacy compiled-index path (which has no fixture) and ends in `blocked()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] planContextLoad closure argument was the facts array, not the closure result object**
- **Found during:** Task 2 GREEN phase (test 10 failed with `dependency_closure_not_dispatch_eligible` instead of `required_source_class_missing`).
- **Issue:** Plan step 4e specified `planContextLoad({ ..., closure: closureResult.closure, ... })`. `closureResult.closure` is the array of closure facts. `planContextLoad`'s `safeClosure` helper (`budget.mjs:78-82`) expects the full closure result object — it reads `closure.status`, `closure.dispatch_eligible`, `closure.workflow_id`, `closure.transition_id`, `closure.closure`, `closure.lifecycle_bindings`. Passing the array made `safeClosure` return false, so `planContextLoad` returned `blocked('dependency_closure_not_dispatch_eligible')` for every workflow, regardless of whether the closure actually resolved.
- **Fix:** Pass `closure: closureResult` (the object) instead of `closure: closureResult.closure` (the array). Verified: test 10 now sees `required_source_class_missing` (the correct v1 budget block) instead of `dependency_closure_not_dispatch_eligible`.
- **Files modified:** `src/prompt/publish-index.mjs` (one-line change + inline `[Rule 1 - Bug]` comment explaining the deviation).
- **Commit:** `29eaabb`

## Issues Encountered

- **5 expected failures in the legacy `tests/router.compiled-index.test.mjs` suite** — the schema-1 fixtures (pointer `schema_version: 1`, `CONTRACT` object missing the two new compatibility members) are deliberately invalidated by the D-04 schema bump. The plan's `<verification>` section explicitly assigns the fixture churn to Plan 04 Wave 0: "Full suite `node --test tests/*.test.mjs` is NOT expected green yet (fixture churn in Plan 04); only the directly-touched + orchestrator suites must pass." Logged to `deferred-items.md` per the scope-boundary rule (out of scope for Plan 02 — do NOT fix here).

## User Setup Required

None — no external services, env vars, or manual steps. The new `src/orchestrator/workflow-declarations.json` ships in the deployed bundle via the `moduleNames` extension in Plan 03 (D-07). No npm installs (stdlib-only per CLAUDE.md).

## Next Phase Readiness

- **Plan 03 (bundle + route path)** can now:
  - Extend `src/lifecycle/router-lifecycle.mjs:308-317` `moduleNames` with `'orchestrator/workflow-declarations.json'` + the three D-07 `.mjs` entries (`'orchestrator/select.mjs'`, `'orchestrator/transitions.mjs'`, `'orchestrator/budget.mjs'`).
  - Extend `src/context/prompt-route.mjs:104` to read the baked `compiledIndex.closure?.[workflowId]`, `compiledIndex.budget?.[workflowId]`, `compiledIndex.summaryIndex?.[workflowId]` projections and observe `dispatch_eligible` (D-03).
- **Plan 04 (Wave 0 + E2E evidence)** now has:
  - The locked sibling shape to update the ~5 legacy `router.compiled-index.test.mjs` fixtures to schema 2 (extend `CONTRACT` with the two new members, bump pointer to schema 2, add sibling files to `writeVersion`/`writePointer`-equivalents or migrate to the release-tuple shape).
  - The D-09 E2E contract: extend `tests/router.autonomous-lifecycle.test.mjs` + `tests/router.test-mode-seam.test.mjs` with assertions that closure + budget + summary-index are present in the published tuple, empty mapping throws (ORC-01), budget blocks on required-overflow (TOK-02), and Flow 11 `dispatch_eligible` flips to PASS.
- **D-08 preserved:** compile-index.mjs (transitively imported by the hook via prompt-route.mjs) does NOT import from `src/orchestrator/*`. CONTEXT_CONTRACT_VERSION is inlined as a literal. The hook import graph is unchanged.
- **T-19-01 mitigated:** sibling tampering is detected via manifest hash verification → `loadCompiledIndex` returns `blocked()`. Verified by two schema2 tests (tamper + missing-hash).
- **No blockers.** Phase 19 is ready to advance to Plan 03.

## Self-Check

- FOUND: `src/orchestrator/workflow-declarations.json`
- FOUND: `tests/router.compiled-index.schema2.test.mjs`
- FOUND: `tests/router.publish-index.orchestrator.test.mjs`
- FOUND: `src/prompt/compile-index.mjs` (modified)
- FOUND: `src/prompt/publish-index.mjs` (modified)
- FOUND: `.planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-02-SUMMARY.md`
- FOUND: `.planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/deferred-items.md`
- FOUND: commit `9392353` (Task 1)
- FOUND: commit `29eaabb` (Task 2)
- grep checks (all pass): canonical_record=0, COMPILED_INDEX_SCHEMA_VERSION = 2=1, compile-index from '../orchestrator=0 (D-08 preserved), publish-index from '../orchestrator=3 (D-01 wiring), closure_bytes/budget_bytes/summary_index_bytes=6, orchestrator_contract_version=2, context_contract_version=2, manifest.closure?.payload_sha256=1, pointer?.schema_version !== 2=1, selectCapabilities=3, nextValidTransitions=3, planContextLoad=5, closure.json=1, budget.json=1, summary-index.json=1
- Test suites: `router.compiled-index.schema2.test.mjs` 13/13 pass, `router.publish-index.orchestrator.test.mjs` 11/11 pass, `router.workflow-orchestrator.test.mjs` 16/16 pass (no regression), legacy `router.compiled-index.test.mjs` 7/12 pass (5 expected schema-1 fixture failures deferred to Plan 04).

## Self-Check: PASSED

---
*Phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions*
*Completed: 2026-07-21*