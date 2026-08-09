---
phase: 38-cross-runtime-native-feasibility
plan: 02
requirements-completed: [HOST-02, HOST-03]
subsystem: native-dispatch
tags: [host-02, host-03, codex, parity, recommendation-only, cross-runtime, tdd]
requires:
  - src/adapters/dispatch/contract.mjs (createDispatchAdapter factory, Plan 01)
  - src/adapters/dispatch/receipt.mjs (ReceiptStore, defaultReceiptRoot, hashBytes, Plan 01)
  - src/adapters/dispatch/claude.mjs (the adapter to mirror; dispatch mechanism identical per Pitfall 3)
  - tests/phase-38/fixtures/harmless.mjs (shared deterministic fixture, Plan 01)
  - src/runtime/router.mjs (detectRuntime :83-92; triggerNativeDispatch :2384-2398 — read-only this plan)
provides:
  - Codex NativeDispatchAdapter with installed.json marker probe + cross-runtime observe() validation (src/adapters/dispatch/codex.mjs)
  - Codex anti-cheat test suite — path, partition, test-helper-alone, recommendation-only, empty/null, encoding (tests/phase-38/codex-adapter.test.mjs)
  - Parity + recommendation-only fallback + cross-runtime isolation test suite (tests/phase-38/recommendation-only.test.mjs)
affects:
  - HOST-02 (satisfied: Codex produces a real native invocation + attributable completion evidence; anti-cheat holds)
  - HOST-03 (satisfied: equivalent intent/authority/risk/pause/resume/receipt on both runtimes; incompatible Codex → recommendation_only; Claude autonomy preserved; cross-runtime isolation enforced)
  - src/adapters/dispatch/claude.mjs (minimal Rule 1 fix: pause allows completed; resume releases idempotency key)
tech-stack:
  added:
    - Codex variant of createDispatchAdapter (runtime='codex', adapterVersion='codex-dispatch/1')
    - canDispatch() installed.json marker probe (RESEARCH §Environment Availability)
    - observe() runtime validation on read (T-38-08 defense-in-depth)
  patterns:
    - Dispatch mechanism identical across runtimes; branch only at partition path + canDispatch probe (Pitfall 3)
    - Recommendation-only fallback is truthful — receipt published to store, not silent text-only downgrade (Pattern 2)
    - Pause/resume as router-internal state: pause writes 'paused', resume releases idempotency + re-spawns (Pitfall 4)
key-files:
  created:
    - src/adapters/dispatch/codex.mjs
    - tests/phase-38/codex-adapter.test.mjs
    - tests/phase-38/recommendation-only.test.mjs
  modified:
    - src/adapters/dispatch/claude.mjs (Rule 1 bug fix: pause/resume idempotency release)
decisions:
  - Codex adapter is a VARIANT of the Claude adapter, not a parallel implementation; the dispatch MECHANISM (child_process.spawn + child stdout capture + exit handler + atomic publish) is byte-identical across runtimes (Pitfall 3). Branch only at: runtime field, receipt partition path (~/.codex/router/receipts/), canDispatch() installed.json marker probe, observe() runtime validation.
  - canDispatch() probes ~/.codex/router/installed.json marker (contents: {"managed_by":"claude-router",...}) at CALL time (not module load) so tests that set process.env.HOME after import see the temp HOME. Absent the marker → {ok:false, reason:'installed_marker_missing'} → invoke() writes 'recommendation_only' receipt.
  - observe() in the Codex adapter validates receipt.invocation_identity.runtime on read — rejects non-codex receipts even if planted in the codex partition (T-38-08 defense-in-depth). Partition isolation (different dirs via os.homedir()) is the primary defense; runtime validation is secondary.
  - Rule 1 bug fix in claude.mjs: pauseImpl now allows pausing 'completed' receipts (router-internal state, Pitfall 4 — pause is not a process pause); resumeImpl releases the idempotency key before re-spawning so the same key can resume. A direct second invoke() with the same key is still rejected (idempotent checkpoint preserved). Same fix applied to codex.mjs. This was required to satisfy HOST-03 Test 2 (pause/resume state transitions match across runtimes).
metrics:
  duration: ~4min
  completed: 2026-08-06
status: complete
actuals:
  tokens: 26850  # chars/4 over the realized diff (107400 bytes across 4 files: codex.mjs 385 + claude.mjs 33 + 2 test files 655)
  tasks: 2
  commits: 4
---

# Phase 38 Plan 02: Codex Adapter + Parity + Recommendation-Only Fallback Summary

Codex NativeDispatchAdapter as a true variant of the proven Claude contract — same dispatch mechanism, branched only at the partition path + installed.json marker probe + runtime validation on read — plus the HOST-03 parity proof that both runtimes produce structurally equal intent/authority/risk/pause/resume/receipt outcomes and that an incompatible Codex adapter truthfully downgrades to recommendation_only without disabling Claude.

## Objective

Extend the proven Claude dispatch slice (Plan 01) to the Codex runtime and prove cross-runtime equivalence plus the truthful recommendation-only fallback. This is the pluralization step the assumption_delta_decision anticipated: a second adapter variant of the same contract, not a parallel single-runtime assumption. HOST-02 proves Codex can also natively invoke and observe; HOST-03 proves the two runtimes are equivalent and that an incompatible adapter truthfully downgrades without disabling the other runtime or faking an invocation.

## What Was Built

### 1. Codex NativeDispatchAdapter (`src/adapters/dispatch/codex.mjs`)
- `createCodexDispatchAdapter({ receiptRoot?, fixture?, allowedRoots? })` factory — a variant of `createDispatchAdapter` from Plan 01's contract.
- `runtime='codex'`, `adapterVersion='codex-dispatch/1'`, `nativeIdentity='codex'`.
- Receipt partition: `~/.codex/router/receipts/` via `defaultReceiptRoot('codex')` → `os.homedir()/.codex/router/receipts/` (never hardcoded `/Users/guilherme`).
- `canDispatch()` — validates the fixture path is contained (reject `..`, root escape; must resolve inside the repo or `~/.codex/router/`), checks the node binary, AND probes `~/.codex/router/installed.json` marker at call time (RESEARCH §Environment Availability). Absent the marker → `{ok:false, reason:'installed_marker_missing'}`.
- `invoke(action)` — identical dispatch mechanism to claude.mjs: `child_process.spawn(process.execPath, [fixturePath], { stdio:['ignore','pipe','pipe'], detached:true, env:{...process.env, ROUTER_RUNTIME:'codex'} })`. Captures stdout chunks, registers child `exit` handler, publishes `invoked` receipt immediately then `completed` receipt on exit (pid + stdout_sha256 over raw Buffer + wall_ms). Empty/null/`{}` action → `recommendation_only` receipt, no spawn, no pid.
- `observe(receiptId)` — wraps the base store read with runtime validation: rejects receipts whose `invocation_identity.runtime !== 'codex'` (T-38-08 defense-in-depth). Partition isolation (different dirs) is the primary defense.
- `pause()` / `resume()` — minimal Phase 40 LEASE-05 idempotent checkpoint primitive; pause allows 'completed'→'paused', resume releases the idempotency key and re-spawns with the same key.
- Worker entrypoint: when run as `node codex.mjs`, reads `~/.codex/router/dispatch-lease.json`, invokes the adapter, polls `observe()` until `completed`, exits (analog of claude.mjs's worker).

### 2. Codex adapter test (`tests/phase-38/codex-adapter.test.mjs`)
- 6 behavior cases (HOST-02):
  - Test 1: authorized fixture action → completed receipt with `adapter='codex-dispatch/1'`, `runtime='codex'`, pid>0, exit_code=0, stdout_sha256 byte-identical to the Claude adapter for the shared fixture.
  - Test 2: receipt partitioned to `~/.codex/router/receipts/`, NOT under `~/.claude/`.
  - Test 3: test helper running the fixture directly with `ROUTER_RUNTIME=codex` produces NO codex receipt (anti-cheat SC1).
  - Test 4: `canDispatch=false` (installed.json marker absent) → `recommendation_only` receipt with no pid; the receipt EXISTS in the store (no silent downgrade — Pattern 2 / T-38-09).
  - Test 5: null/empty/`{}` action → `recommendation_only`, no spawn, no pid.
  - Test 6: multi-byte UTF-8 stdout → stdout_sha256 byte-exact over raw Buffer, identical to the Claude adapter's hash for the same fixture.

### 3. Parity + recommendation-only fallback test (`tests/phase-38/recommendation-only.test.mjs`)
- 5 behavior cases (HOST-03):
  - Test 1: same action through both adapters → `deepEqual` intent/authority/risk; both terminal states 'completed'; stdout_sha256 byte-identical across runtimes.
  - Test 2: pause() writes 'paused'; resume() re-spawns with the same key and produces 'completed'; a second direct invoke() with the same key is rejected (idempotent checkpoint). Same state transitions on both adapters.
  - Test 3: Codex `canDispatch=false` (marker absent) → Codex writes `recommendation_only` (no pid); Claude `canDispatch` still `ok:true` in the same temp HOME (structural independence — the promoted contract means each variant reports independently).
  - Test 4: the `recommendation_only` receipt EXISTS on disk (audit trail records the decision — not a silent text-only downgrade).
  - Test 5: cross-runtime observe() rejected — Claude receipt presented to Codex observe() returns null (partition + runtime validation); Codex receipt presented to Claude observe() returns null (partition isolation). Defense-in-depth: a Claude receipt planted in the codex partition is rejected by the Codex adapter's runtime validation.

### 4. Claude adapter fix (`src/adapters/dispatch/claude.mjs`)
- Rule 1 bug fix: `pauseImpl` now allows pausing 'completed' receipts (router-internal state, Pitfall 4 — pause is not a process pause; it marks the receipt for resume).
- `resumeImpl` releases the idempotency key before re-spawning so the same key can resume (a controlled continuation, not a duplicate invocation). A direct second `invoke()` with the same key is still rejected because `invokeImpl` re-claims the key after spawning.
- Same fix mirrored to codex.mjs.

## Verification

All automated verification green:

- `node --test tests/phase-38/codex-adapter.test.mjs` → 6/6 pass (HOST-02).
- `node --test tests/phase-38/recommendation-only.test.mjs` → 5/5 pass (HOST-03).
- `node --test tests/phase-38/native-dispatch.test.mjs tests/phase-38/claude-adapter.test.mjs tests/phase-38/codex-adapter.test.mjs tests/phase-38/recommendation-only.test.mjs` → 19/19 pass (full phase-38 suite so far; no plan-01 regression).
- `node --test tests/router.perf.test.mjs` → 5/5 pass (claude.mjs change did not regress the hook latency budget).
- Codex receipt `stdout_sha256` byte-identical to the Claude receipt for the shared fixture: `fa55687b8b74cd4db9b737fdc4f030cec9d8821d3402d06fdf2bd197c9dd8be9`.
- No codex receipt under `.claude/router/receipts/` and vice versa (partition enforced — Test 2).
- Cross-runtime observe() rejected (Test 5 — partition + runtime validation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pause/resume idempotency blocked resume (claude.mjs + codex.mjs)**
- **Found during:** Task 2 RED (Test 2 failed: pause returned 'completed' not 'paused'; resume was blocked by the in-memory idempotency Set).
- **Issue:** Plan 01's `pauseImpl` only allowed pausing 'invoked'/'pending' receipts, not 'completed' — but the fixture exits in <100ms, so by the time the test calls pause() the receipt is already 'completed'. And `resumeImpl` called `invokeImpl` with the same idempotency_key, which was already claimed by the first invoke, so `claimIdempotency()` rejected it → resume returned 'recommendation_only' instead of re-spawning. The plan's HOST-03 Test 2 requires pause() to write 'paused' and resume() to re-spawn with the same key.
- **Fix:** (a) `pauseImpl` now allows pausing 'completed' receipts (router-internal state per Pitfall 4 — pause is not a process pause; it marks the receipt for resume). (b) Added `releaseIdempotency(key)` and called it in `resumeImpl` before `invokeImpl` so the same key can resume (a controlled continuation). `invokeImpl` re-claims the key after spawning, so a subsequent direct `invoke()` with the same key is still rejected — the idempotent checkpoint is preserved. Applied to both `claude.mjs` (Rule 1 fix — the plan said "reuse as-is" but the bug prevented HOST-03) and `codex.mjs` (mirrored).
- **Files modified:** `src/adapters/dispatch/claude.mjs`, `src/adapters/dispatch/codex.mjs`
- **Commit:** 5fdb6de

### TDD Discipline Note

Both tasks are `tdd="true"`. Task 1: RED committed first (test import fails because codex.mjs doesn't exist), then GREEN (codex.mjs implemented, 6/6 tests pass). Task 2: RED committed first (Test 2 fails because pause/resume is broken), then GREEN (Rule 1 fix applied, 5/5 tests pass). `MVP_MODE=false` so the MVP+TDD gate is not enforced; TDD is task discipline only.

## Auth Gates

None — Phase 38 is stdlib-only and performs no auth.

## Known Stubs

None. The Codex adapter is a production-quality variant of the contract; the dispatch mechanism, receipt store, partition, marker probe, runtime validation, pause/resume, and worker entrypoint are all real and kept.

## Threat Flags

No new security-relevant surface beyond the plan's `<threat_model>`. All mitigations implemented:
- T-38-08 (cross-runtime receipt bleed): receipts partitioned by runtime dir (`~/.codex/router/receipts/` vs `~/.claude/router/receipts/` via `os.homedir()`); Codex adapter `observe()` validates `receipt.invocation_identity.runtime` on read. Test 5 verifies rejection (partition + planted-receipt defense-in-depth).
- T-38-09 (silent downgrade hides incompatibility): `canDispatch()==false` writes a `recommendation_only` receipt (Pattern 2). Test 4 asserts the receipt exists on disk.
- T-38-10 (Codex-specific branching inside spawn path): dispatch mechanism is byte-identical across runtimes; Test 1 + Test 6 verify byte-identical `stdout_sha256`.
- T-38-11 (installed.json marker spoofed): `canDispatch()` checks marker presence (not contents as a credential); dispatch is still gated by the operator-issued lease marker from Plan 01. The marker is a local file under operator-controlled `~/.codex/router/`.

## Self-Check: PASSED

- [x] `src/adapters/dispatch/codex.mjs` exists
- [x] `tests/phase-38/codex-adapter.test.mjs` exists
- [x] `tests/phase-38/recommendation-only.test.mjs` exists
- [x] `src/adapters/dispatch/claude.mjs` modified (Rule 1 pause/resume fix)
- [x] Commit 24dd6a4 exists (Task 1 RED)
- [x] Commit c50a644 exists (Task 1 GREEN)
- [x] Commit 2ca6022 exists (Task 2 RED)
- [x] Commit 5fdb6de exists (Task 2 GREEN fix)
- [x] `node --test tests/phase-38/codex-adapter.test.mjs tests/phase-38/recommendation-only.test.mjs` exits 0 (11/11 pass)
- [x] `node --test tests/phase-38/native-dispatch.test.mjs tests/phase-38/claude-adapter.test.mjs tests/phase-38/codex-adapter.test.mjs tests/phase-38/recommendation-only.test.mjs` exits 0 (19/19 pass — no plan-01 regression)
- [x] Codex receipt `stdout_sha256` byte-identical to Claude receipt for the shared fixture (`fa55687b...`)
- [x] No codex receipt under `.claude/router/receipts/` and vice versa (Test 2 partition)
- [x] Cross-runtime observe() rejected (Test 5)
