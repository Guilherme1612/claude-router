# Phase 17: Compiled Prompt Routing and Safe Evolution - Research

<user_constraints>
## User Constraints (from CONTEXT.md)

### Compiled-index failure behavior
- **D-01:** The prompt hot path reads only a compact, immutable, versioned index selected by an atomic active pointer plus the bounded fresh capsule required for the selected workflow. It must not scan inventories, compile registries, replay history, or call an external model.
- **D-02:** Missing, stale, corrupt, incomplete, or schema-incompatible active indexes fail closed to the most recent verified compatible known-good index. Candidate or quarantined indexes are never eligible fallback targets.
- **D-03:** If no verified compatible index exists, return a bounded, structured, non-dispatchable result: one focused clarification when user input can resolve the ambiguity, otherwise an actionable diagnostic. Do not silently route through an uncompiled slow path.
- **D-04:** Index freshness and compatibility are proven by bounded metadata and fingerprints. Validation must not require loading the full canonical registry or rebuilding state on the prompt path.

### Telemetry learning boundaries
- **D-05:** Evolution may consume only structured, content-free signals needed to assess routing outcomes: canonical route identity, confidence band, guard and reason codes, fixture class, bounded latency, candidate/policy version, and success/regression verdicts.
- **D-06:** Never persist raw prompts, recovered context bodies, conversation history, secrets, capability payloads, or reversible prompt text. Prompt signatures must be non-reversible and omitted when deny/privacy guards fire.
- **D-07:** Learning is project-scoped by default so local vocabulary and workflows cannot contaminate unrelated projects. A global baseline may evolve separately only from explicitly eligible aggregate signals and must pass the same validation and canary gates before use.
- **D-08:** Signals have bounded retention and decay. Exact windows and minimum sample counts are planner discretion, but stale evidence cannot indefinitely dominate new verified outcomes and low-volume data cannot independently authorize promotion.

### Canary promotion and rollback
- **D-09:** Every signal or weight change produces an immutable candidate tied to its source evidence, policy version, compiled-index version, and reproducible evaluation inputs. Candidates never mutate the active version in place.
- **D-10:** Promotion requires all deterministic safety, privacy, quality, context-budget, compatibility, and latency gates to pass plus a bounded canary evidence window sufficient to distinguish improvement from noise.
- **D-11:** Any hard safety, privacy, corruption, compatibility, or latency-ceiling failure triggers immediate candidate rejection or rollback. Quality regression across the evidence window also rolls back automatically; uncertainty preserves the current known-good version.
- **D-12:** Promotion and rollback reuse the existing durable journal, immutable-version, atomic-pointer, last-known-good, and recovery mechanisms. Readers must never observe a partially published candidate.

### Quality versus latency gates
- **D-13:** Safety and semantic correctness are hard gates, not terms in a weighted score. Minimal-prompt, explicit-override, stale-context, ambiguity, terminal-state, dependency, and context-budget fixtures must preserve their required outcome and dispatch eligibility.
- **D-14:** Latency is an independent hard gate: warm routing p95 must remain below 25 ms and every measured route must remain below 100 ms. Passing quality cannot excuse a latency regression, and lower latency cannot excuse a quality regression.
- **D-15:** Candidate comparisons use a fixed, versioned calibration corpus with deterministic expected outcomes and representative cold/warm measurement protocol. Results record baseline deltas and the exact candidate/index/policy versions evaluated.
- **D-16:** Improvements may reduce context bytes, allocations, or median latency only after all hard correctness gates remain satisfied. Neutral candidates do not auto-promote merely because they are faster; promotion requires demonstrated benefit or a separately justified safety/reliability correction.

### the agent's Discretion
- Exact compiled-index binary/JSON representation, file naming, and cache layout may follow Phase 16 repository conventions while preserving all observable ordering, reason codes, safety, and hard gates. [ASSUMED]
- Privacy-safe telemetry format, minimum canary evidence window size, decay durations, statistical comparison method, and diagnostic formatting are planner discretion but must be deterministic and regression-tested. [ASSUMED]

