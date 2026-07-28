---
phase: 24-privacy-safe-outcomes-and-capability-health
reviewed: 2026-07-28T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - src/cli/router-control.mjs
  - src/health/admin.mjs
  - src/health/canary-bridge.mjs
  - src/health/catalog.mjs
  - src/health/observe.mjs
  - src/health/outcome-schema.mjs
  - src/health/score.mjs
  - src/health/store.mjs
  - src/health/thresholds.mjs
  - tests/router.health.admin.test.mjs
  - tests/router.health.canary.test.mjs
  - tests/router.health.catalog.test.mjs
  - tests/router.health.observe.test.mjs
  - tests/router.health.outcome-schema.test.mjs
  - tests/router.health.privacy.test.mjs
  - tests/router.health.score.test.mjs
  - tests/router.health.tracer.test.mjs
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-07-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 17 (9 source + 8 test)
**Status:** issues_found

## Summary

Phase 24 implements privacy-safe outcome observation and capability health scoring for the Claude Router. The code is generally well-structured with strong defense-in-depth patterns (allowlist validation, atomic writes, fail-open semantics, 0600 perms). The privacy posture is solid: no raw prompt text crosses the persistence boundary, `outcome_kind` (not bare `outcome`) is used consistently, and the HLTH-07 unjudged floor is correctly enforced.

The most significant finding is a defense-in-depth gap in the fingerprint integrity anchor: `validateOutcomeEnvelope` validates only the *format* of the fingerprint (64-hex sha256), not its *content*. A tampered record carrying any valid-format fingerprint passes the trust boundary. This undermines the stated integrity guarantee and the store.append defense-in-depth re-validation. Several smaller consistency and reporting issues round out the findings.

The test suite is broad and exercises the documented invariants (all 9 outcome kinds, all 10 observation kinds, D-5 isolation, privacy guards, canary gates). The fingerprint-format-only validation is not caught by tests because every test fixture happens to produce a 64-hex string — none assert the validator *rejects* a mismatched-content fingerprint.

## Critical Issues

### CR-01: Fingerprint integrity anchor validates format only, not content — tampered records pass the trust boundary

**File:** `src/health/outcome-schema.mjs:116`
**Issue:** `validateOutcomeEnvelope` documents the `fingerprint` field as an "integrity anchor (64-hex sha256)" (comment at line 115) but only validates its format:

```javascript
if (typeof input.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(input.fingerprint)) return deny('invalid_fingerprint');
```

It never recomputes `sha256(stableStringify(recordWithoutFingerprint))` and compares. Consequently:

1. The observer (`observe.mjs:87` and `:220`) correctly computes the fingerprint over the canonical record via `stableStringify`, but the validator does not enforce that any other caller did the same.
2. `store.append` (`store.mjs:47`) re-validates as defense-in-depth "so a future caller that bypasses observe.mjs still cannot write a forbidden field to disk" — but it cannot detect a tampered field value because the fingerprint is not content-verified. A caller that mutates a field (e.g. bumps `timestamp_ms`, swaps `capability_id`) and passes any 64-hex string as `fingerprint` is accepted.
3. The test fixture at `tests/router.health.admin.test.mjs:88` demonstrates the gap concretely — it uses `createHash('sha256').update(\`${partial.capability_id}:${partial.timestamp_ms ?? Date.now()}\`)` as the fingerprint, which has no relationship to the canonical record, and `store.append` accepts it.

The fingerprint is effectively a format field, not an integrity anchor. Either the comment/contract should be downgraded (it is just a dedup key) or the validator should recompute and compare.

**Fix:** Recompute the fingerprint over the canonical record (fingerprint field stripped) and compare in `validateOutcomeEnvelope`:

```javascript
// After the existing format check at line 116:
const { fingerprint, ...canonical } = input;
const recomputed = createHash('sha256').update(stableStringify(canonical), 'utf8').digest('hex');
if (recomputed !== input.fingerprint) return deny('fingerprint_mismatch');
```

