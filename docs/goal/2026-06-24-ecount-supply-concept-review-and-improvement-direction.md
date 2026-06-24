# ECount 출고/지점 입고 컨셉 검토사항 및 개선 방향

작성일: 2026-06-24
기준 입력 파일: `docs/erp_input/이카운트 엑셀파일.xlsx`
검토 대상: 현재 앱의 `매입 기준`, 이카운트 엑셀 import, 장부 매입/재고/FIFO 흐름
상태: 검토 완료, 정책 전환 필요

## 1. 결론 요약

현재 앱의 `매입 기준` 중심 구조는 새 운영 컨셉과 맞지 않는다.

새 컨셉의 핵심은 다음이다.

- 본사가 품목을 얼마에 매입했는지는 이 앱의 필수 정보가 아니다.
- 본사가 어느 지점에 어떤 품목을 얼마에 줬는지가 핵심 정보다.
- 지점장 입장에서는 이 금액이 지점의 매입 단가다.
- 지점장이 그 물건을 얼마에 팔 계획이었는지 또는 얼마에 팔았는지가 관리 포인트다.
- 이카운트 파일은 `매입 기준` 파일이 아니라 `본사 출고 / 지점 입고` 파일로 보는 것이 맞다.

따라서 기존 `관리자 > 매입 기준 관리 > 엑셀 불러오기` 흐름은 폐기하거나 축소하고, `이카운트 출고/입고 업로드` 흐름으로 재설계해야 한다.

## 2. 입력 파일 검토 결과

대상 파일은 `판매현황` 시트 하나로 구성되어 있다.

헤더는 다음과 같다.

| 컬럼 | 의미 |
| --- | --- |
| `일자-No.` | 날짜와 전표/묶음 번호. 예: `2026/06/17 -1` |
| `거래처명` | 지점 또는 거래처명. 현재 코드에서는 지점명 매칭 대상으로 해석 가능 |
| `품목명(규격)` | 품목 원문. 예: `고등어 [28미]` |
| `수량` | 출고/공급 수량 |
| `단가` | 본사가 해당 거래처/지점에 준 단가 |
| `공급가액` | 수량 x 단가 |
| `부가세` | 샘플 파일에서는 비어 있음 |
| `합계` | 공급가액과 동일하게 사용 가능 |

샘플 파일 기준 집계는 다음과 같다.

| 항목 | 값 |
| --- | ---: |
| 실제 품목 라인 수 | 83건 |
| 거래처/지점 후보 수 | 11개 |
| 총 수량 | 736 |
| 총 공급가액/합계 | 21,777,000원 |
| 정규화된 품목+분류+규격 수 | 25개 |

중요한 관찰점은 같은 품목/규격이라도 단가가 다를 수 있다는 점이다. 예를 들어 `제주갈치 [31-35미]` 같은 품목은 여러 단가로 등장할 수 있다. 이는 수산물 출고가가 고정 기준값이 아니라 지점, 날짜, 물건 상태, 전표 단위로 달라질 수 있음을 보여준다.

그러므로 이 파일을 `품목별 단일 매입 기준 단가`로 접으면 원본 정보가 손상된다.

## 3. 현재 앱 구조 검토

### 3.1 `매입 기준` 모델

현재 DB에는 `PurchaseStandard`가 있다.

- 위치: `prisma/schema.prisma`
- 구조: 품목 1개당 매입 기준 1개
- 주요 필드: `productId`, `standardUnitPrice`, `referenceInfo`, `isActive`

또한 `LedgerPurchaseItem`에는 `purchaseStandardId`가 연결되어 있다.

현재 의미는 다음에 가깝다.

- 본사가 품목별 기준 단가를 등록한다.
- 지점장 또는 본사가 장부 매입을 입력할 때 `매입 기준`을 선택한다.
- 선택한 기준 단가가 장부 단가의 기본값으로 채워진다.
- 실제 계산은 장부 저장 시점의 `unitPrice * quantity` snapshot으로 이뤄진다.

