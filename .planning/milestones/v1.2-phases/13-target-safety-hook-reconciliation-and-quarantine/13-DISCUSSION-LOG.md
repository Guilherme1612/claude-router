# Phase 13: Target Safety, Hook Reconciliation, and Quarantine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 13-Target Safety, Hook Reconciliation, and Quarantine
**Areas discussed:** Deleted targets and aliases

---

## Deleted targets and aliases

### Disappearing target

| Option | Description | Selected |
|--------|-------------|----------|
| Disable immediately | Every alias becomes non-dispatchable in the same reconciliation cycle; retain diagnostic history only. | ✓ |
| Temporary tombstone | Disable dispatch immediately but preserve an explicit tombstone record for a bounded period. | |
| Retain until confirmed | Keep aliases active until a later scan confirms deletion. | |

**User's choice:** Disable immediately
**Notes:** No stale alias may remain dispatchable.

### Rename or move continuity

| Option | Description | Selected |
|--------|-------------|----------|
| Verified identity continuity only | Transfer only when stable identity and source evidence prove continuity; otherwise quarantine. | ✓ |
| Content fingerprint match | Transfer when normalized content matches despite incomplete identity evidence. | |
| Never transfer automatically | Disable the old alias and establish aliases independently for the new target. | |

**User's choice:** Verified identity continuity only
**Notes:** Content similarity alone does not authorize alias transfer.

### Malformed or non-invocable target

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed with a structured verdict | Never dispatch; report alias, target identity, failure reason, and corrective action. | ✓ |
| Try another same-name target | Fall back to another runtime or scope record with the same logical name. | |
| Allow optional-schema exceptions | Dispatch when invocation fields appear usable despite validation failure. | |

**User's choice:** Fail closed with a structured verdict
**Notes:** No implicit cross-runtime or cross-scope same-name fallback.

### Multi-alias invalidation

| Option | Description | Selected |
|--------|-------------|----------|
| Atomically invalidate the whole alias set | All aliases stop dispatching together, or active state remains unchanged. | ✓ |
| Invalidate aliases independently | Preserve successful alias changes if another alias fails reconciliation. | |
| Remove only the matched alias | Leave other aliases until independently discovered as stale. | |

**User's choice:** Atomically invalidate the whole alias set
**Notes:** Partial alias state is forbidden.

## Agent's Discretion

- Exact verdict schema, reason-code vocabulary, diagnostic retention format, and alias-index representation.
- Undiscussed implementation details for dependency, scope, collision, ambiguity, and hook reconciliation remain constrained by Phase 13 requirements.

## Deferred Ideas

None.
