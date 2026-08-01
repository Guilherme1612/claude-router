---
phase: 30-foundation-manifest-fingerprint-watcher-narrowing
plan: 3
subsystem: calibration-epoch + capability-lifecycle
tags: [calibration, fingerprint-epoch, INVC-03, INVC-05, lifecycle]
dependency_graph:
  requires: [30-01, 30-02]
  provides: [34 per-install auto-calibration, 31 runtime tagging, 35 release-gate]
  affects: [src/coverage/audit.mjs (referenced in docs, not modified), build-manifest.mjs (fingerprint consumer, read-only)]
tech-stack:
  added: []
  patterns:
    - "Epoch-gated calibration read: fingerprint match wins, mismatch/absent/corrupt -> mode-map defaults (0.591/0.291/0.191), try/catch fail-open mirroring the stat-read shape"
    - "Capability lifecycle spine: watcher -> rebuild -> coverage audit -> recompute -> re-calibrate, driven by the manifest_fingerprint epoch through the cache key"
key-files:
  created:
    - tests/router.calibration-epoch.test.mjs
    - docs/inventory-lifecycle.md
    - tests/router.lifecycle-invc.test.mjs
  modified:
    - tests/router.mjs.snapshot
decisions:
  - "Hardcoded startup threshold fallback bumped to the roadmap defaults 0.591/0.291/0.191 (was 0.6/0.3/0.2) so the named defaults are the literal defaults"
  - "loadEpochCalibration reads through a default CALIBRATION_PATH but honours opts.calibrationPath in inspectDecision for hermetic fixture tests"
  - "Lifecycle e2e proven in the add direction (skill + plugin add); remove direction already proven by 30-02 plugins-fingerprint tests"
metrics:
  duration: "~14 min"
  completed: "2026-08-01"
status: complete
actuals:
  tokens: 5444   # chars/4 over realized diff (BASE..HEAD = 21,776 chars)
  tasks: 2
  commits: 3
requirements-completed: [INVC-03, INVC-05]
---

# Phase 30 Plan 3: Calibration Epoch-Keying + Capability Lifecycle Summary

**Closed the calibration epoch-keying gap (INVC-03) with a fail-open `loadEpochCalibration()` that lets fingerprint-matched per-install thresholds win and mode-map defaults (0.591/0.291/0.191) win on every mismatch/absence/corruption, and documented + test-verified the full add/update/remove capability lifecycle (INVC-05) end-to-end.**

## What Was Built

**Task 1 — Epoch-guarded threshold read (INVC-03).** Added `CALIBRATION_PATH` and a best-effort, never-throwing `loadEpochCalibration(manifestFingerprint, { calibrationPath })` to `tests/router.mjs.snapshot` (mirroring the try/catch-return-default stat-read shape). Replaced the threshold assignment in `inspectDecision` with an epoch consult that runs after the manifest/fingerprint is known: matched calibration → per-install thresholds; mismatch/absent/corrupt → `modeMap.thresholds` or the hardcoded `{ T_high: 0.591, T_low: 0.291, M: 0.191 }` defaults. `inspectDecision` forwards `opts.calibrationPath`. Four fixture behaviors proven in `tests/router.calibration-epoch.test.mjs` (match/mismatch/absent/corrupt) plus calibration non-mutation and a direct fail-open unit check.

**Task 2 — Capability lifecycle documented + proven (INVC-05).** New `docs/inventory-lifecycle.md` names all five stages (watcher → rebuild → coverage audit → recompute → re-calibrate) with the files each stage touches and the plugin-noise narrowing rule (installed_plugins.json authoritative; sqlite/WAL + plugin-catalog caches ignored). New `tests/router.lifecycle-invc.test.mjs` proves the add direction: skill add bumps F0→F1 and the F0-keyed cache entry is a MISS (route recomputed, not stale), plugin add bumps F1→F2 (differs from both F0 and F1), and a no-op rebuild preserves the fingerprint (byte-stable).

## Task Commits

1. `5f29b0c` — test(30-03): add failing INVC-03 calibration epoch-keying tests (RED)
2. `ff12485` — feat(30-03): epoch-gated calibration threshold read in the hook (GREEN)
3. `19d1f6d` — feat(30-03): document + prove the add/update/remove capability lifecycle

