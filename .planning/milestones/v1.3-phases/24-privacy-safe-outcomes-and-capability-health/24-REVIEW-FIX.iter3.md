---
phase: 24-privacy-safe-outcomes-and-capability-health
fixed_at: 2026-07-28T16:05:00Z
review_path: .planning/phases/24-privacy-safe-outcomes-and-capability-health/24-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-07-28T16:05:00Z
**Source review:** .planning/phases/24-privacy-safe-outcomes-and-capability-health/24-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — critical_warning scope excludes IN-01, IN-02)
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: `deriveOutcomeKind` checks `replaced` before `helpful_reuse`, contradicting its own documented priority order

**Files modified:** `src/health/observe.mjs`, `tests/router.health.observe.test.mjs`
**Commit:** `980c4e9`
**Applied fix:** Split the combined `actually_used`/`replaced` block so the documented priority order (1 > 2 > 3 > 4) is preserved end-to-end. The prior code checked `2` and `4` in one branch before `3`, so when both `replaced` (next record invokes a different cap) and `helpful_reuse` (a later record reuses this cap on a different route_id) signals were present, `replaced` won — contradicting the documented `3 > 4`. The fix checks `2` (actually_used) first, then `3` (helpful_reuse), then `4` (replaced) as a fall-through.

The reviewer's suggested fix moved `3` before the entire `2`/`4` block, which would have made `helpful_reuse` win over `actually_used` — contradicting the documented `2 > 3`. This fix is stricter: it preserves the full documented priority order, not just `3 > 4`. Added two regression tests: one asserting `helpful_reuse` wins over `replaced` (the conflict the reviewer flagged), and one asserting `actually_used` wins over `helpful_reuse` (the conflict the reviewer's suggested fix would have broken). Both tests construct both signals simultaneously; full health test suite (139 tests, 8 files) passes.

Marked `fixed: requires human verification` (per the verification_strategy logic-bug limitation) — the fix changes a precedence decision, so a human should confirm the documented priority order (and not the code's prior behavior) is the semantically correct one.

### WR-02: canary-bridge `recoverActiveVersion` double-appends the `versions/` path — always reads a nonexistent file

**Files modified:** `src/health/canary-bridge.mjs`, `tests/router.health.canary.test.mjs`
**Commit:** `ff2a1d6`
**Applied fix:** `recoverActiveVersion` now reads `active.json` directly from `join(ownedRoot, 'active.json')` instead of delegating to `readActivePointer(ownedRoot)`. The caller (`promoteThresholdCandidate` → `applyCanaryDecision`) passes the versions root (`join(healthRoot, 'versions')`) as `ownedRoot`; `readActivePointer` appends another `versions/` segment, so the delegation read `<healthRoot>/versions/versions/active.json` (nonexistent) and always returned null. The fix reads the pointer at the correct path. Exports `createHealthPublication` for direct unit testing and adds two tests: one that promotes a candidate then asserts `recoverActiveVersion({ ownedRoot: versionsRoot })` returns the promoted `policy_version` (would have returned null before the fix), and one that asserts `version_id: null` when `active.json` is absent.

### WR-03: canary-bridge persists activated thresholds that `scoreCapability` never reads — the activation has no effect on scoring

**Files modified:** `src/health/score.mjs`, `src/health/thresholds.mjs`
**Commit:** `8a483a7`
**Applied fix:** Applied option (b) from the reviewer's two options. Added clarifying comments at `score.mjs` `DEFAULT_WEIGHTS = VERSIONED_WEIGHTS` and at `thresholds.mjs` `loadThresholds` export, documenting that production consumption of activated thresholds is intentionally deferred to a later phase, that the canary bridge writes are validated for shape and atomicity now, and that wiring the scorer to the activated bundle is a separate behavioral change requiring a new `ownedRoot` parameter on `scoreCapability` and updated call sites. The symmetric notes cross-reference each other so a future reader of either file sees the deferral is a known gap, not a bug.

Option (a) (wiring `scoreCapability` to `loadThresholds(readActivePointer(ownedRoot))`) was not taken because it requires a non-trivial API change (`scoreCapability` has no `ownedRoot` parameter; all call sites would need updating), and the reviewer explicitly noted the deferral "may be intentional phasing." Per the project's Simplicity First and Surgical Changes guidelines, the comment-only fix is the minimum change that closes the gap-as-bug confusion without introducing speculative behavior. This finding is documentation-only; no code behavior changed.

## Skipped Issues

None — all three in-scope findings were fixed.

---

_Fixed: 2026-07-28T16:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_