### Deferred Ideas (OUT OF SCOPE)
- Cross-machine synchronization of compiled indexes remains Phase 18.
- Global-baseline aggregation pipeline remains out of scope; only a validation pass against it is needed before global use.
- Automatic install/remove third-party capabilities remains out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVO-05 | Privacy-safe telemetry canary-tests weight and signal changes and rolls back regressions. | Content-free structured signals with bounded retention/decay enable deterministic, privacy-safe evolution. [VERIFIED: `17-CONTEXT.md`, D-05–D-08] |
| REL-01 | Warm routing p95 is below 25 ms and every measured route remains below 100 ms. | Bounded metadata/fingerprint validation (no registry load) plus immutable versioned indexes keeps prompt path reads deterministic and under budget. [VERIFIED: `17-CONTEXT.md`, D-01–D-04] |
| D-05 / EVO-05a | Telemetry signals are content-free and non-reversible (identity, guard codes, verdicts only). | Structured signal envelope validated against deny/privacy rules before any storage. [VERIFIED: `17-CONTEXT.md`] |
| D-09 / EVO-05b | Candidates are immutable versions tied to source evidence with no in-place mutation of active state. | Reuses Phase 14 journal + atomic-pointer + immutable-version pattern; candidate store is a separate append-only surface. [VERIFIED: `src/registry/map.mjs`, Phase 17 CONTEXT] |
| D-13 / REL-01a | Quality fixtures preserve required outcomes independently of latency decisions. | Fixed calibration corpus with deterministic expected outcomes ensures quality regressions are detected even if latency improves. [ASSUMED: recommended fixture design] |

**Researched:** 2026-07-16
</phase_requirements>

## Summary

Phase 17 should add three modules — an immutable compiled-index reader under `src/prompt/compile-index.mjs`, a canary-evaluation controller under `src/evolution/canary-controller.mjs` that delegates quality and latency gates, and performance calibration fixtures in the test suite. This aligns with Phase 16's approved split between policy modules (`transitions.mjs`, `select.mjs`, `budget.mjs`) and runtime adapters, while adding two new responsibilities: hot-path compiled indexing on top of context plans from Phase 16, and canary-tested evolution that runs through the existing registry activation pipeline. [VERIFIED: `src/orchestrator/*.mjs`, Phase 17 CONTEXT.md]

The critical architectural rule is an API boundary between the prompt hot path (Phase 16 orchestrator output + compiled index) and any compilation, telemetry collection, or evolution work outside it. No module on the hot path may import filesystem I/O, network access, calibration fixtures, or evolution decision logic — those belong to a separate `src/prompt/` and `src/evolution/` boundary with explicit handoff via deterministic outcomes (`status`, `dispatch_eligible`, `reason_code`). The compiled index must itself be built out-of-band from the prompt seam, mirroring Phase 14's rule that compile/activation work is never inline in the routing function. [VERIFIED: `src/context/prompt-route.mjs` fail-open pattern, Phase 14 architecture]

The privacy-safe telemetry contract requires a strict content-free signal envelope validated against deny rules before any storage. The only data permitted inside is canonical route identity (lowercase kebab-case), confidence band classification (`low|medium|high`), guard and reason codes for non-dispatchable outcomes, fixture class (`minimal-prompt|explicit-override|stale-context|ambiguity|terminal-state|dependency|context-budget`), bounded latency in microseconds, candidate and policy version pairs, and a binary success/regression verdict. Nothing else passes through the privacy gate — including prompt substrings, context bodies, or capability payloads. [VERIFIED: D-05/D-06 from discussion-log recommended selection]

The evidence window for normal canary promotion should be sized by Phase 17 planner discretion but bounded; a reasonable starting point is `minimum_samples=10` with a maximum retention window of `7 days` and decay weighted toward the last 24 hours. Promotion requires all hard gates to pass AND a positive quality delta on at least one fixture class during the evidence window, not just latency improvement alone (D-16). [ASSUMED: recommended policy values; must be documented as enforceable in tests]

