---
phase: 20-close-gap-evo-05-add-production-trigger-for-canary-controller
reviewed: 2026-07-22T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/cli/router-control.mjs
  - src/evolution/canary-controller.mjs
  - src/evolution/candidate-calibration-route.mjs
  - src/evolution/evidence.mjs
  - src/evolution/telemetry-bridge.mjs
  - src/lifecycle/router-lifecycle.mjs
  - src/prompt/compile-index.mjs
  - src/registry/watcher.mjs
  - tests/router.deployed-bundle.test.mjs
  - tests/router.evidence-persistence.test.mjs
  - tests/router.lifecycle.test.mjs
  - tests/router.router-control-canary.test.mjs
  - tests/router.telemetry-bridge.test.mjs
  - tests/router.watcher-canary-trigger.test.mjs
findings:
  critical: 1
  warning: 7
  info: 6
  total: 14
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-07-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Fresh re-review of the current code state. The three findings documented in the git log as fixed are verified resolved:

- **CR-01 (phase 20-04, `recovered` flag)** — fixed in commit 511b825. `recovered` is now declared inside the reconcile function (`watcher.mjs:313`), resetting per call. The canary path runs on every eligible reconcile. Regression test: `tests/router.watcher-canary-trigger.test.mjs:293` (Test 8).
- **CR-02a (evidence-sufficiency gate)** — fixed in commit fd3c63d. CLI promote gates on `window.sufficient !== true` at `router-control.mjs:442` before calling `applyCanaryDecision`. Regression test: `tests/router.router-control-canary.test.mjs:267` (Test 7).
- **CR-02b (rollback_reason)** — fixed in commit fd3c63d. CLI `canary rollback` passes `rollback_reason: 'canary_rollback'` at `router-control.mjs:505`. Regression test: `tests/router.router-control-canary.test.mjs:297` (Test 8).

However, the prior re-review's CR-01 (path traversal via `project_id`) is **NOT** addressed by those commits — the git log's "CR-01" refers to the phase 20-04 `recovered`-flag finding, a different issue with the same ID. The path traversal remains: the `TOKEN` regex in `evidence.mjs:15` still allows `/`, and `path.join` resolves `..` segments, allowing file escape. Verified empirically: `TOKEN.test('a/../../../etc') === true` and `path.join('/data/evidence', 'project-a/../../../etc.jsonl') === '/etc.jsonl'`.

Six warnings and five info items from the prior re-review remain valid, plus two new warnings identified in this pass.

## Critical Issues

### CR-01: Path traversal via `project_id` in persistent evidence store

**File:** `src/evolution/evidence.mjs:15,21-23,178-181,189-190`
**Issue:** `boundedToken` validates `project_id` against `TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/`, which allows the `/` character. `pathFor` (lines 178-181) constructs the JSONL file path as `join(root, \`project-${scope.project_id}.jsonl\`)`. Because `path.join` normalizes `..` segments, a `project_id` like `a/../../../etc` passes `boundedToken` and resolves the file path outside the evidence root.

Verified empirically:
```
TOKEN.test('a/../../../etc') === true
path.join('/data/evidence', 'project-a/../../../etc.jsonl') === '/etc.jsonl'
```

Both `append` (line 212, `appendFileSync(pathFor(scope), ...)`) and `window` (line 220, `readFileSync(pathFor(scope), ...)`) are affected. The evidence store is a security-sensitive component that gates canary promotion; the validator is the defense-in-depth boundary. Current callers pass hardcoded `'global'` (router-control.mjs:309, watcher.mjs:400) or config-derived `scope_id`, so the attack surface is limited to adversaries who can influence the controller config. But the validator's purpose is to be the hard boundary regardless of caller discipline — allowing `/` in a token used for file paths defeats it.

**Fix:** Remove `/` from the TOKEN regex, or use a stricter regex for `project_id` specifically:
```js
// Option A: tighten the global TOKEN (all consumers are flat tokens: route_id,
// reason_code, candidate_version, policy_version, guard_codes, project_id — none need '/')
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

// Option B: dedicated path-safe validator for project_id
const PATH_SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function scopeFor(options) {
  if (options.scope === 'aggregate') {
    if (options.aggregate_eligible !== true) return deny('aggregate_eligibility_required');
    return { kind: 'aggregate' };
  }
  if (typeof options.project_id !== 'string' || !PATH_SAFE.test(options.project_id) || options.project_id.length > 128) return deny('invalid_project_scope');
  return { kind: 'project', project_id: options.project_id };
}
```

## Warnings

### WR-01: CLI `canary promote` defaults `reconciliation` to `eligible` when report file is missing — bypasses the safety gate

