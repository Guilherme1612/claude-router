---
phase: 29-mode-map-curation-and-signal-patterns-expansion
fixed_at: 2026-07-29T19:25:53.514Z
review_path: .planning/v1.4-INTEGRATION.md
iteration: 5
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 29: Code Review Fix Report

**Fixed at:** 2026-07-29T19:25:53.514Z
**Source review:** `.planning/v1.4-INTEGRATION.md`
**Iteration:** 5

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Fixed Issues

### WARNING-04: Lifecycle fixture cleanup races its detached controller

**Files modified:** `tests/router.lifecycle.test.mjs`
**Commit:** 18b9f51
**Applied fix:** The malformed-manifest fixture now retains a referenced `ChildProcess`, prevents the test-only launcher from unref'ing it, sends SIGTERM only when uninstall cannot perform cooperative shutdown, and awaits the controller's actual exit before deleting the watched temporary root. Product lifecycle behavior and assertions are unchanged; filesystem deletion has no retry mask.

## Verification

- Malformed-manifest lifecycle case passed 5/5 consecutive isolated runs.
- Remaining lifecycle scenarios passed in focused runs; watcher/settings suite passed 32/32.
- Full serial dot-reporter command exited 0.
- Exact repository strict gate: `rtk node build-manifest.mjs --strict-coverage` exited 0.
- Exact installed strict gate: `rtk node /Users/guilherme/.claude/router/build-manifest.mjs --strict-coverage` exited 0.
- Installed parity: Claude and Codex hooks match the repository snapshot; both deployed watcher and builder copies match repository bytes.

---

_Fixed: 2026-07-29T19:25:53.514Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 5_
