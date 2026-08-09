# Phase 38: Cross-Runtime Native Feasibility - Pattern Map

**Mapped:** 2026-08-06
**Files analyzed:** 11 (9 new, 2 modified)
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/adapters/dispatch/contract.mjs` (new) | contract/interface | request-response | `src/adapters/claude.mjs` (`createAdapter` factory shape) | role-match (interface, not discovery) |
| `src/adapters/dispatch/claude.mjs` (new) | adapter | event-driven (spawn) | `~/.claude/hooks/router.mjs` `bumpEvolveTrigger` (spawn+unref) | exact (same data flow) |
| `src/adapters/dispatch/codex.mjs` (new) | adapter | event-driven (spawn) | `~/.claude/hooks/router.mjs` `bumpEvolveTrigger` + `src/adapters/codex.mjs` (runtime layout) | exact (same data flow) |
| `src/adapters/dispatch/receipt.mjs` (new) | store/utility | file-I/O (atomic write + append) | `~/.claude/hooks/router.mjs` `saveCache` (temp+rename) + `logTelemetry` (append-only jsonl) | exact |
| `src/runtime/router.mjs` (modified — minimal) | hook | request-response | `~/.claude/hooks/router.mjs` `bumpEvolveTrigger` call site (off-hot-path trigger) | exact (self-modification) |
| `src/lifecycle/router-lifecycle.mjs` (modified) | config/build | file-I/O (deploy bundle) | `src/lifecycle/router-lifecycle.mjs` `moduleNames` bundle list (lines 384-409) | exact (self-modification) |
| `tests/fixtures/dispatch/harmless.mjs` (new) | fixture | batch (deterministic exit) | `tests/router.adapters.test.mjs` `fixture()` helper (mkdtempSync layout) | role-match (test fixture) |
| `tests/router.dispatch-native.claude.test.mjs` (new) | test | integration + anti-cheat | `tests/router.adapters.test.mjs` (node:test + mkdtempSync + assertions) | role-match |
| `tests/router.dispatch-native.codex.test.mjs` (new) | test | integration + anti-cheat | `tests/router.adapters.test.mjs` | role-match |
| `tests/router.dispatch-parity.test.mjs` (new) | test | parity + fallback | `tests/router.adapters.test.mjs` + `tests/router.coexistence.test.mjs` (spawnSync hook driver) | role-match |
| `tests/router.dispatch-perf.test.mjs` (new) | test | perf + invariant | `tests/router.perf.test.mjs` (hrtime + ROUTER_DEBUG_LATENCY + spawnSync) | exact (same data flow) |

## Pattern Assignments

### `src/adapters/dispatch/contract.mjs` (contract/interface, request-response)

**Analog:** `src/adapters/claude.mjs` `createAdapter` factory + `runtime_variants` shape (lines 342, 449, 488)

The dispatch adapter contract must mirror the discovery adapter's identity shape so a receipt is traceable to a manifest capability — do NOT invent a parallel identity space (RESEARCH.md §Code Examples, "identity continuity").

**Adapter factory pattern** (`src/adapters/claude.mjs:342-349`):
```javascript
export function createAdapter({ runtime, adapterVersion, layout, configExpander }) {
  // ... parseArtifact / normalizeArtifact / discover / compileInvocation ...
  return { parseArtifact, normalizeArtifact, discover, compileInvocation };
}
const adapter = createAdapter({ runtime: 'claude', adapterVersion: CLAUDE_VERSION, layout: claudeLayout });
export const compileInvocation = adapter.compileInvocation;
```

**Identity continuity shape** (`src/adapters/claude.mjs:449`):
```javascript
runtime_variants: [{ runtime, native_identity: String(nativeRecord.data.native_identity || nativeRecord.name), native_invocation: nativeInvocation }]
// :488
function compileInvocation(record) { return { runtime, command: record.invocation.command, args: [...record.invocation.args] }; }
```

The `NativeDispatchAdapter` contract should expose `canDispatch()`, `invoke(action)`, `observe(receiptId)`, `pause(receiptId)`, `resume(receiptId)` (RESEARCH.md §Pattern 1 sketch). The `invocation_identity` field MUST reference the same `native_identity` the discovery adapter emits.

---

### `src/adapters/dispatch/claude.mjs` (adapter, event-driven spawn)

**Analog:** `~/.claude/hooks/router.mjs` `bumpEvolveTrigger` (lines 2307-2343)

This is the load-bearing pattern: fire-and-forget `spawn().unref()` off the prompt hot path. The dispatch adapter uses the SAME pattern — spawn the harmless fixture, capture completion off the hot path, write a receipt.

**Fire-and-forget spawn pattern** (`~/.claude/hooks/router.mjs:2307-2343`):
```javascript
// Phase 3 / EVO-02: atomic counter + worker spawn (D-03). Increments the
// .evolve-trigger file on every prompt; on counter % 200 === 0, spawns the
// worker detached + stdio:'ignore' + unref() so the hook returns immediately
// (Pitfall 6: the worker must not block the hot path).
export function bumpEvolveTrigger({ triggerPath = TRIGGER, workerPath = WORKER_PATH } = {}) {
  // ... lock acquisition omitted for brevity ...
    if (n % EVOLVE_TRIGGER_N === 0) {
      try {
        spawn(process.execPath, [workerPath], {
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, ROUTER_RUNTIME: RUNTIME },
        }).unref();
      } catch {}
    }
    return n;
}
```

For the dispatch adapter, change `stdio: 'ignore'` to `stdio: ['ignore', 'pipe', 'pipe']` to capture stdout for `stdout_sha256` (RESEARCH.md §Code Examples, "Existing fire-and-forget spawn pattern"):
```javascript
import { spawn } from 'node:child_process';
function dispatchFireAndForget(fixtureCmd, receiptStore) {
  const child = spawn(fixtureCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.unref();                          // never block the prompt path
  const startNs = process.hrtime.bigint();
  const chunks = [];
  child.stdout.on('data', (c) => chunks.push(c));
  child.on('exit', (code) => { /* build receipt, publishAtomic */ });
}
```

**Runtime detection (reuse — do not rebuild)** (`~/.claude/hooks/router.mjs:83-92`):
```javascript
export function detectRuntime() {
  try {
    const override = process.env.ROUTER_RUNTIME;
    if (override === 'claude' || override === 'codex') return override;
    if (String(process.argv[1] || '').includes('.codex/')) return 'codex';
    return 'claude';
  } catch { return 'claude'; }
}
```

**Path-escape validation (reuse for fixture command validation)** (`src/adapters/claude.mjs:246-289`):
```javascript
function portableTarget(value, rootPath) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    if (!rootPath) return null;
    const root = rootPath.replaceAll('\\', '/').replace(/\/$/, '');
    if (normalized === root) return '';
    if (normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1);
    return null;
  }
  const parts = normalized.split('/');
  if (parts.includes('..')) return null;
  return normalized.replace(/^\.\//, '');
}
function commandReference(command, rootPath) {
  if (typeof command !== 'string' || !command.trim()) return { valid: false, reason: 'unsupported_command_form' };
  const tokens = splitShellTokens(command.trim());
  if (!tokens.length || tokens.some((token) => !/^[A-Za-z0-9_./:$@+\-]*$/.test(token))) {
    return { valid: false, reason: 'unsupported_command_form' };
  }
  const target = portableTarget(tokens.at(-1), rootPath);
  return target ? { valid: true, target_ref: target, command: tokens[0], args: tokens.slice(1) }
    : { valid: false, reason: 'path_escape' };
}
```
The adapter must NEVER spawn an arbitrary user string; the fixture command comes from a fixed, validated lease path (RESEARCH.md §Security Domain V5).

**Codex runtime layout** (`src/adapters/codex.mjs:42-51`) — the codex dispatch adapter mirrors this `createAdapter` delegation pattern:
```javascript
const adapter = createAdapter({ runtime: 'codex', adapterVersion: 'codex-adapter/3', layout, configExpander: expandConfig });
export const parseArtifact = adapter.parseArtifact;
export const compileInvocation = adapter.compileInvocation;
```

---

### `src/adapters/dispatch/codex.mjs` (adapter, event-driven spawn)

**Analog:** `~/.claude/hooks/router.mjs` `bumpEvolveTrigger` (spawn+unref) + `src/adapters/codex.mjs` (runtime delegation)

The dispatch MECHANISM (`child_process.spawn`) is IDENTICAL across runtimes (RESEARCH.md §Pitfall 3). The Codex adapter differs only in: (1) `runtime: 'codex'` field, (2) receipt partition path `~/.codex/router/receipts/`, (3) any runtime-specific observation surface. Branch only at the binding/observation seam, never inside the spawn path.

Use the same `dispatchFireAndForget` body as `claude.mjs`; route via `detectRuntime()` and `os.homedir()`-joined `~/.codex/router/receipts/` path.

---

### `src/adapters/dispatch/receipt.mjs` (store/utility, file-I/O atomic + append)

**Analog:** `~/.claude/hooks/router.mjs` `saveCache` (atomic temp+rename, lines 1938-1943) + `logTelemetry` (append-only jsonl, lines 1979-1996)

Two patterns compose: atomic publish for single-receipt writes (when a receipt must be readable immediately after spawn completes) and append-only jsonl for the receipt log (RESEARCH.md §Open Question 3 recommends append-only `receipts.jsonl` per runtime, GC deferred to Phase 44).

**Atomic write pattern** (`~/.claude/hooks/router.mjs:1938-1943`):
```javascript
// Atomic write (RTE-06): temp-file + renameSync (atomic on POSIX).
export function saveCache(cache, path = CACHE) {
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, path);
}
```

**Append-only jsonl pattern** (`~/.claude/hooks/router.mjs:1979-1996`):
```javascript
// Append one JSON line to telemetry.jsonl. Atomic appendFileSync (flag 'a'),
// each line < 4KB (well under macOS PIPE_BUF 4096) → concurrent sessions don't
// interleave (Pitfall 16). On first creation chmod 0600 (owner read/write only).
// Wrapped in try/catch — a telemetry write error MUST NOT block injection (fail-open).
export function logTelemetry(entry, telemetryPath = TELEMETRY) {
  try {
    const line = JSON.stringify(entry) + '\n';
    const existedBefore = existsSync(telemetryPath);
    appendFileSync(telemetryPath, line, { flag: 'a' });
    if (!existedBefore) {
      try { chmodSync(telemetryPath, 0o600); } catch { /* perms best-effort */ }
    }
  } catch {
    // Never block injection on a telemetry write failure (fail-open).
  }
}
```

**Receipt integrity (sha256)** (`~/.claude/hooks/router.mjs:1973-1977`):
```javascript
export function promptSignature(normalizedPrompt, intentKeywords) {
  const redacted = redact(String(normalizedPrompt || ''));
  const iks = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  return createHash('sha256').update(`${redacted}|${iks}`).digest('hex');
}
```
The receipt's `stdout_sha256` and `receipt_id` use the same `createHash('sha256')` stdlib pattern — never hand-roll (RESEARCH.md §Don't Hand-Roll). Apply `redact()` before hashing any field that could contain prompt-derived text (Pitfall 8 defense-in-depth; receipts must not leak raw prompt text — only hashes + command + exit + wall time).

**Cross-runtime partition discipline** — receipts live at `~/.claude/router/receipts/` (claude) and `~/.codex/router/receipts/` (codex), mirroring the existing `~/.{claude,codex}/router/` telemetry/cache isolation (RESEARCH.md §Runtime State Inventory, PARITY-02). Use `os.homedir()` — never hardcode `/Users/guilherme`.

---

### `src/runtime/router.mjs` (modified — minimal, hook)

**Analog:** `~/.claude/hooks/router.mjs` `bumpEvolveTrigger` call site (lines 3206, 3779) + `emit()` (lines 3724-3731)

Minimal change: wire the dispatch trigger OFF the prompt hot path (HOST-04 forbids prompt-path mutation). The precedent is the existing `bumpEvolveTrigger()` call in `main()` (line 3779) which is already fire-and-forget off the hot path.

**Existing off-hot-path trigger call** (`~/.claude/hooks/router.mjs:3779`):
```javascript
try { bumpEvolveTrigger(); } catch {}
```

**Recommendation (RESEARCH.md §Open Question 1):** Pick option (c) — a fire-and-forget worker spawned from the prompt path like `bumpEvolveTrigger`, leaving the existing PostToolUse observer (b) for Phase 44. The dispatch trigger should be gated by an active-lease check (Phase 40 owns full lease semantics; Phase 38 ships a minimal fixture lease).

**emit() — the recommendation-text channel (do NOT extend to "proof")** (`~/.claude/hooks/router.mjs:3724-3731`):
```javascript
function emit(additionalContext) {
  writeSync(1, JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  }));
}
```
`additionalContext` is model-readable text. The model acts; Router does not. This is the recommendation-only surface — NOT proof of dispatch (RESEARCH.md §Code Examples, §Anti-Patterns). When `canDispatch()` returns false, the prompt path emits text only and a `recommendation_only` receipt is written — never a fake `invoked` claim.

**Token budget (reuse for HOST-04 ≤120 tokens)** (`~/.claude/hooks/router.mjs:2755-2758`):
```javascript
export function tokenCount(text) {
  return Math.ceil(String(text || '').length / 4);
}
```
Phase 38 dispatch-related injection lines must stay ≤120 tokens (HOST-04). Enforce a tighter cap for any dispatch-related line in the prompt/startup path; large receipts stay in `receipts/` and only a compact reference + one-line summary is injected (RESEARCH.md §Pitfall 5, 10,000-char `additionalContext` cap).

---

### `src/lifecycle/router-lifecycle.mjs` (modified, config/build)

**Analog:** `src/lifecycle/router-lifecycle.mjs` `moduleNames` bundle list (lines 384-409) + `gateFixtureNames` (lines 436+)

Add `src/adapters/dispatch/{contract,claude,codex,receipt}.mjs` to the `moduleNames` array so they deploy to `<ownedRoot>/modules/adapters/dispatch/` at install/upgrade. Add `tests/fixtures/dispatch/harmless.mjs` to `gateFixtureNames` (or a parallel fixture list) so the anti-cheat tests can run from the deployed tree.

**Bundle list pattern** (`src/lifecycle/router-lifecycle.mjs:384-409`):
```javascript
  const moduleNames = [
    'registry/build.mjs', 'registry/schema.mjs', 'registry/identity.mjs',
    // ...
    'adapters/claude.mjs', 'adapters/codex.mjs',
    // Phase 38: add dispatch adapters
    // 'adapters/dispatch/contract.mjs', 'adapters/dispatch/claude.mjs',
    // 'adapters/dispatch/codex.mjs', 'adapters/dispatch/receipt.mjs',
    // ...
  ];
  const moduleValues = [p.ownedRoot, p.codexOwnedRoot].flatMap(runtimeRoot => (
    moduleNames.map(name => [join(runtimeRoot, 'modules', name), readFileSync(join(sourceRoot, name))])
  ));