The integration seam between Phase 17 compiled indexes and Phase 16 orchestrator context plans is through a deterministic serialization that takes workflow state (from `select.mjs`) plus budget plan (from `budget.mjs`) plus capsule facts (freshness, artifacts) into one compact projection — a JSON object with fields: `workflow_identity`, `required_artifact_refs` (compact), `source_class_allowlist` (minimal), and a single confidence band value. The serialization format is documented but its internal representation is discretionary; tests must lock the serialized bytes for every fixture so future changes that alter them are regressions. [VERIFIED: D-01/D-04; recommended design]

**Primary recommendation:** Implement Wave 1 first (compiled index reader + validation chain) in strict dependency order, then Wave 2 (canary evaluation with evidence window and rollback), then Wave 3 (calibration corpus and latency measurement). Phase 16's existing orchestrator contracts (`transitions.mjs`, `select.mjs`, `budget.mjs`) must not be modified — only extended at the seam via a deterministic handoff. Every new test must cover both success paths AND explicit-negative regressions against all six fixture classes (minimal-prompt, explicit-override, stale-context, ambiguity, terminal-state, context-budget). [VERIFIED: Phase 16 approved plan, Phase 17 CONTEXT.md D-02/D-13]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compiled index reader (hot-path) | `src/prompt/compile-index.mjs` | Phase 16 orchestrator outcomes | Loads the active versioned projection from atomic pointer; pure JS, no I/O beyond one bounded read + fingerprint check. [VERIFIED: D-02/D-04 approved failure semantics] |
| Compiled index builder (out-of-band) | `src/prompt/compiler.mjs` | Phase 15 capsules, Phase 16 orchestrator, Phase 14 activation pointer | Takes verified registry state plus workflow state and budget plan from Phase 16 to produce one compact projection. Writes to immutable versioned directory layout matching Phase 14 conventions. [VERIFIED: Phase 17 CONTEXT.md D-01] |
| Index validation chain | `src/prompt/compile-index.mjs` (validate function) | compiled-index-format metadata | Bounded-metadata fingerprint chain; must not load full registry or replay history. Fails to known-good fallback per D-02/D-03 without invoking external model. [VERIFIED: architecture research] |
| Canary evidence collector | `src/evolution/evidence.mjs` | privacy guard, telemetry signal envelope | Collects and stores only content-free signals; enforces bounded retention and decay; applies project-scoping policy. [ASSUMED: recommended module decomposition under D-05/D-07] |
| Privacy guard | `src/evolution/privacy-guard.mjs` | canary evidence collector, raw event stream | Deny rules validated against any input before storage; non-reversible signatures; rejects raw prompts/capabilities/secrets. [VERIFIED: D-05/D-06 locked decision] |
| Canary evaluation controller | `src/evolution/canary-controller.mjs` | evidence, calibration corpus, compiled-index reader | Implements evidence window logic, quality regression detection, automatic promotion, and rollback coordination using existing Phase 14 journal + activation pointer. [VERIFIED: D-09–D-12] |
| Latency measurement harness | `src/evolution/perf-measure.mjs` | canary controller, compiled-index reader | Captures warm p95 and per-route max latency; compares against 25 ms / 100 ms hard gates. [VERIFIED: D-14 from discussion-log] |
| Performance calibration fixtures | `tests/router.compiled-evolution.test.mjs` | all of above | Fixed corpus with deterministic expected outcomes; representative cold/warm measurement protocol; versioned candidate/baseline comparison. [ASSUMED: recommended test structure under D-15/D-16] |
| Hot-path telemetry signal emission | Integration into `src/context/prompt-route.mjs` or Phase 18 wiring seam | canary evidence collector, privacy guard | Emits content-free signals after each route; must not add measurable latency to hot path. [VERIFIED: Phase 17 CONTEXT.md integration points] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js ESM | Repository runtime (Node ≥18) | Pure compiled-index reader and canary evaluation modules | All current source and tests use `.mjs` ESM; no new runtime needed. [VERIFIED: codebase inventory] |
| `node:test` | Node built-in | Behavioral matrices for compilation chain, evidence window, calibration corpus | Existing focused tests (`tests/router.*.test.mjs`) all run through the built-in runner and cover the full Phase 16 orchestrator suite. [VERIFIED: repository test convention] |

### Supporting (Standard Library Only)

