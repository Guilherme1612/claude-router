# Project Research Summary

**Project:** Router v1.8 Adaptive Semantic Routing and Continuity  
**Domain:** Local-first semantic capability routing, evidence-backed continuity, and dual-runtime lifecycle assurance  
**Researched:** 2026-08-09  
**Confidence:** HIGH

## Executive Summary

Router v1.8 is an incremental extension of the shipped zero-dependency Claude Code/Codex router. Its purpose is to infer a bounded semantic intent, resolve that intent into generic workflow roles, choose the least sufficient eligible set of capabilities available in the current runtime, and prove through native invocation receipts and verification evidence that the selected workflow actually completed. It also adds a compact returning-project digest—last verified result, current authoritative state, and one likely next action—with automatic continuation only under an existing valid autonomy lease.

The recommended implementation is to enrich the existing canonical registry, classifier, workflow declarations, semantic resolver, selector, immutable release tuple, router decision path, receipts, startup pointer, and lifecycle gate. Keep Node.js ESM, versioned canonical JSON, `node:test`, and standard-library APIs; add no dependency, database, daemon, embeddings model, network service, framework, or parallel semantic router. Discovery, inference, graph compilation, continuity reduction, learning, and evaluation stay off the prompt/startup path. Runtime consumers read only bounded, hash-verified, atomically published projections built independently from each runtime's local inventory.

The dominant risks are semantic behavior that is still lexical, accidental coupling to the maintainer's installation, unsafe or excessive composition, authority widening, stale cross-project continuity, and release claims based only on fixtures. Prevent them with anonymous portable fixtures, typed classification of every discovered record, strict eligibility before ranking, union-of-effects policy checks, one production decision owner, independent—not composite—quality gates, and final installed host-native evidence for both Claude and Codex. Numeric thresholds must come from matched v1.7 baseline measurements during planning rather than being invented now.

## Key Findings

### Recommended Stack

No stack phase or package installation is needed. v1.8 is a schema, policy, fixture, and lifecycle extension using the repository's existing architecture.

**Core technologies:**

- **Node.js ESM (current LTS):** Runtime, builders, installer, and evaluation; the checkout was verified on Node `v22.22.3`, but that patch version must not become product truth.
- **Versioned canonical JSON/JSONL:** Contracts, workflows, fixtures, projections, receipts, and reports; deterministic, portable, hashable, and compatible with existing atomic publication.
- **`node:test` and `node:assert/strict`:** Contract, safety, parity, lifecycle, and regression gates without package management.
- **Node standard library:** `node:fs`, `path`, `url`, `os`, `crypto`, `perf_hooks`, and `child_process` already cover isolated homes, fingerprints, atomic writes, latency measurement, and native smoke checks.

Critical stack constraints are absolute unless a measured requirement proves the existing platform insufficient: no TypeScript/schema framework, LLM or embeddings retrieval, vector/database layer, benchmark framework, browser harness, container requirement, SDK execution path, telemetry service, second watcher, or second router.

### Expected Features

**Must have (table stakes):**

- **Complete typed runtime-local coverage:** Every discovered Claude or Codex record has valid identity, provenance, availability, semantic/effect metadata, freshness, and one deterministic classification; unknown authority, effects, dependencies, or risk remain non-dispatchable.
- **Bounded structured intent:** Derive goal, subjects, operations, constraints, evidence needs, execution signal, and confidence while preserving negation, quotation, explanation, prohibition, ambiguity, and hypothetical language as non-execution boundaries.
- **Workflow-first eligibility:** Resolve generic semantic roles, then hard-filter candidates by runtime, scope, availability, dependencies, compatibility, freshness, authority, risk, and effects before ranking.
- **Least-sufficient composition:** Prefer one capability when sufficient; otherwise choose the smallest compatible role-covering set, collapse redundancy, enforce ordering/conflicts/exclusivity, and apply fixed candidate, context, composition, and tool-call caps.
- **Safe fallback:** Clarify, recommend, or use a safe native action when no eligible set exists; never fabricate a locator, bridge runtimes, or silently choose a stronger-risk substitute.
- **Runtime-local native projection:** Share semantics and workflow contracts while preserving separate Claude/Codex inventories, locators, counts, and host mechanics.
- **Behavioral proof:** Link structured intent, selected workflow, eligible set, actual host-native invocation, lease/authority decision, completion evidence, required verification, and terminal outcome.
- **Truthful continuity and lease-bound resume:** Show a bounded project-bound last/current/next digest only from verified fresh evidence; remain silent for first visits or meaningless/acknowledged state; resume only under a matching valid lease.
- **Independent evaluation:** Gate correctness, safety, coverage, false positives/negatives, latency, artifact/context bytes, tool calls, receipts, verification, parity, and lifecycle independently. No composite score may offset a mandatory regression.
- **Hot-path preservation:** No discovery, scanning, hashing sweeps, learning, network, LLM, receipt-log traversal, or mutable compilation on prompt/startup paths.