**File:** `src/cli/router-control.mjs:335,345,378`
**Issue:** When `candidate/registry.json` exists but `candidate/report.json` is missing (partial write, corruption, or manual deletion), the fallback `reconciliation` is `{ disposition: 'eligible', verdicts: [], candidate_fingerprint: 'candidate-unknown' }` (line 345). The safety gate then checks `reconciliation.disposition === 'eligible'` (line 378) and passes — even though no safety reconciliation actually occurred. This defeats the safety gate, which exists to prevent promoting a candidate that the reconciler flagged as quarantined.

The watcher always writes both files atomically together (watcher.mjs:339-340), so in normal operation both are present. But the CLI is a separate process reading disk state; the missing-report case is a real edge case the default must handle safely. The candidate file itself embeds a `disposition` field (written by the watcher at watcher.mjs:325-333), which the CLI could consult instead of defaulting to `'eligible'`.

**Fix:** Default to fail-closed when the report is missing, or read the disposition from the candidate file:
```js
const reconciliation = reportFile || {
  disposition: candidateFile?.disposition === 'eligible' ? 'eligible' : 'quarantined',
  verdicts: candidateFile?.verdicts || [],
  candidate_fingerprint: candidateFile?.candidate_fingerprint || 'candidate-unknown',
};
if (!reportFile && !candidateFile?.disposition) {
  return { result: canonical('canary promote', false, 'missing_reconciliation_report', detail), exitCode: EXIT.invalid };
}
```

### WR-02: CLI `canary promote` missing `knownGood` null gate — can run canary path without a known-good version

**File:** `src/cli/router-control.mjs:325-460`
**Issue:** The CLI promote path does not gate on `knownGood === null`. The watcher explicitly checks `if (knownGood === null)` at watcher.mjs:379 and takes the bootstrap path (direct activation with `reason: 'watcher'`), bypassing `applyCanaryDecision` entirely. The CLI promote path has no equivalent gate. When `knownGood` is null, `knownGoodCtx` is null (line 367), `knownGoodEvaluation` is null (line 370), and the D-05 `strictImprove` derivation uses optional chaining (`knownGoodEvaluation?.quality.pass === false` → `undefined === false` → `false`), so `demonstrated_benefit` can only be `neutral` or `safety_correction`. If the report is a safety fix (`isSafetyFix(reconciliation)` true), `demonstrated_benefit.status = 'safety_correction'`, and `applyCanaryDecision` activates the candidate with `known_good_version: null` — meaning there is no rollback target if the activation breaks something.

The CLI `canary rollback` branch already gates on `if (!knownGood)` (line 468). The promote branch should too.

**Fix:** Gate promote on `knownGood` before running the canary evaluation:
```js
if (!knownGood) {
  return { result: canonical('canary promote', false, 'no_known_good_version', {
    known_good_version: null,
    published_version: canaryActive?.version_id ?? null,
    next_action: 'run_registry_recovery_or_bootstrap',
  }), exitCode: EXIT.invalid };
}
```

### WR-03: Duplicated D-05 `demonstrated_benefit` derivation between router-control.mjs and watcher.mjs

**File:** `src/cli/router-control.mjs:21-25,394-412` and `src/registry/watcher.mjs:35-39,436-451`
**Issue:** The `isSafetyFix` predicate and the entire D-05 `demonstrated_benefit` derivation (~18 lines: strict-improve on quality/context, latency hard gate, safety_correction on parity, neutral otherwise) are duplicated verbatim between the CLI promote path and the watcher canary path. The comments acknowledge the mirror (router-control.mjs:19-20, 396-397) but there is no shared helper. If one side is updated (e.g. a new gate added to strict-improve) and the other is not, the CLI and watcher will diverge — an operator promoting via CLI would get a different canary decision than the watcher promoting automatically. This is a correctness risk, not just a style issue.

**Fix:** Extract the shared logic into a helper in `evolution/canary-controller.mjs` and import from both call sites:
```js
// evolution/canary-controller.mjs
export function deriveDemonstratedBenefit({ evaluation, candidateEvaluation, knownGoodEvaluation, assessed, reconciliation }) {
  if (!evaluation.promotable) return null;
  const strictImproveQuality = candidateEvaluation.quality.pass === true && (knownGoodEvaluation?.quality.pass ?? true) === false;
  const strictImproveContext = candidateEvaluation.context_budget.pass === true && (knownGoodEvaluation?.context_budget.pass ?? true) === false;
  const strictImprove = strictImproveQuality || strictImproveContext;
  const latencyPass = assessed.latency.pass === true;
  if (strictImprove && latencyPass) {
    return { status: 'demonstrated', reason_code: strictImproveQuality ? 'quality_improved' : 'context_bytes_reduced' };
  }
  if (!strictImprove && latencyPass && isSafetyFix(reconciliation)) {
    return { status: 'safety_correction', reason_code: 'safety_fix' };
  }
  return { status: 'neutral', reason_code: 'no_strict_improvement' };
}
```

