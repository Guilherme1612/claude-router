---
phase: 11-canonical-registry-and-runtime-adapters
plan: "01"
subsystem: registry
tags: [node, esm, canonicalization, sha256, tdd]
requires: []
provides:
  - Runtime-neutral capability schema validation
  - Evidence-gated stable capability identities
  - Deterministic portable serialization and content fingerprints
affects: [phase-11-runtime-adapters, registry-build]
tech-stack:
  added: []
  patterns: [standard-library-only ESM, stable recursive serialization, evidence-first identity]
key-files:
  created: [src/registry/schema.mjs, src/registry/identity.mjs, tests/router.registry-schema.test.mjs]
  modified: []
key-decisions:
  - "Only explicit canonical identity or authoritative shared-origin evidence can merge runtime variants."
  - "Set-like schema collections are sorted while invocation and precedence arrays retain semantic order."
patterns-established:
  - "Portable provenance uses logical roots and normalized relative paths only."
  - "Project and worktree identity suffixes include repository and worktree evidence."
requirements-completed: [REG-01]
coverage:
  - id: D1
    description: "Canonical Claude and Codex capability records validate under one deterministic schema."
    requirement: REG-01
    verification:
      - kind: unit
        ref: "tests/router.registry-schema.test.mjs#validates required canonical fields and stable enum errors"
        status: pass
    human_judgment: false
  - id: D2
    description: "Stable identity is evidence-gated and remains isolated across global, project, and worktree scopes."
    requirement: REG-01
    verification:
      - kind: unit
        ref: "tests/router.registry-schema.test.mjs#identity tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "Canonical bytes and SHA-256 fingerprints are deterministic without leaking absolute paths."
    requirement: REG-01
    verification:
      - kind: unit
        ref: "tests/router.registry-schema.test.mjs#stable serialization tests"
        status: pass
    human_judgment: false
duration: 2min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 01: Canonical Schema and Identity Summary

**A zero-dependency canonical capability contract with evidence-gated identities, portable stable bytes, and SHA-256 fingerprints**

## Performance

- **Duration:** 2 min
- **Started:** 2026-07-14T19:30:31Z
- **Completed:** 2026-07-14T19:32:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Defined strict runtime-neutral records covering invocation, provenance, dependencies, conflicts, dispatchability, and scope.
- Prevented name/content similarity from merging capabilities while preserving explicit cross-runtime identities across rename and move events.
- Produced byte-stable canonical serialization that sorts schema-owned sets but preserves semantic sequence order.

## Task Commits

1. **Task 1: Specify canonical schema and stable identity behavior** - `29063c9` (test)
2. **Task 2: Implement canonical schema, stable bytes, and evidence-gated identity** - `0ef6c3f` (feat)

## Files Created/Modified

- `tests/router.registry-schema.test.mjs` - REG-01 contract and threat-mitigation coverage.
- `src/registry/schema.mjs` - Validation, canonicalization, and stable serialization.
- `src/registry/identity.mjs` - Stable identity and SHA-256 content fingerprints.

## Decisions Made

- Global identities retain readable `runtime:type:native-identity` form; project/worktree identities append encoded repository and worktree evidence.
- Unsupported, cyclic, non-plain, and non-portable values fail with deterministic messages.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## TDD Gate Compliance

- RED: `29063c9`
- GREEN: `0ef6c3f`
- Full suite: 400 tests passed.

## User Setup Required

None - no external services or packages were added.

## Next Phase Readiness

The Claude and Codex adapters can now normalize native observations against the canonical schema and derive deterministic identities and fingerprints.

---
*Phase: 11-canonical-registry-and-runtime-adapters*
*Completed: 2026-07-14*
