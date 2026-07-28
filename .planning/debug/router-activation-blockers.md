---
slug: router-activation-blockers
status: resolved
trigger: |
  Router never activates — active.json/compiled index never published, candidate
  quarantined or stuck at verification_non_passing. Two verified blockers.
created: 2026-07-23
updated: 2026-07-23
tdd_mode: false
---

# Debug: Router activation blocked by two independent blockers

## Symptoms
- **Expected:** `~/.claude/router` watcher reconciles candidate → eligible → 8-gate verify passing → bootstrap activator publishes compiled index → `active.json`/compiled tuple populated → router active.
- **Actual:** Candidate quarantined (7× `hook_orphan_binding` dispatch-blocking) after hours of watcher uptime; fresh restart flips to eligible but then fails at `verification_non_passing`. Activation never completes.
- **Errors:** `candidate/registry.json` disposition flips eligible↔quarantined; status `reason=verification_non_passing`; 7× `hook_orphan_binding` (dispatch-blocking) for gsd hook bindings.
- **Timeline:** Persisted across restarts. Reproduced 2026-07-23. 3 duplicate wedged watchers found + killed; fresh single watcher reproduces both blockers cleanly.
- **Reproduction:** Run watcher → wait hours → candidate quarantined (blocker 1). Fresh watcher → candidate eligible → verify `non_passing` (blocker 2).

## Root Cause (verified, two independent blockers)

### Blocker 1 — incremental drift → quarantined
`src/registry/watcher.mjs:352` `let baseline = acquireRegistry(...)` is module-scope, frozen at process start, NEVER re-acquired. Each reconcile does `refreshIncrementalAcquisition(frozen_baseline, diff)`. Hours of `~/.claude` churn (30612 diff events observed) accumulate drift in the incremental candidate → hook observations corrupted → bindings lose file pairing → `existsSync` on stale target_ref → `hook_orphan_binding` (dispatch-blocking) → quarantined.
**Proven:** fresh `acquireRegistry` (full rebuild) = eligible, 0 blocking. Replicated watcher's exact flow offline = eligible. Live watcher = quarantined. The 4 hook files (`gsd-config-reload.js`, `gsd-context-monitor.js`, `gsd-prompt-guard.js`, `gsd-check-update.js`) all EXIST at `~/.claude/hooks/`. `hook-reconcile.mjs:102-119`: binding with no file obs + `existsSync(join(runtimeRoot,target_ref))` true → advisory; false → blocking orphan. Live watcher sees false due to drift.
**Fix direction:** re-acquire the registry baseline periodically or when drift detected (scan-state has `clean_scan_required` flag — fingerprint load returns it; the reconciler registry baseline at :352 currently ignores it). Bound the incremental accumulation.

### Blocker 2 — production verify gates cannot pass (structural)
`src/registry/validate.mjs` `PRODUCTION_GATE_RUNNERS`: 5 of 8 gates spawn subprocesses with `cwd: ROOT` where `ROOT = ../..` of validate.mjs = `~/.claude/router` in production:
- `calibration_quality` → `node router.calibrate.mjs`
- `regression_suite` → `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-reconcile.test.mjs tests/router.route-targets.test.mjs tests/router.registry-map.test.mjs`
- `privacy` → `node --test tests/router.privacy.test.mjs`
- `latency` → `node --test tests/router.perf-evolved.test.mjs`
- `token_budget` → `node --test tests/router-graphify-integration.test.mjs tests/router.inject.test.mjs`
Installer (`src/lifecycle/router-lifecycle.mjs` moduleNames ~346-364) deploys `modules/` only — NOT `tests/` or `router.calibrate.mjs`. All 11 fixtures exist in dev repo `/Users/guilherme/Desktop/ClaudeCode/Router-build` but absent from `~/.claude/router`. → subprocess ENOENT → `disposition:'non_passing'` → activation skipped at `watcher.mjs:539` (`verification_non_passing`).
**Production-confirmed 2026-07-23 ~16:52:** fresh watcher (pid 36161) → candidate eligible → status `reason=verification_non_passing actstatus=preserved`.
**Fix direction:** deploy the 11 gate fixtures to ownedRoot via installer `moduleNames` AND ensure they pass with `cwd=HOME=ownedRoot` env (validate.mjs `subprocess` sets `env:{HOME: ROOT}`). Tests likely import dev-layout paths (`../src/...` or `../../src/...`) — ownedRoot has `modules/` not `src/`, so imports may break. Verify; possibly adjust `validate.mjs` ROOT/args, or bundle a self-contained fixture set, or make gate runners path-agnostic. Reconsider whether full subprocess verify belongs in the always-on watcher.

