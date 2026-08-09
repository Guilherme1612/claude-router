---
phase: 38-cross-runtime-native-feasibility
plan: 03
requirements-completed: [HOST-04]
subsystem: native-dispatch
tags: [host-04, budget, latency, tokens, invariants, deploy-bundle, fail-open, tdd]
requires:
  - src/runtime/router.mjs (triggerNativeDispatch :2384-2398, tokenCount :2811-2813, ROUTER_DEBUG_LATENCY :3842-3844, off-hot-path trigger wired in main() :3839 — Plan 01)
  - src/adapters/dispatch/contract.mjs (createDispatchAdapter factory — Plan 01)
  - src/adapters/dispatch/receipt.mjs (ReceiptStore, defaultReceiptRoot — Plan 01)
  - src/adapters/dispatch/claude.mjs (Claude adapter — Plan 01)
  - src/adapters/dispatch/codex.mjs (Codex adapter — Plan 02)
  - tests/phase-38/fixtures/harmless.mjs (deterministic fixture — Plan 01)
  - tests/phase-38/{native-dispatch,claude-adapter,codex-adapter,recommendation-only}.test.mjs (Plans 01/02)
  - tests/router.perf.test.mjs (spawnSync hook driver + ROUTER_DEBUG_LATENCY hrtime pattern)
  - src/lifecycle/router-lifecycle.mjs (moduleNames :384-409, gateFixtureNames :436-450, moduleValues flatMap deploys to both ownedRoot + codexOwnedRoot)
provides:
  - tests/phase-38/budget.test.mjs (HOST-04 latency/token budget + read-only/fail-open invariants with boundary, precision, and concurrency edges)
  - Deploy bundle update shipping dispatch adapters + receipt module + harmless fixture + five phase-38 tests to both runtime trees (closes Plan 01 Assumption A4)
affects:
  - HOST-04 (satisfied: warm p95<=25ms, p99<=50ms, max<100ms; startup p95<=50ms; injection <=120 tokens; no spawn/scan/hash/network/LLM/mutation/learning on the prompt path; fail-open preserved; budget test green at and beyond exact thresholds)
  - src/lifecycle/router-lifecycle.mjs (moduleNames + gateFixtureNames additions — the only source change this plan)
  - tests/router.lifecycle.test.mjs (deployed-file count 231 -> 259, Rule 3 blocking fix)
tech-stack:
  added:
    - process.hrtime.bigint() latency measurement via ROUTER_DEBUG_LATENCY=1 stderr debug line (reuse router.perf.test.mjs pattern)
    - Nearest-rank percentile (p95/p99) over 50 warm + 20 cold-start samples
    - tokenCount = Math.ceil(String(text).length/4) boundary assertions (480 chars -> 120 tokens accepted, 484 -> 121 rejected)
    - fs.readFileSync + regex scan of router.mjs source for hot-path invariant assertions (no spawnSync/execSync; spawn() must be fire-and-forget unref'd)
  patterns:
    - TDD: RED (file absent) -> GREEN (passes against the Plan 01 wired trigger); MVP_MODE=false so the MVP+TDD gate is not enforced, TDD is task discipline
    - Deploy bundle = moduleNames + gateFixtureNames; moduleValues flatMap deploys every moduleName to BOTH ownedRoot and codexOwnedRoot (single set serves both runtimes; receipts partition at read time per Pitfall 3 / PARITY-02)
    - Fail-open verification: broken dispatch worker path -> hook still exits 0, no decision:'block'
key-files:
  created:
    - tests/phase-38/budget.test.mjs
  modified:
    - src/lifecycle/router-lifecycle.mjs
    - tests/router.lifecycle.test.mjs
decisions:
  - Test 4b strips // comments before asserting triggerNativeDispatch does not reference the prompt variable; the invariant is that the trigger does not USE the prompt, not that it never mentions the word in comments. The dispatch sha256 is over fixture stdout (raw Buffer, in the worker), not the prompt.
  - Test 5 sets ROUTER_DISPATCH_WORKER_PATH=/nonexistent AND creates the dispatch-lease.json marker so the trigger fires against a broken worker; the try/catch in triggerNativeDispatch swallows any failure and the hook still exits 0 (fail-open). spawn() of a missing path returns a ChildProcess synchronously; the async 'error' event never reaches the hook because process.exit(0) ends the event loop first.
  - Rule 3 blocking fix: the bundle addition directly grows the deployed tree by 28 files (4 modules x2 + 4 src mirror x2 + 6 fixtures x2), so tests/router.lifecycle.test.mjs deployed-file count assertion was updated 231 -> 259 with an annotated comment line citing Phase 38.
  - The moduleValues flatMap was NOT modified (per plan): it already deploys every moduleName to both ownedRoot and codexOwnedRoot, so a single deployed module set serves both runtimes. Branching happens at read time via os.homedir() partition, not at deploy time.
metrics:
  duration: ~6min
  completed: 2026-08-06
status: complete
actuals:
  tokens: 8900    # chars/4 over the realized diff (budget.test.mjs 276 lines + router-lifecycle.mjs 26 lines + lifecycle test 26 lines ~ 35600 bytes)
  tasks: 2
  commits: 2
---

# Phase 38 Plan 03: HOST-04 Budget + Deploy Bundle Summary

Final feasibility gate: the prompt and startup paths still meet their exact latency and token budgets with the Plan 01 off-hot-path dispatch trigger wired, the prompt path is read-only and fail-open (no spawn/scan/hash/network/LLM/mutation/learning), and the new dispatch adapters + receipt module + harmless fixture + five phase-38 tests ship into both ~/.claude/router/modules/ and ~/.codex/router/modules/ at install/upgrade via the lifecycle bundle.

## Objective

Prove HOST-04 holds with the new dispatch surface wired, and close Plan 01 Assumption A4 by extending the deploy bundle so the dispatch layer reaches both runtime trees. This is the final feasibility gate of Phase 38: the dispatch layer exists (Plans 01/02), but if it bends the prompt budget or fails to deploy, the feasibility proof is incomplete.

## What Was Built

### 1. Budget + invariants test (`tests/phase-38/budget.test.mjs`)
Seven test functions covering the six HOST-04 behavior cases:

- **Test 1 (warm prompt latency):** spawns the hook with a trivial prompt + `ROUTER_DEBUG_LATENCY=1` over 50 warm iterations (after 5 warmup); parses the `__router_latency_ms=<n>` stderr debug line; asserts p95 <= 25ms, p99 <= 50ms, max < 100ms (nearest-rank percentiles).
- **Test 2 (startup latency):** spawns the hook with a fresh temp HOME per run over 20 cold-start iterations; asserts p95 <= 50ms. Fresh HOME = no manifest, no cache, so the hook returns the low-tier pass-through fast.
- **Test 3 (injection token budget):** imports `tokenCount` from `src/runtime/router.mjs` and asserts `tokenCount(additionalContext) <= 120` for a trivial prompt (low-tier pass-through emits empty additionalContext; Test 6 covers the boundary explicitly).
- **Test 4 (hot-path invariants):** reads `src/runtime/router.mjs` source and asserts (a) no `spawnSync`/`execSync`/`execFileSync` in code (comments stripped), and (b) every `spawn(` call site has `.unref()` within 8 lines (fire-and-forget off the hot path — both the dispatch trigger and `bumpEvolveTrigger`).
- **Test 4b (no prompt hashing on dispatch path):** extracts the `triggerNativeDispatch` function body, strips `//` comments, and asserts it neither calls `createHash` nor references the `prompt` variable. The dispatch sha256 is over fixture stdout (raw Buffer, in the worker), not the prompt.
- **Test 5 (fail-open):** creates the `dispatch-lease.json` marker so the trigger fires, sets `ROUTER_DISPATCH_WORKER_PATH=/nonexistent/dispatch-worker.mjs` so the worker cannot run, and asserts the hook still exits 0, emits no `decision:"block"`, and passes the prompt through. The trigger's try/catch swallows any failure; `process.exit(0)` ends the event loop before any async spawn 'error' can fire.
- **Test 6 (boundary):** constructs strings of 480 chars (120 tokens) and 484 chars (121 tokens) and asserts `tokenCount` returns exactly 120 and 121 respectively; the HOST-04 budget gate accepts 120 (`<= 120`) and rejects 121 (`> 120`). Also asserts 481 chars -> 121 tokens (ceiling, no rounding ambiguity), and 1 char -> 1 token (ceiling).

### 2. Deploy bundle update (`src/lifecycle/router-lifecycle.mjs`)
- Added to `moduleNames`: `adapters/dispatch/contract.mjs`, `adapters/dispatch/receipt.mjs`, `adapters/dispatch/claude.mjs`, `adapters/dispatch/codex.mjs`. The existing `moduleValues` flatMap deploys every moduleName to BOTH `ownedRoot/modules/` and `codexOwnedRoot/modules/` (single deployed module set serves both runtimes; receipts partition by runtime at read time per RESEARCH §Pitfall 3 / PARITY-02). Added a comment citing Phase 38 + Assumption A4.
- Added to `gateFixtureNames`: `tests/phase-38/fixtures/harmless.mjs` + the five phase-38 tests (`native-dispatch`, `claude-adapter`, `codex-adapter`, `recommendation-only`, `budget`). These ship at `<ownedRoot>/tests/phase-38/...` and `<codexOwnedRoot>/tests/phase-38/...` so the production-verify gate can run the HOST-01..04 evidence suite from the deployed tree.
- Did NOT modify `moduleValues` flatMap (per plan) — it already deploys every moduleName to both roots.

### 3. Lifecycle test count fix (`tests/router.lifecycle.test.mjs`)
- Rule 3 blocking fix: the bundle addition directly grows the deployed tree by 28 files (4 modules x2 roots + 4 src mirror x2 roots + 6 fixtures x2 roots = 28). Updated the deployed-file count assertion 231 -> 259 and extended the annotated breakdown comment with the Phase 38 dispatch lines.

## Verification

All automated verification green:

- `node --test tests/phase-38/budget.test.mjs` -> 7/7 pass (all 6 HOST-04 behavior cases: Test 1, 2, 3, 4, 4b, 5, 6).
- `node --test tests/router.build-gate.test.mjs tests/router.adapters.test.mjs` -> 15/15 pass (build gate green after bundle update).
- `node --test tests/phase-38/*.test.mjs` -> 26/26 pass (full phase-38 suite; no plan 01/02 regression).
- `node --test tests/router.perf.test.mjs` -> 5/5 pass (hook latency budget preserved).
- `node --test tests/router.lifecycle.test.mjs` -> 23/23 pass, exit 0 (deployed-file count 259; the bundle addition did not break the lifecycle invariant).
- `node --test tests/router.test-mode-seam.test.mjs tests/router.modulenames.orchestrator.test.mjs` -> 8/8 pass (moduleNames static invariant preserved).
- Lifecycle test suite (lifecycle + autonomous-lifecycle + lifecycle-recovery + phase26-dual-runtime + shadow-log.lifecycle) -> 43/43 pass, exit 0.
- Deploy probe: `installRouter({ claudeRoot, codexRoot, sourceRouter, sourceEvolve })` deploys `adapters/dispatch/{contract,receipt,claude,codex}.mjs` + `tests/phase-38/fixtures/harmless.mjs` + `tests/phase-38/budget.test.mjs` to BOTH `<ownedRoot>/` and `<codexOwnedRoot>/` (verified via `existsSync` after install).
- grep acceptance: `grep -n "adapters/dispatch/{contract,receipt,claude,codex}.mjs" src/lifecycle/router-lifecycle.mjs` returns 4 matches in moduleNames; `grep -n "tests/phase-38/..."` returns 6 matches in gateFixtureNames (harmless + 5 tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lifecycle test deployed-file count assertion broke (231 -> 259)**
- **Found during:** Task 2 (lifecycle test run after bundle update)
- **Issue:** `tests/router.lifecycle.test.mjs:154` asserts `manifest.files.length === 231`. Adding 4 moduleNames (x2 roots = 8 module files + 8 src mirror files) + 6 gate fixtures (x2 roots = 12 files) grows the deployed tree by 28 files to 259, breaking the hard-coded count.
- **Fix:** Updated the assertion to 259 and extended the annotated breakdown comment with the Phase 38 dispatch lines (4 modules x2, src mirror x2, 16 gate fixtures x2). The plan's `files_modified` list did not include this test, but the regression was directly caused by the Task 2 bundle change, so Rule 3 applies.
- **Files modified:** `tests/router.lifecycle.test.mjs`
- **Commit:** 882ed70

**2. [Rule 1 - Bug] Test 4 spawn region window too narrow**
- **Found during:** Task 1 (first test run)
- **Issue:** The initial Test 4 asserted `.unref()` within 3 lines of each `spawn(` call site. The `bumpEvolveTrigger` spawn at router.mjs:2358 is multi-line (`detached`, `stdio`, `env` args) and `.unref()` lands at line 2362 — 4 lines later, outside the 3-line window.
- **Fix:** Widened the region window to 8 lines (`lines.slice(entry.line - 1, entry.line + 7)`), which covers the full multi-line spawn call + `.unref()` for both the evolve and dispatch triggers.
- **Files modified:** `tests/phase-38/budget.test.mjs`
- **Commit:** b7ee02c (folded into the Task 1 commit)

**3. [Rule 1 - Bug] Test 4b tripped on comment prose mentioning "prompt"**
- **Found during:** Task 1 (first test run)
- **Issue:** The initial Test 4b asserted `!/\bprompt\b/.test(fnBody)` against the raw `triggerNativeDispatch` function body. The function's fail-open comment `// fail-open: never block the prompt on a dispatch trigger failure` contains the word "prompt", failing the assertion even though the trigger never USES the prompt variable.
- **Fix:** Strip `//` comments before the regex check (`fnBody.split('\n').map(l => l.split('//')[0]).join('\n')`). The invariant is that the trigger does not reference the prompt variable, not that it never mentions the word in comments.
- **Files modified:** `tests/phase-38/budget.test.mjs`
- **Commit:** b7ee02c (folded into the Task 1 commit)

### TDD Discipline Note

Task 1 is `tdd="true"`. The implementation (`triggerNativeDispatch` in `src/runtime/router.mjs`) already existed from Plan 01, so the tests pass against the wired trigger (GREEN). RED was the absent-file state before the Task 1 commit. `MVP_MODE=false` so the MVP+TDD gate is not enforced; TDD is task discipline only. The test is committed as a single `test(...)` commit.

## Auth Gates

None — Phase 38 is stdlib-only and performs no auth.

## Known Stubs

None. All layers are real: the budget test asserts exact thresholds at and beyond boundaries, the deploy bundle ships the real dispatch adapters + receipt module + harmless fixture + five phase-38 tests to both runtime trees, and the build gate stays green.

## Threat Flags

No new security-relevant surface beyond the plan's `<threat_model>`. All mitigations implemented:
- T-38-12 (dispatch trigger blows prompt latency budget): Test 1 asserts p95<=25ms, p99<=50ms, max<100ms over 50 warm iterations with the trigger wired.
- T-38-13 (prompt-path mutation via spawn/scan/hash): Test 4 + 4b assert no `spawnSync`/`execSync` on the prompt path, every `spawn()` is fire-and-forget unref'd, and `triggerNativeDispatch` neither hashes nor references the prompt variable.
- T-38-14 (unbounded injection overflows the 10,000-char cap): Test 3 + Test 6 assert `tokenCount(additionalContext) <= 120` and the 120/121-token boundary.
- T-38-15 (stale/tampered deployed adapter): the lifecycle build copies source files to both `ownedRoot` and `codexOwnedRoot`; the build-gate test (15/15 pass) confirms the deployed tree matches source; `tests/router.lifecycle.test.mjs` asserts the deployed-file count and `assertRelativeImportClosure` for the deployed modules dir.
- T-38-16 (fail-open broken by dispatch exception): Test 5 asserts a broken worker path -> hook exits 0, no `decision:"block"`, prompt passed through; the trigger is try/catch-wrapped (Plan 01).

## Self-Check: PASSED

- [x] `tests/phase-38/budget.test.mjs` exists
- [x] `src/lifecycle/router-lifecycle.mjs` modified (moduleNames + gateFixtureNames additions)
- [x] Commit b7ee02c exists (Task 1 budget test, TDD)
- [x] Commit 882ed70 exists (Task 2 deploy bundle)
- [x] `node --test tests/phase-38/budget.test.mjs` exits 0 (7/7 pass)
- [x] `node --test tests/router.build-gate.test.mjs tests/router.adapters.test.mjs` exits 0 (15/15 pass)
- [x] `node --test tests/phase-38/*.test.mjs` exits 0 (26/26 pass — no plan 01/02 regression)
- [x] `node --test tests/router.perf.test.mjs` exits 0 (5/5 pass)
- [x] `node --test tests/router.lifecycle.test.mjs` exits 0 (23/23 pass, count 259)
- [x] grep finds 4 `adapters/dispatch/*.mjs` entries in moduleNames + `harmless.mjs` + 5 phase-38 tests in gateFixtureNames
- [x] Lifecycle build deploys `adapters/dispatch/{contract,receipt,claude,codex}.mjs` under both `ownedRoot/modules/` and `codexOwnedRoot/modules/` (probe verified)
