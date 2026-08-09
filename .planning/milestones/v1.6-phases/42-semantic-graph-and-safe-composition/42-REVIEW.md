---
phase: 42-semantic-graph-and-safe-composition
reviewed: 2026-08-08T20:31:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/registry/semantic.mjs
  - src/registry/relationships.mjs
  - src/registry/build.mjs
  - src/registry/substitute.mjs
  - src/cli/router-control.mjs
  - src/lifecycle/router-lifecycle.mjs
  - tests/router.semantic-resolution.test.mjs
  - tests/router.semantic-compilation.test.mjs
  - tests/router.relationships.test.mjs
  - tests/router.semantic-substitution.test.mjs
  - tests/router.semantic-inspection.test.mjs
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: issues_found
---

# Phase 42: Code Review Report (Iteration 2)

**Reviewed:** 2026-08-08T20:31:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Iteration 2 re-review after the iteration-1 fix loop. All four findings from
iteration 1 (CR-01, WR-01, WR-02, WR-03) are verified correct and complete.
All 69 Phase 42 tests pass. No new bugs or regressions were introduced by the
fixes. The remaining findings are all Info-level quality observations carried
forward from iteration 1 (IN-01, IN-02, IN-03) plus one new observation about
the WR-03 fix's defense-in-depth edge.

### Fix verification

- **CR-01 (REVERSIBILITY_ORDER):** Fixed. `substitute.mjs:36` now defines
  `['reversible', 'unknown', 'irreversible']`. Verified all 9 combinations of
  {reversible, unknown, irreversible} x {original, substitute}: the
  `subLevel > origLevel` check correctly flags any substitute that is less safe
  than the original. The regression test at
  `tests/router.semantic-substitution.test.mjs:182-198` confirms
  `orig='reversible', sub='unknown'` → `blocked`. The old ordering (which
  treated `unknown` as safest, index 0) would have passed this case — the fix
  closes the authority-bound bypass.

- **WR-01 (deterministic stable_id sort):** Fixed. `semantic.mjs:122` adds
  `candidates.sort((a, b) => a.stable_id.localeCompare(b.stable_id))` before
  selecting `candidates[0]`. The sort runs AFTER the ambiguous-tie detection
  (lines 99-118), so tie detection is unaffected. The `candidates[0]`
  selection is now byte-identical regardless of input record ordering,
  consistent with `compileRelationshipGraph` / `deriveRelationships`.

- **WR-02 (SUBSTITUTION_REASONS exhaustive):** Fixed. `substitute.mjs:18-33`
  now lists all 14 codes. Cross-checked every code emitted by
  `computeBoundsViolations` (5 `_unknown` codes via the
  `AUTHORITY_CRITICAL_FIELDS` loop, 5 `_expanded`/`_escalation`/`_changed`
  codes, 1 `_scope_expansion`) plus the 3 status codes
  (`no_compatible_substitute`, `ambiguous_substitute`, `substitution_within_bounds`).
  All are present. The exported contract now matches the implementation.

- **WR-03 (unrecognized risk enum as unsafe):** Fixed.
  `relationships.mjs:324-328` defines a `riskLevel` closure that returns
  `RISK_ORDER.length - 1` (index 5 = `unacceptable`) for `indexOf === -1`.
  A target with a garbage risk value is now treated as highest-risk and
  flags `compilation_unsafe_composition`. The fix is correct for the
  target-garbage case. See IN-04 for the residual source-garbage asymmetry
  (unreachable through normal operations).

### Test verification

All 69 tests across the 5 Phase 42 test files pass (0 fail, 0 skip):
`router.semantic-resolution` (4), `router.semantic-compilation` (10),
`router.relationships` (8), `router.semantic-substitution` (14),
`router.semantic-inspection` (8), plus 25 prior tests in the relationships
suite. No regressions.

## Critical Issues

_None. All critical findings from iteration 1 have been resolved._

## Warnings

_None. All warning findings from iteration 1 have been resolved._

## Info

### IN-01: scope bound check in substitute.mjs compares record-level scope instead of contract field scope

