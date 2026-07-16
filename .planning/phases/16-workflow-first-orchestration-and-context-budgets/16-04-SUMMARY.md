---
phase: 16-workflow-first-orchestration-and-context-budgets
plan: 04
subsystem: orchestration
tags: [workflow-narrowing, context-completeness, semantic-ordering, gap-closure]

requires:
  - phase: 16-workflow-first-orchestration-and-context-budgets
    provides: Workflow-first capability closure and least-sufficient context budgeting from Plans 16-02 and 16-03
provides:
  - Compatible non-owner explicit capability narrowing through the declared safe closure
  - Required context class presence gating before byte accounting
  - Policy-owned semantic source ordering independent of caller priorities
affects: [phase-17-hot-path-integration, workflow-dispatch, context-compilation]

tech-stack:
  added: []
  patterns: [compatible-set authorization, required-class completeness gate, canonical semantic rank]

key-files:
  created: []
  modified: [src/orchestrator/select.mjs, src/orchestrator/budget.mjs, tests/router.workflow-orchestrator.test.mjs, tests/router.context-budget.test.mjs]

key-decisions:
  - "Exact compatible-set membership authorizes explicit narrowing; owner membership is not additionally required."
  - "Required descriptor classes are checked after descriptor validation and before byte accounting."
  - "Transition, dependency, artifact, and diagnostic ordering is controlled by one internal semantic rank rather than contract priority numbers."

requirements-completed: [ORC-01, TOK-01, TOK-02]

duration: 8min
completed: 2026-07-16
status: complete
---

# Phase 16 Plan 04: Workflow and Context Contract Gap Closure Summary

**Phase 16 now accepts every explicitly compatible capability through the safe declared closure and blocks incomplete or semantically misordered context plans.**

## Accomplishments

- Removed the unintended owner-membership restriction from compatible explicit narrowing while retaining declared requirements and all dependency safety checks.
- Added a deterministic `required_source_class_missing` blocker identifying the first absent mandatory class in canonical semantic order.
- Froze descriptor ordering as transition facts, dependency facts, artifact summaries, then diagnostics regardless of caller-supplied numeric priorities.
- Preserved broad-source rejection, hard ceilings, exact summary reuse, accounting, privacy, permutation stability, and the Phase 17 boundary.

## Task Commits

1. **Task 1 RED: Expose compatible non-owner narrowing gap** - `72df0ae`
2. **Task 1 GREEN: Authorize declared compatible narrowing** - `0e19ecf`
3. **Task 2 RED: Expose context completeness and ordering gaps** - `1b6c42a`
4. **Task 2 GREEN: Enforce required context class order** - `6f24db2`

## Files Modified

- `src/orchestrator/select.mjs` - Authorizes explicit roots solely through exact compatible-set membership before safe closure resolution.
- `src/orchestrator/budget.mjs` - Adds required-class completeness and policy-owned semantic ordering.
- `tests/router.workflow-orchestrator.test.mjs` - Covers compatible non-owner narrowing, retained requirements, dependencies, incompatibility, and permutation stability.
- `tests/router.context-budget.test.mjs` - Covers empty and partial mandatory inputs, priority inversion, permutation stability, and prior budgeting behavior.

## Verification

- Phase 16 focused integration: 42/42 passing.
- Context budget/capsule/source gate: 26/26 passing.
- Isolated performance gate: 6/6 passing.
- Full repository suite: 555/555 passing.
- `git diff --check`: passing.
- Scope inspection: only the four plan-declared source/test files changed by task commits; no hook, deployment, persistence, telemetry, evolution, compiled-index, or performance-calibration surface was touched.

## Deviations from Plan

None. The gap-closure plan was executed as written.

## Issues Encountered

None.

## User Setup Required

None.

## Self-Check: PASSED

- All four task commits exist.
- All declared artifacts and regressions exist.
- Focused, performance, full-suite, whitespace, privacy, and scope gates pass.

---
*Phase: 16-workflow-first-orchestration-and-context-budgets*
*Completed: 2026-07-16*
