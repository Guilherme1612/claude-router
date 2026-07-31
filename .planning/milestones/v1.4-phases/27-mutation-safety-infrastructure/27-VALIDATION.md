---
phase: 27
slug: mutation-safety-infrastructure
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-29
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test + node:assert (built-in, Node ≥18) |
| **Config file** | none (in-file test() blocks) |
| **Quick run command** | `rtk node --test tests/router.cache.test.mjs tests/router.mutation-safety.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~15-25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `rtk node --test tests/router.cache.test.mjs tests/router.mutation-safety.test.mjs` (Plan 01) or `rtk node --test tests/router.perf-calibration.test.mjs tests/router.build-manifest.test.mjs` (Plan 02)
- **After every plan wave:** Run `rtk node --test tests/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | SAF-01 | T-27-02 | cacheKey folds weightsMtime; hot path passes real mtime | unit + integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ✅ | ✅ green |
| 27-01-01 | 01 | 1 | SAF-02 | T-27-01, T-27-05 | routeTargetsExist recomputes on absent target; fail-opens on error | unit + integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ✅ | ✅ green |
| 27-01-01 | 01 | 1 | SAF-04 | T-27-03 | capRouteRender truncates to 1/3/2/1 with drop-and-log | unit + integration | `rtk node --test tests/router.mutation-safety.test.mjs` | ✅ | ✅ green |
| 27-01-02 | 01 | 1 | SAF-01 | T-27-02 | cacheKey changes when weightsMtime changes | unit | `rtk node --test tests/router.cache.test.mjs` | ✅ | ✅ green |
| 27-01-02 | 01 | 1 | SAF-02 | T-27-01 | stale-target edge cases (partial miss, id miss, all present) | unit | `rtk node --test tests/router.mutation-safety.test.mjs` | ✅ | ✅ green |
| 27-01-02 | 01 | 1 | SAF-04 | T-27-03 | render cap boundary (exactly 3/2 = no truncate; 3/3 = truncate) | unit | `rtk node --test tests/router.mutation-safety.test.mjs` | ✅ | ✅ green |
| 27-02-01 | 02 | 1 | SAF-03 | T-27-07, T-27-08 | assessMutationSafetyRegression p95<40/max<100; 25ms canary unchanged | unit + perf regression | `rtk node --test tests/router.perf-calibration.test.mjs` | ✅ | ✅ green |
| 27-02-02 | 02 | 1 | SAF-04 | T-27-06 | mode-map size guard: 30000 passes, 30001 fails | integration | `rtk node --test tests/router.build-manifest.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/router.mutation-safety.test.mjs` — SAF-01 weights-mtime invalidation, SAF-02 stale-target recompute, SAF-04 render cap + truncation flag
- [x] `tests/router.cache.test.mjs` — cacheKey weights-mtime invalidation
- [x] `tests/router.perf-calibration.test.mjs` — assessMutationSafetyRegression gate + p95<40ms/max<100ms regression
- [x] `tests/router.build-manifest.test.mjs` — mode-map 30KB size guard
- [x] No framework install needed — node:test is built-in

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** audited green 2026-07-29

## Validation Audit 2026-07-29

| Metric | Count |
|--------|-------|
| Requirements covered | 4/4 |
| Gaps found | 3 |
| Resolved | 3 |
| Escalated | 0 |

| Requirement | Pre-audit | Behavioral evidence | Final |
|-------------|-----------|---------------------|-------|
| SAF-01 | PARTIAL | Production lookup rejects a cached route after weights mtime changes | COVERED |
| SAF-02 | PARTIAL | Poisoned cached target recomputes and is absent from injected context | COVERED |
| SAF-03 | COVERED | Strict boundary unit tests plus isolated full-corpus latency run | COVERED |
| SAF-04 | PARTIAL | Production cache-hit render path caps skills/agents and logs truncation | COVERED |

Focused verification: `rtk node --test --test-concurrency=1 tests/router.cache.test.mjs tests/router.mutation-safety.test.mjs tests/router.perf-calibration.test.mjs tests/router.build-manifest.test.mjs` — 65/65 green.
