# Adversarial PRD Review: ERP Fish

Review target: `prd.md`  
Also considered: `addendum.md`, `.decision-log.md`  
Review style: skeptical PRD review focused on missing, weak, or risky content.

## Overall Risk Picture

The PRD has a useful operating vision, but it is not implementation-ready as a "final" product definition. The biggest problem is that the document mixes three different baselines: original MVP, 2026-06-10 added scope, and future/contractual work. Some excluded features are later reintroduced as added scope without a delivery boundary, priority, dependency model, or acceptance depth. Core financial and inventory behavior is still unresolved in open questions, yet those same behaviors are referenced by success metrics, dashboards, reports, alerts, and permission rules.

The result is a deceptively complete document: it lists many features, but several are too underspecified to build, estimate, test, or sequence safely. The implementation team would be forced to make product decisions inside stories or code.

## Findings

### P0-1. "Final" status is misleading while critical product decisions remain unresolved

The PRD frontmatter marks the document as `status: "final"`, but §10 still contains unresolved decisions that directly affect MVP behavior: 매출차액 기준, `30%단가`, 품목/규격 분리, 이월/이카운트/FIFO policy, 지점장 마진율, and `차이` versus `당일 판매량`. Several are marked "스토리 작성 전 필수" or "Epic 구현 전 필수", which means the PRD is not final for downstream story writing.

Why this matters: "final" will give architecture and story authors false confidence. They will either block later or silently invent policy.

Expected correction: downgrade the document status or split unresolved items into explicit pre-implementation gates with owner, due date, and affected FR/CAP references.

### P0-2. MVP scope and added scope contradict each other instead of forming a clean roadmap

§6 excludes 텔레그램 알림, 이카운트 연동, 설날 비교, 직원 마스터, 월간 근무일수, 상세 근태, and related items. §8 then adds LINE/텔레그램 알림, 이카운트 업로드, 특수기간 리포트, 직원 마스터, 근무일수, 급여 참고 자료, 월 손익, and FIFO. The PRD says §8 is "MVP 이후 추가 범위", but it does not define whether §8 is release 1.1, contracted scope, same delivery, optional backlog, or estimate-only scope.

Why this matters: teams cannot protect MVP scope, estimate delivery, or decide which acceptance criteria block launch.

Expected correction: create a release matrix: MVP required, post-MVP committed, post-MVP candidate, excluded. Each FR/CAP must map to exactly one release.

### P0-3. Financial calculation rules are not strong enough for an ERP

§4.3 defines formulas for 매출원가, 매출이익, 이익률, 영업이익, 인당생산성, 재고금액, 평균재고, 평균매출, 매출대비 재고비율, 최고매출품목, and 매출차액. However, it does not define rounding, negative values, zero denominator behavior, tax/VAT handling, currency precision, whether costs are tax-inclusive, whether returns/refunds exist, how corrections recalculate historical reports, or how basic MVP calculations coexist with FIFO later.

Why this matters: dashboards and reports will disagree, and reconciliation against Excel or accounting expectations will fail.

Expected correction: add a calculation specification with examples, edge cases, precision/rounding rules, and canonical server-side ownership for every KPI.

### P0-4. Inventory carryover policy still has dangerous gaps

FR-9 says the next business day's 전일재고 uses the prior saved 장부 as a candidate and later uses the prior closed 장부 as the confirmed basis. This does not cover skipped days, holidays, reopening a closed day via correction, retroactive edits before close, multiple saves on the same day, month boundary behavior after the 월초 스냅샷, or what happens when yesterday remains 입력 중 for several days.

Why this matters: inventory is a core product promise. Ambiguous carryover will corrupt downstream stock, margin, loss, and purchasing views.

Expected correction: specify the state machine and examples for normal day, holiday, missing prior day, late close, correction after close, and month transition.

### P1-1. The PRD leaves permissions too coarse for a multi-role ERP

The PRD only defines broad "본사 사용자" and "지점장" roles. It does not distinguish 대표, 본사 관리자, 본사 스텝, read-only users, uploader, closer, settings admin, or emergency override roles. Yet it grants powerful abilities: direct branch data edits, close, correction, 기준값 changes, master management, upload, and batch close.

Why this matters: least-privilege design cannot be implemented from this. A staff user could accidentally receive authority to change financial settings or close all branches.

Expected correction: add a permission matrix by action, screen, API/mutation, and data scope.

### P1-2. Batch close is underspecified and risky

CAP-15 allows 본사 to skip review and close in bulk with only a "risk alert" and audit log. The PRD does not define eligible states, whether 장부 with validation errors can be closed, whether missing/휴무 days are included, whether partial failures roll back, whether a dry-run summary is required, or whether the user must provide a reason.

Why this matters: batch close can permanently lock wrong original records and push errors into reports.

