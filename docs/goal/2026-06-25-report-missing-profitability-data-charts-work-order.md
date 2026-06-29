# 리포트 누락 이익률 데이터 차트 작업지시서

> 상태: ready-for-dev
> 작성일: 2026-06-25
> 기준 원문: `docs/meeting/original_text.txt:3718-3730`
> 범위: 본사 `리포트` 화면의 추가 데이터 차트 요구 정리

## 목표

회의록에서 요구한 "품목별 이익률", "냉동/생물 구분", "오늘 냉동 판매액의 총 이익률", "오늘 하루 판매된 거의 이익률"을 현재 리포트 구현과 대조하고, 아직 빠진 데이터 차트를 추가한다.

이 문서는 차트 종류를 정하지 않는다. 표현 방식은 UI 설계 단계에서 별도로 정한다. 여기서는 어떤 데이터를 차트로 제공해야 하는지만 정의한다.

## 원문 요구 해석

`original_text.txt:3718-3730`의 흐름은 다음 데이터가 리포트 화면에 보여야 한다는 요구다.

- 품목별 이익률
- 냉동/생물로 구분된 판매액
- 오늘 냉동 판매액의 총 이익률
- 오늘 하루 판매분 전체의 이익률
- 위 데이터를 그래프 등 시각적으로 보기 좋게 표시

단, 현재 시스템은 품목별 실제 POS 매출을 직접 저장하지 않는다. 따라서 확정 매출/확정 이익률이라고 쓰면 안 된다. 기존 정책대로 재고 흐름과 판매가 계획을 사용한 추정값으로 표시한다.

## 현재 반영된 부분

다음 요구는 이미 일부 구현되어 있다.

- 일별 리포트(`/app/reports/daily`)에는 `냉동/생물 매출 (추정)` 영역이 있다.
- 월간 리포트(`/app/reports/monthly`)에도 `냉동/생물 매출 (추정)` 영역이 있다.
- `ProductCategoryMarginChart`는 냉동/생물별 추정 매출과 추정 이익률을 표시한다.
- `buildProductCategoryPerformance()`는 판매수량을 `전일재고 + 매입 - 당일재고`로 보고, 판매가 계획과 FIFO 소진금액 기반으로 냉동/생물별 추정 이익률을 계산한다.
- 월간 리포트에는 `매출 상위5 / 하위5 품목 (추정)`이 있으나, 이는 품목별 매출 순위이며 품목별 이익률 차트는 아니다.

## 빠진 데이터 차트

### 1. 당일 품목별 이익률 데이터 차트

현재 냉동/생물 카테고리 집계는 있지만, 회의록의 "품목별 이익률"을 볼 수 있는 데이터 차트가 없다.

추가할 데이터:

- 기준일
- 지점 또는 전체 지점 범위
- 품목 ID
- 품목명
- 냉동/생물 구분
- 규격
- 추정 판매수량
- 추정 판매액
- 추정 원가
- 추정 매출이익
- 추정 이익률
- 판매가 계획 적용 여부
- 원가 계산 기준
- 계산 상태

계산 기준:

- 추정 판매수량 = `전일재고 + 매입수량 - 당일재고`
- 추정 판매액 = `추정 판매수량 * 판매가 계획`
- 판매가 계획이 없으면 기존 정책대로 매입/적용 단가로 폴백하되, `판매가 미반영` 상태를 반드시 표시한다.
- 추정 원가는 FIFO 소진금액을 우선 사용한다.
- FIFO 소진금액이 없으면 기존 정책에 맞춰 원가 폴백 기준을 표시한다.
- 추정 이익률 = `(추정 판매액 - 추정 원가) / 추정 판매액`
- 추정 판매액이 0이거나 계산 입력이 부족하면 이익률은 `계산 불가`로 표시한다.

### 2. 당일 전체 판매분 이익률 데이터 차트

현재 일별 리포트는 지점별 이익률 표와 냉동/생물 카테고리 집계를 보여준다. 그러나 회의록의 "오늘 하루 판매된 거의 이익률"에 해당하는 전체 판매분의 당일 합산 이익률 데이터 차트는 별도로 없다.

추가할 데이터:

- 기준일
- 조회 범위: 전체 지점 또는 선택 지점
- 당일 추정 판매수량 합계
- 당일 추정 판매액 합계
- 당일 추정 원가 합계
- 당일 추정 매출이익 합계
- 당일 추정 이익률
- 판매가 계획 누락 품목 수
- 계산 불가 품목 수
- 계산 상태

계산 기준:

- 품목별 이익률 데이터 차트의 품목 행을 합산해 만든다.
- 냉동/생물 카테고리 차트와 숫자가 다르면 안 된다.
- 판매가 계획 누락이나 원가 계산 불가가 있으면 전체 이익률 옆에 상태를 표시한다.
- 확정 POS 매출이 아니므로 `추정 판매액`, `추정 이익률` 표현을 사용한다.

### 3. 품목별 이익률의 냉동/생물 구분 데이터

기존 냉동/생물 차트는 카테고리 합계만 보여준다. 새 품목별 이익률 데이터는 각 품목이 냉동인지 생물인지 함께 갖고 있어야 한다.

추가할 데이터:

- 품목별 이익률 행마다 `productCategory: "냉동" | "생물"`을 포함한다.
- 리포트 필터에서 냉동/생물 구분으로 볼 수 있어야 한다.
- 카테고리별 합계와 품목별 행의 합계가 서로 맞아야 한다.

## 제외 범위

- 차트 종류는 정하지 않는다.
- 새 POS 품목별 매출 입력 모델을 만들지 않는다.
- 확정 매출, 확정 원가, 확정 이익률이라고 표시하지 않는다.
- 지점장 화면에 원가나 절대 매출이익을 새로 노출하지 않는다.
- 이번 문서는 리포트 화면의 데이터 차트 요구만 다룬다. 대시보드, 알림, 급여 리포트는 제외한다.

