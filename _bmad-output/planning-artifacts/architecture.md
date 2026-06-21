---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "C:\\Code\\Project\\erp_fish\\_bmad-output\\planning-artifacts\\prds\\prd-erp_fish-2026-05-28-2\\prd.md"
  - "C:\\Code\\Project\\erp_fish\\_bmad-output\\planning-artifacts\\prds\\prd-erp_fish-2026-05-28-2\\mvp-story-extraction-checklist.md"
  - "C:\\Code\\Project\\erp_fish\\_bmad-output\\planning-artifacts\\prds\\prd-erp_fish-2026-05-28-2\\validation-report.md"
  - "C:\\Code\\Project\\erp_fish\\_bmad-output\\planning-artifacts\\prds\\prd-erp_fish-2026-05-28-2\\review-resolution.md"
  - "C:\\Code\\Project\\erp_fish\\_bmad-output\\planning-artifacts\\briefs\\brief-erp_fish-2026-05-28\\brief.md"
  - "C:\\Code\\Project\\erp_fish\\docs\\reference_from_customer\\feature_analysis.md"
  - "C:\\Code\\Project\\erp_fish\\docs\\reference_from_customer\\desc.md"
workflowType: "architecture"
project_name: "erp_fish"
user_name: "Noah Lee"
date: "2026-05-28"
lastPrdAlignmentReview: "2026-06-11"
lastStep: 8
status: "complete"
completedAt: "2026-05-28"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
ERP Fish는 지점별 일일 장부를 웹 기반 내부 ERP로 전환하는 full-stack 업무 시스템이다. PRD에는 총 29개 기능 요구사항이 있으며, 다음 7개 영역으로 나뉜다.

- 인증, 권한, 변경 이력: 본사 사용자와 지점장의 접근 범위를 서버 기준으로 강제하고 주요 변경 이력을 남긴다.
- 일일 장부 입력: 지점+일자 단위 장부를 만들고, 매출/결제, 비용, 매입, 재고, 손실, 근무 정보를 단계형 흐름으로 입력한다.
- 계산과 검증: 매출원가, 매출이익, 이익률, 영업이익, 인당생산성, 재고 지표, 매출차액을 같은 기준으로 계산하고 누락/이상 후보를 표시한다.
- 본사 관제판과 이상 신호: 본사는 전체 지점의 상태, 이상 신호, 마감 여부를 한 화면에서 보고 문제 가능성이 높은 지점을 먼저 확인한다.
- 본사 입력, 마감, 정정: 본사는 마감 전 장부를 직접 보완할 수 있고, 본사 마감 후에는 원본을 잠근 뒤 정정 기록만 추가한다.
- 마스터와 관리 설정: 지점, 사용자, 품목, 매입 기준, 코드, 이상 신호 기준값을 본사가 관리한다.
- 리포트: 일별 아침 회의 리포트, 지점별 기간 비교, 월간 지점 요약을 제공한다.

2026-06-10 추가 구현 범위는 기존 MVP 위에 CAP-1~CAP-18을 확장한다. 주요 확장 영역은 직원/근무/급여 정산 참고 자료, 품목명/규격 정규화, 이카운트 엑셀 업로드, FIFO 재고 원가, 본사 통합 재고, 상품별 분석, 지점장 민감 지표 제한, 일괄 마감, 월 손익, 특수기간 리포트, LINE/텔레그램 알림이다. AI 분석 기능은 구현하지 않고 향후 분석 가능한 구조화 데이터만 남긴다.

**Non-Functional Requirements:**
권한은 서버에서 강제되어야 하며, 마감, 정정, 주요 입력/수정, 기준값 변경은 감사 추적이 가능해야 한다. 본사 마감 후 원본 장부는 보존되어야 하고 정정 기록으로 덮어쓰면 안 된다. 지점장 입력 화면은 PC, 태블릿, 모바일 웹에서 사용할 수 있어야 하며 최소 390px 폭 모바일에서도 핵심 흐름이 동작해야 한다. 본사 관제판은 10개 내외 지점 기준 기본 조회를 3초 안에 표시하는 것을 목표로 한다. 기존 엑셀 수식/서식 복제가 아니라 서버 계산 로직과 데이터 모델로 업무 규칙을 재정의해야 한다.

**Scale & Complexity:**
1차 범위는 외부 연동이 적은 내부 업무 시스템이지만, 데이터 상태와 계산 규칙이 복잡하다.

- Primary domain: full-stack internal ERP
- Complexity level: medium-high
- Estimated architectural components: auth/access control, daily ledger workflow, inventory flow, calculation engine, validation/anomaly rules, audit trail, correction records, master data, HQ dashboard, reports

### Technical Constraints & Dependencies

1차 MVP는 수동 입력, 검증, 본사 관제, 마감, 정정 기록, 기본 리포트에 집중한다. POS/카드 매출 자동 연동, AI 이미지 식별, 과거 엑셀 일괄 이관은 계속 제외된다. 2026-06-10 추가 구현 범위에서는 이카운트 엑셀 업로드, LINE/텔레그램 알림, 직원/급여 참고 자료, FIFO 재고 원가, 특수기간 리포트가 후속 범위로 승격되었다.

기존 엑셀에는 수식 오류와 결측 데이터가 많으므로 수식을 그대로 옮기는 방식은 위험하다. 품목명/규격 정규화, 월초 재고 스냅샷, 직전 마감 장부의 재고 자동 이월, 정정 반영값 계산이 핵심 의존점이다.

정책 미정 항목은 계산 모델에 직접 영향을 준다. 특히 `30%단가`, 전일 이월금액, 매출차액 허용 기준, 손실액 저장 방식, 상품별 판매량 산출 방식은 이후 설계 전 반드시 결정하거나 명확한 보류 상태로 다뤄야 한다.

추가 범위의 정책 미정 항목도 계산 모델에 직접 영향을 준다. 이카운트 양식 고정 여부, FIFO 적용 범위, 희망 판매가 입력 주체와 입력 시점, 지점장에게 보여줄 마진율 기준, LINE/텔레그램 우선순위, `차이`를 `당일 판매량`으로 바꾸는 변경의 의미는 구현 전 결정하거나 `확인 필요` 상태로 남겨야 한다.

### Cross-Cutting Concerns Identified

- 역할 기반 접근 제어와 지점별 데이터 격리
- 입력/수정/마감/정정/기준값 변경 감사 로그
- 장부 상태 전이: 미입력, 입력 중, 검토 대기, 본사 마감
- 본사 마감 후 원본값과 정정 반영값 분리
- 관제판, 상세, 리포트에서 같은 계산 기준 사용
- 재고 이월과 월초 재고 스냅샷
- 품목 마스터와 과거 장부 원본값 보존
- 이상 신호 기준값의 설정, 적용, 변경 이력
- 모바일 입력성과 단계형 저장 흐름
- 계산 실패와 데이터 불일치를 숨기지 않는 검증 상태
- 원문 품목명과 분석용 품목/규격 분리
- 이카운트 업로드 이력, 매입 자동 생성, 매핑 실패 검수
- FIFO 매입 잔량과 재고 금액 근거 추적
- 지점장 민감 회계 지표 서버 응답 제한
- 외부 알림 토큰 보안, 발송 실패, 재시도, 로그
- AI 기능 제외와 분석 가능한 구조화 데이터 보존

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web application. ERP Fish needs authenticated internal web UI, server-side authorization, relational data, audit trail, reports, and Vercel deployment.

