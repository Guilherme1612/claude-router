# Phase 40: Project Identity, Leases, Continuity, and Safe Resume - Pattern Map

**Mapped:** 2026-08-07
**Files analyzed:** 11 (7 new modules + 4 modified/lifecycle + 6 new test files)
**Analogs found:** 11 / 11

> All code excerpts below were read directly from the source this session
> and tagged with `[VERIFIED: path:lines]`. Phase 40 is a *promotion*
> (in-memory → durable, ad-hoc marker → schema'd record, suggestion
> cooldown → continuity-briefing cadence), not a greenfield build — every
> mechanism has a proven seed in the codebase.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lease/identity.mjs` | utility | transform | `src/registry/fingerprint.mjs` + `src/registry/identity.mjs` | exact (pattern + vocabulary) |
| `src/lease/store.mjs` | store | CRUD + file-I/O | `src/steward/state.mjs` (`createStewardStore`) + `src/adapters/dispatch/receipt.mjs` | exact (atomic write + mutation lock + per-runtime root) |
| `src/lease/policy.mjs` | service (pure) | request-response | `src/intent/authority.mjs` (`evaluateAuthorityPolicy` sealed-input pattern) | exact (sealed-input, reason_code return shape) |
| `src/lease/briefing.mjs` | service (pure) | request-response | `src/steward/startup-pointer.mjs` (`loadStartupPointer` cooldown + validity gate) | role-match (cooldown pattern reused, briefing semantics new) |
| `src/adapters/dispatch/claude.mjs` (modified) | adapter | event-driven | itself: `claimIdempotency`/`releaseIdempotency` + `pauseImpl`/`resumeImpl` | exact (promote in-memory → durable) |
| `src/lifecycle/router-lifecycle.mjs` (modified) | config | batch | itself: `moduleNames` array + `moduleValues` flatMap | exact (additive list entry) |
| `tests/router.lease-identity.test.mjs` | test | unit (adversarial) | `tests/router.authority.test.mjs` (AUTH-01..02 adversarial pattern) | role-match |
| `tests/router.lease-creation.test.mjs` | test | unit | `tests/router.authority.test.mjs` (classification + reason_code assertions) | role-match |
| `tests/router.lease-inspect.test.mjs` | test | unit | `tests/router.steward-state.test.mjs` (read + idempotency assertions) | role-match |
| `tests/router.lease-revoke.test.mjs` | test | unit (adversarial) | `tests/router.authority.test.mjs` (AUTH-05 leg precedence) | role-match |
| `tests/router.lease-resume.test.mjs` | test | unit (stateful) | `tests/router.steward-state.test.mjs` (mutation lock + atomic write + restart) | role-match |
| `tests/router.lease-briefing.test.mjs` | test | unit | `tests/router.steward-startup.test.mjs` (cooldown + validity) | role-match |

## Pattern Assignments

### `src/lease/identity.mjs` (utility, transform)

**Analogs:** `src/registry/fingerprint.mjs:30-56` (composite fingerprint) + `src/registry/identity.mjs:4-8` (`scopeSuffix`) + `src/registry/schema.mjs:5,90-98` (`SCOPES` + `validateScope`)

**Imports pattern** (from `src/registry/fingerprint.mjs:1-6`):
```javascript
import { createHash } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';
// homedir / cwd / path NOT imported — identity receives axes as args (pure)
```

**Core fingerprint pattern** (`src/registry/fingerprint.mjs:30-56` — content-addressed, order-canonicalized, volatile fields excluded):
```javascript
export function computeCompositeEpoch({ entries = [], installedPlugins = [], modeMap = null, weights = null } = {}) {
  const semantic = (entries || []).map((entry) => { /* strip volatile `path` */ });
  // WR-03: canonicalize array element order BEFORE hashing so the epoch is
  // independent of enumeration order.
  const sortedSemantic = [...semantic].sort(compareBySerialization);
  return hash({ entries: sortedSemantic, installedPlugins: sortedPluginIds, modeMap, weights });
}
```

**Scope vocabulary pattern** (`src/registry/schema.mjs:5,90-98` — frozen enum, validated):
```javascript
const SCOPES = ['global', 'user', 'project', 'worktree'];
function validateScope(scope) {
  oneOf(scope.kind, SCOPES, 'capability.scope.kind');
  if (scope.kind === 'user') nonempty(scope.identity, 'capability.scope.identity');
  else if (scope.kind !== 'global') {
    nonempty(scope.repository, 'capability.scope.repository');
    nonempty(scope.worktree, 'capability.scope.worktree');
  }
}
```

**Scope encoding pattern** (`src/registry/identity.mjs:4-8` — `@{kind}:{repository}:{worktree}`):
```javascript
function scopeSuffix(scope) {
  if (!scope || scope.kind === 'global') return '';
  if (scope.kind === 'user') return `@user:${encodeURIComponent(scope.identity)}`;
  return `@${scope.kind}:${encodeURIComponent(scope.repository)}:${encodeURIComponent(scope.worktree)}`;
}
```

**LEASE-01 promotion:** compose the SIX axes (repo, worktree, runtime, goal, schema_generation, project_fingerprint) into a single sha256 over `stableStringify`. Reuse `compareBySerialization`-style ordering if any axis is array-typed. Never hardcode `homedir()` inside identity.mjs — receive axes as args (mirrors `computeCompositeEpoch`'s pure-function shape).

---

### `src/lease/store.mjs` (store, CRUD + file-I/O)

**Analogs:** `src/steward/state.mjs` (primary — mutation lock + durableWrite + factory) and `src/adapters/dispatch/receipt.mjs:66-69` (per-runtime root partition)

**Imports pattern** (`src/steward/state.mjs:1-8`):
```javascript
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';
```

**Per-runtime root pattern** (`src/adapters/dispatch/receipt.mjs:66-69` — LEASE-01 cross-runtime isolation):
```javascript
export function defaultReceiptRoot(runtime) {
  const dir = runtime === 'codex' ? '.codex' : '.claude';
  return join(homedir(), dir, 'router', 'receipts');
}
// Lease store mirrors: defaultLeaseRoot(runtime) → ~/.<runtime>/router/leases/
```

**Mutation lock pattern** (`src/steward/state.mjs:47-79` — mkdir-based, stale-PID recovery via `process.kill(pid, 0)`):
```javascript
function mutationLock(root, { timeout_ms = 2_000, stale_ms = 30_000 } = {}) {
  const path = join(root, '.mutation.lock');
  const deadline = Date.now() + timeout_ms;
  const token = randomUUID();
  while (Date.now() <= deadline) {
    try {
      mkdirSync(path, { mode: 0o700 });
      writeFileSync(join(path, 'owner.json'), JSON.stringify({ token, pid: process.pid, started_at: Date.now() }), { mode: 0o600 });
      return {
        acquired: true,
        release() { /* rmSync if owner.token matches */ },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') return { acquired: false, reason_code: 'mutation_lock_failed' };
      try {
        const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
        let alive = true;
        try { process.kill(owner.pid, 0); } catch { alive = false; }
        if (!alive && Date.now() - owner.started_at > stale_ms) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
      } catch { /* owner may still be publishing */ }
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  return { acquired: false, reason_code: 'mutation_lock_timeout' };
}
```

**Atomic durable write pattern** (`src/steward/state.mjs:81-89` — temp+fsync+rename+dir-fsync; reuse VERBATIM):
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

**Factory + mutate-under-lock pattern** (`src/steward/state.mjs:109-130` — the public surface to copy):
```javascript
export function createStewardStore({ root, lock: lockOptions } = {}) {
  const stewardRoot = root || join(homedir(), '.claude', 'router', 'steward');
  mkdirSync(stewardRoot, { recursive: true, mode: 0o700 });
  const statePath = join(stewardRoot, 'state.json');

  function readState() {
    if (!existsSync(statePath)) return emptyState();
    try { return normalizeState(JSON.parse(readFileSync(statePath, 'utf8'))); } catch { return emptyState(); }
  }

  function mutate(callback) {
    const lock = mutationLock(stewardRoot, lockOptions);
    if (!lock.acquired) return { status: 'blocked', reason_code: lock.reason_code };
    try {
      const state = readState();
      const result = callback(state);
      if (!result.changed) return { status: 'unchanged', ...result.data };
      durableWrite(statePath, state);
      return { status: 'stored', ...result.data };
    } finally { lock.release(); }
  }

  return Object.freeze({
    stewardRoot, statePath,
    readState,
    dismiss(...) { return mutate((state) => { /* ... */ }); },
    // ... other mutators all go through `mutate`
  });
}
```

**LEASE-03/04/05 promotion:** the lease store is a `createLeaseStore({ root, runtime, lock })` factory mirroring this shape. One lease per file (`<lease_id>.json`) under `~/.<runtime>/router/leases/` — NOT a single state.json — so `mutate(leaseId, callback)` reads one lease, applies the callback, and `durableWrite`s that single file. `claimCheckpoint(leaseId, actionId)` (LEASE-05) is a `mutate` that appends to `lease.claimed_actions`. `revoke(leaseId)` (LEASE-04) is a `mutate` that flips `status` to `'revoked'`. Read-only inspection (`readLease(leaseId)`, `findByFingerprint(fp)`) bypasses the lock.

**Privacy pattern** (`src/adapters/dispatch/receipt.mjs:31-41` — never store raw prompt):
```javascript
const SECRET_RE = /(?:sk-...|ghp_...|...)/gi;
export function redact(value) { return String(value ?? '').replace(SECRET_RE, '[REDACTED]'); }
export function hashPromptDerived(value) {
  return createHash('sha256').update(redact(value), 'utf8').digest('hex');
}
```
**Lease rule:** the `goal` field is a short structured operator-declared label, never the raw prompt. If any prompt-derived field is needed, reuse `hashPromptDerived` (import from `receipt.mjs` — do not redefine the regex).

---

### `src/lease/policy.mjs` (service, request-response, pure)

**Analogs:** `src/intent/authority.mjs:184-276` (sealed-input policy evaluator) + `src/orchestrator/approval.mjs` (sealed-input + reason_code shape)

**Sealed-input pattern** (`src/intent/authority.mjs:184-189` — DO NOT VIOLATE, AUTH-03 independence):
```javascript
export function evaluateAuthorityPolicy({
  confidence,
  authority = {},
  risk = {},
  compatibility = {},
} = {}) {
  const confidenceTier = typeof confidence === 'string' ? confidence : 'low';
  const authGranted = !!(authority && authority.authGranted);
  // `weights` is NOT a parameter. `confidence` is the tier STRING, never the
  // numeric score. The authority and risk legs cannot read confidence or weights.
```

**Decision legs + reason_code return shape** (`src/intent/authority.mjs:202-238` — fail-closed, first match wins):
```javascript
if (!eligible || disposition !== 'dispatch-candidate') {
  return { decision: 'block', reason_code: 'compatibility_unfit', confidence: confidenceTier, policy_version: AUTHORITY_POLICY_VERSION, ... };
}
if (protected_) {
  return { decision: 'pause', reason_code: 'protected_effect_requires_confirmation', ... };
}
if (!authGranted) {
  return { decision: 'block', reason_code: 'authority_not_granted', ... };
}
```

**Frozen vocabulary pattern** (`src/intent/authority.mjs:13-19` — `Object.freeze`, import don't redefine):
```javascript
export const AUTHORITY_CLASSES = Object.freeze([
  'advice', 'inspection', 'one_turn_action', 'persistent_goal_action', 'non_authorizing_discussion',
]);
```

**LEASE-04 precedence rule (research Pattern 1 + Pitfall 1):** `resolveLeaseAuthority(fingerprint, authority_class, leaseStore)` returns `{ authGranted, source, reason_code, lease? }`. Revocation precedence is encoded by checking `lease.status === 'revoked'` FIRST, then expiry, then fingerprint match — BEFORE any cache/weights/telemetry-derived recommendation. The function is pure w.r.t. its inputs but may read the lease store (the read is a side-effect-free file read under fail-open try/catch).

**Critical constraint (research Pitfall 1):** a lease sets `authority.authGranted = true` and `authority.source = 'lease:<id>'`. It does NOT set `authority.protected_ = false`. The protected-effect leg (leg 2 of `evaluateAuthorityPolicy`) STILL fires for a leased destructive effect. `policy.mjs` produces the authority-source input; `evaluateAuthorityPolicy` (unchanged) consumes it.

**LEASE-02 gate pattern** (`src/intent/authority.mjs:147-152` — only `persistent_goal_action` creates a lease):
```javascript
if (disposition === 'execute') {
  if (PERSISTENT_GOAL_MARKERS.test(text)) {
    return outcome('persistent_goal_action', disposition, 'persistent_goal_marker');
  }
  return outcome('one_turn_action', disposition, 'one_turn_action');
}
// LEASE-02: shouldCreateLease = (authority_class === 'persistent_goal_action' && explicitInstruction === true)
```

---

### `src/lease/briefing.mjs` (service, request-response, pure composer)

**Analogs:** `src/steward/startup-pointer.mjs:78-113` (loadStartupPointer — cooldown + validity gate + fail-closed `unavailable()`)

**Validity-gate + cooldown pattern** (`src/steward/startup-pointer.mjs:78-113`):
```javascript
export function loadStartupPointer({ ownedRoot, now = Date.now(), fs = {} } = {}) {
  if (typeof ownedRoot !== 'string' || !isAbsolute(ownedRoot)
      || !Number.isSafeInteger(now) || now < 0) return unavailable();
  const path = resolve(ownedRoot, 'steward', 'startup-pointer.json');
  // ... open with O_NOFOLLOW, size bound check, validate record ...
  const record = valid(JSON.parse(bytes.toString('utf8')));
  if (!record || (!record.available
      && (record.cooldown_until_ms === null || record.cooldown_until_ms > now))) {
    return unavailable();
  }
  return record.cooldown_until_ms !== null && record.cooldown_until_ms <= now
    ? { ...record, available: true, cooldown_until_ms: null }
    : record;
}
```

**Unavailable sentinel pattern** (`src/steward/startup-pointer.mjs:16-22`):
```javascript
const unavailable = () => ({
  schema_version: 1,
  policy_version: 'steward-policy-v1',
  fingerprint: null,
  available: false,
  cooldown_until_ms: null,
});
```

**Schema validation + size-bound pattern** (`src/steward/startup-pointer.mjs:9,24-42`):
```javascript
export const STARTUP_POINTER_MAX_BYTES = 4 * 1024;
const FIELDS = new Set(['schema_version', 'policy_version', 'fingerprint', 'available', 'cooldown_until_ms']);
function valid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== FIELDS.size
      || Object.keys(value).some(key => !FIELDS.has(key))
      || value.schema_version !== 1
      || /* ... */) return null;
  return { /* normalized record */ };
}
```

**LEASE-06 promotion:** `composeBriefing({ projectFingerprint, leaseStore, now = Date.now() })` is a pure function that returns `null` (silent) unless ALL validity predicates pass AND a lease record exists for the current fingerprint. Map the eight invalid states (`completed|blocked|expired|revoked|corrupt|stale|unauthorized|foreign`) to distinct `briefing_status` reason codes but ALL produce no injection. First visit (no lease record) = `null`. The briefing body references receipt IDs (operator inspects via `router-control.mjs` CLI) — keeps injection ≤120 tokens (CLAUDE.md constraint).

**Anti-pattern (research Pitfall 4):** never emit a briefing on a clean clone with no prior lease. The `leaseStore.findByFingerprint` miss path returns `null` before any validity check.

---

### `src/adapters/dispatch/claude.mjs` (modified — promote in-memory → durable)

**Analog:** itself, `src/adapters/dispatch/claude.mjs:138-152,322-358`

**Current in-memory idempotency (must become durable — LEASE-05)** (`claude.mjs:138-152`):
```javascript
const _idempotencySeen = new Set();
function claimIdempotency(key) {
  if (!key) return true;
  if (_idempotencySeen.has(key)) return false;
  _idempotencySeen.add(key);
  return true;
}
function releaseIdempotency(key) {
  if (key) _idempotencySeen.delete(key);
}
```

**Pause/resume pattern** (`claude.mjs:322-358` — receipt state transition + re-spawn with same key):
```javascript
function pauseImpl(receiptIdArg, adapter) {
  const existing = store.observe(receiptIdArg);
  if (!existing) return null;
  if (!['invoked', 'pending', 'completed'].includes(existing.completion_evidence?.state)) return existing;
  const paused = { ...existing, completion_evidence: { ...existing.completion_evidence, state: 'paused' } };
  store.publish(paused);
  return paused;
}

function resumeImpl(receiptIdArg, adapter) {
  const existing = store.observe(receiptIdArg);
  if (!existing || existing.completion_evidence?.state !== 'paused') return existing || null;
  const action = { lease_id: existing.invocation_identity?.lease_id, idempotency_key: existing.invocation_identity?.idempotency_key, /* ... */ };
  releaseIdempotency(action.idempotency_key);   // allow re-spawn with same key
  return invokeImpl(action, adapter);           // invokeImpl re-claims after spawn
}
```

**LEASE-05 promotion:** the in-memory `_idempotencySeen` Set is process-local and is lost on compaction/restart. Promote to `leaseStore.claimCheckpoint(lease_id, action_id)` (durable record on the lease). The in-memory Set may remain as a hot-path fast-path, but the durable read is authoritative on the resume path. `resumeImpl` becomes: read lease → `claimCheckpoint` (durable) → if `{ claimed: false, reason: 'already_claimed' }` return the existing receipt (at-most-once) → else re-spawn.

**Receipt publish pattern** (`claude.mjs:174-210,283-317` — `store.publish` writes atomic JSON + appends jsonl):
```javascript
const invokedReceipt = {
  schema_version: RECEIPT_SCHEMA_VERSION,
  receipt_id: buildReceiptId(invokedInvocation, action),
  invocation_identity: invokedInvocation,
  completion_evidence: { state: 'invoked' },
  intent: String(action.intent || ''),
  authority: String(action.authority || ''),
  risk: String(action.risk || ''),
  provenance: { adapter: CLAUDE_DISPATCH_VERSION, source_fingerprint: null },
};
store.publish(invokedReceipt);
```

**Lease binding:** `action.lease_id` already flows into `invocation_identity.lease_id` and `receiptId(...)` — keep this; a lease-scoped receipt is the LEASE-05 checkpoint evidence.

---

### `src/lifecycle/router-lifecycle.mjs` (modified — additive deploy)

**Analog:** itself, `src/lifecycle/router-lifecycle.mjs:384-425`

**moduleNames array + flatMap pattern** (`router-lifecycle.mjs:384-425`):
```javascript
const moduleNames = [
  'registry/build.mjs', /* ... */
  'intent/authority.mjs',                                    // Phase 39 additive
  'adapters/dispatch/contract.mjs', 'adapters/dispatch/receipt.mjs',
  'adapters/dispatch/claude.mjs', 'adapters/dispatch/codex.mjs', // Phase 38
  'steward/startup-pointer.mjs', 'steward/state.mjs', /* ... */
  // Phase 40: lease lifecycle — deploy to BOTH ownedRoot and codexOwnedRoot
  // via the moduleValues flatMap below (HOST-03 parity; T-39-03 regression
  // backstop). Lifecycle test count bump = the regression backstop.
  'lease/identity.mjs', 'lease/store.mjs',
  'lease/policy.mjs', 'lease/briefing.mjs',
];
const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
  moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))])
));
```

**Pitfall 6 avoidance:** add the 4 new module names to `moduleNames` ONLY — never write a custom deploy path. The `flatMap` over `[p.ownedRoot, p.codexOwnedRoot]` handles both runtimes. Bump the lifecycle test count (the count is the T-39-03 regression backstop).

---

### `tests/router.lease-*.test.mjs` (6 new test files)

**Analog:** `tests/router.authority.test.mjs` + `tests/router.steward-state.test.mjs` + `tests/router.steward-startup.test.mjs`

**Test scaffolding pattern** (`tests/router.authority.test.mjs:1-25`):
```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