## 권장 구현 범위

### Task 1. 리포트 품목별 이익률 데이터 타입 추가

대상 파일:

- `src/features/reports/types.ts`
- `src/features/reports/queries.ts`

필요 타입 예시:

```ts
export type ProductProfitabilityReportItem = {
  productId: string;
  productName: string;
  productCategory: "냉동" | "생물";
  productSpec: string;
  soldQuantity: number;
  estimatedSalesAmount: number;
  estimatedCogsAmount: number | null;
  estimatedGrossProfit: number | null;
  estimatedGrossMarginRate: number | null;
  salesBasis: "planned" | "cost-fallback" | "unavailable";
  costBasis: "fifo" | "cost-fallback" | "unavailable";
  statusLabel: "추정" | "판매가 미반영" | "계산 불가";
};
```

### Task 2. 당일 품목별 이익률 집계 쿼리 추가

대상 파일:

- `src/features/reports/queries.ts`
- `tests/unit/hq-reports.test.mjs`

작업:

- 기준일과 권한 있는 지점 범위를 기준으로 품목별 판매수량을 계산한다.
- 판매가 계획을 우선 적용한다.
- FIFO 소진금액을 우선 원가로 적용한다.
- 품목별 추정 판매액, 추정 원가, 추정 매출이익, 추정 이익률을 반환한다.
- 판매가 계획 또는 원가 입력이 부족한 품목은 상태를 분리한다.

### Task 3. 당일 전체 판매분 이익률 요약 데이터 추가

대상 파일:

- `src/features/reports/types.ts`
- `src/features/reports/queries.ts`
- `tests/unit/hq-reports.test.mjs`

작업:

- 품목별 이익률 행을 합산해 당일 전체 판매분 요약을 만든다.
- 전체 추정 판매액, 추정 원가, 추정 매출이익, 추정 이익률을 반환한다.
- 판매가 미반영 품목 수와 계산 불가 품목 수를 함께 반환한다.
- 냉동/생물 카테고리 집계와 합계가 일치하는지 테스트한다.

### Task 4. 일별 리포트 화면에 데이터 영역 추가

대상 파일:

- `src/app/app/reports/daily/page.tsx`
- 새 컴포넌트: `src/features/reports/components/product-profitability-report.tsx`
- `tests/e2e/hq-reports.spec.ts`

작업:

- 기존 `냉동/생물 매출 (추정)` 영역 아래에 당일 전체 판매분 이익률 데이터를 표시한다.
- 품목별 이익률 데이터를 표시한다.
- 품목별 데이터는 냉동/생물 구분을 포함한다.
- 화면 문구에는 `추정 판매액`, `추정 원가`, `추정 이익률`을 사용한다.
- `확정`, `실제`, `POS 기준` 같은 표현은 POS 연동 전까지 쓰지 않는다.

### Task 5. 월간 리포트의 품목별 매출 순위와 혼동 방지

대상 파일:

- `src/features/reports/components/monthly-closing-anomaly-report.tsx`
- `src/features/reports/types.ts`
- `src/features/reports/queries.ts`
- `tests/unit/hq-reports.test.mjs`

작업:

- 기존 `매출 상위5 / 하위5 품목 (추정)`은 매출 순위임을 유지한다.
- 새 품목별 이익률 데이터와 매출 순위 데이터를 같은 의미로 섞지 않는다.
- 월간 화면에 확장할 경우, 기간 합산 품목별 추정 이익률이라는 별도 데이터 계약으로 추가한다.
- 월간 확장은 당일 데이터와 같은 계산 기준을 재사용한다.

### Task 6. CSV 내보내기 범위 결정 및 구현

대상 파일:

- `src/features/reports/export.ts`
- `src/app/api/reports/export/route.ts`
- `tests/api/report-export.spec.ts`

작업:

- 일별 리포트 CSV에 품목별 이익률 데이터를 포함할지 결정한다.
- 포함한다면 원가 역산 위험이 있는 필드는 본사 권한에서만 내려간다는 기존 민감 정보 정책을 따른다.
- CSV 컬럼명도 `추정 판매액`, `추정 원가`, `추정 이익률`, `계산 상태`처럼 추정값임을 드러내야 한다.

## 인수 조건

- 일별 리포트에서 냉동/생물 집계뿐 아니라 품목별 추정 이익률을 볼 수 있다.
- 일별 리포트에서 오늘 하루 전체 판매분의 추정 이익률을 볼 수 있다.
- 품목별 이익률 데이터에는 냉동/생물 구분이 포함된다.
- 품목별 합계와 냉동/생물 카테고리 합계가 같은 기준으로 맞는다.
- 판매가 계획이 없는 품목은 조용히 확정값처럼 보이지 않고 `판매가 미반영` 상태를 표시한다.
- 계산 불가 품목이 있으면 전체 이익률에도 그 사실이 드러난다.
- 화면과 CSV 어디에도 POS 연동 전 추정값을 확정값처럼 표현하지 않는다.

## 검증 명령

```powershell
pnpm test:unit:file tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts
node scripts/run-playwright-clean.mjs tests/api/report-export.spec.ts
```

## 참고 근거

- `docs/meeting/original_text.txt:3718-3730`
- `docs/meeting/point-summary-policy-decisions-2026-06-22.md`의 `WO-H. 냉동/생물 카테고리 이익률`
- `src/app/app/reports/daily/page.tsx`
- `src/features/reports/components/product-category-margin-chart.tsx`
- `src/features/reports/queries.ts`
- `src/features/reports/types.ts`
- `src/features/reports/components/monthly-closing-anomaly-report.tsx`
