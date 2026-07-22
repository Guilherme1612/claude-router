# Phase 20: close-gap-evo-05-add-production-trigger-for-canary-controlle - Context

**Gathered:** 2026-07-21
**Status:** Ready for replan (20-02 only)

<domain>
## Phase Boundary

Close audit BLOCKER 2: wire the orphaned canary-controller library (src/evolution/{canary-controller,evidence,perf-measure}.mjs — complete and test-validated but imported only by tests, absent from the deployed bundle) into production via three trigger surfaces — telemetry→evidence bridge + persistent evidence store + deployed-bundle inclusion (Wave 1), watcher automatic canary trigger (Wave 2), CLI operator subcommands (Wave 3). Telemetry-driven canary promotion + automatic rollback becomes reachable from the background control plane. Requirement EVO-05.

The hot path (src/context/prompt-route.mjs routeContextPrompt → loadCompiledIndex) stays read-only; canary runs only in the watcher/controller background process and mutates publication authority exclusively through activate.mjs primitives (via canary-controller REGISTRY_PUBLICATION).

</domain>

<decisions>
## Implementation Decisions

This context was produced by a review of the existing 20-01/20-02/20-03 plans + RESEARCH.md + VALIDATION.md against the live codebase, not by gray-area Q&A. The plans were written 2026-07-17; line references were re-verified 2026-07-21 and remain exact (Phase 19 did not shift watcher.mjs — still 381 lines, eligible+recoveryReady branch at 328, activator call at 336, createTestRegistryReconciler at 367).

