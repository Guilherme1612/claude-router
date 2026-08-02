# Phase 36: Release-Gate Cleanup - Pattern Map

**Mapped:** 2026-08-02  
**Files analyzed:** 10 implementation/test files and 2 data/config inputs  
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lifecycle/router-lifecycle.mjs` | service/lifecycle | request-response + file-I/O | same file: `installRouter`, `uninstallRouter` | exact |
| `src/registry/watcher.mjs` | service/controller | event-driven + streaming | same file: `runRegistryWatcher`, `createRegistryReconciler` | exact |
| `src/registry/fingerprint.mjs` | utility/state | file-I/O + transform | same file: `loadFingerprintState` | exact |
| `install-router.mjs` | CLI/controller | request-response | same file: CLI dispatch | exact |
| `tests/router.fresh-onboarding.test.mjs` | test | request-response + file-I/O | `tests/router.installer-coexistence.test.mjs` | role-match |
| `tests/router.installer-coexistence.test.mjs` | test | CRUD/lifecycle + file-I/O | same file: verb matrix | exact |
| `tests/router.safety-release.test.mjs` | test | request-response/batch | same file: release matrix | exact |
| `tests/router.coverage-audit.test.mjs` | test | transform/batch | same file: baseline audit | exact |
| `tests/router.calibration-thresholds.test.mjs` | test | transform/batch | same file: sensitivity tests | exact |
| `tests/router.router-control-canary.test.mjs` | test | request-response/event-driven | same file: operator CLI tests | exact |
| `coverage-baseline.json` | config/data | batch/transform input | `coverage-baseline.json` consumed by coverage audit | exact |
| `scripts/resolve-tie-lint.mjs` | utility/build gate | batch/transform | `router.calibrate.mjs` and build-gate scripts | role-match |

## Pattern Assignments

### `src/lifecycle/router-lifecycle.mjs` (service/lifecycle, request-response + file-I/O)

**Analog:** existing lifecycle implementation, especially `installRouter` and `uninstallRouter`.

**Imports and ownership paths** (lines 1-14, 183-209): use Node stdlib only (`node:fs`, `node:crypto`, `node:child_process`, `node:path`) and derive both Claude and Codex owned roots from explicit options. Keep all mutable paths under the resolved owned roots.

**Controller ownership/readiness pattern** (lines 214-276):

```js
function readyController(p, configurationFingerprint, staleMs) {
  const status = controllerStatus(p);
  return status?.state === 'ready'
    && status.configuration_fingerprint === configurationFingerprint
    && Number.isFinite(status.heartbeat) && Date.now() - status.heartbeat <= staleMs
    && processAlive(status.pid) ? status : null;
}

async function stopController(p, configurationFingerprint, options = {}) {
  const status = controllerStatus(p);
  if (!status || status.configuration_fingerprint !== configurationFingerprint || !processAlive(status.pid)) return;
  atomicWrite(p.controllerControlPath, JSON.stringify({
    schema_version: 1, action: 'shutdown', instance_id: status.instance_id,
    configuration_fingerprint: configurationFingerprint,
  }) + '\n');
  // Poll cooperative shutdown, then SIGTERM, then SIGKILL only for the owned PID.
}
```

**Deployment closure pattern** (lines 374-444): keep a literal `moduleNames` list, deploy each file to both runtime roots, and separately deploy the root-level gate entrypoints, fixtures, and `src/` mirror required by their relative imports. This is the closest pattern for fixing a missing deployed builder dependency; add the smallest missing owned input to `gateEntryNames`.

**Fresh-home pattern** (lines 684-705): run the deployed builder only after immutable deployment and controller readiness, pass fresh-home paths through environment variables, and warn/continue on builder failure so the hook remains fail-open.

**Teardown/error pattern** (lines 724-731, 739-833): stop the owned controller before mutation, validate the ownership manifest before deleting anything, retain modified/ambiguous files, then remove lifecycle-generated assets and prune directories deepest-first. Do not broaden deletion beyond manifest ownership and explicitly generated runtime assets.

### `src/registry/watcher.mjs` (service/controller, event-driven + streaming)

**Analog:** existing `runRegistryWatcher` and `createRegistryReconciler`.

**Shutdown pattern** (lines 385-392, 468-495): centralize cleanup in `finishWatcherShutdown`; clear heartbeat/control timers, close the registry controller, publish `stopped`, remove signal handlers, and make `close()` idempotent through `stopping`.

```js
export async function finishWatcherShutdown(controller, publish, removeSignalHandlers) {
  try {
    await controller.close();
    await publish('stopped');
  } finally {
    removeSignalHandlers();
  }
}
```

**Configuration/fingerprint pattern** (lines 398-425): strip function-valued test runners before hashing; restore test-only dependencies only in the explicit `test_mode` seam. Production configuration remains serialized and fingerprint-stable.

**Bounded incremental pattern** (lines 554-590): keep a fresh acquisition baseline, count lifecycle events, re-acquire after `FULL_REACQUIRE_EVENT_THRESHOLD` (500), reset the counter, and feed an empty diff to the equivalence gate. Preserve incremental behavior between full acquisitions; do not hide drift by weakening reconciliation.

### `src/registry/fingerprint.mjs` (utility/state, file-I/O + transform)

**Analog:** `loadFingerprintState` / `saveFingerprintState` (lines 262-320).

```js
function invalidState(code) {
  return { clean_scan_required: true, state: null, diagnostics: [{ code }] };
}

