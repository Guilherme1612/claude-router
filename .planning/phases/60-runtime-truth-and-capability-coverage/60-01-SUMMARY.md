---
phase: 60-runtime-truth-and-capability-coverage
plan: 01
subsystem: registry-coverage
tags: [coverage, registry, reconciliation, runtime-local, fail-closed]
requires: [runtime-adapters, registry-eligibility, route-target-validation]
provides: [runtime-aware-coverage-rows, stale-target-reconciliation-boundary]
affects: [phase-60-plan-02, watcher-publication]
tech-stack:
  added: []
  patterns: [canonical-eligibility, bounded-diagnostics, deterministic-reason-codes]
key-files:
  created: [tests/router.coverage-audit.test.mjs]
  modified: [src/coverage/audit.mjs, src/registry/reconcile.mjs]
key-decisions:
  - Preserve Claude/Codex runtime and native locator identity instead of merging equivalent names.
  - Keep non-selectable records visible as diagnostics while excluding them from actionable gaps and route targets.
  - Reuse canonical dispatchability and eligibility evidence at reconciliation boundaries.
requirements-completed: [CAP-01, CAP-02]
duration: ~15m
completed: 2026-08-10
coverage:
  - deliverable: Runtime-aware coverage rows for all discovered collections
    verification:
      - kind: test
        ref: tests/router.coverage-audit.test.mjs#runtime-aware-audit-preserves-every-CAP-01-collection-and-native-identity
        status: pass
        human_judgment: false
  - deliverable: Non-selectable records remain visible without actionable gaps
    verification:
      - kind: test
        ref: tests/router.coverage-audit.test.mjs#runtime-aware-audit-keeps-non-selectable-records-visible-without-actionable-gaps
        status: pass
        human_judgment: false
  - deliverable: Reconciliation blocks unsafe stale or unavailable candidates
    verification:
      - kind: command
        ref: rtk node --test tests/router.registry-reconcile.test.mjs tests/router.route-targets.test.mjs tests/router.trust-quarantine.test.mjs
        status: pass
        human_judgment: false
---

# Phase 60 Plan 01: Runtime-Aware Coverage and Reconciliation Summary

## Accomplishments

- Extended `auditCoverage` with deterministic runtime, scope, availability, dispatchability, provenance, native locator, reason-code, and disposition fields across skills, agents, commands, plugins, tools, hooks, integrations, and MCP-related diagnostics.
- Preserved legacy coverage fields and ensured unavailable, stale, project-scoped, excluded, hook-owned, invalid, and missing-MCP records remain inspectable but cannot become actionable route gaps.
- Reused canonical dispatchability evidence at reconciliation boundaries so non-dispatchable candidates and aliases cannot publish safe routes.
- Added anonymous dual-runtime and safety fixtures proving native identity preservation and diagnostic-only treatment of unsafe records.

## Verification

- `rtk node --test tests/router.coverage-audit.test.mjs tests/router.coverage.test.mjs tests/router.registry-schema.test.mjs tests/router.registry-reconcile.test.mjs tests/router.route-targets.test.mjs tests/router.trust-quarantine.test.mjs` — 77/77 passed.
- `rtk git diff --check` — passed.

## Commits

- `fdd36d1` — runtime-aware coverage audit tests.
- `ef812c0` — runtime coverage truth and CAP-01 collection handling.
- `ecbd31b` — non-dispatchable reconciliation quarantine.

## Deviations and Issues

- The delegated generic executor stalled after committing the coverage tests and before committing production changes or the summary. The orchestrator stopped it, verified the partial work, completed the remaining plan inline, and preserved the existing test commit.
- No architectural deviation, dependency installation, checkpoint, or user action was required.

## Self-Check: PASSED

- All plan tasks completed and committed.
- All focused acceptance and plan-level verification commands passed.
- Prompt-time routing and `src/runtime/router.mjs` were not modified.
- Phase 60 Plan 02 may now execute.
