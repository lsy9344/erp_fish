# ECount 출고/지점 입고 전환 작업지시서

작성일: 2026-06-24
기준 문서: `docs/goal/2026-06-24-ecount-supply-concept-review-and-improvement-direction.md`
기준 입력 파일: `docs/erp_input/이카운트 엑셀파일.xlsx`
작업 성격: 정책 전환, 데이터 모델 보강, 업로드 흐름 신설, 기존 매입 기준 축소

## 목적

현재 `매입 기준` 중심 구조를 `본사 출고 / 지점 입고` 원장 중심 구조로 바꾼다.

이카운트 파일은 품목별 단일 기준 단가를 만드는 파일이 아니라, 본사가 각 지점에 어떤 품목을 얼마에 공급했는지 담은 운영 데이터다. 따라서 원본 행, 지점명, 품목명, 단가, 수량, 전표 정보를 잃지 않고 보존해야 한다.

## 핵심 원칙

- 이카운트 원본 행을 전역 `PurchaseStandard` 단가로 합치지 않는다.
- 같은 품목이라도 지점, 날짜, 전표에 따라 단가가 다를 수 있음을 정상 데이터로 본다.
- 원본 이카운트 단가와 장부 적용 단가를 분리한다.
- 지점장은 이카운트 원본 정보와 원본 행 연결값을 수정할 수 없다.
- 지점장은 장부 적용 단가만 수정할 수 있고, 수정값은 해당 장부 행에만 적용한다.
- 재고 금액, FIFO, 마진 계산은 최종 저장된 장부 적용 단가를 기준으로 한다.
- 실제 품목별 판매 데이터가 없는 값은 화면과 문서에서 반드시 `추정`으로 표시한다.

## 범위

### 포함

- 정책 문서의 기존 `매입 기준 추출만 유지` 문구 폐기
- 본사 전용 이카운트 출고/입고 업로드 흐름 추가
- 업로드 batch/line 원본 보존 모델 추가
- 거래처명과 앱 지점 매핑 추가
- 품목명/규격과 앱 품목 매핑 추가
- 다중 지점이 포함된 파일 preview와 commit 지원
- commit 시 지점별 `DailyLedger`와 `LedgerPurchaseItem` 반영
- 원본 단가와 장부 적용 단가 차이 추적
- 기존 `매입 기준` UI와 장부 입력 의존성 축소
- 관련 테스트와 운영 문서 갱신

### 제외

- POS 품목별 실제 판매가 연동
- 확정 품목별 매출/이익률 계산
- AI 분석, 외부 알림, 월 손익 고정비 기능
- `PurchaseStandard` 테이블의 즉시 물리 삭제

`PurchaseStandard`는 먼저 deprecated 처리한다. 운영 데이터와 기존 테스트 영향이 정리된 뒤 별도 migration으로 제거 여부를 결정한다.

## 선행 결정

작업 시작 전에 아래 정책을 문서에 확정한다.

1. 이카운트 파일은 `본사 출고 / 지점 입고 원장`으로 본다.
2. 한 파일에 여러 지점이 들어오는 것을 MVP 범위에 포함한다.
3. 같은 파일 재업로드는 `fileHash`로 차단한다.
4. commit 중 일부 지점 실패 시 기본 정책은 전체 rollback으로 둔다.
5. 본사 보정은 원본 행을 직접 바꾸지 않고 장부 적용 단가와 감사 로그로 남긴다.
6. 지점장이 판매 예정가를 입력하지 않은 품목은 `판매가 계획 없음`으로 표시한다.

## 주요 파일

