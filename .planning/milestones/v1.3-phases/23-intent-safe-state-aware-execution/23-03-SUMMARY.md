---
phase: 23-intent-safe-state-aware-execution
plan: 03
subsystem: orchestration
tags: [approval-gate, sha256, fail-closed, dispatch-matrix, post-work-next-prompt, framework-neutral, node-test, stdlib-only]

# Dependency graph
requires:
  - phase: 23-intent-safe-state-aware-execution
    provides: classifyIntent 8-disposition matrix, resolveAction three-verb mapper, synthesizeNextPrompt framework-neutral baseline
  - phase: 22-conservative-contracts-and-relationship-graph
    provides: contract.fields side_effects/reversibility/risk envelopes, evaluateEligibility, contentFingerprint, stableCapabilityId
  - phase: 19-compiled-prompt-routing-and-safe-evolution
    provides: nextValidTransitions freshness/terminal/gate policy, WORKFLOW_TRANSITIONS
provides:
  - "needsApproval(contract) — true for destructive/unbounded/external/privileged side_effects, irreversible reversibility, high/critical/unacceptable risk (state=known envelope gate); false for safe + unknown"
  - "bindApproval({ capability, args, targets, effects, proposalVersion }) — SHA-256 over contentFingerprint(capability) + stableStringify(args) + sorted targets + stableStringify(effects) + String(proposalVersion); deterministic token"
  - "verifyApproval({ bound, presented, expected }) — fail-closed approval_missing / approval_stale / approval_mismatch / approval_bound"
  - "synthesizeNextPrompt({ selection, capability, args, postWorkState }) — re-runs nextValidTransitions on FRESH post-work state; surfaces framework-neutral next transition_id (EXEC-10)"
  - "Full EXEC-05/06/09/10 dispatch matrix composed at the boundary (intent → action → approval → next-prompt)"
affects: [24-privacy-safe-outcomes-and-capability-health, 25-advisory-stewardship-and-guarded-drafts, 26-coherent-publication-and-dual-runtime-release]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-leg approval verification: bound+presented existence (approval_missing) → bound vs re-derived expected (approval_stale) → presented vs bound (approval_mismatch) → approval_bound"
    - "Re-derive expected token from CURRENT args/targets/effects/proposalVersion via bindApproval — stale check anchored to fresh state, not a cached value (T-23-04, T-23-08)"
    - "Post-work next-prompt re-runs nextValidTransitions on the caller-supplied fresh postWorkState — no cross-prompt cache (T-23-08)"
    - "Four-gate dispatch boundary composed at the caller (intent → resolveAction → needsApproval/verifyApproval → synthesizeNextPrompt) — approval is a distinct gate from execute intent (EXEC-07)"
    - "Framework-neutral: transition_id comes from policy data, never a hardcoded framework slash; grep -c 'gsd-' src/orchestrator/{actions,next-prompt,approval}.mjs = 0"

key-files:
  created:
    - tests/router.approval.test.mjs
  modified:
    - src/orchestrator/approval.mjs
    - src/orchestrator/next-prompt.mjs
    - tests/router.dispatch-integration.test.mjs

key-decisions:
  - "verifyApproval takes a third `expected` leg (re-derived token from current args/targets/effects/version) — the stale check is bound.token !== expected, not bound.token !== presented (those are different failures: stale vs mismatch)"
  - "Success reason_code is `approval_bound` (not `approval_verified` from the wave-1 stub) — matches the EXEC-08 must_have exactly"
  - "Approval gate is composed at the dispatch boundary, not embedded in resolveAction — keeps resolveAction focused on gates 1-3 (eligible + intent + state); approval is gate 4 (EXEC-07 distinct from execute intent)"
  - "synthesizeNextPrompt surfaces `Next transition: <transition_id> (to: <state>)` when postWorkState is provided — framework-neutral (transition_id is policy data, not a slash). Backward-compat: no Next transition line when postWorkState is absent"
  - "needsApproval reads only the contract envelope (state=known gate); does NOT re-check eligibility (Anti-Pattern — would drift Phase 22 authority). Unknown envelope → false (eligibility gate handles unknown)"
  - "Approval tokens are session-scoped per A3 — no new data file in ~/.claude/router/ (verified: no approval*.json or tokens*.json created)"

