---
phase: 34-per-install-auto-calibration
status: clean
reviewed: 2026-08-01
depth: standard
---

# Phase 34 Code Review

## Findings

No Phase 34 blocking findings. The implementation reuses the Phase 33 shadow log and Phase 30 fingerprint/cache epoch, keeps calibration off the prompt route path, validates threshold bounds, publishes atomically, and provides explicit rollback-to-default behavior.

Deferred baseline debt:

- `tests/router.mutation-safety.test.mjs:212` still rejects the existing intentional schema-route fixture; `routeTargetsExist` is outside this diff.
- Three legacy live-inventory calibration harness assertions remain red (`router.calibration-evolution.test.mjs`, `router.calibration-coverage.test.mjs`, and `router.calibrate-importable.test.mjs`). They depend on the current installed inventory/corpus expectations and produce no Phase 34 code failure; release cleanup must reconcile them before a broad-suite claim.