### Starter Options Considered

- Official Next.js starter: current, Vercel-native, simple foundation. Auth/DB/audit setup은 직접 추가해야 한다.
- Vercel Postgres starter: Next.js + Tailwind + Postgres/Neon 기반. DB 시작은 빠르지만 ERP 권한/인증 골격은 부족하다.
- Supabase Next.js starter: Next.js + TypeScript + Tailwind + cookie-based Auth. 빠르지만 Supabase Auth/RLS에 아키텍처가 강하게 묶인다.
- Create T3 App: Next.js + TypeScript 기반으로 Tailwind, Prisma, NextAuth.js, PostgreSQL 선택이 가능하다. shadcn/ui를 추가하면 ERP 화면에 필요한 일관된 컴포넌트 시스템을 빠르게 만들 수 있고, ERP의 권한, 감사 로그, 정정 기록, 복잡한 관계형 모델에도 균형이 좋다.

### Selected Starter: Create T3 App

**Rationale for Selection:**
ERP Fish는 화면보다 데이터 무결성이 더 중요한 내부 ERP다. TypeScript, Next.js, Prisma, PostgreSQL, NextAuth.js 조합은 Vercel 배포와 잘 맞고, 장부/재고/정정/감사 로그 같은 관계형 모델을 명확히 표현하기 좋다. Supabase starter도 가능하지만, 1차에서는 서버 기준 권한과 감사 추적을 애플리케이션 모델로 선명하게 유지하는 편이 더 단순하다.

**Initialization Command:**

```bash
pnpm create t3-app@latest erp_fish
```

선택값:

- NextAuth.js: Yes
- Prisma: Yes
- Tailwind CSS: Yes
- shadcn/ui: Yes, initialized after project scaffold
- Database Provider: PostgreSQL
- tRPC: No for MVP unless later API contract needs it

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript + Next.js full-stack application.