patterns-established:
  - "Pattern: fail-closed approval verification — every leg returns { status: 'blocked', dispatch_eligible: false, reason_code }; the dispatcher never exceptions on a missing/stale/mismatched token"
  - "Pattern: post-work fresh-state re-read — nextValidTransitions is re-run on the caller-supplied postWorkState, never on a cached value; the prompt reflects the NEXT transition, not the just-completed one (T-23-08)"
  - "Pattern: dispatch-boundary composition — the four gates are composed at the caller (the future hook path), not embedded in a single mega-function; each gate has a stable reason_code vocabulary"

requirements-completed: [EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, EXEC-10]

coverage:
  - id: P1
    description: "needsApproval true for destructive/privileged/irreversible/high-risk; false for safe + unknown envelope"
    requirement: EXEC-07
    verification:
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] needsApproval true when side_effects contains destructive (EXEC-07)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] needsApproval true for unbounded / external / privileged side effects"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] needsApproval true when reversibility is irreversible (EXEC-07)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] needsApproval true when risk is high / critical / unacceptable (EXEC-07)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] needsApproval false for safe contract (reversible + low risk + no destructive side effects)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] needsApproval false when envelope state is unknown"
        status: pass
    human_judgment: false
  - id: P2
    description: "bindApproval token is deterministic SHA-256 hex over contentFingerprint + args + sorted targets + effects + proposalVersion"
    requirement: EXEC-08
    verification:
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] bindApproval returns schema/policy versions and a hex token (EXEC-08)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] re-deriving bindApproval twice in the same process yields the same token (hash determinism)"
        status: pass
    human_judgment: false
  - id: P3
    description: "verifyApproval fail-closed: missing/stale/mismatch → blocked with exact reason_code; all-match → approval_bound"
    requirement: EXEC-08
    verification:
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] verifyApproval with no bound → blocked approval_missing (EXEC-08)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] verifyApproval with no presented → blocked approval_missing (EXEC-08)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] verifyApproval where bound.token !== expected (re-derived) → blocked approval_stale (EXEC-08)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] verifyApproval where presented.token !== bound.token → blocked approval_mismatch (EXEC-08)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] verifyApproval where all legs match → approved approval_bound (EXEC-08)"
        status: pass
    human_judgment: false
  - id: P4
    description: "proposalVersion bump and args-change each invalidate the prior bound token (approval_stale at the boundary)"
    requirement: EXEC-08
    verification:
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] bumping proposalVersion by 1 invalidates the prior bound token (approval_stale, boundary)"
        status: pass
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] changing args (different topic for create-phase) invalidates the prior bound token (approval_stale)"
        status: pass
    human_judgment: false
  - id: P5
    description: "Hook capabilities never reach bindApproval (filtered upstream by actions.mjs; hook-only registry → no_eligible_capability)"
    requirement: EXEC-09
    verification:
      - kind: unit
        ref: "tests/router.approval.test.mjs#[phase23-red:approval] EXEC-09 invariant — a hook-only registry never reaches bindApproval (resolveAction returns no_eligible_capability)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] hook-only registry blocks with no_eligible_capability (EXEC-09)"
        status: pass
    human_judgment: false
  - id: P6
    description: "Destructive dispatch with matching approval token dispatches; without/stale/mismatch → blocked with exact reason codes"
    requirement: EXEC-05
    verification:
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] destructive capability with matching approval token dispatches (EXEC-05/07/08)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] destructive capability without approval token blocks with approval_missing (EXEC-07)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] destructive capability with stale approval (bumped proposalVersion) blocks with approval_stale (EXEC-08)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] destructive capability with mismatched approval (different args) blocks with approval_mismatch (EXEC-08)"
        status: pass
    human_judgment: false
  - id: P7
    description: "Stale/terminal/missing-dep/tie all produce blocked/clarify with exact stable reason codes — never a silent dispatch"
    requirement: EXEC-06
    verification:
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] stale state blocks with authoritative_evidence_stale (EXEC-06)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] terminal workflow blocks with terminal_workflow (EXEC-06)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] missing dependency blocks with dependency_unavailable (EXEC-06)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] tie — two eligible capabilities for one transition produce clarify, never first-wins (EXEC-06)"
        status: pass
    human_judgment: false
  - id: P8
    description: "Post-work next-prompt re-runs nextValidTransitions on fresh state and is framework-neutral (no /gsd- slash)"
    requirement: EXEC-10
    verification:
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] post-work next-prompt re-runs nextValidTransitions on fresh state and is framework-neutral (EXEC-10)"
        status: pass
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] post-work next-prompt with no post-work state falls back to the selected capability (backward compat)"
        status: pass
    human_judgment: false
  - id: P9
    description: "Newest-explicit-instruction override — fresh execute prompt wins over a stale capsule hint (INT-04 integration)"
    requirement: EXEC-05
    verification:
      - kind: integration
        ref: "tests/router.dispatch-integration.test.mjs#[phase23-red:dispatch] newest-explicit-instruction override — stale capsule hint + fresh execute prompt → fresh prompt wins (INT-04)"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-27
