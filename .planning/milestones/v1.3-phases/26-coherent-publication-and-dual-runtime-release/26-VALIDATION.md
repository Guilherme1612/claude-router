---
phase: 26
slug: coherent-publication-and-dual-runtime-release
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-28
---

# Phase 26 — Validation Strategy

> Pre-execution Nyquist contract. A requirement is green only when its
> behavioral test exists, exercises the production seam, and the listed command
> exits zero. Source shape, mocks alone, or a release report without underlying
> executable evidence do not qualify.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` with `node:assert/strict` |
| **Config file** | none |
| **Test pattern** | `tests/router.*.test.mjs`; temporary owned roots; injected crash/I/O seams; canonical byte snapshots |
| **Focused command** | `rtk node --test --test-concurrency=1 tests/router.phase26-*.test.mjs` |
| **Lifecycle gate** | `rtk node --test --test-concurrency=1 tests/router.phase26-dual-runtime.test.mjs tests/router.autonomous-lifecycle.test.mjs tests/router.lifecycle-recovery.test.mjs tests/router.installer-coexistence.test.mjs tests/router.lifecycle.test.mjs` |
| **Phase gate** | `rtk node --test --test-concurrency=1 tests/router.phase26-*.test.mjs tests/router.compiled-index.test.mjs tests/router.compiled-index.schema2.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs tests/router.approval.test.mjs tests/router.safety-release.test.mjs` |
| **Repository regression gate** | `rtk node --test --test-concurrency=1 tests/*.test.mjs` |

Lifecycle and installation suites must remain serial because they exercise
shared controller and installed-root state. The latency test must run alone so
concurrent test load cannot become release evidence.

## Sampling Rate

- After each task: run that task's exact command below.
- After each plan: run all Phase 26 files created so far plus the named adjacent
  regression files, serially.
- Before verification: run the focused gate, lifecycle gate, isolated
  large-registry latency gate, phase gate, and full serial repository gate.
- No skipped, todo, mocked-only, or source-inspection-only Phase 26 test counts
  as requirement coverage.
- A mixed tuple, changed active pointer after injected failure, mutation without
  exact approval, absent installed-runtime recommendation kind, p95 at or above
  25 ms, any route at or above 100 ms, or context-budget overflow is a blocker.

## Requirement-to-Test Map

| Requirement | Observable behavior that must fail when broken | Planned behavioral test | Command |
|-------------|-----------------------------------------------|-------------------------|---------|
| REL-01 | A real prompt route reads only the bounded active tuple projection and performs no discovery, directory enumeration, manifest parsing, history/health computation, graph traversal, write, network request, or model call. Corrupt optional recommendation data remains silent while verified routing still resolves. | `router.phase26-hot-path`: instrumented I/O seam plus deployed-hook integration, forbidden-call traps, fixed read bounds, protected-tree byte snapshot, and fail-open optional projection case. | `rtk node --test tests/router.phase26-hot-path.test.mjs tests/router.context-prompt-integration.test.mjs` |
| REL-02 | One background build emits bounded contracts, relationships, intent policy, workflow routes/local equivalents, health policy, and suggestion reference into the existing prompt tuple; removing any required projection makes the candidate unverifiable. | `router.phase26-tuple`: production build/publish/load round trip with every projection and incomplete-member rejection. | `rtk node --test tests/router.phase26-tuple.test.mjs --test-name-pattern="background|projection|complete"` |
| REL-03 | All decision artifacts share one content-derived tuple ID and one manifest; readers can observe only the complete old tuple or complete new tuple, never mixed siblings. Every version member is immutable and hash-verified. | `router.phase26-tuple`: manifest membership/hash/identity, immutable version directory, sibling substitution, and concurrent old-or-new reader assertions. | `rtk node --test tests/router.phase26-tuple.test.mjs --test-name-pattern="immutable|manifest|mixed|old-or-new"` |
| REL-04 | Each node, edge, dependency, adapter, inference-rule, manifest, correction, and negative-evidence change invalidates the exact affected transitive members; each rebuild publishes all affected members atomically. Unrelated changes leave deterministic unaffected bytes unchanged. | `router.phase26-invalidation`: table-driven eight-class matrix through production reconciliation and tuple publication, including transitive dependents and pointer-boundary atomicity. | `rtk node --test tests/router.phase26-invalidation.test.mjs` |
| REL-05 | Candidate changes cannot activate before verifier and canary success; failure at build, member write, verify, canary, pointer replacement, or post-activation reload leaves/reinstates verified last-known-good. Rollback and recovery restore the complete tuple. | `router.phase26-lifecycle`: injected failure matrix through watcher/activation/publisher plus existing crash/recovery suites. | `rtk node --test --test-concurrency=1 tests/router.phase26-lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs tests/router.lifecycle-recovery.test.mjs` |
| REL-06 | Command, skill, agent, workflow, MCP, and tool recommendations all survive compile, install, load, and actual prompt routing under fresh Claude-only, Codex-only, and combined installed roots. Repair and upgrade preserve unrelated owned/runtime files. | `router.phase26-dual-runtime`: six-kind by three-install-profile matrix invoking deployed controller/hook bytes, not source imports. | `rtk node --test --test-concurrency=1 tests/router.phase26-dual-runtime.test.mjs tests/router.installer-coexistence.test.mjs tests/router.autonomous-lifecycle.test.mjs` |
| REL-07 | After warmup against a deterministic realistic large local registry, real installed-route measurements report p95 below 25 ms, every sample below 100 ms, and UTF-8 injected context within existing byte/token budgets for both runtimes and all six recommendation kinds. | `router.phase26-performance`: generated large mixed registry, real publish/load/route seam, adequate warmup/sample count, emitted `RELEASE_METRICS`, exact threshold assertions. | `rtk node --test tests/router.phase26-performance.test.mjs` |
| REL-08 | Full and incremental acquisition from equivalent inputs produce byte-identical bytes for every tuple member, manifest, and tuple ID across reordered/coalesced/duplicated events. Injected failure at every pre-pointer stage cannot change active bytes. | `router.phase26-equivalence`: permutations and event-shape matrix through both production builders; complete member-byte comparison and crash-before-pointer snapshot. | `rtk node --test tests/router.phase26-equivalence.test.mjs tests/router.registry-reconcile.test.mjs` |
| REL-09 | Missing/stale/mismatched approval blocks every automatic mutation without byte changes. Exact fresh approval still passes existing safety gates. Suggestion corruption/failure suppresses advice only and preserves verified active or known-good routing. | `router.phase26-authority`: approval binding/no-write matrix, safety gate integration, recommendation failure injection, and routing continuity. | `rtk node --test tests/router.phase26-authority.test.mjs tests/router.approval.test.mjs tests/router.safety-release.test.mjs` |

## Likely Plan and Task Verification Map

Task identifiers are provisional until planning is finalized. Plans may rename
tasks, but each behavioral owner and command must be preserved.

| Task ID | Wave | Requirements | Test Type | Behavioral focus | Automated command | File exists | Status |
|---------|------|--------------|-----------|------------------|-------------------|-------------|--------|
| 26-01-01 | 1 | REL-02, REL-03 | unit/integration | Complete bounded tuple schema, member hashes, content-derived identity, immutable publication, mixed/incomplete rejection | `rtk node --test tests/router.phase26-tuple.test.mjs` | no — task creates | pending |
| 26-01-02 | 1 | REL-01, REL-02 | integration/security | Background-only compilation and one bounded read-only prompt projection with trapped forbidden I/O/calls | `rtk node --test tests/router.phase26-hot-path.test.mjs tests/router.context-prompt-integration.test.mjs` | no — task creates | pending |
| 26-02-01 | 2 | REL-04 | unit/integration | Eight invalidation classes, transitive dependency closure, unaffected-byte stability, atomic old-or-new visibility | `rtk node --test tests/router.phase26-invalidation.test.mjs` | no — task creates | pending |
| 26-02-02 | 2 | REL-08 | integration | Full/incremental complete-tuple byte equivalence across event permutations, duplication, coalescing, and missed-event reconciliation | `rtk node --test tests/router.phase26-equivalence.test.mjs tests/router.registry-reconcile.test.mjs` | no — task creates | pending |
| 26-03-01 | 3 | REL-05, REL-08 | integration | Verifier/canary/pointer ordering, pre-pointer failure matrix, last-known-good, rollback, recovery | `rtk node --test --test-concurrency=1 tests/router.phase26-lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs tests/router.lifecycle-recovery.test.mjs` | no — task creates | pending |
| 26-03-02 | 3 | REL-06 | installed E2E | Six recommendation kinds through actual fresh Claude, Codex, and combined installs; repair/upgrade compatibility | `rtk node --test --test-concurrency=1 tests/router.phase26-dual-runtime.test.mjs tests/router.installer-coexistence.test.mjs tests/router.autonomous-lifecycle.test.mjs` | no — task creates | pending |
| 26-03-03 | 3 | REL-09 | security/integration | Fresh exact approval and safety gates for mutations; optional recommendation fail-open with active/known-good routing intact | `rtk node --test tests/router.phase26-authority.test.mjs tests/router.approval.test.mjs tests/router.safety-release.test.mjs` | no — task creates | pending |
| 26-04-01 | 4 | REL-07 | isolated performance/E2E | Deterministic realistic large mixed registry, actual installed hook route, p95/max/context budgets, both runtimes and six kinds | `rtk node --test tests/router.phase26-performance.test.mjs` | no — task creates | pending |
| 26-04-02 | 4 | REL-01–09 | release integration | Release runner consumes actual Phase 26 tuple, lifecycle, compatibility, authority, and isolated metric evidence; missing/stale evidence fails closed | `rtk node --test --test-concurrency=1 tests/router.phase26-release.test.mjs tests/router.v12-release.test.mjs` | no — task creates | pending |

## Mandatory Adversarial Matrices

### Tuple atomicity and invalidation

| Matrix | Cases | Required assertion |
|--------|-------|--------------------|
| Change class | node, edge, dependency, adapter, inference rule, manifest, correction, negative evidence | All affected transitive tuple member bytes and tuple ID change together; active reads are entirely old or entirely new. |
| Failure point | build, each member write, manifest write, verification, canary, pointer replacement, reload | Active pointer and routed result remain byte-identical to verified old/known-good tuple unless the complete new tuple commits and reloads. |
| Event delivery | ordered, reordered, duplicated, coalesced, missed then authoritative reconcile | Full and incremental complete tuple members, manifest bytes, fingerprints, and ID are identical. |
| Tamper | removed sibling, substituted sibling, hash mismatch, unknown member, symlink, oversized member, mixed tuple IDs | Loader rejects candidate; optional suggestion alone may disappear, but no unverified dispatch authority is exposed. |

### Installed dual-runtime compatibility

| Runtime profile | Recommendation kinds | Operations |
|-----------------|----------------------|------------|
| Claude only | command, skill, agent, workflow, MCP, tool | fresh install, route, repair, upgrade, rollback, recovery |
| Codex only | command, skill, agent, workflow, MCP, tool | fresh install, route, repair, upgrade, rollback, recovery |
| Claude + Codex | command, skill, agent, workflow, MCP, tool | fresh install, route both deployed hooks/controllers, repair, upgrade, rollback, recovery |

The tests must execute installed generation files from temporary runtime roots
and assert unrelated user files/configuration remain byte-identical.

### Realistic large-registry performance

- Generate records deterministically from the existing inventory fixture helper;
  do not hand-maintain a large fixture.
- Use a mixed Claude/Codex registry at least as large as the documented local
  installation (minimum 300 normalized records), including every recommendation
  kind and representative contracts/edges/workflows.
- Publish and load the real complete tuple, then invoke the real deployed prompt
  route after warmup for enough deterministic samples to calculate nearest-rank
  p95 (minimum 20 measured routes per representative case).
- Assert `warm.p95_ms < 25`, every observed `elapsed_ms < 100`, and each emitted
  UTF-8 context is within the existing byte and token budgets.
- Run this file alone and emit machine-readable `RELEASE_METRICS`; never accept a
  concurrently measured full-suite duration as latency evidence.

## Cross-Plan and Phase Invariants

| Invariant | Required executable assertion | Owning file | Gate |
|-----------|-------------------------------|-------------|------|
| One publication authority | Production background builder reaches the existing publisher once; no second active pointer or alternate release directory appears. | `tests/router.phase26-tuple.test.mjs` | phase gate |
| Complete tuple identity | Registry, contracts, relationships, intent, workflows/equivalents, health, and suggestion hashes all contribute to the same tuple ID and manifest. | `tests/router.phase26-tuple.test.mjs` | phase gate |
| Old-or-new visibility | Concurrent reads during publication return only a fully verified old or new tuple, never mixed member versions. | `tests/router.phase26-tuple.test.mjs`, `tests/router.phase26-invalidation.test.mjs` | phase gate |
| Dependency-complete invalidation | Every required change class has a positive affected-member case, a transitive dependent case, and an unrelated-byte-stability control. | `tests/router.phase26-invalidation.test.mjs` | phase gate |
| Complete build equivalence | Full and incremental comparisons cover every emitted member and manifest byte, not only registry semantics. | `tests/router.phase26-equivalence.test.mjs` | phase gate |
| Partial work cannot activate | Failure injection before verified pointer commit preserves active pointer, active route result, and known-good bytes. | `tests/router.phase26-equivalence.test.mjs`, `tests/router.phase26-lifecycle.test.mjs` | phase gate |
| Pure prompt path | Forbidden I/O/call traps remain armed while a real deployed route succeeds from bounded tuple projections. | `tests/router.phase26-hot-path.test.mjs` | phase gate |
| Optional advice is non-authoritative | Missing/corrupt suggestion reference removes advice only; dispatch remains from verified active/known-good tuple. | `tests/router.phase26-hot-path.test.mjs`, `tests/router.phase26-authority.test.mjs` | phase gate |
| Existing safety authority | Mutation requires fresh exact approval plus existing verifier/canary/safety gates; no Phase 26 artifact grants authority. | `tests/router.phase26-authority.test.mjs` | phase gate |
| Installed runtime truth | All six kinds route through actual deployed Claude and Codex generation files after lifecycle operations. | `tests/router.phase26-dual-runtime.test.mjs` | lifecycle gate |
| Release evidence integrity | Release runner fails when any REL-01–09 evidence or isolated metric is missing, stale, skipped, or over budget. | `tests/router.phase26-release.test.mjs` | release gate |

## Wave 0 Requirements

No dependency, framework, configuration, or parallel release path is required.
Create these focused behavioral files before implementation:

- `tests/router.phase26-tuple.test.mjs`
- `tests/router.phase26-hot-path.test.mjs`
- `tests/router.phase26-invalidation.test.mjs`
- `tests/router.phase26-equivalence.test.mjs`
- `tests/router.phase26-lifecycle.test.mjs`
- `tests/router.phase26-dual-runtime.test.mjs`
- `tests/router.phase26-authority.test.mjs`
- `tests/router.phase26-performance.test.mjs`
- `tests/router.phase26-release.test.mjs`

`wave_0_complete` becomes true only after every file contains its mapped
failure-capable behavioral assertions and has been observed failing for the
missing Phase 26 behavior. Empty stubs and tests that only inspect source text
do not qualify.

## Manual-Only Verifications

None. Tuple bytes, pointer atomicity, injected crashes, installed runtime
execution, compatibility, permissions, approval binding, fail-open behavior,
latency, and context budgets are automatable.

## Phase Gate Commands

```bash
rtk node --test --test-concurrency=1 tests/router.phase26-tuple.test.mjs tests/router.phase26-hot-path.test.mjs
rtk node --test --test-concurrency=1 tests/router.phase26-invalidation.test.mjs tests/router.phase26-equivalence.test.mjs tests/router.registry-reconcile.test.mjs
rtk node --test --test-concurrency=1 tests/router.phase26-lifecycle.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs tests/router.lifecycle-recovery.test.mjs
rtk node --test --test-concurrency=1 tests/router.phase26-dual-runtime.test.mjs tests/router.installer-coexistence.test.mjs tests/router.autonomous-lifecycle.test.mjs
rtk node --test --test-concurrency=1 tests/router.phase26-authority.test.mjs tests/router.approval.test.mjs tests/router.safety-release.test.mjs
rtk node --test tests/router.phase26-performance.test.mjs
rtk node --test --test-concurrency=1 tests/router.phase26-release.test.mjs tests/router.v12-release.test.mjs
rtk node --test --test-concurrency=1 tests/router.phase26-*.test.mjs tests/router.compiled-index.test.mjs tests/router.compiled-index.schema2.test.mjs tests/router.registry-reconcile.test.mjs tests/router.registry-watcher.test.mjs tests/router.registry-activate.test.mjs tests/router.approval.test.mjs tests/router.safety-release.test.mjs
rtk node --test --test-concurrency=1 tests/*.test.mjs
```

## Validation Sign-Off

- [x] REL-01 through REL-09 each have a runnable planned behavioral test.
- [x] Every likely plan task has a non-watch automated command.
- [x] Tuple atomicity, all eight invalidation classes, full/incremental complete
  byte equivalence, partial-failure isolation, and old-or-new visibility have
  explicit adversarial coverage.
- [x] Fresh install, repair, upgrade, rollback, recovery, and actual deployed
  runtime activation cover Claude and Codex with all six recommendation kinds.
- [x] A deterministic realistic large-registry benchmark owns p95, maximum-route,
  byte-budget, and token-budget evidence.
- [x] Existing publisher, verifier, canary, activation, rollback, recovery,
  lifecycle, adapter, fixture, and metric primitives are reused.
- [ ] Planned Phase 26 test files exist and have been observed failing before
  implementation.
- [ ] Focused, lifecycle, authority, release, and isolated performance gates are
  green.
- [ ] Full serial repository gate is green.

**Approval:** strategy approved 2026-07-28; execution evidence pending.