**Should have (differentiators):**

- Semantic equivalence across renamed, private, and unknown installations.
- Explainable per-dimension candidate acceptance and rejection.
- Scoped preference overlays keyed by semantic identity, used only after eligibility.
- Alias-safe preference continuity with inert warnings for ambiguity.
- Deterministic continuity without transcript replay or free-form startup planning.
- Behavioral parity across runtimes without byte-identical inventories.

**Defer beyond v1.8:**

- Additional runtime adapters and unsupported-host execution.
- Rich dashboards, remote telemetry, shared/remote learning, and hosted corpora.
- Automatic installation or repair of third-party capabilities.
- Free-form startup planning or open-ended automatic resume.
- New storage, routing, orchestration, embedding, or background-service infrastructure.

### Architecture Approach

The architecture has one off-prompt control plane and one bounded data plane. Runtime adapters discover local capabilities; the canonical registry validates and classifies them; workflow/relationship compilation and optional preferences produce runtime-local immutable projections; existing reconciliation, validation, and atomic activation publish one complete tuple with known-good fallback. At prompt time, `inspectDecision()` remains the sole decision owner: guard and classify, derive workflow requirements, retrieve capped eligible candidates, select the least sufficient compatible set, apply authority/risk/lease/approval once, then recommend or create a native dispatch envelope. Verified receipts feed continuity and learning off path.

**Major components:**

1. **Runtime adapters and canonical registry** — Discover Claude/Codex-local records, preserve native locators, validate contracts, classify every item, and audit coverage.
2. **Structured intent and workflow policy** — Represent user outcome and evidence needs independently of capability names; compile generic roles and transitions rather than framework-specific product truth.
3. **Semantic retrieval and least-sufficient selection** — Retrieve bounded candidates, apply hard eligibility, close dependencies, choose minimum compatible role coverage, order work, and expose separate diagnostics.
4. **Authority, dispatch, receipts, and verification** — Revalidate the final union of effects and runtime identity, invoke only through the active host adapter, and preserve causal proof.
5. **Immutable projections and one router path** — Extend the existing release tuple, loader, publisher, reconciliation, validation, activation, and `inspectDecision()` path; legacy routing is an older-schema fallback/shadow comparator, never a simultaneous dispatcher.
6. **Preferences and continuity** — Add only `src/registry/preferences.mjs` and `src/steward/continuity.mjs` as product modules: preferences provide compatible tie-break facts; continuity reduces verified state to a bounded digest without granting authority.
7. **Evaluation and lifecycle** — Add one repository evaluation entry point and extend the existing installer/release gate for isolated lifecycle and installed native evidence.

### Critical Pitfalls

1. **Lexical overfit** — Use structured intent and role requirements as the contract; test held-out paraphrases and randomized capability names, and keep ambiguous intent non-executing.
2. **Personal-install coupling and test leakage** — Require synthetic temporary roots, asymmetric inventories, foreign-root sentinels, and leakage scans; keep maintainer names, paths, and preferences out of defaults.
3. **Unsafe or excessive composition** — Hard-filter first, select minimum role coverage, validate ordering/conflicts/dependencies, enforce caps, and apply policy to the union of effects.
4. **Authority widening** — Keep fit, confidence, preference, authority, risk, lease, and owner gates independent; revalidate immediately before native dispatch.
5. **Stale or cross-project continuity** — Bind digests and acknowledgements to project/worktree identity, source fingerprints, verified evidence, freshness, and lease generation; stale state recommends refresh and never resumes.
6. **Hot-path regression and misleading metrics** — Benchmark actual prompt/startup production paths cold and warm against matched v1.7 conditions; report p50/p95/max and every mandatory dimension separately.
7. **False parity and installer ownership drift** — Separate fixture truth from installed truth, require native invocation identity for each host, and mutate/remove only ledger-owned files with atomic known-good recovery.

