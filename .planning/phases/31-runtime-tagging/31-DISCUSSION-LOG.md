# Phase 31: Runtime Tagging — Discussion Log

**Gathered:** 2026-08-01
**Mode:** Auto-generated (`--auto` sub-agent discuss — no interactive user session)

This phase ran in `--auto` mode: all gray areas were auto-selected and resolved with the recommended option in a single pass. No interactive discussion occurred (sub-agent pipeline).

## Auto-Selected Gray Areas (all resolved)

1. **Runtime Detection** — Deterministic zero-hot-path-IO detection via process/env marker read once at module load; default `claude`; fail open. → D-01
2. **Runtime string convention** — Match phase-26 `"claude" | "codex"` values for test parity. → D-02
3. **RUNTIME_CONFIG_DIR resolution** — Replace hardcoded `~/.claude` with runtime-conditional `~/.claude` vs `~/.codex` resolved once at module load. → D-03
4. **Runtime override** — Env override wins over autodetection for tests/install pinning. → D-04
5. **Cache key tagging** — Fold runtime into cache key identity (sibling to Phase-30 fingerprint epoch). → D-05
6. **Telemetry tagging** — Add `runtime` field to every record. → D-06
7. **Per-runtime resolve** — Only active runtime's capabilities/suggestion used. → D-07
8. **Cross-runtime fixture** — Capability maps to local equivalent (PARITY-04), reuse phase-26 provenance shape. → D-08

## Claude's Discretion
- Exact env-marker name/precedence (verify against existing hooks).
- Exact cache-key tuple placement and telemetry field order.

## Deferred
- Full `build-manifest.mjs` Codex walk (`~/.codex` inventory completeness) — deferred by REQUIREMENTS.md line 73.
