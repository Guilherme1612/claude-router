# Phase 50 Research: Portable Runtime-Local Contracts and Fixture Boundary

**Phase:** 50  
**Requirements:** CVRG-01, CVRG-02, CVRG-03, CVRG-04, CVRG-05, CVRG-06  
**Research date:** 2026-08-09

## Research Outcome

Phase 50 should extend the existing acquisition -> canonicalization -> contract -> eligibility -> coverage pipeline. It does not need a second registry, a new discovery framework, or new dependencies.

The smallest safe implementation is:

1. keep Claude and Codex discovery runtime-local and path-portable;
2. add one bounded typed metadata shape during canonicalization/contract assembly;
3. evaluate execution-critical unknowns through the existing eligibility gates;
4. classify every assembled record exactly once without deleting invalid or unavailable records; and
5. prove it with anonymous filesystem fixtures that never read a live user home.

## Existing End-to-End Flow

1. `src/adapters/claude.mjs` discovers configured Claude roots, walks supported layouts, parses artifacts, and emits portable provenance using `logical_root` plus `relative_path`.
2. `src/adapters/codex.mjs` reuses the Claude adapter factory with Codex-specific layouts and configured roots.
3. `src/registry/build.mjs` acquires both runtimes, validates observations, groups variants by stable identity, applies precedence, builds contracts, and evaluates eligibility.
4. `src/registry/schema.mjs` owns canonical record normalization and trust-boundary validation.
5. `src/registry/contract.mjs` owns declared/inferred field evidence, conflict handling, overlays, and deterministic contract validation.
6. `src/registry/eligibility.mjs` independently gates target existence, invocation shape, adapter support, dependency closure, permission, scope, effects, reversibility, risk, and field confidence.
7. `src/coverage/audit.mjs` reports mapping and inventory coverage diagnostics.

These are already the correct single-owner seams. Phase 50 should add data and decisions there rather than introduce another routing path.

## Requirements Mapping

| Requirement | Implementation seam | Required proof |
|---|---|---|
| CVRG-01 | Claude/Codex `discoverRoots()` plus existing adapter layouts | Synthetic roots discover supported kinds without maintainer-specific paths |
| CVRG-02 | `canonicalizeCapability()`, `buildCapabilityContract()`, registry assembly | Every record exposes identity, runtime-local locator, provenance, availability, freshness, and one coverage class |
| CVRG-03 | Contract evidence and bounded canonical metadata | Routable records expose typed semantic, effects, risk, authority, composition, cost, evidence, and aliases |
| CVRG-04 | `evaluateEligibility()` and record classification | Unknown or invalid execution-critical metadata stays inspectable and non-executable with independent reasons |
| CVRG-05 | Assembly plus coverage audit | Claude and Codex independently report 100% classified records despite asymmetric counts and mechanics |
| CVRG-06 | `tests/helpers/inventory-fixture.mjs` and `tests/fixtures/v1.8/` | Empty, minimal, renamed, conflicting, invalid, project-scoped, plugin-heavy, and asymmetric inventories run without live-home reads |

## Contract Shape and Ownership

Preserve existing record fields and stable sort behavior. Normalize this bounded metadata on every record:

```js
semantic: {
  intents: [], subjects: [], operations: [], outputs: [], evidence: [], aliases: [],
},
effects: [],
risk: { level: 'unknown', source: 'inferred' },
authority: { ceiling: 'advice', source: 'inferred' },
composition: { roles: [], requires: [], conflicts: [], exclusive: false },
cost: { latency: 'unknown', context_bytes: null, tool_calls: null },
coverage: { classification: 'invalid', reasons: [] },
source_freshness: { fingerprint: '', observed_at: '' },
```

Rules:

- Declared metadata wins over inference.
- Names, descriptions, aliases, and paths may add retrieval semantics only.
- Names alone must never infer executable effects, authority, risk, dependencies, or permissions.
- Unknown execution-critical fields remain unknown; eligibility converts each unknown into a deterministic failing gate and reason.
- Keep the outer capability schema compatible. Version the contract policy only where the emitted contract semantics change.
- Canonical arrays must be deduplicated and sorted; object keys must retain `stableStringify()` determinism.
- Absolute filesystem paths are diagnostics-only local data and must not enter portable records, snapshots, or committed fixtures.

## Exhaustive Classification

Every assembled record receives exactly one class from:

```text
routable
composable
direct-only
hook-owned
project-scoped
unavailable
invalid
excluded
```

Classification must be a single deterministic function over the canonical record, contract, and eligibility result. Recommended precedence is terminal/safety states first (`invalid`, `unavailable`, `excluded`), then ownership/scope (`hook-owned`, `project-scoped`, `direct-only`), then composition/routing (`composable`, `routable`). This prevents one record from appearing in multiple buckets.