## Implications for Roadmap

The research proposals differ mainly in granularity: FEATURES suggests seven capability-oriented steps, ARCHITECTURE suggests eight implementation seams, and PITFALLS proposes six release-oriented phases. The six-phase structure below is the recommended reconciliation. It retains every dependency gate while avoiding artificial phases for stack setup, projection plumbing, or preferences alone.

### Phase 50: Portable Runtime-Local Contracts and Fixture Boundary

**Rationale:** Semantic behavior cannot be portable or safe until every local capability has a validated contract and tests are independent of the maintainer's homes. Fixtures belong here as executable contract data, not as a final testing afterthought.

**Delivers:** Versioned capability schema; declared-first safe inference; runtime-local Claude/Codex normalization; deterministic typed coverage dispositions; strict eligibility defaults; anonymous empty/minimal/asymmetric/conflicting/stale/invalid/plugin-heavy/project-scoped fixtures; leakage and foreign-root guards.

**Addresses:** Complete typed coverage, runtime-local projection foundation, portable fixture contract, safe recommendation-only treatment of unknowns.

**Avoids:** Personal-install coupling, private-content leakage, byte-equality parity assumptions, and live-home test contamination.

### Phase 51: Structured Intent, Generic Workflows, and Semantic Retrieval

**Rationale:** Workflow requirements and non-execution semantics must be correct before capability composition can be trusted. This phase should retrieve and rank in shadow while leaving the current production path active.

**Delivers:** Generic workflow role/evidence declarations; framework-neutral transition inputs; structured intent fields; non-execution precedence; capped semantic postings and candidate retrieval; deterministic safe fallback; held-out paraphrase/name-randomization corpus.

**Addresses:** Bounded intent inference, workflow-first retrieval, semantic equivalence, safe fallback, and explainable fit/coverage signals.

**Avoids:** Lexical overfit, hard-coded GSD or maintainer vocabulary, confidence-as-authority, and prompt-time filesystem work.

### Phase 52: Least-Sufficient Composition and Single-Path Semantic Cutover

**Rationale:** Composition requires stable contracts and workflow roles. The complete selector must exist before defining the final projection schema; atomic projection must exist before production cutover. These architecture steps belong in one phase because none delivers safe behavior independently.

**Delivers:** Minimum compatible role cover; dependency closure; ordering, conflict, exclusivity, redundancy collapse, and fixed caps; union-of-effects authority/risk checks; separate diagnostics; v1.8 tuple schema/publication/known-good fallback; one active `inspectDecision()` path; runtime-native action envelopes and causal receipt linkage.

**Addresses:** Least-sufficient selection, safe composition, behavioral proof foundation, bounded prompt projection, and one-router invariant.

**Avoids:** Capability pile-ons, aggregate authority escalation, partial activation, dual dispatchers, composite scores, and cross-runtime delegation.

### Phase 53: Scoped Preferences and Truthful Startup Continuity

**Rationale:** Preferences need a correct eligible selector, while continuity needs verified receipts and stable project identity. Combining them here is safe because both are bounded projections over established truth and neither may widen authority.

**Delivers:** Scoped semantic-role preference overlay and alias resolution; project/worktree-bound last/current/one-next digest; freshness and acknowledgement fingerprints; first-visit silence; lease-qualified idempotent resume; bounded startup rendering through the existing projection.

**Addresses:** Portable preferences, alias continuity, evidence-backed orientation, and safe resume.

**Avoids:** Preference-as-contract, free-form startup planning, stale/cross-project claims, repeated digests, transcript replay, and continuity-created authority.

### Phase 54: Independent Evaluation and Hot-Path Budgets

**Rationale:** Release thresholds should be frozen only after the production semantic path and continuity path exist. The phase converts the fixture contract into repeatable baseline-versus-candidate evidence and blocks regressions independently.

