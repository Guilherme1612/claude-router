# Phase 31: Runtime Tagging - Context

**Gathered:** 2026-08-01
**Status:** Ready for planning
**Mode:** Auto-generated (sub-agent driving `--auto` discuss — all gray areas selected, resolved with recommended options)

<domain>
## Phase Boundary

The router deterministically knows which runtime it runs in (Claude vs Codex) and tags every telemetry and cache record with that runtime, so shadow-log correlation and per-install calibration never mix runtimes — fixing the hardcoded `RUNTIME_CONFIG_DIR` gap.

Requirements: PARITY-01, PARITY-02, PARITY-03, PARITY-04

Success criteria from ROADMAP:

  1. Router detects its active runtime (Claude vs Codex) deterministically with zero IO on the hot path (PARITY-01).
  2. Telemetry and cache records carry a runtime tag; no cross-runtime cache reuse (PARITY-02).
  3. Resolve evaluation uses only the active runtime's present capabilities; only the active runtime's suggestion is injected (PARITY-03).
  4. A capability present in one runtime resolves to its local equivalent in the other (cross-runtime fixture) (PARITY-04).

Constraints that MUST hold (project CLAUDE.md):
- Hook stays <100ms hot path and fails open (never throw/block) on any exception.
- Stdlib-only (no npm deps); the hook is a single `.mjs`.
- `tests/router.mjs.snapshot` is the byte-identical mirror of the deployable `~/.claude/hooks/router.mjs` — real code changes to the hook MUST be mirrored into `~/.claude/hooks/router.mjs` and the snapshot updated in lockstep.
- Runtime detection must be deterministic (no ambiguous heuristic).
- Runtime tag folds into telemetry AND cache keys separately for Claude vs Codex so they never share stale routes.
- Commits atomic, ending with `Co-Authored-By: Claude <noreply@anthropic.com>`.

</domain>

<decisions>
## Implementation Decisions

### Runtime Detection (PARITY-01)
- **D-01:** Detect the active runtime deterministically with zero hot-path IO by reading a runtime marker that is already present in the process/env at module load, cached once into a module-level constant. Recommended option chosen: inspect `process.env` for a Codex-specific marker (e.g., `CODEX_HOME` / a Codex-typed `CLAUDE_CODE_ENTRYPOINT`-style env var) and default to `claude` when absent. The detection runs once at module load (not per prompt), so the hot path adds no IO and no per-call branching cost. — **Reversibility:** reversible — swapping the exact env-marker later only touches the one detection function, not cache keys or telemetry. Fall back to `claude` only when the marker is unambiguous; if both/no markers are ambiguous, prefer `claude` (the dominant, verified runtime) and fail open.
- **D-02:** Match the phase-26 test-harness convention: runtime is a string `"claude" | "codex"`, and the dual-runtime test already builds separate `.claude`/`.codex` profile roots. The production detection must return the same string values so tests can assert on parity. — **Reversibility:** reversible.

### Runtime Config Dir Resolution (the `RUNTIME_CONFIG_DIR` gap)
- **D-03:** Replace the hardcoded `RUNTIME_CONFIG_DIR = join(homedir(), '.claude')` with a runtime-conditional resolution: `codex` → `~/.codex`, `claude` → `~/.claude`, resolved once at module load into the same `RUNTIME_CONFIG_DIR` constant. Everything downstream (ROUTER_DIR, HOOKS_DIR, telemetry path, cache path) keeps deriving from this one constant, so tagging the dir automatically isolates the data files per runtime. — **Reversibility:** costly — the constant is referenced by many path derivations, but all flow through the single constant so the change surface is one assignment plus its consumers (already derived).
- **D-04:** Runtime resolution must be overridable for tests and for correct deployment: allow an explicit override (env, e.g. `ROUTER_RUNTIME`) that wins over autodetection, so the install stage can pin the runtime and tests can force either side deterministically. — **Reversibility:** reversible.

### Cache Key / Telemetry Tagging (PARITY-02)
- **D-05:** Fold the runtime tag into the cache key deterministically so Claude and Codex never share stale routes: append the runtime to the existing composite key (next to the Phase-30 `manifest_fingerprint` epoch slot). Cache entries and the LRU key include runtime as part of the key identity, not just metadata. — **Reversibility:** costly — changing the key composition invalidates any pre-existing caches, which is acceptable and intended (older caches are stale by construction), but must be a deliberate single change.
- **D-06:** Add a `runtime` field to every telemetry record (schema extension appended to the existing 12-13 field record). Telemetry stays append-only JSONL; the `runtime` field enables shadow-log correlation and per-install calibration without touching existing field consumers. — **Reversibility:** reversible — additive field; existing parsers that read named fields are unaffected.