## Current Focus
- hypothesis: Registry-BUILD mapping-metadata gap. mapCandidateRegistry (src/registry/map.mjs) derives dispatch subjects ONLY from per-record `mapping` fields (explicit_subjects/declared_subjects/aliases/identity_subjects/subjects). 0 of 257 live records carry `mapping`; controller config has `mappings=null, mapping_policy=null`; config.mappings feeds the mapper's 'inheritance' tier (wrong tier for fresh explicit routes). mode-map.json (~/.claude/router/mode-map.json, 27 entries) IS the router's brain but is NOT wired into the build. Result: subjectIds empty → subjects:[] → publishIndex ORC-01 throw → rollback → activation_status=preserved.
- next_action: |
  Implement option (a): populate record `mapping.explicit_subjects` during
  assembleRegistry by reading mode-map.json (opt-in via options.modeMapPath).
  Wire config.mode_map_path in router-lifecycle.mjs controllerConfig. Pass it
  through the watcher's assemble(next, {modeMapPath}) call. This keeps the
  mapper's per-record contract unchanged (cleanest data flow), uses mode-map.json
  as the single source of truth, and produces ≥14 dispatch routes (slash entries
  matching skill names) + 3 agent routes → publishIndex succeeds.
- reasoning_checkpoint: |
  hypothesis: Records lack mapping metadata because the build step never stamps
  any; mode-map.json is the source-of-truth for workflow→target routing but is
  not consumed at build time. Stamping records from mode-map.json at assemble
  time seeds the mapper's explicit tier → publishIndex gets routes.
  confirming_evidence:
    - 0 of 257 live records carry a `mapping` field (verified on candidate/registry.json)
    - mapCandidateRegistry builds subjectIds ONLY from record mapping.{explicit,identity,subjects} — empty → subjects:[]
    - publishIndex line 77 throws ORC-01 on empty routes → bootstrap rollback → preserved
    - adapter (claude.mjs:376) passes through artifact `mapping` but no artifact carries one; test-mode-seam fixtures are the only ones that set mapping
    - mode-map.json has 27 entries; 14 entry.ids match a skill record name, 3 agent entries match via recommended_agents[0] → 17 resolvable routes
    - config.mappings feeds mapper 'inheritance' tier (requires stable_identity match or authoritative lifecycle event) — wrong tier, cannot produce fresh explicit routes
  falsification_test: After stamping, run mapCandidateRegistry on the built registry;
  if subjects:[].summary.mapped still 0, the stamping is not reaching the mapper's
  explicit tier. If publishIndex still throws ORC-01, routes are not being built
  from mapped subjects (safety check may reject all targets).
  fix_rationale: Option (a) matches the existing architecture — the mapper's contract
  stays per-record (already clean), mode-map.json becomes the single build-time
  source of truth, no new mapper tier or config-mapping shape needed. Option (b)
  (wire mode-map into config.mappings) would require teaching the mapper a new
  tier/shape since existingMappings is inheritance-only — more surface, more coupling.
  blind_spots: |
    Have not verified the 17 resolvable records are all dispatchable+ready+lifecycle
    safe (safety() may reject some, but ORC-01 only needs ≥1). Have not measured
    mode-map.json read latency in the <100ms... actually assembleRegistry runs in
    the watcher reconcile (not the hook), so the <100ms hook budget is irrelevant.
  candidate_causes:
    - code: assembleRegistry never stamps mapping from any source (PRIMARY)
    - config: controller config has no mode_map_path, so even if stamping existed it wouldn't be invoked (contributor — fixed alongside)
  and_gate: "no — single cause: the build step has no mapping source wired in. mode-map.json exists but is orphaned from the build."