```

**Gate fixture list pattern** (`src/lifecycle/router-lifecycle.mjs:436-438`):
```javascript
  const gateFixtureNames = [
    'tests/router.registry-schema.test.mjs',
    'tests/router.adapters.test.mjs',
    // Phase 38: add dispatch tests + fixture
    // 'tests/router.dispatch-native.claude.test.mjs',
    // 'tests/router.dispatch-native.codex.test.mjs',
    // 'tests/router.dispatch-parity.test.mjs',
    // 'tests/router.dispatch-perf.test.mjs',
    // 'tests/fixtures/dispatch/harmless.mjs',
    // ...
  ];
```
The `moduleValues` flatMap deploys to BOTH `ownedRoot` and `codexOwnedRoot` — receipts partition by runtime dir at read time, so a single deployed module set serves both runtimes (consistent with the existing telemetry/cache isolation discipline).

---

### `tests/fixtures/dispatch/harmless.mjs` (fixture, batch deterministic)

**Analog:** `tests/router.adapters.test.mjs` `fixture()` helper (lines 19-51) for tmpdir layout discipline

The fixture must be a real host process the adapter spawns with deterministic exit + stdout so `stdout_sha256` is reproducible (RESEARCH.md §Open Question 2). Recommended location: repo `tests/fixtures/dispatch/harmless.mjs`, copied by the deploy bundle.

**Fixture tmpdir pattern** (`tests/router.adapters.test.mjs:19-22`):
```javascript
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-adapters-native-'));
  const claudeRoot = join(root, 'claude');
  // ...
}
```
The harmless fixture itself should: write a temp file with a known content hash under `os.tmpdir()`, print a deterministic line to stdout, exit 0. Anti-cheat: the test asserts the adapter spawned IT (pid + command in `invocation_identity`), not that the file exists (RESEARCH.md §Open Question 2).

---

### `tests/router.dispatch-native.claude.test.mjs` (test, integration + anti-cheat)

**Analog:** `tests/router.adapters.test.mjs` (node:test + mkdtempSync + assert/strict)

HOST-01 anti-cheat test. RED first: assert that (a) recommendation-only path produces no `invoked` receipt, (b) test-helper-only path produces no adapter-issued `invocation_identity`, (c) adapter-spawn path produces a receipt with `invocation_identity` + linked `completion_evidence`.

**Test scaffold pattern** (`tests/router.adapters.test.mjs:1-17`):
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import * as claude from '../src/adapters/claude.mjs';

function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
}
```
The dispatch test uses the same `mkdtempSync` + `rmSync(..., { recursive: true, force: true })` discipline to isolate `~/.claude/router/receipts/` to a temp HOME. Use `after(() => rmSync(TEST_HOME, ...))` (see `tests/router.perf.test.mjs:22`).

