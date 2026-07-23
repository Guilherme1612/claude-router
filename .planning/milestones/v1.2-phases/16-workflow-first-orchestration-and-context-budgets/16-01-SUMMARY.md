---
phase: 16-workflow-first-orchestration-and-context-budgets
plan: 01
subsystem: orchestration
tags: [workflow-policy, deterministic-transitions, explicit-precedence, node-test]

requires:
  - phase: 15-context-capsules-and-workflow-state-recovery
    provides: Authoritative bounded workflow evidence and stable non-dispatchable outcome conventions
provides:
  - Frozen versioned transition policy covering five workflow families
  - Gate-safe deterministic workflow candidate evaluation
  - Explicit valid-transition selection and one-question ambiguity handling
affects: [16-02-capability-closure, 16-03-context-budgets, phase-17-hot-path-integration]

tech-stack:
  added: []
  patterns: [pure decision module, fail-closed transition algebra, semantic candidate deduplication]

key-files:
  created: [src/orchestrator/transitions.mjs, tests/router.workflow-orchestrator.test.mjs]
  modified: []

key-decisions:
  - "Workflow transitions are frozen data records evaluated only from bounded authoritative evidence."
  - "Explicit intent narrows already-valid transitions and can never manufacture or reopen one."
  - "Material ties remain non-dispatchable and produce one bounded deterministic question."

patterns-established:
  - "Workflow-first gate: transition evidence is validated before any capability or registry concern."
  - "Stable selection token: downstream plans receive exactly one bounded selected transition or a fail-closed outcome."

requirements-completed: [ORC-01]

coverage:
  - id: D1
    description: "Canonical workflow transitions fail closed across gates, terminal state, stale evidence, dependency safety, and invalid positions."
    requirement: ORC-01
    verification:
      - kind: unit
        ref: "tests/router.workflow-orchestrator.test.mjs#canonical transition and negative gate matrix"
        status: pass
    human_judgment: false
  - id: D2
    description: "Complete explicit intent selects only a valid transition while ambiguity returns one non-dispatchable clarification."
    requirement: ORC-01
    verification:
      - kind: unit
        ref: "tests/router.workflow-orchestrator.test.mjs#explicit precedence and material tie matrix"
        status: pass
      - kind: integration
        ref: "node --test tests/router.workflow-orchestrator.test.mjs tests/router.context-resume.test.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "The transition layer is pure, permutation-stable, capability-blind, and introduces no Phase 17 integration surface."
    requirement: ORC-01
    verification:
      - kind: integration
        ref: "node --test tests/*.test.mjs (534/534 passing)"
        status: pass
      - kind: other
        ref: "git diff --check and import/boundary scan"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-07-16
status: complete
---

# Phase 16 Plan 01: Canonical Workflow Transition Policy Summary

**Frozen workflow-family transitions now resolve authoritative evidence into one gate-safe token or a stable non-dispatchable outcome before any capability concern is touched.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-16T14:10:38Z
- **Completed:** 2026-07-16T14:13:40Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a frozen, versioned transition matrix spanning brainstorming, GSD progression, interrupted execution, verification gaps, and milestone closeout.
- Enforced freshness, terminal, dependency, and approval gates with stable fail-closed reason codes and permutation-stable candidate facts.
- Added explicit valid-transition selection, semantic duplicate collapse, and exactly one bounded clarification for material ties without exposing prompt or stale-goal prose.

## Task Commits

Each task was committed atomically using TDD RED then GREEN gates:

1. **Task 1 RED: Specify transition behavior** - `37bbdc1` (test)
2. **Task 1 GREEN: Implement canonical transition policy** - `99f81a3` (feat)
3. **Task 2 RED: Specify explicit precedence and ambiguity behavior** - `ad7c3b9` (test)
4. **Task 2 GREEN: Implement workflow selection** - `62aeb7b` (feat)

## Files Created/Modified

- `src/orchestrator/transitions.mjs` - Pure canonical transition and workflow-selection policy.
- `tests/router.workflow-orchestrator.test.mjs` - Workflow-family, negative-gate, determinism, purity, precedence, and ambiguity matrix.

## Decisions Made

- Transition candidates are bounded records containing only transition/workflow identity, family, and from/to state.
- Complete explicit intent matches exact transition or workflow identity only after authoritative transition validation.
- Semantic duplicates collapse before selection; materially different candidates never dispatch without resolution.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## TDD Gate Compliance

- RED commits: `37bbdc1`, `ad7c3b9`
- GREEN commits: `99f81a3`, `62aeb7b`
- Focused verification: 13/13 passing
- Full repository verification: 534/534 passing

## Next Phase Readiness

Plan 16-02 can consume the single bounded workflow token and derive declared capability/dependency closure without re-evaluating prompt text or workflow evidence.

## Self-Check: PASSED

- Both required artifacts exist.
- All four TDD task commits are present in history.
- Focused and full-suite verification passed.
- No registry, filesystem, deployment-hook, evolution, or persistence import was introduced.

---
*Phase: 16-workflow-first-orchestration-and-context-budgets*
*Completed: 2026-07-16*