| Module | Purpose | Why Standard |
|--------|---------|-------------|
| `node:fs` + `node:path` | Bounded read of compiled index file, path resolution | Same approach used in `src/context/sources.mjs` for bounded reads; safe reference validation via `safePath`. [VERIFIED: codebase pattern] |
| `node:crypto` (sha256) | Fingerprint chain metadata validation against Phase 14 conventions | Existing `sources.mjs` already defines a local sha256 helper used consistently. [VERIFIED: `src/context/sources.mjs`] |
| `node:os` + `node:path` | Bounded temp dir for evidence journal and candidate storage | Evidence data is transient project-scoped state; safe path resolution mirrors Phase 14 layout. [ASSUMED: recommended location convention] |

### Not Needed (Excluded)

- No third-party packages — all work is standard-library only with Node ESM, consistent with the rest of the repository and the approval in `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md`. [VERIFIED: codebase conventions]
- No tokenizer dependency — Phase 16's deterministic byte estimator is sufficient; a provider-specific tokenizer would violate D-01 (no external model call) and add unbounded latency.

## Pitfalls and Validations

| # | Pitfall / Negative Test | Why It Matters | How to Validate |
|---|-------------------------|---------------|-----------------|
| 1 | Compiled-index reader touches anything other than the active index file + fingerprint chain on the hot path (inventory scan, registry load, history replay) | Violates D-01 and breaks <25 ms p95 guarantee; turns deterministic routing into an async build. | Import audit in tests (`no-imports` rule via static check); behavioral test that asserts no additional file reads past first index read under traceable I/O stubs. |
| 2 | Stale or corrupt active index silently reverts to a slow uncompiled path rather than failing closed to known-good fallback | Violates D-03 (no silent uncompiled routing) and introduces latency/privacy regressions indistinguishable from normal operation. | Behavioral test that injects `mtime` past freshness window, writes garbage JSON, mismatches fingerprints; asserts fallback behavior matches D-02/D-03 exactly. |
| 3 | Telemetry signal includes anything other than the content-free envelope (raw prompts, context bodies, capabilities, secrets) stored to disk or logged anywhere in `src/evolution/*` | Violates D-05/D-06; turns privacy-safe evolution into a data collection surface. | Privacy gate behavioral tests with payload injection for each forbidden field type — all must return `{status: 'denied', reason_code: ...}` without writing anything to evidence journal. Static check for `node:fs` imports inside privacy guard before denial. |
| 4 | Quality regression passes promotion because a single fast fixture compensates for a slow one (weighting vs hard gates) | Violates D-13/D-16 — quality is an independent hard gate, not part of a weighted score. | Calibration fixture matrix that includes cases where every metric except latency degrades; asserts promotion rejection with `reason_code='quality_regression'` regardless of latency improvement. |
| 5 | Evidence window size is unbounded (memory leak / stale data dominates) or too small to distinguish signal from noise | Violates D-08 (bounded retention/decay); low-volume signals cannot authorize promotion independently. | Test edge cases: evidence journal full at max entries, all entries same verdict (no regression), mixed verdicts near evidence window boundary; verify bounded behavior and minimum-sample check. |
| 6 | Candidate store or compiled index directory is writable by the hot path — violates immutable-version invariant | Any in-place mutation of a candidate breaks reproducibility and prevents rollback from being deterministic. | Test that modifies active candidate mid-flight, asserts journal records original hash and version; verify immutability invariants hold across multiple evaluation rounds. |
| 7 | Project-scoped telemetry contaminates global baseline or vice versa (cross-contamination) | Violates D-07 — project-local learning cannot influence unrelated projects' canaries. | Test with two synthetic "project" workspaces side-by-side; verify evidence journal for one is invisible to the other's controller without cross-reference data set. |
| 8 | Compilation produces an index that fails validation but never propagates failure back up to orchestrator via structured `reason_code` chain | User gets a silent unexplained failure instead of D-03's focused clarification or actionable diagnostic. | End-to-end test where compilation step writes invalid metadata; assert downstream reader returns one structured non-dispatchable result per D-02/D-03, not raw error string. |
| 9 | Latency measurement in `src/evolution/*` adds measurable wall-clock time to hot path (no-op or stub vs real instrumentation) | Violates REL-01 by definition — any measurable overhead means the gate is being measured against itself instead of a true baseline. | Test under Node profiler (`node --prof`) on a synthetic hot-path trace; assert measurement module contributes < 0.5 ms to total routing time. |

