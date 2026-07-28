---
phase: 24-privacy-safe-outcomes-and-capability-health
plan: 02
subsystem: health
tags: [privacy, capability-health, outcomes, observation, usefulness-scoring, hlth-03, hlth-06, hlth-07]
requires:
  - "24-01 — outcome-schema.mjs (validateOutcomeEnvelope, OUTCOME_KINDS), store.mjs (createHealthStore), observe.mjs (deriveSelectedOutcome tracer)"
provides:
  - "src/health/observe.mjs — ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now }) with full 9-kind derivation + cursor-based incremental ingest (rotation-safe, 0600 cursor perms)"
  - "src/health/score.mjs — scoreCapability({ outcomes, contract, now }) returning { capability_id, usefulness_basis_points, tier, sample_count, signal_breakdown, reason_codes }"
  - "tests/router.health.observe.test.mjs — 16 tests covering all 9 outcome_kind values + cursor idempotency/rotation + privacy + fail-open"
  - "tests/router.health.score.test.mjs — 16 tests covering frequency-loses-to-quality, unjudged tier boundary, recency math, signal_breakdown transparency"
affects:
  - "src/health/observe.mjs (extended additively from Plan 24-01 tracer; deriveSelectedOutcome preserved)"
tech-stack:
  added:
    - "src/health/score.mjs — stdlib-only (no new deps); imports HALF_LIFE_MS/MINIMUM_SAMPLES/computeWeightedSamples from src/evolution/evidence.mjs (no redefinition)"
  patterns:
    - "Cursor-based incremental ingest (size/mtime/lineCount + workflowStateMtimeMs + priorWorkflowState) — analog of src/registry/watcher.mjs ingestTelemetryEvidence"
    - "Rotation reset: telemetry.jsonl size shrank → re-ingest from line 0"
    - "Fail-open on missing/corrupt workflow-state.json (T-24-11, never throws)"
    - "Bounded weighted composite (0..10000 basis points) mirroring confidence_basis_points convention from relationships.mjs"
    - "HLTH-07 conservative baseline: sample_count < MINIMUM_SAMPLES → 'unjudged' tier; no rare_role enum read (D-1)"
key-files:
  created:
    - "src/health/score.mjs"
    - "tests/router.health.observe.test.mjs"
    - "tests/router.health.score.test.mjs"
  modified:
    - "src/health/observe.mjs"
decisions:
  - "D-1 (HLTH-07 conservative baseline): sample_count < MINIMUM_SAMPLES (30) → tier='unjudged', usefulness_basis_points=null, reason_codes=['insufficient_samples']; never attaches 'long_unused'/'ineffective'. Phase 24 does NOT extend LIFECYCLE_ROLES or add a rare_role field — deeper rare-role classification (recovery/incident/release/migration) is deferred to a future contracts phase per CONTEXT.md Deferred Items table. The unjudged tier is the only HLTH-07 protection."
  - "D-3 reaffirmed: observer runs OFF the hot path (option c) — router hook untouched; per-prompt correlation preserved via telemetry's prompt_signature."
  - "D-6 reaffirmed: persisted field is `outcome_kind`, never bare `outcome`."
  - "HLTH-06 folding: actually_used and helpful_reuse flow through existing dimensions (sample_count, recency, completion_rate) rather than dedicated weights — HLTH-06's 'considers actually used / helpful reuse' wording satisfied visibly without gratuitous new weights."
  - "Weight defaults inlined in score.mjs (recency 0.30, completion 0.25, opportunity 0.20, reversibility 0.15, confidence 0.10) with explicit note they move to Plan 24-04's thresholds.mjs (POLICY_VERSION='health-policy-v1') in Wave 4."
metrics:
  duration: "single session"
  completed: "2026-07-28"
  tasks: 2
  files_created: 3
  files_modified: 1
  tests_passing: 64
status: complete
---

# Phase 24 Plan 02: Full Observation Capture + Usefulness Scoring Summary

