# Phase 24: Privacy-Safe Outcomes and Capability Health - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 9 new + 1 modified + 9 tests = 19
**Analogs found:** 9 / 9 (every new module has a same-role+same-data-flow analog in-repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/health/outcome-schema.mjs` | schema (validator) | transform | `src/evolution/evidence.mjs` (`validateEvidenceEnvelope`) | exact |
| `src/health/observe.mjs` | service (observer) | event-driven (file-ingest) | `src/registry/watcher.mjs` (`ingestTelemetryEvidence`) | exact |
| `src/health/score.mjs` | service (scorer) | transform | `src/evolution/evidence.mjs` (`computeWeightedSamples`) | role-match (math sibling) |
| `src/health/catalog.mjs` | service (catalog) | transform | `src/registry/relationships.mjs` (`deriveRelationships`) | exact |
| `src/health/admin.mjs` | service (admin) | request-response | `src/registry/activate.mjs` recover paths + `src/cli/router-control.mjs` canary body | role-match |
| `src/health/thresholds.mjs` | config (versioned constants) | config | `src/evolution/evidence.mjs` (HALF_LIFE_MS/MAX_RETENTION_MS/MINIMUM_SAMPLES) + `src/registry/relationships.mjs` `policy_version` | exact |
| `src/health/canary-bridge.mjs` | service (gate adapter) | request-response | `src/evolution/canary-controller.mjs` (`evaluateCandidate` + `applyCanaryDecision`) | exact |
| `src/cli/router-control.mjs` (EXTEND `health` subcommand) | route (CLI dispatcher) | request-response | `src/cli/router-control.mjs` `canary` subcommand (lines 860–1107) | exact (same file) |
| `tests/router.health.outcome-schema.test.mjs` | test | unit | existing `tests/*.test.mjs` `node:test` shape | role-match |
| `tests/router.health.privacy.test.mjs` | test | unit | same | role-match |
| `tests/router.health.persistence.test.mjs` | test | unit | same | role-match |
| `tests/router.health.observe.test.mjs` | test | unit | same | role-match |
| `tests/router.health.score.test.mjs` | test | unit | same | role-match |
| `tests/router.health.catalog.test.mjs` | test | unit | same | role-match |
| `tests/router.health.admin.test.mjs` | test | integration | same | role-match |
| `tests/router.health.canary.test.mjs` | test | integration | same | role-match |

All new files live under `~/.claude/router/health/` for state and `src/health/` for code. Per CONTEXT.md the tuple publication path (`src/prompt/publish-index.mjs`, `src/lifecycle/router-lifecycle.mjs` install list) is OUT OF SCOPE (Phase 26 / REL-03).

## Pattern Assignments

### `src/health/outcome-schema.mjs` (schema / validator, transform)

**Analog:** `src/evolution/evidence.mjs` lines 6–53

**Imports pattern** (lines 1–3):
```javascript
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
```

**Frozen-allowlist + deny pattern** (lines 6–14, 30–32):
```javascript
const FIELDS = new Set([
  'timestamp_ms', 'route_id', 'confidence_band', 'guard_codes', 'reason_code',
  'fixture_class', 'latency_us', 'candidate_version', 'policy_version', 'verdict',
  'prompt_signature',
]);
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function deny(reason_code) {
  return { status: 'denied', reason_code };
}
```

**Envelope validator pattern** (lines 34–53) — copy this structure for `validateOutcomeEnvelope`; replace FIELDS with `OUTCOME_FIELDS` and add the `OUTCOME_KINDS` enum check:
```javascript
export function validateEvidenceEnvelope(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return deny('invalid_evidence_envelope');
  if (Object.keys(input).some((field) => !FIELDS.has(field))) return deny('forbidden_evidence_field');
  if (!Number.isSafeInteger(input.timestamp_ms) || input.timestamp_ms < 0) return deny('invalid_timestamp');
  if (!boundedToken(input.route_id)) return deny('invalid_route_id');
  if (!CONFIDENCE_BANDS.has(input.confidence_band)) return deny('invalid_confidence_band');
  // ... bounded integer / enum checks ...
  const privacyDenied = input.confidence_band === 'deny_filtered'
    || input.guard_codes.some((code) => PRIVACY_GUARDS.has(code));
  if (privacyDenied && input.prompt_signature !== null) return deny('privacy_signature_forbidden');
  if (!privacyDenied && !/^[a-f0-9]{64}$/.test(input.prompt_signature ?? '')) return deny('invalid_prompt_signature');
  return { status: 'accepted', signal: Object.freeze({ ...input, guard_codes: Object.freeze([...input.guard_codes]) }) };
}
```

**Required `OUTCOME_KINDS` enum** (per HLTH-03, derive from Phase 23 8-disposition + 4-gate):
```javascript
const OUTCOME_KINDS = Object.freeze(new Set([
  'selected', 'actually_used', 'completed', 'corrected', 'retried',
  'replaced', 'abandoned', 'overridden', 'helpful_reuse',
]));
```

**Privacy posture to inherit** — copy the `PRIVACY_GUARDS` set and the `privacy_signature_forbidden` rule verbatim (HLTH-01): deny_filtered records must carry `prompt_signature: null`. Field name is `outcome_kind`, NEVER `outcome` (Pitfall 2 in RESEARCH.md — name collision with the v1 telemetry `outcome: null` and rollback journal `outcome: 'completed'|'not_committed'`).

---

### `src/health/observe.mjs` (service / observer, event-driven file ingest)

**Analog:** `src/registry/watcher.mjs` lines 42–88 (`ingestTelemetryEvidence`)

**Cursor-based incremental ingest pattern** (lines 42–88):
```javascript
export function ingestTelemetryEvidence({ store, telemetryPath, cursorPath, projectId, candidateVersion = null }) {
  let stat;
  try { stat = statSync(telemetryPath); } catch { return { ingested: 0, skipped: 'no_telemetry_file' }; }
  let cursor = null;
  try { cursor = JSON.parse(readFileSync(cursorPath, 'utf8')); } catch { cursor = null; }
  const size = stat.size, mtimeMs = stat.mtimeMs;
  if (cursor && cursor.size === size && cursor.mtimeMs === mtimeMs) {
    return { ingested: 0, skipped: 'unchanged' };
  }
  const lines = readFileSync(telemetryPath, 'utf8').split('\n');
  let startLine = 0;
  if (cursor && cursor.size <= size && cursor.lineCount <= lines.length) startLine = cursor.lineCount;
  let ingested = 0;
  for (let i = startLine; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length === 0) continue;
    let record; try { record = JSON.parse(line); } catch { continue; }
    const result = telemetryRecordToEvidence(record, { candidate_version: candidateVersion });
    if (result.status !== 'accepted') continue;
    const appended = store.append(result.signal, { project_id: projectId });
    if (appended.status === 'stored') ingested += 1;
  }
  try {
    mkdirSync(dirname(cursorPath), { recursive: true, mode: 0o700 });
    writeFileSync(cursorPath, JSON.stringify({ size, mtimeMs, lineCount: lines.length }), { mode: 0o600 });
  } catch { /* cursor persistence best-effort */ }
  return { ingested, skipped: startLine > 0 ? 'incremental' : 'full' };
}
```

**What to copy:** the size/mtime/lineCount cursor shape, the rotation reset (size shrank → re-ingest from 0), the 0700 cursor dir + 0600 cursor file perms, and the best-effort cursor write. The health observer adds a *second* input — workflow-state diff — so the function signature extends to `{ store, telemetryPath, workflowStatePath, cursorPath, now }`. Per RESEARCH.md Open Question 1, option (a) (correlate telemetry record with NEXT `nextValidTransitions` advancement) is the recommended, least-invasive choice.

**Off-hot-path invariant:** this module must never be imported by `~/.claude/hooks/router.mjs` (Pitfall 1). Only the watcher (or a parallel background trigger) calls it.

**Transition advancement source:** `src/orchestrator/next-prompt.mjs` `synthesizeNextPrompt` accepts `postWorkState` and re-runs `nextValidTransitions` from `src/orchestrator/transitions.mjs`. The observer reads the persisted workflow state (NOT `synthesizeNextPrompt` directly — that runs on the hot path) and diffs it against the prior cursor to detect advancement → `outcome_kind: 'completed'`; regression or same-state re-dispatch → `'corrected'`/`'retried'`; no advancement within `evidence_window_ms` → `'abandoned'`.

---

### `src/health/score.mjs` (service / scorer, transform)

**Analog:** `src/evolution/evidence.mjs` lines 63–69 (`computeWeightedSamples`) + lines 22–24 (decay constants)

**Decay math pattern** (lines 63–69):
```javascript
export function computeWeightedSamples(observations, { now, halfLifeMs = HALF_LIFE_MS } = {}) {
  if (!Number.isSafeInteger(now)) throw new TypeError('now must be an integer ms epoch');
  return observations.reduce((sum, record) => {
    const age = now - record.signal.timestamp_ms;
    return sum + (2 ** (-age / halfLifeMs));
  }, 0);
}
```

**Decay constants to reuse verbatim** (lines 22–24):
```javascript
export const HALF_LIFE_MS = 24 * 60 * 60 * 1000;        // 24h
export const MAX_RETENTION_MS = 7 * HALF_LIFE_MS;       // 7d
export const MINIMUM_SAMPLES = 30;
```

**Scorer shape (HLTH-06):** weighted combination over `outcome_kind` counts × recency (exponential half-life, reuse `computeWeightedSamples`) × `reversibility` from the contract envelope (`src/registry/contract.mjs` line 13 `reversibility` ∈ `unknown|reversible|irreversible`). Import `HALF_LIFE_MS`/`MINIMUM_SAMPLES` directly; do NOT redefine. Per HLTH-07 (Pitfall 4), the scorer MUST gate on `lifecycle_role` — but see the **HLTH-07 gap** note below: the in-repo `LIFECYCLE_ROLES` vocabulary does NOT include `recovery`/`incident`/`release`/`migration`. The planner must resolve this before implementing the exemption.

---

### `src/health/catalog.mjs` (service / catalog, transform)

**Analog:** `src/registry/relationships.mjs` lines 113–156 (`deriveRelationships`)

**Catalog emission pattern** (lines 113–156):
```javascript
export function deriveRelationships({ records = [], candidates = [] } = {}) {
  const recordsById = new Map((Array.isArray(records) ? records : []).map(record => [
    stableCapabilityId(record), record,
  ]));
  const evaluated = sorted((Array.isArray(candidates) ? candidates : []).map(canonicalCandidate))
    .map(edge => ({ edge, reasons: reasonsFor(edge, recordsById) }));
  // ... cycle detection, active/inactive partition, bounded slices ...
  return {
    schema_version: 1,
    policy_version: 'relationship-rules-v1',
    edges: boundedActive,
    candidates: boundedInactive,
    ...(reasonCodes.length ? { overflow: {...}, reason_codes: reasonCodes } : {}),
  };
}
```

**What to copy:** the `recordsById = new Map(records.map(r => [stableCapabilityId(r), r]))` indexing (framework-neutral attachment), the `reason_codes` array discipline, the `policy_version` string on the output, and the bounded-slice overflow reporting. The health catalog emits observations of kind `missing_category|missing_dependency|unmapped|stale|long_unused|duplicate|overlap|complementary|ineffective|reusable_workflow` (HLTH-08/09).

**Edge vocabulary reuse (HLTH-08):** `relationships.mjs` `RELATIONSHIP_TYPES` (line 7–16) = `substitute|variant|prerequisite|composition|conflict|fallback|implementation|alias`. None is named `duplicate`/`overlap`/`complementary` — those map: `substitute`→`duplicate`, `variant`→`overlap`, `composition`→`complementary`. The planner should confirm this mapping by reading `relationships.mjs` end-to-end (RESEARCH.md Assumption A4).

**Per-observation required fields (HLTH-10):** every emitted observation MUST carry `reason_code`, `evidence_window_ms`, `sample_size` or `opportunity_count`, `freshness`, `affected_capability_ids[]`, `confidence_basis_points`, `remedy` (non-destructive). Copy the `confidence_basis_points` 0–10000 bounding pattern from `router-control.mjs` line 340: `Math.max(0, Math.min(10000, value.confidence_basis_points))`.

**Reusable-workflow detection (HLTH-09):** count consecutive `completed` (healthy) vs `corrected`/`retried` (failure-driven) per capability chain from `outcomes.jsonl`. Emit `reusable_workflow` only when the healthy-repetition threshold is met and the chain length ≥ `MINIMUM_SAMPLES`-style floor.

---

### `src/health/admin.mjs` (service / admin, request-response)

**Analog:** `src/cli/router-control.mjs` lines 860–1107 (`canary` subcommand body) + `src/registry/activate.mjs` recover paths

**Canonical result pattern** (`router-control.mjs` lines 39–41):
```javascript
function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return { schema_version: 1, command, ok, reason_code: reasonCode, data, warnings: [...warnings].sort() };
}
```
Copy this for `health inspect|reset|dispose|recover` results.

**Exit code + structured failure pattern** (lines 873–879, 1104–1106):
```javascript
const EXIT = Object.freeze({ success: 0, usage: 2, invalid: 3, unsafe: 4, mutation: 5 });
// ...
try { /* subcommand body */ }
catch (error) {
  return { result: canonical('canary', false, 'internal_error', { error: error.message }), exitCode: EXIT.mutation };
}
```

**Recoverable-state pattern** — mirror `recoverActiveVersion`/`recoverRollbackJournal` in `src/registry/activate.mjs` (imported at `canary-controller.mjs` lines 2–8). For Phase 24:
- `reset`: atomic-write `state.json` to `{}` (temp+rename).
- `dispose`: rename `state.json` → `state.disposed.json` (recoverable, not deleted).
- `recover`: rename `state.disposed.json` → `state.json`, OR rebuild from `outcomes.jsonl` if the disposed file is missing.
- `inspect`: read-only projection of `state.json` + the two JSONL files with `boundedResult` pagination (router-control.mjs lines 101–117).

**Pitfall 6 guard (HLTH-05):** admin.mjs must NOT import `src/registry/activate.mjs`, `src/prompt/publish-index.mjs`, or any function that writes `registry/`, `release-tuples/active.json`, `mode-map.json`, or `weights.json`. `healthRoot` is `join(ownedRoot, 'health')` — a SIBLING of `evidence/`, not a parent. Add a test that asserts `active.json` content hash is unchanged by every admin command.

---

### `src/health/thresholds.mjs` (config / versioned constants, config)

**Analog:** `src/evolution/evidence.mjs` lines 22–24 + `src/registry/relationships.mjs` line 145 (`policy_version: 'relationship-rules-v1'`)

**Versioned constants pattern:**
```javascript
export const HALF_LIFE_MS = 24 * 60 * 60 * 1000;
export const MAX_RETENTION_MS = 7 * HALF_LIFE_MS;
export const MINIMUM_SAMPLES = 30;
// Phase 24 adds:
export const POLICY_VERSION = 'health-policy-v1';
export const COOLDOWN_MS = 60 * 60 * 1000;        // 1h, canary-guarded
export const CALIBRATION_CORPUS_VERSION = 'health-calibration-v1';  // multilingual plumbing, broader corpus deferred
```

Every emitted outcome/observation record carries `policy_version: POLICY_VERSION` (mirror `relationships.mjs` line 145). Thresholds are NOT editable at runtime; mutation flows only through the canary bridge (next file).

---

### `src/health/canary-bridge.mjs` (service / gate adapter, request-response)

**Analog:** `src/evolution/canary-controller.mjs` lines 11–13, 128–170, 185–255

**Required gates pattern** (lines 11–13):
```javascript
export const REQUIRED_GATES = Object.freeze([
  'safety', 'privacy', 'quality', 'context_budget', 'compatibility', 'latency',
]);
```
Reuse this set verbatim for HLTH-11. The bridge constructs a `gates` object shaped like `router-control.mjs` lines 986–993:
```javascript
const gates = {
  safety: { pass: reconciliation.disposition === 'eligible', reason_code: ... },
  privacy: { pass: privacyPass, reason_code: 'privacy_passed' },
  quality: candidateEvaluation.quality,
  context_budget: candidateEvaluation.context_budget,
  latency: assessed.latency,
  compatibility: { pass: compatibleFn(registry.compatibility) === true, reason_code: 'compatibility_passed' },
};
```

**Evaluate + apply pattern** (lines 128–170, 185–255):
```javascript
const evaluation = evaluate({ candidate, evidence_window: window, gates, known_good_version: knownGood });
const decision = applyDecision({ evaluation, demonstrated_benefit, activation, ownedRoot: root,
                                  known_good_version: knownGood, published_version: canaryActive?.version_id ?? null });