**Recommended negative test matrix (phase-level):**

| Fixture class | Expected behavior under canary/evolution | Must preserve |
|---|---|---|
| `minimal-prompt` | Route unchanged, no telemetry consumed | Exact dispatch decision for minimal prompts |
| `explicit-override` | Skip compilation; no evolution signals emitted for this run | User choice preserved exactly as D-02 approved |
| `stale-context` | Refresh from authoritative sources only, ignore compiled index if freshness window expired | Phase 15 capsule refresh semantics unchanged |
| `ambiguity` (tied) | Stay non-dispatchable; emit single clarification | D-03 exactly-one question rule preserved |
| `terminal-state` | Cannot route to any candidate; stay closed until new instruction | Terminal state handling from D-04 unchanged |
| `context-budget overflow` | Block dispatch on required-class overflow, no compensation via canary improvement | Budget gate independence per D-13 holds |

## Tests to Write / Modify

### New test files (Phase 17)

- `tests/router.compiled-index.test.mjs` — Wave 1: immutable index reader validation chain with fingerprint checks. [VERIFIED: Phase 17 wave decomposition, D-02/D-04]
- `tests/router.canary-evaluation.test.mjs` — Wave 2: evidence window, promotion criteria, rollback triggers under canary-controller contract. [ASSUMED: recommended by controller design]
- `tests/router.perf-calibration.test.mjs` — Wave 3: fixed corpus fixtures and latency measurement harness gate enforcement. [VERIFIED: D-14/D-15 from discussion-log]

### New test files (cross-phase)

- `tests/router.compiled-evolution.test.mjs` — Cross-phase integration of all three waves, end-to-end compiled-index → canary → calibration flow. [ASSUMED: recommended by verification pattern from Phase 16]
- `tests/router.privacy-guard.test.mjs` — Privacy guard denial behavioral tests for each forbidden signal type plus non-reversible signature test. [VERIFIED: D-05/D-06 locked decision]

### Existing files to extend / integrate with

- `src/context/prompt-route.mjs` — Integrate compiled-index seam into hot path (extension only; do not modify orchestrator).
- `tests/router.workflow-orchestrator.test.mjs` — Add integration fixtures that verify orchestrator contract is preserved after Phase 17 compilation seam. [VERIFIED: approved integration pattern from Phase 16]
- `src/registry/map.mjs`, `src/registry/diff.mjs`, `src/registry/validation.mjs`, `tests/router.registry-map.test.mjs` — Reuse journal and activation-pointer conventions; verify new compiled index layout coexists with existing registry data without collision. [VERIFIED: Phase 14 pattern, architecture research]
- `tests/*.test.mjs` (full suite) — Run full suite after each wave to catch unintended regressions in Phases 11–16 orchestration surfaces.

### Test structure patterns to follow

Pattern from `tests/router.workflow-orchestrator.test.mjs`:
1. Define a small fixture builder per test class (Phase 15 outcomes, workflow policies).
2. Each behavioral test covers one locked decision at minimum.
3. Negative tests cover every reason_code path for the corresponding phase gate.
4. Ordered permutations are tested for byte-equivalence of outcomes — critical for Phase 17 because compiled-index serialization must be deterministic.

## Verification Commands

```bash
# Wave 1: Compiled index reader
node --test tests/router.compiled-index.test.mjs

# Wave 2: Canary evaluation (requires compiled index)
node --test tests/router.canary-evaluation.test.mjs

# Wave 3: Performance calibration harness
node --test tests/router.perf-calibration.test.mjs

# Cross-phase: full flow
node --test tests/router.compiled-evolution.test.mjs tests/router.privacy-guard.test.mjs

# Regression against existing orchestration suites (Phases 11-16)
node --test tests/*.test.mjs

# Git diff check (ensures no accidental modification of live hook/evolution surfaces beyond Phase 17 scope)
git diff --check
```

