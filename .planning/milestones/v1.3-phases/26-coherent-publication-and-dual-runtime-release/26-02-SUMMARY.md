---
phase: 26-coherent-publication-and-dual-runtime-release
plan: 02
subsystem: release
tags: [immutable-tuple, bounded-io, prompt-routing, sha256]
requires:
  - phase: 26-01
    provides: Phase 26 tuple and hot-path RED gates
provides:
  - Complete content-addressed v1.3 decision tuple
  - Bounded read-only prompt projection with known-good fallback
affects: [26-03, 26-04, release-lifecycle, prompt-routing]
tech-stack:
  added: []
  patterns: [content-addressed tuple members, pointer-last publication, bounded prompt projection]
key-files:
  created: []
  modified:
    - src/registry/build.mjs
    - src/prompt/publish-index.mjs
    - src/prompt/compile-index.mjs
    - src/context/prompt-route.mjs
    - tests/router.phase26-hot-path.test.mjs
key-decisions:
  - "Keep the established schema-2 active pointer and add a bounded prompt-projection hash additively."
  - "Retain pre-v1.3 capsule and startup-pointer behavior only as a compatibility path; v1.3 tuple routing is read-only."
patterns-established:
  - "Every authoritative tuple member is canonicalized, bounded, hash-listed, and included in the tuple identity."
  - "Prompt routing reads active pointer plus one hash-bound projection instead of parsing the full manifest."
requirements-completed: [REL-01, REL-02, REL-03]
coverage:
  - id: D1
    description: Complete immutable tuple publication and validation
    requirement: REL-02
    verification:
      - kind: integration
        ref: tests/router.phase26-tuple.test.mjs
        status: pass
    human_judgment: false
  - id: D2
    description: One content identity covers every decision sibling
    requirement: REL-03
    verification:
      - kind: integration
        ref: tests/router.lifecycle-recovery.test.mjs
        status: pass
    human_judgment: false
  - id: D3
    description: v1.3 prompt routing consumes a bounded read-only tuple projection
    requirement: REL-01
    verification:
      - kind: integration
        ref: tests/router.phase26-hot-path.test.mjs
        status: pass
      - kind: e2e
        ref: tests/router.context-prompt-integration.test.mjs
        status: pass
    human_judgment: false
duration: 20min
completed: 2026-07-28
status: complete
---

# Phase 26 Plan 02: Complete Tuple and Bounded Prompt Projection Summary

**All v1.3 decision artifacts now publish under one content identity while the real prompt path consumes one hash-bound, read-only projection.**

## Performance

- **Duration:** 20 min
- **Completed:** 2026-07-28
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Published registry, contracts, relationships, intent policy, workflows, health policy, suggestion reference, and existing routing siblings atomically.
- Added exact membership, schema, size, symlink, hash, compatibility, and tuple-identity validation.
- Removed v1.3 prompt-time capsule mutation and standalone suggestion reads while preserving legacy installation compatibility.

## Task Commits

1. **Task 1: Publish and validate every tuple sibling** - `ef9b835`
2. **Task 2: Reduce real prompt route to bounded tuple projection** - `ce2a86d`
3. **Adjacent compatibility correction** - `e5fc65a`

## Files Created/Modified

- `src/registry/build.mjs` - Emits canonical background decision projections.
- `src/prompt/publish-index.mjs` - Writes complete immutable tuples and prompt projections pointer-last.
- `src/prompt/compile-index.mjs` - Validates complete tuples and loads bounded prompt projections.
- `src/context/prompt-route.mjs` - Uses the tuple projection read-only for v1.3 routing.
- `tests/router.phase26-hot-path.test.mjs` - Proves no v1.3 capsule mutation and tuple-bound advice.

## Decisions Made

- The existing schema-2 pointer remains compatible; the prompt projection hash is additive.
- Full verification cross-checks both the new exact member map and legacy named manifest hashes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Compatibility] Preserved schema-2 pointer consumers**
- **Found during:** Adjacent publication regression gate
- **Issue:** A schema bump broke the established pointer contract unnecessarily.
- **Fix:** Kept schema 2 and detected the v1.3 projection through its hash field.
- **Files modified:** `src/prompt/publish-index.mjs`, `src/prompt/compile-index.mjs`
- **Verification:** Publication and lifecycle recovery suites pass.
- **Committed in:** `e5fc65a`

**2. [Rule 1 - Integrity] Cross-checked legacy manifest hash fields**
- **Found during:** Lifecycle corruption recovery gate
- **Issue:** A tampered legacy named hash could disagree with the exact member map.
- **Fix:** Required both representations to agree before exposing dispatch.
- **Files modified:** `src/prompt/compile-index.mjs`
- **Verification:** Hash-corruption recovery test passes.
- **Committed in:** `e5fc65a`

**Total deviations:** 2 auto-fixed bugs. No scope expansion.

## Known Stubs

- `src/prompt/publish-index.mjs` retains the pre-existing `TODO(v2)` for deriving actual workflow lifecycle state; it is outside this plan and does not block v1.3 tuple integrity.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: local-file-integrity | `src/prompt/compile-index.mjs` | New tuple siblings cross the local-file trust boundary through bounded no-follow reads and SHA-256 checks. |

## Issues Encountered

- Existing schema-2 and recovery contracts required additive evolution rather than a pointer schema bump.

## User Setup Required

None.

## Next Phase Readiness

- Complete tuple publication and bounded projection are ready for invalidation and lifecycle wiring in subsequent Phase 26 plans.
- Focused and adjacent gates pass with no remaining Plan 26-02 blocker.

## Self-Check: PASSED

- All modified source and test files exist.
- Commits `ef9b835`, `ce2a86d`, and `e5fc65a` exist.

---
*Phase: 26-coherent-publication-and-dual-runtime-release*
*Completed: 2026-07-28*
