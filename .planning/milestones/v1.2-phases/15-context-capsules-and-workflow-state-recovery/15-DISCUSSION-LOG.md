# Phase 15: Context Capsules and Workflow-State Recovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 15-context-capsules-and-workflow-state-recovery
**Areas discussed:** Capsule contents and bounds, Workflow identity and ambiguity, Freshness and recovery, Explicit override behavior

---

## Capsule contents and bounds

| Option | Description | Selected |
|--------|-------------|----------|
| Bounded structured index | Versioned identities, compact summaries, references, blockers, and freshness witnesses; no raw prompts or full documents | ✓ |
| Rich session snapshot | Persist expanded document excerpts, tool output, and conversational context | |
| Pointer only | Store only a workflow identifier and recover every other field on demand | |

**User's choice:** Select the recommended option on everything.
**Notes:** Applied bounded structured fields, deterministic limits, atomic local persistence, and small last-known-good retention.

---

## Workflow identity and ambiguity

| Option | Description | Selected |
|--------|-------------|----------|
| Strict unique identity | Resume only when stable scope, goal, workflow position, and live state identify one next action; otherwise ask one focused question | ✓ |
| Best-score guess | Choose the highest-confidence workflow even when a close alternative remains | |
| Always confirm | Ask the user before every referential continuation | |

**User's choice:** Select the recommended option on everything.
**Notes:** Minimal prompts resume automatically only on unique convergence and never broaden authorization or revive terminal work.

---

## Freshness and recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Validate and bounded-refresh | Check schema and witnesses, then rebuild required fields from explicit and authoritative state in strict precedence | ✓ |
| Trust until failure | Use stored capsule state unless the resumed workflow throws an error | |
| Full rescan | Reload the complete planning directory and relevant documents for every continuation | |

**User's choice:** Select the recommended option on everything.
**Notes:** Recovery stays local and read-bounded; stale/corrupt state never silently outranks authoritative sources.

---

## Explicit override behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit instruction wins | Replace conflicting active intent, retain only bounded supersession metadata, and clarify only one missing discriminator | ✓ |
| Merge old and new goals | Combine capsule state with the new instruction into one continuing workflow | |
| Capsule continuity wins | Require explicit cancellation before accepting a conflicting instruction | |

**User's choice:** Select the recommended option on everything.
**Notes:** Completion, cancellation, and supersession remain terminal unless the user explicitly identifies the prior workflow.

## Planner's Discretion

- Exact internal module/field names, numeric bounds, reason codes, compact diagnostics, and focused-question wording within the locked behavior.

## Deferred Ideas

- Cross-machine synchronization, Phase 16 workflow/capability orchestration and context budgets, and shared multi-user policy.
