# Phase 14: Deterministic Mapping, Activation, and Rollback - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 14-deterministic-mapping-activation-and-rollback
**Areas discussed:** Mapping confidence and ambiguity, Mapping precedence and conflicts, Activation and version retention, Rollback and operator CLI

---

## Mapping confidence and ambiguity

| Option | Description | Selected |
|--------|-------------|----------|
| Evidence-backed score and band | Include rule, ordered evidence, rejected alternatives, policy version, and winner margin; keep near ties unmapped. | ✓ |
| Score only | Emit a numeric confidence without a complete explanation. | |
| Always choose highest | Dispatch to the top-scoring candidate even below confidence or margin thresholds. | |

**User's choice:** Recommended option for all decisions.
**Notes:** Safe capabilities may remain active-but-unmapped; bounded background resolution is advisory and must re-enter validation.

---

## Mapping precedence and conflicts

| Option | Description | Selected |
|--------|-------------|----------|
| Strict evidence precedence | Explicit metadata, authoritative identity, route inheritance, then lexical signals; stronger conflicts remain ambiguous. | ✓ |
| Weighted evidence blend | Allow weaker signals to outweigh stronger evidence through aggregate scoring. | |
| Background resolver decides | Send conflicts directly to an ambiguity resolver and accept its selected target. | |

**User's choice:** Recommended option for all decisions.
**Notes:** Targets must exist and be invocable in the exact candidate registry; output must be byte-stable.

---

## Activation and version retention

| Option | Description | Selected |
|--------|-------------|----------|
| Verified automatic activation | Fully persist and verify immutable candidates, then atomically replace `active.json`; retain bounded known-good history. | ✓ |
| Manual approval for every version | Require operator confirmation even when every gate passes. | |
| Replace active files in place | Update registry contents directly without immutable version directories. | |

**User's choice:** Recommended option for all decisions.
**Notes:** Failed, incomplete, or uncertain candidates preserve active bytes; retention may never prune active or last-known-good versions.

---

## Rollback and operator CLI

| Option | Description | Selected |
|--------|-------------|----------|
| Preview plus exact version confirmation | Read-only inspection defaults, stable JSON, verified rollback targets, exact destination ID confirmation, and atomic pointer-only rollback. | ✓ |
| Generic confirmation | Permit rollback with a generic `--yes` after a minimal prompt. | |
| Rebuild during rollback | Recompile or reinterpret the historical version before making it active. | |

**User's choice:** Recommended option for all decisions.
**Notes:** Rollback preserves the displaced version, records a privacy-safe audit event, and leaves the pointer unchanged on failure.

## the agent's Discretion

- The user delegated detailed choices to the recommended safe defaults. Research and planning retain discretion over exact scales, thresholds, naming, retention limits, CLI formatting, and internal schemas within the locked decisions.

## Deferred Ideas

None.
