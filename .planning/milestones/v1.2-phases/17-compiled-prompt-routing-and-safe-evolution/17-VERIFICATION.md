---
phase: 17-compiled-prompt-routing-and-safe-evolution
verified: 2026-07-16T23:46:24Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
requirements:
  EVO-05: satisfied
  REL-01: satisfied
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
re_verification:
  previous_status: gaps_found
  previous_score: 2/4
  gaps_closed:
    - "F-05: real routeContextPrompt compiled routing is now measured across the fixed corpus with warm p95 below 25 ms and every route below 100 ms."
    - "F-06: quality outcomes and exact emitted-context UTF-8 bytes now come from routeContextPrompt rather than fixture.expected."
  gaps_remaining: []
  regressions: []
---

# Phase 17: Compiled Prompt Routing and Safe Evolution Verification Report

**Phase Goal:** Users receive fast compiled routing that can improve from privacy-safe telemetry without risking prompt latency or silent regressions.
**Verified:** 2026-07-16T23:46:24Z
**Status:** PASSED
**Re-verification:** Yes — after gap-closure Plan 17-05

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Prompt routing reads only compact versioned indexes and fresh capsules, with no inventory scan, registry build, or external model call. | VERIFIED | `routeContextPrompt` imports and invokes `loadCompiledIndex` and `loadCapsule` through explicit roots. The bounded-loader, exact-path, malformed-state, fallback, and forbidden-dependency tests passed in the fresh focused run. |
| 2 | Warm routing p95 remains below 25 ms and every measured route remains below 100 ms. | VERIFIED | `tests/router.compiled-evolution.test.mjs:179-199` passes the real compiled-routing adapter to `measureRoutes` for 14 warmups and 70 measured routes, then directly asserts `warm.p95_ms < 25`, `warm.max_ms < 100`, exact versions, and an independently passing latency gate. The named test passed freshly. |
| 3 | Minimal-prompt, explicit-override, stale-context, and ambiguity fixtures meet routing-quality and context-budget gates. | VERIFIED | The seven-class byte-locked corpus also covers terminal, dependency, and context-budget cases. `tests/router.compiled-evolution.test.mjs:142-177` routes every fixture through `routeContextPrompt`, proves mutation of `fixture.expected` cannot alter observed output, and compares `Buffer.byteLength(actual.additional_context, 'utf8')` with each ceiling. The named tests passed freshly, including a non-ASCII byte assertion. |
| 4 | Privacy-safe signal or weight candidates run through canaries and automatically roll back when quality regresses. | VERIFIED | Evidence windows are privacy/scope/integrity checked before every independent hard gate in `evaluateCandidate`; `applyCanaryDecision` uses registry recovery, activation, preview, and rollback authority. The real lifecycle test promoted a candidate and restored known-good after `quality_regression`; focused evidence/canary tests passed. |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified).

## Re-verification of Prior Gaps

| Gap | Result | Current evidence |
|---|---|---|
| F-05 real compiled-route latency | CLOSED | The measured callback at `tests/router.compiled-evolution.test.mjs:181-186` is the adapter whose line 67 calls `routeContextPrompt`; the passing test enforces strict p95 and max ceilings. |
| F-06 real quality and emitted-byte evaluation | CLOSED | The adapter normalizes only observed resolution fields at lines 77-85. The sentinel at lines 159-163 proves expected values are not copied, and lines 169-176 validate exact emitted UTF-8 bytes. |