즉 `PurchaseStandard`는 계산의 절대 원천이라기보다 선택, 기본값, 검증, 마감 전 점검을 위한 보조 데이터다.

### 3.2 본사 메뉴와 화면

현재 본사 사이드바에는 `매입 기준` 메뉴가 있다.

- 메뉴: `src/components/app-sidebar.tsx`
- 페이지: `src/app/app/master-data/purchase-standards/page.tsx`
- 클라이언트: `src/features/master-data/components/purchase-standard-management-client.tsx`

화면은 `매입 기준 관리`, `기준 단가`, `엑셀 불러오기`라는 용어를 쓴다.

이 화면의 설명은 이카운트 엑셀의 품목과 단가를 매입 기준으로 저장한다고 되어 있다. 새 컨셉에서는 이 설명이 잘못된다.

### 3.3 현재 이카운트 import

현재 파서는 이카운트 파일의 헤더를 읽을 수 있다.

- 파서: `src/features/ledger/ecount-purchase-import.ts`
- 기대 헤더: `일자-No.`, `거래처명`, `품목명(규격)`, `수량`, `단가`, `공급가액`, `합계`
- 품목명과 규격을 분리한다.
- `냉)` 또는 `냉동` 같은 패턴으로 냉동/생물을 추정한다.
- `거래처명`을 지점명으로 검증하는 기능도 있다.

하지만 현재 살아 있는 import 흐름은 장부 import가 아니다.

- 서버 액션: `src/features/master-data/purchase-standard-import-actions.ts`
- 함수: `importPurchaseStandardsFromEcount`
- 현재 동작: `validateLedgerScope: false`로 파서를 호출한다.
- 결과: 지점/날짜를 보지 않고 `Product`와 `PurchaseStandard`를 생성/갱신한다.

즉 파일에는 지점별 출고 행이 있는데, 앱은 이를 지점별 장부 행으로 넣지 않고 품목 기준정보로 변환한다.

### 3.4 장부 매입 모델

현재 `LedgerPurchaseItem`은 새 컨셉의 최소 저장 구조를 이미 일부 갖고 있다.

주요 필드는 다음이다.

- `dailyLedgerId`
- `productId`
- `sourceType`
- `productName`
- `productCategory`
- `productSpec`
- `unitPrice`
- `quantity`
- `amount`
- `referenceInfo`

이 구조로 `지점 + 영업일 + 품목 + 단가 + 수량 + 금액`은 표현할 수 있다.

부족한 것은 다음이다.

- 이카운트 원본 파일 단위 기록
- 원본 행 번호
- 원본 `일자-No.`
- 원본 `거래처명`
- 매핑 상태
- 중복 import 방지
- 여러 지점이 한 파일에 들어오는 업로드/commit 흐름

## 4. 현재 정책 문서와의 충돌

현재 문서에는 2026-06-23 기준으로 다음 정책이 적혀 있다.

- `docs/meeting/change.md`: 이카운트 엑셀은 관리자 `매입 기준 추출` 화면에서만 불러온다.
- `docs/meeting/point-summary-policy-decisions-2026-06-22.md`: `관리자 > 매입 기준 추출만 유지한다`.
- `tests/unit/ledger-purchase.test.mjs`: 일일 장부용 ECount 업로드 액션은 제거되어야 한다고 검증한다.

이번 검토 결과에 따르면 이 정책은 새 컨셉과 충돌한다.

정책 전환이 필요하다.

기존 정책:

> 이카운트 엑셀은 품목과 매입 기준을 생성/갱신하는 기준정보 import다.

개선 정책:

> 이카운트 엑셀은 본사 출고/지점 입고 원장이다. 파일의 각 행은 지점 장부의 입고/매입 라인 또는 별도 본사 출고 라인으로 보존해야 한다.

## 5. 문제 정의

### 문제 1. `매입 기준`이 실제 운영 개념과 다르다

