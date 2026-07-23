---
phase: 18-autonomous-lifecycle-and-release-gates
verified: 2026-07-17T13:05:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 0/4
  gaps_closed:
    - "Gap 1: lifecycle E2E drives the installed watcher→controller→publishCompiledIndex seam via the opt-in test_mode seam; fixture-side publishCompiledIndex removed (tests/router.autonomous-lifecycle.test.mjs)."
    - "Gap 2: full D-04/D-05/D-06 recovery matrix through installed watcher/controller with boundary injection and continued-advancement proof (tests/router.lifecycle-recovery.test.mjs)."
    - "Gap 3: five-verb coexistence matrix (install/upgrade/reinstall/disable+enable/uninstall) independently and together with unrelated-state preservation, binding restoration, together-mode isolation, and post-pointer crash sampling (tests/router.installer-coexistence.test.mjs)."
    - "Gap 4: release runner gate_results parsed from real child TAP/RELEASE_METRICS stdout; flaky D-13/D-16 latency test isolated via dedicated subprocess; full workspace regression 647/647."
  gaps_remaining: []
  regressions: []
---

# Phase 18: Autonomous Lifecycle and Release Gates Verification Report

**Phase Goal:** Users can add, change, disable, move, or remove Claude and Codex capabilities and receive safe automatic propagation across both Claude and Codex runtimes without user action.
**Verified:** 2026-07-17T13:05:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 18-04 and 18-05 executed to close gaps 1–4 from the prior 18-VERIFICATION.md)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                                                                          | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1   | Safe add, edit, rename, move, disable, dependency-change, and delete events propagate across temporary Claude and Codex homes without user action.                                                                                            | ✓ VERIFIED | `tests/router.autonomous-lifecycle.test.mjs` no longer imports `publishCompiledIndex` (grep returns 0). It installs the router with `testMode:true + verificationRunners + inProcessControllerLauncher` (line 52-53), mutates real files, polls `tupleId(ownedRoot)` until the active tuple advances (lines 100-103), and asserts `routeContextPrompt` resolves the controller-published tuple with matching scope/invocation/dispatch semantics for each of add/edit/rename/move/dependency-change/delete; for `disable` it asserts the candidate is quarantined, the tuple does NOT advance, and `routeContextPrompt` still resolves the prior verified tuple (lines 83-96). All 14 cells (7 ops × 2 runtimes) are exercised and the "all fourteen runtime-operation cells are exercised" test passes. The opt-in seam is wired through `src/registry/activate.mjs` trusted() (lines 79-90), `src/registry/watcher.mjs` runRegistryWatcher (lines 194-196), and `src/lifecycle/router-lifecycle.mjs` installRouter. Focused suite: 66/66 pass. |
| 2   | Unsafe candidates, controller crashes, corrupt indexes, and missed events preserve or recover a verified last-known-good active version.                                                                                                    | ✓ VERIFIED | `tests/router.lifecycle-recovery.test.mjs` covers the full D-04/D-05/D-06 matrix: 2 retained unit baselines + D-05 reader sampling at publication boundaries + D-04 unsafe candidate + D-04 corrupt registry/index/manifest/hash (4 parameterized `CORRUPTION_VARIANTS`) + D-04 controller interruption + D-04 missed/coalesced events + D-06 startup repair + D-06 steady-state failure. Every scenario ends with a later valid mutation that advances `tuple_version_id` to a strictly newer value observed by both `loadCompiledIndex` and `routeContextPrompt`. D-05 reader sampling at `before-active-pointer` and `after-active-pointer` boundaries asserts every sample resolves the complete old-or-new tuple, never mixed/partial (lines 103-135). All scenarios use the installed watcher/controller via the opt-in `test_mode` seam (line 56). Focused suite: 66/66 pass.                                                          |
| 3   | Install, upgrade, reinstall, disable, and uninstall preserve unrelated Claude and Codex settings, hooks, and plugins.                                                                                                                          | ✓ VERIFIED | `tests/router.installer-coexistence.test.mjs` exercises all five verbs as independent tests (install/upgrade/reinstall/disable+enable/uninstall at lines 175/197/220/261/289) plus a together-mode isolation test (line 317) and three post-pointer crash-sampling tests (lines 369/390/412). Each verb asserts unrelated files (claude plugins/skills/user-notes, codex config/skills/user-config) are byte-identical pre/post via `assertUnrelatedUnchanged`; non-router Stop hook (`user-hook`) is preserved across disable/enable/uninstall (`nonRouterHooksPreserved`); after uninstall, settings.json is byte-identical to the pre-install snapshot. Together-mode test asserts Claude and Codex owned roots remain independent across all five verbs. Three fixture variants (claude/codex/together) covered. Focused suite: 66/66 pass.                                                         |
| 4   | The full release matrix ties every v1.2 requirement to executable evidence and passes regression, calibration, privacy, coexistence, recovery, latency, and token gates.                                                                       | ✓ VERIFIED | `release/v1.2-matrix.json` lists all 20 v1.2 requirement IDs (REG-01/02/03, ADP-01/02, CHG-01/02, SAF-09/10, MAP-01/02, ACT-01, CTX-01/02, ORC-01/02, TOK-01/02, EVO-05, REL-01), each with a primary owner in phases 11–17 and a `phase-18-cross-cutting` secondary evidence entry. `src/release/run-release.mjs` `parseChildEvidence` (lines 101-127) parses real TAP pass/fail counts and `RELEASE_METRICS` JSON from child stdout — no synthesized `gate_ids.map` pass entries (grep returns 0). Fail-closed reason codes: `child-error`, `skipped`, `no-tap-summary`, `tap-fail`, `metrics-missing`. `node src/release/run-release.mjs` exits 0 with all 7 stages passing (`regression, calibration, privacy, coexistence, recovery, context-token, latency`). The published `release/v1.2-report.json` carries real latency measurements (`warm_p95_ms: 14.97, max_route_ms: 20.01`) — not synthesized. Full workspace `node --test tests/*.test.mjs`: 647 pass, 0 fail.                                                              |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Gap-Closure Re-Verification

