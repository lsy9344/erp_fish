# Adversarial PRD Review: ERP Fish

검토 대상: `prd.md`
함께 검토한 문서: `addendum.md`, `.decision-log.md`
검토 관점: 제품 리스크, 누락 요구사항, 모호한 acceptance boundary, downstream UX/architecture/story churn, scope contradiction

## Verdict

**조건부 보류: 현재 PRD는 discovery와 정책 정리용 draft로는 유용하지만, 그대로 에픽/스토리 생성 또는 구현 착수 기준으로 쓰기에는 아직 위험하다.**

이번 버전은 이전 리뷰의 큰 구멍 몇 개를 실제로 메웠다. `draft` 상태, 구현 게이트, 릴리스 기준선, 계산 공통 규칙, 리포트 최소 계약, 업로드 상태 모델, 정정 전파 상태 전이는 긍정적이다.

하지만 문서가 안전해졌다는 뜻은 아니다. 가장 큰 문제는 **MVP 필수 기능, 승인 추가 구현, 권한/민감 지표 통제, Open Question 차단 범위가 서로 겹쳐 있다는 점**이다. 지금 상태로 story extraction을 돌리면 일부 팀은 "MVP 필수"만 보고 구현하고, 다른 팀은 "OQ 차단" 또는 "Extension"을 보고 멈출 가능성이 높다. 그 결과 제품 정책이 코드 작성 중에 결정될 것이다.

## Severity Summary

- Critical: 3
- High: 6
- Medium: 7
- Low: 2
- Total: 18 findings

## Critical Findings

### C1. 민감 지표 숨김이 MVP 보안 기준인지 Extension 기능인지 충돌한다

**Location / quote**

- PRD §0.2 lines 36-37: `MVP 필수 | FR-1~FR-29... 기본 리포트`; `승인 추가 구현 | CAP-1~CAP-18... 민감 지표 숨김`
- PRD §4.1 line 168: 지점장은 `민감 지표... 차단`
- PRD §8.4 lines 843-859: `CAP-13: 지점장 민감 회계 지표 숨김`
- PRD §10 line 1034: OQ-10 asks what margin, inventory amount, and cost-derived indicators branch managers may see.

**Risk**

The PRD says sensitive metric hiding is an approved extension, but the base permission model already blocks sensitive metrics for branch managers. At the same time, MVP FR-13/FR-28/FR-29 require metrics such as 매출원가, 매출이익, 영업이익, 인당생산성. This is a security and scope contradiction, not a minor sequencing issue.

If CAP-13 is deferred, the MVP can still expose sensitive values through dashboards, exports, report links, cache payloads, or API responses unless a minimum masking contract is implemented in MVP. If CAP-13 is required for MVP safety, it should not sit only in "MVP 이후 승인된 추가 구현 범위."

**Remediation**

Split CAP-13 into two layers:

- **MVP mandatory security baseline:** server-side denylist/allowlist for branch manager responses, exports, report links, and cached data.
- **Extension enhancement:** configurable exposure policy, advanced masking, audit reports, and owner-level review.

Then update §0.2 and §8 so FR-13/FR-28/FR-29 cannot be implemented without the MVP security baseline. Also add OQ-10 to the MVP story readiness table for any FR that can expose sensitive derived values.

### C2. The story-readiness table undercounts blocking Open Questions

**Location / quote**

- PRD §0.2 lines 43-50: MVP story readiness only names OQ-1, OQ-2, OQ-3.
- PRD §10 lines 1031-1034: OQ-7, OQ-9, and OQ-10 also impact FR-13; OQ-14 impacts FR-9/FR-13.
- PRD §4.3 lines 383-390: FR-13 calculates cost, profit, productivity, average inventory, inventory ratio, best-selling product, and discrepancy metrics.

**Risk**

The table says FR-13 is blocked only by OQ-2, but §10 says FR-13 is also affected by FIFO applicability, desired-sale-price loss policy, sensitive indicator exposure, and `차이` to `당일 판매량` semantics. The document has two competing dependency models: the story-readiness table and the OQ impact table.

Downstream story generation will likely trust §0.2 and create implementation stories for FR-13 too early. That will force engineers to invent interim rules for cost, margin, inventory amount, and exposed fields.

**Remediation**

Generate the story-readiness table from the full OQ impact matrix, not only OQ-1~OQ-3. At minimum:

- Mark FR-13 as split into story-ready submetrics and blocked submetrics.
- Add OQ-7, OQ-9, OQ-10, and OQ-14 to the affected FR rows where they alter calculation or exposure.
- For each FR, specify which slice can proceed before policy closure and which slice must become a discovery story.

