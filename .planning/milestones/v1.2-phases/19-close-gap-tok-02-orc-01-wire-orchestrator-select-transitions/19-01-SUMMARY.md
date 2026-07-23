---
phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
plan: 01
subsystem: orchestrator
tags: [orchestrator-wiring, compiled-index, schema-bump, sibling-tuple, manifest-integrity, nyquist-validation]

# Dependency graph
requires:
  - phase: 16-workflow-first-orchestration-and-context-budgets
    provides: orchestrator modules (select.mjs, transitions.mjs, budget.mjs) consumed by the publish path
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    provides: compiled-index tuple + compatibility gate + manifest integrity (V6) that the sibling shape extends
  - phase: 18-autonomous-lifecycle-and-release-gates
    provides: test_mode seam + autonomous-lifecycle E2E that Plan 04's D-09 assertions extend
provides:
  - Locked design contract for orchestrator-input sourcing (workflow-declarations.json static file + synthetic evidence shape)
  - Locked sibling-tuple shape (closure.json/budget.json/summary-index.json with by_workflow keyed maps + dispatch_eligible flag)
  - Locked manifest extension (closure/budget/summary_index payload_sha256) closing T-19-01
  - Locked compatible() extension (orchestrator_contract_version + context_contract_version) for schema 1→2 bump
  - Locked COMPILED_INDEX_LIMITS extension (closure_bytes/budget_bytes/summary_index_bytes)
  - Locked loadCompiledIndex additive flat return keys (closure, budget, summaryIndex)
  - Populated 19-VALIDATION.md Test Infrastructure + Sampling Rate + Per-Task Verification Map + Wave 0 Requirements
affects: [19-02, 19-03, 19-04, phase-20-evo-05-canary-production-trigger]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Publish-time orchestrator execution baked into immutable sibling tuple files (D-01/D-05)"
    - "Per-workflow keyed sibling maps mirror the existing routes?.[workflowId] projection surface"
    - "Synthetic publish-time evidence with position.state='planned' as canonical entry state"
    - "Bake both candidate set AND selected transition per family so route path can filter by live capsule position without calling an orchestrator"
    - "Manifest payload_sha256 extension to every sibling closes T-19-01 tampering threat (V6 fail-closed integrity)"

key-files:
  created:
    - .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-ORCHESTRATOR-INPUT-DECISION.md
    - .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-01-SUMMARY.md
  modified:
    - .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-RESEARCH.md (Open Questions Q1/Q2 marked RESOLVED)
    - .planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-VALIDATION.md (populated by Task 2)

key-decisions:
  - "workflowDeclarations source = new static file src/orchestrator/workflow-declarations.json read via relative path from publishCompiledIndex (no new param, watcher call site unchanged) [ASSUMED]"
  - "Per-workflow synthetic evidence {status:'active',freshness:'fresh',position:{family,state:'planned'},gates:{plan_approved:true},dependencies_safe:true} copied from the only existing template [ASSUMED]"
  - "Bake BOTH nextValidTransitions candidate set AND selectWorkflow selected transition per family so route path filters by live capsule position via a pure read [ASSUMED]"
  - "Sibling tuple shape = {schema_version:1, by_workflow:{<workflow_id>:{...}}} per-workflow keyed maps (mirrors routes?.[workflowId] projection)"
  - "Manifest extended with closure/budget/summary_index payload_sha256 (V6 integrity gate; verifyTuple extended in Plan 02)"
  - "COMPILED_INDEX_COMPATIBILITY extended with orchestrator_contract_version='workflow-first-v1' + context_contract_version=CONTEXT_CONTRACT_VERSION; schema 1→2 invalidates prior tuples"
  - "COMPILED_INDEX_LIMITS extended with closure_bytes:64KB, budget_bytes:32KB, summary_index_bytes:16KB (independent sibling bounds)"
  - "loadCompiledIndex gains additive flat keys closure/budget/summaryIndex (sub-object grouping rejected to keep hot-path surface smallest)"
  - "dispatch_eligible flag baked from planContextLoad result; required-overflow at publish → dispatch_eligible:false → route path synthesizes existing blocked resolution"
  - "Per-prompt budget estimation (estimateRoutingTokens on hot path) DEFERRED to v2 per D-03"

patterns-established:
  - "Pattern: Q1 design-spike decision document precedes wiring tasks; [ASSUMED] tag flags Claude's Discretion choices for plan-checker/user surfacing"
  - "Pattern: per-workflow keyed sibling files preserve the projection-shaped hot-path read surface (compiledIndex.closure?.[workflowId] mirrors compiledIndex.index.routes?.[workflowId])"
  - "Pattern: synthetic publish-time evidence with position.state='planned' as canonical entry state for family transition selection"