### DB

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_ecount_supply_imports/migration.sql`

### 이카운트 파서와 서버 액션

- Rename or Create: `src/features/ledger/ecount-supply-import.ts`
- Create: `src/features/ledger/ecount-supply-actions.ts`
- Create: `src/features/ledger/ecount-supply-commit.ts`
- Create: `src/features/ledger/ecount-supply-mapping.ts`
- Modify: `src/features/master-data/purchase-standard-import-actions.ts`

### 본사 UI

- Modify: `src/components/app-sidebar.tsx`
- Create: `src/app/app/ecount-imports/page.tsx`
- Create: `src/app/app/ecount-imports/[batchId]/page.tsx`
- Create: `src/features/ledger/components/ecount-supply-upload-client.tsx`
- Create: `src/features/ledger/components/ecount-supply-detail-client.tsx`

### 장부 입력과 권한

- Modify: `src/app/app/store-entry/page.tsx`
- Modify: `src/app/app/ledgers/[ledgerId]/page.tsx`
- Modify: `src/features/ledger/components/purchase-step-client.tsx`
- Modify: `src/features/ledger/schemas.ts`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/ledger/purchase-edit-policy.ts`
- Modify: `src/features/ledger/hq-close-preflight.ts`
- Modify: `src/features/ledger/queries.ts`

### 감사와 리포트

- Modify: `src/server/audit.ts`
- Modify: `src/features/audit/audit-format.ts`
- Modify: `src/features/audit/audit-queries.ts`
- Create: `src/features/reports/ecount-supply-report-queries.ts`

### 문서

- Modify: `docs/meeting/change.md`
- Modify: `docs/meeting/point-summary-policy-decisions-2026-06-22.md`
- Modify: `docs/goal/done_2026-06-22-wo-02-ecount-ledger-purchase-import.md`
- Create: `docs/ecount-supply-import-operations.md`

## P0. 정책 충돌 정리

### Task 1. 기존 정책 문서 갱신

**문제**
현재 문서에는 이카운트 엑셀이 관리자 `매입 기준 추출` 화면에서만 사용된다고 되어 있다. 새 컨셉과 정면으로 충돌한다.

**작업 지시**

- `docs/meeting/change.md`에서 `매입 기준 추출만 유지` 정책을 제거한다.
- `docs/meeting/point-summary-policy-decisions-2026-06-22.md`에서 이카운트 파일의 의미를 `본사 출고 / 지점 입고 원장`으로 바꾼다.
- 기존 WO-02는 완료 문서이므로 새 정책 기준에서는 폐기 또는 대체됨을 명시한다.
- `매입 기준`, `기준 단가`, `이카운트 매입 기준 추출` 표현을 새 용어로 바꾼다.

**완료 기준**

- 문서에서 이카운트 파일을 `PurchaseStandard` 생성 파일로 설명하지 않는다.
- 정책 문서와 새 작업지시서의 용어가 서로 맞다.

### Task 2. 제품 용어 확정

**작업 지시**

- 본사 메뉴명은 `이카운트 업로드` 또는 `출고/입고 업로드` 중 하나로 확정한다.
- `장부 매입`은 지점 화면에서는 `지점 입고`, 본사 문맥에서는 `본사 출고/지점 입고`로 설명한다.
- `LedgerPurchaseSource.ECOUNT_UPLOAD`는 유지하되 UI 표시명은 `이카운트 출고/입고 라인`으로 바꾼다.

**완료 기준**

- 본사와 지점장 화면에 `매입 기준`이 핵심 기능처럼 보이지 않는다.
- 이카운트 업로드 화면 설명이 원본 파일의 실제 의미와 맞다.

## P1. DB 모델과 원본 보존

### Task 3. 이카운트 import batch/line 모델 추가

**작업 지시**

- `EcountImportBatch`를 추가한다.
  - `fileName`, `fileHash`, `sheetName`, `businessDate`, `status`, `uploadedById`, `createdAt`, `committedAt`
  - `fileHash`는 unique로 둔다.
- `EcountImportLine`을 추가한다.
  - `batchId`, `rowNumber`, `dateNo`, `rawStoreName`, `storeId`
  - `rawProductName`, `productId`, `productName`, `productCategory`, `productSpec`
  - `quantity`, `unitPrice`, `supplyAmount`, `totalAmount`
  - `status`, `errorMessage`, `ledgerPurchaseItemId`
