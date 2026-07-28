---
phase: 19
slug: close-gap-tok-02-orc-01-wire-orchestrator-select-transitions
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> Populated by Plan 01 (Task 2) from RESEARCH.md `## Validation Architecture`.
> `nyquist_compliant: false` because Wave 0 is incomplete — Plan 04 completes
> Wave 0 during execution (the ~10 fixture-update files + D-09 E2E assertions +
> lifecycle-recovery/compiled-index empty-mapping audit + v1.2-matrix.json
> secondary evidence entry). The Nyquist Dimension 8 gate fires at validate-phase;
> this plan only scaffolds the contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, Node 22) + `node:assert/strict` |
| **Config file** | none — tests are standalone `.mjs` files run via `node --test tests/<name>.test.mjs` |
| **Quick run command** | `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.test-mode-seam.test.mjs tests/router.compiled-index.test.mjs tests/router.workflow-orchestrator.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` (65 test files) |
| **Estimated runtime** | ~25 seconds (quick run ~6s; full suite ~25s) |

---

## Sampling Rate

- **After every task commit:** Run `node --test tests/router.autonomous-lifecycle.test.mjs tests/router.test-mode-seam.test.mjs tests/router.compiled-index.test.mjs tests/router.workflow-orchestrator.test.mjs` (the directly-touched + orchestrator suites; <30s).
- **After every plan wave:** Run `node --test tests/*.test.mjs` (full 65-file suite — catches schema-bump churn across all files referencing `schema_version: 1`).
- **Before `/gsd-verify-work`:** Full suite green + v1.2 release gate (`tests/router.v12-release.test.mjs` via `src/release/run-release.mjs`) — ORC-01/TOK-02 evidence entries must remain or gain a Phase 19 secondary.
- **Max feedback latency:** 30 seconds.

---

## Per-Task Verification Map

One row per task across Plans 02/03/04, using the Requirement→Test Map from RESEARCH.md (ORC-01 and TOK-02 rows). Threat Ref column: T-19-01 for sibling-hash tasks (Plan 02), T-19-02 for bundle-deployment tasks (Plan 03), — for fixture/D-09 tasks. Test Type: unit for compile-index schema tests; E2E for autonomous-lifecycle/test-mode-seam. File Exists: ✅ for existing test files (EXTEND per D-09), ❌ W0 for the ~10 fixture-update files (Wave 0 audit). Status: ⬜ pending for all rows.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-02-01 | 02 | 2 | ORC-01 | T-19-01 | Sibling tuple files (closure/budget/summary-index) hash-verified via manifest payload_sha256; missing/mismatched hash → tuple rejected → blocked() | unit | `node --test tests/router.compiled-index.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-02-02 | 02 | 2 | ORC-01 | T-19-01 | verifyTuple reads each sibling via boundedJson, computes sha256, compares against manifest field; tampered sibling → rejected | unit | `node --test tests/router.compiled-index.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-02-03 | 02 | 2 | ORC-01 | — | Blanket fallback (publish-index.mjs:63-67) removed; empty mapping → throw at :68 (no canonical_record route) | unit + E2E | `node --test tests/router.compiled-index.test.mjs tests/router.autonomous-lifecycle.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-02-04 | 02 | 2 | TOK-02 | — | planContextLoad runs at publish; budget baked into budget.json sibling; required-overflow → dispatch_eligible: false baked | E2E | `node --test tests/router.autonomous-lifecycle.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-02-05 | 02 | 2 | ORC-01 + TOK-02 | T-19-01 | COMPILED_INDEX_SCHEMA_VERSION bumped 1→2; compatible() extended with orchestrator_contract_version + context_contract_version; prior tuples invalidated | unit | `node --test tests/router.compiled-index.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-02-06 | 02 | 2 | ORC-01 + TOK-02 | — | loadCompiledIndex returns additive flat keys (closure, budget, summaryIndex); validRoutes() unchanged | unit | `node --test tests/router.compiled-index.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-03-01 | 03 | 2 | ORC-01 | — | Route path reads baked closure/budget/summaryIndex via projection (compiledIndex.closure?.[workflowId]); no orchestrator call on hot path | E2E | `node --test tests/router.test-mode-seam.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-03-02 | 03 | 2 | TOK-02 | — | Route path observes dispatch_eligible flag from baked budget; false → synthesizes blocked resolution (prompt-route.mjs:105-110) | E2E | `node --test tests/router.autonomous-lifecycle.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-03-03 | 03 | 2 | ORC-01 + TOK-02 | T-19-02 | moduleNames extended +4 entries (3 orchestrator .mjs + workflow-declarations.json); modules deployed into both claude and codex runtime modules/ dirs | E2E | `node --test tests/router.test-mode-seam.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-04-01 | 04 | 3 | ORC-01 | — | D-09: autonomous-lifecycle E2E asserts closure+budget+summary-index present; empty mapping → blocked; required-overflow → non-dispatchable; Flow 11 dispatch_eligible PASS | E2E | `node --test tests/router.autonomous-lifecycle.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-04-02 | 04 | 3 | ORC-01 + TOK-02 | — | D-09: test-mode-seam E2E asserts bundle presence of orchestrator modules + workflow-declarations.json; baked closure readable from tuple | E2E | `node --test tests/router.test-mode-seam.test.mjs` | ✅ EXTEND | ⬜ pending |
| 19-04-03 | 04 | 3 | ORC-01 + TOK-02 | — | ~10 test files referencing schema_version: 1 / old COMPILED_INDEX_COMPATIBILITY updated to schema 2 + new compatibility members | unit | `node --test tests/*.test.mjs` | ❌ W0 | ⬜ pending |
| 19-04-04 | 04 | 3 | ORC-01 | — | lifecycle-recovery + compiled-index audited for empty-mapping publish calls that relied on canonical_record fallback (Pitfall #4) | unit | `node --test tests/router.lifecycle-recovery.test.mjs tests/router.compiled-index.test.mjs` | ❌ W0 | ⬜ pending |
| 19-04-05 | 04 | 3 | ORC-01 + TOK-02 | — | release/v1.2-matrix.json Phase 19 secondary evidence entry (label phase-19-live-path) added for ORC-01 + TOK-02 (Q3 resolution) | — | `node --test tests/router.v12-release.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Plan 04 completes Wave 0 during execution. The 5 gaps from RESEARCH.md Validation Architecture Wave 0 Gaps section:

- [x] `tests/router.autonomous-lifecycle.test.mjs` — D-09 sibling, no-fallback, budget, and dispatch assertions.
- [x] `tests/router.test-mode-seam.test.mjs` — deployed orchestrator bundle and baked-closure assertions.
- [x] Compiled-index fixtures use schema 2 with orchestrator/context compatibility members.
- [x] `tests/router.lifecycle-recovery.test.mjs` + `tests/router.compiled-index.test.mjs` — empty-mapping/no-fallback behavior covered.
- [x] `release/v1.2-matrix.json` — `phase-19-live-path` secondary evidence for ORC-01 and TOK-02.

*Framework install: none — `node:test` is built-in (Node 22).*

---

## Manual-Only Verifications

All phase behaviors have automated verification. The test_mode seam drives the E2E (watcher→controller→publishCompiledIndex via the opt-in `test_mode`/`verification_runners` seam); no manual UI steps exist for this wiring phase.

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | — |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-07-23 — focused 11-file suite passed 85/85; full sequential suite passed 724/724 with 3 environment-dependent skips.
