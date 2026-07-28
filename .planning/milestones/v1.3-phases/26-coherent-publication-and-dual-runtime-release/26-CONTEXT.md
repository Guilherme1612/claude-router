# Phase 26: Coherent Publication and Dual-Runtime Release - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

## Phase Boundary

Prove and complete activation of the existing v1.3 decision artifacts as one
fast, compatible, recoverable tuple across Claude and Codex. This phase closes
publication, invalidation, lifecycle, compatibility, and release-evidence gaps;
it does not add new capability types, policy surfaces, or automatic authority.

## Locked Decisions

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

## Implementation Discretion

- Exact internal tuple schema and invalidation representation.
- Test partitioning and benchmark fixture construction.
- Whether existing publication primitives can be extended or only require
  wiring, provided no duplicate release path is introduced.

## Out of Scope

- New dashboards, timelines, telemetry, remote services, or model calls.
- New automatic install, delete, disable, merge, archive, rewrite, activate, or
  publish authority.
- New public capability schema or third-party package ecosystem.

---

*Phase: 26-coherent-publication-and-dual-runtime-release*
*Context gathered: 2026-07-28*
