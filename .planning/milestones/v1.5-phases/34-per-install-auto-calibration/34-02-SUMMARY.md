---
phase: 34-per-install-auto-calibration
plan: 02
status: complete
requirements-completed: [CALIB-04]
---

# Plan 02 Summary

Wired calibration publication to shadow settlement and strengthened epoch reads.

- A fresh accepted outcome can activate `calibration.json` once the floor is reached.
- The file is atomically replaced, carries manifest/mode-map/corpus metadata, and retains rollback thresholds.
- Fingerprint or mode-map mismatch and explicit rollback return routing to curated defaults.
- Snapshot/live-hook parity remains locked.

Verification: lifecycle, rollback, epoch, and mirror checks pass.