현재 `매입 기준`은 본사가 품목마다 기준 단가를 미리 정하고 지점장이 선택하는 구조다.

하지만 새 컨셉에서는 본사가 이미 이카운트에 지점별 출고 단가를 기록한다. 지점장은 그 단가를 다시 선택할 필요가 없다.

따라서 `매입 기준`은 지점장 관리에 필요한 핵심 정보가 아니라 중복 입력을 만드는 보조 개념이 된다.

### 문제 2. 지점별 가격 차이를 보존하지 못한다

현재 `PurchaseStandard`는 품목 1개당 단가 1개 구조다.

하지만 실제 파일은 같은 품목/규격이라도 지점과 전표에 따라 단가가 다를 수 있다. 이를 단일 기준 단가로 합치면 다음 문제가 생긴다.

- 어느 지점에 얼마에 줬는지 사라진다.
- 같은 품목의 단가 차이를 오류로 오해한다.
- FIFO lot과 재고 금액의 근거가 약해진다.
- 지점장별 성과 비교가 왜곡된다.

### 문제 3. 여러 지점이 한 파일에 들어오는 구조를 처리하지 못한다

샘플 파일은 11개 거래처/지점 후보를 포함한다.

현재 파서에는 선택 장부의 지점명과 파일 행의 거래처명이 다르면 실패시키는 단일 장부 검증 기능이 있다. 이 방식은 한 파일 안에 여러 지점이 들어오는 실제 파일과 맞지 않는다.

필요한 방식은 다음이다.

- 파일 전체를 읽는다.
- `거래처명`별로 앱 지점을 매핑한다.
- 지점별로 장부를 찾거나 생성한다.
- 각 지점 장부에 해당 라인을 넣는다.

### 문제 4. 원본 추적성이 부족하다

현재 `referenceInfo` 문자열에 `이카운트 판매현황 3행 · 일자-No. ... · 거래처 ...` 같은 정보가 들어갈 수 있다.

하지만 문자열만으로는 다음을 안정적으로 처리하기 어렵다.

- 같은 파일 재업로드 방지
- 일부 행만 commit 실패했을 때 재처리
- 원본 행과 장부 행의 1:1 추적
- 원본 파일별 감사 이력
- import 취소 또는 재처리
- 지점/품목 매핑 변경 후 재처리

### 문제 5. 판매가 정보와 입고가 정보가 분리되어야 한다

지점장 관리에는 두 가격이 필요하다.

- 본사가 지점에 준 가격: 입고 단가 또는 본사 출고 단가
- 지점장이 팔 계획이거나 실제로 판 가격: 판매 예정가 또는 실제 판매가

현재 앱에는 `StoreSalesPricePlan`이 있어 판매 예정가는 저장할 수 있다. 그러나 실제 품목별 판매가는 POS 데이터가 없기 때문에 확정값으로 계산할 수 없다.

따라서 현재 단계에서는 다음처럼 구분해야 한다.

- 입고 단가: 이카운트 파일에서 확정
- 판매 예정가: 지점장이 개점 전 입력
- 실제 품목별 판매가: 현재 없음
- 품목별 판매 성과: 재고 흐름 기반 추정값으로만 표시

## 6. 개선 방향

### 6.1 제품 용어 재정의

| 현재 용어 | 개선 용어 | 이유 |
| --- | --- | --- |
| 매입 기준 | 제거 또는 품목 기본 단가로 흡수 | 지점별 실제 단가를 표현하지 못함 |
| 기준 단가 | 기본 단가 또는 참고 단가 | 실제 출고 단가와 혼동 방지 |
| 이카운트 매입 기준 추출 | 이카운트 출고/입고 업로드 | 파일 의미가 판매현황/출고 내역에 가까움 |
| 장부 매입 | 지점 입고 또는 지점 매입 | 지점장 관점에서는 매입, 본사 관점에서는 출고 |
| ECOUNT_UPLOAD 매입 | 이카운트 출고/입고 라인 | source 의미를 명확히 함 |

