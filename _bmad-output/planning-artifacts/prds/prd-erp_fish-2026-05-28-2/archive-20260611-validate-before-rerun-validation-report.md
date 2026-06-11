# Validation Report — ERP Fish PRD

- **PRD:** `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md`
- **Rubric:** `C:\Code\Project\erp_fish\.agents\skills\bmad-prd\assets\prd-validation-checklist.md`
- **Run at:** 2026-06-10T18:15:00+09:00
- **Grade:** Poor

## Overall verdict

루브릭 리뷰는 PRD를 **adequate**로 보았습니다. 운영 thesis, scope honesty, FR/CAP 구조는 강하지만, 문서가 아직 draft이고 구현 게이트가 닫히지 않았으며 승인 추가 구현의 릴리스 경계가 확정되지 않았습니다.

추가 비판 리뷰는 **critical 3건**을 제기했습니다. 특히 민감 지표 숨김의 MVP/Extension 충돌, story-readiness와 OQ 영향표의 불일치, approved extension의 릴리스 경계 부재는 에픽/스토리 생성 전에 먼저 닫아야 합니다.

## Dimension verdicts
- Decision-readiness — adequate
- Substance over theater — strong
- Strategic coherence — adequate
- Done-ness clarity — adequate
- Scope honesty — strong
- Downstream usability — adequate
- Shape fit — strong

## Findings by severity

### Critical (3)
**[Critical] Sensitive metric hiding conflicts between MVP security and Extension scope** (§0.2, §4.1, §8.4, §10)
The base permission model blocks sensitive metrics, while CAP-13 places sensitive metric hiding in approved extension scope and OQ-10 is still open. This can expose cost/profit data through dashboards, reports, exports, caches, or APIs.
Fix: Split CAP-13 into an MVP mandatory server-side exposure baseline and an extension enhancement for configurable masking/audits.

**[Critical] The story-readiness table undercounts blocking Open Questions** (§0.2, §4.3, §10)
FR-13 is marked mainly against OQ-2, but OQ-7, OQ-9, OQ-10, and OQ-14 also affect calculation or exposure.
Fix: Regenerate story readiness from the full OQ impact matrix and split FR-13 into story-ready and blocked metric slices.

**[Critical] Approved extension is not a release boundary** (§0.2, §8)
Approved additional implementation sounds committed, while deployment timing is left undecided. This affects estimates, contracts, UX, data model choices, and story slicing.
Fix: Bucket every CAP as MVP same release, prerequisite, post-MVP committed, optional, blocked, or contract/ops only.

### High (6)
**[High] FRs still grant broad HQ user powers** (§4.1, §4.5)
The permission section splits HQ profiles, but FR-18 and FR-19 still use broad HQ user wording for force-edit and close actions.
Fix: Add an action-level permission matrix and replace broad wording with allowed profiles or mutation rights.

**[High] Closing policy lacks a hard-stop matrix** (§4.5, §8.4)
Serious data quality failures are mostly treated as overrideable with a reason. Some conditions should be hard stops.
Fix: Define closeability by condition, individual close, bulk close, override permission, and required audit fields.

**[High] Concurrent editing is underspecified** (§3.1, §4.5, §5, CAP-16)
Branch managers and HQ can both edit before close, but conflict detection and merge behavior are not defined enough for UX/API design.
Fix: Define edit tokens, conflict unit, compare/resolve UX, HQ force-edit locking, stale session behavior, and partial-save merge rules.

**[High] MVP cost/profit calculations are not product-safe enough** (§4.3, §10)
The PRD separates MVP operating values from FIFO final values but does not fully define MVP price basis and missing-price behavior.
Fix: Define unit price source priority, missing-price behavior, display/hide rules, and closeability when price basis is unresolved.

**[High] Upload idempotency can merge distinct purchase rows** (§8.2)
Branch/date/item/quantity/price style keys can collapse legitimate duplicate rows or duplicate corrected rows.
Fix: Use layered row identity: batch, sheet, row number, document/supplier keys, mapping id, and hash as a secondary duplicate signal.

**[High] Backup and recovery targets are too weak** (§1, §5)
A daily meeting and ledger system with 1-business-day RPO/RTO can lose important close, correction, and upload work.
Fix: Set stronger product minimums for database RPO, business-hour RTO, immutable audit retention, uploaded source retention, and restore drill acceptance.

### Medium (10)
**[Medium] Author name can conflict with login and audit identity** (§4.1, §8.4)
A free-form 작성자 이름 can be mistaken for the accountable authenticated actor.
Fix: Separate authenticated account, displayed author name, and actual input person, and state that author name never replaces audit actor.

