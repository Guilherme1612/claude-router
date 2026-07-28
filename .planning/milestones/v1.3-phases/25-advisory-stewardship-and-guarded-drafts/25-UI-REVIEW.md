# Phase 25 — UI Review

**Audited:** 2026-07-28
**Baseline:** `25-UI-SPEC.md` and accepted `25-CONTEXT.md`
**Screenshots:** not captured (terminal-only surface; CLI output and tests audited)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Approved success, empty, approval, preview, and startup copy is exact; human-readable errors omit the required recovery sentence. |
| 2. Visuals | 2/4 | The one-suggestion hierarchy exists, but the text renderer collapses the complete suggestion or draft into dense JSON lines. |
| 3. Color | 4/4 | Meaning is carried by fields, reason codes, and copy with no ANSI or color dependency. |
| 4. Typography | 4/4 | Plain UTF-8, verbatim stable tokens, integer basis points, and bounded risk tokens match the contract. |
| 5. Spacing | 2/4 | The renderer supplies no blank-line grouping and can emit a 425-character suggestion line. |
| 6. Experience Design | 3/4 | All guarded states and authority boundaries are implemented, but the human-readable renderer and recovery copy lack direct regression coverage. |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **Render suggestion and draft fields as bounded grouped lines** — the current 425-character JSON line is difficult to scan and defeats the specified summary/evidence/action hierarchy — give overview, evidence, and action their own shallow sections in `renderSuggestionText`.
2. **Implement the contracted human-readable error copy** — users currently receive only `REASON {reason_code}` with no recovery direction — render `{reason_code}; inspect local health state and retry.` for failed suggestion results.
3. **Add text-renderer contract tests** — JSON behavior is well covered while the shipped text path is not invoked — test empty, detail, action, proposal, approved preview, stale/error, `NO_COLOR`, non-TTY, line grouping, and duplicate-warning behavior.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- **WARNING:** Failed suggestion commands return canonical reason codes at `src/cli/router-control.mjs:805`, `src/cli/router-control.mjs:859`, and `src/cli/router-control.mjs:968`, but `renderSuggestionText` falls back to `REASON {reason_code}` at `src/cli/router-control.mjs:553`. This does not implement the contracted error state, `{reason_code}; inspect local health state and retry.`
- Exact empty-state heading/body and `Top suggestion` copy are implemented at `src/cli/router-control.mjs:842-853` and asserted at `tests/router.steward-cli.test.mjs:70-85`.
- Dismiss, snooze, and correction copy is exact at `src/cli/router-control.mjs:925-958` and asserted at `tests/router.steward-cli.test.mjs:110-133`.
- Approval-only and preview-only warnings are exact constants at `src/steward/draft.mjs:12-13` and are asserted at `tests/router.steward-cli.test.mjs:161-207`.
- The startup pointer is the exact approved one-line copy at `src/context/prompt-route.mjs:8`; silence and available states are asserted at `tests/router.steward-startup.test.mjs:267-288`.

### Pillar 2: Visuals (2/4)

- **WARNING:** The detail renderer serializes the complete nested suggestion as one JSON value at `src/cli/router-control.mjs:555-557`. A representative valid suggestion rendered as three lines with a 425-character `SUGGESTION` line, so evidence, confidence, risk, benefit, and next action do not form a scannable hierarchy.
- **WARNING:** Action results have no action heading. The renderer begins with `REASON ...`, alphabetically emits fingerprint and interaction payloads, and places the primary `MESSAGE` later (`src/cli/router-control.mjs:551-560`, `src/cli/router-control.mjs:925-958`).
- The structural hierarchy is otherwise correctly bounded: one selected suggestion object is projected at `src/steward/suggestion.mjs:142-160`, and rejected alternatives are not exposed (`tests/router.steward-cli.test.mjs:54-88`).
- No dashboard, timeline, finding dump, list, install, publish, or maintenance action exists below the suggestion family; the allowlist is at `src/cli/router-control.mjs:800-805` and forbidden actions are asserted at `tests/router.steward-cli.test.mjs:216-223`.

### Pillar 3: Color (4/4)