- `batchId + rowNumber`는 unique로 둔다.
- 상태값은 최소 `PREVIEW`, `MAPPING_REQUIRED`, `READY`, `COMMITTED`, `FAILED`, `VOIDED`를 지원한다.

**완료 기준**

- 업로드 파일과 원본 행을 장부 반영 전에도 저장할 수 있다.
- 같은 파일을 재업로드하면 중복으로 새 batch가 만들어지지 않는다.
- 원본 행과 장부 매입 행을 1:1로 추적할 수 있다.

**검증**

```powershell
pnpm db:validate
pnpm typecheck
pnpm test:unit:file tests/unit/ecount-purchase-import.test.mjs
```

### Task 4. alias 매핑 모델 추가

**작업 지시**

- `StoreExternalAlias`를 추가한다.
  - `provider`, `rawName`, `storeId`, `createdAt`, `updatedAt`
  - `provider + rawName`은 unique로 둔다.
- `ProductExternalAlias`를 추가한다.
  - `provider`, `rawName`, `rawSpec`, `productId`, `createdAt`, `updatedAt`
  - `provider + rawName + rawSpec`은 unique로 둔다.
- provider 초기값은 `ECOUNT`로 제한한다.

**완료 기준**

- 이카운트 거래처명이 앱 지점명과 달라도 승인된 매핑으로 재사용된다.
- 이카운트 품목 원문과 규격이 앱 품목으로 재사용 매핑된다.

## P2. 파서, preview, 매핑

### Task 5. 파서 이름과 반환 타입 정리

**작업 지시**

- 기존 `src/features/ledger/ecount-purchase-import.ts`의 파싱 로직을 재사용한다.
- 새 이름은 `parseEcountSupplyWorkbook`로 둔다.
- 반환 타입은 `EcountSupplyImportLine` 또는 동등한 이름으로 바꾼다.
- 기존 헤더 검증은 유지한다.
  - `일자-No.`
  - `거래처명`
  - `품목명(규격)`
  - `수량`
  - `단가`
  - `공급가액`
  - `합계`
- `validateLedgerScope: false` 방식의 단일 장부 전제는 제거한다.

**완료 기준**

- 샘플 파일의 83개 실제 품목 라인을 읽는다.
- `거래처명`별 그룹, 총 수량, 총 공급가액을 계산한다.
- 수량 x 단가와 공급가액이 다르면 preview 오류로 표시한다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ecount-purchase-import.test.mjs
```

### Task 6. preview 서버 액션 추가

**작업 지시**

- `previewEcountSupplyUpload(formData)`를 만든다.
- 본사 권한만 허용한다.
- 파일 hash를 계산해 기존 batch와 중복 여부를 확인한다.
- 파싱 결과를 `EcountImportBatch`, `EcountImportLine`에 저장한다.
- 저장 후 지점/품목 매핑 상태를 계산한다.
- 미매핑 거래처나 품목이 있으면 batch 상태를 `MAPPING_REQUIRED`로 둔다.
- 모두 매핑 가능하면 `READY`로 둔다.

**완료 기준**

- 본사가 파일을 올리면 commit 전 preview batch가 생긴다.
- 중복 파일은 새 batch를 만들지 않고 기존 batch 안내를 반환한다.
- 지점별 건수, 수량, 금액, 미매핑 항목을 반환한다.

### Task 7. 매핑 저장 액션 추가

**작업 지시**

- `saveEcountStoreAlias(input)`을 만든다.
- `saveEcountProductAlias(input)`을 만든다.
- 매핑 저장 후 해당 batch line의 `storeId`, `productId`, `status`를 다시 계산한다.
- 모든 필수 매핑이 끝나면 batch 상태를 `READY`로 바꾼다.

**완료 기준**

- preview 화면에서 원문 거래처명을 앱 지점에 연결할 수 있다.
- preview 화면에서 원문 품목명/규격을 앱 품목에 연결하거나 새 품목 생성 경로로 넘길 수 있다.
- 저장된 매핑은 다음 업로드에서도 자동 적용된다.

## P3. commit과 장부 반영

### Task 8. commit 서버 액션 추가

**작업 지시**

- `commitEcountSupplyImport(batchId)`를 만든다.
- 본사 권한만 허용한다.
- batch 상태가 `READY`가 아니면 commit을 막는다.
- transaction 안에서 지점별 `DailyLedger`를 찾거나 생성한다.
- 각 `EcountImportLine`을 `LedgerPurchaseItem`으로 저장한다.
- `LedgerPurchaseItem.unitPrice`는 장부 적용 단가로 사용한다.
- 원본 이카운트 단가는 `EcountImportLine.unitPrice`에 보존한다.
- 장부 행에는 원본 추적용 `ecountImportLineId` 또는 동등한 연결값을 저장한다.
- 재고 purchased quantity와 FIFO lot 갱신 흐름을 실행한다.
- 성공 시 batch와 line 상태를 `COMMITTED`로 바꾼다.

**완료 기준**

- 한 파일이 여러 지점 장부에 나뉘어 반영된다.
- 장부 행에서 원본 batch, 원본 행 번호, 원본 `일자-No.`, 원본 거래처명을 추적할 수 있다.
- commit 실패 시 원본 batch 상태와 실패 사유가 남는다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs
pnpm typecheck
```