### 6.2 기준정보와 운영데이터 분리

개선 후 역할은 다음처럼 나누는 것이 좋다.

기준정보:

- 지점 마스터
- 품목 마스터
- 품목 alias
- 지점 alias
- 비용/손실 코드

운영데이터:

- 이카운트 업로드 파일
- 이카운트 원본 행
- 지점별 입고/매입 라인
- 지점 판매가 계획
- 재고/FIFO lot
- 손실/폐기/떨이

분석데이터:

- 지점별 입고 금액
- 지점별 판매 예정가 대비 추정 결과
- FIFO 재고 금액
- 장기 체화 재고
- 지점별 마진/이상 신호

### 6.3 `PurchaseStandard` 제거 또는 단계적 비활성화

권장안은 단계적 비활성화다.

1단계:

- 메뉴명을 `매입 기준`에서 제거한다.
- 장부 매입 화면에서 `매입 기준` select를 제거한다.
- 품목 선택 시 `Product.defaultUnitPrice`만 참고값으로 채운다.
- 실제 단가는 항상 사용자가 수정 가능하게 둔다.
- `purchaseStandardId`가 없어도 마감 전 예외로 보지 않는다.

2단계:

- `PurchaseStandard` import 기능을 중단한다.
- 기존 `PurchaseStandard` 데이터는 migration에서 `Product.defaultUnitPrice` 또는 별도 참고 필드로 흡수한다.
- 감사 이력의 `PurchaseStandard` label과 action을 정리한다.

3단계:

- `LedgerPurchaseItem.purchaseStandardId`를 제거하거나 deprecated 필드로 유지한다.
- 관련 테스트와 UI 문구를 정리한다.

### 6.4 이카운트 업로드를 본사 출고/지점 입고 흐름으로 전환

새 흐름은 다음이 적합하다.

1. 본사가 하루 전체 이카운트 파일을 업로드한다.
2. 서버가 파일을 파싱하고 `EcountImportBatch`와 `EcountImportLine`을 만든다.
3. 화면은 거래처/지점별로 라인을 그룹화해 보여준다.
4. 지점명이 앱 지점과 맞지 않으면 `StoreExternalAlias` 매핑을 요구한다.
5. 품목명이 앱 품목과 맞지 않으면 `ProductAlias` 매핑 또는 새 품목 생성을 요구한다.
6. 모든 필수 매핑이 끝나면 commit한다.
7. commit은 지점별 `DailyLedger`를 찾거나 생성한다.
8. 각 행을 `LedgerPurchaseItem`으로 저장한다.
9. 재고 purchased quantity와 FIFO lot을 갱신한다.
10. 결과 화면에서 지점별 성공/실패/건수/금액을 보여준다.

### 6.5 원본 보존 모델 추가

권장 모델은 다음이다.

```prisma
model EcountImportBatch {
  id           String   @id @default(cuid())
  fileName     String
  fileHash     String
  sheetName    String
  businessDate DateTime?
  status       String
  uploadedById String
  createdAt    DateTime @default(now())
  committedAt  DateTime?

  lines EcountImportLine[]

  @@unique([fileHash])
  @@index([createdAt])
  @@index([status])
}

model EcountImportLine {
  id              String @id @default(cuid())
  batchId         String
  rowNumber       Int
  dateNo          String
  rawStoreName    String
  storeId         String?
  rawProductName  String
  productId       String?
  productName     String
  productCategory String
  productSpec     String
  quantity        Int
  unitPrice       Int
  supplyAmount    Int
  totalAmount     Int
  status          String
  errorMessage    String?
  ledgerPurchaseItemId String?

  batch EcountImportBatch @relation(fields: [batchId], references: [id], onDelete: Cascade)

  @@unique([batchId, rowNumber])
  @@index([storeId])
  @@index([productId])
  @@index([status])
}
```

최소 구현으로는 `LedgerPurchaseItem`에 아래 필드만 먼저 추가할 수도 있다.