**Delivers:** Versioned/fingerprinted corpus; one deterministic v1.8 evaluation entry point; actual cold/warm prompt and startup measurements; independent coverage, correctness, safety, false-positive/negative, capability/tool-call, artifact/context, receipt, verification, parity, and lifecycle-precheck reports; full/incremental equivalence checks.

**Addresses:** Independent evaluation dimensions, proof of actual use, reproducibility, and explicit performance/weight budgets.

**Avoids:** Composite quality scores, helper-only benchmarks, unmatched baselines, hidden tail latency, and recommendation-text success claims.

### Phase 55: Installer, Native Parity, and Release Truth

**Rationale:** Installer ownership and migration should target stable schemas once. Isolated fixture parity is necessary but cannot establish that installed Claude and Codex integrations are active, native, recoverable, and non-destructive.

**Delivers:** Ownership-exact deployment updates; generated runtime-local projections; clean install, coexistence, upgrade, interruption, repair, rollback, disable/enable, uninstall, and last-known-good recovery in isolated homes; installed Claude and Codex native invocation/receipt/verification smoke evidence; documentation and release gate closure.

**Addresses:** Runtime-local lifecycle, behavioral parity, installed native proof, and recoverability.

**Avoids:** False runtime parity, mixed-version activation, broad uninstall, user-file mutation, source-checkout coupling, and fixture-only release claims.

### Phase Ordering and Dependencies

```text
Phase 50 typed contracts + isolated fixtures
  -> Phase 51 intent + generic workflows + retrieval
    -> Phase 52 composition + atomic projection + one-path cutover + receipts
      -> Phase 53 preferences + verified continuity + lease-qualified resume
        -> Phase 54 frozen corpus + independent production-path budgets
          -> Phase 55 lifecycle migration + installed native release truth
```

- Contracts precede retrieval because ranking incomplete or unsafe records is meaningless.
- Generic workflow requirements precede composition because minimality needs an explicit role set.
- Composition precedes final tuple publication; atomic publication precedes the semantic cutover.
- One-path routing and causal receipts precede any continuity-driven resume.
- Preferences wait until default portable selection works and remain post-eligibility tie-breakers.
- Evaluation fixtures start in Phase 50, focused gates ship with each phase, and the consolidated baseline/candidate laboratory is frozen in Phase 54.
- Lifecycle migration is last so installer ownership and rollback target stable artifacts once.

### Cross-Phase Constraints

- Extend existing seams; do not introduce another router, selector, registry truth, watcher, daemon, or execution bridge.
- Add no package or service unless a measured requirement proves Node/platform primitives insufficient.
- Never depend on personal paths, names, plugin counts, or local inventories for default behavior.
- Keep confidence, fit, coverage, availability, authority, risk, cost, preference, and evidence separate; no composite score.
- Keep discovery, inference, graph traversal, hashing sweeps, learning, receipt scans, and evaluation off prompt/startup paths.
- Preserve atomic complete-tuple activation, known-good recovery, runtime-local native invocation, owner gates, and ledger-exact lifecycle ownership in every phase.

### Research Flags

Phases needing targeted phase research or calibration:

- **Phase 51:** Calibrate deterministic retrieval thresholds and held-out paraphrase boundaries; do not tune against maintainer prompts or shared paraphrase families.
- **Phase 52:** Spike bounded minimum-set enumeration and adversarial aggregate-effect/conflict cases; retain a small fixed candidate/role ceiling rather than adding a solver.
- **Phase 53:** Specify project/worktree identity, staleness, acknowledgement, and host session/startup event semantics. A host without a safe startup event should degrade to prompt-time delivery, not polling.
- **Phase 54:** Measure matched v1.7 production baselines before choosing numeric latency, context, artifact, candidate, composition, and tool-call budgets.
- **Phase 55:** Validate runtime-specific native invocation and lifecycle behavior in generated installations and then live installed hosts.

Phases using established repository patterns (no broad ecosystem research needed):