This requires importing `createHash` and `stableStringify` into `outcome-schema.mjs` (both are already used by `observe.mjs`, so no new dependency surface). Add a test that constructs a record with a valid-format but content-mismatched fingerprint and asserts `reason_code === 'fingerprint_mismatch'`.

## Warnings

### WR-01: `evidence_window_ms` is inconsistent between the tracer path and the full observer path for `selected` outcomes

**File:** `src/health/observe.mjs:81` vs `:214`
**Issue:** `deriveSelectedOutcome` (the tracer minimal, line 81) hardcodes `evidence_window_ms: 0` for `selected` outcomes. `buildOutcomeRecord` (the full observer, line 214) sets `evidence_window_ms: Math.min(evidenceWindowMs, MAX_RETENTION_MS)` where `evidenceWindowMs` defaults to `DEFAULT_EVIDENCE_WINDOW_MS = HALF_LIFE_MS` (24h). The same `outcome_kind='selected'` therefore persists with `evidence_window_ms=0` when produced by the tracer and `evidence_window_ms=86400000` when produced by `ingestTelemetryEvidence`. Downstream consumers (scoring, catalog, admin inspect) that read this field cannot rely on a consistent contract for the same outcome kind.

**Fix:** Align both paths. Either (a) set `evidence_window_ms: 0` in `buildOutcomeRecord` when `outcome_kind === 'selected'`, or (b) change `deriveSelectedOutcome` to use `Math.min(DEFAULT_EVIDENCE_WINDOW_MS, MAX_RETENTION_MS)`. Option (a) is more semantically correct — `selected` means "no completion signal observed yet", so the evidence window is genuinely 0.

### WR-02: `recover` both-exist branch reports `recovered_from: 'disposed'` without restoring anything

**File:** `src/health/admin.mjs:113-118`
**Issue:** When both `state.json` and `state.disposed.json` exist, the code returns `recovered_from: 'disposed'` and `capability_count: countCapabilities(statePath)` — but it does not move or restore anything. It leaves `state.json` as authoritative and removes nothing. The `recovered_from: 'disposed'` field is misleading because nothing was recovered from the disposed snapshot; the existing `state.json` was kept. An operator reading the response would believe a restoration occurred.

There is no test covering this branch (the test suite only exercises the disposed-only and outcomes-only paths).

**Fix:** Either report `recovered_from: 'state_json_authoritative'` (or a distinct reason_code like `recover_state_present`) when both files exist, or remove the disposed snapshot and report that explicitly. Also add a test for the both-exist branch.

```javascript
if (existsSync(statePath)) {
  // Both exist — state.json is authoritative; discard the disposed snapshot.
  try { rmSync(disposedPath); } catch { /* best-effort */ }
  return canonical('health', true, 'recover_restored',
    { recovered_from: 'state_json_authoritative', capability_count: countCapabilities(statePath) });
}
```

### WR-03: `ingestTelemetryEvidence` incremental-path condition accepts same-size file rewrites with a stale `recordCount`

**File:** `src/health/observe.mjs:294`
**Issue:** The rotation-reset guard at line 294 is:

```javascript
if (cursor && cursor.size <= size && typeof cursor.recordCount === 'number'
    && cursor.recordCount <= allRecords.length) {
  startLine = cursor.recordCount;
}
```

The unchanged short-circuit at line 271 only fires when *both* `size` and `mtimeMs` match. If the telemetry file is rewritten with different content at the *same size* (mtime differs, size equal), the code takes the incremental path with the stale `cursor.recordCount` — silently skipping records that were overwritten at the start of the file. Telemetry is append-only in normal operation, so this is an edge case, but a log rotator that rewrites in place at the same size would silently lose data.

**Fix:** Tighten the incremental-path condition to require strict growth: `cursor.size < size`. When `cursor.size === size` but mtime differs, fall through to a full re-ingest (startLine stays 0):

```javascript
if (cursor && cursor.size < size && typeof cursor.recordCount === 'number'
    && cursor.recordCount <= allRecords.length) {
  startLine = cursor.recordCount;
}
```

