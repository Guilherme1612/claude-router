---
phase: 23-intent-safe-state-aware-execution
plan: 02
subsystem: orchestration
tags: [intent-adversarial, action-mapper, debug-verb, create-phase-verb, blocked-vocabulary, framework-neutral, node-test, stdlib-only]

# Dependency graph
requires:
  - phase: 23-intent-safe-state-aware-execution
    provides: classifyIntent 8-disposition matrix, resolveAction next-phase tracer, synthesizeNextPrompt
  - phase: 22-conservative-contracts-and-relationship-graph
    provides: contract.fields.workflow_transitions/purpose/triggers envelopes, evaluateEligibility, stableCapabilityId
  - phase: 19-compiled-prompt-routing-and-safe-evolution
    provides: nextValidTransitions freshness/terminal/gates gating, WORKFLOW_TRANSITIONS policy
provides:
  - "classifyIntent adversarial hardening — multilingual abstention guard, nested-quote/triple-backtick detection, debug-verb (bug/troubleshoot) recognition"
  - "resolveAction three-verb resolution — next_phase (EXEC-02), debug via contract purpose/triggers (EXEC-03), create_phase via roadmap-derived next_number + topic (EXEC-04)"
  - "Full blocked/clarify vocabulary — authoritative_evidence_stale, terminal_workflow, dependency_unavailable, no_eligible_capability, material_capability_tie"
  - "synthesizeNextPrompt with structured args (next_number, topic) — framework-neutral for all three verbs (EXEC-10)"
affects: [23-03-approval-gate-and-dispatch-matrix, 24-privacy-safe-outcomes-and-capability-health, 26-coherent-publication-and-dual-runtime-release]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multilingual abstention guard: accented Latin-1 chars + Spanish/Portuguese function-word tokens → ambiguous before execute (INT-06)"
    - "Nested-quote detection: single-quoted phrase with interior space (excludes apostrophes like don't) + triple-backtick fenced blocks → quoted"
    - "Verb-family parsing in resolveAction from prompt text (next_phase | debug | create_phase); prompt absent → next_phase default for backward compat"
    - "Contract-only authority: debug verb matches contract.fields.purpose/triggers (state=known) DEBUG_TOKENS; create_phase matches workflow_transitions candidate whose to==='plan' — no hardcoded framework command"
    - "Structured args propagation: resolveAction returns args={next_number,topic}; synthesizeNextPrompt surfaces them as key=value pairs (no slash hardcode)"
    - "nextValidTransitions reused (not reimplemented) for freshness/terminal/dependency gating across all three verbs; dependency_unsafe mapped to dependency_unavailable (EXEC-06 vocabulary)"

key-files:
  created:
    - tests/router.intent-adversarial.test.mjs
    - tests/router.actions.test.mjs
  modified:
    - src/intent/classify.mjs
    - src/orchestrator/actions.mjs
    - src/orchestrator/next-prompt.mjs

key-decisions:
  - "Verb parsing lives in resolveAction (not classifyIntent) — classify.mjs stays a pure 8-disposition classifier; actions.mjs owns the verb→capability mapping from the raw prompt"
  - "resolveAction signature expanded to { intent, prompt, state, registry, roadmap }; prompt absent defaults to next_phase verb (preserves the 23-01 tracer contract)"
  - "Debug verb is a semantic-category match (contract purpose/triggers), NOT a next-transition action — only the freshness/terminal/dependency gate applies, candidates_available is not required"
  - "create_phase verb requires a plan candidate (to==='plan') among nextValidTransitions; the transition_id is read from policy data, not hardcoded as a command (EXEC-01 framework-neutral)"
  - "dependency_unsafe from nextValidTransitions is surfaced as dependency_unavailable (EXEC-06 action-mapper vocabulary); dependency_conflict remains reserved for closure-level conflicts (not exercised here)"
  - "Classifier gained bug/troubleshoot execute verbs so 'there is a bug' dispatches as execute intent — required for the debug action-mapper path to be reachable"

patterns-established:
  - "Pattern: adversarial corpus is the spec (INT-06) — RED failures fixed by tightening classifier precedence/regex, never by loosening corpus"
  - "Pattern: negative invocation assertion — a spy on resolveAction is never called for non-execute dispositions (the dispatch boundary gates on dispatch_eligible)"
  - "Pattern: framework-neutral grep done-gate — grep -c 'gsd-' src/orchestrator/{actions,next-prompt}.mjs must return 0"

