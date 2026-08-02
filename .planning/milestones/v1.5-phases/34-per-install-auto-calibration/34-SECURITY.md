---
phase: 34-per-install-auto-calibration
status: passed
audited: 2026-08-01
---

# Phase 34 Security Audit

- Calibration consumes only already-redacted shadow rows and writes no raw prompts, commands, tool payloads, or transcript paths.
- Calibration files are written under the private router directory with `0600` file permissions and atomic temp-file replacement.
- Invalid evidence, malformed records, invalid thresholds, missing fingerprints, epoch mismatches, and rollback states fail open to curated defaults.
- Threshold movement is bounded by the sample floor, damping, hysteresis, ordering, and `[0,1]` clamps; the mode map is never mutated.

Result: no Phase 34 security findings.