- The suggestion renderer emits plain text only and contains no ANSI styling (`src/cli/router-control.mjs:551-560`).
- Status and meaning remain explicit through `ok`, `reason_code`, data fields, warning tokens, and stable exit codes rather than color (`src/cli/router-control.mjs:44-45`, `src/cli/router-control.mjs:800-972`).
- The same canonical envelope drives JSON and text, so non-TTY output does not lose semantics. No third-party styling or terminal-color dependency was added.

### Pillar 4: Typography (4/4)

- Headings are short sentence case (`No actionable suggestion`, `Top suggestion`) at `src/cli/router-control.mjs:845-852`.
- Stable fingerprints, paths, reason codes, approval tokens, and warnings are emitted verbatim by the canonical projection and renderer (`src/cli/router-control.mjs:551-560`, `src/cli/router-control.mjs:889-915`).
- Confidence remains integer basis points and risk remains an allowlisted bounded token in the selected detail (`src/steward/suggestion.mjs:149-159`).
- Meaning does not rely on weight, italics, icons, cursor control, or font features.

### Pillar 5: Spacing (2/4)

- **WARNING:** `renderSuggestionText` joins every field with a single newline and inserts no blank separator between summary, evidence, and action groups (`src/cli/router-control.mjs:551-560`), contrary to the contract's one-line group separation.
- **WARNING:** Nested values are compact-JSON serialized onto one physical line (`src/cli/router-control.mjs:557`). The measured valid detail reached 425 characters on one line; a complete approved draft preview can be longer.
- **WARNING:** A draft proposal carries the same approval warning in both `data.warning` and the envelope `warnings` array (`src/cli/router-control.mjs:889-895`). The text renderer prints both, duplicating the warning and consuming terminal space (`src/cli/router-control.mjs:555-559`).
- Indentation remains shallow and there is no box drawing or decorative whitespace.

### Pillar 6: Experience Design (3/4)

- Inspect, empty, dismiss, snooze, correct, proposal, approval, preview, stale fingerprint, malformed input, and forbidden-action states are implemented in one strict command family (`src/cli/router-control.mjs:800-972`).
- Draft creation is proposal-first and exact-approval-gated; only successful approval exposes the complete preview and `draft_file_only` authority (`src/cli/router-control.mjs:872-919`, `src/steward/draft.mjs:190-245`).
- The complete approved preview contains paths, changes, dependencies, conflicts, route effects, verification, reversibility, rollback implications, and the non-publication warning (`src/steward/draft.mjs:160-171`).
- Canonical machine-readable envelopes are stable and explicitly tested for the suggestion surface at `tests/router.steward-cli.test.mjs:64-88`.
- **WARNING:** No test calls `renderSuggestionText`; the focused suite validates result objects and startup projection, not the default human-readable CLI output. That gap allowed the long-line hierarchy, missing error sentence, absent group spacing, and duplicated draft warning to pass.
- Focused verification passed: 46/46 tests across steward suggestion/state/draft/CLI/startup plus adjacent router-control.

---

## Registry Safety

Registry audit: no `components.json`, no third-party UI registries, and no UI component blocks are used.

---

## Files Audited

- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-CONTEXT.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-UI-SPEC.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-01-PLAN.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-01-SUMMARY.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-02-PLAN.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-02-SUMMARY.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-03-PLAN.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-03-SUMMARY.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-04-PLAN.md`
- `.planning/phases/25-advisory-stewardship-and-guarded-drafts/25-04-SUMMARY.md`
- `src/cli/router-control.mjs`
- `src/context/prompt-route.mjs`
- `src/steward/suggestion.mjs`
- `src/steward/state.mjs`
- `src/steward/draft.mjs`
- `src/steward/refresh.mjs`
- `src/steward/startup-pointer.mjs`
- `tests/router.steward-suggestion.test.mjs`
- `tests/router.steward-state.test.mjs`
- `tests/router.steward-draft.test.mjs`
- `tests/router.steward-cli.test.mjs`
- `tests/router.steward-startup.test.mjs`
- `tests/router.control-cli.test.mjs`