- `ecountImportLineId`
- `sourceRowNumber`
- `sourceDateNo`
- `rawStoreName`

다만 장기적으로는 batch/line 모델을 분리하는 편이 감사, 재처리, 중복 방지에 더 안전하다.

### 6.6 지점/품목 매핑 추가

이카운트의 `거래처명`은 앱의 `Store.name`과 항상 같지 않을 수 있다. 예를 들어 괄호, 공백, 상호명 차이가 있을 수 있다.

필요한 모델:

- `StoreExternalAlias`
  - `provider`: `ECOUNT`
  - `rawName`: 이카운트 거래처명
  - `storeId`: 앱 지점 ID

- `ProductExternalAlias`
  - `provider`: `ECOUNT`
  - `rawName`: 이카운트 품목명 원문
  - `rawSpec`: 원문 규격
  - `productId`: 앱 품목 ID

이 매핑은 import 미리보기 화면에서 본사가 승인해야 한다.

### 6.7 판매가 계획과 연결

이미 `StoreSalesPricePlan` 모델이 있으므로, 이를 계속 활용한다.

개선 방향:

- 지점장은 개점 전 `품목별 판매 예정가`를 입력한다.
- 이카운트 입고 라인이 들어오면 해당 지점/날짜/품목의 판매 예정가와 비교할 수 있다.
- 판매 예정가가 없으면 `판매가 계획 없음`으로 표시한다.
- 실제 품목별 판매 데이터가 없으므로 품목별 매출/이익은 `추정`으로만 표기한다.

주의:

- 실제 판매가처럼 보이는 UI 문구를 쓰면 안 된다.
- POS 품목별 매출 연동 전까지는 `확정 매출`, `확정 이익률`이라는 표현을 쓰면 안 된다.

### 6.8 원본 단가와 장부 적용 단가 분리

추가 확정 정책:

지점장 권한 데이터 입력 화면에서는 본사가 이카운트에서 불러온 품목을 선택할 수 있어야 한다. 품목을 선택하면 이카운트에서 불러온 가격이 자동으로 채워져야 한다. 다만 이 가격은 지점장 장부 입력의 시작값일 뿐이며, 지점장은 해당 장부 행의 가격을 수정할 수 있어야 한다.

가격은 두 종류로 분리한다.

| 가격 | 의미 | 수정 주체 | 계산 반영 |
| --- | --- | --- | --- |
| 원본 이카운트 단가 | 본사가 이카운트 파일에서 불러온 원본 출고/입고 단가 | import 원본이므로 직접 수정하지 않음 | 감사, 비교, 기본값 |
| 장부 적용 단가 | 지점장이 해당 장부 행에서 최종 저장한 단가 | 지점장 또는 본사 보정 | 매입금액, 재고금액, FIFO, 마진 계산 |

중요 원칙:

- 지점장이 단가를 수정해도 본사가 이카운트에서 불러온 원본 단가는 바뀌지 않는다.
- 지점장이 수정한 단가는 해당 지점, 해당 영업일, 해당 장부 행에만 적용된다.
- 계산은 원본 이카운트 단가가 아니라 최종 저장된 `장부 적용 단가`를 기준으로 한다.
- 원본 단가와 적용 단가가 다르면 화면과 감사 이력에서 차이를 확인할 수 있어야 한다.
- 품목, 원본 행, 원본 거래처명, 원본 일자-No.는 보존해야 한다.

권장 필드:

- `sourceUnitPrice`: 원본 이카운트 단가
- `appliedUnitPrice`: 장부 적용 단가
- `unitPriceOverrideReason`: 선택 사항. 본사 보정이나 지점장 수정 사유를 남길 때 사용
- `unitPriceUpdatedById`: 선택 사항. 적용 단가를 마지막으로 바꾼 사용자
- `unitPriceUpdatedAt`: 선택 사항. 적용 단가를 마지막으로 바꾼 시각

