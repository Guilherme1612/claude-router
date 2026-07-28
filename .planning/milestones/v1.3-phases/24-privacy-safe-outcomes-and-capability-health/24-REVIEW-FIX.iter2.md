---
phase: 24-privacy-safe-outcomes-and-capability-health
fixed_at: 2026-07-28T00:00:00Z
review_path: .planning/phases/24-privacy-safe-outcomes-and-capability-health/24-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 24: Code Review Fix Report

**Fixed at:** 2026-07-28T00:00:00Z
**Source review:** `.planning/phases/24-privacy-safe-outcomes-and-capability-health/24-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 critical + 5 warning; info findings excluded per `fix_scope: critical_warning`)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: Fingerprint integrity anchor validates format only, not content — tampered records pass the trust boundary

**Files modified:** `src/health/outcome-schema.mjs`, `tests/router.health.outcome-schema.test.mjs`, `tests/router.health.admin.test.mjs`
**Commit:** `fe90cc9`
**Applied fix:** `validateOutcomeEnvelope` now recomputes `sha256(stableStringify(canonicalRecord))` (fingerprint field stripped) and compares against the stored fingerprint. A valid-format but content-mismatched fingerprint is rejected with `fingerprint_mismatch`. Imported `createHash` (node:crypto) and `stableStringify` (../registry/schema.mjs) into outcome-schema.mjs — both already used by observe.mjs, so no new dependency surface. Updated the admin test `appendOutcome` helper, which previously hashed an unrelated string (`${capability_id}:${timestamp_ms}`) — exactly the gap the review flagged — to compute a canonical fingerprint. Updated the outcome-schema `baseRecord` helper to use `stableStringify` (sorted keys) so the fixture fingerprint matches the validator's recomputation (the prior `JSON.stringify` produced insertion-order keys that differ from stableStringify's sorted keys for this object). Added a test asserting a content-mismatched fingerprint is rejected.

### WR-01: `evidence_window_ms` inconsistent between the tracer path and the full observer path for `selected` outcomes

**Files modified:** `src/health/observe.mjs`
**Commit:** `10e241e`
**Applied fix:** `buildOutcomeRecord` now sets `evidence_window_ms: 0` when `outcome_kind === 'selected'`, matching `deriveSelectedOutcome` (the tracer minimal). `selected` means "no completion signal observed yet", so the evidence window is genuinely 0. The full observer previously persisted `selected` outcomes with `evidence_window_ms=86400000` (24h default), so the same outcome_kind had two different contracts depending on which path produced it. This is a logic/consistency change — flagging as **requires human verification** of the semantic intent (the review's recommended option (a) was applied).

### WR-02: `recover` both-exist branch reports `recovered_from: 'disposed'` without restoring anything

**Files modified:** `src/health/admin.mjs`, `tests/router.health.admin.test.mjs`
**Commit:** `1523cd5`
**Applied fix:** When both `state.json` and `state.disposed.json` exist, `recover` now reports `recovered_from: 'state_json_authoritative'` (instead of the misleading `recovered_from: 'disposed'`) and discards the stale disposed snapshot best-effort via `rmSync`. Nothing was being restored from the disposed snapshot — the existing state.json was kept — so the prior response misled operators into believing a restoration occurred. Added `rmSync` to the node:fs import. Added a test for the both-exist branch (previously only disposed-only and outcomes-only paths were covered).

### WR-03: `ingestTelemetryEvidence` incremental-path condition accepts same-size file rewrites with a stale `recordCount`

**Files modified:** `src/health/observe.mjs`
**Commit:** `5ecbf52`
**Applied fix:** Tightened the rotation-reset guard from `cursor.size <= size` to `cursor.size < size` (strict growth). When `cursor.size === size` but mtime differs (a same-size in-place rewrite), the code now falls through to a full re-ingest (startLine stays 0) instead of taking the incremental path with a stale `cursor.recordCount`. This is a logic change — flagging as **requires human verification** that strict-growth is the desired policy (the review's recommended fix).

### WR-04: `canary-bridge.activateCandidate` leaves an orphaned `thresholds.json` if the `active.json` pointer write fails

**Files modified:** `src/health/canary-bridge.mjs`
**Commit:** `36731d2`
**Applied fix:** Made the two writes transactional: both temp files are written and fsynced BEFORE either rename. On any failure during the write phase, both temps are cleaned up best-effort and the activation is rejected with `reason_code: 'activation_write_failed'`. If the thresholds rename succeeds but the active.json rename fails, the orphaned `thresholds.json` is removed best-effort so `readActivePointer` continues to return the prior version and no orphaned bundle is left on disk. Added `rmSync` to the node:fs import.

### WR-05: `store.compact` counts corrupt JSON lines as `dropped`, conflating parse failures with retention expiry

**Files modified:** `src/health/store.mjs`
**Commit:** `1bd3c0a`
**Applied fix:** `compact` now tracks corrupt/unreadable JSON lines in a separate `corrupt` counter and reports them as `corrupt_line_skipped` in the compaction marker, alongside the existing `dropped` (retention-expired) count. This mirrors `readWindow`'s existing `corrupt_line_skipped` field so the audit trail distinguishes parse failures from retention expiry.

---

_Fixed: 2026-07-28T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_