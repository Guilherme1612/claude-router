---
phase: 25
slug: advisory-stewardship-and-guarded-drafts
status: approved
shadcn_initialized: false
preset: none
created: 2026-07-28
---

# Phase 25 — UI Design Contract

Terminal-only interaction contract for the single `/router suggestion` surface. No web UI, dashboard, timeline, or persistent visual shell.

---

## Design System

- Reuse the existing canonical `router-control` JSON envelope and reason-code vocabulary.
- Default output is text-safe, screen-reader-safe, and usable without color, icons, cursor control, or terminal-width detection.
- Startup notification is one non-blocking line. Detailed output is available only on explicit suggestion inspection.
- Exactly one primary suggestion may be displayed.

---

## Spacing Scale

| Token | Terminal Use |
|---|---|
| 0 | No decorative padding inside machine-readable JSON. |
| 1 line | Separate summary, evidence, and action groups in human-readable rendering. |
| 2 lines | Maximum separation before a guarded draft preview. |

No box drawing, tables wider than 80 columns, indentation deeper than two levels, or decorative whitespace.

---

## Typography

- Plain UTF-8 text; meaning must not depend on font weight, italics, or color.
- Stable identifiers, paths, reason codes, and confirmation tokens render verbatim.
- Headings use short sentence case.
- Confidence is integer basis points and risk is a bounded token, not prose-only emphasis.

---

## Color

- No required color.
- Status is conveyed by canonical fields and reason codes.
- If a caller adds ANSI styling, `NO_COLOR` and non-TTY output must remain clean and semantically identical.

---

## Copywriting Contract

| Element | Copy |
|---|---|
| Startup pointer | `Router suggestion available — inspect with /router suggestion` |
| Empty state heading | `No actionable suggestion` |
| Empty state body | `Router found no novel, high-confidence action that passes the current policy.` |
| Detail heading | `Top suggestion` |
| Dismiss action | `Suggestion dismissed` |
| Snooze action | `Suggestion snoozed until {timestamp}` |
| Correction action | `Correction proposal saved; routing unchanged` |
| Draft approval prompt | `Approve draft creation only; this will not install or publish anything.` |
| Draft preview warning | `Preview only — no capability or routing files were changed.` |
| Error state | `{reason_code}; inspect local health state and retry.` |

---

## Interaction States

| State | Required Output |
|---|---|
| silent startup | No bytes emitted. |
| startup pointer | One line only; no evidence dump. |
| empty detail | Canonical success envelope with `suggestion_none`. |
| suggestion detail | One ranked suggestion, compact health overview, evidence, confidence, affected IDs, benefit, risk, and safe next step. |
| dismissed | Fingerprint and local dismissal result; no policy mutation. |
| snoozed | Fingerprint and bounded expiry; no policy mutation. |
| corrected | Versioned local correction proposal; no policy mutation. |
| draft proposed | Approval requirement and preview scope only. |
| draft preview | Exact paths, semantic changes, dependencies, conflicts, route effects, verification, rollback implications, and non-publication warning. |
| stale approval | Fail closed with a stable reason code and require a fresh preview. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|---|---|---|
| Existing Router CLI | canonical response envelope, exit codes, preview/confirmation pattern | Exact tests for response shape and no-mutation behavior |
| UI component registries | none | not applicable |

No third-party UI dependency or generated component is allowed.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS — terminal-only, bounded output states
- [x] Dimension 3 Color: PASS — color-independent
- [x] Dimension 4 Typography: PASS — plain text and stable tokens
- [x] Dimension 5 Spacing: PASS — bounded terminal layout
- [x] Dimension 6 Registry Safety: PASS — no external UI registry

**Approval:** approved 2026-07-28
