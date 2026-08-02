---
phase: 36-release-gate-cleanup
plan: 03
status: complete
---

# Plan 03 Summary

The reverse-gap baseline remains 210 valid `expected_bm25_only` records. Calibration was rerun without threshold relaxation: 56/58 combined, original 10/10, codebase 7/8, evolution 2/3, with `T_high=0.591`, `T_low=0.291`, and `M=0.191`; the two known misses remain documented as threshold-margin/unknown-evolution debt.

The operator shell was exercised against the live install and explicitly marked unavailable for activation: `invalid_active_version` / `missing_or_unsafe_version`, caused by the quarantined real-home candidate (51 native-identity collisions plus the router hook descriptor collision). No unsafe activation was forced.
