# Phase 26: Coherent Publication and Dual-Runtime Release - Research

**Researched:** 2026-07-28
**Domain:** Immutable local publication, dual-runtime lifecycle, and release evidence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Tuple publication

- Registry, contracts, relationships, intent policy, workflow routes, health
  policy, and suggestion references publish under one immutable version.
- A partial or failed build never changes the active tuple.
- Full and incremental builds must be byte-identical for the same inputs.
- Invalidation is dependency-complete and atomic for node, edge, dependency,
  adapter, inference-rule, manifest, correction, and negative-evidence changes.

### Prompt hot path

- Prompt submission consumes only bounded precompiled projections.
- No discovery, parsing, history analysis, usefulness calculation, graph
  traversal, mutation, network request, or additional model call is permitted.
- Recommendation-only failures remain fail-open and preserve last-known-good
  routing.

### Release and compatibility

- Reuse the existing verifier, canary, activation, rollback, recovery, and
  explicit-approval gates.
- Preserve command, skill, agent, workflow, MCP, and tool recommendations in
  both Claude and Codex installations.
- Release evidence must cover fresh install, repair, upgrade, rollback,
  recovery, and actual installed-runtime activation.

### Performance evidence

- Warm routing p95 must remain below 25 ms.
- Every measured route must remain below 100 ms.
- Injected context must remain within existing byte and token budgets.
- Performance and lifecycle evidence must include a realistic large local
  registry, not only small unit fixtures.

### the agent's Discretion

- Exact internal tuple schema and invalidation representation.
- Test partitioning and benchmark fixture construction.
- Whether existing publication primitives can be extended or only require
  wiring, provided no duplicate release path is introduced.

### Deferred Ideas (OUT OF SCOPE)

- New dashboards, timelines, telemetry, remote services, or model calls.
- New automatic install, delete, disable, merge, archive, rewrite, activate, or
  publish authority.
- New public capability schema or third-party package ecosystem.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | Prompt submission performs no discovery, manifest parsing, history analysis, usefulness calculation, graph traversal, mutation, network request, or model call. | Separate the bounded tuple reader/projection from refresh and capsule mutation; enforce with import/static-I/O gates and a real hook benchmark. |
| REL-02 | Background analysis compiles bounded contracts, relationships, intent rules, workflow transitions, local equivalents, and suggestion references into the prompt index. | Extend the existing publisher inputs and manifest siblings; keep analysis in the watcher/admin path. |
| REL-03 | All v1.3 decision artifacts publish as one immutable tuple. | Extend `publishCompiledIndex()` and `loadCompiledIndex()` instead of adding another publication path. |
| REL-04 | Every specified change class invalidates all affected tuple members atomically. | Add a dependency-complete invalidation descriptor/fingerprint and verify old-or-new visibility at the pointer boundary. |
| REL-05 | Routing changes pass verifier, publishing, canary, activation, last-known-good, rollback, and recovery. | Wire the extended tuple through `createRegistryReconciler()` and existing lifecycle/release tests. |
| REL-06 | Skill, agent, command, workflow, MCP, and tool recommendations remain compatible. | Exercise both adapters and installed Claude/Codex roots with one recommendation matrix. |
| REL-07 | Warm p95 is under 25 ms, every route under 100 ms, and context stays bounded. | Reuse `measureRoutes()`, `assessCalibration()`, and byte-budget evaluation against a large registry fixture. |
| REL-08 | Full and incremental builds are byte-identical; partial analysis cannot activate. | Expand the current registry-only equivalence gate to compare complete publish inputs/output fingerprints and inject failures before pointer replacement. |
| REL-09 | Automatic mutations remain approval/safety gated; recommendation failures fail open with last-known-good routing. | Preserve existing approval and canary gates; test optional suggestion failure independently from dispatch. |
</phase_requirements>

## Summary

