---
story_key: 2-4-mvp-수동-매입-입력
story_id: "2.4"
epic: "2"
created_at: "2026-06-12T01:59:30+09:00"
source_story: "_bmad-output/planning-artifacts/epics.md"
baseline_commit: 70628d8
---

# Story 2.4: MVP 수동 매입 입력

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 지점장 또는 본사 사용자,
I want 장부에 품목별 매입 정보를 수동으로 입력할 수 있기를 원한다,
so that 이카운트 업로드 전에도 당일 매입 내역을 장부에 반영할 수 있다.

## Acceptance Criteria

1. Given 사용자가 매입 단계에 있을 때, when 품목, 규격, 단가, 수량, 매입금액을 입력한다, then 매입 라인은 해당 장부에 저장되어야 한다, and 숫자 값은 서버에서 검증되어야 한다.
2. Given 본사 매입 기준 또는 품목 마스터가 존재할 때, when 사용자가 매입 라인을 추가한다, then 사용자는 기준 정보를 선택하거나 참조할 수 있어야 한다, and 기준 정보가 없더라도 MVP 수동 입력 자체는 막히지 않아야 한다.
3. Given 품목 마스터 정규화 OQ-3이 아직 닫히지 않았을 때, when 사용자가 품목/규격을 입력한다, then 시스템은 원문 입력값을 보존해야 한다, and 초기 품목명/구분/규격 정규화 확정 구현을 이 스토리에 포함하지 않아야 한다.
4. Given 사용자가 매입 라인을 수정하거나 삭제할 때, when 저장 요청이 성공한다, then 변경 전/후 값은 감사 로그에 남아야 한다, and 장부 version 또는 edit token이 갱신되어야 한다.
5. Given 권한 없는 사용자가 매입 정보를 저장하려 할 때, when 서버 action이 요청을 처리한다, then 저장은 거부되어야 한다, and 권한 밖 장부의 매입 라인은 반환되지 않아야 한다.
6. Given 이카운트 업로드 요구가 존재할 때, when 이 스토리를 구현한다, then CAP-6 업로드 preview/commit/reprocess 기능은 구현하지 않아야 한다, and 나중에 업로드 매입 라인과 수동 매입 라인을 구분할 수 있는 확장 여지는 남겨야 한다.

## Tasks / Subtasks

- [x] 현재 매입 단계 구현 상태를 Story 2.4 요구와 대조한다. (AC: 1-6)
  - [x] `prisma/schema.prisma`, `src/app/app/store-entry/page.tsx`, `src/features/ledger/actions.ts`, `schemas.ts`, `queries.ts`, `types.ts`, `response-shaping.ts`, `step-completion.ts`, `purchase-step-client.tsx`, `src/features/master-data/product-queries.ts`, `purchase-standard-queries.ts`, `tests/unit/ledger-purchase.test.mjs`, `tests/e2e/store-ledger-purchase.spec.ts`를 먼저 읽는다.
  - [x] 이미 존재하는 `LedgerPurchaseItem`, `saveLedgerPurchases`, `ledgerPurchaseSchema`, `PurchaseStepClient`, `calculatePurchaseTotal`, `StoreEntryStepNavigation`, `LedgerSaveStatus`, `UnsavedChangeDialog`, `version` conflict guard, `requireStoreAccess`, `writeAuditLog` 패턴을 삭제하거나 병렬 구현하지 않는다.
  - [x] 신규 gap을 분리한다: 기준 정보가 없어도 수동 입력 가능, 원문 품목/규격 snapshot 보존, 매입 라인 source 확장 여지, 서버 숫자/권한/version 검증, 지점장 민감 필드 차단, 390px 모바일 회귀.
- [x] 수동 매입 데이터 모델과 저장 contract를 Story 2.4 AC에 맞게 보강한다. (AC: 1-4, 6)
  - [x] `LedgerPurchaseItem`은 품목명, 구분, 규격, 단가, 수량, 매입금액을 장부 라인 snapshot으로 보존해야 한다. 품목 마스터나 매입 기준이 나중에 변경되어도 과거 장부 라인의 원문 표시가 바뀌면 안 된다.
  - [x] 현재 `LedgerPurchaseItem.productId`와 `purchaseStandardId`가 기준 정보 없음 입력을 막는지 확인한다. 기준 정보가 없는 MVP 수동 입력을 만족하려면 `purchaseStandardId`를 신규 라인 필수로 두지 말고, 필요하면 `productId` nullable 또는 raw product snapshot 입력 경로를 명시적 migration으로 추가한다.
  - [x] 기준 정보가 존재하는 경우에는 active `Product`/active `PurchaseStandard`를 선택 또는 참조할 수 있게 한다. 단, inactive 기준은 신규 선택지/신규 저장에 사용하지 않고 과거 snapshot 표시는 유지한다.
  - [x] 나중에 업로드 매입과 수동 매입을 구분할 수 있도록 `sourceType = MANUAL` 또는 동등한 persisted/source contract를 추가하거나, 현재 manual-only schema가 이후 upload source와 충돌하지 않음을 명시한다.
  - [x] 기존 migration 파일을 수정하지 않는다. schema 변경이 필요하면 새 Prisma migration을 추가한다.
