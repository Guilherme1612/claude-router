# Phase 47: Dispatch and Storage Safety - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 11 implied new/modified files
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/runtime/router.mjs` | controller / hook | event-driven | `src/runtime/router.mjs:2624-2650` plus `bumpEvolveTrigger` at `2610-2621` | exact existing seam |
| `src/lease/store.mjs` | store | file-I/O / transactional mutation | `src/steward/state.mjs:47-94` | exact |
| `src/adapters/dispatch/receipt.mjs` | store / utility | file-I/O / state transition | `src/lease/store.mjs:63-105,166-176` | exact durability pattern |
| `src/adapters/dispatch/contract.mjs` | service / validation | request-response / child-process contract | `src/adapters/dispatch/contract.mjs:257-320` | exact existing seam |
| `src/adapters/dispatch/claude.mjs` | runtime adapter | event-driven / streaming child process | `src/adapters/dispatch/claude.mjs:256-393` | exact existing seam |
| `src/adapters/dispatch/codex.mjs` | runtime adapter | event-driven / streaming child process | `src/adapters/dispatch/claude.mjs:256-455` | runtime-parity analog |
| `tests/phase-38/native-dispatch.test.mjs` | integration test | event-driven / subprocess | same file, especially marker worker cases | exact |
| `tests/router.lease-resume.test.mjs` | store/integration test | file-I/O / state transition | same file `58-150` | exact |
| `tests/router.lease-identity.test.mjs` | store/security test | file-I/O | same file `84-127` | exact |
| `tests/router.trust-pregate.test.mjs` | contract test | request-response | same file `30-153` | exact |
| `tests/phase-44/receipts.test.mjs` | cross-runtime integration test | event-driven / file-I/O | same file `113-202` | exact |

The phase does not need a new source abstraction. If the planner wants consolidated phase coverage, one small `tests/phase-47/dispatch-storage-safety.test.mjs` may compose the existing public seams; otherwise extend the five exact suites above.

## Pattern Assignments

### `src/runtime/router.mjs` (controller/hook, event-driven)

**Analog:** current fire-and-forget dispatch trigger at `src/runtime/router.mjs:2624-2650`.

**Hot-path pattern** (`2636-2649`):

```javascript
export function triggerNativeDispatch({ leasePath = DISPATCH_LEASE_MARKER, workerPath = DISPATCH_WORKER_PATH } = {}) {
  try {
    if (!existsSync(leasePath)) return null;
    const child = spawn(process.execPath, [workerPath], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ROUTER_RUNTIME: RUNTIME },
    });
    child.unref();
    return child.pid;
  } catch {
    return null;
  }
}
```

Preserve the non-blocking, fail-open return contract. Put the atomic durable claim in worker-owned state before native execution; do not add synchronous filesystem waiting to prompt routing. `bumpEvolveTrigger` (`2610-2621`) is the adjacent pattern for detached worker spawn and `finally` cleanup, but the dispatch marker must become permanently claimed rather than reusable.

### `src/lease/store.mjs` (store, transactional file-I/O)

**Analog:** `src/steward/state.mjs:47-94`; the lease store already copied this pattern at `src/lease/store.mjs:63-105`.

**Mutation lock** (`src/lease/store.mjs:63-95`):

```javascript
function mutationLock(root, { timeout_ms = 2_000, stale_ms = 30_000 } = {}) {
  const path = join(root, '.mutation.lock');
  const deadline = Date.now() + timeout_ms;
  const token = randomUUID();
  while (Date.now() <= deadline) {
    try {
      mkdirSync(path, { mode: 0o700 });
      writeFileSync(join(path, 'owner.json'), JSON.stringify({ token, pid: process.pid, started_at: Date.now() }), { mode: 0o600 });
      return { acquired: true, release() { /* token-checked removal */ } };
    } catch (error) {
      if (error.code !== 'EEXIST') return { acquired: false, reason_code: 'mutation_lock_failed' };
      // stale owner recovery, then bounded Atomics.wait
    }
  }
  return { acquired: false, reason_code: 'mutation_lock_timeout' };
}
```

**Durable write** (`97-105`):

```javascript
function durableWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, `${stableStringify(value)}\n`, { mode: 0o600 });
  let fd;
  try { fd = openSync(tmp, 'r'); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
  renameSync(tmp, path);
  try { fd = openSync(dirname(path), 'r'); fsyncSync(fd); } catch { /* best effort */ }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best effort */ } }
}
```

**Core transaction pattern** (`166-176`): acquire lock, read authoritative record, mutate once, durable-write once, release in `finally`. Move `createLease`'s current read/check/write (`137-151`) under this same transaction; its current pre-lock check races.

**Durable claim pattern** (`210-220`):

```javascript
return mutate(leaseId, (lease) => {
  if (!Array.isArray(lease.claimed_actions)) lease.claimed_actions = [];
  if (lease.claimed_actions.includes(actionId)) {
    return { changed: false, data: { claimed: false, changed: false, reason: 'already_claimed' } };
  }
  lease.claimed_actions.push(actionId);
  return { changed: true, data: { claimed: true, changed: true } };
});
```

Use this as the sole authoritative initial-dispatch and resume claim. Phase decisions say successful claims are never reusable, so do not use `releaseCheckpoint` in normal execution/resume.

**Identifier validation analog:** `src/evolution/evidence.mjs:20-33`.

```javascript
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export function boundedToken(value, max = 128) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && TOKEN.test(value);
}
```

Validate `leaseId` and `actionId` before any `join`. Then verify the resolved target remains beneath `resolve(leaseRoot)`; `src/steward/state.mjs:91-94` provides the established `relative(resolve(root), resolve(path))` containment check. Reject malformed input rather than treating a missing lease/action ID as an authorization-preserving no-op at mutation boundaries.

### `src/adapters/dispatch/receipt.mjs` (store/utility, file-I/O and state transition)

**Analog:** durable lease/state writes above, not the current weaker receipt persistence.

Current `publishAtomic` (`295-305`) uses temp+rename but omits explicit modes, file fsync, directory fsync, identifier validation, and collision-safe temp identity. Replace its internals with the `src/lease/store.mjs:97-105` pattern while preserving its fail-open `null` return.

**Transition pattern** (`208-235`):

```javascript
export function transitionReceipt(receipt, state, patch = {}) {
  if (!receipt || typeof receipt !== 'object' || !receipt.receipt_id) throw new TypeError('receipt is required');
  if (!RECEIPT_STATES.includes(state)) throw new TypeError(`unknown receipt state: ${state}`);
  return {
    ...receipt,
    invocation_identity: { ...(receipt.invocation_identity || {}), ...(patch.invocation_identity ? bounded(patch.invocation_identity) : {}) },
    completion_evidence: { ...(receipt.completion_evidence || {}), ...(patch.completion_evidence ? bounded(patch.completion_evidence) : {}), state },
    route_state: patch.route_state || routeStateFor(state),
  };
}
```

Keep receipt state truth centralized here. Add any terminal reasons needed for timeout, truncation, retry exhaustion, and completion-contract failure to bounded technical evidence; adapters should not invent incompatible shapes.

**Private append pattern:** current `append` (`312-322`) only chmods on first create. Prefer `mkdirSync(dir,{recursive:true,mode:0o700})`, `appendFileSync(...,{flag:'a',mode:0o600})`, and explicit chmod/verification for pre-existing permissive paths. Apply the same bounded-token plus resolved-containment validation to `publishAtomic` and `read` before constructing `<receiptId>.json`.

### `src/adapters/dispatch/contract.mjs` (service/validation, child-process contract)

**Analog:** `preDispatchGate` at `257-320` is the single shared contract seam.

```javascript
if (!Number.isInteger(action?.timeout) || action.timeout <= 0) {
  return { ok: false, reason: 'missing_timeout' };
}
if (!Number.isInteger(action?.retry) || action.retry < 0 || !Number.isFinite(action.retry)) {
  return { ok: false, reason: 'unbounded_retry' };
}
if (!action?.output_bounds || typeof action.output_bounds !== 'object') {
  return { ok: false, reason: 'missing_output_bounds' };
}
if (!action?.completion_contract || typeof action.completion_contract !== 'object') {
  return { ok: false, reason: 'missing_completion_contract' };
}
```

This currently proves only declaration. Extend the shared contract module with the minimum built-in enforcement helper consumed by both adapters: bounded stdout accumulation, a timer that terminates the child, retry accounting, and completion evaluation. Use Node built-ins only. Return one normalized outcome so both variants publish identical reason/state semantics.

### `src/adapters/dispatch/claude.mjs` (runtime adapter, streaming child process)

**Analog:** current invoke path `256-393`.

Preserve validation ordering: `validateStrategyBounds` -> `canDispatch` -> `validateInvocation` -> `preDispatchGate` -> **durable work claim** -> pending receipt -> spawn. Replace the process-local authoritative decision at `276-279`:

```javascript
const idempotencyKey = String(action.idempotency_key || '');
if (idempotencyKey && !claimIdempotency(idempotencyKey)) {
  return recommendationOnly(action, 'idempotency_already_claimed');
}
```

with `createLeaseStore(...).claimCheckpoint(...)` before spawn. The `_idempotencySeen` set may remain only as an optional fast path after the durable decision; it cannot authorize execution.

Replace the unbounded `chunks.push(c)` at `322` and exit-only completion at `352-371` with the shared contract enforcement helper. Publish `invoked` after a successful spawn and one truthful terminal receipt after enforced termination/completion. Keep the worker alive to observe exit; keep the prompt hook detached.

Resume already has the right broad shape at `410-455`: read paused receipt, reconstruct action, claim durable checkpoint, then invoke. Remove legacy fail-open authorization where a missing lease record or module allows resume; malformed/foreign mutation state must fail closed. Ensure resource fields needed for resume are persisted in the receipt rather than read as currently absent top-level properties.

### `src/adapters/dispatch/codex.mjs` (runtime adapter, streaming child process)

**Analog:** Claude adapter. Keep differences only at runtime identity, installed marker, owned roots, and bundle-loading seam.

Codex currently claims durably only when `existing.strategy_plan?.replan_count !== undefined` (`341-347`), unlike Claude. Use the same unconditional durable claim contract for every initial dispatch and resume with durable identity. The spawn/output/terminal path at `203-299` is line-for-line analogous to Claude and should consume the same shared enforcement helper, not a second implementation.

### Test suites (Node test runner, subprocess/file-I/O)

**At-most-once test pattern:** `tests/router.lease-resume.test.mjs:61-137` creates a store, claims twice, creates a fresh store over the same root, and proves `already_claimed`. Extend it with colliding child processes or workers so the assertion proves atomicity across processes, not just sequential store instances.

```javascript
const store1 = createLeaseStore({ root: f.root });
store1.claimCheckpoint(fp, 'k1');
const store2 = createLeaseStore({ root: f.root });
assert.equal(store2.claimCheckpoint(fp, 'k1').reason, 'already_claimed');
```

**Permissions/durability pattern:** `tests/router.lease-identity.test.mjs:84-100` and `tests/router.health.privacy.test.mjs:56-82` assert `mode & 0o777`, absence of temp files, and readable round-trip state. Apply the same assertions to receipt root, receipt JSON, and `receipts.jsonl` under a deliberately permissive umask/pre-existing directory.

**Held-lock fail-closed pattern:** `tests/router.health.privacy.test.mjs:157-170` creates `.mutation.lock` with the live PID, sets `timeout_ms: 0`, and asserts no mutation file is produced. Reuse for lease create and checkpoint mutation.

**Resource contract pattern:** `tests/router.trust-pregate.test.mjs:30-153` has one table-like fixture and stable reason assertions. Add real child fixtures that sleep, exceed byte/line caps, fail until retries exhaust, and exit zero without satisfying the completion contract. Poll receipts as in `tests/phase-44/receipts.test.mjs:113-129`; assert termination plus exact terminal state/reason/evidence.

**Cross-runtime parity pattern:** `tests/phase-44/receipts.test.mjs:157-202` runs the same `actionFor(runtime)` through Claude and Codex and separately verifies runtime partitioning. Use the same table-driven action and assertions for initial duplicate dispatch, restart simulation, and resume; do not let one runtime's receipt attest for the other.

**Prompt-worker integration pattern:** `tests/phase-38/native-dispatch.test.mjs` already writes `dispatch-lease.json`, runs the hook subprocess, and polls runtime receipts. Trigger the same marker concurrently/repeatedly and assert exactly one native side effect plus a stable already-claimed observation.

## Shared Patterns

### Trust-boundary order

Apply to both runtime adapters:

```text
structural/authority validation
  -> bounded identifier validation
  -> resolved-root containment
  -> atomic durable claim
  -> pending receipt
  -> bounded child execution
  -> one truthful terminal receipt
