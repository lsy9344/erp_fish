# Validation Report — ERP Fish PRD

- **PRD:** `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\prd.md`
- **Rubric:** `C:\Code\Project\erp_fish\.agents\skills\bmad-prd\assets\prd-validation-checklist.md`
- **Run at:** 2026-06-11T11:35:00+09:00
- **Grade:** Fair

## Overall verdict

Rubric review judges the PRD as **Good / build-ready 전 게이트 필요**: the control-tower thesis, MVP/extension/contract boundaries, FR/CAP/OQ structure, and calculation/permission/audit/report contracts are strong. It is still a `draft`, and story generation should wait until the named gates and OQ-linked slices are resolved.

The adversarial review materially lowers the final gate grade to **Fair** because it found **High 3** risks. The PRD now makes major risks visible, but several handoff controls still need external approval artifacts before UX, architecture, or story extraction can proceed safely.

## Dimension verdicts

- Decision-readiness — adequate
- Substance over theater — strong
- Strategic coherence — strong
- Done-ness clarity — adequate
- Scope honesty — strong
- Downstream usability — adequate
- Shape fit — strong

## Findings by severity

### Critical (0)

없음.

### High (3)

**[Adversarial] G6 is not yet an actual story-extraction gate (§0.1, §0.2, §10)**

The PRD adds G6 and instructs teams to create an `MVP story extraction checklist`, but that checklist does not yet exist as an approved artifact. A story writer can still start from §7 or the FR list and generate implementation stories for slices that should remain discovery-only or blocked.

Fix: Before `bmad-create-epics-and-stories`, create the actual checklist with stable slice IDs, related FR/CAP/OQ, current status, required closure artifact, owner, approval date, and `may generate implementation story: yes/no`.

**[Adversarial] OQ-10 remains overloaded even with split close criteria (§4.1, §10)**

The PRD correctly separates MVP minimum blocking from CAP-13 advanced policy inside OQ-10, but a single "OQ-10 closed" phrase can still be misread. One team may close the MVP deny-list and accidentally unlock CAP-13 exposure; another may keep MVP-safe 본사-only reporting blocked because CAP-13 is still undecided.

Fix: Either split into `OQ-10A` and `OQ-10B`, or add explicit status fields: `MVP minimum: open/closed` and `CAP-13 advanced: open/closed`. The MVP closure artifact must state that closing the MVP part does not permit 지점장 exposure of cost/profit-derived values.

**[Adversarial] CAP commitment language is still commercially ambiguous (§8)**

The CAP 약속 원장 is a strong improvement, but terms like `approved backlog only`, `MVP+1 후보`, and `별도 유상 릴리스` can still mean different things to customer, PM, and engineering readers. CAP-13 also mixes MVP minimum security and advanced policy under one CAP row.

Fix: Add a stricter commitment field for each CAP: `contracted build`, `approved discovery only`, `approved backlog candidate`, `blocked pending OQ`, or `contract/ops only`. For split CAPs such as CAP-13, separate the MVP security slice from the advanced policy slice in the ledger.

### Medium (7)

**[Decision-readiness] MVP included scope can still be misread as build-ready scope (§7.1, §0.2, §10)**

§7.1 lists MVP capabilities, while §0.2 and §10 explain that some slices still require OQ closure or discovery stories. A downstream reader who copies §7.1 alone may miss those blockers.

Fix: Add a short note under §7.1 that all MVP items inherit §0.2 story-readiness and §10 OQ gates, or mark bullets as `implementation-ready`, `discovery-first`, or `blocked slice exists`.

**[Done-ness clarity] Some CAPs still defer measurable completion criteria (§8.4, §8.6)**

CAP-18 leaves UX sizing numbers for later, and CAP-11 leaves retry/failure behavior open. That is acceptable for backlog approval but not for implementation epics.

Fix: Before implementation, create discovery/policy stories that close numeric UX criteria, retry count/interval, escalation behavior, and default settings.

**[Adversarial] Price trust statuses need transitions and approval authority (§4.3, §4.5)**

The new `approved`, `manual_override`, `pending_review`, and `basis_missing` statuses are useful, but the PRD does not yet say who can move a line between states, what scope approval applies to, or how old approved prices are invalidated.

Fix: Add a price-trust state transition table: allowed transition, actor/permission, required reason, affected scope, audit event, and closeability effect.

**[Adversarial] Sensitive report/API/export variants are still not explicit enough (§4.1, §4.7)**

The matrix and cross-reference are correct, but FR-27/FR-28/FR-29 and CAP-10 still list sensitive report columns without role-specific response/export schemas.

Fix: Add role/surface variants for 본사 관리자, 조회 전용 본사, 지점장, shared link, and alert template. Include negative acceptance tests proving 지점장 sessions never receive sensitive fields in server responses.

**[Adversarial] CAP-6 sample mapping can still become a hidden blocker (§8.2, §10 OQ-6)**

OQ-6 is classified as setup-time confirmation, but upload parsing stories can still become speculative if no representative Ecount file exists before implementation.

Fix: Create a setup story before CAP-6 implementation: collect sample files, map real headers to logical fields, decide which optional identity fields exist, and approve fixtures for tests.

**[Adversarial] CAP-12 structured-for-AI scope needs a field registry (§8.6)**

The PRD excludes AI functionality, but "future analysis" can still cause schema creep through new fields, tags, and normalization screens.

Fix: Require a structured field registry. Each field must tie to a current FR/CAP, report, alert, or compliance need. Fields that exist only for hypothetical AI stay backlog research.

**[Adversarial] Employee/payroll export lifecycle needs operational ownership (§8.1, §10 OQ-12)**

The retention table is much stronger, but export purge, storage location, link expiry, audit event, and emergency revocation are not yet owned.

Fix: Add an export lifecycle section to the CAP-1/CAP-9 approval artifact with purge owner, purge audit event, link expiry, and emergency revocation process.

### Low (2)

**[Strategic coherence] SM-6 lacks a target threshold (§9)**

SM-6 measures system ledger usage and Excel fallback, but does not state what level means Excel dependence has meaningfully dropped.

Fix: Add a post-open target, such as active-branch system ledger completion rate and fallback trend threshold.

**[Adversarial] Performance target may be narrow for future branch growth (§5, addendum)**

The dashboard target is centered around roughly 10 branches. This is fine for MVP, but the business may grow beyond that without a known degradation rule.

Fix: Add a scale assumption: MVP validates 10 active branches, and higher branch counts must either keep the same target or trigger a reviewed performance target.

## Mechanical notes

- FR IDs are contiguous: FR-1 through FR-29.
- CAP IDs are present: CAP-1 through CAP-19. §8 uses phase order, and CAP ID 색인 compensates for non-numeric ordering.
- OQ IDs are contiguous: OQ-1 through OQ-18.
- UJ IDs are contiguous: UJ-1 through UJ-4, all with named protagonists.
- No inline `[ASSUMPTION]` tags were found. §11 routes remaining uncertainty to §10 Open Questions.
- No broken FR/CAP/OQ references were found in the reviewed scope.

## Reviewer files

- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-rubric.md`
- `C:\Code\Project\erp_fish\_bmad-output\planning-artifacts\prds\prd-erp_fish-2026-05-28-2\review-adversarial-general.md`
