---
phase: 31-runtime-tagging
reviewed: 2026-08-01T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - src/health/observe.mjs
  - src/health/outcome-schema.mjs
  - src/evolution/evidence.mjs
  - src/evolution/telemetry-bridge.mjs
  - tests/router.health.outcome-schema.test.mjs
  - tests/router.health.observe.test.mjs
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 31: Code Review Re-check (post-fix)

**Reviewed:** 2026-08-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** clean

## Summary

Adversarial re-review of the Phase 31 "Runtime Tagging" changes AFTER the three
findings in `31-REVIEW.md` (WR-01, WR-02, IN-01) were fixed and committed (7bffed8,
6807a25, f89ecfe + TDD test commits f2ff8f5, fce2b6b). This re-check confirms the
fixes resolved each finding and introduced no regressions. All fixes verified against
the source; all verification requirements pass.

Both formerly-Warning findings are confirmed resolved at the code level, IN-01 was
addressed by documentation (the accepted forward-compat option), and the test suite is
green. **Verdict: clean.**

## Verification Checklist

**(a) Mirror parity** — PASS.
`cmp tests/router.mjs.snapshot ~/.claude/hooks/router.mjs` → **IDENTICAL**. The live
hook was not touched and remains byte-identical to the snapshot.

**(b) runtime enum check is null-tolerant for the observer's epoch:null records** — PASS.
Both validators guard the enum/token checks with `!== null && !== undefined` before
enforcing, so the observer's producer shape (`runtime: 'claude', epoch: null` from
`telemetryRecord.runtime ?? null / epoch ?? null`) passes untouched:
- `outcome-schema.mjs:121-122`
- `evidence.mjs:58-59`
End-to-end observe test asserts `outcomes[0].epoch === null` is accepted
(`router.health.observe.test.mjs:90`).

**(c) the two new fields are correctly bounded in BOTH validators** — PASS.
- `outcome-schema.mjs:112` adds `'runtime'` and `'epoch'` to the generic `field_too_long`
  (>128 chars) loop; `:121` enum-validates `runtime` against `RUNTIMES = {claude, codex}`
  (`invalid_runtime`); `:122` bounds `epoch` via `boundedToken(epoch, 64)` (`invalid_epoch`).
- `evidence.mjs:55-57` adds the same `field_too_long` loop for both; `:58` enum-validates
  `runtime`; `:59` bounds `epoch` via `boundedToken(epoch, 64)`.
- Both files now carry a named `RUNTIMES` set (`outcome-schema.mjs:34`, `evidence.mjs:19`).
- Tests assert too-long, invalid-enum, and valid cases on both boundaries
  (`router.health.outcome-schema.test.mjs:162-172`, `router.telemetry-bridge.test.mjs:139-160`).

**(d) observe.mjs forwards runtime/epoch in BOTH producers, and fingerprint covers them** — PASS.
- `deriveSelectedOutcome` canonicalRecord: `observe.mjs:92-93`
  (`runtime: telemetryRecord.runtime ?? null`, `epoch: telemetryRecord.epoch ?? null`).
- `buildOutcomeRecord` canonicalRecord: `observe.mjs:242-243` (identical forwarding).
- In both, the fingerprint is computed over `canonicalRecord` AFTER these fields are
  added (`observe.mjs:95`, `observe.mjs:245`), so `runtime`/`epoch` are included in the
  fingerprint and pass the `fingerprint_mismatch` recompute in `validateOutcomeEnvelope`.
- The pending-selection reconciliation snapshot also preserves them
  (`observe.mjs:411-412`), so the full-observer workflow-advancement path carries the
  tag end-to-end rather than silently dropping it after the first ingest.
- Test: `router.health.observe.test.mjs:89-90` asserts `runtime === 'claude'` and
  `epoch === null` survive into the persisted outcome store.

**(e) test run** — PASS. `rtk node --test` over all five scoped files:
```
# tests 75
# pass 75
# fail 0
# cancelled 0
```
(includes `router.health.outcome-schema.test.mjs`, `router.health.observe.test.mjs`,
`router.telemetry-bridge.test.mjs`, `router.runtime-tagging.test.mjs`,
`router.cache.test.mjs`). 75/75 green, 0 fail.

## Finding Resolution

### WR-01 (resolved — verify in source)
Both outcome producers (`deriveSelectedOutcome`, `buildOutcomeRecord`) forward
`runtime`/`epoch` into the canonical envelope and both fingerprints cover the new
fields. The runtime attribution now survives ingest into the correlated-outcome store.
Additive `?? null` defaults keep legacy records (and the epoch-less current producer
state) valid — no regression.

### WR-02 (resolved — verify in source)
`runtime`/`epoch` are now bounded at BOTH trust boundaries with the standard hardening
the adjacent string fields receive: generic `>128` `field_too_long` guard, `claude|codex`
enum check for `runtime`, `boundedToken(…, 64)` for `epoch`, with null/undefined
pass-through. The documented hardening rationale is now consistent across the schema.

### IN-01 (resolved by documentation — accepted option)
`epoch` still has no producer (remains `null` in every bridged envelope and every outcome
record). Per the prior review's accepted forward-compat option, this is now explicitly
documented as intentional scaffolding at `telemetry-bridge.mjs:81-85`. Not re-reported
as a finding; it is a deliberate, harmless state awaiting a future producer.

## Residual notes

No new findings, no regressions. The empty-`epoch` state is the only residual in the
Phase-31 surface and is documented as by-design forward-compat scaffolding. Out of scope
for this re-check.

---

_Reviewed: 2026-08-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
