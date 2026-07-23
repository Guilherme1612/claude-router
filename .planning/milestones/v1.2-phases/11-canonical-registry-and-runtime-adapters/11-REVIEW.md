---
phase: 11-canonical-registry-and-runtime-adapters
reviewed: 2026-07-14T21:20:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - install-router.mjs
  - src/adapters/claude.mjs
  - src/adapters/codex.mjs
  - src/lifecycle/router-lifecycle.mjs
  - src/registry/build.mjs
  - src/registry/identity.mjs
  - src/registry/schema.mjs
  - tests/router.adapters.test.mjs
  - tests/router.lifecycle.test.mjs
  - tests/router.registry-build.test.mjs
  - tests/router.registry-schema.test.mjs
findings:
  critical: 4
  warning: 3
  info: 0
  total: 7
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-14T21:20:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

The canonical schema and deterministic registry merge are generally coherent, but the runtime-adapter boundary does not accept representative installed artifacts. Valid nested YAML and multiline TOML are converted into invalid partial capabilities, and Claude's versioned plugin-cache layout is not discovered. Separately, uninstall treats path fields from a mutable JSON manifest as trusted filesystem authority, permitting deletion or settings mutation outside the configured runtime roots when fingerprints match. These are release-blocking correctness and security defects. Three additional robustness issues can collapse malformed capability identities, hide user hook inventory, or leave directories behind after rollback with advanced path overrides.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Valid native YAML frontmatter is rejected as malformed

**File:** `src/adapters/claude.mjs:34-45`
**Issue:** `markdown()` accepts only unindented `key: scalar` lines. Native `SKILL.md` metadata commonly contains nested mappings and lists, so an otherwise valid installed skill throws on the first indented line and is normalized as a non-dispatchable `malformed_artifact`. Because both Claude and Codex reuse this parser, the defect removes valid capabilities from both runtime inventories and blocks ADP-01, ADP-02, and the full-registry goal. The fixtures at `tests/router.adapters.test.mjs:14-16,39` exercise only a deliberately flat subset, so the passing test does not protect the native contract.
**Fix:** Replace the line parser with an inert, deterministic YAML frontmatter parser that supports the native mapping/list subset (or a vetted YAML parser), applies explicit size/depth/alias limits, and rejects executable/custom tags. Add representative nested-metadata fixtures for both runtimes and assert dispatchable normalized output rather than merely an observation or diagnostic.

### CR-02: Valid multiline Codex agent TOML is rejected as malformed

**File:** `src/adapters/claude.mjs:47-69`
**Issue:** The shared TOML parser requires every non-comment line to be either one narrow MCP header or a complete single-line assignment. Native Codex agent files use multiline basic/literal strings for `developer_instructions`; their continuation lines therefore throw `unsupported TOML line` and the agent becomes an invalid partial record. Comment removal also treats every `#` as a comment even inside quoted strings. This makes recognizable installed Codex agents unusable while the simplified single-line fixture at `tests/router.adapters.test.mjs:41` remains green.
**Fix:** Parse the supported native TOML grammar with an inert TOML implementation or implement a bounded state machine covering multiline basic/literal strings, quoted comments, ordinary tables, arrays, and inline tables. Add an installed-agent-shaped fixture and assert its name, invocation, and dispatchability survive normalization.

### CR-03: Versioned Claude plugin-cache skills are silently excluded

**File:** `src/adapters/claude.mjs:71-85`
**Issue:** `claudeLayout()` recognizes only `plugins/<one-segment>/skills/<skill>/SKILL.md`. Installed cached plugins use deeper versioned paths such as `plugins/cache/<publisher-or-plugin>/<plugin>/<version>/.claude/skills/<skill>/SKILL.md`. `discover()` filters by `layout(rel)` before parsing, so these valid capabilities produce neither an observation nor a diagnostic. This is silent inventory loss and directly contradicts the claimed plugin coverage.
**Fix:** Define explicit bounded recognizers for every supported installed/cache plugin layout, including the versioned `.claude/skills/...` form, and derive plugin provenance from the recognized path. Add a representative cached-plugin fixture and assert it yields a portable, dispatchable `plugin_skill` observation.

### CR-04: Uninstall trusts manifest-controlled paths outside runtime roots

**File:** `src/lifecycle/router-lifecycle.mjs:223-265`
**Issue:** The ownership manifest is parsed as mutable JSON and only checked for field types. `manifest.bindings[*].settings_path` is then read and rewritten, and `manifest.files[*].path` is deleted whenever its bytes match the manifest-provided fingerprint. There is no containment check against `claudeRoot`, `codexRoot`, or the expected owned paths. A modified manifest can therefore target an arbitrary readable/writable settings file or delete any file whose fingerprint is known. Fingerprint matching proves content equality, not installer ownership. This is an unsafe-deserialization/path-traversal deletion primitive.
**Fix:** Reconstruct the complete allowlist of owned file and binding paths from the configured roots, require every manifest path to equal an allowlisted canonical realpath (with separator-aware containment where appropriate), reject duplicates and unexpected entries before any mutation, and never accept arbitrary absolute paths as ownership evidence. Add adversarial tests with `../`/absolute file, directory, and binding paths and assert fail-closed behavior with zero mutations.

## Warnings

### WR-01: Malformed SKILL.md records share the synthetic name `SKILL`

**File:** `src/adapters/claude.mjs:110-115`
**Issue:** The malformed-artifact fallback computes the same basename expression on both sides of its condition. Every malformed `.../<skill>/SKILL.md` is therefore named `SKILL`, not the skill directory name. `stableCapabilityId()` can subsequently group unrelated malformed skills of the same runtime/type/scope into one registry record, obscuring the number and identity of broken capabilities.
**Fix:** For recognized skill layouts, derive the native name from `basename(dirname(requested))`; use the file stem only for agent/command/config layouts. Add two malformed skills in one root and assert they remain distinct invalid observations and registry records.

### WR-02: Router-hook filtering can discard unrelated user-managed hooks

**File:** `src/adapters/claude.mjs:121-130`
**Issue:** A whole settings binding entry is filtered when `JSON.stringify(entry)` contains the substring `router.mjs`. If one matcher/group contains both the installer-owned hook and user-managed hooks, the user hooks disappear from inventory as collateral damage. Substring matching can also exclude unrelated commands whose arguments merely mention that filename.
**Fix:** Traverse the native binding structure and remove only the exact installer-owned command hook after canonical command/path comparison; retain the group and all sibling hooks. Add a mixed binding fixture proving only the owned hook is excluded.

### WR-03: Rollback directory tracking is not containment-safe for path overrides

**File:** `src/lifecycle/router-lifecycle.mjs:139-149`
**Issue:** Directory snapshots are collected only while a directory string `startsWith()` a runtime-root string. This is not separator-aware and excludes supported advanced overrides outside those roots. Files are restored, but newly created parent directories for such overrides are not removed after failure, so the advertised exact pre-install restoration does not hold for the public override surface.
**Fix:** Build parent-directory snapshots for every transaction file up to a defined existing ancestor, using canonical separator-aware containment rather than raw string prefixes. Add a post-mutation failure test with candidate/manifest/router overrides outside the default roots and compare the entire pre/post filesystem snapshot.

---

_Reviewed: 2026-07-14T21:20:00Z_
_Reviewer: generic-agent workaround acting as gsd-code-reviewer_
_Depth: standard_
