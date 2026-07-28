---
phase: 24-privacy-safe-outcomes-and-capability-health
reviewed: 2026-07-28T15:30:00Z
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
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-07-28T15:30:00Z
**Depth:** standard
**Files Reviewed:** 17 (9 source + 8 test)
**Status:** issues_found

## Summary

Re-review of Phase 24 after the iter-2 fix pass (CR-01 + WR-01..WR-05 from the prior review were addressed). The fingerprint integrity anchor, evidence_window_ms consistency, recover both-exist branch, canary-bridge atomicity, and compaction corrupt-line accounting are all now fixed. The privacy posture remains solid (no raw prompt text, `outcome_kind` consistently used, HLTH-07 unjudged floor enforced, 0600/0700 perms throughout).

Three new findings surfaced from cross-module tracing that the per-file iter-2 review did not catch:

1. `deriveOutcomeKind` checks `replaced` before `helpful_reuse`, contradicting its own documented priority order (3 > 4). When both signals are present the code returns the lower-priority outcome. No test covers the conflict case.
2. The canary-bridge's `recoverActiveVersion` double-appends the `versions/` path segment (the bridge passes the versions root, but `readActivePointer` appends `versions/` again), always reading a nonexistent file and returning `version_id: null`. The impact is currently masked by the `?? known_good_version` fallback in `applyCanaryDecision`, but it is a real path-handling bug that will surface if the fallback changes.
3. The canary-bridge persists activated `weights` and `tier_boundaries` to `versions/<policy_version>/thresholds.json`, but `scoreCapability` reads the hardcoded `VERSIONED_WEIGHTS` / `TIER_BOUNDARIES` constants from `thresholds.mjs` and never calls `loadThresholds`. The canary-gated activation mechanism has no effect on the scorer — the consumer that justifies the gate. `loadThresholds` is only called from tests.

Two info-level items round out the report.

## Warnings

### WR-01: `deriveOutcomeKind` checks `replaced` before `helpful_reuse`, contradicting its own documented priority order

**File:** `src/health/observe.mjs:126-197`
**Issue:** The header comment for `deriveOutcomeKind` (lines 113-125) declares an explicit priority order — "most specific concrete signal first":

```
//   1. 'overridden'  — next record's confidence_tier === 'user_explicit'
//   2. 'actually_used' — next record's downstream_invocations contains this cap
//   3. 'helpful_reuse' — a LATER record (after the next) has downstream_invocations
//                       containing this cap with a different route_id
//   4. 'replaced'    — next record's downstream_invocations is non-empty and
//                       does NOT contain this cap
```

The code checks 4 before 3. The `if (nextRecord && downstream_invocations.length > 0)` block at lines 137-143 returns either `actually_used` (2) or `replaced` (4) *before* the `helpful_reuse` (3) loop at lines 147-154 is reached. So when both signals are present — the next record invokes a different capability (replaced) AND a later record reuses this capability on a different route_id (helpful_reuse) — the code returns `replaced` but the documented priority says it should return `helpful_reuse`.

The test suite does not cover the conflict case: the `helpful_reuse` test (line 241) explicitly sets the next record's `downstream_invocations: null` so `replaced` cannot fire, and the `replaced` test (line 213) has only two records so no later record exists. The precedence is unasserted.

Which ordering is semantically correct is debatable — `replaced` is the more immediate signal for THIS dispatch, `helpful_reuse` is the broader cross-intent signal. But the comment explicitly states 3 > 4, and the code violates that. Either the comment or the code is wrong; they cannot both be right.

**Fix:** Decide which signal wins and align code + comment. If `helpful_reuse` should win (per the documented priority), move the `laterRecords` scan before the `nextRecord.downstream_invocations` block:

```javascript
// 3. helpful_reuse — check LATER records before declaring 'replaced', so a
//    later reuse on a different intent takes priority over an immediate
//    replacement (matches the documented priority order).
if (Array.isArray(laterRecords)) {
  for (const later of laterRecords) {
    if (!later || !Array.isArray(later.downstream_invocations)) continue;
    if (later.downstream_invocations.includes(capabilityId) && later.route_id !== record.route_id) {
      return { outcome_kind: 'helpful_reuse', reason_code: 'later_reuse_different_intent' };
    }
  }
}

// 2. actually_used / 4. replaced — the next record's downstream_invocations.
if (nextRecord && Array.isArray(nextRecord.downstream_invocations) && nextRecord.downstream_invocations.length > 0) {
  if (nextRecord.downstream_invocations.includes(capabilityId)) {
    return { outcome_kind: 'actually_used', reason_code: 'downstream_invoked' };
  }
  return { outcome_kind: 'replaced', reason_code: 'downstream_replaced' };
}
```

