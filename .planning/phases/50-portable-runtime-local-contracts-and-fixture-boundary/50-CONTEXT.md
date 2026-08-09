# Phase 50: Portable Runtime-Local Contracts and Fixture Boundary - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning
**Mode:** Autonomous smart discuss; user pre-approved recommended choices

<domain>
## Phase Boundary

Establish complete, portable, safe typed truth for every capability locally discoverable by each supported runtime. This phase owns discovery normalization, canonical contract shape, execution eligibility defaults, deterministic coverage classification, anonymous fixture boundaries, and runtime-local parity foundations. It does not implement semantic prompt retrieval, multi-capability composition, preferences, startup continuity, or production cutover.

</domain>

<decisions>
## Implementation Decisions

### Coverage Truth
- Build coverage from normalized registry records, not from explicit phrase mappings or mode-map membership.
- Retain every discovered record and assign exactly one of: `routable`, `composable`, `direct-only`, `hook-owned`, `project-scoped`, `unavailable`, `invalid`, or `excluded`.
- Strict coverage fails on unclassified records and tuple-integrity errors; intentional non-routable classes remain valid visible outcomes.
- Inspection must show stable identity, runtime-local locator, provenance, availability, freshness, contract evidence, eligibility, classification, and independent reasons.

### Contract and Eligibility
- Declared metadata wins; bounded inference may enrich retrieval semantics but cannot infer executable effects, authority, dependencies, or risk from names alone.
- Unknown or invalid execution-critical metadata keeps the record visible but non-dispatchable with deterministic reasons.
- Contract corrections remain evidence-bound overlays; personal preferences are not contract corrections and are deferred to Phase 53.
- Preserve existing canonical sorting, portable path rules, source fingerprints, quarantine behavior, and last-known-good activation boundaries.

### Runtime Projection and Parity
- Claude and Codex discover from their actual configured runtime roots and preserve host-native locators and provenance.
- Runtime parity means equivalent semantic classifications and safety behavior where capabilities are equivalent; counts, paths, plugin forms, and native mechanics may differ.
- Matching names across runtimes never establish equivalence or authorize cross-runtime invocation.
- Unsupported or partially understood surfaces become classified records rather than disappearing from coverage.

### Fixture Boundary
- The default suite uses anonymous isolated homes covering empty, minimal, renamed, asymmetric, conflicting, invalid, stale, project-scoped, plugin-heavy, and unknown-future inventories.
- Fixture capability names must be randomized or generic enough that exact-name routing cannot pass accidentally.
- Live `.claude` and `.codex` homes are optional ignored integration inputs only; private capability bodies, raw prompts, absolute personal paths, and credentials never enter committed artifacts.
- Reuse Node ESM, `node:test`, standard library temporary directories, and `tests/helpers/inventory-fixture.mjs`; add no dependency or fixture framework.

### the agent's Discretion
- Exact schema version number and field nesting, provided compatibility and canonical serialization tests make the migration explicit.
- Exact distribution of focused test files and JSON fixtures, provided each CVRG requirement has direct executable evidence.
- Whether safe classification is computed in registry assembly or coverage audit, provided one shared function owns the decision and callers cannot drift.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/adapters/claude.mjs` and `src/adapters/codex.mjs` already expose runtime-local discovery, parsing, normalization, and invocation compilation.
- `src/registry/schema.mjs` already canonicalizes and validates capabilities; `src/registry/contract.mjs` already implements declared-first contract inference and overlays.
- `src/registry/eligibility.mjs` already returns independent gate outcomes and quarantine reasons.
- `src/registry/build.mjs::assembleRegistry()` is the sole assembly seam for observations, contracts, relationships, and eligibility.
- `src/coverage/audit.mjs::auditCoverage()` and `tests/helpers/inventory-fixture.mjs` provide the current audit and synthetic-profile foundations.

### Established Patterns
- Canonical JSON-compatible records with stable ordering and fingerprints.
- Unknown execution-critical facts fail closed while prompt-time routing remains fail open.
- Invalid records can be isolated without invalidating unrelated records, but incomplete release tuples never activate.
- Node standard-library tests use isolated temporary roots and avoid live-home dependence.

### Integration Points
- Adapter observations flow into `assembleRegistry()`, then schema/contract/eligibility and coverage output.
- Compiled projection and semantic retrieval in later phases will consume the Phase 50 typed contract; Phase 50 must not pre-build a second routing path.
- Existing CLI contract and coverage inspection should consume the same shared classified records used by strict validation.

</code_context>

<specifics>
## Specific Ideas

- The system must understand intent without users naming capabilities, so Phase 50 aliases and descriptions are retrieval hints only—not trigger truth.
- The maintainer's Graphify and UI design capability bundles are integration fixtures for later phases, not Phase 50 defaults.
- “100% mapped” means 100% discovered-record typed classification for each runtime, not one explicit route per item.

</specifics>

<deferred>
## Deferred Ideas

- Structured prompt intent and generic workflow retrieval — Phase 51.
- Least-sufficient composition, production cutover, native receipt proof — Phase 52.
- Preference overlays and startup continuity — Phase 53.
- Consolidated evaluation laboratory and measured budgets — Phase 54.
- Installer migration and installed dual-runtime release proof — Phase 55.

</deferred>
