# Phase 20: Close gap EVO-05 — add production trigger for canary-controller - Research

**Researched:** 2026-07-17
**Domain:** Production trigger wiring for the orphaned canary evaluation library (telemetry-driven evolution promotion + rollback)
**Confidence:** HIGH

## Summary

EVO-05 is "partial" solely because `src/evolution/{canary-controller,evidence,perf-measure}.mjs` are imported only by tests and are absent from the deployed module bundle (`src/lifecycle/router-lifecycle.mjs:308-321` lists 20 modules; none under `evolution/`). The canary decision logic itself is complete and production-ready: `evaluateCandidate` requires every one of 6 independent hard gates (`canary-controller.mjs:11-13`) and `applyCanaryDecision` (`canary-controller.mjs:148-217`) correctly wires promote/rollback/preserve/recovery_required through the already-production `activate.mjs` primitives (`REGISTRY_PUBLICATION` at `canary-controller.mjs:135-141`). What is missing is (a) a **telemetry→evidence bridge** that transforms `~/.claude/router/telemetry.jsonl` records into the D-05 allowlisted evidence envelope schema, (b) a **persistent evidence store** (the current `createEvidenceStore` is in-memory/test-only — `evidence.mjs:93-154`), and (c) a **production trigger** on the three control-plane surfaces (watcher/CLI/release-runner) that invokes `evaluateCandidate`→`applyCanaryDecision` instead of calling `activateCandidate` directly.

The hot path (`src/context/prompt-route.mjs:84` → `loadCompiledIndex`) stays read-only w.r.t. canary — canary runs only in the background control plane, mutating publication authority exclusively through `activate.mjs` primitives. The `test_mode` seam (Phase 18 WR-03 / `activate.mjs:79-112`) is NOT a production trigger and must not be reused; the rollback/activation plumbing is already production-ready on the `test_mode=false` default path — only the trigger is missing.

**Primary recommendation:** Add a stdlib-only `src/evolution/telemetry-bridge.mjs` that reads `telemetry.jsonl`, maps each record to a D-05 evidence envelope, and appends to a persistent JSONL evidence store under `~/.claude/router/evidence/{scope}.jsonl` (project + aggregate isolated files, 7d retention / 24h decay / 30-sample floor enforced on window read). Wire the watcher's eligible-activation branch (`watcher.mjs:328-345`) to route through `evaluateCandidate`→`applyCanaryDecision` when evidence is sufficient (preserve — not promote — when insufficient). Add `canary status|promote|rollback` subcommands to `src/cli/router-control.mjs`. Optionally extend `src/release/run-release.mjs` with a post-calibration canary promotion step. Add `evolution/*` to the deployed module bundle in `router-lifecycle.mjs:308-321`.

**Phase 19 independence (verified):** The canary trigger operates on the compiled-index publication authority (`active.json` + `versions/`) established by the watcher's activation path (`watcher.mjs:336-345`), NOT on the orchestrator wiring that Phase 19 closes (which affects how routes are *built* via `selectCapabilities`/`planContextLoad`, not how they are *promoted* through canary). The audit lists them as separate BLOCKERs (BLOCKER 1 = Phase 19; BLOCKER 2 = Phase 20) and recommends "two closure phases." Phase 20 can ship the canary trigger without Phase 19 done — the canary evaluates whatever compiled index the watcher produces. The "Depends on: Phase 19" roadmap ordering is sequencing hygiene, not a hard functional dependency. [VERIFIED: codebase — `watcher.mjs:336` calls `activateCandidate` directly with no orchestrator import; `canary-controller.mjs` imports only `activate.mjs` + `evidence.mjs`, never `orchestrator/*`]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVO-05 | Privacy-safe telemetry canary-tests weight and signal changes and rolls back regressions. | canary-controller evaluateCandidate + applyCanaryDecision (complete, test-validated); the gap is the production trigger + telemetry→evidence bridge + persistent evidence store — all addressed in Architecture Patterns below. ROADMAP Phase 17 success criterion #4: "Privacy-safe signal or weight candidates run through canaries and automatically roll back when quality regresses." |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Telemetry emission (hot path) | Hook (read-only) | — | `~/.claude/hooks/router.mjs:1643 logTelemetry` appends to `telemetry.jsonl`; must never block or mutate. Canaries consume telemetry, they do not produce it. |
| Telemetry→evidence transform | Background control plane | — | New `telemetry-bridge.mjs`; runs off the hot path. Reads telemetry.jsonl (read-only), writes evidence store. |
| Evidence persistence + retention | Background control plane (filesystem) | — | Persistent JSONL under `~/.claude/router/evidence/`; atomic temp+rename; 7d/24h/30-sample enforced on window read. |
| Candidate proposal + gate evaluation | Background control plane | — | `canary-controller.mjs proposeCandidate/evaluateCandidate`; pure, no I/O. |
| Promote/rollback decision | Background control plane | API/Backend (registry publication) | `applyCanaryDecision` delegates all mutation to `activate.mjs` primitives (CAS pointer + immutable versions). |
| Watcher canary trigger | Background control plane (watcher process) | — | `watcher.mjs reconcile` runs in the controller child process, NOT the hot path. |
| CLI canary control | Operator (CLI) | — | `router-control.mjs` operator verbs; human-initiated. |
| Release-runner canary step | Release pipeline | — | `run-release.mjs` post-calibration; release-time only. |
| active.json / known-good bootstrapping | Background control plane (watcher activation path) | — | The watcher's normal eligible-activation branch (`watcher.mjs:336`) calls `activateCandidate` directly, which writes `active.json` + `versions/`. The canary trigger depends on this existing. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib only | built-in (Node ≥18) | All I/O, hashing, JSON, telemetry parsing, evidence persistence | Project CLAUDE.md hard constraint: zero npm dependencies. The hook and all deployed modules are stdlib-only. `node:crypto`, `node:fs`, `node:path`, `node:os` cover everything. [VERIFIED: .claude/CLAUDE.md "What NOT to Use" — "Any npm dependency at all in v1"] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/evolution/canary-controller.mjs` | existing (Phase 17) | evaluateCandidate + applyCanaryDecision — the decision library this phase wires into production | Trigger surfaces call these; do NOT reimplement. |
| `src/evolution/evidence.mjs` | existing (Phase 17) | validateEvidenceEnvelope + createEvidenceStore + evidenceWindowFingerprint — the evidence layer this phase persists | Bridge writes through validateEvidenceEnvelope; persistent store wraps the in-memory store's window logic. |
| `src/evolution/perf-measure.mjs` | existing (Phase 17) | CALIBRATION_CORPUS + evaluateCalibrationCorpus + measureRoutes + assessCalibration — produces quality/context_budget/latency gate outcomes | Canary trigger calls these to build 3 of the 6 REQUIRED_GATES. |
| `src/registry/activate.mjs` | existing (Phase 14, hardened Phase 18) | activateCandidate/previewRollback/executeRollback/recoverActiveVersion/recoverRollbackJournal — the ONLY publication mutation authority | applyCanaryDecision delegates here via REGISTRY_PUBLICATION; never bypass. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `telemetry-bridge.mjs` module | Inline transform in watcher reconcile | Separate module keeps the bridge testable, reusable across all 3 trigger surfaces, and isolates the telemetry-schema coupling from the watcher. Recommended. |
| Persistent JSONL evidence store | SQLite/LevelDB | Violates zero-dep constraint; JSONL + atomic rename is the project's established pattern (`activate.mjs` journalWrite, `run-release.mjs` publishAtomic). |
| Watcher canary eval on every reconcile | Periodic background timer (like `router.evolve.mjs`) | Watcher is the natural trigger — it already builds candidates and holds the activation context. A separate timer would duplicate candidate-building logic. Recommended: watcher-integrated. |

**Installation:** No npm install. Files are added to `src/evolution/` and registered in the deployed module bundle list at `src/lifecycle/router-lifecycle.mjs:308-321`.

**Version verification:** N/A — stdlib only, no external packages.

## Package Legitimacy Audit