현재 `LedgerPurchaseItem.unitPrice`가 이미 계산 기준 단가로 쓰이고 있으므로, 최소 구현에서는 다음처럼 정리할 수 있다.

- `LedgerPurchaseItem.unitPrice`를 `장부 적용 단가`로 유지한다.
- 원본 이카운트 단가는 `EcountImportLine.unitPrice` 또는 `LedgerPurchaseItem.sourceUnitPrice`에 별도로 보존한다.
- 저장 시 `amount = 장부 적용 단가 x 수량`으로 계산한다.

용어 주의:

- 여기서 말하는 가격 수정은 총매출 입력값을 직접 바꾸는 것이 아니다.
- 지점장이 수정한 단가는 매입금액, 재고금액, FIFO, 매출이익/마진 계산의 원가 쪽 기준이 된다.
- 실제 품목별 판매가가 없는 상태에서는 품목별 판매 결과는 계속 `추정`으로 표시해야 한다.

## 7. 권장 화면 구성

### 7.1 본사 이카운트 업로드 화면

위치 후보:

- `/app/ecount-imports`
- 또는 `/app/headquarters/supply-imports`

주요 요소:

- 파일 업로드
- 최근 업로드 목록
- 중복 파일 안내
- 업로드 상태: `미리보기`, `매핑 필요`, `commit 가능`, `완료`, `실패`, `취소`

### 7.2 미리보기 화면

필수 표시:

- 지점별 그룹
- 총 건수, 총 수량, 총 금액
- 매핑 안 된 거래처
- 매핑 안 된 품목
- 수량 x 단가와 금액 불일치 행
- 같은 파일 중복 여부

### 7.3 매핑 검수 화면

필수 기능:

- 원문 거래처명 -> 앱 지점 선택
- 원문 품목명/규격 -> 앱 품목 선택 또는 새 품목 생성
- 매핑 저장
- 저장된 매핑 재사용

### 7.4 commit 결과 화면

필수 표시:

- 지점별 생성/갱신된 장부
- 지점별 반영 라인 수
- 지점별 금액 합계
- 실패 행 목록
- 재고/FIFO 갱신 결과
- 감사 로그 링크 또는 요약

### 7.5 본사 출고/지점 입고 리포트

필터:

- 날짜
- 지점
- 품목
- 품목 구분
- 단가 범위
- 업로드 파일

표시:

- 일자-No.
- 지점
- 품목
- 규격
- 수량
- 단가
- 공급가액
- 장부 반영 상태
- 재고/FIFO 연결 상태

## 8. API 또는 Server Action 제안

필요한 서버 액션:

- `previewEcountSupplyUpload(formData)`
- `saveEcountStoreAlias(input)`
- `saveEcountProductAlias(input)`
- `commitEcountSupplyImport(batchId)`
- `voidEcountSupplyImport(batchId, reason)`
- `reprocessEcountSupplyImport(batchId)`
- `getEcountSupplyImportDetail(batchId)`
- `getHeadquartersSupplyReport(filters)`

기존 `parseEcountPurchaseWorkbook`는 재사용 가능하지만 이름은 바꾸는 것이 좋다.

추천 이름:

- `parseEcountSupplyWorkbook`
- `EcountSupplyImportLine`
- `EcountSupplyImportResult`

## 9. 권한 정책

본사:

- 이카운트 파일 업로드 가능
- 매핑 생성/수정 가능
- commit 가능
- import 취소/재처리 가능
- 반영된 지점 장부 수정 가능

지점장:

- 본사에서 반영한 이카운트 입고 라인 조회 가능
- 이카운트 입고 라인의 품목, 원본 행, 원본 거래처명, 원본 일자-No.는 수정 차단
- 이카운트 입고 라인의 장부 적용 단가는 수정 가능
- 단가 수정은 원본 이카운트 import 데이터에 반영하지 않고 해당 장부 행에만 저장
- 비상 수동 입력은 별도 수동 라인으로만 허용
- 판매 예정가 입력은 가능