requirements-completed: []  # Plan 01 is a design spike; ORC-01 and TOK-02 are closed at the phase level by Plan 04's D-09 E2E evidence + v1.2-matrix.json secondary entry. They were already marked Complete from Phase 16; Plan 01 does not re-close them.

coverage:
  - id: D1
    description: "19-ORCHESTRATOR-INPUT-DECISION.md locked design contract: 10 decisions covering workflowDeclarations source, evidence shape, Q2 bake scope, sibling tuple shape, manifest extension, compatible() extension, COMPILED_INDEX_LIMITS extension, pointer schema bump, loadCompiledIndex return shape, dispatch_eligible flag"
    requirement: ORC-01
    verification:
      - kind: other
        ref: "file existence + literal-string grep checks (workflow-declarations.json, [ASSUMED] x3, orchestrator_contract_version, context_contract_version, closure/budget/summary_index.payload_sha256, closure_bytes/budget_bytes/summary_index_bytes, by_workflow, dispatch_eligible)"
        status: pass
    human_judgment: false
  - id: D2
    description: "RESEARCH.md Open Questions Q1 (workflowDeclarations + evidence source) and Q2 (transition bake scope) marked RESOLVED with pointer to 19-ORCHESTRATOR-INPUT-DECISION.md; Q3 left for Plan 04"
    requirement: ORC-01
    verification:
      - kind: other
        ref: "grep 'RESOLVED — see 19-ORCHESTRATOR-INPUT-DECISION.md' on 19-RESEARCH.md lines 393 (Q1) and 398 (Q2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "19-VALIDATION.md populated with Test Infrastructure (node --test commands), Sampling Rate (per-task/per-wave/phase-gate), Per-Task Verification Map covering ORC-01 + TOK-02 across Plans 02/03/04, and Wave 0 Requirements enumerating the 5 gaps"
    requirement: TOK-02
    verification:
      - kind: other
        ref: "grep checks: node --test tests/router.autonomous-lifecycle.test.mjs present; ORC-01 + TOK-02 rows present; {pytest 7.x} placeholder absent; full-suite command node --test tests/*.test.mjs present"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-07-21
status: complete
---

# Phase 19 Plan 01: Q1 Orchestrator-Input Sourcing Spike + Validation Scaffold Summary

**Locked the load-bearing Q1 design contract (workflow-declarations.json + synthetic evidence + sibling-tuple shape + manifest V6 extension) and populated the 19-VALIDATION.md scaffold so Plans 02/03/04 implement against a fixed contract without re-deciding.**

## Performance

- **Duration:** 2 min (verification + summary authoring; design documents were authored during plan-phase planning and committed in commits 8816bb0 + 90546bf + ec47cd5)
- **Started:** 2026-07-21T22:18:31Z
- **Completed:** 2026-07-21T22:20:00Z
- **Tasks:** 2
- **Files modified:** 4 (3 planning artifacts + this SUMMARY)

## Accomplishments
- 19-ORCHESTRATOR-INPUT-DECISION.md locks all 10 design decisions: workflowDeclarations source (new static file `src/orchestrator/workflow-declarations.json`), per-workflow synthetic evidence shape (`position.state='planned'`), Q2 resolution (bake BOTH candidate set AND selected transition per family), sibling tuple file shape (`{schema_version:1, by_workflow:{...}}`), manifest V6 extension (closure/budget/summary_index payload_sha256), compatible() extension (orchestrator_contract_version + context_contract_version), COMPILED_INDEX_LIMITS extension (closure_bytes/budget_bytes/summary_index_bytes), pointer schema bump 1→2, loadCompiledIndex additive flat keys, dispatch_eligible flag (D-03).
- RESEARCH.md Open Questions Q1 and Q2 marked RESOLVED with pointer to the decision document; Q3 (v1.2-matrix.json secondary entry) deliberately left for Plan 04 execution-time resolution.
- 19-VALIDATION.md fully populated: Test Infrastructure table with concrete `node --test` commands, Sampling Rate (per-task quick run / per-wave full suite / phase-gate v1.2 release gate), Per-Task Verification Map with 15 rows covering ORC-01 + TOK-02 across Plans 02/03/04 with Threat Refs (T-19-01/T-19-02), and Wave 0 Requirements enumerating the 5 gaps (autonomous-lifecycle D-09 assertions, test-mode-seam D-09 assertions, ~10 fixture-update files, lifecycle-recovery/compiled-index empty-mapping audit, v1.2-matrix.json secondary entry).
- No production code under `src/` modified — `git diff --name-only src/` is empty (verified). The plan is a design spike + planning-artifact edit, as specified.
- Three `[ASSUMED]` tags flag Claude's Discretion decisions (Decisions 1, 2, 3) per the planning context contract; Decisions 4–10 are mechanical implementations of locked CONTEXT.md decisions (D-04/D-05) or security requirements (V6) and are not tagged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Q1 design spike — lock orchestrator-input source + sibling tuple shape + manifest/compatibility extension** — `skipped (.planning/ gitignored)` (docs)
2. **Task 2: Populate 19-VALIDATION.md — Test Infrastructure, Sampling Rate, Per-Task Verification Map, Wave 0 Requirements** — `skipped (.planning/ gitignored)` (docs)