No external packages are installed in this phase. The phase is pure stdlib + wiring of existing in-repo modules.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| (none) | — | — | N/A — zero-dependency phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    HOT PATH (read-only, <100ms, never mutates)
   user prompt ──► router.mjs routeContextPrompt ──► loadCompiledIndex (READ active.json + versions/)
                          │                                       │
                          ▼                                       ▼
                   additionalContext injection            telemetry.jsonl (APPEND only)
                                                          (no read on hot path)


           BACKGROUND CONTROL PLANE (mutates publication authority via activate.mjs only)

   filesystem event ──► watcher.mjs reconcile (watcher.mjs:284-363)
                          │
                   build candidate ──► evaluate (reconcile.mjs)
                          │
                   eligible + recoveryReady? ──no──► preserve (write candidate.json only)
                          │
                         yes
                          │
                   ┌───────┴──────────────────────────────────────────────┐
                   │ CURRENT (Phase 20 gap): activator(activateCandidate)  │
                   │   directly — NO canary eval, NO evidence window        │  ← the gap
                   └───────┬──────────────────────────────────────────────┘
                          │
                   PHASE 20 WIRING (new):
                          │
                          ▼
           telemetry-bridge.mjs: read telemetry.jsonl ──► validateEvidenceEnvelope
                          │                              ──► append to evidence/{project|aggregate}.jsonl
                          ▼
           persistent evidence store .window({scope}) ──► evidence_window (frozen, 7d/24h/30-sample)
                          │
                          ▼
           canary-controller.proposeCandidate({source_evidence_fingerprint, policy_version,
                                               compiled_index_version, evaluation_inputs, proposal})
                          │
                          ▼
           build 6 gates: safety (reconcile), privacy (evidence guard), quality+context_budget+latency
                          (perf-measure assessCalibration), compatibility (compile-index metadata)
                          │
                          ▼
           evaluateCandidate({candidate, evidence_window, gates, known_good_version})
                          │
                   promotable? ──no + published_version──► applyCanaryDecision rollback branch
                          │                                    └─► previewRollback → executeRollback
                         yes                                  (known_good_version destination)
                          │
                   demonstrated_benefit? ──no──► preserve (no mutation)
                          │
                         yes
                          ▼
           applyCanaryDecision promote branch ──► activateCandidate (via REGISTRY_PUBLICATION)
                          │                         └─► writeImmutableVersion → replaceActivePointer
                          ▼                          (CAS + fsync + TOCTOU re-verify)
                   published active.json (new known-good)


   OPERATOR (CLI): router-control.mjs canary {status|promote|rollback}
                          │
                   read evidence window + active version + candidate
                          │
                   operator promote ──► evaluateCandidate + applyCanaryDecision (same path as watcher)
                   operator rollback ──► previewRollback + executeRollback (existing rollback verb pattern)


   RELEASE: run-release.mjs post-calibration stage
                          │
                   calibration stage produces real evidence (CALIBRATION_CORPUS run)
                          │
                   optional canary promotion step ──► evaluateCandidate + applyCanaryDecision
                   (or validate canary logic only — current behavior; recommendation: add promotion step)
```

### Recommended Project Structure
```
src/evolution/
├── canary-controller.mjs   # existing — evaluateCandidate, applyCanaryDecision (no change)
├── evidence.mjs            # existing — validateEvidenceEnvelope, createEvidenceStore, evidenceWindowFingerprint
│                           # ADD: createPersistentEvidenceStore (disk-backed, same window logic)
├── perf-measure.mjs        # existing — CALIBRATION_CORPUS, assessCalibration (no change)
└── telemetry-bridge.mjs    # NEW — telemetry.jsonl → D-05 evidence envelope transform + ingest
src/registry/
├── activate.mjs            # existing — no change (production-ready)
├── watcher.mjs             # MODIFY reconcile (watcher.mjs:328-345) — route eligible activations through canary
└── ...
src/cli/
└── router-control.mjs      # MODIFY — add canary {status|promote|rollback} subcommands
src/release/
└── run-release.mjs          # OPTIONALLY MODIFY — add post-calibration canary promotion step
src/lifecycle/
└── router-lifecycle.mjs    # MODIFY moduleNames (line 308-321) — add evolution/* to deployed bundle
~/.claude/router/
└── evidence/               # NEW — persistent evidence store
    ├── project-{project_id}.jsonl   # project-scoped evidence (isolated)
    └── aggregate.jsonl              # explicitly-eligible aggregate evidence (isolated)
```

### Pattern 1: Telemetry→Evidence Bridge (the core missing piece)
**What:** A pure transform from `telemetry.jsonl` record schema to the D-05 allowlisted evidence envelope schema, followed by validation and append to the scoped persistent store.
**When to use:** Before any canary evaluation — the evidence window must be populated.
**Field mapping (verified against both schemas):**

| telemetry.jsonl field (`router.mjs:2355-2382 telemetryEntryFromState`) | D-05 evidence envelope field (`evidence.mjs:4-8 FIELDS`) | Transform |
|---|---|---|
| `ts` | `timestamp_ms` | direct (both are ms epochs) |
| `prompt_signature` (null when deny_filtered) | `prompt_signature` | direct; `validateEvidenceEnvelope` enforces `privacy_signature_forbidden` deny when guards_fired includes privacy codes (`evidence.mjs:40-43`) — already handled. |
| (derive from route_id / suggested_mode) | `route_id` | `suggested_mode` (e.g. "gsd-debug") or a stable route_id from the decision; bounded token required (`evidence.mjs:31`). If `suggested_mode` is null (trivial/user_explicit/stale), the record is not canary-relevant — skip. |
| `confidence_tier` | `confidence_band` | direct map to the CONFIDENCE_BANDS set (`evidence.mjs:9`: high/medium/low/trivial/user_explicit/stale/manifest_missing/reentry_skipped/deny_filtered) — telemetry already emits exactly these values. |
| `guards_fired` | `guard_codes` | direct (array of bounded tokens; `evidence.mjs:33` caps at 16 codes of ≤64 chars). |
| (derive: route_selected / trivial_filtered / etc.) | `reason_code` | derive from `confidence_tier` + `invoke_kind` + `guards_fired`; bounded token ≤64 chars (`evidence.mjs:34`). Map: deny_filtered→`deny_filtered`, user_explicit→`user_explicit`, stale→`stale_context`, manifest_missing→`manifest_missing`, high/medium/low→`route_selected`. |
| (derive from fixture_class of the prompt) | `fixture_class` | must be one of FIXTURE_CLASSES (`evidence.mjs:10`: minimal-prompt/explicit-override/stale-context/ambiguity/terminal-state/dependency/context-budget). The bridge must classify the prompt into a fixture class — this is the one non-trivial derivation. Recommendation: derive from `confidence_tier` + `invoke_kind` (stale→stale-context, user_explicit→explicit-override, high/low+dispatch→minimal-prompt or dependency). If unclassifiable, skip the record (do NOT emit an invalid fixture_class — `validateEvidenceEnvelope` would deny it). |
| `latency_ms` | `latency_us` | multiply by 1000 (ms→μs); `evidence.mjs:36` bounds 0–10_000_000. |
| (candidate version under canary — null for non-canary routes) | `candidate_version` | the compiled-index version the route was served from, IF a canary candidate is in flight; null/empty for steady-state routes. The bridge needs the current candidate version context (passed in as a parameter, not read from telemetry). |
| (policy version — constant) | `policy_version` | `COMPILED_INDEX_COMPATIBILITY.policy_version` = `'workflow-transitions-v1'` (`compile-index.mjs:8`). Constant. |
| (derive: success/regression) | `verdict` | `outcome` field in telemetry is currently always `null` (`router.mjs:2378`). The bridge CANNOT derive verdict from telemetry alone — this is a gap. Recommendation: for v1, treat every emitted route as `verdict: 'success'` (the route completed without exception); regression is detected by the quality/context_budget/latency GATES in `assessCalibration`, not by per-record verdicts. Alternatively, the bridge correlates `evolved_after` + downstream outcomes — but `outcome` is null today. Flag as an open question. |

**Example (bridge transform, stdlib-only):**
```typescript
// Source: src/evolution/telemetry-bridge.mjs (new — pattern based on evidence.mjs:27-46 + router.mjs:2355-2382)
import { validateEvidenceEnvelope } from './evidence.mjs';
import { createHash } from 'node:crypto';

const POLICY_VERSION = 'workflow-transitions-v1'; // from compile-index.mjs:8

function classifyFixtureClass(record) {
  // Map confidence_tier + invoke_kind → FIXTURE_CLASSES (evidence.mjs:10)
  if (record.confidence_tier === 'user_explicit') return 'explicit-override';
  if (record.confidence_tier === 'stale') return 'stale-context';
  if (record.confidence_tier === 'deny_filtered') return null; // skip — privacy-denied, not canary evidence
  if (record.invoke_kind === 'agent') return 'dependency';
  return 'minimal-prompt'; // default for high/medium/low routed prompts
}

