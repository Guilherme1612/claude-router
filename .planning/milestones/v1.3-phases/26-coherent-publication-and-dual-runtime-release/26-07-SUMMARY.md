---
phase: 26-coherent-publication-and-dual-runtime-release
plan: 07
subsystem: release-performance
tags: [performance, context-budget, dual-runtime, large-registry]
requires:
  - phase: 26-05
    provides: Installed Claude and Codex route closure
  - phase: 26-06
    provides: Verified complete-tuple publication authority
provides:
  - Deterministic 312-record mixed registry fixture
  - Installed Claude and Codex route evidence for all six recommendation kinds
  - Machine-readable isolated latency and context metrics
affects: [release-verification, performance-gate, context-budget]
tech-stack:
  added: []
  patterns: [indexed deterministic fixture, installed-module benchmark, RELEASE_METRICS evidence]
key-files:
  modified:
    - tests/helpers/inventory-fixture.mjs
    - tests/router.phase26-performance.test.mjs
key-decisions:
  - "Generate compact normalized publication projections from the full realistic build so existing tuple bounds remain enforced."
  - "Measure each runtime and recommendation kind independently with five warmups and twenty retained samples."
requirements-completed: [REL-01, REL-06, REL-07]
duration: 24min
completed: 2026-07-28
status: complete
---

# Phase 26 Plan 07: Large-Registry Installed Performance Summary

**A deterministic 312-record registry now proves installed Claude and Codex routing across all six recommendation kinds with strict isolated latency and context budgets.**

## Accomplishments

- Added deterministic indexed generation for command, skill, agent, workflow, MCP, and tool records across both runtimes.
- Built contracts, relationship edges, workflows, and the full v1.3 tuple, then exercised the real installer-deployed publish, load, select, and prompt-route modules.
- Measured 12 installed runtime/kind cases with 20 retained samples each after warmup.
- Emitted one machine-readable `RELEASE_METRICS` record for the release gate.

## Task Commits

1. **Task 1 RED:** `40f7381` (`test(26-07): add large registry RED gate`)
2. **Task 1 generator:** `7d045ea` (`feat(26-07): generate realistic mixed registry fixture`)
3. **Task 1 installed evidence:** `c93efbd` (`test(26-07): prove installed large-registry routing`)
4. **Task 2 RED:** `91e4911` (`test(26-07): add latency and context RED gate`)
5. **Task 2 GREEN:** `4209471` (`test(26-07): emit isolated installed route metrics`)

## Deviations from Plan

None - production release limits and gates were reused unchanged.

## Verification

- `rtk node --test tests/router.phase26-performance.test.mjs --test-name-pattern="registry|installed|kind"` — 3 passed, 0 failed.
- `rtk node --test tests/router.phase26-performance.test.mjs` — 3 passed, 0 failed.
- Final metrics: 312 records, 12 cases, 240 retained samples, 0.441 ms warm p95, 0.804 ms max, 194 context bytes, 65 estimated tokens.

## Known Stubs

None.

## Security

- T-26-15: scale, sample counts, thresholds, and metrics are asserted and machine-readable.
- T-26-16: every emitted context is checked against the 2,048-byte and 683-token bounds.

## Self-Check: PASSED

- Both modified test files exist.
- All five task commits exist.
- The required isolated performance suite passes.
