---
phase: 11-canonical-registry-and-runtime-adapters
plan: "05"
subsystem: canonical-registry-installer
tags: [node, esm, registry, conflicts, rollback, tdd]
requires:
  - phase: 11-03
    provides: Deterministic registry builder and safe inactive installer
provides:
  - Complete typed material-field conflicts for authoritatively linked variants
  - Exact transactional restoration after post-mutation installer failures
affects: [phase-12-change-detection, phase-13-quarantine, registry-build, installer]
tech-stack:
  added: []
  patterns: [declarative conflict matrix, byte-exact transaction snapshots, injected post-mutation failure seam]
key-files:
  created: []
  modified: [src/registry/build.mjs, tests/router.registry-build.test.mjs, src/lifecycle/router-lifecycle.mjs, tests/router.lifecycle.test.mjs]
key-decisions:
  - "Material linked-variant disagreements use one declarative field-to-severity matrix and retain source-associated canonical values plus fingerprints."
  - "Installer rollback snapshots every mutable file and installer-created directory before the first mutation and restores exact bytes on any later exception."
requirements-completed: [REG-01, REG-02, ADP-01, ADP-02]
duration: 9min
completed: 2026-07-14
status: complete
---

# Phase 11 Plan 05: Complete Conflicts and Transactional Rollback Summary

**Authoritatively linked runtime variants now report every material disagreement deterministically, while installer failures after mutation restore the complete pre-install filesystem and settings state byte-for-byte.**

## Performance

- **Duration:** 9 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added deterministic typed conflicts for name, type, description, lifecycle, dispatchability, invocation, dependencies, and scope without collapsing native runtime variants.
- Included stable source identities, canonical values, fingerprints, conflict type, and allowed severity in every synthesized disagreement.
- Added fresh-install and repair failure injection proofs that compare complete before/after filesystem snapshots.
- Restored settings, replaced owned files, new files, manifest, bindings, and newly created empty directories exactly after post-mutation exceptions.

## Task Commits

1. **TDD RED: conflict and rollback contracts** - `39c20f0`
2. **Task 1: Synthesize complete typed linked-variant conflicts** - `5171cc0`
3. **Task 2: Restore exact pre-install state after post-mutation failure** - `658c2c0`

## Verification

- `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-build.test.mjs tests/router.lifecycle.test.mjs tests/router.settings-diff.test.mjs` — 41/41 passed.
- `node --test tests/*.test.mjs` — 410/410 passed.

## Decisions Made

- Conflict values remain associated with their deterministic source sets, preventing first-record inheritance from hiding disagreement.
- The test seam is a direct programmatic callback invoked only after all installation mutations and manifest write; no CLI or environment bypass exists.

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Threat Review

- T-11-G05-01 and T-11-G05-02 are mitigated by evidence-gated identity plus complete deterministic conflict evidence.
- T-11-G05-03 is mitigated by exact pre-state snapshots and selective transaction restoration.
- T-11-G05-04 is mitigated by a direct callback seam with no production default, CLI flag, or environment switch.
- No additional threat surface was introduced.

## Self-Check: PASSED

- All four modified files exist.
- Commits `39c20f0`, `5171cc0`, and `658c2c0` exist in repository history.
- Focused and full repository suites pass.

---
*Phase: 11-canonical-registry-and-runtime-adapters*
*Completed: 2026-07-14*
