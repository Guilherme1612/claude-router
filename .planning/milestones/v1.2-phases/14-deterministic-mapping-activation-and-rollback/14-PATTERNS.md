# Phase 14: Deterministic Mapping, Activation, and Rollback - Pattern Map

**Mapped:** 2026-07-15
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/registry/map.mjs` | service / transform | batch, transform | `src/registry/reconcile.mjs` | exact |
| `src/registry/validate.mjs` | service / validation gateway | batch, bounded subprocess | `src/registry/reconcile.mjs`, `router.calibrate.mjs` | role-match |
| `src/registry/activate.mjs` | service / store | file-I/O, event-driven | `src/lifecycle/router-lifecycle.mjs` | role-match |
| `src/registry/watcher.mjs` | controller / background orchestrator | event-driven, batch | existing `src/registry/watcher.mjs` | exact |
| `src/cli/router-control.mjs` | controller / CLI | request-response, file-I/O | `install-router.mjs` | exact |
| `tests/router.registry-map.test.mjs` | test | batch, transform | `tests/router.registry-reconcile.test.mjs` | exact |
| `tests/router.registry-activate.test.mjs` | test | file-I/O, failure injection | `tests/router.lifecycle.test.mjs` | exact |
| `tests/router.registry-watcher.test.mjs` | test | event-driven, dependency-injected orchestration | existing `tests/router.registry-watcher.test.mjs` | exact |
| `tests/router.control-cli.test.mjs` | test | request-response, subprocess | `tests/router.lifecycle.test.mjs` | role-match |
| `install-router.mjs` | controller / installer | request-response, file-I/O | existing `install-router.mjs` | exact |
| `calibration-tasks.json` | config / fixture | batch | existing `calibration-tasks.json` | exact |
| shared Phase 14 fixture helpers (within the three test files) | test utility | file-I/O, transform | `tests/router.registry-reconcile.test.mjs`, `tests/router.lifecycle.test.mjs` | exact |

The research uses newer focused-suite names (`router.registry-map`, `router.registry-activate`, `router.control-cli`) than the approved implementation plan (`router.registry-mapping`, `router.registry-activation`, `router.registry-cli`). Use the research names consistently unless the planner explicitly reconciles this naming drift.

## Pattern Assignments

### `src/registry/map.mjs` (service/transform, batch)

**Primary analog:** `src/registry/reconcile.mjs`

**Imports and canonical-byte pattern** (`reconcile.mjs:1-8`):

```js
import { createHash } from 'node:crypto';
import { stableCapabilityId } from './identity.mjs';
import { canonicalizeCapability, stableStringify, validateCapability } from './schema.mjs';