**Anti-cheat assertion property** (RESEARCH.md §Pitfall 1, §Validation Architecture):
- Assert receipt has `invocation_identity.adapter` === adapter id, `pid` is a number, `command` matches the fixture, `idempotency_key` present.
- Assert `completion_evidence.exit_code` === 0 and `stdout_sha256` matches the fixture's deterministic stdout.
- Assert removing the adapter from the test causes the receipt to be absent or `recommendation_only`.
- Assert a test helper running the fixture alone produces NO receipt with `state: 'invoked'`.

---

### `tests/router.dispatch-native.codex.test.mjs` (test, integration + anti-cheat)

**Analog:** `tests/router.adapters.test.mjs` (same structure as the Claude test above, with `codex` import + `ROUTER_RUNTIME=codex` env)

HOST-02 anti-cheat. Same structural assertions as the Claude test, with: (1) `runtime: 'codex'` in the receipt, (2) receipts at `~/.codex/router/receipts/` (temp HOME), (3) `detectRuntime()` returning `'codex'` via `ROUTER_RUNTIME=codex` env override.

---

### `tests/router.dispatch-parity.test.mjs` (test, parity + fallback)

**Analog:** `tests/router.adapters.test.mjs` + `tests/router.coexistence.test.mjs` (spawnSync hook driver)

