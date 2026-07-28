---
phase: 26-coherent-publication-and-dual-runtime-release
milestone: v1.3
verified: 2026-07-28
status: passed
suite: 1102 pass / 0 fail / 0 skipped (serial)
---

# Phase 26 Verification — 2026-07-28

**Goal:** Coherent publication and dual-runtime release — every activation publishes a byte-identical complete tuple across full and incremental paths, partial failures never change the active tuple, and the v1.3 release matrix is fail-closed evidence.

## Verification Method

Goal-backward verification: each phase gate command from `26-VALIDATION.md §Phase Gate Commands` was run serially (`--test-concurrency=1`) on the merged branch `agent/router-activation-mapping` after the review-fix addendum (commits through `f4fd112`). The release report was regenerated under the fixed runner.

## Phase Gate Evidence

| Gate | Command focus | tests | pass | fail | skipped |
|------|---------------|-------|------|------|---------|
| 1 | focused tuple / hot-path | 3 | 3 | 0 | 0 |
| 2 | invalidation / equivalence / reconcile | 17 | 17 | 0 | 0 |
| 3 | lifecycle / watcher / activate / recovery | 47 | 47 | 0 | 0 |
| 4 | dual-runtime / coexistence / autonomous | 21 | 21 | 0 | 0 |
| 5 | authority / approval / safety | 39 | 39 | 0 | 0 |
| 6 | isolated performance | 3 | 3 | 0 | 0 |
| 7 | release (v1.3 + v1.2) | 23 | 23 | 0 | 0 |
| 8 | phase26 + regression cluster | 130 | 130 | 0 | 0 |
| 9 | full serial repository | 1102 | 1102 | 0 | 0 |

No skipped Phase 26 coverage. No threshold miss.

## Release Evidence

`release/v1.3-report.json` regenerated via `node src/release/run-release.mjs --matrix=release/v1.3-matrix.json --output=release/v1.3-report.json` → `status: passed`, all six stages (focused, lifecycle, compatibility, authority, regression, latency) pass. `verifyReleaseReport` → `status: verified`. Measurements: `warm_p95_ms` well under 25ms ceiling, `max_route_ms` under 100ms, `context_max_bytes` 194 under 2048.

## Review Fix Re-Verification

The deep code review (`26-REVIEW.md`) raised six critical findings (CR-01..06). All were fixed and re-verified:

- **CR-01** eight-class invalidation wired into production reconciler — `tests/router.phase26-invalidation.test.mjs` production descriptor test green.
- **CR-02** projection manifest verification — `tests/router.phase26-authority.test.mjs` tamper-rejection + suggestion-suppression tests green.
- **CR-03** first-publication reload removes unverified pointer — `tests/router.phase26-lifecycle.test.mjs` first-reload test green.
- **CR-04** atomic staging + quarantine, retry safe — `tests/router.phase26-lifecycle.test.mjs` partial-staging retry test green.
- **CR-05** release runner rejects partially skipped stages — `tests/router.phase26-release.test.mjs` green; report regenerated.
- **CR-06** equivalence test non-empty byte-identical — `tests/router.phase26-equivalence.test.mjs` green.

Full suite re-run after fixes: 1102 pass / 0 fail.

## Validation Sign-Off (from 26-VALIDATION.md)

- [x] REL-01 through REL-09 each have a runnable planned behavioral test.
- [x] Every likely plan task has a non-watch automated command.
- [x] Tuple atomicity, all eight invalidation classes, full/incremental complete byte equivalence, partial-failure isolation, old-or-new visibility have adversarial coverage.
- [x] Fresh install, repair, upgrade, rollback, recovery, and deployed runtime activation cover Claude and Codex with all six recommendation kinds.
- [x] Deterministic realistic large-registry benchmark owns p95, max-route, byte-budget, token-budget evidence.
- [x] Existing publisher/verifier/canary/activation/rollback/recovery/lifecycle/adapter/fixture/metric primitives reused.
- [x] Planned Phase 26 test files exist and observed failing before implementation (RED recorded in plan summaries).
- [x] Focused, lifecycle, authority, release, and isolated performance gates green.
- [x] Full serial repository gate green.

## Verdict

**Phase 26 goal achieved.** The coherent publication path produces byte-identical complete tuples across full and incremental acquisition, partial failures leave the active tuple unchanged (verified old-or-new visibility), the eight-class invalidation graph is wired into the production reconciler, and the v1.3 release matrix is fail-closed evidence under the stricter gate runner. Ready for milestone audit.

_Verified 2026-07-28 on branch `agent/router-activation-mapping` (HEAD `f4fd112`)._