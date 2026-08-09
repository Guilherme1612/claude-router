---
phase: 48-production-integration
status: gathered
mode: autonomous
---

# Phase 48 Context

## Goal

Installed Claude and Codex runtimes use proportional strategy, safe learning, and durable migration on the real production dispatch path.

## Decisions

- Reuse the existing strategy, learning, migration, dispatch, and lifecycle modules; do not add a parallel orchestration framework.
- Keep prompt routing synchronous and bounded. Strategy preparation belongs at the already off-hot-path native dispatch worker boundary.
- Preserve the existing Phase 38 marker compatibility while ensuring every native worker action carries a validated production strategy contract.
- Treat receipt identity as the learning uniqueness key; duplicate identities are rejected rather than counted.
- Make migration recovery idempotent for committed and recovered generations, including missing or malformed active pointers.
- Deploy the complete transitive module closure to both owned runtime roots.
- Release evidence must be fresh, runtime-specific, and version-bound; old boolean-only evidence is no longer a production release proof.

## Out of Scope

- Redesigning the existing strategy cost model.
- Changing native Claude/Codex authority or protected-effect policy.
- Replacing the existing installer or lifecycle generation model.

## Verification

Focused production-integration tests plus the existing strategy, learning, migration, installer, dispatch, and dual-runtime suites.

