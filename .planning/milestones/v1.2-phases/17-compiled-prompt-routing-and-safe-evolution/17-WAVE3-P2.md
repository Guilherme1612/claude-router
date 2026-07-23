---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: wave3-p2
type: execute
wave: 3
depends_on: ["Wave 3 P1"]
files_modified:
  - tests/router.compiled-evolution.test.mjs (cross-phase integration)
  - tests/*.test.mjs (extended for Wave 3 coverage — may add new fixtures to existing files)
autonomous: true
requirements: [EVO-05, REL-01]
nyquist_compliant: true
must_haves:
  truths:
    - "End-to-end verified behavior across all three waves without regressing Phases 11–16 orchestration surfaces."
    - "Compiled-index seam, canary evaluation, and performance measurement all coexist correctly on the hot path."
    - "REL-01 p95 < 25 ms holds after full integration of all Wave 3 components (not just compiled index alone)."
    - "EVO-05 privacy-safe evolution loop completes: signal captured → privacy approved → evidence stored → candidate proposed → evaluated → promoted or rolled back."
  artifacts:
    - path: tests/router.compiled-evolution.test.mjs
      provides: "End-to-end Wave 3 integration test — full compiled-index → canary → calibration lifecycle on a representative workflow"
  key_links:
    - from: tests/router.compiled-evolution.test.mjs
      to: all Phase 16 orchestrator tests (`tests/router.workflow-orchestrator.test.mjs`)
      via: "Phase 17 seam must not change orchestrator outputs — byte-equivalence required under identical fixture inputs"
---

<objective>
Run cross-phase verification proving that the end-to-end compiled-index → canary-evaluation → performance-measurement lifecycle in Phase 17 preserves all Phases 11–16 orchestration behavior and meets EVO-05/REL-01 success criteria.

Purpose: Complete Phase 17 with a final integration test that exercises every sub-system together — proving the hot path produces identical routing decisions when compiled indexes are absent, validates canary evaluation on real telemetry data from Wave 2 P1's privacy guard, and confirms D-14 latency gates hold under integrated load.
Output: `tests/router.compiled-evolution.test.mjs` plus extended fixtures in existing Phase 16 test files to cover new seams.
</objective>

<execution_context>
@/Users/guilherme/.codex/gsd-core/workflows/execute-plan.md
@/Users/guilherme/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md success criteria (D-01–D-16 across waves)
@.planning/ROADMAP.md Phase 17 row — "Plans: 3 plans" confirmed decomposition aligns with wave groupings
@tests/router.workflow-orchestrator.test.mjs (Phase 16 orchestrator baseline — must NOT regress)
@.planning/phases/16-workflow-first-orchestration-and-context-budgets/16-VERIFICATION.md (completed verification of Phase 16; Wave 3 P2 extends this scope to cover seam integration)
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement end-to-end lifecycle test exercising all three waves together on one representative workflow</name>
  <read_first>.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-WAVE3-P2.md task description, Wave 1 compiled-index reader contract (src/prompt/compile-index.mjs), canary-controller API from Wave 2 P2</read_first>
  <action>Create test that: (a) compiles an index for a representative workflow using Phase 16 orchestrator + capsule state; (b) loads that index through the hot path confirming p95 under gate; (c) triggers privacy guard on synthetic telemetry signals including all forbidden types; (d) proposes candidate via canary controller after simulated evidence window; (e) verifies either promotion completes through journal or rollback occurs cleanly. All steps must be observable in a single test run.</action>
  <expected_output>A comprehensive end-to-end integration test covering one complete canary lifecycle — compiled-index creation, hot-path load with p95 verification, privacy guard deny on forbidden signals, evidence accumulation for minimum sample count, candidate proposal and evaluation, and final promotion-or-rollback decision with journal recording. Must confirm Phase 16 orchestrator produces identical outcome when no compiled index is available.</expected_output>
  <verify_with_tests>"Single run covers all three waves; verify (a) orchestrator byte-equivalence preserved when compiled-index absent, (b) latency p95 under gate throughout lifecycle test, (c) privacy guard denies each forbidden type within end-to-end flow, (d) canary promotion requires minimum samples and all hard gates pass — fails closed otherwise. Run full `node --test tests/*.test.mjs` after to confirm no regressions in Phases 11–16." "Phase 17 success criteria: D-01 through D-12 verified within the lifecycle test; D-13/D-14/D-15/D-16 verified via calibration corpus fixtures running against candidate produced by same test. All four phase-level success criteria from ROADMAP must be TRUE to consider Phase 17 complete."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend existing Phase 16 test fixtures to cover new compilation seam paths</name>
  <read_first>tests/router.workflow-orchestrator.test.mjs (existing Wave 1 fixture pattern — must match style and coverage depth)</read_first>
  <action>Add compiled-index-aware variants of selected Phase 16 workflow-orchestrator tests: same fixtures but with compiled index available. Verify byte-equivalence of orchestrator output when no index is present AND verify the seam returns identical behavior whether path uses compiled-index or direct orchestrator fallback.</action>
  <expected_output">Phase 16 fixture variants that exercise Phase 17 compiled-index seam paths without changing existing test structure. Every fixture class (minimal-prompt, explicit-override, stale-context, ambiguity, terminal-state, dependency, context-budget) appears with both `compiled_index=true` and `compiled_index=false` paths; outcomes must match exactly between paths.</expected_output>
  <verify_with_tests>"Run full Phase 16 suite after Wave 3 additions — every existing test passes unchanged (seam is transparent when no compiled index). New variants pass confirming seam does not change semantics, only speed."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Run full-phase verification command and confirm Phase 17 completion evidence</summary>
</action>
    <expected_output>A verified Phase 17 state with focused test output, full-suite output, a requirement-to-test mapping, inspection proving Phase 17 did not modify live hook/deployment or evolution surfaces beyond the documented seams. Passing tests alone do NOT replace independent verification — require phase-completion workflow.</expected_output>
    <verify_with_tests>"Run: `node --test tests/router.compiled-index.test.mjs`, then Wave 2, then Wave 3, then full suite. Verify each phase-level requirement in REQUIREMENTS.md maps to at least one test that covers it directly."</verify_with_tests>
</task>

</tasks>

## Open Questions (RESOLVED)

- **Required test coverage percentage for phase completion:** Must all six fixture classes be covered by Wave 3 P2 lifecycle test? [RESOLVED: yes — every fixture class must appear at least once in the end-to-end test; individual fixtures can cover multiple waves within a single lifecycle run]
- **Independent verifier vs tests passing alone:** Phase 16 completion convention requires independent verification, not just tests. [RESOLVED: same applies to Phase 17 — tests verify behavior; phase-completion workflow verifies all of Phase 17 together including inspection of files modified]

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| End-to-end lifecycle test stability | HIGH | Tests use fixed corpus fixtures (deterministic); canary-controller contract is deterministic by D-09–D-12 design. [VERIFIED: architecture, Wave 3 P1] |
| Phase 16 byte-equivalence preservation post-integration | HIGH | Compiled-index seam returns null when no verified index exists — orchestrator path unchanged from current behavior. [RESOLVED: architecture of compile-index reader; D-02/D-03 fallback semantics] |
| P95 measurement stability in end-to-end test | MEDIUM | Single test run may not produce stable enough p95 estimate without repeated runs — Wave 3 P1 harness (N=100) is needed for stable baseline before integration test. [RESOLVED: recommended `min_measurements` in Wave 3 P1] |

## Sources

- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md` — all locked decisions (D-01–D-16) verified against end-to-end lifecycle. [VERIFIED: codebase]
- `tests/router.workflow-orchestrator.test.mjs` — Phase 16 baseline fixtures to extend for new seam. [VERIFIED: codebase, repository conventions]
- `.planning/ROADMAP.md` Phase 17 row (success criteria 1–4) — final verification against roadmap commitments. [VERIFIED: codebase]
