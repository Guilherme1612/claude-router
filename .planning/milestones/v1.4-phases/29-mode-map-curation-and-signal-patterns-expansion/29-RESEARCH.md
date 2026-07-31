# Phase 29: Mode-Map Curation and Signal Patterns Expansion - Research

**Researched:** 2026-07-29
**Domain:** Node.js stdlib lexical routing, versioned JSON DSL, collision linting, and small-corpus threshold selection
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
| MAP-01 | High-value unmapped GSD lifecycle/flow modes get intent-and-output anchored entries. | The generated report identifies all eight named lifecycle skills as typed reverse gaps; each is present as a global skill in the manifest. Use `invoke_kind: "skill"` with the skill as the typed target unless a matching command is present in the fixture. [VERIFIED: codebase grep] |
| MAP-02 | Ten named design skills get mode-map entries. | All ten are present as global skills and currently appear as reverse gaps. Use one skill-target entry per capability with at most six output-specific patterns. [VERIFIED: codebase grep] |
| MAP-03 | New entries pass target validation, missing-MCP agents remain warning-only, and routing works with a non-GSD synthetic manifest. | Extend the existing `validateRouteTargets()` and temporary-manifest fixture seams; route only to fixture-owned skill IDs and assert missing-MCP agents never enter the corpus or dispatch target lists. [VERIFIED: codebase grep] |
| SIG-01 | Existing and new entries use at most six output-type-anchored patterns. | The live v2 map has 29 entries; 12 exceed six patterns, and current patterns are appended directly to BM25 documents. Prune before adding so expansion does not inflate document length and cross-entry token overlap. [VERIFIED: live mode-map inspection] |
| SIG-02 | Schema v3 accepts strings and `{kind,value}` objects while v2 remains compatible. | Normalize every pattern once before validation, corpus construction, proposal sanitation, and collision linting. Treat both v2 strings and v3 `{kind:"contains",value}` objects as identical existing BM25 text; no new match semantics. [VERIFIED: codebase grep and resolved scope] |
| SIG-03 | Duplicate patterns fail lint unless explicitly declared. | Canonicalize by kind plus normalized value; reject duplicates by default. Permit a duplicate only when every occurrence carries the same non-empty `collision_group`, making the exception local and auditable. [VERIFIED: live mode-map inspection] |
| SIG-04 | Thresholds are re-derived on the expanded entry list. | Do not fit isotonic or Platt calibration. Add labeled positive, negative, and near-collision fixtures for the expanded routes, then exhaustively evaluate a small threshold grid with a safety-first objective and leave-one-out sensitivity. [VERIFIED: calibration harness execution] [CITED: https://scikit-learn.org/stable/modules/calibration.html] |
</phase_requirements>

## Summary

Phase 29 should extend the existing router, not introduce a second routing engine. The installed `router.mjs` already loads the mode map, validates typed targets, appends `signal_patterns` to manifest-owned BM25 documents, normalizes scores, assigns confidence tiers, guards missing-MCP agents, and exposes dry-run inspection used by `router.calibrate.mjs`. Phase 28 already provides a deterministic generated coverage report and synthetic manifest helpers. [VERIFIED: codebase grep]

The live inputs make the work concrete: `mode-map.json` is schema v2 with 29 entries; 12 entries exceed the new six-pattern cap and one exact duplicate (`"redesign the ui"`) appears across entries. `coverage-report.json` reports 289 capabilities, 22 mapped, 228 unacknowledged gaps, and no forward diagnostics; all eight named lifecycle skills and all ten named design skills are current global-skill gaps. [VERIFIED: live mode-map and generated coverage-report inspection]

Threshold work must remain manual/deterministic rather than statistical probability calibration. The harness currently contains 32 fixtures, but only 10 are the original routing set; the remaining 22 are eight codebase fixtures, three evolution fixtures, nine route-coverage fixtures, and two mapper fixtures. Its current run is 31/32, while every non-empty unblended BM25 result normalizes its top score to `1.0`; therefore `T_high=0.6` and `T_low=0.3` do not separate ordinary non-empty results, and margin `M` is the principal discriminator. Isotonic regression is specifically prone to overfit small datasets, and sigmoid/Platt scaling assumes a calibration-curve shape not established here. [VERIFIED: calibration harness execution] [CITED: https://scikit-learn.org/stable/modules/calibration.html]

**Primary recommendation:** Add one shared v2/v3 pattern normalizer plus collision lint, curate the 18 required skill routes against a synthetic manifest, expand calibration with route-specific positives and hard negatives, then select thresholds by constrained exhaustive grid search with sensitivity reporting—no new dependency and no learned calibrator. [VERIFIED: codebase architecture]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mode-map schema and DSL normalization | Router data/config layer | Hook runtime | The map is user-reviewed runtime data; the hook consumes its normalized values. [VERIFIED: codebase grep] |
| Target validity and collision lint | Build/test validation | Hook diagnostics | Invalid data must fail before publication while runtime remains fail-open. [VERIFIED: project constraints] |
| BM25 signal enrichment | Hook runtime | Manifest inventory | Patterns enrich manifest-owned documents; they do not create a separate candidate universe except warning routes. [VERIFIED: codebase grep] |
| Manifest-agnostic route fixture | Test tier | Synthetic manifest | Portable behavior must not depend on the user's generated GSD inventory descriptions. [VERIFIED: MAP-03] |
| Threshold selection | Offline calibration CLI | Hook runtime | The CLI evaluates candidate constants; the hook only reads final constants. [VERIFIED: codebase grep] |
| Coverage regeneration | Build-time CLI | Generated report | Phase 28's builder owns post-manifest audit publication. [VERIFIED: Phase 28 verification] |

## Project Constraints (from AGENTS.md)

- Prefix shell commands with `rtk`; use `rtk proxy` when filtered output would hide home-directory metadata. [VERIFIED: `/Users/guilherme/.codex/RTK.md`]
- Keep production routing Node.js stdlib-only with no per-prompt network/API call. [VERIFIED: `.claude/CLAUDE.md`]
- Preserve fail-open prompt behavior and the approximately 100ms maximum hook latency. [VERIFIED: `.claude/CLAUDE.md`]
- Never auto-rebuild the manifest inside the prompt hook. [VERIFIED: `.claude/CLAUDE.md`]
- Do not route project-scoped skills globally. [VERIFIED: `.claude/CLAUDE.md`]
- Missing-MCP agents must remain warning-only and never become dispatch targets. [VERIFIED: `.claude/CLAUDE.md`]
- Respect deny rules and never place secret paths or values in mode-map signals or injected context. [VERIFIED: `.claude/CLAUDE.md`]
- Preserve unrelated dirty-worktree changes. The worktree already contains modified planning/project files and untracked generated/skill artifacts. [VERIFIED: git status]
- The project Excalidraw skill applies only when producing an Excalidraw artifact; this research produces a Markdown architecture diagram, so no diagram asset is required. [VERIFIED: project skill inspection]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | 22.22.3 installed | Router, parser, lint, calibration CLI | Existing runtime; ESM and all required stdlib APIs are available. [VERIFIED: local environment] |
| `node:fs`, `node:path`, `node:os`, `node:url` | built-in | Load fixtures and runtime data | Already used by the hook, builder, lifecycle, and calibration harness. [VERIFIED: codebase grep] |
| `node:test` + `node:assert/strict` | built-in | Schema, collision, routing, calibration, and regression tests | Existing repository convention; no test dependency is needed. [VERIFIED: codebase grep] |

### Supporting

No external package is needed. Pattern normalization, collision grouping, grid enumeration, and leave-one-out summaries are small deterministic operations over JSON arrays. [VERIFIED: codebase inspection]

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared pattern normalizer | Branch separately in validator, corpus builder, and linter | Duplicate semantics will drift and object patterns will stringify as `"[object Object]"`. [VERIFIED: current call sites] |
| Contains-only string/object DSL | Additional literal or regex kinds | New match semantics are not required by SIG-02 and boundary-aware matching is deferred by FUT-09. [VERIFIED: requirements] |
| Constrained grid search | Isotonic regression | Non-parametric calibration is prone to overfit small samples; the 10 core fixtures are far below the documented range where isotonic becomes reliable. [CITED: https://scikit-learn.org/stable/modules/calibration.html] |
| Constrained grid search | Platt/sigmoid scaling | It estimates calibrated probabilities under a shape assumption; the router needs three deterministic decision boundaries over normalized rank/margin, not a probability model. [CITED: https://scikit-learn.org/stable/modules/calibration.html] [VERIFIED: codebase scoring] |

**Installation:** None. [VERIFIED: codebase constraints]

## Package Legitimacy Audit

Not applicable: this phase should install no external packages. [VERIFIED: standard-stack analysis]

## Architecture Patterns

### System Architecture Diagram

```text
mode-map.json (v2 strings or v3 string/object patterns)
        |
        v
normalizeSignalPattern()
  | invalid ----------------------> validation diagnostic / fail-open load
  |
  +--> canonical { kind, value, collision_group? }
          |
          +--> collision lint ----> duplicate? reject unless same explicit group
          |
          +--> corpus text --------> tokenize(value) -> BM25 documents
          |
          +--> normalized value ----> existing BM25 corpus/scoring
                                      |
Synthetic manifest + calibration prompts
        |                             |
        +---------- inspectDecision()+
                                      |
                       score, runner-up, margin, route
                                      |
                         threshold grid evaluation
                                      |
             wrong high route? ------+------ yes -> candidate rejected
                                      |
                         selected T_high/T_low/M
                                      |
              focused tests -> full suite -> rebuild coverage report
```

[VERIFIED: codebase seams]

### Recommended Project Structure

```text
/Users/guilherme/.claude/hooks/router.mjs         # shared parser, matcher, target validation, routing
/Users/guilherme/.claude/router/mode-map.json     # user-reviewed schema v3 data
router.calibrate.mjs                              # offline fixture evaluation + threshold search/report
calibration-tasks.json                            # existing contracts plus Phase 29 route cases
src/coverage/audit.mjs                            # schema/collision parity for build-time audit
tests/router.mode-map-v3.test.mjs                 # Wave 0: v2/v3 parser + collision lint
tests/router.mode-map-curation.test.mjs           # Wave 0: synthetic non-GSD manifest routing
tests/router.calibration-thresholds.test.mjs       # Wave 0: grid objective and sensitivity
coverage-report.json                              # regenerated Phase 28 evidence
```

[VERIFIED: existing layout and requirements]

### Pattern 1: Normalize Once at the Trust Boundary

**What:** Convert every string/object pattern into one internal record before any consumer uses it. [VERIFIED: codebase call-site analysis]

**When to use:** `loadModeMap`, `validateRouteTargets`, `buildCorpus`, proposal sanitation, collision lint, and threshold fixtures. [VERIFIED: codebase grep]

```javascript
// Source: recommended extension of existing router.mjs fail-open loaders
function normalizeSignalPattern(raw, schemaVersion = 2) {
  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    return value ? { kind: 'contains', value } : null;
  }
  if (schemaVersion < 3 || !raw || typeof raw !== 'object') return null;
  const kind = String(raw.kind || '');
  const value = String(raw.value || '').trim().toLowerCase();
  if (kind !== 'contains' || !value) return null;
  return {
    kind,
    value,
    ...(raw.collision_group ? { collision_group: String(raw.collision_group) } : {}),
  };
}
```

[VERIFIED: existing input shapes]  
The planner resolves the object vocabulary to `contains` only so schema v3 adds metadata capacity without changing hot-path match semantics. [RESOLVED]

### Pattern 2: Versioned Reader, v3 Writer

**What:** Accept schema v2 strings unchanged and schema v3 mixed arrays; any new write or mutation emits schema v3 while preserving semantic string compatibility. [VERIFIED: SIG-02]

**When to use:** Loader, evolution mutation, lifecycle checks, fixtures, and any future editor. Existing `loadModeMap()` currently performs raw `JSON.parse`, while proposal/evolution paths also read and write `signal_patterns`; all consumers must share the same normalization rule. [VERIFIED: codebase grep]

Do not rewrite every v2 string into an object merely because v3 permits objects. Strings are the smallest representation for default `contains` semantics; objects are for non-default kinds or an explicit collision group. [VERIFIED: Ponytail constraint]

### Pattern 3: Collision Key Includes Match Semantics

**What:** Use `${kind}\0${normalizedValue}` as the duplicate key. A plain string and `{kind:"contains",value:"X"}` collide because they are semantically identical. [VERIFIED: backward-compatibility requirement]

**When to use:** Validation before route-target mapping and in the build audit. Duplicate entries pass only when all occurrences use the same explicit `collision_group`; a bare boolean such as `allow_collision: true` is too easy to spread without documenting the relationship. [ASSUMED]

### Pattern 4: Manifest-Agnostic Fixture

**What:** Build a synthetic manifest whose descriptions are generic and whose route IDs are neutral aliases, while target skill IDs remain the contractual capability names required by `validateRouteTargets`. [VERIFIED: MAP-03 and existing fixture seams]

**When to use:** For every new entry, assert:

1. its positive prompt selects the expected route/skill;
2. a sibling hard-negative prompt does not select it;
3. target validation succeeds using only the supplied fixture manifest;
4. a synthetic missing-MCP agent is excluded or warning-only;
5. the fixture is passed directly to `inspectDecision`/`buildCorpus`, never loaded from the user's global manifest. [VERIFIED: existing injectable routing helpers]

This is “manifest-agnostic,” not “target-name-free”: the typed target must still exist in the synthetic inventory or validation should reject it. [VERIFIED: `validateRouteTargets`]

### Pattern 5: Safety-First Threshold Grid

**What:** Enumerate candidate `T_high`, `T_low`, and `M` values from observed score/margin breakpoints plus current values; evaluate route correctness and confidence labels without mutating the live mode map. [VERIFIED: existing dry-run architecture]

**When to use:** After the expanded entries and fixtures exist. Reject any candidate that creates a wrong high-confidence route. Among survivors, maximize exact route picks, expected-tier correctness across labeled low/medium/high boundary records, correct high picks, then minimize misses; break ties by the smallest numeric tuple. [RESOLVED: deterministic objective]

Because ordinary unblended winners often normalize to `1.0`, add deterministic labeled boundary fixtures that exercise low/medium and medium/high score transitions as well as near-tie margins. Every selected constant must change at least one labeled tier decision; an unchanged numeric result is acceptable only when the objective independently reselects it. [RESOLVED: SIG-04]

Run leave-one-out sensitivity: reselect thresholds with each routing fixture omitted and report the range/frequency of chosen values. If one omitted case changes the selected `M`, mark the result unstable and retain the conservative current value or nearest stable plateau. [ASSUMED]

### Anti-Patterns to Avoid

- **Fitting isotonic or Platt on the 10 originals:** the sample is too small and the router score is not a demonstrated probability. [VERIFIED: calibration inventory] [CITED: https://scikit-learn.org/stable/modules/calibration.html]
- **Calling all 32 fixtures one homogeneous calibration set:** mapper and evolution fixtures do not provide the same `(score, correct-route)` decision sample as ordinary route fixtures. [VERIFIED: harness branches]
- **Using skill names as signals:** the success criterion is implicit intent routing; patterns must describe outputs such as “pull request ready,” “PROJECT.md and roadmap,” “UAT results,” or “Excalidraw JSON.” [VERIFIED: MAP-01/MAP-02]
- **Stringifying DSL objects into corpus text:** `join(' ')` on raw objects produces `"[object Object]"`; extract normalized `value`. [VERIFIED: current `buildCorpus`]
- **Adding regex now:** it creates a new unsafe input surface and is unnecessary for the required output-type phrases. [VERIFIED: project constraints]
- **Allowing duplicate patterns through priority alone:** BM25 document duplication still inflates both entries even if a later tie-break picks one. Prefer unique patterns; explicit collision groups are exceptions. [VERIFIED: BM25 construction]
- **Testing against the live manifest only:** that proves the current machine, not portability. [VERIFIED: MAP-03]
- **Editing only the installed mode map:** lifecycle/configuration treats it as a user-reviewed runtime data file, so planning must name the canonical source/update path and verify installed runtime behavior explicitly. [VERIFIED: lifecycle code]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| New router/scorer | Separate pattern engine | Existing `buildCorpus`, BM25, normalization, and `inspectDecision` | One route pipeline already owns production behavior. [VERIFIED: codebase grep] |
| Probability calibrator | Isotonic/Platt implementation | Deterministic threshold grid over labeled route outcomes | The corpus is tiny and scores are not probabilities. [VERIFIED: calibration analysis] |
| Schema framework | JSON Schema package or validator dependency | Small shared stdlib normalizer and diagnostics | Required shape is narrow and the hook must remain dependency-free. [VERIFIED: project constraints] |
| Test manifest generator framework | General fixture DSL | Existing plain-object/temp-directory fixture patterns | Current tests already inject manifests and paths. [VERIFIED: tests] |
| Collision database | Registry/service | Canonical-key `Map` over the expanded entry array | The live map has only 29 entries before expansion. [VERIFIED: live mode-map inspection] |

**Key insight:** The phase is a disciplined data expansion plus one shared parser/linter seam; statistical model fitting and new dependencies would add risk without information. [VERIFIED: research synthesis]

## Common Pitfalls

### Pitfall 1: The v3 Parser Exists Only in One Consumer

**What goes wrong:** Target validation accepts object patterns while BM25, proposals, or coverage auditing stringify/reject them. [VERIFIED: multiple current consumers]

**Why it happens:** `signal_patterns` is currently handled inline at several sites. [VERIFIED: codebase grep]

**How to avoid:** Export one normalizer/canonicalizer and test every consumer with the same mixed v2/v3 fixture. [VERIFIED: architecture recommendation]

**Warning signs:** `join(' ')`, `String(pattern)`, or direct `.includes()` remains on raw pattern values outside the normalizer. [VERIFIED: JavaScript behavior]

### Pitfall 2: Cap Compliance Is Applied Only to New Entries

**What goes wrong:** SIG-01 still fails because 12 existing entries currently contain 7–22 patterns. [VERIFIED: live mode-map inspection]

**Why it happens:** Expansion work focuses on missing routes and overlooks existing data. [VERIFIED: audit result]

**How to avoid:** Make `1..6` patterns a schema/lint invariant for every entry and prune the existing map in the same change. [VERIFIED: SIG-01]

**Warning signs:** The linter reports `gsd-debug`, `gsd-explore`, `impeccable`, or `ui-ux-pro-max` over cap. [VERIFIED: live mode-map inspection]

### Pitfall 3: Generic Verbs Create Cross-Route Inflation

**What goes wrong:** “create,” “run,” “finish,” “design,” or “review” enrich multiple documents and shrink margins. [VERIFIED: BM25 mechanics]

**Why it happens:** Authors describe the action rather than the artifact/outcome. [VERIFIED: requirement rationale]

**How to avoid:** Prefer bounded phrases: “pull request ready for merge,” “new PROJECT.md requirements roadmap,” “phase plans executed,” “UAT verification result,” “brand guidelines board,” “website screenshot to implementation,” or “Excalidraw diagram JSON.” [ASSUMED]

**Warning signs:** A pattern is one generic token or appears naturally in several capability descriptions. [VERIFIED: corpus construction]

### Pitfall 4: Threshold “Re-Derivation” Changes Constants Without Evidence

**What goes wrong:** New values are chosen from the same aggregate pass count, even though that count includes heterogeneous fixture branches and permits many medium/low exact outcomes. [VERIFIED: harness execution]

**Why it happens:** The existing harness reports a release threshold, not an optimization objective for confidence boundaries. [VERIFIED: `calibrationPassThreshold`]

**How to avoid:** Record per-fixture top, runner-up, margin, expected target, actual target, and tier; define the lexicographic safety objective before searching; report sensitivity and affected-sample counts. [VERIFIED: threshold-tuning principle] [CITED: https://scikit-learn.org/1.9/modules/classification_threshold.html]

**Warning signs:** The plan says “try isotonic,” “use 31/32,” or changes `T_high/T_low` although all relevant top scores remain `1.0`. [VERIFIED: live output]

### Pitfall 5: Synthetic Fixture Accidentally Reads Global State

**What goes wrong:** Tests pass only because `inspectDecision()` reloads `~/.claude/router/claude-inventory-manifest.json` or the installed mode map. [VERIFIED: current default paths]

**Why it happens:** `dryRun()` accepts manifest arguments but currently delegates via paths and does not use those arguments directly. [VERIFIED: `router.calibrate.mjs` inspection]

**How to avoid:** Use injectable `manifest`/`modeMap` objects in `inspectDecision`, or write both to a temp root and pass explicit paths. Assert fixture IDs absent from the live manifest to prove isolation. [VERIFIED: existing path injection patterns]

**Warning signs:** The test imports the live router and calls `loadManifest()` without a temp path. [VERIFIED: existing live target test]

### Pitfall 6: Coverage Improves but Dispatch Safety Regresses

**What goes wrong:** An MCP-missing agent becomes “mapped” by being carried under a warning route or recommended agent list. [VERIFIED: Phase 28 adversarial fixes]

**Why it happens:** Coverage and route validation use similar but distinct target indexes. [VERIFIED: codebase grep]

**How to avoid:** Preserve validator/audit parity tests and keep warning entries targetless with explanatory text only. [VERIFIED: existing tests]

**Warning signs:** Any new `recommended_agents` item also appears in `requires_mcp_not_in_manifest`. [VERIFIED: manifest contract]

## Code Examples

### Canonical collision lint

```javascript
// Source: recommended stdlib pattern over existing deterministic validators
export function lintPatternCollisions(modeMap) {
  const seen = new Map();
  const diagnostics = [];
  for (const entry of modeMap.entries || []) {
    for (const raw of entry.signal_patterns || []) {
      const pattern = normalizeSignalPattern(raw, modeMap.schema_version);
      if (!pattern) continue;
      const key = `${pattern.kind}\0${pattern.value}`;
      const prior = seen.get(key) || [];
      prior.push({ entry_id: entry.id, group: pattern.collision_group || null });
      seen.set(key, prior);
    }
  }
  for (const [key, rows] of seen) {
    if (rows.length < 2) continue;
    const groups = new Set(rows.map(row => row.group));
    if (groups.size !== 1 || groups.has(null)) {
      diagnostics.push({ code: 'signal_collision', key, entries: rows.map(row => row.entry_id) });
    }
  }
  return diagnostics;
}
```

[ASSUMED]

### Deterministic threshold candidate search

```javascript
// Source: official threshold-tuning principle adapted to the existing stdlib harness
for (const T_high of highCandidates) {
  for (const T_low of lowCandidates) {
    if (T_low > T_high) continue;
    for (const M of marginCandidates) {
      const result = evaluateThresholds(samples, { T_high, T_low, M });
      if (result.wrongHigh > 0) continue;
      candidates.push(result);
    }
  }
}
candidates.sort(compareSafetyFirst);
```

[CITED: https://scikit-learn.org/1.9/modules/classification_threshold.html]

### Portable fixture shape

```javascript
// Source: existing route-target and coverage fixture conventions
const manifest = {
  skills: [{ id: 'brandkit', name: 'brandkit', scope: 'global', description: 'fixture capability' }],
  plugin_skills: [],
  agents_store_skills: [],
  commands: [],
  agents: [{ id: 'blocked', name: 'blocked', requires_mcp_not_in_manifest: ['missing'] }],
};
const modeMap = {
  schema_version: 3,
  thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
  entries: [{
    id: 'brand-identity-output',
    mode: null,
    invoke_kind: 'skill',
    signal_patterns: [{ kind: 'contains', value: 'brand guidelines board' }],
    recommended_skills: ['brandkit'],
    recommended_agents: [],
  }],
};
```

[ASSUMED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mode-map v2 plain strings only | v3 mixed string/object DSL with v2 reader compatibility | Phase 29 target | Adds match semantics without migrating default strings. [VERIFIED: SIG-02] |
| 29-entry map with many broad synonym lists | Required lifecycle/design coverage with global six-pattern cap | Phase 29 target | Reduces document dilution while expanding route breadth. [VERIFIED: live map and SIG-01] |
| Duplicate pattern tolerated implicitly | Collision lint with explicit grouped exceptions | Phase 29 target | Makes overlap deliberate and reviewable. [VERIFIED: SIG-03] |
| Hand-set thresholds reported by calibration | Constrained grid search plus sensitivity report | Phase 29 recommendation | Produces reproducible evidence without unsupported probability calibration. [VERIFIED: research analysis] |
| Isotonic/Platt considered for v1.4 | Deferred until a genuinely larger held-out set exists | Phase 29 research conclusion | Matches FUT-08 deferral and avoids overfit. [VERIFIED: REQUIREMENTS.md] [CITED: https://scikit-learn.org/stable/modules/calibration.html] |

**Deprecated/outdated:**

- Treating raw `signal_patterns.join(' ')` as schema-independent is obsolete once objects are allowed; consumers must join normalized values. [VERIFIED: SIG-02]
- Treating the aggregate 32-fixture pass threshold as a confidence-calibration objective is unsupported; it is a heterogeneous release regression gate. [VERIFIED: harness branches]
- The roadmap phrase “currently 10 tasks” is accurate for the original core subset but not the full file, which now has 32 fixtures. [VERIFIED: calibration file inspection]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | RESOLVED: v3 objects support only `kind: "contains"` in Phase 29; strings and objects retain identical existing contains semantics. | Architecture Pattern 1 | No risk: SIG-02 requires the object shape, not new match behavior; FUT-09 explicitly defers boundary-aware matching. |
| A2 | Intentional overlaps should use a shared `collision_group` on each object occurrence. | Architecture Pattern 3 | The planner may choose an equally explicit `priority`/`tie_break` contract instead. |
| A3 | Leave-one-out instability should retain the current or nearest conservative threshold plateau. | Architecture Pattern 5 | A different predeclared safety metric could select another stable tie-break. |
| A4 | Example output-type phrases are suitable calibration candidates. | Pitfall 3 / Code Examples | Real prompt wording may require user-curated alternatives after dry-run results. |

## Resolved Open Questions

1. **RESOLVED — What exact v3 object-kind vocabulary is part of the public contract?**
   - Decision: Phase 29 accepts only `kind: "contains"`. Both v2 strings and v3 objects append the same normalized phrase to the existing BM25 document; the object form exists for explicit metadata such as `collision_group`.
   - Basis: SIG-02 requires string-or-object compatibility but no new matching behavior. The roadmap keeps hot-path semantics unchanged and FUT-09 defers boundary-aware substring matching. Therefore `prefix`, `exact`, `not`, and regex are out of scope.

2. **RESOLVED — Which “related lifecycle/flow modes” beyond the eight named entries are in scope?**
   - Decision: Curate exactly the eight enumerated lifecycle skills in MAP-01.
   - Basis: All eight are verified unacknowledged manifest gaps and collectively cover the named ship/create/execute/quick/validate/verify/resume/complete lifecycle outputs. The requirement gives no additional related-mode IDs or cutoff, and the Phase 28 ranking supplies no distinct extra lifecycle output with Phase 29 fixture evidence. Additional gaps remain visible in the coverage report rather than being guessed into scope.

3. **RESOLVED — What is the smallest synthetic fixture seam?**
   - Decision: Add optional `manifest` and `modeMap` object overrides to the existing `inspectDecision(prompt, options)` options bag.
   - Basis: `inspectDecision` already centralizes read-only decisions and accepts an extensible options object; `router.calibrate.mjs` already accepts but ignores the two objects. Two optional values are smaller than temp-file creation/cleanup and keep every fixture on the production scoring path without a new entry point.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Router/tests/calibration | ✓ | 22.22.3 | Project requires Node ≥18. [VERIFIED: local environment] |
| npm | Existing workspace commands only | ✓ | 10.9.8 | Not needed for installation. [VERIFIED: local environment] |
| Live Claude router files | Production parity and calibration | ✓ | mode-map schema v2, 29 entries | Synthetic temp fixtures for portable tests. [VERIFIED: live inspection] |
| Phase 28 coverage report | Gap ranking and post-change evidence | ✓ | schema v1, generated 2026-07-29 | Rebuild with `build-manifest.mjs`. [VERIFIED: file inspection] |

**Missing dependencies with no fallback:** None. [VERIFIED: environment audit]

**Missing dependencies with fallback:** None. [VERIFIED: environment audit]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` 22.22.3 [VERIFIED: local environment] |
| Config file | None; tests are direct `.mjs` files. [VERIFIED: repository scan] |
| Quick run command | `rtk node --test tests/router.mode-map-v3.test.mjs tests/router.mode-map-curation.test.mjs tests/router.calibration-thresholds.test.mjs tests/router.route-targets.test.mjs tests/router.coverage-audit.test.mjs` [ASSUMED] |
| Full suite command | `rtk node --test --test-concurrency=1 tests/*.test.mjs` [VERIFIED: Phase 28 verification convention] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAP-01 | Eight lifecycle intents route to expected skill targets without slash text | integration | `rtk node --test tests/router.mode-map-curation.test.mjs` | ❌ Wave 0 |
| MAP-02 | Ten design intents route to matching skills with hard negatives | integration | `rtk node --test tests/router.mode-map-curation.test.mjs` | ❌ Wave 0 |
| MAP-03 | Synthetic non-GSD manifest validates targets; missing-MCP agents stay non-dispatchable | integration | `rtk node --test tests/router.mode-map-curation.test.mjs tests/router.route-targets.test.mjs` | ❌ extend/new |
| SIG-01 | Every entry has 1–6 normalized patterns and output-specific fixture evidence | unit | `rtk node --test tests/router.mode-map-v3.test.mjs` | ❌ Wave 0 |
| SIG-02 | v2 strings and v3 mixed patterns parse identically for default contains semantics | unit/regression | `rtk node --test tests/router.mode-map-v3.test.mjs tests/router.guards.test.mjs` | ❌ extend/new |
| SIG-03 | Duplicate canonical patterns fail unless explicitly grouped | unit | `rtk node --test tests/router.mode-map-v3.test.mjs tests/router.coverage-audit.test.mjs` | ❌ extend/new |
| SIG-04 | Expanded fixtures produce deterministic safety-first thresholds and sensitivity report | integration | `rtk node --test tests/router.calibration-thresholds.test.mjs && rtk node router.calibrate.mjs` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** Run the directly affected new test plus `tests/router.route-targets.test.mjs`. [VERIFIED: test architecture]
- **Per wave merge:** Run the quick command and `rtk node router.calibrate.mjs`. [VERIFIED: calibration gate]
- **Phase gate:** Full serial suite, calibration CLI, Phase 27 performance gate, strict coverage rebuild, and installed-runtime dry-run all green before `$gsd-verify-work`. [VERIFIED: predecessor phase gates]

### Wave 0 Gaps

- [ ] `tests/router.mode-map-v3.test.mjs` — mixed parser, cap, malformed values, contains-only kind validation, canonical collision groups, raw-object leak checks.
- [ ] `tests/router.mode-map-curation.test.mjs` — 18 required positive routes, sibling hard negatives, synthetic manifest isolation, and missing-MCP warning-only behavior.
- [ ] `tests/router.calibration-thresholds.test.mjs` — fixture classification, constrained objective, no-wrong-high invariant, deterministic tie-break, and leave-one-out sensitivity.
- [ ] Export or add the smallest injectable seam needed for a mode-map plus manifest fixture without live global-state reads.
- [ ] Add Phase 29 labeled calibration fixtures before selecting threshold constants.

[ASSUMED]

Baseline verification completed during research: the focused Phase 28/route/performance command passed 29/29 tests, and `router.calibrate.mjs` exited 0 at 31/32 with the original 10 preserved at 10/10. [VERIFIED: local test execution]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No authentication boundary in this local data/parser phase. [VERIFIED: phase scope] |
| V3 Session Management | no | No session token changes. [VERIFIED: phase scope] |
| V4 Access Control | yes | Preserve scope filtering, deny rules, typed target validation, and warning-only missing-MCP agents. [VERIFIED: project constraints] |
| V5 Input Validation | yes | Normalize and validate schema version, pattern kind/value, cap, collision metadata, target arrays, and warning routes before use. [VERIFIED: input boundary] |
| V6 Cryptography | no | No new cryptographic operation; existing prompt hashing is unchanged. [VERIFIED: phase scope] |

### Known Threat Patterns for Node.js JSON Routing

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed pattern object changes routing or throws | Tampering / Denial of Service | Fail-open loader plus explicit shape/kind/value bounds. [VERIFIED: project policy] |
| Regex catastrophic backtracking | Denial of Service | Do not support regex in v3 unless separately bounded and justified. [VERIFIED: latency constraint] |
| Duplicate/overbroad patterns inflate unsafe confidence | Spoofing | Six-pattern cap, canonical collision lint, hard negatives, and wrong-high rejection. [VERIFIED: requirements] |
| Missing-MCP agent becomes dispatchable through a new entry | Elevation of Privilege | Existing manifest-derived blocked-agent indexes and validator/audit parity. [VERIFIED: codebase tests] |
| Secret-shaped pattern or proposal data leaks into telemetry/context | Information Disclosure | Reuse redaction/bounded sanitation and forbid deny-path signals. [VERIFIED: existing privacy fix and project constraints] |
| Live global manifest contaminates portable fixtures | Tampering | Temp/object injection with explicit fixture paths; assert isolation. [VERIFIED: MAP-03] |

## Sources

### Primary (HIGH confidence)

- `29-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` — phase scope, requirements, success criteria, and research flag. [VERIFIED: codebase grep]
- `/Users/guilherme/.claude/router/mode-map.json` — live schema, thresholds, entry count, cap violations, and collision. [VERIFIED: live file inspection]
- `/Users/guilherme/.claude/hooks/router.mjs` — parser, target validator, corpus construction, BM25 normalization, confidence tiers, guards, and inspect seam. [VERIFIED: codebase grep]
- `router.calibrate.mjs` and `calibration-tasks.json` — fixture taxonomy, pass threshold, dry-run behavior, and live 31/32 result. [VERIFIED: local execution]
- `coverage-report.json`, `src/coverage/audit.mjs`, and Phase 28 verification — current gap inventory and typed target semantics. [VERIFIED: codebase grep]
- `tests/router.route-targets.test.mjs`, `tests/router.coverage-audit.test.mjs`, and calibration/performance tests — established fixture and gate conventions. [VERIFIED: local execution]

### Secondary (MEDIUM confidence)

- https://scikit-learn.org/stable/modules/calibration.html — isotonic overfit risk on small samples and sigmoid assumptions. [CITED: official documentation]
- https://scikit-learn.org/1.9/modules/classification_threshold.html — separate score estimation from the decision rule; tune thresholds against an explicit metric with held-out/cross-validated evidence. [CITED: official documentation]

### Tertiary (LOW confidence)

- The contains-only v3 vocabulary, shared `collision_group`, exact eight-route lifecycle scope, object-injection seam, and safety-first deterministic threshold objective are resolved planner choices. Example output phrases remain evidence inputs to be confirmed by the Wave 0 and calibration fixtures.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — existing stdlib runtime and test framework were inspected and executed. [VERIFIED: local environment]
- Architecture: HIGH — all recommendations extend observed parser, corpus, validation, calibration, and audit seams. [VERIFIED: codebase grep]
- Threshold method: HIGH for rejecting isotonic/Platt now; MEDIUM for the exact grid objective and sensitivity tie-break until Phase 29 fixtures exist. [VERIFIED: corpus size and score behavior] [CITED: official documentation]
- Pattern vocabulary: HIGH — mixed DSL is locked and Phase 29 resolves the minimum vocabulary to existing `contains` semantics only.
- Pitfalls: HIGH — cap violations, duplicate patterns, global-state defaults, and heterogeneous calibration branches were observed directly. [VERIFIED: live inspection]

**Research date:** 2026-07-29  
**Valid until:** 2026-08-28 for architecture; rerun live inventory, collision scan, and calibration immediately before planning/execution because mode-map and manifest data are mutable. [VERIFIED: project runtime model]
