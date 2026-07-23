---
phase: 16-workflow-first-orchestration-and-context-budgets
plan: 02
subsystem: orchestration
tags: [workflow-ownership, dependency-closure, registry-safety, node-test]

requires:
  - phase: 16-workflow-first-orchestration-and-context-budgets
    provides: One gate-safe resolved workflow token from Plan 16-01
provides:
  - Workflow-first declared capability ownership and compatible explicit narrowing
  - Stable safe transitive dependency closure across all supported capability kinds
  - Lifecycle-only hook separation with bounded dependency facts for context planning
affects: [16-03-context-budgets, phase-17-hot-path-integration]

tech-stack:
  added: []
  patterns: [workflow-token boundary, declared-edge closure, canonical first-blocker traversal]

key-files:
  created: [src/orchestrator/select.mjs]
  modified: [tests/router.workflow-orchestrator.test.mjs]

key-decisions:
  - "Capability and registry traversal requires one complete dispatch-eligible workflow token."
  - "Workflow owners and requirements are the only closure roots; lexical prompt resemblance is never an edge."
  - "Hooks remain lifecycle bindings while models and permissions are reported separately from invokable capabilities."

patterns-established:
  - "Canonical closure order: skill, command, agent, mcp, tool, model, permission, hook, then canonical ID."
  - "Unsafe closure returns one stable blocker and an empty dispatchable closure."

requirements-completed: [ORC-01]

coverage:
  - id: D1
    description: "Registry access occurs only after one complete dispatch-eligible workflow token; declared ownership alone seeds capability roots."
    requirement: ORC-01
    verification:
      - kind: unit
        ref: "tests/router.workflow-orchestrator.test.mjs#workflow-first ownership and explicit compatibility matrix"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stable transitive closure covers every supported capability kind and fails closed on unsafe, unavailable, conflicting, or cyclic dependencies."
    requirement: ORC-01
    verification:
      - kind: integration
        ref: "node --test tests/router.workflow-orchestrator.test.mjs tests/router.registry-map.test.mjs"
        status: pass
    human_judgment: false
  - id: D3
    description: "Hooks are lifecycle-only bindings and closure planning introduces no I/O, persistence, hot-path compilation, or Phase 17 integration surface."
    requirement: ORC-01
    verification:
      - kind: integration
        ref: "node --test tests/*.test.mjs (541/541 passing)"
        status: pass
      - kind: other
        ref: "git diff --check and Phase 17 boundary scan"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-16
status: complete
---

# Phase 16 Plan 02: Workflow-Owned Capability Closure Summary

**A resolved workflow now deterministically owns one safe capability closure, with incompatible requests blocked and hooks kept outside ordinary invocation.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-16T14:17:55Z
- **Completed:** 2026-07-16T14:25:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Enforced a strict workflow-token gate before any registry accessor can run and selected roots only from declared ownership and requirements.
- Added compatible explicit narrowing without workflow switching, merging, or prompt-lexical capability additions.
- Added stable kind-and-ID dependency traversal with fail-closed safety, scope, permission, conflict, availability, and cycle outcomes.
- Separated invokable capabilities, required models, required permissions, and event-bound lifecycle hooks in bounded closure facts.

## Task Commits

Each task was committed atomically using TDD RED then GREEN gates:

1. **Task 1 RED: Specify workflow-first capability ownership** - `67a4529` (test)
2. **Task 1 GREEN: Enforce workflow-first capability ownership** - `7759116` (feat)
3. **Task 2 RED: Specify safe dependency closure** - `8aaf190` (test)
4. **Task 2 GREEN: Resolve safe workflow dependency closure** - `6fa16b7` (feat)

## Files Created/Modified

- `src/orchestrator/select.mjs` - Workflow-token validation, declared selection, compatible narrowing, and stable safe dependency closure.
- `tests/router.workflow-orchestrator.test.mjs` - Access ordering, lexical-negative, explicit-request, dependency-kind, blocker, cycle, hook, and permutation matrices.

## Decisions Made

- Registry records are indexed only after validating the complete Plan 16-01 selection token.
- Duplicate dependency declarations combine conservatively: any unavailable declaration keeps that dependency unavailable.
- Portable provenance is projected to canonical registry fields and bounded to 16 entries per closure fact.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial full-suite runs exposed unrelated sub-100ms wall-clock timing flakes under concurrent load. The two performance files passed 6/6 immediately in isolation, and the final full-suite run passed 541/541 without code changes.

## User Setup Required

None - no external service configuration required.

## TDD Gate Compliance

- RED commits: `67a4529`, `8aaf190`
- GREEN commits: `7759116`, `6fa16b7`
- Focused verification: 37/37 passing
- Full repository verification: 541/541 passing

## Next Phase Readiness

Plan 16-03 can consume the pure closure facts to apply source allowlists, exact byte/token ceilings, and summary-reuse contracts without re-reading registry or prompt state.

## Self-Check: PASSED

- Both required artifacts exist.
- All four TDD task commits are present in history.
- Focused, registry-regression, full-suite, whitespace, import/export, and Phase 17 boundary checks passed.
- No installed hook, lifecycle installer, persistence, telemetry, evolution, or hot-path file was modified.

---
*Phase: 16-workflow-first-orchestration-and-context-budgets*
*Completed: 2026-07-16*