### C3. "Approved extension" is not a release boundary, so committed scope remains ambiguous

**Location / quote**

- PRD §0.2 line 37: CAP-1~CAP-18 are "승인 추가 구현" but `MVP와 같은 배포에 묶을지, 후속 배포로 뺄지는 에픽 계획에서 결정한다`.
- PRD §8 lines 706-728: CAPs are grouped into Extension A-D, but the table does not say which phase is committed to the first release, separately contracted, or blocked by unresolved policy.

**Risk**

"Approved additional implementation" sounds like committed scope, while "deployment to be decided during epic planning" sounds undecided. That ambiguity will affect estimates, contract expectations, UX design, data model choices, and story slicing.

The risk is worse because some CAPs are not cosmetic. CAP-13 affects security, CAP-15 affects irreversible closing, CAP-6 affects purchase data authority, and CAP-7 affects inventory valuation. Deferring them changes the shape of the MVP architecture.

**Remediation**

For every CAP, add one of:

- `MVP same release`
- `MVP security/architecture prerequisite`
- `Post-MVP committed`
- `Optional / needs separate go`
- `Blocked until OQ closed`
- `Contract/Ops only`

Also add a short "release decision rule" explaining who can move a CAP between buckets and what artifact records that decision.

## High Findings

### H1. 권한 프로파일 exists, but FRs still grant broad "본사 사용자" powers

**Location / quote**

- PRD §4.1 lines 157-168: `본사 사용자` is a parent expression split into owner, manager, staff, uploader, closer, settings admin, read-only HQ, and branch manager.
- PRD §4.5 lines 442-446: `본사 사용자는... 직접 입력하거나 수정할 수 있다`; `본사 사용자는... 모든 주요 데이터 항목을 강제 입력하거나 수정할 수 있다`.
- PRD §4.5 line 452: `본사 사용자는 일일 장부를 본사 마감 처리할 수 있다`.

**Risk**

The permission section says "HQ user" is not a single role, but FR-18 and FR-19 use it as if it is. Story writers may implement broad HQ access first and plan to tighten it later. That is exactly how internal tools end up with overpowered accounts.

**Remediation**

Add a `권한 프로파일 x action` matrix for all high-risk actions:

- create/edit ledger fields
- force-edit branch input
- close ledger
- add correction
- confirm correction propagation
- upload preview/commit/void/reprocess
- manage users/branches/codes/thresholds
- export reports

Then replace broad FR wording with allowed profiles, for example "본사 관리자 또는 해당 mutation 권한을 가진 프로파일."

### H2. Closing policy lacks a hard-stop matrix

**Location / quote**

- PRD §4.5 lines 458-459: pre-close summary includes missing required values, warning signals, carryover gaps, validation errors, unresolved correction reflection; validation errors can still be closed with reason and audit log.
- PRD §8.4 lines 878-880: bulk close dry run summarizes errors; ledgers with validation errors or carryover gaps can be closed with reason.

**Risk**

The PRD treats serious data quality failures as overrideable with a reason. Some conditions should be warnings, some should be overrideable, and some should be hard stops. Without that split, "reason required" becomes a loophole for locking broken ledgers.

Examples likely needing hard-stop decisions: unauthenticated actor, wrong branch/date, missing ledger identity, impossible numeric format, unresolved upload commit failure, already closed ledger, pending correction propagation, and calculation engine failure.

**Remediation**

Add a closeability matrix:

| Condition | Individual close | Bulk close | Override? | Required audit fields |
| --- | --- | --- | --- | --- |

Classify each condition as `hard stop`, `override with reason`, or `warning only`. Bulk close should probably be stricter than individual close.

### H3. Concurrent editing is still underspecified for the product's core workflow

**Location / quote**

- PRD §3.1 lines 138-147: before HQ close, branch manager and HQ can both modify ledgers.
- PRD §4.5 lines 442-448: HQ can force-edit all major fields before close.
- PRD §5 line 644: conflicts should not silently overwrite; show conflict or recheck state.
- CAP-16 lines 891-894: author name persists through partial save or partial edit.

**Risk**

This is a shared-entry product. Branch managers use a multi-step mobile flow, HQ can force-edit, and partial saves exist. "Do not silently overwrite" is not enough to design UX, API, or audit behavior.

Implementation churn is likely around whether locking is ledger-level, step-level, field-level, or version-based. Audit logs will not fix the user experience if people lose edits or see values change under them.

**Remediation**

Define:

