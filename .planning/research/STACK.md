# Technology Stack: Router v1.8 Adaptive Semantic Routing

**Project:** Claude Router v1.8 additions to the shipped dual-runtime router  
**Researched:** 2026-08-09  
**Confidence:** HIGH — based on the approved v1.8 design and direct inspection of the shipped implementation  
**Scope:** Typed capability contracts, semantic workflow selection, portable local fixtures, independent benchmarks, and Claude/Codex lifecycle evaluation only

## Decision

**Add no runtime package, development package, database, service, daemon, or framework.**

Keep the existing zero-dependency Node.js ESM stack. v1.8 needs schema and fixture expansion, not a stack expansion:

- Runtime “types” remain versioned plain objects checked by existing allowlist validators. Do not add TypeScript, Zod, Ajv, or a schema compiler.
- Semantic selection remains deterministic local matching, requirement coverage, dependency closure, and bounded composition. Do not add embeddings, vector search, NLP packages, or an LLM.
- Fixtures remain JSON/JavaScript data built in isolated temporary homes. Do not copy the maintainer's `.claude` or `.codex` trees into product truth.
- Benchmarks remain `node:perf_hooks` measurements with explicit p50/p95/max and separate correctness, safety, coverage, context, tool-call, receipt, verification, and lifecycle results. Do not add a benchmark framework or composite score.
- Dual-runtime lifecycle evaluation extends the existing installer and release gate using temporary Claude/Codex roots and host-native adapters. Do not add containers, a CI service, or cross-runtime delegation.

## Recommended Stack

### Core

| Technology | Version | Purpose | Why |
|---|---|---|---|
| Node.js ESM | Current LTS; checkout verified on `v22.22.3` | Runtime, builders, installer, evaluation | The repository already uses only Node standard-library APIs and has no package installation step. v1.8 requires no API outside that surface. Do not make the maintainer's exact Node patch version product truth. |
| Versioned canonical JSON | Existing schema-version conventions | Registry contracts, workflows, fixtures, compiled projections, reports | Portable, deterministic, inspectable, hashable, and already supported by `stableStringify()` and atomic publication. |
| `node:test` + `node:assert/strict` | Built into Node | Contract, resolver, safety, lifecycle, parity, and benchmark gates | Already used throughout the suite and deployable without package management. |

### Standard-Library APIs

| API | v1.8 use | Existing precedent |
|---|---|---|
| `node:fs` | Fixture trees, bounded artifact reads, atomic writes, install/rollback/uninstall checks | Registry, compiled index, receipts, lifecycle installer |
| `node:path`, `node:url`, `node:os` | Portable runtime roots and isolated temporary homes | Runtime adapters, installer, test helpers |
| `node:crypto` | Source hashes, fixture/corpus fingerprints, compiled artifact integrity | Registry identity, compiled index, receipts, lifecycle manifests |
| `node:perf_hooks` | Monotonic cold/warm route and startup timing | `src/evolution/perf-measure.mjs` and existing performance tests |
| `node:child_process` | Isolated test processes and host-native lifecycle smoke checks | Release gate, dispatch adapters, latency isolation |
| `structuredClone`, `Buffer.byteLength` | Mutation fixtures and exact context/artifact byte budgets | Existing inventory fixtures and calibration evaluator |

## Required Internal Extensions

No new subsystem is warranted. Extend the following shipped seams.