감사 로그:

- 업로드자
- commit 수행자
- 매핑 변경자
- 장부 반영 결과
- 본사 수동 수정 사유
- import 취소 사유

## 10. 계산과 리포트 영향

### 10.1 재고/FIFO

이카운트 입고 라인은 `LedgerPurchaseItem`으로 들어가면 기존 재고/FIFO 갱신 흐름을 사용할 수 있다.

계산 기준 단가는 원본 이카운트 단가가 아니라 장부 적용 단가다. 지점장이 단가를 수정해 저장하면, 재고금액과 FIFO lot은 수정된 장부 적용 단가를 기준으로 다시 계산되어야 한다.

필요한 확인:

- 여러 지점 장부를 한 번에 commit할 때 트랜잭션 범위
- 일부 지점 실패 시 전체 rollback인지 부분 성공인지
- 같은 파일 재업로드 시 기존 라인을 덮어쓸지, skip할지
- 본사 수정이 FIFO lot에 즉시 반영되는지

### 10.2 지점 성과 분석

입고 단가와 판매 예정가를 연결하면 다음을 볼 수 있다.

- 지점별 입고 금액
- 지점별 입고 수량
- 판매 예정가 기준 예상 매출
- 손실/폐기/떨이 발생 시 예정가 대비 손실
- 재고 잔량과 장기 체화

단, 실제 품목별 판매 데이터가 없으면 `실제 판매가`와 `확정 품목별 마진`은 만들 수 없다.

## 11. 영향 범위

### DB

- `PurchaseStandard` 제거 또는 deprecated 처리
- `LedgerPurchaseItem.purchaseStandardId` 제거 또는 nullable legacy 필드 유지
- `EcountImportBatch`, `EcountImportLine` 추가
- `StoreExternalAlias`, `ProductExternalAlias` 추가
- `LedgerPurchaseItem`에 import 추적 필드 추가 가능

### 서버

- `purchase-standard-import-actions.ts` 폐기 또는 역할 변경
- `ecount-purchase-import.ts` 이름과 타입 변경
- 장부별 단일 import가 아니라 다중 지점 import commit 추가
- 장부 저장 action에서 `purchaseStandardId` 검증 제거
- 마감 전 점검에서 `매입 기준 없음` 제거

### UI

- 본사 `매입 기준` 메뉴 제거
- 새 `이카운트 업로드` 또는 `출고/입고 업로드` 메뉴 추가
- 장부 매입 화면에서 `매입 기준` select 제거
- 품목 선택 + 단가 직접 입력 중심으로 단순화
- 이카운트 라인은 읽기 전용 표시
- 판매가 계획 화면과 입고 라인 연결

### 테스트

수정 또는 제거 대상:

- `tests/unit/master-data-purchase-standards.test.mjs`
- `tests/e2e/master-data-purchase-standards.spec.ts`
- `tests/unit/ledger-purchase.test.mjs`
- `tests/unit/ledger-purchase-edit-policy.test.mjs`
- `tests/e2e/store-ledger-purchase.spec.ts`
- `tests/e2e/hq-ledger-edit.spec.ts`

추가 대상:

- 이카운트 파일 preview unit test
- 지점 alias 매핑 test
- 품목 alias 매핑 test
- 다중 지점 commit test
- 중복 파일 업로드 방지 test
- 지점장 이카운트 라인 수정 차단 test
- 본사 수정 감사 로그 test

### 문서

수정 대상:

- `docs/meeting/change.md`
- `docs/meeting/point-summary-policy-decisions-2026-06-22.md`
- 기존 WO-02 문서
- 릴리즈 체크리스트
- 최초 운영 매뉴얼

## 12. 단계별 실행안

### Phase 0. 정책 확정

목표:

- `매입 기준` 폐기 여부 확정
- 이카운트 파일을 `본사 출고/지점 입고 원장`으로 확정
- 다중 지점 업로드를 MVP 범위에 포함할지 확정