```

The durable claim must precede spawn. Prompt routing stays fire-and-forget and fail-open; worker mutation and execution gates fail closed.

### Filesystem privacy

- Owned directories: explicit `0o700`.
- Files and lock owner records: explicit `0o600`.
- Durable JSON: unique temp -> file fsync -> rename -> directory fsync.
- Mutation: lock -> read -> check -> write -> release in `finally`.
- Reads: validate identifier first, resolve target, prove containment, then read; corrupt/missing state never authorizes work.

### Receipt truth

Use `buildPendingReceipt` and `transitionReceipt`; never hand-build runtime-specific terminal schemas. Preserve redaction/bounding from `receipt.mjs:29-109`. Timeout, truncation, retry exhaustion, signal termination, and completion mismatch need stable bounded reason codes and must not receive outcome credit.

### Minimal factoring

One shared bounded-child helper in the existing dispatch contract area is sufficient. Keep runtime adapters as thin callers. Do not add a queue, daemon, dependency, generic storage framework, or future-runtime interface.

## No Analog Found

None. Every Phase 47 responsibility has a close existing analog. The missing behavior is enforcement/composition: existing code validates bounds but does not enforce them, and existing durable claims do not govern every initial and resume path.

## Metadata

**Analog search scope:** `src/runtime`, `src/adapters/dispatch`, `src/lease`, `src/steward`, `src/health`, `src/evolution`, `tests`, `tests/phase-38`, `tests/phase-44`

**Primary files scanned:** 18

**Pattern extraction date:** 2026-08-09