**Plan metadata:** `skipped (.planning/ gitignored + commit_docs:false)` (docs: complete plan)

_Note: Per `.planning/config.json`, `commit_docs: false` and `.planning/` is in `.gitignore`. The gsd-tools `commit` SDK handler returns `skipped_gitignored` for planning-artifact commits — this is the intentional success path (#3678). The plan's deliverables (19-ORCHESTRATOR-INPUT-DECISION.md, 19-VALIDATION.md, 19-RESEARCH.md, 19-01-SUMMARY.md) live on disk under `.planning/phases/19-.../` and are read by downstream Plans 02/03/04 via `@`-references, but are not committed to git history. The planning-artifact edits were authored during plan-phase (commits 8816bb0, 90546bf, ec47cd5); this execute-phase run verifies them and writes the SUMMARY._

## Files Created/Modified
- `.planning/phases/19-.../19-ORCHESTRATOR-INPUT-DECISION.md` — Locked 10-decision contract for Plans 02/03/04 to implement verbatim (workflowDeclarations source, evidence shape, Q2 bake scope, sibling tuple shape, manifest V6 extension, compatible() extension, COMPILED_INDEX_LIMITS extension, pointer schema bump, loadCompiledIndex return shape, dispatch_eligible flag)
- `.planning/phases/19-.../19-VALIDATION.md` — Populated validation contract: Test Infrastructure, Sampling Rate, Per-Task Verification Map (15 rows), Wave 0 Requirements (5 gaps), Manual-Only Verifications (none), Validation Sign-Off (deferred to validate-phase)
- `.planning/phases/19-.../19-RESEARCH.md` — Open Questions Q1 + Q2 marked `(RESOLVED — see 19-ORCHESTRATOR-INPUT-DECISION.md)` at headers; Q3 left untouched (Plan 04 resolves at execution time)
- `.planning/phases/19-.../19-01-SUMMARY.md` — This summary

## Decisions Made
- Decision 1: `workflowDeclarations` source = new static file `src/orchestrator/workflow-declarations.json` (read via relative path `join(dirname(fileURLToPath(import.meta.url)), '..', 'orchestrator', 'workflow-declarations.json')` — resolves in both source and deployed layouts; no new `publishCompiledIndex` parameter, watcher call site at `watcher.mjs:338-343` NOT extended). Rejected: (a) watcher param (would still need a home + plumbing indirection), (b) derive from registry records (registry has no owners/requirements/declarations fields). [ASSUMED — Claude's Discretion per CONTEXT.md]
- Decision 2: Per-workflow synthetic evidence `{status:'active',freshness:'fresh',position:{family:derived-from-workflow_id-prefix,state:'planned'},gates:{plan_approved:true},dependencies_safe:true}` — copied verbatim from the only existing template at `tests/router.workflow-orchestrator.test.mjs:12-21`; `position.state='planned'` is the canonical publish-time entry state. [ASSUMED]
- Decision 3: Bake BOTH `nextValidTransitions` candidate set AND `selectWorkflow(candidates, undefined)` selected transition per family. Route path reads selected transition for canonical case and filters candidates by live capsule `position.state` otherwise (pure read, D-01/D-02 compliant). Rejected: bake only selected (route path can't route from non-planned capsule state), bake only candidates (loses canonical default, forces route path to re-implement selectWorkflow). [ASSUMED]
- Decision 4: Sibling tuple shape = per-workflow keyed maps `{schema_version:1, by_workflow:{<workflow_id>:{...}}}` mirroring `routes?.[workflowId]` projection surface; blocked results baked as `dispatch_eligible:false + reason_code` (NOT thrown — D-03 required-overflow→non-dispatchable pattern). Not [ASSUMED] — mechanical implementation of D-05.
- Decision 5: Manifest extended with `closure/budget/summary_index payload_sha256` alongside existing `registry/compiled` entries; `verifyTuple` extended in Plan 02 to hash-check siblings. Closes T-19-01 (sibling tampering). Not [ASSUMED] — Security V6 requirement.
- Decision 6: `COMPILED_INDEX_COMPATIBILITY` extended with `orchestrator_contract_version:'workflow-first-v1'` + `context_contract_version:CONTEXT_CONTRACT_VERSION` (imported from `budget.mjs:4`); `compatible()` extended to check both. Invalidates all schema-1 tuples (watcher re-publishes via recovery). Not [ASSUMED] — D-04 mechanical implementation.
- Decision 7: `COMPILED_INDEX_LIMITS` extended with `closure_bytes:64*1024`, `budget_bytes:32*1024`, `summary_index_bytes:16*1024` — independent bounds so blocked routes don't pay sibling read cost. Not [ASSUMED] — Pitfall #5 mitigation.
- Decision 8: Pointer `schema_version` bumps 1→2 alongside the tuple schema bump; `verifyTuple` pointer check updates `!== 1` → `!== 2`. Not [ASSUMED] — schema coupling requirement.
- Decision 9: `loadCompiledIndex` return gains additive flat keys `closure`, `budget`, `summaryIndex` (already hash-verified by `verifyTuple`); sub-object grouping rejected to keep hot-path read surface smallest. Not [ASSUMED] — D-05 Claude's Discretion, mechanical.
- Decision 10: `dispatch_eligible` flag baked from `planContextLoad` result; per-prompt budget estimation (`estimateRoutingTokens` on hot path) DEFERRED to v2 per D-03. Not [ASSUMED] — D-03 mechanical implementation.

## Deviations from Plan

None - plan executed exactly as written. The design documents (19-ORCHESTRATOR-INPUT-DECISION.md, 19-VALIDATION.md, RESEARCH.md Q1/Q2 RESOLVED markers) were authored during the plan-phase stage (commits 8816bb0, 90546bf, ec47cd5) and verified at execute-phase time against the plan's acceptance criteria. All literal-string grep checks pass; no production code under `src/` was modified.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This is a planning-artifact-only plan; no production code, no env vars, no external services.

## Next Phase Readiness
- **Plans 02, 03, 04 can implement against the locked contract** in 19-ORCHESTRATOR-INPUT-DECISION.md without re-deciding:
  - Plan 02 (publish + compile-index wiring): implements Decisions 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 + D-06 fallback removal.
  - Plan 03 (bundle + route path): implements the `moduleNames` extension (Decision 1 bundle entry + D-07 three .mjs entries) + route-path read-only sibling projection (Decision 9 flat keys) + `dispatch_eligible` gate (Decision 10).
  - Plan 04 (Wave 0 + E2E evidence): executes the 5 Wave 0 gaps enumerated in 19-VALIDATION.md.
- **Nyquist Dimension 8 gate has a concrete contract** to enforce at validate-phase (Test Infrastructure, Sampling Rate, Per-Task Verification Map, Wave 0 Requirements all populated).
- **Security threat model** surfaces T-19-01 (sibling tampering, mitigation assigned to Plan 02's manifest extension + verifyTuple hash checks) and T-19-02 (declarations file tampering, accepted — controller-owned trusted publisher).
- **No blockers.** Phase 19 is ready to advance to Plan 02.

## Self-Check

- FOUND: `.planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-ORCHESTRATOR-INPUT-DECISION.md`
- FOUND: `.planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-VALIDATION.md`
- FOUND: `.planning/phases/19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions/19-01-SUMMARY.md`
- grep checks: workflow-declarations.json (9), [ASSUMED] (9), orchestrator_contract_version (4), context_contract_version (4), closure.payload_sha256 (2), budget.payload_sha256 (2), summary_index.payload_sha256 (2), closure_bytes (3), budget_bytes (3), summary_index_bytes (3), by_workflow (5), dispatch_eligible (9) — all ≥ required thresholds
- RESEARCH.md RESOLVED markers: 2 (Q1 line 393, Q2 line 398)
- VALIDATION.md: ORC-01 (15), TOK-02 (11), full-suite command present (3), {pytest 7.x} placeholder absent (0)
- `git diff --name-only src/` returns empty — no production code modified

## Self-Check: PASSED

---
*Phase: 19-close-gap-tok-02-orc-01-wire-orchestrator-select-transitions*
*Completed: 2026-07-21*