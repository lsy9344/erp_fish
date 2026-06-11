# PRD Quality Review — ERP Fish PRD

## Overall verdict
Overall verdict: **adequate**. The PRD has a clear operating thesis, strong scope honesty, and enough concrete FR/CAP validation detail to support downstream UX, architecture, and story work after the declared gates close. It should not be treated as a final build-ready PRD yet because the document itself remains `draft`, the approved extension release boundary is still deferred to epic planning, and several extension CAPs depend on unresolved OQs.

## Decision-readiness — adequate
The PRD is unusually honest about its own state. §0.1 says the current document is "**draft**" and should not be viewed as "그대로 에픽/스토리 생성 가능한 최종 PRD" until G1~G5 close. The gate table names the real decision areas: release boundary, calculation policy, FIFO/inventory policy, permissions/audit contract, and report data contract.

§0.2 also gives a practical release baseline: MVP 필수, 승인 추가 구현, 계약/운영 별도, and 후순위/명시 제외. The MVP FR story-readiness table is especially useful because it separates story-ready FRs from OQ-blocked ones instead of hiding open decisions.

The remaining weakness is that the biggest schedule/scope choice is still outside the PRD. The approved extension range is acknowledged, but the actual deployment split is left to later epic planning.

### Findings
- **high** Approved extension release boundary is still not decision-ready (§0.2) — The PRD says CAP-1~CAP-18 are "승인 추가 구현" but also says "MVP와 같은 배포에 묶을지, 후속 배포로 뺄지는 에픽 계획에서 결정한다." That is honest, but it leaves a major approval decision outside the PRD. *Fix:* Add a CAP-level release target column such as `MVP same release`, `MVP+1`, `separate contract`, or `defer`, and connect any unknown target to G1 or a named OQ.

## Substance over theater — strong
The content is earned by the actual operating problem. The vision is not a generic ERP claim; it centers on the head office using the system as a daily control tower before the morning branch-manager meeting. The user journeys also do useful work: 김관리자, 현대 지점장, and 이스태프 each demonstrate a distinct operational path.

The NFRs and CAPs are mostly product-specific. §5 includes 10-ish branches, 3-second dashboard target, 390px mobile width, browser targets, backup/RPO/RTO minimums, and audit-log retention. CAP-6 goes beyond "upload Excel" and defines `.xlsx`, logical required fields, header mapping, preview/commit, duplicate keys, and upload states.

### Findings
- **low** CAP-12 has one furniture-like validation bullet (§8.6) — The bullet "향후 분석 가능한 구조로 저장한다" repeats the CAP intent after the prior bullets already list structured fields and memo/code separation. *Fix:* Replace it with a concrete extraction target, such as searchable/filterable fields for worker, branch, work date, signal type, and loss reason.

## Strategic coherence — adequate
The core thesis is coherent: replace OneDrive Excel with a web ERP that lets head office monitor all branch ledgers, detect risk, close books, and preserve corrections. FR-15~FR-17, FR-19~FR-21, and FR-27~FR-29 all serve that thesis directly.

The success metrics are better than activity counters. SM-1 measures morning-meeting readiness, SM-2 and SM-3 measure close/correction traceability, and SM-C1~SM-C5 name real counter-metrics such as not weakening validation just to speed up entry.

The thesis becomes less sharp in §8 because approved extension scope spans payroll reference, FIFO, upload, product analysis, monthly P&L, alerts, and AI-ready data structure. The phase table helps, but it does not yet explain why each phase is the next strategic step.

### Findings
- **medium** Extension phases lack explicit value/risk rationale (§8) — The CAP table orders Extension A through D, but it does not explain why 권한/통제 comes before 매입/재고, 직원/급여, and 리포트/알림, or what condition lets the team move to the next phase. *Fix:* Add one short phase goal and one exit condition per extension phase.
- **medium** Some extension success metrics are closer to feature checks than operating outcomes (§9) — SM-7 through SM-10 are verifiable, but they mostly say preview/commit exists, FIFO can be traced, sensitive fields are blocked, and report contracts exist. *Fix:* Add outcome signals where useful, such as upload rework rate, FIFO `확인 필요` rate, unauthorized sensitive export attempts, or manual report correction count.

## Done-ness clarity — adequate
Most MVP FRs have testable consequences. FR-3 defines audit fields and event types, FR-9 covers inventory carryover states, FR-19~FR-21 define close, correction, replacement, invalidation, and propagation states, and §4.3 gives calculation rules for currency units, decimal handling, ratio display, VAT scope, correction values, and FIFO transition.

The report section is also useful for story creation. §4.7 defines report columns, filters, export/chart expectations, and numerator/denominator rules for average sales, average inventory, inventory-to-sales ratio, deltas, closed days, unclosed days, and holidays.

The remaining done-ness gaps are concentrated in UI/extension requirements and security/account policy details.

