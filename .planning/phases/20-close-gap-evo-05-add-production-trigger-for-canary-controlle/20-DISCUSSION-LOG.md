# Phase 20: close-gap-evo-05-add-production-trigger-for-canary-controlle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 20-close-gap-evo-05-add-production-trigger-for-canary-controlle
**Areas discussed:** Existing-plans review verdict, 20-02 gap handling

---

This discussion was a codebase-grounded review of the already-written 20-01/20-02/20-03 plans + RESEARCH.md + VALIDATION.md, not a gray-area Q&A. The phase already had 3 plans + research + validation when discussion was opened.

## Plans-exist gate

| Option | Description | Selected |
|--------|-------------|----------|
| Continue and replan after | Capture context decisions, then replan so plans reflect decisions. | |
| View existing plans | Read the 3 plans + research + validation before deciding. | |
| Cancel | Stop — skip discussion. | |

**User's choice:** "Check everything, if looks fine tell me, if not replan what needs to be changed" (free-text — review the existing artifacts and report a verdict; replan only what needs changing).
**Notes:** User redirected the standard discuss flow into a review-and-verdict request. All 3 plans, RESEARCH.md, and VALIDATION.md were read; every line-number claim in the plans was re-verified against the live codebase (Phase 19 had not shifted watcher.mjs — still 381 lines, refs exact).

## Review verdict (presented to user)

- 20-01 (telemetry-bridge + persistent evidence store + bundle inclusion): execution-ready.
- 20-03 (CLI canary subcommands): execution-ready.
- 20-02 (watcher canary trigger): two substantive gaps + one mechanical defect.
- VALIDATION.md: bare unfilled stub (process gap, non-blocking).

Gaps presented:
- **A:** watcher has no mechanism to build a `route` fn from `built.registry` for evaluateCalibrationCorpus/measureRoutes (plan leaves `<candidate route fn>` placeholder).
- **B:** `demonstrated_benefit` has no production derivation (existing test hardcodes it).
- **C:** `compatible()` is an unexported private fn (compile-index.mjs:71), not a method — plan's `COMPILED_INDEX_COMPATIBILITY.compatible(...)` call would fail.
- **D:** 20-VALIDATION.md is an unfilled stub.

## 20-02 gap handling

| Option | Description | Selected |
|--------|-------------|----------|
| Capture in CONTEXT + replan 20-02 | Lock A/B/C as decisions in CONTEXT.md, then replan 20-02 to close the gaps before Wave 2. | ✓ |
| Capture as-is, executor figures it out | Write CONTEXT noting plans validated as-is; trust executor to resolve route-fn/demonstrated_benefit at execution time. | |
| Just fix C + flag D, no replan | Leave 20-02 alone; only fix the compatible() export and flag VALIDATION.md. | |

**User's choice:** Capture in CONTEXT + replan 20-02.
**Notes:** User wants the substantive gaps (A, B) closed by replan, not deferred to the executor. CONTEXT.md captures D-04 (route-fn helper recipe from buildRealCalibrationRoute), D-05 (demonstrated_benefit = candidate-vs-known-good measureRoutes baseline comparison), D-06 (export compatible()).

## Claude's Discretion

- Exact name/location of the shared `buildCandidateCalibrationRoute` helper (watcher-local vs. new file in src/evolution/) — left to planner/executor; constraint: shared by watcher + CLI promote, no hot-path touch.
- Whether measureRoutes is called twice (candidate + known-good) or once with known-good as `baseline` (using built-in baseline_delta) — executor picks; the D-05 comparison predicate is what matters.

## Deferred Ideas

- Release-runner canary promotion step (RESEARCH Pattern 5) — keep as logic-validator; watcher is the real-telemetry promotion trigger. Future phase.
- Per-record verdict emission (telemetry `outcome` is null; bridge hardcodes `verdict: 'success'`) — hot-path change, out of scope. Future phase.
- Evidence store compaction (size/periodic prune) — read-time filtering authoritative; not a blocker. Future enhancement.
- Canary cadence fingerprint caching (Q3) — v1 runs every eligible reconcile without caching; revisit if cost spikes.