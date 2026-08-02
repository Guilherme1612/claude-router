---
phase: 34-per-install-auto-calibration
plan: 01
status: complete
requirements-completed: [CALIB-03]
---

# Plan 01 Summary

Added bounded per-install threshold derivation to the production hook.

- Requires 50 accepted shadow outcomes.
- Uses a reproducible Beta posterior centered on shipped defaults, 70/30 damping, 0.05 hysteresis, and valid clamps.
- Emits a corpus hash and evidence counts without reading or persisting raw prompt content.
- Unit and epoch-gating coverage passes.

Verification: 9/9 tests passed across `router.auto-calibration.test.mjs` and `router.calibration-epoch.test.mjs`.