If `replaced` should win (the current code behavior), update the comment's numbering so 4 precedes 3. Either way, add a test that constructs both signals simultaneously and asserts which outcome_kind is returned.

### WR-02: canary-bridge `recoverActiveVersion` double-appends the `versions/` path — always reads a nonexistent file

**File:** `src/health/canary-bridge.mjs:106-109`
**Issue:** `promoteThresholdCandidate` computes `const root = healthVersionsRoot(ownedRoot)` (line 200), which is `join(ownedRoot, 'versions')`. It then passes `ownedRoot: root` (the versions root) into `applyCanaryDecision` (line 280). Inside `applyCanaryDecision`, `publication.recoverActiveVersion({ ownedRoot: root })` is called (canary-controller.mjs:208). The bridge's implementation delegates to `readActivePointer(ownedRoot)`:

```javascript
recoverActiveVersion({ ownedRoot }) {
  const active = readActivePointer(ownedRoot);   // ownedRoot is the versions root
  return { recovery_status: 'clear', version_id: active };
}
```

But `readActivePointer` itself calls `healthVersionsRoot(ownedRoot)` again (thresholds.mjs:72), appending another `versions/` segment. The final path read is `<healthRoot>/versions/versions/active.json` — which never exists — so `active` is always `null` and `version_id` is always `null`.

Compare with the bridge's `activateCandidate` (line 128-174), which treats `activation.ownedRoot` as the versions root and writes directly to `join(root, policy_version, 'thresholds.json')` and `join(root, 'active.json')` — the correct paths. The two publication methods disagree on what `ownedRoot` means (versions root vs health root).

The bug's impact is currently masked:
- `recovery_status: 'clear'` does not trigger `recoveryBlock` (canary-controller.mjs:180-183), so no spurious `recovery_required`.
- In the `promoted` path, `active_version: activated.version_id` is returned (correct, from `activateCandidate`).
- In `rejected`/`preserved` paths, `active_version: recovered.version_id ?? known_good_version` (canary-controller.mjs:201, 239) — the null falls through to `knownGood`, which the bridge derives from `readActivePointer(ownedRoot)` at the correct path (line 201), so the response is accidentally correct.

But the path-handling bug is real and latent: any future change to the fallback, or any caller passing `known_good_version` explicitly that differs from the active pointer, would surface an incorrect `active_version` in non-promoted responses. No test asserts `active_version` on a rejected/preserved response, so the bug is unguarded.

**Fix:** The bridge's `recoverActiveVersion` should read the pointer from the correct path. Since `ownedRoot` passed in is already the versions root, call `readActivePointer` with the original health root, or read `active.json` directly:

```javascript
recoverActiveVersion({ ownedRoot }) {
  // ownedRoot here is the versions root (join(healthRoot, 'versions')).
  // readActivePointer appends 'versions/' itself, so read active.json
  // directly to avoid the double-versions path.
  const pointerPath = join(ownedRoot, 'active.json');
  if (!existsSync(pointerPath)) return { recovery_status: 'clear', version_id: null };
  try {
    const parsed = JSON.parse(readFileSync(pointerPath, 'utf8'));
    return { recovery_status: 'clear', version_id: parsed?.policy_version ?? null };
  } catch {
    return { recovery_status: 'clear', version_id: null };
  }
}
```

Add a test that promotes a candidate, then promotes a second candidate that fails a gate, and asserts the rejected response's `active_version` matches the first promoted version (this would catch the double-versions bug because `recovered.version_id` would be null and `known_good_version` would mask it only if the caller did not pass it explicitly).

### WR-03: canary-bridge persists activated thresholds that `scoreCapability` never reads — the activation has no effect on scoring