requirements-completed: [INT-03, INT-06, EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-06, EXEC-10]

coverage:
  - id: A1
    description: "Adversarial minimal pairs produce opposite dispatch_eligible; negative member never dispatches"
    requirement: INT-06
    verification:
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] minimal pairs produce opposite dispatch_eligible"
        status: pass
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] no non-execute corpus member has dispatch_eligible=true"
        status: pass
    human_judgment: false
  - id: A2
    description: "Nested quotations, mixed negation, corrections, conditional language classify as non-execute with dispatch_eligible=false"
    requirement: INT-06
    verification:
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] nested quotations and code blocks classify as quoted"
        status: pass
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] mixed negation classifies as negated (negation wins)"
        status: pass
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] corrections classify as negated (newest token wins)"
        status: pass
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] conditional language classifies as hypothetical"
        status: pass
    human_judgment: false
  - id: A3
    description: "Multilingual prompts (Spanish + Portuguese) with execute-like verbs classify as ambiguous/abstain, never execute"
    requirement: INT-06
    verification:
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] multilingual prompts abstain (ambiguous, never execute)"
        status: pass
    human_judgment: false
  - id: A4
    description: "Negative invocation assertion — resolveAction is never called for non-execute dispositions (unsafe targets never dispatch)"
    requirement: INT-03
    verification:
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] negative invocation assertion — resolveAction never called for non-execute dispositions"
        status: pass
      - kind: adversarial
        ref: "tests/router.intent-adversarial.test.mjs#[phase23-red:intent-adversarial] unsafe targets never dispatch"
        status: pass
    human_judgment: false
  - id: A5
    description: "resolveAction reads contract.fields.workflow_transitions of installed capabilities only — no hardcoded framework command names (grep gsd- = 0)"
    requirement: EXEC-01
    verification:
      - kind: manual-grep
        ref: "grep -c 'gsd-' src/orchestrator/actions.mjs → 0"
        status: pass
    human_judgment: false
  - id: A6
    description: "'go to the next phase' against fresh state with one eligible transition selects one capability"
    requirement: EXEC-02
    verification:
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] go to the next phase selects one eligible capability (next-phase verb)"
        status: pass
    human_judgment: false
  - id: A7
    description: "'debug this' / 'there is a bug' maps to debugging semantic category and selects the compatible debugging capability by contract purpose/triggers"
    requirement: EXEC-03
    verification:
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] debug this maps to the debugging semantic category and selects the debug capability (EXEC-03)"
        status: pass
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] there is a bug selects the troubleshooting capability (EXEC-03 bug verb)"
        status: pass
    human_judgment: false
  - id: A8
    description: "'create a phase about X' derives next phase number from roadmap and invokes the phase-creation capability with the topic as structured argument"
    requirement: EXEC-04
    verification:
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] create a phase about X derives next number from roadmap and passes topic as structured arg (EXEC-04)"
        status: pass
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] create a phase is idempotent on a frozen roadmap fixture (same next number)"
        status: pass
    human_judgment: false
  - id: A9
    description: "Ties → clarify material_capability_tie (never first-wins); stale/terminal/missing-dep/empty → blocked with exact reason codes"
    requirement: EXEC-06
    verification:
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] tie — two eligible capabilities for one transition produce clarify, never first-wins (EXEC-06, Pitfall 5)"
        status: pass
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] stale state blocks with authoritative_evidence_stale (EXEC-06)"
        status: pass
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] terminal workflow blocks with terminal_workflow (EXEC-06)"
        status: pass
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] missing dependency blocks with dependency_unavailable (EXEC-06)"
        status: pass
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] empty registry for the transition blocks with no_eligible_capability (EXEC-01/06)"
        status: pass
    human_judgment: false
  - id: A10
    description: "synthesizeNextPrompt returns a framework-neutral ready-to-use prompt built from the selected capability's invocation shape — no hardcoded /gsd- slash"
    requirement: EXEC-10
    verification:
      - kind: unit
        ref: "tests/router.actions.test.mjs#[phase23-red:actions] synthesizeNextPrompt emits no framework slash for next-phase, debug, or create-phase selections (EXEC-10)"
        status: pass
      - kind: manual-grep
        ref: "grep -c 'gsd-' src/orchestrator/next-prompt.mjs → 0"
        status: pass
    human_judgment: false

