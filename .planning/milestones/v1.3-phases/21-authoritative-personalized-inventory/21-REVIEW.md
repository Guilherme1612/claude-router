---
phase: 21-authoritative-personalized-inventory
reviewed: 2026-07-26T18:09:07Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - tests/router.registry-schema.test.mjs
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-07-26T18:09:07Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Commit `8221087` changes only the intended schema regression test, and the owned
test file passes all 17 tests. The new full fallback-ID literals and exact-source
fingerprint assertions agree with the production implementation. However, two
tests can remain green while parts of the stated D-09/D-15 contracts regress.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Combined mutations do not independently prove both ordered fields affect canonical bytes

**Classification:** WARNING
**File:** `tests/router.registry-schema.test.mjs:150-161`
**Issue:** The test changes both `precedence` order and `invocation.args` order
between `a` and `b`, then makes one non-equality assertion. It therefore still
passes if canonicalization accidentally ignores either field, as long as the
other remains significant. This is weaker than the Plan 06 contract that
reordering invocation arguments or precedence must each change canonical bytes.
**Fix:** Create separate `invocationReordered` and `precedenceReordered` records
and assert that each canonical serialization differs from `a`. Keep the
fingerprint equality checks for both records.

### WR-02: Four-scope test checks serialized records instead of stable identities

**Classification:** WARNING
**File:** `tests/router.registry-schema.test.mjs:214-223`
**Issue:** D-15 requires global, user, project, and worktree records to remain
separate identities, but this test only proves their canonical record bytes
differ. It would stay green if `stableCapabilityId()` collapsed the user scope
onto global while scope remained present in canonical serialization. The older
identity test at lines 98-104 does call `stableCapabilityId()`, but omits the
user scope, leaving that D-15 branch unprotected.
**Fix:** Assert
`new Set(records.map(stableCapabilityId)).size === 4` and, preferably, assert
the exact portable ID for each scope.

---

_Reviewed: 2026-07-26T18:09:07Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