- [x] 매입 저장 Server Action을 보강한다. (AC: 1, 2, 4, 5)
  - [x] `ledgerPurchaseSchema`는 `ledgerId`, `storeId`, `closingDate`, `version`, 매입 라인 배열을 검증한다.
  - [x] 단가, 수량, 매입금액은 0 이상 안전 정수이고 DB 저장 가능 범위 이하여야 한다. 빈 문자열, 음수, 소수, 쉼표 포함 문자열, overflow는 field error로 거부한다.
  - [x] 매입금액은 서버에서 `unitPrice * quantity`로 계산한다. client draft 합계는 보조 표시이며 저장 기준이 아니다.
  - [x] 저장 대상은 `ledgerId` 단독이 아니라 `storeId + closingDate + ledgerId + version` 조합으로 현재 장부와 일치해야 한다.
  - [x] `IN_PROGRESS`와 `IN_REVIEW`에서만 원본 매입 라인을 저장한다. `HEADQUARTERS_CLOSED`와 `HOLIDAY`는 client disabled와 server action 차단을 모두 유지한다.
  - [x] 저장 성공 시 같은 transaction 안에서 기존 매입 라인 교체 또는 diff 저장, `DailyLedger.version` 증가, `updatedAt`, `stepCompletion.purchase`, `purchaseTotal` 반환, audit 기록을 처리한다.
  - [x] 권한 없는 store/ledger 요청은 `requireStoreAccess`에서 차단하고 권한 밖 장부의 매입 라인 세부 값을 반환하지 않는다.
- [x] 매입 단계 UI를 기존 StepForm 흐름 안에서 완성한다. (AC: 1-3, 6)
  - [x] `PurchaseStepClient`는 품목/규격/구분, 단가, 수량, 서버 기준 매입금액/합계, 저장 상태, 저장 실패 재시도, 행 추가/삭제를 제공한다.
  - [x] 기준 정보가 있으면 product/purchase standard 선택으로 단가와 참조 정보를 prefill하되 사용자가 실제 단가를 수정할 수 있어야 한다.
  - [x] 기준 정보가 없으면 "선택 가능한 active 품목 또는 매입 기준이 없습니다"에서 멈추지 말고, Story 2.4 범위의 수동 원문 입력 경로를 제공한다.
  - [x] `inputMode="numeric"`, `tabular-nums`, 최소 `min-h-11` 터치 target, field-level error, 첫 오류 focus 이동을 유지한다.
  - [x] 지점장에게 재고금액, FIFO lot 근거, 매출원가, 매출이익, 이익률, 영업이익, 인당생산성 같은 민감 파생값을 노출하지 않는다.
  - [x] CAP-6 업로드 UI, 파일 선택, preview/commit/void/reprocess, batch 상태 관리는 만들지 않는다. 향후 업로드 행이 추가될 때 수동 행과 다르게 읽히도록 source 표시 경계를 해치지 않는다.
- [x] 기존 7단계 흐름과 저장 안정성을 회귀 없이 유지한다. (AC: 1-6)
  - [x] 단계 이동 link는 `storeId`와 KST `date=YYYY-MM-DD`를 보존한다. ISO timestamp query를 재도입하지 않는다.
  - [x] 미저장 변경 상태에서 매입 단계 이동 시 저장, 취소, 계속 편집 dialog를 유지한다.
  - [x] 저장 성공 toast만으로 완료를 표현하지 말고 `LedgerSaveStatus`에 마지막 저장 시각, 실패 메시지, 재시도 가능 여부를 남긴다.
  - [x] `StoreEntryStepNavigation`의 `3단계: 매입 저장됨` 표시가 최신 `stepCompletion.purchase`에 맞게 갱신되는지 확인한다.
  - [x] `reconcileLedgerInventoryAdjustments`가 매입 변경 후 기존 재고/조정 흐름을 깨지 않는지 확인한다.
- [x] 감사, 권한, response shaping, revalidation을 기존 공통 패턴으로 유지한다. (AC: 4, 5)
  - [x] audit action 이름은 기존 dot notation을 유지한다: `ledger.purchases.saved`.
  - [x] audit payload에는 변경 전/후 매입 라인, 매입 합계, 작성자 표시명, version, source/manual 구분 값이 포함되어야 한다.
  - [x] business write와 `writeAuditLog(tx, ...)`는 같은 transaction 안에 있어야 한다.
  - [x] mutation 성공 후 `/app/store-entry`, `/app/dashboard`, `/app/reports/daily`, `/app/reports/monthly` revalidation을 유지한다.
  - [x] 지점장 응답은 `toStoreManagerLedgerCostStepData` 또는 동등 safe shape를 거쳐야 한다. 민감 필드를 client에서만 숨기면 안 된다.
