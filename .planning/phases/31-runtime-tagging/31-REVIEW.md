---
phase: 31-runtime-tagging
reviewed: 2026-08-01T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - tests/router.mjs.snapshot
  - /Users/guilherme/.claude/hooks/router.mjs
  - build-manifest.mjs
  - src/health/outcome-schema.mjs
  - src/health/observe.mjs
  - src/evolution/telemetry-bridge.mjs
  - src/evolution/evidence.mjs
  - tests/router.telemetry-bridge.test.mjs
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: clean
---

# Phase 31: Code Review Report

**Reviewed:** 2026-08-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** clean

> Status updated 2026-08-01 by gsd-code-fixer: WR-01 and WR-02 both fixed
> (runtime/epoch now forwarded by the outcome producers and bounded at both
> trust boundaries). IN-01 left as forward-compat scaffolding by design — the
> `epoch` field intentionally has no producer yet.

## Summary

Reviewed the runtime-tagging (Phase 31) changes across the router hook, its snapshot, the manifest builder, and the health/evidence ingestion chain.

Verified-correct items (no findings):
- **Mirror parity:** `~/.claude/hooks/router.mjs` is byte-identical to `tests/router.mjs.snapshot` (`cmp` → IDENTICAL).
- **cacheKey runtime slot (identity, not metadata):** `runtime` defaults to the module `RUNTIME` constant and is always folded into the hashed parts tuple (`parts = [np, ik, manifestFingerprint, String(runtime)]`), independent of the optional live-hash fold. Cross-runtime isolation holds even when all live hashes are `''`. Production call site passes `RUNTIME` explicitly (`inspectDecision`, line 2828), consistent with the default, so pre-seeded test caches stay reachable.
- **telemetry runtime field additive/privacy-safe:** `telemetryEntryFromState` emits `runtime: RUNTIME` ('claude'|'codex' only) — no prompt text. `outcome`/`downstream_invocations` remain null. Prompt signature still redacted/hash-only.
- **OUTCOME_FIELDS 14→16 bump atomicity:** enforcement test asserts `.size === 16` and every listed field present; `HEALTH_POLICY_VERSION` bumped `health-policy-v1 → health-policy-v2` in `observe.mjs`.
- **build-manifest ROUTER_RUNTIME fail-open:** clamps to `'claude'|'codex'` constants; the raw env string never reaches path construction. No path traversal.
- **telemetry-bridge forwards runtime/epoch** into the evidence envelope and the evidence FIELDS allowlist is 11→13 in lockstep; the bridge test asserts the signal contains exactly the 13 allowlisted keys.

Findings below concern a gap between the schema expansion and its actual producers, and boundedness of the two new fields at the trust boundaries.

## Warnings

### WR-01: Observer drops the runtime/epoch tag at the outcome ingest boundary

**File:** `src/health/observe.mjs:73-87, 219-233`
**Issue:** `OUTCOME_FIELDS` was deliberately bumped 14→16 to permit `runtime`/`epoch` on outcome records, and `HEALTH_POLICY_VERSION` was bumped to v2 in the same module. But the only producers of outcome records in this module — `deriveSelectedOutcome` (canonicalRecord at lines 73-87) and `buildOutcomeRecord` (canonicalRecord at lines 219-233) — construct their envelopes from only `ts / suggested_skills / suggested_agents / guards_fired / prompt_signature / route_id / confidence_tier`, and contain **zero** references to `runtime` or `epoch` (verified by grep). The telemetry records these functions ingest DO carry `runtime` (written by `telemetryEntryFromState`), so the runtime attribution is silently dropped at the T-24-01 trust boundary. The net effect: every runtime-tagged telemetry line loses its tag before it reaches the correlated-outcome store that feeds evolution weights — the very attribution the schema bump was stated to enable ("so a runtime-tagged telemetry line survives ingest"). The schema now permits fields no producer emits, making the size-16 enforcement test pass vacuously for this path.
**Fix:** Forward the tag in both builders, e.g. in `buildOutcomeRecord`/`deriveSelectedOutcome`:
```js
const canonicalRecord = {
  // ...existing fields...
  policy_version: HEALTH_POLICY_VERSION,
  runtime: telemetryRecord.runtime ?? null,
  epoch: telemetryRecord.epoch ?? null,
};
```
(or, if the outcome path is intentionally out of scope for Phase 31, remove `runtime`/`epoch` from `OUTCOME_FIELDS` so the schema matches what the observer actually produces).

### WR-02: `runtime`/`epoch` bypass the bounded-field hardening in both validators

**File:** `src/health/outcome-schema.mjs:107-111` and `src/evolution/evidence.mjs:40-45`
**Issue:** Both validators explicitly harden every string field against over-length ("a string field longer than boundedToken signals user-typed content or an unbounded argument leaking in" — outcome-schema lines 100-106), and enforce `boundedToken` on `capability_id`, `route_id`, `reason_code`, `freshness`, `policy_version`, `fingerprint`, etc. The two newly-added fields `runtime` and `epoch` are written into the allowlist but are **not** covered by the `stringFieldTooLong` loop nor by any `boundedToken`/type check in `validateOutcomeEnvelope` or `validateEvidenceEnvelope`. A corrupt or malicious telemetry line carrying an arbitrarily long / arbitrarily typed `runtime` or `epoch` (e.g. MBs of content, or an object) would pass the trust-boundary validation and be persisted verbatim. Currently the only producer (`telemetryEntryFromState`) emits the constant `RUNTIME` ('claude'|'codex'), so the direct risk is latent — but the two fields sit at the same persistence boundary the rest of the schema was explicitly hardened for, and the hardening rationale documented in these files is now inconsistent.
**Fix:** Add both fields to the bounded checks, mirroring the existing pattern:
```js
// outcome-schema.mjs
for (const field of ['capability_id', 'route_id', 'reason_code', 'freshness', 'policy_version', 'fingerprint', 'runtime', 'epoch']) {
  if (stringFieldTooLong(input[field])) return deny('field_too_long');
}
if (input.runtime !== null && input.runtime !== undefined && !boundedToken(input.runtime, 8)) return deny('invalid_runtime');
```
and equivalently in `validateEvidenceEnvelope` (the bridge already coerces to a short string; bound `runtime` to the `claude|codex` enum and `epoch` to a bounded token).

## Info

### IN-01: `epoch` is never populated anywhere in the pipeline

**File:** `src/evolution/telemetry-bridge.mjs:81`, `src/health/outcome-schema.mjs:44`
**Issue:** `OUTCOME_FIELDS` and the evidence `FIELDS` allowlist both add `epoch`, and the bridge forwards `record.epoch` — but the router hook's `telemetryEntryFromState` never writes an `epoch` field (grep confirms: telemetry records carry `runtime` but no `epoch`). Consequently `epoch` is always `null` in every bridged envelope and absent in every outcome record. This is forward-compat scaffolding rather than a functioning datum. It is harmless today, but the field carries no value until a producer writes it.
**Fix:** Either add an actual epoch (e.g. the manifest fingerprint) to `telemetryEntryFromState`, or defer the `epoch` schema field until a producer exists to avoid implying it is live.

---

_Reviewed: 2026-08-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