- **Phase 50:** Existing schema validators, adapters, coverage audit, temp-home fixtures, hashing, and quarantine patterns are established; only contract details need planning.
- **Phase 52 projection/cutover work:** Existing release tuple, reconciliation, atomic activation, known-good fallback, authority, lease, dispatch, and receipt patterns should be reused.
- **Phase 54 harness mechanics:** `node:test`, `node:perf_hooks`, isolated subprocesses, and current calibration helpers are sufficient; research is for budgets, not tooling.
- **Phase 55 installer mechanics:** Existing mutation ledger and release gate are the implementation base; research is limited to host-native acceptance details.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct repository inspection and approved design agree that current zero-dependency Node.js ESM primitives are sufficient. |
| Features | HIGH | Table stakes and anti-features derive from the approved acceptance contract and shipped safety boundaries. |
| Architecture | HIGH | Existing module seams, data flow, activation model, and lifecycle paths were mapped directly; only two small product modules are justified. |
| Pitfalls | HIGH | Risks follow directly from the design's trust, authority, portability, hot-path, and lifecycle boundaries and have concrete detection fixtures. |

**Overall confidence:** HIGH

### Gaps to Address

- **Numeric budgets:** Establish from same-machine, same-fixture, same-runtime-mode v1.7 baselines during Phase 54 planning; do not invent values in roadmap creation.
- **Retrieval calibration:** Review held-out semantic families, thresholds, and deterministic tie behavior during Phase 51 planning.
- **Composition ceiling:** Confirm candidate, role, and selected-capability caps against the fixture corpus during Phase 52; use capped enumeration unless measured evidence disproves it.
- **Workflow declaration source:** Decide whether generic built-ins remain source JSON or are emitted by registry build; in either case, compiled `workflows.json` must be sole production authority.
- **Continuity identity/freshness:** Define exact project/worktree identity, evidence expiry, acknowledgement fingerprint, and restart/compaction semantics during Phase 53.
- **Runtime startup events:** Confirm safe host-native entry hooks for Claude and Codex; degrade gracefully to prompt-time digest delivery if unavailable.
- **Installed evidence:** Final acceptance still requires actual installed Claude and Codex smoke checks after isolated lifecycle tests; fixture success alone is insufficient.

## Sources

### Primary (HIGH confidence)

- [`STACK.md`](./STACK.md) — zero-dependency stack decision, existing integration seams, fixture/benchmark shape, and rejected additions.
- [`FEATURES.md`](./FEATURES.md) — table stakes, differentiators, anti-features, dependencies, MVP ordering, and research flags.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — current module mapping, one-router data flow, trust boundaries, build sequence, and open planning decisions.
- [`PITFALLS.md`](./PITFALLS.md) — critical failure modes, detection signals, phase ownership, required exit evidence, and proposed phases 50–55.
- [`2026-08-09-router-v1.8-adaptive-semantic-routing-design.md`](../../docs/superpowers/specs/2026-08-09-router-v1.8-adaptive-semantic-routing-design.md) — approved v1.8 product, architecture, acceptance, lifecycle, and explicit non-goals.
- [`.planning/PROJECT.md`](../PROJECT.md) — shipped baseline, milestone constraints, and framework-neutral/runtime-local product decisions cited by all research streams.

### Repository implementation evidence (HIGH confidence)

- `src/registry/*`, `src/coverage/audit.mjs`, and `src/adapters/{claude,codex}.mjs` — existing canonical registry, validation, semantic, eligibility, relationship, activation, coverage, and runtime-local discovery seams.
- `src/intent/*`, `src/orchestrator/*`, and `src/runtime/router.mjs` — existing classification, workflow, selection, authority, action, and sole production decision surfaces.
- `src/prompt/*`, `src/context/prompt-route.mjs`, `src/steward/*`, and `src/lease/*` — bounded projection, startup acknowledgement, continuity foundations, and lease authority.
- `src/adapters/dispatch/*`, `src/lifecycle/router-lifecycle.mjs`, `src/evolution/perf-measure.mjs`, `scripts/release-v17-gate.mjs`, and `tests/helpers/*` — native dispatch receipts, installer ownership, performance measurement, release gates, isolated fixtures, and latency helpers.

No secondary or tertiary external sources were needed; this research synthesizes an approved repository-specific design against the shipped implementation.

---
*Research completed: 2026-08-09*  
*Ready for roadmap: yes*
