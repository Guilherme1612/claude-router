---
phase: 15-context-capsules-and-workflow-state-recovery
plan: 03
subsystem: context
tags: [resume, override, cli, user-prompt-submit, privacy, recovery]
requires:
  - phase: 15-context-capsules-and-workflow-state-recovery
    provides: versioned capsules and bounded authoritative recovery sources
provides:
  - Deterministic context action resolver with canonical outcomes and reason codes
  - JSON-first context status, refresh, resolve, and why-next controller routes
  - Live UserPromptSubmit recovery before referential routing
affects: [phase-16, workflow-selection, capability-routing, router-runtime]
tech-stack:
  added: []
  patterns: [pure-outcome-algebra, explicit-first-precedence, exactly-one-dispatch-gate, context-candidate-lazy-load]
key-files:
  created: [src/context/resolve.mjs, src/context/prompt-route.mjs, tests/router.context-resume.test.mjs, tests/router.context-prompt-integration.test.mjs]
  modified: [src/cli/router-control.mjs, tests/router.control-cli.test.mjs, src/lifecycle/router-lifecycle.mjs, tests/router.lifecycle.test.mjs]
key-decisions:
  - "Referential prompts dispatch only one non-terminal workflow; every zero, multiple, incomplete, or terminal case returns one focused non-dispatchable clarification."
  - "Explicit replacements retain only bounded prior identity, status, and reason metadata and never merge prior goal text."
  - "The installed hook lazy-loads recovery modules only for context-candidate prompts so ordinary pass-through retains the sub-100ms gate."
patterns-established:
  - "Resolution is pure and side-effect-free; persistence happens only in CLI and prompt orchestration adapters after a dispatchable unique result."
  - "Installed controller bundles carry their full context-module dependency graph in both runtime roots."
requirements-completed: [CTX-02, ORC-02]
coverage:
  - id: D1
    description: "Deterministic resume, ambiguity, terminal, refresh, and explicit-override outcome algebra"
    requirement: "CTX-02"
    verification:
      - kind: unit
        ref: "tests/router.context-resume.test.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Privacy-safe JSON controller routes inspect, resolve, explain, and atomically refresh context"
    requirement: "ORC-02"
    verification:
      - kind: integration
        ref: "tests/router.control-cli.test.mjs#context CLI"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real UserPromptSubmit process resolves referential context before normal routing without double injection"
    requirement: "CTX-02"
    verification:
      - kind: e2e
        ref: "tests/router.context-prompt-integration.test.mjs#real UserPromptSubmit hook"
        status: pass
    human_judgment: false
duration: 55min
completed: 2026-07-16
status: complete
---

# Phase 15 Plan 03: Deterministic Workflow Recovery Summary

**Minimal referential prompts now resume exactly one active workflow, safely clarify ambiguity, and honor complete explicit overrides through the controller and live hook.**

## Performance

- **Duration:** 55 min
- **Completed:** 2026-07-16
- **Tasks:** 3
- **Files modified:** 8 repository files plus the owned installed hook and module bundle

## Accomplishments

- Added byte-stable canonical `resume`, `clarify`, `override`, `refresh`, and `none` outcomes with exactly-one dispatch eligibility and terminal-state protection.
- Added context status, refresh, resolve, and why-next CLI routes with stable JSON/exit taxonomy and atomic writes only after unique recovery.
- Integrated the actual UserPromptSubmit runtime before normal referential routing with bounded single injection, fail-open behavior, privacy canaries, and lazy module loading.
- Bundled context dependencies into both installed controller runtime roots and preserved all prior calibration, lifecycle, and latency gates.

## Task Commits

1. **Task 1: Implement deterministic resume, ambiguity, and override resolution** - `481a9bb`
2. **Task 2: Wire context inspection, refresh, and resolution into the control CLI** - `b88e4f5`
3. **Task 3: Integrate deterministic recovery into the live UserPromptSubmit routing path** - `3a0d559`
4. **Deviation fixes: Preserve routing and bundle context dependencies** - `506f4ed`

