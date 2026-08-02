---
phase: 32-intent-first-routing-mode-map-schema-v4-guard-hole-closure
plan: 03
subsystem: routing-quality-gates
tags: [guard-hole, resolve-list, tie-lint, forward-orphan, coverage-audit, generic-fallback]
type: execute
status: complete
requirements-completed: [ROUTE-04]
requires:
  - 32-02
provides:
  - ROUTE-04 generic native-capability fallback
  - ROUTE-05 resolve-list tie-lint + stale-target quarantine
  - audit.mjs schemaRoute guard-hole closure (T-32-09/T-32-10)
affects:
  - src/coverage/audit.mjs
  - tests/router.mjs.snapshot
  - ~/.claude/hooks/router.mjs
  - tests/router.coverage-audit.test.mjs
  - tests/router.schema-v4-routing.test.mjs
  - tests/router.resolve-tie-lint.test.mjs
  - scripts/resolve-tie-lint.mjs
tech-stack:
  added:
    - node:fs / node:path only (stdlib, no new deps) — resolve-tie-lint.mjs
  patterns:
    - resolve-aware presence check replacing blanket schema_version exemption
    - forward-orphan quarantine aligned between audit and validateRouteTargets
    - deterministic near-tie gap rule (TIE_GAP = 0.05) shared with tests
key-files:
  created:
    - scripts/resolve-tie-lint.mjs
    - tests/router.resolve-tie-lint.test.mjs
  modified:
    - src/coverage/audit.mjs
    - tests/router.mjs.snapshot
    - tests/router.coverage-audit.test.mjs (spec already present, now GREEN)
    - tests/router.schema-v4-routing.test.mjs (spec already present, now GREEN)
decisions:
  - Guard-hole closure mirrors 32-02's resolveSlashRoute semantics: a slash route is
    intentional only when its mode is a present command OR an explicit resolve member
    resolves to one; the blanket `Boolean(mode_map.schema_version)` pass is removed.
  - Generic fallback uses a single fixed constant string (GENERIC_NATIVE_FALLBACK),
    never derived from entry id or resolve candidates, so a fabricated capability name
    is impossible; fires only on high-confidence empty-resolve.
  - Tie-lint is a pure read-only stdlib gate; near-tie (weights within 0.05, or rank tie
    when weights absent) downgrades to med; absent resolve members are quarantined.
metrics:
  duration: 0:12:00
  tasks: 3
  commits: 3
  files: 7
  tests: 46 (16 + 8 + 8 + 1 + 13) all GREEN in verify target suite
estimate:
  tokens: 65000
  tasks: 3
actuals:
  tasks: 3
  commits: 3
---

# Phase 32 Plan 03: Routing Quality Gates Summary

Closed the coverage audit-guard half of the guard hole at audit.mjs:142, added the
ROUTE-04 generic native-capability fallback, and shipped the ROUTE-05 resolve-list
tie-lint + stale-target quarantine gate — the quality gates that keep resolve lists honest.

## One-liner

Resolve-aware audit guard closure (audit.mjs:142) + ROUTE-04 single generic native
fallback + ROUTE-05 deterministic tie-lint (near-tie -> med, stale-target quarantine),
all driven GREEN by the 32-01 RED specs.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Close audit guard at audit.mjs:142 + forward-orphan over resolve lists | e2434ad | src/coverage/audit.mjs |
| 2 | ROUTE-04 generic native-capability fallback (mirror) | 144a7d1 | tests/router.mjs.snapshot, ~/.claude/hooks/router.mjs |
| 3 | ROUTE-05 resolve-list tie-lint + stale-target quarantine | f44ea33 | scripts/resolve-tie-lint.mjs, tests/router.resolve-tie-lint.test.mjs |

## Verification

Run target (matches plan `<verify>` and `<verification>`):

```
node --test tests/router.coverage-audit.test.mjs \
             tests/router.schema-v4-routing.test.mjs \
             tests/router.resolve-tie-lint.test.mjs \
             tests/router.mjs.snapshot.diff.test.mjs \
             tests/router.failopen.test.mjs
```

Result: 16 + 8 + 8 + 1 + 13 = 46 pass / 0 fail.

- Task 1: coverage-audit extension GREEN (absent resolve member on schema_version-SET
  fixture -> stale_target); pre-existing coverage-audit tests remain GREEN.
- Task 2: ROUTE-04 assertion GREEN (empty-resolve high-confidence emits at most one
  generic native line, never a fabricated name); real resolve member wins when present.
- Task 3: 8 assert tie-lint spec GREEN (incl. near-tie -> med and stale-target quarantine
  fixtures from 32-01 Group C); snapshot.diff mirror GREEN; failopen GREEN.

## Deviations from Plan

None — the three planned tasks executed as written. The 32-01 RED specs
(tests/router.coverage-audit.test.mjs and tests/router.schema-v4-routing.test.mjs) were
already in the tree and needed no edits; the working tree carried uncommitted probe
implementation for Tasks 1-2 which was completed, verified GREEN, and committed per task.

### Deferred (per plan success criteria, NOT in scope)

- PARITY-03/04 cross-runtime group A/B resolve and perf budget -> deferred to 32-04.
- The live-hook resolveSlashRoute runtime-conditional presence (ROUTER_RUNTIME slice)
  and hook-level `quarantined` return channel -> deferred to 32-04 with runtime-tagged
  presence; Group C hook-level surface remains RED until 32-04. The deterministic
  tie-lint gate + lint spec delivered here is the ROUTE-05 enforcement vehicle.

## Key Decisions Made

1. **Resolve-aware audit closure** (T-32-09): `schemaRoute = mode && mode === route &&
   Boolean(mode_map.schema_version)` replaced with a resolve-aware check: slash route is
   intentional when mode is a present command OR a resolve member resolves to one.
2. **Forward-orphan reporting** (T-32-10): both audit.mjs and validateRouteTargets report
   resolve-list members absent from the active manifest as stale_target/forward-orphan
   diagnostics — never silently dropped.
3. **Anti-fabrication constant** (T-32-11): generic fallback line is a fixed string, not
   derived from entry id or candidates.
4. **Deterministic tie rule** (T-32-12): near-tie gap of 0.05 (or rank tie when weights
   absent) deterministically downgrades to `med`; lint is read-only and framework-neutral.

## Threat Flags

None — no new security-relevant surface beyond the plan's threat register; all four
threat dispositions (T-32-09..T-32-12) are `mitigate` and implemented.

## Self-Check: PASSED

- scripts/resolve-tie-lint.mjs: FOUND
- tests/router.resolve-tie-lint.test.mjs: FOUND
- commits e2434ad, 144a7d1, f44ea33: FOUND
- verify target suite 46 pass / 0 fail
