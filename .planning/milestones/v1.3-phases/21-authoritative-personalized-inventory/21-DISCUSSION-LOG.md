# Phase 21: Authoritative Personalized Inventory - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-26
**Phase:** 21-authoritative-personalized-inventory
**Areas discussed:** Capability coverage, Reconciliation behavior, Identity and invalidation, Trust and inspection

---

## Capability Coverage

| Decision | Options presented | Selected |
|----------|-------------------|----------|
| Configuration and instruction artifacts | Unified artifact inventory; capabilities plus evidence; separate inventories | Unified artifact inventory ✓ |
| Unknown future types | Opaque normalized record; generic capability record; diagnostic only | Opaque normalized record ✓ |
| Semantic categories | Stable core plus namespaced extensions; fixed core only; adapter-defined categories | Stable core plus namespaced extensions ✓ |
| Compound installations | Container and members; members only; container only | Container and members ✓ |

**User's choice:** Selected every recommended option.
**Notes:** All artifacts remain visible without implying that all are executable.

---

## Reconciliation Behavior

| Decision | Options presented | Selected |
|----------|-------------------|----------|
| Authoritative scan triggers | Startup/periodic/anomaly; startup/anomaly; periodic only | Startup/periodic/anomaly ✓ |
| Incomplete authoritative scan | Retain last complete; publish partial; merge with prior | Retain last complete ✓ |
| Convergence boundary | Canonical semantic snapshot; entire persisted candidate; identities only | Canonical semantic snapshot ✓ |
| Inspectable state | Generation plus freshness; simple freshness; full event history | Generation plus freshness ✓ |

**User's choice:** Selected every recommended option.
**Notes:** Watcher events are optimization signals, never sufficient proof of complete truth.

---

## Identity and Invalidation

| Decision | Options presented | Selected |
|----------|-------------------|----------|
| Rename/move continuity | Declared ID or unique exact fingerprint; high similarity; same name | Declared ID or unique exact fingerprint ✓ |
| Identical live copies | Distinct capability plus relationship evidence; shared identity; quarantine both | Distinct capability plus evidence ✓ |
| Invalidation timing | Same candidate transaction; direct now/transitive later; activation-time pruning | Same candidate transaction ✓ |
| Disabled and replaced records | Preserve inspectability but invalidate dispatch; delay invalidation; remove all history | Preserve inspectability and invalidate dispatch ✓ |

**User's choice:** Selected the first three recommendations, then authorized all remaining recommended choices.
**Notes:** Similarity may inform diagnostics but never transfers identity, trust, or corrections.

---

## Trust and Inspection

| Decision | Options presented | Selected |
|----------|-------------------|----------|
| Symlink handling | Resolve and accept only contained safe targets; reject every symlink; follow runtime behavior | Contained safe targets only ✓ |
| Scope collisions | Separate identities plus adapter precedence evidence; merge by name; global framework precedence | Separate identities plus evidence ✓ |
| Capability-authored text | Untrusted evidence only; trusted metadata by convention; direct policy input | Untrusted evidence only ✓ |
| Inspection detail | Full provenance with secret/body redaction; minimal summary; raw source bodies | Full provenance with redaction ✓ |

**User's choice:** Authorized every recommended option.
**Notes:** The user additionally required proof that the repository works automatically for people with different installed skills, commands, agents, and hooks.

---

## the agent's Discretion

- The user authorized recommended choices for every remaining decision.
- Exact field names, scan cadence, module decomposition, and diagnostic codes remain implementation details, subject to the locked decisions in `21-CONTEXT.md`.

## Deferred Ideas

None.
