---
phase: 16
slug: workflow-first-orchestration-and-context-budgets
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
---

# Phase 16 — Validation Strategy

> Per-phase Nyquist contract for workflow-first orchestration, safe dependency closure, and least-sufficient context budgets.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Native `node:test` with `node:assert/strict` |
| **Config file** | none — repository uses direct `node --test` commands |
| **Quick run command** | `node --test tests/router.workflow-orchestrator.test.mjs tests/router.context-budget.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Expected focused latency** | under 10 seconds per task command; no watch mode |
| **Expected full-suite latency** | measured during execution; completion requires a finite non-watch run |

## Sampling Rate and Wave Coverage

- **After every task:** Run that task's focused automated command before commit.
- **After Wave 1:** Run workflow transition tests plus Phase 15 resolver regression tests.
- **After Wave 2:** Run the complete workflow-orchestrator matrix plus registry map regression tests.
- **After Wave 3:** Run both Phase 16 focused files plus all Phase 15 context tests.
- **Before independent verification:** Run `node --test tests/*.test.mjs` and `git diff --check`, then inspect the diff for Phase 17 boundary violations.
- **Maximum expected focused feedback latency:** 10 seconds. A slower or flaky focused command must be diagnosed before proceeding; no task may rely on watch mode or manual observation.

| Wave | Plans | Required evidence before next wave |
|------|-------|------------------------------------|
| 0 | Test scaffolds | Both approved test files exist with failing behavior matrices covering all mapped decisions. |
| 1 | 16-01 | Transition policy, gates, terminal safety, explicit precedence, ambiguity, and permutation tests green. |
| 2 | 16-02 | Workflow-first access, declared ownership, closure safety, hook separation, and no-lexical-selection tests green. |
| 3 | 16-03 | Allowlist, exact ceilings, overflow, estimator, reuse, regression, privacy, and no-I/O tests green. |

## Requirement and Decision-to-Test Map

| Source | ID | Behavioral proof | Primary test |
|--------|----|------------------|--------------|
| REQ | ORC-01 | Registry/capability access occurs only after one dispatch-eligible workflow; lexical MCP/tool coincidence cannot seed selection. | `tests/router.workflow-orchestrator.test.mjs` |
| REQ | TOK-01 | Default context rejects full manifest, planning tree, conversation history, and complete design body source classes. | `tests/router.context-budget.test.mjs` |
| REQ | TOK-02 | Declared per-source/total ceilings, exact summary reuse witnesses, and stable accounting/regression deltas are enforced. | `tests/router.context-budget.test.mjs` |
| CONTEXT | D-01 | Phase 15 authoritative state and valid transitions are evaluated before registry access. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-02 | Complete explicit intent selects only a valid gate-safe, non-terminal transition. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-03 | Material ties yield exactly one smallest clarification and remain non-dispatchable without lexical tie-break. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-04 | Brainstorm/design, GSD, interrupted execution, verification-gap, and milestone gates fail closed with stable reasons. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-05 | Declared workflow ownership alone seeds capabilities; lexical resemblance adds nothing. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-06 | Stable transitive closure covers every capability kind and reports the first canonical unsafe/unavailable blocker. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-07 | Compatible explicit capability requests narrow; incompatible requests block without workflow switching/merging. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-08 | Hooks appear only as lifecycle bindings and never as invokable capabilities. | `tests/router.workflow-orchestrator.test.mjs` |
| CONTEXT | D-09 | Contracts require allowed classes, exact per-class ceilings, total ceiling, and required/optional priority. | `tests/router.context-budget.test.mjs` |
| CONTEXT | D-10 | Stable priority order, required-overflow block, and optional-overflow omission are exact and permutation-stable. | `tests/router.context-budget.test.mjs` |
| CONTEXT | D-11 | `utf8-bytes-v1-ceil-div-3` reports exact canonical bytes/tokens, included/omitted sources, ceilings, and deltas. | `tests/router.context-budget.test.mjs` |
| CONTEXT | D-12 | Reuse requires identity+witness+contract-version equality; broad-body fallback is impossible. | `tests/router.context-budget.test.mjs` |
| CONTEXT | D-13 | Context planning is pure; I/O spies and diff inspection prove no persistence/hot-path/evolution work. | `tests/router.context-budget.test.mjs` plus boundary inspection |

## Per-Task Verification Map

| Task ID | Wave | Requirements | Decisions | Test Type | Automated Command | Test File Status | Execution Status |
|---------|------|--------------|-----------|-----------|-------------------|------------------|------------------|
| 16-01-01 | 1 | ORC-01 | D-01, D-04 | unit + policy matrix | `node --test tests/router.workflow-orchestrator.test.mjs` | ❌ Wave 0 create | ⬜ pending |
| 16-01-02 | 1 | ORC-01 | D-02, D-03, D-13 | unit + Phase 15 regression | `node --test tests/router.workflow-orchestrator.test.mjs tests/router.context-resume.test.mjs` | ❌ Wave 0 create | ⬜ pending |
| 16-02-01 | 2 | ORC-01 | D-01–D-05, D-07 | unit + instrumented-access matrix | `node --test tests/router.workflow-orchestrator.test.mjs` | ❌ Wave 0 extend | ⬜ pending |
| 16-02-02 | 2 | ORC-01 | D-06, D-08, D-13 | unit + registry regression | `node --test tests/router.workflow-orchestrator.test.mjs tests/router.registry-map.test.mjs` | ❌ Wave 0 extend | ⬜ pending |
| 16-03-01 | 3 | TOK-01, TOK-02 | D-01–D-10, D-13 | unit + boundary matrix | `node --test tests/router.context-budget.test.mjs` | ❌ Wave 0 create | ⬜ pending |
| 16-03-02 | 3 | TOK-02 | D-11–D-13 | unit + Phase 15 context regression | `node --test tests/router.context-budget.test.mjs tests/router.context-capsule.test.mjs tests/router.context-sources.test.mjs` | ❌ Wave 0 create | ⬜ pending |

*Execution status: ⬜ pending · ✅ green · ❌ red · ⚠ flaky*

## Wave 0 Requirements and Status

No framework or shared third-party fixture dependency is missing. Wave 0 is intentionally incomplete until execution creates the approved tests before production code.

- [ ] `tests/router.workflow-orchestrator.test.mjs` — create before `transitions.mjs`; cover canonical IDs, all five workflow families, explicit precedence, one-question ambiguity, terminal/gate negatives, workflow-first registry access, declared capability closure, safety/availability/cycles, explicit narrowing, hooks, lexical negatives, and permutations.
- [ ] `tests/router.context-budget.test.mjs` — create before `budget.mjs`; cover source-class allowlists, canonical ceilings `2048/2048/6144/2048` and total `12288`, stricter workflow contracts, required/optional overflow-by-one, UTF-8 estimator boundaries, reuse hit and three mismatch cases, regression deltas, forbidden broad sources, privacy canaries, permutations, and injected-I/O spies.
- [ ] Small local builders for Phase 15 outcomes, workflow/transition policies, canonical registry graphs, context contracts, source descriptors, and summary descriptors. Builders remain inside the two test files unless reuse proves necessary.
- [ ] RED evidence: each test file must fail for the intended missing production behavior before implementation begins.

**Wave 0 status:** incomplete by design; all missing test references are assigned to the first TDD task that consumes them, so execution has no unowned validation dependency.

## Manual and Automated Classification

All behavioral acceptance criteria are automated. The only manual/static completion evidence is repository-boundary inspection after automated tests:

| Check | Classification | Evidence |
|-------|----------------|----------|
| Workflow, closure, budget, estimator, reuse, privacy, and determinism behavior | Automated | Focused `node --test` commands above |
| Full regression compatibility | Automated | `node --test tests/*.test.mjs` |
| Patch formatting | Automated | `git diff --check` |
| Phase 17 boundary: no installed hook, lifecycle installer, compiled index, telemetry, canary, evolution, or performance calibration changes | Manual/static inspection | `git diff --name-only` compared with Phase 16 plan ownership |

No user-facing visual or interactive behavior requires human verification in Phase 16.

## Nyquist Completeness

- [x] Every plan task has an explicit finite `<automated>` command.
- [x] Every requirement and every D-01 through D-13 decision maps to at least one behavior test.
- [x] Negative guarantees and boundary-by-one cases are specified, not inferred from happy paths.
- [x] Each wave has a focused feedback gate before its dependent wave.
- [x] Wave 0 owns both missing test files and their required fixture builders.
- [x] No three consecutive implementation tasks can occur without automated feedback; sampling occurs after every task.
- [x] Manual inspection is limited to the Phase 17 file-boundary assertion and supplements rather than replaces automation.
- [x] `nyquist_compliant: true` is declared in frontmatter.

**Approval:** validated 2026-07-23 after post-milestone Nyquist reconciliation; full sequential suite passed.
