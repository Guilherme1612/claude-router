---
phase: 49-validation-and-release-integrity
status: gathered
mode: autonomous
---

# Phase 49 Context

## Goal

The repository is releasable only when deterministic tests, installed runtimes, validation evidence, planning projections, archive, and tag agree.

## Decisions

- Run the full corpus with `--test-concurrency=1`; several existing tests mutate process-wide HOME and runtime fixtures, so parallel file execution is not deterministic evidence.
- Reconcile stale contract assertions to the current receipt and evolution-worker behavior instead of weakening production code.
- Keep performance thresholds intact; report an actual timing miss as a release failure rather than hiding it.
- Add one standard-library-only release gate that runs focused tests, the serial full corpus, fresh dual-runtime installation parity, canonical planning queries, archive visibility, and tag identity.
- Allow a pre-archive phase check for development evidence, but require archive and tag checks in the final release invocation.

## Out of Scope

- External publication or pushing tags.
- Raising performance thresholds.
- Rewriting unrelated legacy test fixtures beyond obsolete contract assertions.

