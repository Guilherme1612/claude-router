---
phase: 42-semantic-graph-and-safe-composition
fixed_at: 2026-08-08T20:05:00Z
review_path: .planning/phases/42-semantic-graph-and-safe-composition/42-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-08-08T20:05:00Z
**Source review:** .planning/phases/42-semantic-graph-and-safe-composition/42-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (1 critical, 3 warnings)
- Fixed: 4
- Skipped: 0

**Verification:** All phase-42 test files run after fixes (69 tests, 0 fail).
Tests ran in the main checkout (workflow.use_worktrees=false — no worktree created).

## Fixed Issues

### CR-01: REVERSIBILITY_ORDER contradicts documented safety ordering — allows less-safe substitute within bounds check

**Files modified:** `src/registry/substitute.mjs`, `tests/router.semantic-substitution.test.mjs`
**Commit:** 99cfcd2
**Applied fix:** Reordered `REVERSIBILITY_ORDER` from `['unknown','reversible','irreversible']` to `['reversible','unknown','irreversible']` so `reversible` is index 0 (safest), matching the documented safety ordering. Added a regression test asserting that an `unknown`-reversibility substitute for a `reversible` original is blocked (the previously-uncatched gap).

### WR-01: resolveSemanticOutcome picks candidates[0] non-deterministically when multiple candidates have distinct fit scores

**Files modified:** `src/registry/semantic.mjs`
**Commit:** 5af1e54
**Applied fix:** Added `candidates.sort((a, b) => a.stable_id.localeCompare(b.stable_id))` before the `candidates[0]` selection, making the resolved match byte-identical regardless of input record ordering. Consistent with the deterministic-sort convention in `compileRelationshipGraph` and `deriveRelationships`.
**Status:** fixed: requires human verification (determinism logic — verify no existing resolver output relies on input-order sensitivity).

### WR-02: SUBSTITUTION_REASONS exported list is incomplete — missing emitted reason codes

**Files modified:** `src/registry/substitute.mjs`
**Commit:** 9f75311
**Applied fix:** Made `SUBSTITUTION_REASONS` exhaustive over all codes `computeBoundsViolations` can emit. Added the 5 per-field `*_unknown` codes (`substitution_permissions_unknown`, `substitution_risk_unknown`, `substitution_reversibility_unknown`, `substitution_side_effects_unknown`, `substitution_invocation_kind_unknown`) and the 2 named codes (`substitution_side_effects_expanded`, `substitution_invocation_kind_changed`).

### WR-03: compileRelationshipGraph risk comparison treats unrecognized enum value as safest

**Files modified:** `src/registry/relationships.mjs`
**Commit:** 2d9c60e
**Applied fix:** Extracted a `riskLevel(envelope)` helper in the unsafe-composition gate that returns `RISK_ORDER.length - 1` (highest/unsafe) when `indexOf` returns `-1` for an unrecognized risk string, instead of letting `-1` rank as safest. Unrecognized risk values are now rejected by the strict compilation gate (defense-in-depth).
**Status:** fixed: requires human verification (defense-in-depth logic — confirm no legitimate risk values were excluded from `RISK_ORDER`).

---

_Fixed: 2026-08-08T20:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_