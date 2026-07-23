---
phase: 17-compiled-prompt-routing-and-safe-evolution
type: wave-plan
wave_groups:
  - wave: 1
    title: Compact Compiled Indexes
    depends_on: []
    status: pending
  - wave: 2
    title: Canary Evolution and Rollback
    depends_on: ["Wave 1"]
    status: pending
  - wave: 3
    title: Minimal-Prompt Calibration and Performance
    depends_on: ["Wave 2"]
    status: pending
---

# Phase 17 Wave Plan: Compiled Prompt Routing and Safe Evolution

## Phase Summary

**Goal:** Users receive fast compiled routing that can improve from privacy-safe telemetry without risking prompt latency or silent regressions.

**Depends on:** Phase 16 (workflow-first orchestration + context budgets)
**Requirements addressed:** EVO-05, REL-01

### Success Criteria
1. Prompt routing reads only compact versioned indexes and fresh capsules, with no inventory scan, registry build, or external model call.
2. Warm routing p95 remains below 25 ms and every measured route remains below 100 ms.
3. Minimal-prompt, explicit-override, stale-context, and ambiguity fixtures meet routing-quality and context-budget gates.
4. Privacy-safe signal or weight candidates run through canaries and automatically roll back when quality regresses.

## Wave Breakdown

### Wave 1: Compact Compiled Indexes (D-01 to D-04)

**Goal:** Deliver deterministic, bounded compiled indexes that accelerate the prompt hot path while failing closed on missing/stale/corrupt/invalid states.

| Plan | File Modified | Dependencies | Status |
|------|---------------|--------------|--------|
| 17-WAVE1-P1 | `src/prompt/compile-index.mjs`, tests | Phase 16 orchestrator output contracts | pending |
| 17-WAVE1-P2 | Integration of compiled seam into prompt hot path + cross-wave behavioral tests | Wave 1 P1 reader contract, `prompt-route.mjs` current flow | pending |

**Key behaviors:**
- Reader loads active version via atomic pointer; validates fingerprint chain without full registry load.
- Fail-closed: stale/corrupt/missing indexes fall back to known-good per D-02/D-03 with structured outcome (status, dispatch_eligible, reason_code).
- No inventory scan, no history replay, no external model calls inside hot path (D-01).

### Wave 2: Canary Evolution and Rollback (D-05 to D-12)

**Goal:** Enable privacy-safe telemetry-driven evolution that promotes candidates only after hard-gate verification and rolls back automatically on quality regression.

| Plan | File Modified | Dependencies | Status |
|------|---------------|--------------|--------|
| 17-WAVE2-P1 | `src/evolution/evidence.mjs`, `tests/router.privacy-guard.test.mjs` | Wave 1 compiled-index storage layout (for candidate/store coexistence) | pending |
| 17-WAVE2-P2 | `src/evolution/canary-controller.mjs`, `tests/router.canary-evaluation.test.mjs` | Wave 2 P1 evidence collector, calibrated baseline from Wave 3 | pending |

**Key behaviors:**
- Privacy guard denies before store — content-free signal envelope only (identity, confidence band, reason codes, fixture class, latency μs, version pairs, verdict). [D-05/D-06 locked]
- Evidence window enforces minimum samples and retention decay; project-scoped by default. [D-07/D-08 locked]
- Immutable candidates with deterministic promotion/rollback through Phase 14 journal + activation pointer (no second publication mechanism). [D-09–D-12 locked]

### Wave 3: Minimal-Prompt Calibration and Performance (D-13 to D-16)

**Goal:** Establish fixed-corpus calibration, independent latency gate enforcement, and end-to-end integration tests proving Phase 17 did not regress Phase 11–16 orchestration surfaces.

| Plan | File Modified | Dependencies | Status |
|------|---------------|--------------|--------|
| 17-WAVE3-P1 | `tests/router.perf-calibration.test.mjs`, `src/evolution/perf-measure.mjs` (harvester) | Wave 2 canary controller contract for measurement hooks | pending |
| 17-WAVE3-P2 | `tests/router.compiled-evolution.test.mjs` (cross-phase integration) | all previous waves + privacy guard | pending |

**Key behaviors:**
- Fixed calibration corpus with deterministic expected outcomes across all six fixture classes. [D-15 locked]
- Latency measurement: warm p95 < 25 ms, per-route max < 100 ms — independent hard gates not weighted against quality. [D-14/D-16 locked]
- Cross-phase tests confirm Phase 16 orchestrator outputs pass unchanged after compilation seam integration.

## End-to-end Verification Strategy

| Requirement | Behavioral proof | Primary test file | Wave |
|---|---|---|---|
| REL-01 (p95 < 25 ms) | Compiled-index reads on hot path maintain warm routing p95 below threshold under steady-state measurement. | `tests/router.perf-calibration.test.mjs` | 3 |
| EVO-05 (canary + rollback) | Quality regression detected and rolled back without manual intervention; candidates immutable through promotion. | `tests/router.canary-evaluation.test.mjs` | 2 |
| D-01 (no inventory scan in hot path) | Compiled index reader imports audit passes under no-imports static check; behavioral test asserts single bounded file read per route on warm path. | `tests/router.compiled-index.test.mjs`, integration matrix | 1 |
| D-02/D-03 (fail-close behavior) | Corrupt/stale/missing indexes produce known-good fallback or structured clarification — no silent uncompiled routing. | `tests/router.compiled-index.test.mjs` | 1 |
| D-05/D-06 (privacy guard) | All forbidden signal types denied before storage with non-reversible signatures where applicable; zero raw data writes to evidence journal under deny paths. | `tests/router.privacy-guard.test.mjs` | 2 |

## Open Questions for Planner

1. **Compiled-index file naming convention:** Use kebab-case versioned filenames (e.g., `compiled-v1-<sha256-hash>.json`) to mirror Phase 14 journal patterns — or use a single rotating slot per compiled generation?
   - *Recommendation:* Kept immutable-version pattern from Phase 14 (`compile-index-v<N>-<timestamp>.json`).

2. **Performance measurement overhead budget:** What is the absolute maximum wall-clock time that `src/evolution/perf-measure.mjs` may consume to remain "not affecting the measured value"?
   - *Recommendation:* < 0.5 ms per route under Node profiler on a synthetic trace; reported as an upper bound in tests.

3. **Evidence decay weighting:** Should evidence decaying within window use linear, exponential, or recency-biased averaging?
   - *Recommendation:* Exponential decay with half-life = 24 hours (last 24 h weighted double the rest of the week). Must be deterministic and regression-testable.

---

*Phase plan created: 2026-07-16 — awaiting gsd-planner review*
