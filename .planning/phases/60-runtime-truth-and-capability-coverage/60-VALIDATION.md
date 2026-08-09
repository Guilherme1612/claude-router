---
phase: 60
slug: runtime-truth-and-capability-coverage
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-09
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for runtime-local capability truth, fail-closed selection, bounded evidence, and full/incremental convergence.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` |
| **Config file** | none |
| **Quick run command** | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.registry-reconcile.test.mjs` |
| **Full suite command** | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.coverage.test.mjs tests/router.registry-schema.test.mjs tests/router.registry-reconcile.test.mjs tests/router.route-targets.test.mjs tests/router.trust-quarantine.test.mjs tests/router.registry-incremental.test.mjs tests/router.registry-diff.test.mjs tests/router.watcher-telemetry-ingest.test.mjs tests/router.v19-observability.test.mjs` |
| **Estimated runtime** | < 30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command and the task's listed automated verification.
- **After every plan wave:** Run the full suite command.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 30 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | CAP-01, CAP-02 | T-60-01, T-60-02, T-60-03 | Runtime-local identity, bounded coverage rows, and non-dispatchable records remain visible but unselectable. | unit/integration | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.coverage.test.mjs tests/router.registry-schema.test.mjs tests/router.registry-reconcile.test.mjs` | ✅ | ⬜ pending |
| 60-01-02 | 01 | 1 | CAP-01, CAP-02 | T-60-01 | Stale, unavailable, quarantined, and aliased non-dispatchable targets cannot cross reconciliation. | unit/integration | `rtk node --test tests/router.registry-reconcile.test.mjs tests/router.route-targets.test.mjs tests/router.trust-quarantine.test.mjs` | ✅ | ⬜ pending |
| 60-02-01 | 02 | 2 | CAP-01, CAP-02 | T-60-04, T-60-05 | Watcher evidence is bounded and stale-root publication cannot preserve an unsafe active route. | integration/privacy | `rtk node --test tests/router.watcher-telemetry-ingest.test.mjs tests/router.v19-observability.test.mjs tests/router.registry-build.test.mjs` | ✅ | ⬜ pending |
| 60-02-02 | 02 | 2 | CAP-01, CAP-02 | T-60-06 | Full, incremental, removal, and rename/move flows converge on canonical truth and counts. | integration | `rtk node --test tests/router.registry-incremental.test.mjs tests/router.registry-diff.test.mjs tests/router.watcher-telemetry-ingest.test.mjs` | ✅ | ⬜ pending |

---

## Wave 0 Requirements

Existing Node test infrastructure and anonymous inventory fixtures cover all phase requirements; no Wave 0 setup is required.

---

## Manual-Only Verifications

All Phase 60 behaviors have automated verification. Installed/runtime smoke and release evidence remain downstream lifecycle gates.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter after execution evidence passes

**Approval:** approved 2026-08-10
