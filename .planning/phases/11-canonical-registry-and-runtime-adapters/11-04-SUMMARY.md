---
phase: 11-canonical-registry-and-runtime-adapters
plan: "04"
subsystem: runtime-adapters
tags: [node, esm, claude, codex, markdown, toml]
requires:
  - phase: 11-03
    provides: Deterministic canonical registry builder and installer lifecycle
provides:
  - Versioned Claude native-layout discovery and inert parsing
  - Versioned Codex native-layout discovery including bounded config.toml parsing
  - Deterministic diagnostics for malformed and unsupported recognizable artifacts
affects: [phase-12-change-detection, registry-build, installer]
tech-stack:
  added: []
  patterns: [explicit native layout tables, bounded inert parsers, logical portable provenance]
key-files:
  created: []
  modified: [tests/router.adapters.test.mjs, src/adapters/claude.mjs, src/adapters/codex.mjs]
key-decisions:
  - "Native discovery is driven by explicit runtime layout recognizers while schema-version-1 descriptors remain a supported compatibility layout."
  - "Installer-owned router bindings are lifecycle plumbing and excluded from capability inventory to keep repeated installation byte-stable."
patterns-established:
  - "Recognize before reading: only explicit native layouts reach inert parsers."
  - "Malformed recognizable artifacts become diagnostic records; arbitrary files remain inert."
requirements-completed: [REG-02, ADP-01, ADP-02]
coverage:
  - id: D1
    description: Claude global, plugin, agents-store, project, hook, binding, and dependency native layouts produce portable observations.
    requirement: ADP-01
    verification:
      - kind: integration
        ref: tests/router.adapters.test.mjs#Claude native discovery
        status: pass
    human_judgment: false
  - id: D2
    description: Codex native skills, plugins, agents, hooks, configuration, project scope, and dependencies produce portable observations.
    requirement: ADP-02
    verification:
      - kind: integration
        ref: tests/router.adapters.test.mjs#Codex native discovery
        status: pass
    human_judgment: false
  - id: D3
    description: Malformed, unsupported, escaped, and arbitrary artifacts are handled deterministically without execution or silent disappearance.
    requirement: REG-02
    verification:
      - kind: integration
        ref: node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-build.test.mjs tests/router.settings-diff.test.mjs
        status: pass
    human_judgment: false
duration: 4min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 04: Native Runtime Adapter Gap Closure Summary

**Explicit native Claude and Codex layout tables now parse SKILL.md, runtime metadata, hook bindings, and bounded TOML configuration into deterministic portable registry observations.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-14T20:50:07Z
- **Completed:** 2026-07-14T20:54:18Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Replaced the synthetic-only fixture boundary with representative Claude and Codex native homes and project equivalents.
- Added inert, standard-library parsing for markdown frontmatter, supported JSON metadata, hook bindings, and bounded Codex TOML configuration.
- Preserved native invocation, explicit dependency state, portable logical provenance, realpath containment, deterministic diagnostics, and byte-identical repeated discovery.

## Task Commits

1. **Task 1: Replace synthetic-only fixtures with native runtime layout contracts** - `76f64af` (test, RED)
2. **Task 2: Implement explicit versioned Claude native discovery and parsing** - `401f5fa` (feat, GREEN)
3. **Task 3: Implement explicit versioned Codex native discovery and parsing** - `14adfd3` (feat)
4. **Regression compatibility and lifecycle fixes** - `53dc7a0`, `2e2c648` (fix)

## Files Created/Modified

- `tests/router.adapters.test.mjs` - Native Claude/Codex fixture matrix, malformed-format diagnostics, containment, portability, and repeatability contracts.
- `src/adapters/claude.mjs` - Shared inert parser mechanics and explicit Claude native-layout adapter.
- `src/adapters/codex.mjs` - Explicit Codex native-layout adapter with bounded TOML configuration expansion.

## Decisions Made

- Kept schema-version-1 JSON descriptors as an explicit compatibility layout, not the sole discovery boundary.
- Excluded the installer-owned router hook binding from registry observations because inventorying the installer's own mutation breaks idempotent candidate preflight.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Compatibility] Preserve authoritative identity evidence**
- **Found during:** Plan-level registry verification
- **Issue:** The native parser refactor initially dropped `canonical_identity` and `shared_origin` from legacy descriptors, preventing evidence-gated cross-runtime merging.
- **Fix:** Restored explicit identity evidence during canonical normalization and retained legacy Codex skill recognition.
- **Files modified:** `src/adapters/claude.mjs`, `src/adapters/codex.mjs`
- **Verification:** Full registry integration test passes.
- **Committed in:** `53dc7a0`

**2. [Rule 1 - Lifecycle] Preserve installer idempotency**
- **Found during:** Full repository verification
- **Issue:** The newly recognized Claude settings binding included the installer-owned router hook, so the first install changed the next candidate build.
- **Fix:** Filtered only installer-owned `router.mjs` bindings while retaining user-managed native hook bindings.
- **Files modified:** `src/adapters/claude.mjs`
- **Verification:** Adapter and lifecycle suites pass, including repeat install and CLI idempotency.
- **Committed in:** `2e2c648`

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs). **Impact:** Both fixes preserve established identity and installer contracts without expanding plan scope.

## Issues Encountered

- The full repository suite also reports a sandbox-only `EPERM` when a pre-existing performance test writes to `~/.claude/router/weights.json`; this is outside the plan's files and writable roots. All Phase 11 focused and lifecycle regression suites pass.

## TDD Gate Compliance

- RED: `76f64af` produced three expected failures because native markdown and TOML were silently ignored.
- GREEN: `401f5fa` and `14adfd3` implemented the Claude and Codex native adapters.
- Regression: focused Phase 11 command passed 25/25; adapter suite passed twice byte-identically; adapter plus lifecycle suite passed 18/18.

## User Setup Required

None - no package, service, environment variable, or runtime mutation was added.

## Next Phase Readiness

F-001 and F-002 are closed. Plan 11-05 can close the remaining full-build conflict and rollback gap before Phase 11 verification is rerun.

## Self-Check: PASSED

- All key files exist and all plan commits are present.
- Every task acceptance criterion and plan-level verification command passes.
- Production code remains standard-library-only and reads only explicitly supplied roots.

---
*Phase: 11-canonical-registry-and-runtime-adapters*
*Completed: 2026-07-14*
