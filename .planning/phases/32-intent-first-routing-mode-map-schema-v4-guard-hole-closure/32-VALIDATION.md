---
phase: 32
slug: intent-first-routing-mode-map-schema-v4-guard-hole-closure
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-02
---

# Phase 32 — Validation Strategy

> Retroactive Nyquist audit reconstructed from the Phase 32 PLAN, SUMMARY, REVIEW, and VERIFICATION artifacts.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` |
| **Config file** | none |
| **Quick run command** | `rtk proxy node --test tests/router.phase32-cross-runtime.test.mjs tests/router.perf.test.mjs tests/router.schema-v4-routing.test.mjs tests/router.coverage-audit.test.mjs tests/router.resolve-tie-lint.test.mjs tests/router.mjs.snapshot.diff.test.mjs tests/router.failopen.test.mjs tests/router.guards.test.mjs` |
| **Full suite command** | `rtk proxy node --test tests/*.test.mjs` |
| **Estimated runtime** | ~1 second for the Phase 32 validation suites |

## Sampling Rate

- **After every task commit:** Run the task's automated command in the map below.
- **After every plan wave:** Run the Phase 32 validation command above.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 1 second for the Phase 32 validation suites.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 0 | ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05 | T-32-02, T-32-03, T-32-05, T-32-06 | Schema-v4 guard-hole, framework-neutral resolve, fallback, tie, and stale-target RED contracts turn green after implementation. | integration | `rtk proxy node --test tests/router.schema-v4-routing.test.mjs` | ✅ | ✅ green |
| 32-01-02 | 01 | 0 | PARITY-03, PARITY-04, ROUTE-05 | T-32-01, T-32-03 | Cross-runtime fixtures use only active runtime capabilities and quarantine/tie-lint resolve members. | integration | `rtk proxy node --test tests/router.phase32-cross-runtime.test.mjs tests/router.coverage-audit.test.mjs` | ✅ | ✅ green |
| 32-02-01 | 02 | 1 | ROUTE-01, ROUTE-02 | T-32-05, T-32-06 | Resolver candidates come only from mode plus resolve; schema version alone never validates a slash route. | integration | `rtk proxy node --test tests/router.schema-v4-routing.test.mjs tests/router.guards.test.mjs` | ✅ | ✅ green |
| 32-02-02 | 02 | 1 | ROUTE-03 | T-32-07 | Absent top candidate falls back to the next present candidate; no candidate becomes silent low/fail-open. | integration | `rtk proxy node --test tests/router.schema-v4-routing.test.mjs tests/router.failopen.test.mjs` | ✅ | ✅ green |
| 32-02-03 | 02 | 1 | ROUTE-01, ROUTE-02 | T-32-08 | Mode-map schema v4 and resolve lists remain mirror-safe and do not reintroduce dead slash injections. | integration | `rtk proxy node --test tests/router.mjs.snapshot.diff.test.mjs tests/router.schema-v4-routing.test.mjs` | ✅ | ✅ green |
| 32-03-01 | 03 | 2 | ROUTE-02, ROUTE-05 | T-32-09, T-32-10 | Coverage audit closes the schema guard hole and reports forward-orphan/stale resolve targets. | integration | `rtk proxy node --test tests/router.coverage-audit.test.mjs` | ✅ | ✅ green |
| 32-03-02 | 03 | 2 | ROUTE-04 | T-32-11 | High-confidence empty resolve emits at most one fixed generic native fallback and never fabricates a command. | integration | `rtk proxy node --test tests/router.schema-v4-routing.test.mjs` | ✅ | ✅ green |
| 32-03-03 | 03 | 2 | ROUTE-05 | T-32-03, T-32-12 | Near ties downgrade to medium; absent resolve members are quarantined; strict builds block unresolved violations. | integration | `rtk proxy node --test tests/router.resolve-tie-lint.test.mjs tests/router.build-gate.test.mjs` | ✅ | ✅ green |
| 32-04-01 | 04 | 3 | PARITY-03 | T-32-13, T-32-16 | Resolve evaluation and injection use only the active runtime's command slice. | end-to-end | `rtk proxy node --test tests/router.phase32-cross-runtime.test.mjs` | ✅ | ✅ green |
| 32-04-02 | 04 | 3 | PARITY-04 | T-32-14 | The same framework-neutral capability role resolves to each runtime's local equivalent with runtime provenance. | end-to-end | `rtk proxy node --test tests/router.phase32-cross-runtime.test.mjs` | ✅ | ✅ green |
| 32-04-03 | 04 | 3 | PARITY-03, PARITY-04 | T-32-15 | Resolve-first production path reaches render within the warm p95 <40ms / max <100ms budget and preserves mirror parity. | performance/integration | `rtk proxy node --test tests/router.perf.test.mjs tests/router.mjs.snapshot.diff.test.mjs` | ✅ | ✅ green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No framework install or new stub generation was needed.

## Manual-Only Verifications

All Phase 32 requirements have automated verification. No manual-only requirements remain.

## Validation Audit 2026-08-02

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Independent rerun of the eight Phase 32 suites: 83 tests passed, 0 failed. Dedicated build-gate suite: 5 tests passed, 0 failed.

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-02
