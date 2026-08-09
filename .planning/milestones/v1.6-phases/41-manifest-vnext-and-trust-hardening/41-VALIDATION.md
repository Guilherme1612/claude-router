---
phase: 41
slug: manifest-vnext-and-trust-hardening
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-08
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node test runner, stdlib-only — matches existing router test suite) |
| **Config file** | none — existing `test/` layout; per-module `*.test.mjs` files |
| **Quick run command** | `node --test tests/router.contract-inspection.test.mjs tests/router.contract-eligibility.test.mjs` |
| **Full suite command** | `node --test tests/` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/<phase-41-touched-module>.test.mjs`
- **After every plan wave:** Run `node --test tests/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|------------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | TRUST-01 | T-41-01 / — | provenance+status (explicit/inferred/unknown/stale/conflicting) inspectable per contract field | unit | `node --test tests/router.contract-inspection.test.mjs` | ✅ | ⬜ pending |
| 41-01-02 | 01 | 1 | TRUST-01 | — | new fields action/cost/completion/native-invocation surface with state envelope | unit | `node --test tests/router.contract-inspection.test.mjs` | ❌ W0 | ⬜ pending |
| 41-01-03 | 01 | 1 | TRUST-02 | T-41-02 | untrusted evidence (manifest/plugin/private/learned) cannot populate authority-critical fields | unit | `node --test tests/router.trust-evidence.test.mjs` | ❌ W0 | ⬜ pending |
| 41-02-01 | 02 | 2 | TRUST-03 | T-41-03 | typed-arg + entrypoint/containment/cwd/wrapper/quoting/target/runtime-scope validation before adapter | unit | `node --test tests/router.trust-invocation.test.mjs` | ❌ W0 | ⬜ pending |
| 41-02-02 | 02 | 2 | TRUST-04 | T-41-04 | dependency/permission-effect/timeout/retry/output/completion contracts validated before dispatch | unit | `node --test tests/router.trust-pregate.test.mjs` | ❌ W0 | ⬜ pending |
| 41-03-01 | 03 | 2 | TRUST-05 | T-41-05 | invalid/injection/scope-escaping capabilities quarantined with reason codes; independent valid fallbacks stay eligible | unit | `node --test tests/router.contract-eligibility.test.mjs tests/router.trust-quarantine.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/router.trust-evidence.test.mjs` — stubs for TRUST-02 untrusted-evidence quarantine
- [ ] `tests/router.trust-invocation.test.mjs` + `tests/router.trust-pregate.test.mjs` — stubs for TRUST-03/04 invocation + contract validation
- [ ] `tests/router.trust-quarantine.test.mjs` — stubs for TRUST-05 per-capability quarantine + fallback eligibility
- [ ] extend `tests/router.contract-inspection.test.mjs` — new-field + explicit/inferred/conflicting status coverage (TRUST-01)

*Existing test infrastructure (node:test, stdlib-only) covers the runner; only per-module stubs are added.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification (trust/eligibility/dispatch are pure deterministic functions).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending