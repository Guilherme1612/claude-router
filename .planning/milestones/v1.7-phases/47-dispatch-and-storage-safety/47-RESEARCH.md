# Phase 47: Dispatch and Storage Safety - Research

**Researched:** 2026-08-09
**Domain:** Durable dispatch idempotency, bounded child processes, and private filesystem state
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Durable dispatch identity
- Claim work atomically before spawning, using durable runtime-owned state rather than a process-local Set.
- A persistent marker is never reusable after a successful claim; repeated prompt triggers must observe an already-claimed result without executing.
- Initial dispatch and resume share one durable at-most-once contract across Claude and Codex.

### Enforced resource contracts
- Enforce timeout and bounded output in the shared adapter path, not separately in every caller.
- Termination, truncation, retry exhaustion, and completion-contract failure produce truthful receipt states and evidence.
- Keep prompt submission fire-and-forget and fail-open; enforcement belongs in the detached worker.

### Storage containment and privacy
- Validate identifiers before path construction and verify resolved containment beneath the configured owned root.
- Use explicit private modes for directories and files rather than relying on process umask.
- Serialize lease create/check/write and checkpoint mutation with the existing mutation-lock pattern.

### the agent's Discretion
- Exact helper names and internal factoring, provided no new dependency or speculative abstraction is introduced.
- Exact bounded-output buffering implementation using Node built-ins.

### Deferred Ideas (OUT OF SCOPE)
- Production strategy, learning, migration, and installed-bundle wiring — Phase 48.
- Full baseline repair, CI, Nyquist closeout, archive, and tag reconciliation — Phase 49.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFE-01 | A durable work identity is atomically claimed before native execution and cannot execute twice across prompts, workers, compaction, or restart. | Put a single exclusive-file claim primitive in the shared receipt/dispatch storage seam; invoke it before every child spawn, retain the claim permanently, and make the worker remove only the reusable marker after a successful claim. |
| SAFE-02 | Claude and Codex enforce declared timeout, retry, output, and completion bounds and record truthful bounded outcomes. | Move one bounded-execution loop into the shared adapter contract: immutable execution contract, streaming byte counter/hash, timeout termination, pre-spawn-only retry, and explicit terminal reason codes. |
| SAFE-03 | Lease and receipt identifiers are validated and contained beneath runtime-owned roots with private filesystem modes. | Require canonical 64-hex persisted IDs at every store entry point, resolve beneath a canonical owned root, and explicitly enforce directory `0o700` and file `0o600` modes. |
| SAFE-04 | Lease creation and checkpoint mutation are serialized so colliding operations cannot overwrite authority state. | Move the complete create/read/collision/write transaction under the existing mkdir mutation lock; retain checkpoint mutation under the same lock and test with separate processes. |
| SAFE-05 | Claude and Codex provide equivalent durable at-most-once initial dispatch and resume behavior. | Remove runtime-specific claim behavior; both variants call the same durable initial/resume claim and bounded runner, with one parity matrix and real process-restart tests. |
</phase_requirements>

## Summary

The current prompt hook does remain fire-and-forget, but `triggerNativeDispatch()` checks a permanent `dispatch-lease.json` marker and spawns a detached worker on every prompt. Each worker rereads the same marker. Both adapters guard initial invocation only with a module-local `_idempotencySeen` `Set`, so every new worker starts empty and can spawn the same native work again. Claude alone attempts a durable claim during resume; Codex has a narrower, strategy-conditional implementation. This is the direct cause of the Phase 47 at-most-once gap. [VERIFIED: `src/runtime/router.mjs`, `src/adapters/dispatch/claude.mjs`, `src/adapters/dispatch/codex.mjs`]

The shared gate currently validates that timeout, retry, output, and completion fields exist, but the adapters do not use them to control the child. Stdout is accumulated into an unbounded `chunks` array, there is no timeout timer, retries are not executed or counted, the completion contract is not evaluated, and the pending receipt does not retain the execution contract for resume. The worker's five-second polling deadline exits the worker; it does not stop the child. [VERIFIED: `src/adapters/dispatch/contract.mjs`, `src/adapters/dispatch/receipt.mjs`, `src/adapters/dispatch/claude.mjs`, `src/adapters/dispatch/codex.mjs`]

The storage primitives are close to sufficient but are applied at the wrong boundaries. `createLease()` performs its existence/collision check before taking any lock, and lease/receipt IDs are interpolated into `join(root, id + '.json')` without store-level validation. Receipt directories/files also omit explicit private modes on primary JSON writes. The smallest correct solution is to reuse the existing durable-write and mutation-lock patterns, add one strict persisted-ID/containment guard, and add one shared durable work-claim/bounded-child mechanism. No new package, daemon, queue, or adapter abstraction is warranted. [VERIFIED: `src/lease/store.mjs`, `src/adapters/dispatch/receipt.mjs`]

**Primary recommendation:** Implement one shared durable claim plus bounded execution seam, then make both runtime adapters thin configuration variants and lock/contain the two existing stores.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prompt marker detection | API / Backend (hook) | — | The hook may only detect and detach; it must not perform durable mutation or wait. [VERIFIED: codebase prompt-path contract] |
| Durable work claim | Database / Storage | API / Backend (worker) | The worker requests the claim, but on-disk exclusive creation is the authority across processes/restarts. [VERIFIED: Phase 47 locked decisions] |
| Timeout/output/retry/completion enforcement | API / Backend (shared dispatch adapter) | Database / Storage (receipt) | The shared runner controls the child; the receipt stores bounded evidence. [VERIFIED: Phase 47 locked decisions] |
| Lease creation/checkpoint serialization | Database / Storage | CLI / worker callers | The transaction belongs in `createLeaseStore`, so every caller receives the same race-safe behavior. [VERIFIED: caller grep] |
| Runtime parity | API / Backend (shared contract) | Claude/Codex adapter variants | Runtime files should provide roots and availability probes only; safety behavior must not fork. [VERIFIED: milestone design] |

## Project Constraints (from AGENTS.md)

- Prefix shell commands with `rtk`; use `rtk proxy` only when raw command behavior is required. [VERIFIED: `/Users/guilherme/.codex/RTK.md`]
- Preserve unrelated dirty and untracked work; Phase 47 research does not authorize source edits. [VERIFIED: orchestrator task]
- The only project skill is the Excalidraw diagram skill; it is not applicable because the deliverable is a planning research document, not a diagram. [VERIFIED: `.agents/skills` inventory]

## Live Caller and Root-Cause Trace

### Initial dispatch

```text
UserPromptSubmit
  -> router.mjs main callback
  -> triggerNativeDispatch()
  -> existsSync(dispatch-lease.json)
  -> detached node <runtime adapter>
  -> runAsWorker() rereads the unchanged marker
  -> create*DispatchAdapter().invoke(action)
  -> process-local claimIdempotency(Set)
  -> spawn(process.execPath, fixture)
```

The marker is never renamed, removed, or bound to a durable consumed identity. The process-local `Set` is recreated in each worker, so repeated prompts and concurrent workers pass the guard. The claim must move into the worker immediately before native spawn; the prompt hook remains read-only/fail-open. [VERIFIED: `router.mjs:triggerNativeDispatch`, both `runAsWorker` implementations]

### Resume

```text
adapter.resume(receipt_id)
  -> ReceiptStore.observe(receipt_id)
  -> reconstruct action from receipt
  -> runtime-specific durable-claim branch
  -> release process-local key
  -> invokeImpl()
```

Claude uses a memoized lease store only when the referenced lease can be inspected; otherwise it deliberately falls back to process-local behavior. Codex creates a lease store only for strategy replans and lacks Claude's general durable path. Both reconstruct `timeout`, `retry`, `output_bounds`, and `completion_contract` from top-level receipt fields that `buildPendingReceipt()` never writes, so resumed work loses its resource contract. [VERIFIED: both `resumeImpl` functions; `buildPendingReceipt`]

### Lease storage

```text
createLease(record)
  -> readLease(lease_id)          # outside mutation lock
  -> collision decision
  -> durableWrite(final path)     # temp + fsync + rename
```

Two processes can both observe absence and then rename different records onto the same final path; the later rename wins. Checkpoint mutation is already inside `mutationLock`, so the root fix is to put the whole create/check/write transaction under that same lock rather than adding a second lock system. [VERIFIED: `src/lease/store.mjs`]

### Receipt and lease path construction

`readLease`, `createLease`, `mutate`, receipt `read`, and receipt `publishAtomic` construct filenames from caller-controlled IDs before proving validity or containment. CLI-side `safeIdentifier()` does not protect direct module callers. Receipt IDs and canonical lease IDs are already SHA-256 hex values, so the store boundary can require `/^[a-f0-9]{64}$/` without inventing a second identity format. [VERIFIED: caller grep, `receiptIdentityId`, `computeLeaseFingerprint`]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | v22.22.3 installed | Runtime and ESM | Existing project runtime; no dependency change. [VERIFIED: `node --version`] |
| `node:fs` | built-in | `openSync('wx')`, explicit modes, fsync, rename, mkdir lock, chmod | Exclusive create and durable/private file operations are native. `wx` fails when the path exists. [CITED: https://nodejs.org/api/fs.html] |
| `node:child_process` | built-in | Spawn and terminate bounded children | `spawn` exposes streaming stdio, timeout/kill signal options, and no shell by default. [CITED: https://nodejs.org/api/child_process.html] |
| `node:crypto` | built-in | Stable SHA-256 identities and streaming output hash | Already used by receipt/lease code; no custom hash or package. [VERIFIED: codebase imports] |
| `node:path` | built-in | Canonical containment comparisons | `path.resolve()` produces an absolute normalized path; pair it with `realpath` of the owned root and a separator-aware prefix check. [CITED: https://nodejs.org/api/path.html] |
| `node:test` + `node:assert/strict` | built-in | Unit, integration, subprocess-race tests | Existing repository test framework. [VERIFIED: tests inventory] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AbortController` / timers | built-in | Deadline signal and forced-kill escalation | Use inside the detached worker, never in the prompt hook. [CITED: https://nodejs.org/api/child_process.html] |
| `Atomics.wait` | built-in | Short synchronous backoff in existing filesystem lock | Retain the existing mutation-lock pattern; do not add a lock package. [VERIFIED: `src/lease/store.mjs`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Exclusive claim file | Lease-array-only claim | Lease-only claims fail for direct dispatch actions without a materialized lease and preserve current runtime divergence. Use one receipt/dispatch-side claim store. |
| Streaming spawn | `execFile` with `maxBuffer` | `execFile` buffers output and changes the established event-driven receipt path; streaming gives exact byte accounting with less memory. |
| Existing mkdir lock | Lockfile dependency | Adds a package and a second stale-owner protocol for no benefit. |

**Installation:** none. All required capabilities are Node built-ins. [VERIFIED: repository has no package manifest and dispatch modules are stdlib-only]

## Package Legitimacy Audit

Not applicable. Phase 47 installs no external package. [VERIFIED: locked no-new-dependency decision]

## Architecture Patterns

### System Architecture Diagram

```text
prompt
  -> hook checks marker only
  -> detached runtime worker
       -> parse + validate marker identity
       -> shared durable claim(identity, stage) -- already exists --> bounded receipt, no spawn
       -> successful exclusive claim
       -> remove reusable marker
       -> shared bounded child runner
            -> pre-spawn failure -- retry <= declared limit --> retry_exhausted receipt
            -> PID assigned --> no automatic re-execution
            -> timeout/output overflow --> TERM, then KILL --> failed bounded receipt
            -> exit --> completion-contract check --> completed or failed receipt
       -> private atomic receipt publish

lease/receipt caller
  -> validate canonical ID
  -> resolve and prove owned-root containment
  -> lease mutation lock (create/check/write or checkpoint mutation)
  -> temp write 0600 -> fsync -> rename -> directory fsync
```

### Recommended Project Structure

```text
src/
├── adapters/dispatch/contract.mjs  # shared claim/execution contract and validation
├── adapters/dispatch/receipt.mjs   # private receipt + durable claim persistence
├── adapters/dispatch/claude.mjs    # Claude roots/probe/worker entrypoint only
├── adapters/dispatch/codex.mjs     # Codex roots/probe/worker entrypoint only
├── lease/store.mjs                 # contained, locked lease transactions
└── runtime/router.mjs              # read-only marker detection + detached spawn
tests/
├── router.dispatch-safety.test.mjs # SAFE-01/02/05 matrix
└── router.storage-safety.test.mjs  # SAFE-03/04 matrix
```

No new production module is necessary. Keeping the change in these five existing modules is the shortest path that fixes every caller. [VERIFIED: caller trace]

### Pattern 1: Exclusive durable claim before spawn

**What:** Hash a bounded canonical work/stage tuple into a 64-hex claim ID, resolve its path under the runtime receipt claim root, and create it with `openSync(path, 'wx', 0o600)`. Fsync the file and parent directory before returning `claimed: true`; `EEXIST` returns `already_claimed`. Never delete a successful claim. [CITED: https://nodejs.org/api/fs.html]

**When to use:** Both initial dispatch and resume. Use the same function with distinct stage identity: `initial:<work identity>` and `resume:<checkpoint identity>`. A retry remains inside the one successful claim owner; it does not acquire a new work claim.

```js
// Source: https://nodejs.org/api/fs.html
const fd = openSync(claimPath, 'wx', 0o600);
try {
  writeFileSync(fd, payload);
  fsyncSync(fd);
} finally {
  closeSync(fd);
}
```

### Pattern 2: Bounded streaming child runner

**What:** Store an immutable `execution_contract` on the pending receipt. Stream stdout/stderr without collecting an unbounded array, increment byte/line counters, update a streaming SHA-256 hash, and terminate on the first exceeded bound. Set a deadline timer; send `SIGTERM`, then a short fixed grace followed by `SIGKILL` if the child remains open. Finalize on `close`, not only `exit`, so stdio has drained. [CITED: https://nodejs.org/api/child_process.html]

**When to use:** The shared invoke path for both runtimes.

Recommended terminal evidence:

| Outcome | Receipt state | Required evidence |
|---------|---------------|-------------------|
| Contract passes | `completed` | `exit_code`, `wall_ms`, bounded `stdout_sha256`, `captured_bytes`, `attempt_count` |
| Timeout | `failed` | `reason_codes:['timeout_exceeded']`, `timed_out:true`, signal, elapsed time |
| Output overflow | `failed` | `reason_codes:['output_bound_exceeded']`, `output_truncated:true`, declared/observed bytes |
| Completion mismatch | `failed` | `reason_codes:['completion_contract_failed']`, observed exit/signal |
| Pre-spawn failures exhausted | `failed` | `reason_codes:['retry_exhausted']`, `attempt_count`, `retry_limit` |

Only retry failures that prove no child received a PID. Once native execution starts, an automatic retry could duplicate side effects and contradict SAFE-01; any later continuation must have a new checkpoint identity and durable claim. [VERIFIED: SAFE-01/02 joint invariant]

### Pattern 3: Validate ID, then contain path

**What:** Require the canonical stored-ID grammar before path construction. Canonicalize the owned root, resolve the candidate, and accept only equality with the root or a `${root}${sep}` prefix. Because persisted objects are files, equality with the directory itself is not a valid final target. Existing roots must be chmod'd to `0o700`; every temp/final/append/claim file must be `0o600`. [CITED: https://nodejs.org/api/fs.html; https://nodejs.org/api/path.html]

**When to use:** Every public lease/receipt read, create, mutate, observe, inspect, claim, and publish boundary.

### Pattern 4: One lock covers the lease transaction

**What:** Acquire the existing mutation lock before `readLease()` in `createLease()`, then perform read, identity/collision comparison, and durable write while holding it. Do not lock just the final rename. Checkpoint mutation already follows this structure. [VERIFIED: `src/lease/store.mjs`]

**When to use:** Lease creation, status mutation, checkpoint claim, and checkpoint release.

### Anti-Patterns to Avoid

- **Process-local authority:** A `Set` may remain only as a cache after the durable claim; it must never decide whether execution is allowed.
- **Consuming the marker in the prompt hook:** This violates the read-only/fail-open prompt invariant and creates latency-sensitive mutation.
- **Rename-only claim:** Renaming a recreated marker onto an existing claim path can replace it; exclusive create is the non-reusable boundary.
- **Buffer-then-slice:** `Buffer.concat(chunks).subarray(...)` still permits unbounded memory growth before truncation.
- **Retry after PID assignment:** A timeout or uncertain exit may already have produced effects; retrying the same identity breaks at-most-once semantics.
- **CLI-only sanitization:** Direct store callers remain vulnerable; validation belongs inside the store.
- **Locking only writes:** A check-then-write race remains if the read/collision decision happens outside the lock.
- **Best-effort permissions:** Security-sensitive state must fail closed if private modes cannot be established.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-process claim | In-memory registry or custom socket daemon | `fs.openSync(..., 'wx')` plus fsync | Kernel exclusive-create semantics survive process boundaries. [CITED: https://nodejs.org/api/fs.html] |
| Lease locking | New lock class/package | Existing mkdir mutation lock | The codebase already handles ownership tokens and stale PIDs. [VERIFIED: codebase] |
| Output buffering | General collector abstraction | Stream counters + `crypto.createHash()` | One small shared runner covers the actual requirement. |
| Path security | Substring checks or basename rewriting | Strict ID regex + resolve/realpath containment | Normalization and symlinks defeat string-only checks. [CITED: https://nodejs.org/api/fs.html] |
| Hashing | Custom checksum | `node:crypto` SHA-256 | Existing stable identity contract. [VERIFIED: codebase] |
| Job orchestration | Queue/daemon/framework | Existing detached worker and durable local files | The milestone explicitly retains Router as the sole control plane. [VERIFIED: approved design] |

**Key insight:** The project already has every low-level primitive. Correctness comes from moving them to the shared trust boundaries, not adding machinery.

## Common Pitfalls

### Pitfall 1: Claiming after pending/invoked publication
**What goes wrong:** Two workers can both publish and spawn before either durable gate is authoritative.
**Why it happens:** Receipt publication is mistaken for an exclusive claim, but it uses replacing rename semantics.
**How to avoid:** Acquire the exclusive claim before pending publication and before `spawn()`.
**Warning signs:** More than one PID or fixture side-effect line for one work identity.

### Pitfall 2: Existing permissive modes remain permissive
**What goes wrong:** `mkdirSync(...,{mode:0o700})` and `writeFileSync(...,{mode:0o600})` only apply creation modes; they do not tighten an existing path.
**Why it happens:** Tests cover fresh temp directories only.
**How to avoid:** Explicitly `chmodSync` existing owned roots and final files; fail closed on enforcement failure.
**Warning signs:** Tests pass on fresh roots but fail when roots are pre-created as `0o755` and files as `0o644`. [CITED: https://nodejs.org/api/fs.html]

### Pitfall 3: Resource fields disappear on resume
**What goes wrong:** `resumeImpl` reads fields that are absent from the persisted receipt, so resumed execution becomes legacy/permissive.
**Why it happens:** `buildPendingReceipt` currently stores identity/attribution but not the execution contract.
**How to avoid:** Persist one sanitized immutable `execution_contract` and reconstruct exclusively from it.
**Warning signs:** Resume actions contain `undefined` timeout/output/completion fields. [VERIFIED: codebase]

### Pitfall 4: Timeout records without child termination
**What goes wrong:** The receipt says timed out while a detached child continues running.
**Why it happens:** A polling deadline or `SIGTERM` alone is treated as termination proof.
**How to avoid:** Wait for `close`; escalate to `SIGKILL`; record actual signal and close observation.
**Warning signs:** Fixture side effects continue after terminal receipt. [CITED: https://nodejs.org/api/child_process.html]

### Pitfall 5: Unit concurrency is not process concurrency
**What goes wrong:** Promise-based calls in one process execute synchronous filesystem code sequentially and miss the race.
**Why it happens:** The storage APIs are synchronous.
**How to avoid:** Spawn separate Node processes against one temp root and synchronize their start.
**Warning signs:** A race test contains no subprocess boundary.

### Pitfall 6: Stale verification prose overrides live tests
**What goes wrong:** Phase 40 artifacts claim path validation and passing durable resume, but the live store has no `safeIdentifier` and the current focused run fails two resume assertions.
**Why it happens:** Archived verification describes a prior projection rather than current code.
**How to avoid:** Treat current source and executable results as canonical for planning.
**Warning signs:** Grep cannot find the asserted helper; current named tests are red. [VERIFIED: live grep and test run, 2026-08-09]

## Code Examples

### Separator-aware containment

```js
// Sources: https://nodejs.org/api/path.html and https://nodejs.org/api/fs.html
const root = realpathSync(ownedRoot);
const candidate = resolve(root, `${validatedId}.json`);
if (!candidate.startsWith(`${root}${sep}`)) throw new Error('path_escape');
```

### Streaming byte bound

```js
// Source: https://nodejs.org/api/child_process.html
let capturedBytes = 0;
child.stdout.on('data', (chunk) => {
  const remaining = maxBytes - capturedBytes;
  if (remaining > 0) hash.update(chunk.subarray(0, remaining));
  capturedBytes += chunk.length;
  if (capturedBytes > maxBytes) terminate('output_bound_exceeded');
});
```

### Locked create transaction

```js
const lock = mutationLock(leaseRoot, lockOptions);
if (!lock.acquired) return blocked(lock.reason_code);
try {
  const existing = readLease(validLeaseId);
  if (existing) return compareIdentity(existing, record);
  durableWrite(containedLeasePath(validLeaseId), record);
  return { status: 'stored', lease_id: validLeaseId };
} finally {
  lock.release();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Process-local `_idempotencySeen` | Durable exclusive work claim, process Set only an optional cache | Phase 47 target | Survives prompt workers, compaction, and restart. |
| Contract shape validation | Runtime enforcement with bounded receipt evidence | Phase 47 target | Declared limits become behavior rather than metadata. |
| CLI-side ID filtering | Store-boundary canonical ID + containment | Phase 47 target | Every caller is protected. |
| Create check outside lock | Read/check/write under one mutation lock | Phase 47 target | Colliding creators cannot overwrite authority state. |
| Claude-only durable resume attempt | One shared initial/resume mechanism used by both variants | Phase 47 target | SAFE-05 parity becomes structural. |

**Deprecated/outdated:**
- `_idempotencySeen` as an authority gate: process lifetime is insufficient.
- Worker polling deadline as a timeout: it does not terminate the child.
- Phase 40 verification claims about store-level path validation: not present in live `src/lease/store.mjs`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. Recommendations derive from locked decisions, live source/tests, or official Node documentation. | — | — |

## Open Questions

1. **Should automatic retry occur after a PID is assigned?**
   - What we know: SAFE-01 forbids executing one durable identity twice, while SAFE-02 requires retry exhaustion evidence.
   - Resolution for planning: Retry only pre-spawn failures that prove no native process started. After PID assignment, timeout/output/completion failure is terminal for that identity; replanning must create a distinct checkpoint identity.

2. **Should legacy actions without an execution contract still spawn?**
   - What we know: `preDispatchGate` currently passes actions with no contract fields for backward compatibility, but SAFE-02 says Claude and Codex enforce declared bounds.
   - Resolution for planning: Keep direct legacy module tests compatible only where they use the harmless fixture, but require a complete contract for worker/marker-driven durable dispatch. Do not silently synthesize permissive production bounds.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All implementation/tests | ✓ | v22.22.3 | — |
| `node:test` / `node:assert` | Validation | ✓ | built-in | — |
| POSIX-style local filesystem semantics | modes, mkdir lock, rename/fsync | ✓ | macOS workspace | Tests use temp roots; fail closed on unsupported mode/flush operations. |
| `rtk` | Project command wrapper | ✓ | installed | `rtk proxy` for unfiltered behavior if needed. |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — direct `.mjs` test files |
| Quick run command | `rtk node --test tests/router.dispatch-safety.test.mjs tests/router.storage-safety.test.mjs` |
| Focused regression command | `rtk node --test tests/router.dispatch-safety.test.mjs tests/router.storage-safety.test.mjs tests/router.lease-resume.test.mjs tests/router.trust-pregate.test.mjs tests/phase-38/*.test.mjs tests/phase-44/receipts.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs tests/phase-*/*.test.mjs` |

### Current Baseline Evidence

On 2026-08-09, the focused lease/dispatch/receipt/trust run executed 62 tests: 60 passed and two existing `router.lease-resume` assertions failed. The second resume respawned (`invoked` instead of `paused`) and durable `claimed_actions` lacked `k1`. Planning must begin with these as red evidence, not assume Phase 40 remains green. [VERIFIED: fresh `rtk node --test` run]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFE-01 | Concurrent prompt workers and later processes obtain one durable initial claim; recreated marker with same identity never executes again | subprocess integration | `rtk node --test tests/router.dispatch-safety.test.mjs --test-name-pattern="SAFE-01"` | ❌ Wave 0 |
| SAFE-02 | Timeout stops child; output stays bounded; completion mismatch is terminal; pre-spawn retries never exceed limit and exhaustion is truthful | unit + subprocess | `rtk node --test tests/router.dispatch-safety.test.mjs --test-name-pattern="SAFE-02"` | ❌ Wave 0 |
| SAFE-03 | Traversal/absolute/NUL/separator IDs fail closed; symlink/escape paths rejected; existing/fresh roots and files are private | adversarial unit | `rtk node --test tests/router.storage-safety.test.mjs --test-name-pattern="SAFE-03"` | ❌ Wave 0 |
| SAFE-04 | Colliding lease creators cannot last-writer-win; concurrent distinct checkpoint claims are not lost | subprocess race | `rtk node --test tests/router.storage-safety.test.mjs --test-name-pattern="SAFE-04"` | ❌ Wave 0 |
| SAFE-05 | Claude and Codex pass the same initial/recreated-marker/resume/restart claim matrix | parity integration | `rtk node --test tests/router.dispatch-safety.test.mjs --test-name-pattern="SAFE-05"` | ❌ Wave 0 |
| SAFE-02 regression | Structural gate rejects missing/invalid contract shapes before spawn | unit | `rtk node --test tests/router.trust-pregate.test.mjs` | ✅ existing; extend |
| SAFE-05 regression | Existing receipt identity, runtime partition, and recommendation-only behavior remain intact | regression | `rtk node --test tests/phase-38/*.test.mjs tests/phase-44/receipts.test.mjs` | ✅ existing |
| Prompt invariant | Marker path remains detached, fire-and-forget, fail-open, and under latency/token gates | performance/integration | `rtk node --test tests/phase-38/budget.test.mjs` | ✅ existing; extend marker claim assertion off hook path |

### Required Test Fixtures

- A side-effect fixture that atomically appends one short line so duplicate native starts are countable.
- A hanging fixture that ignores `SIGTERM` to prove `SIGKILL` escalation and no post-receipt activity.
- An output-flood fixture that emits beyond `max_bytes` without storing raw output.
- A configurable nonzero-exit fixture for completion-contract failure.
- A small subprocess helper mode inside the test file (or one existing helper) for simultaneous lease create/checkpoint operations; avoid a new test utility framework.

### Sampling Rate

- **Per task commit:** `rtk node --test tests/router.dispatch-safety.test.mjs tests/router.storage-safety.test.mjs`
- **Per wave merge:** focused regression command above; target feedback under 10 seconds.
- **Phase gate:** full suite green before `$gsd-verify-work`, followed by the Phase 47 VALIDATION.md command matrix.
- **No three consecutive tasks without an automated check.**

### Wave 0 Gaps

- [ ] `tests/router.dispatch-safety.test.mjs` — SAFE-01/02/05 red tests and minimal fixtures.
- [ ] `tests/router.storage-safety.test.mjs` — SAFE-03/04 adversarial and subprocess-race tests.
- [ ] Extend `tests/router.trust-pregate.test.mjs` — reject empty/non-finite/oversized output and completion contracts.
- [ ] Repair current red expectations in `tests/router.lease-resume.test.mjs` through the shared root cause; do not weaken them.
- [ ] Generate `47-VALIDATION.md` from this map before implementation tasks begin.

### Manual-Only Verifications

None. Every Phase 47 behavior can be exercised against temp runtime roots and harmless child fixtures. Installed-bundle proof belongs to Phase 48. [VERIFIED: phase boundary]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | This phase does not authenticate people or external services. |
| V3 Session Management | yes | Durable work/lease identities have non-reusable claims, bounded lifecycle, and restart-safe state. |
| V4 Access Control | yes | Only validated runtime-partitioned lease/receipt state beneath owned roots may influence execution. |
| V5 Input Validation | yes | Strict ID grammar, structured execution contract, enum/reason validation, and path containment at store/dispatch boundaries. |
| V6 Cryptography | yes | Use built-in SHA-256/random UUID for identity and ownership tokens; no custom cryptography. |

### Threat Model

| ID | Pattern | STRIDE | Standard Mitigation | Test |
|----|---------|--------|---------------------|------|
| T-47-01 | Repeated prompt marker spawns duplicate workers | Tampering | Permanent exclusive claim before native spawn; marker removal only after claim | SAFE-01 concurrent/recreated marker |
| T-47-02 | Restart clears process-local idempotency | Tampering | On-disk claim is authoritative; Set is cache only | SAFE-01 real new-process replay |
| T-47-03 | Child exceeds time/output and exhausts worker | Denial of Service | Streaming counters, TERM/KILL deadline, bounded evidence | SAFE-02 hang/flood fixtures |
| T-47-04 | Retry duplicates uncertain side effects | Tampering / Repudiation | Retry only before PID; terminal after native start; attempt evidence | SAFE-02 retry matrix |
| T-47-05 | Lease/receipt ID escapes owned root | Tampering / Information disclosure | Canonical ID regex + resolved containment in store | SAFE-03 traversal/absolute/symlink matrix |
| T-47-06 | Permissive umask or preexisting directory exposes private state | Information disclosure | Explicit chmod 0700/0600 and fail closed | SAFE-03 fresh/existing modes |
| T-47-07 | Colliding lease creators overwrite authority | Tampering / Elevation of privilege | Read/check/write under one mutation lock | SAFE-04 multi-process collision |
| T-47-08 | Concurrent checkpoint writes lose a prior claim | Tampering | Same lock plus durable temp/fsync/rename | SAFE-04 multi-process distinct claims |
| T-47-09 | Runtime-specific drift weakens Codex | Elevation of privilege | Shared mechanism with parity matrix | SAFE-05 Claude/Codex matrix |
| T-47-10 | Receipt claims completion despite contract failure | Repudiation | Terminal state derived from observed close/signal/bounds, never caller claim | SAFE-02 completion mismatch |

## Sources

### Primary (HIGH confidence)

- `src/runtime/router.mjs` — marker detection, worker spawn, prompt-path fail-open behavior. [VERIFIED: direct inspection]
- `src/adapters/dispatch/contract.mjs` — adapter API and structural resource gate. [VERIFIED: direct inspection]
- `src/adapters/dispatch/claude.mjs` — initial Set claim, worker marker read, boundedness gaps, partial durable resume. [VERIFIED: direct inspection]
- `src/adapters/dispatch/codex.mjs` — runtime drift and strategy-conditional durable resume. [VERIFIED: direct inspection]
- `src/adapters/dispatch/receipt.mjs` — stable identities, replace-style atomic publish, missing private modes/ID guard. [VERIFIED: direct inspection]
- `src/lease/store.mjs` — mutation lock, durable write, unlocked create transaction, unvalidated IDs. [VERIFIED: direct inspection]
- Current focused tests — 60 pass, 2 fail in `router.lease-resume`. [VERIFIED: executed 2026-08-09]
- `.planning/REQUIREMENTS.md`, `47-CONTEXT.md`, approved v1.7 design — locked scope and invariants. [VERIFIED: direct inspection]

### Secondary (MEDIUM confidence)

- https://nodejs.org/api/fs.html — exclusive flags, explicit modes, fsync, realpath, rename. [CITED: official Node documentation]
- https://nodejs.org/api/child_process.html — spawn streams, timeout, signals, shell behavior. [CITED: official Node documentation]
- https://nodejs.org/api/path.html — resolve/relative/normalization semantics. [CITED: official Node documentation]

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed version and built-in-only architecture verified locally.
- Architecture: HIGH — complete live caller trace across hook, both adapters, receipt store, and lease store.
- Pitfalls: HIGH — directly reproduced the durable-resume failures and inspected the missing enforcement/containment code.

**Research date:** 2026-08-09
**Valid until:** 2026-09-08, or immediately stale after Phase 47 source changes.