# Metrics
duration: 4min
completed: 2026-07-27
status: complete
---

# Phase 23 Plan 02: Adversarial Intent Corpus + Action Mapper Verbs Summary

**Adversarial intent corpus (minimal pairs, nested quotes, multilingual abstention, unsafe targets) + action mapper expanded to debug/create-phase verbs with the full blocked/clarify reason-code vocabulary, all framework-neutral via contract-only authority**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-27T09:02:27Z
- **Completed:** 2026-07-27T09:06:30Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- Adversarial corpus hardens the classifier against minimal pairs (4 pairs, opposite dispatch_eligible), nested single-quote/triple-backtick quotations, mixed negation (negation wins), corrections (newest token wins), conditional language, multilingual abstention (Spanish + Portuguese execute-like verbs → ambiguous), and unsafe targets — all with dispatch_eligible=false
- Negative invocation assertion holds: a spy on resolveAction is never called for any non-execute disposition in the corpus (INT-06)
- resolveAction parses three verb families from the prompt: next_phase (default, EXEC-02), debug via contract.fields.purpose/triggers semantic match (EXEC-03), create_phase via roadmap-derived next_number + extracted topic passed as structured args (EXEC-04)
- Full blocked/clarify vocabulary: material_capability_tie (clarify, never first-wins), authoritative_evidence_stale, terminal_workflow, dependency_unavailable, no_eligible_capability — all with exact stable reason codes (EXEC-06)
- synthesizeNextPrompt surfaces structured args (next_number, topic) as key=value pairs for the create-phase verb, framework-neutral for all three verbs (no /gsd- slash)
- grep -c 'gsd-' = 0 in both actions.mjs and next-prompt.mjs; Phase 22 regression stays green (13/13); full plan verification 44/44 green

## Task Commits

Each task was committed atomically (TDD: RED test commit → GREEN implementation commit):

1. **Task 23-02-01 (adversarial corpus):**
   - `9128b52` (test) — RED: adversarial intent corpus (minimal pairs, nested quotes, multilingual, unsafe targets, negative invocation assertion)
   - `f35169d` (feat) — GREEN: multilingual abstention guard + nested-quote/triple-backtick detection in classify.mjs
2. **Task 23-02-02 (action mapper verbs):**
   - `7b33058` (test) — RED: action mapper unit tests for debug/create-phase verbs + blocked/clarify vocabulary + framework-neutral next-prompt
   - `25fbbc6` (feat) — GREEN: resolveAction three-verb parsing, contract-only debug/create-phase matching, structured args, next-prompt args expansion, classifier bug/troubleshoot execute verbs

## Files Created/Modified
- `tests/router.intent-adversarial.test.mjs` — 9 adversarial tests covering minimal pairs, nested quotes, mixed negation, corrections, conditional, multilingual abstention, unsafe targets, non-execute guard, and the negative invocation assertion
- `tests/router.actions.test.mjs` — 12 unit tests covering next-phase, debug (purpose/triggers), create-phase (roadmap next_number + topic), tie/stale/terminal/missing-dep/empty blocked vocabulary, and framework-neutral next-prompt for all three verbs
- `src/intent/classify.mjs` — multilingual abstention guard (MULTILINGUAL regex before execute), nested-quote/triple-backtick detection in QUOTED, bug/troubleshoot added to EXECUTE_VERB
- `src/orchestrator/actions.mjs` — resolveAction expanded with parseVerb (next_phase/debug/create_phase), collectDebugCandidates (contract purpose/triggers), create_phase plan-candidate matching, deriveNextNumber, full blocked/clarify reason-code vocabulary, nextValidTransitions reused for gating
- `src/orchestrator/next-prompt.mjs` — synthesizeNextPrompt accepts args and surfaces them as key=value pairs (framework-neutral, no slash hardcode)