### WR-04: `canary-bridge.activateCandidate` leaves an orphaned `thresholds.json` if the `active.json` pointer write fails

**File:** `src/health/canary-bridge.mjs:135-143`
**Issue:** `activateCandidate` writes `thresholds.json` (temp+rename, lines 135-138) then writes `active.json` (temp+rename, lines 141-143). If the second atomic write fails (disk full, permission revocation between writes, etc.), the version directory contains a `thresholds.json` with no `active.json` pointer to it. Subsequent `loadThresholds(policy_version)` calls would return the orphaned bundle as if it were active, but `readActivePointer` would still return the prior version. The two files are not written as a single atomic transaction.

**Fix:** Either (a) write `active.json` first and `thresholds.json` second so a failure leaves no orphaned bundle, or (b) wrap both writes in a single transaction (write both temp files, fsync, then rename both — and on any failure, clean up the version directory). At minimum, document the orphan risk and add a recovery check.

### WR-05: `store.compact` counts corrupt JSON lines as `dropped`, conflating parse failures with retention expiry

**File:** `src/health/store.mjs:123`
**Issue:** In `compact`, corrupt JSON lines increment `dropped`:

```javascript
try { record = JSON.parse(line); } catch { dropped += 1; continue; }
```

The `dropped` counter is persisted in the compaction marker (`{ compacted_at_ms, dropped, policy_version }`) and is documented as the count of records dropped due to retention expiry. A corrupt line is not a retention-expired record — it is unreadable. Inflating `dropped` with parse failures makes the audit trail misleading. `readWindow` (line 64) correctly separates these into `corrupt_line_skipped`; `compact` should do the same.

**Fix:** Track corrupt lines separately and report them in the compaction marker, or simply skip them without incrementing `dropped`:

```javascript
let dropped = 0, corrupt = 0;
for (const line of lines) {
  if (line.length === 0) continue;
  let record;
  try { record = JSON.parse(line); } catch { corrupt += 1; continue; }
  // ...
}
const marker = { compacted_at_ms: now, dropped, corrupt_line_skipped: corrupt, policy_version: 'health-policy-v1' };
```

## Info

### IN-01: `inspect` loads the entire `outcomes.jsonl` into memory before slicing

**File:** `src/health/admin.mjs:41-49`
**Issue:** `inspect` reads every line of `outcomes.jsonl`, parses each, and pushes to an in-memory `records` array, then slices for pagination. For a large file (the compaction cap is 1 MB by default), this is acceptable, but it is O(n) in file size on every inspect call regardless of `limit`/`offset`. A streaming read that stops after `offset + limit` records would bound memory. This is a quality nit, not a correctness issue — the file is bounded by compaction.

**Fix:** Optional — iterate lines with a counter and break once `offset + limit` records have been collected.

### IN-02: `dispose` comment says "overwrite it with the current state" but `renameSync` moves, not copies

**File:** `src/health/admin.mjs:96`
**Issue:** The comment "If a previously-disposed file exists, overwrite it with the current state" is correct in effect (POSIX `rename` overwrites the destination), but the semantics are "move state.json to disposed.json", leaving no state.json behind. The comment reads as if a copy happens. Minor documentation clarity issue.

**Fix:** Reword: "If a previously-disposed file exists it is overwritten; state.json is moved (not copied) to state.disposed.json."

### IN-03: `catalog.deriveObservations` can emit both `ineffective` and `reusable_workflow` for the same capability

**File:** `src/health/catalog.mjs:370-394`
**Issue:** The `ineffective` (failure run >= 3) and `reusable_workflow` (completed run >= 5) observations are emitted independently. A capability whose outcome history contains both a 3+ failure run and a 5+ completed run gets both observations. This may be intentional (the capability is both sometimes ineffective and sometimes reusable), but the plan does not state whether this is desired. If only one should win, the code needs an explicit precedence rule.

**Fix:** If co-emission is intentional, add a comment documenting it. If not, add a precedence rule (e.g. `ineffective` suppresses `reusable_workflow` for the same capability).

---

_Reviewed: 2026-07-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_