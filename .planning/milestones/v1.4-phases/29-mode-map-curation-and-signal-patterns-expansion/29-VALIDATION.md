---
phase: 29
slug: mode-map-curation-and-signal-patterns-expansion
status: passed
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-29
---

# Phase 29 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` 22.22.3 |
| **Config file** | none |
| **Quick run command** | `rtk node --test tests/router.mode-map-v3.test.mjs tests/router.mode-map-curation.test.mjs tests/router.calibration-thresholds.test.mjs tests/router.route-targets.test.mjs tests/router.coverage-audit.test.mjs tests/router.lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.settings-diff.test.mjs tests/router.perf-calibration.test.mjs tests/router.build-manifest.test.mjs` |
| **Full suite command** | `rtk proxy node --test --test-concurrency=1 --test-reporter=dot tests/*.test.mjs` |
| **Estimated runtime** | ~45 seconds focused; ~3 minutes serial full suite |

## Sampling Rate

- **After every task commit:** Run the directly affected new test plus `tests/router.route-targets.test.mjs`.
- **After every plan wave:** Run the quick command and `rtk node router.calibrate.mjs`.
- **Before `$gsd-verify-work`:** Run the serial full suite, calibration CLI, Phase 27 performance gate, strict coverage rebuild, and installed-runtime dry-run.
- **Max feedback latency:** 45 seconds focused.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | SIG-02 | T-29-01 | Mixed v2/v3 patterns normalize safely | unit | `rtk node --test tests/router.mode-map-v3.test.mjs` | ✅ | ✅ green |
| 29-01-02 | 01 | 1 | SIG-01, SIG-03 | T-29-03 | Pattern cap and per-pattern collision authorization fail closed | unit | `rtk node --test tests/router.mode-map-v3.test.mjs` | ✅ | ✅ green |
| 29-02-01 | 02 | 2 | MAP-01 | — | All eight lifecycle intents route without slash-name matching | integration | `rtk node --test tests/router.mode-map-curation.test.mjs` | ✅ | ✅ green |
| 29-02-02 | 02 | 2 | MAP-02, MAP-03 | T-29-04, T-29-06 | Ten design routes are portable; injected fixtures ignore live paths/weights; blocked agents stay non-dispatchable | integration | `rtk node --test tests/router.mode-map-curation.test.mjs tests/router.route-targets.test.mjs` | ✅ | ✅ green |
| 29-02-03 | 02 | 2 | MAP-03, SIG-01, SIG-02, SIG-03 | T-29-01, T-29-03, T-29-06 | Coverage publication preserves canonical diagnostics and fails closed without the validator | integration | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.build-manifest.test.mjs` | ✅ | ✅ green |
| 29-03-01 | 03 | 3 | SIG-04 | T-29-03 | Threshold selection rejects wrong-high routes | integration | `rtk node --test tests/router.calibration-thresholds.test.mjs` | ✅ | ✅ green |
| 29-03-02 | 03 | 3 | SIG-04 | — | Independent T_high/T_low/M evidence and sensitivity are deterministic | integration | `rtk node --test tests/router.calibration-thresholds.test.mjs && rtk node router.calibrate.mjs` | ✅ | ✅ green |
| 29-04-01 | 04 | 4 | MAP-01, MAP-02, MAP-03 | T-29-04, T-29-06 | Canonical/installed map and router parity; strict repository/installed coverage | integration | `rtk node build-manifest.mjs --strict-coverage && rtk node /Users/guilherme/.claude/router/build-manifest.mjs --strict-coverage` | ✅ | ✅ green |
| 29-04-02 | 04 | 4 | MAP-01, MAP-02 | — | Installed runtime selects representative lifecycle and design routes | smoke | `rtk node /Users/guilherme/.claude/hooks/router.mjs inspect --json "<prompt>"` | ✅ | ✅ green |
| 29-04-03 | 04 | 4 | MAP-03, SIG-04 | T-29-08 | Automatic lifecycle publication and focused performance/build gates pass | integration | `rtk node --test tests/router.lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.perf-calibration.test.mjs tests/router.build-manifest.test.mjs` | ✅ | ✅ green |
| 29-04-04 | 04 | 4 | MAP-01, MAP-02, MAP-03, SIG-01, SIG-02, SIG-03, SIG-04 | T-29-08 | Complete serial release gate stays below all hot-path latency ceilings | e2e | `rtk proxy node --test --test-concurrency=1 --test-reporter=dot tests/*.test.mjs` | ✅ | ✅ green |

## Wave 0 Requirements

- [x] `tests/router.mode-map-v3.test.mjs` — mixed parser, cap, malformed values, canonical collision groups, and raw-object leak checks
- [x] `tests/router.mode-map-curation.test.mjs` — 18 positive routes, hard negatives, synthetic manifest isolation, and missing-MCP warning-only behavior
- [x] `tests/router.calibration-thresholds.test.mjs` — constrained objective, deterministic tie-break, no-wrong-high invariant, and sensitivity
- [x] Smallest injectable mode-map + manifest fixture seam
- [x] Phase 29 labeled calibration fixtures before threshold selection

## Manual-Only Verifications

None.

## Validation Sign-Off

- [x] All tasks have automated verification or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers every missing reference
- [x] No watch-mode flags
- [x] Feedback latency target < 45s
- [x] Complete serial release gate passes
- [x] `nyquist_compliant: true` set only after every automated gate is green

**Approval:** approved 2026-07-29 (autonomous workflow)

## Validation Audit 2026-07-29

| Metric | Count |
|--------|-------|
| Stale map gaps found | 6 |
| Stale map gaps resolved | 6 |
| Behavioral blockers | 1 |
| New tests required | 0 |

### Actual Results

- Focused Phase 29/lifecycle/performance/build gate: 122/122 passed.
- Calibration: 56/58 aggregate, all 18 Phase 29 positives correct, zero wrong-high, selected `0.591/0.291/0.191`.
- Repository and installed strict coverage: both exited 0.
- Canonical/installed router and mode-map parity: byte-identical.
- Installed smoke routes: `gsd-ship` and `image-to-code`.
- Full serial attempt: failed. Iteration 1 had seven failures; iteration 2 narrowed to three; iteration 3 reproduced two performance failures.

### Escalated Blocker

`tests/router.perf-evolved.test.mjs` repeatedly violates the explicit 100ms hot-path ceiling:

- weights-present path: 164.15ms, 110.79ms, then 112.10ms.
- worker-spawn path: 109.48ms, 103.53ms, then 103.11ms.

The implementation is read-only for this audit. Assertions were not weakened.

## Nyquist Remediation 2026-07-29

The prompt hook eagerly imported the 859-line `router.evolve.mjs` worker module even though only the read-only proposals API uses its five imported functions. Both measured hot paths paid that module startup cost before loading weights or spawning the detached worker.

Commit `346f2c0` gates the native dynamic import to proposal commands and library consumers. Prompt routing, weight loading and cache invalidation, detached worker semantics, privacy filtering, and proposal output are unchanged. A source-level regression check prevents the worker module from returning to a static hot-path import.

### Final Evidence

- Exact `tests/router.perf-evolved.test.mjs` command passed five consecutive retained runs after the fix; repeated worker-spawn measurements were approximately 70–76ms, below the unchanged 100ms ceiling.
- Weights/cache/proposals/latency regression set: 41/41 passed.
- Phase 29 focused routing/build/watcher matrix: 101/101 passed; lifecycle matrix passed on its retained rerun.
- Performance/build gate: 24/24 passed.
- Calibration: 56/58 aggregate, all Phase 29 required positives preserved, selected tuple `0.591/0.291/0.191`.
- Repository and installed strict coverage commands exited 0.
- Repository, Claude, and Codex hook copies are byte-identical; installed watcher and builder copies are byte-identical to repository sources.
- Installed smoke routes selected `gsd-ship` and `image-to-code`.
- Exact full serial dot-reporter command exited 0.

## Lifecycle Fixture Cleanup Remediation 2026-07-29

Integration WARNING-04 traced to the malformed-ownership test fixture: the intentional manifest corruption makes `uninstallRouter` fail closed before controller shutdown, while the fixture had discarded its detached `ChildProcess` handle and immediately removed the watched root.

Commit `18b9f51` makes that fixture retain and reference its controller child, await its real exit after SIGTERM when uninstall cannot shut it down, and only then remove the temporary directory. No product code, lifecycle behavior, assertions, or filesystem retry policy changed.

### Final Cleanup Evidence

- Malformed-manifest case: 5/5 consecutive isolated runs passed.
- Remaining lifecycle scenarios passed in focused runs; watcher/settings suite passed 32/32.
- Fresh exact full serial dot-reporter command exited 0.
- Repository and installed strict coverage commands exited 0.
- Claude/Codex hook, watcher, and builder parity remained byte-identical.

## Independent Re-Audit 2026-07-29

- Commit `346f2c0` changes only the canonical router snapshot and its performance regression test; the installed hook is byte-identical.
- Both former `<100ms` blockers passed five consecutive exact runs (10/10 tests).
- The isolated serial performance suite passed 19/19.
- The authoritative full serial dot-reporter command exited 0.
- Repository and installed strict coverage commands exited 0.
- Canonical/installed router and mode-map parity checks exited 0.
- The former lifecycle temporary-directory cleanup race (`ENOTEMPTY`) is resolved by `18b9f51`; the malformed-manifest case passed 5/5 isolated runs and the fresh authoritative full serial command exited 0.