No regressions were found in the two previously verified roadmap truths.

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/prompt/compile-index.mjs` | Bounded compiled-index authority | VERIFIED | Substantive strict schema, descriptor-bound exact reads, verified active/known-good selection, and fail-closed output; wired into prompt routing. |
| `src/context/prompt-route.mjs` | Live compiled prompt seam | VERIFIED | Calls capsule and compiled-index loaders, applies compiled projection before dispatch, and emits bounded context. |
| `src/evolution/evidence.mjs` | Privacy-safe evidence windows | VERIFIED | Content-free validation, scope isolation, retention/decay, immutable fingerprinted windows; consumed by canary validation contract. |
| `src/evolution/canary-controller.mjs` | Candidate gates, promotion, rollback | VERIFIED | Validates authentic evidence and all hard gates, then delegates mutation to registry activation/rollback APIs. |
| `src/evolution/perf-measure.mjs` | Quality, exact-byte, and latency gates | VERIFIED | Fixed corpus, exact versions, UTF-8 byte measurement, bounded sampling, strict p95/max gates. |
| `tests/router.compiled-evolution.test.mjs` | End-to-end compiled route and evolution proof | VERIFIED | Real compiled-index/capsule fixtures exercise quality, byte, latency, promotion, and rollback behavior. |

All 16 artifacts declared across Plans 17-01 through 17-05 passed `verify.artifacts`.

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `src/context/prompt-route.mjs` | `src/prompt/compile-index.mjs` and `src/context/capsule.mjs` | Direct imports and bounded calls | WIRED | Imports at lines 1 and 4; calls at lines 88 and 91. |
| `src/evolution/canary-controller.mjs` | evidence and registry publication contracts | Fingerprint validation plus activation/rollback APIs | WIRED | `evidenceWindowFingerprint` validates source evidence; registry functions are imported and used by `applyCanaryDecision`. |
| `tests/router.compiled-evolution.test.mjs` | `src/context/prompt-route.mjs` | Real fixture adapter | WIRED | `routeContextPrompt` is imported and called at line 67 for every corpus fixture. |
| `tests/router.compiled-evolution.test.mjs` | `src/evolution/perf-measure.mjs` | Same route callable feeds quality and latency | WIRED | `route` is passed to both `evaluateCalibrationCorpus` and `measureRoutes` at lines 182-183. |

The generic key-link query recognized both Plan 17-05 links. Its older-plan filename heuristic reported false negatives where modules communicate through imported symbols or shared publication contracts; manual source tracing above resolves those links.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Real fixed-corpus routing, quality, UTF-8 budgets, latency, and canary lifecycle | `node --test tests/router.compiled-evolution.test.mjs tests/router.perf-calibration.test.mjs tests/router.context-prompt-integration.test.mjs tests/router.compiled-index.test.mjs tests/router.evolution-canary.test.mjs` | 39/39 passed, 0 failed | PASS |
| Repository regression suite | `node --test tests/*.test.mjs` | 590/590 passed, 0 failed, 21.78 s | PASS |

The fresh commands ran without context-mode `__CM_FS__` stderr injection, so no JSON-CLI assertion required interpretation or exclusion.

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| EVO-05 | 17-02, 17-03, 17-04 | Privacy-safe telemetry canary-tests weight and signal changes and rolls back regressions. | SATISFIED | Privacy-denied zero-write, scope eligibility, immutable evidence/candidates, independent gates, journaled promotion, and automatic quality-regression rollback all pass behavioral tests. |
| REL-01 | 17-01, 17-03, 17-04, 17-05 | Warm routing p95 below 25 ms and every measured route below 100 ms. | SATISFIED | Real `routeContextPrompt` compiled routing is the measured callable; strict p95/max assertions passed together with all corpus quality and exact-byte gates. |

No Phase 17 requirement is orphaned.

## Anti-Patterns and Disconfirmation Pass

- No `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, or placeholder marker was found in Phase 17 implementation/test files.
- Partial-requirement challenge: prior F-05/F-06 were genuine partial coverage; Plan 17-05 now closes both with a real adapter and mutation sentinel. No remaining partial roadmap criterion was found.
- Misleading-test challenge: `tests/router.perf-calibration.test.mjs` intentionally retains synthetic `fixture.expected` and empty-callback unit tests for evaluator/percentile mechanics. They are not used as end-to-end evidence; the compiled-evolution integration independently executes real routing.
- Untested-error-path challenge: measurement callback exceptions are not given a bespoke recovery assertion, but they propagate and fail the test/calibration closed. This does not weaken any Phase 17 must-have or gate.

## Human Verification Required

None. Every roadmap truth, including state transitions for promotion and rollback and the latency/quality invariants, has passing behavioral coverage.

## Gaps Summary

No gaps remain. The prior tautological quality callback and empty latency callback have been removed from the end-to-end integration path, and fresh targeted plus repository verification is green.

---

_Verified: 2026-07-16T23:46:24Z_
_Verifier: Codex generic-agent workaround for gsd-verifier_