status: complete
---

# Phase 23 Plan 03: Approval Gate + Full Dispatch Matrix Summary

**Approval gate wired (needsApproval / bindApproval / verifyApproval with three-leg fail-closed: missing → stale → mismatch → bound) and the full EXEC-05/06/09/10 dispatch matrix composed at the boundary — destructive-with-approval dispatches, destructive-without/stale/mismatch fail closed, post-work next-prompt re-reads fresh state, all framework-neutral (grep gsd- = 0)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-27T09:10:57Z
- **Completed:** 2026-07-27T09:14:56Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments
- `verifyApproval` upgraded from the wave-1 two-leg stub to the full three-leg fail-closed gate: `approval_missing` (no bound/presented/token) → `approval_stale` (bound.token !== expected, where `expected` is re-derived from CURRENT args/targets/effects/proposalVersion via `bindApproval`) → `approval_mismatch` (presented.token !== bound.token) → `approval_bound` (all legs match). The `expected` leg is the T-23-04 mitigation — stale approval cannot be reused for new args/version.
- `needsApproval` reuses the `field()` + `state==='known'` envelope reader from `eligibility.mjs:32-42` and the same token vocabulary (`destructive`, `unbounded`, `external`, `privileged`, `irreversible`, `high`, `critical`, `unacceptable`) from `eligibility.mjs:165-175` — does NOT re-check eligibility (Anti-Pattern). Unknown envelope → false (eligibility gate handles unknown).
- `bindApproval` chains `contentFingerprint(capability)` (reused from `identity.mjs:37-51`) + `stableStringify(args)` + `stableStringify([...targets].sort())` + `stableStringify(effects)` + `String(proposalVersion)` through `createHash('sha256')` — never hand-rolled (ASVS V6). Re-deriving twice in the same process yields the same token (determinism test).
- `synthesizeNextPrompt` expanded: accepts `postWorkState`, re-runs `nextValidTransitions` on the FRESH post-work state (no cross-prompt cache, T-23-08), surfaces `Next transition: <transition_id> (to: <state>)` — framework-neutral (transition_id from policy data, not a slash). Backward-compat: no `Next transition:` line when `postWorkState` absent. `MAX_CONTEXT_BYTES` overflow guard preserved.
- Full EXEC-05/06/09/10 dispatch matrix composed at the boundary: classifyIntent → resolveAction → needsApproval → verifyApproval → synthesizeNextPrompt. 16 integration tests covering safe-dispatch, destructive-with-approval, destructive-without/stale/mismatch, stale-state, terminal, missing-dep, tie, hook-only, post-work next-prompt, newest-explicit-instruction override.
- Wave-1 + wave-2 tests stay green (no regression): 63/63 Phase 23 + 32/32 Phase 22 = 95/95. grep done-gate: `gsd-` count = 0 in `actions.mjs`, `next-prompt.mjs`, `approval.mjs`. No new data file in `~/.claude/router/` (A3 backstop — approval tokens are session-scoped).

## Task Commits

Each task was committed atomically (TDD: RED test commit → GREEN implementation commit):

1. **Task 23-03-01 (approval gate):**
   - `35e365f` (test) — RED: 16-test approval matrix (needsApproval true/false, bindApproval determinism, verifyApproval missing/stale/mismatch/bound, proposalVersion-bump + args-change boundaries, hook-invariant)
   - `c2dbe8f` (feat) — GREEN: `verifyApproval` gains `expected` leg (approval_stale); success reason_code `approval_verified` → `approval_bound`