function deriveReasonCode(record) {
  if (record.confidence_tier === 'deny_filtered') return 'deny_filtered';
  if (record.confidence_tier === 'user_explicit') return 'user_explicit';
  if (record.confidence_tier === 'stale') return 'stale_context';
  if (record.confidence_tier === 'manifest_missing') return 'manifest_missing';
  return 'route_selected';
}

export function telemetryRecordToEvidence(record, { candidate_version = null } = {}) {
  const fixture_class = classifyFixtureClass(record);
  if (!fixture_class) return { status: 'skipped', reason_code: 'not_canary_evidence' };
  if (!record.suggested_mode) return { status: 'skipped', reason_code: 'no_route' };
  const envelope = {
    timestamp_ms: record.ts,
    route_id: record.suggested_mode, // bounded token check in validateEvidenceEnvelope
    confidence_band: record.confidence_tier,
    guard_codes: record.guards_fired || [],
    reason_code: deriveReasonCode(record),
    fixture_class,
    latency_us: Math.round((record.latency_ms || 0) * 1000),
    candidate_version: candidate_version || 'steady-state-v1',
    policy_version: POLICY_VERSION,
    verdict: 'success', // v1: route completed without exception; regression detected by gates
    prompt_signature: record.prompt_signature, // null when privacy-denied — validateEvidenceEnvelope enforces
  };
  return validateEvidenceEnvelope(envelope); // rejects forbidden fields before persistence
}
```

### Pattern 2: Persistent Evidence Store
**What:** A disk-backed variant of `createEvidenceStore` (`evidence.mjs:93-154`) that appends validated envelopes to scoped JSONL files and reads windows with 7d retention / 24h decay / 30-sample floor.
**When to use:** Production canary trigger reads `.window({scope})` before evaluateCandidate.
**Persistence path + format:**
- Root: `~/.claude/router/evidence/` (mkdir 0o700)
- Project scope: `project-{project_id}.jsonl` (one file per project; project_id is a bounded token per `evidence.mjs:103`)
- Aggregate scope: `aggregate.jsonl` (single file, only explicitly-eligible records)
- Atomic append: `appendFileSync(path, line, { flag: 'a', mode: 0o600 })` — same pattern as `router.mjs:1647` telemetry append
- Window read: read all lines, parse, filter by `matchesScope` + age ≤ MAX_RETENTION_MS, compute weighted_samples with HALF_LIFE_MS decay, enforce MINIMUM_SAMPLES=30 floor (reuse `evidence.mjs:125-152` window logic verbatim — copy, do not hand-roll)
- Retention: 7d MAX_RETENTION_MS (`evidence.mjs:16`) enforced on window read (filter `age <= MAX_RETENTION_MS`); optional compaction can prune older records on write, but read-time filtering is the authoritative gate.

**Example:**
```typescript
// Source: src/evolution/evidence.mjs (extend — pattern from evidence.mjs:93-154 + activate.mjs journalWrite)
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateEvidenceEnvelope, evidenceWindowFingerprint, HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES } from './evidence.mjs';

export function createPersistentEvidenceStore({ root, now = Date.now, minimum_samples = MINIMUM_SAMPLES } = {}) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const pathFor = (scope) => join(root, scope.kind === 'aggregate' ? 'aggregate.jsonl' : `project-${scope.project_id}.jsonl`);
  return Object.freeze({
    append(input, options = {}) {
      const validated = validateEvidenceEnvelope(input); // rejects forbidden fields BEFORE persistence
      if (validated.status !== 'accepted') return validated;
      // scope validation identical to evidence.mjs:98-105
      const scope = options.scope === 'aggregate'
        ? (options.aggregate_eligible === true ? { kind: 'aggregate' } : { status: 'denied', reason_code: 'aggregate_eligibility_required' })
        : (boundedToken(options.project_id, 128) ? { kind: 'project', project_id: options.project_id } : { status: 'denied', reason_code: 'invalid_project_scope' });
      if (scope.status === 'denied') return scope;
      const line = `${JSON.stringify({ scope, signal: validated.signal, fingerprint: defaultHash(JSON.stringify(validated.signal)) })}\n`;
      appendFileSync(pathFor(scope), line, { flag: 'a', mode: 0o600 });
      return { status: 'stored' };
    },
    window(options = {}) {
      // identical logic to evidence.mjs:125-152 — read, filter by scope + age, decay, floor
      // read from pathFor(scope); parse each line; filter; compute weighted_samples
    },
  });
}
```

### Pattern 3: Watcher canary trigger integration
**What:** Modify `watcher.mjs:328-345` so that when an eligible candidate is built and recoveryReady, the watcher routes through `evaluateCandidate`→`applyCanaryDecision` instead of calling `activator` (= `activateCandidate`) directly.
**When to use:** On every eligible+recoveryReady reconciliation.
**Key sub-decisions:**
1. **Evidence sufficiency gate:** Before evaluateCandidate, call `persistentStore.window({project_id})`. If `window.sufficient !== true` (fewer than 30 samples), **preserve** (write candidate.json only, do not promote) — do NOT call applyCanaryDecision. This is the "insufficient-evidence" edge.
2. **Known-good version:** `known_good_version` comes from `recoverActiveVersion({ownedRoot}).version_id` (`activate.mjs:190-197`). If null (no active.json yet — first-ever activation), the watcher's normal path should activate directly (no canary rollback possible when there's nothing to roll back to). See "active.json bootstrapping" below.
3. **Gate construction (the 6 REQUIRED_GATES):**
   - `safety`: from the reconciliation report — `report.disposition === 'eligible'` already implies safety passed (`reconcile.mjs`).
   - `privacy`: from the evidence window — if any observation has a privacy guard code, privacy gate fails (or: re-run the privacy gate subprocess like `validate.mjs` does; recommendation: derive from evidence + the existing `produceActivationVerification` privacy gate).
   - `quality`, `context_budget`, `latency`: from `perf-measure.mjs assessCalibration({evaluation, performance: measureRoutes(...)})` — run the CALIBRATION_CORPUS against the candidate compiled index.
   - `compatibility`: from `compile-index.mjs COMPILED_INDEX_COMPATIBILITY` — `compatible(metadata.compatibility)`.
4. **published_version:** the current `active.json` version_id (or null if first activation).
5. **demonstrated_benefit:** derived from comparing the candidate's calibration/perf against the known-good's baseline. If quality+context_budget+latency all pass AND the candidate is at least as good as known-good, `demonstrated_benefit = {status: 'demonstrated', reason_code: '...'}. If neutral (same quality, no regression), `status: 'safety_correction'` for safety-only changes, else `status: 'neutral'` → preserve.

**Example (watcher integration sketch — not runnable, shows the decision shape):**
```typescript
// Source: src/registry/watcher.mjs:328-345 (modified)
if (report.disposition === 'eligible' && recoveryReady) {
  const knownGood = recoverActiveVersion({ ownedRoot: config.activation_root }).version_id;
  if (!knownGood) {
    // BOOTSTRAP: first-ever activation, no known-good to roll back to.
    // Activate directly (existing path) — this becomes the known-good.
    activation = await activator({ ownedRoot: config.activation_root, candidate: built.registry, ... });
  } else {
    const window = persistentStore.window({ project_id: config.scope_id || 'global' });
    if (!window.sufficient) {
      activation = { activation_status: 'preserved', reason_code: 'insufficient_evidence_samples' };
    } else {
      const candidate = proposeCandidate({ source_evidence_fingerprint: window.source_evidence_fingerprint, policy_version: COMPILED_INDEX_COMPATIBILITY.policy_version, compiled_index_version: activation.version_id, evaluation_inputs: {...}, proposal: {...} });
      const gates = buildGates({ report, window, compiledIndex, candidatePerformance }); // 6 gates
      const evaluation = evaluateCandidate({ candidate, evidence_window: window, gates, known_good_version: knownGood });
      const decision = applyCanaryDecision({ evaluation, demonstrated_benefit, activation: { ownedRoot: config.activation_root, candidate: built.registry, ... }, ownedRoot: config.activation_root, known_good_version: knownGood, published_version: active.version_id });
      activation = decisionToActivation(decision);
    }
  }
}
```

