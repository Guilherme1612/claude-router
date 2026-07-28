---
phase: 21-authoritative-personalized-inventory
plan: 01
subsystem: registry
tags: [inventory, schema, canonicalization, provenance, tdd]

requires:
  - phase: 11-canonical-registry-and-runtime-adapters
    provides: canonical registry schema, runtime adapters, and stable identity
provides:
  - Framework-neutral normalized inventory records with safe dispatch invariants
  - Deterministic isolated synthetic inventory profiles and mutation vocabulary
  - Canonical semantic bytes that exclude volatile inspection metadata
affects: [21-02, 21-03, 21-04, 21-05, contract-inference, capability-mapping]

tech-stack:
  added: []
  patterns:
    - Additive compatibility normalization at the canonical schema boundary
    - Explicit unavailable invocation for inert and unknown artifacts
    - Schema-owned set sorting with operational metadata exclusion

key-files:
  created:
    - tests/helpers/inventory-fixture.mjs
  modified:
    - tests/router.registry-schema.test.mjs
    - src/registry/schema.mjs

key-decisions:
  - "Preserve legacy v1 adapter records by deterministically deriving new normalized fields when absent."
  - "Treat explicit unknown, configuration, instruction, and container semantics as non-dispatchable regardless of authored content."
  - "Keep volatile scan and generation metadata outside canonical semantic capability bytes."

patterns-established:
  - "Authority invariant: dispatchable requires enabled state, available invocation, and available declared dependencies."
  - "Portable evidence: native types and adapter evidence remain namespaced while Router semantic types stay bounded."

requirements-completed: [DISC-02]
status: complete

metrics:
  duration: 8 min
  completed: 2026-07-26
---

# Phase 21 Plan 01: Authoritative Inventory Schema Summary

**Framework-neutral inventory records now preserve native evidence, scope, lifecycle, dependency, and compound provenance while preventing inert or unknown artifacts from gaining invocation authority.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-07-26
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added four deterministic, ambient-root-free synthetic profiles covering Claude-heavy, Codex-heavy, mixed/custom, and unknown-future installations.
- Extended the canonical schema with namespaced native types, bounded semantic types, lifecycle roles, enabled state, explicit invocation availability, adapter/parser evidence, diagnostics, and compound member provenance.
- Enforced fail-closed dispatch rules for disabled records, unavailable dependencies, unavailable invocation, configuration, instructions, containers, and unknown types.
- Preserved existing v1 adapter records through deterministic compatibility normalization.
- Excluded operational timestamps, triggers, scan IDs, event order, and generation IDs from canonical semantic bytes.

## Task Commits

1. **Task 1: Establish synthetic inventory profiles and normalized-record RED contracts** — `77584d9`
2. **Task 2: Implement the framework-neutral inventory schema** — `02b60f3`

## Files Created/Modified

- `tests/helpers/inventory-fixture.mjs` — Synthetic profile builders, mutation playback vocabulary, and semantic-byte assertion helper.
- `tests/router.registry-schema.test.mjs` — Contracts for normalized records, inert authority, scope separation, compounds, disabled state, and stable bytes.
- `src/registry/schema.mjs` — Additive compatibility normalization, validation invariants, and canonical operational-field exclusion.

## Decisions Made

- Existing adapter output remains valid without ecosystem-name branches in registry consumers; the schema derives compatibility fields from the v1 record itself.
- Explicit adapter-defined unknown types retain their namespaced evidence but remain opaque and non-dispatchable.
- Authored prose is retained as inert data and cannot influence validated dispatch fields.

## Verification

- `node --test tests/router.registry-schema.test.mjs tests/router.registry-build.test.mjs` — PASS (24/24)
- `node --test tests/router.adapters.test.mjs` — PASS (8/8)
- Task 1 TAP-aware RED harness — PASS (all initial failures carried `[phase21-red:schema]`)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- Created fixture helper exists.
- Schema and contract test modifications exist.
- Task commits `77584d9` and `02b60f3` exist.
- All focused and regression verification commands pass.