### Plan validation verdict
- **D-01 [informational]:** 20-01 (telemetry-bridge + persistent evidence store + bundle inclusion) is execution-ready as written. All exports/lines verified: evidence.mjs FIELDS(4)/CONFIDENCE_BANDS(9)/FIXTURE_CLASSES(10)/VERDICTS(11)/PRIVACY_GUARDS(12)/HALF_LIFE_MS(15)/MAX_RETENTION_MS(16)/MINIMUM_SAMPLES(17)/validateEvidenceEnvelope(27)/evidenceWindowFingerprint(60)/createEvidenceStore(93); canary-controller proposeCandidate(54)/evaluateCandidate(91)/applyCanaryDecision(148)/REQUIRED_GATES(11); router-lifecycle moduleNames(308) does NOT include evolution/* (confirmed). **No replan needed.** (Process verdict — not an implementable decision; actioned by leaving 20-01 untouched.)
- **D-02 [informational]:** 20-03 (CLI canary subcommands) is execution-ready as written. router-control.mjs runRouterControl(203) has `dependencies = {}` injection seam for test spies; rollback verb pattern at 247-270; canonical(15)/EXIT patterns verified. **No replan needed.** (Process verdict — not an implementable decision; actioned by leaving 20-03 substantively unchanged, with a minimal D-04 helper-sharing note added.)
- **D-03 [informational]:** 20-02 (watcher canary trigger) has two substantive gaps + one mechanical defect (D-04/D-05/D-06 below) that MUST be resolved by replan before Wave 2 execution. **Replan 20-02.** (Process verdict — actioned by the 20-02 replan that closes D-04/D-05/D-06; the implementable decisions are D-04/D-05/D-06 below.)

### Gap A — candidate route-fn construction (the substantive gap)
- **D-04:** The watcher must build a `route` function from `built.registry` (the candidate registry) to feed `evaluateCalibrationCorpus({ corpus, route, versions })` and `measureRoutes({ fixtures, route, versions, baseline })`. 20-02 Task 2 step 4 leaves this as `<candidate route fn>` without a mechanism. **Locked mechanism:** replicate the `buildRealCalibrationRoute` helper pattern from `tests/router.compiled-evolution.test.mjs` (lines 66-89) — wrap `routeContextPrompt` (src/context/prompt-route.mjs) with the candidate's compiled index published to a temp ownedRoot (or an in-memory compiled-index shim), producing `route = fixture => routeContextPrompt({ ...fixture, compiledIndex: <candidate compiled index> })`. Extract this as a reusable helper (e.g. `buildCandidateCalibrationRoute({ registry, ownedRoot, config })`) inside the watcher or a small new helper in src/evolution/, so both the watcher (20-02) and CLI promote (20-03 Task 2) share it. The replan MUST specify this helper's signature, where it lives, and how the candidate compiled index is obtained (publishIndex to a temp root, or reuse the in-memory index the watcher already builds).
- **Rationale:** `evaluateCalibrationCorpus` and `measureRoutes` both require a callable `route`; the candidate is a registry object, not a route. The only existing recipe is the test helper. Research flagged gate construction as MEDIUM confidence "confirm with planner" (A6/A7) — the planner did not resolve it. This decision closes it.

### Gap B — demonstrated_benefit derivation (the substantive gap)
- **D-05:** `demonstrated_benefit` has no production derivation — the existing canary test *hardcodes* it (tests/router.compiled-evolution.test.mjs:128). 20-02 Task 2 step 7 says "if all gates pass AND candidate at least as good as known-good → demonstrated; neutral → preserve; safety-only → safety_correction" without a mechanism. **Locked mechanism:** derive by running `measureRoutes` on BOTH the candidate and the known-good compiled index, using the known-good measurement as `baseline`:
  - `candidatePerf = measureRoutes({ fixtures: CALIBRATION_CORPUS, route: candidateRoute, versions })`
  - `knownGoodPerf = measureRoutes({ fixtures: CALIBRATION_CORPUS, route: knownGoodRoute, versions, baseline: null })` (or use `measureRoutes` baseline-delta by passing the known-good as baseline to the candidate run — measureRoutes already computes `baseline_delta.p50_ms/p95_ms`).
  - **demonstrated** (`status: 'demonstrated'`) when all 6 gates pass AND (candidate quality or context_budget strictly better than known-good) AND latency gate passes — `reason_code` reflects the improvement axis (e.g. `context_bytes_reduced`, `latency_reduced`, `quality_improved`).
  - **safety_correction** (`status: 'safety_correction'`) when all gates pass, candidate performance neutral (no strict improvement) but the change is safety-only (reconciliation report indicates a safety/recovery fix).
  - **neutral** (`status: 'neutral'`) when all gates pass and candidate performance equal to known-good (no strict improvement, non-safety change) → applyCanaryDecision preserves.
  - Any gate fail → evaluation.promotable=false → applyCanaryDecision rolls back (if published_version) or rejects; demonstrated_benefit is not consulted.
- The replan MUST specify: how the known-good route fn is built (same D-04 helper against the active.json compiled index via `recoverActiveVersion`), and the exact comparison predicate (strict-improve on quality OR context_budget, with latency as a gate not a tiebreaker). The `demonstrated_benefit` object passed to applyCanaryDecision must carry `{ status, reason_code }`.
- **Rationale:** applyCanaryDecision only promotes when demonstrated_benefit.status ∈ {`demonstrated`, `safety_correction`} (canary-controller.mjs:148-217). Without a real derivation, the watcher can never promote a legitimately better candidate. This is the missing piece the research deferred.

### Gap C — compatible() export (mechanical defect)
- **D-06:** 20-02 Task 2 step 4 calls `COMPILED_INDEX_COMPATIBILITY.compatible(...)` — **wrong**. `compatible` is a private, unexported standalone function at `src/prompt/compile-index.mjs:71`, not a method on the frozen `COMPILED_INDEX_COMPATIBILITY` object (line 6). Calling it as a method throws, and importing it fails (not exported). **Locked fix:** export `compatible` from compile-index.mjs (change `function compatible(value)` to `export function compatible(value)` — one token), then `import { compatible } from '../prompt/compile-index.mjs'` in the watcher and call `compatible(candidateMetadata.compatibility)`. **This adds `src/prompt/compile-index.mjs` to 20-02's files_modified.** The replan must include this file + the one-line export change as a task.
- **Alternative (rejected):** inline the 3-field check (`router_contract && policy_version && capsule_schema_version`) in the watcher — duplicates the contract check. Exporting is preferred (single source of truth, matches how COMPILED_INDEX_COMPATIBILITY is already exported).

### Process gap — VALIDATION.md stub
- **D-07:** `20-VALIDATION.md` is a bare unfilled template (status: draft, nyquist_compliant: false, placeholders unfilled, only 1 stub row in the per-task map). The plans embed per-task `<verify><automated>` inline and RESEARCH.md has a full Validation Architecture section, so Wave execution is NOT blocked. **Action:** run `/gsd-validate-phase 20` after the 20-02 replan to populate VALIDATION.md from the plan verify blocks + RESEARCH test map, and set `nyquist_compliant: true`. Not a replan blocker — a follow-up.

### Carrying forward from research (already decided — no replan change)
- **Cadence (Q3 deferred):** v1 runs canary eval on every eligible reconcile WITHOUT candidate-fingerprint caching. assessCalibration bounded (<1s, 140 route invocations); watcher debounces (debounceMs=250, maxLatencyMs=1500). Revisit only if reconcile frequency or assessCalibration cost spikes. Keep 20-02 must_haves truth as-is.
- **Verdict policy (A1):** bridge hardcodes `verdict: 'success'` for every emitted route (telemetry `outcome` is null). Regression detected by calibration gates, not per-record verdicts. Per-prompt outcome emission deferred to a future phase. Keep 20-01 as-is.
- **Bootstrap (A5):** first-ever activation (recoverActiveVersion returns no_valid_history) bypasses canary, activates directly via existing activateCandidate path, becomes the known-good. Keep 20-02 bootstrap branch as-is.
- **Privacy gate (A7):** the bridge skips privacy-denied records before persistence (20-01), so `window.records` never contains deny_filtered records — the watcher privacy gate as written in 20-02 (check no deny_filtered in window) is structurally a no-op invariant. Keep it as a defense-in-depth check, but the replan should note it cannot fail given 20-01's skip behavior (privacy is enforced at ingest, not at gate). No code change required.

### Claude's Discretion
- The exact name/location of the shared `buildCandidateCalibrationRoute` helper (D-04) — watcher-local vs. new file in src/evolution/ — is left to the planner/executor. Constraint: it must be shared by watcher (20-02) and CLI promote (20-03 Task 2) to avoid duplication, and must not touch the hot path.
- Whether `measureRoutes` is called twice (candidate + known-good) or once with the known-good as `baseline` (using its built-in `baseline_delta`) — executor picks the cheaper correct option; the comparison predicate in D-05 is what matters.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase artifacts (this phase)
- `.planning/phases/20-close-gap-evo-05-add-production-trigger-for-canary-controlle/20-RESEARCH.md` — HIGH-confidence research; Pattern 1 (bridge), Pattern 2 (persistent store), Pattern 3 (watcher trigger sketch + gate construction), Pattern 4 (CLI subcommands), Pattern 5 (release — deferred). Field-mapping table lines 182-194. Pitfalls 1-6. Assumptions A1-A7. Open Questions Q1-Q3 (resolved/deferred).
- `.planning/phases/20-close-gap-evo-05-add-production-trigger-for-canary-controlle/20-01-PLAN.md` — validated execution-ready (D-01).
- `.planning/phases/20-close-gap-evo-05-add-production-trigger-for-canary-controlle/20-02-PLAN.md` — **needs replan per D-04/D-05/D-06**.
- `.planning/phases/20-close-gap-evo-05-add-production-trigger-for-canary-controlle/20-03-PLAN.md` — validated execution-ready (D-02).
- `.planning/phases/20-close-gap-evo-05-add-production-trigger-for-canary-controlle/20-VALIDATION.md` — bare stub; populate via /gsd-validate-phase (D-07).

### Audit + requirements
- `.planning/v1.2-MILESTONE-AUDIT.md` — BLOCKER 2 (lines 177-180), EVO-05 partial (lines 44-58, 161, 165, 202, 247), orphaned-modules list (line 165).
- `.planning/REQUIREMENTS.md` — EVO-05 (line 52).
- `.planning/ROADMAP.md` — Phase 20 section (line 348+), Phase 17 success criterion #4 (line ~243).
- `.planning/STATE.md` — Phase 17 D-decisions (lines 136-141): REGISTRY_PUBLICATION-only mutation, 6 independent gates, no weighted compensation, project+aggregate isolation, 7d/24h/30-sample retention, fail-closed on missing compatible compiled state.

### Prior phase context (carried forward)
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-02-PLAN.md` + `17-02-SUMMARY.md` — canary/evidence design intent, D-05/D-06/D-07/D-08/D-09/D-10 decisions.
- `.planning/phases/18-autonomous-lifecycle-and-release-gates/18-04-PLAN.md` — test_mode seam contract (T-18-04-SEAM); production never sets test_mode.

### Source code (verified line refs)
- `src/evolution/canary-controller.mjs` — REQUIRED_GATES(11), proposeCandidate(54), evaluateCandidate(91), applyCanaryDecision(148), REGISTRY_PUBLICATION(135). DO NOT MODIFY.
- `src/evolution/evidence.mjs` — FIELDS(4), CONFIDENCE_BANDS(9), FIXTURE_CLASSES(10), VERDICTS(11), PRIVACY_GUARDS(12), HALF_LIFE_MS(15), MAX_RETENTION_MS(16), MINIMUM_SAMPLES(17), boundedToken(19, unexported), validateEvidenceEnvelope(27), defaultHash(48, unexported), evidenceWindowFingerprint(60), createEvidenceJournal(74), createEvidenceStore(93). Add createPersistentEvidenceStore (append, additive).
- `src/evolution/perf-measure.mjs` — CALIBRATION_CORPUS(14), evaluateCalibrationCorpus(34), percentile(56), measureRoutes(62), assessCalibration(86). DO NOT MODIFY.
- `src/registry/watcher.mjs` — createRegistryReconciler(246), activator injection(258), recovery injection(259), reconcile(284-363), eligible+recoveryReady branch(328), activator call(336), publishIndex(337-344), createTestRegistryReconciler(367). MODIFIED by 20-02.
- `src/registry/activate.mjs` — activateCandidate(179), recoverActiveVersion(190, returns no_valid_history at 194), previewRollback(206), executeRollback(230). DO NOT MODIFY.
- `src/cli/router-control.mjs` — canonical(15), usage(140-141), runRouterControl(203, `dependencies={}` seam), rollback verb(247-270), --execute --confirm gating(263-266). MODIFIED by 20-03.
- `src/lifecycle/router-lifecycle.mjs` — moduleNames(308, no evolution/* today), moduleValues map(319), dirname grouping(436-437). MODIFIED by 20-01.
- `src/prompt/compile-index.mjs` — COMPILED_INDEX_COMPATIBILITY(6, policy_version='workflow-transitions-v1' at 8), **compatible(84, unexported — D-06 export fix)**, loadCompiledIndex(106). MODIFIED by 20-02 (one-line export).
- `tests/router.compiled-evolution.test.mjs` — buildRealCalibrationRoute helper(66-89), routeContextPrompt import(13), hardcoded demonstrated_benefit(128), measureRoutes baseline_delta(203-205). **The pattern source for D-04.**
- `~/.claude/hooks/router.mjs` — telemetryEntryFromState(2355-2382), logTelemetry(1643-1647). READ-ONLY by the bridge; DO NOT MODIFY.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/evolution/canary-controller.mjs` evaluateCandidate + applyCanaryDecision — complete, test-validated, 217 lines of edge cases. Wire, do NOT reimplement.
- `src/evolution/evidence.mjs` validateEvidenceEnvelope + createEvidenceStore window logic (retention/decay/floor/fingerprint) — reuse verbatim in createPersistentEvidenceStore (extract shared `computeWeightedSamples` helper to avoid silent divergence if the in-memory math changes — per 20-01 Task 2 action).
- `src/evolution/perf-measure.mjs` CALIBRATION_CORPUS + evaluateCalibrationCorpus + measureRoutes + assessCalibration — produces the quality/context_budget/latency gate outcomes; fixed 7-fixture corpus, fingerprint-stable.
- `src/registry/activate.mjs` activateCandidate/previewRollback/executeRollback/recoverActiveVersion — the ONLY publication mutation authority; applyCanaryDecision delegates here via REGISTRY_PUBLICATION.
- `tests/router.compiled-evolution.test.mjs` buildRealCalibrationRoute — the only existing recipe for building a `route` fn from a candidate registry + routeContextPrompt. Basis for D-04 helper.

### Established Patterns
- Atomic append: `appendFileSync(path, line, { flag: 'a', mode: 0o600 })` + `mkdirSync(root, { recursive: true, mode: 0o700 })` — matches router.mjs telemetry append (1647) and activate.mjs journalWrite.
- Test harness: dynamic import via `new URL('../src/...', import.meta.url)` + node:test + node:assert/strict (tests/router.evolution-canary.test.mjs lines 1-25).
- Watcher dependency injection: `createRegistryReconciler(config, dependencies={})` accepts activator/recovery/mapper/verifier overrides (watcher.mjs:258-259) — the test seam for 20-02 Task 1 spies.
- CLI dependency injection: `runRouterControl({ argv, stdin, defaultOwnedRoot, dependencies={} })` (router-control.mjs:203) — the test seam for 20-03 Task 1 spies.
- Operator mutation gating: `--execute --confirm <id>` exact-match pattern (router-control.mjs:263-266) — V4 access control; canary promote/rollback reuse it.

### Integration Points
- Watcher reconcile eligible+recoveryReady branch (watcher.mjs:328-348) → insert canary routing between the verification.passing check (335) and the activator call (336). Bootstrap (no known-good) falls through to existing activator.
- CLI runRouterControl dispatch (router-control.mjs:203-271) → add `canary` command branch before the unknown_command return (271); mirror rollback verb (247-270).
- Deployed bundle (router-lifecycle.mjs:308 moduleNames) → add 4 evolution/* entries (additive, no reorder).

</code_context>

<specifics>
## Specific Ideas

- The route-fn helper (D-04) MUST be shared between watcher (20-02) and CLI promote (20-03 Task 2) — the CLI promote path also needs to run evaluateCalibrationCorpus/measureRoutes against the candidate. If 20-03 Task 2 does not already import the helper, the replan should add it to 20-03's context/files (or note that 20-03 reuses the helper produced by 20-02).
- demonstrated_benefit comparison (D-05): strict-improve on quality OR context_budget is the promotion signal; latency is a hard gate (already in assessCalibration: p95<25ms && max<100ms), NOT a tiebreaker. A candidate that is equal-but-not-better preserves (neutral) — this matches the "automatic rollback when quality regresses" Phase 17 success criterion: only promote on demonstrated improvement, never on parity.
- The privacy gate (20-02 Task 2 step 4) is structurally a no-op given 20-01 skips privacy-denied records at ingest — keep as defense-in-depth, note in replan that it cannot fail post-20-01.

</specifics>

<deferred>
## Deferred Ideas

- **Release-runner canary promotion step (RESEARCH Pattern 5):** keep run-release.mjs as a logic-validator (calibration stage runs canary tests as TAP). A release-time promotion step risks promoting on synthetic-corpus evidence alone (no real telemetry); the watcher is the correct promotion trigger (real telemetry). Deferred to a future phase if release-driven promotion is ever needed. Not a Phase 20 must-have.
- **Per-record verdict emission (A1):** telemetry `outcome` is null today; bridge hardcodes `verdict: 'success'`. If per-prompt outcome labels are ever needed, the hook must be modified to emit outcomes (hot-path change) — explicitly out of Phase 20 scope. Future phase.
- **Evidence store compaction (Q2):** read-time filtering is authoritative (7d retention). Optional size/periodic compaction (rewrite file with age-eligible records only when >10MB) deferred — not a Phase 20 blocker.
- **Canary cadence fingerprint caching (Q3):** v1 runs canary eval on every eligible reconcile without caching the last-evaluated candidate fingerprint. Revisit only if reconcile frequency or assessCalibration cost spikes.

</deferred>

---

*Phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle*
*Context gathered: 2026-07-21*