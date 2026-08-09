---
phase: 42-semantic-graph-and-safe-composition
plan: 02
requirements-completed: [SEM-02, SEM-04]
subsystem: registry-semantic-substitution-inspection
tags: [semantic-substitution, contract-compatible-fallback, bounds-enforcement, semantic-inspection, cli-projection]
requires: [42-01, 41-01, 41-03]
provides: [resolveSubstitution, SUBSTITUTION_REASONS, semanticProjection, contract-semantic-command]
affects: [src/cli/router-control.mjs, src/lifecycle/router-lifecycle.mjs]
tech-stack:
  added: []
  patterns: [pure-function-diagnostics, bounds-violation-checking, safe-token-projection, bounded-result-pagination]
key-files:
  created:
    - src/registry/substitute.mjs
    - tests/router.semantic-substitution.test.mjs
    - tests/router.semantic-inspection.test.mjs
  modified:
    - src/cli/router-control.mjs
    - src/lifecycle/router-lifecycle.mjs
decisions:
  - "computeBoundsViolations checks every AUTHORITY_CRITICAL_FIELDS entry: permissions subset, risk <= original (RISK_ORDER), scope identical (stableStringify), reversibility at least as safe (REVERSIBILITY_ORDER), invocation_kind equal, side_effects subset (T-42-07 mitigation)"
  - "Unknown-state fields are conservative violations — cannot verify bounds with unknown fields (security-critical, permission laundering prohibition)"
  - "resolveSubstitution is non-throwing for invalid/missing failedRecord (returns blocked); TypeError only for structural shape violations (relationships not an object)"
  - "semanticProjection uses raw stable_id for edge matching (edge endpoints are stableCapabilityId values); safeIdentifier applied via relationshipItemProjection for display"
  - "RECEIPT_STATES is NOT extended with 'substituted' — Phase 44 RCPT-02 owns that state (T-42-10 scope boundary)"
  - "registry/substitute.mjs deployed to both ownedRoot and codexOwnedRoot via moduleNames flatMap (HOST-03 parity)"
metrics:
  duration: 8min
  tasks: 2
  commits: 4
actuals:
  tokens: 7901
  tasks: 2
  commits: 4
status: complete
---

# Phase 42 Plan 02: Contract-Compatible Substitution + Semantic Inspection Summary

SEM-04 contract-compatible substitution resolver + SEM-02 semantic inspection projection — the dispatch-time substitution path that finds a contract-compatible fallback within unchanged authority bounds, and the CLI inspection surface that shows why a capability fits.

## What Was Built

### SEM-04: resolveSubstitution (src/registry/substitute.mjs)

Pure-function library that resolves a contract-compatible substitute for a failed selected capability. Traverses substitute/fallback edges from the relationship graph, validates each candidate via `evaluateEligibility`, and enforces `computeBoundsViolations` against every `AUTHORITY_CRITICAL_FIELDS` entry:

- **permissions**: substitute must be a subset of original (permission laundering prohibition)
- **risk**: substitute risk must be <= original risk (RISK_ORDER: unknown < low < medium < high < critical < unacceptable)
- **reversibility**: substitute must be at least as safe (REVERSIBILITY_ORDER: reversible is safest)
- **invocation_kind**: substitute must equal original
- **side_effects**: substitute must not contain tokens original doesn't have
- **scope**: must be identical (stableStringify equality)

Unknown-state fields are conservative violations — bounds cannot be verified with unknown fields.

Returns `{ schema_version, policy_version, status, original_route?, substitute_route?, bounds_unchanged?, candidates?, reason_code?, reason_codes }` where status is `substituted` | `blocked` | `ambiguous`. Both `original_route` and `substitute_route` are retained for attribution (T-42-08). Non-throwing for invalid/missing failedRecord; TypeError only for structural shape violations.

Exports frozen `SUBSTITUTION_REASONS` array with 7 reason codes.

### SEM-02: semanticProjection (src/cli/router-control.mjs)

Unified "why this fits" inspection projection that combines:
- **requires**: contract fields `inputs` and `dependencies` via `fieldProjection`, tagged `kind: 'requires'`
- **produces**: contract field `outputs` via `fieldProjection`, tagged `kind: 'produces'`
- **relationship**: edges where `source_id` or `target_id` matches the record, via `relationshipItemProjection`, tagged `kind: 'relationship'`
- **lifecycle**: `{ enabled, lifecycle, eligible, eligibility_gates }` with sanitized gate names/states