**Styling Solution:**
shadcn/ui on Tailwind CSS. Tailwind는 디자인 토큰과 유틸리티 기반 스타일 레이어로 쓰고, 실제 ERP 화면은 shadcn/ui 컴포넌트 조합으로 구성한다.

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card table form input select dialog sheet tabs badge alert separator skeleton sonner sidebar chart
```

**Build Tooling:**
Next.js build/runtime with Vercel-friendly deployment.

**Testing Framework:**
Starter 자체의 핵심 결정은 아니다. 첫 구현 story에서 unit/integration/e2e 테스트 도구를 별도로 정한다.

**Code Organization:**
Next.js application structure with Prisma schema and authentication setup. Domain modules should be added around ledger, inventory, correction, audit, master data, and reports.

**Development Experience:**
Typed database access through Prisma, auth base through NextAuth.js, and Vercel deployment path.

**Note:**
Project initialization using this command should be the first implementation story. shadcn/ui initialization and the baseline ERP component set should be part of the same first implementation story.

## Core Architectural Decisions

### Data Architecture

**Decision:**
Use PostgreSQL with Prisma and Prisma Migrate as the primary relational data architecture.

**Rationale:**
ERP Fish depends on strongly related business data: stores, users, daily ledgers, payment summaries, inventory snapshots, purchase lines, loss lines, corrections, audit logs, master data, and reports. PostgreSQL and Prisma provide a clear schema, migrations, typed queries, foreign keys, and uniqueness constraints that fit this domain better than a document-first model.

**Modeling Approach:**
Use normalized relational tables for core business data. JSON fields are allowed only for narrow metadata, raw import traces, or non-critical notes where schema flexibility is useful and reporting does not depend on the structure.

**Core Constraints:**

- `store_id + closing_date` must be unique for daily ledgers.
- Important references should use foreign keys, including store, user, product, closing, correction, and audit relationships.
- Money and quantity values must be validated at the server boundary and protected by database constraints where practical.
- Master data changes must not rewrite historical ledger values.

**Additional Scope Models:**

The 2026-06-10 scope should extend the relational model with explicit tables or equivalent normalized structures for:

- `Employee`, `EmployeeStoreAssignment`, and `LedgerWorker` for employee master data, multi-store work, and daily worker selection.
- `ProductAlias` or `ProductMapping` for raw item names, normalized products/specs, and mapping review status.
- `ImportBatch` and upload row trace models for eCount Excel uploads, validation results, source filenames, and audit links.
- `PurchaseLot` or equivalent lot/remaining-quantity records for FIFO inventory valuation.
- `InventoryValuation` or calculation snapshots only where persisted evidence is needed; derived values should still come from shared server calculations.
- `FixedCost` for monthly store fixed costs distinct from daily expense lines.
- `PayrollAdjustment` for manual payroll difference notes used as settlement reference, not payment finalization.
- `NotificationRule`, `NotificationRecipient`, and `NotificationDeliveryLog` for LINE/Telegram conditions, targets, delivery attempts, failures, and retries.

Do not store business-critical reporting data only in free-text notes or unstructured JSON. JSON remains acceptable for narrow upload trace metadata where reporting does not depend on arbitrary keys.

**Validation Strategy:**
Use Zod at server action/API boundaries and database constraints as a second line of defense. UI validation is helpful for speed, but server validation is authoritative.

For store-scoped mutations, parse only the minimal identifiers needed for access control first, then authorize the store/action, then run the full step schema validation. This prevents unauthorized users from learning detailed field-validation feedback or receiving business data for stores outside their scope.

If the identifier needed for authorization is missing or malformed, return a normal validation error for that identifier.

**Audit and Correction Strategy:**
Original ledger records are preserved after HQ close. `AuditLog` and `CorrectionRecord` are append-only records. Reports and dashboards use correction-applied values by default while details keep original values visible.

Epic 4 implementation fixed the close/correction contract more concretely:

- `runHqLedgerClosePreflight` builds the authorized HQ closeability snapshot. It checks permission and ledger scope before returning store names, missing fields, calculation states, correction state, or other closeability detail.
- `closeHqLedger` does not trust a prior UI preflight result. It checks the stale edit token first, rebuilds close preflight inside the close transaction, blocks on `blocking` items, and requires an exception reason when only `exception-allowed` items remain.
- HQ close writes `DailyLedger.status`, `closedById`, `closedAt`, `updatedById`, and a `ledger.hq.closed` audit event. It must not rewrite original ledger input rows.
- `createCorrectionRecord` is the post-close mutation path. It is append-only, requires `CORRECTION_CREATE` and ledger scope, re-reads the original value on the server, uses a transaction lock for same target ordering, and writes `correction.created` audit data with original, previous applied, corrected value, reason, and actor.
- `applyCorrectionValuesToLedgerReviewInput` is the shared correction overlay for dashboard, reports, and close preflight. Unsupported or not-yet-policy-approved corrections surface as `정정 확인 필요` or `기준 확인 필요` instead of silently changing numbers.

**Calculation Strategy:**
Dashboard, detail pages, and reports must share the same server-side calculation functions. Do not duplicate calculation rules in separate UI-only code paths.

Additional calculations for FIFO inventory valuation, product sales/margin analysis, hoped-sale-price loss calculations, special-period comparison, monthly P&L, and alert condition evaluation must also live in shared server calculation modules. If the required policy or source data is missing, return an explicit `확인 필요`, `계산 불가`, or `데이터 부족` state instead of silently substituting zero or a stale unit price.

**Caching Strategy:**
For MVP, prefer correctness and freshness over aggressive caching. Cache stable master data lightly if needed, but daily ledger status, anomaly signals, and correction-applied values should be computed from current server data.

### Authentication & Security

**Decision:**
Use the authentication foundation provided by Create T3 App: NextAuth.js/Auth.js with Prisma-backed user, account, and session persistence.

**Rationale:**
ERP Fish is an internal system with two primary roles and strict store-level access rules. A conventional server-side auth model is easier to reason about than pushing core authorization into client state. Prisma-backed auth also keeps users, roles, sessions, audit records, and ledger ownership in the same relational data model.

**Authentication Method:**
MVP should use HQ-managed internal accounts. Credentials or email-based login can be used depending on implementation preference, but account creation and role assignment should be controlled by HQ users rather than public self-signup.

**Authorization Pattern:**
Authorization is enforced on the server for every ledger, report, master-data, close, correction, and settings action.

- `HEADQUARTERS` users can access all stores and perform close, correction, master data, and threshold management.
- `STORE_MANAGER` users can access only assigned stores.
- Store access should be represented explicitly, either by a direct user-store relation for simple cases or a join table if one manager can cover multiple stores.
- UI-level hiding is helpful but never authoritative.
- Store-manager responses must omit sensitive accounting fields such as COGS, gross profit, per-person productivity, and operating profit. This restriction belongs in query/action result shaping as well as UI rendering.
- Ledger entry, ledger review, dashboard, and report queries must use a shared response shaping helper or equivalent server-side mapper for store-manager responses. Do not return sensitive fields to the client and rely on client components to hide them.
- HQ-uploaded purchase lines are read-only for store-manager mutations unless a later approved emergency-entry story defines an exception.

**Security Middleware and Server Boundaries:**
Use authenticated server helpers for Server Actions, Route Handlers, and database queries. Every sensitive server entrypoint should load the session, verify role/store access, and only then execute the business operation.

**Audit Strategy:**
Record business-critical changes rather than only authentication events. Input, edit, close, correction, anomaly threshold changes, and master-data changes must write audit records with actor, timestamp, target entity, before value, after value, and reason where applicable.

Epic 5 implementation fixed the master-data/settings contract more concretely:

- Store, product, purchase standard, ledger input code, and anomaly threshold settings are managed through settings-only Server Actions and queries guarded by `requireSettingsAccess`.
- Master-data create/update/status actions use soft activation state instead of hard delete. Inactive stores, products, purchase standards, and codes stay visible for administration and historical references, but active-option queries exclude them from new ledger entry choices.
- Master-data changes write audit records in the same Prisma transaction as the business change whenever possible. Audit target types include `Store`, `Product`, `PurchaseStandard`, `LedgerInputCode`, and `AnomalyThresholdSetting`.
- Historical ledger rows must not be backfilled when product, purchase standard, code, or threshold settings change. Ledger snapshots and correction history keep the original operational context.
- `updateAnomalyThresholdSettings` stores global threshold values plus `isActive`, requires a change reason, writes `AuditLog.reason`, and suppresses audit writes for no-op saves.
- Inactive anomaly threshold settings normalize to no configured threshold for signal consumers. Even active saved thresholds do not override open policy gates; OQ-gated signals still surface as `기준 확인 필요`/info states until the policy is approved.
- `PAYMENT_METHOD` codes are managed and audited as master data, but the current sales/payment ledger entry remains the fixed-field contract: `cashAmount`, `cardAmount`, and `otherPaymentAmount`. Dynamic payment method entry storage is a later scope, not an implied Epic 5.4 change.

**Secrets and Environment Configuration:**
Auth secrets, database URLs, and provider secrets live in environment variables. They must not be committed to the repository.

**Rate Limiting Strategy:**
For MVP, apply lightweight rate limiting to login and other sensitive mutation endpoints if available in the deployment stack. Broad API gateway complexity is deferred because the product has no public external API in the first release.

### API & Communication Patterns

**Decision:**
Use Next.js App Router server boundaries directly. Server Components handle authenticated reads, Server Actions handle internal mutations, and Route Handlers are reserved for non-UI HTTP endpoints.

**Rationale:**
ERP Fish is primarily an authenticated internal workflow application. Most operations happen from UI forms and dashboards rather than from public API consumers. Avoiding an extra API abstraction in MVP keeps the implementation simpler while still preserving clear server-side validation, authorization, and audit boundaries.

**Read Pattern:**
Use Server Components and server-side query helpers for page data. Queries must enforce authorization before returning store-specific ledger, report, or master data.

**Mutation Pattern:**
Use Server Actions for internal mutations such as saving ledger steps, closing ledgers, adding corrections, changing thresholds, and editing master data.

Current HQ ledger and settings actions are feature-specific rather than generic route handlers:

- HQ ledger and correction: `saveHqLedgerSalesPayment`, `saveHqLedgerExpenses`, `saveHqLedgerPurchases`, `saveHqLedgerInventoryItems`, `saveHqLedgerInventoryAdjustment`, `saveHqLedgerLosses`, `saveHqLedgerWorkInfo`, `runHqLedgerClosePreflight`, `closeHqLedger`, and `createCorrectionRecord`.
- Master data and settings: `createStore`, `updateStore`, `updateStoreStatus`, `createProduct`, `updateProduct`, `updateProductStatus`, `createPurchaseStandard`, `updatePurchaseStandard`, `updatePurchaseStandardStatus`, `createLedgerInputCode`, `updateLedgerInputCode`, `updateLedgerInputCodeStatus`, and `updateAnomalyThresholdSettings`.

These actions share the same pattern: minimal identifier parsing where authorization depends on an id, authorization/scope checks, detailed validation, transactional writes where needed, audit logging, and route revalidation.

**Route Handler Pattern:**
Use Route Handlers only when an actual HTTP endpoint is useful, such as future webhooks, exports, health checks, or integration endpoints.

For the additional scope, Route Handlers are appropriate for authenticated eCount upload endpoints, generated exports, health checks, and any future webhook-like integration surface. Upload handlers must validate auth, parse files server-side, write import/audit records, and return row-level validation errors.

**Background and Scheduled Work Pattern:**

Scheduled alert delivery should not run as a browser-side effect. Use a Vercel Cron job, scheduled Route Handler, queue-backed worker, or equivalent deployment-supported mechanism. The scheduled job must load notification rules, compute alert conditions with shared calculations, send through LINE Messaging API or Telegram, and write `NotificationDeliveryLog` rows for success, failure, and retry attempts.

**tRPC Decision:**
Do not include tRPC in MVP. Reconsider only if the application develops a large client-side API surface where tRPC would remove meaningful duplication.

**Validation and Error Handling:**
All mutations use Zod schemas. Business errors should return field-level or action-level messages the UI can show. Unexpected errors should be logged on the server and return a generic user-facing message.

**Revalidation Strategy:**
After ledger, close, correction, threshold, or master-data changes, use Next.js revalidation APIs such as `revalidatePath` or tag-based revalidation so dashboards and reports do not show stale values.

**API Documentation:**
MVP does not require OpenAPI because the system has no public API. If external integrations are added later, document Route Handlers at that point.

### Frontend Architecture

**Decision:**
Use shadcn/ui on Tailwind CSS with a restrained internal ERP layout system.

**Rationale:**
ERP Fish users repeat the same operational workflows daily. The UI should prioritize scanning, comparison, accurate data entry, and clear status over marketing-style presentation. shadcn/ui provides accessible primitives and consistent composition while still allowing the product to own its component source code.

**Layout Pattern:**

- HQ users use a sidebar-based dashboard with status tables, filters, anomaly badges, and detail panels.
- Store managers use a mobile-friendly step-by-step ledger input flow.
- Ledger detail pages separate original values, correction-applied values, audit history, and validation results clearly.
- Additional HQ surfaces include product mapping review, eCount import, all-store inventory, product analysis, employee/work logs, payroll reference, fixed costs, monthly P&L, special-period reports, and notification settings.
- Store-manager purchase views must clearly distinguish editable manual lines from HQ-uploaded read-only lines.

**Component Pattern:**
Use shadcn/ui components first. Custom components should be domain composition components, such as `LedgerStatusBadge`, `ClosingStepForm`, `InventoryFlowTable`, `CorrectionSummary`, and `AnomalySignalList`.

Additional composition components may include `ProductMappingReview`, `EcountImportUploader`, `InventoryLotTracePanel`, `AllStoreInventoryTable`, `SensitiveMetricGuard`, `BulkCloseDialog`, `EmployeeWorkSelector`, `FixedCostForm`, `NotificationRuleForm`, and `DeliveryLogTable`.

**Form Strategy:**
Use explicit schemas for ledger step forms. Complex forms should use React Hook Form with Zod resolver or Server Action form state, depending on the implementation story. Server validation remains authoritative.

**State Management:**
Use URL state, server state, and local form state for MVP. Defer a global client-state library until there is clear repeated complexity that cannot be handled by these simpler patterns.

**Tables and Reports:**
Use shadcn Table for simple tables. Add TanStack Table only when sorting, filtering, pagination, column visibility, or row selection become complex enough to justify it.

Resizable dashboard and analysis tables may justify TanStack Table or an equivalent proven table utility. Column resizing must not become a security boundary or hide required error states; it is only a presentation preference.

**Charts:**
Use shadcn Chart/Recharts for monthly summaries, store comparisons, and report visuals.

**Responsive Requirements:**
Store manager ledger input must work at 390px mobile width. HQ dashboards can optimize for desktop/tablet first, but must remain readable on smaller screens for review tasks.

**Feedback and Accessibility:**
Use shadcn Skeleton, Alert, Badge, Sonner, Dialog, Sheet, and Empty patterns. Dialog, Sheet, and Drawer components must include titles for accessibility. Forms need clear labels and validation states.

**Performance Pattern:**
Keep the HQ dashboard query focused on the status row data needed for the morning meeting. Move heavy detail, audit history, and report drilldowns to separate pages or panels.

### Infrastructure & Deployment

> **As-deployed record:** The actual production stack, infrastructure, resource
> identifiers, and the exact deploy procedure that were applied are recorded in
> `docs/production-deployment.md` (first deployed 2026-06-21 on Vercel with Neon
> Postgres via the Vercel Marketplace integration). The text below is the
> original design intent.

**Decision:**
Deploy the application on Vercel with separate Local, Preview, and Production environments. Use a managed PostgreSQL provider through Vercel Marketplace, such as Neon Postgres or an equivalent production-ready Postgres service.

**Rationale:**
The user selected Vercel as the deployment preference. Next.js and Vercel are a natural fit, and the project scale does not require custom infrastructure in MVP. Managed Postgres keeps operational load low while preserving relational guarantees.

**Hosting Strategy:**
Use Vercel for Next.js hosting, preview deployments, production deployment, and runtime environment management.

**Environment Strategy:**

- Local: developer machine with `.env`, pulled through Vercel CLI where useful.
- Preview: automatic deployment for pull requests and non-production branches.
- Production: main production branch and production environment variables.

**Database Strategy:**
Use managed Postgres, connected through Vercel Marketplace when practical. Vercel Postgres itself is no longer the new-project default, so the implementation should choose a Marketplace Postgres provider and verify connection pooling, backups, and region.

**CI/CD Strategy:**
Use GitHub integration with Vercel. Pull requests produce Preview Deployments. Production deploys come from the production branch after checks pass.

**Migration Strategy:**
Prisma migrations must be part of the release process. Production migrations should be explicit and reviewed, especially for ledger, correction, audit, and master-data tables.

**Logging and Monitoring:**
Use Vercel Logs and Observability for infrastructure/runtime visibility. Keep business audit logs in the application database; do not rely on infrastructure logs for audit requirements.

**Backups and Recovery:**
Before production launch, confirm the managed Postgres provider's backup and point-in-time recovery capabilities. Daily ledger and correction records are business-critical data.

**Scaling Strategy:**
MVP scale is small, around 7 to 10 stores, so serverless Next.js plus managed Postgres is sufficient. Realtime infrastructure, background queues, and external integration workers are deferred until requirements demand them.

The additional alert scope creates a requirement for scheduled background execution. Start with deployment-native cron/scheduled handlers before introducing a queue. Add a queue only if delivery retries, long-running uploads, or external API limits outgrow cron-style processing.

**File Storage Strategy:**
MVP does not require persistent file upload storage. Report exports can start as generated downloads. For eCount Excel upload, the system may parse and discard the binary after storing row-level trace data, or store the original file in managed blob storage if audit policy requires it. Do not commit uploaded files or operational exports to the repository.

### Decision Impact Analysis

**Critical Decisions (Block Implementation):**

- Create T3 App with TypeScript, Next.js, Prisma, PostgreSQL, NextAuth.js/Auth.js, Tailwind CSS, and shadcn/ui.
- PostgreSQL relational schema with Prisma migrations.
- Server-side authorization for every ledger, report, correction, master-data, and settings action.
- Append-only audit and correction records.
- Server-side calculation functions shared by dashboard, detail pages, and reports.

**Important Decisions (Shape Architecture):**

- Server Components for reads, Server Actions for internal mutations, Route Handlers only for true HTTP endpoints.
- shadcn/ui component system for consistent ERP screens.
- URL state, server state, and local form state before adding a global client-state library.
- Vercel Preview/Production deployment flow with managed Postgres.

**Deferred Decisions (Post-MVP):**

- tRPC adoption, unless the client API surface becomes large enough to justify it.
- Public OpenAPI documentation, until external integrations are introduced.
- Realtime updates, background queues, and external integration workers.
- File/blob storage beyond generated report downloads.
- Sentry or another dedicated error tracker, unless Vercel logs are insufficient during MVP.

**Implementation Sequence:**

1. Scaffold the T3 project and initialize shadcn/ui.
2. Configure database, Prisma, authentication, and environment variables.
3. Build the core schema for users, stores, ledgers, inventory, corrections, audit logs, and master data.
4. Implement authenticated server helpers and authorization guards.
5. Implement ledger input, calculation, validation, close, correction, and audit patterns.
6. Build HQ dashboard, reports, and store manager input flows using shared server calculations.

**Cross-Component Dependencies:**

Authorization, audit logging, correction-applied values, and calculation functions affect nearly every feature. These should be implemented as shared server-side patterns before feature teams or AI agents build individual screens.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
The main risk is not individual feature complexity. The risk is different agents making different small decisions for naming, file placement, action return shapes, validation, authorization, audit logging, and UI composition. These rules keep implementation consistent.

### Naming Patterns

**Database Naming Conventions:**

- Prisma models use `PascalCase`: `DailyLedger`, `InventorySnapshot`, `CorrectionRecord`, `AuditLog`.
- Prisma fields use `camelCase`: `storeId`, `closingDate`, `createdAt`.
- Relation fields use clear domain names: `store`, `createdBy`, `closedBy`, `corrections`.
- Unique constraints and indexes should be named when the meaning matters, such as `dailyLedger_storeId_closingDate_key`.

**API and Action Naming Conventions:**

- Server Actions use verb-first camelCase names and may include domain qualifiers when the permission boundary matters: `saveLedgerStep`, `saveHqLedgerSalesPayment`, `runHqLedgerClosePreflight`, `closeHqLedger`, `createCorrectionRecord`, `createProduct`, `updateProductStatus`, `createLedgerInputCode`, `updateLedgerInputCodeStatus`, `updateAnomalyThresholdSettings`.
- Route Handlers are used only for true HTTP endpoints and use stable resource paths when needed: `/api/reports/export`, `/api/health`.
- Query parameters use camelCase in application code.

**Code Naming Conventions:**

- TypeScript variables and functions use `camelCase`.
- React components and exported types use `PascalCase`.
- Component filenames use `kebab-case.tsx`; exported component names remain `PascalCase`.
- Domain constants use clear uppercase names only when they are true constants, such as `LEDGER_STATUS`.

### Structure Patterns

**Project Organization:**

- Use feature-oriented folders under `src/features/{domain}` for business code.
- Suggested domains: `ledger`, `inventory`, `reports`, `master-data`, `auth`, `audit`, `corrections`, `dashboard`.
- Shared server-only helpers live under `src/server`.
- shadcn/ui primitives live under `src/components/ui`.
- Shared app-level layout components live under `src/components`.
- Domain composition components live inside their feature folders.

**File Structure Patterns:**

- Feature server actions: `src/features/{domain}/actions.ts`.
- Feature queries: `src/features/{domain}/queries.ts`.
- Feature validation schemas: `src/features/{domain}/schemas.ts`.
- Feature components: `src/features/{domain}/components/*.tsx`.
- Shared authorization helpers: `src/server/authz.ts`.
- Shared audit helpers: `src/server/audit.ts`.
- Shared calculation helpers: `src/server/calculations`.

### Format Patterns

**Action Response Formats:**
Expected validation and business errors should return a typed result rather than each action inventing its own shape.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
```

Unexpected errors may throw after being logged. User-facing messages should stay simple and not expose internals.

**Data Exchange Formats:**

- Database stores money as integer KRW values.
- Database stores dates/times as DateTime values.
- JSON boundaries use ISO strings for dates.
- UI formats dates in Korean user-facing form.
- Booleans remain true/false.
- Optional values should use `null` when the value is intentionally absent.

### Communication Patterns

**Event and Audit Patterns:**
MVP does not need a separate event bus. Business events that matter for traceability are represented as audit rows.

- Audit event names use dot notation: `ledger.updated`, `ledger.closed`, `correction.created`, `threshold.updated`.
- Audit payloads include actor, target entity, before value, after value, and reason when applicable.
- Audit writes should happen inside the same database transaction as the business change whenever possible.

**State Management Patterns:**

- Prefer server data and URL state over global client state.
- Form state stays local to the form or wizard step.
- Use URL parameters for filters, selected date, selected store, and report period when shareable or refresh-safe.

### Process Patterns

**Authorization Pattern:**
Every sensitive server action or query must call a shared authorization helper before touching business data. Do not rely on hidden UI controls as a security boundary.

**Validation Pattern:**
Every mutation validates input with schemas at the server boundary. For store-scoped mutations, use a two-stage validation pattern: first parse the minimal access-control fields such as `storeId` or `ledgerId`, run the shared authorization helper, then run detailed field validation before business writes.

UI validation may improve speed, but server validation is authoritative.

**Audit Pattern:**
All business-changing actions must either write an audit record directly through the shared helper or use a transaction helper that writes audit records.

**Error Handling Pattern:**

- Validation errors return field-level messages.
- Business rule errors return action-level messages.
- Unexpected errors are logged and returned as a generic failure message.
- `확인 필요`, `계산 불가`, and `데이터 부족` must use a shared status enum or display helper so reports, ledger review, uploads, FIFO, alerts, and dashboards do not drift into different labels for the same state.

**Loading State Pattern:**
Use shadcn Skeleton for page/table loading states, button disabled states with spinner for submitted forms, and Sonner for success/failure feedback where appropriate.

### Enforcement Guidelines

**All AI Agents MUST:**

- Use the shared authorization, validation, audit, and calculation helpers instead of creating one-off variants.
- Use shadcn/ui primitives before writing custom styled markup.
- Keep money in integer KRW values until UI formatting.
- Keep original ledger values and correction-applied values distinct.
- Keep dashboard, detail, and report calculations on shared server-side functions.
- Keep CAP-1 through CAP-18 operational data queryable and structured. Do not bury important dates, stores, employees, products, money, statuses, or history only in free-text notes.
- Exclude AI chatbot, natural language query, AI API calls, prompt storage, and AI analysis result storage from the current scope. If an AI-like request appears, split it into a later enhancement.

**Pattern Enforcement:**

- Code review should flag any duplicate calculation rule, one-off authorization check, custom audit format, or custom styled primitive that duplicates shadcn/ui.
- New patterns should be added to this architecture document before broad implementation.

### Pattern Examples

**Good Examples:**

- `saveLedgerStep` validates with `ledgerStepSchema`, checks store access with `requireStoreAccess`, writes ledger changes and audit rows in one transaction, then returns `ActionResult`.
- `LedgerStatusBadge` wraps shadcn `Badge` and maps domain status to semantic variants.
- `getHqDashboardRows` computes anomaly signals using the same calculation helpers used by ledger detail and reports.

**Anti-Patterns:**

- Recalculating profit margin differently in dashboard, report, and ledger detail code.
- Checking `user.role` only in a client component.
- Storing money as formatted strings such as `"1,000원"`.
- Creating custom badge, alert, table, or dialog markup when shadcn/ui already provides the primitive.

## Project Structure & Boundaries

### Complete Project Directory Structure

```text
erp_fish/
├── README.md
├── package.json
├── pnpm-lock.yaml
├── next.config.js
├── tsconfig.json
├── components.json
├── postcss.config.js
├── eslint.config.js
├── prettier.config.js
├── .env.example
├── .env
├── .gitignore
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── public/
│   └── assets/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── ledgers/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [ledgerId]/
│   │   │   │       └── page.tsx
│   │   │   ├── store-entry/
│   │   │   │   └── page.tsx
│   │   │   ├── reports/
│   │   │   │   ├── daily/
│   │   │   │   │   └── page.tsx
│   │   │   │   ├── comparison/
│   │   │   │   │   └── page.tsx
│   │   │   │   └── monthly/
│   │   │   │       └── page.tsx
│   │   │   └── master-data/
│   │   │       ├── stores/
│   │   │       │   └── page.tsx
│   │   │       ├── users/
│   │   │       │   └── page.tsx
│   │   │       ├── products/
│   │   │       │   └── page.tsx
│   │   │       ├── purchase-standards/
│   │   │       │   └── page.tsx
│   │   │       ├── codes/
│   │   │       │   └── page.tsx
│   │   │       └── anomaly-thresholds/
│   │   │           └── page.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   └── [...nextauth]/
│   │       │       └── route.ts
│   │       ├── reports/
│   │       │   └── export/
│   │       │       └── route.ts
│   │       └── health/
│   │           └── route.ts
│   ├── components/
│   │   ├── app-sidebar.tsx
│   │   ├── page-header.tsx
│   │   └── ui/
│   │       └── ...
│   ├── features/
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   ├── queries.ts
│   │   │   └── schemas.ts
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   ├── queries.ts
│   │   │   └── types.ts
│   │   ├── ledger/
│   │   │   ├── actions.ts
│   │   │   ├── components/
│   │   │   ├── queries.ts
│   │   │   ├── schemas.ts
│   │   │   └── types.ts
│   │   ├── inventory/
│   │   │   ├── actions.ts
│   │   │   ├── components/
│   │   │   ├── queries.ts
│   │   │   ├── schemas.ts
│   │   │   └── types.ts
│   │   ├── corrections/
│   │   │   ├── actions.ts
│   │   │   ├── components/
│   │   │   ├── queries.ts
│   │   │   └── schemas.ts
│   │   ├── audit/
│   │   │   ├── components/
│   │   │   ├── queries.ts
│   │   │   └── types.ts
│   │   ├── master-data/
│   │   │   ├── actions.ts
│   │   │   ├── components/
│   │   │   ├── queries.ts
│   │   │   ├── schemas.ts
│   │   │   └── types.ts
│   │   └── reports/
│   │       ├── components/
│   │       ├── export.ts
│   │       ├── queries.ts
│   │       └── types.ts
│   ├── lib/
│   │   ├── action-result.ts
│   │   ├── constants.ts
│   │   ├── format.ts
│   │   └── utils.ts
│   ├── server/
│   │   ├── auth.ts
│   │   ├── authz.ts
│   │   ├── audit.ts
│   │   ├── db.ts
│   │   ├── env.ts
│   │   ├── transactions.ts
│   │   └── calculations/
│   │       ├── ledger.ts
│   │       ├── inventory.ts
│   │       ├── anomaly.ts
│   │       └── reports.ts
│   ├── styles/
│   │   └── theme-notes.md
│   └── middleware.ts
└── tests/
    ├── unit/
    │   └── *.test.mjs
    ├── e2e/
    │   ├── global-setup.ts
    │   ├── hq-dashboard.spec.ts
    │   ├── master-data-codes.spec.ts
    │   ├── master-data-products.spec.ts
    │   ├── master-data-purchase-standards.spec.ts
    │   ├── master-data-stores.spec.ts
    │   └── store-ledger-entry.spec.ts
```

### Architectural Boundaries

**API Boundaries:**
Most product behavior uses Server Components and Server Actions, not public API endpoints. Route Handlers are limited to authentication, health checks, exports, and future external integrations.

**Component Boundaries:**
`src/components/ui` contains shadcn/ui primitives only. Feature folders own business components. Shared app shell components such as sidebar and page header live in `src/components`.

**Service Boundaries:**
`src/server` owns cross-cutting server behavior: database access, auth session loading, authorization, audit logging, transactions, and calculations. Feature code may call these helpers but should not reimplement them.

**Data Boundaries:**
Prisma schema is the source of truth for persisted data. Feature queries should return view-ready data shapes, but calculation rules remain in shared server calculation modules.

### Requirements to Structure Mapping

**Feature Mapping:**

- FR-1 to FR-3, authentication, access control, and change history: `src/features/auth`, `src/features/audit`, `src/server/auth.ts`, `src/server/authz.ts`, `src/server/audit.ts`.
- FR-4 to FR-12, daily ledger input: `src/features/ledger`, `src/features/inventory`, `src/app/app/store-entry`, `src/app/app/ledgers`.
- FR-13 to FR-14, calculations and validation: `src/server/calculations`, feature `schemas.ts`, `tests/unit/calculations`, `tests/unit/validation`.
- FR-15 to FR-17, HQ dashboard and anomaly signals: `src/features/dashboard`, `src/server/calculations/anomaly.ts`, `src/app/app/dashboard`, `src/app/app/master-data/anomaly-thresholds`.
- FR-18 to FR-21, HQ edits, closing, corrections: `src/features/ledger`, `src/features/corrections`, `src/features/audit`.
- FR-22 to FR-26, master data and settings: `src/features/master-data`, `src/app/app/master-data`.
- FR-27 to FR-29, reports: `src/features/reports`, `src/app/app/reports`, `src/app/api/reports/export`.
- CAP-1 and CAP-9, employee/work/payroll reference: `src/features/hr`, `src/features/payroll`, `src/app/app/hr`, `src/app/app/payroll`.
- CAP-5 to CAP-7, product mapping, imports, FIFO valuation: `src/features/product-mapping`, `src/features/imports`, `src/features/inventory-valuation`, `src/server/calculations/inventory`.
- CAP-4 and CAP-8, all-store inventory and product analysis: `src/features/inventory`, `src/features/reports`, `src/app/app/inventory`, `src/app/app/reports/product-analysis`.
- CAP-10, fixed costs and monthly P&L: `src/features/fixed-costs`, `src/features/reports`, `src/server/calculations/pnl`.
- CAP-11, notifications: `src/features/notifications`, `src/app/app/settings/notifications`, scheduled Route Handlers or worker entrypoints.
- CAP-12 and CAP-13, AI exclusion and sensitive metric filtering: `src/server/calculations`, `src/server/authz.ts`, query result mappers.

**Cross-Cutting Concerns:**

- Authorization: `src/server/authz.ts`.
- Audit logging: `src/server/audit.ts`.
- Transactions: `src/server/transactions.ts`.
- Shared calculations: `src/server/calculations`.
- Formatting: `src/lib/format.ts`.
- Action result shape: `src/lib/action-result.ts`.

### Integration Points

**Internal Communication:**
Pages call feature queries for reads. Forms call feature actions for mutations. Feature actions parse access-control identifiers, authorize the user, validate detailed input, run business logic, write audit records, and trigger revalidation.

**External Integrations:**
MVP has no required external business integrations. In the 2026-06-10 additional scope, eCount Excel upload and LINE/Telegram notification delivery are approved integrations. POS/card automation and AI features remain excluded. Approved integrations should enter through dedicated Route Handlers or scheduled workers, not through ad hoc UI-only actions.

**Data Flow:**
User input enters a page form and reaches a Server Action. Store-scoped actions parse the minimal identifier schema first, run authorization, then apply the detailed feature schema before transaction logic. Authorized writes update Prisma models, write audit rows, revalidate affected routes, and return an `ActionResult` to the UI.

### File Organization Patterns

**Configuration Files:**
Root-level config files are reserved for framework and tool configuration. Environment examples live in `.env.example`. Real environment files stay uncommitted.

**Source Organization:**
Business code is organized by feature under `src/features`. Shared infrastructure code is organized under `src/server`. General formatting and result helpers live under `src/lib`.

**Test Organization:**
Current automated tests live in `tests/unit` and `tests/e2e`. Calculation, validation, authorization, source-contract, ledger mutation, close, correction, dashboard, report, and master-data contracts are covered by `node:test` files in `tests/unit`. Browser-level workflows live in `tests/e2e` and are run through Playwright. Do not invent a separate `tests/integration` convention unless the repo actually adds that layer.

**Asset Organization:**
Static assets live in `public/assets`. Persistent uploaded files are deferred until a file storage decision is needed.

### Development Workflow Integration

**Development Server Structure:**
The app runs as a standard Next.js application. Local development uses `.env`, Prisma migrations, and seed data where needed.

**Build Process Structure:**
The build uses Next.js and TypeScript checks. Prisma generation must run before code that depends on Prisma Client.

**Deployment Structure:**
Vercel builds and deploys the Next.js app. Production deploys require reviewed Prisma migrations and production environment variables.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
The selected stack is coherent: Create T3 App, Next.js, TypeScript, Prisma, PostgreSQL, NextAuth.js/Auth.js, Tailwind CSS, shadcn/ui, and Vercel all fit the full-stack internal ERP shape. The architecture keeps business rules on the server, uses a relational data model for ledger integrity, and uses Vercel for deployment without requiring custom infrastructure in MVP.

**Pattern Consistency:**
The implementation patterns support the architectural decisions. Server Actions, shared authorization helpers, shared calculation modules, append-only audit/correction records, and shadcn/ui composition rules all reduce the risk of different agents implementing the same concern differently.

**Structure Alignment:**
The project structure supports the decisions. `src/features` owns domain behavior, `src/server` owns cross-cutting server concerns, `src/components/ui` owns shadcn primitives, and `prisma` owns persistence. The structure gives every FR category a clear implementation home.

### Requirements Coverage Validation ✅

**Feature Coverage:**
All seven PRD feature areas are architecturally supported: authentication/authorization, daily ledger input, calculations/validation, HQ dashboard/anomaly signals, HQ close/correction, master data/settings, and reports.

**Functional Requirements Coverage:**
FR-1 to FR-29 are mapped to specific feature folders, server helpers, database models, and UI routes. The architecture explicitly covers store-level access, ledger creation, staged input, inventory flow, corrections, audit history, anomaly thresholds, master data, and reporting.

**Non-Functional Requirements Coverage:**
Security is covered through server-side authorization. Audit traceability is covered through append-only audit and correction records. Data preservation is covered by original ledger locking after HQ close and correction-applied values. Responsive web and 390px mobile input are covered in frontend rules. Dashboard performance is addressed through focused dashboard queries and deferred heavy drilldowns.

### Implementation Readiness Validation ✅

**Decision Completeness:**
Critical decisions are documented: starter, database, ORM/migrations, authentication, authorization, API patterns, frontend patterns, deployment, audit, correction, validation, calculations, and caching.

**Structure Completeness:**
The project tree defines root config, app routes, feature folders, server helpers, Prisma files, tests, fixtures, and deployment-related files.

**Pattern Completeness:**
Naming, file placement, action result format, error handling, loading states, audit events, date/money formats, authorization, validation, and shadcn usage rules are defined with examples and anti-patterns.

### Gap Analysis Results

**Critical Gaps:**
None open.

**Important Handoff Notes:**

- Implementation stories should use one consistent auth vocabulary. The selected implementation base is NextAuth.js from the T3 starter, while Auth.js documentation may use newer naming. Do not mix APIs without an explicit migration decision.
- The PRD policy is authoritative: 검토 대기 does not lock original ledger values. Only HQ close locks the original ledger; after that, changes must be correction records.
- Production Prisma migration execution must be specified in the first deployment story before production launch.

**Nice-to-Have Gaps:**

- Dedicated error tracking such as Sentry can be added if Vercel logs are not enough during MVP.
- Public API documentation can be added when external integrations are introduced.
- Background jobs and realtime updates can be revisited after manual-input MVP stabilizes.

### Validation Issues Addressed

No blocking validation issues were found. The main risks were clarified as implementation handoff notes: auth API consistency, ledger lock policy, and production migration procedure.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**

- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**

- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** high

**Key Strengths:**

- Strong server-side boundary for authorization, validation, audit, and calculations.
- Clear relational data model direction for ledger, inventory, correction, and report integrity.
- Concrete project structure and feature mapping for AI-agent implementation.
- UI decision is appropriate for an internal ERP: shadcn/ui composition over custom markup.
- Deployment path is simple and aligned with the user's Vercel preference.

**Areas for Future Enhancement:**

- POS/card data and AI image recognition.
- Realtime status updates if HQ needs live dashboards.
- Dedicated observability/error tracking beyond Vercel logs.
- File/blob storage if attachments or uploaded evidence become part of the workflow.

**Additional Scope Readiness Note:**

The MVP architecture remains ready for implementation. The 2026-06-10 additional scope is a major backlog expansion and should be implemented in the Epic 6-first sequence: product mapping, eCount upload, FIFO valuation, inventory/product analysis, permission hardening, employee/reporting extensions, then notifications. Implementing later analytics or alerts before product mapping and FIFO are stable will increase rework risk.

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented.
- Use implementation patterns consistently across all components.
- Respect project structure and boundaries.
- Refer to this document for all architectural questions.
- Do not implement PRD excluded items in MVP unless a later story explicitly changes scope. CAP-1~CAP-18 are approved extension scope and must still follow the security, audit, calculation, and data preservation rules above. CAP-19 is contract/operations scope, not an automatic product implementation story.

**First Implementation Priority:**
Initialize the project using Create T3 App, configure PostgreSQL/Prisma/Auth, initialize shadcn/ui, and create the baseline server helpers for authorization, audit, action results, and calculations before building feature screens.

## PRD Alignment Addendum - 2026-06-11

### Source Review

This addendum aligns the completed architecture with the PRD updated on 2026-06-11, the approved `mvp-story-extraction-checklist.md`, and the latest PRD validation report.

**Decision:** No technology stack change is required. Create T3 App, Next.js, Prisma, PostgreSQL, Auth/NextAuth foundation, Tailwind, shadcn/ui, Vercel, shared server calculations, server-side authorization, and append-only audit/correction records remain the right architecture.

**Architecture change required:** Yes, but only as handoff guardrails. The PRD now makes implementation gating, permission profiles, edit-token conflict handling, and several extension controls explicit enough that implementation agents need them in the architecture document.

### Controlled Implementation Gate

The PRD is still `draft`, but the approved MVP story gate is usable.

- `mvp-story-extraction-checklist.md` is the authoritative G6 gate for MVP story generation.
- Only `MVP-S01`, `MVP-S02`, and `MVP-S03` may become implementation stories now.
- `MVP-S04` through `MVP-S10` must remain discovery or policy work until their linked OQs and closure artifacts are approved.
- Story generators must not treat `MVP 필수` as equal to `implementation story allowed`.
- The first implementation sequence should therefore start with baseline app setup, auth/permission/audit foundations, non-OQ basic ledger flows, non-sensitive basic calculations, and HQ-only report/export foundations.

### Authorization Update

The earlier two-role shorthand remains useful for product explanation, but implementation must model headquarters authority more carefully.

- `본사 사용자` is an umbrella term, not one unrestricted role.
- Server authorization must support action-level permission profiles such as headquarters admin, close manager, upload staff, settings admin, and read-only headquarters user.
- Store managers remain store-scoped and must not receive sensitive fields.
- Authorization helpers should check both store scope and action permission before any mutation or sensitive read.
- Audit events must record the actor account, permission context, target entity, before/after values where applicable, and reason for high-risk actions.

Implementation implication: `src/server/authz.ts` should expose explicit helpers for action checks, not only role checks. Examples: close permission, correction permission, upload commit permission, settings mutation permission, report/export permission, and store access.

### Concurrent Editing And Save Conflicts

The PRD now requires explicit protection against silent last-write-wins behavior.

- Daily ledger records need a server version or edit token.
- Partial saves and final submission must send the last-read token.
- The default conflict unit is the input step or section.
- Same-section field conflicts must be rejected or resolved explicitly.
- Different-section changes may merge only when audit records make the actor, section, and changed fields clear.
- Stale mobile/browser sessions must reload the latest ledger before saving.
- Headquarters forced edits may mark a ledger or section as `본사 수정 중`; store-manager saves must re-check current state before writing.

Implementation implication: ledger Server Actions should use optimistic concurrency checks inside transactions. Do not let form handlers update ledger rows without a version check.

### Sensitive Field Gate

The PRD split the old sensitive-metric question into OQ-10A and OQ-10B.

- OQ-10A controls MVP minimum blocking of sensitive fields across store-manager screens, server responses, export, shared links, cache responses, and alert templates.
- OQ-10B controls later CAP-13 advanced policy where headquarters may adjust field exposure.
- Until OQ-10A is approved, ambiguous cost/profit-derived fields default to hidden for store-manager paths.
- Until OQ-10B is approved, do not implement user-configurable sensitive-field exposure. Default deny and audit hardening are allowed.

Implementation implication: use shared response shaping on the server. Client-side hiding is not enough.

### Additional Data And UI Guardrails

The following PRD additions do not change the stack, but they do affect model and UI boundaries.

- CAP-16 작성자 이름 세션 캐싱: store the display author name through the whole ledger entry flow, but keep it separate from the authenticated account and audit actor.
- CAP-18 대시보드 그리드 리사이징: store headquarters dashboard layout preferences per user, provide reset-to-default, and enforce minimum visibility for core columns such as store name, ledger status, close status, anomaly signal, and latest update time.
- CAP-19 유지보수 및 서버 인프라 운영 대행: keep this as contract/operations scope. Do not convert it into product stories unless a later PRD or change proposal defines concrete product surfaces.

Recommended future model additions when the related story is promoted:

- Ledger-level `version` or section-level version metadata for optimistic concurrency.
- Permission profile/action mapping, or a fixed equivalent if the first release keeps profiles static.
- Ledger author display fields distinct from authenticated actor fields.
- User dashboard layout preference records.

### Updated Readiness Assessment

The architecture remains valid, but readiness is now controlled by the PRD gates.

**Overall Status:** READY FOR CONTROLLED IMPLEMENTATION

**Ready now:**

- App setup and shared foundations.
- MVP-S01 through MVP-S03 implementation stories.
- Server-side permission, audit, validation, response-shaping, and non-sensitive calculation foundations.

**Not ready for implementation stories yet:**

- MVP-S04 through MVP-S10.
- FIFO final valuation, `30%단가`, sensitive-field exposure approval, `차이` to `당일 판매량` meaning change, and other OQ-bound calculations.
- CAP-13 advanced configurable exposure, CAP-19 operations contract work, and any AI feature surface.

Agents should read the latest PRD and checklist before creating or implementing stories. If a requested story conflicts with the checklist, create a discovery/policy story instead of a product implementation story.