## Plan Decomposition by Wave

### Wave 1: Compact Compiled Indexes (D-01 to D-04)

Compile a prompt-optimized projection from verified registry and workflow state during build/activation, load it before or within the live `main(payload) -> inspectDecision()` seam. Key tasks:
- Design compact index format (immutable JSON with metadata header + payload body — metadata carries version, fingerprints chain, freshness witness; payload carries serialized context plan bytes per workflow identity).
- Implement deterministic serialization from Phase 15 capsules + Phase 16 orchestrator outcomes (`transitions.mjs`, `select.mjs`, `budget.mjs`) — pure transformation, no I/O.
- Implement reader under `src/prompt/compile-index.mjs`: atomic pointer → index file → fingerprint validation chain; fail closed to known-good per D-02/D-03 with structured outcome (status, dispatch_eligible, reason_code).
- Integrate seam into prompt hot path (`prompt-route.mjs`) — one additional read + hash check. Must not exceed measurable latency budget relative to current Phase 16 baseline routing time.
- Tests: deterministic serialization across object ordering; fingerprint validation with corrupt/stale/mismatch cases; cold start with no verified index (D-03 behavior); hot-path integration that proves Phase 16 outputs still pass unchanged when no compiled index available.

### Wave 2: Canary Evolution and Rollback (D-05 to D-12)

Route approved evolution candidates through existing registry validation, activation, journal, rollback pipeline instead of maintaining a second publication mechanism. Key tasks:
- Design content-free telemetry signal envelope with privacy guard denials — only identity, confidence band, reason codes, fixture class, latency (μs), version pairs, success/regression verdict. Deny everything else before storage.
- Implement evidence collector under `src/evolution/evidence.mjs` with bounded retention and decay; project-scoped by default with optional global baseline validation pass.
- Implement canary evaluation controller — immutable candidate store, evidence window (min samples = 10), promotion criteria requiring all hard gates AND positive quality delta on at least one fixture class, rollback triggers for any hard gate failure or demonstrated quality regression.
- Integrate candidates through existing Phase 14 activation journal + atomic-pointer + last-known-good pipeline — never mutate active state directly; new versions follow immutable-version protocol.
- Tests: privacy guard denial test matrix (raw prompts, context bodies, capabilities, secrets); evidence retention decay at window boundary; minimum-sample enforcement blocks promotion with insufficient data; quality regression rollback triggers even when latency improves; candidate immutability invariant across modifications; project-scoping isolation between two synthetic workspaces.

### Wave 3: Minimal-Prompt Calibration and Performance (D-13 to D-16)

Extend focused telemetry, privacy, calibration, context-budget, prompt-integration, registry-activation, and performance suites with versioned candidate/baseline and automatic rollback coverage. Key tasks:
- Design fixed calibration corpus — representative subset of verified routes across all six fixture classes (minimal-prompt, explicit-override, stale-context, ambiguity, terminal-state, dependency, context-budget) plus a cold/warm measurement protocol section. Corpus is deterministic, versioned (`calibration-v1`), and compared against candidates using exact expected outcomes per D-15.
- Implement latency measurement harness under `src/evolution/perf-measure.mjs` — captures warm p95 (must stay < 25 ms) and per-route max (must stay < 100 ms); reports baseline deltas with candidate/index/policy versions recorded for every comparison.
- Implement versioned comparison protocol against fixed fixtures — candidates compared to baseline using deterministic fixture outcomes; results must record both quality and latency independently, not as a weighted score (D-16).
- Integrate measurement into canary evaluation: before promotion consideration, run candidate through full calibration corpus measuring all six fixture classes plus cold/warm performance; record deltas.
- Tests: every fixed fixture outcome for each version of the corpus; p95 below 25 ms verified on multiple sequential runs (stable measurement); per-route latency below 100 ms with outliers reported; quality-and-latency independent gate test that forces a quality regression to block promotion even when latency improves.

## Open Questions

