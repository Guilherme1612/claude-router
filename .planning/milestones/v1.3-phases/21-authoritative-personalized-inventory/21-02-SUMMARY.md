---
phase: 21-authoritative-personalized-inventory
plan: 02
subsystem: registry
tags: [inventory, adapters, portability, filesystem-safety, fingerprint]

requires:
  - phase: 21-authoritative-personalized-inventory
    provides: framework-neutral normalized inventory schema and synthetic profiles
provides:
  - Exhaustive Claude and Codex known-family, compound-member, instruction, and opaque discovery
  - Canonical symlink containment and cycle-safe traversal
  - Portable per-logical-root completeness evidence
affects: [21-03, 21-04, watcher, authoritative-reconciliation]

tech-stack:
  added: []
  patterns:
    - Runtime layouts own native classification while registry core remains ecosystem-neutral
    - Opaque fallback is bounded to explicit capability roots and always inert
    - Root health is additive portable evidence over the existing fingerprint contract

key-files:
  created:
    - tests/router.inventory-portability.test.mjs
  modified:
    - tests/router.adapters.test.mjs
    - src/adapters/claude.mjs
    - src/adapters/codex.mjs
    - src/registry/fingerprint.mjs

key-decisions:
  - "Restrict opaque fallback to explicit capabilities directories so arbitrary files remain excluded."
  - "Represent plugin metadata as an inert container and link discovered members through portable container provenance."
  - "Expose canonical root identity as the logical root label, never an absolute filesystem path."

patterns-established:
  - "Adapter authority boundary: semantic type, lifecycle role, dispatchability, and invocation availability come from adapter layout allowlists."
  - "Completeness evidence: diagnostic codes deterministically decide complete versus incomplete without changing legacy fingerprint hashes."

requirements-completed: [DISC-01, DISC-07, DISC-08]
status: complete

coverage:
  - id: D1
    description: Claude and Codex installations expose known families, compounds, instructions, and opaque future types.
    requirement: DISC-01
    verification:
      - kind: integration
        ref: tests/router.inventory-portability.test.mjs#adapters enumerate known families compounds and opaque future types exactly once
        status: pass
    human_judgment: false
  - id: D2
    description: Unknown adapter-defined types remain visible and non-dispatchable.
    requirement: DISC-07
    verification:
      - kind: integration
        ref: tests/router.inventory-portability.test.mjs#capability-authored authority fields remain inert
        status: pass
    human_judgment: false
  - id: D3
    description: Canonical traversal and root completeness prevent filesystem escapes and absolute-path disclosure.
    requirement: DISC-08
    verification:
      - kind: integration
        ref: tests/router.adapters.test.mjs#fingerprint roots expose stable completeness without absolute paths
        status: pass
      - kind: integration
        ref: tests/router.registry-diff.test.mjs#fingerprint scanner rejects root escapes and reports access denial
        status: pass
    human_judgment: false

metrics:
  duration: 7 min
  completed: 2026-07-26
---

# Phase 21 Plan 02: Portable Adapter Discovery Summary

**Claude and Codex adapters now enumerate personalized known and future capability types through a shared inert normalization boundary, with cycle-safe canonical traversal and portable per-root completeness evidence.**

## Performance

- **Duration:** 7 min
- **Completed:** 2026-07-26
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a cross-user portability oracle covering four different installation profiles, differing runtime mixtures, compound members, and opaque future types.
- Expanded both runtime layouts to discover instruction files, plugin containers and members, MCP-related records, and explicitly bounded opaque capabilities.
- Prevented capability-authored content from granting semantic type, dispatchability, lifecycle, scope, permission, or invocation authority to opaque records.
- Added canonical symlink revalidation, cycle detection, root-replacement evidence, and deterministic complete/incomplete status without exposing absolute paths or changing existing top-level fingerprint hashes.

## Task Commits

1. **Task 1: Specify the cross-user discovery and filesystem-safety matrix** — `0ab1b21`
2. **Task 2: Implement exhaustive adapter observations and root completeness** — `da98f84`

## Files Created/Modified

- `tests/router.inventory-portability.test.mjs` — Four-profile portability, compound, unknown-type, and authored-authority oracle.
- `tests/router.adapters.test.mjs` — Updated native family expectation and portable completeness contract.
- `src/adapters/claude.mjs` — Shared safe traversal, normalized authority allowlists, compounds, instructions, and opaque fallback.
- `src/adapters/codex.mjs` — Thin Codex-native layout configuration for the shared adapter.
- `src/registry/fingerprint.mjs` — Cycle-safe canonical traversal and additive logical-root completeness evidence.

## Decisions Made

- Opaque discovery only applies under adapter-owned `capabilities/` roots; arbitrary files, dependency caches, fixtures, and VCS metadata remain excluded.
- Plugin manifests are inert containers, while plugin members retain their own normalized record and portable member provenance.
- Existing fingerprint fields and their canonical hash remain unchanged; completeness is additive consumer evidence.

## Verification

- `node --test tests/router.adapters.test.mjs tests/router.inventory-portability.test.mjs tests/router.registry-diff.test.mjs` — PASS (21/21)
- `node --test tests/router.registry-schema.test.mjs tests/router.registry-diff.test.mjs` — PASS (26/26)
- `git diff --check` — PASS

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. The modified filesystem surface was explicitly covered by the plan threat model.

## Self-Check: PASSED

- All five owned implementation/test paths exist.
- Task commits `0ab1b21` and `da98f84` exist.
- All task acceptance criteria and plan-level verification commands pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Authoritative watcher reconciliation can consume per-root completeness and preserve the last complete baseline when any logical root becomes incomplete.

---
*Phase: 21-authoritative-personalized-inventory*
*Completed: 2026-07-26*
