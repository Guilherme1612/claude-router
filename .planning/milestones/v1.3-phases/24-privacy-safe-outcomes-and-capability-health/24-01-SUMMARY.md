---
phase: 24-privacy-safe-outcomes-and-capability-health
plan: 01
subsystem: health
tags: [privacy, capability-health, outcomes, persistence, tracer]
requires: []
provides:
  - "src/health/outcome-schema.mjs — OUTCOME_FIELDS allowlist, OUTCOME_KINDS (9), validateOutcomeEnvelope (frozen contract for later waves)"
  - "src/health/store.mjs — createHealthStore under ~/.claude/router/health/ (0600 perms, atomic state writes, retention, compaction)"
  - "src/health/observe.mjs — deriveSelectedOutcome (tracer minimal, off-hot-path)"
  - "src/health/admin.mjs — inspect (read-only projection of outcomes.jsonl)"
  - "src/cli/router-control.mjs health subcommand family (inspect wired; reset/dispose/recover return not_implemented)"
affects:
  - "src/cli/router-control.mjs (extended with health dispatch + usage() disambiguation)"
tech-stack:
  added:
    - "src/health/* — stdlib-only (node:crypto, node:fs, node:os, node:path), zero npm deps"
  patterns:
    - "Frozen FIELDS allowlist + validateOutcomeEnvelope (mirrors src/evolution/evidence.mjs validateEvidenceEnvelope)"
    - "createHealthStore mirrors createPersistentEvidenceStore under a sibling health/ dir (D-5 scope isolation)"
    - "Atomic temp+rename+fsync for state.json (mirrors publish-index.mjs durableWrite)"
    - "Cursor-free tracer: deriveSelectedOutcome feeds a telemetry fixture directly; Plan 24-02 wires the full ingestTelemetryEvidence path"
key-files:
  created:
    - "src/health/outcome-schema.mjs"
    - "src/health/store.mjs"
    - "src/health/observe.mjs"
    - "src/health/admin.mjs"
    - "tests/router.health.tracer.test.mjs"
    - "tests/router.health.outcome-schema.test.mjs"
    - "tests/router.health.privacy.test.mjs"
  modified:
    - "src/cli/router-control.mjs"
decisions:
  - "D-3: observer runs OFF the hot path (option c) — router hook untouched; W4 hot-path isolation test-enforced in router.health.privacy.test.mjs"
  - "D-4: `router health <sub>` family in router-control.mjs; usage() carries the one-line doctor/health disambiguation"
  - "D-5: healthRoot = join(ownedRoot, 'health') — sibling of evidence/; admin.mjs/store.mjs import neither activate.mjs nor publish-index.mjs"
  - "D-6: persisted field is `outcome_kind`, never bare `outcome` (collision with v1 telemetry outcome:null and rollback journal outcome)"
  - "Schema hardening order: field_too_long (length guard) fires BEFORE boundedToken format checks so a 129-char capability_id reports as field_too_long, not invalid_capability_id"
metrics:
  duration: "single session"
  completed: "2026-07-27"
  tasks: 2
  files_created: 7
  files_modified: 1
  tests_passing: 34
status: complete
---

# Phase 24 Plan 01: Wave 1 Tracer — Privacy-Safe Outcome Observation Loop Summary

End-to-end privacy-bounded outcome-observation tracer: a telemetry record carrying a route_id flows through observe.mjs into a bounded outcome record persisted at ~/.claude/router/health/outcomes.jsonl and is surfaced via `router health inspect`, with the full privacy posture (no raw content, sha256 signature only, deny_filtered → null signature) enforced from the first record.

## What Was Built

### Task 1 — Tracer (type: tracer, commit ed3c477)

The production skeleton touching every layer Phase 24 will modify. The schema and privacy posture it ships are the contract every later wave extends — not a throwaway.

- **src/health/outcome-schema.mjs** — frozen `OUTCOME_FIELDS` allowlist (14 fields), `OUTCOME_KINDS` set of 9 (`selected, actually_used, completed, corrected, retried, replaced, abandoned, overridden, helpful_reuse`), `OUTCOME_KIND` named enum, `validateOutcomeEnvelope`. Rejects `forbidden_outcome_field` / `invalid_outcome_kind` / `invalid_capability_id` (boundedToken + framework-prefix guard for gsd-/gstack-/codex-, Pitfall 3) / `privacy_signature_forbidden` (deny_filtered records must carry `prompt_signature: null`). `boundedToken` re-imported from `evidence.mjs` (shared path-escape defense, not redefined). Field name is `outcome_kind`, never `outcome` (D-6).
- **src/health/store.mjs** — `createHealthStore({ root })` under `~/.claude/router/health/` (sibling of evidence/, D-5). 0700 dir, 0600 outcomes.jsonl, append-only JSONL, re-validates envelope before write (defense-in-depth).
- **src/health/observe.mjs** — `deriveSelectedOutcome(telemetryRecord, { stableCapabilityIdFn })` (tracer minimal). Produces `outcome_kind='selected'` with a sha256 fingerprint over `stableStringify(canonicalRecord)`. Off-hot-path (D-3) — must NOT be imported by `~/.claude/hooks/router.mjs`.
- **src/health/admin.mjs** — `inspect({ healthRoot, limit, offset })` read-only projection of outcomes.jsonl with bounded pagination; returns `canonical('health', true, 'inspect_ok', ...)` shape.
- **src/cli/router-control.mjs** — `health {inspect|reset|dispose|recover}` subcommand family added parallel to the canary block. `inspect` wired; the other three return `canonical('health', false, 'not_implemented', { subcommand })` with `exitCode EXIT.usage`. `usage()` updated to list the family and carry the one-line disambiguation: "router doctor reports router plumbing health; router health reports capability health" (D-4).
- **tests/router.health.tracer.test.mjs** — 9 tests: end-to-end telemetry → observe → store.append → admin.inspect; 0600 perms; no raw prompt text in persisted record; OUTCOME_KINDS=9; forbidden_outcome_field; invalid_capability_id (gsd- prefix); privacy_signature_forbidden; deny_filtered+null accepted; store.append rejects denied records.

