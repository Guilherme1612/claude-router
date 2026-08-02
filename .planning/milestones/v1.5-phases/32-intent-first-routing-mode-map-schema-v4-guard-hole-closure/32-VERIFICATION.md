---
phase: 32-intent-first-routing-mode-map-schema-v4-guard-hole-closure
verified: 2026-08-02T12:18:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 32: Intent-First Routing (mode-map schema v4 + guard-hole closure) Verification Report

**Phase Goal:** The router maps intent to a capability role and resolves to the first locally-present candidate from a ranked, framework-neutral list — never a hardcoded framework name — with the `schema_version` guard hole closed so no slash suggestion ships unless it can resolve.
**Verified:** 2026-08-01
**Status:** passed
**Re-verification:** No — initial independent verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ROUTE-01 — Framework-neutral first-present resolution: candidate set comes only from `entry.mode` + `entry.resolve`, no hardcoded framework prefix; resolves the same role to its local present equivalent (GSD / superpowers / custom) | ✓ VERIFIED | `resolveSlashRoute` (`tests/router.mjs.snapshot:739-809`) builds candidates solely from `entry.mode` (weight 1.0) + `entry.resolve[]`; grep confirms no `gsd-` prefix hardcoded in the matcher (only unrelated gsd-core bare-specifier comments). Test Group B passes: GSD fixture → gsd-debug, superpowers fixture → systematic-debugging, non-listed custom capability never fabricated to gsd-* |
| 2 | ROUTE-02 — schema_version guard hole closed at ALL three sites (validateRouteTargets, routeTargetsExist, coverage/audit.mjs): slash route intentional only when mode is present command OR resolve member resolves; schema_version truthiness no longer exempts | ✓ VERIFIED | `router.mjs.snapshot:867-888` (validateRouteTargets) + `:970-973` (routeTargetsExist) use `resolveSlashRoute`-aware check, blanket `mode===id && schema_version` pass removed; `src/coverage/audit.mjs:142-160` resolve-aware `schemaRoute`. Behavioral probe (own process): schema_version-SET map with ZERO gsd commands → every gsd slash entry flagged stale_target by BOTH `validateRouteTargets` and `auditCoverage` (was leaking before) |
| 3 | ROUTE-03 — Top candidate absent → suppress + fallback to next-best present; zero-resolvable → null/silent-low, never a dead injection | ✓ VERIFIED | `resolveSlashRoute` sorts present by weight desc, returns `present[0]`; empty → null (non-high) / silent low. Probe: absent gsd-debug + present gsd-docs → `suggested_slash: gsd-docs`; zero-resolvable → null. Test Groups C(1)/(2) pass |
| 4 | ROUTE-04 — High-confidence empty resolve emits at most one generic native-capability fallback line, never a fabricated capability name; non-high stays silent | ✓ VERIFIED | `GENERIC_NATIVE_FALLBACK` fixed constant `tests/router.mjs.snapshot:727`; `:790-793` fires only on `opts.tier==='high'`, returns `fallback_lines:[GENERIC_NATIVE_FALLBACK]` (never derived from id/candidates). Probe: high empty-resolve → exactly 1 fixed line with `suggested_slash:null`; `tier:'med'` → null. Test Group C (test 23) passes |
| 5 | ROUTE-05 — Resolve lists linted (near-tie→med downgrade, stale-target quarantine) + covered by coverage audit-guard forward-orphan | ✓ VERIFIED | Tie-lint: `nearTie = |top-second|<=0.05` → high→med downgrade (`snapshot:798-801`); absent members quarantined `quarantined[]` (`:777-779`). `scripts/resolve-tie-lint.mjs` gate runs and exits 0 (hardcoded TIE_GAP 0.05). audit.mjs + validateRouteTargets report absent resolve members as stale_target/forward-orphan (`audit.mjs:154-159`). Probes: near-tie → med, wide-gap → high, absent member quarantined |
| 6 | PARITY-03 — Resolve evaluation uses only the active runtime's present capabilities; only active runtime's suggestion injected | ✓ VERIFIED | `resolveSlashRoute` prefers `runtime_commands[RUNTIME]` slice over plain `.commands` (`snapshot:746-760`); RUNTIME is the module-level enum clamp (`detectRuntime`, fail-open default claude). Cross-runtime probe: under claude → gsd-debug (codex-only systematic-debugging quarantined); under codex → systematic-debugging (gsd-debug quarantined). `provenance:[{runtime}]` attributable. Cross-runtime test Group A passes |
| 7 | PARITY-04 — Capability present in one runtime resolves to its local equivalent in the other (cross-runtime fixture), no translation table | ✓ VERIFIED | Equivalence falls out of framework-neutral ranked list vs active presence — no claude↔codex table (`snapshot:804` comment). Probe: claude → `gsd-debug`, codex → `systematic-debugging`. Cross-runtime test Group B passes |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Deferred Items

