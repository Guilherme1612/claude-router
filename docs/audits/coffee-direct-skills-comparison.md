# Coffee Direct-Skills Redesign Comparison

**Audited:** 2026-08-02  
**Baseline:** `ca09318` (`v1.0`, autonomous milestone archive)  
**Redesign:** `c5f92e8` (`feat(ui): redesign cafe landing page`)  
**Method:** exact-commit `git show`/`git archive`, temporary clean builds, session-log provenance, and surviving screenshot inspection  
**Coffee mutations:** none

## Executive result

The direct-skills redesign is a **material visual improvement**, but only a partial product improvement.

- The asymmetric editorial hero, real phone action, stronger typography, navigation, and more varied section treatments raise the score from **14/24 to 17/24**.
- The redesign remains **not ready for final public acceptance** because address, directions, hours, café description, offerings, and real images remain unresolved at this commit.
- Build and test claims are durable and reproducible from the commit.
- Screenshot and detector claims are real but not durable release evidence: screenshots live only in `/tmp`, cover the first viewport, and the detector scanned only `index.astro` using a globally installed, unpinned script.
- The named skills were not used equally: Impeccable and UI/UX Pro Max were substantively invoked; Design Taste was only partially loaded and its final pre-flight was not run.

## Score comparison

| Pillar | `ca09318` | `c5f92e8` | Delta | Redesign finding |
| --- | ---: | ---: | ---: | --- |
| Copywriting | 2/4 | **3/4** | **+1** | Less repetitive hierarchy and a useful real-phone CTA, but still English and placeholder-heavy |
| Visuals | 2/4 | **3/4** | **+1** | Cohesive asymmetric hero and stronger identity; supplied real image still not used |
| Color | 3/4 | **3/4** | 0 | Excellent contrast and richer composition, but token/action roles drift from approved UI specs |
| Typography | 3/4 | **3/4** | 0 | Much stronger display hierarchy, offset by contract drift, tiny labels, and 700-weight proliferation |
| Spacing/responsiveness | 3/4 | **3/4** | 0 | Better rhythm and composition; exact breakpoints/scale changed and full reflow evidence is missing |
| Experience design | 1/4 | **2/4** | **+1** | Calling now works; most other core visitor tasks remain unavailable |

| Total | **14/24** | **17/24** | **+3** | **Material improvement, still blocked from final launch acceptance** |

The unchanged Color/Typography/Spacing scores do not mean no improvement occurred. The redesign looks substantially better, but it simultaneously diverges from the approved Phase 1/2 contracts without updating or re-approving them.

## Measured change

### Repository delta

`c5f92e8` landed as one commit 21 minutes 23 seconds after the archived baseline.

| Measure | Result |
| --- | ---: |
| Files changed | 6 |
| Insertions/deletions | +683 / -347 |
| New product-context file | `PRODUCT.md`, 32 lines |
| Page change | +109 / -95 lines |
| CSS change | +513 / -196 lines |
| Tests change | +28 / -45 lines |
| Baseline implementation CSS | 5,452 B built |
| Redesign implementation CSS | 10,049 B built, +84% |
| Baseline HTML | 2,942 B |
| Redesign HTML | 3,891 B, +32% |
| JavaScript | 0 B in both |
| Clean build time observed | 177ms baseline; 185ms redesign |
| Test result | 9/9 on both exact commits |

The redesign remains exceptionally small in absolute payload terms despite the CSS increase.

### Time and cost evidence

- User redesign prompt: 2026-08-02 18:50:34Z.
- Final response: 19:02:26Z.
- Recorded task duration: **711,661ms, or 11m51.7s**.
- Time to first token: 10.88s.
- Session counters increased by approximately 5.60M input tokens, of which 5.44M were cached, plus 26,160 output tokens and 9,912 reasoning-output tokens during the turn. These are cumulative runtime counters with repeated context, not a monetary invoice.
- **Monetary cost is not observable** in the session record; the account record only identifies a Plus plan and no credit balance.

## Named-skill provenance

The Coffee commit contains no skill-provenance artifact. Invocation was verified from the session log for the redesign turn, not inferred from the resulting style.