const classifyModule = import('../src/intent/classify.mjs');
const authorityModule = import('../src/intent/authority.mjs');

async function authority(prompt) {
  const { classifyIntent } = await classifyModule;
  const { classifyAuthority } = await authorityModule;
  const intent = classifyIntent(prompt);
  return classifyAuthority(prompt, { intent });
}

test('[phase39:authority] AUTH-01 execute with no persistent marker -> one_turn_action', async () => {
  const cases = ['run the suite', 'execute the plan', /* ... */];
  for (const prompt of cases) {
    const result = await authority(prompt);
    assert.equal(result.authority_class, 'one_turn_action', `expected one_turn_action for: ${prompt}`);
    assert.equal(result.reason_code, 'one_turn_action', `reason_code for: ${prompt}`);
    assert.equal(result.policy_version, 'authority-policy-v1');
  }
});
```

**Tmpdir fixture + cleanup pattern** (`tests/router.steward-state.test.mjs:12-18`):
```javascript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FP = 'a'.repeat(64);          // 64-hex fingerprint stand-in
const NOW = 1_800_000_000_000;       // fixed clock for deterministic tests

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-steward-'));
  return { owned, root: join(owned, 'steward') };
}

test('state is private, atomic, and dismissal is idempotent', () => {
  const f = fixture();
  try {
    const store = createStewardStore({ root: f.root });
    assert.equal(statSync(f.root).mode & 0o777, 0o700);     // privacy
    assert.equal(store.dismiss(FP, { now: NOW }).status, 'stored');
    assert.equal(store.dismiss(FP, { now: NOW + 1 }).status, 'unchanged');  // idempotent
    assert.equal(statSync(store.statePath).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(f.root).filter((x) => x.includes('.tmp-')), []);  // no leftover temps
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});
```

**Adversarial / fail-closed pattern** (`tests/router.steward-state.test.mjs:70-88`):
```javascript
test('missing/corrupt state fails closed and held lock loses no data', () => {
  const f = fixture();
  try {
    const store = createStewardStore({ root: f.root, lock: { timeout_ms: 0 } });
    assert.deepEqual(store.readState(), { schema_version: 1, dismissed: {}, /* ... */ });
    writeFileSync(store.statePath, '{bad', { mode: 0o600 });   // corrupt
    assert.deepEqual(store.readState(), { /* empty */ });     // fails closed
    mkdirSync(join(f.root, '.mutation.lock'), { mode: 0o700 });  // held lock
    writeFileSync(join(f.root, '.mutation.lock', 'owner.json'), JSON.stringify({
      token: 'other', pid: process.pid, started_at: Date.now(),
    }), { mode: 0o600 });
    assert.equal(store.dismiss(FP, { now: NOW }).reason_code, 'mutation_lock_timeout');
    assert.equal(existsSync(store.statePath), true);          // no data loss
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});
```

**LEASE-05 simulated-restart test pattern:** delete the in-memory `_idempotencySeen` Set (or re-require the module with a fresh module registry), re-read the lease from disk, attempt a second `claimCheckpoint` — assert `{ claimed: false, reason: 'already_claimed' }`. This is the Pitfall-2 warning-signature test.

**LEASE-01 cross-runtime rejection test pattern:** create a lease under `runtime='claude'` with fingerprint F, then call `resolveLeaseAuthority` under `runtime='codex'` with the same axes — assert `{ authGranted: false, source: 'lease:foreign', reason: 'fingerprint_mismatch' }`. Per Pitfall 3.

## Shared Patterns

### Atomic durable write (applies to ALL lease mutations)
**Source:** `src/steward/state.mjs:81-89` [VERIFIED]
**Apply to:** `src/lease/store.mjs` (create, revoke, claimCheckpoint, status flip)
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

### Mutation lock (applies to ALL lease mutations under concurrency)
**Source:** `src/steward/state.mjs:47-79` [VERIFIED]
**Apply to:** `src/lease/store.mjs` — `mutate(leaseId, callback)` wraps every read-modify-write.
```javascript
// mkdir-based lock at <leaseRoot>/.mutation.lock with stale-PID recovery
// via process.kill(owner.pid, 0). Returns { acquired, release() | reason_code }.
```

### Per-runtime partition (applies to ALL lease path resolution — LEASE-01)
**Source:** `src/adapters/dispatch/receipt.mjs:66-69` [VERIFIED]
**Apply to:** `src/lease/store.mjs` `defaultLeaseRoot(runtime)`
```javascript
export function defaultLeaseRoot(runtime) {
  const dir = runtime === 'codex' ? '.codex' : '.claude';
  return join(homedir(), dir, 'router', 'leases');
}
```

### Sealed-input policy evaluator (applies to lease-as-authority-source)
**Source:** `src/intent/authority.mjs:184-189` [VERIFIED] — DO NOT CHANGE the signature
**Apply to:** `src/lease/policy.mjs` produces `authority = { authGranted, source: 'lease:<id>', protected_ }` which feeds into `evaluateAuthorityPolicy` unchanged. A lease NEVER sets `protected_ = false` (Pitfall 1).
```javascript
export function evaluateAuthorityPolicy({ confidence, authority = {}, risk = {}, compatibility = {} } = {}) {
  // authority.authGranted is the ONLY authority signal. A lease contributes
  // to authority.authGranted (it is an authority SOURCE), never a bypass.
```

### Fail-open + no `decision: 'block'` on the hot path
**Source:** `src/runtime/router.mjs` (established Phase 1/38/39) + `src/adapters/dispatch/receipt.mjs:76-87` (try/catch returns null)
**Apply to:** every lease read/write called from the router hot path
```javascript
// receipt.mjs:76-87 — atomic publish wrapped in try/catch, returns null on failure
export function publishAtomic(receipt, dir) {
  try {
    /* ... write + rename ... */
    return finalPath;
  } catch {
    return null;
  }
}
```
**Lease rule:** a lease-store throw MUST NOT block the prompt. Wrap hot-path lease reads in try/catch, return `{ authGranted: false, source: 'none', reason: 'lease_absent' }` on failure.

### Privacy / no-raw-prompt (applies to lease `goal` + any prompt-derived field)
**Source:** `src/adapters/dispatch/receipt.mjs:31-41` [VERIFIED]
**Apply to:** `src/lease/store.mjs` — the `goal` field is a short structured label. If a prompt-derived field is unavoidable, import and call `hashPromptDerived` from `receipt.mjs`; never redefine the redaction regex.
```javascript
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|...)/gi;
export function redact(value) { return String(value ?? '').replace(SECRET_RE, '[REDACTED]'); }
export function hashPromptDerived(value) {
  return createHash('sha256').update(redact(value), 'utf8').digest('hex');
}
```

### Frozen vocabulary (applies to lease-creation gate — LEASE-02)
**Source:** `src/intent/authority.mjs:13-19,35-39` [VERIFIED]
**Apply to:** `src/lease/policy.mjs` — import `AUTHORITY_CLASSES` and `PERSISTENT_GOAL_MARKERS` (re-exported as needed); never redefine. `shouldCreateLease` references `authority_class === 'persistent_goal_action'` and an explicit operator instruction. `one_turn_action` NEVER creates a lease.
```javascript
export const AUTHORITY_CLASSES = Object.freeze([ /* 5 classes */ ]);
const PERSISTENT_GOAL_MARKERS = new RegExp('\\b(until\\s+done|keep\\s+going|...|don' + APOS + '?t\\s+stop)\\b', 'i');
```

### Cross-runtime deploy parity (applies to lifecycle wiring — T-39-03 regression)
**Source:** `src/lifecycle/router-lifecycle.mjs:384,423-425` [VERIFIED]
**Apply to:** add the 4 new `lease/*.mjs` module names to `moduleNames`; the `moduleValues` flatMap over `[p.ownedRoot, p.codexOwnedRoot]` deploys to BOTH runtimes. Bump the lifecycle test count.
```javascript
const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
  moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))])
));
```

## No Analog Found

None. Every Phase 40 file has a strong analog in the codebase — Phase 40 is a promotion of existing primitives, not greenfield. The research document's "Don't Hand-Roll" table (RESEARCH §Don't Hand-Roll) maps each mechanism to its proven seed.

## Metadata

**Analog search scope:** `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/{intent,registry,steward,adapters,orchestrator,runtime,lifecycle}/*.mjs` and `/Users/guilherme/Desktop/ClaudeCode/Router-build/tests/router.{authority,steward-*,dispatch-*}.test.mjs`
**Files scanned:** 9 source modules + 4 test files
**Pattern extraction date:** 2026-08-07