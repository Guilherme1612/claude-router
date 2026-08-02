---
phase: 32-intent-first-routing-mode-map-schema-v4-guard-hole-closure
plan: 04
subsystem: intent-first routing resolve evaluation
tags: [resolve, runtime-conditional, parity, perf, phase32]
type: execute
status: complete
requirements-completed: [PARITY-04]
depends_on: [32-03]
requires: [PARITY-03, PARITY-04]
provides: []
affects: [tests/router.mjs.snapshot, ~/.claude/hooks/router.mjs, tests/router.phase32-cross-runtime.test.mjs, tests/router.perf.test.mjs]
tech-stack:
  added: []
  patterns:
    - runtime-tagged presence (runtime_commands[RUNTIME]) as the resolve candidate source
    - framework-neutral resolve list resolving to active-runtime-local present equivalent
    - resolve-first hot-path perf gate (in-process resolveSlashRoute timing)
key-files:
  created: []
  modified:
    - tests/router.mjs.snapshot
    - /Users/guilherme/.claude/hooks/router.mjs
    - tests/router.phase32-cross-runtime.test.mjs
    - tests/router.perf.test.mjs
decisions:
  - Resolve presence source now prefers runtime_commands[RUNTIME], falling back to plain .commands for pre-runtime manifests; RUNTIME enum clamp (default claude) guarantees fail-open never selects a foreign capability set.
  - Cross-runtime equivalent resolution falls out of the framework-neutral ranked list evaluated against active presence — no claude<->codex translation table (PARITY-04, T-32-14).
  - Provenance: [{ runtime }] attached to every resolved route so the injected suggestion is attributable to the active runtime alone (PARITY-02/03/04).
  - ROUTE-05 tie-lint (near-tie high->med) and absent-member quarantine folded into resolveSlashRoute, since the exported single function is the resolve-first hot path.
  - Perf gate measures the resolve-first path in-process (import + time resolveSlashRoute) because the real hook only emits additionalContext (stdout) on confident injects — direct timing is the reliable budget signal.
estimate:
  tokens: 55000
  raw_tokens: 30000
  tasks: 3
  confidence: med
actuals:
  tokens: 19750
  tasks: 3
  commits: 2
---

# Phase [32] Plan [04]: Runtime-conditional resolve evaluation + resolve-heavy perf gate Summary

Finalized Phase 32 by making resolve evaluation runtime-conditional (PARITY-03/04, turning the cross-runtime RED spec GREEN) and proving the new resolve-first hot path stays within the ROADMAP criterion-5 latency budget.

## What was built

- **Runtime-conditional resolve evaluation (PARITY-03):** `resolveSlashRoute`'s presence source now prefers `runtime_commands[RUNTIME]` (phase 31/26 runtime-tagged shape) over the plain `.commands` array. A capability present only under one runtime is invisible to the other — only the ACTIVE runtime's present capabilities are evaluated and injected. `RUNTIME` is the module-level enum clamp (unset/ambiguous defaults to claude), guaranteeing fail-open never selects a foreign capability set (T-32-13).
- **Cross-runtime equivalent resolution (PARITY-04):** the framework-neutral resolve list resolves a capability role to its active-runtime-local present equivalent (claude → `gsd-debug`, codex → `systematic-debugging`). No claude↔codex translation table — equivalence falls out of the ranked list against active presence (T-32-14). Every resolved route now carries `provenance: [{ runtime }]` (phase-26 shape) so the injected suggestion is attributable to the active runtime alone.
- **ROUTE-05 resolve hygiene folded in:** absent resolve members are quarantined (`quarantined` array, flagged, never injected); a near-tie (any other present candidate within 0.05 of the top) downgrades high → med.
- **Resolve-heavy perf gate (T-32-15):** extended `router.perf.test.mjs` with a budget gate that imports the shipped hook and times `resolveSlashRoute` on a confident intent carrying a framework-neutral resolve list (>=20 warm iterations). Asserts warm p95 < 40ms, every run max < 100ms, exit 0, and stdout is pure timing JSON (no dead stdout). Existing trivial pass-through gates kept intact.

## Deviations from Plan

- **Tasks 1+2 committed as one atomic commit.** Tasks 1 (Group A / PARITY-03) and 2 (Group B / PARITY-04) modify the identical single function (`resolveSlashRoute`) and the same file set, and both turned GREEN from the same atomic source change. They were verified together (cross-runtime spec 7/7) and committed in one commit. Both task completion criteria are satisfied; the split is purely commit granularity.

### Auto-fixed Issues

None — plan executed as written.

## Verification Results

Full Phase-32 suite GREEN across Task-3 verify and the plan-level verification command:

- cross-runtime (PARITY-03/04 + Group C ROUTE-05 tie-lint/quarantine): **7/7 GREEN**
- perf (pass-through + resolve-heavy budget gate): **4/4 GREEN**
- schema-v4 routing, coverage-audit, resolve-tie-lint, failopen, guards: GREEN
- snapshot.diff (mirror lockstep): GREEN — snapshot byte-identical to live hook

**Aggregate: 80/80 tests pass, 0 fail, 0 skip.**

## Threat Flags

None — the only new surface is the runtime-tagged resolve presence path, which is scoped to the active runtime (mitigated by T-32-13/14) and is covered by PARITY-03/04 specs.

## Known Stubs

None.

## Self-Check: PASSED

- `tests/router.mjs.snapshot` exists and is byte-identical to `~/.claude/hooks/router.mjs`
- Commits present: `be66efd` (tasks 1+2), `0e4eca4` (task 3)