| Skill | Invocation verdict | Evidence | Fidelity |
| --- | --- | --- | --- |
| Impeccable | **Yes, substantive** | Read `SKILL.md`, ran `context.mjs`, followed `init.md`, created `PRODUCT.md`, read `brand.md` and `critique.md`, ran detector twice, inspected screenshots | Strong, though no durable critique/audit artifact was committed |
| UI/UX Pro Max | **Yes, substantive** | Read full 196-line skill; ran design-system search with café/hospitality parameters, UX search, and Astro stack guidance | Strong enough to count as invoked |
| Design Taste / `taste-skill` | **Partial only** | Read lines 1-240 and 220-420 of a 1,207-line skill | Incomplete: later anti-pattern rules and the mandatory final pre-flight were never read or executed |

The partial Design Taste invocation matters. The omitted sections contain checks that would have caught several final issues: repeated uppercase eyebrow labels, an em dash in metadata, tiny 10/11px labels, missing real imagery, and the absence of a completed pre-flight record.

## Claim durability

| Claimed evidence | Reproduced? | Durable? | Audit conclusion |
| --- | --- | --- | --- |
| Clean build | Yes | **Yes** | Exact archive builds successfully in 185ms with locked dependencies available |
| 9/9 tests | Yes | **Yes** | Exact archive passes; tests still have important state-coverage gaps |
| `git diff --check` | Yes | **Yes** | Commit-to-commit diff is clean |
| Impeccable detector clean | Yes, returned `[]` | **No** | Output is uncommitted, script is global/unpinned, and only `src/pages/index.astro` was scanned |
| Mobile screenshot | Yes, surviving `/tmp` file | **No** | 390x844, 41,161 B, SHA-256 `114be6d9...ae1a1e`; ephemeral and first-view only |
| Desktop screenshot | Yes, surviving `/tmp` files | **No** | 1440x900; final SHA-256 `9023ba1c...b9a6fa`; ephemeral and first-view only |
| Mobile/desktop visual inspection | Yes for hero/top viewport | **Partial** | Demonstrates a major hero improvement, not full-page, populated-state, keyboard, zoom, or screen-reader acceptance |

The screenshots were captured seconds before the commit and no implementation edit occurred afterward, so they are credible representations of `c5f92e8`. They are not durable release evidence because they are not stored with a manifest, commit hash, viewport metadata file, or review result.

## Detailed redesign audit

### Pillar 1: Copywriting (3/4)

**Improvements**

- A verified phone number now appears in the header, hero CTA, visit section, and footer, converting one core task into a real action (`src/data/cafe.ts:24-36`; `src/pages/index.astro:25-70,98-129,161-168`).
- The earlier repeated generic empty-state section is removed. `About Us`, `Plan your visit`, and `A look inside` give the page a clearer content structure (`src/pages/index.astro:75-158`).
- The footer note is shorter and less procedural.

**Remaining findings**

- **WARNING:** The page is still entirely English and uses `lang="en"` (`src/pages/index.astro:15`). The next user message explicitly requested Portuguese, confirming this was not accepted as final.
- **WARNING:** The meta description uses an em dash (`src/pages/index.astro:20`), violating Design Taste's zero-em-dash pre-flight rule that was never loaded.
- **WARNING:** The primary copy contract called for `Call the café`; the redesign instead exposes the raw phone in every CTA. That is functional, but it should be an intentional approved copy choice.
- **WARNING:** The phone appears as a literal in `src/pages/index.astro:68` as well as the content object. This breaks the single-source-of-truth rule and can create future divergence.
- **WARNING:** About, offer, address, hours, directions, and gallery copy still resolve to placeholders/empty state, so the page reads as a more polished scaffold rather than completed café content.

### Pillar 2: Visuals (3/4)

**Improvements**

- Desktop evidence shows a strong 50/50 hero with clear focal title, CTA, and art panel. It is far more distinctive than the baseline's single-column text stack.
- Mobile evidence preserves the café name, call action, directions state, address state, and brand art in a coherent single-column flow.
- The new wordmark, editorial serif, concentric graphic, rotated burgundy block, varied dark surfaces, and simplified information rows create recognizable visual identity.
- The About/Visit/Gallery sections no longer share one identical bordered-card layout.