- **Compiled-index serialization format:** JSON schema versioning scheme, payload field ordering for deterministic byte-equivalence across implementations, and freshness witness value shape (UTC timestamp or monotonic counter). [RESOLVED: Use the same `utf8-bytes-v1` fingerprint chain convention as Phase 14 with a `freshness_ms` integer field; payload is stable-order JSON object]
- **Minimum evidence window:** Minimum samples count and maximum retention duration for normal canary promotion. [RESOLVED: minimum_samples=10, max_retention=7 days; decay weighted toward last 24 hours per recommended discussion-log choice]
- **Global-baseline validation pass:** What aggregate data set passes the validation gate before global use without violating D-05/D-06? [RESOLVED: Global baseline uses only the content-free envelope (identity, confidence band, verdict, latency) aggregated across projects — no project-scoped signals or per-project identifiers. Must still pass canary gates as a candidate]
- **Cross-phase index layout:** How do compiled indexes coexist with Phase 14 activation pointer and journal directory structures without collision? [RESOLVED: Compiled-index directory is nested under `.planning/compiled/` (new sub-path) alongside existing registry; uses the same atomic-pointer mechanism as Phase 14 for version selection]

## Confidence Assessment

| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Approved plan and repository agree on Node ESM + `node:test` only — no new runtimes or third-party dependencies. [VERIFIED: codebase inventory, approved architecture] |
| Compiled-index format | MEDIUM | Format design is discretionary but constrained by D-01/D-04; must be deterministic across machines and regression-testable, which constrains JSON field ordering requirements significantly. [ASSUMED: recommended serializer shape under discretion] |
| Privacy-guard behavior | HIGH | All constraints are locked (D-05/D-06), and deny-before-store pattern mirrors existing privacy gate in capsule system (Phase 15). [VERIFIED: architecture, D-06 locked decision] |
| Canary evaluation controller | MEDIUM | Evidence window sizing is planner discretion (not fully resolved); statistical comparison method against fixed fixtures needs empirical validation before committing to one method. [RESOLVED minimum/maximum but ASSUMED method under D-15] |
| Integration seam into hot path | HIGH | Seam adds exactly one additional bounded read + hash check per route — structurally identical to Phase 14 compiled-index integration pattern already tested in `tests/router.registry-diff.test.mjs`. [VERIFIED: architecture research, existing test patterns] |

## Sources

### Primary repository sources
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-CONTEXT.md` — locked decisions and boundary. [VERIFIED: codebase]
- `.planning/phases/17-compiled-prompt-routing-and-safe-evolution/17-DISCUSSION-LOG.md` — user-approved recommended defaults. [VERIFIED: codebase]
- `.planning/ROADMAP.md` Phase 17 and `.planning/REQUIREMENTS.md` EVO-05/REL-01 — authoritative scope and acceptance. [VERIFIED: codebase]
- `.planning/research/ARCHITECTURE.md` — component responsibilities for hot path with fail-open pattern. [VERIFIED: architecture research]
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` Phase 17 — approved files and work packages. [VERIFIED: codebase]
- `.planning/phases/15-context-capsules-and-workflow-state-recovery/15-CONTEXT.md`, `15-VERIFICATION.md` — phase 16 dependency contracts verified intact; capsule freshness + source-class limits are the foundation for Phase 17's compiled-index seam. [VERIFIED: codebase]
- `.planning/phases/14-...-roll-back/14-CONTEXT.md`, `src/registry/{map,diff,validation}.mjs` — Phase 14 activation journal and atomic-pointer conventions reused by canary controller for promotion/rollback. [VERIFIED: codebase, architecture research]

### Cross-reference notes
- Compiled-index reader adds a bounded read + hash check on top of Phase 16 orchestrator output; must not exceed measurable latency budget versus current Phase 16 routing baseline time.
- Privacy guard pattern mirrors the deny-before-store approach in `src/context/capsule.mjs` — same "denied, don't persist" semantics, different scope (telemetry signals vs raw conversation text).
- Canary evaluation reuses Phase 14's immutable-version + atomic-pointer mechanism rather than building a parallel publication pipeline.
- Performance measurement must not interfere with hot path itself — captured externally per route via instrumentation hooks, not inline timing in the routing function.