**[Medium] External alert messages can leak sensitive data** (§8.6, §8.4)
LINE/Telegram alerts leave the ERP permission boundary, but the PRD secures tokens more than message content.
Fix: Add allowed fields by recipient, masking, branch/HQ templates, group restrictions, template approval, and cautious log retention.

**[Medium] Employee/payroll reference scope has privacy risk** (§8.1, §10)
Reference-only employee/payroll data still includes personal and compensation-adjacent information.
Fix: Add field-level access, branch visibility, export rules, inactive employee handling, and retention/deletion policy.

**[Medium] Master data effective-date rules are incomplete** (§4.6, §8.2)
Changed item mappings or default prices can unexpectedly affect drafts, uploads, reports, or old corrections.
Fix: Define effective dating per master type and upload mapping precedence after preview.

**[Medium] Strategic coherence: Extension phases lack explicit value/risk rationale** (§8)
Extension A-D are ordered, but the PRD does not say why each phase comes next or what condition allows the next phase to start.
Fix: Add one phase goal and one exit condition per extension phase.

**[Medium] Strategic coherence: Some extension success metrics are feature checks** (§9)
SM-7 through SM-10 verify that capabilities exist, but say less about operating outcomes.
Fix: Add signals like upload rework rate, FIFO review rate, sensitive export attempts, or manual report correction count.

**[Medium] Done-ness clarity: Some UI completion criteria remain subjective** (§4.4, §8.4)
Phrases such as visually noticeable and good-looking size are not stable acceptance criteria.
Fix: Define icon/text rules, ordering, accessibility, persistence, and min/max layout bounds.

**[Medium] Done-ness clarity: CAP-14 depends on unresolved loss calculation policy** (§8.4, §10)
Desired sale price is central to loss calculation, but OQ-9 still asks what to do when it is missing or changed during business hours.
Fix: Mark CAP-14 as blocked by OQ-9 and add lock/version/apply-time rules once closed.

**[Medium] Done-ness clarity: Account lifecycle policy is partly outside acceptance** (§4.1)
Password reset, deactivation, session expiry, and failed-login limits are pushed into settings or manuals.
Fix: Add minimum product rules for reset flow, failed-login throttling, session expiry, and deactivation effects.

**[Medium] Scope honesty: The OQ list needs an execution order for closure** (§10)
There are 18 OQs across story-before-MVP, epic-before-extension, implementation-check, deferred, and contract-before-operation grades.
Fix: Add a short queue before the table: close before MVP stories, before extension epics, during setup, and in contract.

### Low (5)
**[Low] Technical terms may need operator-facing wording** (전체)
Terms like mutation, commit, rollback, idempotency, and cache may be unclear to PM/HQ approvers.
Fix: Add a short technical glossary or paired wording on first use.

**[Low] Excel-level language can widen expectations** (§8.5)
Excel level can imply layout, formulas, charts, and export shape parity beyond intended server-calculation parity.
Fix: Replace with explicit matched report fields and excluded Excel behaviors.

**[Low] Substance over theater: CAP-12 has one vague validation bullet** (§8.6)
The phrase about saving data in an analysis-ready structure repeats the CAP intent after structured fields are already listed.
Fix: Replace it with concrete extraction/search targets such as worker, branch, work date, signal type, and loss reason.

**[Low] Downstream usability: CAP definitions are complete but not easy to audit in numeric order** (§8)
CAPs appear by domain grouping rather than numeric order.
Fix: Add a compact numeric CAP ID index with title and section anchor.

**[Low] Downstream usability: Brownfield traceability is preserved but not linked per FR** (§4, addendum.md)
The addendum records source Excel/workflow observations, but FR clusters do not always say which legacy workflow they replace.
Fix: Add optional source workflow notes per major FR cluster where useful.

## Mechanical notes
- FR IDs are contiguous: FR-1 through FR-29.
- CAP IDs are all present: CAP-1 through CAP-19, with CAP-19 treated as contract/ops.
- UJ IDs are contiguous: UJ-1 through UJ-4, each with a named protagonist.
- OQ IDs are contiguous: OQ-1 through OQ-18.
- SM IDs are contiguous: SM-1 through SM-11, plus counter-metrics SM-C1 through SM-C5.
- No inline [ASSUMPTION] tags were found; §11 points remaining decisions to §10.
- No TODO/TBD placeholders were found in the reviewed PRD.

## Reviewer files
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-rubric.md`
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-adversarial-general.md`
