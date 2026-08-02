---
phase: 34-per-install-auto-calibration
status: passed
nyquist_compliant: true
validated: 2026-08-01
---

# Phase 34 Nyquist Validation

| Requirement | Evidence | Result |
| --- | --- | --- |
| CALIB-03 | Derivation unit tests, accepted-floor lifecycle test, installed-hook e2e | PASS |
| CALIB-04 | Epoch reader, metadata, mismatch fallback, rollback tests | PASS |

The implementation uses the existing fingerprint-folded cache key; capability changes therefore trigger route recomputation without a second watcher.
