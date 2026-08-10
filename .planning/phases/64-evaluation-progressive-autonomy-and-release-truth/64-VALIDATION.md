---
phase: 64-evaluation-progressive-autonomy-and-release-truth
status: verified
nyquist_compliant: true
wave_0_complete: true
validated_at: 2026-08-10
---

# Phase 64 Validation Strategy

## Verification Framework

- Framework: Node.js built-in node:test with node:assert/strict
- Quick run: rtk node --test tests/router.evaluation-v20.test.mjs
- Plan run: rtk node --test tests/router.evaluation-v20.test.mjs tests/router.evaluation.test.mjs tests/router.release-preflight.test.mjs tests/router.privacy.test.mjs tests/router.dispatch-safety.test.mjs
- Deployment run: rtk node --test tests/router.lifecycle.test.mjs
- Full repository run: rtk node --test --test-concurrency=1 tests/*.test.mjs
- Static safety: rtk git diff --check and runtime-source diff check

## Task-to-Test Map

| Task | Requirement | Automated verification | Type |
|---|---|---|---|
| 64-01-01 | EVAL-01 | v2.0 corpus, full stage selection, paraphrase, negative, and family coverage tests | evaluation |
| 64-01-02 | EVAL-01 | runtime parity, asymmetric inventory, selected/actual, browser evidence, and budget dimensions | evaluation |
| 64-02-01 | EVAL-02 | release preflight independent blocker matrix | release |
| 64-02-02 | EVAL-02 | lifecycle dual-runtime evaluator closure | deployment |

## Nyquist Acceptance Criteria

- [x] Complete workflow selection is evaluated across all six families, paraphrases, negatives, and broad coordination.
- [x] Runtime parity and asymmetric inventory failures are independently visible.
- [x] Selected-versus-actual receipts and browser/runtime evidence are independently measured.
- [x] Prompt overhead, cold/warm latency, planning tokens/context, safety, coverage, and availability are separate gates.
- [x] V2 preflight rejects every required stale/availability/evidence/privacy/safety/latency blocker.
- [x] Dual-runtime closure, full serial suite, and diff check pass.

## Recorded Results

- v2.0 evaluation suite: 4/4 passing.
- Evaluation, release-preflight, lifecycle, release-gate, and privacy suites: 49/49 passing.
- Full repository serial suite: 1637/1637 passing.
- rtk git diff --check: passing.
- src/runtime/router.mjs diff: empty; evaluation and release checks remain outside the prompt hook.