### Task 9. 원본 단가와 장부 적용 단가 분리

**작업 지시**

- 현재 `LedgerPurchaseItem.unitPrice`는 장부 적용 단가로 유지한다.
- 원본 단가는 `EcountImportLine.unitPrice` 또는 `LedgerPurchaseItem.sourceUnitPrice`에 보존한다.
- 장부 저장 시 `amount = LedgerPurchaseItem.unitPrice * quantity`로 계산한다.
- 원본 단가와 적용 단가가 다르면 화면과 감사 로그에서 차이를 볼 수 있게 한다.
- 선택 필드가 필요하면 아래를 추가한다.
  - `unitPriceOverrideReason`
  - `unitPriceUpdatedById`
  - `unitPriceUpdatedAt`

**완료 기준**

- 지점장이 장부 적용 단가를 바꿔도 이카운트 원본 단가는 바뀌지 않는다.
- 재고/FIFO 계산은 수정된 장부 적용 단가 기준으로 갱신된다.
- 본사 보정과 지점장 수정은 감사 로그에 남는다.

### Task 10. 취소와 재처리 최소 정책 추가

**작업 지시**

- MVP에서는 `voidEcountSupplyImport(batchId, reason)`까지만 구현한다.
- commit 전 batch는 취소할 수 있다.
- commit 후 batch 취소는 장부 정정 정책이 정해지기 전까지 막는다.
- `reprocessEcountSupplyImport(batchId)`는 후속 작업으로 문서에만 남긴다.

**완료 기준**

- 운영자가 잘못 올린 미반영 batch를 취소할 수 있다.
- 이미 장부에 반영된 batch는 조용히 삭제되지 않는다.

## P4. UI 전환

### Task 11. 본사 이카운트 업로드 화면 추가

**작업 지시**

- 본사 사이드바에 `이카운트 업로드` 메뉴를 추가한다.
- 경로는 `/app/ecount-imports`로 둔다.
- 화면에는 파일 업로드, 최근 업로드 목록, 상태, 중복 파일 안내를 표시한다.
- batch 상세 경로는 `/app/ecount-imports/[batchId]`로 둔다.

**완료 기준**

- 본사는 하루 전체 이카운트 파일을 업로드할 수 있다.
- 최근 업로드 상태를 `미리보기`, `매핑 필요`, `commit 가능`, `완료`, `실패`, `취소`로 확인할 수 있다.