### Pattern 4: CLI canary subcommands
**What:** Add `canary {status|promote|rollback}` to `router-control.mjs` (after the existing `rollback` verb at line 247-270).
- `canary status`: read evidence window + active version + last candidate; print sufficiency, sample_count, weighted_samples, known_good_version, last evaluation verdict.
- `canary promote`: operator-initiated canary promotion — run evaluateCandidate + applyCanaryDecision promote branch. Requires `--execute --confirm <candidate_id>`. Differs from registry activation: gates must all pass AND demonstrated_benefit must be shown.
- `canary rollback`: operator-initiated canary rollback to known_good_version. Reuses the existing `rollback` verb's `previewRollback`→`executeRollback` path (line 250-269) but with `reason: 'canary_rollback'` and destination = known_good_version (not an arbitrary operator-chosen version). This is narrower than the existing `rollback` verb (which allows any valid version).

### Pattern 5: Release-runner canary step (optional)
**What:** After the `calibration` stage (run-release.mjs:88) produces real evidence (CALIBRATION_CORPUS run + measurements), optionally add a canary promotion step that uses the calibration evidence as the evidence window and promotes if all gates pass.
**Recommendation:** For v1, keep the release runner as a logic-validator (current behavior — calibration stage runs canary tests as TAP). A release-time promotion step risks promoting on synthetic-corpus evidence alone (no real telemetry). The watcher is the better promotion trigger (real telemetry). Flag as a deferred enhancement, not a Phase 20 must-have. The audit says the release runner "validates logic, not a live telemetry-driven loop" — that validation role should remain.

### Anti-Patterns to Avoid
- **Hand-rolling the BM25/evidence logic:** `evaluateCandidate`/`applyCanaryDecision`/`validateEvidenceEnvelope` are complete and test-validated — wire them, do NOT reimplement. [VERIFIED: tests/router.evolution-canary.test.mjs + tests/router.compiled-evolution.test.mjs pass]
- **Mutating publication authority outside `activate.mjs`:** `applyCanaryDecision` delegates exclusively through `REGISTRY_PUBLICATION` (`canary-controller.mjs:135-141`). Any trigger that bypasses this breaks the CAS + fsync + TOCTOU re-verify invariants. [VERIFIED: canary-controller.mjs:135-141, activate.mjs:158-177 replaceActivePointer]
- **Running canary eval on the hot path:** The hot path (`prompt-route.mjs`) must stay read-only. Canary runs in the watcher/controller background process. [VERIFIED: prompt-route.mjs:84 loadCompiledIndex reads only]
- **Reusing `test_mode` as a production trigger:** `test_mode` is a code-level opt-in for test harnesses (`activate.mjs:86-87`); production never sets it. Phase 20 must add a SEPARATE real wiring. [VERIFIED: 18-04-PLAN threat model T-18-04-SEAM]
- **Persisting raw prompt text in evidence:** `validateEvidenceEnvelope` rejects unknown fields BEFORE hashing/persistence (`evidence.mjs:29`). The bridge must never bypass this. [VERIFIED: evidence.mjs:27-46]
- **Cross-scope evidence contamination:** project + aggregate evidence MUST be isolated (separate JSONL files). `matchesScope` (`evidence.mjs:107-110`) enforces this in-memory; the persistent store must enforce it on disk. [VERIFIED: evidence.mjs:98-110]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canary decision (promote/rollback/preserve) | Custom if/else over gates | `canary-controller.mjs evaluateCandidate` + `applyCanaryDecision` | Handles all 5 outcomes (promote/rollback/preserve/recovery_required/rejected), immutable candidate binding, evidence integrity, recovery block detection — 217 lines of edge cases already tested. |
| Evidence envelope validation | Custom field allowlist | `evidence.mjs validateEvidenceEnvelope` | Enforces D-05/D-06 privacy (signature suppression after privacy denial), bounded tokens, enum membership, latency bounds — 46 lines of validated guards. |
| Evidence window (retention/decay/floor) | Custom time math | `evidence.mjs createEvidenceStore.window` logic (copy into persistent store) | 7d/24h/30-sample with exponential-half-life-v1 weighting policy, fingerprint integrity — exact Phase 17 D-07/D-08 contract. |
| Publication mutation (activate/rollback) | Custom active.json writes | `activate.mjs activateCandidate/previewRollback/executeRollback/recoverActiveVersion` | CAS pointer + mutation lock + fsync + TOCTOU re-verify + rollback journal — 249 lines of durability edge cases. |
| Calibration corpus + gate measurement | Custom fixtures | `perf-measure.mjs CALIBRATION_CORPUS + evaluateCalibrationCorpus + measureRoutes + assessCalibration` | Fixed 7-fixture corpus, fingerprint-stable, produces quality+context_budget+latency gate outcomes. |
| Atomic file write | Custom fsync dance | Follow `activate.mjs journalWrite` / `run-release.mjs publishAtomic` patterns | Project-established temp+rename+fsync pattern. |

**Key insight:** Phase 20 is a WIRING phase, not a build phase. Every primitive the trigger needs already exists and is test-validated. The work is: (1) one new module (`telemetry-bridge.mjs`), (2) one new persistent-store variant in `evidence.mjs`, (3) three trigger-surface integrations (watcher/CLI/release), (4) bundle registration. Do not reimplement canary logic.

## Runtime State Inventory

This phase touches live runtime state (telemetry + publication authority), so a focused inventory is included even though this is not a rename/refactor phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `~/.claude/router/telemetry.jsonl` (3.6MB, 6969 lines, written by `router.mjs:1647`). Schema: ts, prompt_signature, suggested_mode, suggested_skills, suggested_agents, confidence_tier, invoke_kind, graphify_queried, graph_status, guards_fired, downstream_invocations, outcome, latency_ms, weight_applied, outcomes, evolved_after, surface_status, surface_disabled_count, cwd. | READ-ONLY by the bridge. No migration. |
| Stored data | `~/.claude/router/active.json` — **DOES NOT EXIST** (verified: `cat` returns empty). `~/.claude/router/versions/` — **DOES NOT EXIST**. | BOOTSTRAP required — see "active.json bootstrapping" below. The canary rollback path needs a known-good version; none exists today. |
| Stored data | `~/.claude/router/compiled-index/`, `release-tuples/` — **DO NOT EXIST** (verified: `find` returns nothing). | The hot path's `loadCompiledIndex` (`compile-index.mjs:116-164`) handles missing files by returning non-dispatchable. No canary can run until a compiled index is published. |
| Stored data | `~/.claude/router/evolution-state.json` (28KB, `mutations_applied: 0`, `mutations_reverted: 24`) — separate weights-evolution subsystem (Phase 3 `router.evolve.mjs`), NOT canary. | None — do not touch. Canaries and weights-evolution are separate subsystems. |
| Live service config | `~/.claude/router/controller/config.json`, `status.json`, `request.json` — watcher controller config. `config.activation_root` points to `~/.claude/router/`. | The watcher already has `activation_root`; the canary trigger reuses this. No new config field strictly required (canary reads from the same ownedRoot), but adding `canary: { enabled: true, evidence_root: "<path>" }` to controller config is recommended for explicitness. |
| OS-registered state | None — the watcher is a child process spawned by `installRouter` (`router-lifecycle.mjs`), not a launchd/systemd/pm2 task. | None. |
| Secrets/env vars | None — `telemetry.jsonl` already excludes raw prompts (privacy by design, `router.mjs:1643`). | None. |
| Build artifacts | Deployed module bundle (`router-lifecycle.mjs:308-321`) does NOT include `evolution/*`. | MUST add `evolution/canary-controller.mjs`, `evolution/evidence.mjs`, `evolution/perf-measure.mjs`, `evolution/telemetry-bridge.mjs` to `moduleNames` so the installer deploys them to `~/.claude/router/modules/evolution/`. |

**Nothing found in category:** OS-registered state — verified by checking for pm2/launchd/systemd (none; controller is a spawned child).

### active.json / known-good bootstrapping (RESOLVED)
**Question:** Does Phase 20 need to bootstrap `active.json` / a known-good version, or is that established by an earlier step?
**Answer:** The watcher's normal eligible-activation path (`watcher.mjs:328-345`) already establishes `active.json` by calling `activateCandidate` directly. BUT today no active.json exists on disk, which means either (a) the watcher has never reconciled an eligible candidate in this environment, or (b) the controller isn't running. This is an environment-state gap, not a code gap — the bootstrapping path exists in `watcher.mjs:336`.

