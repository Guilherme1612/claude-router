---
phase: 15-context-capsules-and-workflow-state-recovery
verified: 2026-07-16T13:47:38Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 15: Context Capsules and Workflow-State Recovery Verification Report

**Phase Goal:** Users can resume a uniquely identifiable active workflow with minimal referential prompts and no raw prompt-history persistence.
**Verified:** 2026-07-16T13:47:38Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | A bounded capsule persists active goal, workflow position, artifact references, blockers, and freshness without raw prompts or full documents. | ✓ VERIFIED | `src/context/capsule.mjs` uses a strict allowlist, deterministic limits, schema validation, safe references, private diagnostics, and active-plus-one-LKG persistence. Capsule tests exercise prompt/transcript/credential/tool-output canaries and pass. |
| 2 | Capsule bounds and omissions are deterministic and observable. | ✓ VERIFIED | `CAPSULE_LIMITS`, canonical ordering, `truncated`, and `omitted_count` are implemented and exercised by `router.context-capsule.test.mjs`. |
| 3 | Capsule persistence is atomic, contained, and recoverable from corrupt active bytes. | ✓ VERIFIED | `saveCapsule` performs guarded temporary write, sync, rename, and LKG rotation; tests cover corrupt active recovery, symlink roots/targets, unsafe paths, and absence of temporary history. |
| 4 | Live and authoritative state outrank capsule hints, using only bounded exact-path local reads. | ✓ VERIFIED | `src/context/sources.mjs` exposes exact STATE/ROADMAP/artifact/design/execution/git adapters and explicit > live > authoritative > capsule assembly. Seven source tests pass, including no recursive enumeration and privacy ceilings. |
| 5 | Stale or corrupt capsule evidence is detected rather than silently trusted. | ✓ VERIFIED | Witness comparison distinguishes fresh, stale, and corrupt; prompt adapter refresh and corrupt/LKG paths are behaviorally tested. |
| 6 | `continue`, `finish it`, and `use the design` recover exactly one eligible workflow with phrase-specific semantics. | ✓ VERIFIED | Resolver and real UserPromptSubmit tests exercise all three phrases and expected actions; focused verification passed 77/77. |
| 7 | Zero or multiple eligible workflows yield exactly one focused clarification and no dispatch. | ✓ VERIFIED | Resolver tests cover zero/multiple candidates and adapter tests assert non-dispatchable focused context. |
| 8 | A complete explicit instruction overrides conflicting capsule intent without merging prior goal or raw prompt state. | ✓ VERIFIED | Resolver test asserts `explicit_instruction_override` and bounded supersession containing only identity/status/reason. |
| 9 | An incomplete explicit conflict does not dispatch, and terminal workflows do not reopen referentially. | ✓ VERIFIED | Named resolver and prompt-adapter tests exercise incomplete override, completed terminal state, clarification, and `dispatch_eligible: false`. |
| 10 | Recovery is wired into the installed hook before normal routing without double injection or ordinary hot-path regression. | ✓ VERIFIED | Live hook calls lazy `loadContextRecovery` before `inspectDecision`; installed context/schema hashes exactly match repository sources. Real-hook, fail-open, lifecycle, and performance gates pass. |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/context/capsule.mjs` | Capsule schema, privacy, identity, bounds, persistence | ✓ VERIFIED | Substantive and imported by CLI/prompt adapter. |
| `src/context/sources.mjs` | Bounded authoritative readers and freshness evidence | ✓ VERIFIED | Substantive and called by prompt adapter. |
| `src/context/resolve.mjs` | Pure deterministic outcome algebra | ✓ VERIFIED | Substantive and called by CLI/prompt adapter. |
| `src/context/prompt-route.mjs` | Load → source snapshot → resolve → optional save orchestration | ✓ VERIFIED | All three context modules imported and used. |
| `src/cli/router-control.mjs` | Context status/refresh/resolve/why-next routes | ✓ VERIFIED | CLI imports capsule/resolver and has passing integration tests. |
| `/Users/guilherme/.claude/hooks/router.mjs` | Live lazy prompt-path integration | ✓ VERIFIED | Exists (127,563 bytes); loads installed prompt adapter only for bounded candidates. |
| Phase context test files | Behavioral coverage | ✓ VERIFIED | Capsule, sources, resolver, prompt integration, CLI, lifecycle, fail-open, and performance tests pass in focused run. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `capsule.mjs` / `sources.mjs` / `resolve.mjs` | `registry/schema.mjs` | Canonical stable serialization | ✓ WIRED | All import and call `stableStringify`. |
| `prompt-route.mjs` | Capsule + sources + resolver | Load, bounded snapshot, resolve, conditional atomic save | ✓ WIRED | Literal imports and calls confirmed. |
| `router-control.mjs` | Capsule + resolver | Context command execution | ✓ WIRED | Literal imports and behavior tests confirmed. |
| Installed `router.mjs` | Installed `context/prompt-route.mjs` | Lazy pre-routing load | ✓ WIRED | `loadContextRecovery` executes before `inspectDecision`; real subprocess test passes. |
| `router-lifecycle.mjs` | Installed context dependency graph | Install ownership bundle | ✓ WIRED | All four modules listed in lifecycle bundle; installed hashes match repository sources. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase recovery, privacy, CLI, installed integration, lifecycle, fail-open, latency | `node --test` over nine focused phase/safety files | 77/77 passed | ✓ PASS |
| Full repository regression | `node --test tests/*.test.mjs` | 523/526 passed in this parallel run; all phase-focused, lifecycle, fail-open, and performance tests passed independently. The executor baseline was 526/526. | ⚠️ WARNING |

The repository-wide run emitted three failures only under full parallel load, but its captured output was truncated before the failing names. Per the one-full-suite-run verification rule it was not repeated. This does not contradict a Phase 15 truth because every modified surface and its inherited safety/latency gates passed in the independent 77-test run, but it should be watched in the next repository-wide CI run.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| CTX-01 | 15-01, 15-02 | Bounded privacy-safe capsule state | ✓ SATISFIED | Capsule and source modules plus 13 focused contract tests. |
| CTX-02 | 15-02, 15-03 | Minimal prompts resume a uniquely identifiable workflow | ✓ SATISFIED | Resolver, prompt adapter, real hook, and CLI behavior tests. |
| ORC-02 | 15-03 | Explicit instructions override stale/conflicting capsule state | ✓ SATISFIED | Explicit override and incomplete-conflict tests plus bounded supersession. |

No Phase 15 requirements are orphaned.

### Anti-Patterns and Disconfirmation Pass

| Finding | Severity | Assessment |
|---|---|---|
| Automated key-link query reports convention-level false negatives where plan links describe reused patterns rather than literal module imports. | ℹ️ Info | Manual call-graph verification confirms the functional links; literal runtime links are wired. |
| Full parallel suite returned 523/526 once, while the 77 focused safety/phase tests passed. | ⚠️ Warning | Exact failing names were lost to output truncation; do not treat the executor's 526/526 narration as current evidence. Recheck in normal CI. |
| No `TBD`, `FIXME`, or `XXX` debt markers exist in Phase 15 production/test surfaces. | ℹ️ Info | No blocker anti-patterns found. |
| Potential error path checked: installed runtime module drift or missing dependency. | ℹ️ Info | Lifecycle test passes and SHA-256 hashes for all installed context modules plus `schema.mjs` exactly match repository sources. |

### Human Verification Required

None. Every state-transition, ordering, refresh, override, terminal, and prompt-integration truth has a passing behavioral test.

### Gaps Summary

No Phase 15 goal gaps found. The bounded capsule, authoritative refresh, explicit precedence, ambiguity gate, terminal protection, CLI routes, and installed prompt path are substantive, wired, and behaviorally exercised. The only non-blocking observation is the unreproduced three-test failure count from one full parallel run; all Phase 15 and inherited safety gates passed independently.

---

_Verified: 2026-07-16T13:47:38Z_
_Verifier: the agent (gsd-verifier generic-agent workaround)_
