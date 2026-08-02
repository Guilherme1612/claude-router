---
phase: 32-intent-first-routing-mode-map-schema-v4-guard-hole-closure
plan: 01
subsystem: routing, coverage-audit
tags: [tdd, red, resolve-first, guard-hole, schema-v4, cross-runtime]
dependency_graph:
  requires: []
  provides: []
  affects: [tests, 32-02, 32-03, 32-04]
tech_stack:
  added:
    - "test pattern: subprocess probe under ROUTER_RUNTIME (from phase-31 probeRuntime)"
    - "test pattern: combined manifest with per-runtime `runtime_commands` slice"
  patterns: []
key_files:
  created:
    - tests/router.schema-v4-routing.test.mjs
    - tests/router.phase32-cross-runtime.test.mjs
  modified:
    - tests/router.coverage-audit.test.mjs (extended, 2 new RED tests)
decisions:
  - "RED contract for the future resolve helper: `resolveSlashRoute(entry, manifest, opts?)` — undefined-import is the RED state."
  - "Cross-runtime manifest shape carries a `runtime_commands` map keyed by runtime; ROUTER_RUNTIME selects the active slice (deferred 'runtime-tagged presence')."
metrics:
  duration: "~0h 25m"
  completed_date: "2026-08-01"
status: complete
actuals:
  tokens: 5400     # chars/4 over the added diff; test-only RED wave
  tasks: 2         # tasks completed (plan listed 2 task elements)
  commits: 2       # commits made
requirements: [ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, PARITY-03, PARITY-04]
---

# Phase 32 Plan 01: Intent-First Routing Schema-v4 Guard-Hole Closure — Wave-0 RED Specs

RED (test-first) Wave-0 for Phase 32: two new specs and one extended spec that lock the
`schema_version` guard hole and every resolve-first / cross-runtime behavior as FAILING
targets for 32-02/03/04 to turn GREEN. No production code touched.

One-liner: schema_version-SET guard-hole, resolve-first fallback, cross-runtime resolve
(PARITY-03/04), and resolve-list tie-lint/forward-orphan (ROUTE-05) all locked RED against
today's hook.

## What Was Built

1. **tests/router.schema-v4-routing.test.mjs** — imports the live hook
   (`~/.claude/hooks/router.mjs`, same HOOK pattern as router.cache/covnerage-audit) and
   the already-exported `validateRouteTargets` / `buildTargetIndexes`, plus a `resolveSlashRoute`
   binding that is **undefined today** (the undefined-import IS the RED state).
   - Group A (ROUTE-02): schema_version-SET fixture with zero gsd-* commands must flag every
     `id === mode` gsd entry as `stale_target`. **Fails with `got 0`** — proving the current
     `intentionalSchemaRoute = mode && mode === id && modeMap?.schema_version` branch at
     router.mjs:721/806 leaks gsd-* suggestions on a no-gsd manifest.
   - Group B (ROUTE-01): resolve-first presence — picks highest-ranked present candidate;
     superpowers-style manifest resolves the same role to its local present equivalent; candidate
     set comes only from `mode` + `resolve` (no hardcoded `gsd-` prefix).
   - Group C (ROUTE-03/04): top-absent falls back to next-present; zero-resolvable is
     null/silent-low; high-confidence empty-resolve emits at most one generic native line.

2. **tests/router.phase32-cross-runtime.test.mjs** — reuses the phase-26 dual-runtime shape.
   Probes spawn a fresh subprocess under `ROUTER_RUNTIME=<runtime>` that imports the live hook
   and calls `resolveSlashRoute(entry, manifest)` (perf.test.mjs spawnSync pattern).
   - Group A (PARITY-03): active-runtime-only evaluation — claude emits gsd-*, codex does not.
   - Group B (PARITY-04): cross-runtime equivalent — claude -> gsd-debug, codex -> systematic-debugging.
   - Group C (ROUTE-05): near-tie (weight gap ≤ 0.05) downgrades to `med`/suppressed; absent
     resolve member is quarantined (flagged, never injected).

3. **tests/router.coverage-audit.test.mjs** (extended) — two new schema_version-SET tests: the
   absent `entry.resolve` member must be reported as a `stale_target` / forward-orphan diagnostic
   by both `validateRouteTargets` (live) and `auditCoverage` (direct + builder variant via
   `runBuilder`). Fails today because neither audit.mjs:142 nor the live validator inspects
   `entry.resolve`. All 14 pre-existing coverage-audit tests remain GREEN.

## RED Confirmation (against today's hook)

`rtk node --test tests/router.schema-v4-routing.test.mjs tests/router.phase32-cross-runtime.test.mjs tests/router.coverage-audit.test.mjs`

- 31 tests total: **15 pass / 16 fail**.
- schema-v4-routing: 7 RED + 1 GREEN (the UNSET control).
- phase32-cross-runtime: 7/7 RED.
- coverage-audit: 14 GREEN (pre-existing, unchanged) + 2 RED (new).

The load-bearing guard-hole test fails with `got 0: []` for expected `2` stale_target
diagnostics — the schema_version-truthty branch still swallows the entries, proving the hole is
real, untested, and schema_version-conditional.

## Deviation Notes

- **Plan frontmatter estimate lists `tasks: 3`, but the `<tasks>` block contains only 2 task
  elements.** Executed the 2 present tasks; recorded `tasks: 2` in actuals. No functional gap —
  the two tasks jointly cover all 6 required behaviors.
- No package installs, no production code, no `~/.claude/hooks/router.mjs` snapshot changes
  (snapshot mirror is out of scope for a RED wave — plan did not request it).

## One Unexpected PASS

The schema_version-**UNSET** control test passes today (as designed). This is intentional
(control), not a RED leak — it confirms the hole is exercised only when `schema_version` is SET.

## Known Stubs

None. Test-only wave; every RED assertion references the future `resolveSlashRoute` /
`entry.resolve` / `runtime_commands` surfaces by design (these are the RED state, not stubs).

## Deviations from Plan

None — plan executed exactly as written (modulo the frontmatter/body task-count mismatch above,
which is a plan-metric correction, not a scope deviation).

## Self-Check: PASSED

- [x] tests/router.schema-v4-routing.test.mjs exists (9682 bytes)
- [x] tests/router.phase32-cross-runtime.test.mjs exists (8459 bytes)
- [x] tests/router.coverage-audit.test.mjs extended (74 added lines)
- [x] Commit 84943f0 exists (Task 1)
- [x] Commit 8f6e522 exists (Task 2)
