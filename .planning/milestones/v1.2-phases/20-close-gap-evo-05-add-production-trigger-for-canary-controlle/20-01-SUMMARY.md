---
phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
plan: 01
subsystem: evolution
tags: [canary, evidence, telemetry, persistence, stdlib, node-test]

# Dependency graph
requires:
  - phase: 17-compiled-prompt-routing-and-safe-evolution
    provides: validateEvidenceEnvelope + createEvidenceStore + evidenceWindowFingerprint + canary-controller (evaluateCandidate/applyCanaryDecision) + perf-measure (CALIBRATION_CORPUS/measureRoutes) + D-05/D-07/D-08 retention/decay/floor contract
provides:
  - telemetryRecordToEvidence + ingestTelemetryFile (telemetry-bridge.mjs) — telemetry.jsonl → D-05 envelope transform
  - createPersistentEvidenceStore (evidence.mjs) — disk-backed evidence store with project+aggregate isolation, 7d/24h/30-sample window
  - evolution/* entries in router-lifecycle.mjs moduleNames — deployed bundle inclusion (closes audit orphaned-modules finding)
affects: [20-02 (watcher canary trigger), 20-03 (CLI canary subcommands)]

# Tech tracking
tech-stack:
  added: []
  patterns: [disk-backed JSONL evidence store with atomic appendFileSync flag:'a' mode:0o600 + mkdir 0o700 (mirrors router.mjs telemetry append + activate.mjs journalWrite), shared computeWeightedSamples helper reused across in-memory + persistent stores to prevent decay-math divergence]

key-files:
  created:
    - src/evolution/telemetry-bridge.mjs
    - tests/router.telemetry-bridge.test.mjs
    - tests/router.evidence-persistence.test.mjs
    - tests/router.deployed-bundle.test.mjs
  modified:
    - src/evolution/evidence.mjs
    - src/lifecycle/router-lifecycle.mjs

key-decisions:
  - "Privacy-denied records (deny_filtered tier OR any PRIVACY_GUARDS code in guards_fired) are skipped BEFORE envelope construction, not just passed through with null signature — prevents emitting an envelope for a record the hook already suppressed."
  - "Extracted computeWeightedSamples as a shared exported helper so the in-memory createEvidenceStore and the new createPersistentEvidenceStore cannot silently diverge if the decay policy changes."
  - "Exported boundedToken + defaultHash additively from evidence.mjs so the persistent store reuses the validation/hash primitives instead of duplicating them."
  - "verdict hardcoded to 'success' (v1 policy — telemetry outcome is null today; regression detected by calibration gates, not per-record verdicts)."

patterns-established:
  - "Pattern: disk-backed evidence store = atomic JSONL append per scope file + read-time filtering (authoritative retention) + shared decay helper."
  - "Pattern: bridge skip-early for non-canary-relevant records (privacy-denied, trivial, reentry_skipped, manifest_missing, null suggested_mode) returns {status:'skipped', reason_code} — never throws."

requirements-completed: [EVO-05]

coverage:
  - id: D1
    description: "Telemetry→evidence bridge (telemetryRecordToEvidence + ingestTelemetryFile) transforms telemetry.jsonl records into D-05 envelopes with field mapping, privacy suppression, fixture_class classification, verdict='success', candidate_version parameter, forbidden-field rejection, latency unit conversion."
    requirement: "EVO-05"
    verification:
      - kind: unit
        ref: "tests/router.telemetry-bridge.test.mjs#Task1.1..Task1.7"
        status: pass
    human_judgment: false
  - id: D2
    description: "Persistent evidence store (createPersistentEvidenceStore in evidence.mjs): disk-backed append with project+aggregate isolation, 7d retention, 24h exponential-half-life-v1 decay, 30-sample floor, fingerprint integrity, forbidden-field rejection before persistence, atomic append (0o700 dir / 0o600 file)."
    requirement: "EVO-05"
    verification:
      - kind: unit
        ref: "tests/router.evidence-persistence.test.mjs#Task2.1..Task2.8"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deployed bundle inclusion — evolution/{canary-controller,evidence,perf-measure,telemetry-bridge}.mjs added to router-lifecycle.mjs moduleNames so the installer deploys them to ~/.claude/router/modules/evolution/; source files exist; telemetry-bridge.mjs dynamic import succeeds."
    requirement: "EVO-05"
    verification:
      - kind: integration
        ref: "tests/router.deployed-bundle.test.mjs#Task3.1..Task3.3"
        status: pass
    human_judgment: false
  - id: D4
    description: "Hot path (src/context/prompt-route.mjs) unchanged and imports none of the new bridge/persistence code; telemetry-bridge/createPersistentEvidenceStore absent from prompt-route.mjs, compile-index.mjs, publish-index.mjs."
    requirement: "EVO-05"
    verification:
      - kind: other
        ref: "grep -rn 'telemetry-bridge\\|createPersistentEvidenceStore' src/context/prompt-route.mjs src/prompt/compile-index.mjs src/prompt/publish-index.mjs → 0 matches"
        status: pass
    human_judgment: false

# Metrics
duration: ~20min
completed: 2026-07-22
status: complete
---

# Phase 20 Plan 01: Telemetry→Evidence Bridge + Persistent Store + Bundle Inclusion Summary

**Stdlib-only telemetry→D-05 evidence bridge with privacy suppression, disk-backed persistent evidence store enforcing the Phase 17 D-07/D-08 retention/decay/floor contract, and evolution/* shipped in the deployed module bundle — the Wave 1 foundation Wave 2/3 import.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-22T12:47:24Z
- **Completed:** 2026-07-22T13:07:00Z
- **Tasks:** 3 (TDD: RED + GREEN per task → 6 commits)
- **Files modified:** 6 (2 source, 4 test/new)

## Accomplishments

- `src/evolution/telemetry-bridge.mjs` — transforms `telemetry.jsonl` records into D-05 evidence envelopes using the 11 allowlisted fields; `validateEvidenceEnvelope` rejects forbidden fields before persistence; `classifyFixtureClass` maps `confidence_tier` + `invoke_kind` to `FIXTURE_CLASSES`; privacy-denied records (deny_filtered tier or PRIVACY_GUARDS code in guards_fired) skipped before envelope construction; `verdict` hardcoded to `'success'` (v1: telemetry outcome is null); `candidate_version` is a parameter (`steady-state-v1` default); `ingestTelemetryFile` bulk-loads JSONL off the hot path.
- `createPersistentEvidenceStore` added to `src/evolution/evidence.mjs` — disk-backed evidence store under `~/.claude/router/evidence/{project-{id},aggregate}.jsonl` with project+aggregate isolation; `validateEvidenceEnvelope` is the FIRST call in `append` (forbidden fields rejected BEFORE any disk write); atomic `appendFileSync` (`flag:'a'`, `mode:0o600`), directory `mkdir 0o700`; `window` reuses the shared `computeWeightedSamples` helper (7d retention / 24h decay / 30-sample floor — D-07/D-08).
- `src/lifecycle/router-lifecycle.mjs` `moduleNames` array now includes `evolution/{canary-controller,evidence,perf-measure,telemetry-bridge}.mjs` so the installer deploys them to `~/.claude/router/modules/evolution/` (closes audit line 165 orphaned-modules finding for the bundle inclusion dimension). Purely additive; no existing entries removed or reordered.
- Hot path (`src/context/prompt-route.mjs`) unchanged and imports none of the new code (verified by grep → 0 matches).

## Task Commits

Each task followed the TDD RED/GREEN cycle and was committed atomically:

1. **Task 1: Telemetry→evidence bridge** — `30a4261` (test: RED failing tests) + `5c09a8c` (feat: GREEN implementation)
2. **Task 2: Persistent evidence store** — `e141944` (test: RED failing tests) + `89a6761` (feat: GREEN implementation)
3. **Task 3: Deployed bundle inclusion** — `e130304` (test: RED failing test) + `3085c86` (feat: GREEN bundle entries)

## Files Created/Modified

- `src/evolution/telemetry-bridge.mjs` (new) — `telemetryRecordToEvidence(record, {candidate_version})` + `ingestTelemetryFile(path, {candidate_version, onRecord})`; pure stdlib, off the hot path.
- `src/evolution/evidence.mjs` (modified) — added `createPersistentEvidenceStore`; exported `boundedToken`, `defaultHash`, `computeWeightedSamples` additively; refactored in-memory `createEvidenceStore.window` to call `computeWeightedSamples` (no behavior change; existing tests still pass).
- `src/lifecycle/router-lifecycle.mjs` (modified) — added 4 `evolution/*` entries to `moduleNames` (additive).
- `tests/router.telemetry-bridge.test.mjs` (new) — 7 behavior tests.
- `tests/router.evidence-persistence.test.mjs` (new) — 8 behavior tests (unique tmpdir per test).
- `tests/router.deployed-bundle.test.mjs` (new) — 3 behavior tests.

## Decisions Made

- **Privacy skip is upfront, not just signature-nulling.** The bridge skips records whose `guards_fired` contains a PRIVACY_GUARDS code (`privacy_guard`, `deny_filtered`, `secret_detected`, `content_detected`) OR whose `confidence_tier === 'deny_filtered'` BEFORE envelope construction, returning `{status:'skipped', reason_code:'not_canary_evidence'}`. This is stricter than only nulling the signature — a privacy-denied record carries no canary evidence at all. `PRIVACY_GUARDS` is mirrored locally in telemetry-bridge.mjs (evidence.mjs doesn't export it).
- **Shared decay helper.** Extracted `computeWeightedSamples` from the in-memory store's `window` and exported it so the persistent store reuses the exact same exponential-half-life-v1 math. Prevents silent divergence if the decay policy ever changes.
- **Additive exports.** `boundedToken`, `defaultHash`, `computeWeightedSamples` are now exported from evidence.mjs. The in-memory `createEvidenceStore.window` was refactored to call `computeWeightedSamples` (no behavior change — verified by the existing `router.evolution-canary.test.mjs` suite still passing).
- **`verdict: 'success'` v1 policy.** Telemetry's `outcome` is null today (`router.mjs:2373`); regression is detected by the calibration gates (quality/context_budget/latency) in `assessCalibration`, not per-record verdicts. Per-prompt outcome emission is deferred to a future phase (would touch the hot path).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Privacy-denied records with a PRIVACY_GUARDS guard code but non-deny_filtered tier were being accepted**
- **Found during:** Task 1 (GREEN phase — first test run had 1/7 failing)
- **Issue:** The original `classifyFixtureClass` only returned null for `confidence_tier === 'deny_filtered'`, so a record with `confidence_tier: 'high'` and `guards_fired: ['deny_filtered', ...]` produced an accepted envelope (the test expected `skipped`).
- **Fix:** Added `isPrivacyDenied(record)` (mirrors evidence.mjs:12 `PRIVACY_GUARDS`) and skip early in `telemetryRecordToEvidence` before `classifyFixtureClass`. Privacy-denied records never become canary evidence.
- **Files modified:** src/evolution/telemetry-bridge.mjs
- **Verification:** `node --test tests/router.telemetry-bridge.test.mjs` → 7/7 pass (Task1.2 now passes).
- **Committed in:** `5c09a8c` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix was required for the privacy invariant (must_haves.truths[1]: "Privacy-denied telemetry records ... are skipped"). No scope creep — the skip behavior was always the plan's intent; the initial implementation simply missed the `guards_fired`-contains-privacy-code path.

## Issues Encountered

- The plan's verification heuristic `grep -c "'evolution/"` returns 2 (not 4) because the 4 entries are grouped 2-per-line. All 4 entries are present and individually asserted by `Task3.1` (which checks each string with `.includes`), so the substantive requirement is met. The grep count was a one-per-line assumption in the plan, not a hard contract.

## User Setup Required

None — zero-dependency stdlib-only phase. No external services, env vars, or dashboard configuration.

## Next Phase Readiness

- **Wave 2 (20-02 watcher canary trigger)** can `import { telemetryRecordToEvidence, ingestTelemetryFile } from '../evolution/telemetry-bridge.mjs'` and `import { createPersistentEvidenceStore } from '../evolution/evidence.mjs'` at the deployed `~/.claude/router/modules/evolution/` location.
- **Wave 3 (20-03 CLI canary subcommands)** reuses the same exports.
- The persistent store's `window({scope, project_id})` returns the same `{sufficient, sample_count, weighted_samples, source_evidence_fingerprint, observations, ...}` shape as the in-memory store, so `evaluateCandidate({evidence_window: window, ...})` consumes it directly.
- **Blockers:** None. The 20-02 replan (D-04/D-05/D-06 per CONTEXT.md) is independent of this foundation.

## Self-Check: PASSED

- Created files exist: `src/evolution/telemetry-bridge.mjs`, `tests/router.telemetry-bridge.test.mjs`, `tests/router.evidence-persistence.test.mjs`, `tests/router.deployed-bundle.test.mjs` — all FOUND.
- Commits exist: `30a4261`, `5c09a8c`, `e141944`, `89a6761`, `e130304`, `3085c86` — all FOUND in `git log`.
- Test suite: `node --test tests/router.telemetry-bridge.test.mjs tests/router.evidence-persistence.test.mjs tests/router.deployed-bundle.test.mjs tests/router.bm25.test.mjs tests/router.compiled-index.test.mjs tests/router.evolution-canary.test.mjs` → 56/56 pass.
- Hot path untouched: `grep -rn 'telemetry-bridge\|createPersistentEvidenceStore' src/context/prompt-route.mjs src/prompt/compile-index.mjs src/prompt/publish-index.mjs` → 0 matches.
- Privacy invariant: forbidden-field test (Task2.7) denies `raw_prompt` before disk write; no `leak` on disk. Privacy-skip test (Task1.2) skips deny_filtered records.

---
*Phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controlle*
*Completed: 2026-07-22*