## Files Created/Modified

- `src/context/resolve.mjs` - Pure canonical context outcome resolver.
- `src/context/prompt-route.mjs` - Bounded capsule/source/resolve/save orchestration adapter.
- `src/cli/router-control.mjs` - Context inspection and recovery commands.
- `src/lifecycle/router-lifecycle.mjs` - Complete context dependency installation in both runtimes.
- `tests/router.context-resume.test.mjs` - Resolver transition and permutation matrix.
- `tests/router.context-prompt-integration.test.mjs` - Adapter and real hook-process fixtures.
- `tests/router.control-cli.test.mjs` - JSON, exit-code, mutation, and privacy integration gates.
- `tests/router.lifecycle.test.mjs` - Installed module-graph completeness gate.

## Decisions Made

- Stable scope, goal ID, workflow position, and status determine eligibility; labels never determine continuity.
- Missing active context does not hijack ordinary explicit-looking prompts; it passes through to established routing.
- Referential recovery owns one bounded sentinel injection and prevents normal route double-injection.
- Context modules are loaded only for candidate prompts, preserving ordinary hook startup performance.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented missing context from hijacking calibration and ordinary routing**
- **Found during:** Repository-wide verification
- **Issue:** A complete-looking prompt could produce an override outcome even when no capsule existed.
- **Fix:** Explicit instructions pass through when active context is missing; referential prompts still clarify.
- **Verification:** Calibration and context integration tests pass.
- **Committed in:** `506f4ed`

**2. [Rule 2 - Missing Critical] Bundled new controller dependencies**
- **Found during:** Repository-wide lifecycle verification
- **Issue:** Installed `router-control.mjs` imported context modules that the lifecycle bundle did not copy.
- **Fix:** Added all four context modules to both Claude and Codex runtime bundles and ownership manifests.
- **Verification:** `tests/router.lifecycle.test.mjs` passes 20/20.
- **Committed in:** `506f4ed`

**3. [Rule 1 - Performance Bug] Removed eager hot-path module loading**
- **Found during:** Repository-wide performance verification
- **Issue:** Eager context imports increased trivial process wall time beyond 100 ms.
- **Fix:** The installed hook now loads the adapter only for bounded context-candidate prompts and passes the result into synchronous `inspectDecision`.
- **Verification:** `tests/router.perf.test.mjs` passes 3/3 and the full suite passes.
- **Runtime artifact:** `/Users/guilherme/.claude/hooks/router.mjs`

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical dependency).
**Impact on plan:** All fixes were required for correctness, install completeness, or the existing latency contract; no capability-selection scope was added.

## Issues Encountered

- The live hook and owned context modules are outside the workspace sandbox; reviewed copies were installed through the normal escalation path.
- Full-suite concurrency initially produced transient wall-clock latency failures; the isolated latency gate and final full suite both passed after lazy loading.

## User Setup Required

None - the owned runtime hook and local modules are already installed; no external services or dependencies were added.

## Next Phase Readiness

Phase 16 can consume one bounded resolver-owned next workflow action after context recovery without reimplementing identity, precedence, ambiguity, or terminal-state rules.

## Verification

- Plan-focused recovery suite - 53/53 passed.
- `tests/router.lifecycle.test.mjs` - 20/20 passed.
- `tests/router.perf.test.mjs` - 3/3 passed.
- `node --test tests/*.test.mjs` - 526/526 passed.

## Self-Check: PASSED

- All created repository files and installed runtime artifacts exist.
- Task commits `481a9bb`, `b88e4f5`, `3a0d559`, and deviation commit `506f4ed` exist.
- Focused, lifecycle, latency, calibration, fail-open, and repository-wide verification pass.

---
*Phase: 15-context-capsules-and-workflow-state-recovery*
*Completed: 2026-07-16*