**Remaining findings**

- **BLOCKER for user acceptance:** The hero uses hand-built CSS art instead of the image the user said had been supplied. The very next user message explicitly rejected this and asked for the real right-side image.
- **WARNING:** All surviving screenshots cover only the top viewport. No evidence shows About, Visit, Gallery, footer, populated gallery, or extremely long data states.
- **WARNING:** The gallery still contains no real café image. The result is visually stronger but still cannot meet the “quiet local café album” contract.
- **WARNING:** Five uppercase tracked label treatments appear across the hero, three sections, and footer (`global.css:184-195`), plus additional stamped art labels. This is precisely the repeated eyebrow rhythm the partially read Design Taste skill warns against.

### Pillar 3: Color (3/4)

**Improvements**

- The darker oxblood/ink composition is much more committed and visually confident than the baseline cream-dominant scaffold.
- All measured text pairs pass WCAG AA:

| Pair | Contrast |
| --- | ---: |
| Cream / deep burgundy | 12.07:1 |
| Cream-muted / deep burgundy | 7.52:1 |
| Gold / deep burgundy | 6.87:1 |
| Ink / gold CTA | 7.97:1 |
| Cream-muted / ink-soft | 7.60:1 |
| Unavailable 58% cream / deep burgundy | 4.94:1 |
| Footer note / burgundy | 4.94:1 |

**Remaining findings**

- **WARNING:** The redesign changes every core palette token from the approved UI specs and keeps gold as the primary CTA fill (`global.css:1-11,265-268`). The original contract reserved burgundy for the primary CTA and gold for detail/focus.
- **WARNING:** No updated `UI-SPEC.md` or `DESIGN.md` records the new token roles, so the result is visually coherent but contractually unapproved.
- **WARNING:** A 60/30/10 distribution still was not measured; screenshots only support a subjective first-view assessment.

### Pillar 4: Typography (3/4)

**Improvements**

- The Iowan/Baskerville display stack and Avenir/system body stack create a stronger editorial identity (`global.css:19-24`).
- Fluid 2.7-6rem display sizing, italic contrast, tighter heading measure, and more varied section scale improve hierarchy materially.
- `text-wrap: pretty` and explicit italic line-height improve wrapping over the baseline (`global.css:201-234`).

**Remaining findings**

- **WARNING:** The approved two-weight 400/600 system is replaced by pervasive 700-weight labels/actions. At least nine 700 declarations appear in the stylesheet.
- **WARNING:** Decorative labels drop to 10px and 11px (`global.css:302-305,377-386`), below UI/UX Pro Max's 12px floor and the original 14px label contract.
- **WARNING:** The `h1` letter spacing is `-0.045em` (`global.css:214-223`), slightly tighter than Impeccable's documented `-0.04em` floor.
- **WARNING:** The stronger type system is not documented in a durable design contract, leaving later contributors with contradictory Phase specs.

### Pillar 5: Spacing and responsiveness (3/4)

**Improvements**

- Spacing is more generous and varied, with a 96px large rhythm, split hero, two-column About section, and simpler information rows.
- The 390x844 screenshot shows a coherent mobile collapse; the 1440x900 screenshot shows a balanced desktop hero.
- Flex wrapping on the hero actions and intrinsic grids reduce CTA collision risk.

**Remaining findings**

- **WARNING:** Breakpoints change from the approved 768/1200px to 700/1100px, and the spacing scale changes from 4-64px to 8-96px (`global.css:12-18,620-660`) without an approved spec update.
- **WARNING:** `.site-nav__phone` sets `min-block-size: 40px` (`global.css:151-163`), overriding the global 44px anchor minimum and missing both WCAG-adjacent 44px guidance and the UI spec's 48px target.
- **WARNING:** `body { overflow-x: hidden; }` can conceal an overflow regression (`global.css:44-51`). The redesign session captured screenshots but did not record `scrollWidth === clientWidth` or a 200% zoom check.
- **WARNING:** No screenshot covers a short-height device, landscape view, 320px width, or the lower sections.