| Gap | Original Failure | Closure Evidence | Status |
|-----|------------------|------------------|--------|
| Gap 1 | `tests/router.autonomous-lifecycle.test.mjs:65-74` manually called `publishCompiledIndex` for every safe event. | `grep -c "publishCompiledIndex\|publish-index" tests/router.autonomous-lifecycle.test.mjs` → 0. Test now polls `tupleId(ownedRoot)` (active.json advanced by the production `publishCompiledIndex` call inside `createRegistryReconciler`) and asserts `routeContextPrompt` reads the controller-published tuple. | ✓ CLOSED |
| Gap 2 | Recovery suite had only 2 direct publisher/loader tests; D-04/D-05/D-06 matrix absent. | `grep -cE "D-04\|D-05\|D-06" tests/router.lifecycle-recovery.test.mjs` → 14. Suite now has 12 tests covering unsafe candidate, 4 corrupt-payload variants, controller interruption, missed/coalesced events, reader sampling at publication boundaries, startup repair, and steady-state failure — all through the installed watcher/controller. | ✓ CLOSED |
| Gap 3 | Coexistence suite covered only upgrade, disable/enable, and one pre-pointer failure; declared matrix absent. | `grep -cE "install verb\|upgrade verb\|reinstall verb\|disable\+enable verb\|uninstall verb" tests/router.installer-coexistence.test.mjs` → 7. Suite now has 15 tests: 5 independent verbs + 1 together-mode isolation + 3 post-pointer crash sampling + 3 fixture-variant coverage + 3 retained existing. Every verb asserts byte-identical unrelated-state preservation. | ✓ CLOSED |
| Gap 4 | `run-release.mjs` synthesized `gate_results` from exit-code 0; full workspace 606/607 with one flaky latency test. | `grep -c "gate_ids.map" src/release/run-release.mjs` → 0. `parseChildEvidence` parses real TAP/RELEASE_METRICS with explicit fail-closed reason codes. The flaky D-13/D-16 latency test spawns a dedicated subprocess (`tests/helpers/latency-isolated.mjs`) and asserts `<25ms`/`<100ms` only under `ROUTER_RELEASE_STAGE=latency`. Full workspace: 647 pass, 0 fail. | ✓ CLOSED |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lifecycle/router-lifecycle.mjs` | installRouter threads `testMode`/`verificationRunners` into the controller config (default-off) | ✓ VERIFIED | 592 lines. installRouter accepts `options.testMode` and `options.verificationRunners`; writes `test_mode`/`verification_runners` into controllerConfig only when testMode===true; strips `verification_runners` before serialize/fingerprint. |
| `src/registry/watcher.mjs` | runRegistryWatcher swaps in `createTestActivationVerifier` when `test_mode===true`; threads `test_mode` into the activator call | ✓ VERIFIED | 381 lines. Lines 194-196: `createRegistryReconciler(config, config.test_mode === true ? { produceActivationVerification: createTestActivationVerifier(config.verification_runners \|\| {}) } : {})`. Line 336: activator call passes `test_mode: config.test_mode === true`. |
| `src/registry/activate.mjs` | `trusted()` accepts `test_only:true` ONLY when `options.test_mode===true`; `verifyVersion`/`replaceActivePointer` thread `test_mode` | ✓ VERIFIED | 249 lines. Lines 86-90: `test_only === true` accepted only when `options.test_mode === true`. `writeImmutableVersion`/`verifyVersion`/`replaceActivePointer`/`recoverActiveVersion` all thread `test_mode` (defaults to false). |
| `src/release/run-release.mjs` | `parseChildEvidence` parses real TAP/RELEASE_METRICS; no synthesized pass entries | ✓ VERIFIED | 256 lines. Lines 101-127. `grep -c "gate_ids.map" src/release/run-release.mjs` → 0. Latency stage maps `warm_p95_ms`→`warm-p95` and `max_route_ms`→`hard-route-ceiling` with threshold checks. |
| `tests/router.test-mode-seam.test.mjs` | Production-default regression + opt-in integration via the real seam | ✓ VERIFIED | 109 lines. 3 tests pin production-default rejection of `test_only:true`, opt-in publication via the real seam (no `publishCompiledIndex` import), and a static-invariant test that the test file does not import the publisher. |
| `tests/router.autonomous-lifecycle.test.mjs` | Real seven-event × two-runtime E2E via the installed seam | ✓ VERIFIED | 141 lines. No `publishCompiledIndex` import. Uses `testMode + inProcessControllerLauncher`. All 14 cells exercised and asserted. |
| `tests/router.lifecycle-recovery.test.mjs` | Complete D-04/D-05/D-06 matrix via installed watcher/controller | ✓ VERIFIED | 380 lines. 12 tests covering all D-04/D-05/D-06 classes with continued-advancement proof. |
| `tests/router.installer-coexistence.test.mjs` | Five-verb coexistence matrix across Claude/Codex/together fixtures | ✓ VERIFIED | 471 lines. 15 tests: 5 independent verbs + together-mode + 3 crash sampling + 3 fixture-variant coverage + 3 retained existing. |
| `tests/router.coexistence.test.mjs` | Sentinel-distinctness assertions across the five verbs | ✓ VERIFIED (with caveat) | 144 lines. 5 sentinel-distinctness tests re-import the real hook and re-assert the SENTINEL export (see WR-05 caveat below — these are proxy tests; actual verb execution is in installer-coexistence). |
| `tests/router.v12-release.test.mjs` | Asserts `parseChildEvidence` parses real TAP/RELEASE_METRICS and fails closed | ✓ VERIFIED | 226 lines. 9 new `parseChildEvidence` tests covering pass, tap-fail, no-tap-summary, metrics-missing, threshold breach, child-error, skipped, and `runRelease` fail-closed propagation. |
| `tests/router.compiled-evolution.test.mjs` | D-13/D-16 latency test isolated from concurrent workspace load | ✓ VERIFIED | 237 lines. D-13/D-16 test spawns `tests/helpers/latency-isolated.mjs` via `spawnSync` (line 195). Strict `<25ms`/`<100ms` thresholds asserted only under `ROUTER_RELEASE_STAGE=latency` (line 213). |
| `tests/helpers/test-mode-seam.mjs` | `stubVerificationRunners` + `inProcessControllerLauncher` | ✓ VERIFIED | 72 lines. `kill()` returns the controller close promise so callers can `await` it. |
| `tests/helpers/latency-isolated.mjs` | Dedicated subprocess for isolated latency measurement | ✓ VERIFIED | 94 lines. Builds the calibration route and runs `measureRoutes` in isolation; prints JSON to stdout. |
| `release/v1.2-matrix.json` | Exact 20-row unique-primary inventory | ✓ VERIFIED | 32 lines. All 20 requirement IDs present exactly once with inherited primary ownership (phases 11–17). |
| `release/v1.2-report.json` | Deterministic, tamper-evident release report | ✓ VERIFIED | Published by `run-release.mjs`. Real latency measurements: `warm_p95_ms: 14.97, max_route_ms: 20.01`. All 7 stages pass. |
| `src/prompt/publish-index.mjs` | Immutable registry/index tuple publication | ✓ VERIFIED | Pre-existing artifact still present (6199 bytes). Used by `createRegistryReconciler` (watcher.mjs line 338). |
| `src/prompt/compile-index.mjs` | Public compiled-index reader | ✓ VERIFIED | Pre-existing artifact still present (9373 bytes). Used by `loadCompiledIndex` in tests. |
| `src/context/prompt-route.mjs` | Public route reader | ✓ VERIFIED | Pre-existing artifact still present (7746 bytes). Used by `routeContextPrompt` in tests. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `tests/router.autonomous-lifecycle.test.mjs` | `src/context/prompt-route.mjs` | `routeContextPrompt` reading the controller-published tuple | WIRED | Each safe scenario calls `routeContextPrompt` and asserts `routed.compiled?.tuple_version_id` equals the controller-published tuple id. No direct `publishCompiledIndex` import. |
| `tests/router.lifecycle-recovery.test.mjs` | `src/registry/watcher.mjs` | `installRouter` + `restartController` driving the installed watcher/controller | WIRED | `installSeam` helper uses `testMode + inProcessControllerLauncher`; recovery scenarios call `restartController` after crashes. |
| `tests/router.installer-coexistence.test.mjs` | `src/lifecycle/router-lifecycle.mjs` | `installRouter`, `upgradeRouter`, `disableRouter`, `enableRouter`, `uninstallRouter`, `resolveInstallGeneration` | WIRED | All five verbs are invoked in independent tests + together-mode + crash sampling. |
| `src/release/run-release.mjs` | child test stdout | TAP `# pass N` / `# fail M` lines plus `RELEASE_METRICS {json}` | WIRED | `parseChildEvidence` parses stdout via regex; `executeChild` passes parsed `gate_results` to `assertStageResult`. |
| `tests/router.test-mode-seam.test.mjs` | `src/registry/activate.mjs` | production-default `trusted()` rejects `test_only:true`; opt-in `test_mode:true` accepts it | WIRED | Both assertions present in the seam test. |
| `src/registry/watcher.mjs` | `src/prompt/publish-index.mjs` | `publishCompiledIndex` called after activation succeeds | WIRED | Pre-existing wiring (line 338) untouched by gap closure. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `tests/router.autonomous-lifecycle.test.mjs` | `tupleId(ownedRoot)` (active.json) | `createRegistryReconciler` calls `publishCompiledIndex` after `activateCandidate` | Yes — real filesystem write to `release-tuples/active.json` by the production publisher | ✓ FLOWING |
| `tests/router.lifecycle-recovery.test.mjs` | `tupleId(ownedRoot)`, `loadCompiledIndex`, `routeContextPrompt` | Controller publishes via the real seam; readers sample at publication boundaries | Yes — real tuples, real readers, real fallback to `known_good` on corruption | ✓ FLOWING |
| `tests/router.installer-coexistence.test.mjs` | `readFileSync(f.settingsPath)`, `resolveInstallGeneration(f)` | installRouter/upgradeRouter/uninstallRouter write the real settings.json and `install-state/active.json` | Yes — real installer mutations, real generation pointers, byte-identical snapshots | ✓ FLOWING |
| `src/release/run-release.mjs` | `result.gate_results`, `result.measurements` | `parseChildEvidence` extracts TAP summary and `RELEASE_METRICS` from child stdout | Yes — release report shows `warm_p95_ms: 14.97, max_route_ms: 20.01` (real measured values, not constants) | ✓ FLOWING |
| `tests/router.compiled-evolution.test.mjs` (D-13/D-16) | `measured.warm.p95_ms` | `spawnSync` of `tests/helpers/latency-isolated.mjs` which runs `measureRoutes` in isolation | Yes — real latency measurement in a dedicated subprocess | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Gap 1+2+3 focused suites (lifecycle, recovery, coexistence, seam, v12-release) | `node --test tests/router.test-mode-seam.test.mjs tests/router.autonomous-lifecycle.test.mjs tests/router.lifecycle-recovery.test.mjs tests/router.installer-coexistence.test.mjs tests/router.coexistence.test.mjs tests/router.v12-release.test.mjs` | 66 tests, 66 pass, 0 fail | ✓ PASS |
| Release runner (7 sequential gates) | `node src/release/run-release.mjs` | exit 0; `{"status":"passed","stages":["regression","calibration","privacy","coexistence","recovery","context-token","latency"]}` | ✓ PASS |
| Full workspace regression | `node --test tests/*.test.mjs` | 647 tests, 647 pass, 0 fail, 0 skipped | ✓ PASS |
| Release report contains real latency measurements | `grep warm_p95_ms release/v1.2-report.json` | `warm_p95_ms: 14.97` and `max_route_ms: 20.01` (both under threshold, not synthesized constants) | ✓ PASS |
| Opt-in seam is default-off | `grep -c "test_mode" src/registry/activate.mjs` | positive count; `trusted()` rejects `test_only:true` unless `test_mode===true` (lines 86-90) | ✓ PASS |
| No fixture-side publication in lifecycle test | `grep -c "publishCompiledIndex\|publish-index" tests/router.autonomous-lifecycle.test.mjs` | 0 | ✓ PASS |
| No synthesized gate_results | `grep -c "gate_ids.map" src/release/run-release.mjs` | 0 | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| Release runner | `node src/release/run-release.mjs` | exit 0; all 7 stages passed with parsed TAP/RELEASE_METRICS evidence | PASS |
| Full workspace | `node --test tests/*.test.mjs` | 647 pass, 0 fail | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REG-01 | 18-04 (secondary), matrix primary phase 11 | One canonical schema | ✓ SATISFIED | `tests/router.autonomous-lifecycle.test.mjs` asserts `{ schema_version, records }` matches `buildFullRegistry` output; matrix primary `tests/router.registry-schema.test.mjs` is in the regression stage. |
| REG-02 | 18-04 (secondary), matrix primary phase 11 | Full rebuild discovery | ✓ SATISFIED | Matrix primary `tests/router.registry-build.test.mjs tests/router.adapters.test.mjs` in regression stage; release runner passes. |
| REG-03 | 18-04 (secondary), matrix primary phase 12 | Incremental/full equivalence | ✓ SATISFIED | `tests/router.autonomous-lifecycle.test.mjs` line 105-106 asserts canonical registry bytes match `buildFullRegistry` output after every safe event. |
| ADP-01 | matrix primary phase 11 | Claude adapter | ✓ SATISFIED | Matrix primary in regression stage; release runner passes. |
| ADP-02 | matrix primary phase 11 | Codex adapter | ✓ SATISFIED | Matrix primary in regression stage; release runner passes. |
| CHG-01 | 18-04 (secondary), matrix primary phase 12 | Change classification | ✓ SATISFIED | `tests/router.autonomous-lifecycle.test.mjs` exercises add/edit/rename/move/disable/dependency-change/delete. |
| CHG-02 | 18-04 (secondary), matrix primary phase 12 | Watcher deadlines | ✓ SATISFIED | `tests/router.lifecycle-recovery.test.mjs` D-04 controller-interruption and D-06 steady-state scenarios prove missed events are repaired within the restart window. |
| SAF-09 | 18-04 + 18-05 (secondary), matrix primary phase 13 | Missing/deleted targets | ✓ SATISFIED | `tests/router.autonomous-lifecycle.test.mjs` disable + delete scenarios assert quarantined disposition and prior tuple preservation; `tests/router.lifecycle-recovery.test.mjs` D-04 unsafe candidate scenario. |
| SAF-10 | 18-05 (secondary), matrix primary phase 13 | Hook reconciliation | ✓ SATISFIED | `tests/router.installer-coexistence.test.mjs` non-router Stop hook preservation across all five verbs. |
| MAP-01 | 18-04 (secondary), matrix primary phase 14 | Deterministic mapping | ✓ SATISFIED | `tests/router.autonomous-lifecycle.test.mjs` asserts `alphaRoute.invocation.command === 'alpha'` and `scope.kind === 'global'` from the controller-published tuple. |
| MAP-02 | 18-04 + 18-05 (secondary), matrix primary phase 13 | Quarantine | ✓ SATISFIED | `tests/router.autonomous-lifecycle.test.mjs` disable scenario asserts `candidate.disposition === 'quarantined'`; `tests/router.lifecycle-recovery.test.mjs` D-04 unsafe candidate asserts tuple unchanged. |
| ACT-01 | 18-04 + 18-05 (secondary), matrix primary phase 14 | Atomic activation + rollback | ✓ SATISFIED | `tests/router.lifecycle-recovery.test.mjs` D-04/D-05/D-06 scenarios assert tuple advancement via the real activation seam. |
| CTX-01 | matrix primary phase 15 | Context capsule privacy | ✓ SATISFIED | Matrix primary `tests/router.context-capsule.test.mjs` in context-token stage; release runner passes. |
| CTX-02 | matrix primary phase 15 | Minimal resume | ✓ SATISFIED | Matrix primary `tests/router.context-resume.test.mjs tests/router.context-prompt-integration.test.mjs` in context-token stage; release runner passes. |
| ORC-01 | matrix primary phase 16 | Workflow first | ✓ SATISFIED | Matrix primary `tests/router.workflow-orchestrator.test.mjs` in context-token stage; release runner passes. |
| ORC-02 | matrix primary phase 15 | Explicit override | ✓ SATISFIED | Matrix primary `tests/router.context-resume.test.mjs` in context-token stage; release runner passes. |
| TOK-01 | matrix primary phase 16 | Least sufficient context | ✓ SATISFIED | Matrix primary `tests/router.context-budget.test.mjs` in context-token stage; release runner passes. |
| TOK-02 | matrix primary phase 16 | Token budget | ✓ SATISFIED | Matrix primary `tests/router.token-budget.test.mjs tests/router.context-budget.test.mjs` in context-token stage; release runner passes. |
| EVO-05 | 18-04 (secondary), matrix primary phase 17 | Privacy-safe canary | ✓ SATISFIED | Matrix primary `tests/router.evolution-canary.test.mjs tests/router.compiled-evolution.test.mjs` in calibration stage; release runner passes. |
| REL-01 | 18-04 + 18-05 (secondary), matrix primary phase 17 | Warm p95 < 25ms, max < 100ms | ✓ SATISFIED | Latency stage runs `tests/router.compiled-evolution.test.mjs` under `ROUTER_RELEASE_STAGE=latency`; release report shows `warm_p95_ms: 14.97, max_route_ms: 20.01` (both under threshold). |

