---
phase: 17
slug: compiled-prompt-routing-and-safe-evolution
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for compiled prompt routing, privacy-safe canary evolution, rollback, and latency calibration.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`) |
| **Config file** | none — tests are direct `.mjs` suites |
| **Quick run command** | `node --test tests/router.compiled-index.test.mjs tests/router.evolution-canary.test.mjs tests/router.perf-calibration.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated runtime** | ~30 seconds |

## Sampling Rate

- **After every task commit:** Run the task's focused `node --test` command.
- **After every plan wave:** Run `node --test tests/*.test.mjs`.
- **Before `$gsd-verify-work`:** Full suite and calibration gates must be green.
- **Max feedback latency:** 60 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | REL-01 | — | Reject stale, corrupt, incompatible, candidate, and quarantined indexes deterministically | unit | `node --test tests/router.compiled-index.test.mjs` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | REL-01 | — | Atomic pointer and known-good fallback never scan inventories | unit | `node --test tests/router.compiled-index.test.mjs` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | REL-01 | — | Prompt seam preserves Phase 16 outcomes when no compatible index exists | integration | `node --test tests/router.compiled-index.test.mjs tests/router.workflow-orchestrator.test.mjs` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | EVO-05 | T-17-01 | Telemetry envelopes reject prompt text, context bodies, reversible signatures, and unbounded fields before storage | unit | `node --test tests/router.evolution-canary.test.mjs` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 2 | EVO-05 | T-17-02 | Project isolation, explicit aggregate eligibility, deterministic decay, retention, and minimum samples bound evidence | unit | `node --test tests/router.evolution-canary.test.mjs` | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 2 | EVO-05 | T-17-03 | Immutable reproducible candidates require sufficient evidence and every independent hard gate | unit | `node --test tests/router.evolution-canary.test.mjs` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 3 | EVO-05 | T-17-04 | Hard failures reject or atomically roll back through the existing journal and last-known-good path | integration | `node --test tests/router.evolution-canary.test.mjs tests/router.registry-activation.test.mjs` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 3 | EVO-05, REL-01 | — | Fixed versioned corpus locks seven route/context classes; warm p95 is below 25 ms and every route below 100 ms | performance | `node --test tests/router.perf-calibration.test.mjs` | ❌ W0 | ⬜ pending |
| 17-03-03 | 03 | 3 | EVO-05, REL-01 | — | End-to-end lifecycle preserves Phase 16 semantics, requires demonstrated benefit, and rolls back quality or latency regression | integration | `node --test tests/router.compiled-evolution.test.mjs tests/router.evolution-canary.test.mjs tests/router.perf-calibration.test.mjs tests/router.workflow-orchestrator.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

Existing `node:test` infrastructure covers the phase. The listed Phase 17 test files are created test-first within their owning tasks; no framework bootstrap is required.

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] Every anticipated task has a focused automated command.
- [x] Sampling continuity: no three consecutive tasks lack automated verification.
- [x] Existing infrastructure covers all planned test files.
- [x] No watch-mode flags.
- [x] Feedback latency target is below 60 seconds.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-16