- optimistic version field or edit token
- conflict detection unit: ledger, step, section, or field
- compare-and-resolve UX
- whether HQ force-edit locks branch editing temporarily
- stale mobile session behavior
- partial save merge rules

### H4. MVP cost/profit calculations are still not product-safe enough

**Location / quote**

- PRD §4.3 lines 331 and 388-389: MVP calculation is an "operating confirmation" value before FIFO and must be separated from FIFO calculation.
- PRD §4.3 line 383: FR-13 calculates 매출원가, 매출이익, 이익률, 영업이익, 평균재고, 매출대비 재고비율.
- PRD §10 lines 1026, 1031, 1041: `30%단가`, FIFO applicability, and FIFO treatment order are unresolved.

**Risk**

Calling a value "not FIFO final" does not define how it should be calculated. MVP still shows cost/profit numbers that influence closing, reports, warnings, and management decisions. If the unit price basis is unclear, the first implementation will bake in assumptions that later FIFO work must undo.

**Remediation**

For MVP only, define:

- unit price source priority
- whether inventory amount is quantity x master price, latest purchase price, manual price, or another basis
- what happens when price is missing
- whether cost/profit fields can be shown, hidden, or marked `기준 확인 필요`
- whether ledgers with unresolved price basis can be closed

### H5. Upload idempotency can still merge distinct real-world purchase rows

**Location / quote**

- PRD §8.2 lines 780-781: duplicate upload uses same file or same branch/date/item/quantity combo plus file hash or row-content key.
- PRD §8.2 line 802: row idempotency uses branch+date+item+quantity+price plus file hash/row-content key.

**Risk**

Two legitimate purchase rows can share branch, date, item, quantity, and price. Conversely, the same business row can change price during correction. Without a stable source line identifier, supplier/document number, row number, or upload batch line id policy, idempotency can either collapse valid rows or duplicate corrected ones.

**Remediation**

Define row identity as a layered key:

- source file/batch id
- source sheet and row number
- source document number if present
- supplier/outbound document if present
- normalized item mapping id
- amount/quantity hash as a secondary duplicate signal, not the only key

Also specify how edited preview rows preserve or replace source identity.

### H6. Backup and recovery targets are too weak for the stated operating model

**Location / quote**

- PRD §1 says the system is the daily morning meeting basis.
- PRD §5 lines 639-643: minimum RPO is 1 business day, RTO is 1 business day, audit/upload retention is 12 months.

**Risk**

For a daily ledger and morning meeting tool, losing up to one business day of close/correction/upload data is a serious operational failure. A 1-day RTO can also wipe out the morning process for every branch. The PRD sets a floor, but the floor is so low that architecture could choose cheap daily backups only.

**Remediation**

Set product-level minimums separate from paid operations:

- RPO for database changes: materially less than 1 business day, preferably same-day point-in-time or frequent snapshots.
- RTO class by business hours vs off-hours.
- separate retention for immutable audit logs and uploaded source files.
- restore drill acceptance criteria before launch.

## Medium Findings

### M1. Account security is still pushed into operations instead of product acceptance

**Location / quote**

- PRD §4.1 lines 180-183: initial master accounts, password change, deactivation, session expiry, login failure limits are defined in operations settings or manual; plaintext password storage is forbidden.

**Risk**

The PRD names security topics but does not make minimum rules testable. Internal ERP accounts touch financial, inventory, employee, and correction data. A manual cannot compensate for missing implementation acceptance criteria.

**Remediation**

Add MVP acceptance criteria for minimum password length/complexity or policy, forced initial change, reset flow, failed-login throttling/lockout, session timeout, inactive account session invalidation, and audit logging for admin resets.

### M2. "작성자 이름" can conflict with login identity and audit identity

**Location / quote**

- PRD §8.4 lines 887-894: author name entered in step 1 is cached through the 7-step save flow.
- PRD §4.1 lines 194-217: audit logs record actor, before/after values, and event types.

**Risk**

The product already has login users and audit actors. A free-form author name can be mistaken for the accountable user, especially if branches share devices or accounts. This creates audit ambiguity exactly where the PRD is trying to improve trust.

**Remediation**

Define three separate concepts:

- authenticated account
- displayed author name
- actual input person if different

State that author name never replaces authenticated audit actor, and define how mismatches are shown.

### M3. Desired sale price loss calculation lacks time/version control

**Location / quote**

- PRD §8.4 lines 861-869: desired sale price is based on branch manager input before business starts.
- PRD §10 line 1033: OQ-9 asks what to do if desired sale price is missing or changed during business hours.

**Risk**

