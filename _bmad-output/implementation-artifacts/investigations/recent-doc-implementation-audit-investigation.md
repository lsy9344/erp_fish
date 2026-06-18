# Investigation: Recent Document Implementation Audit

## Hand-off Brief

1. **What happened.** Noah Lee requested an evidence-based audit of recent refactoring and feature addition/change documents against the current implementation.
2. **Where the case stands.** Concluded for the requested audit; five confirmed mismatches were recorded with document and code/status evidence.
3. **What's needed next.** Fix the sensitive-field, correction-overlay, report revalidation, automation-scope, and planning/status issues before resuming broad implementation.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-06-15 |
| Status           | Concluded |
| System           | Windows workspace `C:\Code\Project\erp_fish`, PowerShell, Git worktree with existing unrelated modifications |
| Evidence sources | Current worktree, Git history, planning artifacts, implementation story documents, source code, tests |

## Problem Statement

User request: "최근 리팩토링 및 기능 추가/수정 문서를 찾아 그대로 구현되어있는지 모두 검토하세요. 문서를 만들어 문제점을 찾아 기록하세요."

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Git status | Available | Existing modified/untracked planning and skill files found before this audit. |
| Recent Git history | Available | 2026-06-10/11 commits include readiness fixes, PRD validation artifacts, and story extraction gate documents. |
| Planning artifacts | Available | Recent readiness, sprint change, PRD reconciliation, and MVP story extraction documents are present. |
| Implementation story files | Available | Story files exist under `_bmad-output/implementation-artifacts`. |
| Source code and tests | Available | Next.js app, Prisma schema/migrations, unit tests, and E2E tests are present. |
| `project-context.md` | Missing | `rg --files -g project-context.md` returned no files. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Recent planning gate docs | High | Done | Approved/blocked slices were checked against story status and automation scope. |
| 2 | Recent implementation stories | High | Done | Story 2.9 and Epics 4~5 implementation stories were checked against code and tests. |
| 3 | Customer change/request docs | Medium | Done | Customer change items were classified as implementation, gated, or deferred at the requirement-candidate level. |
| 4 | Automated story-automator outputs | Medium | Done | Generated story range was checked against the approved G6 gate. |
| 5 | Runtime test evidence | Medium | Open | No unit/E2E commands were executed; runtime verification should accompany fixes. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-06-10 | Readiness fixes and ledger feature updates were committed. | `git log` / commit `649291d` | Confirmed |
| 2026-06-11 | MVP story extraction gate and PRD validation artifacts were committed. | `git log` / commits `614305f`, `539c0d6` | Confirmed |
| 2026-06-15 | Current audit started and this investigation file was created. | Current session | Confirmed |

## Confirmed Findings

### Finding 1: 지점장 검토 응답이 PRD의 민감 필드 차단 기준보다 넓게 노출된다.