export async function loadFingerprintState(path, expectedRoots) {
  let state;
  try { state = JSON.parse(await readFileFs(path, 'utf8')); }
  catch (error) { return invalidState(error?.code === 'ENOENT' ? 'state_missing' : 'state_malformed'); }
  const error = validateState(state, expectedRoots);
  return error ? invalidState(error) : { clean_scan_required: false, state, diagnostics: [] };
}
```

Use explicit diagnostic codes for missing/malformed/incompatible or unsafe state, validate hashes before reuse, and require atomic temporary-file writes for persisted state.

### `install-router.mjs` (CLI/controller, request-response)

**Analog:** existing top-level CLI dispatch (lines 1-115). Keep it stdlib-only, resolve paths from flags, pass lifecycle options through unchanged, and report install/uninstall status without embedding lifecycle logic. The `readinessTimeoutMs: 60_000` option belongs at this boundary because it is an operational timeout, not router semantics.

### `tests/router.fresh-onboarding.test.mjs` (test, request-response + file-I/O)

**Analog:** `tests/router.installer-coexistence.test.mjs` fixture and cleanup helpers.

**Fixture/seam pattern** (lines 38-60, 62-101): use `mkdtempSync`, isolated `.claude`/`.codex` roots, an injected `manifestBuilder`, and the existing `stubVerificationRunners` + `inProcessControllerLauncher`. Assert the builder runs against the deployed `build-manifest.mjs`, receives fresh-home env paths, writes a schema-shaped manifest, and is stopped/cleaned in `finally`.

### `tests/router.installer-coexistence.test.mjs` (test, lifecycle + file-I/O)

**Analog:** same file, lines 16-20 and 22-119. Preserve unrelated bytes, exercise the five lifecycle verbs, use test-only seams explicitly, and await controller shutdown before deleting fixture roots. The `safeStopController` helper is the pattern for avoiding teardown races; do not add sleeps as synchronization.

### `tests/router.safety-release.test.mjs` (test, request-response/batch)

**Analog:** same file, lines 82-140. Map each safety requirement to executable test files, invoke the real hook/CLI with `spawnSync`, assert zero exit and parseable JSON, and assert privacy/fail-open behavior. Keep calibration output assertions tied to fixture counts and documented thresholds rather than relaxing thresholds.

### `tests/router.coverage-audit.test.mjs` (test, transform/batch)

**Analog:** same file, lines 13-23. Load `coverage-baseline.json`, assert schema, exact count, sorted unique identities, and exact classification/reason. Use temporary fixture roots for builder tests and delete them in the test body/finalizer.

### `tests/router.calibration-thresholds.test.mjs` (test, transform/batch)

**Analog:** same file, lines 103-128. Inspect the real corpus through exported pure functions, assert the canonical tuple and independent boundary support, then run leave-one-out sensitivity twice and assert deterministic, pure output with numeric min/max ranges.

### `tests/router.router-control-canary.test.mjs` (test, request-response + event-driven)

**Analog:** same file, operator CLI tests around lines 125-312. Use isolated owned roots and seeded evidence, assert parseable result objects/reason codes, require dry-run confirmation before mutation, and verify unavailable/insufficient-evidence paths do not call activation.

### `coverage-baseline.json` (config/data, batch input)

**Analog:** existing baseline consumed by `auditCoverage`. Preserve schema version, sorted unique `(category, id)` keys, and the explicit `expected_bm25_only` reason. Any inventory change requires a deterministic audit diff; never delete entries merely to make strict coverage green.

### `scripts/resolve-tie-lint.mjs` (utility/build gate, batch/transform)

**Analog:** existing standalone script invoked by the manifest/release gate. Keep it dependency-free and deploy it as a root-level gate input alongside `build-manifest.mjs`; relative imports must resolve from the owned root after installation.

## Shared Patterns

### Ownership and teardown

**Sources:** `src/lifecycle/router-lifecycle.mjs:756-833`, `tests/router.installer-coexistence.test.mjs:106-119`  
**Apply to:** lifecycle changes and all install/uninstall tests.

Validate ownership before mutation, stop only a PID matching both the status record and configuration fingerprint, retain user-modified files, await async shutdown, and prune generated state after manifest files.

### Fail-closed release evidence, fail-open hook behavior

**Sources:** `src/registry/fingerprint.mjs:262-309`, `tests/router.safety-release.test.mjs:152-173`  
**Apply to:** watcher, fingerprint, release, and calibration work.

Malformed state or missing gate evidence must produce explicit diagnostics/non-passing verification; prompt-time hook errors must still exit successfully with empty output. Do not substitute simulated release evidence in production.

### Freshness and deterministic evidence

**Sources:** `tests/router.coverage-audit.test.mjs:13-23`, `tests/router.calibration-thresholds.test.mjs:103-128`  
**Apply to:** baseline and calibration files/tests.

Assert exact counts, sorted unique identities, canonical thresholds, and repeatable sensitivity ranges. Record unavailable operator activation explicitly rather than forcing activation or changing thresholds.

### Test seams

**Sources:** `tests/router.fresh-onboarding.test.mjs:62-101`, `tests/router.installer-coexistence.test.mjs:92-119`  
**Apply to:** lifecycle tests only.

Use injected launcher/verifier/builder seams for fast isolated tests; retain separate real-home tests for release truth. Never let `testMode` or injected runners enter production serialized configuration.

## No Analog Found

None. Every phase file has a direct lifecycle, watcher, state, release-test, or data-baseline analog. The only special case is `scripts/resolve-tie-lint.mjs`: reuse its existing standalone build-gate contract rather than inventing a new installer abstraction.

## Metadata

**Analog search scope:** `src/lifecycle`, `src/registry`, `src/release`, `src/coverage`, `scripts`, `install-router.mjs`, and `tests/router*.test.mjs`  
**Files scanned:** 12 primary files plus phase artifacts  
**Pattern extraction date:** 2026-08-02