| v1.8 concern | Exact integration point | Minimum change |
|---|---|---|
| Typed capability coverage | `src/registry/schema.mjs` (`validateCapability`, canonicalization), `src/registry/contract.mjs` (`CONTRACT_FIELDS`, `buildCapabilityContract`, overlay validation), `src/registry/eligibility.mjs` (`evaluateEligibility`), `src/coverage/audit.mjs` | Extend the existing versioned contract with v1.8 identity, provenance, availability, intents, inputs/outputs, effects, authority, composition, cost, quality, aliases, and source-hash semantics. Keep unknown authority/effects recommendation-only. Add deterministic classification disposition to coverage output. |
| Runtime-local normalization | `src/adapters/claude.mjs`, `src/adapters/codex.mjs`, `src/registry/build.mjs` (`acquireRegistry`, full/incremental assembly), `src/registry/identity.mjs`, `src/registry/fingerprint.mjs` | Infer the shared semantic fields from each runtime's own discovered inventory. Preserve runtime-local locators and provenance; never require equal names, paths, or counts. |
| Semantic intent | `src/intent/classify.mjs`, `src/intent/authority.mjs` | Extend the bounded classifier output to goal, subjects, operations, constraints, evidence requirements, and execution signal. Preserve negation, quotation, hypothetical, advice, and authority separation. No statistical model is needed. |
| Workflow retrieval and composition | `src/registry/semantic.mjs` (`resolveSemanticOutcome`), `src/orchestrator/select.mjs` (`selectCapabilities`, `resolveDependencies`), `src/registry/relationships.mjs`, `src/registry/substitute.mjs`, `src/orchestrator/workflow-declarations.json`, `src/orchestrator/strategy.mjs` | Replace single-output matching with bounded role coverage over declared workflows. Reuse eligibility and dependency closure, collapse redundant capabilities, reject conflicts, preserve order, cap candidates/composition, and return separate fit/coverage/availability/authority/risk/cost/evidence diagnostics. Do not create a second router or a composite score. |
| Compiled hot-path projection | `src/prompt/compile-index.mjs`, `src/prompt/publish-index.mjs`, `src/context/prompt-route.mjs`, `build-manifest.mjs` | Compile only the bounded fields required for prompt/startup routing. Keep discovery, inference, hashing sweeps, fixture evaluation, and learning off the hot path; publish atomically with last-known-good recovery. |
| Portable fixtures | `tests/helpers/inventory-fixture.mjs`, existing focused `tests/router.*.test.mjs`, `tests/phase-38/fixtures/harmless.mjs` | Add synthetic empty/minimal/mixed/conflicting/stale/malicious/project-scoped/plugin-heavy fixtures for both runtimes. Add paraphrase, misspelling, indirect-intent, negation, quotation, hypothetical, preference-overlay, composition, and unavailable-dependency cases as data. Use generated temporary homes. |
| Independent evaluation | `src/evolution/perf-measure.mjs` (`evaluateCalibrationCorpus`, `measureRoutes`, `percentile`), `router.calibrate.mjs`, `tests/helpers/latency-isolated.mjs` | Version and fingerprint a v1.8 corpus. Report each mandatory dimension independently; compare baseline and candidate under identical fixtures, process mode, warmup, run count, and machine class. Extend the existing isolated subprocess pattern for cold/warm startup and prompt latency. |
| Receipt and behavioral proof | `src/adapters/dispatch/receipt.mjs`, `src/adapters/dispatch/contract.mjs`, `src/adapters/dispatch/{claude,codex}.mjs`, existing Phase 44 receipt tests | Assert selected workflow, eligible capability set, runtime-native invocation identity, causal receipt links, completion evidence, and required verification. Reuse hashes and bounded JSON receipts; do not add telemetry infrastructure. |
| Dual-runtime lifecycle evaluation | `src/lifecycle/router-lifecycle.mjs` (`installRouter`, module deployment list, production gate fixture list, `uninstallRouter`), `install-router.mjs`, `scripts/release-v17-gate.mjs` (`verifyInstalledParity`, `verifyReleaseGate`) | Extend the deployed module/fixture lists and isolated-home gate for clean install, upgrade, rollback, uninstall, last-known-good recovery, and host-native Claude/Codex smoke checks. Compare semantic behavior and classified coverage, not byte-identical inventories. |

## Fixtures and Benchmark Shape

Use one repository-owned, versioned fixture matrix. Each case should declare inputs, expected independent outcomes, and explicit budgets:

```js
{
  id: 'portable-ui-paraphrase',
  runtime: 'claude',
  inventory: 'synthetic-mixed',
  prompt: 'give this screen a proper redesign',
  expected: {
    workflow: 'ui-redesign',
    roles: ['design-direction', 'implementation', 'visual-review'],
    unsafe_selections: 0,
    unavailable_selections: 0
  },
  budgets: { max_capabilities: 3, max_context_bytes: 2048 }
}
```

Keep measurements separate:

- typed discovered-record coverage per runtime;
- expected workflow and exact least-sufficient capability set;
- unsafe, unavailable, conflicting, and unnecessary selections;
- false-positive and false-negative intent cases;
- prompt p50, p95, and max latency;
- cold and warm startup latency;
- compiled artifact and injected context bytes;
- tool-call/capability count;
- receipt-field completeness and causal linkage;
- verification-evidence satisfaction;
- clean install, upgrade, rollback, uninstall, and recovery outcomes.

Do not collapse these into one quality score. A mandatory regression in any dimension blocks the candidate.

## Dependencies and Services Explicitly Not to Add

