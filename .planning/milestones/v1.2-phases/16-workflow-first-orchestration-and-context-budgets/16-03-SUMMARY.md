---
phase: 16-workflow-first-orchestration-and-context-budgets
plan: 03
subsystem: orchestration
tags: [context-budget, deterministic-accounting, summary-reuse, privacy]

requires:
  - phase: 16-workflow-first-orchestration-and-context-budgets
    provides: One gate-safe workflow token and its safe declared capability closure
provides:
  - Versioned least-sufficient workflow context contracts with exact hard ceilings
  - Deterministic overflow, accounting, regression, and exact summary-reuse reports
  - Pure privacy-safe context load planning without I/O or Phase 17 integration
affects: [phase-17-hot-path-integration, context-compilation, routing-telemetry]

tech-stack:
  added: []
  patterns: [pure context planner, hard required-overflow gate, exact three-witness reuse]

key-files:
  created: [src/orchestrator/budget.mjs, tests/router.context-budget.test.mjs]
  modified: []

key-decisions:
  - "Canonical Phase 16 source maxima are enforced as policy ceilings; workflow contracts may only be stricter."
  - "Required overflow blocks without truncation while optional overflow is omitted in semantic priority and canonical identity order."
  - "Aggregate tokens use utf8-bytes-v1-ceil-div-3 over total canonical bytes, while every source retains its own explainable estimate."
  - "Summary reuse requires exact canonical identity, freshness witness, and summary-contract version equality."

patterns-established:
  - "Context gate order: validate workflow, validate closure, validate contract, then inspect bounded descriptors."
  - "Context reports carry bounded metadata and accounting only; source bodies are neither returned nor persisted."

requirements-completed: [TOK-01, TOK-02]

coverage:
  - id: D1
    description: "Default context plans reject broad manifest, planning-tree, conversation-history, and complete-design source classes and enforce exact per-class and total ceilings."
    requirement: TOK-01
    verification:
      - kind: unit
        ref: "tests/router.context-budget.test.mjs#contract, forbidden-source, overflow, and permutation matrix"
        status: pass
    human_judgment: false
  - id: D2
    description: "Versioned UTF-8 accounting, exact three-witness summary reuse, signed regression deltas, privacy, and no-I/O guarantees are deterministic."
    requirement: TOK-02
    verification:
      - kind: integration
        ref: "node --test tests/router.context-budget.test.mjs tests/router.context-capsule.test.mjs tests/router.context-sources.test.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "The context planner consumes the prerequisite workflow and closure facts without re-selection, persistence, hook wiring, telemetry, or compilation."
    requirement: TOK-02
    verification:
      - kind: integration
        ref: "node --test tests/router.context-budget.test.mjs tests/router.workflow-orchestrator.test.mjs tests/router.context-*.test.mjs"
        status: pass
      - kind: other
        ref: "git diff --check and Phase 17 boundary inspection"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-16
status: complete
---

# Phase 16 Plan 03: Least-Sufficient Context Budgets Summary

**A pure workflow-gated context planner now enforces exact hard byte ceilings, conservative versioned token estimates, and three-witness summary reuse without loading broad source bodies.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-16T14:30:17Z
- **Completed:** 2026-07-16T14:34:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Froze Phase 16 maxima at 2,048 transition bytes, 2,048 dependency bytes, 6,144 artifact-summary bytes, 2,048 diagnostic bytes, and 12,288 total bytes while allowing stricter workflow contracts.
- Enforced stable semantic ordering, required-overflow blocking, optional-overflow omission, forbidden broad-source rejection, and workflow/closure validation before descriptor access.
- Added `utf8-bytes-v1-ceil-div-3` per-source and aggregate accounting, signed baseline deltas, exact identity/witness/version summary reuse, privacy guards, and no-I/O boundary checks.

## Task Commits

Each task was committed atomically using TDD RED then GREEN gates:

1. **Task 1 RED: Specify context contracts and hard-budget behavior** - `97c0bdd` (test)
2. **Task 1 GREEN: Enforce workflow context budgets** - `0556226` (feat)
3. **Task 2 RED: Specify aggregate accounting and body privacy** - `b0bb0ae` (test)
4. **Task 2 GREEN: Add exact context accounting and reuse** - `79fa734` (feat)

## Files Created/Modified

- `src/orchestrator/budget.mjs` - Pure contract validation, source ordering, overflow policy, estimator, reuse, and regression reporting.
- `tests/router.context-budget.test.mjs` - Allowlist, ceiling, overflow, UTF-8, reuse, privacy, permutation, and no-I/O matrix.

## Decisions Made

- Per-source estimates remain explainable, but the total token estimate is calculated once from aggregate canonical bytes to avoid summing independently rounded values.
- Pre-accounted bounded descriptors can be planned without reading their bodies; reports expose canonical identity and accounting metadata only.
- Exact reuse mismatches return stable identity, witness, or contract-version miss reasons and use only the descriptor's bounded fallback rather than any broad body.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Full-suite execution under concurrent load produced the known sub-100ms wall-clock flakes in `router.perf.test.mjs` and `router.perf-evolved.test.mjs`. The isolated performance gate passed 6/6 immediately without code changes; no Phase 16 files touch the hot path.

## User Setup Required

None - no external service configuration required.

## TDD Gate Compliance

- RED commits: `97c0bdd`, `b0bb0ae`
- GREEN commits: `0556226`, `79fa734`
- Focused Phase 15 regression: 24/24 passing
- Phase 16/context regression: 48/48 passing
- Full suite: all functional tests passed; only pre-existing concurrent wall-clock flakes occurred, with isolated performance verification 6/6 passing

## Next Phase Readiness

Phase 17 can consume this pure JSON-ready plan for compilation and deployed-hook integration while retaining exclusive ownership of persistence, telemetry, canaries, evolution, and warm-latency measurement.

## Self-Check: PASSED

- Both required artifacts exist.
- All four TDD task commits are present in history.
- Focused, context-regression, Phase 16 integration, whitespace, privacy, import, and Phase 17 boundary checks passed.
- No installed hook, lifecycle installer, compiled runtime index, telemetry, evolution, or performance-calibration file changed.

---
*Phase: 16-workflow-first-orchestration-and-context-budgets*
*Completed: 2026-07-16*