function fingerprint(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value), 'utf8').digest('hex');
}
```

Copy the reuse of schema/identity helpers and SHA-256 over stable bytes. Do not introduce another serializer or identity implementation.

**Portable structured evidence pattern** (`reconcile.mjs:10-31`):

```js
function portable(value) {
  if (Array.isArray(value)) return value.map(portable);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (['local_path', 'path', 'absolute_path'].includes(key)) continue;
    output[key] = portable(value[key]);
  }
  return output;
}
```

Mapping evidence, rejected alternatives, advisory provenance, and reason codes should be portable and sorted before fingerprinting.

**Exact-candidate validation pattern** (`reconcile.mjs:182-200, 238-257`): build `recordsById` from the canonical candidate, validate exact target presence, lifecycle, dispatchability, invocation, dependencies, permissions, scope, and blocking conflicts. Never repair a miss from active-version state.

**Deterministic output pattern** (`reconcile.mjs:259-272`):

```js
verdicts.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
const canonical = { disposition: verdicts.length ? 'quarantined' : 'eligible', verdicts };
return { ...canonical, report_fingerprint: fingerprint(canonical) };
```

Apply the same stable sorting to subjects, evidence ledger entries, alternatives, and advisory inputs. Implement precedence as authority tiers that stop on unique resolution or strong conflict, not as additive cross-tier scoring.

**Continuity analog:** `src/registry/diff.mjs:119-168` pairs records only from authoritative continuity keys, sorts keys/events/diagnostics, and emits weak similarity solely as `authoritative: false` diagnostic evidence. Route-family inheritance should follow that separation.

### `src/registry/validate.mjs` (service/validation gateway, batch and bounded subprocess)

**Primary analogs:** `src/registry/reconcile.mjs` for canonical fail-closed results; `router.calibrate.mjs` plus `tests/router.calibration-codebase.test.mjs` for the local calibration runner boundary.

**Canonical fail-closed verdict production** (`reconcile.mjs:21-31, 169-179`): construct schema-versioned verdicts with stable `code`, severity, `dispatchable: false`, portable subject/evidence, bounded reason, and corrective action. Catch producer/runner failures and return a canonical non-passing result with an error *type/code*, never caller error text or a partially passing verification. Sort gates/verdicts by stable bytes and fingerprint the complete canonical result as in `reconcile.mjs:259-269`.

**Trusted runner allowlisting and selection:** define `REQUIRED_ACTIVATION_GATES` as a frozen, sorted constant containing exactly the eight Plan 14-02 IDs. Resolve runners by these IDs only, reject missing/duplicate/unknown IDs, and never accept a caller-authored gate outcome or executable path. The closest repository selection convention is the explicit dependency table in `createRegistryReconciler` (`watcher.mjs:231-235`), where known semantic slots select production defaults; validation should make the trust boundary stricter by accepting test overrides only through a marked test-only dependency channel and by checking every selected runner against the required-ID table.

**Bounded local runner invocation** (`tests/router.calibration-codebase.test.mjs:151-156`):

```js
const proc = spawnSync(process.execPath, ['router.calibrate.mjs'], {
  cwd: repoRoot,
  encoding: 'utf8',
  timeout: 30000,
});
```

Use `process.execPath`, a repository-owned allowlisted script, fixed arguments, fixed `cwd`, captured output, explicit timeout, and `shell: false`; do not accept command strings, arbitrary paths, environment-selected binaries, or shell interpolation. Bound output before placing evidence into the result and persist only fingerprints/portable summaries rather than raw stdout/stderr.

**Runner error/timeout handling:** treat `spawnSync` `error`, signal, timeout, nonzero/null status, malformed output, and input/fingerprint mismatch as distinct stable non-passing reason codes. The watcher precedent (`watcher.mjs:51-53, 79-86`) normalizes thrown values to `Error` and keeps failed work from advancing state; the validation producer should similarly complete all required gate records deterministically while setting the overall disposition non-passing.

**Portable evidence serialization** (`reconcile.mjs:10-18, 21-31`): recursively sort object keys and remove absolute/local path fields before hashing. Store per-gate `evidence_fingerprint`, exact candidate/reconciliation/mapping/policy input fingerprints, freshness metadata, and bounded reason codes; never persist absolute `cwd`, raw prompts, secrets, raw command output, or exception messages.

**Injection boundary:** production callers pass canonical inputs, not runners. Tests may supply deterministic local runner functions through an explicit test-only option (for example `testDependencies` guarded by `NODE_ENV === 'test'` or an unexported factory used only by the test module). Do not expose general runner injection through watcher configuration, persisted JSON, CLI arguments, or activation APIs.

### `src/registry/activate.mjs` (service/store, file-I/O)

**Primary analog:** `src/lifecycle/router-lifecycle.mjs`

**Filesystem/import convention** (`router-lifecycle.mjs:1-11`): use named `node:fs` imports, `node:crypto`, `node:path`, and repository `stableStringify`; remain zero-dependency.

**Atomic sibling replacement baseline** (`router-lifecycle.mjs:19-24`):

```js
function atomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}`;
  writeFileSync(temporary, value);
  renameSync(temporary, file);
}
```

Phase 14 must strengthen this baseline: exclusive staging/version creation, write and `fsync` every payload, manifest last, sync directories, reread/verify the pointer temp, same-directory `renameSync`, then sync the pointer directory. Only `active.json` is mutable authority.

**Complete-manifest pattern** (`router-lifecycle.mjs:286-302`): manifest has a schema version, `state: 'complete'`, sorted file metadata/fingerprints, directories, and bindings, and is written after owned payloads. The immutable version manifest should likewise close over `registry.json`, `mappings.json`, `evidence.json`, and `verification.json`.

**Failure preservation analog** (`router-lifecycle.mjs:149-164, 247-259, 330-336`): snapshot before mutation, wrap mutation in `try/catch`, restore exact prior bytes on failure. For activation, preserve the stronger pointer protocol: failures before rename leave the pointer byte-identical; uncertainty after rename is classified for recovery rather than copying historical contents.

