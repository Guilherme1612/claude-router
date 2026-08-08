---
phase: 42
slug: semantic-graph-and-safe-composition
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-08
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node test runner, stdlib-only) |
| **Config file** | none — existing `tests/` layout; per-module `*.test.mjs` files |
| **Quick run command** | `node --test tests/router.semantic-resolution.test.mjs tests/router.semantic-compilation.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/<phase-42-touched-module>.test.mjs`
- **After every plan wave:** Run `rtk node --test tests/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | SEM-01, SEM-03 | T-42-01 / T-42-02 / T-42-03 | Semantic resolver filters disposition + eligibility; compilation rejects native collisions + incompatible outputs | unit | `node --test tests/router.semantic-resolution.test.mjs tests/router.semantic-compilation.test.mjs` | ❌ W0 | ⬜ pending |
| 42-01-02 | 01 | 1 | SEM-03 | T-42-04 / T-42-05 | Full compilation checks (ambiguous ties, unsafe compositions, stale targets, missing deps) + deploy list | unit + integration | `node --test tests/router.semantic-compilation.test.mjs tests/router.relationships.test.mjs tests/router.deployed-bundle.test.mjs` | ❌ W0 | ⬜ pending |
| 42-02-01 | 02 | 2 | SEM-04 | T-42-07 / T-42-08 / T-42-10 | Substitution within unchanged bounds; permission laundering rejected; RECEIPT_STATES unchanged | unit | `node --test tests/router.semantic-substitution.test.mjs tests/router.deployed-bundle.test.mjs` | ❌ W0 | ⬜ pending |
| 42-02-02 | 02 | 2 | SEM-02 | T-42-09 | semanticProjection sanitizes all strings; safeToken fallback 'unknown'; TypeError for invalid record | unit | `node --test tests/router.semantic-inspection.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/router.semantic-resolution.test.mjs` — stubs for SEM-01 (semantic outcome resolution)
- [ ] `tests/router.semantic-compilation.test.mjs` — stubs for SEM-03 (strict compilation gate)
- [ ] `tests/router.semantic-substitution.test.mjs` — stubs for SEM-04 (contract-compatible substitution)
- [ ] `tests/router.semantic-inspection.test.mjs` — stubs for SEM-02 (semantic inspection projection)

*Test framework: node:test (built-in, no install needed). Shared fixtures: `tests/helpers/inventory-fixture.mjs` (already exists).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending