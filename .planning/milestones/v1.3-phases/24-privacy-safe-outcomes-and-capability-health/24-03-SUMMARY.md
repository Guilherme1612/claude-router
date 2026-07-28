---
phase: 24-privacy-safe-outcomes-and-capability-health
plan: 03
subsystem: health
tags: [privacy, capability-health, observation-catalog, admin-cli, hlth-05, hlth-08, hlth-09, hlth-10]
requires:
  - "24-01 — outcome-schema.mjs (validateOutcomeEnvelope), store.mjs (createHealthStore), admin.mjs (inspect), router-control.mjs health subcommand family"
  - "24-02 — observe.mjs (ingestTelemetryEvidence), score.mjs (scoreCapability)"
provides:
  - "src/health/catalog.mjs — deriveObservations pure transform emitting all 10 HLTH-08/09/10 observation kinds with HLTH-10 required fields + frozen REMEDIES allowlist"
  - "src/health/admin.mjs — extended from Plan 24-01 inspect-only to add reset/dispose/recover (HLTH-05)"
  - "src/cli/router-control.mjs — reset/dispose/recover wired (replaces Plan 24-01 not_implemented stubs)"
  - "tests/router.health.catalog.test.mjs — 28 tests covering every kind, D-2 mapping, HLTH-10 fields, REMEDIES allowlist, HLTH-07 protection, HLTH-09 distinction, bounded overflow"
  - "tests/router.health.admin.test.mjs — 16 tests covering reset/dispose/recover semantics, D-5 content-hash isolation, W3 import gate, CLI wiring"
affects:
  - "src/health/admin.mjs (extended additively from Plan 24-01 inspect-only)"
  - "src/cli/router-control.mjs (reset/dispose/recover stubs replaced with real delegation)"
tech-stack:
  added:
    - "src/health/catalog.mjs — stdlib-only (node:crypto not needed; pure transform), imports stableCapabilityId from src/registry/identity.mjs + HALF_LIFE_MS/MAX_RETENTION_MS/MINIMUM_SAMPLES from src/evolution/evidence.mjs"
  patterns:
    - "Pure transform catalog: reads already-derived relationship edges (D-2 — does NOT re-derive), reads outcome history, reads registry + contracts; never writes anywhere"
    - "Frozen REMEDIES allowlist (HLTH-10, T-24-13): non-destructive advisory strings only — review_contract, reassess_mapping, consider_deprecation, propose_reusable_skill, no_action; NEVER delete/disable/merge/publish/install"
    - "Frozen REASON_CODES enum — one per observation kind + observations_truncated overflow flag"
    - "Bounded observations (max 256, mirror MAX_EDGES=128 discipline doubled for the wider vocab) with overflow reason_code"
    - "Recoverable-state pattern (admin.recover): rename not delete; rebuild from outcomes.jsonl via score.scoreCapability when the disposed snapshot is missing (analog: src/registry/activate.mjs recoverActiveVersion/recoverRollbackJournal)"
    - "Content-hash isolation regression test (D-5, Pitfall 6, W3): SHA-256 of ALL FOUR protected artifacts byte-identical before/after every admin command"
key-files:
  created:
    - "src/health/catalog.mjs"
    - "tests/router.health.catalog.test.mjs"
    - "tests/router.health.admin.test.mjs"
  modified:
    - "src/health/admin.mjs"
    - "src/cli/router-control.mjs"
decisions:
  - "D-2 (HLTH-08 edge mapping): substitute→duplicate, variant→overlap, composition→complementary. The catalog reads already-derived relationship edges (deriveRelationships output); it does NOT call deriveRelationships and does NOT re-derive edges. duplicate (substitute) requires confidence_basis_points >= MIN_CONFIDENCE (8500); variant and composition do not carry the same confidence floor per the plan's explicit wording."
  - "MIN_CONFIDENCE inlined as 8500 with a reference comment rather than exported from relationships.mjs — the plan's files_modified contract does not include relationships.mjs, and the plan explicitly specifies '>= relationships.mjs MIN_CONFIDENCE=8500'. Inlining avoids a surgical change to a module outside the plan's scope."
  - "D-4 reaffirmed: exactly four health subcommands (inspect|reset|dispose|recover) — UX-09 bounded set; reset/dispose/recover wired this plan."
  - "D-5 + W3 enforced: admin.mjs imports only node:fs/node:path + ./score.mjs; no import of activate.mjs/publish-index.mjs/registry.mjs or any weights.json write path. The content-hash regression test is the enforcement gate; the W3 import-grep test defends at the import level too."
  - "D-6 reaffirmed: the catalog's kind field is observation_kind; outcome_kind is referenced only when reading the outcome-history record shape. No bare `outcome` field on any observation."
  - "HLTH-07 (D-1) unjudged protection holds in the catalog: sample_count < MINIMUM_SAMPLES → no long_unused, no ineffective (verified by two dedicated tests)."
  - "HLTH-09 healthy-vs-failure repetition: reusable_workflow requires >= 5 consecutive 'completed' outcomes; a chain of corrected/retried/replaced does NOT yield reusable_workflow (the longestConsecutiveRun helper only counts the requested kind set, so failure runs are excluded by construction)."
  - "W5 deferral reaffirmed: reusable_workflow in this plan is per-capability (a chain of consecutive 'completed' outcomes for ONE capability_id). Cross-capability route_id-correlation mining (A→B→C→D→E completion sequences promotable to a new skill/agent) is deferred per 24-CONTEXT.md <deferred>."
metrics:
  duration: "single session"
  completed: "2026-07-28"
  tasks: 2
  files_created: 3
  files_modified: 2
  tests_passing: 108
status: complete
---

# Phase 24 Plan 03: Health Observation Catalog + Admin Reset/Dispose/Recover Summary

Wave 3 turns the Phase 21 registry, the Phase 22 relationship graph, and the Plan 24-02 outcome history into the bounded HLTH-08/09/10 health observation catalog (10 kinds, HLTH-10 required fields, frozen non-destructive REMEDIES allowlist) and ships the full HLTH-05 admin surface (inspect/reset/dispose/recover) with a content-hash isolation regression test proving the authoritative registry, the active routing tuple, the mode-map, and the weights artifact are never touched by any admin command.

## What Was Built

### Task 1 — Health observation catalog, 10 kinds + HLTH-10 fields (type: auto/tdd, commit f51b9c6)

- **src/health/catalog.mjs — `deriveObservations({ registry, relationships, outcomes, contracts, now })`** — a pure transform returning `{ schema_version:1, policy_version:'health-policy-v1', observations, reason_codes }`. The catalog reads three inputs and derives all 10 observation kinds:
  - **missing_category** — a contract references a semantic_type (via `fields.invocation_kind.value` or a simplified `contract.semantic_type`) that has zero capabilities in the registry.
  - **missing_dependency** — a capability's contract.dependencies reference an id not present in the registry.
  - **unmapped** — a capability in the registry with zero outcome records (never dispatched).
  - **stale** — a capability whose contract.freshness === 'stale' (top-level `contract.freshness` or any `contract.fields.<field>.freshness === 'stale'`).
  - **long_unused** — sample_count >= MINIMUM_SAMPLES AND no outcome record newer than (now - 3*HALF_LIFE_MS). HLTH-07: below MINIMUM_SAMPLES → never emitted.
  - **duplicate (D-2)** — from a relationship edge of type 'substitute' with confidence_basis_points >= MIN_CONFIDENCE (8500). affected_capability_ids = [edge.source_id, edge.target_id].
  - **overlap (D-2)** — from a relationship edge of type 'variant'.
  - **complementary (D-2)** — from a relationship edge of type 'composition'.
  - **ineffective** — >= 3 consecutive 'corrected'/'retried'/'replaced' outcomes AND sample_count >= MINIMUM_SAMPLES. HLTH-07: below the floor → never emitted.
  - **reusable_workflow (HLTH-09)** — >= 5 consecutive 'completed' outcomes (healthy repetition). Failure-driven repetition (corrected/retried/replaced) does NOT yield reusable_workflow — `longestConsecutiveRun` only counts the requested kind set, so failure runs are excluded by construction.
- **HLTH-10 required fields** — every observation carries `observation_kind`, `reason_code` (frozen REASON_CODES enum), `evidence_window_ms` (<= MAX_RETENTION_MS), `sample_size` OR `opportunity_count` (bounded integers), `freshness` ('fresh'|'stale'), `affected_capability_ids[]` (non-empty, deduped+sorted), `confidence_basis_points` (bounded 0..10000 via `Math.max(0, Math.min(10000, value))`), and `remedy` (frozen REMEDIES allowlist). The catalog never mutates anything — remedies are advisory strings.
- **Frozen REMEDIES allowlist (T-24-13)** — `review_contract`, `reassess_mapping`, `consider_deprecation`, `propose_reusable_skill`, `no_action`. NEVER `delete`/`disable`/`merge`/`publish`/`install`. Verified by a dedicated test that asserts the allowlist is exactly the 5 non-destructive values and rejects all 5 forbidden remedies.
- **Bounded output** — observations is bounded to MAX_OBSERVATIONS=256 (mirror MAX_EDGES=128 discipline, doubled for the wider vocab); overflow sets `observations_truncated` in reason_codes.
- **D-2 purity** — the catalog reads already-derived relationship edges (the `relationships.edges` array from `deriveRelationships` output); it does NOT call `deriveRelationships` and does NOT re-derive edges (verified by a dedicated test passing a relationships object with only `edges`).
- **Contract shape flexibility** — `readContractField` accepts either the full `buildCapabilityContract` output (`contract.fields.<field>.{value,freshness,state}`) or a simplified projection (`contract.<field> = scalar`) for test ergonomics.
- **tests/router.health.catalog.test.mjs** — 28 tests: every one of the 10 kinds; the D-2 mapping (substitute→duplicate with MIN_CONFIDENCE floor, variant→overlap, composition→complementary); other relationship types (prerequisite/conflict/fallback) do NOT emit; HLTH-10 required fields on every observation; REMEDIES allowlist rejects destructive remedies; REASON_CODES is a frozen enum; HLTH-07 unjudged protection (below MINIMUM_SAMPLES → no long_unused, no ineffective); ineffective non-consecutive failures do not reach the 3-consecutive floor; HLTH-09 healthy-vs-failure repetition distinction; reusable_workflow chain-below-floor does not emit; bounded overflow (300 missing_category → <= 256 observations + observations_truncated); pure-transform contract; `now` must be an integer; D-6 (no bare `outcome` field).

### Task 2 — Admin reset/dispose/recover + content-hash isolation gate (type: auto/tdd, commit 053ffa7)

- **src/health/admin.mjs — extended from Plan 24-01 inspect-only** to add `reset`, `dispose`, `recover` (HLTH-05). All three operate exclusively on `~/.claude/router/health/` and never touch `outcomes.jsonl` (the raw evidence is preserved across every admin command).
  - **`reset({ healthRoot })`** — atomic-write `state.json` to `'{}'` via temp+rename+fsync with 0600 perms (mirrors `store.mjs` durableWrite). Returns `canonical('health', true, 'reset_ok', { path })`.
  - **`dispose({ healthRoot })`** — rename `state.json` → `state.disposed.json` (recoverable, not deleted). Idempotent: `already_disposed` if state.json is gone but state.disposed.json exists; `nothing_to_dispose` if neither exists. Returns `canonical('health', true, 'dispose_ok', { disposed_path })`.
  - **`recover({ healthRoot })`** — if `state.disposed.json` exists, rename it → `state.json` (atomic). Otherwise rebuild `state.json` from `outcomes.jsonl` by grouping outcomes by `capability_id` and calling `scoreCapability` (Plan 24-02) for each group; a missing/corrupt outcomes file yields an empty state (T-24-16 fail-open, never throws). Returns `canonical('health', true, 'recover_restored' | 'recover_rebuilt', { recovered_from, capability_count })`.
  - **`inspect`** — extended to surface a `disposed` flag in the result when `state.disposed.json` exists and `state.json` does not (so the user can see health is currently disposed).
- **src/cli/router-control.mjs** — the Plan 24-01 `not_implemented` stubs for reset/dispose/recover are replaced with real delegation to `admin.{reset,dispose,recover}`. The `health` branch validates `positional[1]` against `['inspect','reset','dispose','recover']` — anything else returns `canonical('health', false, 'invalid_subcommand')` with `exitCode EXIT.usage`. `usage()` already lists all four subcommands and carries the doctor/health disambiguation (unchanged from Plan 24-01).
- **tests/router.health.admin.test.mjs** — 16 tests:
  - reset writes state.json to `{}` atomically with 0600 perms; outcomes.jsonl NOT touched.
  - dispose renames state.json → state.disposed.json (recoverable); `already_disposed` and `nothing_to_dispose` idempotency.
  - recover restores from state.disposed.json; rebuilds from outcomes.jsonl when disposed is missing (with scoreCapability producing a non-null tier for a 30-sample capability); missing outcomes yields empty state (T-24-16 fail-open).
  - inspect still works after reset/dispose/recover cycles and surfaces the disposed flag.
  - **D-5 content-hash isolation (Pitfall 6, W3)** — SHA-256 of ALL FOUR protected artifacts (`release-tuples/active.json`, `mode-map.json`, `registry/registry.json`, `weights.json`) is byte-identical before and after every admin command (inspect, reset, dispose, recover).
  - **W3 extended import gate** — `admin.mjs` has no import of `activate.mjs`, `publish-index.mjs`, `src/registry/registry.mjs`, or any `weights.json` write path (line-anchored regex so comment text does not false-positive).
  - CLI wiring via `runRouterControl`: `router health bogus` → `invalid_subcommand` with `EXIT.usage` (exit code 2); `router health reset` → `reset_ok`; `router health dispose` → `dispose_ok`; `router health recover` → `recover_rebuilt`; `router health inspect` → `inspect_ok`; usage lists all four subcommands + the doctor disambiguation.

## Verification

All automated verification commands pass:

- `rtk node --test tests/router.health.catalog.test.mjs tests/router.health.admin.test.mjs tests/router.health.tracer.test.mjs tests/router.health.observe.test.mjs tests/router.health.score.test.mjs tests/router.health.outcome-schema.test.mjs tests/router.health.privacy.test.mjs` — **108/108 green** (44 new tests in this plan + 64 from Plans 24-01/24-02; no regression).
- `grep -rE "import.*(activate|publish-index)" src/health/` → 0 matches (D-5).
- `grep -nE "import.*registry\.mjs|weights\.json" src/health/admin.mjs` → 0 matches (W3 extended import gate).
- `grep -rE "import.*(node:http|node:https|node:net|node:dns|fetch)" src/health/` → 0 matches (HLTH-02).
- The catalog emits all 10 observation kinds with the D-2 edge mapping (substitute→duplicate, variant→overlap, composition→complementary).
- Every observation carries all 7 HLTH-10 required fields + a frozen REMEDIES allowlist remedy.
- The content-hash isolation test passes: ALL FOUR protected artifacts byte-identical after every admin command.
- Regression: `tests/router.control-cli.test.mjs` + `tests/router.router-control-canary.test.mjs` — 22/22 green (the router-control.mjs extension introduced no regressions).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Inlined MIN_CONFIDENCE=8500 rather than exporting it from relationships.mjs**
- **Found during:** Task 1 — catalog imports
- **Issue:** The plan specifies duplicate (substitute) edges require `confidence_basis_points >= relationships.mjs MIN_CONFIDENCE=8500`. `MIN_CONFIDENCE` is a module-private const in `src/registry/relationships.mjs` (line 6), not exported. The plan's `files_modified` contract does not include relationships.mjs, so adding an export there would be a surgical change to a module outside the plan's scope.
- **Fix:** Inlined `const MIN_CONFIDENCE = 8500` in `catalog.mjs` with a reference comment ("If relationships.mjs ever exports MIN_CONFIDENCE, prefer the import"). The value is faithful to the plan's explicit wording. Re-exported from catalog.mjs for test ergonomics.
- **Files modified:** src/health/catalog.mjs
- **Commit:** f51b9c6

