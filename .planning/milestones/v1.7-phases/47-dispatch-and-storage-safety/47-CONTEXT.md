# Phase 47: Dispatch and Storage Safety - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the shared dispatch, lease, and receipt trust boundaries so Claude and Codex execute each durable work identity at most once, enforce declared resource limits, and keep private state contained. Production wiring of strategy/learning/migration belongs to Phase 48; repository-wide release repair belongs to Phase 49.

</domain>

<decisions>
## Implementation Decisions

### Durable dispatch identity
- Claim work atomically before spawning, using durable runtime-owned state rather than a process-local Set.
- A persistent marker is never reusable after a successful claim; repeated prompt triggers must observe an already-claimed result without executing.
- Initial dispatch and resume share one durable at-most-once contract across Claude and Codex.

### Enforced resource contracts
- Enforce timeout and bounded output in the shared adapter path, not separately in every caller.
- Termination, truncation, retry exhaustion, and completion-contract failure produce truthful receipt states and evidence.
- Keep prompt submission fire-and-forget and fail-open; enforcement belongs in the detached worker.

### Storage containment and privacy
- Validate identifiers before path construction and verify resolved containment beneath the configured owned root.
- Use explicit private modes for directories and files rather than relying on process umask.
- Serialize lease create/check/write and checkpoint mutation with the existing mutation-lock pattern.

### the agent's Discretion
- Exact helper names and internal factoring, provided no new dependency or speculative abstraction is introduced.
- Exact bounded-output buffering implementation using Node built-ins.

</decisions>

<canonical_refs>
## Canonical References

### Approved milestone contract
- `docs/superpowers/specs/2026-08-09-router-v1.7-runtime-safety-release-truth-design.md` — phase ordering, invariants, validation strategy, and acceptance criteria.
- `.planning/REQUIREMENTS.md` — SAFE-01 through SAFE-05 definitions and traceability.
- `.planning/ROADMAP.md` § Phase 47 — fixed goal and observable success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lease/store.mjs`: existing durable-write and mutation-lock primitives.
- `src/adapters/dispatch/contract.mjs`: shared validation and adapter contract.
- `src/adapters/dispatch/receipt.mjs`: receipt identity, transition, and persistence logic.

### Established Patterns
- Atomic temp-write, fsync, rename, and directory-fsync are already used by lifecycle and state stores.
- Prompt-time routing stays read-only/fail-open; mutations run off the hot path.
- Runtime variants should share mechanisms and differ only at documented adapter seams.

### Integration Points
- `src/runtime/router.mjs` marker-trigger path.
- `src/adapters/dispatch/claude.mjs` and `codex.mjs` invoke/resume worker paths.
- `src/lease/store.mjs` and `src/adapters/dispatch/receipt.mjs` identifier-to-path boundaries.

</code_context>

<specifics>
## Specific Ideas

Use one durable claim boundary and one bounded child-output mechanism. Prefer deletion/consolidation over parallel runtime-specific fixes.

</specifics>

<deferred>
## Deferred Ideas

- Production strategy, learning, migration, and installed-bundle wiring — Phase 48.
- Full baseline repair, CI, Nyquist closeout, archive, and tag reconciliation — Phase 49.

</deferred>

---
*Phase: 47-dispatch-and-storage-safety*
*Context gathered: 2026-08-09*
