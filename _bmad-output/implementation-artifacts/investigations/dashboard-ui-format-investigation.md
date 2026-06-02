# Investigation: Dashboard UI Format Not Followed

## Hand-off Brief

1. **What happened.** The implemented dashboard follows parts of the initial UI/UX mockup concept, but it does not reproduce `key-dashboard.html` visually or structurally.
2. **Where the case stands.** Concluded; story and architecture evidence show implementation followed shadcn/Tailwind story instructions and UX spine rules rather than copying the static HTML mockup.
3. **What's needed next.** Decide whether to realign the current UI to the mockup as a new implementation story, especially tokens, table density, sidebar styling, and dashboard row affordances.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-06-03 |
| Status           | Concluded |
| System           | Windows, PowerShell, project `erp_fish` |
| Evidence sources | User-provided mockup path, source code, version control, BMAD artifacts |

## Problem Statement

User asked why the project was designed without following the UI/UX format created at project start:
`_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/mockups/key-dashboard.html`.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| User-provided mockup path | Available | Stronghold for intended UI/UX format. |
| `project-context.md` persistent facts | Missing | `rg --files -g "project-context.md"` returned no results. |
| `_bmad/bmm/config.yaml` | Available | Confirms output folders and Korean communication language. |
| Source code | Available | Dashboard route and components mapped. |
| Version control | Available | Dashboard implementation commits identified. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Read the dashboard mockup and extract key layout/style requirements | High | Done | Mockup has fixed browser frame, sidebar, header, summary cards, dense table, badges, and signal chips. |
| 2 | Locate implemented dashboard/page components | High | Done | Route and dashboard components mapped. |
| 3 | Search planning/story artifacts for references to the mockup | High | Done | Stories reference EXPERIENCE/DESIGN rules, not direct HTML reproduction. |
| 4 | Review git history around dashboard implementation | Medium | Done | Dashboard came in Story 1.1 shell and Story 3.x dashboard commits. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-05-28 | BMAD module generated planning/output structure | `_bmad/bmm/config.yaml` | Confirmed |
| 2026-05-29 | Initial app shell and token implementation added | git commit `66cce2e` | Confirmed |
| 2026-05-31 | HQ dashboard implementation added | git commit `0b43835` | Confirmed |
| 2026-06-01 | HQ anomaly signal workflows expanded dashboard UI | git commit `b1fc916` | Confirmed |

## Confirmed Findings

### Finding 1: The mockup is a static visual reference, not a direct source dependency

**Evidence:** `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/mockups/key-dashboard.html:1`

**Detail:** The mockup is a standalone HTML file with embedded CSS and a browser-frame presentation. Source search found no implementation import or direct reference to `key-dashboard.html` in the dashboard source.

### Finding 2: The UX spine explicitly outranks mockups

**Evidence:** `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md:27`

**Detail:** The UX document says that if the spine conflicts with mockups/wireframes, the spine wins. This makes the mockup a reference, not the sole final implementation contract.

### Finding 3: Architecture and design docs pushed implementation toward shadcn primitives

**Evidence:** `_bmad-output/planning-artifacts/architecture.md:223`, `_bmad-output/planning-artifacts/architecture.md:235`, `_bmad-output/planning-artifacts/architecture.md:469`, `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/DESIGN.md:190`

**Detail:** The architecture says to use shadcn/ui first and calls custom styled primitives that duplicate shadcn an anti-pattern. DESIGN.md also says ERP Fish uses shadcn components unchanged.

### Finding 4: Story 3.1 directed the dashboard to use shadcn Table and responsive cards

**Evidence:** `_bmad-output/implementation-artifacts/3-1-본사가-전체-지점-장부-상태를-관제판에서-본다.md:84`, `_bmad-output/implementation-artifacts/3-1-본사가-전체-지점-장부-상태를-관제판에서-본다.md:152`

**Detail:** Story instructions allowed a desktop shadcn Table and mobile card/simple table rather than a pixel copy of the mockup.

### Finding 5: Later stories explicitly reused existing dashboard components instead of new mockup-named components

**Evidence:** `_bmad-output/implementation-artifacts/3-4-본사가-재고-손실-이상-신호를-본다.md:51`, `_bmad-output/implementation-artifacts/3-5-본사가-회의-전에-문제-지점을-빠르게-추적한다.md:79`

**Detail:** Story 3.4 and 3.5 both instruct reuse of `DashboardSignalSummary` and `DashboardStatusBadge`, not a new `SignalChip` copied from the mockup.

