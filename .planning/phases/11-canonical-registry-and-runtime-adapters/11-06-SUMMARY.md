---
phase: 11-canonical-registry-and-runtime-adapters
plan: "06"
subsystem: runtime-adapters
tags: [node, esm, yaml, toml, claude, codex]
requires:
  - phase: 11-04
    provides: Explicit Claude and Codex native layout adapters and deterministic diagnostics
provides:
  - Bounded nested YAML frontmatter parsing for installed runtime skills
  - Bounded multiline TOML parsing for installed Codex agents and configuration
  - Versioned Claude plugin-cache skill discovery with portable package provenance
affects: [phase-12-change-detection, registry-build, runtime-inventory]
tech-stack:
  added: []
  patterns: [bounded native grammar parsers, compact package provenance, inert instruction metadata]
key-files:
  created: []
  modified: [tests/router.adapters.test.mjs, src/adapters/claude.mjs, src/adapters/codex.mjs]
key-decisions:
  - "Installed YAML and TOML subsets are parsed by bounded deterministic standard-library grammars, preserving the zero-dependency contract."
  - "Versioned plugin provenance records compact origin, package, and version fields derived only from logical relative paths."
patterns-established:
  - "Native parser inputs enforce byte and nesting limits and reject duplicate keys, malformed collections, and invalid indentation deterministically."
  - "Multiline agent instructions remain native metadata and never become invocation arguments."
requirements-completed: [REG-01, REG-02, ADP-01, ADP-02]
coverage:
  - id: D1
    description: Representative installed Claude and Codex skills normalize as dispatchable records from nested YAML frontmatter.
    requirement: ADP-01
    verification:
      - kind: integration
        ref: tests/router.adapters.test.mjs#installed nested YAML and multiline TOML normalize as dispatchable native records
        status: pass
    human_judgment: false
  - id: D2
    description: Representative multiline Codex agent TOML remains usable while instructions stay inert.
    requirement: ADP-02
    verification:
      - kind: integration
        ref: tests/router.adapters.test.mjs#installed nested YAML and multiline TOML normalize as dispatchable native records
        status: pass
    human_judgment: false
  - id: D3
    description: Versioned Claude plugin-cache skills retain portable package provenance and containment safety.
    requirement: REG-02
    verification:
      - kind: integration
        ref: tests/router.adapters.test.mjs#installed nested YAML and multiline TOML normalize as dispatchable native records
        status: pass
    human_judgment: false
duration: 3min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 06: Installed Runtime Grammar Gap Closure Summary

**Representative installed Claude and Codex skills and agents now produce deterministic dispatchable inventory through bounded native YAML/TOML parsing and versioned plugin-cache discovery.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-14T21:58:58Z
- **Completed:** 2026-07-14T22:01:05Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added isolated installed-runtime fixtures for nested YAML, multiline TOML, versioned plugin caches, deterministic malformed diagnostics, and portable provenance.
- Implemented bounded native YAML/TOML grammar support without packages or ambient-home reads during tests.
- Closed F-004/F-005 with direct probes against the installed GSD skill, verifier agent, and context-mode cached skill.

## Task Commits

1. **Task 1: Specify representative installed-runtime grammar and layout contracts** - `36d2aca` (test, RED)
2. **Task 2: Parse installed native syntax and discover versioned Claude plugin skills** - `97ec44f` (feat, GREEN)

## Files Created/Modified

- `tests/router.adapters.test.mjs` - Representative installed grammar, cache layout, provenance, repeatability, and malformed-input regressions.
- `src/adapters/claude.mjs` - Bounded nested YAML and multiline TOML parsers plus versioned plugin-cache classification.
- `src/adapters/codex.mjs` - Codex adapter v3 integration with the hardened shared parser path.

## Decisions Made

- Kept installed instructions inert by deriving invocation only from declared command and args fields.
- Derived package identity only from portable relative paths after the existing realpath containment gate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The prompt supplied an `AGENTS.md` indirection to `RTK.md`, but neither file exists in this checkout; execution therefore followed the repository's existing code and GSD plan contracts.

## TDD Gate Compliance

- RED: `36d2aca` failed on the representative nested YAML, multiline TOML, versioned cache, and malformed-native contracts.
- GREEN: `97ec44f` implemented the bounded parser/layout behavior and all regressions passed.

## Verification

- Focused Phase 11 suite: 43/43 passed.
- Full repository suite: 412/412 passed.
- Direct installed artifact probes: GSD skill, verifier agent, and cached context-mode skill all parsed as native usable records.

## User Setup Required

None - no package, service, environment variable, or runtime mutation was added.

## Next Phase Readiness

F-004 and F-005 are closed. Phase 11 is ready for goal-backward re-verification.

## Self-Check: PASSED

- All task-owned files exist and commits `36d2aca` and `97ec44f` are present.
- Focused and full repository suites pass.
- Production changes remain standard-library-only, deterministic, bounded, and explicit-root contained.

---
*Phase: 11-canonical-registry-and-runtime-adapters*
*Completed: 2026-07-14*