None — all 7 phase requirements verified. (Phase 31's deferred PARITY-03/04 are now delivered in this phase.)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `tests/router.mjs.snapshot` | `resolveSlashRoute`, resolve-aware guard closure at validateRouteTargets + routeTargetsExist, `GENERIC_NATIVE_FALLBACK`, runtime_commands slice, tie-lint, quarantine, provenance | ✓ VERIFIED | All present at cited lines (739-809, 867-888, 970-973) |
| `/Users/guilherme/.claude/hooks/router.mjs` | Byte-identical mirror of snapshot | ✓ VERIFIED | `cmp` BYTE-IDENTICAL (both 151019 bytes); snapshot.diff guard GREEN; live-hook import works |
| `/Users/guilherme/.claude/router/mode-map.json` | schema_version 4, resolve lists on all 18 gsd slash entries | ✓ VERIFIED | schema_version=4, 46 entries, 18 slash all with resolve |
| `src/coverage/audit.mjs` | Resolve-aware guard closure + forward-orphan over resolve lists | ✓ VERIFIED | `:142-160` — schemaRoute resolve-aware; absent resolve member → stale_target |
| `scripts/resolve-tie-lint.mjs` | ROUTE-05 read-only stdlib tie-lint gate | ✓ VERIFIED | Exists, runs, exits 0; TIE_GAP 0.05; NEAR-TIE/STALE-TARGET reporting |
| `tests/router.schema-v4-routing.test.mjs` | Groups A/B/C (guard-hole, presence, fallback, generic fallback) | ✓ VERIFIED | 185 lines, passes |
| `tests/router.phase32-cross-runtime.test.mjs` | PARITY-03/04 + Group C tie-lint/quarantine cross-runtime | ✓ VERIFIED | 179 lines, passes |
| `tests/router.resolve-tie-lint.test.mjs` | Tie-lint spec | ✓ VERIFIED | 119 lines, passes |
| `tests/router.coverage-audit.test.mjs` | forward-orphan closure (extended) | ✓ VERIFIED | 509 lines, passes (incl. new schema_version-SET tests) |
| `tests/router.perf.test.mjs` | resolve-heavy budget gate | ✓ VERIFIED | warm p95<40ms / max<100ms gate passes |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `resolveSlashRoute` | `validateRouteTargets` guard branch | `intentionalResolveRoute = mode && Boolean(resolveSlashRoute(...))` | WIRED | guard no longer trusts schema_version |
| `resolveSlashRoute` | `routeTargetsExist` hot path | `intentionalResolveRoute` check `:972` | WIRED | cache-stale predicate resolve-aware |
| `resolveSlashRoute` | `coverage/audit.mjs` | `entry.resolve.some(member→command)` | WIRED | audit guard closure mirrored |
| `entry.resolve[]` | present command inventory | `commands.has(candidate.name)` filter | WIRED | only active-runtime present candidates injected |
| `runtime_commands[RUNTIME]` | resolve candidate source | `(manifestOrIndexes.runtime_commands||{})[RUNTIME]` | WIRED | PARITY-03 active-runtime-only evaluation |
| resolved route | injected suggestion attribution | `provenance:[{runtime:RUNTIME}]` | WIRED | attributable to active runtime (PARITY-04) |
| resolve list | coverage audit-guard | forward-orphan stale_target per absent member | WIRED | never silently dropped |
| mode-map resolve | tie-lint CI gate | `scripts/resolve-tie-lint.mjs` | WIRED | near-tie→med + quarantine reporting |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| resolve candidate set | `candidates` Map | `entry.mode` + `entry.resolve[]` (framework-neutral) | Yes — real ranked entries | ✓ FLOWING |
| present filter | `present[]` | active runtime's `runtime_commands[RUNTIME]` / `commands` | Yes — real runtime-specific presence | ✓ FLOWING |
| suggested_slash | `top.name` | highest-weighted present candidate | Yes — real resolvable command | ✓ FLOWING |
| fallback line | `GENERIC_NATIVE_FALLBACK` | fixed constant (never from data) | Yes — constant, anti-fabrication | ✓ FLOWING (by design) |
| audit guard | resolve-member presence | `indexes.command` + `entry.resolve` | Yes — real manifest inventory | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| ROUTE-03 fallback (top absent → next present) | live-hook `resolveSlashRoute(mode=gsd-debug, resolve=[gsd-debug,gsd-docs], commands=[gsd-docs])` | `suggested_slash: gsd-docs, tier: med` | ✓ PASS |
| ROUTE-04 empty-resolve high | live-hook, tier=high, no present candidate | `suggested_slash:null, fallback_lines:[GENERIC_NATIVE_FALLBACK]` (1 line) | ✓ PASS |
| ROUTE-04 non-high silent | live-hook, tier=med, no present candidate | `null` | ✓ PASS |
| ROUTE-05 near-tie (Δ0.02≤0.05) | live-hook, tier=high → med | `tier: med` | ✓ PASS |
| ROUTE-05 wide gap stays high | live-hook, Δ0.40 | `tier: high` | ✓ PASS |
| ROUTE-05 quarantine absent member | live-hook, `gsd-ghost` not present | `quarantined:['gsd-ghost']`, not injected | ✓ PASS |
| PARITY-03/04 claude | `resolveSlashRoute` under `ROUTER_RUNTIME` (default claude), runtime_commands fixture | `gsd-debug` (codex equivalent quarantined), `provenance runtime:claude` | ✓ PASS |
| PARITY-03/04 codex | `ROUTER_RUNTIME=codex`, same fixture | `systematic-debugging` (gsd-debug quarantined), `provenance runtime:codex` | ✓ PASS |
| ROUTE-02 guard (both sites) | schema_version-SET map, zero gsd commands | validateRouteTargets 2/2 gsd → stale_target; auditCoverage 2/2 → stale_target | ✓ PASS |
| ROUTE-05 CI gate | `node scripts/resolve-tie-lint.mjs` | exit 0, NEAR-TIE/STALE-TARGET report emitted | ✓ PASS |
| Mirror parity | `cmp snapshot live-hook` | BYTE-IDENTICAL | ✓ PASS |
| Test suites | `node --test` (schema-v4-routing + cross-runtime + resolve-tie-lint; coverage-audit + snapshot.diff + failopen; perf) | 23 pass / 0 fail; 30 pass / 0 fail; 4 pass / 0 fail | ✓ PASS |

### Probe Execution

No phase-declared `probe-*.sh` scripts exist; behavioral verification used direct live-hook imports and `node --test` in the verifier's own process (recorded above), not SUMMARY attestations.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ROUTE-01 | 32-01/32-02 | Framework-neutral first-present resolution | ✓ SATISFIED | resolveSlashRoute candidate set from mode+resolve only; superpowers fixture test + probe |
| ROUTE-02 | 32-01/32-02/32-03 | schema_version guard hole closed (router + audit) | ✓ SATISFIED | 3 sites resolve-aware; schema_version-SET probe flags all gsd entries stale at both validateRouteTargets and audit |
| ROUTE-03 | 32-01/32-02 | Top-absent fallback, zero → silent-low | ✓ SATISFIED | Probe fallback + null; tests pass |
| ROUTE-04 | 32-01/32-03 | Generic native fallback (≤1), no fabrication | ✓ SATISFIED | GENERIC_NATIVE_FALLBACK constant; high probe emits exactly 1 |
| ROUTE-05 | 32-01/32-03/32-04 | Tie-lint + quarantine + audit-guard coverage | ✓ SATISFIED | tie-lint downgrade probe, quarantine probe, script gate runs, forward-orphan both sites |
| PARITY-03 | 32-01/32-04 | Active-runtime-only capability evaluation | ✓ SATISFIED | runtime_commands[RUNTIME] slice; claude/codex probe isolation |
| PARITY-04 | 32-01/32-04 | Cross-runtime equivalent resolution, no table | ✓ SATISFIED | claude→gsd-debug, codex→systematic-debugging probe; no translation table |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none (no TBD/FIXME/XXX/HACK/PLACEHOLDER in modified files; no hardcoded framework prefix in resolve matcher; fail-open guards present at hot-path + audit) | ℹ️ none | — |

### Hard-Constraint Compliance

- **<100ms hot path / fail-open:** `resolveSlashRoute` wrapped in try/catch returning null on throw (`snapshot:806-808`); `routeTargetsExist` try/catch returns true (never blocks a cache hit). Perf budget gate passes: warm p95 < 40ms, max < 100ms on the resolve-first hot path.
- **Stdlib-only:** `resolveSlashRoute`, tie-lint, resolve evaluation use only built-ins (`node:fs`/`node:path`/`node:os`/`node:crypto`); no new npm deps.
- **Framework-neutral:** candidate set derived purely from `entry.mode` + `entry.resolve`; no hardcoded `gsd-` prefix in the matcher (grep-verified; only unrelated gsd-core bare-specifier comments).
- **Mirror lockstep:** `tests/router.mjs.snapshot` byte-identical to `~/.claude/hooks/router.mjs` (cmp BYTE-IDENTICAL); snapshot.diff guard GREEN.
- **Never dead injection:** empty/non-high resolve → null (silent); high empty-resolve → single generic constant line; absent members quarantined, never injected.

### Gaps Summary

No gaps found. All 7 phase requirements (ROUTE-01..05, PARITY-03/04) are implemented and verified against the live hook (`~/.claude/hooks/router.mjs`), the byte-identical snapshot mirror, `src/coverage/audit.mjs`, and `scripts/resolve-tie-lint.mjs`, with independent behavioral probes run in the verifier's own process plus the per-file test suites (57 tests green across schema-v4-routing, cross-runtime, resolve-tie-lint, coverage-audit, snapshot.diff, failopen, and perf). The schema_version guard hole is closed at all three sites; resolve-first hot path stays within the <40ms p95 / <100ms max budget though NOT additionally load-tested on CI — perf gate (4/4) provides in-process evidence. No debt markers introduced; no hardcoded framework names in resolve logic.

---

## Fresh Verification Rerun — 2026-08-02

- `node --test tests/router.mjs.snapshot.diff.test.mjs tests/router.schema-v4-routing.test.mjs tests/router.coverage-audit.test.mjs tests/router.failopen.test.mjs tests/router.phase32-cross-runtime.test.mjs tests/router.perf.test.mjs tests/router.resolve-tie-lint.test.mjs tests/router.runtime-index-path.test.mjs` — 64/64 passed
- No phase-32 gaps found; runtime-index parity and tie-lint changes are included in the rerun.

_Verified: 2026-08-02T12:18:00Z_
_Verifier: Claude (gsd-verifier)_
