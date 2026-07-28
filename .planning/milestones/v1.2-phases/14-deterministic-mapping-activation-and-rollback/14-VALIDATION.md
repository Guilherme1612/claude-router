---
phase: 14
slug: deterministic-mapping-activation-and-rollback
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-15
updated: 2026-07-16
---

# Phase 14 — Validation Strategy

> Node built-in test coverage for deterministic mapping, immutable activation, recovery/retention, and preview-first typed-confirmed rollback.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Node.js v22 built-in `node:test` with `node:assert/strict` |
| **Config file** | none — repository tests are ESM `*.test.mjs` files |
| **Quick run command** | `node --test <focused Phase 14 suite> <closest regression suite>` |
| **Wave run command** | `node --test tests/router.registry-map.test.mjs tests/router.registry-activate.test.mjs tests/router.control-cli.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-diff.test.mjs tests/router.lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-build.test.mjs tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.route-targets.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Target focused runtime** | under 120 seconds, no watch mode |

## Sampling Rate

- **After every task:** Run that task's `<automated>` command.
- **After every plan wave:** Run the Wave run command above; Wave 3 also runs the full suite.
- **Before `$gsd-verify-work 14`:** `node --test tests/*.test.mjs` and `git diff --check` must pass.
- **Max feedback latency:** 120 seconds for focused verification.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---:|---:|---|---|---|---|---|---|---|
| 14-01-01 | 01 | 1 | MAP-01 | T-14-01–06 | Precedence, exact-candidate safety, portable evidence, bounded advisory input | unit/fixture | `node --test tests/router.registry-map.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-diff.test.mjs` | ✅ | ✅ green |
| 14-01-02 | 01 | 1 | MAP-01 | T-14-01–06 | Byte-stable mapper cannot emit absent/unsafe targets or let weak evidence override authority | unit/calibration | `node --test tests/router.registry-map.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-diff.test.mjs tests/router.route-targets.test.mjs` | ✅ | ✅ green |
| 14-02-01 | 02 | 2 | ACT-01 | T-14-07–12 | Frozen production runners, durability boundaries, TOCTOU, recovery, retention, and audit privacy | unit/failure injection | `node --test tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs tests/router.calibration-codebase.test.mjs tests/router.lifecycle.test.mjs` | ✅ | ✅ green |
| 14-02-02 | 02 | 2 | ACT-01 | T-14-07–12 | Trusted gates reject fabricated results and publish only complete immutable versions | integration/failure injection | `node --test tests/router.registry-activate.test.mjs tests/router.registry-map.test.mjs tests/router.registry-reconcile.test.mjs tests/router.calibration-codebase.test.mjs tests/router.lifecycle.test.mjs` | ✅ | ✅ green |
| 14-02-03 | 02 | 2 | MAP-01, ACT-01 | T-14-01–12 | Live reconcile → map → verify → activate order and preservation paths | controller integration | `node --test tests/router.registry-watcher.test.mjs tests/router.registry-map.test.mjs tests/router.registry-activate.test.mjs tests/router.registry-reconcile.test.mjs` | ✅ | ✅ green |
| 14-03-01 | 03 | 3 | MAP-01, ACT-01 | T-14-13–18 | Mutation-free reads and preview-first exact-confirmed rollback | subprocess/integration | `node --test tests/router.control-cli.test.mjs tests/router.registry-map.test.mjs tests/router.registry-activate.test.mjs` | ✅ | ✅ green |
| 14-03-02 | 03 | 3 | MAP-01, ACT-01 | T-14-15 | Transactional dual-runtime owned deployment | integration | `node --test tests/router.lifecycle.test.mjs tests/router.control-cli.test.mjs tests/router.settings-diff.test.mjs` | ✅ | ✅ green |
| 14-04-01 | 04 | 4 | MAP-01, ACT-01 | T-14-04-01 | Installed controllers share owned activation authority | integration | `node --test tests/router.lifecycle.test.mjs tests/router.registry-watcher.test.mjs` | ✅ | ✅ green |
| 14-04-02 | 04 | 4 | MAP-01, ACT-01 | T-14-04-02–03 | Canonical ambiguity and blocked recovery fail closed | integration | `node --test tests/router.registry-map.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs` | ✅ | ✅ green |
| 14-05-01 | 05 | 5 | MAP-01, ACT-01 | T-14-05-01 | Activation authenticates exact-input production evidence | integration/failure injection | `node --test tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs` | ✅ | ✅ green |
| 14-05-02 | 05 | 5 | MAP-01, ACT-01 | T-14-05-02 | Equivalence and calibration gates exercise named behavior | integration/calibration | `node --test tests/router.registry-watcher.test.mjs tests/router.registry-map.test.mjs tests/router.calibrate.test.mjs` | ✅ | ✅ green |
| 14-06-01 | 06 | 6 | ACT-01 | T-14-06-01 | Pointer publication is cross-process compare-and-swap | integration/race | `node --test tests/router.registry-activate.test.mjs` | ✅ | ✅ green |
| 14-06-02 | 06 | 6 | ACT-01 | T-14-06-02 | Recovery and rollback select deterministic semantic known-good history | integration | `node --test tests/router.registry-activate.test.mjs` | ✅ | ✅ green |
| 14-06-03 | 06 | 6 | ACT-01 | T-14-06-03 | Durable rollback journal reports truthful outcomes | integration/failure injection | `node --test tests/router.registry-activate.test.mjs` | ✅ | ✅ green |
| 14-07-01 | 07 | 7 | ACT-01 | T-14-07-01–02 | Large results expose stable totals, bounds, and continuation | subprocess/integration | `node --test tests/router.control-cli.test.mjs` | ✅ | ✅ green |
| 14-07-02 | 07 | 7 | ACT-01 | T-14-07-03 | Corrupt active history fails closed before projection | subprocess/integration | `node --test tests/router.control-cli.test.mjs tests/router.registry-activate.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [x] `tests/router.registry-map.test.mjs` — policy, precedence, permutation, exact-target, advisory, and calibration fixtures.
- [x] `tests/router.registry-activate.test.mjs` — complete/corrupt bundles, integrity, CAS, recovery, rollback, and injected failure boundaries.
- [x] `tests/router.registry-watcher.test.mjs` — trusted runner selection, strict ordering, activation, ambiguity, recovery, and preservation paths.
- [x] `tests/router.control-cli.test.mjs` — text/JSON parity, stdin, exit taxonomy, mutation-free reads, bounded previews, confirmation, and privacy.
- Existing `node:test`, reconciliation, lifecycle, settings, adapter, build/schema, watcher, route-target, and calibration infrastructure requires no framework installation.

## Requirement Coverage Matrix

| Requirement | Automated evidence |
|---|---|
| MAP-01 | Explicit → identity → authoritative inheritance → lexical precedence; strong conflicts; absolute/margin thresholds; safe active-but-unmapped candidate activation without dispatch mapping; advisory re-entry; exact-candidate target predicates; input permutations; portable evidence; calibration preservation. |
| ACT-01 | Frozen production registry for all eight concrete gates with fixed local functions/commands, thresholds, bounded measured evidence, timeouts, and injection/substitution rejection; missing/stale/incomplete/fabricated/failed evidence rejection; live mapped and safe-unmapped automatic activation; directory-sync capability/probe and exact resolved failure statuses; immutable bundle closure; named TOCTOU race; recovery/retention/rollback/confirmation/audit privacy; owned deployment. |

## Manual-Only Verifications

All phase behaviors have automated verification. Interactive confirmation is exercised through deterministic subprocess stdin; no manual-only checkpoint is needed.

## Threat Verification Matrix

| Threat | Automated proof |
|---|---|
| T-14-01–06 | Candidate/advisory mutation matrices, authority conflicts, target-safety table, input bounds, and portable-output assertions in `router.registry-map`. |
| T-14-07–12 | Trusted-gate fabrication/staleness, path/symlink/manifest corruption, named verification-to-pointer replacement/symlink-swap injection, resolved directory-sync outcomes, retention protection, rollback verification, and audit privacy in activation/watcher suites. |
| T-14-13–18 | Confirmation/preview replay, rollback destination replacement/symlink swap, argument/path validation, deterministic render parity, leakage checks, and transactional owned deployment in CLI/lifecycle suites. |

## Validation Sign-Off

- [x] Every final task has an `<automated>` verification command.
- [x] Sampling continuity has no gap between behavior changes and automated feedback.
- [x] Wave 0 names every missing focused suite and creates each before its production module.
- [x] No watch-mode flags are used.
- [x] Focused feedback latency target is under 120 seconds.
- [x] MAP-01 and ACT-01 each have direct automated evidence across normal and failure paths.
- [x] High-severity STRIDE mitigations have explicit tests and no accepted high-severity risk.
- [x] `nyquist_compliant: true` is supported by the final task/command map.

**Approval:** approved 2026-07-16 after post-execution Nyquist audit

## Validation Audit 2026-07-16

| Metric | Count |
|---|---:|
| Requirements audited | 2 |
| Final tasks audited | 16 |
| Missing behavioral tests | 0 |
| Focused tests executed | 76 |
| Focused tests passed | 76 |
| Escalated | 0 |

MAP-01 and ACT-01 are **COVERED**. No requirement is PARTIAL or MISSING, so no new test file was generated. The core Phase 14 command passed 76/76. One broader combined diagnostic run also exposed an unrelated sandbox-only `EPERM` in a release test that writes to `~/.claude` and one lifecycle timing miss; the lifecycle case passed on the bounded retry, and neither is a missing Phase 14 requirement test.