## Decisions Made
- **Verb parsing in resolveAction, not classifyIntent.** classify.mjs stays a pure 8-disposition classifier; actions.mjs owns the verb→capability mapping from the raw prompt. Rationale: the disposition is framework-level (execute vs explain), the verb is action-level (next vs debug vs create) — separate concerns.
- **resolveAction signature expanded to `{ intent, prompt, state, registry, roadmap }`.** `prompt` absent defaults to the next_phase verb (preserves the 23-01 tracer contract — `resolveAction({ intent, state, registry })` still works). `roadmap` optional, only consumed by the create_phase verb.
- **Debug verb is a semantic-category match, not a next-transition action.** Only the freshness/terminal/dependency gate from nextValidTransitions applies; candidates_available is NOT required (debugging is not a "next workflow transition"). Capabilities are matched by `contract.fields.purpose`/`triggers` (state=known) containing debug/troubleshooting tokens.
- **create_phase verb identifies the plan candidate via `to === 'plan'`.** Framework-neutral: the transition_id is read from the nextValidTransitions candidates (policy data), not hardcoded as a command. next_number derived from `roadmap.current_max_phase + 1` (or `state.position.phase + 1` fallback).
- **`dependency_unsafe` mapped to `dependency_unavailable`.** nextValidTransitions returns `dependency_unsafe`; the action-mapper surfaces it as `dependency_unavailable` per the EXEC-06 vocabulary in the plan's done-gate. `dependency_conflict` remains reserved for closure-level conflicts (not exercised by this plan's tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `bug`/`troubleshoot` to the classifier's EXECUTE_VERB**
- **Found during:** Task 23-02-02 GREEN
- **Issue:** The plan's behavior says "'there is a bug' / 'debug this' maps to the debugging semantic category" but the 23-01 classifier's EXECUTE_VERB only included `debug` — `bug` and `troubleshoot` were absent, so "there is a bug in the watcher" classified as `ambiguous` (dispatch_eligible=false), blocking the action mapper's debug path before it could run.
- **Fix:** Added `bug` and `troubleshoot` to EXECUTE_VERB in `src/intent/classify.mjs`. The adversarial corpus and the existing intent matrix both stayed green (neither contains `bug`/`troubleshoot` in a way that would regress).
- **Files modified:** src/intent/classify.mjs (EXECUTE_VERB regex — two tokens added)
- **Verification:** 12/12 actions + 9/9 adversarial + 10/10 intent + 13/13 phase-22 all green.
- **Committed in:** 25fbbc6 (Task 23-02-02 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 × Rule 1 — classifier verb recognition gap blocking the action mapper's debug path)
**Impact on plan:** Additive, two regex tokens. No scope creep. No plan instructions overridden.

## Issues Encountered
None.

## User Setup Required
None — Phase 23 ships pure modules + tests only; prompt-hook wiring is deferred to Phase 26 (REL-01/REL-02).

## Next Phase Readiness
- The adversarial corpus and the three-verb action mapper are ready for Plan 03 (destructive approval path wiring + full dispatch matrix).
- resolveAction now accepts `prompt` and `roadmap` inputs; Plan 03's dispatch-integration expansion can feed them end-to-end.
- The blocked/clarify vocabulary (`authoritative_evidence_stale`, `terminal_workflow`, `dependency_unavailable`, `no_eligible_capability`, `material_capability_tie`) is in place for Plan 03's destructive-without-approval → blocked path.
- No blockers. Phase 22 contract-eligibility + contracts tests remain green (13/13); full plan verification 44/44 green.

## TDD Gate Compliance
- Task 23-02-01: RED `9128b52` (test) → GREEN `f35169d` (feat) — gates satisfied.
- Task 23-02-02: RED `7b33058` (test) → GREEN `25fbbc6` (feat) — gates satisfied.
- No REFACTOR commit needed — minimal modules required no post-GREEN cleanup.

---
*Phase: 23-intent-safe-state-aware-execution*
*Plan: 02*
*Completed: 2026-07-27*

## Self-Check: PASSED

All 5 created/modified source/test files exist on disk; all 4 task commits (9128b52, f35169d, 7b33058, 25fbbc6) exist in git log; SUMMARY.md present. Done-gate grep: `grep -c 'gsd-' src/orchestrator/actions.mjs` = 0, `grep -c 'gsd-' src/orchestrator/next-prompt.mjs` = 0. Full plan verification 44/44 green; Phase 22 regression 13/13 green.