# Phase 12: Incremental Change Detection and Watcher - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 12-incremental-change-detection-and-watcher
**Areas discussed:** Lifecycle classification

---

## Lifecycle Classification

### Rename and move continuity

| Option | Description | Selected |
|--------|-------------|----------|
| One `renamed` or `moved` event | Preserve the canonical ID and include old and new provenance. | ✓ |
| Remove plus add | Use two lifecycle identities and lose explicit continuity. | |
| Both forms | Emit a continuity event plus synthetic remove/add events. | |
| Planner decides | Leave the representation open. | |

**User's choice:** One explicit rename or move event.
**Notes:** Strong identity evidence is required. Canonical identity remains stable and both provenance states are retained.

### Simultaneous path and content changes

| Option | Description | Selected |
|--------|-------------|----------|
| One compound event | Use rename/move as the event and include `content_changed` details. | ✓ |
| Two ordered events | Emit move/rename first and content change second. | |
| Content change only | Treat the path change only as provenance metadata. | |
| Planner decides | Leave the representation open. | |

**User's choice:** One compound event.
**Notes:** One observed mutation should not cause duplicate processing.

### Weak identity evidence

| Option | Description | Selected |
|--------|-------------|----------|
| Remove plus add with possible-match diagnostic | Keep deterministic identity behavior while retaining weak evidence for explanation. | ✓ |
| Plain remove plus add | Discard weak correlation evidence. | |
| Ambiguous change event | Wait for stronger evidence before classifying. | |
| Planner decides | Leave the fallback open. | |

**User's choice:** Remove plus add with a possible-match diagnostic.
**Notes:** The diagnostic is non-authoritative and cannot establish identity continuity.

### Multiple changed dimensions

| Option | Description | Selected |
|--------|-------------|----------|
| Primary event plus ordered facets | Use one deterministic primary classification and preserve all secondary changes. | ✓ |
| Separate ordered events | Emit one event for every changed dimension. | |
| Generic `changed` event | Preserve differences without selecting a primary classification. | |
| Planner decides | Leave compound classification open. | |

**User's choice:** Primary event plus ordered facets.
**Notes:** Every changed dimension remains visible without duplicate event processing.

## Planner's Discretion

- Exact primary-classification precedence and internal field names.
- Incremental build and watcher details not selected for discussion, within the approved design and Phase 12 success criteria.

## Deferred Ideas

None.