`assembleRegistry()` must retain records that are unavailable, invalid, or recommendation-only. `auditCoverage()` should add record-level output and an `unclassified` list while preserving existing report fields for callers. Coverage passes only when record count, unique classified IDs, and assembled registry count all match and `unclassified` is empty.

## Adapter and Portability Constraints

- Continue using configured roots supplied to each runtime adapter; do not hardcode `/Users/...`, `.claude`, or `.codex` as universal installation truth.
- Persist `logical_root` and normalized `relative_path`, never the absolute discovery root.
- Preserve symlink escape, cycle, oversized artifact, malformed metadata, and unsupported layout diagnostics.
- Runtime parity is semantic and safety parity. Claude and Codex are allowed different records, counts, paths, invocation mechanics, and runtime-only kinds.
- Tests must set explicit synthetic roots and must fail if an adapter silently falls back to the process user's live home.

## Fixture Strategy

Extend `tests/helpers/inventory-fixture.mjs`; do not add a second fixture framework. Build temporary anonymous runtime roots from declarative JSON scenarios:

- `empty-claude.json`
- `minimal-codex.json`
- `asymmetric-runtimes.json`
- `conflicting-invalid.json`

The helper should materialize only the requested files under a test temporary directory, pass those roots explicitly into acquisition, and return cleanup handles. Scenario data must use anonymous names and synthetic logical roots. Add cases for rename, project scope, plugin-heavy layout, invalid metadata, unavailable invocation, conflicting evidence, and unknown dependencies.

No test may depend on `HOME`, `CODEX_HOME`, the maintainer's `.claude`, or the maintainer's `.codex`. Snapshots and assertion messages must reject absolute private path fragments.

## Validation Architecture

### Test Layers

| Layer | Purpose | Command |
|---|---|---|
| Contract-first | Prove the new metadata, classification set, unknown-field safety, and fixture isolation | `node --test tests/router.v18-contracts.test.mjs` |
| Focused regression | Protect registry build, coverage reporting, and contract inspection | `node --test tests/router.v18-contracts.test.mjs tests/router.registry-build.test.mjs tests/router.coverage.test.mjs tests/router.contract-inspection.test.mjs` |
| Full repository | Detect cross-pipeline drift after focused tests pass | `node --test --test-concurrency=1 tests/*.test.mjs` |

### Requirement-to-Test Matrix

| Requirement | Test assertion |
|---|---|
| CVRG-01 | Explicit isolated Claude/Codex roots discover all fixture artifacts and no outside artifacts |
| CVRG-02 | Every discovered ID appears once in coverage output with complete portable fields |
| CVRG-03 | Routable/composable records contain the bounded typed metadata shape and deterministic canonical output |
| CVRG-04 | Unknown effects, risk, authority, or dependencies independently force `eligible: false` and remain inspectable |
| CVRG-05 | Per-runtime classified count equals per-runtime discovered count for asymmetric inventories |
| CVRG-06 | All declarative fixture scenarios pass with live-home variables poisoned or redirected |

### Privacy and Leakage Checks

- Recursively inspect emitted registry, report, fixture snapshots, and diagnostics for the real workspace path, `/Users/`, and unresolved absolute discovery roots.
- Assert provenance `logical_root` is symbolic and `relative_path` is non-absolute and cannot escape with `..`.
- Run the focused suite with explicit fixture roots and a synthetic home; no test reads live runtime homes.
- Keep optional installed-runtime checks outside the default portable suite and never serialize their inventory content into the repository.

### Nyquist Rule

Each CVRG requirement has at least one automated assertion in `tests/router.v18-contracts.test.mjs`. Existing regression suites remain mandatory because the contract, eligibility, assembly, and audit seams are shared by later phases.

## Implementation Order

1. Add the failing v1.8 portable contract tests and JSON scenarios.
2. Extend the existing fixture helper to materialize isolated runtime roots.
3. Normalize and validate the bounded metadata at the canonical schema/contract seams.
4. Reuse existing eligibility gates for unknown execution-critical fields; add only missing authority/dependency decisions.
5. Add exactly-once classification during assembly and compatible record-level output in coverage audit.
6. Run focused tests, privacy checks, then the serial full suite.

## Risks and Shields

- **Dropping bad records:** retain them and classify `invalid` or `unavailable`.
- **Inference widens authority:** retrieval-only inference cannot satisfy execution gates.
- **Duplicate classification:** one classifier with ordered precedence, one class per ID.
- **Breaking old consumers:** additive report fields and canonical defaults; preserve existing keys.
- **Live-home coupling:** explicit temporary roots only in default tests.
- **Runtime mirror assumptions:** assert independent per-runtime completeness, never count equality.
- **Overbuilding:** reuse adapter factory, canonicalization, contracts, eligibility, audit, and fixture helper; add no dependency or service.

## Planning Recommendation

Use two implementation plans: first fixtures and failing contracts; second canonical metadata, exhaustive assembly/audit, and regressions. This keeps the test boundary reviewable while avoiding parallel edits to the shared registry pipeline.