No orphaned requirements: REQUIREMENTS.md maps all 20 v1.2 IDs to primary phases 11–17 with Phase 18 as cross-cutting verification. The matrix's `phase-18-cross-cutting` secondary evidence entries cover all 20 IDs without duplicates.

### Anti-Patterns Found

No `TBD`, `FIXME`, or `XXX` markers in any Phase 18 production or test artifact. No `gate_ids.map` synthesis pattern remains. The test-mode seam is default-off and pinned by a regression test.

### Code Review Warnings (18-REVIEW.md) — Impact Assessment

The code review found 7 warnings, 3 infos, 0 blockers. Each was assessed for must-have impact:

| Warning | Description | Impact on must_haves | Verdict |
|---------|-------------|--------------------|---------|
| WR-01 | Test cleanup races — `holder.child.kill()` not awaited before `rmSync` in lifecycle/recovery/seam tests. | Tests pass; no must-have breaker. Latent hygiene issue. | Advisory — does not break a must-have. |
| WR-02 | Reinstall verb test leaks `reinstallHolder` on assertion failure. | Tests pass; latent leak only on assertion failure. | Advisory — does not break a must-have. |
| WR-03 | `previewRollback`/`executeRollback` don't accept `test_mode`. | Must-have #2 covers "preserve or recover a verified LKG tuple" via `recoverActiveVersion` (which does accept `test_mode`, line 190), not via explicit rollback. No test exercises rollback under test_mode. | Advisory — does not break a must-have. |
| WR-04 | Release runner skip detection marks entire stage as skipped when any single test has `# SKIP`. | Release runner passes (no `# SKIP` markers in current test suite); latent over-strict behavior. | Advisory — does not break a must-have for this release. Could fail future releases that legitimately skip platform-specific tests. |
| WR-05 | `tests/router.coexistence.test.mjs` sentinel-distinctness tests are proxy tests (re-import the hook module only). | Must-have #3 is met by `tests/router.installer-coexistence.test.mjs` which actually exercises all five verbs with byte-identical unrelated-state assertions. The proxy sentinel tests are an additional weaker check. | Advisory — does not break a must-have. The verb-execution evidence is in installer-coexistence. |
| WR-06 | `test-mode-seam.mjs` `kill()` can surface unhandled promise rejection. | Tests pass; latent issue only when `publish('stopped')` rejects. | Advisory — does not break a must-have. |
| WR-07 | `safeStopController` uses non-deterministic 20ms sleep. | Tests pass; non-deterministic timing is a fragility, not a must-have breaker. | Advisory — does not break a must-have. |
| IN-01/02/03 | Module-level mutable state, secondary-evidence circular check, hardcoded node path. | Informational only. | Advisory. |