### Task 12. preview와 매핑 검수 화면 추가

**작업 지시**

- batch 상세 화면에서 지점별 그룹을 보여준다.
- 총 건수, 총 수량, 총 금액을 보여준다.
- 미매핑 거래처와 품목을 상단에 모아 보여준다.
- 수량 x 단가와 금액이 맞지 않는 행을 표시한다.
- 매핑이 끝나지 않으면 commit 버튼을 비활성화한다.

**완료 기준**

- 샘플 파일 83건이 지점별로 그룹화된다.
- 미매핑 항목이 무엇인지 운영자가 바로 알 수 있다.
- commit 가능 여부가 화면에서 명확하다.

### Task 13. 기존 매입 기준 UI 축소

**작업 지시**

- 본사 사이드바에서 `매입 기준` 메뉴를 제거하거나 `품목 참고 단가` 수준으로 낮춘다.
- `src/features/master-data/components/purchase-standard-management-client.tsx`의 이카운트 엑셀 불러오기를 중단한다.
- `importPurchaseStandardsFromEcount`는 사용 중단하거나 새 업로드 액션으로 이동시킨다.
- 장부 매입 화면에서 `매입 기준` select를 제거한다.
- 품목 선택 시 `Product.defaultUnitPrice`만 참고값으로 채운다.
- 실제 단가는 항상 직접 수정 가능하게 둔다.

**완료 기준**

- 지점장 장부 저장이 `purchaseStandardId` 없이 동작한다.
- 마감 전 점검에서 `매입 기준 없음`이 차단 사유가 되지 않는다.
- 이카운트 파일을 `PurchaseStandard` 생성 기능으로 여는 UI가 없다.

## P5. 권한, 감사, 리포트

### Task 14. 지점장 수정 정책 조정

**작업 지시**

- 지점장은 이카운트 라인의 품목, 원본 행, 원본 거래처명, 원본 `일자-No.`, 수량 삭제를 할 수 없다.
- 지점장은 장부 적용 단가만 수정할 수 있다.
- 지점장이 새 `ECOUNT_UPLOAD` 행을 직접 만들 수 없게 유지한다.
- 비상 수동 입력은 `MANUAL` 라인으로만 허용한다.

**완료 기준**

