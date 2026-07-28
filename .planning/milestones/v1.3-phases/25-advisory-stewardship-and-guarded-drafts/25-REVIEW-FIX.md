---
phase: 25
fixed_at: 2026-07-28T16:13:57Z
review_path: .planning/phases/25-advisory-stewardship-and-guarded-drafts/25-REVIEW.md
iteration: 3
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 25: Code Review Fix Report

**Fixed at:** 2026-07-28T16:13:57Z
**Source review:** `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-REVIEW.md`
**Iteration:** 3

**Summary:**

- Findings in scope: 1
- Fixed: 1
- Skipped: 0

## Fixed Issues

### CR-01: Draft valid missing capabilities without relationship edges

**Files modified:** `src/steward/draft.mjs`, `tests/router.steward-draft.test.mjs`, `tests/router.steward-cli.test.mjs`
**Commit:** d86b3df
**Applied fix:** Relationship edges remain optional richer evidence. When absent, the validated owner contract supplies the exact deterministic route identity, while missing contract/category validation remains fail-closed.

## Previous Iterations

### CR-01: Preserve normal router output

**Files modified:** `tests/router.mjs.snapshot`, `tests/router.context-prompt-integration.test.mjs`
**Commit:** 9998d96
**Applied fix:** Normal routing now runs for every valid prompt and composes its recommendation with optional context/startup output in one hook envelope.

### CR-02: Evidence-backed remediation drafts

**Files modified:** `src/steward/draft.mjs`, `src/cli/router-control.mjs`, `tests/router.steward-draft.test.mjs`, `tests/router.steward-cli.test.mjs`
**Commit:** 9998d96
**Applied fix:** Draft payloads bind exact affected contracts, missing dependency/category identifiers, authoritative route IDs, and concrete verification steps; incomplete evidence fails closed.

### CR-03: Acknowledge only emitted startup notices

**Files modified:** `src/context/prompt-route.mjs`, `tests/router.mjs.snapshot`, `tests/router.steward-startup.test.mjs`, `tests/router.context-prompt-integration.test.mjs`
**Commit:** 9998d96
**Applied fix:** The prompt adapter returns the exact emitted pointer only when the advisory survives the byte cap, and the hook acknowledges only that pointer.

### WR-01: Complete bounded text states

**Files modified:** `src/cli/router-control.mjs`, `tests/router.steward-cli.test.mjs`
**Commit:** 9998d96
**Applied fix:** Interaction actions and approved draft previews now use shallow bounded groups with direct empty/dismiss/snooze/correct/preview coverage and no ANSI dependency.

### CR-01: Production suggestion and draft inputs

**Files modified:** `src/steward/refresh.mjs`, `src/steward/draft.mjs`, `src/cli/router-control.mjs`, `tests/router.steward-cli.test.mjs`
**Commit:** d9dcd39
**Applied fix:** Reused the authoritative Phase 24 input loader and added a deterministic bounded draft payload provider. Dependency injection remains optional.

### CR-02: Startup delivery and cooldown acknowledgement

**Files modified:** `tests/router.mjs.snapshot`, `src/steward/startup-ack.mjs`, `src/lifecycle/router-lifecycle.mjs`, `tests/router.context-prompt-integration.test.mjs`, `tests/router.steward-startup.test.mjs`
**Commit:** d9dcd39
**Applied fix:** Wired the deployed UserPromptSubmit source through `routeContextPrompt`, then records cooldown and publishes a suppressed pointer after successful emission. The formerly skipped integration test now executes the source hook.

### CR-03: Expired suppression metadata

**Files modified:** `src/steward/suggestion.mjs`, `src/steward/startup-pointer.mjs`, `tests/router.steward-startup.test.mjs`
**Commit:** d9dcd39
**Applied fix:** Expired snooze/cooldown metadata normalizes to null, and acknowledged pointers become available again after cooldown expiry.

### WR-01: Concurrent identical draft rename

**Files modified:** `src/steward/draft.mjs`, `tests/router.steward-draft.test.mjs`
**Commit:** d9dcd39
**Applied fix:** Reconciles both `EEXIST` and `ENOTEMPTY`, retaining immutable byte comparison.

### Integration: Canonical hook source and install lifecycle

**Files modified:** `tests/router.mjs.snapshot`, `src/lifecycle/router-lifecycle.mjs`, `tests/router.context-prompt-integration.test.mjs`, `tests/router.lifecycle.test.mjs`
**Commit:** d9dcd39
**Applied fix:** The lifecycle deploys the pointer/acknowledgement dependency closure and the hook resolves context before normal routing while remaining fail-open.

### UI review: Human-readable suggestion output

**Files modified:** `src/cli/router-control.mjs`, `tests/router.steward-cli.test.mjs`
**Commit:** d9dcd39
**Applied fix:** Added bounded overview/evidence/action groups, contracted recovery copy, and warning deduplication without changing canonical JSON envelopes.

### Phase 24 score-consumption assessment

**Files modified:** `src/steward/refresh.mjs`, `tests/router.steward-cli.test.mjs`
**Commit:** d9dcd39
**Applied fix:** Production now consumes `deriveObservations` output as the sole evidence input. This preserves the locked Phase 25 research decision: catalog confidence is authoritative and Phase 25 must not reinterpret raw outcomes or run a second scorer.

## Verification

- Latest focused serial tests: 58/58 passed.
- Syntax checks and `git diff --check`: passed.

---

_Fixed: 2026-07-28T16:13:57Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