- [x] 테스트를 추가/갱신한다. (AC: 1-6)
  - [x] `tests/unit/ledger-purchase.test.mjs`에서 schema edge case, 기준 정보 없는 수동 입력 허용, 기준 정보 snapshot 보존, server-side amount 계산, overflow, source/manual contract, audit/revalidation source contract를 검증한다.
  - [x] `tests/unit/ledger-sales.test.mjs` 또는 기존 focused test에서 `version` conflict와 `storeId + closingDate + ledgerId` guard가 매입 저장에도 적용되는 source contract를 검증한다.
  - [x] `tests/e2e/store-ledger-purchase.spec.ts`에서 여러 매입 라인 저장/재방문/합계, product/standard prefill, 기준 정보 없는 수동 입력, master 변경 후 snapshot 표시, 삭제 후 저장, 390px 표시를 검증한다.
  - [x] 권한 없는 `storeId`, stale `version`, `HEADQUARTERS_CLOSED`, `HOLIDAY` 저장 시 데이터가 변경되지 않고 권한 밖 매입 라인이 노출되지 않는지 unit/e2e 중 하나에서 확인한다.
  - [x] CAP-6 업로드 관련 UI/API가 이 story에서 생기지 않았음을 source-level test 또는 review checklist로 확인한다.

## Dev Notes

### Source Context

