---
phase: 18
slug: autonomous-lifecycle-and-release-gates
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for dual-runtime autonomous propagation, crash-safe recovery, installer coexistence, and final v1.2 release authority.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`) |
| **Config file** | none — tests are direct `.mjs` suites |
| **Quick run command** | `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.lifecycle-recovery.test.mjs tests/router.installer-coexistence.test.mjs tests/router.v12-release.test.mjs` |
| **Full release command** | `node src/release/run-release.mjs` |
| **Full regression command** | `node --test tests/*.test.mjs` |
| **Max focused feedback latency** | 60 seconds |

## Sampling Rate

- **After every task:** Run its focused automated command.
- **After every plan wave:** Run all Phase 18 tests plus directly affected existing suites.
- **Before `$gsd-verify-work`:** Run `node src/release/run-release.mjs`; its latency stage must execute in an isolated child.
- **No watch mode or arbitrary sleeps:** Installed-controller tests use bounded observable polling; focused watcher tests may use the documented drain seam.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement group | Threat Ref | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------------|------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | REG/ADP/CHG/MAP | T-18-01 | integration | `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.compiled-index.test.mjs tests/router.context-prompt-integration.test.mjs` | ✅ | ✅ green |
| 18-01-02 | 01 | 1 | REG/ADP/CHG/SAF-09 | T-18-02 | e2e | `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.lifecycle.test.mjs tests/router.registry-build.test.mjs tests/router.route-targets.test.mjs` | ✅ | ✅ green |
| 18-02-01 | 02 | 2 | SAF-10/ACT-01 | T-18-03 | integration | `node --test tests/router.installer-coexistence.test.mjs tests/router.lifecycle.test.mjs tests/router.coexistence.test.mjs` | ✅ | ✅ green |
| 18-02-02 | 02 | 2 | MAP-02/ACT-01 | T-18-04,T-18-05 | fault injection | `node --test tests/router.lifecycle-recovery.test.mjs tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs tests/router.compiled-index.test.mjs` | ✅ | ✅ green |
| 18-03-01 | 03 | 3 | all 20 traceability | T-18-06 | contract | `node --test tests/router.v12-release.test.mjs` | ✅ | ✅ green |
| 18-03-02 | 03 | 3 | CTX/ORC/TOK/EVO/REL | T-18-06,T-18-08 | release e2e | `node --test tests/router.v12-release.test.mjs &amp;&amp; node src/release/run-release.mjs` | ✅ | ✅ green |
| 18-03-03 | 03 | 3 | CTX-01/TOK-02/EVO-05/REL-01 | T-18-07 | privacy/integration | `node --test tests/router.v12-release.test.mjs tests/router.privacy.test.mjs tests/router.compiled-evolution.test.mjs tests/router.context-budget.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

Existing `node:test` infrastructure is sufficient. The four Phase 18 test files are created test-first inside their owning tasks; no external package or framework bootstrap is required.

## Manual-Only Verifications

All phase behaviors and release criteria have automated verification. No human-only gate is required.

## Validation Sign-Off

- [x] Every implementation task has a focused automated command.
- [x] No three consecutive tasks lack automated verification.
- [x] The final release command isolates latency while retaining one aggregate result.
- [x] Missing, skipped, stale, non-executable, or version-mismatched evidence is covered by negative tests.
- [x] Existing infrastructure covers all planned test files and no package installation is needed.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** planned 2026-07-17

## Validation Audit 2026-07-17

State A audit. All 7 per-task commands executed against current tree; every referenced test file exists and runs green. Release runner `node src/release/run-release.mjs` returns `{"status":"passed"}` across stages regression, calibration, privacy, coexistence, recovery, context-token, latency.

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tasks COVERED | 7 |
| Tasks PARTIAL | 0 |
| Tasks MISSING | 0 |

No new test files generated — Phase 18 tests were authored test-first inside Plans 18-01/02/03 and gap-closed by Plans 18-04/05; audit confirms coverage rather than adds it.