```

**What to copy:** delegate ALL threshold activation through `evaluateCandidate` + `applyCanaryDecision`. Do NOT build a parallel gate suite. Health thresholds (decay, cooldown, sample floor, multilingual calibration) become a "candidate" that passes through the same 6-gate suite. Insufficient evidence → `rejected` with `reason_code: 'insufficient_evidence_samples'` (line 149) — never promote on weak evidence (HLTH-11, Pitfall: stale thresholds activating without canary).

---

### `src/cli/router-control.mjs` (EXTEND, route / CLI dispatcher, request-response)

**Analog:** the same file, lines 860–1107 (`canary` subcommand) — and the dispatch shape at lines 784–808.

**Subcommand dispatch pattern** (lines 784–808, 860–864):
```javascript
const command = positional[0];
if (command === 'canary') {
  const subcommand = positional[1];
  if (!['status', 'promote', 'rollback'].includes(subcommand)) {
    return { result: canonical('canary', false, 'invalid_subcommand',
      { subcommand: subcommand ?? null, usage: usage().trim() }), exitCode: EXIT.usage };
  }
  // ... body ...
}
```

**Add a parallel `health` block** with `sub = positional[1]` validated against `['inspect','reset','dispose','recover']` (HLTH-05). Delegate to `src/health/admin.mjs`; never touch `registry/` or `release-tuples/` here. Update `usage()` (line 547) to list `health inspect|reset|dispose|recover` and add a one-line distinction from `router doctor`/`router coverage` (Phase 07 route-coverage) per RESEARCH.md Open Question 4.

**Render pattern** — reuse `textResult` (lines 509–516) or add a `renderHealthText` mirroring `renderInventoryText` (lines 523–535) if the health projection has a stable field set.

---

### `tests/router.health.*.test.mjs` (test, unit/integration)

**Analog:** existing `tests/*.test.mjs` `node:test` shape (auto-discovered, no config).

**Test framework:** `node:test` (built-in). Run: `rtk node --test tests/router.health.*.test.mjs`. Use `node:assert/strict`. Mirror the existing `tests/router.health.test.mjs` (Phase 07, route-coverage — distinct concern) for harness shape only; do NOT import its assertions (named collision per RESEARCH.md Pitfall 2).

**Required tests** (from RESEARCH.md Validation Architecture):
- `router.health.outcome-schema.test.mjs` — HLTH-01/03/04 (allowlist rejects `forbidden_outcome_field`, 9 `outcome_kind` values, retention/decay/perms).
- `router.health.privacy.test.mjs` — HLTH-02 (no network calls; deny_filtered records carry `prompt_signature: null`).
- `router.health.persistence.test.mjs` — HLTH-04 (atomic writes, 0600 perms, SHA-256 fingerprint per record, bounded compaction).
- `router.health.observe.test.mjs` — observation capture (cursor incremental, transition-diff correlation).
- `router.health.score.test.mjs` — HLTH-06/07 (non-frequency weighting; rare-role exemption; "unjudged" tier when `sample_count < MINIMUM_SAMPLES`).
- `router.health.catalog.test.mjs` — HLTH-08/09/10 (all 9 observation kinds; reusable-workflow healthy-vs-failure distinction; every observation carries the required 7 fields).
- `router.health.admin.test.mjs` — HLTH-05 integration (assert `active.json` + `mode-map.json` content hashes unchanged by every admin command).
- `router.health.canary.test.mjs` — HLTH-11 integration (threshold candidate passes `evaluateCandidate` gates; insufficient evidence → `rejected`).

## Shared Patterns

### Privacy boundary (HLTH-01/02)
**Source:** `~/.claude/hooks/router.mjs` lines 1598–1610 (`redact`, `promptSignature`) + `src/evolution/evidence.mjs` lines 14, 47–50 (`PRIVACY_GUARDS`, `privacy_signature_forbidden`)
**Apply to:** `outcome-schema.mjs`, `observe.mjs` (every record before append), every test file.
```javascript
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xoxb-[0-9A-Za-z]+|gho_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20}|[A-Za-z0-9_\-]{32,}={0,2})/gi;
export function redact(s) { return String(s).replace(SECRET_RE, '[REDACTED]'); }
export function promptSignature(normalizedPrompt, intentKeywords) {
  const redacted = redact(String(normalizedPrompt || ''));
  const iks = Array.isArray(intentKeywords) ? intentKeywords.join(' ') : String(intentKeywords || '');
  return createHash('sha256').update(`${redacted}|${iks}`).digest('hex');
}
```
**Rule:** outcome records carry `prompt_signature` (sha256) only — NEVER raw prompt, transcript, tool output, or source document. `deny_filtered`/`secret_detected`/`content_detected` records must carry `prompt_signature: null`. No network calls anywhere in `src/health/*`.

### Frozen-allowlist validation (HLTH-04)
**Source:** `src/evolution/evidence.mjs` lines 6–53
**Apply to:** `outcome-schema.mjs` (outcome records), `catalog.mjs` (observation records).
**Pattern:** frozen `FIELDS` Set; any field not in the set → `forbidden_*_field` deny. Bounded integers, enum validation, `boundedToken` for every string field (≤128 chars, TOKEN regex). `Object.freeze` the accepted signal.

### Stable capability identity (framework-neutral invariant)
**Source:** `src/registry/identity.mjs` lines 21–35 (`stableCapabilityId`)
**Apply to:** every record emitted by `observe.mjs`, `score.mjs`, `catalog.mjs`, `admin.mjs`.
```javascript
export function stableCapabilityId(record) {
  const suffix = scopeSuffix(record.scope);
  if (typeof record.canonical_identity === 'string' && record.canonical_identity.trim())
    return `${record.canonical_identity.trim()}${suffix}`;
  // ... fallbacks ...
}
```
**Rule:** every health record's `capability_id` field is `stableCapabilityId(record)` — never `record.name` or `record.id` (which may carry framework prefixes like `gsd-`). Add a validator that rejects any `capability_id` matching a known framework prefix (Pitfall 3).

### Decay / retention / sample floor (HLTH-04, HLTH-11)
**Source:** `src/evolution/evidence.mjs` lines 22–24, 63–69
**Apply to:** `score.mjs`, `thresholds.mjs`, `observe.mjs` (window filter).
**Pattern:** import `HALF_LIFE_MS`/`MAX_RETENTION_MS`/`MINIMUM_SAMPLES`/`computeWeightedSamples` directly. Never redefine. Health records older than `MAX_RETENTION_MS` are filtered out of every window. `sample_count < MINIMUM_SAMPLES` → capability is "unjudged", never "useless" (HLTH-07).

### Atomic file writes (HLTH-04)
**Source:** `src/registry/watcher.mjs` lines 81–86 (cursor) + `src/registry/relationships.mjs` (frozen output) + `publish-index.mjs` durable-write pattern (referenced RESEARCH.md "Don't Hand-Roll" line 262)
**Apply to:** `observe.mjs` (outcomes.jsonl append), `admin.mjs` (state.json atomic write), `canary-bridge.mjs` (versions/ writes).
**Pattern:** `appendFileSync(path, line, { flag: 'a', mode: 0o600 })` for JSONL; temp+rename+fsync for `state.json`; `mkdirSync(dir, { recursive: true, mode: 0o700 })` for the health root on first use.

### Canary gate suite (HLTH-11)
**Source:** `src/evolution/canary-controller.mjs` lines 11–13, 128–170, 185–255
**Apply to:** `canary-bridge.mjs` (and `thresholds.mjs` validation).
**Pattern:** delegate all threshold activation through `evaluateCandidate` + `applyCanaryDecision`. The 6 `REQUIRED_GATES` are non-negotiable. Insufficient evidence → `rejected` (preserve), never promote. `demonstrated_benefit` derivation is shared via `deriveDemonstratedBenefit` (lines 76–89) — reuse, don't reinvent.

## No Analog Found

None. Every new module has a same-role+same-data-flow analog in-repo.

## Gaps the Planner Must Resolve Before Implementation

These are not "no analog" gaps — they are vocabulary gaps the planner must close in Wave 1 before writing HLTH-07/08 code:

| Gap | Source | Why it matters |
|-----|--------|----------------|
| **`lifecycle_role` rare-role vocabulary** | `src/registry/schema.mjs` lines 20–28 | The in-repo `LIFECYCLE_ROLES` enum is `['invocable','event-bound','resource','container','configuration','instruction','opaque']`. It does NOT include `recovery`/`incident`/`release`/`migration` — the HLTH-07 rare-role exemption cannot gate on these directly. Planner Wave 1 must grep `workflow-declarations.json` and `contract.mjs` (lines 13, 186–189) to find where rare-roles are actually expressed (likely as `semantic_type` or a contract-field value, not as `lifecycle_role`). RESEARCH.md Assumption A3 flags this. |
| **Relationship edge vocabulary → HLTH-08 mapping** | `src/registry/relationships.mjs` lines 7–16 | `RELATIONSHIP_TYPES` are `substitute\|variant\|prerequisite\|composition\|conflict\|fallback\|implementation\|alias`. HLTH-08 names `duplicate`/`overlap`/`complementary` — none is a literal edge kind. Planner Wave 3 must read `relationships.mjs` end-to-end and decide the mapping (preliminary: `substitute`→`duplicate`, `variant`→`overlap`, `composition`→`complementary`). RESEARCH.md Assumption A4. |
| **Post-work observation source** | RESEARCH.md Open Question 1 | Three viable options (a) extend telemetry on next `UserPromptSubmit`, (b) new `Stop`/`SubagentStop` binding, (c) watcher-only workflow-state diff. Recommendation: (a) — least invasive, respects "no new hook binding" posture. Planner must pick one and document the tradeoff. |

## Metadata

**Analog search scope:** `src/evolution/`, `src/registry/`, `src/orchestrator/`, `src/cli/`, `~/.claude/hooks/router.mjs`. Files scanned: 11 (evidence.mjs, canary-controller.mjs, identity.mjs, schema.mjs, contract.mjs, relationships.mjs, watcher.mjs, router-control.mjs, router.mjs, next-prompt.mjs, actions.mjs — last two via RESEARCH.md direct reads).
**Pattern extraction date:** 2026-07-27
**Out-of-scope reaffirmed:** `src/prompt/publish-index.mjs`, `src/lifecycle/router-lifecycle.mjs` install list — Phase 26 / REL-03 (tuple publication). PATTERNS.md does NOT assign analogs for touching these files.