### Finding 6: Current implementation partially matches the information structure but differs in visual density and layout

**Evidence:** `src/app/app/dashboard/page.tsx:193`, `src/features/dashboard/components/hq-dashboard-table.tsx:67`, `src/features/dashboard/components/hq-dashboard-table.tsx:72`, `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/mockups/key-dashboard.html:289`, `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/mockups/key-dashboard.html:319`

**Detail:** Both have summary cards and a branch table, but current implementation has more operational columns and shadcn shell behavior.

### Finding 7: Brand token implementation does not exactly match DESIGN.md's hex token

**Evidence:** `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/DESIGN.md:14`, `src/styles/globals.css:63`, git blame commit `66cce2e`

**Detail:** DESIGN.md defines primary as `#2563EB`, but current CSS uses `oklch(0.45 0.13 194)`. This likely contributes to the visual mismatch.

## Deduced Conclusions

### Deduction 1: The drift came from implementation instructions, not from a missing dashboard component alone

**Based on:** Findings 2, 3, 4, and 5

**Reasoning:** The implementation stories and architecture repeatedly prioritized shadcn primitives, responsive behavior, feature scope, and component reuse. Those instructions naturally move the UI away from the static HTML/CSS mockup.

**Conclusion:** The mismatch is mostly a process/spec interpretation issue: story execution treated the mockup as a conceptual reference and implemented the UX spine with shadcn patterns.

### Deduction 2: Some mismatch is still an implementation defect against DESIGN.md

**Based on:** Finding 7

**Reasoning:** DESIGN.md has explicit token values, and current CSS does not match the primary hex value. This is not just allowed reinterpretation; it is a concrete token mismatch unless the OKLCH value was intentionally chosen as an equivalent replacement.

**Conclusion:** A cleanup story should align tokens and selected visual details if the mockup look is expected.

## Hypothesized Paths

### Hypothesis 1: Implementation did not reference the initial dashboard mockup

**Status:** Confirmed

**Theory:** The actual dashboard implementation may have been built from source code defaults, a later story, or another artifact rather than the initial mockup.

**Supporting indicators:** User observed mismatch; source/story evidence not yet inspected.

**Would confirm:** No implementation/story references to `key-dashboard.html` or its distinctive classes/layout/content.

**Would refute:** Direct references or clear visual/style matches in implementation artifacts.

**Resolution:** Source search and story evidence show the implemented dashboard follows Story 3.x and shadcn instructions rather than direct `key-dashboard.html` reproduction.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Exact implemented dashboard file(s) | Resolved | `src/app/app/dashboard/page.tsx`, `src/features/dashboard/components/hq-dashboard-table.tsx`, `dashboard-status-badge.tsx`, `dashboard-signal-summary.tsx`, `src/components/headquarters-shell.tsx`, `src/components/app-sidebar.tsx`. |
| Story or prompt that produced implementation | Resolved | Story 1.1 and Story 3.1-3.5. |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | Spec interpretation and token mismatch |
| Trigger | User comparison request |
| Condition | Mockup exists; actual UI reportedly differs |
| Related files | `src/app/app/dashboard/page.tsx`, `src/features/dashboard/components/hq-dashboard-table.tsx`, `src/features/dashboard/components/dashboard-signal-summary.tsx`, `src/features/dashboard/components/dashboard-status-badge.tsx`, `src/styles/globals.css` |

## Conclusion

**Confidence:** High

The dashboard was not implemented as a direct reproduction of `key-dashboard.html` because the implementation stories and architecture favored shadcn primitives, domain composition components, and UX spine rules. The current UI keeps some structural concepts from the mockup, but visual density, sidebar treatment, table columns, interaction model, and token values drifted. One concrete implementation mismatch is the primary token value in `globals.css`.

## Recommended Next Steps

### Fix direction

Create a dedicated UI alignment story if the desired target is the initial mockup look. Focus scope on design tokens, sidebar/header density, summary card styling, dashboard table columns/density, row hover/click affordance, and signal/status chip styling.

### Diagnostic

No further diagnostic work is needed to explain the cause. Visual regression screenshots would be useful before and after any realignment work.

## Reproduction Plan

Open the mockup and implemented app dashboard, then compare layout, navigation, visual tokens, and page structure.

## Side Findings

- `project-context.md` was not found by `rg --files -g "project-context.md"`.

## Follow-up: 2026-06-03

### New Evidence