2. **Task 23-03-02 (dispatch matrix):**
   - `dff3e6b` (test) — RED: 16-test dispatch matrix (safe + destructive with/without/stale/mismatch approval, stale/terminal/missing-dep/tie/hook-only, post-work next-prompt, INT-04 override)
   - `c1aac13` (feat) — GREEN: `synthesizeNextPrompt` re-runs `nextValidTransitions` on fresh `postWorkState`; dispatch helper delegates intent gate to `resolveAction` (`intent_not_execute` vocabulary)

## Files Created/Modified
- `tests/router.approval.test.mjs` — created — 16 unit tests covering needsApproval (destructive/irreversible/high-risk + safe + unknown), bindApproval (determinism + sha256 hex), verifyApproval (missing/stale/mismatch/bound), proposalVersion-bump + args-change boundaries, EXEC-09 hook invariant
- `src/orchestrator/approval.mjs` — modified — `verifyApproval` gains the `expected` (re-derived token) leg for `approval_stale`; success `reason_code` corrected from `approval_verified` to `approval_bound` per the EXEC-08 must_have
- `src/orchestrator/next-prompt.mjs` — modified — `synthesizeNextPrompt` accepts `postWorkState`; re-runs `nextValidTransitions` on fresh post-work state; surfaces framework-neutral `Next transition:` line; backward-compat when `postWorkState` is absent
- `tests/router.dispatch-integration.test.mjs` — modified — expanded from 4 to 16 tests covering the full EXEC-05/06/09/10 matrix; composes the four-gate dispatch boundary at the caller

## Decisions Made
- **`verifyApproval` takes a third `expected` leg.** The stale check is `bound.token !== expected` (where `expected` is re-derived from current args/targets/effects/proposalVersion via `bindApproval`), NOT `bound.token !== presented`. Those are different failures: stale = the bound token was minted against a prior proposal/args set (T-23-04); mismatch = the presented token doesn't match the bound one (T-23-V4). The must_haves name both reason_codes, so both legs are required.
- **Success reason_code is `approval_bound` (not `approval_verified`).** The wave-1 stub returned `approval_verified`; the EXEC-08 must_have names `approval_bound` exactly. Corrected in GREEN.
- **Approval gate composed at the dispatch boundary, not embedded in `resolveAction`.** `resolveAction` owns gates 1-3 (eligible + intent + state); approval is gate 4 (EXEC-07 distinct from execute intent). The composition happens at the caller (the future hook path) — keeps each module focused and the reason_code vocabularies clean.
- **`needsApproval` reads only the contract envelope, does NOT re-check eligibility.** Re-checking eligibility would drift Phase 22 authority (Anti-Pattern). Unknown envelope → false (eligibility gate handles unknown); the approval gate only blocks KNOWN-destructive.
- **`synthesizeNextPrompt` surfaces `Next transition: <transition_id> (to: <state>)` when `postWorkState` is provided.** Framework-neutral: `transition_id` comes from `WORKFLOW_TRANSITIONS` policy data, never a hardcoded framework slash. Backward-compat: no `Next transition:` line when `postWorkState` is absent (preserves the wave-1/wave-2 contract).
- **Approval tokens are session-scoped per A3.** No new data file in `~/.claude/router/` — verified post-execution (no `approval*.json` or `tokens*.json` created).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `verifyApproval` success `reason_code` was `approval_verified` (wave-1 stub) instead of `approval_bound` (EXEC-08 must_have)**
- **Found during:** Task 23-03-01 RED
- **Issue:** The wave-1 stub returned `reason_code: 'approval_verified'` on success, but the plan's must_haves explicitly name `approval_bound` as the success reason_code.
- **Fix:** Changed the success `reason_code` to `approval_bound` in the GREEN commit. The RED test asserted `approval_bound`, so this was caught at RED and fixed at GREEN.
- **Files modified:** src/orchestrator/approval.mjs
- **Verification:** `rtk node --test tests/router.approval.test.mjs` 16/16 green.
- **Committed in:** c2dbe8f (Task 1 GREEN)