**Candidate/active separation** (`router-lifecycle.mjs:189-202`): candidate publication explicitly emits `activated: false` and a stable candidate/report fingerprint. Activation must consume a fully gated candidate and create a self-contained immutable bundle; the candidate artifact itself is not a version.

### `src/registry/watcher.mjs` (controller/background orchestrator, event-driven batch)

**Primary analog:** the existing module itself.

**Production dependency selection** (`watcher.mjs:225-245`): select acquisition, refresh, assembly, reconciliation, publication, and active-state readers once at reconciler creation. Extend this table with production imports for mapper, verification producer, activator, and recovery. Keep runner selection inside `validate.mjs`; the watcher must not accept arbitrary executable definitions from config.

**Strict single-flight sequencing** (`watcher.mjs:65-86`): await each stage before advancing state and serialize reruns. The new reconciliation body must enforce `reconcile -> map -> produceActivationVerification -> activate`, skipping all later calls after quarantine or non-passing verification. Advance `baseline` only after diagnostic publications and the required activation/preservation result complete.

**Error preservation** (`watcher.mjs:51-53, 79-86, 121-131`): normalize thrown failures, report them, retain the last valid baseline, and schedule at most one follow-up. Mapper, trusted-runner timeout/error, validation, activation, or durability failures should publish portable structured status and preserve exact active pointer/version bytes.

**Local process allowlist precedent** (`watcher.mjs:204-212`): the only restart spawn uses `process.execPath` and the current repository-owned module path with fixed arguments and ignored stdio. Gate runners should be more bounded (synchronous/captured, timed, non-detached) but retain the same fixed-local-target/no-shell property.

### `src/cli/router-control.mjs` (controller/CLI, request-response)

**Primary analog:** `install-router.mjs`

**Argument and error convention** (`install-router.mjs:12-26, 50-55, 101-104`): parse `process.argv.slice(2)`, reject missing option values, provide explicit help, catch top-level errors, write diagnostics to stderr, and set a meaningful exit code.

**Command dispatch convention** (`install-router.mjs:70-100`): one top-level branch selects the command and renders its result. Phase 14 should improve this by keeping each command core pure and rendering the same canonical result as deterministic text or `stableStringify` JSON.

**Safety rule:** `status`, `diff`, `explain`, and `registry verify` must perform no writes. Rollback always returns preview first; execution re-verifies the immutable destination and current pointer sequence, requires an exact destination-id confirmation (interactive or explicit argument), and delegates the only mutation to `activate.mjs`.

**Installer integration:** extend `router-lifecycle.mjs`'s module deployment list (`router-lifecycle.mjs:203-210`) and owned manifest entries (`237-243, 286-302`) to deploy `registry/map.mjs`, `registry/activate.mjs`, and `cli/router-control.mjs` for both runtime roots without touching unrelated settings.

### `tests/router.registry-map.test.mjs` (test, batch/transform)

**Analog:** `tests/router.registry-reconcile.test.mjs`

**Fixture pattern** (`router.registry-reconcile.test.mjs:7-41`): export compact canonical `capability`, `candidate`, `alias`, `activeSnapshot`, `permutations`, and injected-failure helpers. Keep fixture bytes stable and overrides explicit.

**Determinism/purity assertions** (`43-64`): permute records and claims, compare `stableStringify` results, assert SHA-256 shape, preserve inputs/active bytes, and reject absolute-path leakage.

**Matrix pattern** (`142-180`): table-drive dependency, permission, scope, identity collision, ambiguity, unsafe target, near-tie, and precedence-conflict cases by expected reason code.

### `tests/router.registry-activate.test.mjs` (test, file-I/O/failure injection)

**Analog:** `tests/router.lifecycle.test.mjs`

**Isolated fixture pattern** (`router.lifecycle.test.mjs:16-38`): use `mkdtempSync(tmpdir())`, construct owned roots explicitly, and clean recursively in `finally`.

**Exact tree snapshot pattern** (`40-48`): recursively sort directory entries and capture file bytes as base64. Use this to prove pre-swap failures leave prior state byte-identical and immutable versions never change.

**Failure injection pattern** (`87-123`): assert dry runs are mutation-free, inject errors at named mutation boundaries, and compare the complete filesystem snapshot before/after. Extend injection to every write/sync/verify/rename/directory-sync boundary, corrupt pointers/manifests, recovery, protected retention, and stale rollback preview.