Expected correction: define batch close eligibility, preflight validation, confirmation summary, partial failure handling, rollback/non-rollback policy, and required audit fields.

### P1-3. Correction records are too vague to protect auditability

FR-20/FR-21 say corrections are added after close and reports use corrected values. The PRD does not define whether corrections are additive deltas or replacement values, whether multiple corrections on the same field are ordered, whether corrections can be voided, how correction history appears in exports/reports, who can create them, or whether correction requires reason/category/approval.

Why this matters: "do not modify original" is not enough. Poor correction modeling can still destroy trust in reported numbers.

Expected correction: define correction semantics, lifecycle, permissions, ordering, display, and report calculation rules.

### P1-4. Audit log requirements are not testable enough

The PRD repeatedly says changes must be logged and human-readable, but it does not define the audit event taxonomy, required fields per event type, retention, exportability, filter/search behavior, or whether logs are immutable. "운영자가 이해할 수 있는 텍스트" is useful, but insufficient.

Why this matters: audit logs are part of the trust model and should not be improvised per feature.

Expected correction: add a shared audit log contract with event types for create, edit, close, correction, upload, 기준값 change, permission change, and batch close.

### P1-5. Upload-driven purchasing lacks file contract and failure policy

CAP-6 introduces 이카운트 Excel upload, parsing, mapping, manual 단가 edits, and audit logs. It does not define supported file versions, required columns, duplicate upload detection, idempotency, re-upload behavior, partial parse failure behavior, timezone/date mapping, branch/date matching rules, or how uploaded lines interact with manually entered purchase lines.

Why this matters: Excel import is brittle by nature. Without a file contract, the first format variation becomes a product incident.

Expected correction: add an upload contract, validation rules, duplicate policy, preview/commit flow, rollback policy, and sample accepted/rejected cases.

### P1-6. Manual branch purchase input conflicts with upload-as-default policy

FR-8 says both 지점장 and 본사 can enter purchase information. CAP-6 later says uploaded/head-office purchase lines are default and branch managers can usually only view them, with emergency input left as an open question. This is a direct product behavior conflict.

Why this matters: implementation could expose branch purchase editing in MVP and then need to remove or special-case it for the added scope.

Expected correction: define one current policy per release: branch editable, branch read-only, or branch emergency-only with explicit approval/audit flow.

### P1-7. Sensitive metric hiding is incomplete and internally inconsistent

CAP-13 hides 매출원가, 매출이익, 인당생산성, and 영업이익 from branch managers, but then says branch screens should show "매출 마진율" and "재고 금액". A margin rate can reveal the same economics as hidden profit/cost metrics, and stock value may reveal cost basis. FR-13 and reports also calculate these metrics globally without stating role-filtered variants.

Why this matters: the stated business reason is to prevent misunderstanding of sensitive accounting numbers, but the remaining visible fields may leak the same information.

Expected correction: define exactly which derived metrics and source fields are visible per role, including API response filtering and export/report access.

### P1-8. Success metrics are not measurable success metrics

§9 calls several items "success metrics", but they are mostly feature-completion checks. There is no target time for morning review, no acceptable dashboard latency beyond the nonfunctional 3-second target, no percentage of branches submitted before meeting, no data quality threshold, no reduction in Excel use, no adoption metric, and no operational error rate.

Why this matters: the product can ship every listed feature and still fail the business goal.

Expected correction: define measurable operational outcomes: meeting-prep time, branch submission rate by cutoff, correction frequency, Excel fallback rate, unresolved anomaly count, and report generation time.

### P1-9. Morning meeting workflow lacks cutoff and freshness rules

The vision depends on a daily morning meeting, but the PRD does not define branch submission deadline, meeting cutoff time, which date is default at 8 AM, how late submissions are flagged, whether today's or yesterday's ledger is expected, or how stale data is highlighted.

Why this matters: the dashboard can technically show data while still being useless for the actual morning meeting.

Expected correction: specify operational timing: close-of-business branch entry, morning review date logic, late/missing indicators, and freshness labels.

### P1-10. Reporting requirements are broad but not tied to report layouts or data contracts

FR-27 through FR-29 and CAP-2/CAP-3/CAP-4/CAP-10 describe many reports, but not the required columns, filters, grouping, exports, sort behavior, chart types, period comparison rules, or how unclosed/corrected/holiday records affect aggregates.

Why this matters: "existing Excel level" is not an acceptance criterion. Different implementers will build different reports.

Expected correction: provide report specs with required fields, filters, aggregation rules, and examples for one day, period comparison, month summary, special period, product analysis, and monthly P&L.

### P2-1. Authentication requirements omit basic security controls