**2. [Rule 1 - Bug] `verifyApproval` lacked the `expected` (stale) leg entirely**
- **Found during:** Task 23-03-01 RED
- **Issue:** The wave-1 stub only checked `presented.token !== bound.token` (mismatch). The must_haves require a separate `approval_stale` leg: `bound.token !== expected` (re-derived from current args/targets/effects/version). Without it, a stale approval (bumped proposalVersion or changed args) would be accepted as long as the presented token matched the bound one.
- **Fix:** Added an `expected` parameter (accepts a hex string or `{ token: <hex> }`); when provided and `bound.token !== expected`, return `approval_stale`. The caller re-derives `expected` via `bindApproval` over the current dispatch inputs so the stale check is anchored to fresh state (T-23-04, T-23-08).
- **Files modified:** src/orchestrator/approval.mjs
- **Verification:** 16/16 approval + 16/16 dispatch-integration green; proposalVersion-bump and args-change boundary tests pass.
- **Committed in:** c2dbe8f (Task 1 GREEN)

**3. [Rule 1 - Bug] Dispatch helper returned the classifier's `explain_marker` instead of the action-mapper's `intent_not_execute` for non-execute intents**
- **Found during:** Task 23-03-02 RED
- **Issue:** The initial dispatch helper short-circuited non-execute intents with `intent.reason_code` (`explain_marker`), but the wave-1 dispatch contract asserts `intent_not_execute` (the action-mapper's vocabulary).
- **Fix:** Removed the short-circuit; the helper now delegates the intent gate to `resolveAction`, which returns `intent_not_execute` for non-execute intents. This preserves the wave-1 contract and keeps the reason_code vocabulary stable.
- **Files modified:** tests/router.dispatch-integration.test.mjs (dispatch helper only)
- **Verification:** 16/16 dispatch-integration green; the non-execute test asserts `intent_not_execute`.
- **Committed in:** c1aac13 (Task 2 GREEN)

---

**Total deviations:** 3 auto-fixed (3 × Rule 1 — wave-1 stub gaps the plan's must_haves closed: success reason_code, stale leg, intent-gate vocabulary)
**Impact on plan:** All three were catches at RED, fixed at GREEN. No scope creep. No plan instructions overridden.

## Issues Encountered
None.

## User Setup Required
None — Phase 23 ships pure modules + tests only; no prompt-hook wiring (deferred to Phase 26 REL-01/REL-02). Approval tokens are session-scoped per A3; no new data file in `~/.claude/router/`.

## Next Phase Readiness
- The four-gate dispatch boundary (eligible → intent → state → approval) is complete and composable. Phase 26 (REL-01/REL-02) can wire it into the `UserPromptSubmit` hook path.
- `synthesizeNextPrompt` re-reads fresh post-work state — ready for the post-dispatch next-prompt emission in Phase 26.
- `verifyApproval`'s `expected` leg anchors the stale check to fresh state — Phase 24/25 can mint the bound token at proposal time and verify at dispatch time without re-deriving inside the gate.
- No blockers. Phase 22 contract-eligibility + contracts + relationships regression stays green (32/32); full Phase 23 suite 63/63 green.

## TDD Gate Compliance
- Task 23-03-01: RED `35e365f` (test) → GREEN `c2dbe8f` (feat) — gates satisfied.
- Task 23-03-02: RED `dff3e6b` (test) → GREEN `c1aac13` (feat) — gates satisfied.
- No REFACTOR commit needed — minimal modules required no post-GREEN cleanup.

## Self-Check: PASSED

All 4 created/modified files exist on disk:
- `tests/router.approval.test.mjs` — FOUND
- `src/orchestrator/approval.mjs` — FOUND
- `src/orchestrator/next-prompt.mjs` — FOUND
- `tests/router.dispatch-integration.test.mjs` — FOUND

All 4 task commits exist in git log:
- `35e365f` — FOUND (test 23-03 RED approval)
- `c2dbe8f` — FOUND (feat 23-03 GREEN approval)
- `dff3e6b` — FOUND (test 23-03 RED dispatch)
- `c1aac13` — FOUND (feat 23-03 GREEN dispatch)

Done-gate grep: `grep -c 'gsd-' src/orchestrator/{actions,next-prompt,approval}.mjs` = 0/0/0. Full Phase 23 suite 63/63 green; Phase 22 regression 32/32 green. No new data file in `~/.claude/router/` (A3 backstop).

---
*Phase: 23-intent-safe-state-aware-execution*
*Plan: 03*
*Completed: 2026-07-27*