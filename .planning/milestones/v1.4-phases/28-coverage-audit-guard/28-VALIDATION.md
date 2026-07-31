---
phase: 28
slug: coverage-audit-guard
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-29
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` on Node 22.22.3 |
| **Config file** | none |
| **Quick run command** | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.freshness.test.mjs tests/router.build-manifest.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~30 seconds focused; full-suite runtime measured during execution |

---

## Sampling Rate

- **After every task commit:** Run `rtk node --test tests/router.coverage-audit.test.mjs tests/router.freshness.test.mjs tests/router.build-manifest.test.mjs`
- **After every plan wave:** Run the focused command plus `rtk node --test tests/router.coverage.test.mjs tests/router.route-targets.test.mjs tests/router.failopen.test.mjs`
- **Before `$gsd-verify-work`:** `rtk node --test tests/*.test.mjs` must be green
- **Max feedback latency:** 30 seconds for the focused command

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | COV-02, COV-04 | T-28-01 | Explicit typed baseline contract cannot suppress forward orphans | structural + unit | `rtk node --check tests/router.coverage-audit.test.mjs && rtk rg -q "auditCoverage" tests/router.coverage-audit.test.mjs && rtk node -e "const b=require('./coverage-baseline.json');if(b.schema_version!==1||!Array.isArray(b.entries))process.exit(1)"` | ✅ | ✅ green |
| 28-01-02 | 01 | 1 | COV-02, COV-03 | T-28-01, T-28-05 | Deterministic minimal report schema and baseline-safe bi-directional orphan detection | unit | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.coverage.test.mjs tests/router.route-targets.test.mjs` | ✅ | ✅ green |
| 28-01-03 | 01 | 1 | COV-01 | T-28-02 | Atomic report publication plus builder-relative baseline deployment and consumption | integration | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.build-manifest.test.mjs tests/router.installer-coexistence.test.mjs` | ✅ | ✅ green |
| 28-02-01 | 02 | 2 | COV-04 | T-28-01 | Strict failures only for unacknowledged reverse gaps | integration | `rtk node --test tests/router.coverage-audit.test.mjs` | ✅ | ✅ green |
| 28-02-02 | 02 | 2 | COV-05 | T-28-04 | Freshness errors remain fail-open | unit + integration | `rtk node --test tests/router.freshness.test.mjs tests/router.failopen.test.mjs` | ✅ | ✅ green |

---

## Wave 0 Requirements

- [x] `tests/router.coverage-audit.test.mjs` — taxonomy, typed identity, baseline, deterministic report, atomic publication, and strict subprocess matrix
- [x] Extend `tests/router.freshness.test.mjs` — missing, older, equal/newer, stat error, and context composition
- [x] Add fixture environment overrides for report and baseline paths to the existing builder subprocess helper

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verification or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency target < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-29 (autonomous workflow)

## Validation Audit 2026-07-29

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

- Adversarial focused matrix: `rtk node --test tests/router.coverage-audit.test.mjs tests/router.freshness.test.mjs tests/router.build-manifest.test.mjs tests/router.installer-coexistence.test.mjs tests/router.coverage.test.mjs tests/router.route-targets.test.mjs tests/router.failopen.test.mjs` — 75/75 passed, 0 skipped.
- Full serial workspace gate: `rtk node --test --test-concurrency=1 tests/*.test.mjs` — exit status 0.
- COV-01..05 are covered by behavioral unit, subprocess, and lifecycle-install tests. Evidence includes strict report-before-failure, duplicate/stale/pre-authorizing baseline rejection, forward-orphan immunity to baseline suppression, Claude/Codex deployed asset parity, default-path installed baseline consumption, and stale/missing/error reminder fail-open composition.