The repository already has the correct publication spine: stable JSON bytes, immutable version directories, hash-verified manifests, one atomic `active.json` pointer, a verified `known-good.json` pointer, crash injection, recovery, canary decisions, and installed Claude/Codex lifecycle tests. [VERIFIED: `src/prompt/publish-index.mjs`, `src/prompt/compile-index.mjs`, `src/registry/activate.mjs`, `src/registry/watcher.mjs`, `src/lifecycle/router-lifecycle.mjs`] Phase 26 should extend that spine, not create a second release system.

The present release tuple contains `registry.json`, `index.json`, `closure.json`, `budget.json`, and `summary-index.json`. Contracts and relationships already ride inside `registry.json`, but the tuple does not explicitly version the intent policy, activated health policy, or steward suggestion reference. [VERIFIED: `src/registry/build.mjs:347-364`, `src/prompt/publish-index.mjs:196-245`] The prompt path also separately reads `steward/startup-pointer.json` and can write capsule state after resolving refresh/override, so it is not yet the locked read-only single-tuple projection. [VERIFIED: `src/context/prompt-route.mjs:101-171`, `src/steward/startup-pointer.mjs`]

The current focused release/lifecycle suite is nearly green: 97/98 passed on 2026-07-28. The sole failure is the production-relevant mode-map stamping test (`expected >=2 mapped subjects, got 0`), so planning must reserve Wave 0 for that live regression rather than treating existing publication tests as a clean baseline. [VERIFIED: local command `node --test --test-concurrency=1` over 11 release/lifecycle test files]

**Primary recommendation:** Extend the existing tuple publisher/loader with bounded policy and suggestion projections, make the hook a pure bounded reader, then prove the same tuple through the existing watcher, canary, lifecycle, and release runner.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Background tuple construction | Local backend / watcher | Storage | The reconciler owns acquisition, verification, canary, and publication. |
| Immutable tuple storage | Local filesystem storage | — | Version directories and atomic pointer replacement are the established transaction boundary. |
| Prompt projection | Installed runtime hook | Local filesystem storage | The hook should read only bounded verified tuple members and emit bounded context. |
| Claude/Codex compatibility | Runtime adapters | Lifecycle installer | Adapters normalize capability kinds; installer deploys identical module closure to both roots. |
| Release evidence | Release runner | Test fixtures | The runner binds requirement gates to deterministic reports. |

All tier assignments are derived from live imports and call sites. [VERIFIED: codebase grep]

## Project Constraints (from AGENTS.md)

