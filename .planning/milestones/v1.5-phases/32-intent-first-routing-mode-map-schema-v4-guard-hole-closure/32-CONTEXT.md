# Phase 32: Intent-First Routing (mode-map schema v4 + guard-hole closure) - Context

**Gathered:** 2026-08-01
**Status:** Ready for planning
**Mode:** Auto-generated (workflow.skip_discuss=true — minimal context generated directly from ROADMAP goal)

<domain>
## Phase Boundary

The router maps intent to a capability role and resolves to the first locally-present candidate from a ranked, framework-neutral list — never a hardcoded framework name — with the `schema_version` guard hole closed so no slash suggestion ships unless it can resolve.

Requirements: ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04, ROUTE-05, PARITY-03, PARITY-04

Success criteria from ROADMAP:

  1. A fixture manifest with no `gsd-*` commands produces ZERO `gsd-*` slash suggestions — the `schema_version` guard hole is closed; a slash route is emitted only when its mode resolves to a manifest-present command OR an explicit resolve-list member is present.
  2. When the top-ranked candidate is absent from the current manifest, the router suppresses it and falls back to the next-best locally-present entry; when zero entries resolve, routing is silent (low tier) — never a dead injection.
  3. A high-confidence intent with an empty resolve set emits at most one generic fallback line to native capabilities — never a fabricated capability name.
  4. The same intent resolves to the first locally-present candidate by capability role — a GSD fixture resolves to a `gsd-*` command, a superpowers/Gstack/custom fixture to its local equivalent; resolve evaluation uses only the active runtime's present capabilities, only the active runtime's suggestion is injected, and a capability present in one runtime resolves to its local equivalent in the other (cross-runtime fixture).
  5. Resolve lists pass a tie-lint CI gate (near-tie downgrades to `med`, stale-target quarantine) and are covered by the coverage audit-guard's forward-orphan check; warm p95 stays <40ms / max <100ms with the new resolve-first hot path.

Constraints that MUST hold (project CLAUDE.md):
- Hook stays <100ms hot path and fails open (never throw/block) on any exception.
- Stdlib-only (no npm deps); the hook is a single `.mjs`.
- `tests/router.mjs.snapshot` is the byte-identical mirror of the deployable `~/.claude/hooks/router.mjs` — real code changes MUST be mirrored into `~/.claude/hooks/router.mjs` and the snapshot updated in lockstep.
- Commits atomic, ending with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- No hardcoded framework names in resolve; framework-neutral ranked list.

</domain>

<code_context>
## Existing Code Insights

### Guard hole lives in THREE sites (code-verified)
- `intentionalSchemaRoute = mode && mode === id && modeMap?.schema_version` at router.mjs:721 AND router.mjs:806.
- `schemaRoute = mode && mode === route && Boolean(modeMap.schema_version)` at src/coverage/audit.mjs:142.
- Closure MUST land in the coverage audit-guard too. Add a schema_version-SET fixture test first — the hole is untested (existing fixture omits schema_version), so a RED test locks the closure.

### Red herring
- `src/context/resolve.mjs` is workflow-state capsules, NOT capability resolve — ignore for this phase's resolve semantics.

### Greenfield
- ROUTE-01/03/04/05 are all-greenfield.
- Phase 26 establishes `provenance: [{ runtime }]` and dual-runtime `.claude`/`.codex` profile harness — reuse for PARITY-03/04 cross-runtime fixtures.
- Phase 30 established `manifest_fingerprint` epoch in cache key.

</code_context>

<deferred>
## Deferred Ideas

- Full `build-manifest.mjs` Codex walk (`.codex` inventory completeness): already deferred by REQUIREMENTS.md (~/.codex not in use; parity ships runtime-tagged presence). Out of scope here.

---

*Phase: 32-Intent-First Routing (mode-map schema v4 + guard-hole closure)*
*Context gathered: 2026-08-01*
