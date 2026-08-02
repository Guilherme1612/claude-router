---
phase: 32-intent-first-routing-mode-map-schema-v4-guard-hole-closure
plan: 02
subsystem: routing
tags: [schema-v4, resolve-first, guard-hole, mirror-lockstep, fallback]
dependency_graph:
  requires: [32-01]
  provides: [32-03, 32-04]
  affects: [tests/router.mjs.snapshot, ~/.claude/hooks/router.mjs, ~/.claude/router/mode-map.json]
tech-stack:
  added: []
  patterns:
    - Framework-neutral resolve-first route decision (candidate set purely from entry.mode + entry.resolve)
    - Guard-hole closure: schema_version no longer makes any slash route intentional
key-files:
  created: []
  modified:
    - tests/router.mjs.snapshot
    - /Users/guilherme/.claude/hooks/router.mjs
    - ~/.claude/router/mode-map.json
decisions:
  - resolveSlashRoute(entry, manifestOrIndexes, opts) exported; accepts either raw manifest or buildTargetIndexes() result as presence source
  - Two guard sites (validateRouteTargets slash branch + routeTargetsExist hot path) both switch from `mode===id && schema_version` to resolve-aware presence check
  - Empty resolved candidate set -> null (validateRouteTargets stale_target) / false (routeTargetsExist -> cache recompute, silent-low) — never a dead injection
  - ROUTE-04 generic native fallback deferred to 32-03; coverage-audit forward-orphan closure (audit.mjs:142) deferred to 32-03
metrics:
  duration: "~25 min"
  completed_date: "2026-08-01"
status: complete
requirements-completed: [ROUTE-02]
actuals:
  tokens: 1085        # (chars/4) over snapshot diff (3214) + mode-map resolve lists (1128)
  tasks: 3
  commits: 3
---

# Phase 32 Plan 2: Schema-v4 Guard-Hole Closure + resolve-first route decision

## Summary

Closed the `schema_version` guard hole at both snapshot sites and wired a framework-neutral resolve-first route decision end-to-end in the byte-identical mirror, turning every 32-01 Wave-0 RED test in Groups A, B, and C(1)/(2) GREEN. Exported `resolveSlashRoute`, bumped `mode-map.json` to schema_version 4 with resolve lists on all 18 gsd slash entries, and kept mirror-lockstep (snapshot == live hook, snapshot.diff guard GREEN).

## Tasks Executed

| Task | Type | Commit | Files |
|------|------|--------|-------|
| 1. Tracer — export resolveSlashRoute + close guard hole at validateRouteTargets | tracer (tdd) | 6263cbf | tests/router.mjs.snapshot, ~/.claude/hooks/router.mjs |
| 2. Wire resolve-first into routeTargetsExist hot path (fallback + silent-low) | auto (tdd) | 8af2846 | tests/router.mjs.snapshot, ~/.claude/hooks/router.mjs |
| 3. Bump mode-map to schema v4 + add resolve lists, full-suite verify | auto | (external file, not committed to repo) | ~/.claude/router/mode-map.json |

## RED → GREEN (tests/router.schema-v4-routing.test.mjs)

Baseline was 1 pass / 7 fail. After this plan: **7 pass / 1 fail**. The single remaining failure (Group C high-confidence empty-resolve generic fallback, test 8) is ROUTE-04, explicitly deferred to 32-03.

GREEN (turned by this plan):
- **Group A (guard-hole closure):** `schema_version`-SET map with no gsd-* commands now flags every gsd entry `stale_target` (was leaking via `mode===id && schema_version`); UNSET control still flags it.
- **Group B (resolve-first presence):** `resolveSlashRoute` picks highest-ranked PRESENT candidate (GSD → gsd-debug; superpowers fixture → systematic-debugging; non-listed custom capability → never fabricated to gsd-*).
- **Group C(1)/(2) (fallback + silent-low):** absent top candidate falls back to next-present resolve member; zero-resolvable → null / silent-low, never a dead injection.

STILL RED (expected, deferred to 32-03):
- `router.schema-v4-routing.test.mjs` Group C empty-resolve generic fallback (ROUTE-04).
- `router.coverage-audit.test.mjs` tests 15/16 (resolve-forward-orphan closure at audit.mjs:142).

## Verification

`rtk node --test tests/router.mjs.snapshot.diff.test.mjs tests/router.schema-v4-routing.test.mjs tests/router.coverage-audit.test.mjs tests/router.failopen.test.mjs` → **35 pass / 3 fail**, where the 3 failures are exactly the deferred groups above (forward-orphan ×2, ROUTE-04 ×1). Mirror guard GREEN (snapshot byte-identical to live hook). No regression in failopen.

## Deviations from Plan

None — plan executed as written. All three guard-story tests that are meant to stay RED until 32-03 remain RED.

## Known Stubs

None. The 13 mode-map slash entries flagged `stale_target` under the resolve-aware rule against the current manifest are the intended consequence of guard-hole closure and are quarantined as intentional by 32-03's tie-lint, not stubs introduced here.

## Threat Surface

No new security-relevant surface beyond the plan's `<threat_model>` (T-32-05/06/07/08 all mitigated as specified).

## Self-Check

- FOUND: tests/router.mjs.snapshot
- FOUND: /Users/guilherme/.claude/hooks/router.mjs
- FOUND: /Users/guilherme/.claude/router/mode-map.json (schema_version 4, resolve lists on 18 slash entries)
- FOUND commit 6263cbf (Task 1)
- FOUND commit 8af2846 (Task 2)
- snapshot.diff test GREEN (mirror holds byte-identical)
- schema-v4-routing: 7 pass / 1 fail (only deferred ROUTE-04)

## Self-Check: PASSED
