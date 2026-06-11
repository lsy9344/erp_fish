# Adversarial PRD Review: ERP Fish

검토 대상:

- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md`
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\addendum.md`
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\.decision-log.md`

검토 관점: 제품 리스크, 누락 요구사항, 모순, acceptance boundary 부족, downstream UX/architecture/story churn 위험, scope contradiction, OQ/gate 안전성.

## Verdict

**조건부 통과, 하지만 바로 story extraction에 넣기에는 아직 위험하다.**

최근 보강으로 이전의 큰 구멍은 많이 줄었다. G6, CAP 약속 원장, 가격 신뢰 상태, 민감 필드 매트릭스, OQ-10 종료 기준은 모두 "위험을 보이게 만드는 장치"로는 유효하다. 그러나 일부 장치는 아직 실제 차단 장치라기보다 문서 안의 경고문에 가깝다. 가장 큰 남은 위험은 downstream 팀이 `MVP 필수`, `후속 확정`, `OQ-10 닫힘` 같은 표현을 서로 다르게 해석해 구현 스토리, 계약 기대치, 보안 정책을 다시 흔드는 것이다.

## Severity Summary

- Critical: 0
- High: 3
- Medium: 5
- Low: 1
- Total: 9 findings

## High Findings

### H1. G6는 좋은 경고지만 아직 story extraction을 실제로 막는 산출물이 아니다

**Location / evidence**

- `prd.md:20` states the document is still `draft` and not final for epic/story generation.
- `prd.md:29` adds G6 and requires all MVP FR slices to be marked as `implementation story`, `discovery story`, or `blocked`.
- `prd.md:46-59` says the story team should copy the table into an `MVP story extraction checklist`, but the checklist itself does not exist in the reviewed artifact set.
- `prd.md:1264-1271` still has story-blocking OQs before MVP story generation.

**Risk**

The PRD now names the risk, but it does not yet enforce the handoff. A downstream story writer can still start from §7 or the FR list, see `MVP 필수`, and generate implementation stories for slices that the PRD says must remain discovery-only. This creates the exact churn G6 is meant to prevent: later UX, architecture, and dev stories will need to be unwound after OQ closure.

**Remediation**

Before any epic/story generation, create the actual `MVP story extraction checklist` as a separate approved artifact. It should have stable slice IDs, related FR/CAP/OQ, current status, required closure artifact, owner, approval date, and explicit "may generate implementation story: yes/no". Treat the checklist as a hard input gate for `bmad-create-epics-and-stories`, not as guidance embedded in the PRD.

### H2. OQ-10 is still too easy to close too broadly or leave open too long

**Location / evidence**

- `prd.md:229-234` makes MVP-sensitive data blocking mandatory before CAP-13.
- `prd.md:240` blocks many fields for 지점장 화면/API and says there is no exception before OQ-10 MVP minimum approval.
- `prd.md:1288` keeps OQ-10 as one question with two decision grades: MVP minimum blocking and CAP-13 advanced policy.
- `prd.md:1300-1305` adds two close criteria under one OQ.

**Risk**

The split close criteria are the right direction, but the single OQ remains semantically overloaded. One team may say "OQ-10 is closed" after approving the MVP deny-list and then accidentally unlock CAP-13 advanced exposure. Another team may say "OQ-10 is still open" because CAP-13 is not decided and unnecessarily block FR-13/FR-28/FR-29 MVP-safe 본사-only reporting. This is both a security risk and a story sequencing risk.

**Remediation**

Either split it into `OQ-10A MVP 최소 노출 차단` and `OQ-10B CAP-13 고도화 정책`, or keep the number but add explicit status fields: `MVP minimum: open/closed`, `CAP-13 advanced: open/closed`. The MVP closure artifact must list allowed/blocked fields by surface and role, and must state that closing the MVP part does not permit any 지점장 exposure of cost/profit-derived values.

### H3. CAP 약속 원장은 scope contradiction을 줄였지만 계약 약속 경계는 아직 약하다

**Location / evidence**

- `prd.md:842-845` says §8 is 추가 구현 범위 included after customer meeting and estimate context.
- `prd.md:861-881` classifies CAPs by phase, release bucket, dependencies, and OQs.
- `prd.md:883-907` adds a CAP promise ledger and says `후속 확정` is not a delivery promise.
- Several rows still use ambiguous states such as `approved backlog only`, `MVP+1 후보`, or `별도 유상 릴리스`.

**Risk**

This is much safer than before, but the commercial/product boundary is still not fully testable. `approved backlog only` can mean "approved to implement later", "approved to estimate", or "customer asked for it but not contracted". CAP-13 also mixes `MVP+0 최소 차단` with `MVP+1 후보 고도화`, which is correct but easy to misread as one CAP with two different commitment levels. The result is likely contract churn, roadmap churn, and story churn.

**Remediation**

Add a stricter commitment field for every CAP: `contracted build`, `approved discovery only`, `approved backlog candidate`, `blocked pending OQ`, or `contract/ops only`. For split CAPs such as CAP-13, separate the MVP security slice from the advanced policy slice in the ledger so each has its own commitment, owner, and approval artifact.

## Medium Findings

### M1. 가격 신뢰 상태는 strong addition, but state transitions and approval authority are underspecified

**Location / evidence**

- `prd.md:438-447` defines MVP price source priority.
- `prd.md:451-456` defines `approved`, `manual_override`, `pending_review`, and `basis_missing`.
- `prd.md:593` requires close summary counts and monthly reporting for `basis_missing`.

**Risk**

The statuses are useful, but implementation still has room to diverge. The PRD does not define who can move a line from `manual_override` to `approved`, whether `pending_review` can be saved but not closed, how an old approved price is invalidated, or whether approval applies to a single line, item, branch, date range, or batch. Architecture may create a state machine; stories may treat it as a display label.

**Remediation**

Add a price trust state transition table before implementation: allowed transitions, actor/permission, required reason, affected scope, audit event, and closeability effect. Also define whether price approval is line-level, item-level, branch-level, or batch-level.

### M2. Sensitive field policy is clear at the matrix level, but report contracts still list sensitive metrics without role-specific variants

**Location / evidence**

- `prd.md:231-234` requires sensitive blocking across screen, API, export, alert templates, and cache.
- `prd.md:238-244` gives the sensitive field matrix.
- `prd.md:723-728` lists report columns including 이익률, 매출이익, 영업이익, 인당생산성, 재고금액-related metrics without separate role-specific report schemas.
- `prd.md:717` says report/export/alert exposure follows §4.1.

**Risk**

The cross-reference is correct, so this is not a critical gap. The remaining problem is implementation granularity. If a single report API is built first and role filtering is bolted on later, sensitive fields may appear in cached responses, exports, shared links, or alert templates. The PRD tells teams to avoid this, but the report contracts do not provide explicit per-role acceptance boundaries.

**Remediation**

For FR-27/FR-28/FR-29 and CAP-10, add role/surface-specific response and export variants: 본사 관리자, 조회 전용 본사, 지점장, shared link, alert template. Include negative acceptance tests: 지점장 session must not receive the field at all, not merely see it hidden.

### M3. CAP-6 upload is much safer, but OQ-6 being "implementation setup" can still hide a story blocker

**Location / evidence**

- `prd.md:1005-1007` requires `.xlsx` and logical field mapping.
- `prd.md:1009-1014` describes preview, commit, and manual edits.
- `prd.md:1032-1034` defines row identity and preview edit identity.
- `prd.md:1274` and `prd.md:1284` classify real header mapping as setup-time confirmation, not an epic blocker.

**Risk**

The logical contract is good, but if no real sample header mapping is available before story implementation, upload parsing stories can still become speculative. The team may build a generic mapper that does not fit the actual Ecount file, or create wrong idempotency assumptions because the "document number/supplier/outbound document" fields are optional.

**Remediation**

Create a short discovery/setup story before CAP-6 implementation stories: collect at least one representative Ecount file, map actual headers to logical fields, decide which optional identity fields are available, and approve fixture files for tests. Keep OQ-6 as setup-time only only after those fixtures exist.

### M4. CAP-12 can create hidden schema scope unless "structured for AI later" is bounded

**Location / evidence**

- `prd.md:854` excludes AI screens, API calls, prompts, and AI analysis storage.
- `prd.md:1209-1218` asks the system to preserve structured data for future analysis.
- `prd.md:900` says CAP-12 is optional data-structure preparation with no AI feature promise.

**Risk**

The exclusion of AI functionality is clear. The risk is schema creep: "future analysis" can be used to justify new structured fields, tags, normalization screens, and search/filter requirements that are not needed by the current MVP or approved CAPs. That can quietly expand UX, database design, and story scope even while the PRD says AI is excluded.

**Remediation**

Require a `structured field registry` for CAP-12. Each field should tie back to a current FR/CAP, report, alert, or compliance need. Fields that exist only for hypothetical future AI should be marked as backlog research, not MVP or approved extension implementation.

### M5. Employee/payroll privacy is improved, but deletion/export lifecycle still needs operational ownership

**Location / evidence**

- `prd.md:971-973` requires field-level permissions and ties preservation/deletion/anonymization to OQ-12.
- `prd.md:975-985` adds a default retention table.
- `prd.md:1290` keeps OQ-12 as required before Epic 9.

**Risk**

The retention defaults are now concrete enough for PRD level, but operational ownership remains thin. Export files are especially risky: the PRD says not to preserve them long-term and requires expiring download links, but it does not assign who can purge exports, how purge is audited, or whether generated files are stored outside the app.

**Remediation**

In the CAP-1/CAP-9 approval artifact, add an export lifecycle section: link expiry duration, storage location, purge owner, purge audit event, and emergency revocation process.

## Low Findings

### L1. The performance target may be too narrow for the stated "10+ branches" operating model

**Location / evidence**

- `prd.md:783` targets dashboard load within 3 seconds for around 10 branches.
- `addendum.md` says headquarters must dynamically register 10 or more branches.
- `prd.md:795` repeats 10-ish branches as the default concurrency scale.

**Risk**

This is not blocking for MVP, but the target can age badly. If the business grows from 10 to 20 or 30 branches, teams will have no agreed degradation rule or scaling acceptance boundary.

**Remediation**

Add a simple scale assumption: MVP validates 10 active branches, and any branch count above that must either meet the same 3-second target or trigger a reviewed performance target. This can live in NFR or architecture, not necessarily in the PRD body.

## Notes On Recent Additions

- **G6:** Directionally correct, but must become an actual checklist artifact before story generation.
- **CAP promise ledger:** Strong improvement. Remaining issue is commitment vocabulary, not concept.
- **Price trust state:** Strong improvement. Remaining issue is state transition and approval authority.
- **Sensitive field matrix:** Strong improvement. Remaining issue is role-specific report/API/export acceptance.
- **OQ-10 close criteria:** Directionally correct, but still overloaded under one OQ and risky for handoff language.