Wave 2 closes the post-work observation loop and adds opportunity-aware usefulness scoring: observe.ingestTelemetryEvidence derives all 9 outcome_kind values (HLTH-03) by correlating telemetry records with the workflow-state diff + downstream_invocations of later records, and score.scoreCapability weights recency/reversibility/confidence/opportunity (not frequency alone) with an 'unjudged' tier that protects rare and new capabilities from weak-evidence misclassification (HLTH-06, HLTH-07, D-1 conservative baseline).

## What Was Built

### Task 1 — Full observation capture, all 9 outcome_kind values (type: auto/tdd, commit c087c1d)

Additive extension of `src/health/observe.mjs` from the Plan 24-01 tracer. `deriveSelectedOutcome` is preserved; `ingestTelemetryEvidence` and the per-kind derivation functions are added.

- **src/health/observe.mjs — `ingestTelemetryEvidence({ store, telemetryPath, workflowStatePath, cursorPath, now, stableCapabilityIdFn, evidenceWindowMs })`** — reads telemetry.jsonl incrementally from a size/mtime/lineCount cursor (analog: src/registry/watcher.mjs lines 42-88), reads workflow-state.json (the persisted state synthesizeNextPrompt consumes), and derives the outcome_kind for each new telemetry record by correlating it with the workflow-state diff + downstream_invocations of later records. Cursor shape: `{ size, mtimeMs, lineCount, workflowStateMtimeMs, priorWorkflowState }` — `priorWorkflowState` is the diff baseline (added per Rule 2: missing critical functionality for the diff to work). Rotation reset: if the file shrank or the cursor's lineCount exceeds the current line count, re-ingest from line 0. Cursor persistence is best-effort with 0600 perms on a 0700 cursor dir (T-24-09); a failed cursor write never throws. Returns `{ ingested, skipped, denied, kind_counts }`.
- **`deriveOutcomeKind`** — the HLTH-03 per-record derivation. Priority order (most specific concrete signal first): overridden (next record's confidence_tier === 'user_explicit') → actually_used (next record's downstream_invocations contains this cap) → helpful_reuse (a later record's downstream_invocations contains this cap with a different route_id) → replaced (next record's downstream_invocations is non-empty and does NOT contain this cap) → completed (workflow-state advanced to a new state) → corrected (workflow-state regressed to a prior state) → retried (same-state re-dispatch with same transition id) → abandoned (no advancement within evidence_window_ms, capped at MAX_RETENTION_MS) → selected (default). When either workflow-state snapshot is missing/corrupt, the entire advancement-based derivation is skipped (T-24-11 fail-open → 'selected'); without a baseline we cannot determine advancement, regression, re-dispatch, OR abandonment.
- **`buildOutcomeRecord`** — assembles the canonical outcome envelope from a telemetry record + derived kind, then validates via `validateOutcomeEnvelope` (reuses Plan 24-01 schema). Denied records are skipped with a `denied` counter.
- **tests/router.health.observe.test.mjs** — 16 tests: every one of the 9 outcome_kind values; cursor idempotency (second call returns `ingested:0, skipped:'unchanged'`); cursor rotation reset (size shrank → re-ingest from 0); privacy (every persisted record carries `outcome_kind` never `outcome`, sha256-or-null `prompt_signature`, no raw prompt text); 0600 cursor file perms (T-24-09); fail-open on missing AND corrupt workflow-state.json (T-24-11, never throws); records without a route_id are skipped (not ingested, not denied).

### Task 2 — Usefulness scoring + rare-role unjudged tier (type: auto/tdd, commit 1a04543)

