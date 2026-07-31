# Phase 28: Coverage Audit-Guard - Research

**Researched:** 2026-07-29
**Domain:** Node.js stdlib manifest coverage auditing and fail-open hook freshness
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No locked decisions — discuss phase was skipped per user setting.

### the agent's Discretion
All implementation choices are at the agent's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COV-01 | `build-manifest.mjs` runs a coverage audit immediately after the atomic manifest write and emits `coverage-report.json`. | Reuse the builder's existing temp-plus-rename publication seam and add the audit immediately after `renameSync(tmp, OUT)`. [VERIFIED: codebase grep] |
| COV-02 | Classify every manifest skill/command/agent with the required `gap` / `expected_*` taxonomy. | Use a deterministic precedence over manifest category, `scope`, missing-MCP metadata, typed mode-map targets, and explicit baseline acknowledgements. [VERIFIED: codebase grep] |
| COV-03 | Detect mode-map-to-manifest and manifest-to-mode-map orphans. | Reuse `validateRouteTargets` semantics for the forward direction; introduce typed reverse target extraction so route IDs do not masquerade as capability coverage. [VERIFIED: codebase grep] |
| COV-04 | `--strict-coverage` fails only on unacknowledged gaps; `coverage-baseline.json` acknowledges intentional unmapped items. | Parse the CLI flag once, always publish the report, then set `process.exitCode = 1` only when report `unacknowledged_gaps` is non-empty. [CITED: https://nodejs.org/api/process.html] |
| COV-05 | Missing/stale coverage report produces one-line hook reminder without blocking. | Extend the existing freshness/reminder and `additionalContext` composition path; do not add a second routing or output path. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 28 is an extension of two existing seams, not a new subsystem. `build-manifest.mjs` already owns discovery, manifest schema normalization, atomic manifest publication, environment-configurable paths, and build-time validation. The installed hook already owns coverage helpers (`mappedTargets`, `auditInventoryCoverage`, `validateRouteTargets`), freshness checks, one-line reminders, and fail-open `additionalContext` composition. [VERIFIED: codebase grep]

The minimum safe design is one shared pure coverage-audit module imported by both the builder and hook-facing diagnostics. The builder writes `coverage-report.json` atomically immediately after the manifest, while strict mode changes only the eventual exit status. The hook performs only two `statSync` checks—report existence and report-vs-manifest mtime—and appends a fixed reminder through the existing context composer. [VERIFIED: codebase grep] [CITED: https://nodejs.org/api/fs.html]

The largest planning risk is identity ambiguity. Existing `mappedTargets()` includes a mode-map entry's `id`, although an entry ID can be a route identifier rather than a manifest capability. Reverse coverage must therefore use typed targets: `mode` → command, `recommended_skills` → skill, and `recommended_agents` → agent. Forward orphan detection should retain `validateRouteTargets()` alias/schema exceptions rather than applying a naive set difference. [VERIFIED: codebase grep]

**Primary recommendation:** Add `src/coverage/audit.mjs`, call it from the existing builder publication seam, and make the hook freshness check consume only report metadata—never run the audit on the hot path. [VERIFIED: codebase grep]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inventory discovery | Build-time Node CLI | Filesystem | Existing builder owns all supported manifest categories and normalized fields. [VERIFIED: codebase grep] |
| Coverage classification | Build-time Node CLI | Shared pure module | Classification is deterministic over manifest, mode-map, and baseline inputs. [VERIFIED: codebase grep] |
| Coverage report publication | Build-time Node CLI | Filesystem | Report must follow the manifest's atomic publication. [VERIFIED: codebase grep] |
| Strict coverage gate | Build-time Node CLI | CI/test runner | Exit status belongs to the builder invocation; no repository workflow file currently exists. [VERIFIED: codebase grep] |
| Coverage freshness reminder | UserPromptSubmit hook | Filesystem metadata | Hook reads mtimes only, appends one line, and remains fail-open. [VERIFIED: codebase grep] |

## Project Constraints (from AGENTS.md)

- Prefix shell commands with `rtk`. [VERIFIED: `/Users/guilherme/.codex/RTK.md`]
- Preserve the global router constraints already recorded in `.claude/CLAUDE.md`: stdlib-only, no per-prompt network/API call, fail-open behavior, deny-rule safety, and approximately 100ms maximum prompt-hook latency. [VERIFIED: project instructions]
- Do not auto-rebuild the manifest or coverage report inside the prompt hook. [VERIFIED: project instructions]
- Do not modify or revert unrelated dirty-worktree changes. [VERIFIED: git status]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.22.3 installed | Builder CLI, pure audit, hook freshness | Existing runtime and code style; no new runtime needed. [VERIFIED: local environment] |
| `node:fs` | built-in | `readFileSync`, `writeFileSync`, `renameSync`, `statSync`, `existsSync` | Already used by builder and hook; official API supports the required operations. [VERIFIED: codebase grep] [CITED: https://nodejs.org/api/fs.html] |
| `node:path` | built-in | Derive sibling report/baseline paths | Already used throughout the builder. [VERIFIED: codebase grep] |
| `node:test` + `node:assert/strict` | built-in | Unit and subprocess integration tests | Established repository test convention. [VERIFIED: codebase grep] |

### Supporting

No external packages are needed. JSON parsing, set operations, CLI flags, filesystem metadata, and atomic replacement are all covered by the installed runtime and existing helpers. [VERIFIED: codebase grep]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared pure audit module | Duplicate builder-only audit logic | Duplicates classification semantics already exposed by the hook and guarantees drift. [VERIFIED: codebase grep] |
| Typed target extraction | Existing untyped `mappedTargets()` alone | Existing helper treats route IDs as mapped capabilities, creating reverse-coverage false negatives. [VERIFIED: codebase grep] |
| Baseline data file | Hard-coded expected names | Hard-coding couples policy to code and makes inventory churn require code edits. [VERIFIED: phase requirements] |

**Installation:** None. [VERIFIED: codebase grep]

## Architecture Patterns

### System Architecture Diagram

```text
CLI: build-manifest.mjs [--strict-coverage]
  |
  v
Discover + normalize manifest categories
  |
  v
Atomic manifest write (temp -> rename)
  |
  v
Shared audit(manifest, mode-map, baseline)
  |                 |
  |                 +--> forward target diagnostics
  |                      (mode-map -> typed manifest targets)
  |
  +--> reverse classification
       (manifest capability -> mapped or required taxonomy)
  |
  v
Atomic coverage-report.json write
  |
  +--> normal mode: exit 0
  |
  +--> strict mode + unacknowledged gaps: process.exitCode = 1

UserPromptSubmit hook
  |
  +--> stat manifest + coverage report
          |
          +--> report present and >= manifest mtime: route normally
          |
          +--> missing/older/error: append fixed one-line reminder
                                      and continue unchanged
```

[VERIFIED: codebase grep]

### Recommended Project Structure

```text
build-manifest.mjs                         # discovery, publication, CLI orchestration
src/coverage/audit.mjs                    # pure taxonomy, typed target audit, baseline matching
tests/router.coverage-audit.test.mjs      # pure fixtures + builder subprocess + strict gate
tests/router.freshness.test.mjs           # extend hook report freshness cases
coverage-baseline.json                    # repository policy acknowledgements
coverage-report.json                      # generated artifact; placement/ignore policy explicit
```

[VERIFIED: codebase conventions]

### Pattern 1: Pure Audit, Imperative Shell

**What:** Keep classification and orphan detection pure; leave filesystem reads/writes and CLI exit status in `build-manifest.mjs`. [VERIFIED: codebase conventions]

**When to use:** Always for COV-01 through COV-04 so fixtures can test policy without installing or mutating the live router. [VERIFIED: codebase test conventions]

```javascript
// Source: existing repository module/test conventions
const report = auditCoverage({ manifest, modeMap, baseline });
atomicWriteJson(reportPath, report);
if (strictCoverage && report.unacknowledged_gaps.length) process.exitCode = 1;
```

### Pattern 2: Stable Composite Capability Identity

**What:** Key acknowledgements and report records by `{category, id}` (serialized as `category:id` only at boundaries), not by bare name. [VERIFIED: manifest schema inspection]

**When to use:** Baseline lookup, duplicate detection, report sorting, and reverse orphan detection. The manifest contains multiple skill collections and plugin sources, so bare names can collide. [VERIFIED: build-manifest.mjs]

### Pattern 3: Deterministic Classification Precedence

Use this order for each inventory record: [VERIFIED: phase requirements and manifest schema]

1. Hook record → `expected_hook`.
2. Missing-MCP agent → `expected_warn_mcp`.
3. Project-scoped capability → `expected_scope_project`.
4. Valid typed mode-map target → covered (record this as `mapped: true`; see Open Question 1).
5. Baseline acknowledgement → its explicit `expected_bm25_only` or `expected_phase_internal` category and reason.
6. Otherwise → `gap`.

Baseline entries must not be allowed to hide forward stale targets, malformed route entries, or unsafe missing-MCP dispatches. [VERIFIED: COV-03/COV-04 and existing `validateRouteTargets`]

### Pattern 4: Freshness as Ordering, Not Age

**What:** COV-05 requires `coverageReportMtime >= manifestMtime`; it does not require a seven-day age policy. [VERIFIED: COV-05]

**When to use:** Every prompt, before routing output is finalized. On missing files, stat errors, or older report, return the same fixed reminder; never throw. [VERIFIED: existing `checkFreshness` fail-open pattern]

### Anti-Patterns to Avoid

- **Running the audit in the hook:** Adds JSON parsing and full inventory iteration to every prompt; the requirement only needs an mtime reminder. [VERIFIED: project constraints]
- **Counting route entry IDs as capability coverage:** Entry IDs are routing identities and may not resolve to manifest records. [VERIFIED: codebase grep]
- **Baseline as a blanket ignore list:** Every acknowledgement needs a category and reason, and must match a present reverse-side capability only. [VERIFIED: COV-02/COV-04]
- **Failing before writing the report:** Strict CI output must remain inspectable when the command fails. [VERIFIED: COV-01/COV-04]
- **Calling `process.exit(1)` after printing:** Node warns forced exit may truncate pending output; set `process.exitCode`. [CITED: https://nodejs.org/api/process.html]
- **Using wall-clock age for report freshness:** A freshly rebuilt manifest immediately makes the older report stale regardless of both files' absolute age. [VERIFIED: COV-05]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic JSON replacement | Lock service or write journal | Existing temp-file + `renameSync` pattern | Builder already uses it and Node exposes the required primitive. [VERIFIED: codebase grep] [CITED: https://nodejs.org/api/fs.html] |
| Route target validation | Second forward-orphan validator | Extract/reuse `validateRouteTargets` semantics | It already handles slash aliases, schema routes, warn entries, and missing-MCP agents. [VERIFIED: codebase grep] |
| Hook output | New stdout emitter | Existing `main()` context composition and `emit()` | Preserves coexistence and fail-open contracts. [VERIFIED: codebase grep] |
| Test framework | Jest/Vitest | `node:test` | Repository already has a large built-in test suite. [VERIFIED: codebase grep] |
| CI service integration | New CI framework | Strict builder subprocess as the gate command | No `.github/workflows` convention currently exists; the deliverable is a deterministic command usable by any CI. [VERIFIED: codebase grep] |

**Key insight:** The phase is policy and plumbing over existing inventory—not a new coverage engine. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: False Coverage from Route IDs

**What goes wrong:** An unmapped manifest capability appears covered because its name equals a mode-map entry ID even though no typed target references it. [VERIFIED: `mappedTargets` inspection]

**How to avoid:** Use typed targets for the new audit and preserve the old helper only for backward-compatible diagnostics until tests prove replacement safe. [VERIFIED: codebase test surface]

### Pitfall 2: Baseline Silences Real Regressions

**What goes wrong:** A stale mode-map target or unsafe agent dispatch is acknowledged and strict mode passes. [VERIFIED: threat analysis]

**How to avoid:** Apply baseline only to reverse unmapped capability records; never to forward diagnostics. Unknown/stale baseline records should be reported separately and should not create coverage. [VERIFIED: COV-03/COV-04]

### Pitfall 3: Report Published Before Manifest

**What goes wrong:** The report describes the previous manifest or appears fresh by timestamp despite mismatched content. [VERIFIED: COV-01/COV-05]

**How to avoid:** Publish manifest first, audit the exact in-memory manifest just written, then publish the report. Include manifest mtime or a content fingerprint in report metadata for diagnosability. [VERIFIED: build seam]

### Pitfall 4: Hook Reminder Replaces Routing Context

**What goes wrong:** The one-line reminder suppresses a valid route or context-capsule notice. [VERIFIED: existing composition path]

**How to avoid:** Compose the reminder with existing `additionalContext`; do not early-return from the routing pipeline solely because coverage is stale. COV-05 says prompt handling remains unchanged. [VERIFIED: COV-05]

### Pitfall 5: Non-Deterministic Reports

**What goes wrong:** Rebuilds produce noisy diffs because filesystem traversal or set iteration order leaks into output. [VERIFIED: existing idempotence test]

**How to avoid:** Sort records and diagnostics by category, ID, and diagnostic code before JSON serialization. Preserve the existing builder's byte-idempotence test and add report idempotence. [VERIFIED: codebase test conventions]

## Code Examples

### Atomic sibling report

```javascript
// Source: build-manifest.mjs existing temp+rename pattern
function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}
```

[VERIFIED: codebase grep] [CITED: https://nodejs.org/api/fs.html]

### Fail-open report freshness

```javascript
// Source: existing router.mjs checkFreshness pattern
export function checkCoverageFreshness(
  manifestPath = MANIFEST,
  reportPath = COVERAGE_REPORT,
) {
  try {
    if (!existsSync(reportPath)) return { status: 'missing', reminder: COVERAGE_REMINDER };
    if (statSync(reportPath).mtimeMs < statSync(manifestPath).mtimeMs) {
      return { status: 'stale', reminder: COVERAGE_REMINDER };
    }
    return { status: 'fresh' };
  } catch {
    return { status: 'error', reminder: COVERAGE_REMINDER };
  }
}
```

[VERIFIED: codebase pattern]

### Strict-mode subprocess assertion

```javascript
// Source: tests/router.build-manifest.test.mjs convention
const result = spawnSync(process.execPath, [BUILDER, '--strict-coverage'], {
  env: fixtureEnv,
  encoding: 'utf8',
});
assert.notEqual(result.status, 0);
assert.equal(existsSync(reportPath), true);
```

[VERIFIED: codebase test conventions]

## State of the Art

| Old Approach | Current Phase Approach | Impact |
|--------------|------------------------|--------|
| On-demand `router coverage` diagnostic | Build-generated canonical report | Every rebuild leaves inspectable evidence. [VERIFIED: codebase grep] |
| Boolean mapped/unmapped plus diagnostics | Explicit intentional-unmapped taxonomy | Reduces false-positive noise while retaining gaps. [VERIFIED: COV-02] |
| Reverse-only high-value unmapped list | Bi-directional typed orphan detection | Finds both removed targets and newly discovered capabilities. [VERIFIED: COV-03] |
| Manual observation | Optional strict command gate with baseline | Makes coverage enforceable in any CI runner. [VERIFIED: COV-04] |

**Deprecated/outdated:**

- Using `auditInventoryCoverage().highValueUnmapped` alone as Phase 28 evidence is insufficient because it has no persisted report, baseline, strict exit, or full required taxonomy. [VERIFIED: codebase grep]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Mapped records use `coverage_status: "mapped"` with `classification: null`; unmapped records carry the required taxonomy. [RESOLVED: Plan 28-01] | Architecture Patterns | Executor implements the frozen record schema. |
| A2 | `coverage-report.json` defaults beside the manifest; the committed `coverage-baseline.json` defaults beside `build-manifest.mjs`, is deployed with that builder, and both paths support environment overrides for fixture isolation. [RESOLVED: Plan 28-01] | Architecture | Executor uses one source/runtime-relative policy location and verifies installer publication. |
| A3 | `expected_bm25_only` and `expected_phase_internal` acknowledgements are explicit baseline policy; hook, missing-MCP, and project-scope classifications are inferred from manifest facts. [RESOLVED: Plan 28-01] | Architecture Patterns | Executor validates the frozen classification sources. |

## Open Questions (RESOLVED)

1. **How should mapped records fit the exact COV-02 taxonomy?**
   - What we know: The enumerated values contain only `gap` and intentional-unmapped `expected_*` reasons. [VERIFIED: REQUIREMENTS.md]
   - What's unclear: Whether `mapped` is an allowed classification or an orthogonal boolean/status.
   - Resolution: Use `coverage_status: "mapped" | "unmapped"` and apply `classification` only to unmapped records; mapped records carry `classification: null`. Assert every record has an unambiguous status. [RESOLVED: Plan 28-01]

2. **What is the baseline's committed/generated policy?**
   - What we know: Requirements name `coverage-baseline.json`; the repository currently has no such file or GitHub workflow. [VERIFIED: codebase grep]
   - What's unclear: Whether the generated report is committed or ignored.
   - Resolution: Commit `coverage-baseline.json` beside `build-manifest.mjs` in the repository root and deploy both into the runtime router root; the builder defaults to `join(SCRIPT_DIR, "coverage-baseline.json")`. Generate `coverage-report.json` beside the manifest as runtime evidence. Support `ROUTER_COVERAGE_BASELINE_PATH` and `ROUTER_COVERAGE_REPORT_PATH` overrides for isolated fixtures. [RESOLVED: Plan 28-01]

3. **Should stale baseline records fail strict mode?**
   - What we know: Strict mode fails on unacknowledged gaps, not obsolete acknowledgements. [VERIFIED: COV-04]
   - Resolution: Report stale acknowledgements as warnings, not strict failures. Only explicit `expected_bm25_only` and `expected_phase_internal` baseline classifications may acknowledge present reverse gaps; inferred hook, missing-MCP, and project-scope classifications remain manifest-derived. [RESOLVED: Plans 28-01 and 28-02]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Builder, hook, tests | ✓ | 22.22.3 | — |
| npm | Existing environment only | ✓ | 10.9.8 | Not required by implementation |
| `rtk` | Project shell convention | ✓ | available | `rtk proxy` for unsupported command shapes |
| GitHub Actions | Hosted CI | ✗ repository workflow absent | — | Gate is a portable builder command |

**Missing dependencies with no fallback:** None. [VERIFIED: local environment]

**Missing dependencies with fallback:** Repository CI workflow is absent; expose `node build-manifest.mjs --strict-coverage` as the portable gate and wire it only where the project's release process owns CI. [VERIFIED: codebase grep]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` on Node 22.22.3 |
| Config file | none |
| Quick run command | `rtk node --test tests/router.coverage-audit.test.mjs tests/router.freshness.test.mjs tests/router.build-manifest.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

[VERIFIED: config and codebase grep]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COV-01 | Builder writes deterministic report after manifest publication | subprocess integration | `rtk node --test tests/router.coverage-audit.test.mjs` | ❌ Wave 0 |
| COV-02 | All fixture categories receive required classifications without false positives | unit | `rtk node --test tests/router.coverage-audit.test.mjs` | ❌ Wave 0 |
| COV-03 | Typed forward and reverse orphans detected | unit | `rtk node --test tests/router.coverage-audit.test.mjs` | ❌ Wave 0 |
| COV-04 | Strict mode exit matrix honors baseline and still writes report | subprocess integration | `rtk node --test tests/router.coverage-audit.test.mjs` | ❌ Wave 0 |
| COV-05 | Missing/older report appends exactly one reminder and exits 0 | unit + hook subprocess | `rtk node --test tests/router.freshness.test.mjs tests/router.failopen.test.mjs` | ⚠️ extend existing |

### Sampling Rate

- **Per task commit:** `rtk node --test tests/router.coverage-audit.test.mjs tests/router.freshness.test.mjs tests/router.build-manifest.test.mjs`
- **Per wave merge:** focused command plus `rtk node --test tests/router.coverage.test.mjs tests/router.route-targets.test.mjs tests/router.failopen.test.mjs`
- **Phase gate:** `rtk node --test tests/*.test.mjs`

### Wave 0 Gaps

- [ ] `tests/router.coverage-audit.test.mjs` — pure taxonomy, typed identity, baseline, deterministic report, strict subprocess matrix.
- [ ] Extend `tests/router.freshness.test.mjs` — report missing, older, equal/newer, stat error, and route-context composition.
- [ ] Add fixture env overrides for report and baseline paths to the existing builder subprocess helper.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No authentication surface. [VERIFIED: phase scope] |
| V3 Session Management | no | No session state. [VERIFIED: phase scope] |
| V4 Access Control | no | Local builder and hook do not add authorization decisions. [VERIFIED: phase scope] |
| V5 Input Validation | yes | Validate mode-map, baseline, and manifest shapes; default malformed optional inputs safely and keep strict semantics explicit. [VERIFIED: existing patterns] |
| V6 Cryptography | no | No cryptographic operation required. [VERIFIED: phase scope] |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Baseline hides unsafe/stale dispatch target | Tampering | Baseline applies only to reverse gaps; forward diagnostics remain non-acknowledgeable. [VERIFIED: threat analysis] |
| Partial report write looks fresh | Tampering | Temp write plus rename, then compare report/manifest metadata. [CITED: https://nodejs.org/api/fs.html] |
| Path injection through baseline/report configuration | Tampering | Paths come from trusted CLI/env configuration used by builder fixtures; report content never determines a write path. [VERIFIED: existing builder pattern] |
| Hook exception blocks or alters prompt | Availability | Wrap freshness read; fixed reminder only; outer hook remains exit 0 and never emits block. [VERIFIED: hook source] |
| Report leaks descriptions, paths, or secrets unnecessarily | Information Disclosure | Persist IDs, categories, reasons, counts, and fingerprints only; do not copy full manifest records or raw prompt data. [VERIFIED: project privacy constraints] |

## Sources

### Primary (HIGH confidence)

- `build-manifest.mjs` — manifest categories, normalized fields, atomic publication, environment seams, size gate. [VERIFIED: codebase grep]
- `/Users/guilherme/.claude/hooks/router.mjs` — coverage helpers, target validation, freshness, context composition, fail-open output. [VERIFIED: codebase grep]
- `tests/router.coverage.test.mjs`, `tests/router.health.test.mjs`, `tests/router.route-targets.test.mjs`, `tests/router.build-manifest.test.mjs` — executable contracts and conventions. [VERIFIED: codebase grep]
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `28-CONTEXT.md` — required behavior and scope. [VERIFIED: project docs]

### Secondary (MEDIUM confidence)

- https://nodejs.org/api/fs.html — `renameSync`, `statSync`, and filesystem API behavior. [CITED: https://nodejs.org/api/fs.html]
- https://nodejs.org/api/process.html — graceful non-zero `process.exitCode` behavior and forced-exit truncation warning. [CITED: https://nodejs.org/api/process.html]

### Tertiary (LOW confidence)

- None beyond the explicitly listed assumptions.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — installed runtime and existing stdlib-only implementation verified locally.
- Architecture: HIGH — direct extension points and tests verified in live code.
- Taxonomy schema details: MEDIUM — required values are locked, but mapped-record representation and baseline policy need planner resolution.
- Pitfalls: HIGH — derived from concrete current helper behavior and phase requirements.

**Research date:** 2026-07-29
**Valid until:** 2026-08-28