| Do not add | Reason | Existing replacement |
|---|---|---|
| TypeScript build, Zod, Ajv, Joi, TypeBox | Runtime validation and deterministic quarantine are required regardless of compile-time types; a build step adds no product capability | Existing schema/contract validators and versioned canonical JSON |
| Embedding model, vector database, semantic-search SDK | Violates runtime-local/lightweight constraints and is unnecessary for bounded workflow roles and local capability descriptions | Deterministic intent fields, aliases as retrieval hints, declared workflows, eligibility, and bounded ranking |
| LLM classifier or API client | Adds network, privacy, latency, nondeterminism, and cost to routing | Existing local classifier plus deterministic workflow requirements |
| SQLite, LevelDB, Redis, Postgres | Fixture/evaluation state is bounded local data; no query or concurrency requirement justifies a database | Canonical JSON/JSONL, hashes, atomic files, and existing LKG publication |
| New daemon, queue, worker service, event bus | Duplicates the shipped watcher/controller and complicates ownership and uninstall | Existing controller plus explicit evaluation subprocesses |
| Workflow framework or agent orchestrator | The router already owns transitions, selection, strategy, approval, leases, receipts, and verification | Extend `src/orchestrator/` and registry semantics |
| Benchmark.js, Vitest, Jest, Playwright | No browser is involved; Node already supplies tests, monotonic timing, subprocess isolation, and assertions | `node:test`, `node:assert/strict`, `node:perf_hooks`, `node:child_process` |
| Docker or VM harness as a default gate | Adds platform weight without improving isolated filesystem lifecycle truth | `mkdtemp` homes and real installer/uninstaller calls |
| Claude or Codex SDK | v1.8 evaluates the shipped host-native adapters; an SDK would create another execution path | Existing runtime discovery and dispatch adapters |
| Remote telemetry, dashboard, SaaS evaluation, hosted corpus | Conflicts with local/privacy requirements and is unnecessary for release evidence | Local deterministic reports and bounded receipts |
| Maintainer-specific skills, plugins, paths, aliases, or preference defaults | Would make one installation product truth and break framework neutrality | Synthetic fixtures plus optional local preference overlays |
| A second compiled index or router | Creates semantic drift and prompt-path weight | Extend the existing canonical registry and compiled-index tuple |

## Installation

```bash
# No package installation and no package.json required.

# Existing development and verification surfaces:
node --test --test-concurrency=1 tests/*.test.mjs
node install-router.mjs --dry-run
```

The lifecycle gate should invoke the installer APIs directly in generated isolated homes, as the existing release gate does. Live installed-runtime smoke checks remain a separate release evidence lane because synthetic parity does not prove the user's host integration.

## Alternatives Rejected

| Recommended | Rejected alternative | Reconsider only if |
|---|---|---|
| Extend runtime validators | TypeScript/schema dependency | Contract volume becomes unmaintainable and measured validator defects persist after consolidating existing checks |
| Deterministic workflow-role retrieval | Embeddings or local model | A reviewed paraphrase corpus demonstrates a required semantic class that bounded local rules cannot represent within latency/context budgets |
| Existing fixture helpers + temp homes | Containerized test environment | A supported host lifecycle behavior cannot be isolated safely at filesystem/process level |
| Existing perf evaluator | Benchmark framework | Current monotonic isolated measurements cannot reproduce a demonstrated regression |
| Existing release gate | External parity service | Release policy later requires remote matrix execution; local evidence remains authoritative for installed hosts |

## Roadmap Implication

Stack setup is not a phase. Start with contract/schema and portable fixture expansion, then semantic selection/composition, then compiled projection and behavioral evaluation, and finish with installer deployment plus dual-runtime lifecycle/release evidence. Each phase extends existing modules and must preserve the zero-dependency invariant.

## Sources

No external technical lookup was necessary; the decision is fully supported by repository-primary evidence:

- `.planning/PROJECT.md` — v1.8 constraints, active requirements, and explicit out-of-scope stack additions.
- `docs/superpowers/specs/2026-08-09-router-v1.8-adaptive-semantic-routing-design.md` — approved architecture, evaluation matrix, lifecycle acceptance, and non-goals.
- `README.md` — current zero-dependency Node.js ESM and `node:test` development contract.
- `src/registry/schema.mjs`, `contract.mjs`, `eligibility.mjs`, `semantic.mjs`, `relationships.mjs` — existing typed contract, trust, semantic, and graph primitives.
- `src/intent/classify.mjs`, `src/orchestrator/select.mjs`, `strategy.mjs`, `workflow-declarations.json` — existing intent, dependency closure, workflow, and strategy seams.
- `src/evolution/perf-measure.mjs`, `tests/helpers/inventory-fixture.mjs`, `tests/helpers/latency-isolated.mjs` — existing portable fixtures and independent measurement primitives.
- `src/lifecycle/router-lifecycle.mjs`, `scripts/release-v17-gate.mjs` — existing dual-runtime deployment, isolated-home parity, rollback, uninstall, and release-gate surfaces.