- `bmad-ux` defines `DESIGN.md` and `EXPERIENCE.md` as peer contracts and states both spines win on conflict with any mock, wireframe, or import. Evidence: `.agents/skills/bmad-ux/SKILL.md`.
- Initial UX commit `7f2014b` added `DESIGN.md`, `EXPERIENCE.md`, and the three key mockups together.
- Later commit `26af582` modified `DESIGN.md`, `EXPERIENCE.md`, `.decision-log.md`, and `epics.md`, but did not add improved/v2 mockups. It added `.working/*` files and modified only `mockups/key-inventory.html`.
- Current `EXPERIENCE.md` references `mockups/improved-key-dashboard.html` and `mockups/v2-key-dashboard.html`, but those files do not exist.
- `epics.md` includes UX-DR46: key mockups are references, and Experience Spine wins when mockups conflict with the spine.
- Story 3.1 links UX guardrails to `EXPERIENCE.md#Component-Patterns` and `DESIGN.md#Typography`, not to `mockups/key-dashboard.html`.

### Additional Findings

### Finding 8: UX markdown was updated after initial mockup generation without regenerating all referenced mockups

**Evidence:** git diff `7f2014b..26af582`, `EXPERIENCE.md:10-15`, and missing `mockups/improved-key-dashboard.html` / `mockups/v2-key-dashboard.html`

**Detail:** The UX markdown was expanded to reference improved/v2 mockups and newer decisions, but the corresponding files are absent. This is the direct evidence for mockup-to-MD divergence.

### Finding 9: The story generation path did connect to UX artifacts, but through selective spine sections

**Evidence:** `.agents/skills/bmad-create-story/SKILL.md:82-85`, `3-1-본사가-전체-지점-장부-상태를-관제판에서-본다.md:149-156`, `3-1-...md:219-224`

**Detail:** Create-story is configured to load UX with `SELECTIVE_LOAD`; the created story cites `EXPERIENCE.md` and `DESIGN.md` sections. It does not cite the dashboard mockup as a required visual implementation target.

### Finding 10: Epics explicitly converted mockups into reference-only artifacts

**Evidence:** `_bmad-output/planning-artifacts/epics.md:232`

**Detail:** UX-DR46 says key mockups are references and Experience Spine wins on conflict. This rule was then inherited by story creation.

### Updated Hypotheses

### Hypothesis 2: BMAD UX update finalized the spine but skipped or failed the mock regeneration/promote step

**Status:** Confirmed enough for planning

**Theory:** A later UX update captured new decisions and wrote them into `.decision-log.md`, `DESIGN.md`, and `EXPERIENCE.md`, but did not produce/promote matching improved/v2 mockup files.

**Supporting indicators:** `EXPERIENCE.md` references missing improved/v2 mockups; commit `26af582` updates markdown without adding those mockups.

**Would confirm:** A session log showing `bmad-ux Update` ended before "Key-screen mocks rendered" or generated files outside this folder.

**Would refute:** Existing improved/v2 files in another folder with later movement omitted from git.

**Resolution:** The repository state confirms the artifact set is internally inconsistent, regardless of whether the step was skipped, failed, or not committed.

### Hypothesis 3: Story creation ignored UX

**Status:** Refuted

**Theory:** Story files were not linked to UX planning artifacts at all.

**Supporting indicators:** Implemented UI drifted from mockup.

**Would confirm:** No story references to UX artifacts.

**Would refute:** Story references to UX artifacts.

**Resolution:** Refuted. Story 3.1 cites UX guardrails from `EXPERIENCE.md` and `DESIGN.md`; it simply did not use the mockup as a visual source of truth.

### Backlog Changes

- Add a validation item: detect mockup paths listed in `EXPERIENCE.md` that do not exist.
- Add a story-generation rule: when a story is UI-facing and a mockup exists, include the mockup path and explicit "visual target" criteria, or explicitly mark it as reference-only.
- Add a UX finalization rule: after updating `DESIGN.md` / `EXPERIENCE.md`, regenerate or retire stale mockups.

### Updated Conclusion

Root cause is two-layered:

1. UX artifact divergence: initial mockups were generated/promoted, then markdown spines and decision log were updated later without producing all matching updated mockups. This left `EXPERIENCE.md` describing improved/v2 mockups that are not present.
2. Story handoff semantics: BMAD did link stories to UX, but the pipeline treats `DESIGN.md` / `EXPERIENCE.md` as the canonical implementation contracts and mockups as references. Epics reinforced this with UX-DR46. Therefore dashboard stories inherited behavioral/spine rules, not the static dashboard HTML as a visual target.
