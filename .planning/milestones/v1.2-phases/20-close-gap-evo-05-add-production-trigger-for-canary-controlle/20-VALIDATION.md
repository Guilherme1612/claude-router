---
phase: 20
slug: close-gap-evo-05-add-production-trigger-for-canary-controlle
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
updated: 2026-07-23
---

# Phase 20 — Validation Strategy

Post-execution Nyquist contract for the EVO-05 production canary trigger.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 22) + `node:assert/strict` |
| **Config file** | none |
| **Quick run command** | `node --test tests/router.telemetry-bridge.test.mjs tests/router.evidence-persistence.test.mjs tests/router.deployed-bundle.test.mjs tests/router.watcher-canary-trigger.test.mjs tests/router.router-control-canary.test.mjs tests/router.watcher-telemetry-ingest.test.mjs` |
| **Full suite command** | `node --test --test-concurrency=1 tests/*.test.mjs` |
| **Observed runtime** | focused cross-phase suite 5.9s; full sequential suite 73.6s |

## Per-Plan Verification Map

| Plan | Requirement | Automated evidence | Status |
|------|-------------|--------------------|--------|
| 20-01 | EVO-05 | telemetry transform, evidence persistence, deployed evolution bundle | COVERED |
| 20-02 | EVO-05 | watcher canary trigger, candidate calibration route, promote/preserve/rollback branches | COVERED |
| 20-03 | EVO-05 | operator canary status/promote/rollback control | COVERED |
| 20-04 | EVO-05 | repeated eligible reconciles invoke the production canary path | COVERED |
| 20-05 | EVO-05 | real telemetry ingestion reaches the real persistent evidence store and watcher canary path | COVERED |

## Wave 0 Requirements

- [x] `tests/router.telemetry-bridge.test.mjs`
- [x] `tests/router.evidence-persistence.test.mjs`
- [x] `tests/router.deployed-bundle.test.mjs`
- [x] `tests/router.watcher-canary-trigger.test.mjs`
- [x] `tests/router.router-control-canary.test.mjs`
- [x] `tests/router.watcher-telemetry-ingest.test.mjs`

Existing `node:test` infrastructure covers every Phase 20 requirement; no framework installation is needed.

## Manual-Only Verifications

None. EVO-05 production-trigger behavior, persistence, bundle deployment, repeated reconciliation, and operator controls have automated coverage.

## Validation Sign-Off

- [x] Every executed plan has automated verification
- [x] No missing Wave 0 references
- [x] No watch-mode flags
- [x] Focused cross-phase suite passed 85/85
- [x] Full sequential suite passed 724/724 with 3 environment-dependent skips
- [x] `nyquist_compliant: true`

**Approval:** validated 2026-07-23 after post-milestone Nyquist reconciliation.
