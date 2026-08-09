---
phase: 56-live-installer-and-upgrade-truth
verified: 2026-08-09T19:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 56 Verification: Live Installer and Upgrade Truth

## Goal

Upgrade the owned Claude and Codex installations safely and prove rollback, uninstall, recovery, and preservation of user-owned state.

## Must-Haves

| Must-have | Evidence | Result |
|---|---|---|
| Before/after live state is captured without raw prompt/session bodies | `scripts/v19-live-snapshot.mjs`, `tests/router.v19-live-snapshot.test.mjs`, `live-before.json`, `live-after.json` | PASS |
| Existing installer upgrades both homes with exact source/installed identity | `live-recovery.json` preflight/upgrade; source router SHA-256 `1cbdd1f5...`; evolve SHA-256 `80b11490...`; immutable mismatches `0` | PASS |
| Unrelated state and coexisting hooks survive | `live-upgrade.json` preservation recheck; normalized user projections and external digests equal | PASS |
| Owned uninstall/reinstall and recovery leave no orphaned Router roots | `live-recovery.json`; fixed uninstall removed `322`, retained `0`; focused 36/36; full 1651/1651 | PASS |

## Runtime Safety Boundary

The final clean reinstall is intentionally not reported as semantic activation success. The controller reaches `ready`, but its bounded reconciliation state is `disposition: quarantined`, `activation_status: preserved`, with both active tuple and active pointer absent. This is fail-closed and consistent: no unsafe candidate was published and no dangling pointer remains. The remaining native path-escape, cycle, and hook-invalid diagnostics belong to Phase 57 (`HEALTH-01`/`HEALTH-02`) and must be resolved before active semantic publication is claimed.

## Automated Checks

- `node --test --test-concurrency=1 tests/router.v19-live-snapshot.test.mjs` — 2/2 passed.
- `node --test --test-concurrency=1 tests/router.installer-coexistence.test.mjs tests/router.lifecycle-recovery.test.mjs tests/router.phase26-lifecycle.test.mjs tests/router.v19-live-snapshot.test.mjs` — 36/36 passed.
- `node --test --test-concurrency=1 tests/router.failopen.test.mjs tests/router.safety-release.test.mjs` — 27/27 passed against the redeployed live hook.
- `node --test --test-concurrency=1` — 1,651/1,651 passed, 0 failed, 0 cancelled, 0 skipped.

## Verification Result

Phase 56 is verified for its installer/recovery goal. Phase 57 remains required for truthful native runtime health and active-tuple publication under the quarantined live inventory state.
