# Phase 12: Incremental Change Detection and Watcher - Research

**Researched:** 2026-07-15
**Domain:** Deterministic filesystem inventory diffs, incremental registry construction, and background watching
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Lifecycle classification and identity continuity
- **D-01:** When strong identity evidence proves continuity across a rename or move, emit one explicit `renamed` or `moved` lifecycle event. Preserve the canonical capability ID and carry both old and new provenance.
- **D-02:** When a single mutation changes both path and content while strong identity evidence remains, emit one compound rename or move event with `content_changed` details rather than duplicate ordered events.
- **D-03:** When rename or move evidence is too weak to preserve identity, classify deterministically as remove-plus-add. Retain the weak correlation only as a non-authoritative possible-match diagnostic; it must not establish continuity.
- **D-04:** When one observation changes multiple lifecycle dimensions, emit one event with a deterministic primary classification and ordered secondary facets. Preserve every changed dimension without duplicate processing.

### Planner's Discretion
- Exact primary-classification precedence, facet field names, diagnostic shape, fingerprint algorithm, and internal diff representation are left to research and planning, provided they preserve D-01 through D-04 and deterministic serialization.
- Incremental merge mechanics, watcher implementation details, and persisted scan-state format remain open within the approved timing, equivalence, restart, lightweight Node.js, and prompt-hook separation constraints.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REG-03 | Incremental and full rebuilds produce identical canonical registries. | Make full discovery/build the semantic oracle; incremental processing narrows work but must finish through the same merge, precedence, canonicalization, diagnostics, and fingerprint pipeline. |
| CHG-01 | Add, edit, rename, move, disable, dependency-change, and delete events are classified correctly. | Snapshot diffs use stable identity plus source path and material-field fingerprints, with strong-evidence continuity and deterministic primary/facet precedence. |
| CHG-02 | Filesystem changes are detected within 2 seconds and missed events within 5 minutes. | Treat `fs.watch` as a low-latency invalidation hint, debounce at 250 ms, and use persisted fingerprint repair at startup and at a five-minute maximum interval. |
</phase_requirements>

## Summary

Phase 12 should add a deterministic observed-inventory snapshot layer between the Phase 11 adapters and registry builder. [VERIFIED: repository code and Phase 12 context] A snapshot should key each recognizable artifact by portable logical root plus normalized relative path, retain strong identity evidence, and store separate fingerprints for content and classification-relevant fields. The diff engine should compare two snapshots, emit exactly one primary event per observed mutation plus sorted facets, and use identity continuity only when `canonical_identity`, authoritative `shared_origin`, or another explicitly approved stable identity proves it. [VERIFIED: `12-CONTEXT.md`, Phase 11 identity tests]

The full builder must remain the semantic oracle. [VERIFIED: `src/registry/build.mjs`] `buildIncrementalRegistry` may reuse unchanged observations and reparse only affected roots/artifacts, but the final records, diagnostics, precedence annotations, summaries, and fingerprints must pass through the same canonical assembly functions as `buildFullRegistry`. Mutation-sequence tests should compare `stableStringify(incremental)` with `stableStringify(buildFullRegistry(options))` after every step, not only at sequence end. [VERIFIED: REG-03 and approved implementation plan]