Loss calculation can be manipulated or misunderstood if the base price can be entered late or changed during the day without version rules. This affects loss reports, margin comparison, and branch accountability.

**Remediation**

Before CAP-14 implementation, define business-start time, price lock time, late-entry handling, version history, HQ override permission, missing-price fallback, and closeability when price is absent.

### M4. External alert messages can leak sensitive data

**Location / quote**

- PRD §8.6 lines 949-965: LINE/Telegram alerts include deficit branches, margin target misses, long-stagnant inventory, recipients, channels, conditions, thresholds, test send, retry, and token safety.
- PRD §8.4 lines 843-859: branch managers must not see sensitive accounting indicators or reverse-engineer cost/profit.

**Risk**

LINE/Telegram messages leave the ERP permission boundary. The PRD secures tokens but not message content. A group chat or wrong recipient can expose profit, margin, inventory value, or branch performance details.

**Remediation**

Add alert content policy:

- allowed fields by recipient profile
- masking rules for sensitive metrics
- branch vs HQ templates
- group/channel restrictions
- approval for new alert templates
- log retention that avoids storing excessive sensitive message bodies

### M5. Employee/payroll reference scope has privacy risk beyond "actual payment excluded"

**Location / quote**

- PRD §8.1 lines 732-755: employee master, multiple branch work, hire date, lateness, early leave, special attendance notes, payroll difference manual input.
- PRD §10 line 1036: OQ-12 asks whether payroll settlement includes actual payment or reference only.

**Risk**

"Reference only" still handles personal and compensation-adjacent information. The PRD does not define field-level access, branch-level visibility, export restrictions, inactive/terminated employee handling, or retention policy.

**Remediation**

Add an employee data permission matrix:

- who can view/edit each field
- whether branch managers can see employees from other branches
- payroll difference export rules
- inactive/terminated employee display
- retention and deletion/anonymization policy

### M6. Dashboard resizing is too subjective to implement cleanly

**Location / quote**

- PRD §8.4 lines 904-911: users can adjust dashboard columns/areas/layout size; adjustment must not interfere with checking key table data.

**Risk**

"보기 좋은 크기" and "does not interfere" are not acceptance criteria. UX and frontend implementation will churn over persistence, reset, minimum widths, hidden columns, mobile behavior, and per-user vs global settings.

**Remediation**

Specify:

- exact resizable tables/areas
- per-user persistence
- reset to default
- min/max widths
- required columns that cannot be hidden or shrunk below readable size
- desktop-only vs mobile behavior

### M7. Master data effective-date rules are incomplete

**Location / quote**

- PRD §4.6 covers branch, user, item, purchase criteria, and code management.
- PRD §8.2 line 784 says HQ can override outbound price and quantity during upload review.

**Risk**

The PRD protects historical source names, but it does not fully define when changed master data applies to drafts, future ledgers, uploads, reports, and old corrections. A changed item mapping or default price can unexpectedly rewrite reports or break upload matching.

**Remediation**

For each master type, define effective dating:

- applies only to new ledgers or also open drafts
- whether existing ledgers keep old labels/mappings
- how inactive codes behave in correction screens
- upload mapping precedence when a mapping changes after preview

## Low Findings

### L1. Technical terms remain mixed into operator-approved policy

**Location / quote**

- PRD uses terms such as `mutation`, `API response`, `preview`, `commit`, `rollback`, `idempotency`, `export`, and `cache`.

**Risk**

Developers understand these terms, but PMs and HQ operators may approve policy without understanding the operational meaning. That is dangerous for upload confirmation, permissions, and correction flows.

**Remediation**

Add a short technical glossary or use paired wording, for example "업로드 확정(commit)" on first use.

### L2. "Excel level" language can still widen expectations

**Location / quote**

- PRD §8.5 lines 925-934: CAP-3 is "엑셀 보고 양식 수준의 리포트 고도화" while also saying Excel formulas are not authoritative.

**Risk**

Customers may expect layout, charts, all historical formulas, and export shape to match Excel. Developers may implement only server-calculation parity. The phrase can reopen scope.

**Remediation**

Replace "Excel level" with an explicit list of matched report fields and excluded Excel behaviors. Keep Excel as reference mapping, not as a quality bar.

## Top Remediation Order

1. Resolve the MVP-vs-extension contradiction for sensitive metrics and promote minimum data exposure control into MVP.
2. Regenerate story readiness from all OQ impacts, not only OQ-1~OQ-3.
3. Add CAP release commitment buckets before estimating or story slicing.
4. Build action-level permission and closeability matrices.
5. Lock MVP calculation basis for cost/profit/inventory values before implementing FR-13 reports.