- Every shell command must be prefixed with `rtk`; use `rtk proxy` for raw shell pipelines. [VERIFIED: `/Users/guilherme/.codex/RTK.md`]
- No project skill applies to this non-visual phase; the only project skill is `excalidraw-diagram`. [VERIFIED: `.agents/skills/excalidraw-diagram/SKILL.md`]
- Planning artifacts are not committed automatically because `commit_docs` is false. [VERIFIED: `.planning/config.json`]
- Tests are Node ESM and lifecycle/install suites must run serially to avoid shared-resource races. [VERIFIED: test layout and prior project workflow]
- The Graphify snapshot is 122 hours and 106 commits stale; its relationship hints are approximate and live source/tests take precedence. [VERIFIED: `gsd-tools graphify status`, 2026-07-28]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.22.3 | Runtime and `node:test` | Current local runtime and existing project baseline. [VERIFIED: `node --version`] |
| `node:fs`, `node:path`, `node:crypto` | Node 22 built-ins | Durable writes, containment, SHA-256, pointer replacement | Already implement the release transaction without dependencies. [VERIFIED: publication/lifecycle imports] |
| Existing stable serializer | repository-owned | Byte identity and fingerprints | `stableStringify()` is already the canonical byte seam. [VERIFIED: `src/registry/schema.mjs`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:test` | Node 22 built-in | Unit, integration, installed-runtime, performance tests | Every new behavior and release gate. |
| Existing canary/perf modules | repository-owned | Quality, context, p95, max latency | Candidate and known-good comparison before publication. |

No external package is required or permitted by scope. [VERIFIED: context decision; no root `package.json`]

## Architecture Patterns

### System Architecture Diagram

```text
Claude/Codex sources
        |
        v
acquire -> full/incremental build -> complete invalidation fingerprint
        |                              |
        +---- verifier + canary <------+
                       |
                 PASS only
                       v
      immutable release-tuples/versions/<tuple-id>/
      registry + index + closure + budget + policies + suggestion ref + manifest
                       |
              fsync + atomic rename
                       v
                   active.json
                       |
       bounded verified reads only
                       v
          Claude hook / Codex hook -> <= 2 KiB injection

failure before pointer: old tuple remains active
invalid active pointer: verified known-good -> explicit recovery
```

### Recommended Project Structure

Reuse the existing locations; add the fewest tuple siblings possible.

```text
src/
├── prompt/compile-index.mjs    # bounded tuple validation/loading
├── prompt/publish-index.mjs    # sole tuple construction/publication path
├── registry/watcher.mjs        # off-path analysis, gates, publish trigger
├── context/prompt-route.mjs    # pure bounded projection
├── lifecycle/router-lifecycle.mjs
└── release/run-release.mjs
tests/
└── router.phase26-*.test.mjs   # focused contract/integration evidence
```

### Pattern 1: Immutable Directory + Single Atomic Pointer

Write every deterministic member and its hashes under a content-addressed tuple directory, verify the complete directory, then atomically replace one pointer. Never update tuple members in place. [VERIFIED: existing `publishCompiledIndex()` and `loadCompiledIndex()`]

### Pattern 2: Optional Projection Fails Open, Dispatch Integrity Fails Closed

Corrupt/missing routing members must reject the candidate or fall back to verified known-good. A missing suggestion reference must suppress only the recommendation and leave verified routing intact. [VERIFIED: locked context; existing loader fail-closed and startup notice fail-silent behavior]

### Pattern 3: One Canonical Build Value

Both full and incremental acquisition must feed `assembleRegistry()` and then the same deterministic tuple projection builder. Compare canonical bytes for all tuple members, not merely registry semantic bytes. [VERIFIED: `buildFullRegistry()`, `buildIncrementalRegistry()`, current equivalence gate]

### Pattern 4: Evidence From the Installed Runtime

Lifecycle proof must invoke the deployed controller/hook under temporary Claude and Codex roots, not just import source modules. Existing fourteen runtime-operation cells are the reusable foundation. [VERIFIED: `tests/router.autonomous-lifecycle.test.mjs`]

### Anti-Patterns to Avoid

- **Second publication path:** it would split rollback/recovery authority.
- **Independent health/suggestion active pointers on the hook path:** they permit a mixed-version view.
- **Hashing timestamps into tuple identity:** same inputs would stop being byte-identical.
- **Directory enumeration on prompt submission:** it violates the bounded projection contract.
- **Benchmarking only a tiny fixture or mocked loader:** it does not prove the release criterion.
- **Treating recommendation data as dispatch authority:** optional stewardship must stay fail-open and non-mutating.

## Existing Primitives and Exact Gaps

| Area | Existing primitive | Phase 26 gap |
|------|--------------------|--------------|
| Immutable publication | `publishCompiledIndex()` writes immutable siblings, manifest, active and known-good pointers | Add explicit intent/workflow/health/suggestion projections to the one tuple identity and manifest. |
| Tuple validation | `loadCompiledIndex()` bounds reads, checks hashes/schema/expiry/routes | Validate every new member; expose only bounded projections. |
| Contracts/graph | Contracts on records; relationships on registry | Ensure their fingerprints participate in dependent tuple identity/invalidation tests. |
| Invalidation | Registry diff covers add/remove/move/rename/disable/scope/dependency/permission/content | Add adapter, inference-rule, manifest, correction, negative-evidence dependency inputs; current diff vocabulary is insufficient by itself. |
| Equivalence | `incremental_full_equivalence` compares canonical registry semantics | Compare the complete deterministic tuple projection/output fingerprints. |
| Hot path | Bounded tuple reads and 2 KiB injection | Remove capsule writes and separate startup-pointer read; static gate forbidden imports/calls. |
| Health | Canary bridge writes versioned thresholds | Active thresholds are not consumed by the scorer and are not tuple-bound. |
| Suggestion | Off-path refresh compiles `startup-pointer.json` | Pointer is independently versioned outside the release tuple. |
| Canary | Existing candidate/known-good calibration and hard thresholds | Run against the extended tuple and a large registry. |
| Lifecycle | install/repair/upgrade/disable/enable/uninstall/restart and recovery tests | Add v1.3 tuple preservation plus fresh install/repair/upgrade/rollback/recovery evidence in both runtimes. |
| Release runner | v1.2 requirement matrix/report | Add a v1.3/Phase 26 matrix or extend the runner generically; current constants are locked to v1.2 and 20 requirements. |

Every row is based on live source/test inspection. [VERIFIED: codebase grep and focused test run]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Transactions | New journal/database | Immutable version directory + atomic pointer | Already crash-tested and recoverable. |
| Serialization | New canonical JSON format | `stableStringify()` | Existing fingerprints depend on it. |
| Verification | Parallel bespoke verifier | `produceActivationVerification()` and required activation gates | Preserves trusted evidence policy. |
| Performance math | New percentile helper | `measureRoutes()` / `percentile()` | Existing nearest-rank semantics and thresholds are tested. |
| Rollback/recovery | New release-only controller | Existing active/known-good and lifecycle recovery seams | Avoids split authority. |
| Runtime discovery | Phase-specific scanners | Existing Claude/Codex adapters | They already normalize all required capability kinds. |

**Key insight:** this is wiring and proof work around established primitives, not a new release subsystem. [VERIFIED: architecture inventory]

## Common Pitfalls

### Pitfall 1: Tuple Identity Omits a Sibling
**What goes wrong:** A health or suggestion change reuses an old tuple ID, so readers observe stale policy under a seemingly current version.  
**How to avoid:** Derive tuple identity from hashes of every member and verify the manifest enumerates every member.  
**Warning sign:** Changing a new member leaves `tuple_version_id` unchanged.

### Pitfall 2: Pointer Moves Before Complete Verification
**What goes wrong:** A partial build becomes active.  
**How to avoid:** Write/fsync all members and manifest, validate using the same bounded reader, then replace the pointer once.  
**Warning sign:** Any member write occurs after `active.json` replacement.

### Pitfall 3: Hot Path Mutates State
**What goes wrong:** Capsule refresh/override writes add latency and violate REL-01.  
**How to avoid:** Publish the next-action projection off path; acknowledge/correct state through explicit post-hook/admin seams.  
**Warning sign:** `saveCapsule`, discovery, health, graph, or watcher imports in the prompt module.

### Pitfall 4: Registry Equivalence Is Mistaken for Tuple Equivalence
**What goes wrong:** Full/incremental registries match while derived policy/suggestion siblings differ.  
**How to avoid:** Compare every canonical tuple member and final tuple ID for the same frozen inputs.

### Pitfall 5: Recommendation Failure Blocks Routing
**What goes wrong:** An optional pointer parse failure suppresses the valid dispatch tuple.  
**How to avoid:** Validate routing members strictly; treat optional suggestion absence as `available:false` only.

### Pitfall 6: Source Tests Substitute for Installed Proof
**What goes wrong:** Imports pass while deployed module closure or runtime paths are broken.  
**How to avoid:** Run the real controller/hook from both temporary installed roots after fresh install, repair, upgrade, rollback, and recovery.

### Pitfall 7: Current Baseline Failure Is Hidden
**What goes wrong:** New failures are misattributed because `router.registry-build.test.mjs` already has a mode-map mapping failure.  
**How to avoid:** Fix or explicitly isolate that root cause in Wave 0, then record a clean baseline.

### Pitfall 8: Performance Evidence Is Too Small
**What goes wrong:** p95 passes on a tiny index but regresses on realistic local installations.  
**How to avoid:** Generate a deterministic large registry near the existing 257+ record production note, warm it, measure enough samples, and report p95/max/context bytes.

## Code Examples

### Complete tuple identity

```js
// Pattern derived from src/prompt/publish-index.mjs
const members = Object.fromEntries(
  Object.entries(memberBytes).map(([name, bytes]) => [name, { payload_sha256: sha256(bytes) }]),
);
const tupleVersionId = `t1-${sha256(stableStringify(members)).slice(0, 16)}`;
```

### Old-or-new pointer boundary

```js
// Pattern derived from src/prompt/publish-index.mjs
writeAndFsyncAllVersionMembers(versionRoot, memberBytes);
verifyCompleteTuple(versionRoot);
replacePointer(activePath, { schema_version: NEXT_SCHEMA, tuple_version_id: tupleVersionId });
```

These are planning patterns, not new APIs; reuse the repository's existing helpers and error handling. [VERIFIED: source pattern]

## State of the Art

| Old Approach | Current Phase 26 Approach | Impact |
|--------------|---------------------------|--------|
| Registry + compiled routes + orchestration siblings | One complete v1.3 decision tuple | No mixed policy versions. |
| Registry-only full/incremental equivalence | Complete tuple byte equivalence | REL-08 is testable end to end. |
| Separate startup suggestion pointer | Tuple-bound bounded suggestion reference | Optional advice cannot skew release state. |
| Prompt-time capsule mutation | Read-only precompiled projection | Meets locked latency and purity contract. |
| v1.2-only release matrix | v1.3 lifecycle/release evidence | Phase 26 requirements become independently verifiable. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. All implementation claims were checked against live source/tests or locked context. | — | — |

## Open Questions (RESOLVED)

1. **Should health and suggestion be separate siblings or one compact policy projection?**
   - What we know: both must share the tuple version; exact schema is discretionary.
   - **RESOLVED:** Adopt separate bounded `health_policy` and `suggestion_reference` siblings. Their failure semantics differ, both hashes participate in the one tuple identity, and the existing manifest already models sibling hashes.
2. **How should prompt-time state transitions be persisted after removing writes?**
   - What we know: the hook must be read-only; explicit approval/admin seams already exist.
   - **RESOLVED:** The prompt hook returns a bounded acknowledgement/action token only. Persistence occurs exclusively through the existing explicit off-path approval/admin seam; prompt submission performs no write.
3. **Does the current mode-map test failure expose a contract-eligibility regression or a stale fixture?**
   - What we know: 97/98 focused tests pass; mapped subjects are zero in the failing case.
   - **RESOLVED:** Treat this as a production mapping/contract-eligibility regression, not a stale fixture. Wave 0 traces `assembleRegistry -> evaluateEligibility -> mapCandidateRegistry` and repairs the first shared seam that loses or disqualifies stamped subjects; the assertion and eligibility gates remain intact.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Runtime/tests/release runner | yes | 22.22.3 | none |
| npm | Environment only; no packages required | yes | 10.9.8 | not needed |
| Local filesystem durability APIs | publication/lifecycle | yes | Node built-ins | none |
| Graphify snapshot | discovery aid only | yes, stale | 122h / 106 commits behind | live source/tests |

**Missing dependencies with no fallback:** none.  
**Missing dependencies with fallback:** fresh Graphify data; live source and tests are authoritative.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node 22 `node:test` |
| Config file | none |
| Quick run command | `rtk node --test --test-concurrency=1 tests/router.phase26-*.test.mjs` |
| Full suite command | `rtk node --test --test-concurrency=1 tests/*.test.mjs` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-01 | Pure bounded prompt projection | static + integration + perf | phase 26 hot-path test | Wave 0 |
| REL-02 | Background compilation includes every decision projection | unit/integration | phase 26 tuple test | Wave 0 |
| REL-03 | One immutable complete tuple | unit/integration | extend compiled-index/publish tests | existing base, new cases needed |
| REL-04 | Dependency-complete atomic invalidation | table-driven unit/integration | phase 26 invalidation test | Wave 0 |
| REL-05 | Existing guarded lifecycle remains authoritative | integration | lifecycle recovery + watcher + activation suites | existing base |
| REL-06 | Six recommendation kinds survive both runtimes | installed E2E | phase 26 dual-runtime compatibility test | Wave 0 |
| REL-07 | p95/max/context budgets on large registry | isolated benchmark | phase 26 performance test | Wave 0 |
| REL-08 | Full/incremental complete tuple bytes match; crash safe | integration | phase 26 equivalence/recovery test | Wave 0 |
| REL-09 | Approval gates and recommendation fail-open | security/integration | phase 26 authority test | Wave 0 |

### Sampling Rate

- **Per task commit:** focused phase test plus the nearest existing test file.
- **Per wave merge:** all Phase 26 tests plus compiled-index, registry-build, watcher, lifecycle-recovery, autonomous-lifecycle, and perf suites serially.
- **Phase gate:** full serial suite, installed-runtime lifecycle matrix, and isolated large-registry benchmark.

### Wave 0 Gaps

- [ ] Resolve the current mode-map stamping/mapping failure before recording the baseline.
- [ ] Add a complete tuple schema/manifest/identity test.
- [ ] Add the eight-class invalidation matrix.
- [ ] Add a forbidden hot-path import/I/O/mutation gate.
- [ ] Add deterministic large-registry fixture generation.
- [ ] Add Claude/Codex installed-runtime recommendation compatibility matrix.
- [ ] Add release report coverage for REL-01 through REL-09.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local single-user process; no authentication boundary introduced. |
| V3 Session Management | no | No web/session state. |
| V4 Access Control | yes | Explicit approval and existing activation/canary gates control mutations. |
| V5 Input Validation | yes | Exact schemas, bounded reads, path containment, token regexes, hash checks. |
| V6 Cryptography | yes | Node `crypto` SHA-256 for integrity; no custom cryptography. |
| V8 Data Protection | yes | Local-only bounded artifacts, mode 0600 writes, no prompt/history retention in release evidence. |
| V12 Files and Resources | yes | `O_NOFOLLOW`, contained paths, immutable directories, fsync, atomic rename. |
| V14 Configuration | yes | Compatibility versions and manifest schema fail closed. |

### Known Threat Patterns for Local Immutable Publication

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mixed-version tuple / sibling substitution | Tampering | Hash every sibling in manifest and validate before use. |
| Symlink/path escape | Tampering/Elevation | Containment checks, `O_NOFOLLOW`, owned roots. |
| TOCTOU between verification and activation | Tampering | Reverify and atomically replace one pointer under the existing mutation lock. |
| Partial/crashed publication | Denial of Service | Immutable staging, pointer-last commit, verified known-good recovery. |
| Unauthorized policy activation | Elevation of Privilege | Existing verifier, canary, explicit approval, and safety gates. |
| Release report prompt/history leakage | Information Disclosure | Deterministic aggregate evidence only; no raw prompts or local absolute paths. |
| Optional recommendation corrupts dispatch | Denial of Service | Fail-open recommendation projection with last-known-good routing. |

## Sources

### Primary (HIGH confidence)

- Phase 26 `CONTEXT.md`, `ROADMAP.md`, and `REQUIREMENTS.md`.
- `src/prompt/publish-index.mjs`, `src/prompt/compile-index.mjs`.
- `src/registry/build.mjs`, `diff.mjs`, `validate.mjs`, `watcher.mjs`, `activate.mjs`.
- `src/context/prompt-route.mjs`, `src/evolution/perf-measure.mjs`.
- `src/health/thresholds.mjs`, `src/health/canary-bridge.mjs`.
- `src/steward/refresh.mjs`, `src/steward/startup-pointer.mjs`.
- `src/lifecycle/router-lifecycle.mjs`, `src/release/run-release.mjs`.
- Relevant Node tests and the 2026-07-28 focused 98-test run.

### Secondary (MEDIUM confidence)

- Stale Graphify discovery results; used only to locate lifecycle/performance surfaces and corroborated in live source.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - local versions and imports verified.
- Architecture: HIGH - traced through live publisher, loader, watcher, lifecycle, and hook.
- Pitfalls: HIGH - derived from current gaps, existing crash tests, and one reproduced baseline failure.

**Research date:** 2026-07-28  
**Valid until:** 2026-08-27, or until publication/hook/lifecycle code changes.