The watcher is a background control-plane coordinator, not a correctness boundary. Node documents `fs.watch` as platform-dependent and notes that filenames are not guaranteed, so an event should only mark one or more configured roots dirty; deterministic fingerprint scans determine the actual change. [CITED: https://nodejs.org/docs/latest-v22.x/api/fs.html#fswatchfilename-options-listener] A 250 ms configurable debounce meets the locked two-second target with ample budget, while startup repair plus a periodic interval no greater than five minutes closes missed-event and restart gaps. [VERIFIED: approved v1.2 implementation plan]

**Primary recommendation:** Build `fingerprint.mjs` and `diff.mjs` as pure deterministic primitives, refactor `build.mjs` around one shared canonical assembly path, then place `fs.watch` behind an injected scheduler/scan coordinator whose correctness is always repaired by persisted fingerprint scans.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Artifact fingerprint tree | Background control plane | Filesystem | Reads only configured roots and produces portable persisted scan state. |
| Lifecycle classification | Registry domain | Runtime adapters | Registry owns cross-snapshot meaning; adapters own native parsing and identity evidence. |
| Incremental build equivalence | Registry domain | Runtime adapters | Shared canonical assembly must make incremental and full results byte-identical. |
| Fast change notification | Background controller | Filesystem | `fs.watch` supplies hints; controller coalesces and schedules deterministic scans. |
| Missed-event/restart repair | Background controller | Registry storage | Persisted fingerprint state is compared at startup and on the repair interval. |
| Prompt routing | Prompt hook | — | Explicitly unchanged; it must not scan, hash, watch, or build registries. |

## Project Constraints (from AGENTS.md)

- The supplied project instruction is `@RTK.md`, but `RTK.md` and a physical `AGENTS.md` are absent from this checkout as of research time. [VERIFIED: repository filesystem check]
- Planner/executor should re-check for `RTK.md` before implementation; no additional project-local directive could be loaded. [VERIFIED: repository filesystem check]
- Do not infer permission to modify prompt-time routing or unrelated runtime configuration from Phase 12. [VERIFIED: phase boundary]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js standard library | 22.22.3 installed | `node:fs`, `node:path`, `node:crypto`, timers, abort/shutdown | The repository is already zero-dependency ESM and Phase 12 requires no package install. [VERIFIED: local runtime and repository code] |
| Existing registry primitives | current repository | `stableStringify`, `canonicalizeCapability`, `stableCapabilityId`, `contentFingerprint` | These encode the established portability, identity, and byte-determinism contracts. [VERIFIED: Phase 11 code/tests] |
| Node built-in test runner | 22.22.3 installed | Unit/integration tests and controllable timer behavior | Existing suite uses `node:test`; MockTimers are documented by Node for deterministic timer control. [CITED: https://nodejs.org/docs/latest-v22.x/api/test.html#class-mocktimers] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` SHA-256 | Node 22.22.3 | Leaf, node, snapshot, and persisted-state integrity fingerprints | Hash stable length-delimited canonical inputs; reuse the algorithm already used by Phase 11. [CITED: https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptocreatehashalgorithm-options] |
| `fs.watch` | Node 22.22.3 | Low-latency dirty-root notification | Use only as a hint; never infer authoritative rename/delete semantics from raw watcher events. [CITED: https://nodejs.org/docs/latest-v22.x/api/fs.html#fswatchfilename-options-listener] |

No external packages are required, so no installation or package-legitimacy audit applies. [VERIFIED: approved plan and existing architecture]

## Architecture Patterns

### System Architecture Diagram

```text
Configured Claude/Codex/project roots
              |
              v
     fs.watch event hints -----------+
              |                       |
              v                       |
     debounce / dirty-root set        | periodic + startup repair
              |                       |
              +----------+------------+
                         v
            deterministic fingerprint scan
                         |
             previous snapshot available?
                  / yes          \ no/corrupt
                 v                v
        snapshot diff        clean baseline scan
                 \                /
                  v              v
             lifecycle events + changed observations
                         |
                         v
         shared canonical registry assembly
                         |
              incremental bytes == full bytes
                         |
                         v
             inactive candidate/report only
```

### Recommended Project Structure

```text
src/registry/
├── fingerprint.mjs   # portable artifact/tree scan state and persistence validation
├── diff.mjs          # pure snapshot comparison and lifecycle classification
├── build.mjs         # shared canonical assembly plus full/incremental entry points
└── watcher.mjs       # hint coalescing, scheduling, repair, restart, shutdown
tests/
├── router.registry-diff.test.mjs
├── router.registry-build.test.mjs
└── router.registry-watcher.test.mjs
```

### Pattern 1: Watch hints, verify by scan

**What:** On any `fs.watch` notification, add the logical root to a `Set`, reset one debounce timer, then scan that root after the timer fires. Ignore or tolerate a missing filename. [CITED: https://nodejs.org/docs/latest-v22.x/api/fs.html#fswatchfilename-options-listener]

**Why:** Raw watcher event names and delivery differ by platform; scans provide the portable truth required by CHG-01 and REG-03. [CITED: https://nodejs.org/docs/latest-v22.x/api/fs.html#fswatchfilename-options-listener]

### Pattern 2: One canonical assembly function

**What:** Extract the observation grouping, conflict synthesis, precedence annotation, diagnostic normalization, sorting, and summary generation currently embedded in `buildFullRegistry` into a shared pure function. [VERIFIED: `src/registry/build.mjs`]

**Why:** Full and incremental entry points that independently implement merge semantics will drift. Both should differ only in how they obtain the complete logical observation set. [VERIFIED: REG-03]

### Pattern 3: Deterministic event precedence and facets

Use a documented precedence that reflects structural identity first, then material state:

1. `renamed` or `moved` when strong continuity exists and path changed;
2. `removed` / `added` when continuity does not exist;
3. `disabled` when the same identity becomes explicitly non-dispatchable/disabled;
4. `scope_changed` when scope identity changes under authoritative continuity;
5. `dependency_changed`;
6. `permission_changed`;
7. `content_changed`.

Attach every other changed dimension as a lexically or schema-order-sorted facet. A path plus content change therefore remains one `renamed`/`moved` event with `content_changed`; weak evidence remains two events with a possible-match diagnostic. [VERIFIED: D-01 through D-04]

### Pattern 4: Persisted state is a cache, not authority

Persist a versioned structure containing schema version, configured logical roots, scan timestamp, root fingerprints, and portable artifact entries. [VERIFIED: approved design] Write atomically using the lifecycle pattern already established in `router-lifecycle.mjs`; on missing, malformed, incompatible, or root-set-mismatched state, perform a clean baseline scan rather than partially trusting it. [VERIFIED: repository lifecycle code]

### Anti-Patterns to Avoid

- **Interpreting `rename` from `fs.watch` as canonical rename:** Raw events do not prove identity continuity. Scan and diff instead. [CITED: Node fs docs]
- **Fingerprinting absolute paths:** This leaks machine layout and breaks cross-root byte parity; hash logical roots and normalized relative paths. [VERIFIED: Phase 11 portability contract]
- **Using content hash alone as rename authority:** D-03 and Phase 11 explicitly reject similarity-only identity merging. [VERIFIED: context and identity tests]
- **Deleting prior records on a parse failure:** Malformed/temporarily unreadable is not confirmed deletion; preserve diagnostic evidence and leave target safety/quarantine to Phase 13. [VERIFIED: approved design error handling]
- **Running watcher work in `UserPromptSubmit`:** Violates the phase boundary and prompt-time architecture. [VERIFIED: PROJECT.md]
- **Real sleeps in watcher tests:** Makes the two-second/five-minute requirements slow and flaky; inject timers or use MockTimers. [CITED: Node test docs]
- **Emitting one event per facet:** Causes duplicate processing and violates D-04. [VERIFIED: phase context]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Canonical serialization | New object sorter/serializer | Existing `stableStringify` and `canonicalizeCapability` | Already defines schema-owned set ordering and deterministic rejection behavior. |
| Identity continuity | Name/content fuzzy matcher | Existing canonical identity/shared-origin evidence | Continuity must be authoritative and compatible with Phase 11. |
| Hashing | Custom rolling/checksum algorithm | `createHash('sha256')` over stable inputs | Existing project primitive is deterministic and available. |
| Watcher correctness | Platform event-name state machine | Dirty-root coalescing plus fingerprint scans | Raw events are not portable enough to be authoritative. |
| Atomic state writes | Direct overwrite | Existing lifecycle temp-write/rename pattern | Prevents partially written restart state. |
| Test clock | Wall-clock waits | Injected scheduler or Node MockTimers | Fast deterministic tests can exercise five-minute repair immediately. |

**Key insight:** Incrementality is an optimization of observation acquisition, not a second registry semantics implementation.

## Common Pitfalls

### Pitfall 1: Registry parity excludes diagnostics or summary

Comparing only `registry.records` can hide drift in diagnostics, counts, runtime totals, or fingerprints. REG-03 tests should compare the full returned value through `stableStringify`. [VERIFIED: `buildFullRegistry` return shape]

### Pitfall 2: Project scope changes alter identity suffixes

`stableCapabilityId` includes repository/worktree evidence for non-global records. A scope move cannot be treated like a simple field edit unless authoritative continuity is separately retained; otherwise it is remove-plus-add. [VERIFIED: `identity.mjs` and D-03]

### Pitfall 3: Directory metadata creates unstable fingerprints

Do not include mtime, inode, device, absolute path, scan time, or readdir order in canonical tree hashes. Hash normalized relative names, entry types, and stable content/subtree fingerprints in sorted order. [VERIFIED: portability and deterministic-byte requirements]

### Pitfall 4: Debounce postpones forever under a busy stream

Track first-dirty time as well as last-event time, and provide a maximum coalescing latency below two seconds. [ASSUMED] The planner should make this explicit because a trailing-only debounce can starve under continuous events.

### Pitfall 5: Repair interval starts only after watcher startup succeeds

Start repair scheduling independently, and run one startup comparison before accepting the persisted baseline. Watcher failure must not disable repair. [VERIFIED: approved design error handling and CHG-02]

### Pitfall 6: Installer expands ownership too broadly

Only deploy the new controller modules/config under the existing router-owned tree and preserve unrelated `.claude`/`.codex` settings. Activation, service-manager registration, and cross-platform daemon policy are not defined by this phase and must not be invented. [VERIFIED: phase boundary and lifecycle code]

## Code Examples

### Shared build assembly

```js
// Source: repository pattern in src/registry/build.mjs
export function buildFullRegistry(options = {}) {
  return assembleRegistry(discoverAll(options));
}

export function buildIncrementalRegistry(previous, diff, options = {}) {
  const completeObservations = applyObservationDiff(previous.observations, diff, options);
  return assembleRegistry(completeObservations);
}
```

### Watch hint coalescing

```js
// Source: Node fs.watch semantics plus approved 250 ms debounce
function markDirty(logicalRoot) {
  dirtyRoots.add(logicalRoot);
  scheduler.reschedule('debounce', debounceMs, flushDirtyRoots);
}

async function flushDirtyRoots() {
  const roots = [...dirtyRoots].sort();
  dirtyRoots.clear();
  await scanAndReconcile(roots);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Trust individual watcher event types and filenames | Treat notifications as invalidation hints, reconcile from snapshots | Current Node portability guidance | Correct across event coalescing, missing filenames, and platform differences. [CITED: Node fs docs] |
| Rebuild everything on each event | Reuse unchanged observations, then run one shared canonical assembly | Phase 12 approved design | Reduces background work without weakening REG-03. [VERIFIED: approved design] |
| Real-time events only | Real-time hints plus persisted periodic repair | Phase 12 approved design | Recovers missed events and controller downtime within the five-minute contract. [VERIFIED: approved design] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A maximum-coalescing deadline is needed in addition to trailing debounce under continuously busy event streams. | Common Pitfalls | Without it, a pathological stream could violate the two-second observation target. Planner should specify and test the deadline. |

## Open Questions (RESOLVED)

1. **Background-controller installation and restart mechanism**
   - **Decision:** Reuse the repository's existing detached local Node-worker mechanism: `spawn(process.execPath, [ownedModule, ...args], { detached: true, stdio: 'ignore' }).unref()`. This exact process shape is already used for `router.evolve.mjs` and is explicitly admitted by the SAF-03/SAF-07 release gate as a local standard-library background-worker exception. [VERIFIED: `tests/router.mjs.snapshot` lines 1631-1644; `tests/router.safety-release.test.mjs` detached-worker assertions]
   - The installer launches the watcher from the installed router-owned `registry/watcher.mjs`, never from `UserPromptSubmit`, and writes only router-owned configuration/control/status files. The watcher CLI exposes a long-running `run` mode. Install waits for an atomic ready/status record carrying the configuration fingerprint and controller instance ID before reporting readiness; launch failure terminates the child and participates in the existing exact transaction rollback. [PLANNED: Phase 12 lifecycle integration]
   - `--restart-controller` uses the same owned worker mechanism. It requests cooperative shutdown/restart through a router-owned control record; the current controller closes watchers/timers, starts its successor with the same `process.execPath` detached-worker contract, and the lifecycle command waits for a new instance ID. If the prior heartbeat is stale or the process is absent, lifecycle starts a replacement directly. No launchd, systemd, shell, network service, prompt-hook trigger, or third-party supervisor is introduced. [PLANNED: Phase 12 controller/lifecycle contract]
   - Executable subprocess tests must prove install yields a live ready controller, a real fixture mutation reconciles within two seconds, restart changes the instance ID, and a mutation made while stopped is repaired on startup (therefore inside the five-minute ceiling). Periodic missed-event repair remains fake-clock tested at the full five-minute boundary. [PLANNED: CHG-02 evidence]

2. **Permission-change interpretation**
   - **Decision:** `permission_changed` means a change to declared, adapter-normalized capability permission metadata (for example Codex permission configuration) that participates in the portable observation contract. It does not mean an OS file-mode, ACL, owner, inode, device, or mtime change. [VERIFIED: adapter surface and Phase 11 portable-byte contract]
   - OS access changes are operational scan/read outcomes: unreadable or denied artifacts produce deterministic diagnostics and do not become confirmed deletions. Machine-specific permission metadata must not enter fingerprint hashes, lifecycle events, diagnostics intended to be portable, or canonical registry bytes. [VERIFIED: D-03 evidence rules, portability contract, and research anti-patterns]
   - Diff and equivalence tests must mutate declared permission fields to assert `permission_changed`, and separately simulate access/read failure to assert diagnostic preservation without that lifecycle classification or deletion. [PLANNED: 12-01 and 12-02]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | All Phase 12 code/tests | ✓ | 22.22.3 | — |
| `node:test` | Nyquist validation | ✓ | bundled with Node 22.22.3 | — |
| `node:fs`, `node:crypto` | watcher/fingerprint | ✓ | bundled | — |
| External watcher package | none | not required | — | Standard library design is locked/preferred. |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** Context7 CLI was unavailable; official Node documentation URLs and repository/runtime verification were used. The research-cache seam could not persist outside the workspace due filesystem permissions; this does not block implementation.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test`, Node 22.22.3 |
| Config file | none |
| Quick run command | `node --test tests/router.registry-diff.test.mjs tests/router.registry-build.test.mjs tests/router.registry-watcher.test.mjs` |
| Full suite command | `node --test tests/*.test.mjs` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHG-01 | Correct add/edit/rename/move/disable/dependency/permission/scope/delete classification, compound facets, weak-match fallback | unit | `node --test tests/router.registry-diff.test.mjs` | ❌ Wave 0 |
| REG-03 | Full returned registry result is byte-equivalent after every mutation in a sequence | integration | `node --test tests/router.registry-build.test.mjs` | ✅ extend in Wave 0 |
| CHG-02 | 250 ms coalescing, no duplicate processing, under-two-second bound, startup/restart and five-minute repair, shutdown | unit/integration with fake clock | `node --test tests/router.registry-watcher.test.mjs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** focused test file for the module being changed.
- **Per wave merge:** `node --test tests/router.registry-schema.test.mjs tests/router.adapters.test.mjs tests/router.registry-diff.test.mjs tests/router.registry-build.test.mjs tests/router.registry-watcher.test.mjs tests/router.lifecycle.test.mjs`
- **Phase gate:** `node --test tests/*.test.mjs` green before `$gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/router.registry-diff.test.mjs` — CHG-01 mutation matrix and D-01 through D-04.
- [ ] Extend `tests/router.registry-build.test.mjs` — REG-03 sequence parity after every step.
- [ ] `tests/router.registry-watcher.test.mjs` — CHG-02 fake-clock latency, repair, restart, dedupe, and shutdown.
- [ ] Add injectable clock/scheduler and watch factory seams; no framework install required.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local background process; no authentication surface introduced. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | yes | Scan only explicit configured roots; retain Phase 11 realpath containment before reads. |
| V5 Input Validation | yes | Validate persisted state schema, normalize relative paths, reject traversal/absolute portable paths, parse artifacts inertly. |
| V6 Cryptography | yes | Use Node SHA-256 for integrity fingerprints; no secrets or encryption introduced. |

### Known Threat Patterns for Node filesystem control planes

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Symlink/path escape during scan | Elevation of Privilege / Information Disclosure | Canonical realpath containment before reading, inherited from adapters. |
| Persisted-state path injection | Tampering | Versioned schema, logical-root allowlist, relative-path validation, clean rescan on corruption. |
| Hash ambiguity from concatenation | Tampering | Stable structured serialization or length-delimited inputs before SHA-256. |
| Event flood / debounce starvation | Denial of Service | Dirty-root `Set`, bounded debounce/max latency, single in-flight reconcile, deterministic rerun flag. |
| Absolute path leakage in state/diagnostics | Information Disclosure | Persist logical roots and normalized relative paths only. |

## Sources

### Primary (HIGH confidence)

- `12-CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `PROJECT.md` — locked scope and acceptance contracts.
- Approved v1.2 design and implementation plan — watcher, repair, module boundaries, debounce, and equivalence.
- Phase 11 source, tests, summaries, validation, and verification — established identity, portability, build, and test contracts.
- https://nodejs.org/docs/latest-v22.x/api/fs.html#fswatchfilename-options-listener — watcher semantics and caveats.
- https://nodejs.org/docs/latest-v22.x/api/crypto.html#cryptocreatehashalgorithm-options — standard hashing primitive.
- https://nodejs.org/docs/latest-v22.x/api/test.html#class-mocktimers — deterministic timer testing.

### Secondary (MEDIUM confidence)

- None required.

### Tertiary (LOW confidence)

- A1 only, explicitly recorded in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed runtime, repository code, and official Node docs agree.
- Architecture: HIGH — locked design and Phase 11 seams define the implementation boundary.
- Pitfalls: HIGH except A1 — derived from official watcher caveats and existing portability tests.

**Research date:** 2026-07-15
**Valid until:** 2026-08-14
