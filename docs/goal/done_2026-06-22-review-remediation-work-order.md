# Review Remediation Work Order

> **Status:** ready-for-dev
> **Source:** `done_2026-06-22-point-summary-missing-implementation-plan.md` 처리 후 코드 리뷰 결과
> **작성일:** 2026-06-22

## Goal

리뷰에서 확인된 권한 범위, 이카운트 매입 수정, 이카운트 업로드 확정 검증 문제를 수정한다.

이번 작업의 목적은 새 기능을 늘리는 것이 아니라, 이미 구현된 기능이 회의 요구사항과 맞게 동작하도록 보정하는 것이다.

## Out of Scope

- LINE 아침 요약 관련 항목은 이번 작업 범위에서 제외한다.
- LINE 장기 체화 재고, 목표 마진 미달, 장기 적자 계산 보정은 사용자가 나중에 별도 작업으로 진행한다.
- UI 디자인 개편, 메뉴 구조 변경, 신규 리포트 추가는 포함하지 않는다.

## Current Findings

### 1. Headquarters Expense Store Scope Leak

본사 지출 목록과 월간 리포트 합계가 권한 있는 지점 범위를 적용하지 않는다.

현재 문제:

- 본사 지출 목록 조회가 날짜만 기준으로 전체 지출을 가져온다.
- 권한이 일부 지점으로 제한된 본사 계정도 다른 지점의 본사 지출을 볼 수 있다.
- 월간 리포트용 본사 지출 합계도 같은 방식으로 전체 지출을 합산한다.
- 본사 지출 수정 시 새 `storeId`만 검사하고, 기존 지출 항목의 `storeId`가 사용자 권한 범위 안인지 확인하지 않는다.

관련 파일:

- `src/features/headquarters-expenses/queries.ts`
- `src/features/headquarters-expenses/actions.ts`
- `tests/unit/headquarters-expenses.test.mjs`
- `tests/unit/hq-reports.test.mjs`

### 2. ECount Uploaded Purchase Rows Cannot Be Overridden by Headquarters

이카운트 업로드 매입 행은 본사가 수동으로 단가/수량을 강제 수정할 수 있어야 한다.

현재 문제:

- 본사 장부 수정 경로에서도 store-manager용 이카운트 수정 차단 정책이 적용된다.
- 이 때문에 `sourceType = ECOUNT_UPLOAD` 매입 행을 본사도 수정하지 못한다.
- 회의 요구사항의 "본사 수동 강제 수정/오버라이트"가 충족되지 않는다.

관련 파일:

- `src/features/ledger/hq-edit-actions.ts`
- `src/features/ledger/purchase-edit-policy.ts`
- `tests/unit/ledger-purchase-edit-policy.test.mjs`

### 3. ECount Commit Trusts Client Preview Data

이카운트 매입 확정 서버 액션이 클라이언트가 보낸 preview rows를 그대로 신뢰한다.

현재 문제:

- 확정 시 실제 업로드 파일을 다시 검증하지 않는다.
- 서버 저장 preview token 또는 import session 검증이 없다.
- 권한 있는 사용자가 요청을 조작하면 실제 이카운트 파일과 무관한 행을 `ECOUNT_UPLOAD`로 저장할 수 있다.

관련 파일:

- `src/features/ledger/ecount-purchase-actions.ts`
- `src/features/ledger/components/ecount-purchase-upload-client.tsx`
- `tests/unit/ecount-ledger-purchase-actions.test.mjs`

## Required Changes

### Task 1. Apply Store Scope to Headquarters Expense Queries

- 본사 지출 목록 조회에 `getHeadquartersStoreScope()` 결과를 적용한다.
- `storeId`가 있는 지출은 권한 있는 지점에 속한 것만 반환한다.
- `storeId = null`인 공통 본사 지출은 본사 권한 사용자에게 표시하되, 기존 정책과 충돌하지 않게 명시한다.
- 월간 리포트용 본사 지출 합계도 같은 scope 규칙을 사용한다.

### Task 2. Guard Headquarters Expense Update by Existing Record Scope

- `updateHeadquartersExpense`에서 기존 지출 항목을 먼저 조회한다.
- 기존 항목의 `storeId`가 사용자 권한 밖이면 `FORBIDDEN` 또는 같은 계열의 권한 오류를 반환한다.
- 새로 저장하려는 `storeId`도 기존처럼 권한 범위 안인지 검사한다.
- 감사 로그에는 기존 값과 변경 값이 모두 유지되어야 한다.

### Task 3. Allow Headquarters Override for ECount Uploaded Purchase Rows

- store-manager 경로에서는 `ECOUNT_UPLOAD` 행 수정 금지를 유지한다.
- headquarters edit 경로에서는 `unitPrice`, `quantity`, 필요 시 매핑 값을 수정할 수 있게 한다.
- 본사 수정 시 audit log 또는 기존 수정 기록에 변경 전/후 값이 남아야 한다.
- 수정 후 FIFO 재계산 또는 관련 valuation refresh가 기존 장부 수정 흐름과 동일하게 실행되어야 한다.

### Task 4. Harden ECount Commit Validation

권장 구현 방향:

- Preview 결과를 서버에 import session으로 저장한다.
- 클라이언트는 확정 시 raw purchase rows 대신 `importSessionId`를 보낸다.
- 서버는 `importSessionId`, `ledgerId`, `actorId`, 만료 시간, 행 checksum을 검증한 뒤 저장한다.

최소 허용 구현:

- 확정 시 모든 row를 서버에서 schema 재검증한다.
- `unitPrice`, `quantity`, `amount`, `productId`, `purchaseStandardId`, `referenceInfo`를 다시 검증한다.
- `NaN`, 음수, 빈 품목명, 잘못된 기준 ID가 저장되지 않게 막는다.
- ledger의 지점 권한과 날짜 상태를 다시 확인한다.

## Acceptance Criteria

- 권한이 일부 지점으로 제한된 본사 사용자는 권한 밖 지점의 본사 지출을 목록과 월간 리포트 합계에서 볼 수 없다.
- 권한 밖 본사 지출 ID를 직접 넘겨도 수정할 수 없다.
- store-manager는 기존처럼 `ECOUNT_UPLOAD` 매입 행을 수정할 수 없다.
- headquarters 사용자는 이카운트 업로드 매입 행의 단가/수량을 수정할 수 있다.
- 이카운트 확정 API는 조작된 preview rows를 그대로 저장하지 않는다.
- 수정 후 `pnpm db:validate`와 `pnpm typecheck`가 통과한다.

## Verification Commands

```powershell
pnpm db:validate
pnpm typecheck
pnpm test:unit:file tests/unit/headquarters-expenses.test.mjs tests/unit/hq-reports.test.mjs
pnpm test:unit:file tests/unit/ledger-purchase-edit-policy.test.mjs tests/unit/ecount-ledger-purchase-actions.test.mjs
```

## Notes for Implementer

- 범위는 리뷰에서 발견된 결함 수정으로 제한한다.
- 기존 store-manager 차단 정책은 약화하면 안 된다.
- 본사 권한 범위는 화면뿐 아니라 server action과 report query에도 적용해야 한다.
- LINE 관련 리뷰 항목은 사용자가 별도로 진행할 예정이므로 이번 작업에서 수정하지 않는다.