- 지점장 화면에서 이카운트 원본 연결 정보가 바뀌지 않는다.
- 지점장 수정은 해당 장부 행의 적용 단가로만 제한된다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ledger-purchase-edit-policy.test.mjs
pnpm test:e2e tests/e2e/store-ledger-purchase.spec.ts
```

### Task 15. 본사 보정 감사 로그 추가

**작업 지시**

- 본사는 이카운트 반영 라인의 장부 적용 단가를 수정할 수 있다.
- 수정 시 원본 단가, 변경 전 적용 단가, 변경 후 적용 단가, 수정자, 수정 사유를 남긴다.
- 감사 로그 표시명은 `매입 기준`이 아니라 `이카운트 출고/입고` 기준으로 바꾼다.

**완료 기준**

- 본사 보정 이력이 감사 로그에서 원본과 수정값을 구분해 보인다.
- 지점장 수정 차단 정책과 본사 보정 정책이 서로 충돌하지 않는다.

### Task 16. 본사 출고/지점 입고 리포트 추가

**작업 지시**

- 날짜, 지점, 품목, 품목 구분, 단가 범위, 업로드 파일로 필터링한다.
- 표에는 `일자-No.`, 지점, 품목, 규격, 수량, 단가, 공급가액, 장부 반영 상태, 재고/FIFO 연결 상태를 표시한다.
- 판매 예정가가 있으면 함께 보여준다.
- 실제 품목별 판매 데이터가 없으면 마진/성과 값은 `추정`으로만 표시한다.

**완료 기준**

- 본사가 어느 지점에 어떤 물건을 얼마에 공급했는지 파일 단위로 추적할 수 있다.
- 판매 예정가가 없는 입고 라인을 찾을 수 있다.

## P6. 테스트와 릴리스 검증

### Task 17. unit test 정리

**작업 지시**

- 기존 `PurchaseStandard` 중심 테스트를 새 정책에 맞게 수정한다.
- 아래 테스트를 추가하거나 갱신한다.
  - 이카운트 파일 preview
  - 지점 alias 매핑
  - 품목 alias 매핑
  - 다중 지점 commit
  - 중복 파일 업로드 방지
  - 지점장 이카운트 원본 필드 수정 차단
  - 장부 적용 단가 수정 시 FIFO 갱신
  - 본사 수정 감사 로그

**검증**

```powershell
pnpm test:unit:file tests/unit/ecount-purchase-import.test.mjs
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs
pnpm test:unit:file tests/unit/ledger-purchase-edit-policy.test.mjs
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs
pnpm test:unit:file tests/unit/master-data-purchase-standards.test.mjs
```

### Task 18. e2e test 정리

**작업 지시**

- 기존 `master-data-purchase-standards.spec.ts`는 `매입 기준` 관리가 남는 범위만 검증하게 줄인다.
- 새 본사 이카운트 업로드 e2e를 추가한다.
- 지점장 장부 매입 화면에서 `매입 기준` select가 사라졌는지 확인한다.
- 지점장 이카운트 라인 원본 필드가 수정되지 않는지 확인한다.
- 본사 commit 후 지점 장부와 리포트에 반영되는지 확인한다.

**검증**

```powershell
pnpm test:e2e tests/e2e/master-data-purchase-standards.spec.ts
pnpm test:e2e tests/e2e/store-ledger-purchase.spec.ts
pnpm test:e2e tests/e2e/hq-ledger-edit.spec.ts
pnpm test:e2e tests/e2e/hq-reports.spec.ts
```

### Task 19. 릴리스 전 전체 검증

**검증**

```powershell
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

## 배포 금지 조건

- 이카운트 원본 행을 보존하지 않고 장부 행만 만들면 안 된다.
- 같은 품목의 여러 단가를 단일 기준 단가로 합치면 안 된다.
- 다중 지점 파일을 단일 장부 검증으로 막으면 안 된다.
- 지점장이 원본 이카운트 단가, 원본 거래처명, 원본 행 번호를 바꿀 수 있으면 안 된다.
- 실제 품목별 판매 데이터 없이 `확정 매출`, `확정 이익률`, `확정 마진`이라고 표시하면 안 된다.
- commit된 import batch를 감사 로그 없이 삭제하면 안 된다.

## 권장 작업 순서

1. P0 정책 문서부터 수정한다.
2. P1 DB 모델과 migration을 만든다.
3. P2 preview와 매핑을 먼저 완성한다.
4. P3 commit은 transaction과 rollback 정책을 고정한 뒤 구현한다.
5. P4 UI 전환에서 기존 `매입 기준` 의존성을 걷어낸다.
6. P5 권한, 감사, 리포트를 마무리한다.
7. P6 테스트와 운영 문서를 갱신한 뒤 릴리스 검증을 실행한다.

## 최종 완료 기준

- 본사는 하루 전체 이카운트 파일을 업로드하고 지점별로 preview할 수 있다.
- 매핑 누락이 있으면 commit할 수 없다.
- 한 파일의 여러 지점 라인이 각 지점 장부에 반영된다.
- 장부 행에서 원본 파일, 원본 행, 원본 거래처명, 원본 `일자-No.`를 추적할 수 있다.
- 지점장은 원본 정보는 바꾸지 못하고 장부 적용 단가만 수정할 수 있다.
- 재고/FIFO 계산은 장부 적용 단가를 기준으로 맞게 갱신된다.
- 본사 리포트에서 날짜/지점/품목/파일 기준으로 출고/입고 내역을 조회할 수 있다.
- 기존 `매입 기준 추출` 중심 설명과 UI가 운영 흐름에서 제거된다.