완료 기준:

- 정책 문서가 새 컨셉으로 수정된다.
- 기존 `관리자 > 매입 기준 추출만 유지` 문구가 제거된다.

### Phase 1. 용어와 화면 정리

목표:

- 본사 메뉴에서 `매입 기준` 제거
- 장부 매입 화면에서 `매입 기준` select 제거
- 품목 기본 단가와 실제 입고 단가의 의미를 분리

완료 기준:

- 지점장과 본사 화면에 `매입 기준` 용어가 남지 않는다.
- 장부 저장은 `purchaseStandardId` 없이 동작한다.

### Phase 2. 이카운트 preview와 매핑

목표:

- 파일 업로드 후 지점별/품목별 미리보기 제공
- 매핑 누락을 commit 전에 차단

완료 기준:

- 샘플 파일 83건이 지점별로 그룹화된다.
- 미매핑 거래처/품목이 명확히 표시된다.
- 수량 x 단가와 금액 불일치가 검증된다.

### Phase 3. commit과 장부 반영

목표:

- 파일 라인을 지점별 `DailyLedger`와 `LedgerPurchaseItem`으로 반영
- 재고/FIFO 갱신
- 감사 로그 기록

완료 기준:

- 한 파일로 여러 지점 장부에 입고 라인이 생성된다.
- 지점장은 이카운트 라인을 임의 수정/삭제할 수 없다.
- 본사는 수정 사유와 함께 보정 가능하다.

### Phase 4. 리포트와 운영 안정화

목표:

- 본사 출고/지점 입고 리포트 제공
- import 취소/재처리 정책 확정
- 운영 매뉴얼 작성

완료 기준:

- 날짜/지점/품목/파일 기준으로 출고 이력을 조회할 수 있다.
- 같은 파일 중복 업로드가 차단된다.
- 운영자가 실패 행을 재처리할 수 있다.

## 13. 오픈 질문

1. 이카운트 `거래처명`은 항상 앱의 지점과 1:1로 대응하는가?
2. 한 거래처가 실제 지점이 아닌 외부 거래처일 가능성이 있는가?
3. 파일의 `일자-No.` 날짜와 앱 장부 `closingDate`는 항상 같은 날로 봐도 되는가?
4. 같은 파일 재업로드 시 기존 반영 라인을 덮어쓸 것인가, skip할 것인가?
5. commit 중 일부 지점만 실패하면 전체 rollback할 것인가, 부분 성공을 허용할 것인가?
6. 이카운트 라인을 본사가 수정하면 원본 행과 수정 행을 어떻게 나란히 보여줄 것인가?
7. `Product.defaultUnitPrice`는 계속 필요한가, 아니면 참고 단가로만 남길 것인가?
8. 지점장이 판매 예정가를 입력하지 않은 품목은 어떤 경고로 볼 것인가?
9. 실제 품목별 판매 데이터가 없는 상태에서 어떤 지표까지 `추정`으로 허용할 것인가?

## 14. 최종 권고

이번 컨셉 변경은 단순 문구 수정이 아니다. `매입 기준` 중심에서 `본사 출고/지점 입고 원장` 중심으로 제품의 데이터 축을 바꾸는 작업이다.

가장 중요한 원칙은 다음이다.

- 이카운트 원본 행을 잃지 않는다.
- 지점별 실제 입고 단가를 전역 기준 단가로 합치지 않는다.
- 지점장에게는 본사 출고 라인을 읽기 전용으로 보여준다.
- 판매 예정가는 별도 입력으로 관리한다.
- 품목별 실제 판매 데이터가 없는 값은 반드시 `추정`으로 표시한다.

이 방향으로 바꾸면 본사가 원하는 핵심 질문에 답할 수 있다.

> 어느 지점장이 어떤 물건을 얼마에 받아서, 얼마에 팔 계획을 세웠고, 그 결과 재고/손실/마진이 어떻게 되었는가?