### WR-04: `runRouterControl` lacks top-level error handling for the canary branch — `createPersistentEvidenceStore` errors propagate unstructured

**File:** `src/cli/router-control.mjs:295-510`
**Issue:** The `canary status` and `canary promote` subcommands call `createPersistentEvidenceStore({ root: join(root, 'evidence') })` (lines 308, 349) outside any try/catch. If the evidence directory cannot be created (permission denied, read-only filesystem, disk full), `mkdirSync` inside the store constructor throws, and the error propagates uncaught through `runRouterControl`. Programmatic callers receive a raw exception; the CLI entry point at line 521 catches it and emits the generic `ROUTER CONTROL FAILED: internal_error` with exit code 5 (mutation), which is misleading for a read/setup failure. Other subcommands (status, diff, explain) at least surface `activeSourceFailure` first; the canary branch has no equivalent guard.

**Fix:** Wrap the canary subcommand body in a try/catch that returns a structured canonical failure:
```js
if (command === 'canary') {
  try {
    // ... existing canary logic ...
  } catch (error) {
    return { result: canonical('canary', false, 'internal_error', { error: error.message }), exitCode: EXIT.mutation };
  }
}
```

### WR-05: Discarded `measureRoutes` call in watcher canary path — known-good performance measured but result unused

**File:** `src/registry/watcher.mjs:413`
**Issue:** Line 413 calls `measure({ fixtures: CALIBRATION_CORPUS, route: knownGoodCtx.route, versions: {...}, baseline: null })` but discards the return value. The candidate measurement at line 412 is assigned to `candidatePerf` and used by `assess` at line 414. The known-good measurement is not assigned to any variable and is never consulted. There is no comment explaining an intentional side effect. The test stub (router.watcher-canary-trigger.test.mjs:94-96) has no side effect, so in tests this is pure dead code. If `measureRoutes` has a required side effect in production (e.g. warming caches, recording telemetry), it needs a comment; otherwise it adds latency to the reconcile path for nothing. The CLI promote path does not have this extra call.

**Fix:** Either remove the dead call, or assign the result and document the intent:
```js
// If intentional (e.g. warm known-good route caches for downstream compares):
const knownGoodPerf = measure({ /* ... */ }); // warm cache; not used by assess()
// or simply remove the line if no side effect is needed.
```

### WR-06: Watcher canary path does not pass `rollback_reason` — watcher-triggered rollbacks indistinguishable from registry rollbacks in audit trail

**File:** `src/registry/watcher.mjs:452-459`
**Issue:** CR-02b fixed the CLI `canary rollback` command to pass `rollback_reason: 'canary_rollback'` so the audit trail distinguishes canary rollback from registry rollback (`canary-controller.mjs:188` uses `reason: rollback_reason || 'rollback'`). However, the watcher's canary path calls `canaryDecision(...)` at line 452 without passing `rollback_reason`. When a gate failure triggers a rollback (evaluation.promotable=false with a published_version present), `applyCanaryDecision` enters its rollback branch (`canary-controller.mjs:176-193`) and records `reason: 'rollback'` (the generic default) — the same value a registry `rollback` verb records. The watcher's automatic canary rollback is therefore indistinguishable from an operator-initiated registry rollback in the audit trail, the exact concern CR-02b addressed for the CLI path.

**Fix:**
```javascript
// src/registry/watcher.mjs:452-459 — add rollback_reason to the canaryDecision call
const decision = canaryDecision({
  evaluation,
  demonstrated_benefit,
  activation: { ownedRoot: config.activation_root, candidate: built.registry, reconciliation: report, mapping, policy: config.activation_policy || {}, verification, reason: 'canary', test_mode: config.test_mode === true },
  ownedRoot: config.activation_root,
  known_good_version: knownGood,
  published_version: active.tuple_version_id || active.version_id || null,
  rollback_reason: 'canary_rollback',  // distinguish watcher canary rollback from registry rollback
});
```

### WR-07: Evidence store is never populated in production — canary path always fails the sufficiency gate

**File:** `src/registry/watcher.mjs:399-402`, `src/cli/router-control.mjs:307-350`
**Issue:** Both production code paths create an evidence store and call `store.window(...)` to check sufficiency, but neither ever calls `store.append(...)` to ingest evidence. The telemetry bridge (`src/evolution/telemetry-bridge.mjs`) exports `ingestTelemetryFile` and `telemetryRecordToEvidence` specifically for transforming telemetry into evidence envelopes, but these functions are never called from the watcher, CLI, or lifecycle modules. In production, the evidence store directory (`~/.claude/router/evidence/`) will have no JSONL files, so `window.sufficient` will always be `false` (0 samples < 30 minimum). This means:
- The watcher canary path always preserves (`reason_code: 'insufficient_evidence_samples'`) — no candidate is ever promoted via canary.
- The CLI `canary promote --execute` always returns `insufficient_evidence_samples` — the operator can never promote.