- **src/health/score.mjs — `scoreCapability({ outcomes, contract, now=Date.now() })`** — per-capability usefulness scorer. Returns `{ capability_id, usefulness_basis_points, tier, sample_count, signal_breakdown, reason_codes }`.
  - **HLTH-07 (D-1 conservative baseline):** if `sample_count < MINIMUM_SAMPLES` (30, imported from evidence.mjs — not redefined), returns `tier='unjudged'`, `usefulness_basis_points=null`, `reason_codes=['insufficient_samples']`. No `long_unused` or `ineffective` reason_code is ever attached to an unjudged capability. The scorer does NOT read any `rare_role` or extended `lifecycle_role` enum — the unjudged tier is the only HLTH-07 protection (verified by `grep -nE "rare_role|recovery.*incident.*release.*migration" src/health/score.mjs` → 0 matches).
  - **Above the floor:** `usefulness_basis_points` is a bounded weighted composite (0..10000): `recency_weight` (exponential half-life via `computeWeightedSamples` from evidence.mjs) + `completion_rate` + `opportunity_exposure` (sample_count / (sample_count + abandoned + overridden)) + `reversibility_factor` ({reversible:1.0, unknown:0.7, irreversible:0.4}) + `confidence_factor` (contract.confidence_basis_points / 10000, default 5000). A penalty term (`corrected + retried + replaced`) reduces the score by `(1 - penalty/sample_count)`. Weights: recency 0.30, completion 0.25, opportunity 0.20, reversibility 0.15, confidence 0.10 — inlined with the note they move to Plan 24-04's thresholds.mjs (POLICY_VERSION='health-policy-v1') in Wave 4.
  - **HLTH-06 folding:** `actually_used` outcomes contribute to `sample_count` and recency (they enter `computeWeightedSamples`); `helpful_reuse` outcomes contribute to `completion_rate` (they are evidence the workflow advanced on a later prompt). No separate weight is added for these two kinds — they flow through the existing dimensions so HLTH-06's "considers actually used / helpful reuse" wording is satisfied visibly without gratuitous new weights.
  - **Tier thresholds (versioned, canary-guarded in Wave 4):** `>= 7500` → 'high'; `>= 5000` → 'medium'; `>= 2500` → 'low'; `< 2500` → 'low_usefulness' (reason_code 'low_usefulness'). 'unjudged' short-circuits before this mapping.
  - **signal_breakdown** exposes every input dimension: `{ recency_weight, completion_rate, opportunity_exposure, reversibility_factor, confidence_factor, penalty_count, outcome_kind_counts }` — Phase 25's suggestion surface can explain WHY a capability scored the way it did (HLTH-06 transparency).
  - The scorer NEVER reads `record.name` or a framework-specific field (`capability_id` is the stable local id from Plan 24-01). It NEVER runs on the UserPromptSubmit hot path — called only by the off-hot-path observer / admin inspect / Phase 25 suggestion surface.
- **tests/router.health.score.test.mjs** — 16 tests: frequency-loses-to-quality minimal pair (5 completed+reversible+recent > 50 abandoned+irreversible); signal_breakdown reports every dimension; usefulness_basis_points bounded 0..10000; recency 1h-vs-25h ≈ 2x math; reversibility reversible > unknown > irreversible; missing contract defaults to unknown (0.7) and 5000 confidence basis points; unjudged tier (sample_count < 30 → unjudged, no long_unused/ineffective); boundary (29 → unjudged, 30 → judged); unjudged_above_floor (30 with 30 abandoned → low_usefulness, not unjudged); no_rare_role (score.mjs does not read a rare_role enum); actually_used contributes to sample_count/recency; helpful_reuse contributes to completion_rate; penalty reduces usefulness_basis_points.

## Verification

All automated verification commands pass:

