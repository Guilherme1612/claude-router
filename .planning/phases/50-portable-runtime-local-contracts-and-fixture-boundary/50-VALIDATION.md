---
phase: 50
slug: portable-runtime-local-contracts-and-fixture-boundary
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-09
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` and `node:assert/strict` |
| **Config file** | none |
| **Quick run command** | `node --test tests/router.v18-contracts.test.mjs` |
| **Full suite command** | `node --test --test-concurrency=1 tests/*.test.mjs` |
| **Estimated runtime** | focused <30 seconds; full suite <10 minutes |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/router.v18-contracts.test.mjs`
- **After every plan wave:** Run `node --test tests/router.v18-contracts.test.mjs tests/router.registry-build.test.mjs tests/router.coverage.test.mjs tests/router.contract-inspection.test.mjs`
- **Before `$gsd-verify-work`:** Full serial suite must be green
- **Max feedback latency:** 30 seconds focused

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | CVRG-06 | T-50-01 | Synthetic roots cannot fall through to live homes | contract | `node --test tests/router.v18-contracts.test.mjs` | ❌ W0 | ⬜ pending |
| 50-01-02 | 01 | 1 | CVRG-01, CVRG-05 | T-50-01 | Runtime inventories remain isolated and independently complete | integration | `node --test tests/router.v18-contracts.test.mjs` | ❌ W0 | ⬜ pending |
| 50-02-01 | 02 | 2 | CVRG-02, CVRG-03 | T-50-02 | Canonical output contains no absolute private paths or authority inference | contract | `node --test tests/router.v18-contracts.test.mjs tests/router.contract-inspection.test.mjs` | ❌ W0 | ⬜ pending |
| 50-02-02 | 02 | 2 | CVRG-04 | T-50-02 | Unknown execution-critical facts remain inspectable and non-executable | security | `node --test tests/router.v18-contracts.test.mjs` | ❌ W0 | ⬜ pending |
| 50-02-03 | 02 | 2 | CVRG-02, CVRG-05 | T-50-03 | Every discovered ID receives exactly one deterministic class | integration | `node --test tests/router.v18-contracts.test.mjs tests/router.registry-build.test.mjs tests/router.coverage.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/router.v18-contracts.test.mjs` — automated assertions for CVRG-01 through CVRG-06
- [ ] `tests/fixtures/v1.8/*.json` — anonymous portable inventory scenarios
- [ ] `tests/helpers/inventory-fixture.mjs` — isolated runtime-root materialization using existing Node standard-library helpers

No framework installation is required.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verification or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verification
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Focused feedback latency target <30 seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-09
