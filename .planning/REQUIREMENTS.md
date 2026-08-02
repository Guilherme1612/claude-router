# Requirements: Claude Router — v1.5 Framework-Neutral Adaptive Routing

**Defined:** 2026-07-31
**Core Value:** The user can write the minimum useful prompt and still get the best available workflow automatically, with low token overhead, sub-100ms prompt routing, and no per-prompt external classifier.

## v1 Requirements

### INTENT — Intent-First Routing (framework-neutral)

- [x] **ROUTE-01**: Router maps prompt intent to a capability role and resolves to the first locally-present candidate from a ranked, framework-neutral list — never a hardcoded framework name (works for GSD, superpowers, Gstack, or fully custom command sets)
- [x] **ROUTE-02**: A slash-route suggestion is emitted only when its mode resolves to a manifest-present command OR an explicit resolve-list member is present — the `schema_version` guard hole is closed
- [x] **ROUTE-03**: When the top candidate is absent, the router suppresses it and falls back to the next-best locally-present entry; zero resolvable → silent low tier, never a dead injection
- [x] **ROUTE-04**: High-confidence intent with an empty resolve set may emit one generic fallback line to native capabilities, never a fabricated capability name
- [x] **ROUTE-05**: Resolve semantics are linted (tie handling, near-tie downgrade to med, stale-target quarantine) and covered by the coverage audit-guard

### INVC — Inventory-Change Correctness

- [x] **INVC-01**: `build-manifest.mjs` emits a content-sha256 manifest fingerprint over semantic routing inputs only (timestamps excluded)
- [x] **INVC-02**: Cache keys fold the fingerprint (replacing mtime); adding/updating/removing any skill, plugin, or agent bumps it and cached routes recompute
- [x] **INVC-03**: Calibration is epoch-keyed by the fingerprint; a fingerprint mismatch means mode-map default thresholds win
- [x] **INVC-04**: Watcher scan excludes noise files (sqlite/WAL, plugin-catalog caches); `installed_plugins.json` is the authoritative plugin add/remove signal; plugin add/remove changes the fingerprint
- [x] **INVC-05**: The add/update/remove capability lifecycle (watcher → rebuild → coverage audit → recompute → re-calibrate) is documented and test-verified

### CALIB — Per-Install Auto-Calibration

- [x] **CALIB-01**: Router records a three-state outcome (accepted / rejected / no_signal) correlating suggestion with actual invocation via hashed signature — no raw prompt persistence, no user commands
- [x] **CALIB-02**: Cache-hit suggestions are excluded from calibration evidence
- [x] **CALIB-03**: Per-install thresholds derive from ≥50 real accepted routes via Bayesian blend toward global defaults (min-sample floor, hysteresis, clamp) — never raw proportions
- [x] **CALIB-04**: Derived thresholds live in a separate epoch-gated file, never mutate the curated mode-map; fingerprint mismatch → default thresholds
- [x] **CALIB-05**: The suggestion→invocation observer is additive and does not touch ralph-loop or gsd hooks (coexistence)

### PARITY — Per-Runtime Parity

- [x] **PARITY-01**: Router detects its active runtime (Claude vs Codex) deterministically with zero IO on the hot path
- [x] **PARITY-02**: Telemetry and cache records carry a runtime tag; no cross-runtime cache reuse
- [x] **PARITY-03**: Resolve evaluation uses only the active runtime's present capabilities; only the active runtime's suggestion is injected
- [x] **PARITY-04**: A capability present in one runtime resolves to its local equivalent in the other (cross-runtime fixture)

### PROJ — Per-Project Routing

- [x] **PROJ-01**: Router derives project roots from `~/.claude.json` `projects` keys and includes each project's `.claude/skills` in the manifest — discovery is no longer env-gated to zero live entries
- [x] **PROJ-02**: GRD-02 flips from hard-exclude `scope === 'project'` to cwd-prefix include — a project-scoped skill is suggested only when the active cwd is under its project root (pure string compare, no FS, sub-µs, fail-open)
- [x] **PROJ-03**: Project capability content folds into the manifest fingerprint automatically; adding/removing a project root bumps the epoch

### REL — Release-Gate Cleanup

- [x] **REL-08**: Live-install release verification stage runs the router against a fresh real home in an isolated environment — REL-05/06/07 proven, not simulated
- [x] **REL-09**: Cold-start defaults (no calibration data yet) proven correct on a fresh-account install
- [x] **REL-10**: Orphaned watcher instances cleaned up; `router.safety-release` live-env failures resolved

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Evolution (continued from v1.4)

- **FUT-05**: Full evolution weight tuning (Wilson + decay, disabled-default) — needs n≥200 strong outcomes
- **FUT-06**: Counterfactual shadow log + calibration regression gate (v1.5 ships the shadow-log capture; tuning rails stay deferred)
- **FUT-07**: Telemetry-driven signal_patterns proposals + escape-hatch metric

### Advanced Routing

- **FUT-08**: Confidence-tier recalibration via isotonic/Platt regression — needs ≥200 samples, v2
- **FUT-09**: Multi-intent / clarification triggers, boundary-aware substring matching — v2
- **FUT-10**: Per-entry calibration (per-capability thresholds) — needs n≥200 strong outcomes, v2
- **FUT-11**: In-turn invocation tap (router-owned direct capture beyond shadow-log inference) — only if coexistence review passes

## Out of Scope

| Feature | Reason |
|---------|--------|
| User-facing commands (`/router why`, `/router fix`) | Explicitly dropped by milestone decision |
| Codex manifest completeness (full `~/.codex` walk) | `.codex` not in use; parity ships runtime-tagged shared telemetry + presence via canonical registry runtime variants |
| Per-prompt LLM classifiers | Violate latency, privacy, and token goals |
| Unbounded autonomous mutation | All changes require deterministic validation and rollback |
| Automatic installation of missing external capabilities | Discovery may recommend; installation stays explicit |
| Auto-dispatch on intent match without approval gate | v1.3 approval gate stays mandatory |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROUTE-01 | Phase 32 | Complete |
| ROUTE-02 | Phase 32 | Complete |
| ROUTE-03 | Phase 32 | Complete |
| ROUTE-04 | Phase 32 | Complete |
| ROUTE-05 | Phase 32 | Complete |
| INVC-01 | Phase 30 | Complete |
| INVC-02 | Phase 30 | Complete |
| INVC-03 | Phase 30 | Complete |
| INVC-04 | Phase 30 | Complete |
| INVC-05 | Phase 30 | Complete |
| CALIB-01 | Phase 33 | Complete |
| CALIB-02 | Phase 33 | Complete |
| CALIB-03 | Phase 34 | Complete |
| CALIB-04 | Phase 34 | Complete |
| CALIB-05 | Phase 33 | Complete |
| PARITY-01 | Phase 31 | Complete |
| PARITY-02 | Phase 31 | Complete |
| PARITY-03 | Phase 32 | Complete |
| PARITY-04 | Phase 32 | Complete |
| PROJ-01 | Phase 35 | Complete |
| PROJ-02 | Phase 35 | Complete |
| PROJ-03 | Phase 35 | Complete |
| REL-08 | Phase 36 | Complete |
| REL-09 | Phase 36 | Complete |
| REL-10 | Phase 36 | Complete |

**Coverage:**

- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-31*
*Last updated: 2026-08-01 after v1.5 release-gate verification (25 v1 requirements mapped)*