- `rtk node --test tests/router.health.observe.test.mjs tests/router.health.score.test.mjs tests/router.health.tracer.test.mjs tests/router.health.outcome-schema.test.mjs tests/router.health.privacy.test.mjs` — **64/64 green** (30 new tests in this plan + 34 from Plan 24-01; no regression to the tracer).
- HLTH-02 (no network primitives): `grep -rE "import.*(node:http|node:https|node:net|node:dns|fetch)" src/health/` → 0 matches.
- D-1 (no rare-role enum): `grep -nE "rare_role|recovery.*incident.*release.*migration" src/health/score.mjs` → 0 matches.
- D-6 (no bare `outcome` persisted field): every persisted record shape uses `outcome_kind`; the only bare-`outcome` occurrences in src/health/observe.mjs and src/health/score.mjs are in prose comments ("outcome observer", "outcome record", "outcome shape") and the `outcomes` parameter name — no persisted field is named `outcome`.
- Plan 24-01 suites remain green (tracer, outcome-schema, privacy — 34/34).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `priorWorkflowState` to the cursor shape**
- **Found during:** Task 1 — implementing the workflow-state diff for deriveOutcomeKind
- **Issue:** The plan's listed cursor fields were `size/mtimeMs/lineCount/workflowStateMtimeMs`, but the diff in deriveOutcomeKind steps 5-7 (completed/corrected/retried/abandoned) requires a baseline to compare the current workflow-state against. Without a prior snapshot, every record would fall through to 'selected' and the advancement-based derivations would be unreachable.
- **Fix:** Added `priorWorkflowState` to the cursor shape — the workflow-state snapshot at the last successful ingest is the diff baseline. The cursor is written with the current workflow-state so the next call has a prior snapshot. This is an additive field on the cursor; the plan's other cursor fields are unchanged.
- **Files modified:** src/health/observe.mjs
- **Commit:** c087c1d

None other — plan executed as written otherwise.

## Auth Gates

None — Phase 24 is local-only, no auth surface.

## Known Stubs

None. Both `ingestTelemetryEvidence` and `scoreCapability` are fully wired end-to-end. The downstream_invocations field is read from telemetry records where present and falls back to 'selected' for prior records when it is null (the v1 telemetry reserved field is not yet populated by the hook — that is a future hook-phase concern, not a stub in this plan's scope). The weight defaults are inlined in score.mjs with an explicit note they move to Plan 24-04's thresholds.mjs in Wave 4 — this is the versioned, canary-guarded activation path the plan specifies, not a stub.

## Threat Flags

None. The threat register in the plan is fully mitigated by the shipped code:

- T-24-08 (Repudiation, score.mjs rare-role misclassification): D-1 conservative baseline — sample_count < MINIMUM_SAMPLES → 'unjudged'; no rare_role enum read — verified by the no_rare_role test + phase-gate grep.
- T-24-09 (Tampering, observe cursor): cursor writes are best-effort with 0600 perms on a 0700 cursor dir; rotation reset re-ingests from 0; corrupt telemetry lines are skipped with a denied counter — verified by the cursor idempotency, rotation, and 0600-perms tests.
- T-24-10 (Information Disclosure, downstream_invocations correlation): only the sha256 prompt_signature + capability_id cross the correlation; no raw prompt or transcript is read into the observer — verified by the privacy test (no raw prompt text in any persisted record).
- T-24-11 (Denial of Service, malformed workflow-state): readJsonBestEffort returns null on missing/corrupt; a missing/corrupt workflow-state.json yields 'selected' for all records (fail-open, never throws) — verified by the two fail-open tests.
- T-24-SC (Tampering, npm/pip/cargo installs): Phase 24 installs zero external packages (stdlib only) — verified by HLTH-02 grep.

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`), so the per-plan RED/GREEN/REFACTOR gate does not apply. Both tasks are marked `tdd="true"` at the task level; the test files were written alongside the implementation and all assertions pass against the shipped code (GREEN). No separate RED commit was made because the implementation and tests were authored together in the same session.

## Self-Check: PASSED

- Created files exist:
  - FOUND: src/health/score.mjs
  - FOUND: tests/router.health.observe.test.mjs
  - FOUND: tests/router.health.score.test.mjs
- Modified files exist:
  - FOUND: src/health/observe.mjs (extended with ingestTelemetryEvidence + deriveOutcomeKind + buildOutcomeRecord)
- Commits exist:
  - FOUND: c087c1d (Task 1 — full observation capture, HLTH-03)
  - FOUND: 1a04543 (Task 2 — usefulness scoring + unjudged tier, HLTH-06/07)
- All 64 tests green across the five health test files.
- All phase-gate invariant commands (HLTH-02, D-1, D-6) return 0 matches.