HOST-03 equivalence + recommendation-only fallback. Asserts: (1) same intent/authority/risk tuple on both runtimes (structural equality), (2) same terminal `state`, (3) incompatible adapter → `recommendation_only` receipt, no `invoked` claim, prompt path emits text only.

**spawnSync hook driver pattern** (`tests/router.coexistence.test.mjs` — referenced in RESEARCH.md sources; same pattern as `tests/router.perf.test.mjs:30-37`):
```javascript
import { spawnSync } from 'node:child_process';
const r = spawnSync(NODE, [HOOK], {
  input: TRIVIAL_PROMPT,
  encoding: 'utf8',
  env: { ...process.env, HOME: TEST_HOME, ROUTER_DEBUG_LATENCY: '1', ROUTER_RUNTIME: 'codex' },
});
```
Drive both runtimes through the same hook entrypoint with `ROUTER_RUNTIME` flipped to assert parity.

---

### `tests/router.dispatch-perf.test.mjs` (test, perf + invariant)

**Analog:** `tests/router.perf.test.mjs` (exact match — same data flow)

HOST-04 latency (hrtime) + token (tokenCount) + hot-path invariants (no spawn/scan/hash/network on prompt path). Warm p95 ≤25ms, p99 ≤50ms, hard max <100ms; startup p95 ≤50ms; injection ≤120 tokens.