None of the 7 warnings or 3 infos undermines a must-have or gap-closure claim. They are real hygiene concerns worth addressing in a follow-up cleanup phase, but Phase 18's goal — safe automatic propagation across both runtimes with full release authority — is observably achieved and behaviorally proven.

### Human Verification Required

None. All four must-haves are behaviorally verified by executable test evidence (66 focused tests + 7-stage release runner + 647/647 full workspace).

### Gaps Summary

No gaps remain. All four verification gaps from the prior `18-VERIFICATION.md` are closed:

- Gap 1 (lifecycle E2E seam): closed — fixture-side `publishCompiledIndex` removed; the installed controller publishes via the real seam through the opt-in `test_mode` seam.
- Gap 2 (recovery matrix): closed — full D-04/D-05/D-06 matrix through the installed watcher/controller with continued-advancement proof.
- Gap 3 (coexistence matrix): closed — five verbs independently and together with byte-identical unrelated-state preservation, binding restoration, together-mode isolation, and post-pointer crash sampling.
- Gap 4 (release evidence + flaky latency): closed — `parseChildEvidence` parses real TAP/RELEASE_METRICS; the D-13/D-16 latency test is isolated via a dedicated subprocess; full workspace 647/647 green.

The phase goal — safe automatic propagation of capability changes across both Claude and Codex runtimes without user action, tied to a full release authority — is achieved.

---

_Verified: 2026-07-17T13:05:00Z_
_Verifier: Claude (gsd-verifier)_