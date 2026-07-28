---
phase: 22
slug: conservative-contracts-and-relationship-graph
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-26
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test` |
| **Config file** | none — direct `.test.mjs` files |
| **Quick run command** | `rtk node --test tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.relationships.test.mjs tests/router.contract-eligibility.test.mjs tests/router.contract-inspection.test.mjs tests/router.control-cli.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Last audited command** | `rtk node --test tests/router.contracts.test.mjs tests/router.registry-schema.test.mjs tests/router.contract-overlays.test.mjs tests/router.inventory-mutations.test.mjs tests/router.registry-reconcile.test.mjs tests/router.relationships.test.mjs tests/router.contract-eligibility.test.mjs tests/router.registry-convergence.test.mjs tests/router.contract-inspection.test.mjs tests/router.control-cli.test.mjs tests/router.inventory-security.test.mjs` |
| **Last audited result** | 95/95 passed in 3.51s on 2026-07-26 |
| **Estimated runtime** | < 5 seconds focused |

---

## Sampling Rate

- **After every task commit:** Run the owned Phase 22 test file plus its closest Phase 21 regression test
- **After every plan wave:** Run all Phase 22 tests plus registry-schema, registry-reconcile, inventory-mutations, inventory-convergence, and inventory-security tests
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds focused

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | CONT-01, CONT-02, CONT-03 | T-22-01 | Canonical contract oracle covers unknown and malformed fields | unit + matrix | `rtk node --test tests/router.contracts.test.mjs` | ✅ | ✅ green |
| 22-01-02 | 01 | 1 | CONT-01, CONT-02, CONT-03 | T-22-01 | Field contracts and schema remain deterministic and fail closed | unit + schema | `rtk node --test tests/router.contracts.test.mjs tests/router.registry-schema.test.mjs` | ✅ | ✅ green |
| 22-02-01 | 02 | 1 | CONT-04, CONT-05, CONT-06 | T-22-02 | Overlay trust, binding, mutation, and rejection oracle | unit + security | `rtk node --test tests/router.contract-overlays.test.mjs` | ✅ | ✅ green |
| 22-02-02 | 02 | 1 | CONT-04, CONT-05, CONT-06 | T-22-02 | Exact-bound overlays participate safely in lifecycle invalidation | integration | `rtk node --test tests/router.contract-overlays.test.mjs tests/router.inventory-mutations.test.mjs tests/router.registry-reconcile.test.mjs` | ✅ | ✅ green |
| 22-03-01 | 03 | 1 | CONT-07 | T-22-03 | Eight-type relationship and weak-evidence oracle | unit + permutation | `rtk node --test tests/router.relationships.test.mjs` | ✅ | ✅ green |
| 22-03-02 | 03 | 1 | CONT-07 | T-22-03 | Endpoint and transitive invalidation run before consumers | integration | `rtk node --test tests/router.relationships.test.mjs tests/router.registry-reconcile.test.mjs tests/router.inventory-mutations.test.mjs` | ✅ | ✅ green |
| 22-04-01 | 04 | 2 | CONT-03, CONT-08 | T-22-04 | Every eligibility gate has passed, failed, and unknown coverage | unit + matrix | `rtk node --test tests/router.contract-eligibility.test.mjs` | ✅ | ✅ green |
| 22-04-02 | 04 | 2 | CONT-03, CONT-08 | T-22-04 | The sole evaluator replaces authored eligibility and dispatchability | unit + integration | `rtk node --test tests/router.contract-eligibility.test.mjs tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.relationships.test.mjs tests/router.registry-convergence.test.mjs` | ✅ | ✅ green |
| 22-05-01 | 05 | 2 | CONT-09 | T-22-05 | Inspection parity, boundedness, privacy, and read-only oracle | CLI + privacy | `rtk node --test tests/router.contract-inspection.test.mjs tests/router.control-cli.test.mjs` | ✅ | ✅ green |
| 22-05-02 | 05 | 2 | CONT-09 | T-22-05 | Contract and relationship inspection remains privacy-safe | CLI + integration | `rtk node --test tests/router.contract-inspection.test.mjs tests/router.control-cli.test.mjs tests/router.inventory-security.test.mjs` | ✅ | ✅ green |
| 22-06-01 | 06 | 3 | CONT-01–06, CONT-08, CONT-09 | T-22-21–25 | Production assembly and absent-evidence regressions are executable | integration + regression | `rtk node --test tests/router.contracts.test.mjs tests/router.contract-eligibility.test.mjs tests/router.contract-overlays.test.mjs` | ✅ | ✅ green |
| 22-06-02 | 06 | 3 | CONT-01–06, CONT-08, CONT-09 | T-22-21–25 | Contracts precede overlays and missing evidence fails closed end to end | integration | `rtk node --test tests/router.contracts.test.mjs tests/router.contract-overlays.test.mjs tests/router.contract-eligibility.test.mjs tests/router.contract-inspection.test.mjs tests/router.relationships.test.mjs tests/router.registry-schema.test.mjs tests/router.inventory-convergence.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/router.contracts.test.mjs` — CONT-01/02/03 canonical contract oracle
- [x] `tests/router.contract-overlays.test.mjs` — CONT-04/05/06 trust and mutation oracle
- [x] `tests/router.relationships.test.mjs` — CONT-07 typed graph oracle
- [x] `tests/router.contract-eligibility.test.mjs` — CONT-03/08 fail-closed gate matrix
- [x] `tests/router.contract-inspection.test.mjs` — CONT-09 CLI parity/privacy/read-only oracle
- [x] `tests/helpers/inventory-fixture.mjs` extended; no test framework installation needed

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — all CONT-01 through CONT-09 requirements and all 12 plan tasks have passing automated behavioral evidence.
