---
phase: 61-plain-language-outcome-and-task-family-recognition
status: verified
nyquist_compliant: true
wave_0_complete: true
validated_at: 2026-08-10
---

# Phase 61 Validation Strategy

## Verification Framework

- **Framework:** Node.js built-in `node:test` with `node:assert/strict`
- **Quick run:** `rtk node --test tests/router.task-family-recognition.test.mjs tests/router.task-family-declarations.test.mjs`
- **Full phase run:** `rtk node --test tests/router.task-family-recognition.test.mjs tests/router.task-family-declarations.test.mjs tests/router.semantic-intent.test.mjs tests/router.intent-adversarial.test.mjs tests/router.semantic-retrieval.test.mjs tests/router.semantic-compilation.test.mjs tests/router.publish-index.orchestrator.test.mjs`
- **Full repository run:** `rtk node --test --test-concurrency=1 tests/*.test.mjs`
- **Static safety:** `rtk git diff --check` and a source check that `src/runtime/router.mjs` has no new semantic/corpus import or discovery work

## Task-to-Test Map

| Task | Requirement | Automated verification | Type |
|---|---|---|---|
| 61-01-01 | INT-03 | `router.task-family-recognition.test.mjs` corpus version, six IDs, paraphrases, negatives, deterministic/privacy bounds | unit |
| 61-01-02 | INT-01, INT-02, INT-03 | `router.task-family-recognition.test.mjs` structured fields, scope/autonomy/evidence, coordinator and clarification cases | unit |
| 61-02-01 | INT-02, INT-03 | `router.task-family-declarations.test.mjs` corpus/declaration/mirror parity and bounded coordinator metadata | contract |

## Nyquist Acceptance Criteria

- [x] Every new pure matcher/parser behavior has a failing-first node:test case and a passing focused run.
- [x] The six family corpus includes paraphrase positives and safety negatives.
- [x] Missing factual scope and owner-controlled authority produce explicit bounded clarification reasons.
- [x] Existing unsafe framing and semantic retrieval tests remain green.
- [x] JSON declaration and in-process mirror remain deterministic and in parity.
- [x] Full serial repository suite and diff check pass before phase verification.

## Recorded Results

- Plan 61-01 compatibility and recognition suites: 23/23 passing.
- Plan 61-02 declaration, retrieval, compilation, resolution, publication, and registry-build suites: 80/80 passing.
- Lifecycle deployment closure after adding the corpus module: 23/23 passing.
- Full repository serial suite: 1615/1615 passing.
- rtk git diff --check: passing.
- src/runtime/router.mjs remains unchanged; no runtime discovery or direct corpus import was added.

## Wave 0 Status

- Existing Node test harness, semantic parser, authority classifier, retrieval seam, declaration source, and anonymous fixtures are available.
- No external service, browser server, network, database, or new dependency is required for Phase 61.