**Evidence:** `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md:231`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md:242`, `_bmad-output/planning-artifacts/epics.md:485`, `_bmad-output/planning-artifacts/epics.md:487`, `src/features/ledger/response-shaping.ts:28`, `src/features/ledger/response-shaping.ts:29`, `src/features/ledger/components/review-summary-client.tsx:276`, `src/features/ledger/components/review-summary-client.tsx:282`, `tests/e2e/store-ledger-review.spec.ts:372`, `tests/e2e/store-ledger-review.spec.ts:375`

**Detail:** PRD와 epics는 지점장 화면/API에서 이익률과 재고금액을 기본 차단 필드로 둔다. 현재 store-manager review mapper는 `grossMarginRate`와 `inventoryAmount`를 남기고, 지점장 검토 화면과 E2E도 `이익률`, `재고금액` 표시를 기대한다.

### Finding 2: 매입 행 정정은 UI 대상에 있지만 shared correction overlay에서 적용되지 않는다.

**Evidence:** `_bmad-output/implementation-artifacts/4-3-본사가-마감된-장부에-정정-기록을-추가한다.md:34`, `_bmad-output/implementation-artifacts/4-3-본사가-마감된-장부에-정정-기록을-추가한다.md:37`, `src/app/app/ledgers/[ledgerId]/page.tsx:454`, `src/app/app/ledgers/[ledgerId]/page.tsx:455`, `src/server/calculations/ledger.ts:429`, `src/server/calculations/ledger.ts:437`, `src/server/calculations/ledger.ts:475`, `src/server/calculations/ledger.ts:485`, `src/server/calculations/ledger.ts:495`

**Detail:** Story 4.3은 정정 대상 유형에 결제/비용/매입/재고/손실 행을 포함한다고 요구한다. UI는 `PURCHASE_ROW` 금액 정정 대상을 만든다. 하지만 `applySingleCorrection()`은 `PAYMENT_FIELD`, `EXPENSE_ROW`, `LEDGER_FIELD`, `INVENTORY_ROW`, `LOSS_ROW`만 처리하고 나머지는 `unapplied`로 돌린다.

### Finding 3: 기간 비교 리포트 freshness 요구와 revalidation 경로가 맞지 않는다.

**Evidence:** `_bmad-output/implementation-artifacts/5-3-본사가-선택-기간의-지점별-실적을-비교한다.md:103`, `_bmad-output/implementation-artifacts/5-3-본사가-선택-기간의-지점별-실적을-비교한다.md:105`, `src/features/ledger/actions.ts:47`, `src/features/ledger/actions.ts:50`, `src/features/ledger/actions.ts:51`, `src/features/ledger/hq-edit-actions.ts:66`, `src/features/ledger/hq-edit-actions.ts:72`, `src/features/ledger/hq-edit-actions.ts:73`, `src/features/inventory/actions.ts:64`, `src/features/inventory/actions.ts:67`, `src/features/inventory/actions.ts:68`, `src/features/losses/actions.ts:44`, `src/features/losses/actions.ts:49`, `src/features/losses/actions.ts:50`, `src/features/ledger/hq-close-actions.ts:47`, `src/features/ledger/hq-close-actions.ts:50`, `src/features/ledger/hq-close-actions.ts:51`, `_bmad-output/implementation-artifacts/5-4-본사가-월간-지점별-마감과-이상-현황을-본다.md:120`

**Detail:** Story 5.3 says comparison report freshness must be preserved and correction creation should revalidate `/app/reports/comparison`. Current general ledger save, HQ edit, inventory, losses, and close paths revalidate daily/monthly reports but not comparison. Story 5.4 already records this as deferred/pre-existing.

### Finding 4: Story extraction automation includes discovery/policy tracks that the gate says must not become implementation work.

**Evidence:** `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md:10`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md:21`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/mvp-story-extraction-checklist.md:52`, `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-11.md:350`, `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-11.md:358`, `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-11.md:420`, `_bmad-output/planning-artifacts/implementation-readiness-report-2026-06-11.md:438`, `_bmad-output/story-automator/preflight-1-20260611T075952Z.md:6`, `_bmad-output/story-automator/preflight-1-20260611T075952Z.md:8`, `_bmad-output/story-automator/orchestration-1-20260611-080819.md:5`, `_bmad-output/story-automator/orchestration-1-20260611-080819.md:90`, `_bmad-output/story-automator/orchestration-1-20260611-080819.md:105`

**Detail:** The approved G6 checklist allows implementation story extraction only for MVP-S01~MVP-S03 and keeps MVP-S04~MVP-S10 as discovery/policy work. The story automator selected 49 stories, including Epic 7 and Epic 8 discovery/policy tracks. It is currently paused/pending, but resuming as-is risks treating policy work as product build work.

### Finding 5: Approved readiness dependency changes are only partly reflected in planning/status artifacts.

**Evidence:** `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:151`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:160`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:328`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:361`, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-10-readiness-dependency-fixes.md:366`, `_bmad-output/planning-artifacts/epics.md:689`, `_bmad-output/implementation-artifacts/sprint-status.yaml:54`, `_bmad-output/implementation-artifacts/sprint-status.yaml:56`, `_bmad-output/implementation-artifacts/1-1-스타터-템플릿으로-초기-프로젝트를-설정하고-본사-업무-공간에-로그인한다.md:7`

**Detail:** The approved change proposal requires a separate Story 2.4a before Story 2.5 and sprint-status updates. Current epics go from Story 2.2 to Story 2.5 without separate 2.4a, and sprint-status shows the new structure as backlog while many old implementation story files are already `done`.

## Deduced Conclusions

### Deduction 1: The current implementation is not aligned enough to resume broad automation safely.

**Based on:** Finding 4 and Finding 5.

**Reasoning:** The approved gate narrows implementation work to selected slices, while the automator selected the full 49-story range and sprint-status does not reconcile old done story files with the new backlog structure.

**Conclusion:** Before resuming story automation, the selected story range and status mapping should be corrected.

### Deduction 2: Store-manager sensitive-field blocking is implemented as a partial patch, not the current PRD baseline.

**Based on:** Finding 1.

**Reasoning:** Story 2.9 removed several named metrics, but the later PRD/epics baseline explicitly includes `이익률` and `재고금액` among blocked store-manager fields.

**Conclusion:** Story 2.9 should be reopened or superseded by a follow-up acceptance check against the current OQ-10A baseline.

### Deduction 3: Correction support is wider in UI/documentation than in calculation application.

**Based on:** Finding 2.

**Reasoning:** The UI allows purchase row correction, but the shared calculation overlay ignores that target type. Any downstream dashboard/report using the overlay cannot reflect those corrections as the user would expect.

**Conclusion:** Either purchase row corrections should be applied in the overlay or removed/marked unsupported in the correction target UI until implemented.

## Hypothesized Paths

### Hypothesis 1: Recent documents include both implementation-ready slices and explicitly blocked discovery/policy slices.

**Status:** Confirmed

**Theory:** Some recent documents are not meant to be implemented as product code yet; the audit must distinguish missing implementation from intentionally blocked work.

**Supporting indicators:** Initial document scan found approved story extraction rules and readiness caveats.

**Would confirm:** Exact document citations showing allowed and blocked slices, plus sprint/story state evidence.

**Would refute:** Evidence that all recent document items were approved for immediate implementation.

**Resolution:** Confirmed by the G6 checklist and 2026-06-11 readiness report. MVP-S01~MVP-S03 are implementation-eligible; MVP-S04~MVP-S10 and Epic 7~8 policy tracks are not broad product build work yet.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Current test results | Runtime behavior was not executed during this audit. | Run focused unit/E2E checks if fixes are attempted. |
| OQ-10A approved matrix artifact | Cannot fully settle the final sensitive-field matrix. | Create/approve the OQ-10A allowed/blocked field matrix. Current PRD baseline is `draft baseline`. |
| Story old-to-new mapping | Current `done` story files and new `sprint-status.yaml` backlog entries do not map cleanly. | Produce a migration table from old story files to new story IDs/statuses. |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | N/A; this is an implementation audit, not a runtime defect report. |
| Trigger | User requested recent document-to-implementation verification. |
| Condition | Recent planning and implementation artifacts may have diverged from current code/status. |
| Related files | `_bmad-output/planning-artifacts/**`, `_bmad-output/implementation-artifacts/**`, `src/**`, `tests/**`, `prisma/**` |

## Conclusion

**Confidence:** High for the confirmed mismatches; Medium for runtime impact of cache freshness.

The recent documents are not fully implemented as written. Several foundations are in place, but the audit found concrete mismatches in sensitive-field response shaping, purchase-row correction application, comparison report freshness, story automation scope, and planning/status synchronization.

## Recommended Next Steps

### Fix direction

1. Reconcile OQ-10A/CAP-13 baseline with Story 2.9 and remove `grossMarginRate`/`inventoryAmount` from store-manager review responses if the current PRD baseline remains authoritative.
2. Add `PURCHASE_ROW` handling to `applySingleCorrection()` or remove purchase-row correction options until supported.
3. Add `/app/reports/comparison` revalidation to ledger, HQ edit, inventory, losses, and close paths that affect comparison data.
4. Restrict story-automator scope before resuming and map old done implementation stories to the new sprint-status structure.
5. Add the approved Story 2.4a or an equivalent explicit monthly-opening-snapshot story/status entry before Story 2.5.

### Diagnostic

Run focused checks after fixes:

- `pnpm test:unit -- tests/unit/ledger-review.test.mjs tests/unit/ledger-correction-calculations.test.mjs tests/unit/hq-reports.test.mjs`
- `pnpm test:e2e -- tests/e2e/store-ledger-review.spec.ts tests/e2e/hq-reports.spec.ts`
- A runtime scenario that saves a `PURCHASE_ROW` correction and verifies dashboard/daily/comparison/monthly report values.

## Reproduction Plan

For this audit, reproduction means re-running the document discovery and source/test mapping commands recorded in the final findings. Runtime repro was not executed.

## Side Findings

- `python3` failed in this Windows environment while `python` and `py -3` resolved Python 3.11.9. The investigation workflow configuration was resolved with `python`.
- `project-context.md` was not found in the repository even though the BMad investigation workflow lists it as a persistent fact source.

## Follow-up: 2026-06-15

### New Evidence

- Recent candidate documents include `docs/meeting/change.md`, 2026-06-08 brief artifacts, 2026-06-10 sprint change proposals, 2026-06-10/11 readiness reports, PRD validation/reconciliation documents, the approved MVP story extraction checklist, story-automator outputs, and implementation stories for Story 2.9 and Epics 4~5.
- Three parallel read-only subagent reviews returned aligned findings: planning gate scope risk, sensitive-field mismatch, story/status mismatch, purchase-row correction gap, and comparison report freshness gap.

### Additional Findings

- See Confirmed Findings 1~5.

### Updated Hypotheses

- Hypothesis 1 is confirmed.

### Backlog Changes

- Backlog item 1: Done.
- Backlog item 2: Done for Story 2.9 and Epics 4~5, with remaining broader implementation stories outside this audit's high-risk recent scope.
- Backlog item 3: Done at requirement-candidate level; many customer change items are intentionally discovery/deferred.
- Backlog item 4: Done.
- Backlog item 5: Open for runtime tests; no test commands were executed in this audit.

### Updated Conclusion

The audit found real mismatches and recorded them above. The requested review document is now usable as a hand-off report for fixes and planning cleanup.