### Findings
- **medium** Some UI completion criteria remain subjective (§4.4, §8.4) — FR-16 says 이상 신호 should be "눈에 띄게 표시된다," and CAP-18 says layout resizing should make data "보기 좋은 크기." These are understandable but not enough for consistent implementation. *Fix:* Add minimum rules for icon/text labeling, multiple-signal ordering, accessibility, resizable columns/areas, persistence, and min/max widths.
- **medium** CAP-14 cannot be story-ready until its core calculation policy closes (§8.4, §10) — CAP-14 defines loss as the gap between hoped-for sale price and actual handling amount, but OQ-9 still asks what to do when hoped-for price is missing or changed during business hours. *Fix:* Mark CAP-14 as blocked by OQ-9 in the CAP text and add versioning/apply-time rules once OQ-9 closes.
- **medium** Account lifecycle policy is pushed partly outside product acceptance (§4.1) — FR-1 says password reset, account deactivation, session expiry, and login failure limits "운영 설정 또는 운영 매뉴얼에 정의되어야 한다." For authentication, this leaves important behavior outside the product acceptance surface. *Fix:* Add minimum product rules for password reset flow, failed-login lockout/throttle, session expiry, and account deactivation effect.

## Scope honesty — strong
Scope honesty is a clear strength. §6 states MVP exclusions directly and §7.2 tells downstream workflows to use §6 as the MVP boundary. §8 then explains that some excluded items became approved extension scope, while §0.2 keeps MVP, approved extension, contract/ops, and deferred items separate.

Open Questions are not cosmetic. §10 gives each OQ a decision grade, impact range, and owner/recheck point. The PRD also avoids pretending assumptions are confirmed: §11 says there are no inline `[ASSUMPTION]` tags and that remaining decisions have been separated into Open Questions.

### Findings
- **medium** The OQ list is honest but still needs an execution order for closure (§10) — There are 18 OQs with mixed grades: story-before-MVP, epic-before-extension, implementation-check, deferred, and contract-before-operation. The table is accurate, but a PM still has to infer the next closure sequence. *Fix:* Add a short pre-table queue: `close before MVP story generation`, `close before extension epic`, `close during implementation setup`, and `close in contract`.

## Downstream usability — adequate
The document is mostly source-extract friendly. FR-1 through FR-29 are contiguous; UJ-1 through UJ-4 all have named protagonists; SM-1 through SM-11 and SM-C1 through SM-C5 are unique; OQ-1 through OQ-18 are contiguous; and CAP-1 through CAP-19 are all present. The glossary defines important domain nouns such as 장부 상태, 정정 반영값, 전일재고 후보, 확정 이월 기준, 업로드 매입, 당일 판매량, and 매출차액.

The strongest downstream aids are §4.3 calculation rules, §4.7 report contracts, and §8 CAP tracking. These give UX, architecture, and story writers stable anchors.

The main usability issue is that CAP order is domain/phase-based rather than numeric. That is valid, but it creates a small extraction risk for tools or reviewers expecting CAP IDs in numeric order.

### Findings
- **low** CAP definitions are complete but not easy to audit in numeric order (§8) — CAP definitions appear by domain grouping: CAP-1, CAP-9, CAP-5, CAP-6, CAP-7, CAP-8, CAP-4, CAP-13, and so on. The phase table helps, but a numeric index would make gap checks safer. *Fix:* Add a compact `CAP ID index` in numeric order with title and section anchor.
- **low** Brownfield traceability is preserved in addendum but not linked per FR (§4, addendum.md) — The addendum records source Excel/workflow observations, but individual FR clusters do not say which legacy sheet or workflow they replace. This is not blocking, but it may slow implementation discovery. *Fix:* Add one optional line per major FR cluster naming the replaced Excel workflow when it matters.

## Shape fit — strong
The PRD fits the product. ERP Fish is an internal brownfield operations tool, so a capability spec with heavy attention to permissions, audit, calculations, reports, and workflow states is the right shape. The document does not over-invest in personas or marketing-style differentiation.

The four UJs are enough to ground UX without turning the PRD into a consumer journey document. The addendum is also doing the right job: it preserves source observations and policy questions without crowding the main PRD.

### Findings
None.

## Mechanical notes
- FR IDs are contiguous: FR-1 through FR-29.
- CAP IDs are all present: CAP-1 through CAP-19, with CAP-19 correctly treated as contract/ops rather than an automatic product story.
- UJ IDs are contiguous: UJ-1 through UJ-4, and each UJ has a named protagonist.
- OQ IDs are contiguous: OQ-1 through OQ-18.
- SM IDs are contiguous: SM-1 through SM-11, plus counter-metrics SM-C1 through SM-C5.
- Assumptions Index is internally consistent: no inline `[ASSUMPTION]` tags were found, and §11 says remaining decisions live in §10.
- No `TODO`/`TBD` placeholders were found in the PRD text reviewed.