**File:** `src/health/score.mjs:30-40` vs `src/health/thresholds.mjs:88-109` and `src/health/canary-bridge.mjs:128-174`
**Issue:** The canary-bridge writes `weights` and `tier_boundaries` to `~/.claude/router/health/versions/<policy_version>/thresholds.json` and updates `versions/active.json` on promotion. `thresholds.mjs` exports `loadThresholds(policy_version)` (line 88) which reads that file and returns the activated bundle. `score.mjs` — the documented consumer of weights and tier boundaries — imports `VERSIONED_WEIGHTS` and `TIER_BOUNDARIES` as constants (line 30-40) and uses them directly in `scoreCapability` (lines 155-172). It never calls `loadThresholds`. A grep across `src/` confirms `loadThresholds` has zero production call sites (only tests and a comment in `canary-bridge.mjs:169`).

Result: a canary-gated threshold activation — the entire purpose of the HLTH-11 canary guard — produces a `thresholds.json` file and an `active.json` pointer that the scorer ignores. The scorer continues to use the hardcoded `health-policy-v1` defaults regardless of which policy_version is active. The canary gate evidences a value change that has no downstream effect.

This may be intentional phasing (the activation mechanism is wired in Phase 24; the scorer's consumption of activated thresholds is deferred). But nothing in `score.mjs` or `thresholds.mjs` documents this deferral, and `thresholds.mjs` explicitly states "Value changes flow through the canary bridge ... not by direct edit at runtime" — implying the bridge is the live mutation path, not a notional one. A reader of `score.mjs` has no indication that the imported constants are meant to be replaced by `loadThresholds` calls in a future phase.

**Fix:** Either (a) wire `scoreCapability` to read activated thresholds via `loadThresholds(readActivePointer(ownedRoot))` with the hardcoded constants as the fallback when no pointer exists, or (b) if consumption is deferred, add a comment in `score.mjs` at the `DEFAULT_WEIGHTS = VERSIONED_WEIGHTS` line and in `thresholds.mjs` at the `loadThresholds` export stating that production consumption is deferred to a later phase and the canary-bridge writes are validated for shape only. Option (a) closes the loop; option (b) prevents the gap from being mistaken for a bug by future readers.

## Info

### IN-01: `score.mjs` `readConfidence` uses the `reversibility` field's per-field confidence as the capability's overall confidence

**File:** `src/health/score.mjs:72-82`
**Issue:** `readConfidence` reads `contract.confidence_basis_points` (top-level) if present, otherwise falls back to `contract.fields.reversibility.confidence_basis_points` — the confidence of the *reversibility* field's evidence specifically. The contract envelope (`buildCapabilityContract`) has no top-level `confidence_basis_points`, so in production the reversibility field's confidence is always the value used as the capability's `confidence_factor`. A capability with high-confidence reversibility evidence but low-confidence dispatch/dependency evidence would score with a high confidence factor. The comment at line 71-72 documents this ("otherwise the reversibility field's per-field confidence is used") so it is not hidden, but the choice of reversibility as the proxy field is not justified. If the contract gains a top-level `confidence_basis_points` later this becomes moot; until then the proxy is questionable.

**Fix:** If a dedicated `confidence` contract field exists or is planned, read from that. Otherwise add a one-line comment explaining why reversibility's confidence is the chosen proxy (e.g. "reversibility is the highest-variance field, so its evidence confidence is the tightest bound on overall contract confidence").

### IN-02: `promoteThresholdCandidate` computes the returned `fingerprint` with `JSON.stringify` instead of `stableStringify`

**File:** `src/health/canary-bridge.mjs:294`
**Issue:** The promoted-result fingerprint is `sha256(JSON.stringify(bundle))` where `bundle` is an object literal with a fixed key order. `JSON.stringify` preserves insertion order, so for a single run this is deterministic. However, every other fingerprint in the health subsystem (observe.mjs:87, observe.mjs:228, outcome-schema.mjs:125) uses `stableStringify` to canonicalize key order. This is the only fingerprint site that does not. The returned `fingerprint` is not persisted (it is a response field only), so the practical impact is nil, but it is an inconsistency a future reader might copy into a persisted path.

**Fix:** Replace with `sha256(stableStringify(bundle))` for consistency. `stableStringify` is already imported in the sibling modules; import it here too.

```javascript
import { stableStringify } from '../registry/schema.mjs';
...
const fingerprint = sha256(stableStringify(bundle));
```

---

_Reviewed: 2026-07-28T15:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_