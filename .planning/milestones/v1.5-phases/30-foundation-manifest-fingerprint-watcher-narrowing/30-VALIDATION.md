---
phase: 30
slug: foundation-manifest-fingerprint-watcher-narrowing
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-01
---

# Phase 30 — Validation Strategy

> Retroactive Nyquist audit reconstructed from the Phase 30 PLAN, SUMMARY, and VERIFICATION artifacts.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` |
| **Config file** | none |
| **Quick run command** | `rtk node --test tests/router.build-manifest.test.mjs tests/router.cache.test.mjs tests/router.plugins-fingerprint.test.mjs tests/router.calibration-epoch.test.mjs tests/router.lifecycle-invc.test.mjs tests/router.mutation-safety.test.mjs tests/router.registry-watcher.test.mjs tests/router.calibration-thresholds.test.mjs` |
| **Full suite command** | `rtk node --test tests/*.test.mjs` |
| **Estimated runtime** | ~2 seconds for the Phase 30 validation suites |

## Sampling Rate

- **After every task commit:** Run the task's automated command in the map below.
- **After every plan wave:** Run the Phase 30 validation command above.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 2 seconds for the Phase 30 validation suites.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | INVC-01 | T-30-02 | Semantic content-sha256 fingerprint is deterministic; timestamps, paths, counts, and noise do not affect it; semantic capability changes do. | integration | `rtk node --test tests/router.build-manifest.test.mjs` | ✅ | ✅ green |
| 30-01-02 | 01 | 1 | INVC-02 | T-30-01 | Cache keys fold the fingerprint; epoch mismatch misses; omitted fingerprints use deterministic `0` fallback without throwing. | integration | `rtk node --test tests/router.cache.test.mjs tests/router.mutation-safety.test.mjs` | ✅ | ✅ green |
| 30-02-01 | 02 | 2 | INVC-04 | T-30-05 | SQLite/WAL and plugin-catalog noise is ignored while `installed_plugins.json` remains an authoritative dirty signal. | integration | `rtk node --test tests/router.registry-watcher.test.mjs` | ✅ | ✅ green |
| 30-02-02 | 02 | 2 | INVC-04 | T-30-06 | Plugin add/remove changes the epoch; timestamp/install-path-only edits remain fingerprint-stable. | integration | `rtk node --test tests/router.plugins-fingerprint.test.mjs` | ✅ | ✅ green |
| 30-03-01 | 03 | 3 | INVC-03 | T-30-01 | Only fingerprint-matched calibration wins; mismatch, absence, and corruption fail open to mode-map defaults without mutation. | integration | `rtk node --test tests/router.calibration-epoch.test.mjs tests/router.calibration-thresholds.test.mjs` | ✅ | ✅ green |
| 30-03-02 | 03 | 3 | INVC-05 | T-30-05 | Capability add/update/remove lifecycle is documented and propagates through watcher, rebuild, fingerprint, cache recompute, and re-calibration gates. | end-to-end | `rtk node --test tests/router.lifecycle-invc.test.mjs` | ✅ | ✅ green |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No stubs, fixtures, or framework installation were needed.

## Manual-Only Verifications

All Phase 30 behaviors have automated verification. No manual-only requirements remain.

## Validation Audit 2026-08-01

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Independent rerun of the eight Phase 30 suites: 108 tests passed, 0 failed.

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-01