### Task 2 — Persistence Hardening + Privacy Suite (type: auto/tdd, commit 5698339)

Additive hardening of the Task 1 files — no rewrite. The FIELDS set from Task 1 is final; no fields added.

- **src/health/outcome-schema.mjs** — bounded integer ranges (`evidence_window_ms` 0..MAX_RETENTION_MS, `sample_size`/`opportunity_count` 0..10_000_000), fingerprint 64-hex sha256 validator, `field_too_long` guard for string fields > 128 chars (Pitfall 5). The length guard fires BEFORE the format-specific boundedToken checks so a 129-char capability_id reports as `field_too_long`, not `invalid_capability_id`.
- **src/health/store.mjs** — imports `HALF_LIFE_MS`/`MAX_RETENTION_MS`/`MINIMUM_SAMPLES` from `evidence.mjs` (no redefinition, RESEARCH Don't-Hand-Roll). `readWindow({ fromMs, toMs, now })` filters records older than `now - MAX_RETENTION_MS` and skips corrupt JSON lines with a `corrupt_line_skipped` counter (T-24-07). `writeState(state)` atomic temp+rename+fsync with 0600 perms. `readState()` returns null on missing/corrupt, never throws. `compact({ maxBytes=1MB, now })` drops stale records and appends a compaction marker line.
- **tests/router.health.outcome-schema.test.mjs** — 11 tests: OUTCOME_KINDS=9 + every kind accepted; every forbidden field name (prompt/prompt_text/transcript/output/content/source/argument) rejected; deny_filtered privacy rule both directions; bounded integer overflow; fingerprint format; framework-prefix guard; field_too_long; invalid_timestamp; invalid_guard_codes.
- **tests/router.health.privacy.test.mjs** — 14 tests: no src/health/* module imports a network primitive (two regex variants, HLTH-02); 0700 dir + 0600 outcomes.jsonl + state.json perms; atomic state writes with no leftover temp files; readState null on missing/corrupt; corrupt JSONL skipped with counter; MAX_RETENTION_MS filtering; bounded compaction with marker line; no raw prompt fixture persisted; W4 hot-path isolation (router.mjs has no import matching src/health/, Pitfall 1 test-enforced); D-5 scope isolation (no src/health/* imports activate.mjs/publish-index.mjs).

## Verification

All automated verification commands pass:

- `rtk node --test tests/router.health.tracer.test.mjs tests/router.health.outcome-schema.test.mjs tests/router.health.privacy.test.mjs` — **34/34 green**.
- Phase-gate command #2 (HLTH-02): `grep -rE "import.*(node:http|node:https|node:net|node:dns|fetch)" src/health/` → 0 matches.
- Phase-gate command #3 (D-5): `grep -nE "import.*(activate|publish-index|registry\.mjs|weights\.json)" src/health/admin.mjs` → 0 matches.
- Phase-gate command #5 (W4): `grep -nE "import.*src/health/" ~/.claude/hooks/router.mjs` → 0 matches.
- Phase-gate command #6 (D-5): `grep -nE "import.*registry\.mjs|weights\.json" src/health/admin.mjs` → 0 matches.
- OUTCOME_KINDS enum has exactly 9 values; persisted field name is `outcome_kind` (no bare `outcome` field in any persisted record shape).
- `router health inspect` CLI wiring smoke-tested end-to-end via `runRouterControl({ argv: ['health','inspect','--owned-root', ownedRoot] })` → `inspect_ok` with the appended record; `reset`/`dispose`/`recover` return `not_implemented`; `health bogus` returns `invalid_subcommand`; `--help` lists the family and the doctor disambiguation.
- Regression check: `tests/router.control-cli.test.mjs` + `tests/router.router-control-canary.test.mjs` still green (22/22) — the router-control.mjs extension introduced no regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `syncSync` is not a `node:fs` export**
- **Found during:** Task 2 — store.mjs atomic state writes
- **Issue:** The initial store.mjs draft imported `syncSync` from `node:fs`; the correct export is `fsyncSync`, and fsync must target the temp file descriptor (not the final path).
- **Fix:** Imported `openSync`/`closeSync`/`fsyncSync` from `node:fs`; fsync the temp file's fd before rename, wrapped in try/finally so the fd is always closed. Best-effort — rename is atomic on POSIX regardless.
- **Files modified:** src/health/store.mjs
- **Commit:** 5698339

**2. [Rule 1 - Bug] Reordered `field_too_long` before format-specific boundedToken checks**
- **Found during:** Task 2 — outcome-schema.test.mjs `field_too_long` test
- **Issue:** A 129-char `capability_id` failed `boundedToken` (length > 128) first and reported `invalid_capability_id`, but the plan specifies `field_too_long` for any string field longer than boundedToken's 128-char max. The boundedToken-specific error codes are reserved for format violations (e.g., contains `/`) and the framework-prefix guard.
- **Fix:** Moved the generic `field_too_long` length guard to fire BEFORE the `boundedToken` format checks on `capability_id`/`route_id`. A 129-char string now reports `field_too_long`; a string containing `/` still reports `invalid_capability_id`; a `gsd-` prefix still reports `invalid_capability_id` (Pitfall 3 guard).
- **Files modified:** src/health/outcome-schema.mjs
- **Commit:** 5698339

**3. [Rule 3 - Blocking] Reworded D-5 scope-isolation comments to avoid false-positive on phase-gate grep**
- **Found during:** Task 2 — phase-gate command #3
- **Issue:** The phase-gate command `grep -nE "import.*(activate|publish-index|registry\.mjs|weights\.json)" src/health/admin.mjs | grep -v '^#'` matches comment text ("must NOT import src/registry/activate.mjs") because JS comments start with `//`, not `#`, so the `grep -v '^#'` filter does not exclude them.
- **Fix:** Reworded the D-5 documentation comments in `admin.mjs` and `store.mjs` to use "depend on" instead of "import" before the forbidden module paths. The comments still document the invariant; the grep now returns 0 matches.
- **Files modified:** src/health/admin.mjs, src/health/store.mjs
- **Commit:** 5698339

## Auth Gates

None — Phase 24 is local-only, no auth surface.

## Known Stubs

None. The tracer is production-quality and the single path is fully wired end-to-end. `router health reset`/`dispose`/`recover` return `not_implemented` by design — they land in Plan 24-03 (Wave 3), which is the plan that introduces the mutation surface. The `health-policy-v1` `policy_version` is frozen as the persistence contract; versioned thresholds + canary guard land in Plan 24-04 (Wave 4).

## Threat Flags

None. The threat register in the plan is fully mitigated by the shipped code:

- T-24-01 (Information Disclosure, validateOutcomeEnvelope): frozen FIELDS allowlist + privacy_signature_forbidden — verified by 11 schema tests.
- T-24-02 (Information Disclosure, observe.deriveSelectedOutcome): only sha256 prompt_signature persisted; the observer never re-hashes raw prompt (it reuses the telemetry record's existing signature) — verified by the no-raw-prompt tracer test.
- T-24-03 (Tampering, capability_id): boundedToken + framework-prefix rejection — verified by the invalid_capability_id tests.
- T-24-04 (Tampering, state.json): atomic temp+rename+fsync + 0600 perms + readState null-on-corrupt — verified by the atomic-write and corrupt-state tests.
- T-24-05 (Elevation of Privilege, admin.mjs inspect): admin.mjs imports neither activate.mjs nor publish-index.mjs; inspect is read-only — verified by the D-5 scope-isolation test + phase-gate commands #3/#6.
- T-24-06 (Information Disclosure, network calls): no src/health/* module imports a network primitive — verified by the HLTH-02 privacy tests + phase-gate command #2.
- T-24-07 (Repudiation, outcomes.jsonl corruption): corrupt JSONL lines skipped with corrupt_line_skipped counter; bounded compaction appends a marker line — verified by the corrupt-line and compaction tests.

## TDD Gate Compliance

This plan is `type: execute` (not `type: tdd`), so the per-plan RED/GREEN/REFACTOR gate does not apply. Task 2 is marked `tdd="true"` at the task level; the test files (router.health.outcome-schema.test.mjs, router.health.privacy.test.mjs) were written alongside the implementation and all assertions pass against the shipped code (GREEN). The tracer test file (router.health.tracer.test.mjs) was written with the tracer implementation in the same commit (Task 1).

## Self-Check: PASSED

- Created files exist:
  - FOUND: src/health/outcome-schema.mjs
  - FOUND: src/health/store.mjs
  - FOUND: src/health/observe.mjs
  - FOUND: src/health/admin.mjs
  - FOUND: tests/router.health.tracer.test.mjs
  - FOUND: tests/router.health.outcome-schema.test.mjs
  - FOUND: tests/router.health.privacy.test.mjs
- Commits exist:
  - FOUND: ed3c477 (Task 1 tracer)
  - FOUND: 5698339 (Task 2 hardening + privacy suite)
- All 34 tests green across the three test files.
- All phase-gate invariant commands (#2, #3, #5, #6) return 0 matches.