The canary promotion mechanism is effectively dead in production without a separate evidence ingestion process that does not exist in the reviewed code. This may be by design for this phase (the phase adds the trigger surface, not the ingestion pipeline), but it should be explicitly documented as a known gap to prevent false confidence that the canary path is operational.

**Fix:** Either wire `ingestTelemetryFile` into the watcher's reconcile cycle (e.g., ingest `~/.claude/router/telemetry.jsonl` before calling `store.window()`), or document explicitly that evidence ingestion is a separate phase and the canary path is not yet operational in production.

## Info

### IN-01: `canary status` creates the evidence directory as a side effect (not purely read-only)

**File:** `src/cli/router-control.mjs:308`
**Issue:** `createPersistentEvidenceStore` calls `mkdirSync(root, { recursive: true, mode: 0o700 })` in its constructor, so `canary status` (a read-only inspection command) creates the `evidence/` directory on first invocation. This is a benign mutation but surprising for a status verb. Not a correctness bug.

### IN-02: `classifyFixtureClass` `deny_filtered` branch is unreachable

**File:** `src/evolution/telemetry-bridge.mjs:33`
**Issue:** `classifyFixtureClass` checks `if (record.confidence_tier === 'deny_filtered') return null;` at line 33, but `telemetryRecordToEvidence` already returns `{ status: 'skipped' }` at line 58 for any privacy-denied record (which includes `deny_filtered`) before `classifyFixtureClass` is called at line 59. The branch is defensive dead code. Harmless but worth a comment if intentional.

### IN-03: `canary rollback` silently ignores extra positional arguments

**File:** `src/cli/router-control.mjs:462`
**Issue:** The `canary rollback` branch does not check `positional.length`. Test 6 (router.router-control-canary.test.mjs:237-259) explicitly verifies that an arbitrary version positional is silently ignored in favor of `knownGood` as the destination. This is intentional per the comments (lines 462-467), but silent argument swallowing can confuse operators who expect the positional to be honored.

### IN-04: Inconsistent exit codes between promote and rollback for non-success outcomes

**File:** `src/cli/router-control.mjs:443,459,508`
**Issue:** `canary promote --execute` with insufficient evidence returns `EXIT.invalid` (3) at line 443; a non-promoted decision returns `EXIT.invalid` (3) at line 459. `canary rollback --execute` that fails returns `EXIT.unsafe` (4) at line 508. The asymmetry is defensible (rollback failure is a safety concern; promote failure is a policy decision), but operators scripting against the CLI may expect uniform exit codes for "canary did not proceed" outcomes.

### IN-05: Deployed-bundle test does not assert `candidate-calibration-route.mjs` is listed in `moduleNames`

**File:** `tests/router.deployed-bundle.test.mjs:11-16`
**Issue:** `EXPECTED_EVOLUTION_MODULES` lists `canary-controller`, `evidence`, `perf-measure`, and `telemetry-bridge`, but omits `candidate-calibration-route.mjs` (added to `moduleNames` at router-lifecycle.mjs:325). The lifecycle count test (router.lifecycle.test.mjs:77, `assert.equal(manifest.files.length, 66)`) implicitly covers it, but the explicit string-literal assertion (Task3.1) does not. If `candidate-calibration-route.mjs` were accidentally removed from `moduleNames`, the count test would catch it with a less helpful failure message than the explicit string-literal test.

**Fix:** Add `'evolution/candidate-calibration-route.mjs'` to `EXPECTED_EVOLUTION_MODULES`.

### IN-06: `PRIVACY_GUARDS` set duplicated four times across modules

**File:** `src/evolution/evidence.mjs:14`, `src/evolution/telemetry-bridge.mjs:20`, `src/registry/watcher.mjs:417`, `src/cli/router-control.mjs:375`
**Issue:** The privacy guard code set `['privacy_guard', 'deny_filtered', 'secret_detected', 'content_detected']` is defined in four locations. The telemetry-bridge comment (`telemetry-bridge.mjs:17-19`) notes it "Mirrors evidence.mjs:12 PRIVACY_GUARDS (not exported there)". If the set ever changes in one location, the others would silently diverge, potentially allowing privacy-denied records to leak into canary evidence.

**Fix:** Export `PRIVACY_GUARDS` from `evidence.mjs` and import it in the other three files, or accept the duplication with the existing documentation.

---

_Reviewed: 2026-07-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_