---
phase: 17-compiled-prompt-routing-and-safe-evolution
plan: wave3-p1
type: execute
wave: 3
depends_on: ["Wave 2 P2"]
files_modified:
  - src/evolution/perf-measure.mjs (harvester, optional — only if existing perf measurement is insufficient)
  - tests/router.perf-calibration.test.mjs
  - tests/router.compiled-evolution.test.mjs (integration fixtures for Wave 3)
autonomous: true
requirements: [D-13, D-14, D-15, D-16]
nyquist_compliant: true
must_haves:
  truths:
    - "D-13/D-14/D-16: quality and latency are independent hard gates — passing one cannot compensate for failing the other."
    - "D-15: candidate comparisons use a fixed, versioned calibration corpus with deterministic expected outcomes; results record baseline deltas and exact versions evaluated."
  artifacts:
    - path: tests/router.perf-calibration.test.mjs
      provides: "Fixed corpus fixtures + latency measurement harness verification under Wave 3 contract"
  key_links:
    - from: tests/router.perf-calibration.test.mjs
      to: canary-controller contract (Wave 2 P2)
      via: "fixed-corpus evaluation interface that canary controller consumes for promotion decisions"
---

<objective>
Establish the fixed calibration corpus and independent latency measurement harness so candidate comparisons in Wave 3 are deterministic, reproducible, and respect the quality-latency independence requirement.

Purpose: Provide Phase 17 canary-controller with a versioned fixture set that evaluates every candidate against both quality (across all six fixture classes) AND latency independently — not as one weighted score.
Output: `tests/router.perf-calibration.test.mjs` and any supporting calibration fixtures, plus documentation of the fixed corpus format for regression-proof comparison across versions.
</objective>

<execution_context>
@/Users/guilherme/.codex/gsd-core/workflows/execute-plan.md
@/Users/guilherme/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md D-13 to D-16 (quality/latency gates, calibration corpus requirement)
@.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-DISCUSSION-LOG.md (recommended: fixed fixtures as independent hard gates, per-route latency measurement)
@src/context/prompt-route.mjs (routing seam where performance is measured)
@src/orchestrator/select.mjs — orchestrator contract to preserve post-Wave 3 integration
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Design and document the fixed calibration corpus format</name>
  <read_first>.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md D-15 (calibration corpus requirement), .planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-WAVE3-P1.md task description</read_first>
  <action>Create a JSON file under `.planning/calibration/corpus-v1.json` documenting: one entry per fixture class (minimal-prompt, explicit-override, stale-context, ambiguity, terminal-state, dependency, context-budget), each with deterministic expected outcome (status, dispatch_eligible, reason_code, estimated_tokens if applicable) and warm/cold measurement protocol metadata. Corpus is versioned as `calibration-v1` — any future change requires a new version that breaks test byte-equality.</action>
  <expected_output>A documented calibration corpus with at least one representative fixture per class — covering every required route type for Phase 17's six fixture classes (D-13) plus cold/warm measurement metadata. Tests must lock fixture bytes so corpus changes are regressions; each fixture has deterministic expected outcome that canary-controller compares against.</expected_output>
  <verify_with_tests>"Every fixture class in the corpus produces one byte-equivalent test — corpus change produces different byte comparison, which tests should detect as a regression signal. Corpus format documented under version header for future extension."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement performance measurement harness that captures warm p95 + per-route max latency</name>
  <read_first>src/context/prompt-route.mjs (current routing flow for instrumentation point)</read_first>
  <action>Create a thin perf-measure module under `tests/router.perf-calibration.test.mjs` that runs Phase 17 compiled-index seam N times (N ≥ 50) capturing warm and cold measurements. Report warm p95, per-route max latency, and baseline deltas between candidate/index/policy versions — never inline timing in the routing function itself to avoid affecting measured values.</action>
  <expected_output>A test harness that captures warm p95 and per-route max latency for Phase 17 compiled-index seam, reports versioned baselines (current vs candidate), and enforces D-14 hard gates: warm p95 < 25 ms AND every route < 100 ms — both independently checked. Must not add measurable time to routing itself.</expected_output>
  <verify_with_tests>"Harness must produce stable measurements under multiple sequential runs (warm measurement variance must be below test significance threshold). Include a test that simulates a candidate adding latency: verify harness detects it as a p95 regression and reports reason_code='latency_regression'."</verify_with_tests>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Implement versioned comparison protocol against fixed corpus fixtures</name>
  <read_first>.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-WAVE3-P1.md task description, src/evolution/canary-controller.mjs (Wave 2 P2 — consumption side)</read_first>
  <action>Create a protocol that takes candidate results from the canary controller and compares them against fixed fixture expected outcomes using deterministic byte comparison. Results must record: quality delta per fixture class AND latency baseline delta separately — never combined into one weighted score.</action>
  <expected_output>A versioned-comparison module (or test-only helper) that accepts two evaluation result sets (baseline vs candidate) and returns structured deltas per fixture class with both quality AND latency recorded independently. The canary controller consumes these as input for promotion decisions; tests verify the independence requirement holds — a positive quality delta on one class cannot pass if another class has negative quality regardless of latency.</expected_output>
  <verify_with_tests>"Test cases: (1) candidate improves all fixtures by same % AND p95 stays under gate → passes with documentation of all deltas. (2) candidate has every metric better except one fixture degrades — must reject even if overall "faster". (3) latency regression with quality improvement in every class → fails regardless; document both regressions."</verify_with_tests>
</task>

</tasks>

## Open Questions (RESOLVED)

- **Corpus versioning strategy:** Use immutable `corpus-v1.json` with strict byte-equality, or allow additive changes with explicit version bumps? [RESOLVED: immutable corpus versioned as `calibration-v<N>` — any change requires new file with different name; old versions remain for historical comparison]
- **Minimum measurement sample count for p95:** How many routes must the harness measure before declaring a stable p95? [RESOLVED: recommended N=100 warm routes (sufficient for 95th percentile with <2% variance); documented in corpus fixture metadata as `min_measurements`]

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Fixed-corpus determinism | HIGH | Corpus is a static JSON file under test — byte-equivalent comparison is straightforward and regression-testable. [VERIFIED: Phase 17 CONTEXT.md D-15] |
| Independent-gate enforcement in measurement harness | HIGH | Quality and latency reported separately by design per Wave Plan recommendation; canary controller reads both independently. [RESOLVED: Wave Plan "Quality gates are independent" recommendation] |
| P95 stability under warm/cold measurement variation | MEDIUM | Must empirically verify that N=100 measurements produce stable enough p95 estimates for meaningful candidate comparison. [RESOLVED through recommended `min_measurements` in corpus fixture metadata] |

## Sources

- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md` D-13–D-16 — locked quality/latency gate semantics. [VERIFIED: codebase]
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` Phase 17 work packages (recommended performance fixtures). [VERIFIED: codebase]
