---
phase: 12
slug: incremental-change-detection-and-watcher
created: 2026-07-15
status: validated
nyquist_compliant: true
---

# Phase 12 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test` on Node v22.22.3 |
| **Config file** | none |
| **Quick run command** | `node --test tests/router.registry-diff.test.mjs tests/router.registry-build.test.mjs tests/router.registry-watcher.test.mjs` |
| **Full suite command** | `node --test tests/*.test.mjs` |
| **Estimated focused runtime** | under 30 seconds; fake time required for repair intervals |

## Sampling Rate

- **After every task commit:** Run the focused new/modified test file.
- **After every plan wave:** Run `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-build.test.mjs tests/router.registry-watcher.test.mjs tests/router.lifecycle.test.mjs`.
- **Before `$gsd-verify-work`:** `node --test tests/*.test.mjs` must be green.
- **Max feedback latency:** 30 seconds.

## Per-Task Verification Map

| Requirement | Behavior | Test type | Automated command | Initial state |
|-------------|----------|-----------|-------------------|---------------|
| CHG-01 | Add, edit, strong rename, strong move, compound path/content, weak remove-plus-add, disable, dependency, permission, scope, and delete classifications | unit | `node --test tests/router.registry-diff.test.mjs` | Wave 0 gap |
| REG-03 | Incremental and clean full results match byte-for-byte after every mutation step | integration | `node --test tests/router.registry-build.test.mjs` | Existing file; Wave 0 coverage gap |
| CHG-02 | 250 ms debounce, duplicate suppression, <2 s observation, startup/restart recovery, missed-event repair at <=5 min, and shutdown | fake-clock unit/integration | `node --test tests/router.registry-watcher.test.mjs` | Wave 0 gap |

## Wave 0 Requirements

- [ ] `tests/router.registry-diff.test.mjs` — complete CHG-01 matrix plus D-01 through D-04 deterministic event/facet assertions.
- [ ] Extend `tests/router.registry-build.test.mjs` — REG-03 mutation sequence comparing full return bytes after each operation.
- [ ] `tests/router.registry-watcher.test.mjs` — fake-clock/coordinator tests for CHG-02, restart, missed events, dedupe, in-flight changes, and shutdown.
- [ ] Add dependency-injection seams for watch factory, clock/scheduler, scanner, state store, and reconcile callback; no external framework required.

## Detailed Mutation Matrix

| Mutation | Required assertion |
|----------|--------------------|
| Add | one `added`; correct logical root/path; no possible-match diagnostic |
| Content edit | one `content_changed`; identity and provenance path stable |
| Strong rename | one `renamed`; canonical ID preserved; old/new provenance present |
| Strong move | one `moved`; canonical ID preserved; old/new logical location present |
| Rename/move + edit | one structural primary event; ordered `content_changed` facet |
| Weak rename candidate | one `removed` plus one `added`; weak correlation diagnostic is non-authoritative |
| Disable | one `disabled`; any dependency/content changes appear as ordered facets |
| Dependency change | one `dependency_changed`; availability transition preserved |
| Permission change | one `permission_changed`; no OS-specific path/mode in canonical bytes |
| Scope change | strong evidence preserves continuity; otherwise remove-plus-add |
| Delete | one `removed`; incremental result excludes observation and matches full build |

## Watcher Timing Matrix

| Scenario | Clock action | Required result |
|----------|--------------|-----------------|
| Burst of duplicate notifications | advance to just before/after 250 ms | exactly one scan/reconcile |
| Filename omitted | emit event with missing filename | dirty logical root still scanned |
| Continuous notifications | advance through configured maximum latency | reconcile occurs within 2 seconds |
| Missed event | mutate without watcher notification, advance repair clock | detected by 5 minutes |
| Restart with changed tree | load persisted prior snapshot and start | startup repair detects change |
| Corrupt/incompatible state | start controller | clean baseline scan, deterministic diagnostic |
| Event during in-flight scan | emit while reconcile promise pending | one deterministic follow-up, no concurrent duplicate |
| Shutdown | abort/close and advance clocks | no further callbacks or writes |

## Manual-Only Verifications

None. Cross-platform semantics are addressed by treating watcher events as hints and proving scan-based correctness with injected watch events; platform live smoke testing may be added but is not required for requirement coverage.

## Validation Sign-Off

- [ ] Every plan task has an automated verification command.
- [ ] Every phase requirement maps to at least one automated test.
- [ ] D-01 through D-04 each have explicit assertions.
- [ ] Registry parity compares the complete canonical return value after every mutation.
- [ ] Five-minute behavior uses fake time and keeps focused checks under 30 seconds.
- [ ] Full suite passes before phase verification.