**2. [Rule 3 - Blocking] Reworded D-5/W3 documentation comments to avoid false-positive on phase-gate grep**
- **Found during:** Task 2 — W3 extended import gate phase-gate command
- **Issue:** The phase-gate command `grep -nE "import.*registry\.mjs|weights\.json" src/health/admin.mjs` matches comment text ("no weights.json write path") because the regex alternation `weights\.json` matches anywhere on the line, not just in import statements. JS comments start with `//`, not `#`, so a `grep -v '^#'` filter would not exclude them.
- **Fix:** Reworded the D-5/W3 documentation comments in `admin.mjs` to use "the registry module" and "the weights artifact" instead of the literal `registry.mjs` / `weights.json` strings. The comments still document the invariant; the grep now returns 0 matches. (Same fix as 24-01 deviation #3.)
- **Files modified:** src/health/admin.mjs
- **Commit:** 053ffa7

None other — plan executed as written otherwise.

## Auth Gates

None — Phase 24 is local-only, no auth surface.

## Known Stubs

None. The catalog is a fully-wired pure transform over three real inputs (registry, relationship graph, outcome history). The admin reset/dispose/recover surface is fully wired end-to-end and verified by the content-hash isolation regression test. The `REUSABLE_WORKFLOW_MIN_CHAIN=5` floor and the `LONG_UNUSED_WINDOW_MS=3*HALF_LIFE_MS` window are inlined in `catalog.mjs` with the explicit note they move to Plan 24-04's `thresholds.mjs` (POLICY_VERSION='health-policy-v1') in Wave 4 — this is the versioned, canary-guarded activation path the plan specifies, not a stub. Per-capability `reusable_workflow` is the W5-deferred conservative baseline; cross-capability route_id-correlation mining is explicitly deferred per 24-CONTEXT.md `<deferred>`.

## Threat Flags

None. The threat register in the plan is fully mitigated by the shipped code:

- T-24-12 (Tampering, admin.reset/dispose/recover mutating authoritative state): D-5 + W3 — admin.mjs imports only node:fs/node:path + ./score.mjs; the content-hash regression test proves ALL FOUR protected artifacts are byte-identical after every admin command; the W3 import-gate test defends at the import level. Verified by the D-5 isolation test + phase-gate greps.
- T-24-13 (Tampering, catalog remedy auto-mutation): HLTH-10 — remedies are a frozen REMEDIES allowlist of advisory strings; the catalog is a pure transform that never writes anywhere. Verified by the REMEDIES allowlist test + the pure-transform test.
- T-24-14 (Repudiation, catalog long_unused on a rare capability): D-1 — sample_count < MINIMUM_SAMPLES → 'unjudged', never long_unused/ineffective (HLTH-07). Verified by two dedicated unjudged-protection tests.
- T-24-15 (Information Disclosure, catalog reading relationship evidence): the catalog reads derived edges (capability_id pairs + confidence_basis_points), not raw prompt content; HLTH-01 holds. Verified by the D-6 no-bare-outcome test.
- T-24-16 (Denial of Service, admin.recover on a corrupt outcomes.jsonl): recover rebuilds from outcomes via score.scoreCapability which skips corrupt lines (Plan 24-01 store invariant); a missing/corrupt outcomes file yields an empty state. Verified by the fail-open recover test.
- T-24-SC (Tampering, npm/pip/cargo installs): Phase 24 installs zero external packages (stdlib only). Verified by HLTH-02 grep.

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`), so the per-plan RED/GREEN/REFACTOR gate does not apply. Both tasks are marked `tdd="true"` at the task level; the test files were written alongside the implementation and all assertions pass against the shipped code (GREEN). No separate RED commit was made because the implementation and tests were authored together in the same session — consistent with the Plan 24-01 and 24-02 convention.

## Self-Check: PASSED

- Created files exist:
  - FOUND: src/health/catalog.mjs
  - FOUND: tests/router.health.catalog.test.mjs
  - FOUND: tests/router.health.admin.test.mjs
- Modified files exist:
  - FOUND: src/health/admin.mjs (extended with reset/dispose/recover + disposed flag in inspect)
  - FOUND: src/cli/router-control.mjs (reset/dispose/recover stubs replaced with real delegation)
- Commits exist:
  - FOUND: f51b9c6 (Task 1 — health observation catalog, HLTH-08/09/10)
  - FOUND: 053ffa7 (Task 2 — admin reset/dispose/recover + content-hash isolation gate, HLTH-05)
- All 108 tests green across the seven health test files.
- All phase-gate invariant commands (D-5, W3, HLTH-02) return 0 matches.
- Regression suites (router.control-cli, router.router-control-canary) — 22/22 green.