**File:** `src/registry/substitute.mjs:59`
**Issue:** `computeBoundsViolations` checks
`stableStringify(substitute?.scope) !== stableStringify(original?.scope)` —
the record-level `scope` field. Every other authority-critical field
(permissions, risk, reversibility, invocation_kind, side_effects) is read
from `record.contract.fields[name].value` via `fieldValue()`. The comment
says this "copies eligibility.mjs:215-217", but eligibility.mjs compares the
contract field scope value against `record.scope` (a self-consistency check),
not one record's scope against another's. Using record-level scope is
arguably correct for the substitution bound (and safe because eligibility
runs first and verifies contract-field scope matches record scope), but it is
inconsistent with the contract-field-level pattern used for the other bounds.
**Fix:** For consistency, compare contract field scope values via
`fieldValue(substitute, 'scope')` / `fieldValue(original, 'scope')`, or
document why record-level scope is the intentional bound.

### IN-02: resolveSubstitution traverses substitute/fallback edges bidirectionally

**File:** `src/registry/substitute.mjs:164-176`
**Issue:** The edge traversal treats substitute/fallback edges as
bidirectional: if `edge.source_id === subjectId`, the candidate is
`target_id`; if `edge.target_id === subjectId`, the candidate is `source_id`.
For a directed `substitute` edge `A → B` (meaning "B is the substitute for
A"), when the failed record is B, this would select A as B's substitute — the
reverse of the declared direction. This may be intentional for `fallback`
edges (often symmetric), but for `substitute` edges it could allow
substitution against the declared direction.
**Fix:** If directionality matters for `substitute` edges, only follow
`source_id === subjectId → target_id` for `substitute` type, and keep
bidirectional traversal for `fallback`. If bidirectional is intentional for
both, document it.

### IN-03: resolveSubstitution passes raw records array to evaluateEligibility instead of deduplicated recordsById values

**File:** `src/registry/substitute.mjs:190`
**Issue:** `evaluateEligibility({ record: candidateRecord, records, ... })`
passes the raw `records` input array. `semantic.mjs:72` and `build.mjs:355`
pass `[...recordsById.values()]` (deduplicated by stable id).
`evaluateEligibility` rebuilds its own recordsById internally so the result is
the same, but the inconsistency means duplicate records in the input array
are processed multiple times inside evaluateEligibility's recordsById
construction for the substitution path only.
**Fix:** Pass `[...recordsById.values()]` for consistency:
`records: [...recordsById.values()]`.

### IN-04: WR-03 fix has source-garbage asymmetry — unreachable through normal operations but worth documenting

**File:** `src/registry/relationships.mjs:324-328`
**Issue:** The `riskLevel` closure treats an unrecognized enum value as
`RISK_ORDER.length - 1` (index 5 = `unacceptable`, highest risk). This
correctly flags a **target** with a garbage risk value as unsafe
(`targetRiskLevel(5) > sourceRiskLevel(any valid)` → violation). However, a
**source** with a garbage risk value is also treated as 5 (unacceptable),
which means `targetRiskLevel(any valid ≤ 5) > sourceRiskLevel(5)` is always
false → no violation flagged. The asymmetry: garbage target fails the risk
gate, garbage source passes it. This is unreachable through normal operations
because `validateCapabilityContract` (contract.mjs:485) throws a TypeError for
`state='known'` with an invalid enum value, so `buildCapabilityContract` +
`validateCapabilityContract` can never produce a record in this state. The
only reachable path is direct tampering (as the test at
`tests/router.semantic-compilation.test.mjs:138-149` does). For the
defense-in-depth purpose, the fix is adequate — the worst case is a false
negative on an already-unreachable path, and the `compilation_unresolvable_contract`
gate catches unknown-state fields independently.
**Fix:** No action required. If full symmetry is desired, treat unrecognized
source risk as `-Infinity` (so any target exceeds it) rather than
`RISK_ORDER.length - 1`, but this is over-engineering for an unreachable path.

---

_Reviewed: 2026-08-08T20:31:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Iteration: 2 (post-fix re-review)_