## Evidence
- 2026-07-23: 3 duplicate watchers on identical config (PIDs 2856, 23605, 33468), 2 wedged at 100% CPU. Killed 23605+33468, kept 2856.
- 2026-07-23: 2856 quarantined with 7× hook_orphan_binding. Fresh offline full build = eligible, 0 blocking.
- 2026-07-23: Replicated exact watcher flow (incremental, real 30612-event diff, persisted baseline) offline = eligible. Live = quarantined. → drift from frozen baseline, not data.
- 2026-07-23: Killed 2856, launched fresh watcher 36161 → candidate eligible, status reason=verification_non_passing. Blocker 2 confirmed active.
- 2026-07-23: `~/.claude/router/` has no `tests/` dir, no `router.calibrate.mjs`. Dev repo has all 11 fixtures. Installer moduleNames deploys modules/ only.

## Files likely touched
- src/registry/watcher.mjs (blocker 1: re-acquire baseline)
- src/registry/validate.mjs (blocker 2: gate runner paths, possibly)
- src/lifecycle/router-lifecycle.mjs (blocker 2: deploy fixtures via moduleNames)
- tests/* or a fixture bundle (blocker 2: make self-contained)
- src/registry/build.mjs (blocker 1: clean_scan_required handling, if needed)
## Resolution 2026-07-23 (session 2)

### Blockers 1 + 2 + bootstrap crash — FIXED, committed, deployed
- Commit cd099a3: blocker-1 baseline re-acquire (watcher.mjs), blocker-2a HOME env (validate.mjs), blocker-2b deploy gate fixtures + src/ mirror (router-lifecycle.mjs), plus a regression fix the session-1 plan did NOT predict.
- Regression: blocker-2b made verification gates pass on an empty fixture → bootstrap path reached publishIndex → ORC-01 zero-route throw → uncaught → controller crashed before `ready` (11 lifecycle/installer tests). Fix: wrap bootstrap publish in try/catch + new `rollbackActivation` (activate.mjs) reverts active pointer + orphan version → `activation_status=preserved reason=bootstrap_publish_failed`, controller reaches ready. Unit bootstrap tests stub publishCompiledIndex → unaffected.
- Test 1 owned-manifest count updated 67→149 (new fixture + src/ mirror deploy set).
- Full suite: 720 pass / 0 fail / 3 skipped.
- Commit 55c92c0: installer readinessTimeoutMs 5s→60s (production first-reconcile ~30s: full scan + 10 gate fixtures).

### Deployed state (live ~/.claude/router)
- Deployed code has rollback fix (verified grep). Gate fixtures + router.calibrate.mjs + calibration-tasks.json + src/ mirror deployed.
- Watcher pid 51629, state=ready, gates pass, no crash.
- BUT activation_status=preserved reason=bootstrap_publish_failed — NO compiled index published.

### NEW root cause (the actual remaining blocker — NOT in session-1 plan)
0 of 257 candidate records carry a `mapping` field; all have canonical_identity=null, no explicit_subjects/declared_subjects/aliases. mapCandidateRegistry derives subjects from record mapping metadata → subjects:[] → publishIndex zero-route throw → rollback. mode-map.json exists (~/.claude/router/mode-map.json, 13.6KB) but is NOT wired into controller/config.json (mappings=null, mapping_policy=null). This is a registry-BUILD gap (records not populated with mapping metadata), separate from the watcher/validate/lifecycle blockers. See memory router-activation-mapping-metadata-gap.md.

### Next session
Decide + implement mapping source: (a) populate record `mapping` metadata during build, or (b) wire mode-map.json into controller config as the mapping the mapper consumes. Until then activation cannot complete.

## Resolution 2026-07-23 (session 3)

- Implemented option (a): registry assembly stamps `mapping.explicit_subjects`
  from `mode-map.json`, unions artifact-owned mappings, and adds matching
  orchestrator workflow declarations.
- Wired both mapping sources through controller config, watcher candidate
  assembly, and incremental/full equivalence verification.
- Raised only the release-tuple registry sibling bound to 1 MiB; compact index
  and other sibling bounds remain unchanged.
- Fixed installer readiness to verify immutable deployment inputs while allowing
  the running controller to replace mutable candidate/report seed files.
- Live verification: watcher PID 86360 is `ready`;
  `activation_status=activated`; candidate has 257 records, 22 mapped records,
  and 22 unique subjects; active registry is `v1-cad95094eafac13e`;
  verified tuple is `t1-08aed08ac8e821a1`; tuple verification is complete and
  passing.