Add validation-producer cases for every required gate, allowlist rejection, duplicate/unknown/missing IDs, runner timeout/signal/nonzero/malformed output, bounded evidence, and production rejection of untrusted injection. Test overrides should be local functions with no process launch and must enter only through the explicitly test-only seam.

### `tests/router.registry-watcher.test.mjs` (test, event-driven orchestration)

**Analog:** existing `tests/router.registry-watcher.test.mjs`.

**Deterministic dependency harness** (`router.registry-watcher.test.mjs:11-60`): use the fake clock, virtual watcher callbacks, captured scans/writes/errors, and explicit dependency overrides. Extend captured calls for reconcile/map/verify/activate/recover and assert exact order and arguments without touching real homes or launching real runners.

**Baseline preservation pattern** (`121-131, 134-171, 228-247`): inject failures, verify state writes/baselines do not advance, retry from the last success, and preserve exact active bytes/fingerprint. Add table-driven failures at quarantine, mapper, runner timeout/error, incomplete/stale verification, activation durability, and startup recovery.

**Existing inactive-publication boundary** (`184-226`): current tests prove eligible candidates remain explicitly inactive and quarantine preserves active authority. Revise with passing trusted gates causing exactly one activation, while quarantine or any validation failure invokes neither later stages nor activation.

### `tests/router.control-cli.test.mjs` (test, subprocess/request-response)

**Analog:** `tests/router.lifecycle.test.mjs:1-14` imports `spawnSync`, derives `REPO_ROOT` from `import.meta.url`, and points at the CLI entry script. Follow that subprocess boundary for stdout, stderr, exit status, JSON parsing, exact typed stdin, and non-interactive confirmation tests.

Assert byte-stable text/JSON, shared reason codes, exit taxonomy, mutation-free read commands, preview/execution diff equality, generic `--yes` rejection, stale preview rejection, and no prompt/secret/absolute-path leakage.

### `calibration-tasks.json` (config/fixture, batch)

**Analog:** existing entries at `calibration-tasks.json:1-24`. Preserve the JSON array and existing fixture schema (`id`, `prompt`, `right.mode/skills/agents/tier/status/edge`). Append only Phase 14 mapping/activation gates, retain all existing IDs/thresholds, and keep expected targets canonical and present in fixtures.

## Shared Patterns

### Canonicalization and fingerprints

Use `stableStringify`, schema validation/canonicalization, and stable capability IDs everywhere. Sort before serialization; hashes establish local content integrity, not authenticity.

### Fail-closed structured verdicts

Follow `reconcile.mjs:21-31`: schema-versioned code, severity, non-dispatchable state, portable subject/evidence, human reason, and corrective action. Mapping ambiguity remains active-but-unmapped; gate, activation, verification, recovery, and rollback errors leave the active authority unchanged whenever the pointer swap has not completed.

### Candidate authority and purity

Mapping and verification join only against the exact candidate/version being evaluated. Read-only CLI commands and mapping functions accept explicit inputs, do not mutate them, and return canonical result objects.

### Filesystem containment and durability

Resolve every version/pointer path beneath the owned root; reject traversal and symlinks. Publish only manifest-complete immutable directories. Compute retention's protected set (active, fallback, previous, in-progress operation) before sorted age/count pruning.

### Testing convention

Use `node:test` with `node:assert/strict`, temporary roots, deterministic clocks, permutation checks, exact-byte snapshots, structured reason-code assertions, and injected boundary failures. Run each focused suite with the closest reconciliation/lifecycle regression, then the full `node --test tests/*.test.mjs` gate.

## No Analog Found

None. The repository has strong analogs for deterministic canonical transforms, fail-closed evidence, atomic owned-file replacement, transactional failure tests, subprocess CLI tests, and calibration fixtures. Directory `fsync` and immutable version publication are intentional strengthenings of the lifecycle analog, not currently complete implementations to copy verbatim.

## Metadata

**Analog search scope:** `src/registry`, `src/lifecycle`, repository CLI entry points, `tests`, `calibration-tasks.json`, approved Phase 14 design/implementation contract
**Strong analogs read:** 10 (`reconcile.mjs`, `diff.mjs`, `schema.mjs`, `watcher.mjs`, `router-lifecycle.mjs`, `install-router.mjs`, `router.calibrate.mjs`, reconciliation tests, watcher tests, lifecycle/calibration subprocess tests)
**Pattern extraction date:** 2026-07-15
