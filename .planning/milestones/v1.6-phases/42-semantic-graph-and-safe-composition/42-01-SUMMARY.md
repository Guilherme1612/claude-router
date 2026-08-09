---
phase: 42-semantic-graph-and-safe-composition
plan: 01
requirements-completed: [SEM-01, SEM-03]
subsystem: registry-semantic-compilation
tags: [semantic-resolution, compilation-gate, build-time, contract-matching]
requires: [41-01, 41-03]
provides: [resolveSemanticOutcome, compileRelationshipGraph, COMPILATION_REASONS, SEMANTIC_POLICY_VERSION]
affects: [src/registry/build.mjs, src/lifecycle/router-lifecycle.mjs]
tech-stack:
  added: []
  patterns: [pure-function-diagnostics, conditional-spread-registry, deterministic-sort]
key-files:
  created:
    - src/registry/semantic.mjs
    - tests/router.semantic-resolution.test.mjs
    - tests/router.semantic-compilation.test.mjs
  modified:
    - src/registry/relationships.mjs
    - src/registry/build.mjs
    - src/lifecycle/router-lifecycle.mjs
    - tests/router.relationships.test.mjs
decisions:
  - "resolveSemanticOutcome filters by disposition === dispatch-candidate and runs evaluateEligibility on every match (Pitfall 2 backstop — contract compatibility is necessary but not sufficient)"
  - "compileRelationshipGraph is non-throwing pure function returning diagnostics with reason codes (matches deriveRelationships convention)"
  - "Compilation diagnostics sorted via stableStringify for deterministic output regardless of record insertion order (fixes REG-03 byte-identical regression)"
  - "Variant and conflict edges both exempt ambiguous-tie detection (conflict edge establishes known differentiation)"
  - "semantic.mjs deployed to both ownedRoot and codexOwnedRoot via moduleNames flatMap (HOST-03 parity)"
metrics:
  duration: 15min
  tasks: 2
  commits: 4
actuals:
  tokens: 7785
  tasks: 2
  commits: 4
status: complete
---

# Phase 42 Plan 01: Semantic Outcome Resolver + Strict Compilation Gate Summary

SEM-01 semantic outcome resolver + SEM-03 strict compilation gate — resolve compatible capabilities by contract fields without a named-framework declaration, and reject unsafe graph conditions before activation.

## What Was Built

### SEM-01: resolveSemanticOutcome (src/registry/semantic.mjs)

Pure-function library that resolves a compatible installed capability by contract fields (inputs/outputs/dependencies/action) without requiring a workflow_id declaration. Filters to `disposition === 'dispatch-candidate'`, matches by `outputs` superset of `outcome.requires`, runs `evaluateEligibility` on every match (Pitfall 2 backstop), and surfaces ambiguous ties when two candidates have identical contract fit scores.

Returns `{ schema_version, policy_version, status, match?, candidates?, reason_codes }` where status is `resolved` | `unresolved` | `ambiguous`.

### SEM-03: compileRelationshipGraph (src/registry/relationships.mjs)

Build-time compilation gate that runs inside `assembleRegistry` after `deriveRelationships` and before `evaluateEligibility`. Validates the derived graph and emits diagnostics with reason codes for all 7 failure conditions:

1. `compilation_native_collision` — same native_type, different stableCapabilityId, no variant edge
2. `compilation_ambiguous_tie` — identical outputs/inputs, both dispatch-candidate, no variant/conflict edge
3. `compilation_incompatible_output` — composition edge where source.outputs and target.inputs have empty intersection
4. `compilation_unsafe_composition` — composition edge where target risk exceeds source risk, or target permissions not subset of source
5. `compilation_stale_target` — edge with freshness 'stale'
6. `compilation_missing_dependency` — prerequisite edge target not in records
7. `compilation_unresolvable_contract` — dispatch-candidate with unknown DISPATCH_FIELDS field, or composition edge with unknown-state I/O contract fields

Non-throwing pure function returning `{ schema_version, policy_version, diagnostics, compiled, reason_codes }`. Diagnostics sorted via `stableStringify` for deterministic output.

### build.mjs wiring

`compileRelationshipGraph` inserted between `deriveRelationships` and `evaluateEligibility` in `assembleRegistry`. Conditional spread `...(compilation.diagnostics.length ? { compilation } : {})` in registry return — matches existing conditional-spread convention.

### Deploy list

`registry/semantic.mjs` added to `router-lifecycle.mjs` moduleNames array with Phase 42 comment. Deploys to both `ownedRoot` and `codexOwnedRoot` via the `moduleValues` flatMap (HOST-03 parity).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed non-deterministic diagnostic ordering breaking REG-03 byte-identical test**
- **Found during:** Task 2 full-suite verification
- **Issue:** `compileRelationshipGraph` emitted diagnostics in Map insertion order, which varies between full and incremental registry builds (different observation ordering). This broke the REG-03 test that asserts `stableStringify(incremental) === stableStringify(full)`.
- **Fix:** Sort diagnostics array via `stableStringify` before returning (matching `deriveRelationships` pattern that sorts its outputs).
- **Files modified:** src/registry/relationships.mjs
- **Commit:** 93838d3

## Test Coverage

- **tests/router.semantic-resolution.test.mjs** (4 tests): contract-match resolution, recommendation-only filter, eligibility filter (Pitfall 2 backstop), ambiguous tie surfacing
- **tests/router.semantic-compilation.test.mjs** (10 tests): native collision, variant edge exemption, clean graph, non-throwing, incompatible output, unresolvable contract, ambiguous tie, unsafe composition, stale target, missing dependency
- **tests/router.relationships.test.mjs** (1 integration test): compileRelationshipGraph via deriveRelationships output

## Hot-Path Isolation

`grep -c "resolveSemanticOutcome\|compileRelationshipGraph" src/router.mjs` returns 0. Both functions run at build time inside `assembleRegistry` and are never imported or called by `router.mjs` or any hot-path file.

## TDD Gate Compliance

- RED: `test(42-01):` commit exists (20781ae) — failing tests for SEM-01 and SEM-03
- GREEN: `feat(42-01):` commit exists after (0c1d551) — implementation passing all tests
- Task 2 RED: `test(42-01):` commit exists (d0a4a30) — failing tests for ambiguous ties and unsafe compositions
- Task 2 GREEN: `feat(42-01):` commit exists after (93838d3) — implementation passing all tests

## Self-Check: PASSED

- All 3 created files exist on disk
- All 4 commits exist in git log (20781ae, 0c1d551, d0a4a30, 93838d3)
- `registry/semantic.mjs` appears exactly 1 time in `src/lifecycle/router-lifecycle.mjs`
- `[42:compilation]` appears exactly 1 time in `tests/router.relationships.test.mjs`
- Hot-path isolation verified: 0 references to `resolveSemanticOutcome` or `compileRelationshipGraph` in `src/runtime/router.mjs`
