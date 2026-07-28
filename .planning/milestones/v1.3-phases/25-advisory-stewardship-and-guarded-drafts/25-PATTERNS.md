# Phase 25: Advisory Stewardship and Guarded Drafts - Pattern Map

**Mapped:** 2026-07-28
**Files analyzed:** 8 proposed new/modified files
**Analogs found:** 7 / 8

## Scope Derived From Context

Phase 25 needs one pure recommendation selector, one Router-owned interaction
store, one preview-only draft builder, CLI wiring, and focused tests. Keep these
seams separate from authoritative registry activation and prompt-time routing.
The context and UI contract do not justify a dashboard, maintenance command
family, publication adapter, or third-party dependency.

Research was not present when this map was created. The assignments below are
grounded in the live repository and the approved `25-CONTEXT.md` and
`25-UI-SPEC.md`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/steward/suggestion.mjs` | service / transform | batch transform | `src/health/catalog.mjs` | exact |
| `src/steward/state.mjs` | store | file-I/O | `src/health/store.mjs` | exact |
| `src/steward/draft.mjs` | service | request-response / file-I/O | `src/registry/activate.mjs` | role-match |
| `src/cli/router-control.mjs` | controller / CLI | request-response | existing `health` and `rollback` branches in the same file | exact |
| `tests/router.steward-suggestion.test.mjs` | test | batch transform | `tests/router.health.catalog.test.mjs` | exact |
| `tests/router.steward-state.test.mjs` | test | file-I/O | `tests/router.health.admin.test.mjs` | exact |
| `tests/router.steward-draft.test.mjs` | test | request-response / file-I/O | `tests/router.registry-activate.test.mjs` | role-match |
| startup pointer integration (symbol/location to be selected by planner) | middleware / hook | event-driven | none safe | no analog |

The filenames under `src/steward/` are inferred, not locked by context. Preserve
the three responsibilities even if planning chooses different names. Do not
split ranking, fingerprinting, interaction policy, or preview formatting into
additional files without a concrete need.

## Pattern Assignments

### `src/steward/suggestion.mjs` (service / transform, batch)

**Proposed symbols:** `rankSuggestions`, `selectSuggestion`,
`suggestionFingerprint`, `startupPointer`.

**Analog:** `src/health/catalog.mjs`

**Imports and shared vocabulary pattern** (`src/health/catalog.mjs:45-57`):

```javascript
import { stableCapabilityId } from '../registry/identity.mjs';
import { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES } from '../evolution/evidence.mjs';

const MIN_CONFIDENCE = 8500;

export { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES, MIN_CONFIDENCE };
```

Reuse `COOLDOWN_MS` and `POLICY_VERSION` from
`src/health/thresholds.mjs:24-38`; do not introduce another cooldown constant:

```javascript
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES } from '../evolution/evidence.mjs';

export const POLICY_VERSION = 'health-policy-v1';
export const COOLDOWN_MS = 60 * 60 * 1000;
```

**Bounded record pattern** (`src/health/catalog.mjs:105-119`,
`src/health/catalog.mjs:170-194`):

```javascript
function boundedBp(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10000, Math.round(value)));
}

function boundedInt(value, max = 10_000_000) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(max, Math.round(value));
}

function makeObservation(kind, partial) {
  if (!REASON_CODES[kind]) throw new Error(`unknown observation kind: ${kind}`);
  if (!REMEDY_BY_KIND[kind]) throw new Error(`missing remedy for kind: ${kind}`);
  const affected = Array.isArray(partial.affected_capability_ids)
    ? partial.affected_capability_ids.filter((v) => typeof v === 'string' && v)
    : [];
  if (affected.length === 0) throw new Error(`observation ${kind} requires non-empty affected_capability_ids`);

  const obs = {
    observation_kind: kind,
    reason_code: REASON_CODES[kind],
    evidence_window_ms: boundedInt(partial.evidence_window_ms ?? 0, MAX_RETENTION_MS),
    freshness: freshnessOf(partial.freshness ?? 'fresh'),
    affected_capability_ids: [...new Set(affected)].sort(),
    confidence_basis_points: boundedBp(partial.confidence_basis_points ?? 0),
    remedy: REMEDY_BY_KIND[kind],
  };
  return obs;
}
```

Apply the same discipline to suggestion records: stable reason code, integer
confidence basis points, sorted/deduplicated affected IDs, bounded evidence,
expected benefit, bounded risk token, and a non-destructive next action.

**Core selection pattern:** consume `deriveObservations(...)` output; do not
re-derive health or relationships. The existing catalog explicitly establishes
that boundary (`src/health/catalog.mjs:236-255`):

```javascript
export function deriveObservations({
  registry = [],
  relationships = {},
  outcomes = [],
  contracts = new Map(),
  now = Date.now(),
} = {}) {
  if (!Number.isSafeInteger(now)) throw new TypeError('now must be an integer ms epoch');
```

Selection should be a pure deterministic transform. Filter first by
actionability, freshness/novelty, confidence, dismissal/snooze state, and
cooldown; then sort by one versioned value tuple and return only index `0`.
Use `stableStringify` plus SHA-256 for the fingerprint, matching
`src/registry/activate.mjs:4-8`:

```javascript
import { createHash } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';

const hash = value => createHash('sha256')
  .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : stableStringify(value))
  .digest('hex');