**Perf test scaffold** (`tests/router.perf.test.mjs:1-40`):
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const HOOK = resolve('src/runtime/router.mjs');
const NODE = process.execPath;
const TEST_HOME = mkdtempSync(join(tmpdir(), 'router-perf-home-'));
after(() => rmSync(TEST_HOME, { recursive: true, force: true }));
const TRIVIAL_PROMPT = JSON.stringify({ prompt: 'thanks' });
const BUDGET_MS = 100;
const WALL_BUDGET_MS = 250;

function runOnce() {
  const start = performance.now();
  const r = spawnSync(NODE, [HOOK], {
    input: TRIVIAL_PROMPT,
    encoding: 'utf8',
    env: { ...process.env, HOME: TEST_HOME, ROUTER_DEBUG_LATENCY: '1' },
  });
  const wall = performance.now() - start;
  // ... parse stderr for ROUTER_DEBUG_LATENCY hrtime line ...
}
```
Reuse `ROUTER_DEBUG_LATENCY=1` and the hook's own `process.hrtime.bigint()` debug line to assert in-process latency (RESEARCH.md §Don't Hand-Roll). Reuse `tokenCount()` (`~/.claude/hooks/router.mjs:2755-2758`) to assert injection ≤120 tokens.

**Hot-path invariant assertion** — assert the prompt path performs NO `spawnSync`/`execSync`/scan/hash/network. The perf test should spawn the hook with a dispatch-enabled config and verify the in-process latency stays within budget (spawn happens off the hot path via `unref()`, so it does not count against the hook's own hrtime delta — RESEARCH.md §Assumption A1).

---

## Shared Patterns

### Fire-and-forget spawn (off hot path)
**Source:** `~/.claude/hooks/router.mjs:2307-2343` (`bumpEvolveTrigger`)
**Apply to:** `src/adapters/dispatch/claude.mjs`, `src/adapters/dispatch/codex.mjs`
```javascript
spawn(process.execPath, [workerPath], {
  detached: true,
  stdio: 'ignore',   // dispatch uses ['ignore','pipe','pipe'] to capture stdout
  env: { ...process.env, ROUTER_RUNTIME: RUNTIME },
}).unref();
```
The `unref()` is load-bearing — the hook must return within the `UserPromptSubmit` timeout regardless of whether the child has exited.

### Atomic file publish (POSIX rename)
**Source:** `~/.claude/hooks/router.mjs:1938-1943` (`saveCache`)
**Apply to:** `src/adapters/dispatch/receipt.mjs`
```javascript
const tmp = `${path}.tmp.${process.pid}`;
writeFileSync(tmp, JSON.stringify(value));
renameSync(tmp, path);
```

### Append-only jsonl (concurrency-safe, fail-open)
**Source:** `~/.claude/hooks/router.mjs:1979-1996` (`logTelemetry`)
**Apply to:** `src/adapters/dispatch/receipt.mjs` (receipt log)
```javascript
try {
  const line = JSON.stringify(entry) + '\n';
  const existedBefore = existsSync(path);
  appendFileSync(path, line, { flag: 'a' });
  if (!existedBefore) { try { chmodSync(path, 0o600); } catch {} }
} catch { /* fail-open: never block on a receipt write failure */ }
```

### sha256 integrity + secret redaction
**Source:** `~/.claude/hooks/router.mjs:1965-1977` (`redact`, `promptSignature`)
**Apply to:** `src/adapters/dispatch/receipt.mjs` (stdout_sha256, receipt_id, idempotency_key)
```javascript
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xoxb-[0-9-Za-z]+|gho_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20}|[A-Za-z0-9_\-]{32,}={0,2})/gi;
export function redact(s) { return String(s).replace(SECRET_RE, '[REDACTED]'); }
// createHash('sha256').update(redacted + '|' + iks).digest('hex')
```
Never log raw prompt text; apply `redact()` before hashing any prompt-derived field. Receipts store only hashes + command + exit + wall time (RESEARCH.md §Security Domain V7/V8).

### Runtime detection + cross-runtime partition
**Source:** `~/.claude/hooks/router.mjs:83-92` (`detectRuntime`)
**Apply to:** all dispatch adapter files + receipt store path resolution
```javascript
export function detectRuntime() {
  const override = process.env.ROUTER_RUNTIME;
  if (override === 'claude' || override === 'codex') return override;
  if (String(process.argv[1] || '').includes('.codex/')) return 'codex';
  return 'claude';
}
```
Receipts partition by `~/.claude/router/receipts/` vs `~/.codex/router/receipts/` via `os.homedir()` — same isolation discipline as v1.5 telemetry/cache (PARITY-02).

### Token budget (≤120 tokens for HOST-04)
**Source:** `~/.claude/hooks/router.mjs:2755-2758` (`tokenCount`)
**Apply to:** any dispatch-related line in the prompt/startup injection path
```javascript
export function tokenCount(text) { return Math.ceil(String(text || '').length / 4); }
```

### Latency measurement
**Source:** `~/.claude/hooks/router.mjs` (`process.hrtime.bigint()` + `ROUTER_DEBUG_LATENCY=1`); `tests/router.perf.test.mjs:30-40`
**Apply to:** `tests/router.dispatch-perf.test.mjs`
```javascript
const startNs = process.hrtime.bigint();
// ... spawn + capture ...
const wallMs = Number(process.hrtime.bigint() - startNs) / 1e6;
```

### Test isolation (mkdtempSync + rmSync after)
**Source:** `tests/router.adapters.test.mjs:19-22`, `tests/router.perf.test.mjs:21-22`
**Apply to:** all four new test files
```javascript
const TEST_HOME = mkdtempSync(join(tmpdir(), 'router-dispatch-home-'));
after(() => rmSync(TEST_HOME, { recursive: true, force: true }));
```

## No Analog Found

None. All 11 files have a close analog in the codebase. The dispatch + receipt layer is greenfield in *function* but every mechanical pattern it needs (spawn+unref, atomic write, append-only jsonl, sha256, runtime detection, token count, hrtime, deploy bundle, test isolation) already exists in `~/.claude/hooks/router.mjs`, `src/adapters/{claude,codex}.mjs`, `src/lifecycle/router-lifecycle.mjs`, and `tests/router.{adapters,perf,coexistence}.test.mjs`. RESEARCH.md §Key Insight: "Phase 38's net new surface is the dispatch + receipt layer. Everything else already exists and must be reused, not rebuilt."

## Metadata

**Analog search scope:**
- `/Users/guilherme/.claude/hooks/router.mjs` (live v1.5 hook — primary)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/adapters/{claude,codex}.mjs` (discovery adapters)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/lifecycle/router-lifecycle.mjs` (deploy bundle)
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/tests/router.{adapters,perf,coexistence}.test.mjs` (test scaffolds)

**Files scanned:** 7 (router.mjs, claude.mjs, codex.mjs, router-lifecycle.mjs, router.adapters.test.mjs, router.perf.test.mjs, router.coexistence.test.mjs referenced)
**Pattern extraction date:** 2026-08-06