**Phase 20 responsibility:** The canary trigger must check `recoverActiveVersion({ownedRoot}).version_id`:
- If a known-good exists → run canary eval (the normal case).
- If NO known-good exists (first-ever activation) → **activate directly via the existing path** (no canary rollback is possible when there's nothing to roll back to). The first activation becomes the known-good. This is the correct behavior: canaries protect *existing* quality; the first activation has no prior quality to protect.
- The watcher integration (Pattern 3) must branch on this: `if (!knownGood) { activation = await activator(...); } else { ...canary eval... }`.

[VERIFIED: `activate.mjs:190-197 recoverActiveVersion` returns `recovery_status: 'blocked', reason_code: 'no_valid_history'` when no versions exist — the canary trigger must treat this as "bootstrap directly."]

## Common Pitfalls

### Pitfall 1: Per-record verdict derivation (the telemetry schema gap)
**What goes wrong:** The D-05 evidence envelope requires a `verdict` field ('success'|'regression') (`evidence.mjs:38`), but `telemetry.jsonl`'s `outcome` field is always `null` (`router.mjs:2378`). There is no per-route success/regression signal in telemetry today.
**Why it happens:** The hook emits telemetry at route-decision time, before the downstream invocation completes — the outcome isn't known yet.
**How to avoid:** For v1, the bridge emits `verdict: 'success'` for every emitted route (the route completed without the hook throwing). Regression is detected by the QUALITY/CONTEXT_BUDGET/LATENCY gates in `assessCalibration` (which runs the calibration corpus against the candidate), NOT by per-record verdicts. This is consistent with the Phase 17 design: canaries evaluate candidates via the fixed calibration corpus + performance measurement, not via per-prompt outcome labels. Document this in the bridge.
**Warning signs:** If the bridge tries to derive verdict from `evolved_after`/`downstream_invocations` (both currently null/absent), it will produce invalid envelopes. Stay with `verdict: 'success'` for v1.

### Pitfall 2: fixture_class derivation rejects valid telemetry
**What goes wrong:** The D-05 `fixture_class` enum (`evidence.mjs:10`) is {minimal-prompt, explicit-override, stale-context, ambiguity, terminal-state, dependency, context-budget}. Telemetry's `confidence_tier` maps cleanly to some (stale→stale-context, user_explicit→explicit-override, deny_filtered→skip) but high/medium/low routes don't have an obvious fixture class.
**Why it happens:** fixture_class was designed for the calibration corpus (fixed prompts with known expected outcomes), not for live telemetry.
**How to avoid:** The bridge must classify carefully. Recommendation: high/medium/low routed prompts → 'minimal-prompt' (the default fixture class for normal prompts). `invoke_kind === 'agent'` → 'dependency'. If a record doesn't fit any class, SKIP it (do not emit an invalid envelope — `validateEvidenceEnvelope` would deny it and the bridge would log noise). The skip is a feature: non-canary-relevant routes (trivial, reentry_skipped, manifest_missing) should not become evidence.
**Warning signs:** A bridge that emits envelopes for `confidence_tier: 'trivial'` or `'reentry_skipped'` — these are non-task prompts and should be skipped.

### Pitfall 3: Privacy guard codes must suppress prompt_signature
**What goes wrong:** If a telemetry record has `guards_fired: ['deny_filtered']` but `prompt_signature` is non-null, `validateEvidenceEnvelope` denies with `privacy_signature_forbidden` (`evidence.mjs:40-42`). The bridge would silently drop the record.
**Why it happens:** The hook already suppresses signatures for deny_filtered (`router.mjs:2365 denyFiltered ? null : promptSignature(...)`), so telemetry records are already clean. But the bridge must not re-introduce a signature for privacy-denied records.
**How to avoid:** Pass `record.prompt_signature` through directly — it's already null when privacy-denied. Do NOT compute a new signature in the bridge.
**Warning signs:** Bridge computing `promptSignature(record.normalizedPrompt, ...)` — that would require access to the raw prompt (privacy violation) and would re-add a signature to a privacy-denied record.

### Pitfall 4: candidate_version is context-dependent, not in telemetry
**What goes wrong:** The D-05 envelope requires `candidate_version` (`evidence.mjs:37`), but telemetry records don't carry the compiled-index version they were served from.
**Why it happens:** The hook doesn't read `active.json` on the hot path (it would violate the <100ms budget and the read-only constraint).
**How to avoid:** The bridge takes `candidate_version` as a PARAMETER (the current candidate version under canary), not from telemetry. For steady-state routes (no canary in flight), use a constant like `'steady-state-v1'`. The bridge is invoked by the trigger surface which knows the candidate context.
**Warning signs:** Bridge reading `active.json` to get candidate_version — that couples the bridge to publication authority and adds I/O. Keep it parameterized.

### Pitfall 5: Insufficient evidence must preserve, not fail
**What goes wrong:** If the watcher calls `evaluateCandidate` with an evidence window where `window.sufficient !== true`, evaluateCandidate rejects with `insufficient_evidence_samples` (`canary-controller.mjs:112`). If the watcher then treats this as an error, it could crash the controller or block activation.
**Why it happens:** evaluateCandidate is strict by design (Phase 17 D-08: 30-sample floor prevents low-volume promotion).
**How to avoid:** The watcher must check `window.sufficient` BEFORE calling evaluateCandidate. If insufficient, preserve (write candidate.json, do not promote) and log `reason_code: 'insufficient_evidence_samples'`. This is the correct behavior — a canary with insufficient evidence should not promote.
**Warning signs:** Watcher calling evaluateCandidate without first checking `window.sufficient`.

### Pitfall 6: Deployed bundle must include evolution/*
**What goes wrong:** If `evolution/*` is not added to `router-lifecycle.mjs:308-321 moduleNames`, the trigger code won't be installed in `~/.claude/router/modules/` and the watcher/controller can't import it.
**Why it happens:** The module bundle list was frozen at Phase 18 and doesn't include evolution modules (they were test-only).
**How to avoid:** Add `evolution/canary-controller.mjs`, `evolution/evidence.mjs`, `evolution/perf-measure.mjs`, `evolution/telemetry-bridge.mjs` to `moduleNames` (line 308-321).
**Warning signs:** Watcher importing `../evolution/canary-controller.mjs` and getting MODULE_NOT_FOUND in production.

## Code Examples

Verified patterns from the existing codebase (no new code invented — these are the primitives Phase 20 wires together):

### evaluateCandidate (the verdict — pure, no I/O)
```typescript
// Source: src/evolution/canary-controller.mjs:91-133 (existing, do not modify)
export function evaluateCandidate({ candidate, evidence_window, gates, known_good_version = null } = {}) {
  // ... validates candidate hash integrity, evidence window fingerprint, sufficiency ...
  if (evidence_window.sufficient !== true) return rejected(candidate, 'insufficient_evidence_samples', known_good_version);
  for (const gate of REQUIRED_GATES) {
    const outcome = gates[gate];
    if (!outcome || outcome.pass !== true) {
      return rejected(candidate, outcome?.reason_code ?? `${gate}_uncertain`, known_good_version, gates);
    }
  }
  return deepFreeze({ status: 'evaluated', candidate_id: candidate.id, promotable: true, ... });
}
```

### applyCanaryDecision (the promote/rollback/preserve brain)
```typescript
// Source: src/evolution/canary-controller.mjs:148-217 (existing, do not modify)
export function applyCanaryDecision({ evaluation, demonstrated_benefit, activation, ownedRoot, known_good_version, published_version, publication = REGISTRY_PUBLICATION } = {}) {
  // ... recovery block check via recoverRollbackJournal + recoverActiveVersion ...
  if (!evaluation.promotable && !published_version) return { status: 'rejected', ... };
  if (!evaluation.promotable) {
    // ROLLBACK branch (lines 175-193): previewRollback → executeRollback to known_good_version
    return { status: 'rolled_back', ... };
  }
  if (demonstrated_benefit.status not in ['demonstrated','safety_correction']) {
    return { status: 'preserved', ... }; // PRESERVE branch
  }
  const activated = publication.activateCandidate(activation); // PROMOTE branch
  return { status: 'promoted', ... };
}
```

### validateEvidenceEnvelope (privacy guard — rejects before persistence)
```typescript
// Source: src/evolution/evidence.mjs:27-46 (existing, do not modify)
export function validateEvidenceEnvelope(input) {
  if (Object.keys(input).some((field) => !FIELDS.has(field))) return deny('forbidden_evidence_field');
  // ... type/enum/bounds validation ...
  const privacyDenied = input.confidence_band === 'deny_filtered'
    || input.guard_codes.some((code) => PRIVACY_GUARDS.has(code));
  if (privacyDenied && input.prompt_signature !== null) return deny('privacy_signature_forbidden');
  return { status: 'accepted', signal: Object.freeze({ ...input, guard_codes: Object.freeze([...input.guard_codes]) }) };
}
```

### assessCalibration (builds 3 of 6 gates)
```typescript
// Source: src/evolution/perf-measure.mjs:79-95 (existing, do not modify)
export function assessCalibration({ evaluation, performance: measured } = {}) {
  const p95Pass = measured?.warm?.p95_ms < 25;
  const maxPass = measured?.warm?.max_ms < 100;
  const latency = { pass: p95Pass && maxPass, reason_code: ... };
  const quality = evaluation?.quality ?? { pass: false, reason_code: 'quality_missing' };
  const context_budget = evaluation?.context_budget ?? { pass: false, reason_code: 'context_budget_missing' };
  return freeze({ pass: quality.pass && context_budget.pass && latency.pass, quality, context_budget, latency });
}
```

### Telemetry append (the source — read-only by the bridge)
```typescript
// Source: ~/.claude/hooks/router.mjs:1643-1648 (existing, do not modify)
export function logTelemetry(entry, telemetryPath = TELEMETRY) {
  const line = `${JSON.stringify(entry)}\n`;
  appendFileSync(telemetryPath, line, { flag: 'a' });
}
// Entry shape (router.mjs:2355-2382): ts, prompt_signature, suggested_mode, suggested_skills,
//   suggested_agents, confidence_tier, invoke_kind, graphify_queried, graph_status, guards_fired,
//   downstream_invocations, outcome, latency_ms, weight_applied, outcomes, evolved_after,
//   surface_status, surface_disabled_count, cwd
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| canary-controller/evidence/perf-measure test-only (Phase 17) | Production trigger wired into watcher/CLI/release (Phase 20) | This phase | EVO-05 closes: telemetry-driven canary promotion + automatic rollback becomes reachable from production. |
| Watcher calls activateCandidate directly (watcher.mjs:336) | Watcher routes eligible activations through evaluateCandidate→applyCanaryDecision | This phase | Promotions now require evidence + all 6 gates; regressions auto-rollback. |
| No persistent evidence store (createEvidenceStore in-memory, test-only) | Disk-backed evidence store under ~/.claude/router/evidence/ | This phase | Evidence survives across watcher restarts; 7d/24h/30-sample enforced on disk. |
| evolution/* absent from deployed bundle (router-lifecycle.mjs:308-321) | evolution/* added to moduleNames | This phase | Trigger code is installed to ~/.claude/router/modules/evolution/. |

**Deprecated/outdated:**
- Calling `activateCandidate` directly from the watcher (bypassing canary eval) — Phase 20 replaces this with canary-gated activation for eligible+recoveryReady candidates (except the bootstrap first-activation case).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `verdict: 'success'` for all emitted routes in v1 (telemetry's `outcome` is null) is acceptable — regression detected by calibration gates, not per-record verdicts. | Pattern 1 / Pitfall 1 | If per-record verdicts are required, the hook must be modified to emit outcomes (out of Phase 20 scope; would touch the hot path). Medium risk — confirm with planner. |
| A2 | `candidate_version` should be a parameter to the bridge (current candidate context), not read from telemetry or active.json. | Pattern 1 / Pitfall 4 | If candidate_version must be per-record, the hook must emit it (hot-path change). Low risk — parameterized bridge is the right design. |
| A3 | The release-runner canary step is OPTIONAL for v1 (keep as logic-validator); the watcher is the primary promotion trigger. | Pattern 5 | If the release runner must promote, additional work to use calibration-corpus evidence as the evidence window is needed. Low risk — watcher-first is the audit's intent. |
| A4 | Project scope identifier for evidence is `config.scope_id` from the watcher controller config, or 'global' when no project is scoped. | Pattern 3 | If a different project_id source is required, the bridge's scope assignment must change. Low risk — config.scope_id is already the project-scoping mechanism. |
| A5 | First-ever activation (no active.json) should bypass canary and activate directly (becoming the known-good). | Runtime State / bootstrapping | If the first activation must also pass canary, there's a chicken-and-egg: no known-good to roll back to, but canary requires evidence which requires routes served from a known-good. The direct-activate bootstrap is the only coherent option. Medium risk — confirm. |
| A6 | `safety` gate can be derived from `report.disposition === 'eligible'` (reconciliation already passed safety). | Pattern 3 / gate construction | If safety must be independently re-evaluated by the canary, a separate safety-gate invocation is needed. Low risk — reconciliation's eligible disposition IS the safety verdict. |
| A7 | `privacy` gate can be derived from evidence (no privacy-denied records in window) + the existing produceActivationVerification privacy gate. | Pattern 3 / gate construction | If privacy needs a fresh subprocess run (like validate.mjs privacy gate), that's additional I/O. Low risk — evidence already enforces privacy. |

## Open Questions (RESOLVED)

1. **Per-record verdict source (A1):** Should the hook emit `outcome` in a future phase (requiring a hot-path change), or is `verdict: 'success'` + gate-based regression detection the permanent design?
   - What we know: Phase 17 D-09/D-10 designed canaries around the fixed calibration corpus + independent gates, not per-prompt outcome labels.
   - What's unclear: Whether the user wants per-prompt outcome telemetry in v1.2 or a future version.
   - Recommendation: v1 uses `verdict: 'success'` + gate-based regression; document as a deliberate design choice, not a limitation.
   - **RESOLVED (Plan 20-01 Task 1):** v1 hardcodes `verdict: 'success'` (Test 4 asserts it). Per-prompt outcome emission is deferred to a future phase if needed — not a v1.2 requirement.

2. **Evidence store compaction:** Should the persistent store compact/prune old records on write, or only filter on window read?
   - What we know: `evidence.mjs:129-131` filters by age on window read (the authoritative gate). The JSONL files will grow unbounded without compaction.
   - What's unclear: At 3.6MB telemetry / 6969 lines, the evidence store will be smaller (only canary-relevant records), but over months it could grow.
   - Recommendation: Read-time filtering is authoritative (keep it). Add optional compaction (rewrite file with only age-eligible records) triggered when file size exceeds a threshold (e.g., 10MB) or on a periodic timer. Not a Phase 20 blocker.
   - **RESOLVED (Plan 20-01 Task 2):** read-time filtering is authoritative and implemented; optional size/periodic compaction is deferred (not a Phase 20 blocker).

3. **Canary trigger cadence:** Should the watcher run canary eval on EVERY eligible reconcile, or only when a NEW candidate differs from the last-evaluated candidate?
   - What we know: The watcher debounces (debounceMs=250, maxLatencyMs=1500, watcher.mjs:34-35). Every reconcile builds a candidate.
   - What's unclear: Whether running assessCalibration (which runs the 7-fixture corpus + measures routes) on every reconcile is too expensive for the controller process.
   - Recommendation: Only run canary eval when the candidate fingerprint differs from the last-promoted/preserved candidate. Cache the last evaluation. assessCalibration runs ~7 routes × 20 measured runs = 140 route invocations — bounded and fast (<1s), but no need to repeat for an identical candidate.
   - **DEFERRED (Plan 20-02 Task 2):** v1 runs canary eval on every eligible reconcile WITHOUT candidate-fingerprint caching. Rationale: assessCalibration is bounded (<1s, 140 route invocations) and the watcher debounces (debounceMs=250, maxLatencyMs=1500), so per-reconcile cost is acceptable for v1. Revisit with a last-evaluated-fingerprint cache if reconcile frequency or assessCalibration cost spikes. This deferral is recorded in Plan 20-02 Task 2 must_haves.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (≥18) | All modules (stdlib runtime) | ✓ | `/Users/guilherme/.hermes/node/bin/node` (per CLAUDE.md) | — |
| `~/.claude/router/telemetry.jsonl` | telemetry-bridge (READ-ONLY) | ✓ | 3.6MB, 6969 lines | If missing/empty, evidence window is insufficient → preserve (no promotion). Safe. |
| `~/.claude/router/active.json` | canary rollback (known_good_version) | ✗ | DOES NOT EXIST | Bootstrap path: first activation bypasses canary, activates directly. |
| `~/.claude/router/versions/` | canary rollback destination | ✗ | DOES NOT EXIST | Created by first activateCandidate. |
| `~/.claude/router/compiled-index/` | hot path loadCompiledIndex | ✗ | DOES NOT EXIST | Created by publishCompiledIndex (watcher.mjs:338-343). Hot path returns non-dispatchable until then. |
| `~/.claude/router/controller/config.json` | watcher canary trigger config | Unknown (controller may not be running) | — | If controller not running, no watcher trigger fires — canary trigger is dormant until controller starts. CLI canary subcommands work without a running controller (they read evidence + active.json directly). |

**Missing dependencies with no fallback:** None — the bootstrap path handles missing active.json.
**Missing dependencies with fallback:** active.json/versions/ — bootstrap-then-canary is the fallback.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node ≥18) |
| Config file | none — `node --test tests/*.test.mjs` |
| Quick run command | `node --test tests/router.evolution-canary.test.mjs tests/router.compiled-evolution.test.mjs` |
| Full suite command | `node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVO-05 | telemetry→evidence transform correctness (field mapping, privacy suppression, fixture classification, skip-non-canary) | unit | `node --test tests/router.telemetry-bridge.test.mjs` | ❌ Wave 0 (new) |
| EVO-05 | persistent evidence store: append + window + 7d retention + 24h decay + 30-sample floor + scope isolation | unit | `node --test tests/router.evidence-persistence.test.mjs` | ❌ Wave 0 (new) |
| EVO-05 | 6 REQUIRED_GATES pass/fail matrix (each gate pass→promotable, each gate fail→rejected with that gate's reason_code) | unit | `node --test tests/router.evolution-canary.test.mjs` (extend) | ✅ exists (extend with gate-matrix tests) |
| EVO-05 | applyCanaryDecision edge coverage: promote / rollback / preserve / recovery_required / insufficient-evidence / privacy-denied | unit | `node --test tests/router.evolution-canary.test.mjs` (extend) | ✅ exists |
| EVO-05 | watcher canary trigger integration: eligible+recoveryReady+sufficient → promote; eligible+insufficient → preserve; eligible+no-known-good → bootstrap-direct | integration | `node --test tests/router.watcher-canary-trigger.test.mjs` | ❌ Wave 0 (new) |
| EVO-05 | CLI canary subcommands: status / promote / rollback (operator paths) | integration | `node --test tests/router.router-control-canary.test.mjs` | ❌ Wave 0 (new) |
| EVO-05 | deployed bundle includes evolution/* (install + import succeeds in production path) | integration | `node --test tests/router.deployed-bundle.test.mjs` (extend) or assert moduleNames includes evolution/* | ❌ Wave 0 (new or extend) |
| EVO-05 | release-runner canary validation (if optional step added): calibration evidence → canary promotion | integration | `node --test tests/router.release-canary.test.mjs` | ❌ Wave 0 (only if Pattern 5 implemented) |
| EVO-05 | privacy invariant: no raw prompt text crosses into evidence (forbidden_evidence_field denial) | unit | `node --test tests/router.telemetry-bridge.test.mjs` (include privacy assertions) | ❌ Wave 0 (new) |

### Edge Coverage Matrix
| Edge | Expected canary outcome | Test assertion |
|------|--------------------------|---------------|
| All 6 gates pass + demonstrated_benefit + sufficient evidence | promoted | `applyCanaryDecision.status === 'promoted'` |
| Any single gate fails (6 cases) + published_version exists | rolled_back | `applyCanaryDecision.status === 'rolled_back'` |
| Any single gate fails + NO published_version | rejected | `applyCanaryDecision.status === 'rejected'` |
| All gates pass + demonstrated_benefit = neutral | preserved | `applyCanaryDecision.status === 'preserved'` |
| All gates pass + demonstrated_benefit = safety_correction | promoted | `applyCanaryDecision.status === 'promoted'` |
| Insufficient evidence (< 30 samples) | preserve (watcher) / rejected (evaluateCandidate) | `evaluateCandidate.promotable === false`, reason_code 'insufficient_evidence_samples' |
| recovery_required (rollback journal invalid / active version corrupt) | recovery_required | `applyCanaryDecision.status === 'recovery_required'` |
| Privacy-denied record in telemetry | skipped by bridge (not stored) OR evidence window rejects | bridge returns `skipped`; validateEvidenceEnvelope denies `privacy_signature_forbidden` if signature present |
| Bootstrap (no active.json, no known-good) | direct activation (no canary) | watcher branch: `if (!knownGood) activator(...)` |

### 6 REQUIRED_GATES Pass/Fail Matrix (canary-controller.mjs:11-13)
| Gate | Source | Pass condition | Fail reason_code |
|------|--------|----------------|------------------|
| safety | reconciliation report | `report.disposition === 'eligible'` | `safety_uncertain` / `safety_regression` |
| privacy | evidence window + privacy gate | no privacy-denied records + privacy gate subprocess passes | `privacy_uncertain` / `privacy_regression` |
| quality | perf-measure evaluateCalibrationCorpus | `evaluation.quality.pass === true` | `quality_regression` |
| context_budget | perf-measure evaluateCalibrationCorpus | `evaluation.context_budget.pass === true` | `context_budget_regression` |
| compatibility | compile-index COMPILED_INDEX_COMPATIBILITY | `compatible(metadata.compatibility)` | `compatibility_uncertain` |
| latency | perf-measure assessCalibration | `measured.warm.p95_ms < 25 && measured.warm.max_ms < 100` | `warm_p95_ceiling_exceeded` / `route_ceiling_exceeded` |

### Telemetry→Evidence Transform Correctness Tests
- Field-by-field mapping: each telemetry field maps to the correct D-05 field with correct transform (ts→timestamp_ms, latency_ms×1000→latency_us, etc.)
- Privacy suppression: deny_filtered record → prompt_signature null in envelope (or skipped)
- fixture_class classification: each confidence_tier maps to the correct fixture_class or is skipped
- Non-canary routes skipped: trivial, reentry_skipped, manifest_missing, no suggested_mode
- Forbidden field rejection: bridge does not emit fields outside FIELDS set; validateEvidenceEnvelope denies

### Evidence Persistence + Retention Tests
- Append: validated envelope persists to correct scoped file (project-{id}.jsonl vs aggregate.jsonl)
- Scope isolation: project A records never appear in project B window; aggregate requires aggregate_eligible
- Retention: records older than 7d excluded from window (inject clock)
- Decay: weighted_samples matches exponential-half-life-v1 formula (24h half-life)
- Floor: window.sufficient === false when sample_count < 30; === true when ≥ 30
- Fingerprint integrity: evidenceWindowFingerprint matches across append+window cycles

### Per-Trigger-Surface Integration Tests
- **Watcher auto:** eligible+recoveryReady+sufficient → evaluateCandidate→applyCanaryDecision→promote; eligible+insufficient → preserve (no activateCandidate call); eligible+no-known-good → bootstrap direct activation
- **CLI operator:** `canary status` prints window + active + last candidate; `canary promote --execute --confirm <id>` runs promote path; `canary rollback` runs rollback to known_good (narrower than existing `rollback` verb)
- **Release-runner (if Pattern 5):** post-calibration canary step uses calibration evidence as window; promotes if gates pass (or skip — keep as logic validator per recommendation)

### Sampling Rate
- **Per task commit:** `node --test tests/router.evolution-canary.test.mjs tests/router.telemetry-bridge.test.mjs tests/router.evidence-persistence.test.mjs`
- **Per wave merge:** `node --test tests/*.test.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/router.telemetry-bridge.test.mjs` — covers telemetry→evidence transform (EVO-05)
- [ ] `tests/router.evidence-persistence.test.mjs` — covers persistent evidence store + retention/decay/floor
- [ ] `tests/router.watcher-canary-trigger.test.mjs` — covers watcher canary integration (promote/preserve/bootstrap)
- [ ] `tests/router.router-control-canary.test.mjs` — covers CLI canary subcommands
- [ ] Extend `tests/router.evolution-canary.test.mjs` — add 6-gate pass/fail matrix + edge coverage
- [ ] Deployed-bundle assertion: `router-lifecycle.mjs moduleNames` includes `evolution/*`
- [ ] Framework install: none (node:test is built-in)

## Security Domain

> security_enforcement is enabled (config.json). ASVS level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in this phase (control-plane internal). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | yes (operator) | CLI canary subcommands require `--execute --confirm <id>` (same pattern as existing `rollback` verb, router-control.mjs:263-266). Operator-initiated mutation gated by exact confirmation. |
| V5 Input Validation | yes | `validateEvidenceEnvelope` (evidence.mjs:27-46) — allowlisted fields, bounded tokens, enum membership, latency bounds, privacy suppression. `telemetry-bridge.mjs` must validate before persistence. `canary-controller.mjs proposeCandidate` (line 54-78) validates candidate fields. |
| V6 Cryptography | yes | SHA-256 for evidence fingerprints + candidate content-addressing (`evidence.mjs:48-50`, `canary-controller.mjs:46-48`). Never hand-roll — use `node:crypto createHash('sha256')`. |
| V7 Error Handling | yes | Fail-open: bridge skips unclassifiable records (does not crash); watcher preserves on insufficient evidence; applyCanaryDecision returns structured status (rejected/recovery_required) not exceptions. |
| V8 Data Protection | yes | Privacy: no raw prompt text in evidence (forbidden_evidence_field denial). Prompt signatures suppressed after privacy denial (evidence.mjs:40-43). Project+aggregate evidence isolated on disk. 7d retention enforced. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Raw prompt text crossing into evidence storage | Information Disclosure | `validateEvidenceEnvelope` allowlists fields BEFORE hashing/persistence (`evidence.mjs:29`); bridge never accesses raw prompts (telemetry already hashed them, `router.mjs:2365`). |
| Privacy-denied record retaining a signature | Information Disclosure | `validateEvidenceEnvelope` denies `privacy_signature_forbidden` when guards_fired includes privacy codes (`evidence.mjs:40-42`). |
| Cross-project evidence contamination | Tampering / Information Disclosure | Separate JSONL files per project_id; `matchesScope` filter (`evidence.mjs:107-110`) enforced on window read. |
| Publication authority mutation outside activate.mjs | Tampering | `applyCanaryDecision` delegates exclusively through `REGISTRY_PUBLICATION` (`canary-controller.mjs:135-141`); trigger surfaces never call `writeFileSync(active.json)` directly. |
| Low-volume promotion (regression on insufficient evidence) | Tampering | 30-sample floor (`evidence.mjs:17`); evaluateCandidate rejects `insufficient_evidence_samples` (`canary-controller.mjs:112`). |
| Stale evidence dominating promotion | Tampering | 24h half-life exponential decay (`evidence.mjs:15`); 7d max retention (`evidence.mjs:16`). |
| Weighted score compensating for a hard-gate failure | Tampering | evaluateCandidate requires ALL 6 gates pass independently (`canary-controller.mjs:115-120`); no weighted compensation. |
| First-activation chicken-and-egg (no known-good to roll back to) | Denial of Service | Bootstrap path: direct activation when `recoverActiveVersion` returns `no_valid_history` (`activate.mjs:194`). |
| TOCTOU on active.json pointer | Tampering | `replaceActivePointer` re-verifies version after acquiring mutation lock + before rename (`activate.mjs:171`). |
| test_mode leaking into production trigger | Elevation of Privilege | Phase 20 adds SEPARATE production wiring; `test_mode` is code-level opt-in only (`activate.mjs:86-87`); production never sets it. |

## Project Constraints (from CLAUDE.md)

The project `.claude/CLAUDE.md` establishes hard constraints that this phase MUST honor:

| Constraint | Source | Phase 20 Compliance |
|------------|--------|---------------------|
| **Zero npm dependencies** | "Any npm dependency at all in v1" → "Stdlib." | Phase 20 adds only stdlib modules. No `npm install`. |
| **<100ms hot path** | "Router hook must return within the UserPromptSubmit timeout and never delay prompt handling beyond ~100ms." | Canary trigger runs in the background control plane (watcher/controller process), NEVER on the hot path. `prompt-route.mjs` is unchanged. |
| **Fail-open** | "On any exception, pass through the original prompt unchanged." | Bridge skips unclassifiable records; watcher preserves on insufficient evidence; canary never blocks the hot path. |
| **Hook read-only w.r.t. user code** | "the hook runs in a subprocess and must not persist edits to the host FS except its own data files" | The hook is unchanged. The bridge writes only to `~/.claude/router/evidence/` (router-owned data dir). |
| **Telemetry privacy — no raw prompt text** | "Never log raw prompt text — hash a normalized prompt" + "No raw prompt text in telemetry.jsonl" | Bridge consumes already-hashed telemetry; `validateEvidenceEnvelope` rejects forbidden fields before persistence. |
| **Fail-closed (non-dispatchable) when compatible compiled state missing** | Phase 17 D-decision: "Missing compatible compiled state is non-dispatchable and never invokes an uncompiled slow path." | Canary does not change this — it promotes/rolls back the compiled index, never falls back to uncompiled routing. |
| **Coexistence** | "Must not break existing ~/.claude/settings.json hook bindings" | Phase 20 adds no hook bindings. It modifies the watcher/CLI/lifecycle module list only. |

## Sources

### Primary (HIGH confidence)
- `src/evolution/canary-controller.mjs` — read directly (217 lines). evaluateCandidate, applyCanaryDecision, REQUIRED_GATES, REGISTRY_PUBLICATION.
- `src/evolution/evidence.mjs` — read directly (155 lines). validateEvidenceEnvelope, createEvidenceStore, evidenceWindowFingerprint, FIELDS, CONFIDENCE_BANDS, FIXTURE_CLASSES, HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES.
- `src/evolution/perf-measure.mjs` — read directly (96 lines). CALIBRATION_CORPUS, evaluateCalibrationCorpus, measureRoutes, assessCalibration.
- `src/registry/activate.mjs` — read directly (249 lines). activateCandidate, previewRollback, executeRollback, recoverActiveVersion, recoverRollbackJournal, trusted (test_mode seam).
- `src/registry/watcher.mjs` — read directly (381 lines). createRegistryReconciler reconcile (lines 284-363), activator injection (line 258), eligible+recoveryReady branch (328-345).
- `src/cli/router-control.mjs` — read directly (285 lines). rollback verb (247-270), parse/usage/canonical patterns.
- `src/release/run-release.mjs` — read directly (261 lines). STAGES (86-94), calibration stage, runRelease.
- `src/lifecycle/router-lifecycle.mjs` — read directly. moduleNames (308-321), paths (154-170), ownedRoot.
- `src/prompt/compile-index.mjs` — grep. COMPILED_INDEX_COMPATIBILITY (lines 7-8: router_contract, policy_version), compatible().
- `~/.claude/hooks/router.mjs` — grep + sed. telemetryEntryFromState (2355-2382), logTelemetry (1643-1647), TELEMETRY path (94).
- `~/.claude/router/` — directory listing. active.json MISSING, versions/ MISSING, telemetry.jsonl 3.6MB/6969 lines, evolution-state.json (mutations_applied: 0).
- `.planning/v1.2-MILESTONE-AUDIT.md` — read directly. BLOCKER 2 (lines 177-180), EVO-05 partial (lines 44-58, 161, 165, 202, 247).
- `.planning/REQUIREMENTS.md` — read directly. EVO-05 (line 52).
- `.planning/STATE.md` — read directly. Phase 17 D-decisions (lines 136-141).
- `.planning/ROADMAP.md` — sed. Phase 17 success criterion #4 (line ~243), Phase 19/20 sections.
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-02-PLAN.md` + `17-02-SUMMARY.md` — read directly. Canary/evidence design intent, D-05/D-06/D-07/D-08/D-09/D-10.
- `.planning/phases/18-autonomous-lifecycle-and-release-gates/18-04-PLAN.md` — grep. test_mode seam contract (T-18-04-SEAM), production-default behavior.
- `tests/router.evolution-canary.test.mjs` — head. Test patterns (validSignal helper, D-05/D-07/D-09 tests).
- `tests/router.compiled-evolution.test.mjs` — head + grep. applyCanaryDecision promote/rollback usage, gate construction from REQUIRED_ACTIVATION_GATES.
- `.claude/CLAUDE.md` — project instructions. Hard constraints (zero-dep, <100ms, fail-open, hook read-only, telemetry privacy).

### Secondary (MEDIUM confidence)
- `~/.claude/hooks/router.evolve.mjs` — grep + head. Trigger/lock/telemetry-read pattern reference (separate weights-evolution subsystem, NOT canary).

### Tertiary (LOW confidence)
- None — all claims verified against the live codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, verified against CLAUDE.md + existing modules.
- Architecture (bridge + persistent store + 3 trigger surfaces): HIGH — all primitives verified in codebase; design is composition of existing tested modules.
- Pitfalls: HIGH — derived from verified schema mismatch (telemetry vs D-05) and confirmed missing active.json.
- Phase 19 independence: HIGH — verified canary-controller imports only activate.mjs + evidence.mjs (no orchestrator dependency).
- Gate construction: MEDIUM — the 6-gate assembly is derived from perf-measure + reconcile + compile-index, but the exact wiring of safety/privacy gates from reconciliation/evidence is a design recommendation (A6/A7) to confirm with planner.

**Research date:** 2026-07-17
**Valid until:** 2026-08-16 (30 days — stable internal codebase, no external dependencies)