## TDD Gate Compliance

Verified in git log: a `test(...)` commit (`5f29b0c`) precedes the `feat(...)` GREEN commits (`ff12485`, `19d1f6d`). RED gate confirmed (3 failures incl. `loadEpochCalibration is not a function` + match-threshold behavior); GREEN gate passes (6/6 calibration-epoch; 3/3 lifecycle-invc).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Calibration non-mutation test read the temp calibration file after `withTempDir` removed it**
- **Found during:** Task 1 GREEN verification
- **Issue:** The "calibration file is not mutated" assertion read `calibrationPath` after `decisionFor()` had already cleaned up the temp dir → `ENOENT`.
- **Fix:** `decisionFor` now captures the on-disk content inside the temp scope and returns it as `onDisk`; the non-mutation test asserts on `onDisk`. Also made the on-disk capture tolerant of the corrupt fixture and added `existsSync`/`readFileSync` imports.
- **Files modified:** tests/router.calibration-epoch.test.mjs
- **Commit:** `ff12485` (GREEN)

**2. [Rule 1 - Bug] `require('node:fs')` + leftover placeholder assertion in the RED test cleaned up before GREEN**
- **Found during:** Task 1 test authoring
- **Issue:** An ESM-invalid `require('node:fs')` and a no-op `assert.match` placeholder would fail the suite for the wrong reason.
- **Fix:** Replaced with the `readFileSync` import and removed the placeholder assertion.
- **Files modified:** tests/router.calibration-epoch.test.mjs
- **Commit:** `ff12485` (GREEN)

**3. [Env] Staged the hook directly instead of `node install-router.mjs` (pre-existing degraded watcher blocker)**
- **Found during:** Task 1 staging
- **Issue:** As in 30-01, `install-router.mjs`'s live controller readiness check is wedged by the standing v1.4 BLOCKER-2 degraded-watcher state, so relying on it to stage the hook is unreliable.
- **Fix:** Copied `tests/router.mjs.snapshot → ~/.claude/hooks/router.mjs` (the exact staging op install-router.mjs performs) and verified byte-identical before every run. No repo files changed; the installed hook is the intended current version.
- **Committed in:** n/a (staging only)

**4. [Scope-appropriate] Added a no-op-rebuild determinism assertion to the lifecycle e2e**
- **Found during:** Task 2 authoring
- **Issue:** The plan specified two lifecycle tests; a no-op rebuild preserving the fingerprint is the flip side (INVC-01 determinism) that makes the miss-asertion trustworthy.
- **Fix:** Added a third test asserting identical rebuild → identical fingerprint.
- **Files modified:** tests/router.lifecycle-invc.test.mjs
- **Commit:** `19d1f6d`

## Tests / Verification

- `node --test tests/router.calibration-epoch.test.mjs` → 6 pass / 0 fail (INVC-03)
- `node --test tests/router.lifecycle-invc.test.mjs` → 3 pass / 0 fail (INVC-05)
- Regression: `tests/router.calibration-thresholds.test.mjs` + `tests/router.mutation-safety.test.mjs` + `tests/router.cache.test.mjs` → 56 pass / 0 fail
- grep gate: `docs/inventory-lifecycle.md` contains all five stage keywords (9 matches across watcher/rebuild/coverage audit/recompute/re-calibrate)

## Constraints Honored

- stdlib-only (no npm deps / no package installs — T-30-SC accepted)
- fail-open: `loadEpochCalibration` never throws on the hot path (T-30-09 mitigated)
- <100ms hot path: epoch consult is one small try/catch file read; calibration gating adds negligible cost
- Calibration read never mutates the curated mode-map or the calibration file (epoch-gated read only)
- installed_plugins.json stays the authoritative plugin signal; sqlite/WAL + plugin-catalog caches ignored

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-read | tests/router.mjs.snapshot | `loadEpochCalibration` reads `.claude/router/calibration.json` (new untrusted-local input). Mitigated by epoch gate + try/catch; on any mismatch/absence/corruption defaults win. Matches plan threat register T-30-08 (accept) / T-30-09 (mitigate). |

## Self-Check: PASSED

Files, commits, and verification all confirmed present before state updates (see below).

---

*Phase: 30-foundation-manifest-fingerprint-watcher-narrowing*
*Completed: 2026-08-01*
