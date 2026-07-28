# Phase 25: Advisory Stewardship and Guarded Drafts - Context

**Gathered:** 2026-07-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver one bounded, local, advisory suggestion surface backed by Phase 24 health evidence. Users may inspect, dismiss, snooze, or correct a suggestion and may explicitly approve creation of a preview-only remediation draft. This phase never installs, publishes, or silently mutates personal capabilities or routing policy.

</domain>

<decisions>
## Implementation Decisions

### Suggestion Selection
- Return exactly one highest-value suggestion, never an unranked list.
- Startup stays silent unless confidence, novelty, and actionability all pass.
- Deduplicate by stable suggestion fingerprint and enforce a cooldown.
- Startup output is one compact, non-blocking line directing the user to `/router suggestion`.

### Suggestion Interaction
- The detail view includes a compact health overview, evidence, confidence, expected benefit, risk, affected capabilities, and safe next step.
- Users can inspect, dismiss, snooze, and correct a suggestion.
- Corrections create local, versioned correction proposals and never directly change routing.
- When nothing qualifies, report no actionable suggestion without exposing low-confidence findings.

### Guarded Drafts
- A remediation draft is created only after explicit approval.
- Draft preview includes exact paths, semantic changes, dependencies, conflicts, route effects, verification, and rollback implications.
- Drafts remain preview-only; Phase 25 never installs or publishes them.
- Keep the interface scoped to `/router suggestion`; add no dashboard, timeline, finding dump, or maintenance-command suite.

### the agent's Discretion
- Exact deterministic ranking weights and tie-break order, provided the choice remains bounded, versioned, and testable.
- Exact compact text formatting within existing canonical CLI response patterns.
- Local file layout under the existing Router-owned state root.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/health/catalog.mjs` already emits bounded observations with reason codes, confidence, affected capability IDs, evidence windows, and non-destructive remedies.
- `src/health/score.mjs` and `src/health/thresholds.mjs` provide opportunity-aware scoring and the existing cooldown constant.
- `src/cli/router-control.mjs` provides canonical result envelopes, usage handling, preview/execute separation, and exact-confirmation patterns.
- `src/registry/activate.mjs` provides stale-preview and exact-confirmation patterns to mirror without granting Phase 25 publication authority.

### Established Patterns
- Stdlib-only ESM modules with frozen enums, bounded records, stable fingerprints, atomic 0600 state writes, and fail-closed mutation gates.
- Recommendation-only eligibility remains distinct from dispatch authority.
- Local/private evidence only; no prompt retention, raw telemetry export, network request, or additional model call.

### Integration Points
- Read Phase 24 catalog and score projections as evidence, never as mutation authority.
- Add the suggestion command family to `runRouterControl` using the canonical response envelope.
- Keep draft and interaction state under the Router-owned local root, isolated from authoritative registry and active publication artifacts.

</code_context>

<specifics>
## Specific Ideas

- Startup should be quiet by default and show only a single compact pointer when a genuinely actionable observation exists.
- `/router suggestion` is the sole detailed interaction surface.
- Approval authorizes draft creation only, not installation or publication.

</specifics>

<deferred>
## Deferred Ideas

- Dashboard, timeline, per-session summary, unranked finding dump, and maintenance-command suite are explicitly out of scope.
- Actual installation, publication, or automatic capability mutation remains outside Phase 25.

</deferred>