### Pillar 6: Experience design (2/4)

**Improvements**

- The user can now call the verified phone through native `tel:927605689` links in multiple high-intent locations.
- Navigation anchors provide direct Visit/About access on wider screens.
- Active, hover, focus, reduced-motion, empty-gallery, and unavailable-action treatments are present.
- The site remains no-JavaScript and extremely fast.

**Remaining findings**

- **BLOCKER:** Directions, address, hours, description, offerings, WhatsApp/social decisions, and gallery remain unresolved. The next user message confirmed address, hours, directions, removals, imagery, and Portuguese were still expected.
- **BLOCKER:** Availability validation remains weak (`src/pages/index.astro:5-11`). A single digit can become a phone/WhatsApp destination; map/social accept any string starting with `http`; whitespace handling remains incomplete.
- **WARNING:** Tests now hard-code `927 605 689` (`content-truth.test.mjs:41-46`; `static-build.test.mjs:28-97`) rather than exercising valid and invalid states. A legitimate phone update requires test editing, and malformed verified branches remain untested.
- **WARNING:** Static unavailable content and gallery fallback still use `role="status"` (`src/pages/index.astro:50,55,140`), creating live-region semantics for content that never dynamically changes.
- **WARNING:** Mobile navigation hides Visit/About entirely instead of providing a compact alternative. This is acceptable for a short page, but it was not explicitly tested with keyboard or screen reader.

## Accessibility and performance delta

### Accessibility

The redesign preserves strong contrast, semantic landmarks, a skip link, heading order, visible focus, reduced motion, descriptive text, and native call links. It improves active/hover feedback and visual emphasis.

It also introduces regressions or unverified areas: a 40px header call target, 10/11px decorative text, static live regions, no Portuguese/language decision, no screen-reader run, no 200% zoom evidence, and no full keyboard-order record. Accessibility remains **static-positive, runtime-incomplete**.

### Performance

Performance remains excellent. HTML and CSS grow by roughly 66% combined, but the full no-JavaScript payload is still about 14KB before transfer compression. The exact commit builds in 185ms. No external fonts, images, scripts, or framework hydration are introduced.

No Lighthouse trace or populated-image measurement exists, so LCP/CLS claims should wait until the real hero/gallery assets are integrated.

## Ranked remaining blockers

1. **Finish the owner-requested factual and locale pass.** Use the supplied real image, verified address, 07:00-20:00 hours, verified directions, remove unwanted WhatsApp/social fields, and translate the experience to Portuguese. Rebuild all metadata and accessible labels from the approved content object.
2. **Restore a single trusted content boundary and validate actions.** Remove the hard-coded phone from hero art, centralize verified facts, and add table-driven tests for empty, placeholder, malformed, and valid phone/map values.
3. **Create durable full-page browser evidence.** Store git-ignored screenshot hashes/manifest plus a committed review result covering 320/390/768/1440, short-height mobile, 200% zoom, keyboard, screen reader, reduced motion, all lower sections, and real populated assets.
4. **Reconcile the design contract.** Approve the new palette, type, 8-96px spacing, 700-weight usage, and 700/1100 breakpoints, or bring the implementation back to the existing UI specs.
5. **Fix accessibility details.** Raise the header phone target to at least 44px (prefer the contract's 48px), remove unnecessary `role=status`, avoid sub-12px meaningful text, and verify focus/reading order.
6. **Run Design Taste completely.** Read the full skill and execute its final pre-flight; specifically resolve eyebrow overuse, metadata em dash, missing real imagery, and detector blind spots.

## Final recommendation

`c5f92e8` should be treated as a successful **visual-direction correction**, not a final launch commit. It proves the named design tools can materially improve the interface quickly without adding runtime weight. The shortest path to acceptance is to preserve this visual direction, integrate the explicitly requested real content/assets, harden validation/tests, update the design contract, and capture durable full-page accessibility/browser evidence.