```

Tie-break with stable strings, as the catalog does at
`src/health/catalog.mjs:442-448`:

```javascript
.sort((a, b) => a.observation_kind.localeCompare(b.observation_kind)
  || stableStrCompare(a.affected_capability_ids[0], b.affected_capability_ids[0]))

function stableStrCompare(a, b) {
  return String(a).localeCompare(String(b));
}
```

**Error handling:** invalid trust-boundary inputs throw `TypeError`; absent or
ineligible observations return a normal `suggestion_none` projection. Never
surface low-confidence observations as an error or fallback list.

---

### `src/steward/state.mjs` (store, file-I/O)

**Proposed symbols:** `createStewardStore`, `readInteractionState`,
`recordDismissal`, `recordSnooze`, `saveCorrectionProposal`.

**Analog:** `src/health/store.mjs`

**Imports and owned-root pattern** (`src/health/store.mjs:15-20`,
`src/health/store.mjs:63-68`):

```javascript
import { randomUUID } from 'node:crypto';
import {
  appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync,
  readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function createHealthStore({ root, lock: lockOptions } = {}) {
  const healthRoot = root || join(homedir(), '.claude', 'router', 'health');
  mkdirSync(healthRoot, { recursive: true, mode: 0o700 });
  const outcomesPath = join(healthRoot, 'outcomes.jsonl');
  const statePath = join(healthRoot, 'state.json');
```

Use a sibling Router-owned root such as `<ownedRoot>/steward/`; never write
under `versions/`, `release-tuples/`, registry records, capability definitions,
or routing policy.

**Atomic 0600 state pattern** (`src/health/store.mjs:130-155`):

```javascript
writeState(state) {
  const tmp = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(state ?? {})}\n`, { mode: 0o600 });
  let fd;
  try { fd = openSync(tmp, 'r'); fsyncSync(fd); }
  catch { /* best-effort */ }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best-effort */ } }
  renameSync(tmp, statePath);
  return { status: 'stored', path: statePath };
},

readState() {
  if (!existsSync(statePath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
},
```

Use the existing mutation-lock shape at `src/health/store.mjs:27-60` so
dismiss/snooze/correct updates do not lose concurrent state. Store only stable
fingerprints, bounded timestamps, reason codes, and versioned structured
correction fields—never raw prompts or free-form telemetry.

**Versioned correction proposal pattern:** immutable proposal files should use
the staging, durable write, rename, and idempotent fingerprint pattern from
`src/registry/activate.mjs:114-132`, but remain inside the steward root:

```javascript
const bundleFingerprint = hash(stableStringify(
  Object.fromEntries(Object.entries(payload).sort())
));
const versionId = `v1-${bundleFingerprint.slice(0, 16)}`;
// write into a 0700 staging directory, fsync 0600 files, then rename
```

Do not copy `replaceActivePointer` or `activateCandidate`; a correction proposal
is not authority to mutate routing.

---

### `src/steward/draft.mjs` (service, request-response / file-I/O)

**Proposed symbols:** `previewDraft`, `approveDraftCreation`,
`verifyDraftPreview`.

**Analog:** preview and stale-confirmation portions of
`src/registry/activate.mjs`; publication portions are explicitly forbidden.

**Preview fingerprint pattern** (`src/registry/activate.mjs:225-230`):

```javascript
export function previewRollback({ ownedRoot, destination, now = Date.now(), test_mode = false }) {
  const p = paths(ownedRoot), source = readPointer(p.active),
    verdict = verifyVersion({ ownedRoot, versionId: destination, now, test_mode });
  if (!source || !verdict.valid) {
    return { preview_status: 'blocked', reason_code: verdict.reason_code || 'missing_active_pointer' };
  }
  const body = {
    schema_version: 1,
    source_version_id: source.version_id,
    destination_version_id: destination,
    source_sequence: source.sequence,
    destination_verification_fingerprint: verdict.verification_fingerprint,
    generated_at: now,
  };
  return { ...body, preview_status: 'ready', preview_fingerprint: hash(body) };
}
```

Draft preview must project exact paths, semantic changes, dependencies,
conflicts, representative route effects, verification steps, reversibility,
and rollback implications. Paths must be validated as contained within the
draft root before any file is created, following
`src/registry/activate.mjs:11-16`:

```javascript
function contained(root, path) {
  const target = resolve(path);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new TypeError('path escapes owned root');
  }
  return target;
}
function durableWrite(path, bytes, flag = 'wx') {
  const fd = openSync(path, flag, 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
}
```

**Approval and stale-preview pattern** (`src/registry/activate.mjs:249-253`):

```javascript
if (preview?.preview_status !== 'ready'
    || confirmation !== preview.destination_version_id) {
  return { rollback_status: 'blocked', reason_code: 'confirmation_mismatch' };
}
const fresh = previewRollback({
  ownedRoot,
  destination: preview.destination_version_id,
  now: preview.generated_at,
  test_mode,
});
if (fresh.preview_fingerprint !== preview.preview_fingerprint) {
  return { rollback_status: 'blocked', reason_code: 'stale_preview' };
}
```

For Phase 25, exact approval authorizes creation of draft artifacts only.
After stale revalidation, write the preview bundle under the steward draft
root and return it. Do not import or call `activateCandidate`,
`replaceActivePointer`, `publishIndex`, or lifecycle installers.

---

### `src/cli/router-control.mjs` (controller / CLI, request-response)

**Change:** add the narrow `suggestion` family to existing parsing, usage,
dispatch, and text rendering. Prefer:

```text
suggestion
suggestion dismiss <fingerprint>
suggestion snooze <fingerprint>
suggestion correct <fingerprint>
suggestion draft <fingerprint>
```

Keep draft creation behind the existing `--execute --confirm <exact-token>`
shape; it remains draft-only and preview-first.

**Canonical envelope** (`src/cli/router-control.mjs:19-42`):

```javascript
const EXIT = Object.freeze({
  success: 0, usage: 2, invalid: 3, unsafe: 4, mutation: 5,
});

function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return {
    schema_version: 1,
    command,
    ok,
    reason_code: reasonCode,
    data,
    warnings: [...warnings].sort(),
  };
}
```

**Argument and format validation** (`src/cli/router-control.mjs:490-507`):

```javascript
function parse(argv) {
  const args = [...argv], options = { format: 'text', execute: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.length > 4096) throw new TypeError('argument_too_long');
    // recognized bounded options only
    if (value === '--execute') options.execute = true;
    else if (value.startsWith('--')) throw new TypeError('unknown_option');
    else positional.push(value);
  }
  if (!['text', 'json'].includes(options.format)) throw new TypeError('invalid_format');
  return { positional, options };
}
```

**Command dispatch and dependency seam** (`src/cli/router-control.mjs:779-797`):

```javascript
export function runRouterControl({
  argv = [], stdin = '', defaultOwnedRoot, dependencies = {},
} = {}) {
  let parsed;
  try { parsed = parse(argv); }
  catch (error) {
    return {
      result: canonical('usage', false, error.message),
      exitCode: EXIT.usage,
    };
  }
  const { positional, options } = parsed;
  const root = resolve(options.owned_root || defaultOwnedRoot
    || join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const command = positional[0];
```

Inject selector/store/draft helpers through `dependencies` in tests rather than
mocking filesystem globals.

**Preview-first exact confirmation** (`src/cli/router-control.mjs:833-852`):

```javascript
if (!options.execute) {
  return {
    result: canonical('rollback', true, 'rollback_preview_ready', detail,
      ['execution_requires_exact_destination_confirmation']),
    exitCode: 0,
  };
}
const confirmation = options.confirm ?? String(stdin).replace(/[\r\n]+$/, '');
if (confirmation !== destination) {
  return {
    result: canonical('rollback', false, 'confirmation_mismatch', detail),
    exitCode: EXIT.usage,
  };
}
```

Use the UI-spec copy verbatim in data/warnings. The no-suggestion result is a
successful canonical envelope with `reason_code: 'suggestion_none'`. Do not
return an internal observation list.

**Rendering:** keep the JSON serialization at
`src/cli/router-control.mjs:1156-1168`. A dedicated
`renderSuggestionText(result)` is warranted because the approved copy and
grouping differ from alphabetical `textResult`; keep it in this file beside
`renderInventoryText` and `renderContractText`.

---

### `tests/router.steward-suggestion.test.mjs` (test, batch transform)

**Analog:** `tests/router.health.catalog.test.mjs`

Copy the pure-transform assertions at
`tests/router.health.catalog.test.mjs:386-427`:

```javascript
test('catalog is a pure transform: returns schema_version, policy_version, bounded observations', () => {
  const result = deriveObservations({
    registry: [], relationships: {}, outcomes: [], contracts: new Map(), now: NOW,
  });
  assert.equal(result.schema_version, 1);
  assert.equal(result.policy_version, 'health-policy-v1');
  assert.ok(Array.isArray(result.observations));
  assert.ok(Array.isArray(result.reason_codes));
});

test('catalog now must be an integer ms epoch (throws on bad input)', () => {
  assert.throws(() => deriveObservations({ now: 'oops' }), TypeError);
});
```

Add one table-driven test proving:

- no eligible observation returns `suggestion_none`;
- low confidence, stale/snoozed/dismissed, non-actionable, and cooldown entries
  never leak into output;
- permutations of identical inputs choose the same fingerprint;
- ties resolve deterministically;
- exactly one suggestion is returned;
- output contains no prompt, secret, raw evidence text, or absolute private root.

---

### `tests/router.steward-state.test.mjs` (test, file-I/O)

**Analog:** `tests/router.health.admin.test.mjs`

Copy the CLI/store style at `tests/router.health.admin.test.mjs:298-351`:

```javascript
test('CLI: router health inspect → inspect_ok via runRouterControl', () => {
  const tmp = makeOwnedRoot();
  try {
    const outcome = runRouterControl({
      argv: ['health', 'inspect', '--owned-root', tmp],
    });
    assert.equal(outcome.result.ok, true);
    assert.equal(outcome.result.reason_code, 'inspect_ok');
    assert.ok(outcome.result.data.total >= 1);
  } finally { cleanupOwnedRoot(tmp); }
});
```

Verify 0700 directories, 0600 files, atomic replacement, corrupt-state
fail-closed behavior, bounded snooze timestamps, idempotent dismissal, and
versioned correction proposals. Snapshot authoritative registry and routing
artifacts before each interaction and assert byte identity afterward.

---

### `tests/router.steward-draft.test.mjs` (test, request-response / file-I/O)

**Analogs:** `tests/router.control-cli.test.mjs` and
`tests/router.registry-activate.test.mjs`

Copy the preview/no-mutation/exact-confirmation pattern from
`tests/router.control-cli.test.mjs:193-207`:

```javascript
const before = snapshot(f.root);
const preview = JSON.parse(
  run(f.root, 'rollback', f.first.version_id, '--format', 'json').stdout
);
assert.ok(preview.data.preview.preview_fingerprint);
assert.deepEqual(snapshot(f.root), before);
assert.equal(
  run(f.root, 'rollback', f.first.version_id, '--execute', '--confirm', 'yes').status,
  2,
);
```

Copy the stale/concurrency failure assertion from
`tests/router.registry-activate.test.mjs:153-158`:

```javascript
assert.equal(
  results.filter(result => result.pointer_status === 'replaced').length,
  1,
);
const loser = results.find(result => result.pointer_status !== 'replaced');
assert.equal(loser.pointer_status, 'blocked');
assert.equal(loser.reason_code, 'stale_pointer_sequence');
```

For drafts, assert a changed source fingerprint yields `stale_preview`, exact
approval creates only the draft bundle, and no test path changes registry
versions, `active.json`, release tuple pointers, capability files, or routing
policy. Verify the preview includes every UX-07 field and the literal
non-publication warning.

## Shared Patterns

### Stable canonical output

**Source:** `src/cli/router-control.mjs:40-42`  
**Apply to:** all suggestion CLI states.

```javascript
function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return { schema_version: 1, command, ok, reason_code: reasonCode, data, warnings: [...warnings].sort() };
}
```

### Deterministic and bounded projections

**Source:** `src/cli/router-control.mjs:102-117`  
**Apply to:** health overview, evidence projection, affected IDs, and draft
change lists.

```javascript
function boundedResult(values, options = {}) {
  const limit = options.limit ?? MAX_DIFF;
  const offset = options.offset ?? 0;
  const ordered = values.slice(offset, offset + limit);
  const meta = {
    total: values.length,
    returned: ordered.length,
    truncated: offset + ordered.length < values.length,
    limit,
    next_offset: offset + ordered.length < values.length
      ? offset + ordered.length
      : null,
  };
  return { values: ordered, meta };
}
```

### Read-only byte identity

**Source:** `tests/router.control-cli.test.mjs:128-141`  
**Apply to:** inspect, empty state, suggestion detail, startup eligibility
check, and draft preview.

```javascript
const before = snapshot(f.root);
const first = run(f.root, ...args, '--format', 'json');
const second = run(f.root, ...args, '--format', 'json');
assert.equal(first.stdout, second.stdout);
assert.deepEqual(Object.keys(JSON.parse(first.stdout)), [
  'command', 'data', 'ok', 'reason_code', 'schema_version', 'warnings',
]);
assert.deepEqual(snapshot(f.root), before);
```

### Privacy-safe portable output

**Source:** `tests/router.control-cli.test.mjs:223-230`  
**Apply to:** every text and JSON suggestion/draft response.

```javascript
assert.doesNotMatch(output, new RegExp(f.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(output, /prompt|secret|api[_-]?key/i);
assert.doesNotMatch(output, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
```

### Mutation isolation

**Source:** `src/health/store.mjs:1-9` and
`tests/router.health.admin.test.mjs:286-293`  
**Apply to:** state and draft modules.

The steward modules must not import `src/registry/activate.mjs`,
`src/prompt/publish-index.mjs`, registry mutation modules, lifecycle installers,
or settings writers. Copy algorithms/excerpts, not mutation imports. Add a
line-anchored import-gate test like the Phase 24 admin gate.

### Error handling

- Invalid CLI syntax: canonical failure, exit `2`.
- Invalid fingerprint/timestamp/payload: canonical failure, exit `3`.
- stale preview, path escape, or unsafe source: fail closed, exit `4`.
- local draft/state persistence failure: canonical failure, exit `5`.
- no eligible suggestion: canonical success, `suggestion_none`, exit `0`.
- corrupt optional local interaction state: treat as no interaction state or
  return a stable local-state reason code; never expose raw exceptions.

## No Analog Found

| File / Symbol | Role | Data Flow | Reason |
|---|---|---|---|
| startup pointer integration | middleware / hook | event-driven | Existing health catalog/scoring modules explicitly forbid prompt-hot-path use (`src/health/catalog.mjs:41-43`, `src/health/score.mjs:21-24`, `src/health/thresholds.mjs:20-22`). No current source safely emits a Phase 25 startup notice from precompiled suggestion state. Planner should use research or add the smallest read-only compiled pointer consumption seam, with no discovery, health calculation, graph traversal, mutation, network, or model call. |

The startup output contract is exact:

```text
Router suggestion available — inspect with /router suggestion
```

It must emit either that one line or zero bytes. Do not make
`src/health/catalog.mjs` or `src/health/score.mjs` run from
`UserPromptSubmit`.

## Planner Guardrails

1. Recommendation eligibility is not dispatch or publication authority.
2. Approval authorizes draft creation only.
3. Draft preview artifacts live only below the steward-owned root.
4. `activateCandidate`, `replaceActivePointer`, `publishIndex`, settings/hook
   writers, installers, and lifecycle mutation are out of scope.
5. Exactly one suggestion crosses the CLI boundary; no hidden list is exposed.
6. Corrections are versioned proposals, not direct routing edits.
7. Reuse `COOLDOWN_MS`, stable stringify/hash, canonical envelopes, atomic
   writes, and existing exit codes rather than introducing parallel utilities.
8. The hot path consumes precompiled bounded state only; it performs no
   discovery or analysis.

## Metadata

**Analog search scope:** `src/health/`, `src/cli/router-control.mjs`,
`src/registry/activate.mjs`, `src/prompt/`, `src/lifecycle/`, and focused
`tests/router.*.test.mjs` files  
**Strong analogs read:** 7 source/test files  
**Graph hint used:** existing Graphify index connected `runRouterControl`,
registry activation, health consumers, and control CLI tests; all excerpts were
verified against live files  
**Pattern extraction date:** 2026-07-28