### Resolve Capabilities Per Runtime (PARITY-03 / PARITY-04)
- **D-07:** Resolve evaluation must consider only the active runtime's present capabilities (cache + telemetry already runtime-scoped; additionally, capability resolution and mode-map recommendation must not pull capabilities that exist only under the other runtime). Only the active runtime's suggestion is injected into `additionalContext`. — **Reversibility:** reversible.
- **D-08:** A `codex` runtime maps capabilities to their local equivalent form (cross-runtime fixture): the canonical registry entry carries a known runtime-scoped equivalent so a capability present in one runtime resolves locally in the other. Phase 26 already establishes provenance per runtime — reuse that shape. This is the PARITY-04 fixture; it is primarily a resolve-layer behavior + a test fixture, not a second full agent inventory. — **Reversibility:** costly — touches the resolve layer and the canonical registry entry shape; keep the fixture minimal and test-scoped.

### Claude's Discretion
- Exact env-marker name and precedence (D-01/D-04) — pick the marker that is already reliably present in each runtime's process env; verify against the existing hooks. If no reliable Codex marker is available at module load, prefer the `ROUTER_RUNTIME` override + default-to-claude, and document the limitation.
- Exact placement of `runtime` in the cache key tuple and the telemetry record field order — keep consistent and documented.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §PARITY (lines ~32-37) — PARITY-01..04 locked requirements driving this phase.

### Hook / codebase of truth
- `tests/router.mjs.snapshot` — the canonical bundled hook source; byte-identical mirror of deployable `~/.claude/hooks/router.mjs`. Line 104 `RUNTIME_CONFIG_DIR` (the gap); lines 1665-1797 cache key construction; line ~1806 telemetry write. Real hook changes MUST be mirrored here AND into `~/.claude/hooks/router.mjs` in lockstep.
- `build-manifest.mjs` — canonical build/install; line ~49 `ROUTER_HOOK_PATH`, reads `~/.claude/hooks/`; install stage pins runtime (D-04).
- `.planning/ROADMAP.md` — Phase 31 goal + success criteria (source of the 4 PARITY criteria above).

### Phase 26 dual-runtime foundation
- `tests/router.phase26-dual-runtime.test.mjs` — the dual-runtime `.claude`/`.codex` profile test harness and `provenance: [{ runtime }]` shape; reuse for PARITY-04 fixture and runtime detection tests.

### Prior phase context (patterns to reuse)
- `.planning/phases/30-foundation-manifest-fingerprint-watcher-narrowing/30-CONTEXT.md` — Phase 30 fingerprint epoch decision (cache key folds `manifest_fingerprint`); D-05 tags runtime next to it.
- `.planning/STATE.md` — session state / where the milestone stood entering Phase 31.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tests/router.mjs.snapshot` — canonical hook: has `RUNTIME_CONFIG_DIR`, `ROUTER_DIR`, `HOOKS_DIR` constants all derived from `homedir()`; cache key fn `cacheKey(...)`; `promptSignature()`; `logTelemetry()`; `saveCache()`.
- `tests/router.phase26-dual-runtime.test.mjs` — dual-runtime `.claude`/`.codex` profile harness + `provenance: [{ runtime }]`.
- `build-manifest.mjs` — build/install; `ROUTER_HOOK_PATH` env-overridable.

### Established Patterns
- Single `RUNTIME_CONFIG_DIR` constant → all data paths derive from it (isolating config dir per runtime automatically isolates data).
- Cache key already folds the Phase-30 `manifest_fingerprint` epoch slot — runtime tag is a sibling slot.
- Telemetry is append-only JSONL with named fields; adds are backward-compatible.

### Integration Points
- `~/.claude/hooks/router.mjs` — the live deployable hook; must be updated in lockstep with `tests/router.mjs.snapshot`.
- `~/.codex/hooks/router.mjs` — (future) Codex deployment target; Phase 31 wires runtime detection so a Codex install resolves `~/.codex` paths.

</code_context>

<specifics>
## Specific Ideas

- Runtime tag must land in the cache KEY (identity) and the telemetry RECORD (field) separately — the two are distinct mechanisms (cache isolation vs shadow-log/calibration correlation).
- The hook must never throw or block on a detection failure — fail open to `claude`, and on any exception pass through unchanged (project CLAUDE.md fail-open rule).

</specifics>

<deferred>
## Deferred Ideas

- Full `build-manifest.mjs` Codex walk (`~/.codex` inventory completeness): already deferred by REQUIREMENTS.md line 73 note ("`.codex` not in use; parity ships runtime-tagged shared telemetry + presence via canonical registry runtime variants"). Phase 31 ships detection + tagging; the full Codex inventory build is out of scope here.

---

*Phase: 31-Runtime Tagging*
*Context gathered: 2026-08-01*