All surfaced strings pass through `safeToken`/`safeIdentifier` — no raw record text echoed (T-42-09). Edge filtering uses raw `stable_id` for matching (edge endpoints are `stableCapabilityId` values); `safeIdentifier` applied via `relationshipItemProjection` for display.

Returns `{ total, returned, truncated, limit, offset, next_offset, semantic, lifecycle }` with `boundedResult` pagination.

### CLI: contract semantic command (src/cli/router-control.mjs)

New `semanticView` branch in `contractCommand` dispatching to `semanticProjection` when `positional[1] === 'semantic'` with `--id` (required), `--limit`, `--offset` options. Returns `canonical('contract semantic', true, 'semantic_detail_ready', ...)` with exitCode 0. Guarded by the existing try/catch that returns `unsafe_contract_projection` on error.

### Deploy list

`registry/substitute.mjs` added to `router-lifecycle.mjs` moduleNames array with Phase 42 SEM-04 comment. Deploys to both `ownedRoot` and `codexOwnedRoot` via the `moduleValues` flatMap (HOST-03 parity).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed edge matching subjectId computation in semanticProjection**
- **Found during:** Task 2 GREEN phase
- **Issue:** The plan specified `subjectId = safeIdentifier(record?.stable_id || record?.id || record?.name)` for edge filtering, but edge endpoint IDs are raw `stableCapabilityId` values. `safeIdentifier` sanitizes the value (strips characters not matching SAFE_TOKEN regex like `%`), causing the filter `edge.source_id === subjectId` to fail when the raw stableCapabilityId contains characters that safeIdentifier strips.
- **Fix:** Use the raw `record?.stable_id || record?.id || record?.name` for edge matching. `safeIdentifier` is still applied for display via `relationshipItemProjection` which sanitizes the edge's `source_id`/`target_id` fields. Test fixtures updated to set `stable_id = stableCapabilityId(record)` and `canonical_identity` to mirror the real registry.
- **Files modified:** src/cli/router-control.mjs, tests/router.semantic-inspection.test.mjs
- **Commit:** db97640

## Test Coverage

- **tests/router.semantic-substitution.test.mjs** (10 tests): zero edges → blocked, one compatible → substituted, multiple → ambiguous, broader permissions rejected, higher risk rejected, different scope rejected, less-safe reversibility rejected, both routes retained, RECEIPT_STATES unchanged, non-throwing for invalid/missing failedRecord
- **tests/router.semantic-inspection.test.mjs** (7 tests): requires/produces/relationship sections, lifecycle section, limit/offset pagination, edge filtering by stable_id, TypeError for missing contract, safe token sanitization, canonical result shape

## Hot-Path Isolation

`grep -c "resolveSubstitution\|semanticProjection" src/router.mjs` returns 0. `resolveSubstitution` runs at dispatch time (not in the hot path hook); `semanticProjection` runs in the CLI inspection path.

## TDD Gate Compliance

- Task 1 RED: `test(42-02):` commit exists (2c480d1) — failing tests for SEM-04 substitution
- Task 1 GREEN: `feat(42-02):` commit exists after (e543605) — implementation passing all tests
- Task 2 RED: `test(42-02):` commit exists (96c22e8) — failing tests for SEM-02 inspection
- Task 2 GREEN: `feat(42-02):` commit exists after (db97640) — implementation passing all tests

## Scope Boundary Compliance

- `RECEIPT_STATES` in `src/adapters/dispatch/contract.mjs` is unchanged — `grep -c "'substituted'"` returns 0. The 8-state frozen array `['pending', 'invoked', 'paused', 'completed', 'failed', 'recommendation_only', 'blocked', 'quarantined']` is asserted by a test. Phase 44 (RCPT-02) owns the 'substituted' receipt state.

## Self-Check: PASSED

- All 3 created files exist on disk (src/registry/substitute.mjs, tests/router.semantic-substitution.test.mjs, tests/router.semantic-inspection.test.mjs)
- All 4 commits exist in git log (2c480d1, e543605, 96c22e8, db97640)
- `registry/substitute.mjs` appears exactly 1 time in `src/lifecycle/router-lifecycle.mjs`
- `'substituted'` appears 0 times in `src/adapters/dispatch/contract.mjs`
- Hot-path isolation verified: 0 references to `resolveSubstitution` or `semanticProjection` in `src/router.mjs`
- Full suite: 8 pre-existing flaky failures in install/onboarding/full-corpus tests (documented in memory, reproduce on baseline, unrelated to this plan's changes)