- Epic 2는 지점장 또는 본사가 하루 장부를 만들고 매출/비용/매입/재고/손실/근무 정보를 모바일 우선 7단계 흐름으로 입력하는 영역이다. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 2: 지점 일일 장부 입력`]
- Story 2.4는 MVP 수동 매입 입력, 기준 정보 참조, 기준 정보가 없어도 수동 입력 가능, 원문 품목/규격 보존, 감사/version/권한 차단, CAP-6 업로드 제외를 요구한다. [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.4: MVP 수동 매입 입력`]
- PRD FR-8은 품목, 규격, 단가, 수량, 매입금액 입력을 요구하며 MVP에서는 지점장과 본사 사용자 모두 수동 매입을 입력할 수 있다고 정의한다. [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#FR-8: 매입 입력`]
- PRD FR-25는 매입 기준 변경이 과거 장부의 원본 매입 라인을 임의 변경하지 않아야 한다고 정의한다. [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#FR-25: 매입 기준 관리`]
- PRD CAP-5는 원문 품목명을 과거 장부와 업로드 trace에 보존해야 한다고 정의한다. OQ-3이 닫히기 전에는 분석용 품목 정규화 확정 구현을 이 story에 넣지 않는다. [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#CAP-5: 품목명/규격 정규화`]
- PRD CAP-6은 이카운트 업로드 preview/commit/void/reprocess와 업로드 라인/source identity 요구를 후속 Extension B 범위로 둔다. 이 story는 업로드 구현이 아니라 수동 라인과 미래 업로드 라인의 구분 여지를 남기는 범위다. [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#CAP-6: 이카운트 엑셀 업로드 기반 매입 자동 생성`]
- UX Flow 2는 3단계 매입에서 품목 마스터 선택, 수량, 단가, 합계 자동 표시를 요구한다. Flow 3은 본사 스텝이 누락 매입을 보완하고 이력에 본사 수정으로 남기는 흐름을 요구한다. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md#Flow 2 — 현대 지점장이 하루 장부를 입력한다`]

### Current Repository State

- Sprint status의 authoritative key는 `2-4-mvp-수동-매입-입력`이고 story 생성 전 상태는 `backlog`였다. [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml`]
- 현재 `_bmad-output/implementation-artifacts`에는 `2-4-*` story 파일이 없다. worktree에는 사용자가 삭제한 과거 stale `2-4-*` 파일이 있으며, 이 workflow는 그 삭제를 되돌리지 않는다. [Source: `git status --short`]
- Story 2.3은 완료 상태이며 매출/결제와 비용 저장에서 `version`, `requireStoreAccess`, `writeAuditLog`, `LedgerSaveStatus`, `UnsavedChangeDialog`, KST date query 보존 패턴을 강화했다. [Source: `_bmad-output/implementation-artifacts/2-3-매출-결제와-비용-입력.md`]
- 현재 Prisma에는 `Product`, `PurchaseStandard`, `LedgerPurchaseItem` 모델이 있다. `LedgerPurchaseItem`은 `productId`, `purchaseStandardId?`, `productName`, `productCategory`, `productSpec`, `unitPrice`, `quantity`, `amount`, `referenceInfo` snapshot을 가진다. [Source: `prisma/schema.prisma`]
- 현재 `ledgerPurchaseSchema`는 신규 라인에서 `purchaseStandardId`를 요구한다. 이는 AC 2의 "기준 정보가 없더라도 MVP 수동 입력 자체는 막히지 않아야 한다"와 충돌할 수 있다. [Source: `src/features/ledger/schemas.ts`]
- 현재 `PurchaseStepClient`는 active product와 active purchase standard option이 둘 다 있어야 항목 추가/저장이 가능하다. 기준 정보 없음 수동 입력 경로가 필요하다. [Source: `src/features/ledger/components/purchase-step-client.tsx`]
- 현재 `saveLedgerPurchases`는 `requireStoreAccess`, transaction, active standard/product 조회, 기존 snapshot 유지, line 전체 교체, `reconcileLedgerInventoryAdjustments`, audit, revalidation을 사용한다. 이 패턴은 유지하되 기준 정보 없음 입력과 source 구분 gap을 보강한다. [Source: `src/features/ledger/actions.ts`]
- 현재 `toStoreManagerLedgerCostStepData`는 `grossProfit`과 `productivity`를 지점장 응답에서 제거한다. 매입 단계 변경이 이 response shaping을 우회하면 안 된다. [Source: `src/features/ledger/response-shaping.ts`]
- 현재 `tests/unit/ledger-purchase.test.mjs`와 `tests/e2e/store-ledger-purchase.spec.ts`가 존재한다. 일부 seed label이 `스토리2-3`으로 남아 있어, 테스트를 수정할 때 Story 2.4 이름과 혼동하지 않게 정리한다. [Source: `tests/unit/ledger-purchase.test.mjs`, `tests/e2e/store-ledger-purchase.spec.ts`]

### Architecture Guardrails

- 선택 스택은 Create T3 App 기반 Next.js App Router, TypeScript, Prisma, PostgreSQL, NextAuth/Auth.js, Tailwind CSS, shadcn/ui, Vercel이다. Story 2.4에서 ORM, auth framework, UI primitive 체계를 바꾸지 않는다. [Source: `_bmad-output/planning-artifacts/architecture.md#Starter Template Evaluation`]
- Prisma schema and migrations are the source of truth for persisted data. 매입 라인 schema 변경은 새 migration으로 반영한다. [Source: `_bmad-output/planning-artifacts/architecture.md#Data Architecture`]
- 대부분의 제품 동작은 Server Components와 Server Actions를 사용한다. 수동 매입 저장을 위해 public API route를 만들지 않는다. [Source: `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`]
- 모든 mutation은 Zod validation, shared authorization helper, transaction, audit, revalidation을 따라야 한다. [Source: `_bmad-output/planning-artifacts/architecture.md#Process Patterns`]
- Store manager responses must omit sensitive accounting fields. 매입 입력값과 매입 합계는 현장 입력 범위이지만, 원가 lot 근거, 재고금액, 매출원가, 이익/마진 파생값은 지점장 응답에서 제외한다. [Source: `_bmad-output/planning-artifacts/architecture.md#Sensitive Field Gate`]
- Daily ledger records need a server version or edit token. 매입 저장은 stale mobile/browser save를 조용히 덮어쓰면 안 된다. [Source: `_bmad-output/planning-artifacts/architecture.md#Concurrent Editing And Save Conflicts`]
- CAP-1~CAP-18은 approved extension scope지만 OQ gate를 따른다. Story 2.4는 MVP 수동 매입이며 CAP-6 업로드와 CAP-7 FIFO lot 계산을 구현하지 않는다. [Source: `_bmad-output/planning-artifacts/architecture.md#Implementation Handoff`]

### Data and Security Guardrails

- 저장 대상은 `ledgerId` 단독이 아니라 `storeId + closingDate + ledgerId + version` 조합으로 검증한다.
- 금액과 수량은 DB와 계산 경계에서 integer로 유지한다. UI formatting 문자열을 서버로 그대로 저장하지 않는다.
- 매입금액과 매입 합계는 서버 계산 결과를 authoritative response로 사용한다.
- 품목/규격/구분 원문 snapshot은 과거 장부의 증거다. active master 변경, 기준 비활성화, 향후 정규화 정책으로 과거 snapshot을 덮어쓰지 않는다.
- 기준 정보가 없는 수동 입력을 지원하더라도 hidden master data를 자동 생성하지 않는다. master 생성은 Epic 5 기준정보 관리와 감사 경계를 따른다.
- CAP-6 전에는 upload batch, source row, preview edit version, void/reprocess를 만들지 않는다. 다만 manual line source가 future upload source와 구분 가능해야 한다.
- `HEADQUARTERS_CLOSED` 후 오류 수정은 원본 매입 수정이 아니라 정정 기록 흐름이다.
- 지점장 응답은 server response shaping을 거쳐야 한다. 민감 필드를 client에서만 숨기는 방식은 금지다.

### File Structure Requirements

- 예상 UPDATE 파일:
  - `prisma/schema.prisma`
  - `prisma/migrations/*_ledger_purchase_manual_source_or_raw_snapshot*/migration.sql` if schema change is needed
  - `src/features/ledger/actions.ts`
  - `src/features/ledger/schemas.ts`
  - `src/features/ledger/queries.ts`
  - `src/features/ledger/types.ts`
  - `src/features/ledger/response-shaping.ts`
  - `src/features/ledger/step-completion.ts`
  - `src/features/ledger/components/purchase-step-client.tsx`
  - `src/app/app/store-entry/page.tsx` only if option loading or no-basis UI requires changed props
  - `src/features/master-data/product-queries.ts` and `src/features/master-data/purchase-standard-queries.ts` only if active/inactive option contracts need adjustment
  - `tests/unit/ledger-purchase.test.mjs`
  - `tests/e2e/store-ledger-purchase.spec.ts`
- 예상 NEW 파일:
  - Optional: `src/features/ledger/purchase-line-source.ts` or equivalent helper if source/manual normalization is reused.
  - Optional: `tests/unit/ledger-purchase-source.test.mjs` if source/manual contract is clearer as a focused test.
- 금지:
  - 신규 public API route for purchase saves.
  - `LedgerPurchaseItem`와 병렬인 별도 manual purchase persistence table unless explicitly justified by AC 2 and documented in migration notes.
  - CAP-6 upload preview/commit/reprocess implementation.
  - FIFO lot/remaining quantity calculation or `PurchaseLot` implementation.
  - 품목명/규격 정규화 확정 구현.
  - 지점장 민감 회계 지표 노출.
  - 기존 migration 수정.
  - unrelated dirty worktree revert.

### UX Guardrails

- 장부 입력은 반복 업무 task surface다. 매입 단계는 현재 선택된 지점+영업일 장부 context 안에서 바로 입력 가능해야 한다.
- 7단계 순서와 label은 유지한다: 매출/결제, 비용, 매입, 재고, 손실/폐기/떨이, 근무인원/특이사항, 검토/제출.
- 매입 라인은 품목/규격/구분, 단가, 수량, 매입금액을 한눈에 확인할 수 있어야 한다.
- 기준 정보가 있으면 선택/참조가 빠르게 되어야 하지만, 기준 정보 없음은 막힌 화면이 아니라 수동 입력 가능 상태여야 한다.
- 숫자 입력은 `inputMode="numeric"`과 `tabular-nums`를 유지한다.
- 저장 상태는 색상만으로 전달하지 않는다. "저장됨", "저장 중", "저장 실패", "마지막 저장" 텍스트를 포함한다.
- 버튼/입력은 최소 44px 터치 목표를 유지한다. 현재 구현의 `min-h-11` 패턴을 보존한다.
- 390px 모바일에서 header, step navigation, 행 추가/삭제, 단가/수량 입력, 저장/다음 버튼이 겹치지 않아야 한다.
- 지점장에게 원가, 이익/마진, 인당생산성, 재고금액, lot 근거를 노출하지 않는다.

### Previous Story Intelligence

- Story 2.1의 date query serialization 회귀를 피한다. 새 link와 dirty guard destination은 `getKstLedgerDateParam`을 사용해야 하며 ISO timestamp를 query에 넣지 않는다. [Source: `_bmad-output/implementation-artifacts/2-1-지점-일자-장부-생성과-상태-관리.md`]
- Story 2.1의 `version` guard와 `LEDGER_CONFLICT` message를 유지한다. 매입 저장은 stale form 값을 조용히 덮어쓰면 안 된다. [Source: `_bmad-output/implementation-artifacts/2-1-지점-일자-장부-생성과-상태-관리.md`]
- Story 2.2의 작성자 표시명은 장부 입력 흐름 전체에 유지되며 audit actor와 구분된다. 매입 audit payload에서도 이 의미를 유지한다. [Source: `_bmad-output/implementation-artifacts/2-2-장부-입력-7단계-폼과-작성자-표시명-유지.md`]
- Story 2.2의 `LedgerSaveStatus`, `UnsavedChangeDialog`, `useUnsavedStepGuard`가 단계별 저장 안정성 표면이다. 매입 단계에서 별도 modal/status 패턴을 새로 만들지 않는다. [Source: `_bmad-output/implementation-artifacts/2-2-장부-입력-7단계-폼과-작성자-표시명-유지.md`]
- Story 2.3은 비용 코드에서 active 신규 선택과 과거 inactive 표시 보존을 구분했다. 매입 기준과 품목도 같은 원칙을 따른다: 신규 저장은 active 기준, 과거 snapshot은 원문 표시 보존. [Source: `_bmad-output/implementation-artifacts/2-3-매출-결제와-비용-입력.md`]
- Story 1.4 established server-side sensitive response shaping. 매입 단계가 `purchaseTotal`을 포함하더라도 `grossProfit`, `productivity`, 원가/마진/재고금액은 지점장 응답에서 제거해야 한다. [Source: `_bmad-output/implementation-artifacts/1-4-서버-권한-헬퍼와-민감-필드-응답-차단.md`, `src/features/ledger/response-shaping.ts`]
- Story 1.5 established transaction-bound `writeAuditLog(tx, ...)`. 매입 변경은 business update와 audit write를 같은 transaction 안에 유지한다. [Source: `_bmad-output/implementation-artifacts/1-5-감사-로그-기반-구축.md`, `src/server/audit.ts`]
- Recent git history includes `70628d8 feat(story-2.3): 매출 결제 비용 입력 보강`, `d88f772 feat(story-2.2): 장부 입력 작성자 표시명 유지`, and `90f66b3 feat(story-2.1): 지점 일자 장부 생성 상태 관리`. Current implementation should be read from files, but these commits confirm story order. [Source: `git log --oneline -5`]

### Testing Requirements

- Run focused unit tests:
  - `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-purchase.test.mjs`
  - `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-sales.test.mjs`
  - `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-cost-labor.test.mjs`
  - any new focused purchase-source/raw-input unit test.
- Run focused E2E:
  - `PORT=31xx DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-purchase.spec.ts`
- Run full verification before moving to review:
  - `corepack pnpm exec prisma generate`
  - `corepack pnpm exec prisma validate`
  - `corepack pnpm lint`
  - `corepack pnpm typecheck`
  - `corepack pnpm test:unit`
  - `corepack pnpm build`
- If the local database or Playwright browser dependencies are unavailable, record the skipped command and exact blocker in Dev Agent Record.

### Latest Technical Information

- Package versions in this workspace: Next.js `^15.2.3`, React `^19.0.0`, Prisma `^6.6.0`, NextAuth `5.0.0-beta.25`, Tailwind CSS `^4.0.15`, shadcn `^4.8.2`, Playwright `^1.60.0`, Zod `^3.24.2`. [Source: `package.json`]
- Story 2.4 introduces no new external API or library. Network research was not performed in this create-story run; use pinned workspace versions and established Story 2.1-2.3 implementation patterns unless a dev agent explicitly upgrades dependencies.

### Project Context Reference

- Workflow persistent facts requested `file:{project-root}/**/project-context.md`, but no `project-context.md` file was found in the repository.
- Discovery loaded: `epics.md`, `architecture.md`, PRD shard `prds/prd-erp_fish-2026-05-28-2/prd.md`, UX `DESIGN.md`/`EXPERIENCE.md`, previous Stories 2.1-2.3, current ledger/master-data code, purchase unit/e2e tests, sprint status, git status/history, and package versions.

### Implementation Boundaries

- 포함: MVP 수동 매입 라인 저장, active 기준 정보 참조, 기준 정보 없음 수동 입력, 원문 품목/규격 snapshot 보존, 서버 금액 계산, version/audit/revalidation/권한 guard, manual source 구분 여지, 390px 입력성 및 저장 안정성 회귀 테스트.
- 제외: 이카운트 업로드 file parser, upload preview/commit/void/reprocess, upload batch 상태 모델, source row idempotency, 품목명/규격 정규화 확정, FIFO lot/잔량/원가 계산, `PurchaseLot`, 재고금액 확정 계산, 본사 통합 재고, 상품별 관리자 분석, 월 손익, 지점장 민감 회계 지표 노출 정책 고도화.
- 이 story는 "매입 기능을 처음부터 새로 만드는" 작업이 아니다. 현재 구현된 purchase step을 Story 2.4 AC에 맞게 검증하고 기준 정보 없음/원문 보존/source 확장 gap을 보강한다.

### Validation Notes

- Checklist 재분석 결과 핵심 위험은 7가지다.
- Critical 1: 현재 `ledgerPurchaseSchema`와 `PurchaseStepClient`는 purchase standard가 없으면 신규 저장을 막을 수 있다. AC 2는 기준 정보가 없어도 수동 입력 자체를 허용하므로 이 gap을 반드시 고쳐야 한다.
- Critical 2: 현재 `LedgerPurchaseItem.productId` required FK가 "품목 마스터 없음" 수동 입력까지 막는지 확인해야 한다. AC 해석상 raw product snapshot이 필요하면 nullable FK 또는 명시적 raw-input migration이 필요하다.
- Critical 3: CAP-6 업로드 구현을 앞당기면 OQ-15와 Extension B gate를 위반한다. Story는 upload preview/commit/reprocess를 제외하고 manual source 구분 여지만 요구한다.
- Critical 4: 원문 품목/규격 snapshot을 master join 표시로만 처리하면 master 변경 시 과거 장부 증거가 바뀐다. Story는 snapshot 표시 보존을 필수로 고정했다.
- Critical 5: 매입 합계와 매입금액을 client draft 계산에만 의존하면 검토/리포트와 서버 계산 기준이 갈라진다. Story는 server calculation/response 기준을 명시했다.
- Critical 6: Story 2.1/2.2의 `version`, KST date query, unsaved guard를 건드리면 단계 이동과 저장 안정성 회귀가 생긴다. Story는 기존 helper 유지 지침을 넣었다.
- Critical 7: 지점장 매입 단계에서 원가 lot, 재고금액, 매출원가, 이익/마진 파생값을 다시 노출하면 Story 1.4 보안 계약을 회귀한다. Story는 server response shaping 유지와 민감 필드 차단을 명시했다.

## Project Structure Notes

- Architecture target tree는 `src/features/ledger`, `src/features/master-data`, `src/server/authz.ts`, `src/server/audit.ts`, `src/server/calculations`, `prisma`, `tests/unit`, `tests/e2e` 경계를 사용한다.
- `src/components/ui`에는 shadcn primitive만 둔다. 매입 step-specific UI는 `src/features/ledger/components`에 둔다.
- `src/server` owns cross-cutting auth/authz/audit/db behavior. Feature actions call helpers; they do not copy auth/session/audit logic.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.4: MVP 수동 매입 입력`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#FR-8: 매입 입력`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#FR-25: 매입 기준 관리`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#CAP-5: 품목명/규격 정규화`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#CAP-6: 이카운트 엑셀 업로드 기반 매입 자동 생성`]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Data Architecture`]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Process Patterns`]
- [Source: `_bmad-output/planning-artifacts/architecture.md#Sensitive Field Gate`]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md#Flow 2 — 현대 지점장이 하루 장부를 입력한다`]
- [Source: `_bmad-output/implementation-artifacts/2-1-지점-일자-장부-생성과-상태-관리.md`]
- [Source: `_bmad-output/implementation-artifacts/2-2-장부-입력-7단계-폼과-작성자-표시명-유지.md`]
- [Source: `_bmad-output/implementation-artifacts/2-3-매출-결제와-비용-입력.md`]
- [Source: `prisma/schema.prisma`]
- [Source: `src/features/ledger/actions.ts`]
- [Source: `src/features/ledger/schemas.ts`]
- [Source: `src/features/ledger/queries.ts`]
- [Source: `src/features/ledger/components/purchase-step-client.tsx`]
- [Source: `src/features/master-data/product-queries.ts`]
- [Source: `src/features/master-data/purchase-standard-queries.ts`]
- [Source: `src/server/calculations/ledger.ts`]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- 2026-06-12: `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-purchase.test.mjs` red 단계에서 신규 manual/source 계약 실패 확인 후 구현 진행.
- 2026-06-12: `corepack pnpm exec prisma generate` 성공.
- 2026-06-12: `corepack pnpm exec prisma format` 성공.
- 2026-06-12: `corepack pnpm exec prisma validate` 성공.
- 2026-06-12: `corepack pnpm typecheck` 성공.
- 2026-06-12: `corepack pnpm lint` 성공.
- 2026-06-12: focused unit 성공: `tests/unit/ledger-purchase.test.mjs`, `tests/unit/ledger-sales.test.mjs`, `tests/unit/ledger-cost-labor.test.mjs`.
- 2026-06-12: `corepack pnpm test:unit` 성공, 29/29 unit test 통과.
- 2026-06-12: `corepack pnpm build` 성공.
- 2026-06-12: `PORT=3104 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-purchase.spec.ts`는 Playwright webServer가 `listen EPERM 127.0.0.1:3104`로 조기 종료되어 이 환경에서 실행하지 못함.
- 2026-06-12: Senior review focused unit 재실행 성공: `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-purchase.test.mjs`.
- 2026-06-12: Senior review 검증 성공: `corepack pnpm exec prisma validate`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test:unit`, `corepack pnpm build`.
- 2026-06-12: Senior review E2E 재시도 실패: `DEBUG=pw:webserver PORT=3104 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-purchase.spec.ts`가 `connect EPERM 127.0.0.1:3104` 후 webServer early exit.
- 2026-06-12: Final runtime verification에서 `PORT=3100 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-purchase.spec.ts` 재실행 성공, 8/8 통과. 첫 실행에서 공통 저장 상태 UI와 toast가 같은 메시지를 중복 노출해 Playwright strict locator가 실패했고, E2E locator를 의도한 status/alert 영역으로 좁힌 뒤 통과했다.

### Completion Notes List

- `LedgerPurchaseItem.productId`를 nullable로 전환하고 `LedgerPurchaseSource.MANUAL`/`sourceType`을 추가해 기준 정보 없는 raw manual 매입과 향후 업로드 source 구분 여지를 확보했다.
- `ledgerPurchaseSchema`, 지점장 `saveLedgerPurchases`, 본사 보완 `hq-edit-actions`를 같은 저장 contract로 맞춰 raw 품목명/구분/규격 snapshot, active product/standard 참조, 서버 금액 계산, version/store/date guard, audit/revalidation 패턴을 유지했다.
- `PurchaseStepClient`가 active 기준이 없어도 행 추가와 원문 입력을 허용하도록 확장하고, 기존 저장 상태/미저장 guard/숫자 입력/첫 오류 focus/모바일 터치 target 패턴을 유지했다.
- productId가 없는 raw manual 매입은 아직 상품 재고 FK가 없으므로 재고 보정/재고 단계의 상품별 구매 집계에서 제외하고, productId가 있는 기존 흐름은 유지했다.
- unit/source-level tests와 purchase E2E spec을 Story 2.4 범위로 갱신했다. E2E 파일은 기준 없는 수동 입력, 삭제 후 저장, snapshot 보존, 390px 회귀를 포함하며 final runtime verification에서 8/8 통과했다.

### File List

- `prisma/schema.prisma`
- `prisma/migrations/20260612020500_ledger_purchase_manual_source_or_raw_snapshot/migration.sql`
- `src/features/ledger/actions.ts`
- `src/features/ledger/hq-edit-actions.ts`
- `src/features/ledger/schemas.ts`
- `src/features/ledger/queries.ts`
- `src/features/ledger/types.ts`
- `src/features/ledger/components/purchase-step-client.tsx`
- `src/features/inventory/adjustment-reconciliation.ts`
- `src/features/inventory/queries.ts`
- `tests/unit/ledger-purchase.test.mjs`
- `tests/e2e/store-ledger-purchase.spec.ts`

### Senior Developer Review (AI)

Reviewer: GPT-5 Codex
Date: 2026-06-12
Outcome: Approve after automatic fixes

#### Findings Fixed

- [HIGH] `ledgerPurchaseSchema`가 `purchaseStandardId`만 있는 입력을 raw 품목명/구분/규격 누락 오류로 처리해, 기준 정보 선택만으로 매입 라인을 저장할 수 있는 AC 2 계약을 일부 깨뜨렸다. `src/features/ledger/schemas.ts`에서 product 또는 standard가 있으면 master/basis-backed line으로 인정하고, 둘 다 없을 때만 raw snapshot 필드를 요구하도록 수정했다.
- [MEDIUM] 지점장 `saveLedgerPurchases`에서 비활성/잘못된 매입 기준, 기준-품목 불일치, 잘못된 품목 ID가 일반 `LEDGER_SAVE_FAILED`로 떨어질 수 있었다. `src/features/ledger/actions.ts`에 row-level validation error를 추가해 field error로 반환하게 수정했다.
- [MEDIUM] 본사 보완용 `saveHqLedgerPurchases`도 같은 기준-품목 검증 경계가 필요했다. `src/features/ledger/hq-edit-actions.ts`에 동일한 validation branch를 추가해 store manager 저장 contract와 맞췄다.
- [LOW] `tests/unit/ledger-purchase.test.mjs`가 standard-only 입력 계약과 새 validation branch를 확인하지 못했다. 실제 Zod parse 기반 coverage와 source contract assertion을 추가했다.

#### Acceptance Criteria Review

- AC 1: 서버 Zod 검증과 저장 action의 `unitPrice * quantity` 서버 계산, `purchaseTotal` response 경로 확인. 통과.
- AC 2: active product/standard 선택 경로와 기준 정보 없는 raw manual 입력 경로 확인. standard-only contract gap을 수정 후 통과.
- AC 3: `LedgerPurchaseItem` snapshot 필드와 productId nullable raw line 보존 확인. 정규화 구현 없음. 통과.
- AC 4: 저장 transaction 안 version 증가, line 교체, audit before/after payload 확인. 통과.
- AC 5: `requireStoreAccess`, store/date/ledger/version guard, store-manager response shaping 확인. 통과.
- AC 6: CAP-6 upload preview/commit/reprocess 미구현, persisted `sourceType: MANUAL` 경계 확인. 통과.

#### Validation Checklist

- Story file loaded and Status verified as `review` before review.
- Story key resolved: `2-4-mvp-수동-매입-입력`.
- Architecture and epic docs loaded; no `project-context.md` present.
- Tech stack verified from `package.json` and architecture: Next.js 15, React 19, Prisma 6, Zod, Playwright.
- External doc search not performed because Story 2.4 adds no new dependency/API and uses pinned workspace contracts.
- File List reviewed against git status; unrelated dirty files outside this story were left untouched.
- Tests mapped to ACs; child-session purchase E2E was environment-blocked by localhost EPERM, but final runtime verification passed on `PORT=3100`.

### Change Log

- 2026-06-12: Story 2.4 MVP 수동 매입 입력 구현. 기준 정보 없는 raw manual purchase, snapshot/source contract, 지점장/본사 저장 action, 매입 UI, 재고 집계 호환, unit/e2e coverage를 추가했다.
- 2026-06-12: Senior review 자동 수정. 매입 기준만 선택한 입력 계약을 허용하고, 잘못된 매입 기준/품목 조합을 field-level validation error로 반환하도록 지점장/본사 저장 action과 purchase unit coverage를 보강했다.
- 2026-06-12: Final runtime verification에서 purchase E2E strict-locator 회귀를 수정하고 `PORT=3100` focused purchase E2E 8/8 통과를 확인했다.
