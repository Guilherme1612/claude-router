# Phase 15: Context Capsules and Workflow-State Recovery - Pattern Map

**Mapped:** 2026-07-16
**Files analyzed:** 10 new/modified files
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/context/capsule.mjs` | model + storage service | transform + file I/O | `src/registry/schema.mjs`, `src/registry/identity.mjs`, `src/registry/activate.mjs` | composite exact |
| `src/context/sources.mjs` | provider / adapter | bounded file I/O | `src/registry/activate.mjs` (`verifyVersion`) | data-flow match |
| `src/context/resolve.mjs` | pure service | transform / event-driven decision | `src/registry/map.mjs`, `src/registry/reconcile.mjs` | composite exact |
| `src/context/prompt-route.mjs` | route / orchestration adapter | request-response + bounded file I/O | `/Users/guilherme/.claude/hooks/router.mjs` (`inspectDecision`) | exact seam match |
| `src/cli/router-control.mjs` | CLI controller | request-response | existing `src/cli/router-control.mjs` | exact |
| `/Users/guilherme/.claude/hooks/router.mjs` | UserPromptSubmit hook | event-driven request-response | existing `inspectDecision()` guard/finish pipeline | exact |
| `tests/router.context-capsule.test.mjs` | test | transform + filesystem integration | `tests/router.registry-schema.test.mjs`, `tests/router.registry-activate.test.mjs` | composite exact |
| `tests/router.context-sources.test.mjs` | test | bounded filesystem integration | `tests/router.registry-activate.test.mjs` | role/data-flow match |
| `tests/router.context-resume.test.mjs` | test | decision matrix + CLI integration | `tests/router.registry-map.test.mjs`, `tests/router.control-cli.test.mjs` | composite exact |
| `tests/router.context-prompt-integration.test.mjs` | test | spawned-process hook integration | `tests/router.failopen.test.mjs`, `tests/router.settings-diff.test.mjs` | composite exact |

The approved implementation plan names `capsule.mjs`, `sources.mjs`, the three core context test files, and the CLI modification. Research adds `resolve.mjs` as the preferred pure-policy boundary rather than hiding D-05 through D-16 inside persistence code. The corrected Plan 15-03 also adds the real prompt-path adapter, live hook seam, and spawned-process integration suite; these are classified explicitly because CLI-only wiring cannot satisfy UserPromptSubmit recovery.

## Pattern Assignments

### `src/context/capsule.mjs` (model + storage service, transform + file I/O)

**Analogs:** `src/registry/schema.mjs`, `src/registry/identity.mjs`, and `src/registry/activate.mjs`.

**Validation and portable-path pattern** (`src/registry/schema.mjs:9-26`):

```javascript
function fail(message) {
  throw new TypeError(message);
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${path} must be an object`);
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(`${path} must be one of: ${allowed.join(', ')}`);
}

function isAbsolutePortablePath(value) {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}
```

Copy the stable, field-addressed `TypeError` convention. Tighten artifact references beyond absolute-path rejection by normalizing separators and rejecting `..` containment escapes.

**Canonical serialization pattern** (`src/registry/schema.mjs:102-145`):

```javascript
function normalize(value, path, seen) {
  if (value === undefined) fail(`stableStringify does not support undefined at ${path}`);
  if (seen.has(value)) fail('stableStringify does not support cyclic values');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((entry, index) => normalize(entry, `${path}[${index}]`, seen));
  } else {
    result = {};
    for (const key of Object.keys(value).sort()) result[key] = normalize(value[key], `${path}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

export function stableStringify(value) {
  return JSON.stringify(normalize(value, '$', new Set()));
}
```

Reuse `stableStringify`; make capsule canonicalization sort set-like collections before deterministic selection/truncation while preserving semantic order for workflow position.

**Stable fingerprint pattern** (`src/registry/identity.mjs:28-30`):

```javascript
export function contentFingerprint(value) {
  const canonical = value?.schema_version === 1 ? canonicalizeCapability(value) : value;
  return createHash('sha256').update(stableStringify(canonical), 'utf8').digest('hex');
}
```

Use the same SHA-256-over-canonical-bytes shape for capsule identity and content witnesses. Do not pass a capsule through `canonicalizeCapability`; add capsule-specific canonicalization and hash that result.

**Durable private write pattern** (`src/registry/activate.mjs:11-16`, `146-164`):

```javascript
function contained(root, path) {
  const target = resolve(path);
  if (target !== root && !target.startsWith(`${root}/`)) throw new TypeError('path escapes owned root');
  return target;
}
function syncDir(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function durableWrite(path, bytes, flag = 'wx') {
  const fd = openSync(path, flag, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}

temp = `${p.active}.tmp.${randomUUID()}`;
durableWrite(temp, json(pointer));
renameSync(temp, p.active);
syncDir(p.root);
```

Adapt this to one active capsule and one bounded last-known-good file: validate and canonicalize the complete candidate first, write mode `0600`, fsync, atomically rename, and sync the containing directory. Reject symlinked active/LKG targets. On failure, return structured status/reason codes and remove only the owned temporary file.

**Important divergence:** use an explicit persistence allowlist. `src/registry/map.mjs:7-35` demonstrates bounded portable projection but is denylist-based; Phase 15 D-01 is stricter, so capsule construction must copy only declared fields and must never accept arbitrary input then delete known sensitive keys.

---

### `src/context/sources.mjs` (provider / adapter, bounded file I/O)

**Analog:** `src/registry/activate.mjs:123-143`.

**Guarded read and structured failure pattern:**

```javascript
export function verifyVersion({ ownedRoot, versionId, expectedFingerprint, now = Date.now() }) {
  try {
    if (!validId(versionId)) return { valid: false, reason_code: 'invalid_version_id' };
    const p = paths(ownedRoot), dir = contained(p.versions, join(p.versions, versionId));
    if (!existsSync(dir) || lstatSync(dir).isSymbolicLink() || !statSync(dir).isDirectory()) {
      return { valid: false, reason_code: 'missing_or_unsafe_version' };
    }
    // verify exact expected files and fingerprints
    return { valid: true, reason_code: 'verified', version_id: versionId };
  } catch {
    return { valid: false, reason_code: 'malformed_version' };
  }
}
```

Each reader should accept an exact path plus a byte ceiling, use `lstatSync` before reading, reject symlinks/non-files/out-of-bounds files, parse only approved headings or keys, and return `{ status, reason_code, value?, witness? }`. Witnesses should contain mtime/size for low-risk sources and canonical SHA-256/version/generation for identity-critical sources.

Do not copy `recoverActiveVersion`'s `readdirSync` search (`src/registry/activate.mjs:178-184`) into prompt-path recovery. D-12 requires paths derived from known workspace/workflow/phase identity: `.planning/STATE.md`, `.planning/ROADMAP.md`, exact active phase artifacts, and exact checkpoint paths only. Missing or malformed optional sources degrade diagnostically; missing identity-critical sources must remain non-dispatchable.

---

### `src/context/resolve.mjs` (pure service, transform / event-driven decision)

**Analogs:** `src/registry/map.mjs` for deterministic precedence and safety gates; `src/registry/reconcile.mjs` for verdict algebra.

**Bounded canonical evidence pattern** (`src/registry/map.mjs:15-47`, `168-179`):

```javascript
function sorted(values) {
  return [...values].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function evidence({ subjectId, targetId, tier, rule, contribution, accepted = false, reasonCode, provenance }) {
  return portable({
    schema_version: 1,
    subject_id: subjectId,
    target_id: targetId,
    tier,
    rule,
    accepted,
    reason_code: reasonCode,
    ...(provenance ? { provenance } : {}),
  });
}
```

Resolver results should likewise be canonical, serializable, sorted, bounded, and reason-coded. Evidence should identify source type and witness, never include source bodies, raw prompt text, absolute paths, or thrown input values.

**Eligibility gate pattern** (`src/registry/map.mjs:127-155`):

```javascript
function safety(record, recordsById, requestedScope) {
  if (!record) return { safe: false, reason_code: 'target_absent' };
  if (record.lifecycle !== 'ready') return { safe: false, reason_code: 'target_not_ready' };
  if (record.dispatchable !== true) return { safe: false, reason_code: 'target_not_dispatchable' };
  if (!scopeApplies(record.scope, requestedScope)) return { safe: false, reason_code: 'target_out_of_scope' };
  return { safe: true, reason_code: 'target_safe' };
}
```

Mirror the early-return gate shape for schema validity, freshness, stable identity, transition validity, terminal status, and phrase-specific requirements. Only a fully specified explicit override or exactly one eligible continuation may set `dispatchable: true`.

**Explicit-first and ambiguity test contract** (`tests/router.registry-map.test.mjs:92-110`):

```javascript
assert.equal(mapped(result, 'route:work').target_id, 'router/explicit');
assert.equal(mapped(result, 'route:work').winning_rule, 'explicit_subject');

assert.equal(ambiguous.disposition, 'ambiguous');
assert.equal(ambiguous.target_id, undefined);
assert.deepEqual(ambiguous.alternatives.map(value => value.target_id), ['router/one', 'router/two']);
assert.equal(ambiguous.winning_rule, 'explicit_conflict');
```

Implement D-10 precedence directly: current explicit instruction, live execution state, authoritative project/phase/artifact state, then capsule hint. An identity-changing explicit instruction creates a replacement plus bounded supersession reference; never deep-merge incompatible goal/artifact/blocker state.

Recommended pure outcome algebra: `{ outcome: 'resume'|'override'|'refresh'|'clarify'|'none', dispatchable, reason_code, next_action?, evidence, question? }`. `clarify` carries exactly one smallest distinguishing question. `continue`, `finish it`, and `use the design` need separate transition tests; terminal states are ineligible absent an explicit prior-workflow identity.

---

### `src/cli/router-control.mjs` (CLI controller, request-response)

**Analog:** the file itself.

**Canonical envelope and fail-closed source pattern** (`src/cli/router-control.mjs:8-24`):

```javascript
const EXIT = Object.freeze({ success: 0, usage: 2, invalid: 3, unsafe: 4, mutation: 5 });

function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return { schema_version: 1, command, ok, reason_code: reasonCode, data, warnings: [...warnings].sort() };
}

if (!active) return {
  result: canonical(command, false, 'invalid_active_pointer', { next_action: 'run_registry_recovery' }),
  exitCode: EXIT.invalid,
};
```

Add the documented command spellings without changing the envelope: `context`, `context refresh`, and `why-next`. Core context modules own validation/resolution; the CLI only parses, invokes, projects portable data, formats, and assigns stable exit codes.

**Bounded parsing/output pattern** (`src/cli/router-control.mjs:112-139`, `209-219`):

```javascript
if (value.length > MAX_VALUE) throw new TypeError('argument_too_long');
// ... reject missing values and unknown options

const lines = [`COMMAND ${result.command}`, `OK ${result.ok}`, `REASON ${result.reason_code}`];
for (const [key, value] of Object.entries(result.data).sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`${key.toUpperCase()} ${typeof value === 'object' ? stableStringify(value) : value}`);
}
```

Preserve deterministic JSON/text parity, bounded values, stable key ordering, and generic top-level internal-error handling. Never serialize exception stacks or source bodies. `context` and `why-next` are read-only; `context refresh` is the only capsule mutation and must use the capsule service's atomic protocol.

---

### `tests/router.context-capsule.test.mjs` (unit + filesystem integration)

**Analogs:** `tests/router.registry-schema.test.mjs` and `tests/router.registry-activate.test.mjs`.

Use native imports and isolated temporary roots:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = mkdtempSync(join(tmpdir(), 'router-context-capsule-'));
try {
  // exercise real files
} finally {
  await rm(root, { recursive: true, force: true });
}
```

Copy schema tests' exact error assertions and canonical-byte/fingerprint equivalence checks. Copy activation tests' real filesystem verification, but assert active/LKG mode, atomic-recovery behavior, deterministic truncation metadata, UTF-8 byte boundaries, safe relative references, terminal transitions, and absence of canary prompt/secret/tool-output values from active bytes, LKG bytes, return values, errors, stdout, and stderr.

---

### `tests/router.context-sources.test.mjs` (bounded filesystem integration)

**Analog:** `tests/router.registry-activate.test.mjs` guarded filesystem fixtures.

Create only exact fixture files under a temporary project root. Test valid, missing, malformed, symlinked, oversized, and witness-changed forms for `STATE.md`, `ROADMAP.md`, one exact active phase artifact, and one exact checkpoint. Assert structured `reason_code` results rather than thrown parser details. Instrument filesystem dependencies where useful to prove the adapter does not recursively enumerate `.planning/` or read unrelated/full documents.

---

### `tests/router.context-resume.test.mjs` (decision matrix + CLI integration)

**Analogs:** `tests/router.registry-map.test.mjs` and `tests/router.control-cli.test.mjs`.

Use table-driven cases for all outcome branches and permutation tests for deterministic output. The precedence/ambiguity assertions should follow `router.registry-map.test.mjs:69-110`; portable evidence should follow its canary test (`258-278`):

```javascript
const bytes = stableStringify(result);
assert.doesNotMatch(bytes, /raw_prompt|\/Users\/|secret/);
```

For CLI behavior, copy `tests/router.control-cli.test.mjs:74-85`: run the same read-only command twice, assert byte-identical stdout, canonical envelope keys, and no mutation of owned bytes. Cover `continue`, `finish it`, `use the design`, unique new-session recovery, stale refresh, corrupt/LKG recovery, contradictory authority, incomplete explicit override, completed/cancelled/superseded workflows, zero candidates, multiple candidates, exactly one focused question, and CLI JSON/text projection.

---

### `src/context/prompt-route.mjs` (route / orchestration adapter, request-response + bounded file I/O)

**Primary analog:** `/Users/guilherme/.claude/hooks/router.mjs:2361-2441` (`inspectDecision` option normalization, state projection, and one finish path).

**Bounded adapter options and accumulated-result pattern** (`/Users/guilherme/.claude/hooks/router.mjs:2363-2419`):

```javascript
export function inspectDecision(prompt, options = {}) {
  const opts = {
    cwd: process.cwd(),
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
    includePrompt: false,
    ...options,
  };
  const state = {
    prompt: String(prompt || ''),
    normalizedPrompt: String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim(),
    decision_trace: ['start'],
    finalInjectedContext: '',
    passThroughReason: null,
    cwd: opts.cwd,
  };
```

Copy the single exported adapter with injected paths/dependencies so spawned tests can point at temporary capsule/project roots. Unlike the general router state above, retain only structured instruction discriminators after classification; do not return or persist `prompt`/`normalizedPrompt`. The adapter owns the exact orchestration sequence `classify bounded instruction -> load capsule -> aggregate exact authoritative sources -> resolve -> optionally atomically save -> project bounded injection`.

**Single finish/fail-open pattern** (`/Users/guilherme/.claude/hooks/router.mjs:2421-2441`, `2671-2675`):

```javascript
const finish = () => {
  const out = routeToInspectShape(state);
  if (opts.emitInjection && state.finalInjectedContext) emit(state.finalInjectedContext);
  return out;
};

try {
  // guarded pipeline
  return finish();
} catch {
  state.tier = 'error';
  state.passThroughReason = 'error';
  return finish();
}
```

Return a small tagged result such as `{ handled, outcome, reason_code, additional_context }`; never emit stdout inside this module. `handled: true` applies to resolver-owned `resume`, `override`, `refresh`, and `clarify` so the hook cannot continue into normal BM25 routing and double-inject. `none` and all internal exceptions are safe pass-through. Save only when the resolver returns an explicitly saveable unique refresh/override; clarification and terminal rejection never mutate.

**Ordering contract from the live analog** (`/Users/guilherme/.claude/hooks/router.mjs:2444-2494`): payload/type and `ROUTER_TEST_THROW` guards currently precede trivial/explicit/sentinel handling; manifest freshness begins at line 2471 and manifest loading at 2494. The context adapter call belongs after type/forced-failure guards but before trivial/explicit referential routing, manifest freshness, cache lookup, BM25, and injection. This is the exact seam Plan 15-03 Task 3 references.

**Module-location pattern** (`/Users/guilherme/.claude/hooks/router.mjs:38-48`, `64-91`):

```javascript
const _require = createRequire(import.meta.url);
const ROUTER_DIR = join(homedir(), '.claude', 'router');
const RUNTIME_CONFIG_DIR = join(homedir(), '.claude');
// Resolve runtime dependencies relative to installed/configured roots,
// never from process.cwd() or an accidental working-tree import.
```

Use an explicit configured module URL/root passed by the hook and overridden by integration fixtures. Resolve it deterministically relative to the installed hook/router location, not `process.cwd()`. If the installed context module is absent or unimportable, pass through with empty output.

---

### `/Users/guilherme/.claude/hooks/router.mjs` (UserPromptSubmit hook, event-driven request-response)

**Analog:** its existing `inspectDecision()` and direct-execution entry point. This is a surgical modification of the proven live seam, not a new hook architecture.

**Pre-routing guard pattern** (`/Users/guilherme/.claude/hooks/router.mjs:2444-2469`):

```javascript
try {
  if (typeof prompt !== 'string') {
    state.passThroughReason = 'invalid_prompt';
    return finish();
  }
  if (process.env.ROUTER_TEST_THROW === '1') {
    throw new Error('ROUTER_TEST_THROW forced throw');
  }
  if (trivialPromptDetect(prompt)) return finish();
  if (explicitOverrideDetect(prompt).override) return finish();
  if (sentinelScan(prompt)) return finish();
  // manifest freshness starts after these guards
```

Insert one context-recovery call immediately after prompt/type and forced-throw guards. It must run before the existing generic `explicitOverrideDetect`, because D-13 complete explicit overrides need capsule-aware replacement rather than unconditional pass-through. A resolver-owned outcome sets `state.finalInjectedContext`, records a bounded trace/reason, and returns through the existing `finish()` exactly once. `none` continues unchanged into trivial/explicit/sentinel and normal routing.

**One-emission seam** (`/Users/guilherme/.claude/hooks/router.mjs:2437-2441`, `2861-2867`):

```javascript
if (opts.emitInjection && state.finalInjectedContext) emit(state.finalInjectedContext);

function emit(additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  }));
}
```

Reuse this output envelope. Context injection must be bounded and use its own unambiguous marker/kind while preserving the router's no-double-output rule. Do not call `emit()` from `prompt-route.mjs` and do not fall through to `formatInjection()` after a handled context outcome.

**Outer fail-open contract** (`/Users/guilherme/.claude/hooks/router.mjs:2875-2905`):

```javascript
readStdin((input) => {
  let payload;
  try { payload = JSON.parse(input); }
  catch { process.exit(0); return; }
  try { main(payload); }
  catch { /* emit nothing, never block */ }
  process.exit(0);
});
```

Preserve `main(payload)` as the UserPromptSubmit entry, exit 0, empty-stdout failure behavior, no `decision:block`, and the existing sentinel/coexistence contracts. The context import/call must be lazy or safely guarded so a recovery exception cannot prevent ordinary non-referential routing.

---

### `tests/router.context-prompt-integration.test.mjs` (spawned-process hook integration)

**Analogs:** `tests/router.failopen.test.mjs:11-25` and `tests/router.settings-diff.test.mjs:198-252`.

**Real hook spawn helper** (`tests/router.failopen.test.mjs:11-25`):

```javascript
const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const NODE = '/Users/guilherme/.hermes/node/bin/node';

function runHook(stdinStr, env = {}) {
  const r = spawnSync(NODE, [HOOK], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}
```

Spawn the real live hook process; do not only import `prompt-route.mjs`. Pass explicit test-only environment/config paths for temporary owned root, project root, context-module root, and exact authoritative fixtures. Use `mkdtempSync` plus `finally` cleanup as in the filesystem suites, while never writing fixtures into the live project or `~/.claude` capsule location.

**Hook output assertions** (`tests/router.settings-diff.test.mjs:215-252`):

```javascript
const r = spawnSync(NODE, [LIVE_ROUTER], {
  input: JSON.stringify(payload),
  encoding: 'utf8',
  env: { ...process.env, ROUTER_TEST_FRESHNESS: 'fresh' },
});
assert.equal(r.status, 0);
const out = JSON.parse(r.stdout.trim());
assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
const ctx = out.hookSpecificOutput.additionalContext;
assert.ok(typeof ctx === 'string' && ctx.length > 0);
```

Extend this pattern to assert the context marker/outcome and absence of the normal router marker for handled context results. Cover all three referential phrases; unique resume; zero/multiple focused clarification; complete explicit override; incomplete conflict; stale authoritative refresh and minimal atomic capsule rewrite; terminal rejection; non-referential unchanged normal routing; and forced context-recovery failure.

**Fail-open assertions** (`tests/router.failopen.test.mjs:28-86`): malformed/absent/non-string inputs and forced throws exit 0 with empty stdout; source inspection proves no `process.exit(2)` and no `decision:"block"`. Add recovery-specific cases that assert failures do not leak canary prompt/secret/artifact bodies into stdout, stderr, active capsule, or LKG; do not weaken existing fail-open tests.

## Shared Patterns

### Determinism and stable identity

**Sources:** `src/registry/schema.mjs:102-145`, `src/registry/identity.mjs:9-30`  
**Apply to:** all three context modules and tests.

Canonicalize before hashing or persistence; sort set-like evidence and candidates; retain semantic workflow-step ordering. Composite identity must include stable project/workspace scope, workflow kind, goal identity, phase/plan/task position, and status—not labels alone.

### Privacy by construction

**Source precedent:** `src/registry/map.mjs:7-47`; stricter Phase 15 rule from D-01 through D-04.  
**Apply to:** persistence, source diagnostics, resolver outcomes, prompt-path adapter, live hook injection, CLI, and all error paths.

Persist from an allowlist of compact facts/references. Deterministically cap every field and collection, expose `truncated` and `omitted_count`, and enforce a total UTF-8 byte ceiling. Canary-test active, LKG, result, exception, and CLI surfaces.

### Fail-safe structured diagnostics

**Sources:** `src/registry/map.mjs:133-155`, `src/registry/reconcile.mjs:259-275`, `src/cli/router-control.mjs:13-24`.  
**Apply to:** source readers, resolver, persistence recovery, and CLI.

Return stable statuses and `reason_code`s with bounded evidence. Validation, freshness, and authority reconciliation are separate gates. Unsafe/corrupt/conflicting/ambiguous results remain non-dispatchable; caught errors must not echo input or stack details.

### Atomic local ownership

**Source:** `src/registry/activate.mjs:11-16`, `146-164`.  
**Apply to:** `saveCapsule`, refresh, supersession, and corrupt recovery.

Resolve and contain owned paths, reject symlinks, write private durable temp bytes, fsync, rename, then sync the directory. Keep one bounded LKG rather than a history. Never overwrite authoritative planning artifacts.

### No authentication layer

This is a local filesystem control plane; no HTTP authentication analog applies. The equivalent guard is owned-root containment, project/workspace identity matching, safe relative references, restricted file mode, and fail-closed dispatchability.

### Prompt-path single ownership and fail-open

**Sources:** `/Users/guilherme/.claude/hooks/router.mjs:2421-2441`, `2444-2494`, `2861-2905`; `tests/router.failopen.test.mjs:11-86`; `tests/router.settings-diff.test.mjs:198-252`.  
**Apply to:** `src/context/prompt-route.mjs`, the live hook modification, and `tests/router.context-prompt-integration.test.mjs`.

Context recovery runs once before manifest/cache/BM25 routing. A handled resolver result owns the sole `additionalContext` emission and stops normal routing; `none` continues unchanged; exceptions emit nothing and preserve exit 0. Runtime context modules resolve from an explicit installed/configured location, never accidentally from the working tree.

## Planner Guardrails

- Do not add dependencies; use Node ESM, standard-library `fs/path/crypto`, `stableStringify`, and native `node:test`.
- Keep `resolve.mjs` pure and side-effect-free; persistence and authoritative reads stay in their own modules.
- Keep `prompt-route.mjs` a bounded orchestration adapter: no scoring, capability selection, direct stdout, or raw-prompt persistence.
- Modify the live hook only at the `inspectDecision()` pre-routing seam after input/forced-failure guards and before generic explicit override, manifest freshness, cache, BM25, or route injection.
- Ensure resolver-owned hook outcomes emit once and return; `none` and recovery exceptions preserve existing routing/fail-open behavior.
- Do not implement Phase 16 capability/tool/agent selection or dispatch in the resolver.
- Do not scan `.planning/` recursively on the prompt path or load complete design/spec/plan bodies.
- Do not reuse the registry map denylist as capsule privacy policy; use an explicit field allowlist.
- Do not resume complete, cancelled, abandoned, or superseded work from a referential phrase alone.
- Do not ask multiple clarification questions; return one smallest material discriminator.
