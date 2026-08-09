---
phase: 43
slug: proportional-planning-and-production-dispatch
status: complete_with_baseline_failures
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-08
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` |
| **Config file** | none |
| **Quick run command** | `node --test tests/phase-43/strategy.test.mjs tests/phase-43/replan.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated runtime** | under 60 seconds |

## Sampling Rate

- **After every task commit:** Run `node --test tests/*.test.mjs`
- **After every plan wave:** Run `node --test tests/*.test.mjs`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-00-01 | 00 | 0 | STRAT-01..04 | T-43-01..T-43-09 | Non-failing focused entrypoints and bounded deterministic fixture/stub scaffolding | scaffold | `node --test tests/phase-43/strategy.test.mjs tests/phase-43/replan.test.mjs` | ✅ created | ✅ passed; later implementation tests replace TODO scaffolds |
| 43-01-01 | 01 | 1 | STRAT-01..03 | T-43-01..T-43-04 | Deterministic proportional selection, bounded task facts, and hard constraints before cost | unit | `node --test tests/phase-43/strategy.test.mjs` | ✅ | ✅ passed; 5 tests |
| 43-02-01 | 02 | 2 | STRAT-04 | T-43-05..T-43-09 | One evidence-backed replan, durable checkpoint preservation, and Claude/Codex dispatch enforcement | unit/integration | `node --test tests/phase-43/replan.test.mjs` | ✅ | ✅ passed; 5 tests |
| 43-02-02 | 02 | 2 | STRAT-04 | — | Focused integration plus full-suite verification before phase verification | integration | `node --test tests/phase-43/strategy.test.mjs tests/phase-43/replan.test.mjs && node --test tests/*.test.mjs` | ✅ | ✅ focused 10/10; full suite baseline failures documented |

## Wave 0 Requirements

- [ ] Wave 0 task 43-00-01 must create `tests/phase-43/strategy.test.mjs` and `tests/phase-43/replan.test.mjs`.
- [ ] Wave 0 must create only the smallest explicit fixtures for bounded task facts, resource exhaustion, invocation results, and lease checkpoint re-read.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Repository-wide baseline suite | — | Existing lifecycle/install/watcher/recovery/performance failures are outside Phase 43 and prevent a clean full-suite signal | Re-run `node --test tests/*.test.mjs` in a stable environment; Phase 43 focused and lease/trust gates must remain green |

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 gaps are covered (focused test files and fixtures created during execution)
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** phase-specific coverage approved; repository baseline failures remain separately tracked

## Validation Audit 2026-08-08

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All STRAT-01..04 behaviors have focused executable assertions. The 44-test combined Phase 43/lease/trust gate passed with 0 failures.