FR-1 mentions login and initial master accounts, but it does not define password policy, reset flow, session timeout, failed login handling, account lock/disable, MFA decision, password storage expectations, or who can rotate master credentials.

Why this matters: this is an internal ERP with financial and personnel data. Minimal auth detail is not enough.

Expected correction: add baseline authentication and account lifecycle requirements.

### P2-2. Nonfunctional requirements are thin for real operations

§5 has a 3-second dashboard target for about 10 branches, but no availability target, backup/restore, disaster recovery, browser support, mobile performance target, upload size limits, concurrency behavior, retention policy, monitoring, or logging requirements.

Why this matters: CAP-19 pushes operations to a contract, but the product still needs system behaviors that architecture can design against.

Expected correction: add operational NFRs with measurable targets and separate contract terms from product runtime requirements.

### P2-3. Data migration is deferred without protecting reporting expectations

The PRD excludes historical Excel migration from MVP, while reports and comparisons imply periods, monthly summaries, year/month analysis, special periods, and trend detection. OQ-5 leaves migration as post-launch, but does not state what reports should show before enough new data exists.

Why this matters: first-month reports may be sparse or misleading, and year-over-year features cannot work without historical data.

Expected correction: define pre-migration behavior, "insufficient data" states, and whether any minimal seed/import is required for launch.

### P2-4. Mobile 7-step input is accepted too loosely

FR-5 says the 7-step input flow must work on a 390px mobile screen, but it does not define offline/poor network behavior, autosave, validation timing, unsaved change warnings, step completion rules, error recovery, or whether file uploads and large inventory tables are mobile-supported.

Why this matters: the PRD frames mobile as a PC-failure fallback, so the failure mode matters.

Expected correction: define mobile workflow acceptance criteria, including save behavior, validation, navigation, and recovery.

### P2-5. Employee and payroll scope is structurally unclear

§2.3 says 일반 직원 are not login users and FR-12 excludes employee master and detailed attendance from first scope. §8 later adds employee master, multi-branch work, entry date, lateness, early leave, special attendance memo, salary difference, and monthly payroll reference. The PRD does not define whether employees are master data only, whether branch managers can create/edit them, how duplicate employee names are handled, or how payroll-sensitive data is permissioned.

Why this matters: personnel data can become as sensitive as financial data, and the current scope boundary is unstable.

Expected correction: define employee data ownership, permissions, identifiers, duplicate handling, privacy expectations, and release boundary.

### P2-6. Alerting scope lacks alert fatigue controls

CAP-11 defines scheduled LINE/Telegram alerts with risk items, but omits recipient management, opt-in/opt-out, per-alert thresholds, suppression windows, duplicate prevention, escalation, message preview, and test-send behavior.

Why this matters: a noisy or misdirected operational alert system will be ignored or leak sensitive business data.

Expected correction: define alert configuration, recipients, delivery control, suppression, testing, and security rules.

### P2-7. "AI expansion" data structure requirement is too vague to be actionable

CAP-12 says important operational data must not be buried only in text memo and should be stored for future analysis. It does not list which fields must be structured, which can remain free text, what taxonomy is required, or how this affects current forms.

Why this matters: this requirement sounds prudent but gives no buildable contract. It can also silently expand form complexity.

Expected correction: define structured fields for special notes, work assignment, abnormal events, and any tags needed for future analysis.

### P2-8. Master data lifecycle is incomplete

FR-22 through FR-26 cover basic master management but omit uniqueness rules, effective dates, merge/de-duplicate behavior, aliases, code ordering, deletion policy, and how master changes affect future versus past ledger entries.

Why this matters: item, branch, user, and code masters are foundational. Weak lifecycle rules create reporting fragmentation.

Expected correction: add lifecycle rules for create, edit, deactivate, merge, alias, effective date, and historical display.

### P3-1. "Existing Excel level" is an unsafe shorthand

CAP-3 says reports should reach existing Excel level and verify matching between Excel fields and new report fields. The addendum explicitly says Excel formulas were not validated. The PRD therefore references Excel as a target without proving the target is correct.

Why this matters: the team may reproduce hidden spreadsheet assumptions that the discovery process intentionally avoided validating.

Expected correction: replace "Excel level" with explicit report requirements and separately document any Excel parity checks as examples, not authority.

### P3-2. Terminology mixes Korean business terms with implementation terms

The document uses terms such as shared server calculation, mutation, trace, candidate, popup, and API response alongside Korean operations terminology. This is not fatal, but it weakens clarity for business reviewers and can hide implementation assumptions in a PRD.

Why this matters: PRD readers include PM, UX, and operations stakeholders, not only developers.

Expected correction: either define technical terms in the glossary or rewrite them in business-facing language.

## Severity Summary

- P0: 4
- P1: 10
- P2: 8
- P3: 2
- Total: 24 findings
